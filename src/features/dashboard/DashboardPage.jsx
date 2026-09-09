/**
 * The map screen: everything the signed-in user sees at /dashboard.
 *
 * Pure composition plus the shell's own layout state. The regions are:
 *
 *   TopBar          header slot -- search, fault filter, profile
 *   LeftSidebar     panel-start -- alarm state, active users
 *   RightSidebar    panel-end   -- details, layers, map tools, filters
 *   MapCanvas       centre column, fills whatever the panels leave
 *   FeatureTable    below the map, only while a tab is visible
 *
 * What this file owns: the drag-to-resize height of the table, and
 * `activeView`. Everything else those children need they read from context --
 * see CODEBASE_GUIDE.md for the full map of who reads what.
 *
 * NOTE ON activeView: it is permanently "map". The switcher that used to set
 * it was removed from TopBar, and features/analytics/ has since been deleted
 * as unreachable, so the state is vestigial -- it stays only because the
 * table and map layout read it.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import TopBar from "./TopBar";
import MapCanvas from "../map/MapCanvas";
import RightSidebar from "../sidebars/right/RightSidebar";
import LeftSidebar from "../sidebars/left/LeftSidebar";
import FeatureTable from "../featureTable/FeatureTable";
import { useFeatureTableData } from "../map/state/FeatureTableDataContext";
import { useAuth } from "../auth/AuthContext";
import { useSidebarLayout } from "./SidebarLayoutContext";
import { CalciteShell } from "@esri/calcite-components-react";

function DashboardPage() {
  const { hasPermission } = useAuth();
  // Overlay panels float above the centre column, so the table has to step
  // aside for them; the map underneath deliberately doesn't (see the context).
  const { overlayInsetStart, overlayInsetEnd } = useSidebarLayout();
  
  const { tableData } = useFeatureTableData();
  const [activeView, setActiveView] = useState("map");

  useEffect(() => {
    if (activeView === "analytics" && !hasPermission("tab_Dashboard")) setActiveView("map");
  }, [activeView, hasPermission]);

  // The shell fills the viewport and scrolls internally, so the document must
  // not scroll behind it (see index.css). Scoped to this route's lifetime --
  // the Admin panel is a normal flow document and needs the document scrollbar.
  useEffect(() => {
    document.documentElement.classList.add("app-viewport-locked");
    return () => document.documentElement.classList.remove("app-viewport-locked");
  }, []);

  const centerContainerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [tableHeight, setTableHeight] = useState(240); 

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

  // --- CHANGED: Check if any tab is flagged as isVisible ---
  const isTableVisible = tableData && Object.values(tableData).some(tab => tab.isVisible);

  return (
    <CalciteShell style={{ "--calcite-ui-foreground-1": "var(--bg-secondary)", "--calcite-ui-text-1": "var(--text-primary)" }}>
      <TopBar slot="header" />
      {/* Kept mounted across view changes: unmounting a shell panel tears down
          its Calcite tree and forces the shell to re-lay-out, which resizes the
          MapView. Hiding it instead keeps both the panel state and the map's
          size stable. */}
      <LeftSidebar hidden={activeView !== "map"} />
      <RightSidebar hidden={activeView !== "map"} />
      <div style={{ height: "100%", width: "100%", overflow: "hidden" }}>
        <div style={{ display: activeView === "map" ? "contents" : "none" }}>
          <div ref={centerContainerRef} style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
            <MapCanvas />
            {isTableVisible && (
              <>
                <div
                  onMouseDown={handleDragStart}
                  title="Drag to resize"
                  className="panel-inset"
                  style={{ flex: "0 0 auto", height: "6px", cursor: "row-resize", background: "transparent", position: "relative", zIndex: 5, marginInlineStart: overlayInsetStart, marginInlineEnd: overlayInsetEnd }}
                >
                  <div style={{ position: "absolute", top: "2px", left: "50%", transform: "translateX(-50%)", width: "40px", height: "3px", borderRadius: "2px", background: "var(--calcite-ui-border-2, #4b5563)" }} />
                </div>
                <div
                  className="panel-inset"
                  style={{ flex: "0 0 auto", height: `${tableHeight}px`, minHeight: 0, overflow: "hidden", marginInlineStart: overlayInsetStart, marginInlineEnd: overlayInsetEnd }}
                >
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
export default DashboardPage;