import React, { useEffect, useRef } from "react";
import { useArcGIS } from "../../context/MapContext";
import { useAuth } from "../../context/AuthContext";
import { escapeForCql } from "../../constants/faultCodes";
import Search from "@arcgis/core/widgets/Search";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import { api } from "../../../url";

const WFS_URL = `${api}/geoserver/web_app/ows`;
const TYPE_NAME = "web_app:Customers_test";
const MIN_QUERY_LENGTH = 2;

// 1. WFS GeoServer Helper Functions (Used ONLY for final Search Results)
function buildCql(query, regions, isExactId = false) {
  const escaped = escapeForCql(query);
  
  let textFilter;
  if (isExactId) {
    textFilter = `"id" = '${escaped}'`;
  } else {
    textFilter = `(name ILIKE '%${escaped}%' OR "id" ILIKE '%${escaped}%')`;
  }

  if (!regions || regions.length === 0) return textFilter;
  const regionFilter = `region IN (${regions.map((r) => `'${escapeForCql(r)}'`).join(",")})`;
  return `${regionFilter} AND ${textFilter}`;
}

async function fetchCustomerMatches(query, regions, maxResults, signal, isExactId = false) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName: TYPE_NAME,
    outputFormat: "application/json",
    CQL_FILTER: buildCql(query, regions, isExactId),
    maxFeatures: String(maxResults),
  });

  const res = await fetch(`${WFS_URL}?${params.toString()}`, { signal });
  const raw = await res.text();

  if (raw.trimStart().startsWith("<")) {
    const message = raw.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/)?.[1]?.trim();
    throw new Error(`GeoServer rejected the request: ${message ?? raw.slice(0, 300)}`);
  }

  if (!res.ok) throw new Error(`WFS customer search failed: ${res.status} - ${raw.slice(0, 300)}`);

  const geojson = JSON.parse(raw);
  return geojson.features ?? [];
}

function wfsFeatureToGraphic(feature, layer) {
  const [x, y] = feature.geometry.coordinates;
  const graphic = new Graphic({
    geometry: new Point({ x, y, spatialReference: { wkid: 4326 } }),
    attributes: feature.properties,
  });
  if (layer) graphic.layer = layer;
  return graphic;
}

// 2. Coordinate Parser for Pakistan Bounds
function parsePakistanCoordinates(term) {
  if (!term) return null;
  
  // Match two decimals separated by comma or space
  const match = term.trim().match(/^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const val1 = parseFloat(match[1]);
  const val2 = parseFloat(match[2]);

  // Pakistan Bounding Box Limits
  const minX = 60.21045739023996, maxX = 79.83892959654857; // Longitude Bounds
  const minY = 23.41658411683776, maxY = 37.22858483518223; // Latitude Bounds

  const isLon = (v) => v >= minX && v <= maxX;
  const isLat = (v) => v >= minY && v <= maxY;

  // Auto-detect based on ranges
  if (isLat(val1) && isLon(val2)) {
    return { lat: val1, lon: val2 };
  } else if (isLon(val1) && isLat(val2)) {
    return { lat: val2, lon: val1 };
  }
  
  return null; // Out of bounds
}

// ==========================================
// 3. PROMINENT SEARCH MARKER (drop pin + rotating locator ring)
// ------------------------------------------
// Replaces the washed-out light-blue default result graphic of the
// ArcGIS Search widget with a high-contrast animated pin drawn on a
// dedicated GraphicsLayer that always sits on top of the map.
// Everything is vector (SVG paths) + screen-size units, so the marker
// keeps the exact same pixel size at every zoom level.
// ==========================================
const MARKER_LAYER_TITLE = "Search_Result_Marker";

// Accent colour per search source (keeps results visually distinguishable)
const SOURCE_ACCENTS = {
  Customers: [255, 106, 0],                    // orange
  "Coordinates (Pakistan Only)": [230, 36, 36], // red
  "Live Vehicles": [124, 77, 255],              // violet
};
const DEFAULT_ACCENT = [255, 106, 0];

const PIN_SIZE = 20;                 // px height of the teardrop pin
const PIN_BASE_OFFSET = PIN_SIZE / 2;      // lifts the pin so its tip touches the point
const PIN_DOT_OFFSET = PIN_SIZE / 2 + PIN_SIZE / 6; // centre of the pin head
const RING_SIZE = 20;                // px diameter of the rotating locator ring
const DROP_HEIGHT = 15;              // px the pin falls from on drop-in
const DROP_DURATION = 500;           // ms
const PULSE_PERIOD = 1600;           // ms per pulse ring cycle
const RING_SPEED = 90;               // degrees / second

// Classic teardrop pin in a 24 x 24 box: tip at (12, 24), head centre at (12, 8)
const PIN_PATH = "M12 0C7.58 0 4 3.58 4 8c0 6 8 16 8 16s8-10 8-16c0-4.42-3.58-8-8-8z";

// Four arc segments 90 degrees apart -> symmetric bounding box, so the
// symbol spins around its true centre without any wobble.
function arcSegment(cx, cy, rOuter, rInner, startDeg, endDeg) {
  const pt = (r, deg) => {
    const a = (deg * Math.PI) / 180;
    return [(cx + r * Math.cos(a)).toFixed(2), (cy + r * Math.sin(a)).toFixed(2)];
  };
  const [x1, y1] = pt(rOuter, startDeg);
  const [x2, y2] = pt(rOuter, endDeg);
  const [x3, y3] = pt(rInner, endDeg);
  const [x4, y4] = pt(rInner, startDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M${x1} ${y1}A${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}Z`;
}

function buildRingPath(segments = 4, sweep = 58, rOuter = 48, rInner = 39) {
  const step = 360 / segments;
  let d = "";
  for (let i = 0; i < segments; i += 1) {
    d += arcSegment(50, 50, rOuter, rInner, i * step, i * step + sweep);
  }
  return d;
}
const RING_PATH = buildRingPath();

const easeOutBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// Search results can be points, polygons or extents - always mark a point.
function toMarkerPoint(geometry) {
  if (!geometry) return null;
  if (geometry.type === "point") return geometry;
  return geometry.centroid ?? geometry.extent?.center ?? null;
}

export default function SearchWidget() {
  const { view, layers, setPopupFeature } = useArcGIS();
  const { user } = useAuth();
  const searchRef = useRef(null);
  const abortRef = useRef(null);
  const markerLayerRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (!view || !searchRef.current || !layers?.Customers_test) return;

    const regions = user?.permissions?.regions;

    // ==========================================
    // SEARCH MARKER CONTROLLER
    // ==========================================
    const ensureMarkerLayer = () => {
      if (!markerLayerRef.current || markerLayerRef.current.destroyed) {
        markerLayerRef.current = new GraphicsLayer({
          title: MARKER_LAYER_TITLE,
          listMode: "hide",
          legendEnabled: false,
        });
        view.map.add(markerLayerRef.current);
      }
      // Keep the marker above every operational layer added after us
      const layerIndex = view.map.layers.indexOf(markerLayerRef.current);
      if (layerIndex > -1 && layerIndex !== view.map.layers.length - 1) {
        view.map.reorder(markerLayerRef.current, view.map.layers.length - 1);
      }
      return markerLayerRef.current;
    };

    const stopMarkerAnimation = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const clearSearchMarker = () => {
      stopMarkerAnimation();
      if (markerLayerRef.current && !markerLayerRef.current.destroyed) {
        markerLayerRef.current.removeAll();
      }
    };

    const showSearchMarker = (geometry, sourceName) => {
      const point = toMarkerPoint(geometry);
      if (!point) return;

      const accent = SOURCE_ACCENTS[sourceName] ?? DEFAULT_ACCENT;
      const markerLayer = ensureMarkerLayer();
      clearSearchMarker();

      // a. Expanding pulse ring (draws the eye to the location)
      const pulse = new Graphic({
        geometry: point,
        symbol: {
          type: "simple-marker",
          style: "circle",
          color: [0, 0, 0, 0],
          size: 20,
          outline: { color: [...accent, 0.85], width: 2.5 },
        },
      });

      // b. Rotating locator ring
      const ring = new Graphic({
        geometry: point,
        symbol: {
          type: "simple-marker",
          style: "path",
          path: RING_PATH,
          color: [...accent, 0.95],
          size: RING_SIZE,
          angle: 0,
          outline: { color: [255, 255, 255, 0.9], width: 0.5 },
        },
      });

      // c. Exact-location anchor dot (stays put while the pin bobs)
      const anchor = new Graphic({
        geometry: point,
        symbol: {
          type: "simple-marker",
          style: "circle",
          color: [255, 255, 255, 1],
          size: 7,
          outline: { color: [...accent, 1], width: 2 },
        },
      });

      // d. The pin itself + its white head dot
      const pin = new Graphic({
        geometry: point,
        symbol: {
          type: "simple-marker",
          style: "path",
          path: PIN_PATH,
          color: [...accent, 1],
          size: PIN_SIZE,
          yoffset: PIN_BASE_OFFSET,
          outline: { color: [255, 255, 255, 1], width: 1.5 },
        },
      });

      const pinDot = new Graphic({
        geometry: point,
        symbol: {
          type: "simple-marker",
          style: "circle",
          color: [255, 255, 255, 1],
          size: PIN_SIZE * 0.3,
          yoffset: PIN_DOT_OFFSET,
          outline: { color: [0, 0, 0, 0.15], width: 0.5 },
        },
      });

      // Draw order: bottom -> top
      markerLayer.addMany([pulse, ring, anchor, pin, pinDot]);

      let startTs = null;
      const animate = (ts) => {
        if (markerLayer.destroyed || markerLayer.graphics.length === 0) {
          animationFrameRef.current = null;
          return;
        }
        if (startTs === null) startTs = ts;
        const elapsed = ts - startTs;

        // Rotating ring
        const ringSymbol = ring.symbol.clone();
        ringSymbol.angle = ((elapsed / 1000) * RING_SPEED) % 360;
        ring.symbol = ringSymbol;

        // Pulse: grows outwards while fading away
        const cycle = (elapsed % PULSE_PERIOD) / PULSE_PERIOD;
        const pulseSymbol = pulse.symbol.clone();
        pulseSymbol.size = 20 + cycle * 52;
        pulseSymbol.outline.color = [...accent, 0.85 * (1 - cycle)];
        pulse.symbol = pulseSymbol;

        // Pin: drops in once, then bobs gently so it never reads as static
        const dropProgress = elapsed < DROP_DURATION ? easeOutBack(elapsed / DROP_DURATION) : 1;
        const lift = (1 - dropProgress) * DROP_HEIGHT;
        const bob = elapsed < DROP_DURATION ? 0 : Math.sin((elapsed - DROP_DURATION) / 700) * 1.5;

        const pinSymbol = pin.symbol.clone();
        pinSymbol.yoffset = PIN_BASE_OFFSET + lift + bob;
        pin.symbol = pinSymbol;

        const pinDotSymbol = pinDot.symbol.clone();
        pinDotSymbol.yoffset = PIN_DOT_OFFSET + lift + bob;
        pinDot.symbol = pinDotSymbol;

        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // ==========================================
    // SOURCE 1: CUSTOMER SEARCH
    // ==========================================
    const customerSource = {
      name: "Customers",
      placeholder: "Customer Name or ID",
      autoNavigate: false,
      getSuggestions: async (params) => {
        const term = params.suggestTerm?.trim();
        if (!term || term.length < MIN_QUERY_LENGTH) return [];

        try {
          const safeTerm = term.replace(/'/g, "''");
          const query = layers.Customers_test.createQuery();
          
          query.where = `name LIKE '%${safeTerm}%' OR CAST(id AS VARCHAR(255)) LIKE '%${safeTerm}%'`;
          query.returnGeometry = false;
          query.outFields = ["id", "name"];
          query.num = 6; 
          
          const results = await layers.Customers_test.queryFeatures(query);
          
          return results.features.map((f) => ({
            key: String(f.attributes.id),
            text: `${f.attributes.name ?? "Unknown"} (${f.attributes.id})`,
            sourceIndex: params.sourceIndex,
          }));
        } catch (err) {
          console.error("Local layer suggestion failed:", err);
          return [];
        }
      },
      getResults: async (params) => {
        const selectedId = params.suggestResult ? params.suggestResult.key : null;
        const queryTerm = params.suggestResult?.text ?? params.searchTerm ?? "";
        if (!queryTerm) return [];

        try {
          if (abortRef.current) abortRef.current.abort();
          const controller = new AbortController();
          abortRef.current = controller;

          let features;
          if (selectedId) {
            features = await fetchCustomerMatches(selectedId, regions, 1, controller.signal, true);
          } else {
            features = await fetchCustomerMatches(queryTerm, regions, 6, controller.signal, false);
          }

          return features.map((f) => {
            const graphic = wfsFeatureToGraphic(f, layers.Customers_test);
            return {
              feature: graphic,
              name: graphic.attributes.name ?? String(graphic.attributes.id),
              target: graphic,
            };
          });
        } catch (err) {
          if (err.name !== "AbortError") console.error("GeoServer result failed:", err);
          return [];
        }
      },
    };

    // ==========================================
    // SOURCE 2: PAKISTAN COORDINATE SEARCH
    // ==========================================
    const coordinateSource = {
      name: "Coordinates (Pakistan Only)",
      placeholder: "Lat, Lon or Lon, Lat",
      autoNavigate: false, 
      getSuggestions: async (params) => {
        const coords = parsePakistanCoordinates(params.suggestTerm);
        if (!coords) return [];

        return [{
          key: `${coords.lat},${coords.lon}`,
          text: `Coordinate: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`,
          sourceIndex: params.sourceIndex,
        }];
      },
      getResults: async (params) => {
        let coords;

        if (params.suggestResult?.key) {
          const [latStr, lonStr] = params.suggestResult.key.split(",");
          coords = { lat: parseFloat(latStr), lon: parseFloat(lonStr) };
        } else {
          coords = parsePakistanCoordinates(params.searchTerm);
        }

        if (!coords) return [];

        const pointGraphic = new Graphic({
          geometry: new Point({ x: coords.lon, y: coords.lat, spatialReference: { wkid: 4326 } }),
          attributes: { 
            name: `Location: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`,
            lat: coords.lat,
            lon: coords.lon
          }
        });
        
        // Add a mock layer title so the RightSidebar knows which component to render
        pointGraphic.layer = { title: "CoordinateSearch" };

        return [{
          feature: pointGraphic,
          name: `Location: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`,
          target: pointGraphic
        }];
      }
    };

    const searchSources = [customerSource, coordinateSource];

    // ==========================================
    // SOURCE 3: VEHICLES
    // ==========================================
    const vehicleLayer = layers.Vehicles;
    if (vehicleLayer) {
      searchSources.push({
        layer: vehicleLayer,
        searchFields: ["reg_no", "vehicle_model"],
        displayField: "reg_no",
        exactMatch: false,
        outFields: ["*"],
        name: "Live Vehicles",
        placeholder: "Search Vehicles...",
        maxResults: 4,
        maxSuggestions: 4,
        suggestionsEnabled: true,
        minSuggestCharacters: 2,
      });
    }

    const searchWidget = new Search({
      view: view,
      container: searchRef.current,
      includeDefaultSources: false, 
      locationEnabled: false, 
      popupEnabled: false,
      // Off on purpose: the widget's own pale blue result graphic is replaced
      // by the animated pin drawn on Search_Result_Marker (see showSearchMarker).
      resultGraphicEnabled: false,
      searchAllEnabled: true,
      sources: searchSources,
    });

    const handleSelectResult = (event) => {
      if (event && event.result && event.result.feature) {
        const feature = event.result.feature;
        
        // ALLOW the popup to trigger now that we have a CoordinateSearch component
        setPopupFeature(feature);

        // Drop the prominent pin on the hit
        showSearchMarker(feature.geometry, event.source?.name);

        view.goTo({
          target: feature.geometry,
          zoom: 18,
        }, {
          duration: 1000,
          easing: "ease-in-out",
        }).catch((err) => {
          if (err.name !== "AbortError") console.error("Zoom failed: ", err);
        });
      }
    };

    const handleCoordinateEnter = (event) => {
      if (event.key !== "Enter") return;

      const term = event.target?.value || searchWidget.searchTerm;
      const coords = parsePakistanCoordinates(term);
      if (!coords) return;

      event.preventDefault();
      event.stopPropagation();

      const pointGraphic = new Graphic({
        geometry: new Point({
          x: coords.lon,
          y: coords.lat,
          spatialReference: { wkid: 4326 },
        }),
        attributes: {
          name: `Location: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`,
          lat: coords.lat,
          lon: coords.lon,
        },
      });
      pointGraphic.layer = { title: "CoordinateSearch" };
      setPopupFeature(pointGraphic);

      showSearchMarker(pointGraphic.geometry, "Coordinates (Pakistan Only)");

      view.goTo({ target: pointGraphic.geometry, zoom: 18 }, {
        duration: 1000,
        easing: "ease-in-out",
      }).catch((err) => {
        if (err.name !== "AbortError") console.error("Coordinate zoom failed: ", err);
      });
    };

    searchRef.current.addEventListener("keydown", handleCoordinateEnter, true);
    const selectHandle = searchWidget.on("select-result", handleSelectResult);
    const clearHandle = searchWidget.on("search-clear", clearSearchMarker);

    return () => {
      if (abortRef.current) abortRef.current.abort();
      searchRef.current?.removeEventListener("keydown", handleCoordinateEnter, true);
      selectHandle?.remove();
      clearHandle?.remove();
      stopMarkerAnimation();
      if (markerLayerRef.current) {
        view.map?.remove(markerLayerRef.current);
        if (!markerLayerRef.current.destroyed) markerLayerRef.current.destroy();
        markerLayerRef.current = null;
      }
      if (searchWidget) searchWidget.destroy();
    };
  }, [view, layers, user?.permissions?.regions, setPopupFeature]);

  return (
    <div
      ref={searchRef}
      style={{ width: "100%", padding: "10px", backgroundColor: "var(--calcite-ui-foreground-1)" }}
    />
  );
}
