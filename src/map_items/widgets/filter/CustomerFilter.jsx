import React, { useState } from "react";
import {
  CalciteLabel,
  CalciteSelect,
  CalciteOption,
  CalciteInput,
  CalciteButton,
  CalciteNotice,
  CalciteIcon
} from "@esri/calcite-components-react";
import { useArcGIS } from "../../../context/MapContext";
import { customerColumns } from "../../../constants/columns"; // Adjust path if necessary

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

// --- Helper function to convert input values to milliseconds ---
const convertToMs = (val, unit) => {
  if (!val || isNaN(val)) return 0;
  const num = parseFloat(val);
  switch(unit) {
    case 'years': return num * 365 * 24 * 60 * 60 * 1000;
    case 'months': return num * 30 * 24 * 60 * 60 * 1000; 
    case 'days': return num * 24 * 60 * 60 * 1000;
    case 'hours':
    default: return num * 60 * 60 * 1000;
  }
};

// --- Helper function to translate decimal duration to readable text ---
const formatDurationHint = (value, unit) => {
  const num = parseFloat(value);
  if (isNaN(num) || num <= 0) return "";
  
  let totalMs = convertToMs(num, unit);
  
  const y = Math.floor(totalMs / (365 * 24 * 3600 * 1000));
  totalMs %= (365 * 24 * 3600 * 1000);
  
  const mo = Math.floor(totalMs / (30 * 24 * 3600 * 1000));
  totalMs %= (30 * 24 * 3600 * 1000);
  
  const d = Math.floor(totalMs / (24 * 3600 * 1000));
  totalMs %= (24 * 3600 * 1000);
  
  const h = Math.floor(totalMs / (3600 * 1000));
  totalMs %= (3600 * 1000);
  
  const m = Math.floor(totalMs / (60 * 1000));
  
  const parts = [];
  if (y > 0) parts.push(`${y} yr${y > 1 ? 's' : ''}`);
  if (mo > 0) parts.push(`${mo} mo${mo > 1 ? 's' : ''}`);
  if (d > 0) parts.push(`${d} day${d > 1 ? 's' : ''}`);
  if (h > 0) parts.push(`${h} hr${h > 1 ? 's' : ''}`);
  if (m > 0) parts.push(`${m} min${m > 1 ? 's' : ''}`);
  
  return parts.length > 0 ? parts.join(" ") : "< 1 min";
};

// --- Clean text input to allow only numbers and a single decimal ---
const handleNumericInput = (e, setter) => {
  let val = e.target.value;
  val = val.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
  setter(val);
};

export default function CustomerFilter() {
  // Integrate Table Context Methods
  const { view, addTableData, removeTableData, tableData, setTableVisibility } = useArcGIS();
  
  // Filter States
  const [status, setStatus] = useState("ALL");
  const [serviceTier, setServiceTier] = useState("ALL");
  
  // Time States
  const [minDownVal, setMinDownVal] = useState("");
  const [minDownUnit, setMinDownUnit] = useState("hours");
  const [maxDownVal, setMaxDownVal] = useState(""); 
  const [maxDownUnit, setMaxDownUnit] = useState("hours");
  
  // App States
  const [isFiltered, setIsFiltered] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [currentExpression, setCurrentExpression] = useState("1=1");

  // Validation Logic
  const minMs = minDownVal ? convertToMs(minDownVal, minDownUnit) : 0;
  const maxMs = maxDownVal ? convertToMs(maxDownVal, maxDownUnit) : Infinity;
  const isInvalidRange = (minDownVal && maxDownVal) && (minMs > maxMs);
  const isTimeMissing = status !== "UP" && !minDownVal && !maxDownVal;
  const isActionDisabled = isTimeMissing || isInvalidRange;

 
  const currentParams = JSON.stringify({ status, serviceTier, minDownVal, minDownUnit, maxDownVal, maxDownUnit });
  const isCached = tableData?.filtered_customers?.filterParams === currentParams;

  const applyFilter = async () => {
    // If the data is already fetched and matches parameters, just reopen the table
    if (isCached) {
      setTableVisibility("filtered_customers", true);
      return;
    }

    if (!view || !view.map || isInvalidRange) return;

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

      // 3. Unified Query for both Map and Table
      const query = customerLayer.createQuery();
      query.where = baseExpression;
      query.outFields = ["*"]; // Fetch all fields for the table
      query.returnGeometry = true; // Fetch geometry for row-click zooming
      
      const featureSet = await customerLayer.queryFeatures(query);
      let finalFeatures = featureSet.features;

      // 4. Time Filter Logic (Performed Locally)
      if (minDownVal || maxDownVal) {
        const now = new Date();
        
        finalFeatures = finalFeatures.filter((feat) => {
          const faultTimeStr = feat.attributes.fault_time;
          if (!faultTimeStr) return false;
          
          const faultTime = new Date(faultTimeStr);
          if (isNaN(faultTime.getTime())) return false;
          
          const diffMs = now - faultTime;
          return diffMs >= minMs && diffMs <= maxMs;
        });

        if (finalFeatures.length === 0) {
          customerLayer.definitionExpression = "1=0";
          setCurrentExpression("1=0");
        } else {
          const matchingIds = finalFeatures.map(f => f.attributes.id);
          const idFilter = `"id" IN ('${matchingIds.join("','")}')`;
          customerLayer.definitionExpression = idFilter;
          setCurrentExpression(idFilter);
        }
      } else {
        customerLayer.definitionExpression = baseExpression;
        setCurrentExpression(baseExpression);
      }

      // 5. Push filtered data to the Table Context
      if (addTableData) {
        addTableData("filtered_customers", "Filtered Customers", finalFeatures, customerColumns, currentParams);
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
    setMinDownVal("");
    setMinDownUnit("hours");
    setMaxDownVal(""); 
    setMaxDownUnit("hours");
    setCurrentExpression("1=1");
    
    if (view && view.map) {
      const customerLayer = view.map.layers.find((layer) => layer.title === "Customers_test");
      if (customerLayer) {
        customerLayer.definitionExpression = "1=1"; 
      }
    }

    // Remove the table tab on clear
    if (removeTableData) {
      removeTableData("filtered_customers");
    }
    
    setIsFiltered(false);
  };

  const downloadFilteredData = async () => {
    if (!view || !view.map || isInvalidRange) return;
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      
      {/* Professional Note */}
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.5rem",
        backgroundColor: "var(--calcite-ui-foreground-2)",
        padding: "0.75rem",
        borderRadius: "4px",
        border: "1px solid var(--calcite-ui-border-2)",
      }}>
        <CalciteIcon icon="information" scale="s" style={{ color: "var(--calcite-ui-info)", flexShrink: 0, marginTop: "2px" }} />
        <span style={{ fontSize: "0.75rem", color: "var(--calcite-ui-text-2)", lineHeight: "1.3" }}>
          <strong>Note:</strong> Please ensure all 4 fault types are enabled in the top dropdown menu (adjacent to the search bar) for accurate filtering.
        </span>
      </div>

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

      {/* Down Time Filter Rows - Stacked Layout */}
      <div style={{ display: "flex", gap: "1rem" }}>
        
        {/* Min Input Column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          
          <CalciteLabel style={{ marginBottom: 0 }}>
            Min Fault Value
            <CalciteInput
              placeholder="e.g. 1.5"
              value={minDownVal}
              status={isInvalidRange ? "invalid" : "idle"}
              onCalciteInputInput={(e) => handleNumericInput(e, setMinDownVal)}
              clearable
            />
          </CalciteLabel>

          <CalciteLabel style={{ marginBottom: 0 }}>
            Min Time
            <CalciteSelect 
              value={minDownUnit} 
              onCalciteSelectChange={(e) => setMinDownUnit(e.target.value)}
            >
              <CalciteOption label="Hours" value="hours" />
              <CalciteOption label="Days" value="days" />
              <CalciteOption label="Months" value="months" />
              <CalciteOption label="Years" value="years" />
            </CalciteSelect>
          </CalciteLabel>

          {/* Dynamic Helper Text */}
          <span style={{ fontSize: "0.75rem", color: "var(--calcite-ui-text-1)", fontWeight: "500", minHeight: "1rem", paddingLeft: "2px" }}>
            {formatDurationHint(minDownVal, minDownUnit)}
          </span>
          
        </div>

        {/* Max Input Column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          
          <CalciteLabel style={{ marginBottom: 0 }}>
            Max Fault Value
            <CalciteInput
              placeholder="e.g. 24"
              value={maxDownVal}
              status={isInvalidRange ? "invalid" : "idle"}
              onCalciteInputInput={(e) => handleNumericInput(e, setMaxDownVal)}
              clearable
            />
          </CalciteLabel>

          <CalciteLabel style={{ marginBottom: 0 }}>
            Max Time
            <CalciteSelect 
              value={maxDownUnit} 
              onCalciteSelectChange={(e) => setMaxDownUnit(e.target.value)}
            >
              <CalciteOption label="Hours" value="hours" />
              <CalciteOption label="Days" value="days" />
              <CalciteOption label="Months" value="months" />
              <CalciteOption label="Years" value="years" />
            </CalciteSelect>
          </CalciteLabel>

          {/* Dynamic Helper Text */}
          <span style={{ fontSize: "0.75rem", color: "var(--calcite-ui-text-1)", fontWeight: "500", minHeight: "1rem", paddingLeft: "2px" }}>
            {formatDurationHint(maxDownVal, maxDownUnit)}
          </span>

        </div>
      </div>
      
      {/* Validation Error Message */}
      {isInvalidRange && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          color: "var(--calcite-ui-danger)",
          marginTop: "-0.5rem"
        }}>
          <CalciteIcon icon="exclamation-mark-triangle" scale="s" />
          <span style={{ fontSize: "0.75rem", fontWeight: "500" }}>
            Invalid range: Min fault time cannot exceed Max fault time.
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
        <CalciteButton
          appearance="solid"
          width="half"
          onClick={applyFilter}
          loading={isApplying}
          disabled={isActionDisabled}
        >
          {isCached ? "View Table" : "Filter & View Table"}
        </CalciteButton>
        <CalciteButton
          appearance="outline"
          width="half"
          kind="danger"
          onClick={clearFilter}
          disabled={!isFiltered && !tableData?.filtered_customers}
        >
          Clear
        </CalciteButton>
      </div>

      {/* Download Button */}
      {/* <CalciteButton
        appearance="solid"
        iconStart="download"
        kind="neutral"
        width="full"
        onClick={downloadFilteredData}
        loading={isDownloading}
        disabled={!isFiltered || isActionDisabled}
      >
        Download CSV Direct
      </CalciteButton> */}

      {isFiltered && !isInvalidRange && (
        <CalciteNotice kind="success" icon="check" open style={{marginTop: '0.5rem'}}>
          <div slot="message">Filters applied successfully.</div>
        </CalciteNotice>
      )}
    </div>
  );
}