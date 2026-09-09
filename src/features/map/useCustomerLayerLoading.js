import { useEffect, useState } from "react";
import { useLayers } from "./state/LayersContext";
import { useMapView } from "./state/MapViewContext";

// The customer layer is the one every other feature waits on: alarm stats,
// the fault dropdown and most filters all query it. Give up waiting after this
// long so a layer that never arrives doesn't leave the map masked forever.
const MAX_WAIT_MS = 5000;
const CHECK_INTERVAL_MS = 200;

/**
 * Waits for the customer layer's layer view and reports whether it is still
 * drawing. Used by features/map/MapCanvas.jsx to dim the map while it settles.
 *
 * Side effect worth knowing about: this is also the only place that populates
 * `customerLayerView` in LayersContext, which the filter widgets and
 * RegionStats need in order to apply client-side filters and feature effects.
 *
 * This used to live in DashboardPage, which then passed the flag back down to
 * the map as a prop -- shell state that only the map ever read, derived from
 * map internals the shell had no other reason to know about.
 */
export function useCustomerLayerLoading() {
  const { view } = useMapView();
  const { layers, setCustomerLayerView } = useLayers();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!view) return undefined;
    setIsLoading(true);

    let elapsedTime = 0;
    let watcherHandle = null;

    const intervalId = setInterval(() => {
      if (layers.Customers_test) {
        clearInterval(intervalId);
        view
          .whenLayerView(layers.Customers_test)
          .then((layerView) => {
            setCustomerLayerView(layerView);
            watcherHandle = layerView.watch("updating", (isUpdating) => {
              if (isUpdating) return;
              setIsLoading(false);
              watcherHandle?.remove();
              watcherHandle = null;
            });
          })
          .catch(() => setIsLoading(false));
      }
      elapsedTime += CHECK_INTERVAL_MS;
      if (elapsedTime >= MAX_WAIT_MS) {
        clearInterval(intervalId);
        setIsLoading(false);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      watcherHandle?.remove();
    };
  }, [view, layers.Customers_test, setCustomerLayerView]);

  return isLoading;
}
