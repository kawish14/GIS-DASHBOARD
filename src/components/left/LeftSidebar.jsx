import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  CalciteShellPanel,
  CalcitePanel,
  CalciteTabs,
  CalciteTab,
  CalciteTabNav,
  CalciteTabTitle,
  CalciteActionBar,
  CalciteAction,
  CalciteLoader,
} from "@esri/calcite-components-react";
import RegionStats from "./RegionStats";
import ActiveUsers from "./ActiveUsers";
import { useArcGIS } from "../../context/MapContext";
import { useAuth } from "../../context/AuthContext";

import FeatureGuard from "../auth/FeatureGuard";

// Map actions to specific feature keys
const ACTIONS = [
  { text: "Alarm State", icon: "activity-monitor", featureKey: "tab_Alarm_State" },
  { text: "Active Users", icon: "users", featureKey: "tab_Active_Users" }
];

export default function LeftSidebar() {
  const { user, hasPermission } = useAuth();
  const { alertCount, realtimeStats, view } = useArcGIS();
  const REGIONS = user.permissions.regions;

  // Dynamically filter available actions based on user permissions
  const permittedActions = useMemo(() => {
    return ACTIONS.filter(action => {
      if (!action.featureKey) return true;
      return hasPermission(action.featureKey);
    });
  }, [hasPermission]);

  const [activeTool, setActiveTool] = useState("Alarm State");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [tab, setTab] = useState(REGIONS.length > 0 ? REGIONS[0] : null);
  const [highlightedRegions, setHighlightedRegions] = useState({});
  const [selectedFault, setSelectedFault] = useState(null);
  
  const prevStatsRef = useRef({});

  const coordinates = {
    North: { target: [73.088438, 33.605487], zoom: 11 },
    South: { target: [67.050987, 24.842437], zoom: 11 },
    Central: { target: [74.385495, 31.479528], zoom: 11 },
  };

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
      setTimeout(() => {
        setHighlightedRegions({});
      }, 1000);
    }

    prevStatsRef.current = realtimeStats;
  }, [realtimeStats, REGIONS]); 

  const handleTabChange = (e) => {
    const region = e.target.accessKey; 
    setTab(region);
    if (view && coordinates[region]) view.goTo(coordinates[region]);
  };

  const handleActionClick = (toolName) => {
    if (!isCollapsed && activeTool === toolName) {
      setIsCollapsed(true);
    } else {
      setActiveTool(toolName);
      setIsCollapsed(false);
    }
  };

  // If the user has NO permissions for any Left Sidebar tools, render nothing!
  if (!realtimeStats || permittedActions.length === 0) return null;

  return (
    <CalciteShellPanel 
      slot="panel-start" 
      position="start" 
      id="shell-panel-start"
      collapsed={isCollapsed} 
      displayMode="dock"
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

      <CalcitePanel heading={activeTool} closable closed={isCollapsed} onCalcitePanelClose={() => setIsCollapsed(true)}>
        
        {/* --- 1. ALARM STATE TAB --- */}
        <FeatureGuard featureKey="tab_Alarm_State">
          <div style={{ display: activeTool === "Alarm State" ? "block" : "none", height: "100%" }}>
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
                      alertCount={alertCount} 
                      realtimeStats={realtimeStats}
                      selectedFault={selectedFault}
                      setSelectedFault={setSelectedFault}
                    />
                  )}
                </CalciteTab>
              ))}
            </CalciteTabs>
          </div>
        </FeatureGuard>

        {/* --- 2. ACTIVE USERS TAB --- */}
        <FeatureGuard featureKey="tab_Active_Users">
          <div style={{ display: activeTool === "Active Users" ? "block" : "none", height: "100%" }}>
            {/* Pass only the regions the current user is allowed to see */}
            <ActiveUsers permittedRegions={REGIONS} />
          </div>
        </FeatureGuard>

      </CalcitePanel>
    </CalciteShellPanel>
  );
}