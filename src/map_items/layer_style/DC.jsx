import { useEffect } from "react";
import { useArcGIS } from '../../context/MapContext';

export default function DC() {
  const { layers, view } = useArcGIS();

  useEffect(() => {
    if (Object.keys(layers).length === 0 || !layers.dc_odb) return; 

    const wf_status = "$feature.wf_status";

    const valueExpression = `When (${wf_status} == 0 , 'Status-AsBuilt' ,${wf_status} == 1 , 'Status-Design','none')`;

    var rendererCheck = {
      type: "unique-value", 
      valueExpression: valueExpression,
      uniqueValueInfos: [
        {
          value: "Status-AsBuilt",
          symbol: {
            type: "picture-marker",
            url: "images/DC.png",
            width: "30px",
            height: "15px",
          },
        },
        {
          value: "Status-Design",
          symbol: {
            type: "picture-marker",
            url: "images/dc1.png",
            width: "20px",
            height: "14px",
          },
        },
      ],
    };

    // <-- NEW LABEL CLASS CONFIGURATION -->
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
    layers.dc_odb.renderer = rendererCheck;
    
   
    layers.dc_odb.labelingInfo = [dcLabelClass];
    layers.dc_odb.labelsVisible = false; // Keep default false, let the user toggle it

    if (!view.map.layers.includes(layers.dc_odb)) {
      view.map.add(layers.dc_odb);
    }

  }, [layers.dc_odb, view]);

  return null;
}