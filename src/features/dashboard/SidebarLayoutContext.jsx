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

// Where the measured insets are published. Everything that has to step aside
// for an overlay panel reads these instead of a React value -- see
// `useOverlayInsetVars` below for why.
const INSET_VAR_START = "--app-panel-inset-start";
const INSET_VAR_END = "--app-panel-inset-end";

// The shadow-DOM node inside calcite-shell-panel that actually holds the
// panel body. In overlay mode it is positioned out over the centre column;
// in dock mode it sits in the shell's flow and the shell reserves its width.
const PANEL_CONTENT_SELECTOR = ".content";

const SidebarLayoutContext = createContext(null);

// How much of the centre column this panel is currently covering.
//
// This is measured rather than derived from `open`, because the two can and do
// disagree: a sidebar renders nothing at all until its data arrives (see the
// `realtimeStats` guard in LeftSidebar) or when the user has no permissions
// for any of its tabs, while `open` stays true underneath. Deriving the inset
// from `open` then left the table with a blank strip down its left edge and
// the ArcGIS zoom/compass/home controls stranded mid-map, with no panel there
// to justify either. Measuring can't drift: no panel on screen, no inset.
function measureOverlayInset(shellPanelEl) {
  const content = shellPanelEl?.shadowRoot?.querySelector(PANEL_CONTENT_SELECTOR);
  if (!content) return 0;

  // A docked panel has its space reserved by the shell itself, so it covers
  // nothing and must not produce an inset. Overlay is exactly the case where
  // calcite takes the content out of flow, so ask the box rather than
  // re-deriving the mode from the viewport width.
  if (getComputedStyle(content).position !== "absolute") return 0;

  // Collapsed panels are `hidden`, which measures as 0 -- no special case.
  return Math.round(content.getBoundingClientRect().width);
}

// Publishes the measured insets as CSS variables on <html> instead of React
// state. Calcite animates the panel's max-inline-size, so the width changes
// every frame while it opens or closes; routing that through state would
// re-render the whole dashboard (map + attribute table included) ~15 times per
// animation. A custom property updates the layout directly, and the table then
// tracks the panel's real edge frame by frame rather than running a second,
// separate transition of its own.
function useOverlayInsetVars(panels, displayMode) {
  useEffect(() => {
    const root = document.documentElement;
    const published = { start: null, end: null };

    const publish = (side, px) => {
      if (published[side] === px) return;
      published[side] = px;
      root.style.setProperty(side === "start" ? INSET_VAR_START : INSET_VAR_END, `${px}px`);
    };

    const sync = () => {
      publish("start", measureOverlayInset(panels.start));
      publish("end", measureOverlayInset(panels.end));
    };

    let cancelled = false;
    const observers = [];

    // Calcite renders its shadow DOM asynchronously, so `.content` may not
    // exist yet on the element React just handed us.
    const observe = async (el) => {
      if (!el) return;
      try {
        await (el.componentOnReady?.() ?? el.updateComplete);
      } catch {
        /* element went away mid-await -- the null check below covers it */
      }
      if (cancelled) return;

      const content = el.shadowRoot?.querySelector(PANEL_CONTENT_SELECTOR);
      if (!content) return;

      const observer = new ResizeObserver(sync);
      observer.observe(content);
      observers.push(observer);
      sync();
    };

    sync();
    observe(panels.start);
    observe(panels.end);

    return () => {
      cancelled = true;
      observers.forEach((observer) => observer.disconnect());
      // Leave nothing behind for the next mount to inherit.
      root.style.removeProperty(INSET_VAR_START);
      root.style.removeProperty(INSET_VAR_END);
    };
    // `displayMode` is a dependency because dock <-> overlay can leave the
    // panel exactly as wide as it was, which the ResizeObserver would never
    // report -- only its `position` changed, and that flips the inset on or
    // off entirely.
  }, [panels.start, panels.end, displayMode]);
}

export function SidebarLayoutProvider({ children }) {
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== "undefined" && window.innerWidth < COMPACT_BREAKPOINT
  );
  const [open, setOpen] = useState({ start: true, end: false });
  const [panels, setPanels] = useState({ start: null, end: null });

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT - 1}px)`);
    const sync = (event) => setIsCompact(event.matches);
    sync(query);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const setSidebarOpen = useCallback((side, shouldOpen) => {
    setOpen((prev) =>
      prev[side] === shouldOpen ? prev : { ...prev, [side]: shouldOpen }
    );
  }, []);

  // Opening one sidebar asks the other to stand down, so only one set of tools
  // is on the map at a time. The exception is the right panel's Details tab:
  // it holds the popup for the feature the user just clicked, and closing that
  // because they reached for a left-hand tool would throw the selection away.
  // Details therefore ignores the request, and opening Details never sends one.
  //
  // It's a one-shot counter rather than derived state on purpose. The panel
  // that was just opened must never be the one that closes, and two panels
  // reacting to each other's *state* would ping-pong; a request is a moment in
  // time, so the receiving panel decides once and nothing bounces back.
  const [closeRequests, setCloseRequests] = useState({ start: 0, end: 0 });

  const requestClose = useCallback((side) => {
    setCloseRequests((prev) => ({ ...prev, [side]: prev[side] + 1 }));
  }, []);

  // Each sidebar hands its calcite-shell-panel over with a ref callback, so an
  // unmounted sidebar arrives here as `null` and its inset goes with it.
  const registerPanel = useCallback((side, element) => {
    setPanels((prev) => (prev[side] === element ? prev : { ...prev, [side]: element }));
  }, []);

  const displayMode = isCompact ? "overlay" : "dock";
  useOverlayInsetVars(panels, displayMode);

  const value = useMemo(
    () => ({
      isCompact,
      displayMode,
      openStart: open.start,
      openEnd: open.end,
      // Constant references to the measured variables -- see
      // `useOverlayInsetVars`. Anything in the shell's centre column that must
      // stay fully visible (the attribute table) insets itself by these; the
      // map deliberately does not, because staying full-bleed underneath is
      // what keeps its size, and therefore its camera, stable while a panel
      // animates.
      overlayInsetStart: `var(${INSET_VAR_START}, 0px)`,
      overlayInsetEnd: `var(${INSET_VAR_END}, 0px)`,
      setSidebarOpen,
      registerPanel,
      requestClose,
      closeStartRequest: closeRequests.start,
      closeEndRequest: closeRequests.end,
    }),
    [
      isCompact,
      displayMode,
      open.start,
      open.end,
      setSidebarOpen,
      registerPanel,
      requestClose,
      closeRequests.start,
      closeRequests.end,
    ]
  );

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

// Convenience for the two sidebars: a stable ref callback that registers (and,
// on unmount, unregisters) this side's shell panel with the provider.
export function usePanelRef(side) {
  const { registerPanel } = useSidebarLayout();
  return useCallback((element) => registerPanel(side, element), [registerPanel, side]);
}
