/**
 * Writes a computed link budget out as a workbook.
 *
 * `xlsx` is imported lazily: it is a large dependency and nothing else in the
 * app uses it, so it should not sit in the main bundle for the sake of one
 * button in one tool.
 */

const SHEET_COLUMNS = [
  ["Premises", (r) => r.name],
  ["OLT / POP", (r) => r.oltName],
  ["Serving DC/ODB", (r) => r.dcName],
  ["Serving FAT", (r) => r.fatName],
  ["Route", (r) => (r.method === "traced" ? "Traced from cable" : "Estimated")],
  ["Fibre path", (r) => r.fibrePath],
  ["Splitters", (r) => r.splitterChain],
  ["Feeder (m)", (r) => r.lengths.feeder],
  ["Distribution (m)", (r) => r.lengths.distribution],
  ["Drop (m)", (r) => r.lengths.drop],
  ["Total fibre (m)", (r) => r.lengths.total],
  ["JC passed", (r) => r.elements.joints],
  ["DC/ODB passed", (r) => r.elements.dcs],
  ["FAT passed through", (r) => r.elements.passThroughFats],
  ["Cable junctions", (r) => r.elements.junctions],
  ["Splices", (r) => r.elements.splices],
  ["Connectors", (r) => r.elements.connectors],
  ["Fibre loss (dB)", (r) => r.downstream.fibreLoss],
  ["Splitter loss (dB)", (r) => r.downstream.splitterLoss],
  ["Splice loss (dB)", (r) => r.downstream.spliceLoss],
  ["Connector loss (dB)", (r) => r.downstream.connectorLoss],
  ["Downstream loss (dB)", (r) => r.downstream.totalLoss],
  ["ONT Rx (dBm)", (r) => r.downstream.rx],
  ["Upstream loss (dB)", (r) => r.upstream.totalLoss],
  ["OLT Rx (dBm)", (r) => r.upstream.rx],
  ["Headroom (dB)", (r) => r.headroom],
  ["Worst direction", (r) => r.worstDirection],
  ["Verdict", (r) => r.verdict.label],
  ["Latitude", (r) => r.coord[1]],
  ["Longitude", (r) => r.coord[0]],
];

export async function exportLinkBudget(result, fileName = "link-budget.xlsx") {
  const XLSX = await import("xlsx");

  const rows = result.rows.map((row) => {
    const record = {};
    for (const [header, read] of SHEET_COLUMNS) record[header] = read(row);
    return record;
  });

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(rows, { header: SHEET_COLUMNS.map(([h]) => h) }),
    "Link Budget"
  );

  const { params, summary } = result;
  // Assumptions on their own sheet, because a budget without the parameters
  // that produced it is not reviewable -- the reader has to be able to see
  // that these are worst-case figures and what margin was held back.
  const assumptions = [
    ["Equipment settings — not in the KMZ", ""],
    ["PON class", params.ponClass],
    ["Safety margin (dB)", params.safetyMargin],
    ["Connector loss (dB each)", params.connectorLoss],
    ["Splice loss (dB each)", params.spliceLoss],
    ["Splitter ratio where the file states none", `1:${params.defaultRatio}`],
    ["DC/ODB split stage", params.dcSplitRatio > 1 ? `1:${params.dcSplitRatio}` : "none"],
    ["DC/ODB fibre passes", params.dcConnection === "patched" ? "on adapters" : "spliced through"],
    [],
    ["Counted from the KMZ", ""],
    ["Cables", summary.network?.cables ?? ""],
    ["Fibre drawn (km)", summary.network?.fibreKm != null ? Number(summary.network.fibreKm.toFixed(2)) : ""],
    ["Premises taken from", summary.premisesSource === "ont-points" ? "ONT/customer points" : "drop-cable ends"],
    ["Snap tolerance calibrated to (m)", summary.calibration?.tolerance ?? ""],
    ["Average splices per span", summary.averageSplices],
    ["Average connectors per span", summary.averageConnectors],
    [],
    ["Premises evaluated", summary.total],
    ["Pass", summary.counts.pass],
    ["Marginal", summary.counts.marginal],
    ["Fail", summary.counts.fail],
    ["Receiver overload", summary.counts.overload],
    ["Average loss (dB)", summary.averageLoss],
    ["Routes estimated (no cable path)", summary.estimated],
    ["Splitter ratios assumed", summary.assumedRatios],
    ["Generated", new Date().toLocaleString()],
  ];
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(assumptions), "Assumptions");

  XLSX.writeFile(book, fileName);
}
