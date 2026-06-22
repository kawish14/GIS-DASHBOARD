import React, { useState, useEffect } from "react";
import {
  CalciteLabel,
  CalciteSelect,
  CalciteOption,
  CalciteButton,
  CalciteLoader,
  CalciteNotice,
  CalciteCombobox,
  CalciteComboboxItem
} from "@esri/calcite-components-react";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import { useArcGIS } from "../../../context/MapContext";
import { useAuth } from "../../../context/AuthContext";
import { Realtime } from '../../../../url'; 

export default function OLTCustomer() {
  // 1. ADDED: Destructure setSelectedFeatures from MapContext
  const { view, customerLayerView, setSelectedFeatures } = useArcGIS(); 
  const { user } = useAuth(); 
  
  // Extract user regions
  const REGIONS = user?.permissions?.regions || [];

  // State Management
  const [oltList, setOltList] = useState([]);
  const [selectedOlt, setSelectedOlt] = useState("");
  const [filterScope, setFilterScope] = useState("CURRENT_VIEW"); 
  
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState(null);
  const [isFiltered, setIsFiltered] = useState(false);

  // Fetch and Filter OLT Data on Mount
  useEffect(() => {
    const fetchOLTs = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${Realtime}/api/olts`); 
        const result = await response.json();

        if (result.success) {
          // Keep OLTs where the item.region matches a region in the user's REGIONS array.
          const permittedOLTs = REGIONS.length > 0 
            ? result.data.filter((item) => REGIONS.includes(item.region))
            : []; 

          setOltList(permittedOLTs);
        } else {
          throw new Error(result.message || "Failed to fetch OLTs");
        }
      } catch (err) {
        console.error("Error fetching OLT list:", err);
        setError("Failed to load OLT data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchOLTs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // Helper to remove temporary WFS layer if it exists
  const removeWFSLayer = () => {
    if (view && view.map) {
      const existingLayer = view.map.layers.find(layer => layer.title === "Customers_test_WFS");
      if (existingLayer) {
        view.map.remove(existingLayer);
      }
    }
  };

  // Handle Apply Filter
  const handleFilter = async () => {
    if (!view || !view.map || !selectedOlt) return;
    
    setIsApplying(true);
    setError(null);

    try {
      const safeOlt = selectedOlt.replace(/'/g, "''");

      if (filterScope === "CURRENT_VIEW") {
        // --- OPTION 1: CURRENT VIEW (Client-Side) ---
        removeWFSLayer(); 
        
        if (customerLayerView) {
          const whereClause = `olt = '${safeOlt}'`;
          customerLayerView.filter = { where: whereClause };

          // 2. ADDED: Query the underlying layer to get full attribute data for the table
          const query = customerLayerView.layer.createQuery();
          query.where = whereClause;
          query.outFields = ["*"];
          query.returnGeometry = true;

          const featureSet = await customerLayerView.layer.queryFeatures(query);
          
          // Push features to context so FeatureTable.jsx opens automatically
          if (setSelectedFeatures) {
            setSelectedFeatures(featureSet.features);
          }
        } else {
          console.warn("customerLayerView is not fully loaded yet.");
        }

      } else if (filterScope === "ALL_CUSTOMERS") {
        // --- OPTION 2: ALL CUSTOMERS (Server-Side WFS) ---
        if (customerLayerView) {
          customerLayerView.filter = null; 
        }
        removeWFSLayer();

        const cqlFilter = `olt='${safeOlt}'`;
        
        const wfsUrl = `http://gis.tes.com.pk:29881/geoserver/web_app/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=web_app%3ACustomers_test&outputFormat=application%2Fjson&maxFeatures=1000000&cql_filter=${encodeURIComponent(cqlFilter)}`;

        const wfsLayer = new GeoJSONLayer({
          url: wfsUrl,
          title: "Customers_test_WFS",
          renderer: {
            type: "simple",
            symbol: {
              type: "simple-marker",
              color: "#ff8c00",
              size: "6px",
              outline: { color: "#ffffff", width: 1 }
            }
          }
        });

        view.map.add(wfsLayer);
        
        await view.whenLayerView(wfsLayer);
        
        // 3. ADDED: Query the newly added WFS layer and push to the table
        const query = wfsLayer.createQuery();
        query.where = "1=1";
        query.outFields = ["*"];
        query.returnGeometry = true;

        const featureSet = await wfsLayer.queryFeatures(query);
        
        if (featureSet.features.length > 0) {
           view.goTo(featureSet.features);
           // Push features to context so FeatureTable.jsx opens automatically
           if (setSelectedFeatures) {
             setSelectedFeatures(featureSet.features);
           }
        }
      }

      setIsFiltered(true);
    } catch (err) {
      console.error("Error applying filter:", err);
      setError("Failed to apply filter to map.");
    } finally {
      setIsApplying(false);
    }
  };

  // Handle Clearing the Filter
  const handleClear = () => {
    setSelectedOlt(""); 
    
    // Clear Client-side filter
    if (customerLayerView) {
      customerLayerView.filter = null; 
    }
    
    // Clear Server-side layer
    removeWFSLayer();

    // 4. ADDED: Empty out the table features so the BottomPanel hides itself
    if (setSelectedFeatures) {
      setSelectedFeatures([]);
    }
    
    setIsFiltered(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      
      {error && (
        <CalciteNotice open icon="exclamation-mark-triangle" kind="danger">
          <div slot="message">{error}</div>
        </CalciteNotice>
      )}

      {REGIONS.length === 0 && !isLoading && !error && (
        <CalciteNotice open icon="shield" kind="warning">
          <div slot="message">You do not have permission to view any regional OLTs.</div>
        </CalciteNotice>
      )}

      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}>
          <CalciteLoader label="Loading OLTs" />
        </div>
      ) : (
        <>
          <CalciteLabel>
            Search Scope
            <CalciteSelect
              value={filterScope}
              onCalciteSelectChange={(e) => setFilterScope(e.target.value)}
              disabled={isApplying}
            >
              <CalciteOption label="Current View (Map Display)" value="CURRENT_VIEW" />
              <CalciteOption label="All Customers (Database Fetch)" value="ALL_CUSTOMERS" />
            </CalciteSelect>
          </CalciteLabel>

          <CalciteLabel>
            Select OLT
            <CalciteCombobox
              selectionMode="single"
              maxItems={15} 
              placeholder="Search or select an OLT..."
              disabled={REGIONS.length === 0 || isApplying}
              onCalciteComboboxChange={(e) => {
                const selectedItems = Array.from(e.target.selectedItems || []);
                setSelectedOlt(selectedItems.length > 0 ? selectedItems[0].value : "");
              }}
            >
              {oltList.map((item, index) => (
                <CalciteComboboxItem 
                  key={`${item.olt}-${index}`} 
                  value={item.olt} 
                  textLabel={`${item.olt} (${item.region})`} 
                  selected={selectedOlt === item.olt}
                />
              ))}
            </CalciteCombobox>
          </CalciteLabel>
        </>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <CalciteButton 
          appearance="solid"
          onClick={handleFilter} 
          loading={isApplying}
          disabled={!selectedOlt || isLoading} 
          style={{ flex: 1 }}
        >
          View on Map
        </CalciteButton>
        <CalciteButton 
          onClick={handleClear} 
          appearance="outline" 
          kind="danger" 
          disabled={!isFiltered && !selectedOlt} 
          style={{ flex: 1 }}
        >
          Clear
        </CalciteButton>
      </div>

      {isFiltered && (
        <CalciteNotice kind="success" icon="check" open style={{ marginTop: '0.5rem' }}>
          <div slot="message">Filter applied successfully.</div>
        </CalciteNotice>
      )}
      
    </div>
  );
}