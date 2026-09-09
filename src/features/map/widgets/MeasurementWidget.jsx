/**
 * Measure Tools -- distance, area and radius readouts.
 *
 * Deliberately NOT the selection tool. This widget never queries a layer,
 * never highlights features and never pushes a tab into the feature table:
 * everything it produces is a number about the geometry the user drew.
 * SelectionWidget does the opposite -- it produces a set of features and says
 * nothing about the shape used to catch them.
 *
 * The two are told apart on the map as well as in the panel: measurements are
 * amber and dashed, carry their value as an on-map label, and stack up (each
 * finished measurement stays until it is removed). A selection is cyan, solid,
 * and there is only ever one of it.
 *
 * Both widgets sketch on the same MapView, so they cooperate through
 * state/mapDrawLock.js -- claiming the map here cancels an unfinished
 * selection sketch, and vice versa.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useMapView } from "../state/MapViewContext";
import { claimDrawTool, releaseDrawTool, onDrawToolChange } from "../state/mapDrawLock";
import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import Polyline from "@arcgis/core/geometry/Polyline";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine";
import { CalciteButton, CalciteLabel, CalciteNotice } from "@esri/calcite-components-react";

export const featureMeta = {
  key: "tool_measurement",
  label: "Measure Tools",
  group: "Right Sidebar Tab",
  tab: "tab_Map_Tools",
};

// This widget's id in the shared draw lock.
const TOOL_ID = "measurement";

// Amber. The selection tool owns cyan -- keep them apart on the map.
const MEASURE_RGB = [255, 168, 0];
const rgba = (a) => [...MEASURE_RGB, a];

const LINEAR_UNITS = [
  { value: "meters", label: "Meters", abbr: "m" },
  { value: "kilometers", label: "Kilometers", abbr: "km" },
  { value: "feet", label: "Feet", abbr: "ft" },
  { value: "miles", label: "Miles", abbr: "mi" },
  { value: "nautical-miles", label: "Nautical miles", abbr: "nmi" },
];

const AREA_UNITS = [
  { value: "square-meters", label: "Square meters", abbr: "m²" },
  { value: "square-kilometers", label: "Square kilometers", abbr: "km²" },
  { value: "hectares", label: "Hectares", abbr: "ha" },
  { value: "acres", label: "Acres", abbr: "ac" },
  { value: "square-feet", label: "Square feet", abbr: "ft²" },
  { value: "square-miles", label: "Square miles", abbr: "mi²" },
];

const abbrOf = (list, value) => list.find((u) => u.value === value)?.abbr ?? "";

const MODES = {
  distance: { tool: "polyline", icon: "measure-line", label: "Distance" },
  area: { tool: "polygon", icon: "measure-area", label: "Area" },
  radius: { tool: "circle", icon: "circle-area", label: "Radius" },
};

function formatNumber(value) {
  if (!isFinite(value)) return "0";
  // Small values need decimals to mean anything; large ones read better without.
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 1 ? 2 : 4;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

const formatLinear = (value, unit) => `${formatNumber(value)} ${abbrOf(LINEAR_UNITS, unit)}`;
const formatArea = (value, unit) => `${formatNumber(value)} ${abbrOf(AREA_UNITS, unit)}`;

/** geodesicLength only takes polylines, so walk the rings to get a perimeter. */
function perimeterOf(polygon, unit) {
  if (!polygon?.rings?.length) return 0;
  const outline = new Polyline({
    paths: polygon.rings,
    spatialReference: polygon.spatialReference,
  });
  return Math.abs(geometryEngine.geodesicLength(outline, unit));
}

/** Per-leg lengths of the first path of a polyline. */
function segmentsOf(polyline, unit) {
  const path = polyline?.paths?.[0];
  if (!path || path.length < 2) return [];

  const legs = [];
  for (let i = 1; i < path.length; i += 1) {
    const leg = new Polyline({
      paths: [[path[i - 1], path[i]]],
      spatialReference: polyline.spatialReference,
    });
    legs.push(Math.abs(geometryEngine.geodesicLength(leg, unit)));
  }
  return legs;
}

/** Centre-to-edge distance of a sketched circle. */
function radiusOf(polygon, unit) {
  const ring = polygon?.rings?.[0];
  const centre = polygon?.centroid;
  if (!ring?.length || !centre) return 0;

  const spoke = new Polyline({
    paths: [[[centre.x, centre.y], ring[0]]],
    spatialReference: polygon.spatialReference,
  });
  return Math.abs(geometryEngine.geodesicLength(spoke, unit));
}

/** Where the on-map label sits: mid-vertex for a line, centroid for an area. */
function labelPointFor(geometry) {
  if (geometry.type === "polyline") {
    const path = geometry.paths?.[0] ?? [];
    if (!path.length) return null;
    const mid = path[Math.floor(path.length / 2)];
    return { type: "point", x: mid[0], y: mid[1], spatialReference: geometry.spatialReference };
  }
  return geometry.centroid ?? geometry.extent?.center ?? null;
}

const labelSymbol = (text) => ({
  type: "text",
  text,
  color: [25, 25, 25, 1],
  haloColor: rgba(1),
  haloSize: 1.5,
  yoffset: 10,
  font: { size: 11, weight: "bold", family: "sans-serif" },
});

const vertexSymbol = {
  type: "simple-marker",
  style: "square",
  size: "7px",
  color: rgba(1),
  outline: { color: [25, 25, 25, 1], width: 1 },
};

let measurementSeq = 0;

export default function MeasurementWidget() {
  const { view } = useMapView();

  const [mode, setMode] = useState(null);
  const [linearUnit, setLinearUnit] = useState("meters");
  const [areaUnit, setAreaUnit] = useState("square-kilometers");
  const [live, setLive] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [hint, setHint] = useState("");

  const sketchVM = useRef(null);
  const measureLayer = useRef(null);
  // Effects below re-read the current units and mode without re-subscribing
  // the sketch handlers.
  const unitsRef = useRef({ linearUnit, areaUnit });
  const modeRef = useRef(mode);

  useEffect(() => {
    unitsRef.current = { linearUnit, areaUnit };
    modeRef.current = mode;
  }, [linearUnit, areaUnit, mode]);

  /**
   * Everything a finished (or in-progress) geometry is worth, in the units
   * currently selected. Pure -- the caller decides whether to draw it.
   */
  const describe = useCallback((geometry, forMode) => {
    const { linearUnit: lu, areaUnit: au } = unitsRef.current;

    if (forMode === "distance") {
      const total = Math.abs(geometryEngine.geodesicLength(geometry, lu));
      const legs = segmentsOf(geometry, lu);
      return {
        primary: formatLinear(total, lu),
        secondary: legs.length ? `${legs.length} segment${legs.length > 1 ? "s" : ""}` : "",
        segments: legs.map((len) => formatLinear(len, lu)),
      };
    }

    if (forMode === "radius") {
      const radius = radiusOf(geometry, lu);
      return {
        primary: formatLinear(radius, lu),
        secondary: `Area ${formatArea(Math.abs(geometryEngine.geodesicArea(geometry, au)), au)}`,
        segments: [`Circumference ${formatLinear(perimeterOf(geometry, lu), lu)}`],
      };
    }

    const area = Math.abs(geometryEngine.geodesicArea(geometry, au));
    return {
      primary: formatArea(area, au),
      secondary: `Perimeter ${formatLinear(perimeterOf(geometry, lu), lu)}`,
      segments: [],
    };
  }, []);

  /** Keep the sketched shape, add its vertices and its on-map label. */
  const commitMeasurement = useCallback((geometry, forMode, result, sketchGraphic) => {
    const layer = measureLayer.current;
    if (!layer) return;

    const graphics = [];
    if (sketchGraphic) graphics.push(sketchGraphic);

    if (forMode === "distance") {
      (geometry.paths?.[0] ?? []).forEach(([x, y]) => {
        graphics.push(
          new Graphic({
            geometry: { type: "point", x, y, spatialReference: geometry.spatialReference },
            symbol: vertexSymbol,
          })
        );
      });
    }

    const labelPoint = labelPointFor(geometry);
    if (labelPoint) {
      graphics.push(new Graphic({ geometry: labelPoint, symbol: labelSymbol(result.primary) }));
    }

    // The sketch graphic is already on the layer; only the extras need adding.
    layer.addMany(graphics.filter((g) => g !== sketchGraphic));

    measurementSeq += 1;
    setMeasurements((prev) => [
      ...prev,
      { id: measurementSeq, mode: forMode, geometry, graphics, ...result },
    ]);
  }, []);

  // --- map plumbing -------------------------------------------------------
  useEffect(() => {
    if (!view || !view.map) return undefined;

    measureLayer.current = new GraphicsLayer({
      listMode: "hide",
      title: "Measurement Graphics",
    });
    view.map.add(measureLayer.current);

    sketchVM.current = new SketchViewModel({
      view,
      // The sketch draws straight into the measurement layer and stays there
      // once complete; updateOnGraphicClick stays off because a finished
      // measurement is a record, not something to drag around afterwards.
      layer: measureLayer.current,
      updateOnGraphicClick: false,
      pointSymbol: vertexSymbol,
      polylineSymbol: {
        type: "simple-line",
        color: rgba(1),
        width: 2.5,
        style: "dash",
      },
      polygonSymbol: {
        type: "simple-fill",
        color: rgba(0.15),
        style: "diagonal-cross",
        outline: { color: rgba(1), width: 2.5, style: "dash" },
      },
    });

    const handleCreate = (event) => {
      const geometry = event.graphic?.geometry ?? event.graphics?.[0]?.geometry;
      const activeMode = modeRef.current;

      if (event.state === "cancel") {
        setLive(null);
        setMode(null);
        releaseDrawTool(TOOL_ID);
        return;
      }

      if (!geometry || !activeMode) return;

      // Live readout while the user is still clicking vertices.
      if (event.state === "active") {
        try {
          setLive(describe(geometry, activeMode));
        } catch {
          // Degenerate in-progress geometry (a single vertex, say) -- ignore
          // until there is enough of it to measure.
        }
        return;
      }

      if (event.state !== "complete") return;

      const result = describe(geometry, activeMode);
      commitMeasurement(geometry, activeMode, result, event.graphic);
      setLive(null);
      setMode(null);
      releaseDrawTool(TOOL_ID);
    };

    sketchVM.current.on("create", handleCreate);

    return () => {
      releaseDrawTool(TOOL_ID);
      if (sketchVM.current) {
        sketchVM.current.destroy();
        sketchVM.current = null;
      }
      if (view.map && measureLayer.current) view.map.remove(measureLayer.current);
      measureLayer.current = null;
    };
  }, [view, describe, commitMeasurement]);

  // Another tool took the map -- drop whatever we were drawing.
  useEffect(
    () =>
      onDrawToolChange((owner) => {
        if (owner === TOOL_ID) return;
        if (sketchVM.current?.state === "active") sketchVM.current.cancel();
        setLive(null);
        setMode(null);
      }),
    []
  );

  const startMode = (nextMode) => {
    if (!sketchVM.current) return;
    setHint("");

    // Tapping the active mode again cancels it.
    if (mode === nextMode) {
      sketchVM.current.cancel();
      setMode(null);
      setLive(null);
      releaseDrawTool(TOOL_ID);
      return;
    }

    // Cancel first: cancelling our own sketch fires handleCreate("cancel"),
    // which releases the lock -- doing it after the claim would hand the map
    // straight back.
    if (sketchVM.current.state === "active") sketchVM.current.cancel();
    claimDrawTool(TOOL_ID);

    setMode(nextMode);
    modeRef.current = nextMode;
    setLive(null);
    sketchVM.current.create(MODES[nextMode].tool);
  };

  const removeMeasurement = (id) => {
    setMeasurements((prev) => {
      const target = prev.find((m) => m.id === id);
      if (target && measureLayer.current) {
        target.graphics.forEach((g) => measureLayer.current.remove(g));
      }
      return prev.filter((m) => m.id !== id);
    });
  };

  const clearAll = () => {
    if (sketchVM.current?.state === "active") sketchVM.current.cancel();
    if (measureLayer.current) measureLayer.current.removeAll();
    releaseDrawTool(TOOL_ID);
    setMeasurements([]);
    setLive(null);
    setMode(null);
    setHint("");
  };

  // Re-labelling in new units means re-deriving every kept measurement.
  useEffect(() => {
    if (!measurements.length || !measureLayer.current) return;

    setMeasurements((prev) =>
      prev.map((m) => {
        const next = { ...m, ...describe(m.geometry, m.mode) };
        const label = m.graphics.find((g) => g.symbol?.type === "text");
        if (label) label.symbol = labelSymbol(next.primary);
        return next;
      })
    );
    // Only a unit change should redraw labels; `measurements` is written here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linearUnit, areaUnit]);

  useEffect(() => {
    setHint(view ? "" : "Map is still loading.");
  }, [view]);

  const showAreaUnit = mode === "area" || mode === "radius" || measurements.some((m) => m.mode !== "distance");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ fontSize: "0.78rem", color: "#9aa0a6", lineHeight: 1.4 }}>
        Measures the shape you draw. It does not select or list features &mdash;
        use <strong>Selection Tools</strong> for that.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", ...accentVars }}>
        {Object.entries(MODES).map(([key, cfg]) => (
          <CalciteButton
            key={key}
            appearance={mode === key ? "solid" : "outline"}
            icon-start={cfg.icon}
            onClick={() => startMode(key)}
          >
            {cfg.label}
          </CalciteButton>
        ))}
        {/* Brought the clear button into the grid to perfectly balance the row */}
        <CalciteButton
          appearance="outline"
          kind="neutral"
          icon-start="trash"
          disabled={!measurements.length && !mode ? true : undefined}
          onClick={clearAll}
        >
          Clear
        </CalciteButton>
      </div>

      <CalciteLabel>
        Length unit
        <select
          className="sidebar-select"
          value={linearUnit}
          onChange={(e) => setLinearUnit(e.target.value)}
        >
          {LINEAR_UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </CalciteLabel>

      {showAreaUnit && (
        <CalciteLabel>
          Area unit
          <select
            className="sidebar-select"
            value={areaUnit}
            onChange={(e) => setAreaUnit(e.target.value)}
          >
            {AREA_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </CalciteLabel>
      )}

      {hint && (
        <CalciteNotice open icon="exclamation-mark-triangle" kind="warning">
          <div slot="message">{hint}</div>
        </CalciteNotice>
      )}

      {mode && (
        <div style={liveCardStyle}>
          <div style={{ fontSize: "0.75rem", color: "#ffb84d", letterSpacing: "0.04em" }}>
            {MODES[mode].label.toUpperCase()} &mdash; {mode === "radius" ? "drag from the centre" : "click to add points, double-click to finish"}
          </div>
          <div style={{ fontSize: "1.35rem", fontWeight: 600, color: "#ffc46b", marginTop: "4px" }}>
            {live ? live.primary : "—"}
          </div>
          {live?.secondary && (
            <div style={{ fontSize: "0.8rem", color: "#c8cdd3" }}>{live.secondary}</div>
          )}
        </div>
      )}

      {measurements.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {measurements.map((m, index) => (
            <div key={m.id} style={resultCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontSize: "0.72rem", color: "#9aa0a6", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {MODES[m.mode].label} #{index + 1}
                </span>
                <CalciteButton
                  appearance="transparent"
                  kind="neutral"
                  scale="s"
                  icon-start="trash"
                  onClick={() => removeMeasurement(m.id)}
                  title="Remove this measurement"
                />
              </div>
              <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "#ffc46b" }}>{m.primary}</div>
              {m.secondary && (
                <div style={{ fontSize: "0.8rem", color: "#c8cdd3" }}>{m.secondary}</div>
              )}
              {m.segments.length > 0 && (
                <details style={{ marginTop: "4px" }}>
                  <summary style={{ fontSize: "0.75rem", color: "#9aa0a6", cursor: "pointer" }}>
                    Breakdown
                  </summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: "18px", fontSize: "0.78rem", color: "#c8cdd3" }}>
                    {m.segments.map((seg, i) => (
                      <li key={i}>{m.mode === "distance" ? `Segment ${i + 1}: ${seg}` : seg}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// calcite-button has no amber "kind", so the mode buttons borrow the brand
// tokens. Custom properties inherit into the shadow DOM, so setting them on
// the wrapper is enough to retint every button inside it.
const accentVars = {
  "--calcite-color-brand": "#ff9f1c",
  "--calcite-color-brand-hover": "#ffb84d",
  "--calcite-color-brand-press": "#e08900",
};

const liveCardStyle = {
  padding: "10px 12px",
  backgroundColor: "rgba(255, 168, 0, 0.10)",
  borderLeft: "3px solid rgba(255, 168, 0, 0.9)",
  borderRadius: "4px",
};

const resultCardStyle = {
  padding: "8px 12px",
  backgroundColor: "rgba(255, 168, 0, 0.06)",
  border: "1px solid rgba(255, 168, 0, 0.35)",
  borderRadius: "4px",
};