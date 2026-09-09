import { useEffect, useRef } from "react";
import { useLayers } from "../state/LayersContext";
import { useMapView } from "../state/MapViewContext";
import { useSelection } from "../state/SelectionContext";
import Graphic from "@arcgis/core/Graphic";
import Polygon from "@arcgis/core/geometry/Polygon";
import { api } from "../../../shared/config/runtimeConfig";

export default function GlobalClickHandler() {
  const { view } = useMapView();
  const { layers, layerView: storedLayerViews, setLayerView } = useLayers();
  const {
    selectionStack, setEntryHighlight,
    startNewSelection, clearAllSelections,
    parcelFeature, setParcelFeature,
  } = useSelection();

  // Guards the async hit-test against out-of-order responses (user clicks
  // twice in quick succession before the first hitTest resolves).
  const clickIdRef = useRef(0);

  // 1. REGISTER ALL LAYER VIEWS
  // This listens for new layers and saves their views to context
  useEffect(() => {
    if (!view || !layers) return;

    let isMounted = true;

    const registerAll = async () => {
      const allLayers = Object.values(layers);

      for (const layer of allLayers) {
        // Skip if we already have a VALID view in context
        // We check 'destroyed' to ensure we don't keep stale objects after re-login
        const existingView = storedLayerViews[layer.title];
        if (existingView && !existingView.destroyed) continue;

        try {
          // Wait for the layer view to be created on the NEW map
          const lv = await view.whenLayerView(layer);

          if (isMounted && lv) {
            setLayerView(prev => ({ ...prev, [layer.title]: lv }));
          }
        } catch (error) {
          // Silent catch: harmless race condition during logout
        }
      }
    };

    if (view.ready) {
      registerAll();
    } else {
      // If view is still loading (common on login), wait for it
      const handle = view.watch("ready", (isReady) => {
        if (isReady && isMounted) registerAll();
      });
      return () => handle.remove();
    }

    return () => { isMounted = false; };
  }, [view, layers, storedLayerViews, setLayerView]);

  // 2. CLICK HANDLER (Standard HitTest)
  useEffect(() => {
    if (!view) return;

    const handleMapClick = async (event) => {
      const currentClick = ++clickIdRef.current;
      try {
        // STEP 1: HIT TEST (PRIORITY)
        const result = await view.hitTest(event);

        if (currentClick !== clickIdRef.current) return;

        // Every graphic under the cursor, not just the top one. Points sit on
        // top of each other all the time -- several customers at one premises,
        // a DC dropped on its POP -- and taking only the first hit meant the
        // sidebar silently described whichever one happened to draw last,
        // with no sign the others existed. hitTest already returns them all,
        // ordered top-most first; the sidebar pages through them.
        const hits = result.results.filter(
          (r) =>
            r.type === "graphic" &&
            r.layer &&
            r.graphic.attributes &&
            r.layer.title !== "zones" &&
            r.layer.title !== "pop_boundary" &&
            r.layer.title !== "Home Parcels"
        );

        //  CASE 1: NORMAL FEATURE(S) FOUND
        if (hits.length > 0) {
          const seen = new Set();
          const candidates = [];

          for (const hit of hits) {
            const graphic = hit.graphic;
            graphic.layer = graphic.layer || hit.layer;

            // One feature can be hit twice (overlapping symbol parts, or a
            // layer drawn in more than one pass), which would show up as a
            // duplicate page. Object id within its layer identifies it;
            // graphics without one -- client-side markers, cluster
            // aggregates -- fall back to the uid ArcGIS assigns them.
            const objIdField = graphic.layer?.objectIdField || "__OBJECTID";
            const objectId = graphic.attributes?.[objIdField];
            const key =
              objectId !== undefined && objectId !== null
                ? `${graphic.layer?.title ?? ""}::${objectId}`
                : `uid::${graphic.uid ?? candidates.length}`;

            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push(graphic);
          }

          // Clear parcel
          setParcelFeature(null);
          // view.graphics.removeAll();

          // A raw click on the map is a brand-new top-level lookup -- start
          // a fresh identify stack (this clears any previously-open tabs
          // and their highlights). Nested lookups from *inside* a popup use
          // useSelection().pushSelection() instead, so they append rather than
          // replace -- see DcDetails/CustomerDetails link handlers.
          startNewSelection(candidates[0], { candidates });
          return;
        }

        // STEP 2: PARCEL FALLBACK
        if (layers["Home Parcels"]?.visible) {
          const { latitude, longitude } = event.mapPoint;

          const pointWKT = `SRID=4326;POINT(${longitude} ${latitude})`;
          const cql = `INTERSECTS(shape, ${pointWKT})`;

          const url = `${api}/geoserver/web_app/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=web_app:parcel_search&outputFormat=application/json&srsName=EPSG:4326&CQL_FILTER=${encodeURIComponent(cql)}&maxFeatures=1`;

          const response = await fetch(url);

          // 2.1 Check the Content-Type header
          const contentType = response.headers.get("content-type");

          if (contentType && contentType.includes("xml")) {
              // If it's XML, read it as text so we can see the exact GeoServer Exception
              const xmlText = await response.text();
              console.error("GeoServer returned XML instead of JSON. Exception Report:", xmlText);

              // Abort this click handler gracefully
              clearAllSelections();
              setParcelFeature(null);
              return;
          }

          // 2.2 Check for HTTP errors (400, 500)
          if (!response.ok) {
             console.error("GeoServer HTTP Error:", response.status, response.statusText);
             return;
          }

          const data = await response.json();

          if (data.features?.length > 0) {
            const parcel = data.features[0];

            const polygon = new Polygon({
              rings: parcel.geometry.coordinates[0],
              spatialReference: { wkid: 4326 },
            });

            const graphic = new Graphic({
              geometry: polygon,
              symbol: {
                type: "simple-fill",
                color: [98, 240, 255, 0.5],
                outline: { color: [0, 230, 255], width: 2.5 },
              },
              attributes: {
                ...parcel.properties,
                customLayerTitle: "Parcel",
              },
            });

            // Clear feature popup
            clearAllSelections();

            // Draw parcel
            view.graphics.removeAll();
            view.graphics.add(graphic);

            setParcelFeature(graphic);
            return;
          }
        }

        // STEP 3: NOTHING FOUND
        clearAllSelections();
        setParcelFeature(null);
        view.graphics.removeAll();

      } catch (error) {
        console.error("Click handling failed:", error);
        clearAllSelections();
        setParcelFeature(null);
      }
    };

    const clickHandle = view.on("click", handleMapClick);

    return () => clickHandle.remove();
  }, [view, layers, startNewSelection, clearAllSelections, setParcelFeature]);

  useEffect(() => {
    if (view && parcelFeature === null) view.graphics.removeAll();
  }, [parcelFeature, view]);

  // 3. HIGHLIGHT LOGIC
  // Walks the whole identify stack and highlights any entry that doesn't
  // have a highlight handle yet. Entries that are already highlighted are
  // left untouched -- this is what keeps DC's highlight alive on the map
  // while the user drills into POP. Removal is owned by PopupProvider
  // (closeSelection / clearAllSelections), not here.
  useEffect(() => {
    if (!view) return;

    selectionStack.forEach(async (entry) => {
      if (entry.highlightHandle) return;

      const layer = entry.feature?.layer;
      if (!layer || layer.title === "zones" || layer.title === "pop_boundary") return;

      try {
        let targetLayerView = storedLayerViews[layer.title];

        if (!targetLayerView || targetLayerView.destroyed) {
          targetLayerView = await view.whenLayerView(layer);
        }

        if (targetLayerView && !targetLayerView.destroyed) {
          const handle = targetLayerView.highlight(entry.feature);
          setEntryHighlight(entry.id, handle);
        }
      } catch (e) {
        console.warn("Highlight skipped", e);
      }
    });
  }, [selectionStack, view, storedLayerViews, setEntryHighlight]);

  return null;
}