import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// Which filters are currently narrowing what's on the map.
//
// The filter widgets live inside the right sidebar's Filter tab, which spends
// most of its life closed or showing a different tab -- so a filter can be
// quietly reshaping the map with nothing on screen saying so. Each widget
// publishes what it has *applied* here, and ActiveFiltersBar reads that back
// out over the map where it stays visible whatever the sidebar is doing.
//
// Publishing (rather than the bar reaching into the widgets) is what keeps the
// two honest: only the widget knows what it actually pushed to the layer, and
// only the widget knows how to undo it, so both travel together in one entry.
const ActiveFiltersContext = createContext(null);

// Summaries are joined into a single dependency string so the publish effect
// can key off their contents. Unit Separator, because the summaries themselves
// are prose ("Status: DOWN") and any printable delimiter would split them.
const SUMMARY_SEP = "\u001f";

export function ActiveFiltersProvider({ children }) {
  // Insertion-ordered, so the bar lists filters in the order they were applied
  // and re-applying one doesn't make it jump to the end.
  const [entries, setEntries] = useState(() => new Map());

  const publishFilter = useCallback((id, entry) => {
    setEntries((prev) => {
      const next = new Map(prev);
      next.set(id, entry);
      return next;
    });
  }, []);

  const retractFilter = useCallback((id) => {
    setEntries((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const activeFilters = useMemo(() => Array.from(entries.values()), [entries]);

  // Each clear() is the widget's own reset, so this leaves the map, the layer
  // definitions and the widgets' own inputs consistent -- there is no separate
  // "clear everything" path here that could drift from what the widgets do.
  const clearAll = useCallback(() => {
    activeFilters.forEach((filter) => filter.clear());
  }, [activeFilters]);

  const value = useMemo(
    () => ({ activeFilters, publishFilter, retractFilter, clearAll }),
    [activeFilters, publishFilter, retractFilter, clearAll]
  );

  return (
    <ActiveFiltersContext.Provider value={value}>
      {children}
    </ActiveFiltersContext.Provider>
  );
}

export function useActiveFilters() {
  const ctx = useContext(ActiveFiltersContext);
  if (!ctx) throw new Error("useActiveFilters must be used inside ActiveFiltersProvider");
  return ctx;
}

/**
 * Publishes one filter widget's applied state to the indicator.
 *
 * `summary` is what the widget has actually applied -- an array of short
 * "Label: value" strings -- or null/empty when nothing is applied. Pass the
 * values captured at apply time, NOT the widget's live inputs: someone who
 * changes a dropdown without pressing Apply hasn't changed the map, and the
 * indicator has to keep describing what the map is really showing.
 *
 * `onClear` is the widget's own reset handler, so clearing from the bar goes
 * through exactly the same path as its Clear button.
 */
export function usePublishFilter({ id, label, summary, onClear }) {
  const { publishFilter, retractFilter } = useActiveFilters();

  // Kept in a ref so a re-render with a fresh closure doesn't have to
  // re-publish the entry just to keep the clear handler current.
  const onClearRef = useRef(onClear);
  useEffect(() => {
    onClearRef.current = onClear;
  });

  const isActive = Array.isArray(summary) && summary.length > 0;
  // Publishing depends on the summary's *contents*, not the array identity --
  // widgets build these inline, so a new array arrives on every render.
  const summaryKey = isActive ? summary.join(SUMMARY_SEP) : "";

  // Retraction on unmount is its own effect so that re-applying a filter is a
  // plain overwrite. Folding it into the publish effect below made every
  // summary change a delete-then-insert, which re-ordered the bar and made the
  // chip the user had just edited jump to the far end.
  useEffect(() => () => retractFilter(id), [id, retractFilter]);

  useEffect(() => {
    if (!isActive) {
      retractFilter(id);
      return;
    }

    publishFilter(id, {
      id,
      label,
      summary: summaryKey.split(SUMMARY_SEP),
      clear: () => onClearRef.current?.(),
    });
  }, [id, label, isActive, summaryKey, publishFilter, retractFilter]);
}
