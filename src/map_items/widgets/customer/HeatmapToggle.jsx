import React, { useState, useRef, useEffect } from "react";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import { 
  CalciteLabel, 
  CalciteSwitch, 
  CalciteNotice,
  CalciteSlider,
  CalciteSelect,
  CalciteOption,
  CalciteLoader
} from "@esri/calcite-components-react";
import { useArcGIS } from "../../../context/MapContext";

export default function HeatmapToggle() {
  const { view } = useArcGIS();
  
  // States
  const [isHeatmapEnabled, setIsHeatmapEnabled] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState("duration"); // Default to Duration
  const [blurRadius, setBlurRadius] = useState(10);
  const [maxIntensity, setMaxIntensity] = useState(1500); // Higher default for minutes
  const [isCalculating, setIsCalculating] = useState(false); // Loading state for Blob creation
  
  const originalRenderersRef = useRef({}); 

  // Standard Heatmap color stops
  const getHeatmapStops = () => [
    { color: "rgba(0, 64, 255, 0)", ratio: 0 },
    { color: "#472b77", ratio: 0.1 },      // Deep Purple
    { color: "#8b2da8", ratio: 0.3 },      // Magenta
    { color: "#d13691", ratio: 0.5 },      // Pink
    { color: "#f07f45", ratio: 0.7 },      // Orange
    { color: "#feb927", ratio: 0.9 },      // Yellow-Orange
    { color: "#eef152", ratio: 1 }         // Bright Yellow
  ];

  // --- Helper: Generate Frontend GeoJSON Blob with Duration ---
  const generateDurationProxyLayer = async (originalLayer) => {
    // 1. Query all features currently loaded on the layer
    const query = originalLayer.createQuery();
    query.where = "1=1"; 
    query.outFields = ["*"];
    query.returnGeometry = true;
    
    const featureSet = await originalLayer.queryFeatures(query);
    const now = new Date();
    
    // 2. Calculate duration_mins for every feature manually
    const geoJsonFeatures = featureSet.features.map(f => {
        const faultTimeStr = f.attributes.fault_time;
        let durationMins = 0;
        
        if (faultTimeStr) {
            const faultTime = new Date(faultTimeStr);
            if (!isNaN(faultTime.getTime())) {
                const diffMs = now - faultTime;
                if (diffMs > 0) {
                    durationMins = Math.floor(diffMs / 60000); // Convert to minutes
                }
            }
        }
        
        return {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [f.geometry.longitude, f.geometry.latitude]
            },
            properties: {
                ...f.attributes,
                duration_mins: durationMins // INJECT THE NEW FIELD HERE
            }
        };
    });

    // 3. Create a Blob URL from the JSON
    const geoJsonData = { type: "FeatureCollection", features: geoJsonFeatures };
    const blob = new Blob([JSON.stringify(geoJsonData)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // 4. Return a new temporary GeoJSON layer pointing to the local Blob
    return new GeoJSONLayer({
        url: url,
        title: `${originalLayer.title}_heatmap_proxy`,
        definitionExpression: originalLayer.definitionExpression, // Sync user filters!
        renderer: {
            type: "heatmap",
            field: "duration_mins", // Now we can use the field!
            colorStops: getHeatmapStops(),
            maxPixelIntensity: maxIntensity,
            minPixelIntensity: 0,
            blurRadius: blurRadius
        }
    });
  };

  // --- Effect 1: Handle Master Toggle & Mode Switching ---
  useEffect(() => {
    if (!view || !view.map) return;

    const layerTitles = ["Customers_test", "Customers_inactive"];

    const applyState = async () => {
      // TEARDOWN: If turned off, remove proxies and restore originals
      if (!isHeatmapEnabled) {
        layerTitles.forEach(title => {
          const originalLayer = view.map.layers.find(l => l.title === title);
          if (originalLayer) {
             if (originalRenderersRef.current[originalLayer.id]) {
               originalLayer.renderer = originalRenderersRef.current[originalLayer.id];
             }
             originalLayer.visible = true; // Unhide original
          }
          // Delete Proxy Layer
          const proxyLayer = view.map.layers.find(l => l.title === `${title}_heatmap_proxy`);
          if (proxyLayer) view.map.remove(proxyLayer);
        });
        return;
      }

      // BUILD: Duration Mode (Frontend Proxy)
      if (heatmapMode === "duration") {
         setIsCalculating(true);
         for (const title of layerTitles) {
             const originalLayer = view.map.layers.find(l => l.title === title);
             if (!originalLayer) continue;

             if (!originalRenderersRef.current[originalLayer.id]) {
                originalRenderersRef.current[originalLayer.id] = originalLayer.renderer;
             }

             originalLayer.visible = false; // Hide original

             // Only build if it doesn't already exist
             let proxyLayer = view.map.layers.find(l => l.title === `${title}_heatmap_proxy`);
             if (!proxyLayer) {
                 proxyLayer = await generateDurationProxyLayer(originalLayer);
                 view.map.add(proxyLayer);
             } else {
                 // Keep filters in sync if user changed them in the sidebar
                 proxyLayer.definitionExpression = originalLayer.definitionExpression; 
             }
         }
         setIsCalculating(false);
      } 
      // BUILD: Severity & Density Modes (Native Layer Override)
      else {
         for (const title of layerTitles) {
             const originalLayer = view.map.layers.find(l => l.title === title);
             if (!originalLayer) continue;

             originalLayer.visible = true;

             // Remove proxy if switching back from Duration mode
             const proxyLayer = view.map.layers.find(l => l.title === `${title}_heatmap_proxy`);
             if (proxyLayer) view.map.remove(proxyLayer);

             if (!originalRenderersRef.current[originalLayer.id]) {
                originalRenderersRef.current[originalLayer.id] = originalLayer.renderer;
             }

             const newRenderer = {
                type: "heatmap",
                colorStops: getHeatmapStops(),
                maxPixelIntensity: maxIntensity,
                minPixelIntensity: 0,
                blurRadius: blurRadius
             };

             if (heatmapMode === "severity") {
                newRenderer.valueExpression = `
                  var state = Number($feature.alarmstate);
                  if (state == 2) return 10; // Linked Down
                  if (state == 4) return 7;  // LOP
                  if (state == 3) return 4;  // GEM Packet Loss
                  if (state == 1) return 1;  // Power Off
                  return 1;
                `;
             }

             originalLayer.renderer = newRenderer;
         }
      }
    };

    applyState();
  }, [isHeatmapEnabled, heatmapMode, view]);

  // --- Effect 2: Live UI Sliders (Updates without rebuilding Blobs) ---
  useEffect(() => {
    if (!view || !view.map || !isHeatmapEnabled || isCalculating) return;

    const layerTitles = ["Customers_test", "Customers_inactive"];

    layerTitles.forEach(title => {
       // Target the proxy for duration, or the original for severity/density
       const targetTitle = heatmapMode === "duration" ? `${title}_heatmap_proxy` : title;
       const targetLayer = view.map.layers.find(l => l.title === targetTitle);

       if (targetLayer && targetLayer.renderer && targetLayer.renderer.type === "heatmap") {
          // Clone the renderer to force ArcGIS to refresh the map UI
          const updatedRenderer = targetLayer.renderer.clone();
          updatedRenderer.maxPixelIntensity = maxIntensity;
          updatedRenderer.blurRadius = blurRadius;
          targetLayer.renderer = updatedRenderer;
       }
    });
  }, [blurRadius, maxIntensity]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <CalciteLabel layout="inline" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 0 }}>
        <span style={{ fontWeight: "bold" }}>Outage Heatmap</span>
        <CalciteSwitch 
          checked={isHeatmapEnabled ? true : undefined} 
          onCalciteSwitchChange={(e) => setIsHeatmapEnabled(e.target.checked)} 
        />
      </CalciteLabel>
      
      {isHeatmapEnabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
          
          <CalciteLabel>
            Heatmap Mode
            <CalciteSelect 
              value={heatmapMode} 
              onCalciteSelectChange={(e) => setHeatmapMode(e.target.value)}
              disabled={isCalculating}
            >
              <CalciteOption label="Time-Weighted (SLA Risk)" value="duration" />
              <CalciteOption label="Severity (Prioritize Alarms)" value="severity" />
              <CalciteOption label="Pure Density (Volume Only)" value="density" />
            </CalciteSelect>
          </CalciteLabel>

          {isCalculating && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--calcite-ui-brand)" }}>
              <CalciteLoader scale="s" inline /> <span>Calculating live fault durations...</span>
            </div>
          )}

          <CalciteLabel>
            Blur Radius: {blurRadius}
            <CalciteSlider
              min={1}
              max={50}
              value={blurRadius}
              step={1}
              onCalciteSliderChange={(e) => setBlurRadius(e.target.value)} 
              disabled={isCalculating}
            />
          </CalciteLabel>

          <CalciteLabel>
            Max Intensity: {maxIntensity}
            <CalciteSlider
              min={10}
              max={3000} // Expanded max heavily to accommodate high minute counts (e.g. 1440 mins = 24hrs)
              value={maxIntensity}
              step={50}
              onCalciteSliderChange={(e) => setMaxIntensity(e.target.value)}
              disabled={isCalculating}
            />
          </CalciteLabel>

          <CalciteNotice 
            icon={heatmapMode === "duration" ? "clock" : heatmapMode === "severity" ? "hazard" : "lightbulb"} 
            open 
            scale="s" 
            style={{ marginTop: "0.5rem" }}
          >
            <div slot="message">
              {heatmapMode === "duration" && "Customers offline the longest generate the most heat, highlighting SLA risks."}
              {heatmapMode === "severity" && "'Linked Down' and 'LOP' faults generate significantly more heat."}
              {heatmapMode === "density" && "Visualizing total outage volume regardless of type or time."}
            </div>
          </CalciteNotice>
        </div>
      )}
    </div>
  );
}