import React, { useState, useRef, useEffect } from "react";
import { 
  CalciteLabel, 
  CalciteSwitch, 
  CalciteNotice,
  CalciteSlider
} from "@esri/calcite-components-react";
import { useArcGIS } from "../../../context/MapContext";

export default function DensityMapToggle() {
  const { view } = useArcGIS();
  
  const [isDensityEnabled, setIsDensityEnabled] = useState(false);
  const [clusterRadius, setClusterRadius] = useState(80); // Determines how large the 'portions' are
  
  const originalRenderersRef = useRef({}); 
  const originalReductionRef = useRef({});

  const toggleDensity = (e) => {
    const enabled = e.target.checked;
    setIsDensityEnabled(enabled);

    if (!view || !view.map) return;

    const layerTitles = ["Customers_test", "Customers_inactive"];

    layerTitles.forEach(title => {
      const layer = view.map.layers.find(l => l.title === title);
      
      if (layer) {
        if (enabled) {
          // 1. Cache the original setup
          if (!originalRenderersRef.current[layer.id]) {
            originalRenderersRef.current[layer.id] = layer.renderer;
            originalReductionRef.current[layer.id] = layer.featureReduction;
          }
        } else {
          // 2. Restore the original setup when turned off
          if (originalRenderersRef.current[layer.id]) {
            layer.renderer = originalRenderersRef.current[layer.id];
            layer.featureReduction = originalReductionRef.current[layer.id];
          }
        }
      }
    });
  };

  useEffect(() => {
    if (!view || !view.map || !isDensityEnabled) return;

    const layerTitles = ["Customers_test", "Customers_inactive"];

    layerTitles.forEach(title => {
      const layer = view.map.layers.find(l => l.title === title);
      
      if (layer) {
        // 1. Assign the strict colors to the specific states
        layer.renderer = {
          type: "unique-value",
          field: "alarmstate",
          defaultSymbol: { type: "simple-marker", color: "gray", size: "8px" },
          uniqueValueInfos: [
            { value: "2", symbol: { type: "simple-marker", color: "red", size: "12px", outline: null } },
            { value: "4", symbol: { type: "simple-marker", color: "yellow", size: "12px", outline: null } },
            { value: "3", symbol: { type: "simple-marker", color: "black", size: "12px", outline: null } },
            { value: "1", symbol: { type: "simple-marker", color: "blue", size: "12px", outline: null } }
          ]
        };

        // 2. Turn on Predominance Clustering
        // ArcGIS will automatically color the cluster based on whichever alarm state is most dense inside it!
        layer.featureReduction = {
          type: "cluster",
          clusterRadius: `${clusterRadius}px`, // User adjusts how wide an area to check
          clusterMinSize: "24px",
          clusterMaxSize: "60px",
          labelingInfo: [{
            labelPlacement: "center-center",
            labelExpressionInfo: { 
              // Shows the total number of faults inside this dominant color zone
              expression: "$feature.cluster_count" 
            },
            symbol: {
              type: "text",
              color: "white",
              haloColor: "black",
              haloSize: "1px",
              font: { weight: "bold", size: "14px" }
            }
          }]
        };
      }
    });
  }, [clusterRadius, isDensityEnabled, view]); 

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <CalciteLabel layout="inline" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 0 }}>
        <span style={{ fontWeight: "bold" }}>Alarm Density Regions</span>
        <CalciteSwitch 
          checked={isDensityEnabled ? true : undefined} 
          onCalciteSwitchChange={toggleDensity} 
        />
      </CalciteLabel>
      
      {isDensityEnabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
          
          <CalciteLabel>
            Region Radius (Density Size)
            <CalciteSlider
              min={30}
              max={150}
              value={clusterRadius}
              step={5}
              onCalciteSliderChange={(e) => setClusterRadius(e.target.value)} 
            />
          </CalciteLabel>

         <CalciteNotice icon="analysis" open scale="s" style={{ marginTop: "0.5rem" }}>
  <div slot="message">
    Map portions are colored based on the highest density alarm in that area:
    <ul 
      style={{ 
        margin: "10px 0 0 0", 
        padding: 0, 
        listStyle: "none", // Removes the default HTML bullets
        display: "flex", 
        flexDirection: "column", 
        gap: "6px" 
      }}
    >
      <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* Color Swatch */}
        <span style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "red", display: "inline-block", flexShrink: 0 }}></span>
        <span>Linked Down</span>
      </li>
      <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#d1b000", display: "inline-block", flexShrink: 0 }}></span>
        <span>LOP</span>
      </li>
      <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "black", display: "inline-block", flexShrink: 0 }}></span>
        <span>GEM Packet Loss</span>
      </li>
      <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "blue", display: "inline-block", flexShrink: 0 }}></span>
        <span>Power Off</span>
      </li>
    </ul>
  </div>
</CalciteNotice>
        </div>
      )}
    </div>
  );
}