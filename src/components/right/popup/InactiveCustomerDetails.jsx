import React, { useMemo } from "react";
import {
  CalciteBlock,
  CalciteList,
  CalciteListItem,
  CalciteIcon,
  CalciteNotice,
  CalciteAction
} from "@esri/calcite-components-react";
import { useArcGIS } from "../../../context/MapContext";

// --- Helper to Calculate Downtime ---
const calculateDuration = (faultTimeStr) => {
  if (!faultTimeStr) return "Unknown";
  
  const faultTime = new Date(faultTimeStr);
  if (isNaN(faultTime.getTime())) return "Unknown"; 

  const now = new Date();
  const diffMs = now - faultTime;

  if (diffMs <= 0) return "Just now";

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diffMs / 1000 / 60) % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(" ");
};

const ALARM_LABELS = {
  1: { text: "Power Off", color: "var(--calcite-ui-danger)", icon: "power" },
  2: { text: "Linked Down (LOS)", color: "var(--calcite-ui-danger)", icon: "disconnected" },
  3: { text: "GEM Packet Loss", color: "var(--calcite-ui-warning)", icon: "layer-broken" },
  4: { text: "Loss of Payload (LOP)", color: "var(--calcite-ui-warning)", icon: "exclamation-mark-triangle" },
  default: { text: "Offline / Unknown Error", color: "var(--calcite-ui-text-2)", icon: "question-mark-circle" }
};

export default function InactiveCustomerDetails({ feature }) {
  const { view, layers, setPopupFeature } = useArcGIS(); 
  const attr = feature.attributes;

  // Determine alarm info
  const alarmState = attr.alarmstate;
  const alarmConfig = ALARM_LABELS[alarmState] || ALARM_LABELS.default;
  const faultDuration = calculateDuration(attr.fault_time);

  const selectionStyle = {
    userSelect: "text", 
    WebkitUserSelect: "text", 
    cursor: "text"
  };

  const handleLocateDC = async (dcId) => {
    if (!view || !layers || !layers.dc_odb || !dcId) return;
    try {
        const dcLayer = layers.dc_odb; 
        const query = dcLayer.createQuery();
        query.where = `id = '${dcId}'`; 
        query.returnGeometry = true;    
        query.outFields = ["*"];
        const results = await dcLayer.queryFeatures(query);
        if (results.features.length > 0) {
            const dcFeature = results.features[0];
            dcFeature.layer = dcLayer; 
            view.goTo({ target: dcFeature, zoom: 20 });
            setPopupFeature(dcFeature);
        }
    } catch (err) { console.error("Error finding DC:", err); }
  };

  const customerFields = useMemo(() => [
    { label: "Customer ID", value: attr.id },
    { label: "Name", value: attr.name },
    { label: "Type", value: attr.type },
    { label: "Area / Sub Area", value: `${attr.area_town || '-'} / ${attr.sub_area || '-'}` },
    { label: "Service Tier", value: attr.service_tier },
    { label: "Bandwidth", value: attr.bandwidth },
  ], [attr]);

  const networkFields = useMemo(() => [
    { label: "DC / ODB", value: attr.dc_id, isLink: true },
    { label: "OLT", value: attr.olt },
    { label: "F / S / P", value: `${attr.frame || '-'}/${attr.slot || '-'}/${attr.port || '-'}` },
    { label: "ONT ID", value: attr.ontid },
  ], [attr]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "8px" }}>
      
      {/* 1. Critical Outage Banner */}
      <div style={{
          backgroundColor: alarmConfig.color,
          color: "white",
          padding: "12px",
          borderRadius: "4px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
      }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold", fontSize: "1rem" }}>
              <CalciteIcon icon={alarmConfig.icon} scale="m" />
              <span>{alarmConfig.text}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", borderTop: "1px solid rgba(255,255,255,0.3)", paddingTop: "8px" }}>
              <div>
                  <div style={{ opacity: 0.8 }}>Fault Time</div>
                  <div style={{ fontWeight: "600" }}>{attr.fault_time || "N/A"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                  <div style={{ opacity: 0.8 }}>Downtime</div>
                  <div style={{ fontWeight: "600", fontSize: "1.1rem" }}>{faultDuration}</div>
              </div>
          </div>
          {attr.alarminfo && (
              <div style={{ fontSize: "0.75rem", opacity: 0.9, marginTop: "4px", backgroundColor: "rgba(0,0,0,0.15)", padding: "4px 8px", borderRadius: "4px" }}>
                  {attr.alarminfo}
              </div>
          )}
      </div>

      {/* 2. Customer Information Block */}
      <CalciteBlock heading="Customer Details" open collapsible scale="s">
        <div slot="icon"><CalciteIcon icon="user" scale="s" /></div>
        <CalciteList selectionMode="none">
          {customerFields.map((field, index) => (
             <CalciteListItem key={index} scale="s" label={field.label}>
               <div slot="content-end" style={{ display: "flex", alignItems: "center", marginLeft: "1rem" }}>
                 <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--calcite-ui-text-1)", ...selectionStyle }}>
                    {field.value || "N/A"}
                 </span>
               </div>
             </CalciteListItem>
          ))}
        </CalciteList>
      </CalciteBlock>

      {/* 3. Network Routing Block */}
      <CalciteBlock heading="Network Routing" open collapsible scale="s">
        <div slot="icon"><CalciteIcon icon="routing" scale="s" /></div>
        <CalciteList selectionMode="none">
          {networkFields.map((field, index) => (
             <CalciteListItem key={index} scale="s" label={field.label}>
               <div slot="content-end" style={{ display: "flex", alignItems: "center", marginLeft: "1rem", gap: "8px" }}>
                 <span style={{ fontSize: "0.75rem", fontWeight: "600", fontFamily: "monospace", color: "var(--calcite-ui-text-1)", ...selectionStyle }}>
                    {field.value || "N/A"}
                 </span>
                 {field.isLink && field.value && (
                   <CalciteAction 
                      scale="s" 
                      icon="launch" 
                      text="Locate DC"
                      onClick={() => handleLocateDC(field.value)} 
                   />
                 )}
               </div>
             </CalciteListItem>
          ))}
        </CalciteList>
      </CalciteBlock>

    </div>
  );
}