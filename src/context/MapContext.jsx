import { createContext, useContext, useState, useRef, useEffect, useMemo, useCallback } from "react";

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

const LayersContext = createContext(null);
function LayersProvider({ children, view }) {
  const [layers, setLayers] = useState({});
  const [layerView, setLayerView] = useState({});
  const [customerLayerView, setCustomerLayerView] = useState(null);

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

const StatsContext = createContext(null);
function StatsProvider({ children }) {
  const [alertCount, setAlertCount] = useState(null);
  const [realtimeStats, setRealtimeStats] = useState(null);
  const value = useMemo(() => ({ alertCount, setAlertCount, realtimeStats, setRealtimeStats }), [alertCount, realtimeStats]);
  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}
export function useStats() {
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error("useStats must be used inside MapProvider");
  return ctx;
}

const PopupContext = createContext(null);
function PopupProvider({ children, view }) {
  const [selectionStack, setSelectionStack] = useState([]);
  const [activeSelectionId, setActiveSelectionId] = useState(null);
  const [parcelFeature, setParcelFeature] = useState(null);
  const [tableData, setTableData] = useState({});
  const highlightHandleRef = useRef(null);
  const idCounter = useRef(0);

  // --- CHANGED: Now saves filterParams and forces isVisible: true ---
  const addTableData = useCallback((widgetId, label, features, columns, filterParams = null) => {
    setTableData(prev => ({
      ...prev,
      [widgetId]: { features, columns, label, filterParams, isVisible: true }
    }));
  }, []);

  // --- NEW: Toggle visibility without deleting data ---
  const setTableVisibility = useCallback((widgetId, isVisible) => {
    setTableData(prev => {
      if (!prev[widgetId]) return prev;
      return { ...prev, [widgetId]: { ...prev[widgetId], isVisible } };
    });
  }, []);

  // --- NEW: Hide all tables without deleting data ---
  const hideAllTables = useCallback(() => {
    setTableData(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        next[k] = { ...next[k], isVisible: false };
      });
      return next;
    });
  }, []);

  const removeTableData = useCallback((widgetId) => {
    setTableData(prev => {
      const next = { ...prev };
      delete next[widgetId];
      return next;
    });
  }, []);

  const clearAllTableData = useCallback(() => {
    setTableData({});
  }, []);

  const startNewSelection = useCallback((feature, opts = {}) => {
    setSelectionStack(prev => { prev.forEach(entry => entry.highlightHandle?.remove()); return []; });
    idCounter.current += 1;
    const entry = { id: idCounter.current, feature, layerTitle: feature?.layer?.title, label: opts.label || feature?.layer?.title, highlightHandle: null };
    setSelectionStack([entry]);
    setActiveSelectionId(entry.id);
    return entry.id;
  }, []);

  const pushSelection = useCallback((feature, opts = {}) => {
    idCounter.current += 1;
    const entry = { id: idCounter.current, feature, layerTitle: feature?.layer?.title, label: opts.label || feature?.layer?.title, highlightHandle: null };
    setSelectionStack(prev => [...prev, entry]);
    setActiveSelectionId(entry.id);
    return entry.id;
  }, []);

  const setEntryHighlight = useCallback((id, handle) => {
    setSelectionStack(prev => prev.map(e => (e.id === id ? { ...e, highlightHandle: handle } : e)));
  }, []);

  const updateSelectionFeature = useCallback((id, feature) => {
    setSelectionStack(prev => prev.map(e => (e.id === id ? { ...e, feature, layerTitle: feature?.layer?.title ?? e.layerTitle } : e)));
  }, []);

  const closeSelection = useCallback((id) => {
    setSelectionStack(prev => {
      const target = prev.find(e => e.id === id);
      target?.highlightHandle?.remove();
      const next = prev.filter(e => e.id !== id);
      setActiveSelectionId(current => (current !== id ? current : (next.length ? next[next.length - 1].id : null)));
      return next;
    });
  }, []);

  const clearAllSelections = useCallback(() => {
    setSelectionStack(prev => { prev.forEach(entry => entry.highlightHandle?.remove()); return []; });
    setActiveSelectionId(null);
  }, []);

  useEffect(() => {
    if (!view) clearAllSelections();
  }, [view, clearAllSelections]);

  const activeSelection = selectionStack.find(e => e.id === activeSelectionId) || null;
  const popupFeature = activeSelection?.feature ?? null;
  
  const setPopupFeature = useCallback((feature) => {
    if (feature === null) { clearAllSelections(); return; }
    startNewSelection(feature);
  }, [startNewSelection, clearAllSelections]);

  const value = useMemo(() => ({
    selectionStack, activeSelectionId, activeSelection, setActiveSelectionId,
    startNewSelection, pushSelection, closeSelection, clearAllSelections,
    setEntryHighlight, updateSelectionFeature, popupFeature, setPopupFeature,
    parcelFeature, setParcelFeature,
    highlightHandleRef, tableData, addTableData, removeTableData, clearAllTableData,
    setTableVisibility, hideAllTables // NEW EXPORTS
  }), [
    selectionStack, activeSelectionId, activeSelection, startNewSelection, pushSelection, closeSelection, clearAllSelections,
    setEntryHighlight, updateSelectionFeature, popupFeature, setPopupFeature, parcelFeature,
    tableData, addTableData, removeTableData, clearAllTableData, setTableVisibility, hideAllTables
  ]);

  return <PopupContext.Provider value={value}>{children}</PopupContext.Provider>;
}

export function usePopup() {
  const ctx = useContext(PopupContext);
  if (!ctx) throw new Error("usePopup must be used inside MapProvider");
  return ctx;
}

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

export function useArcGIS() {
  return { ...useMapView(), ...useLayers(), ...useStats(), ...usePopup() };
}