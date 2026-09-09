import React, { useMemo } from "react";
import {
  CalciteBlock,
  CalciteIcon,
  CalciteNotice
} from "@esri/calcite-components-react";

// --- Helper to calculate relationship tenure ---
const calculateTenure = (activationDateStr, statusChangeDateStr) => {
  if (!activationDateStr) return;
  
  const start = new Date(activationDateStr);
  // If no status change date, assume today is the end of the calculation
  const end = statusChangeDateStr ? new Date(statusChangeDateStr) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "Unknown Tenure";

  const diffInMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

  if (diffInMonths <= 0) return "< 1 month";
  if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''}`;

  const years = Math.floor(diffInMonths / 12);
  const months = diffInMonths % 12;

  let result = `${years} yr${years > 1 ? 's' : ''}`;
  if (months > 0) {
    result += ` ${months} mo${months > 1 ? 's' : ''}`;
  }
  
  return result;
};

// --- Helper to process an array of features in a cluster ---
const analyzeClusterData = (features) => {
  const total = features.length;
  const counts = { powerOff: 0, los: 0, gem: 0, lop: 0, other: 0 };
  const areaMap = {};
  let earliestTime = null;
  let latestTime = null;

  // Array to hold data for ONT field collection
  const recoveryList = [];

  features.forEach((feat) => {
    const attr = feat.attributes;

    // 1. Tally Alarms
    if (attr.alarmstate === 1) counts.powerOff++;
    else if (attr.alarmstate === 2) counts.los++;
    else if (attr.alarmstate === 3) counts.gem++;
    else if (attr.alarmstate === 4) counts.lop++;
    else counts.other++;

    // 2. Tally Areas for dominant area calculation
    if (attr.sub_area) {
      areaMap[attr.sub_area] = (areaMap[attr.sub_area] || 0) + 1;
    }

    // 3. Temporal Analysis (When did these go offline?)
    if (attr.fault_time) {
      const fTime = new Date(attr.fault_time).getTime();
      if (!isNaN(fTime)) {
        if (!earliestTime || fTime < earliestTime) earliestTime = fTime;
        if (!latestTime || fTime > latestTime) latestTime = fTime;
      }
    }

    // 4. Build Hardware Recovery List
    recoveryList.push({
      refNumber: attr.id, 
      ontid: attr.ontid,  
      name: attr.name,
      area: attr.area_town || "Unknown Area",
      sub_area: attr.sub_area || "Unknown Sub-Area",
      package: attr.package || "Unknown Package",
      status: attr.status || "Unknown Status",
      address: attr.address || null,
      type: attr.type || "Unknown Type",
      fault_time: attr.fault_time || null,
      // NEW: Date fields and calculated tenure
      activation_date: attr.activation_date,
      status_change_date: attr.status_change_date,
      tenure: calculateTenure(attr.activation_date, attr.status_change_date)
    });
  });

  // Sort maps to find dominant traits
  const topArea = Object.entries(areaMap).sort((a, b) => b[1] - a[1])[0];

  // Calculate if this was a sudden event or gradual
  let isSuddenEvent = false;
  let timeSpanHours = 0;
  if (earliestTime && latestTime) {
    timeSpanHours = (latestTime - earliestTime) / (1000 * 60 * 60);
    if (timeSpanHours < 24 && total > 3) isSuddenEvent = true; 
  }

  return { total, counts, topArea, isSuddenEvent, timeSpanHours, recoveryList };
};

export default function InactiveClusterPopup({ clusterFeatures }) {
  if (!clusterFeatures || clusterFeatures.length === 0) return null;

  const data = useMemo(() => analyzeClusterData(clusterFeatures), [clusterFeatures]);

  const renderAlarmRow = (label, count, color, icon) => {
    if (count === 0) return null;
    const percentage = ((count / data.total) * 100).toFixed(1);
    
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
        <div style={{ width: "24px", color: color }}><CalciteIcon icon={icon} scale="s" /></div>
        <div style={{ flex: 1, fontSize: "0.85rem", fontWeight: "500", color: "#e5e7eb" }}>{label}</div>
        <div style={{ width: "100px" }}>
           <div style={{ width: "100%", height: "6px", backgroundColor: "#374151", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${percentage}%`, height: "100%", backgroundColor: color }} />
           </div>
        </div>
        <div style={{ width: "40px", textAlign: "right", fontSize: "0.85rem", fontWeight: "bold", color: "#fff" }}>
          {count}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "4px" }}>
      
      {/* 1. Header & Summary */}
      <div style={{
          backgroundColor: "#1f2937",
          borderLeft: "4px solid #ef4444",
          padding: "16px",
          borderRadius: "6px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.3)"
      }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: "4px" }}>
            Inactive Node Cluster
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "2rem", fontWeight: "bold", color: "#f3f4f6" }}>{data.total}</span>
              <span style={{ fontSize: "1rem", color: "#d1d5db" }}>Total Units</span>
          </div>
          <div style={{ fontSize: "0.85rem", color: "#9ca3af", marginTop: "4px" }}>
             Dominant Area: <span style={{ color: "#fff", fontWeight: "500" }}>{data.topArea ? data.topArea[0] : "Unknown"}</span>
          </div>
      </div>

      {/* 2. Alert Distribution */}
      <CalciteBlock heading="Alert Distribution" open collapsible scale="s">
        <div slot="icon"><CalciteIcon icon="pie-chart" scale="s" /></div>
        <div style={{ padding: "12px", backgroundColor: "#111827", borderRadius: "4px", border: "1px solid #374151" }}>
          {/* "offline" or "unlink" replacing "disconnected" */}
          {renderAlarmRow("Linked Down", data.counts.los, "#ef4444", "offline")} 
          
          {/* Valid icon, should work on modern Calcite versions */}
          {renderAlarmRow("LOP", data.counts.lop, "#f59e0b", "exclamation-mark-triangle")} 
          
          {/* "x-circle" replacing "power" */}
          {renderAlarmRow("Power Off", data.counts.powerOff, "#3b82f6", "x-circle")} 
          
          {/* Valid icon, should work on modern Calcite versions */}
          {renderAlarmRow("GEM Packet Loss", data.counts.gem, "#8b5cf6", "layer-broken")} 
          
          {/* "online" or "check-circle" replacing "question-mark" */}
          {renderAlarmRow("Online", data.counts.other, "#6b7280", "online")} 
        </div>
      </CalciteBlock>

      {/* 3. Hardware Recovery List */}
      <CalciteBlock heading="Customer List" open collapsible scale="s">
        <div slot="icon"><CalciteIcon icon="home" scale="s" /></div>
        <div style={{ padding: "12px 16px" }}>
            <p style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: "12px", lineHeight: "1.4" }}>
              The following are the customers in this cluster.
            </p>
            
            {/* Scrollable list of PRO cards */}
            <div style={{ maxHeight: "400px", overflowY: "auto", paddingRight: "4px" }} className="custom-scrollbar">
              {data.recoveryList.map((item, idx) => {
                const isActiveStatus = item.status?.toLowerCase() === "active" || item.status?.toLowerCase() === "online";
                
                return (
                  <div key={idx} style={{ 
                    backgroundColor: "#1f2937", 
                    border: "1px solid #374151", 
                    padding: "12px", 
                    borderRadius: "8px", 
                    marginBottom: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                  }}>
                    {/* Header: Name and Status Badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>   
                          <div style={{ fontSize: "0.85rem", color: "#e5e7eb", fontWeight: "600" }}>{item.name || "Unnamed Node"}</div>
                       <div style={{ fontSize: "0.75rem", color: "#60a5fa", fontFamily: "monospace", fontWeight: "bold", userSelect: "all", cursor: "pointer" }}>{item.type || "N/A"}</div>
                      </div>
                      
                      <div style={{
                        fontSize: "0.65rem",
                        fontWeight: "bold",
                        textTransform: "uppercase",
                        padding: "3px 8px",
                        borderRadius: "12px",
                        backgroundColor: isActiveStatus ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        color: isActiveStatus ? "#34d399" : "#f87171",
                        border: `1px solid ${isActiveStatus ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`
                      }}>
                        {item.status}
                      </div>
                    </div>

                    {/* NEW: Tenure Ribbon */}
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      backgroundColor: "rgba(0, 0, 0, 0.25)", 
                      padding: "8px 10px", 
                      borderRadius: "6px",
                      border: "1px solid rgba(255,255,255,0.05)"
                    }}>
                       <div>
                         <div style={{ fontSize: "0.65rem", color: "#9ca3af", textTransform: "uppercase" }}>Active Tenure</div>
                         <div style={{ fontSize: "0.85rem", color: "#10b981", fontWeight: "bold" }}>{item.tenure}</div>
                       </div>
                       <div style={{ textAlign: "right" }}>
                         <div style={{ fontSize: "0.65rem", color: "#9ca3af", textTransform: "uppercase" }}>Inactive Since</div>
                         <div style={{ fontSize: "0.85rem", color: "#e5e7eb" }}>
                           {item.status_change_date ? new Date(item.status_change_date).toLocaleDateString() : "Unknown"}
                         </div>
                       </div>
                    </div>

                    {/* Middle: Data Grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.75rem", marginTop: "4px" }}>
                      <div>
                        <div style={{ color: "#9ca3af", marginBottom: "2px" }}>Ref Number</div>
                        <div style={{ color: "#e5e7eb", fontWeight: "600", userSelect: "all", cursor: "pointer" }}>{item.refNumber}</div>
                      </div>
                      <div>
                        <div style={{ color: "#9ca3af", marginBottom: "2px" }}>Fault Time</div>
                        <div style={{ color:  "#e5e7eb", fontFamily: "monospace", userSelect: "all", cursor: "pointer" }}>
                          {item.fault_time || "N/A"}
                        </div>
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <div style={{ color: "#9ca3af", marginBottom: "2px" }}>Package</div>
                        <div style={{ color: "#e5e7eb" }}>{item.package}</div>
                      </div>
                    </div>

                    {/* Bottom: Address Details */}
                    <div style={{
                      marginTop: "4px",
                      paddingTop: "10px",
                      borderTop: "1px solid #374151",
                      display: "flex",
                      gap: "8px",
                      alignItems: "flex-start"
                    }}>
                      <CalciteIcon icon="pin" scale="s" style={{ color: "#9ca3af", marginTop: "2px" }} />
                      <div style={{ fontSize: "0.75rem", lineHeight: "1.4" }}>
                        <div style={{ fontWeight: "600", color: "#e5e7eb" }}>{item.area}</div>
                        <div style={{ color: "#9ca3af", fontWeight: "600" }}>{item.sub_area}</div>
                        {item.address && <div style={{ color: "#9ca3af", marginTop: "2px" }}>{item.address}</div>}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
        </div>
      </CalciteBlock>

    </div>
  );
}