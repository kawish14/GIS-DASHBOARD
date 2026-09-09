import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useArcGIS } from "../state/MapProvider";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import Expand from "@arcgis/core/widgets/Expand";

const MARKER_LAYER_TITLE = "Picked_Coordinate";

// Decimal degrees -> Degrees / Minutes / Seconds[cite: 2]
function toDms(value, positive, negative) {
  const hemisphere = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(2);
  return `${deg}° ${min}' ${sec}" ${hemisphere}`;
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn("Clipboard API blocked, falling back", err);
  }

  // Fallback for non-secure contexts where the Clipboard API is unavailable[cite: 2]
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch (err) {
    console.error("Copy failed", err);
    return false;
  }
}

export default function CoordinateWidget() {
  const { view, isRightPanelOpen, tableData } = useArcGIS();

  // The Expand widget takes ownership of this node and moves it into the
  // view UI, so it is created outside React's tree and filled with a
  // portal -- React never has to remove a node ArcGIS has relocated.[cite: 2]
  const [contentEl] = useState(() => document.createElement("div"));

  const readoutRef = useRef(null);
  const expandRef = useRef(null);
  const markerLayerRef = useRef(null);
  const pickingRef = useRef(false);

  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(null); // { lat, lon }[cite: 2]
  const [copied, setCopied] = useState(false);

  // Same rule the Dashboard uses to decide whether the table is on screen.[cite: 2]
  const isTableVisible = useMemo(
    () => !!tableData && Object.values(tableData).some((tab) => tab.isVisible),
    [tableData]
  );

  // Keep a ref copy so the map handler (registered once) always sees the
  // current mode without being torn down and rebuilt on every toggle.[cite: 2]
  useEffect(() => { pickingRef.current = picking; }, [picking]);

  // ==========================================
  // 1. EXPAND CONTAINER (open by default)[cite: 2]
  // ==========================================
  useEffect(() => {
    if (!view) return;

    const expand = new Expand({
      view,
      content: contentEl,
      expanded: true,
      expandIcon: "pin",
      expandTooltip: "Coordinates",
      collapseTooltip: "Hide coordinates",
      mode: "floating",
    });

    expandRef.current = expand;
    view.ui.add(expand, "bottom-right");

    return () => {
      expandRef.current = null;
      view.ui.remove(expand);
      expand.destroy();
    };
  }, [view, contentEl]);

  // Give way to whatever else needs the screen: collapse while the right
  // sidebar or the data table is open, and come back when they close.[cite: 2]
  useEffect(() => {
    const expand = expandRef.current;
    if (!expand || expand.destroyed) return;
    expand.expanded = !(isRightPanelOpen || isTableVisible);
  }, [isRightPanelOpen, isTableVisible]);

  // ==========================================
  // 2. LIVE READOUT (pointer position / map centre)[cite: 2]
  // ==========================================
  useEffect(() => {
    if (!view) return;

    const updateCoordinates = (point) => {
      if (!point || !readoutRef.current) return;

      const lat = point.latitude.toFixed(6);
      const lon = point.longitude.toFixed(6);
      const scale = Math.round(view.scale);
      const zoom = view.zoom.toFixed(0);

      // textContent (not innerHTML) keeps the childList MutationObserver quiet[cite: 2]
      readoutRef.current.textContent = `Lat/Lon ${lat} ${lon} | Scale 1:${scale} | Zoom ${zoom}`;
    };

    const handles = [];
    let animationFrameId;

    const stationaryHandle = view.watch("stationary", (isStationary) => {
      if (isStationary && view.center) updateCoordinates(view.center);
    });
    handles.push(stationaryHandle);

    const pointerHandle = view.on("pointer-move", (evt) => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);

      animationFrameId = requestAnimationFrame(() => {
        if (!view) return;
        updateCoordinates(view.toMap({ x: evt.x, y: evt.y }));
        animationFrameId = null;
      });
    });
    handles.push(pointerHandle);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      handles.forEach((handle) => handle.remove());
    };
  }, [view]);

  // ==========================================
  // 3. COORDINATE PICKER (click anywhere on the map)[cite: 2]
  // ==========================================
  useEffect(() => {
    if (!view) return;

    const ensureMarkerLayer = () => {
      if (!markerLayerRef.current || markerLayerRef.current.destroyed) {
        markerLayerRef.current = new GraphicsLayer({
          title: MARKER_LAYER_TITLE,
          listMode: "hide",
          legendEnabled: false,
        });
        view.map.add(markerLayerRef.current);
      }
      const index = view.map.layers.indexOf(markerLayerRef.current);
      if (index > -1 && index !== view.map.layers.length - 1) {
        view.map.reorder(markerLayerRef.current, view.map.layers.length - 1);
      }
      return markerLayerRef.current;
    };

    const drawMarker = (lat, lon) => {
      const markerLayer = ensureMarkerLayer();
      markerLayer.removeAll();

      const geometry = { type: "point", longitude: lon, latitude: lat };

      markerLayer.addMany([
        new Graphic({
          geometry,
          symbol: {
            type: "simple-marker",
            style: "circle",
            color: [0, 0, 0, 0],
            size: 20,
            outline: { color: [255, 255, 255, 0.95], width: 1.5 },
          },
        }),
        new Graphic({
          geometry,
          symbol: {
            type: "simple-marker",
            style: "cross",
            color: [255, 255, 255, 1],
            size: 20,
            outline: { color: [17, 24, 39, 0.9], width: 1.5 },
          },
        }),
        new Graphic({
          geometry,
          symbol: {
            type: "text",
            text: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
            color: [255, 255, 255, 1],
            haloColor: [0, 0, 0, 0.85],
            haloSize: 1.5,
            font: { size: 10, family: "sans-serif", weight: "bold" },
            yoffset: -22,
          },
        }),
      ]);

      return geometry;
    };

    // "immediate-click" is emitted before "click", so stopping propagation
    // here keeps GlobalClickHandler (popups / parcel lookup) out of the way
    // while the picker is armed.[cite: 2]
    const clickHandle = view.on("immediate-click", (evt) => {
      const isShortcut = evt.native?.shiftKey;
      if (!pickingRef.current && !isShortcut) return;

      evt.stopPropagation();

      const { latitude, longitude } = evt.mapPoint;
      setPicked({ lat: latitude, lon: longitude });
      setCopied(false);
      drawMarker(latitude, longitude); // Automatically updates marker graphics[cite: 2]
      setPicking(false);
      
      // Removed automatic view.goTo() so the map no longer jumps on click[cite: 2]
    });

    return () => {
      clickHandle.remove();
      if (markerLayerRef.current) {
        view.map?.remove(markerLayerRef.current);
        if (!markerLayerRef.current.destroyed) markerLayerRef.current.destroy();
        markerLayerRef.current = null;
      }
    };
  }, [view]);

  // Crosshair cursor while the picker is armed[cite: 2]
  useEffect(() => {
    if (!view?.container) return;
    view.container.style.cursor = picking ? "crosshair" : "";
    return () => { if (view?.container) view.container.style.cursor = ""; };
  }, [view, picking]);

  const handleCopy = async () => {
    if (!picked) return;
    const ok = await copyText(`${picked.lat.toFixed(6)}, ${picked.lon.toFixed(6)}`);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 1500);
  };

  const handleClear = () => {
    setPicked(null);
    setCopied(false);
    setPicking(false);
    if (markerLayerRef.current && !markerLayerRef.current.destroyed) {
      markerLayerRef.current.removeAll();
    }
  };

  const handleZoomTo = () => {
    if (!picked || !view) return;
    
    // Added explicit spatial reference to accurately locate the target[cite: 2]
    view.goTo({ 
      target: { 
        type: "point", 
        longitude: picked.lon, 
        latitude: picked.lat, 
        spatialReference: { wkid: 4326 } 
      }, 
      zoom: 18 
    }).catch((err) => { 
      if (err.name !== "AbortError") console.error("Zoom failed", err); 
    });
  };

  // --- Styles (kept inline, matching the widget's existing look) ---[cite: 2]
  const wrapperStyle = {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    color: "white",
    fontSize: "80%",
    borderRadius: "4px",
    padding: "7px 10px",
    minWidth: "260px",
    pointerEvents: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  };

  const buttonStyle = (active, disabled) => ({
    padding: "4px 8px",
    borderRadius: "3px",
    border: active ? "1px solid rgba(255,255,255,0.85)" : "1px solid rgba(255,255,255,0.3)",
    background: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.08)",
    color: active ? "#111827" : "#ffffff",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
    fontSize: "11px",
    fontWeight: 600,
    lineHeight: 1.2,
  });

  return createPortal(
    <div id="coordsWidget" style={wrapperStyle}>
      <div ref={readoutRef} style={{ whiteSpace: "nowrap", pointerEvents: "none" }}>
        Loading coordinates...
      </div>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <button type="button" style={buttonStyle(picking)} onClick={() => setPicking((p) => !p)}>
          {picking ? "Click map..." : "Get Coordinates"}
        </button>
        <button type="button" style={buttonStyle(false, !picked)} onClick={handleCopy} disabled={!picked}>
          {copied ? "Copied" : "Copy"}
        </button>
    {/*     <button type="button" style={buttonStyle(false, !picked)} onClick={handleZoomTo} disabled={!picked}>
          Zoom
        </button> */}
        <button type="button" style={buttonStyle(false, !picked && !picking)} onClick={handleClear} disabled={!picked && !picking}>
          Clear
        </button>
      </div>

      {picked ? (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: "5px", lineHeight: 1.5 }}>
          <div style={{ fontFamily: "monospace" }}>
            {picked.lat.toFixed(6)}, {picked.lon.toFixed(6)}
          </div>
          <div style={{ opacity: 0.7, fontSize: "10px" }}>
            {toDms(picked.lat, "N", "S")} &nbsp; {toDms(picked.lon, "E", "W")}
          </div>
        </div>
      ) : (
        <div style={{ opacity: 0.6, fontSize: "10px", pointerEvents: "none" }}>
          Click "Get Coordinates" then click the map (or Shift + Click anywhere).
        </div>
      )}  
    </div>,
    contentEl
  );
}