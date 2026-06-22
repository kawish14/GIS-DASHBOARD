import React, { useEffect, useState } from "react";
import { useArcGIS } from "../../context/MapContext";

export default function Longhaul() {
    const { layers, view } = useArcGIS();

    useEffect(() => {
        if (Object.keys(layers).length === 0 || !layers.longhaul) return;
        const region = "$feature.fiber_type";

    const valueExpression = `When( ${region} == 'G.652-D', 'G.652-D', 
    ${region} == 'G.652', 'G.652', 'other' )`;

     var rendererCheck = {
      type: "unique-value", // autocasts as new UniqueValueRenderer()
      valueExpression: valueExpression,
      uniqueValueInfos: [
        {
          value: "G.652-D", //02F AsBuilt
          symbol: {
            type: "simple-line",
            color: "blue",
            width: "3px",
            style: "solid",
          },
        },
        {
          value: "G.652", // 04F AsBuilt
          symbol: {
            type: "simple-line",
            color: "red",
            width: "3px",
            style: "solid",
          },
        },
        {
          value: "other", // 04F AsBuilt
          symbol: {
            type: "simple-line",
            color: "black",
            width: "3px",
            style: "solid",
          },
        },
      ],
    };

    layers.longhaul.renderer = rendererCheck;
    layers.longhaul.visible = false

     if (!view.map.layers.includes(layers.longhaul)){
        view.map.add(layers.longhaul);
     }
     

    }, [layers, view]);

    return null;
}