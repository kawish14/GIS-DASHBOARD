import { useRef, useEffect } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import { useMapView } from "../../context/MapContext";
import { useAuth } from "../../context/AuthContext";

import GlobalClickHandler from "../../map_items/functional/GlobalClickHandler";
import Layers from "../../map_items/layers/Layers";
import Realtime from '../../Realtime/ont-status/Realtime';
import VehicleTracking from '../../Realtime/vehicle/VehicleTracking';
import CoordinateWidget from '../../map_items/widgets/CoordinateWidget'
import HomeWidget from '../../map_items/widgets/HomeWidget'

// Region -> default camera. Used both for the initial view and to re-center
// the map if the user's region permissions arrive after the map has already
// been created (the session check in AuthContext is async).
const REGION_VIEWS = {
  north: { center: [73.239156, 33.663228], scale: 144448 },
  south: { center: [67.171837, 24.908468], scale: 144448 },
  central: { center: [74.355626, 31.545676], scale: 144448 },
};

const DEFAULT_CENTER = [70.320449, 30.694832]; // Pakistan-wide management view
const DEFAULT_SCALE = 5622324;

function getRegionCamera(user) {
  const regions = user?.permissions?.regions || [];
  if (regions.length === 1) {
    return REGION_VIEWS[regions[0].toLowerCase()] || null;
  }
  return null;
}

export default function MapViews({ isLoading }) {
  const mapDivRef = useRef(null);
  const { setMap, setView, view } = useMapView();
  const { user } = useAuth();

  // Tracks whether we've already auto-centered on the user's region, so we
  // don't fight the user if they've since panned/zoomed the map themselves.
  const hasCenteredOnUserRef = useRef(false);

  // 1. Create the map + view ONCE.
  //
  // BUG FIX: this used to read `user` inside the effect but had an empty
  // dependency array, so if AuthContext's async session check hadn't
  // resolved yet when this component first mounted, `user` was `null` and
  // the map got permanently stuck on the default Pakistan view -- it never
  // re-centered once the user's region loaded. We now create the map with
  // whatever camera we can determine at mount time, and handle the
  // "arrived late" case separately in effect #2 below (without tearing
  // down and recreating the whole map, which would also destroy layers and
  // any in-progress interaction).
  useEffect(() => {
    if (!mapDivRef.current) return;

    const regionCamera = getRegionCamera(user);
    const initialCenter = regionCamera?.center ?? DEFAULT_CENTER;
    const initialScale = regionCamera?.scale ?? DEFAULT_SCALE;

    const mapInstance = new Map({
      basemap: "satellite",
    });

    const viewInstance = new MapView({
      container: mapDivRef.current,
      map: mapInstance,
      center: initialCenter,
      scale: initialScale,
      constraints: {
        minScale: initialScale * 2,
        rotationEnabled: true,
      },
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

    viewInstance.when(() => {
      setMap(mapInstance);
      setView(viewInstance);
      if (regionCamera) {
        hasCenteredOnUserRef.current = true;
      }
    });

    return () => {
      viewInstance.destroy();
      setView(null);
      setMap(null);
    };
    // Intentionally run once on mount only -- see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. If the user's region permissions weren't available at mount time,
  // re-center as soon as they arrive, without recreating the map.
  useEffect(() => {
    if (!view || hasCenteredOnUserRef.current) return;

    const regionCamera = getRegionCamera(user);
    if (!regionCamera) return;

    view.goTo({ center: regionCamera.center, scale: regionCamera.scale });
    hasCenteredOnUserRef.current = true;
  }, [view, user]);

  return (
    <main className="flex-1 relative overflow-hidden bg-[#1a1a1a]" id="MapView" style={{ contain: "layout style paint", isolation: "isolate" }}>
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