/**
 * The `lopdetail` field: the per-customer breakdown behind a Low Optical
 * Power alarm.
 *
 * `web_app:Customers_test` carries it next to `alarmstate` and
 * `perceived_severity`, so one LOP customer looks like this:
 *
 *   {
 *     id: "PKKHI0001234",
 *     name: "Some Customer (Pvt) Ltd",
 *     region: "South",
 *     area_town: "Clifton",
 *     olt: "KHI-OLT-07",
 *     fault_time: "2026-09-08T04:12:00Z",
 *     alarmstate: 4,                  // FAULT_CODES.LOP
 *     perceived_severity: "Warning",  // "Warning" -> warning bucket, anything else -> minor
 *     lopdetail: "TypeID= '2005'"     // <-- the cause tag this module is about
 *   }
 *
 * The tag is free text, not an enum. NCE writes `TypeID= '2005'` today, but it
 * also sends bare codes, and alarms raised before the field existed carry
 * nothing at all -- CustomerDetails.jsx already has to regex it apart to show
 * a single value. So every function here degrades to "show what we got"
 * instead of dropping a row: an unparseable tag keeps its raw text, and a
 * missing one lands in a single explicit "Unclassified" bucket rather than
 * silently vanishing from a count the sidebar has already published.
 */
import { FAULT_CODES, DERIVED_FAULT_CODES, SEVERITY } from "./faultCodes";

/** The attribute name, in one place -- it goes into WFS propertyName lists and CQL. */
export const LOP_DETAIL_FIELD = "lopdetail";

/** Bucket for customers whose alarm carries no cause tag at all. */
export const UNCLASSIFIED_LOP_CAUSE = "__unclassified__";

/**
 * Display names for cause codes, keyed by the code `parseLopDetail` extracts.
 *
 * Deliberately empty: the codes are NCE's, and a wrong label on an operations
 * dashboard is worse than no label. An unmapped code renders as `TypeID 2005`
 * with the raw tag on hover, so the breakdown is useful before anyone fills
 * this in. Add entries as the meanings are confirmed:
 *
 *   export const LOP_CAUSE_LABELS = { 2005: "Fibre bend", 2007: "Dirty connector" };
 */
export const LOP_CAUSE_LABELS = {};

/**
 * The two LOP rows the sidebar shows, and everything that differs between
 * them. Keyed by the same DERIVED_FAULT_CODES values `selectedFault` uses, so
 * a variant key can be handed straight to the map highlight.
 */
export const LOP_VARIANTS = Object.freeze({
  [DERIVED_FAULT_CODES.LOP_MINOR]: Object.freeze({
    key: DERIVED_FAULT_CODES.LOP_MINOR,
    label: "Low Optical Power",
    description: "Remote optical transceiver parameters exceed alarm threshold",
    color: "#e6ff04",
    isWarning: false,
  }),
  [DERIVED_FAULT_CODES.LOP_WARNING]: Object.freeze({
    key: DERIVED_FAULT_CODES.LOP_WARNING,
    label: "Low Optical Power (Warning)",
    description: "Remote optical transceiver parameters exceed warning threshold",
    color: "#bff705",
    isWarning: true,
  }),
});

/** True for the two rows that drill into a `lopdetail` breakdown. */
export function isLopVariant(faultType) {
  return faultType != null && Boolean(LOP_VARIANTS[faultType]);
}

/**
 * The warning/minor split, in one place.
 *
 * TopBar.jsx and OntStatusFeed.jsx already count LOP this way (lowercased
 * compare, anything that isn't "warning" is minor). The drill-in has to agree
 * with them exactly or its total won't match the count on the row that opened
 * it.
 */
export function isWarningSeverity(severity) {
  return String(severity ?? "").toLowerCase() === SEVERITY.WARNING;
}

/** True for a record the LOP rows are counting: alarmstate 4, right severity bucket. */
export function matchesLopVariant(record, variantKey) {
  const variant = LOP_VARIANTS[variantKey];
  if (!variant) return false;
  if (Number(record?.alarmstate) !== FAULT_CODES.LOP) return false;
  return isWarningSeverity(record?.perceived_severity) === variant.isWarning;
}

/**
 * Pulls the cause out of a raw tag.
 *
 * Handles the three shapes seen in the field: `TypeID= '2005'` (with any
 * spacing or quoting), a bare `2005`, and nothing. `raw` is kept so the panel
 * can show the untouched string on hover -- if a fourth shape turns up, it is
 * visible in the UI rather than mangled into a wrong bucket.
 */
export function parseLopDetail(raw) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return { code: UNCLASSIFIED_LOP_CAUSE, label: "Unclassified", raw: "" };
  }

  const tagged = text.match(/TypeID\s*=\s*['"]?([^'"]+)['"]?/i);
  const code = (tagged ? tagged[1] : text).trim();

  return {
    code,
    label: LOP_CAUSE_LABELS[code] ?? (tagged ? `TypeID ${code}` : code),
    raw: text,
  };
}

/**
 * Groups LOP records into the cause list the drill-in renders.
 *
 * Causes come back biggest-first because that is the order an operator wants
 * to work them in; the "Unclassified" bucket is forced last regardless of its
 * size, since it is a gap in the data rather than a cause anyone can act on.
 * `customers` rides along with each cause: the panel needs the ids both to
 * list them and to highlight exactly those points on the map.
 */
export function summariseLopDetail(records = []) {
  const buckets = new Map();

  records.forEach((record) => {
    const { code, label, raw } = parseLopDetail(record?.[LOP_DETAIL_FIELD]);
    if (!buckets.has(code)) {
      buckets.set(code, { code, label, samples: new Set(), customers: [] });
    }
    const bucket = buckets.get(code);
    if (raw) bucket.samples.add(raw);
    bucket.customers.push(record);
  });

  const total = records.length;
  const causes = [...buckets.values()]
    .map((bucket) => ({
      code: bucket.code,
      label: bucket.label,
      // Every distinct raw tag that landed here, for the row's tooltip.
      samples: [...bucket.samples],
      count: bucket.customers.length,
      share: total ? bucket.customers.length / total : 0,
      customers: bucket.customers,
    }))
    .sort((a, b) => {
      const aUnclassified = a.code === UNCLASSIFIED_LOP_CAUSE;
      const bUnclassified = b.code === UNCLASSIFIED_LOP_CAUSE;
      if (aUnclassified !== bUnclassified) return aUnclassified ? 1 : -1;
      return b.count - a.count || String(a.label).localeCompare(String(b.label));
    });

  return { total, causes };
}
