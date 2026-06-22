import { useEffect } from "react";
import { useArcGIS } from '../../context/MapContext';


export default function FAT() {
  const { layers, view } = useArcGIS();

  useEffect(() => {

    if (Object.keys(layers).length === 0 || !layers.fat) return;  

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
            url: "images/pink_fat.png",
            width: "17px",
            height: "17px",
          },
        },
        /************************  Design Network ***********************/
        {
          value: "Status-Design", //02F Design
          symbol: {
            type: "picture-marker",
            url: "images/black_fat.png",
            width: "13px",
            height: "13px",
          },
        },
      ],
    };

    const popupTemplate = {
      title: "Distribution Cabinet (DC)",
      content: [
        {
          type: "fields", // Display data in a table format
          fieldInfos: [
            { fieldName: "id", label: "ID" },
            { fieldName: "dc_id", label: "ID" },
            { fieldName: "pop_id", label: "POP ID" },
            { fieldName: "name", label: "Name" },
            { fieldName: "splitter", label: "Splitter" },
            { fieldName: "area", label: "Area" },
            { fieldName: "sub_area", label: "Sub Area" },
            { fieldName: "city", label: "City" },
          ]
        }
      ]
    };
    
    layers.fat.selection = false
    layers.fat.visible = false
    layers.fat.renderer = rendererCheck;
    layers.fat.popupTemplate = popupTemplate;

    if (!view.map.layers.includes(layers.fat)) {
      view.map.add(layers.fat);
    }


  }, [layers.fat, view]); // Added dependencies for stability

  return null;
}