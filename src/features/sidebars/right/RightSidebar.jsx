import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  CalciteShellPanel,
  CalciteActionBar,
  CalciteAction,
  CalcitePanel,
  CalciteBlock,
  CalciteNotice,
  CalciteButton
} from "@esri/calcite-components-react";

import FeatureGuard from "../../auth/FeatureGuard";
import { useAuth } from "../../auth/AuthContext";
import { useMapView } from "../../map/state/MapViewContext";
import { useRightPanel } from "../../map/state/RightPanelContext";
import { useSelection } from "../../map/state/SelectionContext";
import { useSidebarLayout, usePanelRef } from "../../dashboard/SidebarLayoutContext";
import LayerList from '../../map/widgets/layerList/LayerList';
import SymbologyWidget from '../../map/symbology/SymbologyWidget';
import BaseMapPicker from '../../map/widgets/BaseMapPicker';
import SelectionWidget from '../../map/widgets/SelectionWidget';
import MeasurementWidget from '../../map/widgets/MeasurementWidget';
import CustomerDetails from './details/CustomerDetails';
import PopDetails from './details/PopDetails';
import DcDetails from "./details/DcDetails";
import CustomerFaultFilter from '../../filters/widgets/CustomerFaultFilter';
import FeederDetails from "./details/FeederDetails";
import DistributionDetails from "./details/DistributionDetails";
import JCDetail from "./details/JcDetails";
import FatDetails from "./details/FatDetails";
import VehicleDetails from "./details/VehicleDetails";
import SiteDetails from "./details/SiteDetails";
import LonghaulDetails from "./details/LonghaulDetails";
import ParcelDetails from "./details/ParcelDetails";
import CoordinateDetails from './details/CoordinateDetails';
import CoincidentFeaturePager from './CoincidentFeaturePager';
import { layerLabel, OLT_CUSTOMER_LAYER_TITLE } from '../../../shared/constants/layerLabels';
import FspOutageAnalyzer from '../../map/widgets/FspOutageAnalyzer';
import InactiveCustomerFilter from '../../filters/widgets/InactiveCustomerFilter';
import DensityMapToggle from '../../map/widgets/DensityMapToggle';
import InactiveClusterDetails from './details/InactiveClusterDetails';
import InactiveCustomerDetails from './details/InactiveCustomerDetails';
import OltCustomerFilter from '../../filters/widgets/OltCustomerFilter';
import AlarmAnalyticsFilter from "../../filters/widgets/AlarmAnalyticsFilter";

const DETAILS_TOOL = "Details";

const ACTIONS = [
  { text: DETAILS_TOOL, icon: "information", featureKey: "tab_Details" },
  { text: "Layer", icon: "sliders-horizontal", featureKey: "tab_Layer" },
  { text: "Symbology", icon: "palette", featureKey: "tab_Symbology" },
  { text: "Map Tools", icon: "widgets-source", featureKey: "tab_Map_Tools" },
  { text: "Filter", icon: "layer-filter", featureKey: "tab_Filter" },
  { text: "AI Chat", icon: "speech-bubbles", featureKey: "tab_AIChat" }
];

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
  // Rendered by this file as <FeatureGuard featureKey="tool_CustomerInactiveFilter">
  // but declared only in the old src/components copy, so the admin toggle
  // existed by accident. Declared here now, where the guard actually lives.
  { key: "tool_CustomerInactiveFilter", label: "Inactive Customer Filter", group: "Right Sidebar Tab", tab: "tab_Filter" },
  { key: "tool_OLT_Customer", label: "OLT Filter", group: "Right Sidebar Tab", tab: "tab_Filter" },
  { key: "tool_AlarmAnalytics", label: "Alarm Diagnostics", group: "Right Sidebar Tab", tab: "tab_Filter" },
  { key: "tool_FSPAnalyzer", label: "Root Cause Analyzer", group: "Right Sidebar Tab", tab: "tab_Map_Tools" }
];

export default function RightSidebar({ hidden = false }) {
  const {
    selectionStack, activeSelectionId, setActiveSelectionId, closeSelection, clearAllSelections,
    updateSelectionFeature, setEntryCandidate, parcelFeature, setParcelFeature,
  } = useSelection();
  const activeEntry = useMemo(
    () => selectionStack.find(e => e.id === activeSelectionId) || null,
    [selectionStack, activeSelectionId]
  );
  const popupFeature = activeEntry?.feature ?? null;
  const { view } = useMapView();
  const { hasPermission } = useAuth();
  const { setIsRightPanelOpen } = useRightPanel();
  const { displayMode, requestClose, closeEndRequest } = useSidebarLayout();
  const shellPanelRef = usePanelRef("end");

  const [clusterFeaturesArray, setClusterFeaturesArray] = useState([]);
  const [isClusterLoading, setIsClusterLoading] = useState(false);

  const [activeTool, setActiveTool] = useState("Layer");
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Tracks which accordion block is open inside Map Tools and Filters (only one open at a time)
  const [openMapTool, setOpenMapTool] = useState("");
  const [openFilter, setOpenFilter] = useState("");

  const activeToolRef = useRef(activeTool);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  useEffect(() => {
    if (closeEndRequest > 0 && activeToolRef.current !== DETAILS_TOOL) {
      setIsCollapsed(true);
    }
  }, [closeEndRequest]);

  useEffect(() => {
    setIsRightPanelOpen(!isCollapsed);
  }, [isCollapsed, setIsRightPanelOpen]);

  useEffect(() => () => setIsRightPanelOpen(false), [setIsRightPanelOpen]);

  const panelRef = useRef(null);
  const permittedActions = useMemo(() => {
    return ACTIONS.filter(action => {
      if (!action.featureKey) return true;
      return hasPermission(action.featureKey);
    });
  }, [hasPermission]);

  // Permissions can change while the user is signed in -- the server now
  // refreshes them from the role on every request -- so the tool that is open
  // may be one they have just lost. Fall back to whatever they do still have,
  // rather than leaving the panel showing a heading with nothing under it.
  useEffect(() => {
    if (permittedActions.length === 0) return;
    if (permittedActions.some((a) => a.text === activeTool)) return;
    setActiveTool(permittedActions[0].text);
  }, [permittedActions, activeTool]);

  useEffect(() => {
    if (popupFeature || parcelFeature) {
      const canViewDetails = permittedActions.some(a => a.text === DETAILS_TOOL);
      if (canViewDetails) {
        setActiveTool(DETAILS_TOOL);
        setIsCollapsed(false);
      }
    }
  }, [popupFeature, permittedActions, parcelFeature]);

  const handleActionClick = (toolName) => {
    if (!isCollapsed && activeTool === toolName) {
      setIsCollapsed(true);
    } else {
      setActiveTool(toolName);
      setIsCollapsed(false);
      if (toolName !== DETAILS_TOOL) requestClose("start");
    }
  };

  const handlePanelClose = useCallback((e) => {
    if (e?.target && panelRef.current && e.target !== panelRef.current) return;
    setIsCollapsed(true);
    if (activeTool === DETAILS_TOOL) {
      clearAllSelections();
      setParcelFeature(null);
    }
  }, [activeTool, clearAllSelections, setParcelFeature]);

  const handleTabClick = useCallback(async (entry) => {
    setActiveSelectionId(entry.id);
    if (!view) return;
    const original = entry.feature;
    let target = original;
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
            updateSelectionFeature(entry.id, target, original);
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
    }
  }, [view, setActiveSelectionId, updateSelectionFeature]);

  useEffect(() => {
    const fetchClusterFeatures = async () => {
      if (!popupFeature) return; 
      const entryId = activeEntry?.id;
      if (popupFeature.isAggregate) {
        setIsClusterLoading(true);
        try {
          const layer = popupFeature.layer; 
          const layerView = await view.whenLayerView(layer);
          const clusterQuery = layerView.createQuery();
          clusterQuery.aggregateIds = [popupFeature.getObjectId()];
          const clusterResults = await layerView.queryFeatures(clusterQuery);
          const objIdField = layer.objectIdField || "__OBJECTID";
          const objectIds = clusterResults.features.map(f => f.attributes[objIdField]);

          if (objectIds && objectIds.length > 0) {
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
        setClusterFeaturesArray([]);
        if (popupFeature.isFullyLoaded) return;
        try {
          const layer = popupFeature.layer;
          if (!layer) return;
          const objIdField = layer.objectIdField || "__OBJECTID";
          const objectId = popupFeature.attributes[objIdField];
          if (objectId !== undefined) {
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
                fullFeature.layer = layer;
                fullFeature.isFullyLoaded = true;
                // popupFeature is the candidate this query was started for.
                if (entryId != null) updateSelectionFeature(entryId, fullFeature, popupFeature);
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
    if (popupFeature) {
      if (popupFeature.isAggregate) {
         if (isClusterLoading) return <div style={{ padding: "20px", color: "white" }}>Analyzing Cluster Data...</div>;
         return <InactiveClusterDetails clusterFeatures={clusterFeaturesArray} />;
      }
      const title = popupFeature.layer?.title;
      switch (title) {
        case "Customers_inactive": return <InactiveCustomerDetails feature={popupFeature} />;
        // The OLT filter's "all customers" layer is the customer layer under
        // another title, so a point on it opens the same panel. Without this
        // it fell through to "No renderer found", which is what clicking a
        // filtered customer used to do.
        case OLT_CUSTOMER_LAYER_TITLE:
        case "Customers_test": return <CustomerDetails feature={popupFeature} />;
        case "pop": return <PopDetails feature={popupFeature} />;
        case "dc_odb": return <DcDetails feature={popupFeature} />;
        case "Feeder": return <FeederDetails feature={popupFeature} />;
        case "Vehicles": return <VehicleDetails feature={popupFeature} />;
        case "Distribution": return <DistributionDetails feature={popupFeature} />;
        case "jc": return <JCDetail feature={popupFeature} />;
        case "site": return <SiteDetails feature={popupFeature} />;
        case "longhaul": return <LonghaulDetails feature={popupFeature} />;
        case "fat": return <FatDetails feature={popupFeature} />;
        case "CoordinateSearch": return <CoordinateDetails feature={popupFeature} />;
        default: return <div>No renderer found</div>;
      }
    }
    if (parcelFeature) return <ParcelDetails feature={parcelFeature} />;
    return (
      <CalciteNotice kind="brand" icon="search" scale="m" open>
        <div slot="title">No Data Selected</div>
        <div slot="message">Search above or click a point on the map.</div>
      </CalciteNotice>
    );
  };

  const handleZoomToActiveFeature = useCallback(async () => {
    if (!view) return;
    let target = popupFeature || parcelFeature;
    if (!target) return;
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
          if (results.features?.length) target = results.features[0];
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

  if (permittedActions.length === 0) return null;

  return (
    <CalciteShellPanel
      ref={shellPanelRef}
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
            active={!isCollapsed && activeTool === action.text ? true : undefined}
            onClick={() => handleActionClick(action.text)}
          />
        ))}
      </CalciteActionBar>

      <CalcitePanel ref={panelRef} heading={activeTool} closable onCalcitePanelClose={handlePanelClose} closed={isCollapsed}>
        
        {/* --- DETAILS TAB --- */}
        <FeatureGuard featureKey="tab_Details">
          {/* Fills the panel's content area -- a column flex box with a
              definite height -- so the pager at the bottom holds the panel's
              bottom edge. Left in normal flow it rides up under whatever the
              details happen to be at the time, which meant it jumped every
              time a page loaded. */}
          <div
            style={{
              display: activeTool === DETAILS_TOOL ? "flex" : "none",
              flex: "1 1 auto",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            {/* Only the details scroll; the pager below is outside this box. */}
            <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
              {selectionStack.length > 1 && (
                <div style={{ display: "flex", gap: "4px", padding: "6px 8px", overflowX: "auto", borderBottom: "1px solid var(--calcite-ui-border-3)" }}>
                  {selectionStack.map((entry, idx) => {
                    const isActive = entry.id === activeSelectionId;
                    const idLabel = entry.feature?.attributes?.id ?? entry.feature?.attributes?.name ?? "";
                    return (
                      <div
                        key={entry.id}
                        onClick={() => handleTabClick(entry)}
                        style={{
                          display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px",
                          borderRadius: "6px", cursor: "pointer", fontSize: "0.72rem", whiteSpace: "nowrap",
                          background: isActive ? "var(--calcite-ui-brand)" : "var(--calcite-ui-foreground-2)",
                          color: isActive ? "#fff" : "var(--calcite-ui-text-1)",
                        }}
                      >
                        <span>[{idx + 1}] {layerLabel(entry.label)}{idLabel ? `: ${idLabel}` : ""}</span>
                        <CalciteAction scale="m" icon="x" appearance="transparent" onClick={(e) => { e.stopPropagation(); closeSelection(entry.id); }} />
                      </div>
                    );
                  })}
                </div>
              )}
              {(popupFeature || parcelFeature) && (
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "0.25rem 0.5rem", borderBottom: "1px solid var(--calcite-ui-border-3)", backgroundColor: "var(--calcite-ui-foreground-2)" }}>
                   <CalciteButton appearance="transparent" iconStart="magnifying-glass-plus" scale="m" kind="neutral" onClick={handleZoomToActiveFeature}>
                      Zoom to Feature
                   </CalciteButton>
                </div>
              )}
              {renderFeatureDetails()}
            </div>
            {/* Held at the bottom of the panel, out of the scrolling box: the
                click that opened this panel may have landed on several
                stacked features, and this is how you reach the rest. */}
            <CoincidentFeaturePager
              entryId={activeEntry?.id}
              candidates={activeEntry?.candidates}
              index={activeEntry?.candidateIndex ?? 0}
              onSelect={(next) => activeEntry && setEntryCandidate(activeEntry.id, next)}
            />
          </div>
        </FeatureGuard>

        {/* --- LAYER TAB --- */}
        <FeatureGuard featureKey="tab_Layer">
          <div style={{ display: activeTool === "Layer" ? "block" : "none" }}>
            <CalciteBlock scale="m" heading="Layer Content" collapsible open>
              <LayerList />
            </CalciteBlock>
          </div>
        </FeatureGuard>

        {/* --- SYMBOLOGY TAB --- */}
        <FeatureGuard featureKey="tab_Symbology">
          <div style={{ display: activeTool === "Symbology" ? "block" : "none" }}>
            <SymbologyWidget />
          </div>
        </FeatureGuard>

        {/* --- MAP TOOLS TAB (Accordion Behavior: One Open at a Time) --- */}
        <FeatureGuard featureKey="tab_Map_Tools">
          <div style={{ display: activeTool === "Map Tools" ? "block" : "none" }}>
            
            <FeatureGuard featureKey="tool_base_map">
              <CalciteBlock 
                scale="m" 
                heading="Base Map" 
                collapsible 
                open={openMapTool === "tool_base_map" ? true : undefined}
                onCalciteBlockToggle={() => setOpenMapTool("tool_base_map")}
              >
                <BaseMapPicker />
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_selection">
              <CalciteBlock 
                scale="m" 
                heading="Selection Tools" 
                description="Pick features by drawing over them" 
                collapsible 
                open={openMapTool === "tool_selection" ? true : undefined}
                onCalciteBlockToggle={() => setOpenMapTool("tool_selection")}
              >
                <SelectionWidget />
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_measurement">
              <CalciteBlock 
                scale="m" 
                heading="Measure Tools" 
                description="Distance, area and radius on the map" 
                collapsible 
                open={openMapTool === "tool_measurement" ? true : undefined}
                onCalciteBlockToggle={() => setOpenMapTool("tool_measurement")}
              >
                <div style={{ padding: "1rem" }}>
                  <MeasurementWidget />
                </div>
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_densityMap">
              <CalciteBlock 
                scale="m" 
                heading="Density Map" 
                collapsible 
                open={openMapTool === "tool_densityMap" ? true : undefined}
                onCalciteBlockToggle={() => setOpenMapTool("tool_densityMap")}
              >
                <div style={{ padding: "1rem" }}>
                  <DensityMapToggle />
                </div>
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_FSPAnalyzer">
              <CalciteBlock 
                scale="m" 
                heading="Root Cause Analyzer (FSP)" 
                collapsible 
                open={openMapTool === "tool_FSPAnalyzer" ? true : undefined}
                onCalciteBlockToggle={() => setOpenMapTool("tool_FSPAnalyzer")}
              >
                <div style={{ padding: "1rem" }}>
                  <FspOutageAnalyzer />
                </div>
              </CalciteBlock>
            </FeatureGuard>

          </div>
        </FeatureGuard>

        {/* --- FILTER TAB (Accordion Behavior: One Open at a Time) --- */}
        <FeatureGuard featureKey="tab_Filter">
          <div style={{ display: activeTool === "Filter" ? "block" : "none" }}>
            
            <FeatureGuard featureKey="tool_CustomerFilter">
              <CalciteBlock 
                scale="m" 
                heading="Customer Faults Duration" 
                collapsible 
                open={openFilter === "tool_CustomerFilter" ? true : undefined}
                onCalciteBlockToggle={() => setOpenFilter("tool_CustomerFilter")}
              >
                <div style={{ padding: "1rem" }}>
                  <CustomerFaultFilter />
                </div>
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_CustomerInactiveFilter">
              <CalciteBlock 
                scale="m" 
                heading="Inactive Customer" 
                collapsible 
                open={openFilter === "tool_CustomerInactiveFilter" ? true : undefined}
                onCalciteBlockToggle={() => setOpenFilter("tool_CustomerInactiveFilter")}
              >
                <div style={{ padding: "1rem" }}>
                  <InactiveCustomerFilter />
                </div>
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_OLT_Customer">
              <CalciteBlock 
                scale="m" 
                heading="OLT Wise Customer" 
                collapsible 
                open={openFilter === "tool_OLT_Customer" ? true : undefined}
                onCalciteBlockToggle={() => setOpenFilter("tool_OLT_Customer")}
              >
                <div style={{ padding: "1rem" }}>
                  <OltCustomerFilter />
                </div>
              </CalciteBlock>
            </FeatureGuard>

            <FeatureGuard featureKey="tool_AlarmAnalytics">
              <CalciteBlock 
                scale="m" 
                heading="Alarm Analytics" 
                collapsible 
                open={openFilter === "tool_AlarmAnalytics" ? true : undefined}
                onCalciteBlockToggle={() => setOpenFilter("tool_AlarmAnalytics")}
              >
                <div style={{ padding: "1rem" }}>
                  <AlarmAnalyticsFilter />
                </div>
              </CalciteBlock>
            </FeatureGuard>

          </div>
        </FeatureGuard>
      </CalcitePanel>
    </CalciteShellPanel>
  );
}