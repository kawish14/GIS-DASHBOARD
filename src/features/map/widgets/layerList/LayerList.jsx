import React, { useEffect, useState } from "react";
import { useLayers } from "../../state/LayersContext";
import { useMapView } from "../../state/MapViewContext";
import LayerItem from "./LayerItem";

// Calcite Components
import {
  CalciteList,
  CalcitePanel,
  CalciteLoader,
  CalciteFilter,
  CalciteBlock,
} from "@esri/calcite-components-react";

import { LAYER_LABELS } from "../../../../shared/constants/layerLabels";

const LAYER_SEQUENCE = [
  "Customers_test",
  "pop",
  "dc_odb",
  "fat",
  "jc",
  "Feeder",
  "Distribution",
  "Backhaul",
  "civil",
  "conduit",
  "hh",
  "pop_boundary",
  "zones",
  "site",
  "longhaul",
  "Vehicles",
  "Home Parcels",
];

// --- Grouping Definitions ---
const LONGHAUL_LAYERS = ["longhaul", "site"];
const CIVIL_LAYERS = ["civil", "conduit", "hh"];
const UNGROUPED_LAYERS = ["Home Parcels", "Vehicles", "Customers_test"];
const EXCLUDED_FROM_GPON = [...LONGHAUL_LAYERS, ...CIVIL_LAYERS, ...UNGROUPED_LAYERS];

export default function LayerList() {
  const { view } = useMapView();
  const { layers } = useLayers();
  const [mapLayers, setMapLayers] = useState([]);
  const [filterText, setFilterText] = useState("");

  const [activeLayerUid, setActiveLayerUid] = useState(null);

  useEffect(() => {
    if (!view) return;

    const updateLayers = () => {
      const allLayers = view.map.layers.toArray();
      setMapLayers([...allLayers]);
    };

    updateLayers();
    const listener = view.map.layers.on("change", updateLayers);

    return () => {
      listener.remove();
    };
  }, [view, layers]);

  const processedLayers = mapLayers.filter((layer) => {
    const isAuthorized = layers[layer.title] === layer;
    if (!isAuthorized) return false;

    const title = LAYER_LABELS[layer.title] || layer.title;
    return title.toLowerCase().includes(filterText.toLowerCase());
  });

  const sortGroup = (layersArray) => {
    return layersArray.sort((a, b) => {
      const indexA = LAYER_SEQUENCE.indexOf(a.title);
      const indexB = LAYER_SEQUENCE.indexOf(b.title);
      const valA = indexA === -1 ? 999 : indexA;
      const valB = indexB === -1 ? 999 : indexB;
      return valA - valB;
    });
  };

  // 1. We removed the "other" group from this array
  const groupedData = [
    {
      id: "longhaul",
      title: "Longhaul Network",
      layers: sortGroup(processedLayers.filter(l => LONGHAUL_LAYERS.includes(l.title)))
    },
    {
      id: "gpon",
      title: "GPON Network",
      layers: sortGroup(processedLayers.filter(l => !EXCLUDED_FROM_GPON.includes(l.title)))
    },
    {
      id: "civil",
      title: "Civil",
      layers: sortGroup(processedLayers.filter(l => CIVIL_LAYERS.includes(l.title)))
    }
  ];

  // 2. Extracted ungrouped layers separately
  const ungroupedData = sortGroup(processedLayers.filter(l => UNGROUPED_LAYERS.includes(l.title)));

  const handleToggle = (uid) => {
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

      <div className="flex-1 overflow-y-auto">
        {processedLayers.length > 0 ? (
          <>
          {/* Render ungrouped layers freely at the bottom */}
            {ungroupedData.length > 0 && (
              <CalciteList>
                {ungroupedData.map((layer) => (
                  <LayerItem
                      key={layer.uid}
                      layer={layer}
                      view={view}
                      LAYER_LABELS={LAYER_LABELS}
                      isOpen={activeLayerUid === layer.uid}
                      onToggle={() => handleToggle(layer.uid)}
                  />
                ))}
              </CalciteList>
            )}


            {/* Render grouped layers inside CalciteBlocks */}
            {groupedData.map((group) => {
              if (group.layers.length === 0) return null;

              return (
                <CalciteBlock
                  key={group.id}
                  heading={group.title}
                  scale="s"
                  close
                  collapsible
                >
                  <CalciteList>
                    {group.layers.map((layer) => (
                      <LayerItem
                          key={layer.uid}
                          layer={layer}
                          view={view}
                          LAYER_LABELS={LAYER_LABELS}
                          isOpen={activeLayerUid === layer.uid}
                          onToggle={() => handleToggle(layer.uid)}
                      />
                    ))}
                  </CalciteList>
                </CalciteBlock>
              );
            })}
          </>
        ) : (
          <div className="p-4 text-center text-gray-500 italic">
            No layers found.
          </div>
        )}
      </div>
    </CalcitePanel>
  );
}
