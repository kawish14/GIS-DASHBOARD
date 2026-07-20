import { createContext, useContext, useState, useRef, useEffect, useMemo, useCallback } from "react";

/**
 * Map state is split into four independent contexts instead of one
 * mega-context.
 *
 * WHY: previously every consumer of useArcGIS() re-rendered whenever ANY
 * piece of map state changed. For example, registering a new ArcGIS layer
 * (Customers_test, dc_odb, Vehicles, Feeder, jc, site, longhaul...) created
 * a brand new `layers` object, which re-rendered BOTH LeftSidebar and
 * RightSidebar even though neither one reads `layers` directly. If that
 * re-render landed while Calcite's panel was mid-way through its own
 * open/close CSS transition, the transition would restart/glitch — this is
 * what caused the right sidebar to "flicker" open/closed when the left
 * sidebar was toggled.
 *
 * FIX: split state into slices (view, layers, stats, popup) so a component
 * only re-renders when the slice it actually subscribes to changes.
 */

// ---------------------------------------------------------------------------
// 1. Map / View instance
// ---------------------------------------------------------------------------
const MapViewContext = createContext(null);

function MapViewProvider({ children }) {
  const [view, setView] = useState(null);
  const [map, setMap] = useState(null);

  const value = useMemo(() => ({ view, setView, map, setMap }), [view, map]);

  return <MapViewContext.Provider value={value}>{children}</MapViewContext.Provider>;
}

export function useMapView() {
  const ctx = useContext(MapViewContext);
  if (!ctx) throw new Error("useMapView must be used inside MapProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// 2. Layers (feature layers, layer views, customer layer view)
// ---------------------------------------------------------------------------
const LayersContext = createContext(null);

function LayersProvider({ children, view }) {
  const [layers, setLayers] = useState({});
  const [layerView, setLayerView] = useState({});
  const [customerLayerView, setCustomerLayerView] = useState(null);

  const registerLayer = useCallback((id, instance) => {
    setLayers(prev => {
      // Skip the update entirely if nothing changed, so we don't create a
      // new object identity (and trigger downstream re-renders) for no reason.
      if (prev[id] === instance) return prev;
      return { ...prev, [id]: instance };
    });
  }, []);

  const unregisterLayer = useCallback((id) => {
    setLayers(prev => {
      const layerInstance = prev[id];
      if (!layerInstance) return prev;

      if (view && view.map) {
        view.map.remove(layerInstance);
      }
      if (!layerInstance.destroyed) {
        layerInstance.destroy();
      }

      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [view]);

  // Reset everything when the map view is torn down.
  useEffect(() => {
    if (!view) {
      setLayers({});
      setLayerView({});
      setCustomerLayerView(null);
    }
  }, [view]);

  const value = useMemo(() => ({
    layers, registerLayer, unregisterLayer,
    layerView, setLayerView,
    customerLayerView, setCustomerLayerView,
  }), [layers, registerLayer, unregisterLayer, layerView, customerLayerView]);

  return <LayersContext.Provider value={value}>{children}</LayersContext.Provider>;
}

export function useLayers() {
  const ctx = useContext(LayersContext);
  if (!ctx) throw new Error("useLayers must be used inside MapProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// 3. Realtime stats (alert counts, per-region fault stats)
// ---------------------------------------------------------------------------
const StatsContext = createContext(null);

function StatsProvider({ children }) {
  const [alertCount, setAlertCount] = useState(null);
  const [realtimeStats, setRealtimeStats] = useState(null);

  const value = useMemo(() => ({
    alertCount, setAlertCount,
    realtimeStats, setRealtimeStats,
  }), [alertCount, realtimeStats]);

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}

export function useStats() {
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error("useStats must be used inside MapProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// 4. Popup / selection state (right sidebar details, feature table)
// ---------------------------------------------------------------------------
const PopupContext = createContext(null);

function PopupProvider({ children, view }) {
  // Multi-selection "identify" stack: [{ id, feature, layerTitle, label, highlightHandle }]
  // A raw map click starts a fresh stack (startNewSelection); a link clicked
  // *inside* an already-open popup (Customer -> DC -> POP) appends to the
  // existing stack (pushSelection) instead of replacing it. Each entry owns
  // its own ArcGIS highlight handle, so earlier tabs stay highlighted on the
  // map while later ones are opened.
  const [selectionStack, setSelectionStack] = useState([]);
  const [activeSelectionId, setActiveSelectionId] = useState(null);

  const [parcelFeature, setParcelFeature] = useState(null);
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  // Ephemeral, non-tab highlight -- e.g. DcDetails highlighting every
  // customer under a clicked splitter. Independent of the tab highlights
  // above, so it never clears/is-cleared-by them.
  const highlightHandleRef = useRef(null);
  const idCounter = useRef(0);

  // A genuinely new top-level lookup (raw map click on a new feature).
  // Tears down every existing tab and its highlight, then starts over.
  const startNewSelection = useCallback((feature, opts = {}) => {
    setSelectionStack(prev => {
      prev.forEach(entry => entry.highlightHandle?.remove());
      return [];
    });
    idCounter.current += 1;
    const entry = {
      id: idCounter.current,
      feature,
      layerTitle: feature?.layer?.title,
      label: opts.label || feature?.layer?.title,
      highlightHandle: null,
    };
    setSelectionStack([entry]);
    setActiveSelectionId(entry.id);
    return entry.id;
  }, []);

  // A nested lookup triggered from inside an already-open popup (e.g. the
  // "DC / ODB" link on a customer, or the "POP" link on a DC). Appends a
  // new tab without disturbing any earlier ones.
  const pushSelection = useCallback((feature, opts = {}) => {
    idCounter.current += 1;
    const entry = {
      id: idCounter.current,
      feature,
      layerTitle: feature?.layer?.title,
      label: opts.label || feature?.layer?.title,
      highlightHandle: null,
    };
    setSelectionStack(prev => [...prev, entry]);
    setActiveSelectionId(entry.id);
    return entry.id;
  }, []);

  const setEntryHighlight = useCallback((id, handle) => {
    setSelectionStack(prev => prev.map(e => (e.id === id ? { ...e, highlightHandle: handle } : e)));
  }, []);

  // Patches an existing tab's feature in place (e.g. swapping a thin
  // click-result graphic for the fully-attributed one fetched right after).
  // Does NOT touch the highlight or open a new tab.
  const updateSelectionFeature = useCallback((id, feature) => {
    setSelectionStack(prev => prev.map(e => (
      e.id === id ? { ...e, feature, layerTitle: feature?.layer?.title ?? e.layerTitle } : e
    )));
  }, []);

  // Closes a single tab (e.g. the user hits the "x" on it), removing just
  // that tab's highlight and re-activating the tab behind it, if any.
  const closeSelection = useCallback((id) => {
    setSelectionStack(prev => {
      const target = prev.find(e => e.id === id);
      target?.highlightHandle?.remove();
      const next = prev.filter(e => e.id !== id);
      setActiveSelectionId(current => (
        current !== id ? current : (next.length ? next[next.length - 1].id : null)
      ));
      return next;
    });
  }, []);

  const clearAllSelections = useCallback(() => {
    setSelectionStack(prev => {
      prev.forEach(entry => entry.highlightHandle?.remove());
      return [];
    });
    setActiveSelectionId(null);
  }, []);

  useEffect(() => {
    if (!view) {
      clearAllSelections();
    }
  }, [view, clearAllSelections]);

  const activeSelection = selectionStack.find(e => e.id === activeSelectionId) || null;

  // --- Back-compat shim ---------------------------------------------------
  // Existing detail components (DcDetails, PopDetails, ...) read
  // `popupFeature` off usePopup(). Rather than rewrite every consumer in
  // one shot, popupFeature keeps working: it resolves to the *active* tab's
  // feature. A plain `setPopupFeature(x)` call is treated as "this is a
  // brand-new top-level click" (same as startNewSelection); anything that
  // should append to the stack instead must call `pushSelection` directly.
  const popupFeature = activeSelection?.feature ?? null;
  const setPopupFeature = useCallback((feature) => {
    if (feature === null) {
      clearAllSelections();
      return;
    }
    startNewSelection(feature);
  }, [startNewSelection, clearAllSelections]);

  const value = useMemo(() => ({
    selectionStack, activeSelectionId, activeSelection, setActiveSelectionId,
    startNewSelection, pushSelection, closeSelection, clearAllSelections,
    setEntryHighlight, updateSelectionFeature,
    popupFeature, setPopupFeature,
    parcelFeature, setParcelFeature,
    selectedFeatures, setSelectedFeatures,
    highlightHandleRef,
  }), [
    selectionStack, activeSelectionId, activeSelection,
    startNewSelection, pushSelection, closeSelection, clearAllSelections,
    setEntryHighlight, updateSelectionFeature,
    popupFeature, setPopupFeature,
    parcelFeature, selectedFeatures,
  ]);

  return <PopupContext.Provider value={value}>{children}</PopupContext.Provider>;
}

export function usePopup() {
  const ctx = useContext(PopupContext);
  if (!ctx) throw new Error("usePopup must be used inside MapProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Combined provider — wraps the app once, at the same spot MapProvider used
// to be mounted. No changes needed anywhere MapProvider is rendered.
// ---------------------------------------------------------------------------
function MapViewBridge({ children }) {
  const { view } = useMapView();
  return children(view);
}

export function MapProvider({ children }) {
  return (
    <MapViewProvider>
      <MapViewBridge>
        {(view) => (
          <LayersProvider view={view}>
            <StatsProvider>
              <PopupProvider view={view}>
                {children}
              </PopupProvider>
            </StatsProvider>
          </LayersProvider>
        )}
      </MapViewBridge>
    </MapViewProvider>
  );
}

/**
 * Back-compat hook that composes all four slices. Prefer useMapView() /
 * useLayers() / useStats() / usePopup() directly in new code — any
 * component that uses useArcGIS() will re-render on ANY map-state change,
 * which is exactly the problem this file fixes. Kept only so files outside
 * this review (not shown here) don't break.
 */
export function useArcGIS() {
  return {
    ...useMapView(),
    ...useLayers(),
    ...useStats(),
    ...usePopup(),
  };
}