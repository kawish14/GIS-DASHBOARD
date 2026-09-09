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
import { useArcGIS } from "../../map/state/MapProvider";
import { usePublishFilter } from "../ActiveFiltersContext";
import { customerColumns } from "../../../shared/constants/tableColumns";

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

const convertToMs = (val, unit) => {
  if (!val || isNaN(val)) return 0;
  const num = parseFloat(val);
  switch(unit) {
    case 'years': return num * 365 * 24 * 60 * 60 * 1000;
    case 'months': return num * 30 * 24 * 60 * 60 * 1000; 
    case 'days': return num * 24 * 60 * 60 * 1000;
    case 'hours': default: return num * 60 * 60 * 1000;
  }
};

const formatDurationHint = (value, unit) => {
  const num = parseFloat(value);
  if (isNaN(num) || num <= 0) return "";
  let totalMs = convertToMs(num, unit);
  const y = Math.floor(totalMs / (365 * 24 * 3600 * 1000)); totalMs %= (365 * 24 * 3600 * 1000);
  const mo = Math.floor(totalMs / (30 * 24 * 3600 * 1000)); totalMs %= (30 * 24 * 3600 * 1000);
  const d = Math.floor(totalMs / (24 * 3600 * 1000)); totalMs %= (24 * 3600 * 1000);
  const h = Math.floor(totalMs / (3600 * 1000)); totalMs %= (3600 * 1000);
  const m = Math.floor(totalMs / (60 * 1000));
  const parts = [];
  if (y > 0) parts.push(`${y} yr${y > 1 ? 's' : ''}`);
  if (mo > 0) parts.push(`${mo} mo${mo > 1 ? 's' : ''}`);
  if (d > 0) parts.push(`${d} day${d > 1 ? 's' : ''}`);
  if (h > 0) parts.push(`${h} hr${h > 1 ? 's' : ''}`);
  if (m > 0) parts.push(`${m} min${m > 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(" ") : "< 1 min";
};

const describeFilter = ({ status, serviceTier, minDownVal, minDownUnit, maxDownVal, maxDownUnit }) => {
  const parts = [];
  if (status !== "ALL") parts.push(status);
  if (serviceTier !== "ALL") parts.push(serviceTier);
  if (minDownVal) parts.push(`from ${minDownVal} ${minDownUnit}`);
  if (maxDownVal) parts.push(`to ${maxDownVal} ${maxDownUnit}`);
  return parts.length > 0 ? parts : ["All customers"];
};

const handleNumericInput = (e, setter) => {
  let val = e.target.value;
  val = val.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
  setter(val);
};

export default function CustomerFaultFilter() {
  const { view, addTableData, removeTableData, tableData, setTableVisibility } = useArcGIS();
  const [status, setStatus] = useState("ALL");
  const [serviceTier, setServiceTier] = useState("ALL");
  const [minDownVal, setMinDownVal] = useState("");
  const [minDownUnit, setMinDownUnit] = useState("hours");
  const [maxDownVal, setMaxDownVal] = useState(""); 
  const [maxDownUnit, setMaxDownUnit] = useState("hours");
  const [isFiltered, setIsFiltered] = useState(false);
  const [appliedSummary, setAppliedSummary] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const [currentExpression, setCurrentExpression] = useState("1=1");

  const minMs = minDownVal ? convertToMs(minDownVal, minDownUnit) : 0;
  const maxMs = maxDownVal ? convertToMs(maxDownVal, maxDownUnit) : Infinity;
  const isInvalidRange = (minDownVal && maxDownVal) && (minMs > maxMs);
  const isTimeMissing = status !== "UP" && !minDownVal && !maxDownVal;
  const isActionDisabled = isTimeMissing || isInvalidRange;
  
  const currentParams = JSON.stringify({ status, serviceTier, minDownVal, minDownUnit, maxDownVal, maxDownUnit });
  const isCached = tableData?.filtered_customers?.filterParams === currentParams;

  const applyFilter = async () => {
    if (isCached) { setTableVisibility("filtered_customers", true); return; }
    if (!view || !view.map || isInvalidRange) return;
    const customerLayer = view.map.layers.find((layer) => layer.title === "Customers_test");
    if (!customerLayer) return;
    setIsApplying(true);

    try {
      const whereClauses = [];
      if (status === "UP") whereClauses.push("(alarmstate IN (3, 4))");
      else if (status === "DOWN") whereClauses.push("(alarmstate NOT IN (3, 4) OR alarmstate IS NULL)");
      if (serviceTier !== "ALL") whereClauses.push(`service_tier = '${serviceTier}'`);

      const baseExpression = whereClauses.length > 0 ? whereClauses.join(" AND ") : "1=1";
      const query = customerLayer.createQuery();
      query.where = baseExpression;
      query.outFields = ["*"]; 
      query.returnGeometry = true; 
      
      const featureSet = await customerLayer.queryFeatures(query);
      let finalFeatures = featureSet.features;

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
      if (addTableData) {
        addTableData("filtered_customers", "Filtered Customers", finalFeatures, customerColumns, currentParams);
      }
      setIsFiltered(true);
      setAppliedSummary(describeFilter({ status, serviceTier, minDownVal, minDownUnit, maxDownVal, maxDownUnit }));
    } catch (error) {
      console.error("Filter error:", error);
    } finally { setIsApplying(false); }
  };

  const clearFilter = () => {
    setStatus("ALL"); setServiceTier("ALL"); setMinDownVal(""); setMinDownUnit("hours"); setMaxDownVal(""); setMaxDownUnit("hours"); setCurrentExpression("1=1");
    if (view && view.map) {
      const customerLayer = view.map.layers.find((layer) => layer.title === "Customers_test");
      if (customerLayer) customerLayer.definitionExpression = "1=1"; 
    }
    if (removeTableData) removeTableData("filtered_customers");
    setIsFiltered(false); setAppliedSummary(null);
  };

  usePublishFilter({ id: "customer_faults", label: "Customer Faults", summary: appliedSummary, onClear: clearFilter });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", backgroundColor: "var(--calcite-ui-foreground-2)", padding: "0.75rem", borderRadius: "4px", border: "1px solid var(--calcite-ui-border-2)" }}>
        <CalciteIcon icon="information" scale="m" style={{ color: "var(--calcite-ui-info)", flexShrink: 0, marginTop: "2px" }} />
        <span style={{ fontSize: "0.75rem", color: "var(--calcite-ui-text-2)", lineHeight: "1.3" }}>
          <strong>Note:</strong> Please ensure all 4 fault types are enabled in the top dropdown menu for accurate filtering.
        </span>
      </div>

      <CalciteLabel scale="m">
        Faults Filter
        <CalciteSelect scale="m" value={status} onCalciteSelectChange={(e) => setStatus(e.target.value)}>
          <CalciteOption label="All Customers" value="ALL" />
          <CalciteOption label="ONT Status UP (Online)" value="UP" />
          <CalciteOption label="ONT Status DOWN (Offline)" value="DOWN" />
        </CalciteSelect>
      </CalciteLabel>

      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <CalciteLabel scale="m" style={{ marginBottom: 0 }}>
            Min Fault Value
            <CalciteInput scale="m" placeholder="e.g. 1.5" value={minDownVal} status={isInvalidRange ? "invalid" : "idle"} onCalciteInputInput={(e) => handleNumericInput(e, setMinDownVal)} clearable />
          </CalciteLabel>
          <CalciteLabel scale="m" style={{ marginBottom: 0 }}>
            Min Time
            <CalciteSelect scale="m" value={minDownUnit} onCalciteSelectChange={(e) => setMinDownUnit(e.target.value)}>
              <CalciteOption label="Hours" value="hours" />
              <CalciteOption label="Days" value="days" />
              <CalciteOption label="Months" value="months" />
              <CalciteOption label="Years" value="years" />
            </CalciteSelect>
          </CalciteLabel>
          <span style={{ fontSize: "0.75rem", color: "var(--calcite-ui-text-1)", fontWeight: "500", minHeight: "1rem", paddingLeft: "2px" }}>
            {formatDurationHint(minDownVal, minDownUnit)}
          </span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <CalciteLabel scale="m" style={{ marginBottom: 0 }}>
            Max Fault Value
            <CalciteInput scale="m" placeholder="e.g. 24" value={maxDownVal} status={isInvalidRange ? "invalid" : "idle"} onCalciteInputInput={(e) => handleNumericInput(e, setMaxDownVal)} clearable />
          </CalciteLabel>
          <CalciteLabel scale="m" style={{ marginBottom: 0 }}>
            Max Time
            <CalciteSelect scale="m" value={maxDownUnit} onCalciteSelectChange={(e) => setMaxDownUnit(e.target.value)}>
              <CalciteOption label="Hours" value="hours" />
              <CalciteOption label="Days" value="days" />
              <CalciteOption label="Months" value="months" />
              <CalciteOption label="Years" value="years" />
            </CalciteSelect>
          </CalciteLabel>
          <span style={{ fontSize: "0.75rem", color: "var(--calcite-ui-text-1)", fontWeight: "500", minHeight: "1rem", paddingLeft: "2px" }}>
            {formatDurationHint(maxDownVal, maxDownUnit)}
          </span>
        </div>
      </div>
      
      {isInvalidRange && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--calcite-ui-danger)", marginTop: "-0.5rem" }}>
          <CalciteIcon icon="exclamation-mark-triangle" scale="m" />
          <span style={{ fontSize: "0.75rem", fontWeight: "500" }}>Invalid range: Min fault time cannot exceed Max.</span>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
        <CalciteButton scale="m" appearance="solid" width="half" onClick={applyFilter} loading={isApplying} disabled={isActionDisabled}>
          {isCached ? "View Table" : "Filter & View Table"}
        </CalciteButton>
        <CalciteButton scale="m" appearance="outline" width="half" kind="danger" onClick={clearFilter} disabled={!isFiltered && !tableData?.filtered_customers}>
          Clear
        </CalciteButton>
      </div>

      {isFiltered && !isInvalidRange && (
        <CalciteNotice scale="m" kind="success" icon="check" open style={{marginTop: '0.5rem'}}>
          <div slot="message">Filters applied successfully.</div>
        </CalciteNotice>
      )}
    </div>
  );
}