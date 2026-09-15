/**
 * The lists behind the OLT / POP customer filter's pickers.
 *
 * Pure and on their own so the shaping can be checked without a map: turning
 * raw `pop_boundary` rows into one entry per service area is where the picker
 * went wrong before, listing the same POP once per polygon.
 */
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine";

/**
 * One entry per service area, not per polygon.
 *
 * A POP's area is drawn as several polygons in `pop_boundary` -- an island
 * across a road, a pocket behind a canal -- and one row per polygon is what
 * put "Jeff Heights POP" in the list five times over. Rows are grouped by
 * `pop_id` and their polygons unioned into the one shape the area really is,
 * so picking it selects all of it rather than whichever piece was listed
 * first.
 *
 * Two areas that genuinely share a name (different POPs, same town) keep both
 * entries and are told apart by their id.
 */
export function mergeServiceAreas(features = []) {
  const byPop = new Map();

  features.forEach((feature) => {
    if (!feature?.geometry) return;
    const attributes = feature.attributes ?? {};
    const id = String(attributes.pop_id ?? attributes.pop_name ?? "").trim();
    if (!id) return;

    const existing = byPop.get(id);
    if (existing) {
      existing.geometries.push(feature.geometry);
      return;
    }

    byPop.set(id, {
      id,
      name: String(attributes.pop_name || attributes.pop_id || "Unnamed area").trim(),
      region: attributes.region || "",
      geometries: [feature.geometry],
    });
  });

  const areas = [...byPop.values()].map((area) => ({
    id: area.id,
    name: area.name,
    region: area.region,
    parts: area.geometries.length,
    geometry: area.geometries.length === 1
      ? area.geometries[0]
      : geometryEngine.union(area.geometries),
  }));

  // Only the names that actually clash carry their id, so the common case
  // stays a clean list of names.
  const nameCounts = areas.reduce((counts, area) => {
    counts[area.name] = (counts[area.name] || 0) + 1;
    return counts;
  }, {});
  areas.forEach((area) => { area.ambiguous = nameCounts[area.name] > 1; });

  return areas.sort(
    (a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name)
  );
}

/** Groups either list by region, for the headings in the pickers. */
export function groupByRegion(items) {
  const groups = new Map();
  items.forEach((item) => {
    const region = item.region || "Other";
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(item);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
