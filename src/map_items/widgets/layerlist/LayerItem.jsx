import React, { useEffect, useState, useRef } from "react";
import Legend from "@arcgis/core/widgets/Legend";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";

import {
  CalciteListItem,
  CalciteAction,
  CalciteIcon,
  CalciteSlider,
  CalciteSwitch 
} from "@esri/calcite-components-react";

// Add any layer title to this list to automatically show the label toggle
const LABELABLE_LAYERS = [
  "dc_odb", 
  "Vehicles",
  "pop",
  "site",
  "pop_boundary"
];

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
  
  const [isVisible, setIsVisible] = useState(layer.visible);
  const [opacity, setOpacity] = useState(layer.opacity || 1);
  const [labelsVisible, setLabelsVisible] = useState(layer.labelsVisible);
  const legendDiv = useRef(null);

  // Sync state with map changes
  useEffect(() => {
    console.log(layer.title)
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

  // --- THE FIX IS HERE ---
  useEffect(() => {
    let legend = null;

    if (isOpen && legendDiv.current) {
      
      let legendLayer = layer;
      
      // FIX: If this is a GroupLayer (like Home Parcels with 3 regions)
      // Grab only the first child layer to prevent duplicate legends
      if (layer.type === "group" && layer.layers && layer.layers.length > 0) {
        legendLayer = layer.layers.getItemAt(0); 
      }

      legend = new Legend({
        view: view,
        container: legendDiv.current,
        layerInfos: [{ 
          layer: legendLayer, 
          title: initialTitle // FIX: Overrides "parcel_evw" with "Home Parcels"
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

    console.log(layer.title, "visibility toggled to", layer.visible);

  };

  const handleOpacityChange = (e) => {
    layer.opacity = e.target.value;
  };

  const handleLabelsToggle = (e) => {
    const isChecked = e.target.checked;
    layer.labelsVisible = isChecked;
    setLabelsVisible(isChecked);
  };

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