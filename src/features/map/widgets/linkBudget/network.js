/**
 * Turns KMZ placemarks into a GPON network graph and traces OLT -> premises
 * routes.
 *
 * Pure geometry and graph work -- the optics live in ./budget.js, the file
 * reading in ./kmz.js, and the UI in ../LinkBudgetTool.jsx. Nothing here knows
 * about decibels: this module reports what the drawing contains (how much
 * fibre, how many joints, which enclosures) and budget.js prices it.
 *
 * A survey KMZ is not a schema. Points carry their meaning in their name,
 * their folder, or an ExtendedData field, and no two contractors agree on
 * which -- so classification reads all three (see TYPE_RULES) and the routing
 * degrades in steps rather than failing:
 *
 *   traced     the cables connect the premises to the OLT; the route is the
 *              real drawn fibre length and every enclosure on it is counted.
 *   estimated  no usable cable route: the premises is chained to its nearest
 *              FAT, splitter and OLT, and each straight line is inflated by
 *              ROUTE_SLACK because fibre does not run as the crow flies.
 *
 * Every result says which of the two produced it, because an estimated span is
 * a planning figure and a traced one is close to a measurement.
 */

// Straight-line distance is always shorter than the cable that would be
// pulled; 1.3 is the usual planning allowance for street routing, slack and
// coiling. Only ever applied to `estimated` spans.
export const ROUTE_SLACK = 1.3;

/**
 * Snap tolerances calibrateSnap() chooses between. Metres, ascending. The
 * file decides which one is used -- see calibrateSnap for how.
 */
export const SNAP_LADDER = Object.freeze([0.5, 1, 2, 5, 10, 20]);

const EARTH_RADIUS_M = 6371008.8;

export function haversine([lon1, lat1], [lon2, lat2]) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function pathLength(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  return total;
}

/**
 * Where a point falls on a segment: how far off it is, and how far along.
 *
 * Local flat-earth projection about the segment, which at the scale of one
 * cable segment is exact to well under a millimetre and avoids trigonometry
 * per candidate node -- this runs for every node near every segment in the
 * file.
 */
function projectOnSegment(point, a, b) {
  const toRad = Math.PI / 180;
  const scale = EARTH_RADIUS_M * toRad;
  const cosLat = Math.cos(((a[1] + b[1]) / 2) * toRad);
  const bx = (b[0] - a[0]) * scale * cosLat;
  const by = (b[1] - a[1]) * scale;
  const px = (point[0] - a[0]) * scale * cosLat;
  const py = (point[1] - a[1]) * scale;

  const lengthSq = bx * bx + by * by;
  // A zero-length segment (repeated vertex) still has a meaningful distance.
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq));
  const dx = px - t * bx;
  const dy = py - t * by;
  return { distance: Math.hypot(dx, dy), t };
}

// --- classification ---

/**
 * Ordered: the first rule that matches wins, so the specific patterns come
 * before the general ones.
 *
 * `fat` sits above `splitter` on purpose. A FAT named "1x8" states the split
 * it carries, but it is still a FAT -- and that difference matters, because a
 * route that runs *through* a FAT enclosure on its way to the next one is
 * spliced through, not split (see describeTracedPath). An explicitly named
 * splitter (FDT, SDB, "SPL 1:4") splits everything that passes it.
 */
const TYPE_RULES = [
  { type: "olt", re: /\b(olt|pop|exchange|head[\s-]?end|central\s*office)\b/i },
  { type: "fat", re: /\b(fat|fdb|nap|ndp|access\s*terminal)\b/i },
  { type: "splitter", re: /\b(splitter|spl|fdt|sdb|primary\s*split|secondary\s*split)\b|1\s*[:x]\s*\d+/i },
  // "DC_ODB" has no word boundary between DC and ODB, hence the loose form.
  { type: "dc", re: /dc[_\s-]?odb|\bodb\b|\bdc\b|\bfdc\b|\bcabinet\b/i },
  { type: "joint", re: /\b(joint|jc\d*|splice|closure|manhole|handhole|hh\d*)\b/i },
  { type: "ont", re: /\b(ont|onu|cpe|customer|subscriber|client|home|premise|hp\d*|user)\b/i },
];

const CABLE_RULES = [
  { cable: "drop", re: /\b(drop|last\s*mile)\b/i },
  { cable: "feeder", re: /\b(feeder|backbone|trunk|primary|main)\b/i },
  { cable: "distribution", re: /\b(distribution|dist|secondary|branch)\b/i },
];

export const TYPE_LABELS = Object.freeze({
  olt: "OLT",
  dc: "DC",
  joint: "JC",
  fat: "FAT",
  splitter: "Splitter",
  ont: "ONT",
  junction: "Junction",
  unknown: "Node",
});

/**
 * A splitter written as 1:8, 1x8, 2x8 or "8 way".
 *
 * The first number is inputs, not decoration: a 2xN splitter has a second
 * input for a protected feed and costs about half a dB more than the 1xN of
 * the same output count. Design KMZs really do state "2x8" (this is what the
 * DC/ODB cabinets in a Transworld plan carry), so throwing the 2 away would
 * quietly under-count every span in the file.
 */
export function parseSplitter(text) {
  if (!text) return null;
  const explicit = /\b([12])\s*[:x]\s*(2|4|8|16|32|64|128)\b/i.exec(text);
  if (explicit) return { inputs: Number(explicit[1]), outputs: Number(explicit[2]) };
  const way = /\b(2|4|8|16|32|64|128)\s*[-\s]?way\b/i.exec(text);
  if (way) return { inputs: 1, outputs: Number(way[1]) };
  return null;
}

/**
 * Fibre count from a name like "144F", "24 F", "04F". Design KMZs label cables
 * and closures with the count rather than with an identity, which is also why
 * such a name makes a useless label (see labelFor).
 */
export function parseFibreCount(text) {
  const match = /\b(\d{1,3})\s*F\b/i.exec(text ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * Attribute keys that name a *relation*, not a type.
 *
 * A joint closure filed under Distribution carries "DC | 15" -- the cabinet it
 * belongs to. Reading that as part of the closure's own description is what
 * made 27 joints classify as DC cabinets: the field says which DC feeds it,
 * not that it is one. Relations are read deliberately (see fieldOf) and kept
 * out of the keyword haystack entirely.
 */
const RELATION_KEYS = /^(dc|dc[_\s-]?id|parent|parent[_\s-]?id|id|objectid|fid|name)$/i;

/** The first attribute whose key matches, e.g. Splitter_Type / Capacity. */
export function fieldOf(data, pattern) {
  for (const [key, value] of Object.entries(data ?? {})) {
    if (pattern.test(key)) return value;
  }
  return null;
}

/**
 * What a placemark says about itself: its name, the folders it is filed under,
 * its style, and its own attributes -- but never the raw description HTML (it
 * is markup, and its attribute table is parsed properly by kmz.js) and never a
 * relation field.
 */
function haystackOf(placemark) {
  const attributes = Object.entries(placemark.data ?? {})
    .filter(([key]) => !RELATION_KEYS.test(key.trim()))
    .map(([key, value]) => `${key} ${value}`)
    .join(" ");

  return [placemark.name, placemark.folders.join(" "), placemark.styleUrl, attributes]
    .filter(Boolean)
    .join(" ");
}

export function classifyPoint(placemark) {
  const haystack = haystackOf(placemark);
  for (const rule of TYPE_RULES) {
    if (rule.re.test(haystack)) return rule.type;
  }
  return "unknown";
}

export function classifyCable(placemark) {
  // A stated field beats a guess from the folder name: an ArcGIS export puts
  // "Network | Drop" on the cable itself.
  const stated = fieldOf(placemark.data, /^(network|cable[_\s-]?type|type|category|segment)$/i);
  const haystack = [stated, haystackOf(placemark)].filter(Boolean).join(" ");
  for (const rule of CABLE_RULES) {
    if (rule.re.test(haystack)) return rule.cable;
  }
  return "cable";
}

/**
 * A readable identity for a node. A name that is only a fibre count ("24F") or
 * only a ratio ("1x8") says what the thing is, not which one it is -- 183 FATs
 * all called "1x8" need numbering before anyone can act on a row in the
 * report.
 */
function labelFor(type, name, sequence) {
  const typeLabel = TYPE_LABELS[type] ?? TYPE_LABELS.unknown;
  const generic = !name || /^\s*\d{1,3}\s*f\s*$/i.test(name) || /^\s*1\s*[:x]\s*\d+\s*$/i.test(name);
  if (generic) return `${typeLabel} ${sequence}`;
  return name.toLowerCase().includes(typeLabel.toLowerCase()) ? name : `${typeLabel} ${name}`;
}

/**
 * Splits placemarks into typed nodes and cables.
 *
 * A splitter or FAT whose ratio the file does not state keeps `ratio: null`
 * and is flagged `ratioAssumed`: what to assume in its place is a budget
 * parameter (budget.js `defaultRatio`), not a property of the file, so
 * changing that assumption must not mean re-reading the KMZ.
 */
export function buildNetwork(placemarks) {
  const nodes = [];
  const cables = [];
  const sequence = {};
  let idSeq = 0;

  for (const placemark of placemarks) {
    const haystack = haystackOf(placemark);
    // Splitter_Type / Capacity where the file declares them; the name only as
    // a fallback for files that carry no attributes at all.
    const statedSplit = fieldOf(placemark.data, /split(ter)?([_\s-]?type)?$|ratio/i);
    const statedCapacity = fieldOf(placemark.data, /^(capacity|fib(re|er)s?|cores?|count)$/i);
    // Its own id, and the cabinet it belongs to. A FAT carries "DC_ID | 16",
    // a joint carries "DC | 15", a cabinet carries "ID | 16" -- which is how
    // the route can tell the DC that serves a premises from the ones its
    // feeder merely passes through.
    const identity = fieldOf(placemark.data, /^(id|name|label|code)$/i);
    const parentId = fieldOf(placemark.data, /^(dc|dc[_\s-]?id|parent([_\s-]?id)?)$/i);

    for (const coord of placemark.points) {
      const type = classifyPoint(placemark);
      const splitter =
        type === "splitter" || type === "fat" || type === "dc"
          ? parseSplitter(statedSplit) ?? parseSplitter(haystack)
          : null;
      sequence[type] = (sequence[type] ?? 0) + 1;
      nodes.push({
        id: `n${idSeq++}`,
        type,
        name: placemark.name || "",
        label: labelFor(type, identity || placemark.name, sequence[type]),
        coord,
        ratio: splitter?.outputs ?? null,
        splitterInputs: splitter?.inputs ?? 1,
        refId: identity ?? null,
        parentId: parentId ?? null,
        // Only the enclosures that actually split are worth flagging: a FAT
        // with no ratio in a design that states them elsewhere is a real gap.
        ratioAssumed: (type === "splitter" || type === "fat") && splitter == null,
        fibreCount: parseFibreCount(statedCapacity) ?? parseFibreCount(placemark.name) ?? parseFibreCount(haystack),
        folders: placemark.folders,
        data: placemark.data,
      });
    }
    for (const line of placemark.lines) {
      cables.push({
        id: `c${idSeq++}`,
        name: placemark.name || "cable",
        cable: classifyCable(placemark),
        fibreCount: parseFibreCount(statedCapacity) ?? parseFibreCount(placemark.name) ?? parseFibreCount(haystack),
        coords: line,
        length: pathLength(line),
      });
    }
  }

  return { nodes, cables };
}

// --- graph ---

/**
 * A grid over the nodes, queried by segment rather than by point.
 *
 * Testing every node against every segment is O(nodes x segments), which on a
 * city-sized KMZ is billions of comparisons. The cell is never smaller than
 * 30 m regardless of the snap tolerance, so a long segment sweeps a handful of
 * cells rather than thousands of one-metre ones.
 */
function buildGrid(nodes, toleranceM) {
  const cellM = Math.max(toleranceM, 30);
  const cell = cellM / 111320; // metres -> degrees; the latitude error is absorbed by the distance test
  const buckets = new Map();

  for (const node of nodes) {
    const key = `${Math.floor(node.coord[0] / cell)}:${Math.floor(node.coord[1] / cell)}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = []));
    bucket.push(node);
  }

  return {
    /** Every node in the cells the segment's bounding box touches. */
    nearSegment(a, b, tolerance) {
      const pad = tolerance / 111320;
      const minX = Math.floor((Math.min(a[0], b[0]) - pad) / cell);
      const maxX = Math.floor((Math.max(a[0], b[0]) + pad) / cell);
      const minY = Math.floor((Math.min(a[1], b[1]) - pad) / cell);
      const maxY = Math.floor((Math.max(a[1], b[1]) + pad) / cell);
      const found = [];
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const bucket = buckets.get(`${x}:${y}`);
          if (bucket) found.push(...bucket);
        }
      }
      return found;
    },
  };
}

/**
 * Cables become graph edges between the things they actually touch.
 *
 * Every node within the snap tolerance of a cable is projected onto it: the
 * cable is then cut at that projection and the two pieces carry the fibre
 * length actually drawn either side of it. Splitting on projection rather than
 * on shared vertices is what makes "split at each DC, joint and FAT" true even
 * when the enclosure was dropped a metre off the route, or between two
 * vertices of a long span.
 *
 * A cable end that reaches no node gets a junction, so two cables meeting in
 * open ground still join up -- and so a drop cable that simply stops at the
 * customer's wall has something to represent the premises (see derivePremises).
 */
export function buildGraph({ nodes, cables }, { snapTolerance = 1 } = {}) {
  const allNodes = [...nodes];
  const junctions = [];
  const junctionCell = Math.max(snapTolerance, 1) / 111320;
  const junctionBuckets = new Map();
  let junctionSeq = 0;

  // Junctions are matched against each other as they are created, so two
  // cables ending at the same corner share one node rather than each getting
  // its own (which would leave the graph disconnected at every corner).
  const findOrCreateJunction = (coord) => {
    const gx = Math.floor(coord[0] / junctionCell);
    const gy = Math.floor(coord[1] / junctionCell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const candidate of junctionBuckets.get(`${gx + dx}:${gy + dy}`) ?? []) {
          if (haversine(coord, candidate.coord) <= snapTolerance) return candidate;
        }
      }
    }
    const junction = {
      id: `j${junctionSeq++}`,
      type: "junction",
      name: "",
      label: `Junction ${junctionSeq}`,
      coord,
      ratio: null,
      ratioAssumed: false,
      fibreCount: null,
      folders: [],
      data: {},
    };
    const key = `${gx}:${gy}`;
    let bucket = junctionBuckets.get(key);
    if (!bucket) junctionBuckets.set(key, (bucket = []));
    bucket.push(junction);
    junctions.push(junction);
    allNodes.push(junction);
    return junction;
  };

  const grid = buildGrid(nodes, snapTolerance);
  const adjacency = new Map();
  const addEdge = (a, b, length, cable) => {
    if (a === b) return;
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push({ to: b, length, cable });
    adjacency.get(b).push({ to: a, length, cable });
  };

  const cableEnds = [];

  for (const cable of cables) {
    // Closest projection wins when a node lies near two consecutive segments.
    const best = new Map();
    let cumulative = 0;

    for (let i = 1; i < cable.coords.length; i++) {
      const a = cable.coords[i - 1];
      const b = cable.coords[i];
      const segmentLength = haversine(a, b);
      for (const node of grid.nearSegment(a, b, snapTolerance)) {
        const { distance, t } = projectOnSegment(node.coord, a, b);
        if (distance > snapTolerance) continue;
        const existing = best.get(node.id);
        if (!existing || distance < existing.distance) {
          best.set(node.id, { node, distance, at: cumulative + t * segmentLength });
        }
      }
      cumulative += segmentLength;
    }

    const attachments = [...best.values()].sort((x, y) => x.at - y.at);

    // The ends matter even when nothing is drawn there: without them a cable
    // that stops in mid-air contributes no length and no endpoint to join to.
    const ensureEnd = (coord, at) => {
      const nearest = attachments.length
        ? attachments.reduce((closest, candidate) =>
            Math.abs(candidate.at - at) < Math.abs(closest.at - at) ? candidate : closest
          )
        : null;
      if (nearest && haversine(nearest.node.coord, coord) <= snapTolerance) return;
      const junction = findOrCreateJunction(coord);
      attachments.push({ node: junction, distance: 0, at });
      cableEnds.push({ node: junction, cable });
    };
    ensureEnd(cable.coords[0], 0);
    ensureEnd(cable.coords[cable.coords.length - 1], cumulative);
    attachments.sort((x, y) => x.at - y.at);

    for (let i = 1; i < attachments.length; i++) {
      addEdge(
        attachments[i - 1].node.id,
        attachments[i].node.id,
        attachments[i].at - attachments[i - 1].at,
        cable
      );
    }
  }

  return { nodes: allNodes, adjacency, junctions, cableEnds };
}

/**
 * What the budget is actually about: the premises at the end of each drop.
 *
 * Designs that place an ONT or customer point per premises say so directly.
 * Plenty do not -- a Google Earth plan often draws 571 drop cables and no
 * customer points at all, because the drop *is* the customer. In that case
 * every dangling end of a drop cable is one premises, which is both what the
 * drawing means and the only reading that gets all of them into the report.
 */
export function derivePremises(network, graph) {
  const onts = network.nodes.filter((n) => n.type === "ont");
  if (onts.length > 0) return { premises: onts, source: "ont-points" };

  const hasDropCables = network.cables.some((c) => c.cable === "drop");
  const degree = (id) => (graph.adjacency.get(id) ?? []).length;

  const seen = new Set();
  const premises = [];
  for (const { node, cable } of graph.cableEnds) {
    // Only drops end at a customer. A feeder that stops in mid-air is an
    // unfinished drawing, and calling it a premises would bury that.
    if (hasDropCables && cable.cable !== "drop") continue;
    if (seen.has(node.id) || degree(node.id) !== 1) continue;
    seen.add(node.id);
    premises.push({ ...node, type: "ont", label: `Premises ${premises.length + 1}` });
  }

  return { premises, source: hasDropCables ? "drop-ends" : "cable-ends" };
}

// --- routing ---

/** Dijkstra from every OLT at once; the tree that comes back is per-node. */
function shortestPaths(graph, sourceIds) {
  const dist = new Map();
  const prev = new Map();
  // A pairing heap would be faster; a sorted frontier is enough for a network
  // that has to fit in a browser tab in the first place.
  const queue = [];

  for (const id of sourceIds) {
    dist.set(id, 0);
    queue.push({ id, d: 0 });
  }

  const visited = new Set();
  while (queue.length) {
    queue.sort((a, b) => a.d - b.d);
    const { id } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);

    for (const edge of graph.adjacency.get(id) ?? []) {
      const next = (dist.get(id) ?? 0) + edge.length;
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        prev.set(edge.to, { from: id, edge });
        queue.push({ id: edge.to, d: next });
      }
    }
  }

  return { dist, prev };
}

/**
 * Walks the predecessor tree back to the OLT and describes the span: what it
 * passes through, and how much fibre of each kind it runs over.
 *
 * The enclosure counts are the point of this function. A route that reaches
 * its premises through three FATs has been spliced through two of them and
 * split at one -- the last. Counting every FAT as a splitter would cost the
 * span 21 dB that the design does not spend; counting none of them would miss
 * the one it does. The same distinction is why joints, DCs and unnamed cable
 * junctions are returned separately: budget.js decides what each is worth,
 * this decides how many of each there are.
 *
 * Lengths are staged by what the KMZ calls its cables (Feeder / Distribution /
 * Drop). Where a file does not name them, the stages fall back to the
 * splitters on the route.
 */
function describeTracedPath(nodeId, prev, nodesById) {
  const chain = [];
  let cursor = nodeId;
  let guard = 0;

  while (prev.has(cursor) && guard++ < 1000000) {
    const { from, edge } = prev.get(cursor);
    chain.push({ node: nodesById.get(cursor), edge });
    cursor = from;
  }
  chain.push({ node: nodesById.get(cursor), edge: null });
  chain.reverse(); // now OLT -> ... -> premises

  const nodesPassed = chain.map((step) => step.node).filter(Boolean);
  const terminal = nodesPassed[nodesPassed.length - 1] ?? null;
  // The last enclosure before the premises is where the drop is served from,
  // so that is the FAT whose splitter this span pays for.
  const terminalFat =
    [...nodesPassed].reverse().find((node) => node.type === "fat" && node !== terminal) ?? null;

  // The cabinet that serves this premises, as opposed to the ones its feeder
  // runs through on the way. The FAT names its parent ("DC_ID | 16") and the
  // cabinet names itself ("ID | 16"), so where the file states the relation it
  // is used; where it does not, the deepest cabinet on the route is the one
  // serving it. Costing every cabinet passed as a splitting stage would charge
  // a span 11 dB it never spends -- three cabinets deep, that is the whole
  // budget twice over.
  const dcsOnPath = nodesPassed.filter((node) => node.type === "dc" && node !== terminal);
  const servingDc =
    (terminalFat?.parentId != null
      ? dcsOnPath.find((dc) => dc.refId != null && String(dc.refId) === String(terminalFat.parentId))
      : null) ?? dcsOnPath[dcsOnPath.length - 1] ?? null;

  const splitters = [];
  const counts = {
    joints: 0, dcs: 0, passThroughDcs: 0, dcsWithoutSplit: 0,
    passThroughFats: 0, junctions: 0, splitters: 0,
  };

  for (const node of nodesPassed) {
    if (node === terminal) continue;
    switch (node.type) {
      case "splitter":
        splitters.push(node);
        counts.splitters += 1;
        break;
      case "fat":
        if (node === terminalFat) splitters.push(node);
        else counts.passThroughFats += 1;
        break;
      case "dc":
        counts.dcs += 1;
        if (node !== servingDc) counts.passThroughDcs += 1;
        else if (node.ratio) splitters.push(node);
        else counts.dcsWithoutSplit += 1;
        break;
      case "joint":
        counts.joints += 1;
        break;
      case "junction":
        counts.junctions += 1;
        break;
      default:
        break;
    }
  }

  const byCable = { feeder: 0, distribution: 0, drop: 0, other: 0 };
  const cableNames = [];
  const coords = [];
  let totalSplitters = splitters.length;
  let seenSplitters = 0;
  const byStage = { feeder: 0, distribution: 0, drop: 0 };

  for (const step of chain) {
    if (step.edge) {
      const cable = step.edge.cable;
      byCable[cable.cable in byCable ? cable.cable : "other"] += step.edge.length;
      const last = cableNames[cableNames.length - 1];
      if (!last || last.id !== cable.id) {
        cableNames.push({ id: cable.id, name: cable.name, cable: cable.cable, fibreCount: cable.fibreCount });
      }
      const stage =
        seenSplitters === 0 ? "feeder" : seenSplitters >= totalSplitters ? "drop" : "distribution";
      byStage[stage] += step.edge.length;
    }
    if (step.node) {
      coords.push(step.node.coord);
      if (splitters.includes(step.node)) seenSplitters++;
    }
  }

  const classified = byCable.feeder + byCable.distribution + byCable.drop;
  const lengths = classified > 0
    ? { feeder: byCable.feeder, distribution: byCable.distribution + byCable.other, drop: byCable.drop }
    : byStage;

  return {
    method: "traced",
    olt: chain[0]?.node ?? null,
    terminalFat,
    servingDc,
    splitters,
    counts,
    // Distinct cable placemarks, in order: every change from one to the next is
    // a physical joint, and it is where the fibre count changes too.
    cableRuns: cableNames,
    nodesPassed,
    lengths,
    totalLength: lengths.feeder + lengths.distribution + lengths.drop,
    coords,
  };
}

/** Nearest node of a given type, by straight line. Used only by the fallback. */
function nearestOfType(coord, nodes, types) {
  let best = null;
  let bestDist = Infinity;
  for (const node of nodes) {
    if (!types.includes(node.type)) continue;
    const dist = haversine(coord, node.coord);
    if (dist < bestDist) {
      best = node;
      bestDist = dist;
    }
  }
  return best ? { node: best, dist: bestDist } : null;
}

/**
 * Premises -> FAT -> splitter chain -> OLT, straight lines inflated by
 * ROUTE_SLACK. This is what runs when the KMZ has no cables drawn, or has them
 * drawn too far from the points to snap.
 *
 * The splitter chain is walked, not guessed at once: the nearest splitter to
 * the premises is the last stage, and each further stage is the splitter
 * nearest to it that sits closer to the OLT. Stopping at the first splitter
 * would miss the feeder-side stage entirely, and a missing 1:4 is 7 dB the
 * estimate would be optimistic by -- which is the wrong direction for a number
 * someone is going to build against.
 */
const MAX_ESTIMATED_STAGES = 3;

function estimatePath(premises, nodes) {
  const olt = nearestOfType(premises.coord, nodes, ["olt"]);
  const oltCoord = olt?.node.coord ?? null;
  const lengths = { feeder: 0, distribution: 0, drop: 0 };
  const coords = [premises.coord];
  const counts = {
    joints: 0, dcs: 0, passThroughDcs: 0, dcsWithoutSplit: 0,
    passThroughFats: 0, junctions: 0, splitters: 0,
  };

  const fat = nearestOfType(premises.coord, nodes, ["fat"]);
  let cursor = premises.coord;
  const splitters = [];
  const used = new Set();

  if (fat) {
    lengths.drop = fat.dist * ROUTE_SLACK;
    cursor = fat.node.coord;
    coords.unshift(cursor);
    used.add(fat.node.id);
    // The FAT a drop hangs off is where it is split, exactly as in a traced
    // route -- the estimate only changes how the distance was found.
    splitters.push(fat.node);
  }

  // The cabinet the FAT says it belongs to, wherever it is. A stated relation
  // beats proximity: the nearest cabinet is often not the one that feeds it.
  let servingDc =
    fat?.node.parentId != null
      ? nodes.find((n) => n.type === "dc" && n.refId != null && String(n.refId) === String(fat.node.parentId))
      : null;
  if (!servingDc) {
    const nearestDc = nearestOfType(cursor, nodes.filter((n) => n.type === "dc" && n.ratio), ["dc"]);
    servingDc = nearestDc?.node ?? null;
  }
  if (servingDc) {
    lengths.distribution += haversine(cursor, servingDc.coord) * ROUTE_SLACK;
    splitters.unshift(servingDc);
    used.add(servingDc.id);
    counts.dcs += 1;
    if (!servingDc.ratio) counts.dcsWithoutSplit += 1;
    cursor = servingDc.coord;
    coords.unshift(cursor);
  }

  // Any explicitly named splitter still between here and the head end. Only
  // splitters: a second cabinet on the way is passed through, not split at,
  // which is the same rule the traced routes follow.
  for (let stage = 0; stage < MAX_ESTIMATED_STAGES; stage++) {
    const candidates = nodes.filter(
      (n) =>
        n.type === "splitter" &&
        !used.has(n.id) &&
        (!oltCoord || haversine(n.coord, oltCoord) < haversine(cursor, oltCoord))
    );
    const next = nearestOfType(cursor, candidates, ["splitter"]);
    if (!next) break;
    used.add(next.node.id);
    splitters.unshift(next.node);
    counts.splitters += 1;
    lengths.distribution += next.dist * ROUTE_SLACK;
    cursor = next.node.coord;
    coords.unshift(cursor);
    if (!oltCoord) break;
  }

  if (oltCoord) {
    // Whatever is left between the last thing we found and the head end is
    // feeder, even if that is the whole span because nothing else matched.
    lengths.feeder = haversine(cursor, oltCoord) * ROUTE_SLACK;
    coords.unshift(oltCoord);
  }

  return {
    method: "estimated",
    olt: olt?.node ?? null,
    terminalFat: fat?.node ?? null,
    servingDc,
    splitters,
    counts,
    cableRuns: [],
    nodesPassed: [premises],
    lengths,
    totalLength: lengths.feeder + lengths.distribution + lengths.drop,
    coords,
  };
}

/**
 * Picks the snap tolerance from the drawing instead of asking for one.
 *
 * Too small and enclosures drawn a hair off the route never join, leaving
 * premises stranded; too large and two neighbouring premises collapse into one
 * node and disappear from the report. So the ladder is walked and each rung
 * scored on the file itself: keep every premises the finest rung can see, then
 * take the rung that connects the most of them.
 *
 * Losing a premises is never worth a better connection rate, which is why the
 * count is the first key and not a tie-break: a merged pair of houses is a
 * silently wrong report, an unconnected one is a visible finding.
 */
export function calibrateSnap(network, ladder = SNAP_LADDER) {
  const attempts = [];
  let bestPremises = 0;

  for (const tolerance of ladder) {
    const graph = buildGraph(network, { snapTolerance: tolerance });
    const { premises } = derivePremises(network, graph);
    const olts = graph.nodes.filter((n) => n.type === "olt");
    const { dist } = olts.length
      ? shortestPaths(graph, olts.map((o) => o.id))
      : { dist: new Map() };
    const connected = premises.filter((p) => dist.has(p.id)).length;

    attempts.push({ tolerance, premises: premises.length, connected });
    bestPremises = Math.max(bestPremises, premises.length);
    // Nothing coarser can do better than every premises seen and connected.
    if (premises.length === bestPremises && connected === premises.length && connected > 0) break;
  }

  const viable = attempts.filter((a) => a.premises === bestPremises);
  const chosen = viable.reduce(
    (best, a) => (a.connected > best.connected ? a : best),
    viable[0] ?? { tolerance: ladder[0], premises: 0, connected: 0 }
  );

  return { tolerance: chosen.tolerance, attempts, chosen };
}

/**
 * One route per premises. Cables are used where they connect; anything the
 * graph cannot reach falls back to the estimate above rather than dropping out
 * of the report -- a premises missing from a link budget is worse than an
 * approximate one, because nobody notices it is missing.
 */
export function traceRoutes(network, options = {}) {
  const calibration = options.snapTolerance
    ? { tolerance: options.snapTolerance, attempts: [], chosen: null }
    : calibrateSnap(network);

  const graph = buildGraph(network, { snapTolerance: calibration.tolerance });
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const olts = graph.nodes.filter((n) => n.type === "olt");
  const { premises, source } = derivePremises(network, graph);

  const { dist, prev } = olts.length
    ? shortestPaths(graph, olts.map((o) => o.id))
    : { dist: new Map(), prev: new Map() };

  const routes = premises.map((point) => {
    const reachable = dist.has(point.id) && prev.has(point.id);
    // The derived premises carry their own label, so the traced path is asked
    // for the geometry and the counts, not for the name.
    const path = reachable
      ? describeTracedPath(point.id, prev, nodesById)
      : estimatePath(point, network.nodes);
    return { ont: point, ...path };
  });

  return { graph, routes, olts, premisesSource: source, calibration };
}
