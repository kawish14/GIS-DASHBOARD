import React, { useEffect, useState, useMemo } from "react";
import { 
  CalciteBlock, 
  CalciteList,
  CalciteListItem,
  CalciteChip,
  CalciteLoader,
  CalciteIcon,
  CalciteNotice,
  CalciteAction
} from "@esri/calcite-components-react";
import { useArcGIS } from "../../../context/MapContext";

export default function PopDetails({ feature }) {
  const {view, layers, setPopupFeature} = useArcGIS();
  const attr = feature.attributes;

  const [dcStats, setDcStats] = useState([]);
  const [loading, setLoading] = useState(true);

  // Memoize fields to prevent re-renders
  const fields = useMemo(() => [
    { label: "ID", value: attr.id },
    // { label: "Name", value: attr.name },
    { label: "City", value: attr.city},
    { label: "Region", value: attr.region},
    { label: "Ownership", value: attr.ownership}
  ], [attr]);

  useEffect(() => {
    let isMounted = true; 
    setLoading(true);

    const fetchRelated = async () => {
      if (!view || !layers || !layers.dc_odb || !layers.Customers_test) return;

      try {
        // 1. Get all DCs connected to this POP
        const dcLayer = layers.dc_odb;
        const custLayer = layers.Customers_test;

        const dcQuery = dcLayer.createQuery();
        dcQuery.returnGeometry = true; 
        dcQuery.where = `pop_id = '${attr.id}'`; 
        dcQuery.outFields = ["*"]; 

        const dcResults = await dcLayer.queryFeatures(dcQuery);
        const dcs = dcResults.features;

        if (!isMounted) return;

        if (dcs.length === 0) {
            setDcStats([]);
            setLoading(false);
            return;
        }

        // 2. For EACH DC, count the faults
        const statsPromises = dcs.map(async (dc) => {
            const dcId = dc.attributes.id;
            
            const faultQuery = custLayer.createQuery();
            // Count alarms (alarmstate 1, 2, 3, or 4)
            faultQuery.where = `dc_id = '${dcId}' AND alarmstate in (1, 2, 3, 4)`;
            faultQuery.returnGeometry = false;
            
            const count = await custLayer.queryFeatureCount(faultQuery);
            
            return {
                id: dcId,
                name: dc.attributes.name || dcId,
                type: dc.attributes.type || "Unknown",
                faultCount: count,
                feature: dc 
            };
        });

        const allStats = await Promise.all(statsPromises);
        
        // 3. FILTER & SORT
        // Only keep DCs that actually have faults
        const faultyDCs = allStats
            .filter(dc => dc.faultCount > 0)
            .sort((a, b) => b.faultCount - a.faultCount); // Highest faults first

        if (isMounted) setDcStats(faultyDCs);

      } catch (error) {
        if (error.name !== "AbortError") console.error("Query failed:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRelated();
    return () => { isMounted = false; };
  }, [view, layers, attr.id]);


   const selectionStyle = {
        userSelect: "text", 
        WebkitUserSelect: "text",
        cursor: "text"
    };

    const getStatus = (count) => {
        if (count < 5) return { color: "#ffc933", icon: "exclamation-mark-triangle", kind: "warning", label: "Warning" };
        return { color: "#d92e2e", icon: "x-octagon", kind: "danger", label: "Critical" };
    };

  const handleDcClick = (dcFeature) => {
      dcFeature.layer = layers.dc_odb; 
      layers.dc_odb.visible = true; 
      view.goTo({ target: dcFeature, zoom: 18 });
      setPopupFeature(dcFeature);
  };

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
                        // 1. Remove fixed height and use stretch logic
                        alignSelf: 'stretch', 
                        display: 'flex',
                        alignItems: 'center',

                        // 2. Create the line
                        borderLeft: '1px solid var(--calcite-ui-text-3)',
                        
                        // 3. Control spacing
                        paddingLeft: '0.75rem',
                        marginLeft: '0.5rem',
                        
                        // 4. Ensure it fills the width you specified
                        width: "8.5vw",

                        // 5. Override Calcite's default slot margins if they exist
                        marginTop: '-1rem',
                        marginBottom: '-1rem',
                        paddingTop: '1rem',
                        paddingBottom: '1rem'
                    }}
               >
                 {field.label === "Ownership" ? 
                    <CalciteChip scale="s" kind="brand" icon="user">{field.value || "N/A"}</CalciteChip> : 
                    <span 
                    style={{ fontSize: "0.75rem", fontWeight: "600", ...selectionStyle }}>{field.value || "N/A"}</span>
                 }
               </div>
            </CalciteListItem>
          ))}
        </CalciteList>
      </CalciteBlock>

      {/* 2. DC Health Monitor Block */}
      <CalciteBlock 
        heading="DC Health Monitor" 
        description={dcStats.length > 0 ? `${dcStats.length} Faulty DCs Detected` : "All Systems Operational"}
        open 
        collapsible 
        scale="s"
      >
        <div slot="icon"><CalciteIcon icon="pulse" scale="s" /></div>
        
        {loading ? (
             <div style={{ padding: "2rem", display: "flex", justifyContent: "center" }}>
                <CalciteLoader scale="m" label="Analyzing DCs" />
             </div>
        ) : dcStats.length === 0 ? (
            <CalciteNotice kind="success" open width="full">
                <div slot="message">No active faults found in connected DCs.</div>
            </CalciteNotice>
        ) : (
          <div style={{ maxHeight: "350px", overflowY: "auto", overflowX: "hidden" }}>
              <CalciteList selectionMode="none">
                {dcStats.map((dc) => {
                    const status = getStatus(dc.faultCount);
                    return (
                        <CalciteListItem 
                            key={dc.id} 
                            label={dc.id}
                            description={dc.type}
                            scale="s"
                        >
                            <div slot="content-end" style={{ 
                                display: "flex", 
                                alignItems: "center", 
                                gap: "12px",
                                height: "100%"
                            }}>
                                <CalciteChip 
                                    scale="s" 
                                    kind={status.kind} 
                                    icon={status.icon}
                                    style={{ fontWeight: "bold" }}
                                >
                                    {`${dc.faultCount} Faults`}
                                </CalciteChip>

                                <CalciteAction 
                                    scale="s" 
                                    icon="chevron-right" 
                                    text="View DC"
                                    onClick={() => handleDcClick(dc.feature)}
                                />
                            </div>
                        </CalciteListItem>
                    );
                })}
            </CalciteList>
          </div>
          
        )}
      </CalciteBlock>

    </div>
  );
}