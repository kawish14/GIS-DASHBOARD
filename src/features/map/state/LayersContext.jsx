import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { isSelectableByDefault } from "./selectableLayers";

/**
 * The operational layers currently on the map, keyed by id.
 *
 * WRITTEN BY  features/map/layers/styles/* -- each style module registers its
 *             own layer on mount and unregisters on unmount, so this map is
 *             always what is actually on screen.
 *             `customerLayerView` is set by features/map/useCustomerLayerLoading.js.
 *             Which layers the selection tool draws from is written by the
 *             layer list (features/map/widgets/layerList/LayerItem.jsx).
 * READ BY     filter widgets (to query and set definitionExpression), the
 *             layer list, RegionStats (featureEffect), GlobalClickHandler,
 *             SelectionWidget (which layers to query).
 *
 * Takes `view` as a prop rather than calling useMapView() so it can tear the
 * registry down when the view goes away -- see MapProvider.jsx.
 */
const LayersContext = createContext(null);

export function LayersProvider({ children, view }) {
  const [layers, setLayers] = useState({});
  const [layerView, setLayerView] = useState({});
  const [customerLayerView, setCustomerLayerView] = useState(null);
  // Only the layers the user has actually changed; everything else falls back
  // to the default above, so a layer added later still behaves predictably.
  const [selectableOverrides, setSelectableOverrides] = useState({});

  const registerLayer = useCallback((id, instance) => {
    setLayers(prev => {
      if (prev[id] === instance) return prev;
      return { ...prev, [id]: instance };
    });
  }, []);

  const unregisterLayer = useCallback((id) => {
    setLayers(prev => {
      const layerInstance = prev[id];
      if (!layerInstance) return prev;
      if (view && view.map) view.map.remove(layerInstance);
      if (!layerInstance.destroyed) layerInstance.destroy();
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [view]);

  const isLayerSelectable = useCallback(
    (title) => selectableOverrides[title] ?? isSelectableByDefault(title),
    [selectableOverrides]
  );

  const setLayerSelectable = useCallback((title, selectable) => {
    setSelectableOverrides(prev => ({ ...prev, [title]: selectable }));
  }, []);

  useEffect(() => {
    if (!view) {
      setLayers({});
      setLayerView({});
      setCustomerLayerView(null);
      setSelectableOverrides({});
    }
  }, [view]);

  const value = useMemo(() => ({
    layers, registerLayer, unregisterLayer,
    layerView, setLayerView,
    customerLayerView, setCustomerLayerView,
    isLayerSelectable, setLayerSelectable,
  }), [
    layers, registerLayer, unregisterLayer, layerView, customerLayerView,
    isLayerSelectable, setLayerSelectable,
  ]);

  return <LayersContext.Provider value={value}>{children}</LayersContext.Provider>;
}

export function useLayers() {
  const ctx = useContext(LayersContext);
  if (!ctx) throw new Error("useLayers must be used inside MapProvider");
  return ctx;
}
