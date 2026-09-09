import { createContext, useContext, useState, useRef, useEffect, useMemo, useCallback } from "react";

/**
 * What the user currently has selected on the map.
 *
 * A stack, not a single feature: clicking a customer inside a DC popup pushes
 * a second entry rather than replacing the first, which is what lets the right
 * sidebar show the trail of tabs you drilled through.
 *
 * WRITTEN BY  features/map/interactions/GlobalClickHandler.jsx (map clicks
 *             start a new selection) and the detail panels under
 *             features/sidebars/right/details/ (pushSelection to drill in).
 * READ BY     features/sidebars/right/RightSidebar.jsx, which renders one tab
 *             per entry and the matching detail panel for the active one.
 *
 * Selections clear themselves whenever the view goes away, so a torn-down map
 * can't leave stale highlight handles pointing at a destroyed layer view.
 */
const SelectionContext = createContext(null);

export function SelectionProvider({ children, view }) {
  const [selectionStack, setSelectionStack] = useState([]);
  const [activeSelectionId, setActiveSelectionId] = useState(null);
  // Parcels come from a separate identify path and are not part of the stack.
  const [parcelFeature, setParcelFeature] = useState(null);
  // Shared handle for "the one highlight currently on the map" -- whoever sets
  // a new highlight is expected to remove the previous one through this ref.
  const highlightHandleRef = useRef(null);
  const idCounter = useRef(0);

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
    highlightHandleRef,
  }), [
    selectionStack, activeSelectionId, activeSelection, startNewSelection, pushSelection,
    closeSelection, clearAllSelections, setEntryHighlight, updateSelectionFeature,
    popupFeature, setPopupFeature, parcelFeature,
  ]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used inside MapProvider");
  return ctx;
}
