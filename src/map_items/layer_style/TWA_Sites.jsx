import React, { useEffect, useState } from "react";
import { useArcGIS } from "../../context/MapContext";

export default function TWA_Site() {
    const { layers, view } = useArcGIS();

    useEffect(() => {
        if (Object.keys(layers).length === 0 || !layers.site) return; 

          
      let siteLabelClass = {
        symbol: {
          type: "text",
          color: "white",
          haloColor: "black",
          haloSize: 1.2,
          font: {
            family: "sans-serif", //"Playfair Display",
            size: 9,
            weight: "bold",
          },
        },
        labelPlacement: "above-center",
        labelExpressionInfo: {
          expression: `$feature.site_name`,
        },
      };

      const site_type = "$feature.site_type";

      const valueExpression = `When (${site_type} == 'OLA' , 'OLA' ,${site_type} == 'ADM' , 'ADM','none')`;

       var rendererCheck = {
         type: "unique-value", // autocasts as new UniqueValueRenderer()
         valueExpression: valueExpression,
         uniqueValueInfos: [
           /************************  As Built Network ***********************/
           {
             value: "OLA",
             symbol: {
               type: "picture-marker",
               url: "images/OLA.png",
               width: "20px",
               height: "20px",
             },
           },
           /************************  Design Network ***********************/
           {
             value: "ADM",
             symbol: {
               type: "picture-marker",
               url: "images/ADM.png",
               width: "21px",
               height: "21px",
             },
           },
         ],
       };

        layers.site.visible = false
        layers.site.renderer = rendererCheck;
        layers.site.labelingInfo = [siteLabelClass];
        layers.site.labelsVisible = false;

        if (!view.map.layers.includes(layers.site)) {
           //alert("Adding TWA Sites Layer to the map");
            view.map.add(layers.site);
           // console.log("TWA Sites layer added to the map", layers.site);
        }

    }, [layers.site, view]);

    return null
}