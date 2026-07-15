import { useEffect, useRef } from "react";
import { useMapView, useLayers, usePopup } from "../../context/MapContext";
import Graphic from "@arcgis/core/Graphic";
import Polygon from "@arcgis/core/geometry/Polygon";
import { api } from "../../../url";

export default function GlobalClickHandler() {
  const { view } = useMapView();
  const { layers, layerView: storedLayerViews, setLayerView } = useLayers();
  const { popupFeature, setPopupFeature, parcelFeature, setParcelFeature } = usePopup();

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

        const featureResult = result.results.find(
          (r) =>
            r.type === "graphic" &&
            r.layer &&
            r.graphic.attributes &&
            r.layer.title !== "zones" &&
            r.layer.title !== "pop_boundary" &&
            r.layer.title !== "Home Parcels"
        );

        //  CASE 1: NORMAL FEATURE FOUND
        if (featureResult) {
          const clickedGraphic = featureResult.graphic;
          clickedGraphic.layer = clickedGraphic.layer || featureResult.layer;

          // Clear parcel
          setParcelFeature(null);
          // view.graphics.removeAll();

          // Set main popup
          setPopupFeature(clickedGraphic);
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
              setPopupFeature(null);
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
            setPopupFeature(null);

            // Draw parcel
            view.graphics.removeAll();
            view.graphics.add(graphic);

            setParcelFeature(graphic);
            return;
          }
        }

        // STEP 3: NOTHING FOUND
        setPopupFeature(null);
        setParcelFeature(null);
        view.graphics.removeAll();

      } catch (error) {
        console.error("Click handling failed:", error);
        setPopupFeature(null);
        setParcelFeature(null);
      }
    };

    const clickHandle = view.on("click", handleMapClick);

    return () => clickHandle.remove();
  }, [view, layers, setPopupFeature, setParcelFeature]);

  useEffect(() => {
    if (view && parcelFeature === null) view.graphics.removeAll();
  }, [parcelFeature, view]);

  // 3. HIGHLIGHT LOGIC
  useEffect(() => {
    if (!view || !popupFeature) return;

    let highlightHandle;
    const layer = popupFeature.layer;

    if (!layer || layer.title === "zones" || layer.title === "pop_boundary") return;

    const performHighlight = async () => {
      try {
        // Try to get from context first
        let targetLayerView = storedLayerViews[layer.title];

        // Fallback: If Context is empty (rare), ask the view directly
        if (!targetLayerView || targetLayerView.destroyed) {
           targetLayerView = await view.whenLayerView(layer);
        }

        if (targetLayerView && !targetLayerView.destroyed) {
          highlightHandle = targetLayerView.highlight(popupFeature);
        }
      } catch (e) {
        console.warn("Highlight skipped", e);
      }
    };

    performHighlight();

    return () => {
      if (highlightHandle) highlightHandle.remove();
    };
  }, [popupFeature, view, storedLayerViews]);

  return null;
}