import React, { useEffect, useRef } from "react";
import { useArcGIS } from "../../context/MapContext";
import { useAuth } from "../../context/AuthContext";
import { escapeForCql } from "../../constants/faultCodes";
import Search from "@arcgis/core/widgets/Search";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import { api } from "../../../url";

// Hits GeoServer directly -- NOT the loaded Customers_test layer -- so this
// is completely independent of whatever CQL_FILTER TopBar's fault dropdown
// has written into customerLayer.customParameters. That's the whole point:
// the map can be showing only alarmstate IN (1,2,3,4) while search still
// finds every customer.
const WFS_URL = `${api}/geoserver/web_app/ows`;
const TYPE_NAME = "web_app:Customers_test";
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

function buildCql(query, regions) {
  const escaped = escapeForCql(query);
  // "id" is quoted because bare `id` is a reserved token in GeoServer's ECQL
  // grammar (the feature-id filter keyword, e.g. `id IN ('fid.1')`) -- using
  // it unquoted as a normal attribute in a comparison fails to parse.
  const textFilter = `(name ILIKE '%${escaped}%' OR "id" ILIKE '%${escaped}%')`;

  // Region scoping is a permissions boundary, not a UX filter -- keep it
  // even though alarmstate is intentionally dropped. Remove this if search
  // is meant to cross regions too.
  if (!regions || regions.length === 0) return textFilter;
  const regionFilter = `region IN (${regions.map((r) => `'${escapeForCql(r)}'`).join(",")})`;
  return `${regionFilter} AND ${textFilter}`;
}

async function fetchCustomerMatches(query, regions, maxResults, signal, isExactId = false, properties = null) {
  
  let cql = isExactId 
    ? `id = '${escapeForCql(query)}'` 
    : buildCql(query, regions);

  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName: TYPE_NAME,
    outputFormat: "application/json",
    CQL_FILTER: cql,
    maxFeatures: String(maxResults),
  });

  if (properties) {
    params.append("propertyName", properties.join(","));
  }

  const res = await fetch(`${WFS_URL}?${params.toString()}`, { signal });
  const raw = await res.text();

  // GeoServer returns exceptions as an XML ServiceExceptionReport even when
  // outputFormat=application/json was requested -- surface the real message
  // instead of letting JSON.parse fail with an opaque "Unexpected token '<'".
  if (raw.trimStart().startsWith("<")) {
    const message = raw.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/)?.[1]?.trim();
    throw new Error(`GeoServer rejected the request: ${message ?? raw.slice(0, 300)}`);
  }

  if (!res.ok) throw new Error(`WFS customer search failed: ${res.status} - ${raw.slice(0, 300)}`);

  const geojson = JSON.parse(raw);
  return geojson.features ?? [];
}

// WFS GeoJSON comes back in EPSG:4326 (GeoServer default) -- MapView
// reprojects on the fly for display/goTo, so we don't need a server-side
// srsName param, just a correctly-tagged spatialReference on the Point.
//
// `layer` is attached (not just geometry/attributes) because RightSidebar's
// renderFeatureDetails() dispatches which detail panel to show purely off
// popupFeature.layer?.title -- without it this graphic looks like it came
// from nowhere and falls through to its "No renderer found" default, which
// is why customer details weren't opening from search results.
function wfsFeatureToGraphic(feature, layer) {
  const [x, y] = feature.geometry.coordinates;
  const graphic = new Graphic({
    geometry: new Point({ x, y, spatialReference: { wkid: 4326 } }),
    attributes: feature.properties,
  });
  if (layer) graphic.layer = layer;
  return graphic;
}

export default function SearchWidget() {
  const { view, layers, setPopupFeature } = useArcGIS();
  const { user } = useAuth();
  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!view || !searchRef.current || !layers?.Customers_test) return;

    const regions = user?.permissions?.regions;

    // Debounced + abortable fetch shared by getSuggestions and getResults,
    // so a fast typist doesn't pile up out-of-order WFS requests.
    const runQuery = (query, maxResults) =>
      new Promise((resolve, reject) => {
        clearTimeout(debounceRef.current);
        if (abortRef.current) abortRef.current.abort();

        debounceRef.current = setTimeout(async () => {
          const controller = new AbortController();
          abortRef.current = controller;
          try {
            const features = await fetchCustomerMatches(query, regions, maxResults, controller.signal);
            resolve(features);
          } catch (err) {
            if (err.name === "AbortError") resolve([]); // superseded by a newer keystroke
            else reject(err);
          }
        }, DEBOUNCE_MS);
      });

    const customerSource = {
      name: "Customers",
      placeholder: "Customer Name or ID",
      autoNavigate: false,
      resultSymbol: {
        type: "simple-marker",
        style: "circle",
        color: [0, 255, 255, 0.6],
        size: "10px",
        outline: { color: [255, 255, 255, 1], width: 1 },
      },

      getSuggestions: async (params) => {
        const query = params.suggestTerm?.trim();
        if (!query || query.length < MIN_QUERY_LENGTH) return [];

        try {
          // FAST SUGGESTIONS: Only request ID and Name, exclude geometry
          const controller = new AbortController(); // Manage aborts locally if needed
          const features = await fetchCustomerMatches(
            query, 
            regions, 
            6, 
            controller.signal, 
            false, // Not an exact ID search yet
            ["id", "name"] // <--- KEY CHANGE: ONLY return these two fields
          );
          
          return features.map((f) => ({
            key: String(f.properties.id), // Use ID as the unique key
            text: `${f.properties.name ?? "Unknown"} (${f.properties.id})`,
            sourceIndex: params.sourceIndex,
          }));
        } catch (err) {
          console.error("Customer suggestion failed:", err);
          return [];
        }
      },

      getResults: async (params) => {
        // If they clicked a suggestion, we can extract the exact ID
        const selectedId = params.suggestResult ? params.suggestResult.key : null;
        
        // If they just hit enter on a typed word, fall back to the text search
        const query = params.suggestResult?.text ?? params.searchTerm ?? "";
        if (!query) return [];

        try {
          let features;
          const controller = new AbortController();

          if (selectedId) {
            // FAST RESULT: Direct exact match on ID, pull EVERYTHING (geometry + all fields)
            features = await fetchCustomerMatches(selectedId, regions, 1, controller.signal, true, null);
          } else {
            // SLOW RESULT (Fallback): User hit Enter without clicking a suggestion
            features = await fetchCustomerMatches(query, regions, 6, controller.signal, false, null);
          }

          return features.map((f) => {
            const graphic = wfsFeatureToGraphic(f, layers.Customers_test);
            return {
              extent: null,
              feature: graphic,
              name: graphic.attributes.name ?? String(graphic.attributes.id),
              target: graphic,
            };
          });
        } catch (err) {
          console.error("Customer result failed:", err);
          return [];
        }
      },
    };

    const searchSources = [customerSource];

    // Vehicles stay layer-backed and unaffected -- they're client-side only
    // and were never subject to the alarmstate filter to begin with.
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
      includeDefaultSources: false, // was implicitly relying on the loaded layer; now explicit-only
      locationEnabled: false,
      popupEnabled: false,
      resultGraphicEnabled: true,
      searchAllEnabled: true,
      sources: searchSources,
    });

    const handleSelectResult = (event) => {
      if (event && event.result && event.result.feature) {
        const feature = event.result.feature;

        setPopupFeature(feature);

        view.goTo({
          target: feature.geometry,
          zoom: 18,
        }, {
          duration: 1000,
          easing: "ease-in-out",
        }).catch((err) => {
          if (err.name !== "AbortError") {
            console.error("Zoom failed: ", err);
          }
        });
      }
    };

    searchWidget.on("select-result", handleSelectResult);

    return () => {
      clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
      if (searchWidget) {
        searchWidget.destroy();
      }
    };
    // Re-run if layers change (Vehicles source) or the user's region
    // permissions change (affects the CQL region scope baked into the
    // closures above).
  }, [view, layers, user?.permissions?.regions]);

  return (
    <div
      ref={searchRef}
      style={{ width: "100%", padding: "10px", backgroundColor: "var(--calcite-ui-foreground-1)" }}
    />
  );
}