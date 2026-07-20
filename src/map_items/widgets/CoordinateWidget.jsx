import React, { useEffect, useRef } from "react";
import { useArcGIS } from "../../context/MapContext";

export default function CoordinateWidget() {
  const { view } = useArcGIS();
  const coordsWidget = useRef(null);

  useEffect(() => {
    // 1. Safety Checks
    if (!view || !coordsWidget.current) return;

    // 2. Add widget to UI
    view.ui.add(coordsWidget.current, "bottom-right");

    // --- Helper Function ---
    const updateCoordinates = (point) => {
      // Extra safety check: ensure the element is still in the DOM
      if (!point || !coordsWidget.current) return;
      
      const lat = point.latitude.toFixed(6);
      const lon = point.longitude.toFixed(6);
      const scale = Math.round(view.scale);
      const zoom = view.zoom.toFixed(0); 

      // FIX: Use textContent instead of innerHTML to prevent childList MutationObserver spam
      coordsWidget.current.textContent = `Lat/Lon ${lat} ${lon} | Scale 1:${scale} | Zoom ${zoom}`;
    };

    // 3. Store handles for cleanup
    const handles = [];
    let animationFrameId; // To track the pending update

    // Watch for stationary changes (Zoom/Pan end)
    const stationaryHandle = view.watch("stationary", (isStationary) => {
      if (isStationary && view.center) {
        updateCoordinates(view.center);
      }
    });
    handles.push(stationaryHandle);

    // Watch for mouse movement - THROTTLED with requestAnimationFrame
    const pointerHandle = view.on("pointer-move", (evt) => {
      // If a frame is already pending, skip this event (debouncing/throttling)
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      // Schedule the DOM update for the next paint frame
      animationFrameId = requestAnimationFrame(() => {
        // Double check view exists before converting coords
        if (!view) return; 
        
        const point = view.toMap({ x: evt.x, y: evt.y });
        updateCoordinates(point);
        animationFrameId = null; // Reset ID after running
      });
    });
    handles.push(pointerHandle);

    // Click with Shift key
    const clickHandle = view.on("click", (evt) => {
      if (evt.native.shiftKey) {
        const lat = evt.mapPoint.latitude.toFixed(6);
        const lon = evt.mapPoint.longitude.toFixed(6);
        alert(`${lat}, ${lon}`);
      }
    });
    handles.push(clickHandle);

    // --- Cleanup Function ---
    return () => {
      // Cancel any pending animation frame to prevent updating after unmount
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

       //Remove widget from UI

       if (view && view.ui && coordsWidget.current) {
         view.ui.remove(coordsWidget.current);
       }
      
      // Remove all event listeners
      handles.forEach((handle) => handle.remove());
    };
  }, [view]);

  // CSS for styling the widget box
  const widgetStyle = {
    padding: "7px 15px",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    color: "white",
    fontSize: "80%",
    borderRadius: "4px",
    margin: "0 10px 20px 0",
    pointerEvents: "none" // Crucial: lets mouse pass through so you can click map behind text
  };

  return (
    <div 
      ref={coordsWidget} 
      id="coordsWidget" 
      style={widgetStyle}
    >
      Loading coordinates...
    </div>
  );
}