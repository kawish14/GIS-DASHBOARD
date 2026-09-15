/**
 * Attribute-table columns for the link budget (features/featureTable).
 *
 * Local to this tool rather than in shared/constants/tableColumns.js: these
 * rows do not come from a network layer, they come from an uploaded design,
 * and nothing else in the app renders them.
 */

// The table renders plain cells, so the verdict carries its own marker the
// way customerColumns' status column does -- colour alone would not survive
// the CSV export either.
const VERDICT_MARKER = {
  Pass: "\u{1F7E2}",
  Marginal: "\u{1F7E1}",
  Fail: "\u{1F534}",
  Overload: "\u{1F7E3}",
  "No route": "\u{26AA}",
};

export const linkBudgetColumns = [
  { key: "name", label: "Premises", className: "text-gray-200" },
  { key: "olt", label: "OLT / POP" },
  { key: "dc", label: "Serving DC" },
  { key: "fat", label: "Serving FAT" },
  { key: "splitters", label: "Splitters" },
  { key: "route", label: "Route" },
  { key: "fibre_path", label: "Fibre path" },
  { key: "length_m", label: "Fibre (m)" },
  { key: "feeder_m", label: "Feeder (m)" },
  { key: "distribution_m", label: "Dist (m)" },
  { key: "drop_m", label: "Drop (m)" },
  { key: "jc_passed", label: "JC" },
  { key: "dc_passed", label: "DC/ODB" },
  { key: "fat_passed", label: "FAT thru" },
  { key: "splices", label: "Splices" },
  { key: "connectors", label: "Connectors" },
  { key: "fibre_db", label: "Fibre (dB)" },
  { key: "splitter_db", label: "Splitter (dB)" },
  { key: "splice_db", label: "Splice (dB)" },
  { key: "connector_db", label: "Connector (dB)" },
  { key: "down_db", label: "Downstream loss (dB)", className: "font-semibold" },
  { key: "ont_rx", label: "ONT Rx (dBm)" },
  { key: "up_db", label: "Upstream loss (dB)" },
  { key: "olt_rx", label: "OLT Rx (dBm)" },
  { key: "headroom", label: "Headroom (dB)", className: "font-semibold" },
  {
    key: "verdict",
    label: "Verdict",
    render: (attr) => `${VERDICT_MARKER[attr.verdict] ?? ""} ${attr.verdict}`.trim(),
    className: "font-semibold",
  },
];
