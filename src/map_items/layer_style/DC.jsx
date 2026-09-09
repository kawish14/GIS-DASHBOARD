import { useEffect } from "react";
import { useArcGIS } from '../../context/MapContext';
import SymbologyLayer from "../symbology/SymbologyLayer";

export default function DC() {
  const { layers, view } = useArcGIS();

  useEffect(() => {
    if (Object.keys(layers).length === 0 || !layers.dc_odb) return; 

    const dcLabelClass = {
      symbol: {
        type: "text",
        color: "black",
        haloColor: "white", // Adds a white outline so it's readable over maps
        haloSize: 1.2,
        font: {
          size: 8,
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

    layers.dc_odb.selection = false;
    layers.dc_odb.visible = false;
    layers.dc_odb.labelingInfo = [dcLabelClass];
    layers.dc_odb.labelsVisible = false; // Keep default false, let the user toggle it

    if (!view.map.layers.includes(layers.dc_odb)) {
      view.map.add(layers.dc_odb);
    }

  }, [layers.dc_odb, view]);

  return <SymbologyLayer layerKey="dc_odb" defaultVisible={false} />;
}