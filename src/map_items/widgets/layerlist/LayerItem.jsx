import React, { useEffect, useState, useRef } from "react";
import Legend from "@arcgis/core/widgets/Legend";
import { useLayers } from "../../../context/MapContext";
import { useAuth } from "../../../context/AuthContext"; // <-- NEW: Import Auth Context
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";

import {
  CalciteListItem,
  CalciteAction,
  CalciteIcon,
  CalciteSlider,
  CalciteSwitch,
  CalciteButton
} from "@esri/calcite-components-react";

// Add any layer title to this list to automatically show the label toggle
const LABELABLE_LAYERS = [
  "dc_odb", 
  "Vehicles",
  "pop",
  "site",
  "pop_boundary"
];

// Pre-defined coordinates for regional navigation (Longitude, Latitude)
const REGION_VIEWS = {
  "South Parcels": { center: [67.0011, 24.8607], zoom: 12 },    // Karachi / Sindh
  "Central Parcels": { center: [74.3587, 31.5204], zoom: 12 },  // Lahore / Punjab
  "North Parcels": { center: [73.0479, 33.6844], zoom: 12 }     // Islamabad / North
};

const getLayerIcon = (layer) => {
  if (layer.type === "group") return "layers";
  const geomType = layer.geometryType;
  if (geomType === "point" || geomType === "multipoint") return "point";
  if (geomType === "polyline") return "line";
  if (geomType === "polygon") return "polygon";
  if (layer.type === "imagery" || layer.type === "tile") return "image";
  return "layer";
};

export default function LayerItem({ layer, view, LAYER_LABELS, isOpen, onToggle }) {
  const initialTitle = LAYER_LABELS[layer.title] || layer.title;
  const { layers } = useLayers();
  const { user } = useAuth(); // <-- NEW: Get user from Auth
  const [isVisible, setIsVisible] = useState(layer.visible);
  const [opacity, setOpacity] = useState(layer.opacity || 1);
  const [labelsVisible, setLabelsVisible] = useState(layer.labelsVisible);
  const legendDiv = useRef(null);

  // Sync state with map changes
  useEffect(() => {
    const handle = reactiveUtils.watch(
      () => [layer.visible, layer.opacity, layer.labelsVisible],
      ([visible, op, lbls]) => {
        setIsVisible(visible);
        setOpacity(op);
        setLabelsVisible(lbls);
      }
    );
    return () => handle.remove();
  }, [layer]);

  useEffect(() => {
    let legend = null;

    if (isOpen && legendDiv.current) {
      let legendLayer = layer;
      
      // If this is a GroupLayer (like Home Parcels with 3 regions)
      // Grab only the first child layer to prevent duplicate legends
      if (layer.type === "group" && layer.layers && layer.layers.length > 0) {
        legendLayer = layer.layers.getItemAt(0); 
      }

      legend = new Legend({
        view: view,
        container: legendDiv.current,
        layerInfos: [{ 
          layer: legendLayer, 
          title: initialTitle 
        }]
      });
    }

    return () => {
      if (legend) legend.destroy();
    };
  }, [isOpen, layer, view, initialTitle]);

  const handleVisibilityToggle = (e) => {
    e.stopPropagation();
    layer.visible = !layer.visible;
  };

  const handleOpacityChange = (e) => {
    layer.opacity = e.target.value;
  };

  const handleLabelsToggle = (e) => {
    const isChecked = e.target.checked;
    layer.labelsVisible = isChecked;
    setLabelsVisible(isChecked);
  };

  // Map Navigation Function
  const navigateToRegion = (regionTitle) => {
    const target = REGION_VIEWS[regionTitle];
    if (target && view) {
      view.goTo({ center: target.center, zoom: target.zoom }, { duration: 1500 });
    }
  };

  // --- NEW: Role check logic ---
  // Adjust "user?.role" below to match exactly how your user object is structured (e.g., user?.department, user?.roleId, etc.)
  const isCommercial_twa = user?.role?.toLowerCase() === "commercial" || user?.role?.toLowerCase() === "twa";

  return (
    <div className="border-b border-gray-700 last:border-b-0">
      <CalciteListItem
        label={initialTitle}
        description={isVisible ? "Visible" : "Hidden"}
        onClick={onToggle}
        className={`cursor-pointer transition-colors ${isOpen ? 'bg-[#2b2b2b]' : 'hover:bg-[#2a2a2a]'}`}
      >
        <div slot="content-start" className="flex items-center text-gray-400">
          <CalciteIcon icon={getLayerIcon(layer)} scale="m" />
        </div>

        <div slot="content-end" onClick={(e) => e.stopPropagation()}>
          <CalciteAction
            icon={isVisible ? "view-visible" : "view-hide"}
            text={isVisible ? "Hide Layer" : "Show Layer"}
            onClick={handleVisibilityToggle}
            appearance="transparent"
            scale="s"
            className={isVisible ? "text-blue-400" : "text-gray-500"}
          />
        </div>
      </CalciteListItem>

      {/* Expanded Content Box */}
      {isOpen && (
        <div className="bg-[#1f1f1f] p-4 border-l-2 border-blue-500 shadow-inner">
          
          {/* Region Navigation UI for Parcels (RESTRICTED TO COMMERCIAL) */}
          {layer.title === "Home Parcels" && layer.layers && layer.layers.length > 0 && isCommercial_twa && (
            <div className="mb-4">
              <h6 className="text-xs font-bold text-gray-500 uppercase mb-2 border-b border-gray-700 pb-1">
                Navigate Map
              </h6>
              <div className="flex gap-2">
                {layer.layers.toArray().map((subLayer) => (
                  <CalciteButton
                    key={subLayer.id}
                    appearance="outline"
                    scale="s"
                    kind="brand"
                    width="full"
                    onClick={() => navigateToRegion(subLayer.title)}
                  >
                    {subLayer.title.replace(" Parcels", "")}
                  </CalciteButton>
                ))}
              </div>
            </div>
          )}

          {/* Label Toggle */}
          {LABELABLE_LAYERS.includes(layer.title) && (
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalciteIcon icon="label" scale="s" className="text-gray-500" />
                <span className="text-gray-200 text-sm">Show Labels</span>
              </div>
              <CalciteSwitch 
                checked={labelsVisible ? true : undefined}
                onCalciteSwitchChange={handleLabelsToggle}
              />
            </div>
          )}

          {/* Opacity Slider */}
          <div className="mb-3 flex items-center gap-2">
            <CalciteIcon icon="transparency" scale="s" className="text-gray-500" />
            <CalciteSlider
              min={0}
              max={1}
              step={0.1}
              value={opacity}
              labelHandles
              onCalciteSliderInput={handleOpacityChange}
              className="w-full"
            />
          </div>

          {/* Legend */}
          <div className="mt-2 bg-gray">
            <h6 className="text-xs font-bold text-gray-500 uppercase mb-2 border-b border-gray-700 pb-1">Legend</h6>
            <div 
                ref={legendDiv} 
                className="custom-legend bg-transparent"
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}