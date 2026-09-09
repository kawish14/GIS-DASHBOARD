// src/map_items/widgets/customer/AnalyticsRecordPopup.jsx
//
// Popup for a single row produced by AlarmAnalyticsFilter (summaryByAlias or
// summaryByPort). Mirrors the visual language of CustomerDetails.jsx (same
// NATIVE/SURFACE tokens, dashboard-strip + collapsible block layout) so it
// feels like the same app rather than a bolted-on table tooltip.
//
// Usage:
//   <AnalyticsRecordPopup record={row} reportType={selectedReport} />
//
// Wire it up either as:
//   1. The click handler for a row in the results table that
//      AlarmAnalyticsFilter feeds via setSelectedFeatures, or
//   2. A PopupTemplate.content function on the WFS heatmap layer, e.g.
//        wfsLayer.popupTemplate = {
//          title: "{alias}",
//          content: (event) => renderToDomNode(
//            <AnalyticsRecordPopup record={event.graphic.attributes} reportType={selectedReport} />
//          )
//        };
//      (swap renderToDomNode for whatever mount helper the app already uses
//      for React-in-ArcGIS-popup content).

import React, { useState } from "react";
import {
  CalciteList,
  CalciteListItem,
  CalciteChip,
  CalciteLoader,
  CalciteNotice,
  CalciteIcon,
  CalciteBlock,
} from "@esri/calcite-components-react";
import { authenticate } from "../../../../url";

// --- Color / Threshold Config (kept identical to CustomerDetails.jsx) ---
const NATIVE = {
  divider: "#e0e0e0",
  label: "#efecec",
  nan: "#9e9e9e",
  alarm: "#df181f",
  warn: "#ff8c00",
  ok: "#08d812",
};

const SURFACE = {
  panelBg: "linear-gradient(180deg, #2b2b2b, #2b2b2b, 100%)",
  cardBg: "#2b2b2b",
  border: NATIVE.divider,
  label: NATIVE.label,
  shadow: "0 1px 2px rgba(0,0,0,0.04)",
};

// Tune these against real distribution once you have a feel for typical
// repeat counts / downtime in the dataset — these are placeholders.
const REPEAT_THRESHOLDS = { warn: 3, alarm: 6 };
const DURATION_THRESHOLDS = { warn: 60, alarm: 240 }; // minutes

function repeatColor(count) {
  const n = Number(count);
  if (isNaN(n)) return NATIVE.nan;
  if (n >= REPEAT_THRESHOLDS.alarm) return NATIVE.alarm;
  if (n >= REPEAT_THRESHOLDS.warn) return NATIVE.warn;
  return NATIVE.ok;
}

function durationColor(minutes) {
  const n = Number(minutes);
  if (isNaN(n)) return NATIVE.nan;
  if (n >= DURATION_THRESHOLDS.alarm) return NATIVE.alarm;
  if (n >= DURATION_THRESHOLDS.warn) return NATIVE.warn;
  return NATIVE.ok;
}

function fmtMinutes(mins) {
  const n = Number(mins);
  if (isNaN(n)) return "---";
  if (n < 60) return `${n.toFixed(0)}m`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return `${h}h ${m}m`;
}

function fmtDate(v) {
  if (!v) return "N/A";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function buildMetrics(record, reportType) {
  if (reportType === "summaryByPort") {
    return [
      { label: "Occurrences", value: record.occurrences ?? "N/A", color: repeatColor(record.occurrences) },
      { label: "Port Downtime", value: fmtMinutes(record.port_down_minutes), color: durationColor(record.port_down_minutes) },
    ];
  }
  // summaryByAlias (default)
  return [
    { label: "Total Occurrences", value: record.total_occurrences ?? "N/A", color: repeatColor(record.total_occurrences) },
    { label: "Total Downtime", value: fmtMinutes(record.total_down_minutes), color: durationColor(record.total_down_minutes) },
    { label: "Avg Downtime", value: fmtMinutes(record.avg_down_minutes), color: durationColor(record.avg_down_minutes) },
  ];
}

const FIELD_GROUPS = {
  summaryByAlias: [
    { key: "alias", label: "Alias", group: "Identity" },
    { key: "first_alarm", label: "First Alarm", group: "Timeline", fmt: fmtDate },
    { key: "last_alarm", label: "Last Alarm", group: "Timeline", fmt: fmtDate },
  ],
  summaryByPort: [
    { key: "alias", label: "Alias", group: "Identity" },
    { key: "fault_olt", label: "OLT", group: "Location" },
    { key: "fault_frame", label: "Frame", group: "Location" },
    { key: "fault_slot", label: "Slot", group: "Location" },
    { key: "fault_port", label: "Port", group: "Location" },
  ],
};

export default function AnalyticsRecordPopup({ record, reportType = "summaryByAlias" }) {
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const metrics = buildMetrics(record, reportType);
  const fields = FIELD_GROUPS[reportType] || FIELD_GROUPS.summaryByAlias;

  const toggleHistory = async () => {
    const next = !expanded;
    setExpanded(next);
    if (!next || history || historyLoading || !record.alias) return;

    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const res = await fetch(
        `${authenticate}/nce/nce-history/customer/${encodeURIComponent(record.alias)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Request failed");
      const rows = await res.json();
      setHistory(rows);
    } catch (err) {
      console.error("Error loading outage history:", err);
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  };

  const repeatCount = record.total_occurrences ?? record.occurrences ?? 0;
  const headerColor = repeatColor(repeatCount);

  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: "var(--calcite-sans-family, inherit)" }}>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", padding: "0.85rem 1rem 0.5rem", background: SURFACE.panelBg }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: SURFACE.label }}>
              Customer Alias
            </div>
            <div style={{ fontSize: "1rem", fontWeight: 700, fontFamily: "var(--calcite-mono-family, monospace)", color: "#009af2", lineHeight: 1.3 }}>
              {record.alias ?? "N/A"}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <CalciteIcon icon="exclamation-mark-triangle" scale="s" style={{ color: headerColor }} />
            <span style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: headerColor }}>
              {repeatCount} repeat{repeatCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {/* Metric strip */}
      <div style={{ padding: "0 1rem 1rem", background: SURFACE.panelBg }}>
        <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: SURFACE.label, marginBottom: "0.75rem", borderBottom: `1px solid ${SURFACE.border}`, paddingBottom: "0.25rem" }}>
          Outage Summary
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
          {metrics.map((m) => (
            <div key={m.label} style={{ background: SURFACE.cardBg, border: `1px solid ${SURFACE.border}`, borderLeft: `3px solid ${m.color}`, borderRadius: "5px", padding: "0.5rem", boxShadow: SURFACE.shadow, display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: SURFACE.label, whiteSpace: "nowrap" }}>
                {m.label}
              </div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: m.color }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Identity / location fields */}
      <div style={{ background: SURFACE.panelBg }}>
        <CalciteBlock scale="s" open heading="Details">
          <CalciteList>
            {fields.map((f) => (
              <CalciteListItem key={f.key} scale="s" label={f.label} description={f.group}>
                <span slot="content-end" style={{ fontWeight: "bold", fontSize: "0.75rem", color: "var(--calcite-ui-text-2)" }}>
                  {f.fmt ? f.fmt(record[f.key]) : record[f.key] ?? "N/A"}
                </span>
              </CalciteListItem>
            ))}
          </CalciteList>
        </CalciteBlock>

        {/* Expandable outage history - fetched lazily on first expand */}
        {record.alias && (
          <CalciteBlock scale="s" heading="Individual Outages" collapsible open={expanded} onCalciteBlockToggle={toggleHistory}>
            {historyLoading && (
              <div style={{ padding: "1rem 0", display: "flex", justifyContent: "center" }}>
                <CalciteLoader label="Loading outage history..." scale="s" active inline />
              </div>
            )}
            {historyError && (
              <CalciteNotice kind="danger" icon="exclamation-mark-circle" open scale="s">
                <div slot="title">Could not load history</div>
              </CalciteNotice>
            )}
            {history && history.length === 0 && (
              <CalciteNotice kind="neutral" icon="information" open scale="s">
                <div slot="message">No individual outage records found.</div>
              </CalciteNotice>
            )}
            {history && history.length > 0 && (
              <CalciteList>
                {history.map((h, idx) => (
                  <CalciteListItem key={idx} scale="s" label={fmtDate(h.fault_time)} description={h.alarminfo || "LOP"}>
                    <CalciteChip
                      slot="content-end"
                      scale="s"
                      style={{ "--calcite-chip-background-color": h.fault_time_clear ? NATIVE.ok : NATIVE.alarm }}
                    >
                      {h.fault_time_clear ? fmtMinutes(h.outage_duration) : "Ongoing"}
                    </CalciteChip>
                  </CalciteListItem>
                ))}
              </CalciteList>
            )}
          </CalciteBlock>
        )}
      </div>
    </div>
  );
}