import React, { useState, useEffect, useMemo , useRef} from "react";
import { useArcGIS } from "../../context/MapContext";
import { CalciteButton } from "@esri/calcite-components-react";
import { api, authenticate } from "../../../url";
import { analyticsColumns, customerColumns } from "../../constants/columns";
import Graphic from "@arcgis/core/Graphic";

// ---------------------------------------------------------------------------
// Helper: automatically generate column definitions from feature attributes
// ---------------------------------------------------------------------------
function autoGenerateColumns(features) {
  if (!features || features.length === 0) return [];
  const attr = features[0].attributes || {};
  const exclude = ["geometry", "sourceLayer", "sourceLayerId"];
  return Object.keys(attr)
    .filter((key) => !exclude.includes(key))
    .map((key) => ({
      key,
      label: key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      className: "text-gray-400",
    }));
}

// ---------------------------------------------------------------------------
// Helper: Strict ISO timestamp formatter (prevents OLT codes like KHI-TP-OLT-1-1 from matching)
// ---------------------------------------------------------------------------
function formatTableCellValue(key, val) {
  if (val === null || val === undefined) return "-";
  
  const isDateKey = /time|date|alarm_date|first_alarm|last_alarm|activation_date/i.test(key);
  const isIsoString = typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val);

  if (isDateKey || isIsoString) {
    const date = new Date(val);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    }
  }
  return String(val);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function FeatureTable() {
  const {
    view,
    highlightHandleRef,
    layers,
    tableData,           
    setTableVisibility, 
    hideAllTables,      
    addTableData,
  } = useArcGIS();

  const [activeTabId, setActiveTabId] = useState(null);
  const [localFeatures, setLocalFeatures] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const tabRefs = useRef({});

  // 1. Manage Active Tabs dynamically
  const availableTabs = Object.keys(tableData || {}).filter(key => tableData[key].isVisible);
  const prevTabsLengthRef = useRef(availableTabs.length);

  useEffect(() => {
    // New tabs are appended after existing ones (object insertion order),
    // so the newly opened tab is the LAST entry, not the first — activate
    // that one instead of snapping back to the original/main tab.
    if (availableTabs.length > prevTabsLengthRef.current) {
      setActiveTabId(availableTabs[availableTabs.length - 1]);
    } else if (availableTabs.length > 0 && !availableTabs.includes(activeTabId)) {
      setActiveTabId(availableTabs[0]); 
    } else if (availableTabs.length === 0) {
      setActiveTabId(null);
    }
    prevTabsLengthRef.current = availableTabs.length;
  }, [tableData, availableTabs, activeTabId]);

  // Keep the active tab visible when the tab bar overflows horizontally —
  // otherwise a tab correctly opened "on the right" can still be scrolled
  // out of view.
  useEffect(() => {
    tabRefs.current[activeTabId]?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [activeTabId]);

  // 2. Resolve current features & columns based on active tab
  const currentTabData = tableData?.[activeTabId];
  const features = currentTabData?.features || [];
  
  const columns = useMemo(() => {
    if (currentTabData?.columns && currentTabData.columns.length > 0) return currentTabData.columns;
    return autoGenerateColumns(features);
  }, [currentTabData, features]);

  // 3. Sync local features when active tab changes
  useEffect(() => {
    setLocalFeatures(features);
    setCurrentPage(1);
  }, [features]);

  if (availableTabs.length === 0) return null;

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = localFeatures.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(localFeatures.length / rowsPerPage);

  if (!localFeatures || localFeatures.length === 0) return null;

  // ---------------------------------------------------------------------------
  // Get cell value for CSV export
  // ---------------------------------------------------------------------------
  const getCellText = (col, attr) => {
    const val = attr[col.key];
    if (val === null || val === undefined) return "";
    return formatTableCellValue(col.key, val);
  };

  // ---------------------------------------------------------------------------
  // Smart Refresh: Handles Analytics API or WFS Layer Refresh
  // ---------------------------------------------------------------------------
 const handleRefresh = async () => {
  console.log(activeTabId)
    if (localFeatures.length === 0) return;
    setIsRefreshing(true);
    console.log("activeTabId:", activeTabId);
    try {
      // 1. Correctly map to the feature IDs
      const currentIds = localFeatures.map((feat) => feat.attributes.id);

      // 2. Correctly extract keys from feat.attributes instead of the raw feat object
      const distinctKeys = localFeatures.reduce((keys, feat) => {
        const attrs = feat.attributes || {};
        Object.keys(attrs).forEach((key) => {
          if (!keys.includes(key)) keys.push(key);
        });
        return keys;
      }, []);

      const cqlFilter = `"id" IN ('${currentIds.join("','")}')`;
      const baseUrl = `${api}/geoserver/web_app/ows`;

      const params = new URLSearchParams({
        service: "WFS",
        version: "1.0.0",
        request: "GetFeature",
        typeName: "web_app:Customers_test",
        outputFormat: "application/json",
        //propertyName: distinctKeys.join(","),
        CQL_FILTER: cqlFilter,
      });

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const data = await response.json();

      const refreshedMap = {};
      if (data.features) {
        data.features.forEach((feat) => {
          refreshedMap[feat.properties.id] = feat.properties;
        });
      }

      const updatedLocalFeatures = localFeatures.map((feat) => {
        const id = feat.attributes.id;
        if (refreshedMap[id]) {
          return { ...feat, attributes: refreshedMap[id] };
        }
        return feat;
      });

      // 3. Update local component state
      setLocalFeatures(updatedLocalFeatures);

      // 4. Sync changes back to the global context so it persists across tab switches
      if (activeTabId && currentTabData) {
        addTableData(
          activeTabId,
          currentTabData.label,
          updatedLocalFeatures,
          columns,
          currentTabData.filterParams
        );
      }

    } catch (error) {
      console.error("Failed to refresh table data:", error);
      alert("Could not refresh data. Check console for details.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // CSV Export
  // ---------------------------------------------------------------------------
  const downloadCSV = () => {
    const csvRows = [columns.map((c) => c.label).join(",")];

    localFeatures.forEach((feat) => {
      const attr = feat.attributes;
      const rowData = columns
        .map((col) => getCellText(col, attr))
        .map((val) => `"${val.toString().replace(/"/g, '""')}"`);
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

  // ---------------------------------------------------------------------------
  // Zoom to feature
  // ---------------------------------------------------------------------------

  const mapLocate = async (id) => {
    setSelectedRowId(id);
    try {
      if (!features || features.length === 0) return;
      
      const targetFeature = features.find((f) => f.attributes?.id === id);
      if (!targetFeature) return;

      const attr = targetFeature.attributes;
      
      // 1. Clear any existing highlights from previous clicks
      view.graphics.removeAll();

      // ========================================================
      // SCENARIO A: ZONE CLICK (Spatial Vulnerability)
      // ========================================================
      if (attr.zone) {
        const zoneLayer = layers?.zones;
        const customerLayer = layers?.Customers_test;

        if (zoneLayer) {
            const zoneQuery = zoneLayer.createQuery();
            zoneQuery.where = `zone = '${attr.zone.replace(/'/g, "''")}' and region = '${attr.region.replace(/'/g, "''")}'`;
            zoneQuery.returnGeometry = true;
            
            const zoneResults = await zoneLayer.queryFeatures(zoneQuery);
            
            if (zoneResults.features.length > 0) {
              // 1. Zoom to ALL features belonging to this zone so the extent covers everything
              view.goTo({ target: zoneResults.features, padding: [50, 50, 50, 50] }).catch((err) => {
                if (err.name !== "AbortError" && err.name !== "view:goto-interrupted") console.error("Zoom failed:", err);
              });

              // 2. Highlight EVERY polygon piece associated with this zone
              const zoneGraphics = zoneResults.features.map(zoneFeature => new Graphic({
                geometry: zoneFeature.geometry,
                symbol: {
                  type: "simple-fill",
                  color: [0, 255, 255, 0.1], 
                  outline: { color: [0, 255, 255, 1], width: 2 }
                }
              }));
              
              view.graphics.addMany(zoneGraphics);

              // 3. Highlight EXACT customers provided by the backend aggregation
              if (customerLayer && attr.affected_aliases && attr.affected_aliases.length > 0) {
                const safeAliases = attr.affected_aliases.map(a => `'${a.replace(/'/g, "''")}'`).join(",");
                
                // To check intersection across multi-part zone features safely, we query using the zone names or the collective geometries, 
                // but since the backend already gave us the exact alias array, matching by alias alone within this zone is secure.
                const custQuery = customerLayer.createQuery();
                custQuery.where = `alias IN (${safeAliases})`;
                custQuery.returnGeometry = true;
                
                const custResults = await customerLayer.queryFeatures(custQuery);
                
                const alarmGraphics = custResults.features.map(f => new Graphic({
                  geometry: f.geometry,
                  symbol: {
                    type: "simple-marker",
                    style: "circle",
                    color: [255, 170, 0, 0.4], 
                    size: "18px",
                    outline: { color: [255, 170, 0, 1], width: 2 }
                  }
                }));
                
                view.graphics.addMany(alarmGraphics);
              }
            }
          }
        return; 
      }

      // ========================================================
      // SCENARIO B: INDIVIDUAL CUSTOMER CLICK (Alias / Port)
      // ========================================================
      let targetGeom = null;

      if (targetFeature.geometry) {
        targetGeom = targetFeature.geometry;
      } else if (attr.alias) {
        const customerLayer = layers?.Customers_test;
        if (customerLayer) {
          const query = customerLayer.createQuery();
          query.where = `alias = '${attr.alias.replace(/'/g, "''")}'`;
          query.returnGeometry = true;
          
          const results = await customerLayer.queryFeatures(query);
          if (results.features.length > 0) targetGeom = results.features[0].geometry;
        }
      }

      if (targetGeom) {
        view.goTo({ target: targetGeom, zoom: 22 }).catch((err) => {
          if (err.name !== "AbortError" && err.name !== "view:goto-interrupted") console.error("Zoom failed:", err);
        });

        view.graphics.add(new Graphic({
          geometry: targetGeom,
          symbol: {
            type: "simple-marker",
            style: "circle",
            color: [0, 255, 255, 0.3], 
            size: "20px", 
            outline: { color: [0, 255, 255, 1], width: 2 }
          }
        }));
      }

    } catch (error) {
      console.error("Error zooming/highlighting feature:", error);
    }
  };

  // Handler to open a sub-table tab for zone customers
  const handleViewZoneCustomers = async (e, attr) => {
    e.stopPropagation(); // Prevents triggering the row zoom event
    if (!attr.affected_aliases || attr.affected_aliases.length === 0) return;

    const customerLayer = layers?.Customers_test;
    if (!customerLayer) {
      alert("Customer layer not available.");
      return;
    }

    try {
      const safeAliases = attr.affected_aliases.map(a => `'${a.replace(/'/g, "''")}'`).join(",");
      const query = customerLayer.createQuery();
      query.where = `alias IN (${safeAliases})`;
      query.returnGeometry = true;
      query.outFields = ["*"];

      const results = await customerLayer.queryFeatures(query);

      // Format features for the table structure
      const formattedFeatures = results.features.map((f, idx) => ({
        attributes: { id: f.attributes.alias || f.attributes.id || idx, ...f.attributes },
        geometry: f.geometry
      }));

      const tabId = `zone_customers_${attr.zone.replace(/\s+/g, "_")}`;
      const tabLabel = `Zone: ${attr.zone} (${formattedFeatures.length} Customers)`;

      // Open new tab using your existing multi-tab context function
      addTableData(tabId, tabLabel, formattedFeatures, customerColumns);
    } catch (err) {
      console.error("Failed to load zone customers:", err);
      alert("Could not load customer list for this zone.");
    }
  };

  const handleCloseTable = () => {
    hideAllTables();
    if (view?.graphics) view.graphics.removeAll(); // <--- Clears map graphics when closing all tables
    if (highlightHandleRef.current) {
      highlightHandleRef.current.remove();
      highlightHandleRef.current = null;
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
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
      {/* Dynamic Tab Bar */}
      <div className="flex bg-[#1c1c1c] border-b border-gray-700 overflow-x-auto min-h-[32px]">
        {availableTabs.map((tabId) => (
          <button
            key={tabId}
            ref={(el) => { tabRefs.current[tabId] = el; }}
            onClick={() => setActiveTabId(tabId)}
            className={`px-4 py-1.5 text-xs font-semibold transition-colors border-b-2 whitespace-nowrap flex items-center ${
              activeTabId === tabId 
                ? "border-blue-500 text-blue-400 bg-[#2b2b2b]" 
                : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#242424]"
            }`}
          >
            {tableData[tabId].label || "Filtered Data"}
            <span className="ml-2 bg-gray-700 px-1.5 py-0.5 rounded-full text-[10px]">
              {tableData[tabId].features.length}
            </span>
            <span 
              className="ml-3 text-gray-500 hover:text-red-400 cursor-pointer text-sm"
              onClick={(e) => { e.stopPropagation(); setTableVisibility(tabId, false); }}
            >
              ×
            </span>
          </button>
        ))}
      </div>

      {/* Header Actions */}
      <div className="flex justify-between items-center px-3 py-1 bg-[#1c1c1c] border-b border-gray-700 shadow-sm shrink-0">
        <span className="font-semibold text-gray-300 text-[13px]">
          {currentTabData?.label || "Data Viewer"}
        </span>

        <div className="flex items-center gap-2">
          {activeTabId === "selection" && (
            <CalciteButton
              appearance="transparent"
              icon-start="refresh"
              onClick={handleRefresh}
              title="Refresh Data"
              kind="neutral"
              scale="s"
              loading={isRefreshing}
            >
              Refresh
            </CalciteButton>
          )}
          <CalciteButton
            appearance="transparent"
            icon-start="download"
            onClick={downloadCSV}
            title="Download CSV"
            kind="neutral"
            scale="s"
            disabled={isRefreshing}
          >
            Export
          </CalciteButton>
          <div className="h-3 w-px bg-gray-600 mx-1"></div>
          <CalciteButton
            appearance="transparent"
            icon-start="x"
            onClick={handleCloseTable}
            title="Close All"
            kind="danger"
            scale="s"
          />
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse whitespace-nowrap text-[11px]">
          <thead className="sticky top-0 bg-[#2b2b2b] text-gray-400 text-[10px] uppercase tracking-wider shadow-md z-20">
            <tr>
              <th className="sticky left-0 z-30 w-[60px] min-w-[60px] bg-[#2b2b2b] px-3 py-1.5 font-medium border-b border-gray-600 shadow-[1px_0_0_0_#4b5563]">
                S.No
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  title={col.description}
                  style={{ cursor: col.description ? "help" : "default" }}
                  className={`px-3 py-1.5 font-medium border-b border-gray-600 ${
                    col.headerClassName || ""
                  } ${
                    col.key === "id"
                      ? "sticky left-[60px] z-30 w-[100px] min-w-[100px] bg-[#2b2b2b] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]"
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
              const isSelected = attr.id === selectedRowId;
              const rowBg = isSelected
                ? "bg-[#2d3748] text-white"
                : "bg-[#242424] group-odd:bg-[#2a2a2a] group-hover:bg-[#383838]";

              return (
                <tr
                  key={idx}
                  className={`transition-colors duration-150 ease-in-out cursor-pointer group ${
                    isSelected
                      ? "bg-blue-600/20 border-l-4 border-l-blue-500"
                      : "even:bg-[#242424] odd:bg-[#2a2a2a] hover:bg-[#383838]"
                  }`}
                  onClick={() => mapLocate(attr.id)}
                >
                  <td
                    className={`sticky left-0 z-10 w-[60px] px-3 py-1 transition-colors shadow-[1px_0_0_0_rgba(75,85,99,0.3)] ${rowBg} ${
                      isSelected ? "" : "text-gray-400"
                    }`}
                  >
                    {indexOfFirstRow + idx + 1}
                  </td>

                  {columns.map((col) => {
                    if (col.key === "id") {
                      return (
                        <td
                          key="id"
                          className={`sticky left-[60px] z-10 w-[100px] px-3 py-1 font-mono text-[11px] transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] ${rowBg} ${
                            isSelected ? "text-yellow-400" : "text-blue-400"
                          }`}
                        >
                          {attr.id}
                        </td>
                      );
                    }

                    // --- NEW: Interactive button for Zone Customer List ---

                    if (col.key === "affected_aliases" && attr.zone) {
                      return (
                        <td key={col.key} className="px-3 py-1 text-[11px]">
                          <button
                            onClick={(e) => handleViewZoneCustomers(e, attr)}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <span>🔍</span> View {attr.affected_aliases?.length || 0} Customers
                          </button>
                        </td>
                      );
                    }

                    const rawValue = attr[col.key];
                    const cellValue = col.render
                      ? col.render(attr)
                      : formatTableCellValue(col.key, rawValue);

                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-1 text-[11px] ${col.className || "text-gray-400"}`}
                        title={col.showTitle ? String(cellValue) : undefined}
                      >
                        {cellValue}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex justify-between items-center px-3 py-1.5 bg-[#1c1c1c] border-t border-gray-700 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-gray-400">
            Showing <span className="font-semibold text-gray-200">{indexOfFirstRow + 1}</span> to{" "}
            <span className="font-semibold text-gray-200">
              {Math.min(indexOfLastRow, localFeatures.length)}
            </span>{" "}
            of <span className="font-semibold text-gray-200">{localFeatures.length}</span>
          </span>

          <select
            className="bg-[#242424] hover:bg-[#2a2a2a] text-gray-300 text-[11px] rounded px-1.5 py-0.5 border border-gray-600 outline-none transition-colors cursor-pointer"
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

        <div className="flex items-center gap-2">
          <button
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
              currentPage === 1
                ? "bg-transparent text-gray-600 border-gray-700 cursor-not-allowed"
                : "bg-[#242424] hover:bg-[#383838] text-gray-300 border-gray-600 cursor-pointer"
            }`}
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </button>

          <span className="text-[11px] font-medium text-gray-400 px-1">
            Page {currentPage} of {totalPages}
          </span>

          <button
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
              currentPage === totalPages || totalPages === 0
                ? "bg-transparent text-gray-600 border-gray-700 cursor-not-allowed"
                : "bg-[#242424] hover:bg-[#383838] text-gray-300 border-gray-600 cursor-pointer"
            }`}
            disabled={currentPage === totalPages || totalPages === 0}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Next
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.5); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.8); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(71, 85, 105, 1); }
      `}</style>
    </div>
  );
}