/**
 * Turning a column of attribute values into classes.
 *
 * Pure functions, no ArcGIS and no React -- the widget queries the layer and
 * hands the raw values in here, which keeps the classification independently
 * checkable and keeps SymbologyWidget.jsx about the UI.
 */

// Jenks is O(n·k²) in the number of values, which is unusable on a customer
// layer with six figures of rows. Breaks computed from an even sample of this
// size are visually identical and finish instantly.
const NATURAL_BREAKS_SAMPLE = 1200;

export const CLASSIFICATION_METHODS = [
  { id: "natural-breaks", name: "Natural Breaks (Jenks)" },
  { id: "equal-interval", name: "Equal Interval" },
  { id: "quantile", name: "Quantile" },
];

const NUMERIC_FIELD_TYPES = new Set([
  "small-integer", "integer", "single", "double", "long", "big-integer",
]);

export function isNumericField(field) {
  return !!field && NUMERIC_FIELD_TYPES.has(field.type);
}

/** Fields worth offering: skip geometry, object ids and blobs. */
export function symbolizableFields(layer) {
  const skipped = new Set(["geometry", "oid", "global-id", "blob", "raster", "xml"]);
  return (layer?.fields ?? [])
    .filter((f) => !skipped.has(f.type))
    .map((f) => ({ name: f.name, alias: f.alias || f.name, type: f.type }));
}

/**
 * Distinct values with their counts, most frequent first.
 *
 * Ordering by count is what makes the "Other" fold defensible: when there are
 * more distinct values than the palette has slots, the ones that lose their
 * own colour are the rarest, not an arbitrary alphabetical tail.
 */
export function distinctValues(values) {
  const counts = new Map();
  for (const raw of values) {
    if (raw === null || raw === undefined || raw === "") continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

/**
 * Numeric class breaks. Returns `[{ min, max, count }]`, ascending, with no
 * gaps between classes. An empty array means the column had nothing to
 * classify (all null, or every row the same value).
 */
export function classifyBreaks(values, method, classCount) {
  const numbers = values
    .map((v) => (typeof v === "number" ? v : Number(v)))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  if (numbers.length === 0) return [];
  const min = numbers[0];
  const max = numbers[numbers.length - 1];
  if (min === max) return [{ min, max, count: numbers.length }];

  const k = Math.max(1, Math.min(classCount, numbers.length));
  let edges;
  switch (method) {
    case "equal-interval": edges = equalIntervalEdges(min, max, k); break;
    case "quantile":       edges = quantileEdges(numbers, k); break;
    default:               edges = naturalBreakEdges(numbers, k); break;
  }

  // Edges are the k+1 boundaries; turn them into ranges and count members.
  return edges.slice(0, -1).map((lower, i) => {
    const upper = edges[i + 1];
    const isLast = i === edges.length - 2;
    const count = numbers.filter((n) => n >= lower && (isLast ? n <= upper : n < upper)).length;
    return { min: lower, max: upper, count };
  });
}

function equalIntervalEdges(min, max, k) {
  const step = (max - min) / k;
  return Array.from({ length: k + 1 }, (_, i) => (i === k ? max : min + i * step));
}

function quantileEdges(sorted, k) {
  const edges = [sorted[0]];
  for (let i = 1; i < k; i += 1) {
    edges.push(sorted[Math.floor((i * sorted.length) / k)]);
  }
  edges.push(sorted[sorted.length - 1]);
  // Ties can produce duplicate edges; collapsing them yields fewer classes
  // rather than empty ones, which is what ArcGIS does too.
  return dedupeAscending(edges);
}

/**
 * Fisher-Jenks natural breaks: minimises variance within classes. Computed on
 * an even sample when the column is large (see NATURAL_BREAKS_SAMPLE).
 */
function naturalBreakEdges(sorted, k) {
  const data = sample(sorted, NATURAL_BREAKS_SAMPLE);
  const n = data.length;
  if (n <= k) return dedupeAscending([...data, data[n - 1]]);

  // variance[i][j] = lowest within-class variance for the first i values in j classes
  const variance = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(Infinity));
  const backlink = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  variance[0][0] = 0;

  for (let j = 1; j <= k; j += 1) {
    for (let i = 1; i <= n; i += 1) {
      let sum = 0;
      let sumSq = 0;
      // Walk the class backwards so the running sums stay incremental.
      for (let m = i; m >= j; m -= 1) {
        const val = data[m - 1];
        sum += val;
        sumSq += val * val;
        const size = i - m + 1;
        const classVariance = sumSq - (sum * sum) / size;
        const prev = variance[m - 1][j - 1];
        if (prev + classVariance < variance[i][j]) {
          variance[i][j] = prev + classVariance;
          backlink[i][j] = m - 1;
        }
      }
    }
  }

  const edges = new Array(k + 1);
  edges[k] = data[n - 1];
  let end = n;
  for (let j = k; j >= 1; j -= 1) {
    edges[j - 1] = data[backlink[end][j]];
    end = backlink[end][j];
  }
  edges[0] = data[0];
  return dedupeAscending(edges);
}

function sample(sorted, size) {
  if (sorted.length <= size) return sorted;
  const step = sorted.length / size;
  const out = Array.from({ length: size }, (_, i) => sorted[Math.floor(i * step)]);
  out[out.length - 1] = sorted[sorted.length - 1]; // never lose the maximum
  return out;
}

function dedupeAscending(edges) {
  const out = [];
  for (const e of edges) {
    if (out.length === 0 || e > out[out.length - 1]) out.push(e);
  }
  return out.length >= 2 ? out : edges.slice(0, 2);
}

/** Compact axis-style number formatting for class range labels. */
export function formatNumber(value) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(abs < 1 ? 3 : 2);
}
