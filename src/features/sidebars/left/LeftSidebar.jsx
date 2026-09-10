import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  CalciteShellPanel,
  CalcitePanel,
  CalciteFlow,
  CalciteFlowItem,
  CalciteTabs,
  CalciteTab,
  CalciteTabNav,
  CalciteTabTitle,
  CalciteActionBar,
  CalciteAction,
  CalciteLoader,
} from "@esri/calcite-components-react";
import RegionStats from "./RegionStats";
import LopDetailPanel from "./LopDetailPanel";
import ActiveUsers from "./ActiveUsers";
import { useStats } from "../../map/state/AlarmStatsContext";
import { useMapView } from "../../map/state/MapViewContext";
import { useAuth } from "../../auth/AuthContext";
import { usePermittedRegions } from "../../auth/usePermittedRegions";
import { useSidebarLayout, usePanelRef } from "../../dashboard/SidebarLayoutContext";

import FeatureGuard from "../../auth/FeatureGuard";
import { isLopVariant } from "../../../shared/constants/lopDetail";

// Map actions to specific feature keys
const ACTIONS = [
  { text: "Alarm State", icon: "activity-monitor", featureKey: "tab_Alarm_State" },
  { text: "Active Users", icon: "users", featureKey: "tab_Active_Users" }
];

// Auto-discovered by src/permissions/featureRegistry.js -- ACTIONS above is
// already the single source of truth for which tabs exist here, so this
// just re-shapes it for the admin panel instead of maintaining a second,
// separate list that could drift out of sync with it.
export const featureMeta = ACTIONS.map(({ featureKey, text }) => ({
  key: featureKey,
  label: `${text} Tab`,
  group: "Left Sidebar Tab",
}));

const REGION_COORDINATES = {
  North: { target: [73.088438, 33.605487], zoom: 11 },
  South: { target: [67.050987, 24.842437], zoom: 11 },
  Central: { target: [74.385495, 31.479528], zoom: 11 },
};

export default function LeftSidebar({ hidden = false }) {
  const { user, hasPermission } = useAuth();
  // Open/closed lives in SidebarLayoutContext, which also decides whether the
  // panels dock beside the map or overlay it at this viewport width, and
  // brokers the "one sidebar at a time" hand-off between the two sides.
  const {
    displayMode,
    openStart,
    setSidebarOpen,
    requestClose,
    closeStartRequest,
  } = useSidebarLayout();
  // Lets the provider measure how much of the centre column this panel is
  // actually covering. Returning null below unregisters it, so a sidebar
  // that never renders can't leave the table and map controls inset.
  const panelRef = usePanelRef("start");
  // Only subscribes to stats + view, so a change to `layers` or `popupFeature`
  // elsewhere in the app no longer re-renders this component.
  const { alertCount, realtimeStats } = useStats();
  const { view } = useMapView();

  const REGIONS = usePermittedRegions();

  // Dynamically filter available actions based on user permissions
  const permittedActions = useMemo(() => {
    return ACTIONS.filter(action => {
      if (!action.featureKey) return true;
      return hasPermission(action.featureKey);
    });
  }, [hasPermission]);

  const [activeTool, setActiveTool] = useState("Alarm State");

  // Permissions can change while the user is signed in -- the server now
  // refreshes them from the role on every request -- so the tool that is open
  // may be one they have just lost. Fall back to whatever they do still have,
  // rather than leaving the panel showing a heading with nothing under it.
  useEffect(() => {
    if (permittedActions.length === 0) return;
    if (permittedActions.some((a) => a.text === activeTool)) return;
    setActiveTool(permittedActions[0].text);
  }, [permittedActions, activeTool]);

  const isCollapsed = !openStart;
  const [tab, setTab] = useState(REGIONS.length > 0 ? REGIONS[0] : null);
  const [highlightedRegions, setHighlightedRegions] = useState({});
  const [selectedFault, setSelectedFault] = useState(null);

  // The Low Optical Power drill-in: which row's `lopdetail` breakdown the
  // sidebar has navigated to, and which customers the cause selected inside
  // it covers.
  //
  // Both live here rather than in RegionStats because there is one RegionStats
  // per region tab, all of them mounted at once -- a step owned by a tab would
  // stay on screen after the user moved to another region, showing the wrong
  // region's causes. One step, closed on every navigation, cannot.
  const [lopDrilldown, setLopDrilldown] = useState(null);
  const [lopCauseIds, setLopCauseIds] = useState(null);

  const prevStatsRef = useRef({});

  const openLopDetails = useCallback((region, variant) => {
    setLopCauseIds(null);
    setLopDrilldown({ region, variant });
  }, []);

  // Going back drops the drill-in's hold on the map: the cause filter goes,
  // and so does the LOP highlight the row turned on when it navigated in.
  const closeLopDetails = useCallback(() => {
    setLopDrilldown(null);
    setLopCauseIds(null);
    setSelectedFault((current) => (isLopVariant(current) ? null : current));
  }, []);

  const handlePanelClose = useCallback(() => {
    setSidebarOpen("start", false);
    closeLopDetails();
  }, [setSidebarOpen, closeLopDetails]);

  // Collapsing the sidebar from anywhere else -- the action bar, the right
  // panel taking the screen -- returns the flow to the alarm list.
  useEffect(() => {
    if (isCollapsed) closeLopDetails();
  }, [isCollapsed, closeLopDetails]);

  // The right panel opened one of its own tools and wants the screen.
  useEffect(() => {
    if (closeStartRequest > 0) setSidebarOpen("start", false);
  }, [closeStartRequest, setSidebarOpen]);

  useEffect(() => {
    if (!realtimeStats) return;

    const changes = {};
    let hasAnyChange = false;

    REGIONS.forEach((region) => {
      const oldData = JSON.stringify(prevStatsRef.current[region]);
      const newData = JSON.stringify(realtimeStats[region]);

      if (oldData && oldData !== newData) {
        changes[region] = true;
        hasAnyChange = true;
      }
    });

    if (hasAnyChange) {
      setHighlightedRegions(changes);
      const timeoutId = setTimeout(() => {
        setHighlightedRegions({});
      }, 1000);
      // Avoid leaking the timeout if realtimeStats changes again before it fires.
      return () => clearTimeout(timeoutId);
    }

    prevStatsRef.current = realtimeStats;
  }, [realtimeStats, REGIONS]);

  const handleTabChange = (e) => {
    const region = e.target.accessKey;
    setTab(region);
    closeLopDetails(); // the open breakdown belongs to the region being left

    if (view && REGION_COORDINATES[region]) view.goTo(REGION_COORDINATES[region]);
  };

  const handleActionClick = (toolName) => {
    // Either branch leaves the Alarm State tab as the user is looking at it,
    // so the breakdown step goes either way.
    closeLopDetails();

    if (!isCollapsed && activeTool === toolName) {
      setSidebarOpen("start", false);
    } else {
      setActiveTool(toolName);
      setSidebarOpen("start", true);
      // Taking the screen: ask the right panel to step aside. It keeps
      // Details open regardless -- that tab holds the selected feature.
      requestClose("end");
    }
  };

  // If the user has NO permissions for any Left Sidebar tools, render nothing!
  if (!realtimeStats || permittedActions.length === 0) return null;

  return (
    <CalciteShellPanel
      ref={panelRef}
      slot="panel-start"
      position="start"
      id="shell-panel-start"
      collapsed={isCollapsed}
      displayMode={displayMode}
      style={hidden ? { display: "none" } : undefined}
    >
      <CalciteActionBar slot="action-bar">
        {permittedActions.map((action) => (
          <CalciteAction
            key={action.text}
            text={action.text}
            icon={action.icon}
            active={!isCollapsed && activeTool === action.text ? true : undefined}
            onClick={() => handleActionClick(action.text)}
          />
        ))}
      </CalciteActionBar>

      <CalcitePanel heading={activeTool} closable closed={isCollapsed} onCalcitePanelClose={handlePanelClose}>

        {/* --- 1. ALARM STATE TAB --- */}
        <FeatureGuard featureKey="tab_Alarm_State">
          {/* Flex, not block: calcite-flow is `flex: 1 1 auto` and would
              collapse to its content height inside a block parent. */}
          <div style={{ display: activeTool === "Alarm State" ? "flex" : "none", flexDirection: "column", height: "100%" }}>
            {/* The alarm list and the LOP breakdown are two steps of one
                journey, so they are a flow: opening a Low Optical Power row
                slides the sidebar forward and calcite adds the back arrow.
                The first item carries no heading, so it renders no header of
                its own and the region tabs sit where they always did. */}
            <CalciteFlow>
              {/* calcite-flow shows the selected item and nothing else, and it
                  only auto-selects when no item claims to be selected -- so
                  which step is showing is React's to say, not something the
                  flow infers from a new child appearing. */}
              <CalciteFlowItem selected={!lopDrilldown}>
                <CalciteTabs>
                  <CalciteTabNav slot="title-group">
                    {REGIONS.map((region) => (
                      <CalciteTabTitle
                        key={region}
                        accessKey={region}
                        onClick={handleTabChange}
                        selected={tab === region}
                        style={{ flex: 1, textAlign: "center", width: "80%", justifyContent: 'space-between', marginLeft: '4px' }}
                      >
                        {region}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                          {highlightedRegions[region] && (
                            <span style={{ height: "4px", width: "4px", backgroundColor: "rgb(31, 145, 243)", borderRadius: "50%", marginLeft: "8px", boxShadow: "0 0 6px rgb(17, 127, 223)", transition: "opacity 0.5s ease-in-out" }}></span>
                          )}
                        </div>
                      </CalciteTabTitle>
                    ))}
                  </CalciteTabNav>

                  {REGIONS.map((region) => (
                    <CalciteTab key={region} selected={tab === region}>
                      {!alertCount || !realtimeStats ? (
                        <div style={{ display: "flex", height: "100%", minHeight: "200px", alignItems: "center", justifyContent: "center" }}>
                          <CalciteLoader label="Loading Alerts" active scale="s" />
                        </div>
                      ) : (
                        <RegionStats
                          region={region}
                          selectedFault={selectedFault}
                          setSelectedFault={setSelectedFault}
                          onOpenLopDetails={(variant) => openLopDetails(region, variant)}
                          lopCauseIds={lopCauseIds}
                        />
                      )}
                    </CalciteTab>
                  ))}
                </CalciteTabs>
              </CalciteFlowItem>

              {lopDrilldown && (
                <LopDetailPanel
                  // Remounted per row, so the open cause and any notice reset
                  // with it rather than needing an effect to clear them.
                  key={`${lopDrilldown.region}-${lopDrilldown.variant}`}
                  region={lopDrilldown.region}
                  variant={lopDrilldown.variant}
                  onClose={closeLopDetails}
                  onCauseSelect={setLopCauseIds}
                />
              )}
            </CalciteFlow>
          </div>
        </FeatureGuard>

        {/* --- 2. ACTIVE USERS TAB --- */}
        <FeatureGuard featureKey="tab_Active_Users">
          <div style={{ display: activeTool === "Active Users" ? "block" : "none", height: "100%" }}>
            {/* Pass only the regions the current user is allowed to see */}
            <ActiveUsers />
          </div>
        </FeatureGuard>

      </CalcitePanel>
    </CalciteShellPanel>
  );
}