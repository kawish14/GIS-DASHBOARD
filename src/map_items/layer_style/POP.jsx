import { useEffect } from "react";
import { useArcGIS } from '../../context/MapContext';
import SymbologyLayer from "../symbology/SymbologyLayer";

export default function POP() {

  const { layers, view } = useArcGIS();

  useEffect(() => {

    if (Object.keys(layers).length === 0 || !layers.pop) return; 

    const popLabelClass = {
      symbol: {
        type: "text",
        color: "black",
        haloColor: "white", // Adds a white outline so it's readable over maps
        haloSize: 1.2,
        font: {
          size: 8.5,
          family: "sans-serif",
          weight: "bold"
        }
      },
      labelPlacement: "above-center", // Places label above the DC marker
      labelExpressionInfo: {
        // Change 'name' to whatever field holds the DC identifier in your attribute table (e.g., 'dc_id')
        expression: `$feature.id + " - " + $feature.name` 
      }
    };

    layers.pop.selection = false;
    layers.pop.labelingInfo = [popLabelClass];
    layers.pop.labelsVisible = false; // Keep default false, let the user toggle it


    if (!view.map.layers.includes(layers.pop)) {
      view.map.add(layers.pop);

    }

  }, [layers.pop, view]);

  return <SymbologyLayer layerKey="pop" defaultVisible={false} />;
}