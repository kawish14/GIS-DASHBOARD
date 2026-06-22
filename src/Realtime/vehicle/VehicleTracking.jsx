import React, { useEffect, useRef } from "react";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Graphic from "@arcgis/core/Graphic";
import { socket } from "../socket";
import { useArcGIS } from "../../context/MapContext";
import { useAuth } from "../../context/AuthContext";

// --- PRO RENDERER: Define styles once, dynamically applied by the API ---
const vehicleRenderer = {
  type: "unique-value",
  field: "symbol_key",
  defaultSymbol: {
    type: "picture-marker",
    url: "images/tracking/Car_ON.png",
    width: "17px",
    height: "17px",
  },
  uniqueValueInfos: [
    { value: "Truck_OFF", symbol: { type: "picture-marker", url: "images/tracking/Truck_OFF.png", width: "17px", height: "17px" } },
    { value: "Truck_ON", symbol: { type: "picture-marker", url: "images/tracking/Truck_ON.png", width: "17px", height: "17px" } },
    { value: "Hiace_OFF", symbol: { type: "picture-marker", url: "images/tracking/Hiace_OFF.png", width: "17px", height: "17px" } },
    { value: "Hiace_ON", symbol: { type: "picture-marker", url: "images/tracking/Hiace_ON.png", width: "17px", height: "17px" } },
    { value: "Bolan_OFF", symbol: { type: "picture-marker", url: "images/tracking/Bolan_OFF.png", width: "17px", height: "17px" } },
    { value: "Bolan_ON", symbol: { type: "picture-marker", url: "images/tracking/Bolan_ON.png", width: "17px", height: "17px" } },
    { value: "Car_OFF", symbol: { type: "picture-marker", url: "images/tracking/Car_OFF.png", width: "17px", height: "17px" } },
    { value: "Car_ON", symbol: { type: "picture-marker", url: "images/tracking/Car_ON.png", width: "17px", height: "17px" } },
  ],
};

export default function VehicleTracking() {
  const { view, registerLayer, unregisterLayer } = useArcGIS();
  const {layerNames} = useAuth();

  // Track assigned ObjectIDs for fast updates
  const vehicleIndex = useRef(new Map());
  let oidCounter = useRef(1);
  const layerRef = useRef(null);

  useEffect(() => {

    if (!view || !layerNames.includes("Vehicles")) return;

    // 1. Create a highly optimized Client-Side Feature Layer
    const vehicleLayer = new FeatureLayer({
      title: "Vehicles",
      objectIdField: "OBJECTID",
      geometryType: "point",
      spatialReference: { wkid: 4326 },
      source: [], // Starts empty
      outFields: ["*"],
      renderer: vehicleRenderer,
      visible: true,

      fields: [
        { name: "OBJECTID", type: "oid" },
        { name: "reg_no", type: "string" },
        { name: "VehicleState", type: "string" },
        { name: "vehicle_model", type: "string" },
        { name: "vehicle_make", type: "string" },
        { name: "symbol_key", type: "string" },
      ],
 
    });

    const vehLabelClass = {
      symbol: {
        type: "text",
        color: "white",
        haloColor: "black", // Adds a black outline so it's readable over maps
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
        expression: `$feature.reg_no` 
      }
    };

    vehicleLayer.labelingInfo = [vehLabelClass];
    vehicleLayer.labelsVisible = false; // Keep default false, let the user toggle it

    view.map.add(vehicleLayer);
    layerRef.current = vehicleLayer;
    
    // Register to context so the SearchWidget can find it!
    registerLayer("Vehicles", vehicleLayer);

    // 2. Listen to Socket and Batch Updates
    socket.on("tracking", (data) => {
      console.log("Received tracking data:", data);
      const updates = [];
      const adds = [];

      data.forEach((e) => {
        // Classify the vehicle cleanly
        const isParked = e.vehicleState === "Parked";
        const stateSuffix = isParked ? "_OFF" : "_ON";
        let type = "Car"; // Default

        const heavy = ["TRUCK", "SHEHZORE", "FOTON", "CARRIER", "FORLAND", "MEGA CARRY"];
        const vans = ["HIACE"];
        const pickups = ["BOLAN", "RAVI"];

        if (heavy.includes(e.model)) type = "Truck";
        else if (vans.includes(e.model)) type = "Hiace";
        else if (pickups.includes(e.model)) type = "Bolan";

        const attributes = {
          reg_no: e.registrationNo,
          VehicleState: e.vehicleState,
          vehicle_model: e.model,
          vehicle_make: e.make,
          symbol_key: `${type}${stateSuffix}`, // Tells the renderer which icon to use
        };

        const geometry = {
          type: "point",
          longitude: e.longitude,
          latitude: e.latitude,
        };

        // If vehicle exists, update it. If new, add it.
        if (vehicleIndex.current.has(e.registrationNo)) {
          attributes.OBJECTID = vehicleIndex.current.get(e.registrationNo);
          updates.push(new Graphic({ geometry, attributes }));
        } else {
          const newOid = oidCounter.current++;
          attributes.OBJECTID = newOid;
          vehicleIndex.current.set(e.registrationNo, newOid);
          adds.push(new Graphic({ geometry, attributes }));
        }
      });

      // Apply all changes to the GPU at once (High Performance)
      vehicleLayer.applyEdits({ addFeatures: adds, updateFeatures: updates });
    });

    return () => {
      socket.off("tracking");
      if (layerRef.current) {
        if (view && view.map) {
          view.map.remove(layerRef.current);
        }
        unregisterLayer("Vehicles");
      }
    };
  }, [view]);

  return null;
}