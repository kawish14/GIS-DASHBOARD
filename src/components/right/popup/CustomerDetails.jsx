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
} from "@esri/calcite-components-react";
import { api } from "../../../../url";
import { useMapView, useLayers, usePopup } from "../../../context/MapContext";
import { escapeForCql } from "../../../constants/faultCodes";

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
    ontKind: "neutral", oltKind: "neutral"
  };

  const threshold = -26.0;
  const ontPower = data.opticsrxpower / 100;
  const oltPower = data.opticsrxpowerbyolt / 100;

  const getKind = (power) => {
    if (isNaN(power)) return "neutral";
    if (power < threshold || power > 0) return "red";
    return "green";
  };

  return {
    ontText: isNaN(ontPower) ? "---" : `${ontPower.toFixed(2)} dBm`,
    oltText: isNaN(oltPower) ? "---" : `${oltPower.toFixed(2)} dBm`,
    ontKind: getKind(ontPower),
    oltKind: getKind(oltPower)
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
];

export default function CustomerDetails({ feature }) {
  const { view } = useMapView();
  const { layers } = useLayers();
  const { setPopupFeature } = usePopup();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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
            setPopupFeature(dcFeature);
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
       if (field.key === "ontText") {
          val = data._powerInfo.ontText;
          chipColor = data._powerInfo.ontKind;
       } else {
          val = data._powerInfo.oltText;
          chipColor = data._powerInfo.oltKind;
       }
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

  return (
    <div
      scale="s"
      style={{
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 1. Pro Header Block */}
      <CalciteBlock
        heading={status.label}
        scale="s"
        description={`${feature.attributes.fault_time}`}
        style={{ "--calcite-block-description-text-color": "#a7ff04" }}
        open
        collapsible={false}
      >
        <div slot="icon">
          <CalciteIcon
            icon={status.icon}
            scale="s"
            style={{ color: `var(--calcite-ui-${status.kind})` }}
          />
        </div>

        <div slot="control">
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: status.isUp ? "#41ff07" : "#ff0707",
              fontSize: "10px",
              fontWeight: "bold",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginRight:"12px",
              marginTop:"12px"
            }}
          >
            {status.isUp ? (
              <>
                <CalciteIcon icon="activity-monitor" scale="s" />
                UP
              </>
            ) : (
              <>
                <CalciteIcon icon="activity-monitor" scale="s" />
                DOWN
              </>
            )}
          </span>
        </div>

        {/* Duration Notice (Only if Faulty) */}
        {status.kind !== "success" && durationStr && (
          <CalciteNotice
            scale="s"
            kind={status.kind}
            icon="clock"
            open
            width="full"
            style={{ marginBottom: "1rem" }}
          >
            <div slot="title">Duration</div>

            <div slot="message" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CalciteChip
                scale="s"
                style={{ "--calcite-chip-background-color": "#b70404" }}
              >
                {durationStr}
              </CalciteChip>

              {/* Tag renders strictly when it is an LOP (4) Warning */}
              {isWarningSeverity && (
                <CalciteChip
                  scale="s"
                  icon="exclamation-mark-triangle"
                  style={{
                    "--calcite-chip-background-color": "#ff4500",
                    "color": "white",
                    "fontWeight": "bold"
                  }}
                >
                  WARNING
                </CalciteChip>
              )}
            </div>
          </CalciteNotice>
        )}

        {/* 2. Data List */}
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <CalciteLoader label="Loading details..." scale="m" />
          </div>
        ) : error ? (
          <CalciteNotice kind="danger" icon="exclamation-mark-circle" open>
            <div slot="title">Data Sync Error</div>
            <div slot="message">Could not retrieve live diagnostics.</div>
          </CalciteNotice>
        ) : (
          <CalciteList> {fieldsToDisplay.map(renderItem)} </CalciteList>
        )}
      </CalciteBlock>
    </div>
  );
}