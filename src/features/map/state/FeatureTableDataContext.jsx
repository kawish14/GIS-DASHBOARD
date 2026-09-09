import { createContext, useContext, useState, useMemo, useCallback } from "react";

/**
 * The tabs in the attribute table at the bottom of the dashboard.
 *
 * Keyed by a caller-chosen widget id, so each producer owns exactly one tab and
 * re-running it replaces that tab instead of stacking duplicates. `filterParams`
 * is the producer's own serialised inputs -- it compares them to decide whether
 * it can just re-show the existing tab instead of re-querying.
 *
 * WRITTEN BY  the filter widgets in features/filters/widgets/, the selection
 *             tool (features/map/widgets/SelectionWidget.jsx) and the drill-in
 *             actions in features/featureTable/FeatureTable.jsx.
 * READ BY     features/featureTable/FeatureTable.jsx (renders the tabs) and
 *             features/dashboard/DashboardPage.jsx (decides whether the table
 *             region is on screen at all).
 *
 * Split out from the selection state on purpose: the table holds thousands of
 * rows and must not re-render every time someone clicks the map.
 */
const FeatureTableDataContext = createContext(null);

export function FeatureTableDataProvider({ children }) {
  const [tableData, setTableData] = useState({});

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

  const value = useMemo(() => ({
    tableData, addTableData, removeTableData, clearAllTableData,
    setTableVisibility, hideAllTables,
  }), [tableData, addTableData, removeTableData, clearAllTableData, setTableVisibility, hideAllTables]);

  return (
    <FeatureTableDataContext.Provider value={value}>{children}</FeatureTableDataContext.Provider>
  );
}

export function useFeatureTableData() {
  const ctx = useContext(FeatureTableDataContext);
  if (!ctx) throw new Error("useFeatureTableData must be used inside MapProvider");
  return ctx;
}
