import React, { useState } from "react";
import {
  CalciteLabel,
  CalciteSelect,
  CalciteOption,
  CalciteInputNumber,
  CalciteButton,
  CalciteNotice
} from "@esri/calcite-components-react";
import { useArcGIS } from "../../../context/MapContext";

// --- Helper function to calculate time difference for CSV ---
const calculateDuration = (faultTimeStr) => {
  if (!faultTimeStr) return "-";
  const faultTime = new Date(faultTimeStr);
  if (isNaN(faultTime.getTime())) return "-"; 

  const diffMs = new Date() - faultTime;
  if (diffMs <= 0) return "0s";

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diffMs / 1000 / 60) % 60);
  const seconds = Math.floor((diffMs / 1000) % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
};

// --- Helper function to translate decimal hours to readable text ---
const formatDurationHint = (hoursInput) => {
  if (!hoursInput) return "";
  const num = parseFloat(hoursInput);
  if (isNaN(num) || num <= 0) return "";

  const hrs = Math.floor(num);
  const mins = Math.round((num - hrs) * 60);

  const parts = [];
  if (hrs > 0) parts.push(`${hrs} hr${hrs > 1 ? "s" : ""}`);
  if (mins > 0) parts.push(`${mins} min${mins > 1 ? "s" : ""}`);

  return parts.length > 0 ? parts.join(" ") : "";
};

export default function CustomerFilter() {
  const { view } = useArcGIS();
  
  // Filter States
  const [status, setStatus] = useState("ALL");
  const [serviceTier, setServiceTier] = useState("ALL");
  const [minDownHours, setMinDownHours] = useState("");
  const [maxDownHours, setMaxDownHours] = useState(""); 
  
  // App States
  const [isFiltered, setIsFiltered] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [currentExpression, setCurrentExpression] = useState("1=1");

  const applyFilter = async () => {
    if (!view || !view.map) return;

    const customerLayer = view.map.layers.find(
      (layer) => layer.title === "Customers_test"
    );

    if (!customerLayer) {
      console.warn("Customer layer not found on the map.");
      return;
    }

    setIsApplying(true);

    try {
      const whereClauses = [];

      // 1. Status Filter
      if (status === "UP") {
        whereClauses.push("(alarmstate IN (3, 4))");
      } else if (status === "DOWN") {
        whereClauses.push("(alarmstate NOT IN (3, 4) OR alarmstate IS NULL)");
      }

      // 2. Service Tier Filter
      if (serviceTier !== "ALL") {
        whereClauses.push(`service_tier = '${serviceTier}'`);
      }

      const baseExpression = whereClauses.length > 0 ? whereClauses.join(" AND ") : "1=1";

      // 3. Time Filter
      if (minDownHours || maxDownHours) {
        const query = customerLayer.createQuery();
        query.where = baseExpression;
        query.outFields = ["id", "fault_time"];
        
        const featureSet = await customerLayer.queryFeatures(query);
        
        const minMs = minDownHours ? Number(minDownHours) * 3600000 : 0;
        const maxMs = maxDownHours ? Number(maxDownHours) * 3600000 : Infinity;
        const now = new Date();
        const matchingIds = [];

        featureSet.features.forEach((feat) => {
          const faultTimeStr = feat.attributes.fault_time;
          if (faultTimeStr) {
            const faultTime = new Date(faultTimeStr);
            if (!isNaN(faultTime.getTime())) {
              const diffMs = now - faultTime;
              if (diffMs >= minMs && diffMs <= maxMs) {
                matchingIds.push(feat.attributes.id);
              }
            }
          }
        });

        if (matchingIds.length === 0) {
          customerLayer.definitionExpression = "1=0";
          setCurrentExpression("1=0");
        } else {
          const idFilter = `"id" IN ('${matchingIds.join("','")}')`;
          customerLayer.definitionExpression = idFilter;
          setCurrentExpression(idFilter);
        }

      } else {
        customerLayer.definitionExpression = baseExpression;
        setCurrentExpression(baseExpression);
      }

      setIsFiltered(true);

    } catch (error) {
      console.error("Filter error:", error);
      alert("An error occurred while filtering. Check console.");
    } finally {
      setIsApplying(false);
    }
  };

  const clearFilter = () => {
    setStatus("ALL");
    setServiceTier("ALL");
    setMinDownHours("");
    setMaxDownHours(""); 
    setCurrentExpression("1=1");
    
    if (view && view.map) {
      const customerLayer = view.map.layers.find((layer) => layer.title === "Customers_test");
      if (customerLayer) {
        customerLayer.definitionExpression = "1=1"; 
      }
    }
    setIsFiltered(false);
  };

  const downloadFilteredData = async () => {
    if (!view || !view.map) return;
    const customerLayer = view.map.layers.find((layer) => layer.title === "Customers_test");
    if (!customerLayer) return;

    setIsDownloading(true);

    try {
      const query = customerLayer.createQuery();
      query.where = currentExpression; 
      query.outFields = ["*"];
      
      const featureSet = await customerLayer.queryFeatures(query);
      const features = featureSet.features;

      if (features.length === 0) {
        alert("No data matches the current filter.");
        setIsDownloading(false);
        return;
      }

      const headers = [
        "ID", "Name", "Type", "Area", "Sub Area", "Status", "OLT", 
        "FSP (Frame/Slot/Port)", "ONT#", "DC/ODB", "Alarm Info", 
        "Fault Time", "Fault Duration", "Service Tier", "Bandwidth", "Activation Date"
      ];

      const csvRows = [headers.join(",")];

      features.forEach((feat) => {
        const attr = feat.attributes;
        const isUp = attr.alarmstate === 1 || attr.alarmstate === 3 || attr.alarmstate === 4;
        const statusStr = isUp ? "UP" : "DOWN";
        const fsp = `${attr.frame ?? ""}/${attr.slot ?? ""}/${attr.port ?? ""}`;
        const duration = calculateDuration(attr.fault_time);

        const rowData = [
          attr.id, attr.name, attr.type, attr.area_town, attr.sub_area, statusStr,
          attr.olt, fsp, attr.ontid, attr.dc_id, attr.alarminfo, 
          attr.fault_time, duration, attr.service_tier, attr.bandwidth, attr.activation_date
        ].map((val) => `"${(val ?? "").toString().replace(/"/g, '""')}"`);

        csvRows.push(rowData.join(","));
      });

      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const mo = String(now.getMonth() + 1).padStart(2, '0'); 
      const yyyy = now.getFullYear();
      const timeStr = `${hh}${mm}${dd}${mo}${yyyy}`;

      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `filtered_customers_${timeStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to export data. Check console for details.");
    } finally {
      setIsDownloading(false);
    }
  };

  const isTimeMissing = status !== "UP" && !minDownHours && !maxDownHours;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      
      {/* Status Filter */}
      <CalciteLabel>
        Faults Filter
        <CalciteSelect
          value={status}
          onCalciteSelectChange={(e) => setStatus(e.target.value)}
        >
          <CalciteOption label="All Customers" value="ALL" />
          <CalciteOption label="ONT Status UP (Online)" value="UP" />
          <CalciteOption label="ONT Status DOWN (Offline)" value="DOWN" />
        </CalciteSelect>
      </CalciteLabel>

      {/* Down Time Filter Row */}
      <div style={{ display: "flex", gap: "1rem" }}>
        
        {/* Min Input Wrapper */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Main Label and Input */}
          <CalciteLabel style={{ marginBottom: "2px" }}>
            Min Fault Time (Hours)
            <CalciteInputNumber
              placeholder="e.g. 0.5"
              value={minDownHours}
              onCalciteInputNumberChange={(e) => setMinDownHours(e.target.value)}
              min={0}
              step={0.05}
              //disabled={status === "UP"}
            />
          </CalciteLabel>
          {/* Dynamic Helper Text placed completely outside the text box */}
          <span style={{ fontSize: "0.75rem", color: "var(--calcite-ui-text-2)", fontWeight: "500", minHeight: "1rem", paddingLeft: "2px" }}>
            {formatDurationHint(minDownHours)}
          </span>
        </div>

        {/* Max Input Wrapper */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Main Label and Input */}
          <CalciteLabel style={{ marginBottom: "2px" }}>
            Max Fault Time (Hours)
            <CalciteInputNumber
              placeholder="e.g. 24"
              value={maxDownHours}
              onCalciteInputNumberChange={(e) => setMaxDownHours(e.target.value)}
              min={0}
              step={0.05}
              //disabled={status === "UP"}
            />
          </CalciteLabel>
          {/* Dynamic Helper Text placed completely outside the text box */}
          <span style={{ fontSize: "0.75rem", color: "var(--calcite-ui-text-2)", fontWeight: "500", minHeight: "1rem", paddingLeft: "2px" }}>
            {formatDurationHint(maxDownHours)}
          </span>
        </div>

      </div>
      
     {/*  {status === "UP" && (
        <span style={{fontSize: '0.8rem', color: 'gray', marginTop: '-10px'}}>
          Change status to DOWN to filter by duration.
        </span>
      )} */}

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <CalciteButton
          appearance="solid"
          width="half"
          onClick={applyFilter}
          loading={isApplying}
          disabled={isTimeMissing}
        >
          View on Map
        </CalciteButton>
        <CalciteButton
          appearance="outline"
          width="half"
          kind="danger"
          onClick={clearFilter}
          disabled={!isFiltered}
        >
          Clear
        </CalciteButton>
      </div>

      {/* Download Button */}
      <CalciteButton
        appearance="solid"
        iconStart="download"
        kind="neutral"
        width="full"
        onClick={downloadFilteredData}
        loading={isDownloading}
        disabled={!isFiltered || isTimeMissing}
      >
        Download Filtered Data
      </CalciteButton>

      {isFiltered && (
        <CalciteNotice kind="success" icon="check" open style={{marginTop: '0.5rem'}}>
          <div slot="message">Filters applied successfully.</div>
        </CalciteNotice>
      )}
    </div>
  );
}