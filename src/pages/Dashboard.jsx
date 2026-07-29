import { useState, useEffect, useRef, useCallback } from "react";
import TopBar from "../components/top/TopBar";
import MapViews from "../components/center/MapView";
import RightSidebar from "../components/right/RightSidebar";
import LeftSidebar from "../components/left/LeftSidebar";
import FeatureTable from "../components/bottom/FeatureTable";
import { useLayers, useMapView, usePopup } from "../context/MapContext";
import { useAuth } from "../context/AuthContext";
import { CalciteShell } from "@esri/calcite-components-react";

function Dashboard() {
  const { layers, setCustomerLayerView } = useLayers();
  const { view } = useMapView();
  const { hasPermission } = useAuth();
  
  const { tableData } = usePopup(); 
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState("map");

  useEffect(() => {
    if (activeView === "analytics" && !hasPermission("tab_Dashboard")) setActiveView("map");
  }, [activeView, hasPermission]);

  const centerContainerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [tableHeight, setTableHeight] = useState(320); 

  const MIN_TABLE_HEIGHT = 160; 
  const MAP_MIN_HEIGHT = 200;   

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
    return () => { window.removeEventListener("mousemove", handleDragMove); window.removeEventListener("mouseup", handleDragEnd); };
  }, []);

  const MAX_WAIT_MS = 5000;
  const CHECK_INTERVAL_MS = 200;

  useEffect(() => {
    if (!view) return;
    setIsLoading(true);
    let elapsedTime = 0; let watcherHandle = null;
    const intervalId = setInterval(() => {
      if (layers.Customers_test) {
        clearInterval(intervalId);
        view.whenLayerView(layers.Customers_test).then((layerView) => {
          setCustomerLayerView(layerView);
          watcherHandle = layerView.watch("updating", (isUpdating) => {
            if (!isUpdating) { setIsLoading(false); if (watcherHandle) { watcherHandle.remove(); watcherHandle = null; } }
          });
        }).catch(() => setIsLoading(false));
      }
      elapsedTime += CHECK_INTERVAL_MS;
      if (elapsedTime >= MAX_WAIT_MS) { clearInterval(intervalId); setIsLoading(false); }
    }, CHECK_INTERVAL_MS);
    return () => { clearInterval(intervalId); if (watcherHandle) watcherHandle.remove(); };
  }, [view, layers.Customers_test]);

  // --- CHANGED: Check if any tab is flagged as isVisible ---
  const isTableVisible = tableData && Object.values(tableData).some(tab => tab.isVisible);

  return (
    <CalciteShell style={{ "--calcite-ui-foreground-1": "var(--bg-secondary)", "--calcite-ui-text-1": "var(--text-primary)" }}>
      <TopBar slot="header" activeView={activeView} onViewChange={setActiveView} />
      {activeView === "map" && ( <><LeftSidebar /><RightSidebar /></> )}
      <div style={{ height: "100%", width: "100%", overflow: "hidden" }}>
        <div style={{ display: activeView === "map" ? "contents" : "none" }}>
          <div ref={centerContainerRef} style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden", transition: "width 300ms ease-in-out", contain: "layout style" }}>
            <MapViews isLoading={isLoading} />
            {isTableVisible && (
              <>
                <div onMouseDown={handleDragStart} title="Drag to resize" style={{ flex: "0 0 auto", height: "6px", cursor: "row-resize", background: "transparent", position: "relative", zIndex: 5 }}>
                  <div style={{ position: "absolute", top: "2px", left: "50%", transform: "translateX(-50%)", width: "40px", height: "3px", borderRadius: "2px", background: "var(--calcite-ui-border-2, #4b5563)" }} />
                </div>
                <div style={{ flex: "0 0 auto", height: `${tableHeight}px`, minHeight: 0, overflow: "hidden" }}>
                    <FeatureTable />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </CalciteShell>
  );
}
export default Dashboard;