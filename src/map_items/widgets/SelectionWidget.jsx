import React, { useEffect, useRef, useState } from "react";
import { useArcGIS } from "../../context/MapContext";
import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import Polygon from "@arcgis/core/geometry/Polygon";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine";
import {
  CalciteButton,
  CalciteLabel,
  CalciteInputNumber,
  CalciteNotice,
  CalciteProgress
} from "@esri/calcite-components-react";
import {api} from "../../../url";

const MAX_AREA_SQKM = 10; 

export default function SelectionWidget() {
  const { view, layers, selectedFeatures, setSelectedFeatures } = useArcGIS();
  
  // State
  const [bufferDistance, setBufferDistance] = useState(0);
  const [bufferInput, setBufferInput] = useState("0");
  const [activeTool, setActiveTool] = useState(null);
  const [geometryType, setGeometryType] = useState(null);
  const [hasGeometry, setHasGeometry] = useState(false);
  const [selectionMode, setSelectionMode] = useState("layer"); 
  const [geometryInfo, setGeometryInfo] = useState(""); 
  
  // States for Loading & Errors
  const [loadingState, setLoadingState] = useState({ active: false, message: "", progress: null });
  const [errorMessage, setErrorMessage] = useState("");

  // Refs
  const sketchVM = useRef(null);
  const sketchLayer = useRef(null);
  const bufferLayer = useRef(null);
  const apiHighlightLayer = useRef(null);
  const highlightHandle = useRef(null); 
  const currentGeometry = useRef(null);
  const debounceTimer = useRef(null);
  const isSelfUpdate = useRef(false);

  const bufferDistanceRef = useRef(bufferDistance);
  const selectionModeRef = useRef(selectionMode);
  const executeRef = useRef();

  useEffect(() => {
    bufferDistanceRef.current = bufferDistance;
    selectionModeRef.current = selectionMode;
  }, [bufferDistance, selectionMode]);

  useEffect(() => {
    executeRef.current = executeSelection;
  }); 

  useEffect(() => {
    if (isSelfUpdate.current) {
        isSelfUpdate.current = false;
        return; 
    }
    const hasGraphics = sketchLayer.current && sketchLayer.current.graphics.length > 0;
    const isExternalClear = selectedFeatures && selectedFeatures.length === 0;

    if (isExternalClear && hasGraphics) {
        clearSelectionUI();
    }
  }, [selectedFeatures]); 

  useEffect(() => {
    if (!view || !view.map || !layers) return;

    sketchLayer.current = new GraphicsLayer({ listMode: "hide", title: "Sketch Graphics" });
    bufferLayer.current = new GraphicsLayer({ listMode: "hide", title: "Buffer Graphics", opacity: 0.5 });
    apiHighlightLayer.current = new GraphicsLayer({ listMode: "hide", title: "API Highlight Graphics" });
    
    view.map.addMany([bufferLayer.current, sketchLayer.current, apiHighlightLayer.current]);

    sketchVM.current = new SketchViewModel({
      view: view,
      layer: sketchLayer.current,
      updateOnGraphicClick: true,
      defaultUpdateOptions: { tool: "reshape", enableRotation: true, enableScaling: true, toggleToolOnClick: false },
      pointSymbol: { type: "simple-marker", style: "circle", color: [0, 255, 255, 1], size: "10px", outline: { color: [0, 0, 0, 0.5], width: 1 } },
      polylineSymbol: { type: "simple-line", color: [0, 255, 255, 1], width: 2, style: "solid" },
      polygonSymbol: { type: "simple-fill", color: [0, 255, 255, 0.2], style: "solid", outline: { color: [0, 255, 255, 1], width: 2 } }
    });

    const handleCreate = (event) => {
      if (event.state === "complete") {
        currentGeometry.current = event.graphic.geometry;
        setGeometryType(event.graphic.geometry.type);
        setHasGeometry(true);
        executeRef.current(event.graphic.geometry, bufferDistanceRef.current);
        setActiveTool(null);
      }
    };

    const handleUpdate = (event) => {
      const geom = event.graphics[0].geometry;
      currentGeometry.current = geom;
      if (event.state === "active") {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          executeRef.current(geom, bufferDistanceRef.current);
        }, 300); 
      } else if (event.state === "complete") {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        executeRef.current(geom, bufferDistanceRef.current);
      }
    };

    sketchVM.current.on("create", handleCreate);
    sketchVM.current.on("update", handleUpdate);

    return () => {
      if (sketchVM.current) sketchVM.current.destroy();
      if (view && view.map) {
        view.map.remove(sketchLayer.current);
        view.map.remove(bufferLayer.current);
        view.map.remove(apiHighlightLayer.current);
      }
      if (highlightHandle.current) highlightHandle.current.remove();
    };
  }, [view, layers]); 

  useEffect(() => {
    if (currentGeometry.current) {
        executeSelection(currentGeometry.current, bufferDistance);
    }
  }, [bufferDistance, selectionMode]);

  const handleBufferInputChange = (e) => {
    const rawValue = e.target.value;
    setBufferInput(rawValue); 
    const numberVal = parseFloat(rawValue);
    if (!isNaN(numberVal)) {
        setBufferDistance(numberVal);
    } else if (rawValue === "") {
        setBufferDistance(0);
    }
  };

  const getSymbolForApiGeometry = (type) => {
    if (type === "point") return { type: "simple-marker", style: "circle", color: [0, 255, 255, 0.8], size: "8px", outline: { color: [0, 0, 0, 1], width: 1 } };
    if (type === "polyline") return { type: "simple-line", color: [0, 255, 255, 1], width: 3 };
    return { type: "simple-fill", color: [0, 255, 255, 0.4], outline: { color: [0, 255, 255, 1], width: 2 } };
  };

  const executeSelection = async (geometry, dist) => {
    const currentMode = selectionModeRef.current;
    if (currentMode === "layer" && (!layers || !layers.Customers_test)) return;

    setErrorMessage(""); 
    const safeDist = dist !== undefined ? dist : bufferDistance;
    let searchGeometry = geometry;
    
    if (bufferLayer.current) bufferLayer.current.removeAll();
    if (apiHighlightLayer.current) apiHighlightLayer.current.removeAll();
    if (highlightHandle.current) highlightHandle.current.remove();

    const canBuffer = geometry.type === "point" || geometry.type === "polyline";

    // Create Buffer if applicable
    if (canBuffer && safeDist > 0) {
      searchGeometry = geometryEngine.geodesicBuffer(geometry, safeDist, "meters");
      const bufferGraphic = new Graphic({
        geometry: searchGeometry,
        symbol: {
          type: "simple-fill",
          color: [255, 255, 0, 0.2], 
          outline: { color: [255, 255, 0, 1], width: 2, style: "dash" }
        }
      });
      bufferLayer.current.add(bufferGraphic);
    }

    // --- Calculate Display Metrics (Area / Length) ---
    if (searchGeometry.type === "polygon" || searchGeometry.type === "extent") {
      const polyToMeasure = searchGeometry.type === "extent" ? Polygon.fromExtent(searchGeometry) : searchGeometry;
      const areaSqM = geometryEngine.geodesicArea(polyToMeasure, "square-meters");
      if (areaSqM > 1000000) {
        setGeometryInfo(`${(areaSqM / 1000000).toFixed(2)} sq km`);
      } else {
        setGeometryInfo(`${areaSqM.toFixed(2)} sq meters`);
      }
    } else if (searchGeometry.type === "polyline") {
      const len = geometryEngine.geodesicLength(searchGeometry, "meters");
      setGeometryInfo(`${len.toFixed(2)} meters`);
    } else {
      setGeometryInfo("Point Location");
    }

    try {
      let finalFeatures = [];

      if (currentMode === "layer") {
        // Removed setLoadingState here so local view queries remain instant without UI flicker
        const query = layers.Customers_test.createQuery();
        query.geometry = searchGeometry;
        query.spatialRelationship = "intersects";
        query.returnGeometry = true;
        query.outFields = ["*"];

        const results = await layers.Customers_test.queryFeatures(query);
        finalFeatures = results.features;

        if (finalFeatures.length > 0) {
           const layerView = await view.whenLayerView(layers.Customers_test);
           highlightHandle.current = layerView.highlight(finalFeatures);
        }

      } else if (currentMode === "api") {
        const extent = searchGeometry.extent;
        
        // Block Massive Requests
       /*  const extentPolygon = Polygon.fromExtent(extent);
        const areaSqKm = geometryEngine.geodesicArea(extentPolygon, "square-kilometers"); */

        const areaSqKm = searchGeometry.type === "extent" 
        ? geometryEngine.geodesicArea(Polygon.fromExtent(searchGeometry), "square-kilometers")
        : geometryEngine.geodesicArea(searchGeometry, "square-kilometers");
        
        if (areaSqKm > MAX_AREA_SQKM) {
            setErrorMessage(`Selection bounding box (${areaSqKm.toFixed(2)} sq km) exceeds limit. Please draw an area smaller than ${MAX_AREA_SQKM} sq km.`);
            setLoadingState({ active: false, message: "", progress: null });
            return; 
        }

        const bboxStr = `${extent.xmin},${extent.ymin},${extent.xmax},${extent.ymax}`;
        const baseUrl = `${api}/geoserver/web_app/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=web_app%3ACustomers_test&outputFormat=application%2Fjson&maxFeatures=1000000`;
        const fetchUrl = `${baseUrl}&srsName=EPSG:3857&bbox=${bboxStr},EPSG:3857`;

        setLoadingState({ active: true, message: "Connecting to GIS Server...", progress: 0 });

        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error("GIS Server response failed");

        const reader = response.body.getReader();
        const contentLength = +response.headers.get('Content-Length');

        let receivedLength = 0;
        let chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          chunks.push(value);
          receivedLength += value.length;

          if (contentLength) {
             const progressDec = receivedLength / contentLength;
             const percentText = Math.round(progressDec * 100);
             setLoadingState({ active: true, message: `Downloading data: ${percentText}%`, progress: progressDec });
          } else {
             const mb = (receivedLength / (1024 * 1024)).toFixed(2);
             setLoadingState({ active: true, message: `Downloading data: ${mb} MB received...`, progress: null });
          }
        }

        setLoadingState({ active: true, message: "Processing & Rendering geometry...", progress: null });

        let chunksAll = new Uint8Array(receivedLength);
        let position = 0;
        for (let chunk of chunks) {
          chunksAll.set(chunk, position);
          position += chunk.length;
        }

        const text = new TextDecoder("utf-8").decode(chunksAll);
        const geojson = JSON.parse(text);

        if (geojson && geojson.features) {
          const parsedGraphics = geojson.features.map((f) => {
             const type = f.geometry.type;
             const coords = f.geometry.coordinates;
             let geomConfig = null;
             
             if (type === "Point") geomConfig = { type: "point", x: coords[0], y: coords[1], spatialReference: { wkid: 3857 } };
             else if (type === "LineString") geomConfig = { type: "polyline", paths: [coords], spatialReference: { wkid: 3857 } };
             else if (type === "Polygon") geomConfig = { type: "polygon", rings: coords, spatialReference: { wkid: 3857 } };
             
             if (!geomConfig) return null;

             return new Graphic({
               geometry: geomConfig,
               attributes: f.properties,
               symbol: getSymbolForApiGeometry(geomConfig.type)
             });
          }).filter(Boolean);

          finalFeatures = parsedGraphics.filter(g => geometryEngine.intersects(searchGeometry, g.geometry));
          apiHighlightLayer.current.addMany(finalFeatures);
        }
      }

      if (setSelectedFeatures) {
        isSelfUpdate.current = true; 
        setSelectedFeatures(finalFeatures);
      }
    } catch (error) {
      console.error("Selection error:", error);
      setErrorMessage("Failed to process selection: " + error.message);
    } finally {
      // This will clear the API loading state safely, and does nothing harmful if it was already false from the local view query
      setLoadingState({ active: false, message: "", progress: null });
    }
  };

  const startTool = (toolName) => {
    if (!sketchVM.current) return;
    clearSelectionUI();
    setErrorMessage("");
    
    if (toolName !== "point" && toolName !== "line") {
        setGeometryType("polygon"); 
    } else {
        setGeometryType(toolName === "line" ? "polyline" : "point");
    }
    setActiveTool(toolName);

    switch (toolName) {
      case "point": sketchVM.current.create("point"); break;
      case "line": sketchVM.current.create("polyline"); break;
      case "rectangle": sketchVM.current.create("rectangle"); break;
      case "polygon": sketchVM.current.create("polygon"); break;
      case "lasso": sketchVM.current.create("polygon", { mode: "freehand" }); break;
      default: break;
    }
  };

  const clearSelectionUI = () => {
    if (sketchLayer.current) sketchLayer.current.removeAll();
    if (bufferLayer.current) bufferLayer.current.removeAll();
    if (apiHighlightLayer.current) apiHighlightLayer.current.removeAll();
    if (highlightHandle.current) highlightHandle.current.remove();
    
    currentGeometry.current = null;
    setGeometryType(null);
    setHasGeometry(false);
    setBufferDistance(0);
    setBufferInput("0");
    setErrorMessage("");
    setGeometryInfo("");
  }

  const clearSelection = () => {
    clearSelectionUI();
    if (setSelectedFeatures) {
        isSelfUpdate.current = true; 
        setSelectedFeatures([]); 
    }
  };

  const isBufferEnabled = hasGeometry && (geometryType === "point" || geometryType === "polyline");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      
      {/* Target Scope Toggle */}
      <CalciteLabel>
        Selection Scope
        <select 
          value={selectionMode} 
          onChange={(e) => setSelectionMode(e.target.value)}
          style={{ 
            width: "100%", padding: "8px", marginTop: "6px", 
            backgroundColor: "#2b2b2b", color: "#dedede",
            border: "1px solid var(--calcite-ui-border-3)", borderRadius: "0px"
          }}
        >
          <option value="layer" style={{ color: "#dedede", backgroundColor: "#2b2b2b" }}>Current View</option>
          <option value="api" style={{ color: "#dedede", backgroundColor: "#2b2b2b" }}>All Customers</option>
        </select>
      </CalciteLabel>

      {/* Error Notice */}
      {errorMessage && (
        <CalciteNotice open icon="exclamation-mark-triangle" kind="danger">
          <div slot="message">{errorMessage}</div>
        </CalciteNotice>
      )}

      {/* Loading Progress */}
      {loadingState.active && (
        <div style={{ padding: "10px", backgroundColor: "rgba(0, 255, 255, 0.1)", border: "1px solid cyan", borderRadius: "4px" }}>
          <div style={{ fontSize: "0.85rem", marginBottom: "8px", color: "cyan" }}>
            {loadingState.message}
          </div>
          <CalciteProgress 
            type={loadingState.progress !== null ? "determinate" : "indeterminate"} 
            value={loadingState.progress !== null ? loadingState.progress : undefined} 
          />
        </div>
      )}

      {/* Geometry Area / Length Readout */}
      {hasGeometry && geometryInfo && (
        <div style={{ 
          padding: "8px 12px", 
          backgroundColor: "rgba(128, 128, 128, 0.1)", 
          borderLeft: "3px solid var(--calcite-ui-brand)",
          borderRadius: "4px", 
          fontSize: "0.85rem" 
        }}>
          <strong>Coverage: </strong> {geometryInfo}
        </div>
      )}

      {/* Buffer Input */}
      <CalciteLabel disabled={!isBufferEnabled ? true : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Buffer Distance (Meters)</span>
          {!isBufferEnabled && (
            <span style={{ fontSize: "0.75rem", color: "#efff00", fontStyle: "italic", fontWeight: "normal" }}>
              * Place a point or line to enable
            </span>
          )}
        </div>
        
        <CalciteInputNumber 
          value={bufferInput}
          min={0} 
          disabled={!isBufferEnabled ? true : undefined}
          onCalciteInputNumberInput={handleBufferInputChange}
          placeholder={isBufferEnabled ? "Enter distance (e.g. 100)" : "Feature required..."}
          suffix-text="m"
        />
      </CalciteLabel>

      {/* Drawing Tools */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <CalciteButton appearance={activeTool === "point" ? "solid" : "outline"} icon-start="pin" onClick={() => startTool("point")}>Point</CalciteButton>
        <CalciteButton appearance={activeTool === "line" ? "solid" : "outline"} icon-start="line" onClick={() => startTool("line")}>Line</CalciteButton>
        <CalciteButton appearance={activeTool === "rectangle" ? "solid" : "outline"} icon-start="extent" onClick={() => startTool("rectangle")}>Rect</CalciteButton>
        <CalciteButton appearance={activeTool === "polygon" ? "solid" : "outline"} icon-start="polygon" onClick={() => startTool("polygon")}>Poly</CalciteButton>
        <CalciteButton appearance={activeTool === "lasso" ? "solid" : "outline"} icon-start="freehand" onClick={() => startTool("lasso")}>Lasso</CalciteButton>
        <CalciteButton appearance="transparent" icon-start="x" color="red" onClick={clearSelection}>Clear</CalciteButton>
      </div>
    </div>
  );
}