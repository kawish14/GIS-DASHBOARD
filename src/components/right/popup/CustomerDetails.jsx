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
  alarm: "#df181f",
  warn: "#ff8c00",
  ok: "#08d812",
};

const SURFACE = {
  panelBg: "linear-gradient(180deg, #2b2b2b, #2b2b2b, 100%)",
  cardBg: "#2b2b2b",
  border: NATIVE.divider,
  label: NATIVE.label,
  heading: NATIVE.heading,
  shadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const THRESHOLDS = {
  temp: { alarmLow: -10, alarmHigh: 100, warnLow: 0, warnHigh: 70 },
  bias: { alarmLow: 0, alarmHigh: 70, warnLow: 1, warnHigh: 30 },
  tx: { alarmLow: -1, alarmHigh: 7, warnLow: 0, warnHigh: 6 },
  rx: { alarmLow: -27, alarmHigh: -6, warnLow: -26, warnHigh: -8 },
  voltage: { alarmLow: 2.97, alarmHigh: 3.63, warnLow: 3.14, warnHigh: 3.47 },
};

function severityColor(value, t) {
  if (isNaN(value)) return NATIVE.nan;
  if (value <= t.alarmLow || value >= t.alarmHigh) return NATIVE.alarm;
  if (value <= t.warnLow || value >= t.warnHigh) return NATIVE.warn;
  return NATIVE.ok;
}

const getSystemStatus = (alarmstate) => {
  const state = parseInt(alarmstate, 10);
  if (state === 0) return { kind: "success", icon: "check-circle", label: "Fault Cleared", isUp: true };
  if (state === 1 || state === 2) return { kind: "danger", icon: "exclamation-mark-triangle", label: "Fault Detected", isUp: false };
  if (state === 3 || state === 4) return { kind: "warning", icon: "exclamation-mark-circle", label: "Fault Detected", isUp: true };
  return { kind: "neutral", icon: "question", label: "Unknown State", isUp: false };
};

// Extracts just the value from strings like "TypeID= '123'" or "TypeID='ABC'"
const extractTypeId = (rawText) => {
  if (!rawText) return "N/A";
  const match = rawText.match(/TypeID\s*=\s*['"]?([^'"]+)['"]?/i);
  return match ? match[1] : rawText;
};

const optical_threshold = (data) => {
  if (!data) return {
    ontText: "---", oltText: "---", ontKind: NATIVE.nan, oltKind: NATIVE.nan,
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
  { key: "lastdowncause", label: "Last Down Cause", group: "Diagnostics" },
  { key: "lastdowntime", label: "Down Time", group: "Diagnostics" },
  { key: "lastuptime", label: "Up Time", group: "Diagnostics" },
];

export default function CustomerDetails({ feature }) {
  const { view } = useMapView();
  const { layers } = useLayers();
  const { pushSelection } = usePopup();

  const [data, setData] = useState(feature.attributes);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  const [powerInfo, setPowerInfo] = useState(null);
  const [powerLoading, setPowerLoading] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  const [alertOpen, setAlertOpen] = useState(false);

  const currentAlarmState = parseInt(data.alarmstate, 10);
  const status = getSystemStatus(currentAlarmState);
  const faultTime = data?.fault_time;
  const faultCategory = data?.category;
  const durationStr = getFaultDuration(faultTime, faultCategory);

  useEffect(() => {
    if (!faultTime || faultCategory !== "fault") return;
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [faultTime, faultCategory]);
  void now;

  const handleDcClick = async (dc_id) => {
    if (!view || !layers || !layers.dc_odb) return;
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
        }
    } catch (err) {
        console.error("Error finding DC:", err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const fetchPower = async (alarmState) => {
      if (![1, 2, 3, 4].includes(alarmState)) return;

      setPowerLoading(true);
      try {
        const powerRes = await fetch(`${Realtime}/api/get-power?${new URLSearchParams({
          olt: feature.attributes.olt,
          fn: feature.attributes.frame,
          sn: feature.attributes.slot,
          pn: feature.attributes.port,
          ontid: feature.attributes.ontid,
        }).toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal
        });
        const powerResult = await powerRes.json();
        if (isMounted) setPowerInfo(optical_threshold(powerResult.data?.[0]));
      } catch (err) {
        if (err.name !== "AbortError") console.error("Power Fetch Error", err);
      } finally {
        if (isMounted) setPowerLoading(false);
      }
    };

    const fetchData = async () => {
      setLoading(true);
      setError(false);
      setPowerInfo(null);
      try {
        const id = feature.attributes.id;
        const fields = [
          "id",
          "name",
          "city",
          "region",
          "area_town",
          "sub_area",
          "type",
          "olt",
          "frame",
          "slot",
          "port",
          "ontid",
          "dc_id",
          "alarminfo",
          "lastdowncause",
          "lastdowntime",
          "lastuptime",
          "alarmstate",
          "fault_time",
          "category",
          "perceived_severity",
          "lopdetail"
        ];

        const geoServerUrl =
        `${api}/geoserver/web_app/ows?` +
        `service=WFS` +
        `&version=1.0.0` +
        `&request=GetFeature` +
        `&typeName=web_app:Customers_test` +
        `&outputFormat=application/json` +
        `&propertyName=${fields.join(",")}` +
        `&CQL_FILTER=id='${encodeURIComponent(escapeForCql(id))}'`;

        const geoRes = await fetch(geoServerUrl, { signal: controller.signal });
        const geoData = await geoRes.json();

        if (!geoData.features?.length) throw new Error("No feature found");
        if (!isMounted) return;

        const featureData = geoData.features[0].properties;
        setData(featureData);
        setLoading(false);

        fetchPower(parseInt(featureData.alarmstate, 10));
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Details Fetch Error", err);
          if (isMounted) setError(true);
        }
        if (isMounted) setLoading(false);
      }
    };

    if (feature.attributes.id) fetchData();
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [feature]);

  const renderItem = (field) => {
    let val = data[field.key] ?? data[field.key.toLowerCase()] ?? "N/A";
    let chipColor = "neutral";
    let chipText = 'var(--calcite-ui-text-2)';
    let isChip = false;
    let icon = null;

    if (field.key === "alarminfo") {
        isChip = true;
        if (["LOS", "Linked Down"].includes(val)) chipColor = "red";
        else if (val === "Power Off") chipColor = "blue";
        else if (val === "GEM Packet Loss") chipColor = "black";
        else if (val === "LOP") { chipColor = "yellow"; chipText = "black"; }
        else chipColor = "neutral";
    } else if (field.key === "fault_time" && val && val !== "N/A") {
        isChip = true;
        chipColor = "red";
        chipText = " ";
    }

    const selectionStyle = { userSelect: "text", WebkitUserSelect: "text", cursor: "text" };

    return (
      <CalciteListItem key={field.key} scale="s" label={field.label} description={field.group || null}>
        <div slot="content-end" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
            style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', borderLeft: '1px solid var(--calcite-ui-text-3)', paddingLeft: '0.75rem', marginLeft: '0.5rem', width: "8.5vw", marginTop: '-1rem', marginBottom: '-1rem', paddingTop: '1rem', paddingBottom: '1rem' }}
        >
            {isChip ? (
                <CalciteChip scale="s" icon={icon} style={{ ...selectionStyle, ...(chipColor === "yellow" ? { "--calcite-chip-background-color": chipColor, "--calcite-chip-text-color" : chipText } : { "--calcite-chip-background-color": chipColor}) }}>
                    {val}
                </CalciteChip>
            ) : (
                <span style={{ ...selectionStyle, fontWeight:"bold", fontSize: "0.75rem", color: chipText ? chipText : "var(--calcite-ui-text-2)", marginRight: field.isLink ? "8px" : "0" }}>
                    {val}
                </span>
            )}
            {field.isLink && val !== "N/A" && (
                <CalciteAction scale="s" icon="launch" title="Go to DC" text="Go to DC" onClick={() => handleDcClick(val)} style={{ marginRight: "-8px" }} />
            )}
        </div>
      </CalciteListItem>
    );
  };

  const checkSeverity = data.perceived_severity;
  const isWarningSeverity = currentAlarmState === 4 && checkSeverity?.toString().toLowerCase() === "warning";

  const opticalMetrics = powerInfo ? [
    { key: "ontText", label: "Rx Power (ONT)", value: powerInfo.ontText, color: powerInfo.ontKind },
    { key: "oltText", label: "Rx Power (OLT)", value: powerInfo.oltText, color: powerInfo.oltKind },
    { key: "txPowerText", label: "Tx Power", value: powerInfo.txPowerText, color: powerInfo.txPowerKind },
    { key: "txVolText", label: "Tx Voltage", value: powerInfo.txVolText, color: powerInfo.txVolKind },
    { key: "tempText", label: "Tx Temperature", value: powerInfo.tempText, color: powerInfo.tempKind },
    { key: "biasText", label: "Tx Bias Current", value: powerInfo.biasText, color: powerInfo.biasKind },
  ] : [];

  // Adjusted Logic: Filter metrics and LOP Cause visibility based on alarm state
  const isRxOnlyAlarm = currentAlarmState === 1 || currentAlarmState === 2; // Power Off (1) or Linked Down (2)
  const rxOnlyKeys = ["ontText", "oltText"];
  
  const displayedMetrics = isRxOnlyAlarm
    ? opticalMetrics.filter((m) => rxOnlyKeys.includes(m.key))
    : opticalMetrics;

  const handleCopy = (e) => {
    e.stopPropagation();
    const idToCopy = feature.attributes.id?.toString();
    if (!idToCopy) return;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(idToCopy);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = idToCopy;
      textArea.style.position = "absolute";
      textArea.style.left = "-999999px";
      document.body.prepend(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } finally {
        textArea.remove();
      }
    }
    setAlertOpen(true);
    setTimeout(() => setAlertOpen(false), 3000);
  };
  
  return (
    <div scale="s" style={{ display: "flex", flexDirection: "column", fontFamily: "var(--calcite-sans-family, inherit)" }}>
      <CalciteAlert open={alertOpen ? true : undefined} icon="check-circle" kind="success" label="Copied" placement="top" scale="s">
        <div slot="title">Copied!</div>
        <div slot="message">Customer ID copied to clipboard.</div>
      </CalciteAlert>

      {loading ? (
        <div style={{ padding: "5rem 1.25rem", textAlign: "center", background: SURFACE.panelBg }}>
          <CalciteLoader label="Loading customer details..." scale="m" active />
        </div>
      ) : error ? (
        <div style={{ padding: "1rem", background: SURFACE.panelBg }}>
          <CalciteNotice kind="danger" icon="exclamation-mark-circle" open scale="s">
            <div slot="title">Data Sync Error</div>
            <div slot="message">Could not retrieve live diagnostics.</div>
          </CalciteNotice>
        </div>
      ) : (
        <>
          {/* 0. Identity Header */}
          <div style={{ display: "flex", flexDirection: "column", padding: "0.85rem 1rem 0.5rem", background: SURFACE.panelBg }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <div>
                <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: SURFACE.label }}>
                  Customer ID
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 700, fontFamily: "var(--calcite-mono-family, monospace)", color: "#009af2 ", lineHeight: 1.3 }}>
                    {data.id ?? "N/A"}
                  </div>
                  {data.id && (
                    <CalciteAction icon="copy-to-clipboard" text="Copy ID" scale="s" appearance="transparent" onClick={handleCopy} />
                  )}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <CalciteIcon icon={status.icon} scale="s" style={{ color: `var(--calcite-ui-${status.kind})` }} />
                  <span style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: status.isUp ? NATIVE.ok : NATIVE.alarm }}>
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

            {status.kind !== "success" && durationStr && (
              <CalciteNotice scale="s" kind={status.kind} icon="clock" open width="full" style={{ marginBottom: "0.75rem" }}>
                <div slot="title">Duration</div>
                <div slot="message" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <CalciteChip scale="s" style={{ "--calcite-chip-background-color": "#b70404" }}>
                    {durationStr}
                  </CalciteChip>
                  {isWarningSeverity && (
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#ff8c00", fontWeight: "bold", fontSize: "0.70rem", padding: "0.15rem 0.6rem" }}>
                      <CalciteIcon icon="exclamation-mark-triangle" scale="s" />
                      WARNING
                    </span>
                  )}
                </div>
              </CalciteNotice>
            )}
          </div>

          {/* 1. Separated Optical Diagnostics Panel (Rendered for any active alert: 1-4) */}
          {[1, 2, 3, 4].includes(currentAlarmState) && (
            <div style={{ padding: "0 1rem 1rem", background: SURFACE.panelBg }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: SURFACE.label, marginBottom: "0.75rem", borderBottom: `1px solid ${SURFACE.border}`, paddingBottom: "0.25rem" }}>
                Real-time Optical Metrics
              </div>

              {powerLoading && !powerInfo ? (
                <div style={{ padding: "1rem 0", display: "flex", justifyContent: "center" }}>
                  <CalciteLoader label="Reading optical power..." scale="s" active inline />
                </div>
              ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
                {displayedMetrics.map((m) => (
                  <div key={m.key} style={{ background: SURFACE.cardBg, border: `1px solid ${SURFACE.border}`, borderLeft: `3px solid ${m.color}`, borderRadius: "5px", padding: "0.5rem", boxShadow: SURFACE.shadow, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
                    <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: SURFACE.label, whiteSpace: "nowrap" }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, fontFamily: "var(--calcite-sans-family, sans-serif)", color: m.color, padding: "0.15rem 0.6rem", borderRadius: "50px", display: "inline-block" }}>
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
              )}

              {/* LOP Detail rendered ONLY if it is not a Linked Down / Power Off alarm */}
              {!isRxOnlyAlarm && (
                <div style={{ 
                  marginTop: "0.5rem", background: SURFACE.cardBg, border: `1px solid ${SURFACE.border}`, 
                  borderLeft: `3px solid ${NATIVE.warn}`, borderRadius: "5px", padding: "0.5rem 0.75rem", 
                  display: "flex", justifyContent: "space-between", alignItems: "center" 
                }}>
                  <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: SURFACE.label }}>
                    LOP Cause
                  </div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, fontFamily: "var(--calcite-mono-family, monospace)", color: NATIVE.warn }}>
                    {extractTypeId(data.lopdetail)}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "center", gap: "1.25rem", marginTop: "0.75rem", paddingTop: "0.65rem", borderTop: `1px solid ${SURFACE.border}` }}>
                {[{ label: "Normal", color: NATIVE.ok }, { label: "Warning", color: NATIVE.warn }, { label: "Alarm", color: NATIVE.alarm }].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: item.color }} />
                    <span style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: SURFACE.label }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          

          {/* 2. Demographics & Architecture Block */}
          <div style={{ background: SURFACE.panelBg }}>
            <CalciteBlock scale="s" open heading="Demographics & Architecture">
              <CalciteList>
                {fieldsToDisplay
                  .filter((f) => f.key !== "id")
                  .map(renderItem)}
              </CalciteList>
            </CalciteBlock>
          </div>
        </>
      )}
    </div>
  );
}