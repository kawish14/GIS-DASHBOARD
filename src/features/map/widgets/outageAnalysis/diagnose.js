/**
 * Root-cause analysis for clustered customer outages.
 *
 * Pure functions -- no ArcGIS, no React. The widget queries the customer layer
 * and hands plain attribute rows in here; everything below is arithmetic on
 * those rows, which is what makes the rules reviewable and the thresholds
 * tunable in one place.
 *
 * The question this answers is not "how many customers are down on this PON"
 * (a count anyone can get from the table) but "what broke". Those are
 * different, and the distinction is the whole point: 23 customers down on a
 * port is a fibre cut if they all went dark at once with loss of signal, an
 * area power cut if they report power-off, and a splitter or connector problem
 * if they are merely degraded. Same count, three different crews.
 *
 * Every verdict carries the evidence it was reached from, because these are
 * heuristics over telemetry, not a certainty -- see `CAUSES` for what each one
 * claims and `THRESHOLDS` for where the lines are drawn.
 */

import { FAULT_CODES } from "../../../../shared/constants/faultCodes";

export const CAUSES = Object.freeze({
  OLT_FAILURE: {
    id: "olt-failure",
    label: "OLT / uplink failure",
    hint: "Several PON ports on the same OLT went down together — the fault is upstream of the ports.",
    severity: 1,
  },
  FIBRE_CUT: {
    id: "fibre-cut",
    label: "Fibre cut / PON down",
    hint: "The whole port lost signal at once. Trace the feeder between the OLT and the first splitter.",
    severity: 2,
  },
  DISTRIBUTION: {
    id: "distribution",
    label: "Distribution segment fault",
    hint: "Part of the port is down and all of it hangs off one DC — suspect that DC's drop or splitter.",
    severity: 3,
  },
  POWER: {
    id: "power",
    label: "Area power outage",
    hint: "The ONTs are reporting power-off, not loss of signal. Not a network fault.",
    severity: 4,
  },
  DEGRADATION: {
    id: "degradation",
    label: "Optical degradation",
    hint: "Signal is weak or lossy rather than absent — bend, dirty connector or an ageing splitter.",
    severity: 5,
  },
  MIXED: {
    id: "mixed",
    label: "Mixed faults on one port",
    hint: "No single pattern dominates. Open the table and look at the alarms individually.",
    severity: 6,
  },
  ISOLATED: {
    id: "isolated",
    label: "Isolated customer fault",
    hint: "One customer on an otherwise healthy port — CPE, drop cable or premises power.",
    severity: 7,
  },
});

export const THRESHOLDS = Object.freeze({
  // At or above this share of a port being down, the cause is upstream of the
  // splitter rather than in individual drops.
  FULL_PON_RATIO: 0.8,
  // Below this share, a cluster is not really a port-level event.
  PARTIAL_PON_RATIO: 0.3,
  // Alarms this close together share a cause; spread out, they accumulated.
  SIMULTANEOUS_MINUTES: 15,
  // How much of one alarm type it takes to call the port's behaviour by it.
  DOMINANT_PURITY: 0.6,
  // Ports on one OLT that must be down together to blame the OLT itself.
  OLT_MIN_PORTS: 3,
  // One alarm is a customer problem, not an outage.
  MIN_CLUSTER: 2,
});

const ALARM_LABELS = {
  [FAULT_CODES.POWER_OFF]: "power off",
  [FAULT_CODES.LINK_DOWN]: "LOS",
  [FAULT_CODES.GPL]: "GEM loss",
  [FAULT_CODES.LOP]: "low optical power",
};

/**
 * Fault timestamps arrive as epoch milliseconds from an ArcGIS date field but
 * as an ISO string from the GeoJSON/WFS feeds. Both have to work: onset
 * simultaneity is what separates a cut from a port that decayed over weeks,
 * so silently reading every timestamp as NaN loses the main discriminator.
 */
export function parseFaultTime(value) {
  if (value == null) return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return Date.parse(value);
}

/** The PON port a row belongs to. `nce_fsp` when the feed provides it, frame/slot/port otherwise. */
export function ponOf(attr) {
  if (attr?.nce_fsp) return String(attr.nce_fsp);
  const { frame, slot, port } = attr ?? {};
  if (frame == null && slot == null && port == null) return null;
  return `${frame ?? ""}/${slot ?? ""}/${port ?? ""}`;
}

/**
 * Groups every customer row by OLT + PON port and works out what each port is
 * doing. Rows are plain `feature.attributes` objects; ALL customers must be
 * passed, not just alarmed ones -- "18 of 20 down" and "18 of 400 down" are
 * completely different events, and the healthy rows are the only way to tell
 * them apart.
 */
export function buildPortStats(rows) {
  const ports = new Map();

  for (const attr of rows) {
    const olt = attr?.olt;
    const pon = ponOf(attr);
    if (!olt || !pon) continue;

    const key = `${olt} | ${pon}`;
    let port = ports.get(key);
    if (!port) {
      port = {
        key, olt, pon,
        total: 0, downCount: 0, vipDown: 0,
        byState: {}, dcIds: new Set(), faultTimes: [],
      };
      ports.set(key, port);
    }

    port.total += 1;
    const state = Number(attr.alarmstate);
    if (!Number.isFinite(state) || state === 0) continue;

    port.downCount += 1;
    port.byState[state] = (port.byState[state] ?? 0) + 1;
    if (attr.service_tier === "VIP") port.vipDown += 1;
    if (attr.dc_id) port.dcIds.add(attr.dc_id);

    const t = parseFaultTime(attr.fault_time);
    if (Number.isFinite(t)) port.faultTimes.push(t);
  }

  return [...ports.values()].map(finalisePort);
}

function finalisePort(port) {
  const { downCount, byState, faultTimes } = port;
  const entries = Object.entries(byState);
  const [dominantState, dominantCount] = entries.reduce(
    (best, cur) => (cur[1] > best[1] ? cur : best),
    [null, 0]
  );

  return {
    ...port,
    dcIds: [...port.dcIds],
    downRatio: port.total > 0 ? downCount / port.total : 0,
    dominantState: dominantState == null ? null : Number(dominantState),
    // How single-minded the port's alarms are. A port that is 100% LOS is a
    // very different signal from one split evenly between LOS and power-off.
    purity: downCount > 0 ? dominantCount / downCount : 0,
    onsetSpreadMinutes:
      faultTimes.length > 1
        ? Math.round((Math.max(...faultTimes) - Math.min(...faultTimes)) / 60000)
        : 0,
  };
}

/**
 * OLT-level roll-up: the ports that are mostly down, grouped by OLT. When
 * enough of one OLT's ports fail together the shared cause is the OLT, its
 * card or its uplink -- diagnosing each port separately would send crews to
 * chase several fibre cuts that don't exist.
 *
 * Returns the set of OLT names implicated.
 */
export function findFailedOlts(ports) {
  const byOlt = new Map();
  for (const p of ports) {
    if (p.downRatio < THRESHOLDS.FULL_PON_RATIO || p.downCount < THRESHOLDS.MIN_CLUSTER) continue;
    byOlt.set(p.olt, (byOlt.get(p.olt) ?? 0) + 1);
  }
  return new Set(
    [...byOlt.entries()]
      .filter(([, count]) => count >= THRESHOLDS.OLT_MIN_PORTS)
      .map(([olt]) => olt)
  );
}

/**
 * The verdict for one port, given the OLTs already known to have failed.
 * Rules are ordered: the first match wins, most specific cause first.
 */
export function diagnosePort(port, failedOlts = new Set()) {
  const { downRatio, downCount, dominantState, purity, onsetSpreadMinutes, dcIds } = port;
  const pct = Math.round(downRatio * 100);
  const simultaneous = onsetSpreadMinutes <= THRESHOLDS.SIMULTANEOUS_MINUTES;
  const dominantLabel = ALARM_LABELS[dominantState] ?? "unknown alarm";
  const evidence = [];

  if (failedOlts.has(port.olt)) {
    return verdict(CAUSES.OLT_FAILURE, 0.9, [
      `${pct}% of this port is down`,
      `${THRESHOLDS.OLT_MIN_PORTS}+ ports on ${port.olt} are down together`,
    ]);
  }

  if (downCount === 1) {
    return verdict(CAUSES.ISOLATED, 0.8, [`1 of ${port.total} customers on the port`, dominantLabel]);
  }

  evidence.push(`${downCount} of ${port.total} down (${pct}%)`);
  evidence.push(`${Math.round(purity * 100)}% reporting ${dominantLabel}`);
  if (port.faultTimes.length > 1) {
    evidence.push(
      simultaneous
        ? `all within ${onsetSpreadMinutes} min`
        : `spread over ${formatSpread(onsetSpreadMinutes)}`
    );
  }

  if (dominantState === FAULT_CODES.POWER_OFF && purity >= THRESHOLDS.DOMINANT_PURITY) {
    return verdict(CAUSES.POWER, simultaneous ? 0.85 : 0.6, evidence);
  }

  if (dominantState === FAULT_CODES.LINK_DOWN && purity >= THRESHOLDS.DOMINANT_PURITY) {
    if (downRatio >= THRESHOLDS.FULL_PON_RATIO) {
      // Everything behind the splitter went dark. Simultaneity is what
      // separates a cut from a port that has been decaying for weeks.
      return verdict(CAUSES.FIBRE_CUT, simultaneous ? 0.92 : 0.65, evidence);
    }
    if (downRatio >= THRESHOLDS.PARTIAL_PON_RATIO && dcIds.length === 1) {
      return verdict(CAUSES.DISTRIBUTION, simultaneous ? 0.8 : 0.55, [
        ...evidence,
        `all behind DC ${dcIds[0]}`,
      ]);
    }
  }

  if (
    (dominantState === FAULT_CODES.LOP || dominantState === FAULT_CODES.GPL) &&
    purity >= THRESHOLDS.DOMINANT_PURITY
  ) {
    return verdict(CAUSES.DEGRADATION, 0.75, evidence);
  }

  return verdict(CAUSES.MIXED, 0.4, evidence);
}

function verdict(cause, confidence, evidence) {
  return { cause, confidence, evidence };
}

function formatSpread(minutes) {
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

export function confidenceLabel(confidence) {
  if (confidence >= 0.8) return "High";
  if (confidence >= 0.6) return "Medium";
  return "Low";
}

/**
 * The full scan: every port worth reporting, diagnosed and ordered so the
 * thing to fix first is at the top. Ports with a single alarm are dropped
 * unless nothing else was found -- they are noise during an outage.
 */
export function analyseOutages(rows) {
  const ports = buildPortStats(rows);
  const failedOlts = findFailedOlts(ports);

  const incidents = ports
    .filter((p) => p.downCount >= THRESHOLDS.MIN_CLUSTER)
    .map((p) => ({ ...p, ...diagnosePort(p, failedOlts) }))
    .sort(
      (a, b) =>
        a.cause.severity - b.cause.severity ||
        b.downCount - a.downCount ||
        b.vipDown - a.vipDown
    );

  return { incidents, failedOlts: [...failedOlts] };
}

/** Case-insensitive match on OLT or PON, for the widget's search box. */
export function matchesSearch(incident, term) {
  if (!term) return true;
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return (
    String(incident.olt).toLowerCase().includes(needle) ||
    String(incident.pon).toLowerCase().includes(needle) ||
    incident.dcIds.some((id) => String(id).toLowerCase().includes(needle))
  );
}
