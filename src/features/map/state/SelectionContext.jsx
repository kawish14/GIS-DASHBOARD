import { createContext, useContext, useState, useRef, useEffect, useMemo, useCallback } from "react";

/**
 * What the user currently has selected on the map.
 *
 * A stack, not a single feature: clicking a customer inside a DC popup pushes
 * a second entry rather than replacing the first, which is what lets the right
 * sidebar show the trail of tabs you drilled through.
 *
 * Each entry is itself a small carousel. A click on the map rarely lands on
 * exactly one thing -- customer points sit on top of each other at a shared
 * premises, a DC gets dropped on its POP -- so an entry carries every feature
 * that was under the cursor (`candidates`) plus which one is showing
 * (`candidateIndex`). `feature` is always `candidates[candidateIndex]`; code
 * that only cares about the visible feature can keep reading it and ignore the
 * rest. Drill-downs from a detail panel push an entry with a single candidate.
 *
 * WRITTEN BY  features/map/interactions/GlobalClickHandler.jsx (map clicks
 *             start a new selection) and the detail panels under
 *             features/sidebars/right/details/ (pushSelection to drill in).
 * READ BY     features/sidebars/right/RightSidebar.jsx, which renders one tab
 *             per entry, the matching detail panel for the active one, and the
 *             "1 of N" pager over that entry's candidates.
 *
 * Selections clear themselves whenever the view goes away, so a torn-down map
 * can't leave stale highlight handles pointing at a destroyed layer view.
 */
const SelectionContext = createContext(null);

/**
 * Builds a stack entry. `opts.candidates` is every feature found under the
 * click; `feature` says which of them starts out visible. A feature that isn't
 * in the list is taken as the caller's real intent and put in front of it.
 */
function makeEntry(id, feature, opts = {}) {
  const supplied = opts.candidates?.length ? opts.candidates : [feature];
  const found = supplied.indexOf(feature);
  const candidates = found >= 0 ? supplied : [feature, ...supplied];
  const candidateIndex = found >= 0 ? found : 0;
  const active = candidates[candidateIndex];

  return {
    id,
    feature: active,
    candidates,
    candidateIndex,
    layerTitle: active?.layer?.title,
    label: opts.label || active?.layer?.title,
    // Remembered separately so paging to a candidate from another layer can
    // refresh the tab label without clobbering a caller's explicit one.
    labelOverride: opts.label || null,
    highlightHandle: null,
  };
}

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
    const entry = makeEntry(idCounter.current, feature, opts);
    setSelectionStack([entry]);
    setActiveSelectionId(entry.id);
    return entry.id;
  }, []);

  const pushSelection = useCallback((feature, opts = {}) => {
    idCounter.current += 1;
    const entry = makeEntry(idCounter.current, feature, opts);
    setSelectionStack(prev => [...prev, entry]);
    setActiveSelectionId(entry.id);
    return entry.id;
  }, []);

  const setEntryHighlight = useCallback((id, handle) => {
    setSelectionStack(prev => prev.map(e => (e.id === id ? { ...e, highlightHandle: handle } : e)));
  }, []);

  /**
   * Swaps in a richer version of a feature -- the sidebar re-queries the layer
   * for the attributes a hit-test graphic doesn't carry.
   *
   * `replaces` is the feature the caller set out to expand. Pass it: a layer
   * query is slow enough that the user can page to another candidate before it
   * lands, and matching the slot by identity is what keeps that late answer
   * from overwriting the feature they moved to. Without it the currently shown
   * candidate is assumed.
   */
  const updateSelectionFeature = useCallback((id, feature, replaces) => {
    setSelectionStack(prev => prev.map(e => {
      if (e.id !== id) return e;

      const candidates = e.candidates ?? [e.feature];
      const slot = replaces ? candidates.indexOf(replaces) : e.candidateIndex;
      // The candidate this was fetched for is no longer in the list -- the
      // answer is about a selection that has since been replaced. Drop it.
      if (slot < 0) return e;

      const isShowing = slot === e.candidateIndex;
      return {
        ...e,
        // Filling the slot means paging away and back doesn't re-query the
        // layer for attributes we already have.
        candidates: candidates.map((candidate, i) => (i === slot ? feature : candidate)),
        feature: isShowing ? feature : e.feature,
        layerTitle: isShowing ? (feature?.layer?.title ?? e.layerTitle) : e.layerTitle,
      };
    }));
  }, []);

  /** Pages one entry to another of the features that were under the same click. */
  const setEntryCandidate = useCallback((id, index) => {
    setSelectionStack(prev => prev.map(e => {
      if (e.id !== id || index === e.candidateIndex) return e;
      const next = e.candidates?.[index];
      if (!next) return e;
      // The handle highlights the feature we're leaving. Drop it and let
      // GlobalClickHandler's highlight pass draw the one we paged to.
      e.highlightHandle?.remove();
      return {
        ...e,
        feature: next,
        candidateIndex: index,
        layerTitle: next?.layer?.title ?? e.layerTitle,
        label: e.labelOverride || next?.layer?.title || e.label,
        highlightHandle: null,
      };
    }));
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
    setEntryHighlight, updateSelectionFeature, setEntryCandidate,
    popupFeature, setPopupFeature,
    parcelFeature, setParcelFeature,
    highlightHandleRef,
  }), [
    selectionStack, activeSelectionId, activeSelection, startNewSelection, pushSelection,
    closeSelection, clearAllSelections, setEntryHighlight, updateSelectionFeature,
    setEntryCandidate, popupFeature, setPopupFeature, parcelFeature,
  ]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used inside MapProvider");
  return ctx;
}
