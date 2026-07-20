import React, { useEffect, useMemo, useState } from "react";
import {
  CalciteBlock,
  CalciteButton,
  CalciteLoader,
  CalciteNotice,
  CalciteIcon,
  CalciteList,
  CalciteListItem,
  CalciteChip,
} from "@esri/calcite-components-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useLayers, useMapView } from "../../../context/MapContext";
import { useAuth } from "../../../context/AuthContext";

/**
 * Rolls up currently-active faults (already loaded in layers.Customers_test
 * -- no new backend endpoint needed) into three analyses your dashboard
 * doesn't currently surface anywhere:
 *
 *   1. Duration breakdown -- how long faults have been open, bucketed,
 *      with a called-out SLA-breach bucket (7+ days).
 *   2. Top OLTs / DCs by fault count -- the same 5-10 customers being
 *      down under ONE OLT or DC is a different problem (upstream
 *      equipment) than 5-10 unrelated individual faults, and right now
 *      nothing in the app tells you which one you're looking at.
 *   3. Region comparison -- side-by-side instead of switching tabs.
 *
 * Plus a one-click CSV export of the underlying fault list for reporting.
 */

const DURATION_BUCKETS = [
  { label: "< 1 hour", maxHours: 1 },
  { label: "1 - 6 hours", maxHours: 6 },
  { label: "6 - 24 hours", maxHours: 24 },
  { label: "1 - 3 days", maxHours: 72 },
  { label: "3 - 7 days", maxHours: 168 },
  { label: "7+ days (SLA breach)", maxHours: Infinity },
];

function bucketForHours(hours) {
  for (const b of DURATION_BUCKETS) {
    if (hours <= b.maxHours) return b.label;
  }
  return DURATION_BUCKETS[DURATION_BUCKETS.length - 1].label;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))];
  return lines.join("\n");
}

function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function FaultAnalytics() {
  const { layers } = useLayers();
  const { view } = useMapView();
  const { user } = useAuth();
  const REGIONS = user?.permissions?.regions || [];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [faults, setFaults] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const customerLayer = layers.Customers_test;

  const runAnalysis = async () => {
    if (!customerLayer) return;
    setLoading(true);
    setError(null);
    try {
      const query = customerLayer.createQuery();
      query.where = "alarmstate IN (1,2,3,4)";
      query.outFields = ["id", "region", "olt", "dc_id", "alarmstate", "lastdowntime", "fault_time", "service_tier"];
      query.returnGeometry = false;
      const result = await customerLayer.queryFeatures(query);
      setFaults(result.features.map((f) => f.attributes));
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Fault analysis query failed:", err);
      setError("Failed to load fault data for analysis.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (customerLayer) runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerLayer]);

  const analysis = useMemo(() => {
    const now = Date.now();

    const bucketCounts = Object.fromEntries(DURATION_BUCKETS.map((b) => [b.label, 0]));
    faults.forEach((f) => {
      const start = f.fault_time || f.lastdowntime;
      if (!start) return;
      const hours = (now - new Date(start).getTime()) / (1000 * 60 * 60);
      if (hours < 0) return;
      bucketCounts[bucketForHours(hours)]++;
    });
    const durationChartData = DURATION_BUCKETS.map((b) => ({ name: b.label, count: bucketCounts[b.label] }));

    const oltCounts = {};
    faults.forEach((f) => { if (f.olt) oltCounts[f.olt] = (oltCounts[f.olt] || 0) + 1; });
    const topOlts = Object.entries(oltCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const dcCounts = {};
    faults.forEach((f) => { if (f.dc_id) dcCounts[f.dc_id] = (dcCounts[f.dc_id] || 0) + 1; });
    const topDcs = Object.entries(dcCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const regionCounts = {};
    REGIONS.forEach((r) => (regionCounts[r] = 0));
    faults.forEach((f) => { if (f.region && regionCounts[f.region] !== undefined) regionCounts[f.region]++; });

    const slaBreaches = bucketCounts["7+ days (SLA breach)"] || 0;

    return { durationChartData, topOlts, topDcs, regionCounts, slaBreaches, total: faults.length };
  }, [faults, REGIONS]);

  const handleExportCsv = () => {
    downloadCsv(`fault-analysis-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(faults));
  };

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <CalciteLoader label="Analyzing faults" active scale="m" />
      </div>
    );
  }

  if (error) {
    return (
      <CalciteNotice open kind="danger" icon="exclamation-mark-triangle">
        <div slot="message">{error}</div>
      </CalciteNotice>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--calcite-ui-text-2)" }}>
          {faults.length} active faults{lastUpdated && ` \u2022 as of ${lastUpdated.toLocaleTimeString()}`}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <CalciteButton scale="s" appearance="outline" iconStart="refresh" onClick={runAnalysis}>Refresh</CalciteButton>
          <CalciteButton scale="s" appearance="outline" iconStart="export" onClick={handleExportCsv} disabled={faults.length === 0}>
            Export CSV
          </CalciteButton>
        </div>
      </div>

      {analysis.slaBreaches > 0 && (
        <CalciteNotice open kind="danger" icon="exclamation-mark-triangle" scale="s">
          <div slot="title">{analysis.slaBreaches} fault{analysis.slaBreaches > 1 ? "s" : ""} open 7+ days</div>
          <div slot="message">These are SLA breaches and should be prioritized.</div>
        </CalciteNotice>
      )}

      <CalciteBlock heading="Fault Duration Breakdown" open collapsible scale="s">
        <div slot="icon"><CalciteIcon icon="clock" scale="s" /></div>
        <div style={{ height: "200px", padding: "8px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analysis.durationChartData} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {analysis.durationChartData.map((entry, i) => (
                  <Cell key={i} fill={i === analysis.durationChartData.length - 1 ? "#ef4444" : "#3b82f6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CalciteBlock>

      <CalciteBlock heading="Top OLTs by Fault Count" open collapsible scale="s">
        <div slot="icon"><CalciteIcon icon="urban-model" scale="s" /></div>
        <CalciteList selectionMode="none">
          {analysis.topOlts.length === 0 ? (
            <CalciteListItem label="No data" description="No faulted OLTs found." />
          ) : (
            analysis.topOlts.map(([olt, count]) => (
              <CalciteListItem key={olt} label={olt} description={`${count} customer${count > 1 ? "s" : ""} affected`}>
                <CalciteChip slot="content-end" scale="s" kind={count >= 5 ? "danger" : "warning"}>{count}</CalciteChip>
              </CalciteListItem>
            ))
          )}
        </CalciteList>
        {analysis.topOlts[0]?.[1] >= 5 && (
          <CalciteNotice open kind="warning" icon="light-bulb" scale="s" style={{ margin: "8px" }}>
            <div slot="message">
              {analysis.topOlts[0][1]} customers down on OLT "{analysis.topOlts[0][0]}" \u2014 this pattern suggests an
              upstream OLT-level issue rather than {analysis.topOlts[0][1]} separate faults.
            </div>
          </CalciteNotice>
        )}
      </CalciteBlock>

      <CalciteBlock heading="Top DCs / ODBs by Fault Count" open collapsible scale="s">
        <div slot="icon"><CalciteIcon icon="organization" scale="s" /></div>
        <CalciteList selectionMode="none">
          {analysis.topDcs.length === 0 ? (
            <CalciteListItem label="No data" description="No faulted DCs found." />
          ) : (
            analysis.topDcs.map(([dc, count]) => (
              <CalciteListItem key={dc} label={dc} description={`${count} customer${count > 1 ? "s" : ""} affected`}>
                <CalciteChip slot="content-end" scale="s" kind={count >= 5 ? "danger" : "warning"}>{count}</CalciteChip>
              </CalciteListItem>
            ))
          )}
        </CalciteList>
      </CalciteBlock>

      <CalciteBlock heading="Region Comparison" open collapsible scale="s">
        <div slot="icon"><CalciteIcon icon="organization" scale="s" /></div>
        <CalciteList selectionMode="none">
          {Object.entries(analysis.regionCounts).map(([region, count]) => (
            <CalciteListItem key={region} label={region} description={`${count} active fault${count !== 1 ? "s" : ""}`}>
              <CalciteChip slot="content-end" scale="s">{count}</CalciteChip>
            </CalciteListItem>
          ))}
        </CalciteList>
      </CalciteBlock>
    </div>
  );
}