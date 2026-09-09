import React, { useState, useRef, useEffect } from "react";
import { 
  CalciteLabel, 
  CalciteSwitch, 
  CalciteNotice,
  CalciteSlider
} from "@esri/calcite-components-react";
import { useArcGIS } from "../state/MapProvider";

export default function DensityMapToggle() {
  const { view } = useArcGIS();
  const [isDensityEnabled, setIsDensityEnabled] = useState(false);
  const [clusterRadius, setClusterRadius] = useState(80); 
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
          if (!originalRenderersRef.current[layer.id]) {
            originalRenderersRef.current[layer.id] = layer.renderer;
            originalReductionRef.current[layer.id] = layer.featureReduction;
          }
        } else {
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
        layer.featureReduction = {
          type: "cluster",
          clusterRadius: `${clusterRadius}px`,
          clusterMinSize: "24px",
          clusterMaxSize: "60px",
          labelingInfo: [{
            labelPlacement: "center-center",
            labelExpressionInfo: { expression: "$feature.cluster_count" },
            symbol: {
              type: "text", color: "white", haloColor: "black", haloSize: "1px", font: { weight: "bold", size: "12px" }
            }
          }]
        };
      }
    });
  }, [clusterRadius, isDensityEnabled, view]); 

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <CalciteLabel scale="m" layout="inline" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 0 }}>
        <span style={{ fontWeight: "bold", fontSize: "0.85rem" }}>Alarm Density Regions</span>
        <CalciteSwitch scale="m" checked={isDensityEnabled ? true : undefined} onCalciteSwitchChange={toggleDensity} />
      </CalciteLabel>
      
      {isDensityEnabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
          <CalciteLabel scale="m">
            Region Radius (Density Size)
            <CalciteSlider scale="m" min={30} max={150} value={clusterRadius} step={5} onCalciteSliderChange={(e) => setClusterRadius(e.target.value)} />
          </CalciteLabel>

         <CalciteNotice scale="m" icon="analysis" open style={{ marginTop: "0.5rem" }}>
          <div slot="message">
            Map portions are colored based on the highest density alarm in that area:
            <ul style={{ margin: "10px 0 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
              <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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