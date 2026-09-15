/**
 * The optical link budget itself: what a traced route costs in decibels, and
 * whether the ONT at the end of it will work.
 *
 * Pure. Routes come from ./network.js, the file from ./kmz.js, the UI is
 * ../LinkBudgetTool.jsx. Keeping the numbers here means the thresholds can be
 * read, argued with and tuned without opening a component.
 *
 * The model is the standard ODN sum:
 *
 *   loss = fibre(km x dB/km) + splitters + splices + connectors
 *   Rx   = Tx - loss
 *
 * evaluated in BOTH directions, because they are not the same link. Downstream
 * runs at 1490 nm (1577 for XGS) from an OLT that transmits hard into a
 * sensitive ONT; upstream runs at 1310 nm (1270) from an ONT with less power.
 * The verdict is the worse of the two, since a span that fails in either
 * direction is a span that does not work.
 *
 * Every figure below is a worst-case specification value, not a typical one --
 * a budget built on typical values passes on paper and fails on the street.
 */

/** dB/km, ITU-T G.652.D worst case at each PON wavelength. */
export const FIBRE_ATTENUATION = Object.freeze({
  1270: 0.4,
  1310: 0.35,
  1490: 0.24,
  1550: 0.22,
  1577: 0.23,
});

/**
 * Maximum insertion loss of a fused-fibre splitter, uniform ratio, including
 * excess loss (ITU-T G.671 / typical vendor spec sheets). The theoretical
 * split loss is 10log10(N); the rest is excess and is what makes a chain of
 * two small splitters cost more than one big one.
 */
export const SPLITTER_LOSS = Object.freeze({
  2: 3.6,
  4: 7.3,
  8: 10.5,
  16: 13.7,
  32: 17.2,
  64: 20.5,
  128: 24.0,
});

/**
 * The PON classes worth offering. `budget` is the ODN loss the class is
 * specified for; the Tx/Rx figures are what the transceivers do.
 *
 *   txOlt / txOnt   minimum launch power (dBm) -- the worst-case transmitter
 *   rxOnt / rxOlt   receiver sensitivity (dBm) -- the point of failure
 *   overloadOnt/Olt the receiver's maximum input; exceed it on a short span
 *                   and the link errors just as surely as on a long one
 */
export const PON_CLASSES = Object.freeze({
  "B+": {
    label: "GPON Class B+ (28 dB)",
    budget: 28,
    downstreamNm: 1490,
    upstreamNm: 1310,
    txOlt: 1.5,
    txOnt: 0.5,
    rxOnt: -27,
    rxOlt: -28,
    overloadOnt: -8,
    overloadOlt: -8,
  },
  "C+": {
    label: "GPON Class C+ (32 dB)",
    budget: 32,
    downstreamNm: 1490,
    upstreamNm: 1310,
    txOlt: 3,
    txOnt: 0.5,
    rxOnt: -32,
    rxOlt: -32,
    overloadOnt: -12,
    overloadOlt: -12,
  },
  N1: {
    label: "XGS-PON N1 (29 dB)",
    budget: 29,
    downstreamNm: 1577,
    upstreamNm: 1270,
    txOlt: 2,
    txOnt: 4,
    rxOnt: -28,
    rxOlt: -28,
    overloadOnt: -8,
    overloadOlt: -9,
  },
  N2: {
    label: "XGS-PON N2 (31 dB)",
    budget: 31,
    downstreamNm: 1577,
    upstreamNm: 1270,
    txOlt: 4,
    txOnt: 4,
    rxOnt: -30,
    rxOlt: -30,
    overloadOnt: -8,
    overloadOlt: -9,
  },
});

/**
 * What the KMZ cannot tell us.
 *
 * How many splices and connectors a span has is *counted from the drawing*
 * (see countElements) -- it is not in this list, and there is no "a splice
 * every N metres" here, because that was a guess standing in for something the
 * file states. What a KMZ never states is what each element costs and what the
 * equipment is, so that is all this holds.
 */
export const DEFAULT_PARAMS = Object.freeze({
  ponClass: "B+",
  connectorLoss: 0.5,   // dB, worst case for an SC/APC mated pair
  spliceLoss: 0.1,      // dB, worst case for a fusion splice
  safetyMargin: 3,      // dB held back for ageing, repairs and future splices
  defaultRatio: 8,      // only for a splitter or FAT whose ratio the file omits
  // A DC/ODB cabinet is a splitting stage in some designs and a patch-through
  // in others, and the drawing does not say which. 0 means "not a splitting
  // stage" -- the file-faithful reading, and the one the UI warns about.
  dcSplitRatio: 0,
  dcConnection: "patched", // how fibre passes a DC/ODB: "patched" | "spliced"
});

/**
 * A second input costs about half a decibel: a 2xN splitter is built as a 1x2
 * coupler feeding the 1xN stage, and the port that is not carrying the
 * protected feed still takes its share.
 */
export const DUAL_INPUT_PENALTY = 0.5;

export function splitterLoss(ratio, inputs = 1) {
  const base =
    SPLITTER_LOSS[ratio] ??
    // An odd ratio (1:6, 1:24) is in no spec sheet we can quote, so fall back
    // to theory plus the excess loss the tabulated ratios average out at.
    10 * Math.log10(ratio) + 1.0;
  return base + (inputs > 1 ? DUAL_INPUT_PENALTY : 0);
}

function attenuationAt(nm) {
  if (FIBRE_ATTENUATION[nm] != null) return FIBRE_ATTENUATION[nm];
  const known = Object.keys(FIBRE_ATTENUATION).map(Number).sort((a, b) => a - b);
  const nearest = known.reduce((best, k) => (Math.abs(k - nm) < Math.abs(best - nm) ? k : best), known[0]);
  return FIBRE_ATTENUATION[nearest];
}

const round = (value, places = 2) => Number(value.toFixed(places));

/**
 * The splitting stages on one route, ratios resolved.
 *
 * The route says which enclosures split it -- explicit splitters, and the FAT
 * the drop actually hangs off, never the ones it merely passes through. The
 * ratio comes from the file where the file states one ("1x8" on a FAT), and
 * from `defaultRatio` where it does not, flagged either way so the report can
 * say how much of itself was assumed.
 *
 * A DC/ODB stage is added only when the operator says their cabinets carry
 * one, because no drawing of this kind records it.
 */
export function resolveSplitters(route, params) {
  const stages = route.splitters.map((s) => ({
    label: s.label ?? s.name,
    ratio: s.ratio ?? params.defaultRatio,
    inputs: s.splitterInputs ?? 1,
    assumed: s.ratio == null,
    at: s.type === "fat" ? "FAT" : s.type === "dc" ? "DC" : "splitter",
  }));

  // Only for cabinets that state nothing. Where the KMZ says "Splitter_Type |
  // 2x8" the cabinet is already in the list above, with its real ratio.
  if (params.dcSplitRatio > 1) {
    for (let i = 0; i < (route.counts?.dcsWithoutSplit ?? 0); i++) {
      stages.unshift({ label: "DC/ODB", ratio: params.dcSplitRatio, inputs: 1, assumed: true, at: "DC" });
    }
  }
  return stages;
}

/**
 * Counts the passive elements on one route -- from the drawing, not from a
 * rule of thumb.
 *
 * Every one of these is something the KMZ actually contains. A splice happens
 * where the fibre is joined: at each joint closure, at each cable-to-cable
 * junction the route runs through, at each FAT it passes *through* on the way
 * to the one that serves it, and at the input of each splitting stage. A
 * connector happens where it is plugged: the ODF at the head end, the output
 * port of each splitter, the ONT -- and both sides of a DC/ODB when those
 * cabinets are patched rather than spliced.
 *
 * That last one is the only judgement call left, and it is the operator's:
 * everything else is counted off the route that was traced.
 */
export function countElements(route, params, stages) {
  const counts = route.counts ?? {
    joints: 0, dcs: 0, passThroughDcs: 0, dcsWithoutSplit: 0, passThroughFats: 0, junctions: 0,
  };
  const patched = params.dcConnection === "patched";

  const splices =
    counts.joints +
    counts.junctions +
    counts.passThroughFats +
    stages.length + // each splitter is spliced onto the fibre feeding it
    (patched ? 0 : counts.passThroughDcs);

  const connectors =
    1 + // ODF / patch panel at the head end
    1 + // the ONT
    stages.length + // one output port per splitting stage
    (patched ? 2 * counts.passThroughDcs : 0); // in and out of each cabinet passed through

  return {
    splices,
    connectors,
    joints: counts.joints,
    junctions: counts.junctions,
    passThroughFats: counts.passThroughFats,
    dcs: counts.dcs,
    passThroughDcs: counts.passThroughDcs ?? 0,
    dcsWithoutSplit: counts.dcsWithoutSplit ?? 0,
  };
}

/** One direction of one span. */
function evaluateDirection({ route, params, elements, splitterTotal, nm, tx, sensitivity, overload }) {
  const fibreLoss = (route.totalLength / 1000) * attenuationAt(nm);
  const spliceTotal = elements.splices * params.spliceLoss;
  const connectorTotal = elements.connectors * params.connectorLoss;
  const totalLoss = fibreLoss + splitterTotal + spliceTotal + connectorTotal;
  const rx = tx - totalLoss;

  return {
    nm,
    tx: round(tx),
    fibreLoss: round(fibreLoss),
    splitterLoss: round(splitterTotal),
    spliceLoss: round(spliceTotal),
    connectorLoss: round(connectorTotal),
    totalLoss: round(totalLoss),
    rx: round(rx),
    // Headroom to the receiver's sensitivity. The safety margin is NOT
    // subtracted here -- it is applied when the verdict is decided, so the
    // report can show both "what it will be" and "what we are prepared to
    // accept".
    headroom: round(rx - sensitivity),
    overloaded: rx > overload,
  };
}

const VERDICTS = Object.freeze({
  pass: { id: "pass", label: "Pass", color: "#3fb950" },
  marginal: { id: "marginal", label: "Marginal", color: "#c98500" },
  fail: { id: "fail", label: "Fail", color: "#e66767" },
  overload: { id: "overload", label: "Overload", color: "#9085e9" },
  // No head end was found for this premises, so there is no span to judge --
  // the loss figures would only be the connectors at each end. Saying so beats
  // reporting a pass (or, as the numbers would have it, a receiver overload)
  // on a route that was never established.
  incomplete: { id: "incomplete", label: "No route", color: "#8a8a86" },
});

export { VERDICTS };

/** The budget for one ONT, both directions, with the verdict. */
export function evaluateRoute(route, params) {
  const spec = PON_CLASSES[params.ponClass] ?? PON_CLASSES["B+"];
  // Resolved here rather than at parse time, so the same traced span can be
  // re-costed under a different assumption without re-reading the KMZ.
  const splitters = resolveSplitters(route, params);
  const elements = countElements(route, params, splitters);
  const splitterTotal = splitters.reduce((sum, s) => sum + splitterLoss(s.ratio, s.inputs), 0);

  const downstream = evaluateDirection({
    route, params, elements, splitterTotal,
    nm: spec.downstreamNm, tx: spec.txOlt, sensitivity: spec.rxOnt, overload: spec.overloadOnt,
  });
  const upstream = evaluateDirection({
    route, params, elements, splitterTotal,
    nm: spec.upstreamNm, tx: spec.txOnt, sensitivity: spec.rxOlt, overload: spec.overloadOlt,
  });

  const headroom = Math.min(downstream.headroom, upstream.headroom);
  const worst = downstream.headroom <= upstream.headroom ? "downstream" : "upstream";

  let verdict = VERDICTS.pass;
  if (!route.olt) verdict = VERDICTS.incomplete;
  else if (headroom < 0) verdict = VERDICTS.fail;
  else if (headroom < params.safetyMargin) verdict = VERDICTS.marginal;
  // Checked after the loss verdicts because a span can be too long AND badly
  // budgeted; too much power arriving is the less urgent of the two.
  if (verdict === VERDICTS.pass && (downstream.overloaded || upstream.overloaded)) {
    verdict = VERDICTS.overload;
  }

  return {
    id: route.ont.id,
    name: route.ont.label ?? route.ont.name,
    coord: route.ont.coord,
    method: route.method,
    oltName: route.olt?.label ?? route.olt?.name ?? "—",
    fatName: route.terminalFat?.label ?? "—",
    dcName: route.servingDc?.label ?? "—",
    // Every change of cable placemark along the route, with the fibre count
    // the KMZ names it by: "144F -> 24F -> 12F -> 04F" is the design read back.
    fibrePath:
      route.cableRuns
        ?.map((run) => (run.fibreCount ? `${String(run.fibreCount).padStart(2, "0")}F` : run.cable))
        .filter((name, index, all) => index === 0 || name !== all[index - 1])
        .join(" → ") || "—",
    splitters,
    splitterChain: splitters.map((s) => `${s.inputs ?? 1}:${s.ratio}`).join(" → ") || "none",
    lengths: {
      feeder: Math.round(route.lengths.feeder),
      distribution: Math.round(route.lengths.distribution),
      drop: Math.round(route.lengths.drop),
      total: Math.round(route.totalLength),
    },
    elements,
    downstream,
    upstream,
    headroom: round(headroom),
    worstDirection: worst,
    budgetUsed: round(Math.max(downstream.totalLoss, upstream.totalLoss)),
    budgetLimit: spec.budget,
    verdict,
    coords: route.coords,
  };
}

/** Every ONT, plus the counts the widget puts at the top of the panel. */
export function computeLinkBudget(routes, overrides = {}) {
  const params = { ...DEFAULT_PARAMS, ...overrides };
  const rows = routes.map((route) => evaluateRoute(route, params));

  const counts = { pass: 0, marginal: 0, fail: 0, overload: 0, incomplete: 0 };
  let lossSum = 0;
  let worst = null;
  let longest = null;
  let estimated = 0;
  let assumedRatios = 0;
  let dcSpans = 0;
  let spliceSum = 0;
  let connectorSum = 0;

  for (const row of rows) {
    counts[row.verdict.id] += 1;
    lossSum += row.budgetUsed;
    if (row.verdict !== VERDICTS.incomplete && (!worst || row.headroom < worst.headroom)) worst = row;
    if (!longest || row.lengths.total > longest.lengths.total) longest = row;
    if (row.method === "estimated") estimated += 1;
    if (row.splitters.some((s) => s.assumed)) assumedRatios += 1;
    if (row.elements.dcsWithoutSplit > 0) dcSpans += 1;
    spliceSum += row.elements.splices;
    connectorSum += row.elements.connectors;
  }

  return {
    params,
    rows,
    summary: {
      total: rows.length,
      counts,
      averageLoss: rows.length ? round(lossSum / rows.length) : 0,
      worst,
      longest,
      estimated,
      assumedRatios,
      dcSpans,
      // Counted off the traced routes, not configured -- shown in the panel so
      // it is obvious these came from the drawing.
      averageSplices: rows.length ? round(spliceSum / rows.length, 1) : 0,
      averageConnectors: rows.length ? round(connectorSum / rows.length, 1) : 0,
    },
  };
}
