/**
 * Single source of truth for the alarm-state codes coming from the
 * telemetry pipeline. Previously these were magic numbers/strings
 * (1, 2, "2_stale", 4, "4_warning"...) duplicated across RegionStats.jsx,
 * TopBar.jsx, Realtime.jsx, and CustomerDetails.jsx.
 */
export const FAULT_CODES = Object.freeze({
  POWER_OFF: 1,
  LINK_DOWN: 2,
  GPL: 3, // GEM Packet Loss
  LOP: 4, // Low Optical Power
});

// Sub-states derived client-side from LINK_DOWN / LOP based on duration or severity.
export const DERIVED_FAULT_CODES = Object.freeze({
  LINK_DOWN_RECENT: "2_stale", // < 7 days
  LINK_DOWN_STALE: "2_long", // >= 7 days
  LOP_MINOR: "4",
  LOP_WARNING: "4_warning",
});

export const SEVERITY = Object.freeze({
  WARNING: "warning",
});

export const STALE_FAULT_WINDOW_DAYS = 7;

export const REGIONS = Object.freeze(["North", "South", "Central"]);

/**
 * Canonical per-region stats shape. Realtime.jsx and TopBar.jsx both build
 * a fresh `realtimeStats` object and must use the EXACT same key set --
 * LeftSidebar.jsx detects "new data" by JSON.stringify-comparing each
 * region's object to its previous value. If one producer's object has a
 * different set of keys than the other's (e.g. one is missing
 * "4_warning"), every region's JSON string comes out different even when
 * no real counts changed, which lights up ALL region tabs at once instead
 * of just the one that actually received new data.
 */
export function createEmptyRegionStats() {
  const emptyRegion = () => ({ 1: 0, 2: 0, "2_long": 0, 3: 0, 4: 0, "4_warning": 0 });
  return REGIONS.reduce((acc, region) => {
    acc[region] = emptyRegion();
    return acc;
  }, {});
}

/**
 * Escapes single quotes for values interpolated into CQL/SQL `WHERE`
 * clauses (GeoServer CQL_FILTER, ArcGIS query.where, etc.). This does not
 * make raw string interpolation fully injection-proof, but it closes the
 * most direct escape ( id = 'x' OR '1'='1 ) and should be used on every
 * value that ends up inside a WHERE clause built via string interpolation.
 */
export function escapeForCql(value) {
  return String(value).replace(/'/g, "''");
}