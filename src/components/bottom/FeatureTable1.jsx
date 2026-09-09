import React, { useState, useEffect, useMemo } from "react";
import { useArcGIS } from "../../context/MapContext";
import { CalciteButton, CalciteIcon } from "@esri/calcite-components-react";
import { api } from "../../../url";

// --- Helper: elapsed time since a fault started ---
const calculateDuration = (faultTimeStr) => {
  if (!faultTimeStr) return "-";

  const faultTime = new Date(faultTimeStr);
  if (isNaN(faultTime.getTime())) return "-";

  const diffMs = Date.now() - faultTime;
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

const humanizeLabel = (key) =>
  key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// Column registry
//
// This is the ONLY place that knows about specific field names. Everything
// downstream (headers, rows, CSV export, refresh) reads from the `columns`
// list built below, not from these keys directly -- so a brand-new layer
// with fields we've never seen just falls through to an auto-generated
// plain-text column instead of being silently dropped.
// ---------------------------------------------------------------------------
const KNOWN_COLUMNS = {
  id: { label: "ID" },
  name: { label: "Name", className: "text-gray-200" },
  type: { label: "Type", className: "text-gray-300" },
  area_town: { label: "Area" },
  sub_area: { label: "Sub Area" },
  status: { label: "Status" },
  olt: { label: "OLT", showTitle: true },
  fsp: { label: "FSP", className: "font-mono" }, // virtual: frame/slot/port
  ontid: { label: "ONT#" },
  dc_id: { label: "DC/ODB" },
  alarminfo: { label: "Alarm Info", showTitle: true },
  fault_time: { label: "Fault Time", className: "text-blue-300", headerClassName: "text-blue-400" },
  fault_duration: { label: "Fault Duration", className: "text-red-400", headerClassName: "text-red-400" }, // virtual: derived from fault_time
  service_tier: { label: "Service Tier" },
  bandwidth: { label: "Bandwidth" },
  activation_date: { label: "Activation Date" },
};

// Display order for fields we recognize. Anything else discovered in the
// data gets appended after these, alphabetically.
const PREFERRED_ORDER = [
  "id", "name", "type", "area_town", "sub_area", "status", "olt", "fsp",
  "ontid", "dc_id", "alarminfo", "fault_time", "fault_duration",
  "service_tier", "bandwidth", "activation_date",
];

// Real attribute keys consumed by a virtual column (so they don't also get
// their own auto-generated column).
const VIRTUAL_SOURCE_KEYS = {
  fsp: ["frame", "slot", "port"],
  fault_duration: ["fault_time"], // derived, not a literal field on the layer
};

/** Plain-text value for a column -- used for CSV export and generic cells. */
function getCellText(column, attr) {
  switch (column.key) {
    case "status": {
      if (attr.status !== "Active") return "--";
      if ([0, 3, 4].includes(attr.alarmstate)) return "UP";
      if ([1, 2].includes(attr.alarmstate)) return "DOWN";
      return "--";
    }
    case "fsp":
      return `${attr.frame ?? ""}/${attr.slot ?? ""}/${attr.port ?? ""}`;
    case "fault_duration":
      return attr.fault_duration ?? calculateDuration(attr.fault_time);
    default:
      return attr[column.key] ?? "";
  }
}

export default function FeatureTable({ features }) {
  const { view, selectedFeatures, setSelectedFeatures, highlightHandleRef } = useArcGIS();

  const [localFeatures, setLocalFeatures] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  useEffect(() => {
    setCurrentPage(1);
  }, [localFeatures]);

  useEffect(() => {
    if (features && features.length > 0) setLocalFeatures(features);
  }, [features]);

  // All real attribute keys present across the current selection, regardless
  // of which layer(s) they came from.
  const realFieldKeys = useMemo(() => {
    const keys = new Set();
    localFeatures.forEach((f) => Object.keys(f.attributes || {}).forEach((k) => keys.add(k)));
    return keys;
  }, [localFeatures]);

  // Final column list: known fields in their preferred order, followed by
  // any unrecognized fields the selected layer(s) happen to carry.
  const columns = useMemo(() => {
    const cols = [];
    const placed = new Set(["alarmstate"]); // folded into the "status" column, never shown alone

    PREFERRED_ORDER.forEach((key) => {
      const sourceKeys = VIRTUAL_SOURCE_KEYS[key];
      const present = sourceKeys ? sourceKeys.some((k) => realFieldKeys.has(k)) : realFieldKeys.has(key);
      if (!present) return;
      cols.push({ key, ...KNOWN_COLUMNS[key] });
      placed.add(key);
      if (sourceKeys) sourceKeys.forEach((k) => placed.add(k));
    });

    Array.from(realFieldKeys)
      .filter((k) => !placed.has(k))
      .sort()
      .forEach((key) => cols.push({ key, label: humanizeLabel(key) }));

    return cols;
  }, [realFieldKeys]);

  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = localFeatures.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(localFeatures.length / rowsPerPage);

  if (!localFeatures || localFeatures.length === 0) return null;

  // --- WFS Refresh: re-fetch the latest attributes for the selected rows ---
  const handleRefresh = async () => {
    if (localFeatures.length === 0) return;
    setIsRefreshing(true);

    try {
      // Group by originating layer so a mixed selection (once selection
      // supports more than Customers) refreshes each group against the
      // right GeoServer typeName instead of assuming everything is a
      // customer. `sourceLayer` is set by ArcGIS on features returned from
      // layer.queryFeatures(); manually-built graphics (e.g. "All
      // Customers" API-mode results) won't have it and are skipped.
      const groups = new Map();
      localFeatures.forEach((feat) => {
        const sourceLayer = feat.sourceLayer;
        const groupKey = sourceLayer?.id || sourceLayer?.title || "unknown";
        if (!groups.has(groupKey)) groups.set(groupKey, { sourceLayer, ids: [] });
        groups.get(groupKey).ids.push(feat.attributes.id);
      });

      const propertyName = Array.from(realFieldKeys).join(",");
      const refreshedMap = {};

      await Promise.all(
        Array.from(groups.values()).map(async ({ sourceLayer, ids }) => {
          if (!sourceLayer || ids.length === 0) return;

          const workspaceMatch = sourceLayer.url?.match(/\/geoserver\/([^/]+)\/ows/);
          const workspace = workspaceMatch ? workspaceMatch[1] : "web_app";
          const typeName = `${workspace}:${sourceLayer.title}`;

          const params = new URLSearchParams({
            service: "WFS",
            version: "1.0.0",
            request: "GetFeature",
            typeName,
            outputFormat: "application/json",
            propertyName,
            CQL_FILTER: `"id" IN ('${ids.join("','")}')`,
          });

          const response = await fetch(`${api}/geoserver/${workspace}/ows`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
          });
          const data = await response.json();
          (data.features || []).forEach((f) => {
            refreshedMap[f.properties.id] = f.properties;
          });
        })
      );

      setLocalFeatures((prev) =>
        prev.map((feat) => {
          const refreshed = refreshedMap[feat.attributes.id];
          return refreshed ? { ...feat, attributes: refreshed } : feat;
        })
      );
    } catch (error) {
      console.error("Failed to refresh table data:", error);
      alert("Could not refresh data. Check console for details.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // --- CSV Export: built from whatever columns are currently showing ---
  const downloadCSV = () => {
    const csvRows = [columns.map((c) => c.label).join(",")];

    localFeatures.forEach((feat) => {
      const attr = feat.attributes;
      const rowData = columns
        .map((col) => getCellText(col, attr))
        .map((val) => `"${(val ?? "").toString().replace(/"/g, '""')}"`);
      csvRows.push(rowData.join(","));
    });

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const mo = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `feature_export_${hh}${mm}${dd}${mo}${yyyy}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const mapLocate = async (id) => {
    setSelectedRowId(id);
    try {
      if (selectedFeatures && selectedFeatures.length > 0) {
        const targetFeature = selectedFeatures.filter((f) => f.attributes.id === id);
        view.goTo({ target: targetFeature, zoom: 22 }).catch((err) => {
          if (err.name !== "AbortError" && err.name !== "view:goto-interrupted") {
            console.error("Zoom failed:", err);
          }
        });
      }
    } catch (error) {
      console.error("Error zooming to feature:", error);
    }
  };

  const handleCloseTable = () => {
    setSelectedFeatures([]);
    if (highlightHandleRef.current) {
      highlightHandleRef.current.remove();
      highlightHandleRef.current = null;
    }
  };

  return (
    <div
      style={{
        height: "100%",
        backgroundColor: "#242424",
        borderTop: "2px solid var(--brand-color, #0079c1)",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 -8px 20px rgba(0,0,0,0.4)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
      className="text-gray-200"
    >
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 bg-[#1c1c1c] border-b border-gray-700 shadow-sm shrink-0" style={{ height: "7vh" }}>
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-gray-800 rounded-md shadow-inner">
            <CalciteIcon icon="table" scale="s" className="text-gray-300" />
          </div>
          <span className="font-semibold text-gray-100 tracking-wide text-sm">
            Selected Features
            <span className="ml-2 bg-blue-600/20 text-blue-400 py-0.5 px-2 rounded-full text-xs font-bold border border-blue-600/30">
              {localFeatures.length}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <CalciteButton appearance="transparent" icon-start="refresh" onClick={handleRefresh} title="Refresh Data" kind="neutral" loading={isRefreshing}>
            Refresh
          </CalciteButton>
          <CalciteButton appearance="transparent" icon-start="download" onClick={downloadCSV} title="Download CSV" kind="neutral" disabled={isRefreshing}>
            Export
          </CalciteButton>
          <div className="h-4 w-px bg-gray-600 mx-1"></div>
          <CalciteButton appearance="transparent" icon-start="x" onClick={handleCloseTable} title="Close Table" kind="danger" />
        </div>
      </div>

      {/* Table Content (Scrollable Area) */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
          <thead className="sticky top-0 bg-[#2b2b2b] text-gray-400 text-xs uppercase tracking-wider shadow-md z-20">
            <tr>
              <th className="sticky left-0 z-30 w-[80px] min-w-[80px] bg-[#2b2b2b] px-4 py-3 font-medium border-b border-gray-600 shadow-[1px_0_0_0_#4b5563]">
                S.No
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-medium border-b border-gray-600 ${col.headerClassName || ""} ${
                    col.key === "id"
                      ? "sticky left-[80px] z-30 w-[120px] min-w-[120px] bg-[#2b2b2b] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]"
                      : ""
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {currentRows.map((feat, idx) => {
              const attr = feat.attributes;
              const isUp = attr.status === "Active" && [0, 3, 4].includes(attr.alarmstate);
              const isDown = attr.status === "Active" && [1, 2].includes(attr.alarmstate);
              const isSelected = attr.id === selectedRowId;
              const rowBg = isSelected ? "bg-[#2d3748] text-white" : "bg-[#242424] group-odd:bg-[#2a2a2a] group-hover:bg-[#383838]";

              return (
                <tr
                  key={idx}
                  className={`transition-colors duration-150 ease-in-out cursor-pointer group ${
                    isSelected ? "bg-blue-600/20 border-l-4 border-l-blue-500" : "even:bg-[#242424] odd:bg-[#2a2a2a] hover:bg-[#383838]"
                  }`}
                  onClick={() => mapLocate(attr.id)}
                >
                  <td className={`sticky left-0 z-10 w-[80px] px-4 py-2.5 transition-colors shadow-[1px_0_0_0_rgba(75,85,99,0.3)] ${rowBg} ${isSelected ? "" : "text-gray-400"}`}>
                    {indexOfFirstRow + idx + 1}
                  </td>

                  {columns.map((col) => {
                    if (col.key === "id") {
                      return (
                        <td
                          key="id"
                          className={`sticky left-[80px] z-10 w-[120px] px-4 py-2.5 font-mono text-xs transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] ${rowBg} ${
                            isSelected ? "text-yellow-400" : "text-blue-400"
                          }`}
                        >
                          {attr.id}
                        </td>
                      );
                    }
                    if (col.key === "status") {
                      return (
                        <td key="status" className="px-4 py-2.5">
                          {attr.status === "Active" ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                                isUp ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"
                              }`}
                            >
                              {isUp ? "UP" : isDown ? "DOWN" : "--"}
                            </span>
                          ) : (
                            <span>--</span>
                          )}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={col.key}
                        className={`px-4 py-2.5 text-xs ${col.className || "text-gray-400"}`}
                        title={col.showTitle ? getCellText(col, attr) : undefined}
                      >
                        {getCellText(col, attr) || "-"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer / Pagination */}
      <div className="flex justify-between items-center px-4 py-3 bg-[#1c1c1c] border-t border-gray-700 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            Showing <span className="font-semibold text-gray-200">{indexOfFirstRow + 1}</span> to{" "}
            <span className="font-semibold text-gray-200">{Math.min(indexOfLastRow, localFeatures.length)}</span> of{" "}
            <span className="font-semibold text-gray-200">{localFeatures.length}</span>
          </span>

          <select
            className="bg-[#242424] hover:bg-[#2a2a2a] text-gray-300 text-sm rounded px-2 py-1 border border-gray-600 outline-none transition-colors cursor-pointer"
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
            <option value={250}>250 rows</option>
            <option value={500}>500 rows</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded border transition-colors ${
              currentPage === 1 ? "bg-transparent text-gray-600 border-gray-700 cursor-not-allowed" : "bg-[#242424] hover:bg-[#383838] text-gray-300 border-gray-600 cursor-pointer"
            }`}
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </button>

          <span className="text-sm font-medium text-gray-400 px-1">
            Page {currentPage} of {totalPages}
          </span>

          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded border transition-colors ${
              currentPage === totalPages || totalPages === 0
                ? "bg-transparent text-gray-600 border-gray-700 cursor-not-allowed"
                : "bg-[#242424] hover:bg-[#383838] text-gray-300 border-gray-600 cursor-pointer"
            }`}
            disabled={currentPage === totalPages || totalPages === 0}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
