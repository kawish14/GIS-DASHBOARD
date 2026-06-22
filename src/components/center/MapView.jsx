import { useRef, useEffect, useState } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import Extent from "@arcgis/core/geometry/Extent";
import { useArcGIS } from "../../context/MapContext";
import { useAuth } from "../../context/AuthContext";

import GlobalClickHandler from "../../map_items/functional/GlobalClickHandler";
import Layers from "../../map_items/layers/Layers";
import Realtime from '../../Realtime/ont-status/Realtime';
import VehicleTracking from '../../Realtime/vehicle/VehicleTracking';
import CoordinateWidget from '../../map_items/widgets/CoordinateWidget'
import HomeWidget from '../../map_items/widgets/HomeWidget'


export default function MapViews({ isLoading }) {
  const mapDivRef = useRef(null);
  const { setMap, setView, view, layers } = useArcGIS();
  const {user} = useAuth();

  useEffect(() => {
    if (!mapDivRef.current) return;

    // We define these variables right here, so they are ready immediately.
    let initialCenter = [70.320449, 30.694832]; // Default (Pakistan Management view)
    let initialScale = 5622324; 
    let shouldZoom = false;

    // Helper to normalize role string safely
    const regions = user?.permissions?.regions || [];

    if (regions.length === 1) {
      const primaryRegion = regions[0].toLowerCase();
      shouldZoom = true;

    if (primaryRegion === 'north') {
      initialCenter = [73.239156, 33.663228];
      initialScale = 144448;
    } 
    else if (primaryRegion === 'south') {
      initialCenter = [67.171837, 24.908468];
      initialScale = 144448;
    } 
    else if (primaryRegion === 'central') {
      initialCenter = [74.355626, 31.545676];
      initialScale = 144448;
    }
  }

    // 1. Initialize Map
    const mapInstance = new Map({
      basemap: "satellite",
    });

    // 2. Initialize View
    const viewInstance = new MapView({
      container: mapDivRef.current,
      map: mapInstance,
      center: initialCenter,
      scale: initialScale,
      constraints: {
        // limit how far they can zoom out (optional, based on your logic)
        minScale: initialScale * 2, 
        rotationEnabled: true, // Optional: keeps map facing north
      },
      //extent: "bounds",
      popup: {
        dockEnabled: true,
        dockOptions: {
          buttonEnabled: false,
          breakpoint: false,
          position: "bottom-left",
        },
      },
      ui: {
          components: ["zoom", "compass", "attribution"],
        },
    });


    // 3. Save to Context when ready
    viewInstance.when(() => {
      setMap(mapInstance);
      setView(viewInstance);
    });

    return () => {
      // Cleanup
      viewInstance.destroy();
      setView(null);
      setMap(null);
    };
  }, []); // Run once on mount

  return (
    <main className="flex-1 relative overflow-hidden bg-[#1a1a1a]" id="MapView">
      {/* Map Container - Added a slight fade-in transition */}
      <div
        ref={mapDivRef}
        className={`absolute inset-0 transition-opacity duration-1000 ${isLoading ? "opacity-50" : "opacity-100"}`}
      ></div>

      {/* Layers Logic */}
      {view && (
        <>
          <Layers />
          <Realtime />
          <VehicleTracking />
          <CoordinateWidget />
          <HomeWidget />
          <GlobalClickHandler />
        </>
      )}

      {/* Refined Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg-primary)]/80 backdrop-blur-sm">
          {/* Modern Spinner */}
          <calcite-loader label="Adjusting polygons..."></calcite-loader>
        </div>
      )}

      {/* Optional: Subtle Overlay Gradient to make map controls pop */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.2)]"></div>
    </main>
  );
}
