import React, { useEffect, useState, useMemo } from "react";
import { 
  CalciteBlock, 
  CalciteList,
  CalciteListItem,
  CalciteChip,
  CalciteLoader,
  CalciteListItemGroup,
  CalciteIcon,
  CalciteNotice,
  CalciteAction
} from "@esri/calcite-components-react";
import { Realtime } from "../../../../url";
import { useMapView, useLayers, usePopup } from "../../../context/MapContext";

export default function PopDetails({ feature }) {
  const { view } = useMapView();
  const { layers } = useLayers();
  const { setPopupFeature } = usePopup();
  const attr = feature.attributes;

  // Existing states
  const [dcStats, setDcStats] = useState([]);
  const [loading, setLoading] = useState(true);

  // New states for ISP Data
  const [ispData, setIspData] = useState(null);
  const [ispLoading, setIspLoading] = useState(false);
  const [ispError, setIspError] = useState(null);

  // Memoize fields to prevent re-renders
  const fields = useMemo(() => [
    { label: "ID", value: attr.id },
    { label: "City", value: attr.city},
    { label: "Region", value: attr.region},
    { label: "Ownership", value: attr.ownership}
  ], [attr]);

  // Fetch ISP Data when the POP ID changes
  useEffect(() => {
    if (!attr.id) return;

    setIspLoading(true);
    setIspError(null);

    fetch(`${Realtime}/api/isp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // Using the ID directly from the clicked feature attributes
      body: JSON.stringify({ pop_id: attr.id }) 
    })
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load ISP data");
        return response.json();
      })
      .then((data) => {
        console.log("Fetched ISP data:", data); // Debugging log
        setIspData(data.data);
      })
      .catch((error) => {
        console.error("Error fetching ISP data:", error);
        setIspError("Could not retrieve ISP information.");
      })
      .finally(() => {
        setIspLoading(false);
      });
  }, [attr.id]);

  // Group ISP Data and get counts
  const { switches, routers, totalDevices } = useMemo(() => {
    // Safely target the array whether it's inside 'ispData.data' or is the root array
    const dataArray = Array.isArray(ispData?.data) ? ispData.data : (Array.isArray(ispData) ? ispData : []);
    
    return {
      switches: dataArray.filter(d => d.device_type === 'switch'),
      routers: dataArray.filter(d => d.device_type === 'router'),
      totalDevices: dataArray.length
    };
  }, [ispData]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "2px" }}>
      
      {/* 1. Header & Info Block */}
      <CalciteBlock 
        scale="s"
        heading={attr.name || "POP Location"} 
        description={`POP ID: ${attr.id}`}
        open 
        collapsible={false}
      >
        <div slot="icon"><CalciteIcon icon="server" scale="s" /></div>
        
        <CalciteList selectionMode="none">
          {fields.map((field, index) => (
            <CalciteListItem key={index} scale="s" label={field.label}>
               <div 
                slot="content-end" 
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
                 {field.label === "Ownership" ? 
                    <CalciteChip scale="s" kind="brand" icon="user">{field.value || "N/A"}</CalciteChip> : 
                    <span style={{ fontSize: "0.75rem", fontWeight: "600" }}>{field.value || "N/A"}</span>
                 }
               </div>
            </CalciteListItem>
          ))}
        </CalciteList>
      </CalciteBlock>

      {/* 2. ISP Information Block */}
      <CalciteBlock 
        heading="ISP Information" 
        open 
        collapsible 
        scale="s"
      >
        <div slot="icon"><CalciteIcon icon="pulse" scale="s" /></div>
        
        {/* State 1: Loading */}
        {ispLoading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
            <CalciteLoader label="Loading ISP Data" active scale="s" />
          </div>
        )}

        {/* State 2: Error */}
        {!ispLoading && ispError && (
          <div style={{ padding: "1rem" }}>
            <CalciteNotice open kind="danger" scale="s" width="full">
              <div slot="message">{ispError}</div>
              <div slot="title">Connection Error</div>
            </CalciteNotice>
          </div>
        )}

       {/* State 3: Success / Data Display (Table Format) */}
        {!ispLoading && !ispError && totalDevices > 0 && (
          <div style={{ padding: "0.5rem", overflowX: "auto" }}>
            <table style={{ 
              width: "100%", 
              borderCollapse: "collapse", 
              textAlign: "left",
              fontSize: "0.67rem"
            }}>
              <thead>
                {/* Row 1: Summary Counts */}
               {/*  <tr style={{ 
                  backgroundColor: "var(--calcite-ui-foreground-2)", 
                  borderTop: "1px solid var(--calcite-ui-border-3)",
                  borderBottom: "1px solid var(--calcite-ui-border-3)" 
                }}>
                  <th style={{ padding: "0.75rem", color: "var(--calcite-ui-brand)" }}>
                    <CalciteIcon icon="layer" scale="s" style={{ marginRight: "4px", verticalAlign: "middle" }} />
                    Total: {totalDevices}
                  </th>
                  <th style={{ padding: "0.75rem", color: "var(--calcite-ui-info)" }}>
                    <CalciteIcon icon="nodes" scale="s" style={{ marginRight: "4px", verticalAlign: "middle" }} />
                    Switches: {switches.length}
                  </th>
                  <th style={{ padding: "0.75rem", color: "var(--calcite-ui-success)" }}>
                    <CalciteIcon icon="routing" scale="s" style={{ marginRight: "4px", verticalAlign: "middle" }} />
                    Routers: {routers.length}
                  </th>
                </tr> */}
                {/* Row 2: Column Titles */}
                <tr style={{ 
                  borderBottom: "2px solid var(--calcite-ui-border-3)", 
                  color: "var(--calcite-ui-text-2)" 
                }}>
                  <th style={{ padding: "0.75rem", fontWeight: "600" }}>S.No</th>
                  <th style={{ padding: "0.75rem", fontWeight: "600" }}>Switch Detail</th>
                  <th style={{ padding: "0.75rem", fontWeight: "600" }}>Router Detail</th>
                </tr>
              </thead>
              
              <tbody>
                {/* Map rows based on the maximum number of either switches or routers */}
                {Array.from({ length: Math.max(switches.length, routers.length) }).map((_, index) => (
                  <tr 
                    key={index} 
                    style={{ 
                      borderBottom: "1px solid var(--calcite-ui-border-3)",
                      backgroundColor: index % 2 === 0 ? "transparent" : "var(--calcite-ui-foreground-2)" 
                    }}
                  >
                    <td style={{ padding: "0.75rem", fontWeight: "500" }}>{index + 1}</td>
                    <td style={{ padding: "0.75rem" }}>
                      {switches[index] ? switches[index].device_name : "-"}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      {routers[index] ? routers[index].device_name : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CalciteBlock>

    </div>
  );
}