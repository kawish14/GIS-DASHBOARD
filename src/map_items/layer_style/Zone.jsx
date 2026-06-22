import { useEffect } from "react";
import { useArcGIS } from "../../context/MapContext";

export default function Zone() {
  const { layers, view } = useArcGIS();

  useEffect(() => {
    if (Object.keys(layers).length === 0 || !layers.zones) return;

     var rendererCheck = {
      type: "unique-value",
      field: "zone",
      uniqueValueInfos: [
        {
          value: "Zone 1",
          symbol: {
            type: "simple-fill",
            color: [200, 133, 68, 0.4],
            style: "solid",
            outline: {
              color: "white",
              width: 0.5,
            },
          },
        },
        {
          value: "Zone 2",
          symbol: {
            type: "simple-fill",
            color: [255, 170, 0, 0.4],
            style: "solid",
            outline: {
              color: "white",
              width: 0.1,
            },
          },
        },
        {
          value: "Zone 3",
          symbol: {
            type: "simple-fill",
            color: [197, 135, 243, 0.4],
            style: "solid",
            outline: {
              color: "white",
              width: 0.1,
            },
          },
        },
        {
          value: "Zone 4",
          symbol: {
            type: "simple-fill",
            color: [0, 168, 132, 0.4],
            style: "solid",
            outline: {
              color: "white",
              width: 0.1,
            },
          },
        },
        {
          value: "Zone 5",
          symbol: {
            type: "simple-fill",
            color: [16, 51, 222, 0.4],
            style: "solid",
            outline: {
              color: "white",
              width: 0.1,
            },
          },
        },
        {
          value: "Zone 6",
          symbol: {
            type: "simple-fill",
            color: [199, 255, 11, 0.4],
            style: "solid",
            outline: {
              color: "white",
              width: 0.1,
            },
          },
        },
      ],
    };

    layers.zones.renderer = rendererCheck;
    layers.zones.selection = false
    layers.zones.visible = true

    if (!view.map.layers.includes(layers.zones)) {
      view.map.add(layers.zones);
    }

    /* return () => {
     if (layers.pop_boundary && !layers.pop_boundary && view.map) {
       // Only remove, don't destroy (unregisterLayer handles destroy)
       view.map.remove(layers.pop_boundary);
     }
    } */
    
  }, [layers.zones]); // Added dependencies for stability

 

  return null;
}
