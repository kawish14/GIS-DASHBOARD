/**
 * Makes a sidebar's Calcite controls shrink on laptop screens.
 *
 * Calcite sizes almost everything off a component's `scale` prop, and the
 * default is "m". The widgets that already read well on a 1366x768 laptop --
 * the layer list, the left sidebar's region stats and active-user list -- are
 * the ones whose authors happened to pass scale="s"; everything else renders
 * at "m" and eats vertical space that a short screen does not have. Rather
 * than hand-editing a `scale` onto every control in every widget (and having
 * to remember it for the next one), this hook applies the rule for the whole
 * subtree:
 *
 *   viewport <= COMPACT_BREAKPOINT  ->  every scale-capable control is "s"
 *   wider than that                 ->  each control goes back to whatever it
 *                                       had when we first saw it
 *
 * The restore is what keeps author intent intact on big screens: a widget
 * that deliberately asked for "s" gets "s" back, and a default one gets "m"
 * back. It has to work by snapshot rather than by reading the markup, because
 * Calcite reflects `scale` onto the element -- by the time this runs, a
 * defaulted control and a deliberately-"m" one look identical in the DOM.
 *
 * Pass the ref of the element wrapping the panel's content. New widgets are
 * picked up automatically: a MutationObserver re-runs the pass (coalesced to
 * one per frame) whenever the subtree changes.
 */
import { useEffect } from "react";

// 1599px and below is where index.css already narrows the panels themselves
// (see "SIDEBAR SIZING") -- the same screens, so the same breakpoint.
export const COMPACT_BREAKPOINT = 1599;

const COMPACT_QUERY = `(max-width: ${COMPACT_BREAKPOINT}px)`;

// Opt-out hook for a control that must keep its own size regardless.
const LOCK_ATTR = "data-scale-lock";

export default function useCompactSidebar(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof window === "undefined" || !window.matchMedia) return undefined;

    // element -> the scale it had before we touched it.
    const original = new WeakMap();
    const mql = window.matchMedia(COMPACT_QUERY);
    let frame = 0;

    const apply = () => {
      frame = 0;
      const compact = mql.matches;

      root.querySelectorAll("*").forEach((el) => {
        // `scale` is a real property only on the Calcite components that
        // support it, so this skips plain DOM nodes and the handful of
        // Calcite elements (shell panel, action bar) that have no scale.
        if (!("scale" in el) || el.hasAttribute(LOCK_ATTR)) return;

        // Read and write the PROPERTY, never the attribute. Calcite reflects
        // scale to the attribute a tick or two after the property is set, so
        // an element whose widget asked for "s" still reads scale=null in the
        // DOM on the pass that first sees it -- snapshotting the attribute
        // captured that null and "restored" every control to no scale at all
        // when the window grew back. The property is correct from the first
        // frame, and is what the component actually renders from.
        if (!original.has(el)) original.set(el, el.scale);

        const want = compact ? "s" : original.get(el);
        if (el.scale !== want) el.scale = want;
      });
    };

    // Widgets mount, tabs switch and lists fill in asynchronously, so one pass
    // at mount is not enough. Coalesce to a frame so a burst of DOM writes
    // costs one walk, not one per node.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    apply();

    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });

    // Safari < 14 only has the deprecated listener API.
    if (mql.addEventListener) mql.addEventListener("change", apply);
    else mql.addListener(apply);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      if (mql.removeEventListener) mql.removeEventListener("change", apply);
      else mql.removeListener(apply);
    };
  }, [ref]);
}