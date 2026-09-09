import { createContext, useContext, useState, useMemo } from "react";

/**
 * Whether the right sidebar is currently open.
 *
 * Exists so widgets drawn ON the map can get out of its way -- currently only
 * the coordinate widget, which collapses itself rather than sit underneath.
 *
 * WRITTEN BY  features/sidebars/right/RightSidebar.jsx (mirrors its own
 *             collapsed state here).
 * READ BY     features/map/widgets/CoordinateWidget.jsx.
 *
 * Not to be confused with features/dashboard/SidebarLayoutContext.jsx, which
 * owns where the panels sit (docked vs overlaying) and how much of the centre
 * column they cover. This one is only "is it open".
 */
const RightPanelContext = createContext(null);

export function RightPanelProvider({ children }) {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const value = useMemo(() => ({ isRightPanelOpen, setIsRightPanelOpen }), [isRightPanelOpen]);
  return <RightPanelContext.Provider value={value}>{children}</RightPanelContext.Provider>;
}

export function useRightPanel() {
  const ctx = useContext(RightPanelContext);
  if (!ctx) throw new Error("useRightPanel must be used inside MapProvider");
  return ctx;
}
