import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Below this viewport width there isn't enough room to hand ~600px of the map
// over to two docked panels, so panels float above the map ("overlay"). At or
// above it, docking still leaves a large map, so the panels behave like
// classic desktop-GIS docks.
//
// Overlay is also what removes the flicker: `calcite-shell-panel` animates
// max-inline-size but the *shell* re-lays-out its centre column in a single
// frame, so a docked panel snaps the map container's width (e.g. 736px ->
// 1009px at 1366px wide). The MapView re-renders around its unchanged centre,
// which reads as the whole map jumping sideways. An overlay panel never
// changes the map's size at all.
export const COMPACT_BREAKPOINT = 1600;

// The rendered width of a panel's content area (excludes the action bar, which
// keeps its own column in the layout in every display mode). Declared in
// index.css so the media queries there stay the single source of sizing.
const PANEL_WIDTH = "var(--calcite-shell-panel-width, 300px)";

const SidebarLayoutContext = createContext(null);

export function SidebarLayoutProvider({ children }) {
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== "undefined" && window.innerWidth < COMPACT_BREAKPOINT
  );
  const [open, setOpen] = useState({ start: true, end: false });

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT - 1}px)`);
    const sync = (event) => setIsCompact(event.matches);
    sync(query);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // The two sides are independent. They used to be mutually exclusive on
  // compact screens, but the right panel is where map identify/popup results
  // land ("Details"), so auto-closing it whenever the user touched a left tab
  // silently threw away the feature they had just clicked. Overlay panels
  // don't shrink the map, so there is no longer a layout reason to force the
  // choice -- the user closes whichever panel they don't want.
  const setSidebarOpen = useCallback((side, shouldOpen) => {
    setOpen((prev) =>
      prev[side] === shouldOpen ? prev : { ...prev, [side]: shouldOpen }
    );
  }, []);

  const value = useMemo(() => {
    // In overlay mode the panels float above the centre column, so anything in
    // that column which must stay fully visible -- i.e. the attribute table --
    // has to inset itself by whichever panels are open. The map deliberately
    // does *not* inset: staying full-bleed underneath is what keeps its size,
    // and therefore its camera, perfectly stable while a panel animates.
    // In dock mode the shell already reserves the space, so the inset is 0.
    const overlayInsetStart = isCompact && open.start ? PANEL_WIDTH : "0px";
    const overlayInsetEnd = isCompact && open.end ? PANEL_WIDTH : "0px";

    return {
      isCompact,
      displayMode: isCompact ? "overlay" : "dock",
      openStart: open.start,
      openEnd: open.end,
      overlayInsetStart,
      overlayInsetEnd,
      setSidebarOpen,
    };
  }, [isCompact, open.start, open.end, setSidebarOpen]);

  return (
    <SidebarLayoutContext.Provider value={value}>
      {children}
    </SidebarLayoutContext.Provider>
  );
}

export function useSidebarLayout() {
  const ctx = useContext(SidebarLayoutContext);
  if (!ctx) throw new Error("useSidebarLayout must be used inside SidebarLayoutProvider");
  return ctx;
}
