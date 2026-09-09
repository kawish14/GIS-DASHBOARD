import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalciteButton,
  CalciteChip,
  CalciteInput,
  CalciteNotice,
} from "@esri/calcite-components-react";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import { useArcGIS } from "../state/MapProvider";
import { customerColumns } from "../../../shared/constants/tableColumns";
import { escapeForCql } from "../../../shared/constants/faultCodes";
import {
  analyseOutages,
  confidenceLabel,
  matchesSearch,
  ponOf,
} from "./outageAnalysis/diagnose";

/**
 * Root-cause analysis for clustered outages. Rendered in the right sidebar's
 * Map Tools tab.
 *
 * The analysis itself is in ./outageAnalysis/diagnose.js -- this file is the
 * query layer and the UI. Two queries, deliberately:
 *
 *   scan      every customer, minimal fields, no geometry. ALL of them, not
 *             just the alarmed ones: "18 of 20 down" and "18 of 400 down" are
 *             different events and the healthy rows are what separates them.
 *   select    the alarmed customers of one port, with geometry and every
 *             field, because those features are handed to the attribute table.
 *
 * Selecting an incident highlights its customers, highlights and reveals the
 * parent DC on the real dc_odb layer, frames both, and opens a table tab for
 * each -- the customers and the DCs.
 */

// Fields the scan needs. Small on purpose: this reads the whole customer
// layer. Requested as an intersection with what the layer actually has --
// naming a field that isn't there fails the whole query, and the PON is
// `nce_fsp` on some feeds and frame/slot/port on others (see ponOf).
const SCAN_FIELDS = [
  "olt", "nce_fsp", "frame", "slot", "port",
  "alarmstate", "dc_id", "service_tier", "fault_time",
];

function availableScanFields(layer) {
  const present = new Set((layer.fields ?? []).map((f) => f.name));
  const usable = SCAN_FIELDS.filter((name) => present.has(name));
  // An empty list would mean "all fields" to ArcGIS; if we can't even see the
  // OLT there is nothing to group by, so let the caller fail loudly instead.
  return usable.includes("olt") && usable.includes("alarmstate") ? usable : null;
}

const NUMERIC_FIELD_TYPES = ["small-integer", "integer", "single", "double", "long"];

const CAUSE_TONE = {
  "olt-failure": "#e66767",
  "fibre-cut": "#e66767",
  distribution: "#c98500",
  power: "#9085e9",
  degradation: "#c98500",
  mixed: "#8a8a86",
  isolated: "#8a8a86",
};

export default function FspOutageAnalyzer() {
  const { view, layers, addTableData, removeTableData } = useArcGIS();

  const [loading, setLoading] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [failedOlts, setFailedOlts] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [error, setError] = useState("");
  const [scanned, setScanned] = useState(false);

  const highlightLayer = useRef(null);
  const dcHighlightHandleRef = useRef(null); // native layer-view highlight on dc_odb, not a graphic
  const openTableIds = useRef([]);           // every tab this widget opened, so Clear can close them all

  useEffect(() => {
    if (!view?.map) return undefined;
    highlightLayer.current = new GraphicsLayer({ title: "Outage Impact", listMode: "hide" });
    view.map.add(highlightLayer.current);
    return () => {
      if (view?.map && highlightLayer.current) view.map.remove(highlightLayer.current);
      dcHighlightHandleRef.current?.remove();
      dcHighlightHandleRef.current = null;
    };
  }, [view]);

  const visibleIncidents = useMemo(
    () => incidents.filter((i) => matchesSearch(i, search)),
    [incidents, search]
  );

  const scan = async () => {
    const customerLayer = layers?.Customers_test;
    if (!customerLayer) {
      setError("Customer layer is not loaded yet.");
      return;
    }

    setLoading(true);
    setError("");
    setIncidents([]);
    setSelectedKey(null);
    highlightLayer.current?.removeAll();

    try {
      await customerLayer.load();
      const outFields = availableScanFields(customerLayer);
      if (!outFields) {
        setError("The customer layer has no olt / alarmstate fields to analyse.");
        return;
      }

      const query = customerLayer.createQuery();
      query.where = "1=1";
      // Only the fields the rules need, and no geometry -- this is every
      // customer on the network, so the payload matters.
      query.outFields = outFields;
      query.returnGeometry = false;

      const { features } = await customerLayer.queryFeatures(query);
      const { incidents: found, failedOlts: olts } = analyseOutages(features.map((f) => f.attributes));

      setIncidents(found);
      setFailedOlts(olts);
      setScanned(true);
      if (found.length === 0) setError("No clustered outages found — every port looks healthy.");
    } catch (err) {
      console.error("[FspOutageAnalyzer] scan failed", err);
      setError("Could not read the customer layer to analyse it.");
    } finally {
      setLoading(false);
    }
  };

  /** Highlights one incident on the map and opens its tables. */
  const selectIncident = async (incident) => {
    if (!view || !highlightLayer.current) return;
    setSelectedKey(incident.key);
    setError("");
    highlightLayer.current.removeAll();
    dcHighlightHandleRef.current?.remove();
    dcHighlightHandleRef.current = null;

    const customerLayer = layers?.Customers_test;
    if (!customerLayer) return;

    try {
      // Filtered by OLT in the query and by PON in JS, because the port may
      // come from `nce_fsp` or from frame/slot/port depending on the feed --
      // ponOf() already knows that, and a WHERE clause would have to guess.
      const query = customerLayer.createQuery();
      query.where = `olt = '${escapeForCql(incident.olt)}' AND alarmstate > 0`;
      query.outFields = ["*"]; // the table renders these against customerColumns
      query.returnGeometry = true;

      const { features } = await customerLayer.queryFeatures(query);
      const onPort = features.filter((f) => ponOf(f.attributes) === incident.pon);

      const pointGraphics = onPort.map(
        (f) =>
          new Graphic({
            geometry: f.geometry,
            attributes: f.attributes,
            symbol: {
              type: "simple-marker",
              style: "circle",
              color: f.attributes.service_tier === "VIP" ? "purple" : "red",
              size: "10px",
              outline: { color: "cyan", width: 2 },
            },
          })
      );
      highlightLayer.current.addMany(pointGraphics);

      const zoomTargets = [...pointGraphics];
      const dcFeatures = await highlightParentDcs(incident, zoomTargets);

      if (zoomTargets.length > 0) {
        view.goTo({ target: zoomTargets, padding: 50 }, { duration: 1000 }).catch((e) => {
          if (e.name !== "AbortError") console.error("Outage zoom failed", e);
        });
      }

      openTables(incident, onPort, dcFeatures);
    } catch (err) {
      console.error("[FspOutageAnalyzer] could not load the incident", err);
      setError("Could not load the customers for that port.");
    }
  };

  /**
   * Reveals dc_odb and highlights the DCs behind this incident, pushing their
   * geometry into `zoomTargets` so the frame covers the DC as well as the
   * customers. Returns the DC features for the table.
   */
  const highlightParentDcs = async (incident, zoomTargets) => {
    const dcLayer = layers?.dc_odb;
    if (!dcLayer || incident.dcIds.length === 0) return [];

    try {
      dcLayer.visible = true; // styles/DC.jsx keeps this layer hidden by default

      // Quoting a numeric id matches nothing and throws nothing -- it just
      // silently returns zero features, which is why the DC used to vanish.
      const idField = dcLayer.fields?.find((f) => f.name.toLowerCase() === "id");
      const isNumericId = idField && NUMERIC_FIELD_TYPES.includes(idField.type);

      const dcQuery = dcLayer.createQuery();
      dcQuery.where = isNumericId
        ? `id IN (${incident.dcIds.join(",")})`
        : `id IN ('${incident.dcIds.map(escapeForCql).join("','")}')`;
      dcQuery.returnGeometry = true;
      dcQuery.outFields = ["*"];

      const { features } = await dcLayer.queryFeatures(dcQuery);
      if (features.length === 0) {
        console.warn(
          `[FspOutageAnalyzer] no DC matched id(s) ${incident.dcIds.join(", ")} — ` +
            `check that "${idField?.name ?? "id"}" is the join field on dc_odb.`
        );
        return [];
      }

      zoomTargets.push(...features);
      const dcLayerView = await view.whenLayerView(dcLayer);
      dcHighlightHandleRef.current = dcLayerView.highlight(features);
      return features;
    } catch (err) {
      console.error("[FspOutageAnalyzer] DC lookup failed", err);
      setError("Customers highlighted, but the DC could not be loaded.");
      return [];
    }
  };

  /** One tab for the affected customers, one for the DCs behind them. */
  const openTables = (incident, customerFeatures, dcFeatures) => {
    if (!addTableData) return;
    closeTables();

    const customerTabId = `outage_customers_${incident.key}`;
    addTableData(
      customerTabId,
      `PON ${incident.pon}`,
      customerFeatures,
      customerColumns
    );
    openTableIds.current.push(customerTabId);

    if (dcFeatures.length > 0) {
      const dcTabId = `outage_dc_${incident.key}`;
      // No column set is passed: the table auto-generates them from the DC's
      // own attributes, which vary by deployment.
      addTableData(dcTabId, `DC (${dcFeatures.length})`, dcFeatures, null);
      openTableIds.current.push(dcTabId);
    }
  };

  const closeTables = () => {
    if (removeTableData) openTableIds.current.forEach((id) => removeTableData(id));
    openTableIds.current = [];
  };

  const clearAnalysis = () => {
    highlightLayer.current?.removeAll();
    dcHighlightHandleRef.current?.remove();
    dcHighlightHandleRef.current = null;
    if (layers?.dc_odb) layers.dc_odb.visible = false; // back to DC.jsx's default
    closeTables();
    setIncidents([]);
    setFailedOlts([]);
    setSelectedKey(null);
    setSearch("");
    setScanned(false);
    setError("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <CalciteNotice open icon="lightbulb" scale="s">
        <div slot="message">
          Groups active alarms by OLT and PON port, then works out what each cluster
          looks like — a fibre cut, an OLT failure, a power outage or degradation —
          from how much of the port is down, which alarms it reports and how close
          together they started.
        </div>
      </CalciteNotice>

      <div style={{ display: "flex", gap: "8px" }}>
        <CalciteButton onClick={scan} loading={loading ? true : undefined} width="full">
          Scan Network
        </CalciteButton>
        {scanned && (
          <CalciteButton onClick={clearAnalysis} appearance="outline" kind="danger" iconStart="trash">
            Clear
          </CalciteButton>
        )}
      </div>

      {incidents.length > 0 && (
        <>
          <CalciteInput
            scale="s"
            icon="search"
            clearable
            placeholder="Filter by OLT, PON or DC"
            value={search}
            onCalciteInputInput={(e) => setSearch(e.target.value ?? "")}
          />
          <ScanSummary
            incidents={incidents}
            visibleCount={visibleIncidents.length}
            failedOlts={failedOlts}
          />
        </>
      )}

      {error && (
        <div style={{ color: "var(--calcite-ui-danger, #e66767)", fontSize: "0.8rem" }}>{error}</div>
      )}

      {incidents.length > 0 && visibleIncidents.length === 0 && (
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted, #a0aab7)" }}>
          Nothing matches &ldquo;{search}&rdquo;.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "420px", overflowY: "auto" }}>
        {visibleIncidents.map((incident) => (
          <IncidentCard
            key={incident.key}
            incident={incident}
            selected={incident.key === selectedKey}
            onSelect={() => selectIncident(incident)}
          />
        ))}
      </div>
    </div>
  );
}

/** What the scan found, before any filtering. */
function ScanSummary({ incidents, visibleCount, failedOlts }) {
  const byCause = incidents.reduce((acc, i) => {
    acc[i.cause.label] = (acc[i.cause.label] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ fontSize: "11px", color: "var(--text-muted, #a0aab7)", lineHeight: 1.6 }}>
      <div>
        {visibleCount === incidents.length
          ? `${incidents.length} incidents`
          : `${visibleCount} of ${incidents.length} incidents`}
        {failedOlts.length > 0 && ` · ${failedOlts.length} OLT-level`}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "2px" }}>
        {Object.entries(byCause).map(([label, count]) => (
          <span
            key={label}
            style={{
              padding: "1px 6px",
              borderRadius: "999px",
              border: "1px solid var(--border-color, #2d3748)",
            }}
          >
            {label} {count}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One diagnosed port: the verdict first, the numbers that produced it under it. */
function IncidentCard({ incident, selected, onSelect }) {
  const tone = CAUSE_TONE[incident.cause.id] ?? "#8a8a86";
  const edgeColor = selected ? "var(--text-highlight, #38bdf8)" : "var(--border-color, #2d3748)";

  return (
    <button
      type="button"
      onClick={onSelect}
      title={incident.cause.hint}
      style={{
        textAlign: "left",
        cursor: "pointer",
        padding: "8px 10px",
        borderRadius: "6px",
        background: selected ? "rgba(59,130,246,0.16)" : "rgba(255,255,255,0.02)",
        // One shorthand per property, four values rather than a `borderLeft`
        // override: React warns when a shorthand and its longhand are both set
        // and one of them changes on re-render.
        borderWidth: "1px 1px 1px 3px",
        borderStyle: "solid",
        borderColor: `${edgeColor} ${edgeColor} ${edgeColor} ${tone}`,
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, color: tone }}>{incident.cause.label}</span>
        <span style={{ fontSize: "10px", color: "var(--text-muted, #a0aab7)", whiteSpace: "nowrap" }}>
          {confidenceLabel(incident.confidence)} confidence
        </span>
      </div>

      <div style={{ fontSize: "11px", margin: "3px 0", color: "#cbd5e1" }}>
        {incident.olt} · PON {incident.pon}
        {incident.dcIds.length > 0 && ` · DC ${incident.dcIds.slice(0, 2).join(", ")}`}
        {incident.dcIds.length > 2 && ` +${incident.dcIds.length - 2}`}
      </div>

      <div style={{ fontSize: "10px", color: "var(--text-muted, #a0aab7)", lineHeight: 1.5 }}>
        {incident.evidence.join(" · ")}
      </div>

      <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
        <CalciteChip value="down" scale="s" kind="danger">
          {incident.downCount} down
        </CalciteChip>
        {incident.vipDown > 0 && (
          <CalciteChip value="vip" scale="s" kind="brand">
            {incident.vipDown} VIP
          </CalciteChip>
        )}
      </div>
    </button>
  );
}
