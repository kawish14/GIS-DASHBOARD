import { useRef, useEffect, useState } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import { useMapView } from "./state/MapViewContext";
import { useAuth } from "../auth/AuthContext";
import { useSidebarLayout } from "../dashboard/SidebarLayoutContext";

import GlobalClickHandler from "./interactions/GlobalClickHandler";
import Layers from "./layers/Layers";
import OntStatusFeed from '../realtime/OntStatusFeed';
import VehicleTracking from '../realtime/VehicleTracking';
import CoordinateWidget from './widgets/CoordinateWidget'
import HomeWidget from './widgets/HomeWidget'
import ActiveFiltersBar from '../filters/ActiveFiltersBar'
import { useCustomerLayerLoading } from './useCustomerLayerLoading'

// Region -> default camera. Used both for the initial view and to re-center
// the map if the user's region permissions arrive after the map has already
// been created (the session check in AuthContext is async).

const REGION_VIEWS = {
  north: { center: [73.088438, 33.605487], scale: 288895 },
  south: { center: [67.050987, 24.842437], scale: 288895 },
  central: { center: [74.385495, 31.479528], scale: 288895 },
};

// How long the view gets to become ready before we tell the user something is
// wrong. MapView.when() doesn't reject when the ArcGIS assets or the basemap
// service are simply unreachable -- it just never settles -- so a timeout is
// the only way that failure ever reaches the screen.
const VIEW_READY_TIMEOUT_MS = 20000;

// Deliberately plain HTML rather than calcite-notice: this has to render when
// the environment is broken, and calcite fetches its own strings over the
// network -- the very thing that is failing whenever this is on screen.
function MapFailureNotice({ title, detail }) {
  return (
    <div
      className="absolute z-50 flex items-center justify-center"
      style={{ inset: 0, background: "rgba(15, 17, 21, 0.92)", padding: "1.5rem" }}
    >
      <div
        style={{
          pointerEvents: "auto",
          maxWidth: "460px",
          padding: "0.85rem 1.1rem",
          borderRadius: "8px",
          background: "rgba(24, 27, 33, 0.96)",
          border: "1px solid #b91c1c",
          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.5)",
          color: "#e2e8f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: "12px",
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 700, color: "#fca5a5", marginBottom: "0.3rem" }}>{title}</div>
        <div style={{ color: "var(--text-muted, #a0aab7)" }}>{detail}</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: "0.75rem",
            padding: "0.35rem 0.9rem",
            borderRadius: "999px",
            border: "1px solid var(--border-color, #2d3748)",
            background: "transparent",
            color: "var(--text-highlight, #38bdf8)",
            fontWeight: 600,
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

const DEFAULT_CENTER = [70.320449, 30.694832]; // Pakistan-wide management view
const DEFAULT_SCALE = 5622324;

function getRegionCamera(user) {
  const regions = user?.permissions?.regions || [];
  if (regions.length === 1) {
    return REGION_VIEWS[regions[0].toLowerCase()] || null;
  }
  return null;
}

export default function MapCanvas() {
  // Owned here rather than passed in: it is derived from the map's own layers
  // and nothing outside the map reads it. See useCustomerLayerLoading.js.
  const isLoading = useCustomerLayerLoading();
  const mapDivRef = useRef(null);
  const { setMap, setView, view } = useMapView();
  const { user } = useAuth();
  const { overlayInsetStart, overlayInsetEnd } = useSidebarLayout();

  // Why the map isn't there, when it isn't. Without these the failure modes
  // below are indistinguishable from a very slow load: the view container
  // stays an empty black rectangle and nothing is ever logged.
  const [viewError, setViewError] = useState(null);

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

    const readyWatchdog = setTimeout(() => {
      if (viewInstance.destroyed || viewInstance.ready) return;
      console.error("[MapView] the map view never became ready");
      setViewError({
        title: "The map is taking too long to load",
        detail:
          "The view never finished initialising. This usually means the ArcGIS assets or the basemap service can't be reached from this machine -- check the browser console and your network access.",
      });
    }, VIEW_READY_TIMEOUT_MS);

    viewInstance.when(
      () => {
        clearTimeout(readyWatchdog);
        setViewError(null);
        setMap(mapInstance);
        setView(viewInstance);
        if (regionCamera) {
          hasCenteredOnUserRef.current = true;
        }
      },
      (error) => {
        // This used to have no rejection handler at all, so a view that failed
        // to create left an unexplained black rectangle and an unhandled
        // promise rejection.
        clearTimeout(readyWatchdog);
        console.error("[MapView] the map view failed to initialise", error);
        setViewError({
          title: "The map failed to load",
          detail: error?.message || "The ArcGIS map view could not be created.",
        });
      }
    );

    // A failed basemap doesn't stop the view coming up -- the layers still
    // work, only the imagery underneath is missing -- so it is logged rather
    // than put on screen, where it was just noise over a working map.
    mapInstance.basemap?.load?.().catch((error) => {
      console.error("[MapView] the basemap failed to load", error);
    });

    return () => {
      clearTimeout(readyWatchdog);
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
    <main
      className="flex-1 relative overflow-hidden bg-[#1a1a1a]"
      // index.css selects on this id to slide the ArcGIS UI corners out from
      // under an overlay sidebar -- don't rename it without updating that.
      id="MapView"
      style={{
        contain: "layout style paint",
        isolation: "isolate",
        // Consumed by index.css to slide the ArcGIS UI corners out from under
        // whichever sidebar is currently overlaying the map. The map canvas
        // itself stays full-bleed -- only the widgets move.
        "--map-ui-inset-start": overlayInsetStart,
        "--map-ui-inset-end": overlayInsetEnd,
      }}
    >
      {/* Map Container - Added a slight fade-in transition */}
      <div
        ref={mapDivRef}
        className={`absolute inset-0 transition-opacity duration-1000 ${isLoading ? "opacity-50" : "opacity-100"}`}
      ></div>

      {/* Layers Logic */}
      {view && (
        <>
          <Layers />
          <OntStatusFeed />
          <VehicleTracking />
          <CoordinateWidget />
          <HomeWidget />
          <GlobalClickHandler />
        </>
      )}

      {/* Reads the filter widgets' published state, so what's narrowing the
          map stays on screen with the sidebar closed or on another tab. */}
      <ActiveFiltersBar />

      {viewError && (
        <MapFailureNotice title={viewError.title} detail={viewError.detail} />
      )}

      {/* Refined Loading Overlay */}
      {isLoading && !viewError && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg-app)]/80 backdrop-blur-sm">
          {/* Modern Spinner */}
          <calcite-loader label="Adjusting polygons..."></calcite-loader>
        </div>
      )}

      {/* Optional: Subtle Overlay Gradient to make map controls pop */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.2)]"></div>
    </main>
  );
}