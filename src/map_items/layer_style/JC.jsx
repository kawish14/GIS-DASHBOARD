import React, { useEffect, useState, useMemo } from "react";
import {
  CalciteBlock,
  CalciteList,
  CalciteListItem,
  CalciteChip,
  CalciteLoader,
  CalciteIcon,
  CalciteNotice,
  CalciteAction,
} from "@esri/calcite-components-react";
import { useArcGIS } from '../../context/MapContext';

export default function JC() {
  const { view, layers } = useArcGIS();
  useEffect(() => {
    if (!view || !layers || !layers.jc) return;

    const wf_status = "$feature.wf_status";

    const valueExpression = `When (${wf_status} == 0 , 'Status-AsBuilt' ,${wf_status} == 1 , 'Status-Design','none')`;

    var rendererCheck = {
      type: "unique-value", // autocasts as new UniqueValueRenderer()
      valueExpression: valueExpression,
      uniqueValueInfos: [
        /************************  As Built Network ***********************/
        {
          value: "Status-AsBuilt", //02F AsBuilt
          symbol: {
            type: "picture-marker",
            url: "images/jc1.png",
            width: "20px",
            height: "20px",
          },
        },
        /************************  Design Network ***********************/
        {
          value: "Status-Design", //02F Design
          symbol: {
            type: "picture-marker",
            url: "images/JC.png",
            width: "20px",
            height: "20px",
          },
        },
      ],
    };

    layers.jc.selection = false;
    layers.jc.visible = false;
    layers.jc.renderer = rendererCheck;

    if (!view.map.layers.includes(layers.jc)) {
      view.map.add(layers.jc);
    }
  }, [view, layers.jc]);
}
