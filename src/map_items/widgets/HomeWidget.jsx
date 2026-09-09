import React, { useContext, useEffect, useRef, useState } from "react";
import Home from "@arcgis/core/widgets/Home.js";
import { useArcGIS } from "../../context/MapContext";

export default function HomeWidget(props) {
    const {view} = useArcGIS()

  useEffect(() => {
    if(!view) return 

    const  homeWidget = new Home({
        view: view,
      });
      
      view.ui.add(homeWidget, "top-left");


    return () => {
      view.ui.remove(homeWidget);
    };
  }, [view]);

  return null;
}