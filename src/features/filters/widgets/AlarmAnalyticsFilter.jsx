import React, { useState, useEffect, useRef } from "react";
import {
  CalciteLabel,
  CalciteSelect,
  CalciteOption,
  CalciteButton,
  CalciteNotice,
  CalciteInput
} from "@esri/calcite-components-react";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import { useArcGIS } from "../../map/state/MapProvider";
import { usePublishFilter } from "../ActiveFiltersContext";
import { useAuth } from "../../auth/AuthContext";
import { api, authenticate } from "../../../shared/config/runtimeConfig";
import { analyticsColumns } from "../../../shared/constants/tableColumns"; 

const LAYER_TITLE = "Alarm_Analytics_WFS";
const ALARM_LABELS = { 0: "Online", 1: "Power Off", 2: "Linked Down", 3: "GEM Packet Loss", 4: "LOP (Loss of Payload)" };
const ANALYTIC_OPTIONS = [
  { value: "summaryByAlias", label: "1. Customer Outage Summary (Alias)", description: "Identifies individual customers with the most frequent or longest outages." },
  { value: "alarmsByZone", label: "2. Spatial Vulnerability (Zones)", description: "Performs a live spatial join against regional boundaries." }
];

export default function AlarmAnalyticsFilter() {
  const { view, customerLayerView, addTableData, removeTableData, tableData, setTableVisibility } = useArcGIS();
  const { user } = useAuth();
  
  const [alarmState, setAlarmState] = useState("4");
  const [days, setDays] = useState("10"); 
  const [minDuration, setMinDuration] = useState("10"); 
  const [minRepeats, setMinRepeats] = useState("2");   
  const [selectedReport, setSelectedReport] = useState("summaryByAlias");
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState(null);
  const [isFiltered, setIsFiltered] = useState(false);
  const [appliedSummary, setAppliedSummary] = useState(null);
  const blobUrlRef = useRef(null);

  useEffect(() => { return () => revokeBlobUrl(); }, []);

  const revokeBlobUrl = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  };

  const removeWFSLayer = () => {
    if (!view?.map) return;
    const existingLayer = view.map.layers.find(layer => layer.title === LAYER_TITLE);
    if (existingLayer) view.map.remove(existingLayer);
    revokeBlobUrl(); 
  };

  const fetchAnalyticsData = async () => {
    const userRegions = user?.permissions?.regions || [];
    const response = await fetch(`${authenticate}/nce/nce-history/advanced-analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ alarmstate: parseInt(alarmState, 10), days: parseInt(days, 10), minDuration: parseInt(minDuration, 10), minRepeats: parseInt(minRepeats, 10), region: userRegions })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Failed to fetch analytics");
    return result.data[selectedReport] || [];
  };

  const fetchAndRenderHeatmap = async (reportData) => {
    let affectedAliases = [];
    if (selectedReport === "alarmsByZone") {
      affectedAliases = [...new Set(reportData.flatMap(row => row.affected_aliases || []).filter(Boolean))];
    } else {
      affectedAliases = [...new Set(reportData.map(row => row.alias).filter(Boolean))];
    }
    if (affectedAliases.length === 0 || !customerLayerView) return;
    customerLayerView.filter = null;
    removeWFSLayer();
    const safeAliases = affectedAliases.map(a => `'${a.replace(/'/g, "''")}'`).join(",");
    const cqlFilter = `alias IN (${safeAliases})`;
    const wfsParams = new URLSearchParams({ service: "WFS", version: "1.0.0", request: "GetFeature", typeName: "web_app:Customers_test", outputFormat: "application/json", maxFeatures: "1000000", cql_filter: cqlFilter });
    const wfsResponse = await fetch(`${api}/geoserver/web_app/ows`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: wfsParams.toString() });
    if (!wfsResponse.ok) throw new Error(`GeoServer Fetch Failed: ${wfsResponse.statusText}`);
    const geojsonData = await wfsResponse.json();
    geojsonData.features.forEach(feature => { feature.properties.analytics_count = 1; });
    const blob = new Blob([JSON.stringify(geojsonData)], { type: "application/json" });
    blobUrlRef.current = URL.createObjectURL(blob);
    const wfsLayer = new GeoJSONLayer({
      url: blobUrlRef.current, title: LAYER_TITLE,
      renderer: {
        type: "heatmap", field: "analytics_count",
        colorStops: [ { color: "rgba(0, 0, 255, 0)", ratio: 0 }, { color: "rgba(0, 255, 255, 0.5)", ratio: 0.2 }, { color: "rgba(255, 255, 0, 0.8)", ratio: 0.5 }, { color: "rgba(255, 0, 0, 1)", ratio: 1 } ],
        maxPixelIntensity: 10, minPixelIntensity: 0, radius: 18 
      }
    });
    view.map.add(wfsLayer);
    await view.whenLayerView(wfsLayer);
    const query = wfsLayer.createQuery();
    query.where = "1=1"; query.outFields = ["*"]; query.returnGeometry = true;
    const featureSet = await wfsLayer.queryFeatures(query);
    if (featureSet.features.length > 0) view.goTo(featureSet.features);
  };

  const currentParams = JSON.stringify({ alarmState, days, minDuration, minRepeats, selectedReport });
  const isCached = tableData?.analytics?.filterParams === currentParams;

  const handleActionClick = async () => {
    if (isCached) { setTableVisibility("analytics", true); return; }
    if (!view?.map) return;
    setIsApplying(true); setError(null);
    try {
      const reportData = await fetchAnalyticsData();
      if (reportData.length === 0) { setError("No records found for these criteria."); setIsApplying(false); return; }
      const analyticsFeatures = reportData.map((row, index) => ({ attributes: { ...row, id: index } }));
      addTableData("analytics", "Analytics Report", analyticsFeatures, analyticsColumns[selectedReport] || [], currentParams);
      if (["summaryByAlias"].includes(selectedReport)) await fetchAndRenderHeatmap(reportData);
      setIsFiltered(true);
      setAppliedSummary([ (ANALYTIC_OPTIONS.find((o) => o.value === selectedReport)?.label ?? selectedReport).replace(/^\d+\.\s*/, ""), ALARM_LABELS[alarmState] || `Alarm ${alarmState}`, `last ${days}d`, `>= ${minDuration} min`, `>= ${minRepeats}x` ]);
    } catch (err) { setError(err.message || "Failed to process data."); } finally { setIsApplying(false); }
  };

  const handleClear = () => {
    if (customerLayerView) customerLayerView.filter = null;
    removeWFSLayer();
    removeTableData("analytics"); 
    if (view?.graphics) view.graphics.removeAll();
    setIsFiltered(false); setAppliedSummary(null); setError(null); 
  };

  usePublishFilter({ id: "alarm_analytics", label: "Alarm Analytics", summary: appliedSummary, onClear: handleClear });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {error && (
        <CalciteNotice scale="m" open icon="exclamation-mark-triangle" kind="danger">
          <div slot="message">{error}</div>
        </CalciteNotice>
      )}

      <CalciteLabel scale="m">
        Alarm Type
        <CalciteSelect scale="m" value={alarmState} onCalciteSelectChange={(e) => setAlarmState(e.target.value)} disabled={isApplying}>
          {Object.entries(ALARM_LABELS).map(([val, label]) => (
            <CalciteOption key={val} label={label} value={val} />
          ))}
        </CalciteSelect>
      </CalciteLabel>

      <CalciteLabel scale="m">
        Analysis Report
        <CalciteSelect scale="m" value={selectedReport} onCalciteSelectChange={(e) => setSelectedReport(e.target.value)} disabled={isApplying}>
          {ANALYTIC_OPTIONS.map((opt) => (
            <CalciteOption key={opt.value} label={opt.label} value={opt.value} />
          ))}
        </CalciteSelect>
      </CalciteLabel>

      <div style={{ fontSize: "0.75rem", color: "var(--calcite-ui-text-1)", marginTop: "-0.5rem", marginBottom: "0.5rem", fontStyle: "italic" }}>
        {ANALYTIC_OPTIONS.find(opt => opt.value === selectedReport)?.description}
      </div>

      {selectedReport !== "alarmsByZone" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <CalciteLabel scale="m">
            Time Window (Days)
            <CalciteInput scale="m" type="number" value={String(days)} min={10} max={90} onCalciteInputInput={(e) => setDays(e.target.value)} disabled={isApplying} />
          </CalciteLabel>

          <CalciteLabel scale="m">
            Min Repeats (Count)
            <CalciteInput scale="m" type="number" value={String(minRepeats)} min={2} max={50} onCalciteInputInput={(e) => setMinRepeats(e.target.value)} disabled={isApplying} />
          </CalciteLabel>
        </div>
      )}
      
      {selectedReport !== "alarmsByZone" && (
        <CalciteLabel scale="m">
          Min Outage Duration (Minutes)
          <CalciteInput scale="m" type="number" value={String(minDuration)} min={10} onCalciteInputInput={(e) => setMinDuration(e.target.value)} disabled={isApplying} />
        </CalciteLabel>
      )}
     
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <CalciteButton scale="m" appearance="solid" onClick={handleActionClick} loading={isApplying} style={{ flex: 1 }}>
          {isCached ? "View Table" : "Run Analysis"}
        </CalciteButton>
        <CalciteButton scale="m" onClick={handleClear} appearance="outline" kind="danger" disabled={!isFiltered && !tableData?.analytics} style={{ flex: 1 }}>
          Clear
        </CalciteButton>
      </div>

      {isFiltered && !error && (
        <CalciteNotice scale="m" kind="success" icon="check" open style={{ marginTop: '0.5rem' }}>
          <div slot="message">Filter applied successfully.</div>
        </CalciteNotice>
      )}
    </div>
  );
}