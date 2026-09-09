// src/components/widgets/CustomerInactiveFilter.jsx
import React, { useEffect, useState } from 'react';
import {
  CalciteLabel,
  CalciteSelect,
  CalciteOption,
  CalciteButton,
  CalciteNotice,
  CalciteCombobox,
  CalciteComboboxItem
} from "@esri/calcite-components-react";
import { useArcGIS } from "../../../context/MapContext";
import { useAuth } from "../../../context/AuthContext";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import { api } from '../../../../url';
import { customerColumns } from '../../../constants/columns'; 

const ALARM_LABELS = { 0: "Online", 1: "Power Off", 2: "Linked Down", 3: "GEM Packet Loss", 4: "LOP" };
const ALARM_COLORS = ["#29dd41", "#002df4", "#f40707", "#000000", "#eeff00", "#911eb4", "#46f0f0", "#f032e6"];

export default function CustomerInactiveFilter() {
  const { view, addTableData, removeTableData, tableData, setTableVisibility } = useArcGIS();
  const { user } = useAuth();
  const REGIONS = user?.permissions?.regions || [];
  
  const [statuses, setStatuses] = useState([]);
  const [alarmStates, setAlarmStates] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState(""); 
  const [selectedAlarms, setSelectedAlarms] = useState([]); 
  
  const [isLoading, setIsLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [error, setError] = useState(null);

  const WFS_URL = `${api}/geoserver/web_app/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=web_app%3ACustomers_inactive&outputFormat=application%2Fjson&maxFeatures=1000000`;
  const regionCondition = REGIONS.length > 0 ? `(${REGIONS.map(r => `region = '${r}'`).join(" OR ")})` : "1=0";

  useEffect(() => {
    const fetchFilterData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const BASE_WFS = `${api}/geoserver/web_app/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=web_app%3ACustomers_inactive&outputFormat=application%2Fjson`;
        let fetchUrl = `${BASE_WFS}&propertyName=status,alarmstate`;
        if (REGIONS.length > 0) fetchUrl += `&cql_filter=${encodeURIComponent(regionCondition)}`;

        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error("Network response was not ok");
        
        const data = await response.json();
        const uniqueStatuses = new Set();
        const uniqueAlarms = new Set();
        
        data.features.forEach((feature) => {
          const props = feature.properties;
          if (props.status) uniqueStatuses.add(props.status);
          if (props.alarmstate !== null && props.alarmstate !== undefined) {
            uniqueAlarms.add(props.alarmstate);
          }
        });
        
        setStatuses(Array.from(uniqueStatuses));
        setAlarmStates(Array.from(uniqueAlarms).sort((a, b) => a - b));
      } catch (err) {
        console.error("Error fetching WFS data:", err);
        setError("Failed to load filter options.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchFilterData();
  }, []); 

  // --- SMART CACHE CHECK ---
  const currentParams = JSON.stringify({ selectedStatus, selectedAlarms });
  const isCached = tableData?.inactive?.filterParams === currentParams;

  const handleActionClick = async () => {
    if (isCached) {
      setTableVisibility("inactive", true);
      return;
    }

    if (!view || !view.map) return;
    setIsFiltering(true);
    setError(null);

    try {
      const conditions = [];
      if (REGIONS.length > 0) conditions.push(regionCondition);
      if (selectedStatus && selectedStatus !== "") conditions.push(`status = '${selectedStatus}'`);
      if (selectedAlarms.length > 0) {
        const inValues = selectedAlarms.map(val => `'${val}'`).join(',');
        conditions.push(`alarmstate IN (${inValues})`);
      }

      const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "1=1";
      let filteredUrl = WFS_URL;
      if (conditions.length > 0) filteredUrl += `&cql_filter=${encodeURIComponent(whereClause)}`;

      let targetLayer = view.map.layers.find(layer => layer.title === "Customers_inactive");
      if (targetLayer) view.map.remove(targetLayer);

      targetLayer = new GeoJSONLayer({
        url: filteredUrl, 
        title: "Customers_inactive",
        renderer: {
          type: "unique-value",
          field: "alarmstate",
          defaultSymbol: { type: "simple-marker", color: "gray", size: "8px", outline: null },
          uniqueValueInfos: alarmStates.map((alarm) => ({
            value: alarm, 
            label: ALARM_LABELS[alarm] || `Unknown (${alarm})`,
            symbol: { type: "simple-marker", color: ALARM_COLORS[alarm] || "#999999", size: "10px", outline: null }
          }))
        },
        featureReduction: {
          type: "cluster",
          clusterRadius: "80px",
          clusterMinSize: "20px",
          clusterMaxSize: "40px",
          labelingInfo: [{
            labelPlacement: "center-center",
            labelExpressionInfo: { expression: "$feature.cluster_count" },
            symbol: { type: "text", color: "white", haloColor: "black", haloSize: "1px", font: { weight: "bold", size: "14px" } }
          }]
        }
      });
      
      view.map.add(targetLayer);
      await view.whenLayerView(targetLayer);
      
      const query = targetLayer.createQuery();
      query.where = "1=1"; 
      query.outFields = ["*"];
      query.returnGeometry = true;

      const featureSet = await targetLayer.queryFeatures(query);
      
      if (addTableData) {
        addTableData("inactive", "Inactive Customers", featureSet.features, customerColumns, currentParams);
      }

    } catch (error) {
      console.error("Error applying filter:", error);
      setError("Failed to apply filter.");
    } finally {
      setIsFiltering(false);
    }
  };

  const clearFilter = () => {
    setSelectedStatus(""); 
    setSelectedAlarms([]); 
    
    if (view && view.map) {
      const targetLayer = view.map.layers.find(layer => layer.title === "Customers_inactive");
      if (targetLayer) view.map.remove(targetLayer);
    }

    if (removeTableData) {
      removeTableData("inactive");
    }
  };

  const isApplyDisabled = isLoading || isFiltering || selectedStatus === "" || selectedAlarms.length === 0; 

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {error && (
        <CalciteNotice kind="danger" icon="exclamation-mark-triangle" open>
          <div slot="title">Error</div>
          <div slot="message">{error}</div>
        </CalciteNotice>
      )}

      <CalciteLabel>
        Customer Status
        <CalciteSelect value={selectedStatus} onCalciteSelectChange={(e) => setSelectedStatus(e.target.value)} disabled={isLoading || isFiltering}>
          <CalciteOption value="" disabled>Select Status...</CalciteOption>
          {statuses.map((status, index) => (
            <CalciteOption key={index} value={status}>{status}</CalciteOption>
          ))}
        </CalciteSelect>
      </CalciteLabel>

      <CalciteLabel>
        Alarm State(s)
        <CalciteCombobox 
          selectionMode="multiple"
          placeholder="Select one or more alarm states..."
          disabled={isLoading || isFiltering}
          onCalciteComboboxChange={(e) => {
            const selectedItems = Array.from(e.target.selectedItems || []);
            setSelectedAlarms(selectedItems.map(item => item.value));
          }}
        >
          {alarmStates.map((alarm, index) => (
            <CalciteComboboxItem 
              key={index} 
              value={alarm.toString()} 
              textLabel={ALARM_LABELS[alarm] || `Unknown (${alarm})`} 
              selected={selectedAlarms.includes(alarm.toString())} 
            />
          ))}
        </CalciteCombobox>
      </CalciteLabel>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <CalciteButton appearance="solid" width="half" onClick={handleActionClick} loading={isFiltering} disabled={isApplyDisabled}>
          {isCached ? "View Table" : (isLoading ? "Loading Data..." : "Apply Filter")}
        </CalciteButton>
        <CalciteButton appearance="outline" kind="danger" width="half" onClick={clearFilter} disabled={isFiltering && !tableData?.inactive}>
          Clear
        </CalciteButton>
      </div>
    </div>
  );
}