/**
 * Whoever is drawing on the map right now.
 *
 * Two widgets put a SketchViewModel on the same MapView: the selection tool
 * (features/map/widgets/SelectionWidget.jsx) and the measure tool
 * (features/map/widgets/MeasurementWidget.jsx). Both listen for map clicks
 * while they are creating a geometry, so if a user starts a selection polygon,
 * walks away from it and then starts a measurement, the next click lands in
 * both sketches at once.
 *
 * This is the referee. A tool calls claimDrawTool() before it starts drawing;
 * every other subscriber is told it lost the map and cancels itself. It is a
 * plain module rather than a context on purpose -- there is exactly one
 * MapView in this app, the state is a single string, and going through React
 * would re-render both panels on every tool switch.
 */

const listeners = new Set();
let owner = null;

/** The tool id currently allowed to draw, or null. */
export function getDrawToolOwner() {
  return owner;
}

/** Take the map. Every other subscriber is notified so it can cancel. */
export function claimDrawTool(id) {
  if (owner === id) return;
  owner = id;
  listeners.forEach((fn) => fn(owner));
}

/** Give the map back, but only if `id` still holds it. */
export function releaseDrawTool(id) {
  if (owner !== id) return;
  owner = null;
  listeners.forEach((fn) => fn(owner));
}

/**
 * Subscribe to ownership changes. The callback gets the new owner id (or
 * null). Returns an unsubscribe function.
 */
export function onDrawToolChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}