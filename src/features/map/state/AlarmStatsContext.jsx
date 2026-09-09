import { createContext, useContext, useState, useMemo } from "react";

/**
 * Per-region alarm counts driving the left sidebar's Alarm State tab.
 *
 * WRITTEN BY  features/realtime/OntStatusFeed.jsx (socket pushes + periodic
 *             recount) and features/dashboard/TopBar.jsx (after the fault
 *             dropdown re-filters the customer layer).
 * READ BY     features/sidebars/left/LeftSidebar.jsx and RegionStats.jsx.
 *
 * Both start null and stay null until the customer layer has loaded, which is
 * why LeftSidebar renders nothing at all on a cold start.
 */
const AlarmStatsContext = createContext(null);

export function AlarmStatsProvider({ children }) {
  const [alertCount, setAlertCount] = useState(null);
  const [realtimeStats, setRealtimeStats] = useState(null);
  const value = useMemo(
    () => ({ alertCount, setAlertCount, realtimeStats, setRealtimeStats }),
    [alertCount, realtimeStats]
  );
  return <AlarmStatsContext.Provider value={value}>{children}</AlarmStatsContext.Provider>;
}

export function useStats() {
  const ctx = useContext(AlarmStatsContext);
  if (!ctx) throw new Error("useStats must be used inside MapProvider");
  return ctx;
}
