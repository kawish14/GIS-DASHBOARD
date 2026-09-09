import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  CalciteShellPanel,
  CalciteActionBar,
  CalciteAction,
  CalcitePanel,
  CalciteBlock,
  CalciteNotice,
  CalciteButton
} from "@esri/calcite-components-react";

import FeatureGuard from "../auth/FeatureGuard";
import { useAuth } from "../../context/AuthContext";
import { usePopup, useMapView } from "../../context/MapContext";
import { useSidebarLayout } from "../../context/SidebarLayoutContext";
import LayerListSidebar  from '../../map_items/widgets/layerlist/LayerListSidebar';
import BaseMap  from '../../map_items/widgets/map_tools/BaseMap';
//import SearchWidget  from '../../map_items/widgets/SearchWidget';
import SelectionWidget from '../../map_items/widgets/map_tools/SelectionWidget';
import CustomerDetails from './popup/CustomerDetails';
import PopDetails from './popup/PopDetails';
import DcDetails from "./popup/DcDetails";
import CustomerFilter from '../../map_items/widgets/filter/CustomerFilter';
import FeederDetails from "./popup/FeederDetails";
import DistributionDetails from "./popup/DistributionDetails";
import JCDetail from "./popup/JCDetails";
import FatDetails from "./popup/FATDetials";
import VehicleDetails from "./popup/VehicleDetails";
import Sites from "./popup/Sites";
import LonghaulStyle from "./popup/LonghaulStyle";
import ParcelDetails from "./popup/ParcelDetails";
import CoordinateDetails from './popup/CoordinateDetails';

import FSPOutageAnalyzer from '../../map_items/widgets/map_tools/FSPOutageAnalyzer';
import CustomerInactiveFilter from '../../map_items/widgets/filter/CustomerInactiveFilter';
import DensityMapToggle from '../../map_items/widgets/map_tools/DensityMapToggle';
import HeatmapToggle from '../../map_items/widgets/filter/HeatmapToggle';
//import ChatWidget from "../../map_items/widgets/ChatWidget";
import InactiveClusterPopup from './popup/InactiveClusterPopup';
import InactiveCustomerDetails from './popup/InactiveCustomerDetails';
import OLTCustomer from '../../map_items/widgets/filter/OLTCustomer';
import AlarmAnalyticsFilter from "../../map_items/widgets/filter/AlarmAnalyticsFilter";



// Mapped exactly to your new DB Keys
const ACTIONS = [
  { text: "Details", icon: "information", featureKey: "tab_Details" },
  { text: "Layer", icon: "sliders-horizontal", featureKey: "tab_Layer" },
  { text: "Map Tools", icon: "widgets-source", featureKey: "tab_Map_Tools" },
  { text: "Filter", icon: "layer-filter", featureKey: "tab_Filter" },
  // New AI Chat Action
  { text: "AI Chat", icon: "speech-bubbles", featureKey: "tab_AIChat" }
];

// Auto-discovered by src/permissions/featureRegistry.js. The top-level tabs
// come straight from ACTIONS above (same reasoning as LeftSidebar.jsx); the
// nested tool-level entries are declared here because this file is where
// their <FeatureGuard featureKey="..."> calls actually live below -- keep
// each entry next to the JSX it gates, not in a separate list that can
// silently fall out of sync with it (which is exactly what happened to
// tool_FaultAnalytics after it moved out of this file's Filter tab -- see
// AnalyticsDashboard.jsx for its corrected entry).
//
// NOTE: tab_AIChat and tool_heatMap are intentionally left out below --
// their FeatureGuard blocks are commented out further down, so they aren't
// live features right now. Un-comment the block AND add the entry back
// together when that ships.
export const featureMeta = [
  ...ACTIONS.filter((a) => a.featureKey !== "tab_AIChat").map(({ featureKey, text }) => ({
    key: featureKey,
    label: `${text} Tab`,
    group: "Right Sidebar Tab",
  })),
  { key: "tool_base_map", label: "Base Map Switcher", group: "Right Sidebar Tab", tab: "tab_Map_Tools" },
  { key: "tool_selection", label: "Selection Tools", group: "Right Sidebar Tab", tab: "tab_Map_Tools" },
  { key: "tool_densityMap", label: "Density Map", group: "Right Sidebar Tab", tab: "tab_Map_Tools" },
  { key: "tool_CustomerFilter", label: "Customer Fault Filter", group: "Right Sidebar Tab", tab: "tab_Filter" },
  { key: "tool_CustomerInactiveFilter", label: "Inactive Customer Filter", group: "Right Sidebar Tab", tab: "tab_Filter" },
  { key: "tool_OLT_Customer", label: "OLT Filter", group: "Right Sidebar Tab", tab: "tab_Filter" },
  { 
  key: "tool_AlarmAnalytics", 
  label: "Alarm Diagnostics", 
  group: "Right Sidebar Tab", 
  tab: "tab_Filter" 
  },
  {
    key: "tool_FSPAnalyzer",
    label:"Root Cause Analyzer",
    group:"Right Sidebar Tab",
    tab:"tab_Map_Tools"
  }
];

export default function RightSidebar({ hidden = false }) {
  // Only subscribes to popup state + view. A `layers` or `realtimeStats`
  // change elsewhere no longer causes this component (and its Calcite
  // panel transition) to re-render.
  const {
    selectionStack, activeSelectionId, setActiveSelectionId, closeSelection, clearAllSelections,
    updateSelectionFeature,
    parcelFeature, setParcelFeature,
  } = usePopup();
  const activeEntry = useMemo(
    () => selectionStack.find(e => e.id === activeSelectionId) || null,
    [selectionStack, activeSelectionId]
  );
  // Alias so the render/effect logic below (written against a single
  // feature) keeps working unchanged -- it always reflects the *active* tab.
  const popupFeature = activeEntry?.feature ?? null;
  const { view } = useMapView();
  const { hasPermission } = useAuth();
  // Open/closed lives in SidebarLayoutContext, which also decides whether the
  // panels dock beside the map or overlay it at this viewport width. The two
  // sides are independent, so the identify results below stay on screen while
  // the user works in the left panel.
  const { displayMode, openEnd, setSidebarOpen } = useSidebarLayout();

  const [clusterFeaturesArray, setClusterFeaturesArray] = useState([]);
  const [isClusterLoading, setIsClusterLoading] = useState(false);

  const [activeTool, setActiveTool] = useState("Layer");
  const isCollapsed = !openEnd;

  // Dynamically filter actions
  const permittedActions = useMemo(() => {
    return ACTIONS.filter(action => {
      if (!action.featureKey) return true;
      return hasPermission(action.featureKey);
    });
  }, [hasPermission]);

  useEffect(() => {
    if (popupFeature || parcelFeature) {
      const canViewDetails = permittedActions.some(a => a.text === "Details");
      if (canViewDetails) {
        setActiveTool("Details");
        setSidebarOpen("end", true);
      }
    }
  }, [popupFeature, permittedActions, parcelFeature, setSidebarOpen]);

  const handleActionClick = (toolName) => {
    if (!isCollapsed && activeTool === toolName) {
      setSidebarOpen("end", false);
    } else {
      setActiveTool(toolName);
      setSidebarOpen("end", true);
    }
  };

  const handlePanelClose = useCallback(() => {
    setSidebarOpen("end", false);
    if (activeTool === "Details") {
      clearAllSelections();
      setParcelFeature(null)
    }
  }, [activeTool, clearAllSelections, setParcelFeature, setSidebarOpen]);

  // Switching tabs in the identify strip should also bring that tab's
  // feature back into view on the map -- e.g. clicking back to the
  // "Customer" tab after drilling into DC/POP re-centers on the customer,
  // without disturbing any other tab's highlight.
  const handleTabClick = useCallback(async (entry) => {
    setActiveSelectionId(entry.id);
    if (!view) return;

    let target = entry.feature;

    // Defensive: if this entry's feature somehow doesn't carry geometry
    // (e.g. it was swapped for an attribute-only record along the way),
    // pull it fresh from its layer by object id before navigating, rather
    // than silently doing nothing.
    if (target && !target.geometry && target.layer) {
      try {
        const layer = target.layer;
        const objIdField = layer.objectIdField || "__OBJECTID";
        const objectId = target.attributes?.[objIdField];
        if (objectId !== undefined) {
          const query = layer.createQuery();
          query.returnGeometry = true;
          query.outFields = ["*"];
          query.objectIds = [objectId];
          const results = await layer.queryFeatures(query);
          if (results.features?.length) {
            target = results.features[0];
            target.layer = layer;
            updateSelectionFeature(entry.id, target);
          }
        }
      } catch (err) {
        console.warn("Could not refetch geometry for tab:", err);
      }
    }

    if (target?.geometry) {
      view.goTo({ target }).catch((err) => {
        if (err.name !== "AbortError") console.error("Tab zoom failed:", err);
      });
    } else {
      console.warn("No geometry available to navigate to for this tab:", entry);
    }
  }, [view, setActiveSelectionId, updateSelectionFeature]);

  // NEW: Fetch underlying features when a cluster or compressed point is clicked
  useEffect(() => {
    const fetchClusterFeatures = async () => {
      if (!popupFeature) return; // Exit early if null
      const entryId = activeEntry?.id;

      if (popupFeature.isAggregate) {
        setIsClusterLoading(true);
        try {
          const layer = popupFeature.layer; // The actual Feature/GeoJSON Layer
          const layerView = await view.whenLayerView(layer);

          // STEP 1: Query the LayerView to get the minimal cluster features (just IDs)
          const clusterQuery = layerView.createQuery();
          clusterQuery.aggregateIds = [popupFeature.getObjectId()];
          const clusterResults = await layerView.queryFeatures(clusterQuery);

          // Extract the unique IDs
          const objIdField = layer.objectIdField || "__OBJECTID";
          const objectIds = clusterResults.features.map(f => f.attributes[objIdField]);

          if (objectIds && objectIds.length > 0) {
            // STEP 2: Query the actual Data Layer for ALL attributes
            const fullDataQuery = layer.createQuery();
            fullDataQuery.outFields = ["*"];

            if (typeof objectIds[0] === 'string') {
               fullDataQuery.where = `${objIdField} IN ('${objectIds.join("','")}')`;
            } else {
               fullDataQuery.objectIds = objectIds;
            }

            const finalResults = await layer.queryFeatures(fullDataQuery);
            setClusterFeaturesArray(finalResults.features);
          } else {
            setClusterFeaturesArray([]);
          }
        } catch (error) {
          console.error("Failed to fetch full cluster features:", error);
          setClusterFeaturesArray([]);
        } finally {
          setIsClusterLoading(false);
        }

      } else {
        // --- NON-CLUSTER SINGLE POINT CLICK ---
        setClusterFeaturesArray([]);

        // Prevent Infinite Loop: Only fetch if we haven't already injected the full data
        if (popupFeature.isFullyLoaded) return;

        try {
          const layer = popupFeature.layer;
          if (!layer) return;

          const objIdField = layer.objectIdField || "__OBJECTID";
          const objectId = popupFeature.attributes[objIdField];

          if (objectId !== undefined) {
             // Query the DATA LAYER (not LayerView) to get all attributes
             const query = layer.createQuery();
             query.returnGeometry = true;
             query.outFields = ["*"];

             if (typeof objectId === 'string') {
                query.where = `${objIdField} = '${objectId}'`;
             } else {
                query.objectIds = [objectId];
             }

             const results = await layer.queryFeatures(query);

             if (results.features && results.features.length > 0) {
                const fullFeature = results.features[0];

                // Keep the layer reference so your switch statement still works
                fullFeature.layer = layer;
                // Flag to prevent the useEffect from triggering an infinite loop
                fullFeature.isFullyLoaded = true;

                // Push the rich data back into that tab's entry (not a new tab).
                if (entryId != null) updateSelectionFeature(entryId, fullFeature);
             }
          }
        } catch (error) {
          console.error("Failed to fetch single feature details:", error);
        }
      }
    };

    fetchClusterFeatures();
  }, [popupFeature, activeEntry?.id, view, updateSelectionFeature]);

  const renderFeatureDetails = () => {
    // Priority 1: normal feature
    if (popupFeature) {

      if (popupFeature.isAggregate) {
         if (isClusterLoading) {
             return <div style={{ padding: "20px", color: "white" }}>Analyzing Cluster Data...</div>;
         }
         return <InactiveClusterPopup clusterFeatures={clusterFeaturesArray} />;
      }

      const title = popupFeature.layer?.title;

      switch (title) {
        case "Customers_inactive":
          return <InactiveCustomerDetails feature={popupFeature} />;
        case "Customers_test":
          return <CustomerDetails feature={popupFeature} />;
        case "pop":
          return <PopDetails feature={popupFeature} />;
        case "dc_odb":
          return <DcDetails feature={popupFeature} />;
        case "Feeder":
          return <FeederDetails feature={popupFeature} />;
        case "Vehicles":
          return <VehicleDetails feature={popupFeature} />;
        case "Distribution":
          return <DistributionDetails feature={popupFeature} />;
        case "jc":
          return <JCDetail feature={popupFeature} />;
        case "site":
          return <Sites feature={popupFeature} />;
        case "longhaul":
          return <LonghaulStyle feature={popupFeature} />;
        case "fat":
          return <FatDetails feature={popupFeature} />;
        case "CoordinateSearch":
          return <CoordinateDetails feature={popupFeature} />;
        default:
          return <div>No renderer found</div>;
      }
    }

    // Priority 2: parcel
    if (parcelFeature) {
      return <ParcelDetails feature={parcelFeature} />;
    }

    return (
      <CalciteNotice kind="brand" icon="search" open>
        <div slot="title">No Data Selected</div>
        <div slot="message">Search above or click a point on the map.</div>
      </CalciteNotice>
    );
  };

  const handleZoomToActiveFeature = useCallback(async () => {
    if (!view) return;
    
    let target = popupFeature || parcelFeature;
    if (!target) return;

    // Fetch geometry if missing (same safety check used in handleTabClick)
    if (!target.geometry && target.layer) {
      try {
        const layer = target.layer;
        const objIdField = layer.objectIdField || "__OBJECTID";
        const objectId = target.attributes?.[objIdField];
        if (objectId !== undefined) {
          const query = layer.createQuery();
          query.returnGeometry = true;
          query.outFields = ["*"];
          query.objectIds = [objectId];
          const results = await layer.queryFeatures(query);
          if (results.features?.length) {
            target = results.features[0];
          }
        }
      } catch (err) {
        console.warn("Could not refetch geometry for zooming:", err);
      }
    }

    if (target?.geometry) {
      view.goTo({ target, zoom: 20 }).catch((err) => {
        if (err.name !== "AbortError") console.error("Zoom failed:", err);
      });
    }
  }, [view, popupFeature, parcelFeature]);

  // If user has zero right-sidebar permissions, hide the whole panel
  if (permittedActions.length === 0) return null;

  return (
    <CalciteShellPanel
      slot="panel-end"
      position="end"
      id="shell-panel-end"
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
            active={
              !isCollapsed && activeTool === action.text ? true : undefined
            }
            onClick={() => handleActionClick(action.text)}
          />
        ))}
      </CalciteActionBar>

      <CalcitePanel
        heading={activeTool}
        closable
        onCalcitePanelClose={handlePanelClose}
        closed={isCollapsed}
      >
        {/* --- DETAILS TAB --- */}
        <FeatureGuard featureKey="tab_Details">
          <div style={{ display: activeTool === "Details" ? "block" : "none" }}>
            {/*  <SearchWidget />  */}

            {/* ArcGIS Pro-style "Identify" tab strip: one tab per lookup in
                the chain (Customer -> DC -> POP). Switching tabs never
                clears another tab's map highlight -- that's owned per-entry
                in PopupContext. */}
            {selectionStack.length > 1 && (
              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  padding: "6px 8px",
                  overflowX: "auto",
                  borderBottom: "1px solid var(--calcite-ui-border-3)",
                }}
              >
                {selectionStack.map((entry, idx) => {
                  const isActive = entry.id === activeSelectionId;
                  const idLabel =
                    entry.feature?.attributes?.id ??
                    entry.feature?.attributes?.name ??
                    "";
                  console.log(entry);
                  return (
                    <div
                      key={entry.id}
                      onClick={() => handleTabClick(entry)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.72rem",
                        whiteSpace: "nowrap",
                        background: isActive
                          ? "var(--calcite-ui-brand)"
                          : "var(--calcite-ui-foreground-2)",
                        color: isActive ? "#fff" : "var(--calcite-ui-text-1)",
                      }}
                    >
                      <span>
                        [{idx + 1}]{" "}
                        {entry.label === "Customers_test"
                          ? "Customers"
                          : entry.label}
                        {idLabel ? `: ${idLabel}` : ""}
                      </span>
                      <CalciteAction
                        scale="s"
                        icon="x"
                        appearance="transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeSelection(entry.id);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* --- NEW: GLOBAL ZOOM BUTTON FOR ALL POPUPS --- */}
            {(popupFeature || parcelFeature) && (
              <div style={{ 
                display: "flex", 
                justifyContent: "flex-end", 
                padding: "0.25rem 0.5rem", 
                borderBottom: "1px solid var(--calcite-ui-border-3)", 
                backgroundColor: "var(--calcite-ui-foreground-2)" 
              }}>
                 <CalciteButton
                    appearance="transparent"
                    iconStart="magnifying-glass-plus"
                    scale="s"
                    kind="neutral"
                    onClick={handleZoomToActiveFeature}
                 >
                    Zoom to Feature
                 </CalciteButton>
              </div>
            )}
            {/* This renders whatever component (Customer, DC, Vehicle, etc.) is active */}
            {renderFeatureDetails()}
          </div>
        </FeatureGuard>

        {/* --- LAYER TAB --- */}
        <FeatureGuard featureKey="tab_Layer">
          <div style={{ display: activeTool === "Layer" ? "block" : "none" }}>
            <CalciteBlock heading="Layer Content" collapsible open>
              <LayerListSidebar />
            </CalciteBlock>
          </div>
        </FeatureGuard>

        {/* --- MAP TOOLS TAB --- */}
        <FeatureGuard featureKey="tab_Map_Tools">
          <div
            style={{ display: activeTool === "Map Tools" ? "block" : "none" }}
          >
            <FeatureGuard featureKey="tool_base_map">
              <CalciteBlock heading="Base Map" collapsible close>
                <BaseMap />
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_selection">
              <CalciteBlock heading="Selection Tools" collapsible close>
                <SelectionWidget />
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_densityMap">
              <CalciteBlock heading="Density Map" collapsible close>
                <div style={{ padding: "1rem" }}>
                  <DensityMapToggle />
                </div>
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_FSPAnalyzer">
              <CalciteBlock heading="Root Cause Analyzer (FSP)" collapsible close>
                <div style={{ padding: "1rem" }}>
                  <FSPOutageAnalyzer />
                </div>
              </CalciteBlock>
            </FeatureGuard>

            {/*   <FeatureGuard featureKey="tool_heatMap">
              <CalciteBlock heading="Heatmap" collapsible open>
                <div style={{ padding: "1rem" }}>
                  <HeatmapToggle />
                </div>
              </CalciteBlock>
            </FeatureGuard> */}
          </div>
        </FeatureGuard>

        {/* --- FILTER TAB --- */}
        <FeatureGuard featureKey="tab_Filter">
          <div style={{ display: activeTool === "Filter" ? "block" : "none" }}>
            <FeatureGuard featureKey="tool_CustomerFilter">
              <CalciteBlock
                heading="Customer Faults Duration"
                collapsible
                close
              >
                <div style={{ padding: "1rem" }}>
                  <CustomerFilter />
                </div>
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_CustomerInactiveFilter">
              <CalciteBlock heading="Inactive Customer" collapsible close>
                <div style={{ padding: "1rem" }}>
                  <CustomerInactiveFilter />
                </div>
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_OLT_Customer">
              <CalciteBlock heading="OLT Wise Customer" collapsible close>
                <div style={{ padding: "1rem" }}>
                  <OLTCustomer />
                </div>
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_AlarmAnalytics">
              <CalciteBlock heading="Alarm Analytics" collapsible close>
                <div style={{ padding: "1rem" }}>
                  <AlarmAnalyticsFilter />
                </div>
              </CalciteBlock>
            </FeatureGuard>
          </div>
        </FeatureGuard>

        {/* --- AI CHAT TAB --- */}
        {/* <FeatureGuard featureKey="tab_AIChat">
          <div style={{ display: activeTool === "AI Chat" ? "block" : "none", height: "100%" }}>
            <ChatWidget view={view} />
          </div>
        </FeatureGuard> */}
      </CalcitePanel>
    </CalciteShellPanel>
  );
}