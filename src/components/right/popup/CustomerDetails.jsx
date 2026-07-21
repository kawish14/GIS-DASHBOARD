import React, { useEffect, useState } from "react";
import { Realtime } from "../../../../url";
import {
  CalciteList,
  CalciteListItem,
  CalciteChip,
  CalciteLoader,
  CalciteNotice,
  CalciteIcon,
  CalciteBlock,
  CalciteAction,
  CalciteAlert
} from "@esri/calcite-components-react";
import { api } from "../../../../url";
import { useMapView, useLayers, usePopup } from "../../../context/MapContext";
import { escapeForCql } from "../../../constants/faultCodes";

// --- Color / Threshold Config ---
const NATIVE = {
  divider: "#e0e0e0",
  label: "#efecec",
  heading: "#efecec",
  nan: "#9e9e9e",
  alarm: "#df181f", // Esri "red" used in default popup charts/alerts
  warn: "#ff8c00", // Esri "orange"
  ok: "#08d812", // Esri "green"
};

// Surface tokens for the dashboard chrome (backgrounds, borders, body text).
// Set to the light/white card design. NOTE: severity colors
// (NATIVE.alarm/warn/ok) are unaffected by this -- only chrome/background/
// text tokens live here.
const SURFACE = {
  panelBg: "linear-gradient(180deg, #2b2b2b, #2b2b2b, 100%)",
  cardBg: "#2b2b2b",
  border: NATIVE.divider,
  label: NATIVE.label,
  heading: NATIVE.heading,
  shadow: "0 1px 2px rgba(0,0,0,0.04)",
};

// Real device alarm/warning thresholds (from ONU optical module spec)
const THRESHOLDS = {
  temp: { alarmLow: -10, alarmHigh: 100, warnLow: 0, warnHigh: 70 },
  bias: { alarmLow: 0, alarmHigh: 70, warnLow: 1, warnHigh: 30 },
  tx: { alarmLow: -1, alarmHigh: 7, warnLow: 0, warnHigh: 6 },
  rx: { alarmLow: -27, alarmHigh: -6, warnLow: -26, warnHigh: -8 },
  voltage: { alarmLow: 2.97, alarmHigh: 3.63, warnLow: 3.14, warnHigh: 3.47 },
};

// Returns the appropriate status color for a numeric metric given its thresholds
function severityColor(value, t) {
  if (isNaN(value)) return NATIVE.nan;
  if (value <= t.alarmLow || value >= t.alarmHigh) return NATIVE.alarm;
  if (value <= t.warnLow || value >= t.warnHigh) return NATIVE.warn;
  return NATIVE.ok;
}

// --- 1. System Status Logic ---
const getSystemStatus = (alarmstate) => {
  const state = parseInt(alarmstate, 10);

  if (state === 0) {
    return {
      kind: "success",
      icon: "check-circle",
      label: "Fault Cleared",
      isUp: true
    };
  }

  if (state === 1 || state === 2) {
    return {
      kind: "danger",
      icon: "exclamation-mark-triangle",
      label: "Fault Detected",
      isUp: false
    };
  }

  if (state === 3 || state === 4) {
    return {
      kind: "warning",
      icon: "exclamation-mark-circle",
      label: "Fault Detected",
      isUp: true
    };
  }

  return {
    kind: "neutral",
    icon: "question",
    label: "Unknown State",
    isUp: false
  };
};

// --- 2. Power Logic (Thresholds) ---
const optical_threshold = (data) => {
  if (!data) return {
    ontText: "---", oltText: "---",
    ontKind: NATIVE.nan, oltKind: NATIVE.nan,
    txPowerText: "---", txVolText: "---", tempText: "---", biasText: "---",
    txPowerKind: NATIVE.nan, txVolKind: NATIVE.nan, tempKind: NATIVE.nan, biasKind: NATIVE.nan
  };

  const ontPower = data.opticsrxpower / 100;
  const oltPower = data.opticsrxpowerbyolt / 100;
  const txPower = data.opticstxpower !== undefined ? Number((data.opticstxpower / 100).toFixed(2)) : NaN;
  const txVol = data.opticstxvol !== undefined ? Number((data.opticstxvol / 1000).toFixed(2)) : NaN;
  const temp = data.opticstxtemp !== undefined ? Number(data.opticstxtemp) : NaN;
  const bias = data.opticstxbiascurr !== undefined ? Number(data.opticstxbiascurr) : NaN;

  return {
    ontText: isNaN(ontPower) ? "---" : `${ontPower.toFixed(2)} dBm`,
    oltText: isNaN(oltPower) ? "---" : `${oltPower.toFixed(2)} dBm`,
    ontKind: severityColor(ontPower, THRESHOLDS.rx),
    oltKind: severityColor(oltPower, THRESHOLDS.rx),
    txPowerText: isNaN(txPower) ? "---" : `${txPower.toFixed(2)} dBm`,
    txVolText: isNaN(txVol) ? "---" : `${txVol.toFixed(2)} V`,
    tempText: isNaN(temp) ? "---" : `${temp.toFixed(1)} °C`,
    biasText: isNaN(bias) ? "---" : `${bias.toFixed(2)} mA`,
    txPowerKind: severityColor(txPower, THRESHOLDS.tx),
    txVolKind: severityColor(txVol, THRESHOLDS.voltage),
    tempKind: severityColor(temp, THRESHOLDS.temp),
    biasKind: severityColor(bias, THRESHOLDS.bias)
  };
};

// BUG FIX: this used to be computed once from the feature's attributes at
// render time with no ticking clock, so the "Duration" chip in the UI froze
// at whatever value it had the moment the panel opened. It's now recomputed
// every second via the interval in the component below.
const getFaultDuration = (faultTime, category) => {
  if (!faultTime || category !== "fault") return null;

  const diff = new Date() - new Date(faultTime);
  if (diff <= 0) return "Just started";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const sec = Math.floor((diff % (1000 * 60)) / 1000);
  return days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m ${sec}s`;
};

// --- Fields Configuration ---
const fieldsToDisplay = [
  { key: "id", label: "ID", group: "Demographics" },
  { key: "name", label: "Name", group: "Demographics" },
  { key: "city", label: "City", group: "Demographics" },
  { key: "region", label: "Region", group: "Demographics" },
  { key: "area_town", label: "Area / Town", group: "Demographics" },
  { key: "sub_area", label: "Sub Area", group: "Demographics" },
  { key: "type", label: "Type", group: "Demographics" },

  { key: "olt", label: "OLT", group: "Active Infrastructure" },
  { key: "frame", label: "Frame", group: "Active Infrastructure" },
  { key: "slot", label: "Slot", group: "Active Infrastructure" },
  { key: "port", label: "Port", group: "Active Infrastructure" },
  { key: "ontid", label: "ONT", group: "Active Infrastructure" },

  { key: "dc_id", label: "DC / ODB", group: "Passive Elements", isLink: true },

  { key: "alarminfo", label: "Current Alarm", group: "Diagnostics" },
  { key: "lastDownCause", label: "Last Down Cause", group: "Diagnostics" },
  { key: "lastdowntime", label: "Down Time", group: "Diagnostics" },
  { key: "lastuptime", label: "Up Time", group: "Diagnostics" },

  { key: "ontText", label: "Rx Power (ONT)", group: "Signal Performance", highlight: true },
  { key: "oltText", label: "Rx Power (OLT)", group: "Signal Performance", highlight: true },
  { key: "txPowerText", label: "Tx Power", group: "Signal Performance", highlight: true },
  { key: "txVolText", label: "Tx Voltage", group: "Signal Performance", highlight: true },
  { key: "tempText", label: "Tx Temperature", group: "Signal Performance", highlight: true },
  { key: "biasText", label: "Tx Bias Current", group: "Signal Performance", highlight: true },
];



export default function CustomerDetails({ feature }) {
  const { view } = useMapView();
  const { layers } = useLayers();
  const { pushSelection } = usePopup();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [alertOpen, setAlertOpen] = useState(false);

  // Initial Data
  const initialAttr = feature.attributes;
  const status = getSystemStatus(initialAttr.alarmstate);

  // Live-ticking duration: recomputed every second, and driven by the
  // freshest fault_time we have (fetched `data`, falling back to the
  // feature's initial attributes before the fetch resolves).
  const faultTime = data?.fault_time ?? initialAttr.fault_time;
  const faultCategory = data?.category ?? initialAttr.category;
  const durationStr = getFaultDuration(faultTime, faultCategory);

  useEffect(() => {
    if (!faultTime || faultCategory !== "fault") return;
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [faultTime, faultCategory]);
  // `now` itself isn't read directly -- setting it just forces a re-render
  // so getFaultDuration() re-evaluates against the current time each tick.
  void now;

  const handleDcClick = async (dc_id) => {
    if (!view || !layers || !layers.dc_odb) {
        console.error("DC Layer not found");
        return;
    }

    try {
        const dcLayer = layers.dc_odb;
        const query = dcLayer.createQuery();
        query.where = `id = '${escapeForCql(dc_id)}'`;
        query.returnGeometry = true;
        query.outFields = ["*"];

        const results = await dcLayer.queryFeatures(query);

        if (results.features.length > 0) {
            const dcFeature = results.features[0];
            dcFeature.layer = dcLayer;

            view.goTo({ target: dcFeature, zoom: 17 });
            pushSelection(dcFeature, { label: "DC" });
            dcLayer.visible = true;
        } else {
            console.warn("DC not found with ID:", dc_id);
        }
    } catch (err) {
        console.error("Error finding DC:", err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(false);
      try {
        const id = feature.attributes.id;

        const geoServerUrl = `${api}/geoserver/web_app/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=web_app%3ACustomers_test&outputFormat=application%2Fjson&CQL_FILTER=id='${encodeURIComponent(escapeForCql(id))}'`;
        const geoRes = await fetch(geoServerUrl);
        const geoData = await geoRes.json();

        if (!geoData.features?.length) throw new Error("No feature found");
        const fresh = geoData.features[0].properties;

        const powerParams = new URLSearchParams({
          olt: fresh.olt, fn: fresh.frame, sn: fresh.slot, pn: fresh.port, ontid: fresh.ontid,
        }).toString();

        const powerRes = await fetch(`${Realtime}/api/get-power?${powerParams}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
        });
        const powerResult = await powerRes.json();

        const powerInfo = optical_threshold(powerResult.data?.[0]);

        if (isMounted) setData({ ...fresh, _powerInfo: powerInfo });
      } catch (err) {
        console.error("Details Fetch Error", err);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (feature.attributes.id) fetchData();
    return () => { isMounted = false; };
  }, [feature]);

  // --- Render Item ---
  const renderItem = (field) => {
    if (!data) return null;

    let val = data[field.key] ?? data[field.key.toLowerCase()] ?? "N/A";

    let chipColor = "neutral";
    let chipText = 'var(--calcite-ui-text-2)';
    let isChip = false;
    let icon = null;

    if (field.highlight) {
       isChip = true;
       icon = "graph-time-series";
       // field.key is the *Text value (e.g. "txPowerText"); its matching
       // classification lives under the same prefix + "Kind" (e.g. "txPowerKind").
       // These Kind values are now real hex colors from severityColor(), not
       // the old "red"/"green"/"neutral" keyword strings.
       const kindKey = field.key.replace(/Text$/, "Kind");
       val = data._powerInfo[field.key];
       chipColor = data._powerInfo[kindKey] ?? NATIVE.nan;
    }
    else if (field.key === "alarminfo") {
        isChip = true;
        if (["LOS", "Linked Down"].includes(val)) chipColor = "red";
        else if (val === "Power Off") chipColor = "blue";
        else if (val === "GEM Packet Loss") chipColor = "black";
        else if (val === "LOP") { chipColor = "yellow"; chipText = "black"; }
        else chipColor = "neutral";
    }
    else if (field.key === "fault_time" && val && val !== "N/A") {
        isChip = true;
        chipColor = "red";
        chipText = " ";
    }

    const selectionStyle = {
        userSelect: "text",
        WebkitUserSelect: "text",
        cursor: "text"
    };

    return (
      <CalciteListItem
        key={field.key}
        scale="s"
        label={field.label}
        description={field.group || null}
      >
        <div slot="content-end"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
                alignSelf: 'stretch',
                display: 'flex',
                alignItems: 'center',
                borderLeft: '1px solid var(--calcite-ui-text-3)',
                paddingLeft: '0.75rem',
                marginLeft: '0.5rem',
                width: "8.5vw",
                marginTop: '-1rem',
                marginBottom: '-1rem',
                paddingTop: '1rem',
                paddingBottom: '1rem'
              }}
             >
            {isChip ? (
                <CalciteChip
                    scale="s"
                    icon={icon}
                    style={{
                      ...selectionStyle,
                      ...(chipColor === "yellow" ? {
                                "--calcite-chip-background-color": chipColor,
                                "--calcite-chip-text-color" : chipText
                                }
                      :
                      {  "--calcite-chip-background-color": chipColor})
                    }}
                >
                    {val}
                </CalciteChip>
            ) : (
                <span style={{
                    ...selectionStyle,
                    fontWeight:"bold" ,
                    fontSize: "0.75rem",
                    color: chipText ? chipText : "var(--calcite-ui-text-2)",
                    marginRight: field.isLink ? "8px" : "0"
                    }}
                    >
                    {val}
                  </span>
            )}

            {field.isLink && val !== "N/A" && (
                <CalciteAction
                  scale="s"
                  icon="launch"
                  title="Go to DC"
                  text="Go to DC"
                  onClick={() => handleDcClick(val)}
                  style={{ marginRight: "-8px" }}
                />
            )}
        </div>
      </CalciteListItem>
    );
  };

  // --- Strict Target Logic: Match Warning ONLY if it's an LOP Alarm State ---
  const currentAlarmState = parseInt(data?.alarmstate ?? feature.attributes.alarmstate, 10);
  const checkSeverity = data?.perceived_severity ?? feature.attributes.perceived_severity;

  // Must be alarmstate 4 AND have 'warning' string value
  const isWarningSeverity = currentAlarmState === 4 && checkSeverity?.toString().toLowerCase() === "warning";

  // --- Optical Dashboard: pulled straight out of _powerInfo so it can be
  // rendered as its own strip above the grouped field list, independent of
  // fieldsToDisplay's Signal Performance group (which is filtered out below
  // to avoid showing these values twice).
  const opticalMetrics = data ? [
    { key: "ontText", label: "Rx Power (ONT)", value: data._powerInfo.ontText, color: data._powerInfo.ontKind },
    { key: "oltText", label: "Rx Power (OLT)", value: data._powerInfo.oltText, color: data._powerInfo.oltKind },
    { key: "txPowerText", label: "Tx Power", value: data._powerInfo.txPowerText, color: data._powerInfo.txPowerKind },
    { key: "txVolText", label: "Tx Voltage", value: data._powerInfo.txVolText, color: data._powerInfo.txVolKind },
    { key: "tempText", label: "Tx Temperature", value: data._powerInfo.tempText, color: data._powerInfo.tempKind },
    { key: "biasText", label: "Tx Bias Current", value: data._powerInfo.biasText, color: data._powerInfo.biasKind },
  ] : [];

  const handleCopy = (e) => {
    e.stopPropagation();
    const idToCopy = feature.attributes.id?.toString();
    if (!idToCopy) return;

    // Use modern clipboard API if on HTTPS or localhost
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(idToCopy);
    } else {
      // Fallback for standard HTTP (like 172.29.x.x)
      const textArea = document.createElement("textarea");
      textArea.value = idToCopy;
      textArea.style.position = "absolute";
      textArea.style.left = "-999999px";
      document.body.prepend(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error("Fallback copy failed", err);
      } finally {
        textArea.remove();
      }
    }

    // Trigger Alert for 3 seconds
    setAlertOpen(true);
    setTimeout(() => setAlertOpen(false), 3000);
  };
  
  return (
    <div
      scale="s"
      style={{
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--calcite-sans-family, inherit)",
      }}
    >

    <CalciteAlert
        open={alertOpen ? true : undefined}
        icon="check-circle"
        kind="success"
        label="Copied"
        placement="top"
        scale="s"
      >
        <div slot="title">Copied!</div>
        <div slot="message">Customer ID copied to clipboard.</div>
      </CalciteAlert>

      {/* 0. Identity + Optical Dashboard -- always leads, regardless of fetch state */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "0.85rem 1rem 1rem",
          background: SURFACE.panelBg,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "0.75rem",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.62rem",
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: SURFACE.label,
              }}
            >
              Customer ID
            </div>
            
            {/* NEW: Flex container to hold the ID and the Copy Icon */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  fontFamily: "var(--calcite-mono-family, monospace)",
                  color: "var(--calcite-ui-text-2)",
                  lineHeight: 1.3,
                }}
              >
                {feature.attributes.id ?? "N/A"}
              </div>
              
              {/* Copy Action Button */}
              {feature.attributes.id && (
                <CalciteAction
                  icon="copy-to-clipboard"
                  text="Copy ID"
                  scale="s"
                  appearance="transparent"
                  onClick={handleCopy}
                />
              )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "2px",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <CalciteIcon
                icon={status.icon}
                scale="s"
                style={{ color: `var(--calcite-ui-${status.kind})` }}
              />
              <span
                style={{
                  fontSize: "0.66rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: status.isUp ? NATIVE.ok : NATIVE.alarm,
                }}
              >
                {status.label}
              </span>
            </div>
            {faultTime && (
              <span style={{ fontSize: "0.62rem", color: SURFACE.label }}>
                {faultTime}
              </span>
            )}
          </div>
        </div>

        {/* Duration Notice (Only if Faulty) */}
        {status.kind !== "success" && durationStr && (
          <CalciteNotice
            scale="s"
            kind={status.kind}
            icon="clock"
            open
            width="full"
            style={{ marginBottom: "0.75rem" }}
          >
            <div slot="title">Duration</div>

            <div
              slot="message"
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <CalciteChip
                scale="s"
                style={{ "--calcite-chip-background-color": "#b70404" }}
              >
                {durationStr}
              </CalciteChip>

              {/* Tag renders strictly when it is an LOP (4) Warning */}
              {isWarningSeverity && (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    color: "#ff8c00",
                    fontWeight: "bold",
                    fontSize: "0.70rem",
                    padding: "0.15rem 0.6rem",
                  }}
                >
                  <CalciteIcon icon="exclamation-mark-triangle" scale="s" />
                  WARNING
                </span>
              )}
            </div>
          </CalciteNotice>
        )}

        {/* Unified Loading / Error / Data State */}
       {/* Unified Loading / Error / Data State */}
        {loading ? (
          <div style={{ padding: "1.25rem", textAlign: "center" }}>
            <CalciteLoader label="Loading customer details..." scale="s" />
          </div>
        ) : error ? (
          <CalciteNotice
            kind="danger"
            icon="exclamation-mark-circle"
            open
            scale="s"
          >
            <div slot="title">Data Sync Error</div>
            <div slot="message">Could not retrieve live diagnostics.</div>
          </CalciteNotice>
        ) : (
          <>
            {/* The 2-Column Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)", 
                gap: "0.5rem",
              }}
            >
              {opticalMetrics.map((m) => {
                return (
                  <div
                    key={m.key}
                    style={{
                      background: SURFACE.cardBg,
                      border: `1px solid ${SURFACE.border}`,
                      borderLeft: `3px solid ${m.color}`,
                      borderRadius: "5px",
                      padding: "0.5rem",
                      boxShadow: SURFACE.shadow,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: "6px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.58rem",
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                        color: SURFACE.label,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.label}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        fontFamily: "var(--calcite-sans-family, sans-serif)",
                        color: m.color,
                        padding: "0.15rem 0.6rem",
                        borderRadius: "50px",
                        display: "inline-block",
                      }}
                    >
                      {m.value}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* NEW: Optical Metrics Legend */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "1.25rem",
                marginTop: "0.75rem",
                paddingTop: "0.65rem",
                borderTop: `1px solid ${SURFACE.border}`, // Adds a subtle visual divider
              }}
            >
              {[
                { label: "Normal", color: NATIVE.ok },
                { label: "Warning", color: NATIVE.warn },
                { label: "Alarm", color: NATIVE.alarm },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div 
                    style={{ 
                      width: "8px", 
                      height: "8px", 
                      borderRadius: "50%", 
                      backgroundColor: item.color 
                    }} 
                  />
                  <span
                    style={{
                      fontSize: "0.58rem",
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                      color: SURFACE.label,
                    }}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 1. Remaining Details Block */}
      {/* ONLY render this block when we are completely done loading and have no errors */}
      {!loading && !error && (
        <CalciteBlock scale="s" open>
          <CalciteList>
            {fieldsToDisplay
              .filter((f) => f.key !== "id" && !f.highlight)
              .map(renderItem)}
          </CalciteList>
        </CalciteBlock>
      )}
    </div>
  );
}