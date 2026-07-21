import { useState, useEffect, useRef, useCallback } from "react";
import TopBar from "../components/top/TopBar";
import MapViews from "../components/center/MapView";
import RightSidebar from "../components/right/RightSidebar";
import LeftSidebar from "../components/left/LeftSidebar";
import FeatureTable from "../components/bottom/FeatureTable";
import AnalyticsDashboard from "../components/analytics/AnalyticsDashboard";
import { useLayers, useMapView, usePopup } from "../context/MapContext";
import {
  CalciteTabs,
  CalciteTabNav,
  CalciteTabTitle,
  CalciteTab,
  CalciteIcon,
  CalciteShell
} from "@esri/calcite-components-react";

function Dashboard() {
  const { layers, setCustomerLayerView } = useLayers();
  const { view } = useMapView();
  const { selectedFeatures, setSelectedFeatures } = usePopup();
  const [isLoading, setIsLoading] = useState(true);

  // Top-level workspace tab, ArcGIS Pro style: "map" | "analytics".
  // Deliberately NOT used to conditionally mount <MapViews /> -- that
  // component owns the ArcGIS Map/MapView instance and destroys it on
  // unmount, so unmounting it on every tab switch would tear down the map
  // and all loaded layers (which FaultAnalytics itself depends on via
  // useLayers). Instead we keep it always mounted and just hide it.
  const [activeView, setActiveView] = useState("map");

  // --- Resizable table height ---
  const centerContainerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [tableHeight, setTableHeight] = useState(320); // px, initial height when table opens

  const MIN_TABLE_HEIGHT = 160; // always leave room to see the header + a couple rows
  const MAP_MIN_HEIGHT = 200;   // never let the table squeeze the map away entirely

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleDragMove = (e) => {
      if (!isDraggingRef.current || !centerContainerRef.current) return;
      const containerRect = centerContainerRef.current.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;
      const maxHeight = containerRect.height - MAP_MIN_HEIGHT;
      setTableHeight(Math.min(maxHeight, Math.max(MIN_TABLE_HEIGHT, newHeight)));
    };
    const handleDragEnd = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);
    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
    };
  }, []);

  const MAX_WAIT_MS = 5000;
  const CHECK_INTERVAL_MS = 200;

  useEffect(() => {
    if (!view) return;
    setIsLoading(true);

    let elapsedTime = 0;
    let watcherHandle = null;

    const intervalId = setInterval(() => {
      if (layers.Customers_test) {
        clearInterval(intervalId);
        view.whenLayerView(layers.Customers_test).then((layerView) => {
          setCustomerLayerView(layerView);
          watcherHandle = layerView.watch("updating", (isUpdating) => {
            if (!isUpdating) {
              setIsLoading(false);
              if (watcherHandle) { watcherHandle.remove(); watcherHandle = null; }
            }
          });
        }).catch(() => setIsLoading(false));
      }
      elapsedTime += CHECK_INTERVAL_MS;
      if (elapsedTime >= MAX_WAIT_MS) { clearInterval(intervalId); setIsLoading(false); }
    }, CHECK_INTERVAL_MS);

    return () => { clearInterval(intervalId); if (watcherHandle) watcherHandle.remove(); };
    // Depend on the specific layer key rather than the whole `layers` object
    // -- `layers` gets a new reference every time ANY layer registers
    // (Vehicles, dc_odb, Feeder, ...), which would otherwise restart this
    // polling loop for unrelated layer mounts.
  }, [view, layers.Customers_test]);

  return (
    <CalciteShell
      style={{
        "--calcite-ui-foreground-1": "var(--bg-secondary)",
        "--calcite-ui-text-1": "var(--text-primary)",
      }}
    >
      <TopBar slot="header" activeView={activeView} onViewChange={setActiveView} />

      {/* Sidebars are map-specific tooling (identify, layers, filters...) --
          only meaningful while on the Map tab. They don't hold state that
          needs to survive a tab switch, so it's safe to unmount them. */}
      {activeView === "map" && (
        <>
          <LeftSidebar />
          <RightSidebar />
        </>
      )}

      {/* CENTER CONTENT AREA */}
      <div style={{ height: "100%", width: "100%", overflow: "hidden" }}>

        {/* MAP WORKSPACE -- always mounted (never unmounted on tab switch)
            so the ArcGIS Map/MapView instance and its loaded layers stay
            alive. `display: contents` pulls it out of layout when hidden so
            it doesn't reserve space or fight the analytics view, while
            keeping it in the DOM tree. */}
        <div style={{ display: activeView === "map" ? "contents" : "none" }}>
          <div
            ref={centerContainerRef}
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                width: "100%",
                overflow: "hidden",
                transition: "width 300ms ease-in-out",
                // CSS containment: tells the browser this subtree's layout/paint
                // is self-contained, so it doesn't need to be recomputed when a
                // sibling (LeftSidebar / RightSidebar's CalciteShellPanel)
                // resizes, and its own resizing doesn't ripple back out either.
                // This is what stops one panel's open/close transition from
                // visually disturbing its sibling.
                contain: "layout style",
            }}
          >
            {/* Map takes all available space initially */}
          <MapViews isLoading={isLoading} />

            {/* Table takes a user-adjustable height when visible, pushing map up.
                Height is an explicit px value (not "auto") -- FeatureTable's own
                root uses height: 100%, which only resolves against a parent that
                has a real height, not "auto". */}
            {selectedFeatures.length > 0 && (
              <>
                <div
                  onMouseDown={handleDragStart}
                  title="Drag to resize"
                  style={{
                    flex: "0 0 auto",
                    height: "6px",
                    cursor: "row-resize",
                    background: "transparent",
                    position: "relative",
                    zIndex: 5,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "2px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: "40px",
                      height: "3px",
                      borderRadius: "2px",
                      background: "var(--calcite-ui-border-2, #4b5563)",
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 auto", height: `${tableHeight}px`, minHeight: 0, overflow: "hidden" }}>
                    <FeatureTable
                        features={selectedFeatures}
                    />
                </div>
              </>
            )}
          </div>
        </div>

        {/* ANALYTICS WORKSPACE */}
        {activeView === "analytics" && <AnalyticsDashboard />}
      </div>

    </CalciteShell>
  );
}

export default Dashboard;