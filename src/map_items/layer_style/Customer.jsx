import React, { useEffect, useState } from "react";
import { useArcGIS } from "../../context/MapContext";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import Graphic from "@arcgis/core/Graphic";
import CustomContent from "@arcgis/core/popup/content/CustomContent";
import FieldsContent from "@arcgis/core/popup/content/FieldsContent";
import PopupTemplate from "@arcgis/core/PopupTemplate";
import { Realtime } from "../../../url";

// Import Images
import imgZero from "../../assets/images/zero.png";
import imgOne from "../../assets/images/one.png";
import imgTwo from "../../assets/images/two.png";
import imgTwo1 from "../../assets/images/two_1.png";
import imgThree from "../../assets/images/three.png";
import imgFour from "../../assets/images/four.png";

export default function Customer() {
  const { layers, view, setPopupFeature, popupFeature } = useArcGIS();

  useEffect(() => {
    if (!view || !layers.Customers_test) return;

    const customerLayer = layers.Customers_test;
  
    // --- 1. RENDERER SETUP ---
    const date = new Date();
    date.setDate(date.getDate() - 7);
    const complete_date = date.toISOString().split("T")[0];

    // Added $feature.perceived_severity and updated the When conditions for state 4
    const valueExpression = `
      var name = $feature.alarmstate;
      var cat = $feature.service_tier;
      var week = $feature.lastdowntime;
      var severity = Lower($feature.perceived_severity); // Normalized to lowercase to handle any casing gaps
      
      When(
        name == 0 && cat == 'VIP', 'zero',
        name == 1 && cat == 'VIP', 'one',
        name == 2 && cat == 'VIP' && week >= '${complete_date}', 'two',
        name == 2 && cat == 'VIP' && week <= '${complete_date}', 'two_1',
        name == 3 && cat == 'VIP', 'three',
        
        // VIP Alarm 4 breakdowns
        name == 4 && cat == 'VIP' && severity == 'warning', 'four_warning',
        name == 4 && cat == 'VIP', 'four', // Defaults to original asset if minor or other
        
        name == 2 && cat != 'VIP' && week <= '${complete_date}', 'two_1_not_vip',
        name == 2 && cat != 'VIP' && week >= '${complete_date}', '2',
        name == 0 && cat != 'VIP', '0',
        name == 1 && cat != 'VIP', '1',
        name == 3 && cat != 'VIP', '3',
        
        // Ordinary Alarm 4 breakdowns
        name == 4 && cat != 'VIP' && severity == 'warning', '4_warning',
        name == 4 && cat != 'VIP', '4', 
        
        '5' 
      )
    `;

    // Symbol definitions
    const size = "6px";
    const VipOnline = { type: "picture-marker", url: imgZero, width: "17px", height: "17px" };
    const VipPowerOff = { type: "picture-marker", url: imgOne, width: "23px", height: "23px" };
    const VipDownNew = { type: "picture-marker", url: imgTwo, width: "25px", height: "25px" };
    const VipDownLong = { type: "picture-marker", url: imgTwo1, width: "24px", height: "24px" };
    const VipGem = { type: "picture-marker", url: imgThree, width: "21px", height: "21px" };
    const VipLOP = { type: "picture-marker", url: imgFour, width: "20px", height: "20px" };
    
    // New VIP Warning Symbol: You can adjust color mixins or use a distinct image asset here
    const VipLOPWarning = { type: "picture-marker", url: imgFour, width: "23px", height: "23px" }; 

    const mk = (col) => ({ type: "simple-marker", style: "circle", color: col, size: size, outline: { color: [255, 255, 255, 1], width: 0.6 } });

    customerLayer.renderer = new UniqueValueRenderer({
      valueExpression: valueExpression,
      uniqueValueInfos: [
        { value: "zero", symbol: VipOnline, label: "VIP Online" },
        { value: "one", symbol: VipPowerOff, label: "VIP Power Off" },
        { value: "two", symbol: VipDownNew, label: "VIP Linked Down (< 1 week)" },
        { value: "two_1", symbol: VipDownLong, label: "VIP Linked Down (> 1 week)" },
        { value: "three", symbol: VipGem, label: "VIP GEM PAcket Loss" },
        
        // VIP Split Config
        { value: "four", symbol: VipLOP, label: "VIP LOP (Minor)" },
        { value: "four_warning", symbol: VipLOPWarning, label: "VIP LOP (Warning)" }, // Assign a distinct custom symbol if required
        
        { value: "two_1_not_vip", symbol: mk([255, 170, 0]), label: "Linked Down (> 1 week)" },
        { value: "0", symbol: mk("green"), label: "Ordinary Online" },
        { value: "1", symbol: mk("blue"), label: "Ordinary Power Off" },
        { value: "2", symbol: mk("red"), label: "Ordinary Linked Down (< 1 week)" },
        { value: "3", symbol: mk("black"), label: "Ordinary GEM Packet Loss" },
        
        // Ordinary Split Config
        { value: "4", symbol: mk("yellow"), label: "Ordinary LOP (Minor)" },
        { value: "4_warning", symbol: mk([191, 247, 5]), label: "Ordinary LOP (Warning)" }, // e.g., Orange-Red circle symbol
        
        { value: "5", symbol: mk("white"), label: "Unknown" },
      ],
    });

    if (!view.map.layers.includes(customerLayer)) {
      view.map.add(customerLayer);
    }

  }, [layers.Customers_test, view, setPopupFeature]);

  useEffect(() => {
    if (!view) return;
    view.graphics.removeAll(); 

    if (popupFeature) {
      const highlightGraphic = new Graphic({
        geometry: popupFeature.geometry,
        symbol: {
          type: "simple-marker",
          style: "circle",
          color: [0, 255, 255, 0.3], 
          size: "10px", 
          outline: {
            color: [0, 255, 255, 1], 
            width: 1
          }
        }
      });
      view.graphics.add(highlightGraphic);
    }
  }, [popupFeature, view]);

  return null;
}