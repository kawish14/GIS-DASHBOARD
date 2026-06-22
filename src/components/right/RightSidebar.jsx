import React, { useState, useEffect, useMemo } from "react";
import {
  CalciteShellPanel,
  CalciteActionBar,
  CalciteAction,
  CalcitePanel,
  CalciteBlock,
  CalciteNotice,
} from "@esri/calcite-components-react";

import FeatureGuard from "../auth/FeatureGuard";
import { useAuth } from "../../context/AuthContext"; 
import { useArcGIS } from "../../context/MapContext"; 
import LayerListSidebar  from '../../map_items/widgets/layerlist/LayerListSidebar';
import BaseMap  from '../../map_items/widgets/BaseMap';
//import SearchWidget  from '../../map_items/widgets/SearchWidget';
import SelectionWidget from '../../map_items/widgets/SelectionWidget';
import CustomerDetails from './popup/CustomerDetails';
import PopDetails from './popup/PopDetails';
import DcDetails from "./popup/DcDetails";
import CustomerFilter from '../../map_items/widgets/customer/CustomerFilter';
import FeederDetails from "./popup/FeederDetails";
import DistributionDetails from "./popup/DistributionDetails";
import JCDetail from "./popup/JCDetails";
import VehicleDetails from "./popup/VehicleDetails";
import Sites from "./popup/Sites";
import LonghaulStyle from "./popup/LonghaulStyle";
import ParcelDetails from "./popup/ParcelDetails";
import CustomerInactiveFilter from '../../map_items/widgets/customer/CustomerInactiveFilter';
import DensityMapToggle from '../../map_items/widgets/customer/DensityMapToggle';
import HeatmapToggle from '../../map_items/widgets/customer/HeatmapToggle';
import ChatWidget from "../../map_items/widgets/ChatWidget";
import InactiveClusterPopup from './popup/InactiveClusterPopup';
import InactiveCustomerDetails from './popup/InactiveCustomerDetails';
import OLTCustomer from '../../map_items/widgets/customer/OLTCustomer';

// Mapped exactly to your new DB Keys
const ACTIONS = [
  { text: "Details", icon: "information", featureKey: "tab_Details" },
  { text: "Layer", icon: "sliders-horizontal", featureKey: "tab_Layer" }, 
  { text: "Map Tools", icon: "widgets-source", featureKey: "tab_Map_Tools" },
  { text: "Filter", icon: "layer-filter", featureKey: "tab_Filter" },
  // New AI Chat Action
  { text: "AI Chat", icon: "speech-bubbles", featureKey: "tab_AIChat" }
];

export default function RightSidebar() {
  const { popupFeature, setPopupFeature, parcelFeature, setParcelFeature, view } = useArcGIS();
  const { hasPermission } = useAuth(); 

  const [clusterFeaturesArray, setClusterFeaturesArray] = useState([]);
  const [isClusterLoading, setIsClusterLoading] = useState(false);

  const [activeTool, setActiveTool] = useState("Layer");
  const [isCollapsed, setIsCollapsed] = useState(true);

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
    }
  };

  const handlePanelClose = () => {
    setIsCollapsed(true);
    if (activeTool === "Details") {
      setPopupFeature(null);
      setParcelFeature(null)
    }
  };

  // NEW: Fetch underlying features when a cluster or compressed point is clicked
  useEffect(() => {
    const fetchClusterFeatures = async () => {
      if (!popupFeature) return; // Exit early if null

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
                
                // Push the rich data back into the App state!
                setPopupFeature(fullFeature);
             }
          }
        } catch (error) {
          console.error("Failed to fetch single feature details:", error);
        }
      }
    };

    fetchClusterFeatures();
  }, [popupFeature, view, setPopupFeature]);

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

  // If user has zero right-sidebar permissions, hide the whole panel
  if (permittedActions.length === 0) return null;

  return (
    <CalciteShellPanel
      slot="panel-end"
      position="end"
      id="shell-panel-end"
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

      <CalcitePanel heading={activeTool} closable onCalcitePanelClose={handlePanelClose} closed={false}>
        
        {/* --- DETAILS TAB --- */}
        <FeatureGuard featureKey="tab_Details">
          <div style={{ display: activeTool === "Details" ? "block" : "none" }}>
           {/*  <SearchWidget />  */}
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
          <div style={{ display: activeTool === "Map Tools" ? "block" : "none" }}>
            
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
              <CalciteBlock heading="Customer Faults Duration" collapsible close>
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