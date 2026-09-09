import { useEffect } from "react";
import esriConfig from "@arcgis/core/config";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import WMTSLayer from "@arcgis/core/layers/WMTSLayer";
import WMSLayer from "@arcgis/core/layers/WMSLayer";
import GroupLayer from "@arcgis/core/layers/GroupLayer";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";

import { useLayers, useMapView } from "../../context/MapContext";
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

esriConfig.request.timeout = 300000; // 5 min — GeoServer WFS requests can be slow for large regions

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Layers that only ever exist client-side (e.g. live vehicle markers) and
// have no matching GeoServer layer — skip them entirely below.
const CLIENT_SIDE_LAYERS = ["Vehicles"];

// GeoServer layer name -> friendly display title for the parcel WMTS group.
const PARCEL_DISPLAY_TITLES = {
  "South_PostGIS:parcel_evw": "South Parcels",
  "Central_Postgis:parcel_evw": "Central Parcels",
  "North_Postgis:parcel_evw": "North Parcels",
};

// ---------------------------------------------------------------------------
// Layer-name parsing & filtering
// ---------------------------------------------------------------------------

/** Splits "workspace:layer" into its parts; bare names default to the "web_app" workspace. */
function parseLayerName(layerName) {
  const [first, second] = layerName.split(":");
  const hasWorkspace = second !== undefined;
  return {
    workspace: hasWorkspace ? first : "web_app",
    title: hasWorkspace ? second : layerName,
  };
}

/** Builds the CQL_FILTER for a GeoJSONLayer from the user's region permissions. */
function buildRegionFilter({ workspace, title, regions }) {
  if (workspace === "twa") return "";

  const regionList = regions.map((r) => `'${r}'`).join(",");
  let filter = `region IN (${regionList})`;

  if (title === "Customers_test") {
    filter += " AND alarmstate IN (1,2,3,4)";
  }
  return filter;
}

// ---------------------------------------------------------------------------
// Layer factories
// ---------------------------------------------------------------------------

function createParcelWmtsLayer(layerName) {
  return new WMTSLayer({
    url: `${api}/geoserver/gwc/service/wmts`,
    serviceMode: "KVP", // GeoServer GWC serves KVP, not REST-style capabilities docs
    title: PARCEL_DISPLAY_TITLES[layerName] ?? "Parcels",
    activeLayer: {
      id: layerName,
      tileMatrixSetId: "EPSG:900913",
      format: "image/png",
      style: "default",
    },
    opacity: 0.8,
    minScale: 577791,
    maxScale: 1127,
    visible: true,
  });
}

function createLandcoverWmsLayer() {
  return new WMSLayer({
    url: `${api}/geoserver/web_app/wms`,
    title: "Landcover Base",
    opacity: 0.8,
    listMode: "hide", // hidden from the layer-list UI; visibility is driven programmatically
    sublayers: [
      {
        name: "web_app:landcover_evw",
        title: "Landcover (Imagery)",
        visible: false, // starts hidden — synced to "Home Parcels" visibility, see below
      },
    ],
  });
}

function createGeoJsonLayer({ workspace, layerName, title, filter }) {
  const params = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: layerName,
    outputFormat: "application/json",
  };
  if (filter) params.CQL_FILTER = filter;

  return new GeoJSONLayer({
    url: `${api}/geoserver/${workspace}/ows`,
    customParameters: params,
    title,
    outFields: ["*"],
    editingEnabled: true,
    objectIdField: "objectid",
    popupEnabled: false,
    visible: true,
  });
}

/** Sends a freshly-loaded GeoJSONLayer to the right position in the draw stack. */
function reorderByGeometry(view, layer) {
  layer.when(() => {
    if (layer.geometryType === "point") {
      view.map.reorder(layer, view.map.layers.length); // points on top
    } else if (layer.geometryType === "polygon") {
      view.map.reorder(layer, 0); // polygons at the bottom
    } else if (layer.geometryType === "polyline") {
      const polygonCount = view.map.layers.filter((l) => l.geometryType === "polygon").length;
      view.map.reorder(layer, polygonCount); // lines sit just above polygons
    }
  });
}

/**
 * Keeps the landcover imagery visible if and only if the "Home Parcels"
 * group is visible. WMSLayer visibility has two independent levels — the
 * layer itself AND each sublayer — so both must be toggled together or the
 * imagery silently never renders.
 */
function syncLandcoverToParcelsVisibility(parcelsGroup, landcoverLayer) {
  const landcoverSublayer = landcoverLayer.sublayers.getItemAt(0);

  return reactiveUtils.watch(
    () => parcelsGroup.visible,
    (isVisible) => {
      landcoverLayer.visible = isVisible;
      if (landcoverSublayer) landcoverSublayer.visible = isVisible;
    },
    { initial: true }
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Layers() {
  const { view } = useMapView();
  const { registerLayer, unregisterLayer } = useLayers();
  const { layerNames, user } = useAuth();

  useEffect(() => {
    if (!view || layerNames.length === 0) return;
    if (!user.permissions.regions || user.permissions.regions.length === 0) return; // wait for real region permissions
    

    const createdLayerIds = [];
    const parcelLayers = [];
    let landcoverLayer = null;
    let landcoverWatchHandle = null;

    layerNames.forEach((layerName) => {
      if (CLIENT_SIDE_LAYERS.includes(layerName)) return;

      const lowerName = layerName.toLowerCase();
      const { workspace, title } = parseLayerName(layerName);

      // Parcel tiles are collected now and grouped into "Home Parcels" below,
      // rather than being registered individually.
      if (lowerName.includes("parcel_evw")) {
        const wmtsLayer = createParcelWmtsLayer(layerName);
        view.map.add(wmtsLayer);
        parcelLayers.push(wmtsLayer);
        return;
      }

      // Landcover imagery is created here but only registered once we know
      // whether a parcel group exists to sync its visibility against.
      if (lowerName.includes("landcover_evw")) {
        landcoverLayer = createLandcoverWmsLayer();
        view.map.add(landcoverLayer, 0); // bottom of the draw stack
        return;
      }

      const filter = buildRegionFilter({ workspace, title, regions: user.permissions.regions });
      const geoJsonLayer = createGeoJsonLayer({ workspace, layerName, title, filter });
      reorderByGeometry(view, geoJsonLayer);

      createdLayerIds.push(title);
      registerLayer(title, geoJsonLayer);
    });

    if (parcelLayers.length > 0) {
      const homeParcelsGroup = new GroupLayer({
        title: "Home Parcels",
        layers: parcelLayers,
        visibilityMode: "independent", // lets individual regions be toggled if the UI supports it
        visible: false,
      });
      view.map.add(homeParcelsGroup, 0);

      createdLayerIds.push("Home Parcels");
      registerLayer("Home Parcels", homeParcelsGroup);

      if (landcoverLayer) {
        landcoverWatchHandle = syncLandcoverToParcelsVisibility(homeParcelsGroup, landcoverLayer);
      }
    }

    return () => {
      createdLayerIds.forEach((id) => unregisterLayer(id));
      landcoverWatchHandle?.remove();
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