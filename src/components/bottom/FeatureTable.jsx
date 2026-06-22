import React, { useState, useEffect, useRef } from "react";
import { useArcGIS } from "../../context/MapContext";
import { CalciteButton, CalciteIcon } from "@esri/calcite-components-react";
import { Realtime, api } from "../../../url";

// --- Helper function to calculate time difference ---
const calculateDuration = (faultTimeStr) => {
  if (!faultTimeStr) return "-";
  
  const faultTime = new Date(faultTimeStr);
  if (isNaN(faultTime.getTime())) return "-"; 

  const now = new Date();
  const diffMs = now - faultTime;

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

// --- Helper function to calculate Optical Threshold ---
const optical_threshold = (data) => {
  if (!data) return { 
    ontText: "---", oltText: "---", 
    ontKind: "neutral", oltKind: "neutral" 
  };

  const threshold = -26.0;
  const ontPower = data.opticsrxpower / 100;
  const oltPower = data.opticsrxpowerbyolt / 100;

  const getKind = (power, isOlt = false) => {
    if (isNaN(power)) return "neutral";
    if (power < threshold || power > 0) return "red"; 
    return "green";
  };

  return {
    ontText: isNaN(ontPower) ? "---" : `${ontPower.toFixed(2)} dBm`,
    oltText: isNaN(oltPower) ? "---" : `${oltPower.toFixed(2)} dBm`,
    ontKind: getKind(ontPower),
    oltKind: getKind(oltPower, true)
  };
};

export default function FeatureTable({ features }) {
  const { view, layers, layerView, selectedFeatures, setSelectedFeatures, highlightHandleRef } = useArcGIS(); 

  const [localFeatures, setLocalFeatures] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // --- NEW: State to store power data mapped by ID ---
  const [powerDataMap, setPowerDataMap] = useState({});

  const [selectedRowId, setSelectedRowId] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  useEffect(() => {
    setCurrentPage(1);
  }, [localFeatures]);

  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;

  const currentRows = localFeatures.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(localFeatures.length / rowsPerPage);
  
  const fetchPowerForFeatures = (featureList) => {
    featureList.forEach(async (feat) => {
      const attr = feat.attributes;
      
      // OPTIMIZATION: Only fetch power if alarmstate is exactly 4 or 3
      if (attr.alarmstate !== 4 && attr.alarmstate !== 3) {
        setPowerDataMap((prev) => ({
          ...prev,
          [attr.id]: { 
            ontText: "--", 
            oltText: "--", 
            ontKind: "neutral", 
            oltKind: "neutral" 
          }
        }));
        return; // Exit early, skip the API call
      }

      // Skip if routing info is missing
      if (!attr.olt || attr.frame == null) {
        setPowerDataMap((prev) => ({
          ...prev,
          [attr.id]: optical_threshold(null)
        }));
        return;
      }

      try {
        const powerParams = new URLSearchParams({
          olt: attr.olt, fn: attr.frame, sn: attr.slot, pn: attr.port, ontid: attr.ontid,
        }).toString();

        const powerRes = await fetch(`${Realtime}/api/get-power?${powerParams}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
        });
        const powerResult = await powerRes.json();
        const powerInfo = optical_threshold(powerResult.data?.[0]);

        // Update state specifically for this ID as soon as it loads
        setPowerDataMap((prev) => ({
          ...prev,
          [attr.id]: powerInfo
        }));
      } catch (error) {
        console.error(`Power fetch failed for ${attr.id}`, error);
        setPowerDataMap((prev) => ({
          ...prev,
          [attr.id]: optical_threshold(null)
        }));
      }
    });
  };

  // Sync with parent features when they first load or change
  useEffect(() => {
    if (features && features.length > 0) {
      setLocalFeatures(features);
     // fetchPowerForFeatures(features); // Fire off power fetches
    }
  }, [features]);

  if (!localFeatures || localFeatures.length === 0) return null;

  // --- WFS Refresh Logic ---
  const handleRefresh = async () => {
    if (localFeatures.length === 0) return;
    setIsRefreshing(true);
    
    try {
      const currentIds = localFeatures.map((feat) => feat.attributes.id);
      const cqlFilter = `"id" IN ('${currentIds.join("','")}')`;

      const desiredFields = [
        "id", "name", "type", "area_town", "sub_area", "alarmstate", 
        "olt", "frame", "slot", "port", "ontid", "dc_id", "alarminfo", 
        "fault_time", "service_tier", "bandwidth", "activation_date", "status"
      ].join(",");

      const baseUrl = `${api}/geoserver/web_app/ows`;
      
      const params = new URLSearchParams({
        service: "WFS",
        version: "1.0.0",
        request: "GetFeature",
        typeName: "web_app:Customers_test",
        outputFormat: "application/json",
        propertyName: desiredFields,
        CQL_FILTER: cqlFilter
      });

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
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
          return { attributes: refreshedMap[id] };
        }
        return feat; 
      });

      setLocalFeatures(updatedLocalFeatures);
      
      // Fetch fresh power data for the newly refreshed features
      //fetchPowerForFeatures(updatedLocalFeatures);

    } catch (error) {
      console.error("Failed to refresh table data:", error);
      alert("Could not refresh data. Check console for details.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // --- CSV Export Logic ---
  const downloadCSV = () => {
    const headers = [
      "ID", "Name", "Type", "Area", "Sub Area", "Status", "OLT", 
      "FSP", "ONT#", "DC/ODB", "Alarm Info", 
      "Fault Time", "Fault Duration", "RX Power (dBm)", "Service Tier", "Bandwidth", "Activation Date"
    ];

    const csvRows = [headers.join(",")];

    localFeatures.forEach((feat) => {
      const attr = feat.attributes;
      const isUp = attr.alarmstate === 0 || attr.alarmstate === 3 || attr.alarmstate === 4;
      const status = isUp ? "UP" : "DOWN";
      
      const fsp = `${attr.frame ?? ""}/${attr.slot ?? ""}/${attr.port ?? ""}`;
      const duration = calculateDuration(attr.fault_time); 
      
      // Get power data from the mapped state
      //const powerText = powerDataMap[attr.id]?.ontText || "Loading...";

      const rowData = [
        attr.id, attr.name, attr.type, attr.area_town, attr.sub_area, status,
        attr.olt, fsp, attr.ontid, attr.dc_id, attr.alarminfo, 
        attr.fault_time, duration, /* powerText */, attr.service_tier, attr.bandwidth, attr.activation_date
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
    a.download = `feature_export_${timeStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

 const mapLocate = async (id) => {
    setSelectedRowId(id);

    try {
        if (selectedFeatures && selectedFeatures.length > 0) {
          const targetFeature = selectedFeatures.filter(f => f.attributes.id === id);
            
            view.goTo({ 
                target: targetFeature, 
                zoom: 22 
            }).catch(err => {
                if (err.name !== "AbortError" && err.name !== "view:goto-interrupted") {
                    console.error("Zoom failed:", err);
                }
            });
        }
    } catch(error) {
        console.error("Error zooming to customers:", error);
    }
  }

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
      <div className="flex justify-between items-center px-4 py-3 bg-[#1c1c1c] border-b border-gray-700 shadow-sm shrink-0"
        style={{height: "7vh"}}
      >
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
          <CalciteButton
            appearance="transparent"
            icon-start="refresh"
            onClick={handleRefresh}
            title="Refresh Data"
            kind="neutral"
            loading={isRefreshing}
          >
            Refresh
          </CalciteButton>

          <CalciteButton
            appearance="transparent"
            icon-start="download"
            onClick={downloadCSV}
            title="Download CSV"
            kind="neutral"
            disabled={isRefreshing}
          >
            Export
          </CalciteButton>

          <div className="h-4 w-px bg-gray-600 mx-1"></div>

          <CalciteButton
            appearance="transparent"
            icon-start="x"
            onClick={handleCloseTable}
            title="Close Table"
            kind="danger"
          />
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
              <th className="sticky left-[80px] z-30 w-[120px] min-w-[120px] bg-[#2b2b2b] px-4 py-3 font-medium border-b border-gray-600 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                ID
              </th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">Name</th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">Type</th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">Area</th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">Sub Area</th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">Status</th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">OLT</th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">FSP</th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">ONT#</th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">DC/ODB</th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">Alarm Info</th>
              <th className="px-4 py-3 font-medium text-blue-400 border-b border-gray-600">Fault Time</th>
              <th className="px-4 py-3 font-medium text-red-400 border-b border-gray-600">Fault Duration</th>
              {/* <th className="px-4 py-3 font-medium text-orange-400 border-b border-gray-600">RX Power</th> */}
              <th className="px-4 py-3 font-medium border-b border-gray-600">Service Tier</th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">Bandwidth</th>
              <th className="px-4 py-3 font-medium border-b border-gray-600">Activation Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {/* FIXED: Now maps over currentRows instead of localFeatures for correct pagination */}
            {currentRows.map((feat, idx) => {
              const attr = feat.attributes;
              const isUp = (attr.status==="Active" && attr.alarmstate === 0) || (attr.status==="Active" && attr.alarmstate === 3) || (attr.status==="Active" && attr.alarmstate === 4);
              const isDown = (attr.status==="Active" && attr.alarmstate === 1) || (attr.status==="Active" && attr.alarmstate === 2);

              const isSelected = attr.id === selectedRowId;
              //const pInfo = powerDataMap[attr.id];
              //const powerText = pInfo ? pInfo.ontText : "Loading...";
              //const powerColorClass = pInfo?.ontKind === "red" ? "text-red-400" : pInfo?.ontKind === "green" ? "text-green-400" : "text-gray-400";

              return (
                <tr
                  key={idx}
                  className={`transition-colors duration-150 ease-in-out cursor-pointer group
                    ${isSelected 
                      ? "bg-blue-600/20 border-l-4 border-l-blue-500" 
                      : "even:bg-[#242424] odd:bg-[#2a2a2a] hover:bg-[#383838]"
                    }`}
                  onClick={() => mapLocate(attr.id)}
                >
                 <td className={`sticky left-0 z-10 w-[80px] px-4 py-2.5 transition-colors shadow-[1px_0_0_0_rgba(75,85,99,0.3)]
                    ${isSelected ? "bg-[#2d3748] text-white" : "bg-[#242424] group-odd:bg-[#2a2a2a] group-hover:bg-[#383838] text-gray-400"}`}>
                    {indexOfFirstRow + idx + 1} {/* FIXED: Accurately reflects row number across pages */}
                  </td>
                   <td className={`sticky left-[80px] z-10 w-[120px] px-4 py-2.5 font-mono text-xs transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]
                    ${isSelected ? "bg-[#2d3748] text-yellow-400" : "bg-[#242424] group-odd:bg-[#2a2a2a] group-hover:bg-[#383838] text-blue-400"}`}>
                    {attr.id}
                  </td> 
                  <td className="px-4 py-2.5 text-gray-200 text-xs">{attr.name}</td>
                  <td className="px-4 py-2.5 text-gray-300 text-xs">{attr.type}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{attr.area_town}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{attr.sub_area}</td>
                  <td className="px-4 py-2.5">
                    {attr.status === 'Active' ? 
                      <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                        isUp
                          ? "bg-green-500/10 text-green-400 border-green-500/30"
                          : "bg-red-500/10 text-red-400 border-red-500/30"
                      }`}
                    >
                      {isUp ? "UP" : isDown ? "DOWN" : "--"}
                    </span>
                    :
                    <span>
                      --
                    </span>
                    }
                    
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs" title={attr.olt}>
                    {attr.olt}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">
                    {attr.frame}/{attr.slot}/{attr.port}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{attr.ontid}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{attr.dc_id}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs" title={attr.alarminfo}>
                    {attr.alarminfo}
                  </td>
                  <td className="px-4 py-2.5 text-blue-300 text-xs whitespace-nowrap">{attr.fault_time}</td>
                  <td className="px-4 py-2.5 text-red-400 text-xs whitespace-nowrap">
                    {calculateDuration(attr.fault_time)}
                  </td>
                  {/* <td className={`px-4 py-2.5 font-mono font-bold text-xs whitespace-nowrap ${powerColorClass}`}>
                    {powerText}
                  </td> */}
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{attr.service_tier}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{attr.bandwidth}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{attr.activation_date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* FIXED: Footer is now explicitly OUTSIDE the overflow-auto container so it stays fixed */}
      {/* FIXED: Styling replaced with pure Tailwind to completely match standard HTML table aesthetics */}
      <div className="flex justify-between items-center px-4 py-3 bg-[#1c1c1c] border-t border-gray-700 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            Showing <span className="font-semibold text-gray-200">{indexOfFirstRow + 1}</span> to <span className="font-semibold text-gray-200">{Math.min(indexOfLastRow, localFeatures.length)}</span> of <span className="font-semibold text-gray-200">{localFeatures.length}</span>
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
              currentPage === 1 
                ? "bg-transparent text-gray-600 border-gray-700 cursor-not-allowed" 
                : "bg-[#242424] hover:bg-[#383838] text-gray-300 border-gray-600 cursor-pointer"
            }`}
            disabled={currentPage === 1} 
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Prev
          </button>
          
          <span className="text-sm font-medium text-gray-400 px-1">
            Page {currentPage} of {totalPages}
          </span>

          <button 
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded border transition-colors ${
              (currentPage === totalPages || totalPages === 0)
                ? "bg-transparent text-gray-600 border-gray-700 cursor-not-allowed" 
                : "bg-[#242424] hover:bg-[#383838] text-gray-300 border-gray-600 cursor-pointer"
            }`}
            disabled={currentPage === totalPages || totalPages === 0} 
            onClick={() => setCurrentPage(p => p + 1)}
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}