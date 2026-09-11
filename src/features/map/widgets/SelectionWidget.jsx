/**
 * Selection Tools -- draw a shape, get the features inside it.
 *
 * Which features depends on the map, not on this file: every layer that is
 * *visible* and marked "Include in selection" in the layer list is queried,
 * and each one that hits gets its own tab in the feature table. Customers are
 * the only layers on by default (see LayersContext), so out of the box this
 * behaves as it always did -- but a layer switched off in the layer list is
 * now genuinely out of the selection, where before the customer layer was
 * queried whether or not anyone could see it.
 *
 * The output is a *set of features*: highlighted on the map and pushed to the
 * table. It deliberately reports nothing about the shape itself -- how long
 * the line was or how many square kilometres the polygon covered is the
 * measure tool's job (widgets/MeasurementWidget.jsx), and showing both here is
 * what made the two tools read as the same thing.
 *
 * Selection graphics are cyan and solid; measurement graphics are amber and
 * dashed. Both sketch on the same MapView, so they hand the map back and forth
 * through state/mapDrawLock.js.
 */
import React, { useEffect, useRef, useState } from "react";
import { useArcGIS } from "../state/MapProvider";
import { claimDrawTool, releaseDrawTool, onDrawToolChange } from "../state/mapDrawLock";
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
import { api } from "../../../shared/config/runtimeConfig";
import { customerColumns } from '../../../shared/constants/tableColumns'
import { layerLabel, OLT_CUSTOMER_LAYER_TITLE } from "../../../shared/constants/layerLabels";
import { selectableLayerEntries } from "../state/selectableLayers";

const MAX_AREA_SQKM = 10; 

// This widget's id in the shared draw lock (state/mapDrawLock.js).
const SELECTION_TOOL_ID = "selection";

// Every table tab this widget owns starts with this, so it can find and drop
// its own tabs without touching anyone else's -- there is one per layer now.
const SELECTION_TAB_PREFIX = "selection:";

// The layers whose rows the shared customer column set describes. Anything
// else gets the table's auto-generated columns, which is the right answer for
// a cable or a cabinet.
const CUSTOMER_COLUMN_LAYERS = new Set(["Customers_test", OLT_CUSTOMER_LAYER_TITLE]);

// Shown next to the result count so the user can see which shape produced it.
const SHAPE_LABELS = {
  point: "Point",
  line: "Line",
  rectangle: "Rectangle",
  polygon: "Polygon",
  lasso: "Lasso",
};

export default function SelectionWidget() {
  // --- CHANGED: Now pulling tableData, addTableData, removeTableData ---
  const { view, layers, isLayerSelectable, tableData, addTableData, removeTableData } = useArcGIS();
  
  const [bufferDistance, setBufferDistance] = useState(0);
  const [bufferInput, setBufferInput] = useState("0");
  const [activeTool, setActiveTool] = useState(null);
  const [geometryType, setGeometryType] = useState(null);
  const [hasGeometry, setHasGeometry] = useState(false);
  const [selectionMode, setSelectionMode] = useState("layer"); 
  // What the last run caught -- a feature count, not a measurement of the shape.
  const [resultInfo, setResultInfo] = useState(null); 
  
  const [loadingState, setLoadingState] = useState({ active: false, message: "", progress: null });
  const [errorMessage, setErrorMessage] = useState("");

  const sketchVM = useRef(null);
  const sketchLayer = useRef(null);
  const bufferLayer = useRef(null);
  const apiHighlightLayer = useRef(null);
  // One handle per layer that returned something -- highlights are per layer
  // view, so a multi-layer result needs a handle each.
  const highlightHandles = useRef([]);
  // The tab ids the last run created, so clearing removes exactly those.
  const selectionTabIds = useRef([]);
  const currentGeometry = useRef(null);
  const debounceTimer = useRef(null);
  const isSelfUpdate = useRef(false);
  const activeShape = useRef(null);

  const bufferDistanceRef = useRef(bufferDistance);
  const selectionModeRef = useRef(selectionMode);
  const executeRef = useRef();
  // Read inside the async run, which outlives the render that started it.
  const isLayerSelectableRef = useRef(isLayerSelectable);

  useEffect(() => {
    bufferDistanceRef.current = bufferDistance;
    selectionModeRef.current = selectionMode;
    isLayerSelectableRef.current = isLayerSelectable;
  }, [bufferDistance, selectionMode, isLayerSelectable]);

  useEffect(() => {
    executeRef.current = executeSelection;
  }); 

  // Someone closed our tabs from the table -- drop the sketch with them, so
  // the map isn't left showing a shape whose results have gone. Joined into a
  // string because the set of ids is what matters, not the array's identity.
  const openSelectionTabs = Object.keys(tableData || {})
    .filter((id) => id.startsWith(SELECTION_TAB_PREFIX))
    .sort()
    .join("|");
  useEffect(() => {
    if (isSelfUpdate.current) {
        isSelfUpdate.current = false;
        return; 
    }
    const hasGraphics = sketchLayer.current && sketchLayer.current.graphics.length > 0;

    if (openSelectionTabs === "" && hasGraphics) {
        clearSelectionUI();
    }
  }, [openSelectionTabs]); 

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
        releaseDrawTool(SELECTION_TOOL_ID);
      } else if (event.state === "cancel") {
        setActiveTool(null);
        releaseDrawTool(SELECTION_TOOL_ID);
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
      releaseDrawTool(SELECTION_TOOL_ID);
      if (sketchVM.current) sketchVM.current.destroy();
      if (view && view.map) {
        view.map.remove(sketchLayer.current);
        view.map.remove(bufferLayer.current);
        view.map.remove(apiHighlightLayer.current);
      }
      clearHighlights();
    };
  }, [view, layers]); 

  // Another tool claimed the map -- drop the half-drawn shape rather than
  // letting the next click land in two sketches at once.
  useEffect(
    () =>
      onDrawToolChange((owner) => {
        if (owner === SELECTION_TOOL_ID) return;
        if (sketchVM.current?.state === "active") sketchVM.current.cancel();
        setActiveTool(null);
      }),
    []
  );

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

  /** Drops every layer-view highlight the last run put on the map. */
  const clearHighlights = () => {
    highlightHandles.current.forEach((handle) => handle?.remove());
    highlightHandles.current = [];
  };

  /** Removes the tabs the last run opened, leaving everyone else's alone. */
  const clearSelectionTabs = () => {
    if (!removeTableData || selectionTabIds.current.length === 0) return;
    isSelfUpdate.current = true;
    selectionTabIds.current.forEach((id) => removeTableData(id));
    selectionTabIds.current = [];
  };

  // Visible, marked "Include in selection", and able to answer a spatial query
  // -- the rule itself lives in state/selectableLayers.js, where it is testable
  // and where the layer list reads the same defaults from.
  const selectionTargets = () => selectableLayerEntries(layers, isLayerSelectableRef.current);

  const executeSelection = async (geometry, dist) => {
    const currentMode = selectionModeRef.current;
    const targets = currentMode === "layer" ? selectionTargets() : [];

    if (currentMode === "layer" && targets.length === 0) {
      clearHighlights();
      clearSelectionTabs();
      setResultInfo(null);
      setErrorMessage(
        "No layer is available to select from. Switch a layer on and turn on \"Include in selection\" for it in the layer list."
      );
      return;
    }

    setErrorMessage(""); 
    const safeDist = dist !== undefined ? dist : bufferDistance;
    let searchGeometry = geometry;
    
    if (bufferLayer.current) bufferLayer.current.removeAll();
    if (apiHighlightLayer.current) apiHighlightLayer.current.removeAll();
    clearHighlights();

    const canBuffer = geometry.type === "point" || geometry.type === "polyline";

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

    try {
      let finalFeatures = [];
      // [{ title, features }] for the layer mode -- one entry per layer that
      // caught something, which is one tab each.
      let perLayer = [];

      if (currentMode === "layer") {
        const hits = await Promise.all(
          targets.map(async ([title, layer]) => {
            const query = layer.createQuery();
            query.geometry = searchGeometry;
            query.spatialRelationship = "intersects";
            query.returnGeometry = true;
            query.outFields = ["*"];

            try {
              const results = await layer.queryFeatures(query);
              return { title, layer, features: results.features };
            } catch (err) {
              // One layer refusing a spatial query (an odd geometry type, a
              // server hiccup) must not lose the layers that did answer.
              console.error(`Selection query failed on ${title}:`, err);
              return { title, layer, features: [] };
            }
          })
        );

        perLayer = hits.filter((hit) => hit.features.length > 0);
        finalFeatures = perLayer.flatMap((hit) => hit.features);

        await Promise.all(
          perLayer.map(async ({ layer, features }) => {
            try {
              const layerView = await view.whenLayerView(layer);
              highlightHandles.current.push(layerView.highlight(features));
            } catch (err) {
              console.error("Could not highlight selection:", err);
            }
          })
        );

      } else if (currentMode === "api") {
        const extent = searchGeometry.extent;
        
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
          // The server fetch is customers and only customers, so it is one
          // tab like it always was.
          perLayer = finalFeatures.length > 0
            ? [{ title: "Customers_test", features: finalFeatures }]
            : [];
        }
      }

      // The tabs from the previous run go before the new ones land: a shape
      // dragged off a layer's features must not leave that layer's tab behind
      // claiming they are still selected.
      clearSelectionTabs();

      // Only open the table when the selection actually hit something.
      // addTableData() forces isVisible: true, so pushing an empty result
      // set here opened the bottom panel on an empty tab.
      if (finalFeatures.length > 0) {
        setResultInfo({
          count: finalFeatures.length,
          shape: SHAPE_LABELS[activeShape.current] || "Shape",
          layers: perLayer.map(({ title, features }) => ({ label: layerLabel(title), count: features.length })),
        });

        if (addTableData) {
          isSelfUpdate.current = true;
          selectionTabIds.current = perLayer.map(({ title, features }) => {
            const tabId = `${SELECTION_TAB_PREFIX}${title}`;
            addTableData(
              tabId,
              `Selection · ${layerLabel(title)}`,
              features,
              // Auto-generated columns are the right answer for everything the
              // customer column set does not describe.
              CUSTOMER_COLUMN_LAYERS.has(title) ? customerColumns : undefined
            );
            return tabId;
          });
        }
      } else {
        setResultInfo(null);
        setErrorMessage("Nothing found in the selected area.");
      }

    } catch (error) {
      console.error("Selection error:", error);
      setErrorMessage("Failed to process selection: " + error.message);
    } finally {
      setLoadingState({ active: false, message: "", progress: null });
    }
  };

  const startTool = (toolName) => {
    if (!sketchVM.current) return;
    clearSelectionUI();
    setErrorMessage("");
    // Cancel our own half-drawn shape first -- that fires handleCreate("cancel"),
    // which releases the lock, so claiming afterwards is what sticks. The claim
    // then cancels any unfinished measurement, leaving one live sketch.
    if (sketchVM.current.state === "active") sketchVM.current.cancel();
    claimDrawTool(SELECTION_TOOL_ID);
    activeShape.current = toolName;
    
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
    clearHighlights();
    
    currentGeometry.current = null;
    setGeometryType(null);
    setHasGeometry(false);
    setBufferDistance(0);
    setBufferInput("0");
    setErrorMessage("");
    setResultInfo(null);
  }

  const clearSelection = () => {
    if (sketchVM.current?.state === "active") sketchVM.current.cancel();
    releaseDrawTool(SELECTION_TOOL_ID);
    setActiveTool(null);
    activeShape.current = null;
    clearSelectionUI();
    clearSelectionTabs();
  };

  const isBufferEnabled = hasGeometry && (geometryType === "point" || geometryType === "polyline");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ fontSize: "0.78rem", color: "#9aa0a6", lineHeight: 1.4 }}>
        Draws a shape and returns what is inside it, from every visible layer
        marked <strong>Include in selection</strong> in the layer list
        (customers, unless you say otherwise). For lengths and areas, use{" "}
        <strong>Measure Tools</strong>.
      </div>

      <CalciteLabel>
        Selection Scope
        <select 
          value={selectionMode} 
          onChange={(e) => setSelectionMode(e.target.value)}
          style={{ width: "100%", padding: "8px", marginTop: "6px", backgroundColor: "#2b2b2b", color: "#dedede", border: "1px solid var(--calcite-ui-border-3)", borderRadius: "0px" }}
        >
          <option value="layer" style={{ color: "#dedede", backgroundColor: "#2b2b2b" }}>Layers on the map</option>
          <option value="api" style={{ color: "#dedede", backgroundColor: "#2b2b2b" }}>All customers (server)</option>
        </select>
      </CalciteLabel>

      {errorMessage && (
        <CalciteNotice open icon="exclamation-mark-triangle" kind="danger">
          <div slot="message">{errorMessage}</div>
        </CalciteNotice>
      )}

      {loadingState.active && (
        <div style={{ padding: "10px", backgroundColor: "rgba(0, 255, 255, 0.1)", border: "1px solid cyan", borderRadius: "4px" }}>
          <div style={{ fontSize: "0.85rem", marginBottom: "8px", color: "cyan" }}>
            {loadingState.message}
          </div>
          <CalciteProgress type={loadingState.progress !== null ? "determinate" : "indeterminate"} value={loadingState.progress !== null ? loadingState.progress : undefined} />
        </div>
      )}

      {hasGeometry && resultInfo && (
        <div style={{ padding: "8px 12px", backgroundColor: "rgba(0, 255, 255, 0.08)", borderLeft: "3px solid rgba(0, 255, 255, 0.8)", borderRadius: "4px", fontSize: "0.85rem" }}>
          <strong>{resultInfo.count.toLocaleString()}</strong> feature{resultInfo.count === 1 ? "" : "s"} selected
          <span style={{ color: "#9aa0a6" }}> &middot; {resultInfo.shape}</span>

          {/* Which layer each one came from -- with several layers in play, a
              single total says nothing about what you actually caught. */}
          {resultInfo.layers?.length > 0 && (
            <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "#9aa0a6" }}>
              {resultInfo.layers.map(({ label, count }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                  <span>{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CalciteLabel disabled={!isBufferEnabled ? true : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Catch Radius (Meters)</span>
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
          placeholder={isBufferEnabled ? "Catch anything within (e.g. 100)" : "Feature required..."}
          suffix-text="m"
        />
      </CalciteLabel>

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