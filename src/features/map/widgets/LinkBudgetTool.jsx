import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalciteButton,
  CalciteChip,
  CalciteInput,
  CalciteInputNumber,
  CalciteLabel,
  CalciteNotice,
  CalciteOption,
  CalciteSelect,
} from "@esri/calcite-components-react";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import { useArcGIS } from "../state/MapProvider";
import { readNetworkFile } from "./linkBudget/kmz";
import { buildNetwork, traceRoutes } from "./linkBudget/network";
import { computeLinkBudget, DEFAULT_PARAMS, PON_CLASSES } from "./linkBudget/budget";
import { exportLinkBudget } from "./linkBudget/export";
import { linkBudgetColumns } from "./linkBudget/columns";

/**
 * Optical link budget from a GPON KMZ. Rendered in the right sidebar's Map
 * Tools tab, next to the outage analyser.
 *
 * The GIS team designs in Google Earth and hands over a KMZ; what nobody has
 * until now is whether the ONTs at the end of those cables will actually see
 * enough light. This reads the KMZ, works out the route from the OLT to every
 * ONT in it, and costs that route in decibels.
 *
 * The work is split the same way the outage analyser is -- this file is the UI
 * and the map, and nothing else:
 *
 *   linkBudget/kmz.js      unzip + KML -> placemarks
 *   linkBudget/network.js  placemarks -> typed nodes, cables, OLT->ONT routes
 *   linkBudget/budget.js   routes -> decibels and a verdict
 *   linkBudget/export.js   the workbook
 *   linkBudget/columns.js  the attribute-table columns
 *
 * Nothing here touches the operational layers: the KMZ is drawn on this
 * widget's own GraphicsLayer and disappears with it, because an uploaded
 * design is a proposal, not network data.
 */

// A design KMZ can hold tens of thousands of premises. Both caps below are
// about the browser, not the analysis -- every row still goes to the table and
// to the export.
const MAX_MARKERS = 6000;
const MAX_CARDS = 150;

const TABLE_ID = "link_budget";

const VERDICT_COLORS = {
  pass: [63, 185, 80],
  marginal: [201, 133, 0],
  fail: [230, 103, 103],
  overload: [144, 133, 233],
  incomplete: [138, 138, 134],
};

const NODE_COUNT_LABELS = [
  ["olt", "OLT/POP"],
  ["dc", "DC/ODB"],
  ["splitter", "Splitters"],
  ["fat", "FAT"],
  ["joint", "JC"],
  ["ont", "ONT"],
  ["unknown", "Unclassified"],
];

const DC_RATIOS = [
  [0, "None — patch/splice only"],
  [2, "1:2 primary split"],
  [4, "1:4 primary split"],
  [8, "1:8 primary split"],
];

/** Rows the attribute table and the export both read from. */
function rowsToGraphics(rows) {
  return rows.map(
    (row) =>
      new Graphic({
        geometry: { type: "point", longitude: row.coord[0], latitude: row.coord[1] },
        attributes: {
          id: row.id,
          name: row.name,
          olt: row.oltName,
          dc: row.dcName,
          fat: row.fatName,
          fibre_path: row.fibrePath,
          splitters: row.splitterChain,
          route: row.method === "traced" ? "Traced" : "Estimated",
          feeder_m: row.lengths.feeder,
          distribution_m: row.lengths.distribution,
          drop_m: row.lengths.drop,
          length_m: row.lengths.total,
          splices: row.elements.splices,
          connectors: row.elements.connectors,
          jc_passed: row.elements.joints,
          dc_passed: row.elements.dcs,
          fat_passed: row.elements.passThroughFats,
          fibre_db: row.downstream.fibreLoss,
          splitter_db: row.downstream.splitterLoss,
          splice_db: row.downstream.spliceLoss,
          connector_db: row.downstream.connectorLoss,
          down_db: row.downstream.totalLoss,
          ont_rx: row.downstream.rx,
          up_db: row.upstream.totalLoss,
          olt_rx: row.upstream.rx,
          headroom: row.headroom,
          verdict: row.verdict.label,
        },
      })
  );
}

export default function LinkBudgetTool() {
  const { view, addTableData, removeTableData } = useArcGIS();

  const [fileName, setFileName] = useState("");
  const [network, setNetwork] = useState(null);
  const [parseError, setParseError] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef(null);
  const designLayer = useRef(null);  // the KMZ as drawn: cables + ONT verdicts
  const routeLayer = useRef(null);   // the one span the user is looking at

  useEffect(() => {
    if (!view?.map) return undefined;
    designLayer.current = new GraphicsLayer({ title: "Link Budget (KMZ)", listMode: "hide" });
    routeLayer.current = new GraphicsLayer({ title: "Link Budget route", listMode: "hide" });
    view.map.addMany([designLayer.current, routeLayer.current]);
    return () => {
      if (!view?.map) return;
      view.map.removeMany([designLayer.current, routeLayer.current].filter(Boolean));
      designLayer.current = null;
      routeLayer.current = null;
    };
  }, [view]);

  const nodeCounts = useMemo(() => {
    if (!network) return null;
    const counts = {};
    for (const node of network.nodes) counts[node.type] = (counts[node.type] ?? 0) + 1;
    return counts;
  }, [network]);

  const cableLength = useMemo(
    () => (network ? network.cables.reduce((sum, c) => sum + c.length, 0) : 0),
    [network]
  );

  const visibleRows = useMemo(() => {
    if (!result) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return result.rows;
    return result.rows.filter((row) =>
      [row.name, row.oltName, row.dcName, row.fatName, row.verdict.label].some((field) =>
        field.toLowerCase().includes(needle)
      )
    );
  }, [result, search]);

  const setParam = (key) => (event) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) setParams((prev) => ({ ...prev, [key]: value }));
  };

  const loadFile = useCallback(async (file) => {
    if (!file) return;
    setBusy("Reading the file…");
    setParseError("");
    setResult(null);
    setSelectedId(null);
    setFileName(file.name);
    designLayer.current?.removeAll();
    routeLayer.current?.removeAll();

    try {
      const placemarks = await readNetworkFile(file);
      const parsed = buildNetwork(placemarks);
      if (parsed.nodes.length === 0) {
        throw new Error("No placemarks with coordinates were found in this file.");
      }
      setNetwork(parsed);
      drawDesign(parsed);
    } catch (err) {
      console.error("[LinkBudgetTool] could not read the file", err);
      setNetwork(null);
      setParseError(err.message || "That file could not be read.");
    } finally {
      setBusy("");
    }
    // drawDesign is stable for the life of the widget (it only touches refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The uploaded design, before any budget: cables and the points on them. */
  const drawDesign = (parsed) => {
    if (!designLayer.current) return;
    const graphics = parsed.cables.map(
      (cable) =>
        new Graphic({
          geometry: { type: "polyline", paths: [cable.coords] },
          symbol: {
            type: "simple-line",
            color: cable.cable === "feeder" ? [56, 189, 248, 0.9] : [148, 163, 184, 0.7],
            width: cable.cable === "feeder" ? 2 : 1,
          },
        })
    );
    designLayer.current.addMany(graphics);

    if (view && graphics.length) {
      view.goTo({ target: graphics, padding: 40 }).catch((err) => {
        if (err.name !== "AbortError") console.error("[LinkBudgetTool] zoom failed", err);
      });
    }
  };

  const run = async () => {
    if (!network) return;
    setBusy("Tracing routes…");
    setSelectedId(null);
    routeLayer.current?.removeAll();

    // Yield once so the button's loading state paints before a big trace
    // blocks the thread -- the work is synchronous by design (it is pure
    // graph code and belongs on the main thread for a KMZ this size).
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      // No snap tolerance is passed: network.js calibrates it against this
      // file (see calibrateSnap) rather than taking a number on trust.
      const { routes, olts, calibration, premisesSource } = traceRoutes(network);
      if (routes.length === 0) {
        setParseError(
          "No premises were found in this KMZ. The tool looks for ONT/customer points, " +
            "and failing that for the far end of each drop cable — this file has neither."
        );
        setResult(null);
        return;
      }
      const computed = computeLinkBudget(routes, params);
      computed.summary.oltsFound = olts.length;
      computed.summary.calibration = calibration;
      computed.summary.premisesSource = premisesSource;
      computed.summary.network = {
        cables: network.cables.length,
        fibreKm: network.cables.reduce((sum, c) => sum + c.length, 0) / 1000,
      };
      setResult(computed);
      setParseError("");
      drawVerdicts(computed.rows);
      addTableData(TABLE_ID, `Link Budget (${computed.rows.length})`, rowsToGraphics(computed.rows), linkBudgetColumns);
    } catch (err) {
      console.error("[LinkBudgetTool] budget failed", err);
      setParseError("The link budget could not be calculated for this file.");
    } finally {
      setBusy("");
    }
  };

  /** Repaints the ONT markers in verdict colours over the drawn cables. */
  const drawVerdicts = (rows) => {
    if (!designLayer.current) return;
    const cableGraphics = designLayer.current.graphics.filter(
      (g) => g.geometry?.type === "polyline"
    ).toArray();
    designLayer.current.removeAll();
    designLayer.current.addMany(cableGraphics);

    designLayer.current.addMany(
      rows.slice(0, MAX_MARKERS).map(
        (row) =>
          new Graphic({
            geometry: { type: "point", longitude: row.coord[0], latitude: row.coord[1] },
            attributes: { id: row.id },
            symbol: {
              type: "simple-marker",
              style: "circle",
              size: 7,
              color: VERDICT_COLORS[row.verdict.id],
              outline: { color: [15, 23, 42, 0.9], width: 0.7 },
            },
          })
      )
    );
  };

  /** Draws one span end to end and frames it. */
  const selectRow = (row) => {
    setSelectedId(row.id === selectedId ? null : row.id);
    if (!view || !routeLayer.current) return;
    routeLayer.current.removeAll();
    if (row.id === selectedId) return;

    const graphics = [];
    if (row.coords.length > 1) {
      graphics.push(
        new Graphic({
          geometry: { type: "polyline", paths: [row.coords] },
          symbol: { type: "simple-line", color: [34, 211, 238], width: 4 },
        })
      );
    }
    graphics.push(
      new Graphic({
        geometry: { type: "point", longitude: row.coord[0], latitude: row.coord[1] },
        symbol: {
          type: "simple-marker",
          style: "circle",
          size: 13,
          color: VERDICT_COLORS[row.verdict.id],
          outline: { color: [34, 211, 238], width: 2 },
        },
      })
    );
    routeLayer.current.addMany(graphics);
    view.goTo({ target: graphics, padding: 60 }, { duration: 800 }).catch((err) => {
      if (err.name !== "AbortError") console.error("[LinkBudgetTool] route zoom failed", err);
    });
  };

  const clearAll = () => {
    designLayer.current?.removeAll();
    routeLayer.current?.removeAll();
    removeTableData(TABLE_ID);
    setNetwork(null);
    setResult(null);
    setFileName("");
    setParseError("");
    setSearch("");
    setSelectedId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const download = async () => {
    if (!result) return;
    setBusy("Building the workbook…");
    try {
      const base = fileName.replace(/\.(kmz|kml)$/i, "") || "network";
      await exportLinkBudget(result, `${base}-link-budget.xlsx`);
    } catch (err) {
      console.error("[LinkBudgetTool] export failed", err);
      setParseError("The workbook could not be written.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <CalciteNotice open icon="lightbulb" scale="s">
        <div slot="message">
          Upload a GPON design as KMZ or KML. Every premises is traced back to its OLT
          along the drawn cables, and the fibre, splitters, splices and connectors on
          that route are counted from the file itself — split ratios, fibre counts and
          cable lengths as drawn — then costed against the PON class below.
        </div>
      </CalciteNotice>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          loadFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          padding: "14px",
          borderRadius: "8px",
          border: `1px dashed ${dragging ? "var(--text-highlight, #38bdf8)" : "var(--border-color, #2d3748)"}`,
          background: dragging ? "rgba(56,189,248,0.08)" : "rgba(255,255,255,0.02)",
          textAlign: "center",
          cursor: "pointer",
          fontSize: "12px",
          color: "var(--text-muted, #a0aab7)",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".kmz,.kml"
          style={{ display: "none" }}
          onChange={(e) => loadFile(e.target.files?.[0])}
        />
        {fileName ? (
          <span style={{ color: "#e2e8f0" }}>{fileName}</span>
        ) : (
          <span>Drop a .kmz / .kml here, or click to choose one</span>
        )}
      </div>

      {network && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {NODE_COUNT_LABELS.filter(([key]) => nodeCounts?.[key]).map(([key, label]) => (
            <CalciteChip key={key} value={key} scale="s">
              {label} {nodeCounts[key]}
            </CalciteChip>
          ))}
          <CalciteChip value="cable" scale="s">
            Cable {(cableLength / 1000).toFixed(1)} km
          </CalciteChip>
        </div>
      )}

      <CalciteLabel scale="s">
        PON class
        <CalciteSelect
          scale="s"
          label="PON class"
          value={params.ponClass}
          onCalciteSelectChange={(e) =>
            setParams((prev) => ({ ...prev, ponClass: e.target.selectedOption?.value ?? prev.ponClass }))
          }
        >
          {Object.entries(PON_CLASSES).map(([key, spec]) => (
            <CalciteOption key={key} value={key} selected={key === params.ponClass ? true : undefined}>
              {spec.label}
            </CalciteOption>
          ))}
        </CalciteSelect>
      </CalciteLabel>

      <CalciteButton
        appearance="transparent"
        scale="s"
        alignment="start"
        iconStart={showAssumptions ? "chevron-down" : "chevron-right"}
        onClick={() => setShowAssumptions((open) => !open)}
      >
        Equipment settings
      </CalciteButton>

      {showAssumptions && (
        <>
          {/* Only what a KMZ cannot contain. How many splices and connectors a
              span has is counted off the traced route, not set here. */}
          <div style={{ fontSize: "10px", color: "var(--text-muted, #a0aab7)", lineHeight: 1.5 }}>
            Everything else — split ratios, fibre counts, cable lengths, and how many
            splices and connectors each span carries — is read from the KMZ.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <NumberField label="Safety margin (dB)" value={params.safetyMargin} onInput={setParam("safetyMargin")} step={0.5} />
            <NumberField label="Connector loss (dB)" value={params.connectorLoss} onInput={setParam("connectorLoss")} step={0.05} />
            <NumberField label="Splice loss (dB)" value={params.spliceLoss} onInput={setParam("spliceLoss")} step={0.01} />
            <NumberField label="Ratio if unstated 1:N" value={params.defaultRatio} onInput={setParam("defaultRatio")} step={1} />
          </div>

          <CalciteLabel scale="s">
            DC/ODB cabinets carry
            <CalciteSelect
              scale="s"
              label="DC/ODB split"
              onCalciteSelectChange={(e) =>
                setParams((prev) => ({ ...prev, dcSplitRatio: Number(e.target.selectedOption?.value ?? 0) }))
              }
            >
              {DC_RATIOS.map(([value, label]) => (
                <CalciteOption key={value} value={String(value)} selected={value === params.dcSplitRatio ? true : undefined}>
                  {label}
                </CalciteOption>
              ))}
            </CalciteSelect>
          </CalciteLabel>

          <CalciteLabel scale="s">
            Fibre passes a DC/ODB
            <CalciteSelect
              scale="s"
              label="DC/ODB connection"
              onCalciteSelectChange={(e) =>
                setParams((prev) => ({ ...prev, dcConnection: e.target.selectedOption?.value ?? prev.dcConnection }))
              }
            >
              <CalciteOption value="patched" selected={params.dcConnection === "patched" ? true : undefined}>
                On adapters (2 connectors)
              </CalciteOption>
              <CalciteOption value="spliced" selected={params.dcConnection === "spliced" ? true : undefined}>
                Spliced through (1 splice)
              </CalciteOption>
            </CalciteSelect>
          </CalciteLabel>
        </>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <CalciteButton
          onClick={run}
          disabled={!network || busy ? true : undefined}
          loading={busy ? true : undefined}
          width="full"
        >
          Generate Link Budget
        </CalciteButton>
        {(network || result) && (
          <CalciteButton onClick={clearAll} appearance="outline" kind="danger" iconStart="trash">
            Clear
          </CalciteButton>
        )}
      </div>

      {busy && <div style={{ fontSize: "11px", color: "var(--text-muted, #a0aab7)" }}>{busy}</div>}

      {parseError && (
        <CalciteNotice open kind="danger" scale="s">
          <div slot="message">{parseError}</div>
        </CalciteNotice>
      )}

      {result && (
        <>
          <BudgetSummary result={result} onExport={download} />
          <CalciteInput
            scale="s"
            icon="search"
            clearable
            placeholder="Filter by premises, DC, FAT or verdict"
            value={search}
            onCalciteInputInput={(e) => setSearch(e.target.value ?? "")}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "420px", overflowY: "auto" }}>
            {visibleRows.slice(0, MAX_CARDS).map((row) => (
              <SpanCard
                key={row.id}
                row={row}
                selected={row.id === selectedId}
                onSelect={() => selectRow(row)}
              />
            ))}
            {visibleRows.length > MAX_CARDS && (
              <div style={{ fontSize: "11px", color: "var(--text-muted, #a0aab7)", padding: "4px 2px" }}>
                Showing {MAX_CARDS} of {visibleRows.length}. The table below and the export
                carry every span.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NumberField({ label, value, onInput, step }) {
  return (
    <CalciteLabel scale="s" style={{ fontSize: "11px" }}>
      {label}
      <CalciteInputNumber scale="s" value={String(value)} step={step} onCalciteInputNumberInput={onInput} />
    </CalciteLabel>
  );
}

/** What the run found, and the caveats that come with it. */
function BudgetSummary({ result, onExport }) {
  const { summary, params } = result;
  const spec = PON_CLASSES[params.ponClass];
  const warnings = [];
  if (!summary.oltsFound) {
    warnings.push(
      "No OLT or POP was recognised in the KMZ, so every route was estimated from the " +
        "nearest splitter chain. Name the head-end placemark OLT or POP for a traced budget."
    );
  }
  if (summary.estimated) {
    warnings.push(
      `${summary.estimated} of ${summary.total} spans had no cable route to follow and were ` +
        "estimated from straight-line distance plus 30% slack."
    );
  }
  if (summary.assumedRatios) {
    warnings.push(
      `${summary.assumedRatios} spans pass a splitter whose ratio the KMZ does not state; ` +
        `1:${params.defaultRatio} was assumed.`
    );
  }
  if (summary.dcSpans && !params.dcSplitRatio) {
    warnings.push(
      `${summary.dcSpans} spans run through a DC/ODB that states no split ratio of its own. It is being ` +
        "costed as a pass-through, not a splitting stage — set it under Assumptions if your " +
        "cabinets carry a primary splitter."
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
        <CalciteChip value="pass" scale="s" kind="brand">{summary.counts.pass} pass</CalciteChip>
        {summary.counts.marginal > 0 && (
          <CalciteChip value="marginal" scale="s">{summary.counts.marginal} marginal</CalciteChip>
        )}
        {summary.counts.fail > 0 && (
          <CalciteChip value="fail" scale="s" kind="danger">{summary.counts.fail} fail</CalciteChip>
        )}
        {summary.counts.overload > 0 && (
          <CalciteChip value="overload" scale="s">{summary.counts.overload} overload</CalciteChip>
        )}
        {summary.counts.incomplete > 0 && (
          <CalciteChip value="incomplete" scale="s">{summary.counts.incomplete} no route</CalciteChip>
        )}
      </div>

      <div style={{ fontSize: "11px", color: "var(--text-muted, #a0aab7)", lineHeight: 1.6 }}>
        {summary.total} spans · average {summary.averageLoss} dB of {spec.budget} dB ·{" "}
        {params.safetyMargin} dB margin held back
        <br />
        {/* Everything on this line was counted off the drawing, which is the
            point: none of it is a setting the user had to supply. */}
        Read from the KMZ: {summary.network?.cables} cables,{" "}
        {summary.network?.fibreKm.toFixed(1)} km of fibre ·{" "}
        {summary.premisesSource === "ont-points"
          ? "premises from ONT points"
          : "premises from drop-cable ends"}{" "}
        · cables joined within {summary.calibration?.tolerance} m (calibrated) ·{" "}
        {summary.averageSplices} splices and {summary.averageConnectors} connectors per span
        {summary.worst && (
          <>
            <br />
            Worst: {summary.worst.name} at {summary.worst.headroom} dB headroom
          </>
        )}
        {summary.longest && (
          <>
            <br />
            Longest: {summary.longest.name} at {(summary.longest.lengths.total / 1000).toFixed(2)} km
          </>
        )}
      </div>

      {warnings.map((text) => (
        <CalciteNotice key={text} open kind="warning" scale="s">
          <div slot="message">{text}</div>
        </CalciteNotice>
      ))}

      <CalciteButton appearance="outline" scale="s" iconStart="file-report" onClick={onExport}>
        Export workbook
      </CalciteButton>
    </div>
  );
}

/** One span: the verdict first, then what it is made of. */
function SpanCard({ row, selected, onSelect }) {
  const tone = row.verdict.color;
  const edge = selected ? "var(--text-highlight, #38bdf8)" : "var(--border-color, #2d3748)";

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: "left",
        cursor: "pointer",
        padding: "8px 10px",
        borderRadius: "6px",
        background: selected ? "rgba(59,130,246,0.16)" : "rgba(255,255,255,0.02)",
        // Four-value shorthand rather than a borderLeft override -- React warns
        // when a shorthand and its longhand both change on re-render.
        borderWidth: "1px 1px 1px 3px",
        borderStyle: "solid",
        borderColor: `${edge} ${edge} ${edge} ${tone}`,
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ fontSize: "12px", fontWeight: 700 }}>{row.name}</span>
        <span style={{ fontSize: "11px", fontWeight: 700, color: tone }}>
          {row.verdict.label} · {row.headroom} dB
        </span>
      </div>

      <div style={{ fontSize: "11px", margin: "3px 0", color: "#cbd5e1" }}>
        {row.oltName} · {row.dcName} · {row.fatName} · {row.splitterChain} ·{" "}
        {(row.lengths.total / 1000).toFixed(2)} km
        {row.method === "estimated" && " · estimated"}
      </div>

      <div style={{ fontSize: "10px", color: "var(--text-muted, #a0aab7)", lineHeight: 1.5 }}>
        ONT Rx {row.downstream.rx} dBm · OLT Rx {row.upstream.rx} dBm · loss {row.budgetUsed} of{" "}
        {row.budgetLimit} dB
      </div>

      {selected && (
        <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--text-muted, #a0aab7)", lineHeight: 1.6 }}>
          Fibre {row.downstream.fibreLoss} dB · splitters {row.downstream.splitterLoss} dB ·{" "}
          {row.elements.splices} splices {row.downstream.spliceLoss} dB · {row.elements.connectors}{" "}
          connectors {row.downstream.connectorLoss} dB
          <br />
          Feeder {row.lengths.feeder} m · distribution {row.lengths.distribution} m · drop{" "}
          {row.lengths.drop} m
          <br />
          Passes {row.elements.joints} JC · {row.elements.dcs} DC ·{" "}
          {row.elements.passThroughFats} FAT
          {row.fibrePath !== "—" && ` · ${row.fibrePath}`}
        </div>
      )}
    </button>
  );
}
