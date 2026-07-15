import React, { useEffect, useState } from "react";
import { useMapView, useLayers } from "../../../context/MapContext";
import LayerItem from "./LayerItem";

// Calcite Components
import {
  CalciteList,
  CalcitePanel,
  CalciteLoader,
  CalciteFilter,
} from "@esri/calcite-components-react";

// --- Configuration ---
const LAYER_LABELS = {
  fat: "Fiber Access Terminal (FAT)",
  Backhaul: "Backhaul Routes",
  Customers_test: "Customers",
  Distribution: "Distribution OFC",
  Feeder: "Feeder OFC",
  dc_odb: "Distribution Cabinets (DC/ODB)",
  pop: "POP",
  jc: "Joint Closure (JC)",
  pop_boundary: "POP Service Areas",
  zones: "Zones",
  site: "TWA Site",
  longhaul: "TWA Longhaul",
  "Vehicles": "Live Vehicles",
  "Home Parcels": "Home Parcels"
};

// --- Define Custom Order (Top to Bottom) ---
const LAYER_SEQUENCE = [
  "Customers_test",   // 1
  "pop",              // 2
  "dc_odb",           // 3
  "fat",              // 4
  "jc",               // 5
  "Feeder",           // 6
  "Distribution",     // 7
  "Backhaul",         // 8
  "pop_boundary",     // 9
  "zones",            // 10
  "site",             // 11
  "longhaul",         // 12
  "Vehicles",
  "Home Parcels",
];

export default function LayerListSidebar() {
  const { view } = useMapView();
  const { layers } = useLayers();
  const [mapLayers, setMapLayers] = useState([]);
  const [filterText, setFilterText] = useState("");
  
  // NEW: Track the single currently open layer ID
  const [activeLayerUid, setActiveLayerUid] = useState(null);

  useEffect(() => {
    if (!view) return;

    const updateLayers = () => {
      const allLayers = view.map.layers.toArray();
      //console.log("Map layers updated:", allLayers.map(l => l.title)); // Debug log
      setMapLayers([...allLayers]); 
    };

    updateLayers();
    const listener = view.map.layers.on("change", updateLayers);

    return () => {
      listener.remove();
    };
  }, [view, layers]);

  // --- Filtering & Sorting ---
  const processedLayers = mapLayers
    .filter((layer) => {
      // Auth Check
      const isAuthorized = layers[layer.title] === layer;
      if (!isAuthorized) return false;

      // Search Filter
      const title = LAYER_LABELS[layer.title] || layer.title;
      return title.toLowerCase().includes(filterText.toLowerCase());
    })
    .sort((a, b) => {
      const indexA = LAYER_SEQUENCE.indexOf(a.title);
      const indexB = LAYER_SEQUENCE.indexOf(b.title);
      const valA = indexA === -1 ? 999 : indexA;
      const valB = indexB === -1 ? 999 : indexB;
      return valA - valB;
    });

  // Toggle Handler
  const handleToggle = (uid) => {
    // If clicking the already open one, close it (set to null). Otherwise, set to new UID.
    setActiveLayerUid(prev => prev === uid ? null : uid);
  };

  if (!view) return <CalciteLoader label="Loading Map..." />;

  return (
    <CalcitePanel className="h-full">
        <div className="p-2 border-b border-gray-200">
            <CalciteFilter 
                onCalciteFilterChange={(e) => setFilterText(e.target.value)}
                placeholder="Find a layer..."
            />
        </div>

      <CalciteList className="flex-1 overflow-y-auto">
        {processedLayers.length > 0 ? (
          processedLayers.map((layer) => (
            <LayerItem 
                key={layer.uid} 
                layer={layer} 
                view={view} 
                LAYER_LABELS={LAYER_LABELS}
                // NEW: Pass state down
                isOpen={activeLayerUid === layer.uid}
                onToggle={() => handleToggle(layer.uid)}
            />
          ))
        ) : (
          <div className="p-4 text-center text-gray-500 italic">
            No layers found.
          </div>
        )}
      </CalciteList>
    </CalcitePanel>
  );
}