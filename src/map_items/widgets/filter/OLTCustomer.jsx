// src/components/widgets/OLTCustomer.jsx
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
import { customerColumns } from '../../../constants/columns';

export default function OLTCustomer() {
  const { view, customerLayerView, addTableData, removeTableData, tableData, setTableVisibility } = useArcGIS(); 
  const { user } = useAuth(); 
  
  const REGIONS = user?.permissions?.regions || [];

  const [oltList, setOltList] = useState([]);
  const [selectedOlt, setSelectedOlt] = useState("");
  const [filterScope, setFilterScope] = useState("CURRENT_VIEW"); 
  
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState(null);
  const [isFiltered, setIsFiltered] = useState(false);

  useEffect(() => {
    const fetchOLTs = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${Realtime}/api/olts`); 
        const result = await response.json();

        if (result.success) {
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
  }, []); 

  const removeWFSLayer = () => {
    if (view && view.map) {
      const existingLayer = view.map.layers.find(layer => layer.title === "Customers_test_WFS");
      if (existingLayer) view.map.remove(existingLayer);
    }
  };

  // --- SMART CACHE CHECK ---
  const currentParams = JSON.stringify({ selectedOlt, filterScope });
  const isCached = tableData?.olt?.filterParams === currentParams;

  const handleActionClick = async () => {
    if (isCached) {
      setTableVisibility("olt", true);
      return;
    }

    if (!view || !view.map || !selectedOlt) return;
    setIsApplying(true);
    setError(null);

    try {
      const safeOlt = selectedOlt.replace(/'/g, "''");

      if (filterScope === "CURRENT_VIEW") {
        removeWFSLayer(); 
        
        if (customerLayerView) {
          const whereClause = `olt = '${safeOlt}'`;
          customerLayerView.filter = { where: whereClause };

          const query = customerLayerView.layer.createQuery();
          query.where = whereClause;
          query.outFields = ["*"];
          query.returnGeometry = true;

          const featureSet = await customerLayerView.layer.queryFeatures(query);
          
          if (addTableData) {
            addTableData("olt", "OLT Customers", featureSet.features, customerColumns, currentParams);
          }
        } else {
          console.warn("customerLayerView is not fully loaded yet.");
        }

      } else if (filterScope === "ALL_CUSTOMERS") {
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
        
        const query = wfsLayer.createQuery();
        query.where = "1=1";
        query.outFields = ["*"];
        query.returnGeometry = true;

        const featureSet = await wfsLayer.queryFeatures(query);
        
        if (featureSet.features.length > 0) {
           view.goTo(featureSet.features);
           if (addTableData) {
             addTableData("olt", "OLT Customers", featureSet.features, customerColumns, currentParams);
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

  const handleClear = () => {
    setSelectedOlt(""); 
    if (customerLayerView) customerLayerView.filter = null; 
    removeWFSLayer();
    if (removeTableData) removeTableData("olt");
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
            <CalciteSelect value={filterScope} onCalciteSelectChange={(e) => setFilterScope(e.target.value)} disabled={isApplying}>
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
        <CalciteButton appearance="solid" onClick={handleActionClick} loading={isApplying} disabled={!selectedOlt || isLoading} style={{ flex: 1 }}>
          {isCached ? "View Table" : "View on Map"}
        </CalciteButton>
        <CalciteButton onClick={handleClear} appearance="outline" kind="danger" disabled={!isFiltered && !tableData?.olt} style={{ flex: 1 }}>
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