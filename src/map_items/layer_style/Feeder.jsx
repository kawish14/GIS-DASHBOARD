import { useEffect } from "react";
import { useArcGIS } from '../../context/MapContext';

export default function Feeder() {
  const { layers, view } = useArcGIS();

  useEffect(() => {

    if (Object.keys(layers).length === 0 || !layers.Feeder) return 

    const wf_status = "$feature.wf_status";
    const capacity = "$feature.capacity";

    const valueExpression = `When( ${wf_status} == 0 && ${capacity} == '02F', '02F-As Built', ${wf_status} == 0 && ${capacity} == '04F', '04F-As Built',
            ${wf_status} == 0 && ${capacity} == '12F', '12F-As Built', ${wf_status} == 0 && ${capacity} == '24F', '24F-As Built', 
            ${wf_status} == 0 && ${capacity} == '48F', '48F-As Built', 
            ${wf_status} == 0 && ${capacity} == '96F', '96F-As Built', ${wf_status} == 0 && ${capacity} == '144F', '144F-As Built',
            ${wf_status} == 0 && ${capacity} == '72F', '72F-As Built', 
            ${wf_status} == 0 && ${capacity} == '288F', '288F-As Built',

            ${wf_status} != 0 && ${capacity} == '02F', '02F-Design', ${wf_status} != 0 && ${capacity} == '04F', '04F-Design',
            ${wf_status} != 0 && ${capacity} == '12F', '12F-Design', ${wf_status} != 0 && ${capacity} == '24F', '24F-Design', 
            ${wf_status} != 0 && ${capacity} == '48F', '48F-Design', 
            ${wf_status} != 0 && ${capacity} == '72F', '72F-Design', ${wf_status} != 0 && ${capacity} == '288F', '288F-Design', 
            ${wf_status} != 0 && ${capacity} == '96F', '96F-Design', ${wf_status} != 0 && ${capacity} == '144F', '144F-Design',14)`;

    var rendererCheck = {
      type: "unique-value", // autocasts as new UniqueValueRenderer()
      valueExpression: valueExpression,
      uniqueValueInfos: [
        /************************  As Built Network ***********************/
        {
          value: "02F-As Built", //02F AsBuilt
          symbol: {
            type: "simple-line", // autocasts as new SimpleFillSymbol()
            color: {
              r: 46,
              g: 117,
              b: 182,
            },
            width: "1.5px",
          },
        },
        {
          value: "04F-As Built", // 04F AsBuilt
          symbol: {
            type: "simple-line", // autocasts as new SimpleFillSymbol()
            color: {
              r: 255,
              g: 165,
              b: 0,
            },
            width: "1.5px",
          },
        },
        {
          value: "12F-As Built", // 12F AsBuilt
          symbol: {
            type: "simple-line", // autocasts as new SimpleFillSymbol()
            color: {
              r: 0,
              g: 176,
              b: 80,
            },
            width: "1.5px",
          },
        },
        {
          value: "24F-As Built", // 24F AsBuilt
          symbol: {
            type: "simple-line", // autocasts as new SimpleFillSymbol()
            color: {
              r: 150,
              g: 75,
              b: 0,
            },
            width: "2px",
          },
        },
        {
          value: "48F-As Built", // 48F AsBuilt
          symbol: {
            type: "simple-line", // autocasts as new SimpleFillSymbol()
            color: {
              r: 255,
              g: 0,
              b: 0,
            },
            width: "2.5px",
          },
        }, 
         {
          value: "72F-As Built", // 96F AsBuilt
          symbol: {
            type: "simple-line", // autocasts as new SimpleFillSymbol()
            color: {
              r: 188,
              g: 0,
              b: 195,
            },
            width: "3.5px",
          },
        },
        {
          value: "96F-As Built", // 96F AsBuilt
          symbol: {
            type: "simple-line", // autocasts as new SimpleFillSymbol()
            color: {
              r: 0,
              g: 0,
              b: 0,
            },
            width: "3.5px",
          },
        },
        {
          value: "144F-As Built", // 144F AsBuilt
          symbol: {
            type: "simple-line", // autocasts as new SimpleFillSymbol()
            color: {
              r: 255,
              g: 255,
              b: 0,
            },
            width: "4px",
          },
        },
        {
          value: "288F-As Built", // 144F AsBuilt
          symbol: {
            type: "simple-line", // autocasts as new SimpleFillSymbol()
            color: {
              r: 0,
              g: 0,
              b: 245,
            },
            width: "4px",
          },
        },
        
        /************************  Design Network ***********************/

        {
          value: "02F-Design", //02F Design
          symbol: {
            type: "simple-line",
            style: "short-dot",
            color: {
              r: 46,
              g: 117,
              b: 182,
            },
            width: "1.5px",
          },
        },
        {
          value: "04F-Design", // 04F Design
          symbol: {
            type: "simple-line",
            style: "short-dot",
            color: {
              r: 255,
              g: 165,
              b: 0,
            },
            width: "1.5px",
          },
        },
        {
          value: "12F-Design", // 12F Design
          symbol: {
            type: "simple-line",
            style: "short-dot",
            color: {
              r: 0,
              g: 176,
              b: 80,
            },
            width: "1.5px",
          },
        },
        {
          value: "24F-Design", // 24F Design
          symbol: {
            type: "simple-line",
            style: "short-dot",
            color: {
              r: 150,
              g: 75,
              b: 0,
            },
            width: "2px",
          },
        },
        {
          value: "48F-Design", // 48F Design
          symbol: {
            type: "simple-line",
            style: "short-dot",
            color: {
              r: 255,
              g: 0,
              b: 0,
            },
            width: "2.5px",
          },
        },
        {
          value: "72F-Design", // 96F AsBuilt
          symbol: {
            type: "simple-line", // autocasts as new SimpleFillSymbol()
            style: "short-dot",
            color: {
              r: 188,
              g: 0,
              b: 195,
            },
            width: "3.5px",
          },
        },
        {
          value: "96F-Design", // 96F Design
          symbol: {
            type: "simple-line",
            style: "short-dot",
            color: {
              r: 0,
              g: 0,
              b: 0,
            },
            width: "3.5px",
          },
        },
        {
          value: "144F-Design", // 144F Design
          symbol: {
            type: "simple-line",
            style: "short-dot",
            color: {
              r: 255,
              g: 255,
              b: 0,
            },
            width: "4px",
          },
        },
        {
          value: "288F-Design", // 144F AsBuilt
          symbol: {
            type: "simple-line", // autocasts as new SimpleFillSymbol()
            color: {
              r: 0,
              g: 0,
              b: 245,
            },
            width: "4px",
          },
        },
      ],
    };

    const popupTemplate = {
      title: "Feeder Cable",
      content: [
        {
          type: "fields", // Display data in a table format
          fieldInfos: [
            { fieldName: "capacity", label: "Capacity" },
            { fieldName: "pop_id", label: "POP ID" },
            { fieldName: "placement", label: "Placement" },
            { fieldName: "network", label: "Network" },
            { fieldName: "type", label: "Type" },
            { fieldName: "town", label: "Town" },
            { fieldName: "city", label: "City" }
          ]
        }
      ]
    };

    layers.Feeder.selection = false
    layers.Feeder.visible = false
    layers.Feeder.renderer = rendererCheck;
    layers.Feeder.popupTemplate = popupTemplate;

    if (!view.map.layers.includes(layers.Feeder)) {
      view.map.add(layers.Feeder);
    }

   /*   return () => {
     if (layers.Feeder && !layers.Feeder && view.map) {
       // Only remove, don't destroy (unregisterLayer handles destroy)
       view.map.remove(layers.Feeder);
     }
     
  }; */

  }, [layers.Feeder, view]); // Added dependencies for stability

  return null;
}