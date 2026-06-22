import { useEffect } from "react";
import { useArcGIS } from "../../context/MapContext";

export default function POPBoundary() {
  const { layers, view } = useArcGIS();

  useEffect(() => {
    if (Object.keys(layers).length === 0 || !layers.Feeder) return;

    // 2. Create dynamic renderer (auto colors)
    generateDynamicRenderer(layers.pop_boundary);

    const popBoundaryLabelClass = {
      symbol: {
        type: "text",
        color: "black",
        haloColor: "white",
        haloSize: 1.2,
        font: {
          family: "sans-serif",
          size: 8,
          weight: "bold",
        },
      },
      labelPlacement: "above-center",
      labelExpressionInfo: {
        expression: "$feature.pop_name",
      }
    };
    layers.pop_boundary.labelingInfo = [popBoundaryLabelClass];
    layers.pop_boundary.labelsVisible = false; // Default to visible, user can toggle off

    layers.pop_boundary.selection = false
    layers.pop_boundary.visible = false

    if (!view.map.layers.includes(layers.pop_boundary)) {
      view.map.add(layers.pop_boundary);
    }

 
    
  }, [layers.pop_boundary, view]); // Added dependencies for stability

  const generateDynamicRenderer = async (layer) => {
    try {
      const query = layer.createQuery();
      query.outFields = ["pop_id", "region"];
      const { features } = await layer.queryFeatures(query);

      // Create a map to quickly look up a POP's region
      const popRegionMap = {};
      features.forEach((f) => {
        popRegionMap[f.attributes.pop_id] = (
          f.attributes.region || "Other"
        ).toLowerCase();
      });

      const popIDs = [...new Set(features.map((f) => f.attributes.pop_id))];

      /* function generateDistinctColor(index, alpha = 0.4) {
        const hue = (index * 137.508) % 360; // golden angle
        console.log(`hsla(${hue}, 70%, 50%, ${alpha})`);
        return `hsla(${hue}, 70%, 50%, ${alpha})`;
      } */

      function getHighContrastColor(popId, index, alpha = 0.6) {
        const region = popRegionMap[popId];
        let h, s, l;

        if (region.includes("south")) {
          // SOUTH: Red/Orange (Hue 0-30)
          h = (0 + index * 137.5) % 360;
          // h = (index * 25) % 40;
          s = 90; // Maximum vividness
          l = 50; // Middle darkness
        } else if (region.includes("north")) {
          // NORTH: Blue (Hue 200-240)
          h = (120 + index * 137.5) % 360;
          // h = 200 + ((index * 20) % 40);
          s = 85;
          l = 45; // Darker than South to increase contrast
        } else if (region.includes("central")) {
          // CENTRAL: Purple (Hue 280-320)
          h = (240 + index * 137.5) % 360;
          // h = 280 + ((index * 20) % 40);
          s = 80;
          l = 60; // Lighter than North to stand out
        } else {
          h = 60; // Yellow for missing data
          s = 50;
          l = 80;
        }

        return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
      }

      const uniqueValueInfos = popIDs.map((id, idx) => ({
        value: id,
        symbol: {
          type: "simple-fill",
          color: getHighContrastColor(id, idx),
          style: "solid",
          outline: { color: "white", width: 1 }, // Thicker outline helps separate regions
        },
      }));

      layer.renderer = {
        type: "unique-value",
        field: "pop_id",
        uniqueValueInfos,
      };
    } catch (err) {
      console.error("Renderer failed:", err);
    }
  };

  return null;
}
