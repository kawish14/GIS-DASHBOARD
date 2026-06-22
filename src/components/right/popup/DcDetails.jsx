import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  CalciteAction,
  CalciteBlock,
  CalciteList,
  CalciteListItem,
  CalciteLoader,
  CalciteNotice,
  CalciteIcon
} from "@esri/calcite-components-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label } from "recharts";
import { useArcGIS } from "../../../context/MapContext";
import { Realtime } from "../../../../url";

const COLORS = {
  Online: "#56f000",
  PowerOff: "#007ac2",
  LOS: "#d92e2e",
  GEM: "#000000",
  LOP: "#ffc933",
  Other: "#6a6a6a"
};

// --- Sub-components ---

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={{
        backgroundColor: "rgba(20, 20, 20, 0.9)",
        border: "1px solid var(--calcite-ui-border-3)",
        borderRadius: "4px",
        padding: "8px 12px",
        color: "#fff",
        fontSize: "0.75rem",
        zIndex: 1000
      }}>
        <div style={{ fontWeight: "bold", marginBottom: "4px", color: data.color }}>
          {data.name}
        </div>
        <div>Count: <b>{data.value}</b></div>
      </div>
    );
  }
  return null;
};

// Custom Metric Legend Item
const MetricItem = ({ label, count, color, total, onClick, isActive }) => {
    return (
        <div 
           onClick={onClick}
           style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '6px 8px',
            borderBottom: '1px solid var(--calcite-ui-border-3)',
            fontSize: '0.75rem',
            cursor: 'pointer',
            backgroundColor: isActive ? 'var(--calcite-ui-foreground-3)' : 'transparent',
            borderRadius: '4px',
            transition: 'background 0.2s'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ 
                    width: '10px', height: '10px', borderRadius: '50%',
                    backgroundColor: color, border: "1.5px solid white"
                 }} />
                <span style={{ color: 'var(--calcite-ui-text-2)' }}>{label}</span>
            </div>
            <span style={{ fontWeight: 'bold', color: 'var(--calcite-ui-text-1)' }}>{count}</span>
        </div>
    );
};

export default function DcDetail({ feature }) {
  const { 
    view, layers, setPopupFeature, layerView, popupFeature, 
    setSelectedFeatures , highlightHandleRef

  } = useArcGIS(); 
  const attr = feature.attributes;

  const [chartData, setChartData] = useState([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [rawFeatures, setRawFeatures] = useState([]); 
  
  // --- NEW: State to hold our splitter data ---
  const [splitters, setSplitters] = useState([]);
  
  const [activeCategory, setActiveCategory] = useState(null);

  useEffect(() => {
    let isMounted = true; 
    setLoading(true);
    
    if (highlightHandleRef.current) {
        highlightHandleRef.current.remove();
        highlightHandleRef.current = null;
    }

    setActiveCategory(null);

    const fetchRelated = async () => {
      if (!view || !layers || !layers.Customers_test) return;

      if(popupFeature.layer.title === "dc_odb") {
        console.log("Fetching PON status for DC ID:", popupFeature.attributes.id);
            fetch(
              `${Realtime}/api/pon-status?dc_id=${popupFeature.attributes.id}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              },
            )
              .then((response) => response.json())
              .then((responseData) => {
                console.log("API Response:", responseData);

                if (isMounted) {
                  const counts = {
                    Online: 0, PowerOff: 0, LOS: 0, GEM: 0, LOP: 0, Other: 0,
                  };

                  responseData.alarm.forEach((f) => {
                    const info = f.alarminfo;
                    const state = parseInt(f.alarmstate);

                    let category = "Other";
                    if (state === 0) category = "Online";
                    else if ( state === 1) category = "PowerOff";
                    else if ( state === 2) category = "LOS";
                    else if (state === 3) category = "GEM";
                    else if (state === 4) category = "LOP";

                    f.category = category;
                    counts[category]++;
                  });

                  const formattedChartData = [
                    { name: "Online", value: counts.Online, color: COLORS.Online, key: "Online" },
                    { name: "Power Off", value: counts.PowerOff, color: COLORS.PowerOff, key: "PowerOff" },
                    { name: "LOS", value: counts.LOS, color: COLORS.LOS, key: "LOS" },
                    { name: "GEM", value: counts.GEM, color: COLORS.GEM, key: "GEM" },
                    { name: "LOP", value: counts.LOP, color: COLORS.LOP, key: "LOP" },
                    { name: "Other", value: counts.Other, color: COLORS.Other, key: "Other" },
                  ].filter((item) => item.value > 0);

                  const total = responseData.alarm.length;

                  setTotalCustomers(total);
                  setChartData(formattedChartData);
                  setRawFeatures(responseData.alarm);
                  
                  // --- NEW: Save the splitter array to our state ---
                  setSplitters(responseData.splitter || []);

                } else if (isMounted) {
                  setChartData([]);
                  setTotalCustomers(0);
                  setRawFeatures([]);
                  setSplitters([]); // Clear splitters on unmount/change
                }
              })
              .catch((error) => {
                console.error("API Error:", error);
              })
              .finally(() => {
                if (isMounted) {
                    setLoading(false);
                }
              });
        }
        else {
            setLoading(false);
        }
    };

    fetchRelated();

    return () => { isMounted = false; if (highlightHandleRef.current) highlightHandleRef.current.remove(); };
  }, [view, layers.Customers_test, attr.id]);
    
  const handlePopClick = async (popId) => {
    if (!view || !layers || !layers.pop) return;
    try {
        const popLayer = layers.pop; 
        const query = popLayer.createQuery();
        query.where = `id = '${popId}'`; 
        query.returnGeometry = true;    
        query.outFields = ["*"];
        const results = await popLayer.queryFeatures(query);
        if (results.features.length > 0) {
            const popFeature = results.features[0];
            popFeature.layer = popLayer; 
            view.goTo({ target: popFeature, zoom: 18 });
            setPopupFeature(popFeature);
        }
    } catch (err) { console.error("Error finding POP:", err); }
  };

 const handleSplitterClick = async (split) => {
      console.log("Splitter clicked:", split);
      
      const customerLayer = layers.Customers_test; 
      const custLayerView = layerView["Customers_test"];

      if (!customerLayer || !custLayerView) {
          console.warn("Customer layer or layerView is not ready yet.");
          return;
      }

      try {
          // 1. Create and run the query
          const query = customerLayer.createQuery();
          query.where = `splitter_id = '${split.splitter_id}'`; 
          query.returnGeometry = true;    
          query.outFields = ["*"];

          const results = await customerLayer.queryFeatures(query);
          const graphics = results.features;

          if (graphics.length > 0) {
              // 2. Clear the previous highlight if one exists
              if (highlightHandleRef.current) {
                  highlightHandleRef.current.remove();
                  highlightHandleRef.current = null;
              }

              // 3. Highlight the new graphics
              highlightHandleRef.current = custLayerView.highlight(graphics);

              // 4. Zoom the map to fit all the highlighted customers
              view.goTo({ 
                  target: graphics, 
                  padding: { top: 50, left: 50, right: 50, bottom: 50 } 
              }).catch(err => {
                  if (err.name !== "AbortError") console.error("Zoom failed:", err);
              });

              setSelectedFeatures(graphics);
              
          } else {
              console.log(`No customers found on the map for splitter_id: ${split.splitter_id}`);
              
              // Optional: Clear highlight if a completely empty splitter is clicked
              if (highlightHandleRef.current) {
                  highlightHandleRef.current.remove();
                  highlightHandleRef.current = null;

                  //setSelectedFeatures([]);
              }
          }
      } catch (error) {
          console.error("Error querying or highlighting splitter customers:", error);
      }
  };

  const fields = useMemo(() => [
      { label: "ID", value: attr.id },
      /* { label: "Name", value: attr.name }, */
      { label: "POP", value: attr.pop_id, isLink: true },
      { label: "Type", value: attr.type },
      { label: "Placement", value: attr.placement },
      { label: "Area", value: attr.area },
      { label: "City", value: attr.city },
    ], [attr]);

    const selectionStyle = {
        userSelect: "text", 
        WebkitUserSelect: "text", // For Safari/Chrome compatibility
        cursor: "text"
    };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "2px" }}>
      
      {/* DC Details Block */}
      <CalciteBlock heading={`DC ${attr.id}`} description={`${attr.name}`} open collapsible={false}>
         <CalciteList selectionMode="none">
          {fields.map((field, index) => (
             <CalciteListItem key={index} scale="s" label={field.label}>
               <div slot="content-end" style={{ display: "flex", alignItems: "center", marginLeft: "1rem" }}>
                 <span style={{ fontSize: "0.75rem", fontWeight: "600", ...selectionStyle }}>{field.value}</span>
                 {field.isLink && field.value && (
                   <CalciteAction scale="s" icon="launch" onClick={() => handlePopClick(field.value)} />
                 )}
               </div>
             </CalciteListItem>
          ))}
         </CalciteList>
      </CalciteBlock>

      {/* --- NEW: Splitter Details Block --- */}
      {!loading && splitters.length > 0 && (
        <CalciteBlock heading="Splitter Details" open collapsible scale="s">
          <div slot="icon"><CalciteIcon icon="network" scale="s" /></div>
          <CalciteList selectionMode="none">
            {splitters.map((split, idx) => (
              <CalciteListItem 
                key={idx} 
                label={`Splitter: ${split.splitter_id}`} 
                description={`OLT: ${split.olt}`}
                onClick={() => handleSplitterClick(split)} 
              >
                <div slot="content-end" style={{ textAlign: "right", fontSize: "0.75rem" }}>
                  <div style={{ color: "var(--calcite-ui-text-1)" }}>
                    <b>Pri FSP:</b> {split.primary_fsp || 'N/A'}
                  </div>
                  {/* Only render Secondary FSP if it exists */}
                  {split.secondary_fsp && (
                    <div style={{ color: "var(--calcite-ui-text-2)", marginTop: "2px" }}>
                      <b>Sec FSP:</b> {split.secondary_fsp}
                    </div>
                  )}
                </div>

              </CalciteListItem>
            ))}
          </CalciteList>
        </CalciteBlock>
      )}

      {/* Analytics Block */}
      <CalciteBlock heading="Fault Status" open collapsible scale="s">
        <div slot="icon"><CalciteIcon icon="graph-pie-slice" scale="s" /></div>
        <div style={{ padding: "0 12px 12px 12px" }}>
          {loading ? (
             <div style={{ height: "200px", display:"flex", justifyContent:"center", alignItems:"center" }}>
                <CalciteLoader scale="m" label="Loading stats" />
             </div>
          ) : chartData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ height: "180px", position: "relative" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} innerRadius={55} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none">
                      {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      <Label value={totalCustomers} position="center" dy={-5} style={{ fontSize: "24px", fontWeight: "bold", fill: "var(--calcite-ui-text-2)" }} />
                      <Label value="ONTs" position="center" dy={15} style={{ fontSize: "10px", fill: "var(--calcite-ui-text-2)" }} />
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend Grid - Now Interactive */}
              <div style={{ 
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem",
                  backgroundColor: "var(--calcite-ui-foreground-1)", padding: "8px",
                  borderRadius: "4px", border: "1px solid var(--calcite-ui-border-3)"
              }}>
                {chartData.map((item) => (
                  <MetricItem
                    key={item.key}
                    label={item.name}
                    count={item.value}
                    color={item.color}
                    total={totalCustomers}
                    isActive={activeCategory === item.key} 
                    //onClick={() => handleLegendClick(item.key)} 
                  />
                ))}
              </div>
            </div>
          ) : (
            <CalciteNotice kind="neutral" open width="full"><div slot="message">No connected customers found.</div></CalciteNotice>
          )}
        </div>
      </CalciteBlock>
    </div>
  );
}