import { useEffect, useRef } from "react";
import esriConfig from "@arcgis/core/config";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import WMTSLayer from "@arcgis/core/layers/WMTSLayer";
import GroupLayer from "@arcgis/core/layers/GroupLayer";
import { useArcGIS } from "../../context/MapContext";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../../url";

import DC from "../layer_style/DC";
import Feeder from "../layer_style/Feeder";
import POPBoundary from "../layer_style/POPBoundary";
import Customer from "../layer_style/Customer";
import Zone from "../layer_style/Zone";
import POP from "../layer_style/POP";
import FAT from "../layer_style/FAT";
import JC from "../layer_style/JC";
import Distribution from "../layer_style/Distribution";
import TWA_Sites from "../layer_style/TWA_Sites";
import Longhaul from "../layer_style/Longhaul";

esriConfig.request.timeout = 300000;

export default function Layers(props) {
  const layerAddedRef = useRef(false);
  const { view, registerLayer, unregisterLayer } = useArcGIS();
  const { layerNames, user } = useAuth();

  useEffect(() => {
    if (!view || layerNames.length === 0) return;

    // Create an array to track layers created in THIS effect run
    const createdLayers = [];
    const collectedParcels = [];

    layerNames.forEach((layerName) => {
      
      // 1. Skip Client-Side Layers
      if (layerName === "Vehicles") return;

      const nameParts = layerName.split(":");
      const workspace = nameParts.length > 1 ? nameParts[0] : "web_app";
      const cleanTitle = nameParts.length > 1 ? nameParts[1] : layerName;

      // ==========================================
      // 🎯 WMTS PARCEL INTERCEPT
      // ==========================================
      if (layerName.toLowerCase().includes("parcel_evw")) {
        
        let displayTitle = "Parcels";
        if (layerName === "South_PostGIS:parcel_evw") displayTitle = "South Parcels";
        else if (layerName === "Central_Postgis:parcel_evw") displayTitle = "Central Parcels";
        else if (layerName === "North_Postgis:parcel_evw") displayTitle = "North Parcels";

        const wmtsLayer = new WMTSLayer({
          url: api + "/geoserver/gwc/service/wmts",
          title: displayTitle,
          activeLayer: {
            id: layerName,
            tileMatrixSetId: "EPSG:900913",
            format: "image/png",
            style: "default",
          },
          opacity: 0.8,
          minScale: 577791,
          maxScale: 1127,
          visible: true, // ⚠️ Must be true to show on map!
        });

        view.map.add(wmtsLayer);
        
        // Register it as "South Parcels" so LayerListSidebar finds it!
        collectedParcels.push(wmtsLayer);

      /*   createdLayers.push({ id: displayTitle, instance: wmtsLayer });
        registerLayer(displayTitle, wmtsLayer); */
        
        return; // 🛑 EXIT early so it doesn't run your GeoJSON logic below
      }

      // ==========================================
      // YOUR ORIGINAL GEOJSON LOGIC (Untouched!)
      // ==========================================
      let filterPredicate = "";
      
      if (workspace !== "twa") {
        const regions = user.permissions.regions;
        const regionFilter = regions.map((r) => `'${r}'`).join(",");
        filterPredicate = `region IN (${regionFilter})`;

        if (cleanTitle === "Customers_test") {
           filterPredicate += ` AND alarmstate IN (1,2,3,4)`;
        }
      }

      const params = {
        service: "WFS",
        version: "2.0.0",
        request: "GetFeature",
        typeName: layerName,
        outputFormat: "application/json",
      };

      if (filterPredicate !== "") {
        params.CQL_FILTER = filterPredicate;
      }

      const layers = new GeoJSONLayer({
        url: `${api}/geoserver/${workspace}/ows`,
        customParameters: params,
        title: cleanTitle,
        outFields: ["*"],
        editingEnabled: true, 
        objectIdField: "objectid",
        popupEnabled: false,
        visible: true
      });

      layers.when(() => {
        // ArcGIS geometry types: point, polyline, polygon
        if (layers.geometryType === "point") {
          view.map.reorder(layers, view.map.layers.length); // Bring to front
        } else if (layers.geometryType === "polygon") {
          view.map.reorder(layers, 0); // Send to back
        } else if (layers.geometryType === "polyline") {
          // Find how many polygons are there to sit above them
          const polyCount = view.map.layers.filter(l => l.geometryType === "polygon").length;
          view.map.reorder(layers, polyCount); 
        }
      });
      
      // Add to our local tracker and the global context
      createdLayers.push({ id: cleanTitle, instance: layers });
      registerLayer(cleanTitle, layers);

    });

    if (collectedParcels.length > 0) {
      const homeParcelsGroup = new GroupLayer({
        title: "Home Parcels",
        layers: collectedParcels,
        visibilityMode: "independent", // Allows turning children on/off individually if your UI supports it
        visible: false
      });

      // Add the master group to the map (which adds all children automatically)
      view.map.add(homeParcelsGroup, 0); // Put it at the bottom (index 0)

      // Register ONLY the group layer in your context
      createdLayers.push({ id: "Home Parcels", instance: homeParcelsGroup });
      registerLayer("Home Parcels", homeParcelsGroup);

    }
      
    return () => {
      // Cleanup specifically what we created in this cycle
      createdLayers.forEach(({ id }) => {
        unregisterLayer(id);
      });
    };
  }, [view, user.permissions.regions, layerNames]);

  return (
    <div>
      <DC />
      <Feeder />
      <POPBoundary />
      <Customer />
      <Zone />
      <POP />
      <FAT />
      <JC />
      <Distribution />
      <TWA_Sites />
      <Longhaul />
    </div>
  );
}