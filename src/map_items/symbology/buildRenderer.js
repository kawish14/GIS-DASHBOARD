/**
 * Turns a plain JSON symbology config into an ArcGIS renderer object.
 * No ArcGIS imports needed here -- renderers are just plain objects that
 * autocast, so this file has zero dependency on @arcgis/core and can be
 * unit-tested in isolation.
 *
 * Supported config shapes (see symbology-config.example.json):
 *
 *   { type: "unique-value", field: "fiber_type", defaultSymbol: {...}, values: [{ value, ...symbolProps }] }
 *   { type: "class-breaks",  field: "lmp",        defaultSymbol: {...}, values: [{ min, max, ...symbolProps }] }
 *   { type: "simple",                              defaultSymbol: {...} }
 *
 * `geometryType` ("polyline" | "polygon" | "point") decides what kind of
 * symbol object gets built. Pass `layer.geometryType` from the actual
 * ArcGIS layer instance rather than storing it in the config -- the layer
 * already knows its own geometry type, so there's one less thing an admin
 * editing the JSON could get wrong.
 */

export function buildRendererFromConfig(config, geometryType) {
  if (!config) return null;

  const { type, field, defaultSymbol, values = [] } = config;

  const toSymbol = (def) => buildSymbol(def, geometryType);

  switch (type) {
    case "unique-value":
      if (!field && !config.valueExpression) throw new Error('unique-value symbology config requires a "field" or "valueExpression"');
      return {
        type: "unique-value",
        field: field || undefined,
        valueExpression: config.valueExpression || undefined,
        defaultSymbol: toSymbol(defaultSymbol),
        uniqueValueInfos: values.map((v) => ({
          value: v.value,
          label: v.label, // Added to support Legend text
          symbol: toSymbol(v),
        })),
      };

    case "class-breaks":
      if (!field) throw new Error('class-breaks symbology config requires a "field"');
      return {
        type: "class-breaks",
        field,
        defaultSymbol: toSymbol(defaultSymbol),
        classBreakInfos: values.map((v) => ({
          minValue: v.min,
          maxValue: v.max,
          symbol: toSymbol(v),
        })),
      };

    case "simple":
      return {
        type: "simple",
        symbol: toSymbol(defaultSymbol),
      };

    default:
      throw new Error(`Unknown symbology renderer type: "${type}"`);
  }
}

function buildSymbol(def = {}, geometryType) {
  // 1. If the config explicitly provides a nested "symbol" object, use it directly!
  if (def.symbol) {
    return def.symbol;
  }

  // 2. If a defaultSymbol is passed that already defines an ArcGIS type, use it directly!
  if (def.type === "picture-marker" || def.type === "simple-marker" || def.type === "simple-fill" || def.type === "simple-line") {
    return def;
  }

  // 3. Otherwise, fall back to the original auto-generation logic
  switch (geometryType) {
    case "polyline":
      return {
        type: "simple-line",
        color: def.color ?? "#000000",
        width: def.width ?? 2,
        style: def.style ?? "solid",
      };

    case "polygon":
      return {
        type: "simple-fill",
        color: def.color ?? "#000000",
        outline: {
          color: def.outlineColor ?? "#000000",
          width: def.outlineWidth ?? 1,
        },
      };

    case "point":
    case "multipoint":
      return {
        type: "simple-marker",
        color: def.color ?? "#000000",
        size: def.size ?? 8,
        style: def.markerStyle ?? "circle",
        outline: def.outlineColor
          ? { color: def.outlineColor, width: def.outlineWidth ?? 1 }
          : undefined,
      };

    default:
      // Fall back to a line symbol rather than throwing -- an unrecognized
      // or not-yet-loaded geometryType shouldn't crash the whole layer.
      return {
        type: "simple-line",
        color: def.color ?? "#000000",
        width: def.width ?? 2,
        style: def.style ?? "solid",
      };
  }
}