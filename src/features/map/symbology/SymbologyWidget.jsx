import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalciteBlock,
  CalciteButton,
  CalciteInputNumber,
  CalciteLoader,
  CalciteNotice,
  CalciteOption,
  CalciteSelect,
  CalciteSlider,
  CalciteSwitch,
} from "@esri/calcite-components-react";
import { useLayers } from "../state/LayersContext";
import { useMapView } from "../state/MapViewContext";
import { buildRendererFromConfig } from "./buildRenderer";
import {
  CLASSIFICATION_METHODS,
  classifyBreaks,
  distinctValues,
  formatNumber,
  isNumericField,
  symbolizableFields,
} from "./classify";
import { DEFAULT_MARKER_ICON, pictureSymbol } from "./markerIcons";
import { IconField, SwatchField } from "./pickers";
import ClassList from "./ClassList";
import Histogram from "./Histogram";
import SymbolPreview from "./SymbolPreview";
import {
  CATEGORICAL_SCHEMES,
  DEFAULT_OTHER_COLOR,
  DEFAULT_SIMPLE_COLOR,
  MAX_UNIQUE_CLASSES,
  SEQUENTIAL_SCHEMES,
  findScheme,
  sampleScheme,
} from "./symbologyPalettes";

/**
 * Draw a layer by one of its columns, the way ArcGIS Pro's Symbology pane does.
 * Rendered as its own tab in the right sidebar.
 *
 * Four ways to draw (`PRIMARY_SYMBOLOGY`), matching Pro's vocabulary:
 * a single symbol, unique values from a categorical column, graduated colours
 * from a numeric one, or graduated sizes from a numeric one.
 *
 * How it fits together:
 *   classify.js            values -> classes (pure, no ArcGIS)
 *   symbologyPalettes.js   which colours, and why those (validated)
 *   buildRenderer.js       class list -> an ArcGIS renderer, already used by
 *                          SymbologyLayer.jsx for the server-side config
 *   Histogram / SymbolPreview / ClassList   what the pane shows
 *
 * Producing the same config shape buildRenderer already understands is
 * deliberate: what the user builds here is exactly what could be saved into
 * symbology-config.json later, and there is one renderer builder, not two.
 *
 * READING THE FIELD vs BUILDING THE CLASSES are separate on purpose. The read
 * is a queryFeatures over the whole layer and depends only on which layer and
 * which column; everything downstream -- method, class count, palette, sizes,
 * colours -- is a pure recompute over the values already in hand. Folding the
 * two together meant nudging the symbol size re-queried a six-figure layer.
 *
 * Per-class edits live in `overrides`, keyed by class, so recomputing the
 * classes keeps the colours and names the user chose instead of discarding
 * them on the next slider drag.
 *
 * Scope: changes are live for the session and are NOT persisted -- a reload
 * restores whatever symbology-config.json says. See CODEBASE_GUIDE.md.
 */

const PRIMARY_SYMBOLOGY = [
  { id: "simple", name: "Single", hint: "One symbol for every feature", needsField: false, numericOnly: false },
  { id: "unique-value", name: "Categories", hint: "A colour per distinct value", needsField: true, numericOnly: false },
  { id: "graduated-color", name: "Colour ramp", hint: "Graduated colours across a number", needsField: true, numericOnly: true },
  { id: "graduated-symbol", name: "Size ramp", hint: "Graduated symbol sizes across a number", needsField: true, numericOnly: true },
];

// Only layers that can actually carry a renderer and answer a query.
const SYMBOLIZABLE_LAYER_TYPES = new Set(["feature", "geojson", "csv", "ogc-feature"]);

const MIN_SIZE = 4;
const MAX_SIZE = 28;

// Drawn instead of the class's own symbol when it is hidden. Transparent in
// every channel buildSymbol might reach for, so it disappears for points,
// lines and fills alike -- the features stay in the layer, so the feature
// table and identify still see them.
const HIDDEN_SYMBOL = { color: [0, 0, 0, 0], outlineColor: [0, 0, 0, 0], outlineWidth: 0, size: 1, width: 0 };

export default function SymbologyWidget() {
  const { view } = useMapView();
  const { layers } = useLayers();

  const [layerId, setLayerId] = useState("");
  const [mode, setMode] = useState("simple");
  const [field, setField] = useState("");
  const [method, setMethod] = useState("natural-breaks");
  const [classCount, setClassCount] = useState(5);
  const [schemeId, setSchemeId] = useState("default");
  const [reverse, setReverse] = useState(false);
  const [size, setSize] = useState(8);
  const [outlineWidth, setOutlineWidth] = useState(0.5);
  const [outlineColor, setOutlineColor] = useState("#ffffff");
  const [singleColor, setSingleColor] = useState(DEFAULT_SIMPLE_COLOR);
  const [opacity, setOpacity] = useState(1);
  const [sortBy, setSortBy] = useState("count");

  // Point layers are drawn with picture markers by default in this app, so the
  // widget can produce them too rather than only coloured shapes.
  const [symbolStyle, setSymbolStyle] = useState("shape");
  const [singleIcon, setSingleIcon] = useState(DEFAULT_MARKER_ICON);

  // NOTHING is applied to a layer until the user actually asks for it.
  // Without this latch the widget mounted with a default Single Symbol config
  // and immediately overwrote the first layer's renderer -- which on the
  // customer layer meant replacing its alarm-state picture markers with plain
  // circles the moment the app started, since sidebar tabs stay mounted.
  const [hasEdits, setHasEdits] = useState(false);

  const [fields, setFields] = useState([]);
  const [rawValues, setRawValues] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [hiddenKeys, setHiddenKeys] = useState(() => new Set());
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState(null);

  // Each layer's renderer and opacity as they were before this widget first
  // touched them, so "Restore default" is a real restore, not a guess.
  const originalStyles = useRef(new Map());
  // Guards against an older, slower query overwriting a newer one's values.
  const queryToken = useRef(0);

  const symbolizableLayers = useMemo(
    () =>
      Object.entries(layers)
        .filter(([, layer]) => layer && SYMBOLIZABLE_LAYER_TYPES.has(layer.type))
        .map(([id, layer]) => ({ id, title: layer.title || id, geometryType: layer.geometryType })),
    [layers]
  );

  // Wraps a setter so using the control counts as taking the layer over.
  const edit = useCallback((setter) => (value) => { setHasEdits(true); setter(value); }, []);

  const layer = layerId ? layers[layerId] : null;
  const activeMode = PRIMARY_SYMBOLOGY.find((m) => m.id === mode);
  const selectedField = fields.find((f) => f.name === field) ?? null;
  const isGraduated = mode === "graduated-color" || mode === "graduated-symbol";
  const isPointLayer = ["point", "multipoint"].includes(layer?.geometryType);
  const isLineLayer = layer?.geometryType === "polyline";
  // A colour ramp can't tint a picture, so graduated colours stay shapes.
  const allowsPictures = isPointLayer && mode !== "graduated-color";
  const usePictures = allowsPictures && symbolStyle === "picture";
  const schemes = mode === "unique-value" ? CATEGORICAL_SCHEMES : SEQUENTIAL_SCHEMES;

  useEffect(() => {
    if (!layerId && symbolizableLayers.length > 0) setLayerId(symbolizableLayers[0].id);
  }, [symbolizableLayers, layerId]);

  // Field list follows the layer. Layers load lazily, so this waits for load().
  useEffect(() => {
    if (!layer) {
      setFields([]);
      return undefined;
    }
    let active = true;
    layer
      .load()
      .then(() => {
        if (!active) return;
        const next = symbolizableFields(layer);
        setFields(next);
        setField((current) => (next.some((f) => f.name === current) ? current : next[0]?.name ?? ""));
      })
      .catch((err) => active && setError(`Could not read fields: ${err.message}`));
    return () => {
      active = false;
    };
  }, [layer]);

  // Keep the scheme valid for the mode -- categorical and sequential schemes
  // are not interchangeable.
  useEffect(() => {
    setSchemeId((current) => (schemes.some((s) => s.id === current) ? current : schemes[0].id));
  }, [schemes]);

  // A numeric mode can't run on a text column; fall back to the first numeric one.
  useEffect(() => {
    if (!activeMode?.numericOnly || fields.length === 0) return;
    if (isNumericField(selectedField)) return;
    const numeric = fields.find(isNumericField);
    if (numeric) setField(numeric.name);
  }, [activeMode, fields, selectedField]);

  // --- STEP 1: read the column. Only the layer and the field can trigger this.
  useEffect(() => {
    if (!layer || mode === "simple" || !field) {
      setRawValues([]);
      return undefined;
    }
    let active = true;
    const token = (queryToken.current += 1);
    setIsReading(true);
    setError(null);

    layer
      .load()
      .then(() => {
        const query = layer.createQuery();
        query.where = "1=1";
        query.outFields = [field];
        query.returnGeometry = false;
        return layer.queryFeatures(query);
      })
      .then(({ features }) => {
        if (!active || token !== queryToken.current) return; // a newer request won
        setRawValues(features.map((f) => f.attributes?.[field]));
      })
      .catch((err) => {
        if (active && token === queryToken.current) setError(`Could not read that field: ${err.message}`);
      })
      .finally(() => {
        if (active && token === queryToken.current) setIsReading(false);
      });

    return () => {
      active = false;
    };
  }, [layer, field, mode]);

  // --- STEP 2: classify. Pure, over values already in hand.
  const { classes: computedClasses, foldedCount, numericValues } = useMemo(() => {
    const empty = { classes: [], foldedCount: 0, numericValues: [] };
    if (mode === "simple" || rawValues.length === 0) return empty;
    if (activeMode?.numericOnly && !isNumericField(selectedField)) return empty;

    const scheme = findScheme(schemeId) ?? schemes[0];

    if (mode === "unique-value") {
      const all = distinctValues(rawValues);
      // Which values keep their own colour is decided by frequency -- the
      // rarest are the ones folded into "Other" -- so the palette is assigned
      // before any display sort, and re-sorting the list never recolours it.
      const shown = all.slice(0, MAX_UNIQUE_CLASSES);
      const colors = sampleScheme(scheme, shown.length, { reverse });
      const built = shown.map((entry, i) => ({
        key: String(entry.value),
        label: String(entry.value),
        color: colors[i],
        size,
        icon: singleIcon,
        count: entry.count,
        value: entry.value,
      }));
      if (sortBy === "value") {
        built.sort((a, b) => String(a.value).localeCompare(String(b.value), undefined, { numeric: true }));
      }
      return { classes: built, foldedCount: all.length - shown.length, numericValues: [] };
    }

    const numbers = rawValues
      .map((v) => (typeof v === "number" ? v : Number(v)))
      .filter(Number.isFinite);
    const breaks = classifyBreaks(rawValues, method, classCount);
    if (breaks.length === 0) return { ...empty, numericValues: numbers };

    const colors = sampleScheme(scheme, breaks.length, { reverse });
    const sizeStep = breaks.length > 1 ? (size - MIN_SIZE) / (breaks.length - 1) : 0;
    return {
      classes: breaks.map((b, i) => ({
        key: `${b.min}-${b.max}`,
        label: `${formatNumber(b.min)} – ${formatNumber(b.max)}`,
        // Graduated symbols hold one colour and vary size; graduated colours
        // do the reverse. Both are class breaks underneath.
        color: mode === "graduated-symbol" ? singleColor : colors[i],
        size: mode === "graduated-symbol" ? Math.round(MIN_SIZE + i * sizeStep) : size,
        icon: singleIcon,
        count: b.count,
        min: b.min,
        max: b.max,
      })),
      foldedCount: 0,
      numericValues: numbers,
    };
  }, [
    rawValues, mode, activeMode, selectedField, schemeId, schemes,
    reverse, method, classCount, size, singleColor, singleIcon, sortBy,
  ]);

  // --- STEP 3: lay the user's own edits over the computed classes.
  const classes = useMemo(
    () => computedClasses.map((c) => (overrides[c.key] ? { ...c, ...overrides[c.key] } : c)),
    [computedClasses, overrides]
  );

  const numericFieldSelected = isNumericField(selectedField);
  const classesUnavailable =
    mode !== "simple" && !isReading && rawValues.length > 0 && classes.length === 0;

  // Everything the widget shows, as a config buildRenderer understands.
  const rendererConfig = useMemo(() => {
    if (!layer) return null;

    // A `symbol` key wins over the colour/size fields in buildRenderer, which
    // is how a picture marker gets through unchanged. `width` is what a line
    // symbol reads its thickness from, so it is sent alongside `size`.
    const shape = (color, px) => ({ color, size: px, width: px, outlineColor, outlineWidth });
    const forClass = (c) => {
      if (hiddenKeys.has(c.key)) return HIDDEN_SYMBOL;
      return usePictures
        ? { symbol: pictureSymbol(c.icon ?? singleIcon, c.size ?? size) }
        : shape(c.color, c.size ?? size);
    };

    if (mode === "simple") {
      return {
        type: "simple",
        defaultSymbol: usePictures
          ? { symbol: pictureSymbol(singleIcon, size) }
          : shape(singleColor, size),
      };
    }
    if (classes.length === 0) return null;

    const fallback = usePictures
      ? { symbol: pictureSymbol(singleIcon, size) }
      : shape(DEFAULT_OTHER_COLOR, size);

    if (mode === "unique-value") {
      return {
        type: "unique-value",
        field,
        defaultSymbol: fallback,
        values: classes.map((c) => ({ value: c.value, label: c.label, ...forClass(c) })),
      };
    }
    return {
      type: "class-breaks",
      field,
      defaultSymbol: fallback,
      values: classes.map((c) => ({ min: c.min, max: c.max, label: c.label, ...forClass(c) })),
    };
  }, [
    layer, mode, classes, field, singleColor, size, outlineColor, outlineWidth,
    usePictures, singleIcon, hiddenKeys,
  ]);

  // Applied as you go, like Pro's pane -- there is no Apply button because
  // every control here is cheap and reversible.
  useEffect(() => {
    if (!hasEdits || !layer || !rendererConfig || !view) return;
    if (!originalStyles.current.has(layerId)) {
      originalStyles.current.set(layerId, { renderer: layer.renderer, opacity: layer.opacity });
    }
    try {
      const renderer = buildRendererFromConfig(rendererConfig, layer.geometryType);
      if (renderer) layer.renderer = renderer;
      layer.opacity = opacity;
    } catch (err) {
      setError(`Could not apply symbology: ${err.message}`);
    }
  }, [hasEdits, layer, layerId, rendererConfig, view, opacity]);

  const restoreDefault = () => {
    if (!layer) return;
    const original = originalStyles.current.get(layerId);
    if (original) {
      // Assigned even when the layer had no renderer of its own: null is how
      // you hand it back to its default, and skipping the assignment left our
      // renderer in place with nothing able to remove it.
      layer.renderer = original.renderer ?? null;
      layer.opacity = original.opacity ?? 1;
      setOpacity(original.opacity ?? 1);
    }
    originalStyles.current.delete(layerId);
    setHasEdits(false);
    setMode("simple");
    setOverrides({});
    setHiddenKeys(new Set());
    setError(null);
  };

  // Picking a different layer to look at is not an edit -- it must not restyle
  // the layer you just switched to.
  const selectLayer = (id) => {
    setHasEdits(false);
    setLayerId(id);
    setOverrides({});
    setHiddenKeys(new Set());
    setRawValues([]);
    setOpacity(layers[id]?.opacity ?? 1);
  };

  const override = (key, patch) => {
    setHasEdits(true);
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };
  const setClassColor = (key, color) => override(key, { color });
  const setClassIcon = (key, icon) => override(key, { icon });
  const setClassLabel = (key, label) => override(key, { label });

  const toggleHidden = (key) => {
    setHasEdits(true);
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (symbolizableLayers.length === 0) {
    return (
      <CalciteNotice open icon="information" scale="s">
        <div slot="message">No symbolizable layers are loaded yet.</div>
      </CalciteNotice>
    );
  }

  const sizeLabel = isLineLayer ? "Line width" : mode === "graduated-symbol" ? "Largest size" : "Symbol size";
  const previewClass = classes[Math.floor(classes.length / 2)] ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* --- Layer, and how to draw it. Always visible: these two choices
              frame everything below, so they don't belong in a section that
              can be collapsed away from them. --- */}
      <div style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--calcite-color-border-3, #2b2b2a)" }}>
        <FieldLabel>Layer</FieldLabel>
        <CalciteSelect label="Layer" scale="s" value={layerId} onCalciteSelectChange={(e) => selectLayer(e.target.value)}>
          {symbolizableLayers.map((l) => (
            <CalciteOption key={l.id} value={l.id}>{l.title}</CalciteOption>
          ))}
        </CalciteSelect>

        <div style={{ height: "0.6rem" }} />

        <FieldLabel>Draw by</FieldLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          {PRIMARY_SYMBOLOGY.map((m) => {
            const isActive = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                title={m.hint}
                onClick={() => edit(setMode)(m.id)}
                style={{
                  padding: "6px 8px", cursor: "pointer", borderRadius: "3px", textAlign: "left",
                  fontSize: "11.5px", lineHeight: 1.2,
                  color: isActive ? "#fff" : "var(--calcite-color-text-2, #c0c0bd)",
                  background: isActive ? "var(--calcite-color-brand, #3987e5)" : "var(--calcite-color-foreground-2, #2b2b2a)",
                  border: `1px solid ${isActive ? "var(--calcite-color-brand, #3987e5)" : "var(--calcite-color-border-2, #3a3a38)"}`,
                }}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* --- The symbol itself, shown rather than described. --- */}
      <CalciteBlock scale="s" heading="Symbol" open collapsible>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", padding: "0.15rem 0" }}>
          <SymbolPreview
            geometryType={layer?.geometryType}
            color={previewClass?.color ?? singleColor}
            size={previewClass?.size ?? size}
            outlineColor={outlineColor}
            outlineWidth={outlineWidth}
            iconUrl={usePictures ? previewClass?.icon ?? singleIcon : null}
            opacity={opacity}
          />

          {allowsPictures && (
            <Row label="Symbol type">
              <CalciteSelect label="Symbol type" scale="s" value={symbolStyle} onCalciteSelectChange={(e) => edit(setSymbolStyle)(e.target.value)}>
                <CalciteOption value="shape">Shape</CalciteOption>
                <CalciteOption value="picture">Picture marker</CalciteOption>
              </CalciteSelect>
            </Row>
          )}

          {(mode === "simple" || mode === "graduated-symbol") && (
            <Row label={usePictures ? "Marker" : "Colour"}>
              {usePictures ? (
                <IconField icon={singleIcon} onChange={edit(setSingleIcon)} box={26} />
              ) : (
                <SwatchField color={singleColor} onChange={edit(setSingleColor)} box={26} />
              )}
            </Row>
          )}

          <Slider
            label={sizeLabel}
            value={size}
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={1}
            onChange={edit(setSize)}
            format={(v) => `${v} px`}
          />

          {!usePictures && (
            <Row label="Outline">
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <SwatchField color={outlineColor} onChange={edit(setOutlineColor)} box={26} title="Outline colour" />
                <CalciteInputNumber
                  scale="s"
                  min={0}
                  max={4}
                  step={0.5}
                  value={String(outlineWidth)}
                  onCalciteInputNumberChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) edit(setOutlineWidth)(Math.min(4, Math.max(0, n)));
                  }}
                />
              </div>
            </Row>
          )}

          <Slider
            label="Layer opacity"
            value={Math.round(opacity * 100)}
            min={0}
            max={100}
            step={5}
            onChange={(v) => edit(setOpacity)(v / 100)}
            format={(v) => `${v}%`}
          />
        </div>
      </CalciteBlock>

      {/* --- Which column, cut how. --- */}
      {activeMode?.needsField && (
        <CalciteBlock scale="s" heading="Classification" open collapsible>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", padding: "0.15rem 0" }}>
            <Row label="Field">
              <CalciteSelect label="Field" scale="s" value={field} onCalciteSelectChange={(e) => edit(setField)(e.target.value)}>
                {fields
                  .filter((f) => !activeMode.numericOnly || isNumericField(f))
                  .map((f) => (
                    <CalciteOption key={f.name} value={f.name}>{f.alias}</CalciteOption>
                  ))}
              </CalciteSelect>
            </Row>

            {isGraduated && (
              <>
                <Row label="Method">
                  <CalciteSelect label="Method" scale="s" value={method} onCalciteSelectChange={(e) => edit(setMethod)(e.target.value)}>
                    {CLASSIFICATION_METHODS.map((m) => (
                      <CalciteOption key={m.id} value={m.id}>{m.name}</CalciteOption>
                    ))}
                  </CalciteSelect>
                </Row>

                <Slider
                  label="Classes"
                  value={classCount}
                  min={2}
                  max={9}
                  step={1}
                  onChange={edit(setClassCount)}
                  format={(v) => String(v)}
                />

                {numericFieldSelected && numericValues.length > 0 && (
                  <div>
                    <FieldLabel>Distribution</FieldLabel>
                    <Histogram values={numericValues} breaks={classes} />
                  </div>
                )}
              </>
            )}

            {mode !== "graduated-symbol" && !usePictures && (
              <>
                <Row label="Colour scheme">
                  <CalciteSelect label="Colour scheme" scale="s" value={schemeId} onCalciteSelectChange={(e) => edit(setSchemeId)(e.target.value)}>
                    {schemes.map((s) => (
                      <CalciteOption key={s.id} value={s.id}>{s.name}</CalciteOption>
                    ))}
                  </CalciteSelect>
                </Row>
                <Row label="Reverse colours">
                  <CalciteSwitch
                    scale="s"
                    checked={reverse ? true : undefined}
                    onCalciteSwitchChange={(e) => edit(setReverse)(e.target.checked)}
                  />
                </Row>
              </>
            )}
          </div>
        </CalciteBlock>
      )}

      {/* --- The legend, and where a class gets recoloured, renamed or hidden. --- */}
      {mode !== "simple" && (
        <CalciteBlock
          scale="s"
          heading="Legend"
          description={classes.length ? `${classes.length} classes` : undefined}
          open
          collapsible
        >
          {isReading && <CalciteLoader label="Reading field values" scale="s" inline />}
          {!isReading && classes.length > 0 && (
            <ClassList
              classes={classes}
              mode={mode}
              usePictures={usePictures}
              hidden={hiddenKeys}
              sortBy={sortBy}
              onSortChange={setSortBy}
              onColorChange={setClassColor}
              onIconChange={setClassIcon}
              onLabelChange={setClassLabel}
              onToggleHidden={toggleHidden}
              foldedCount={foldedCount}
            />
          )}
          {classesUnavailable && (
            <div style={{ fontSize: "11.5px", color: "var(--calcite-color-text-3, #8a8a86)" }}>
              {activeMode?.numericOnly && !numericFieldSelected
                ? "Graduated symbology needs a numeric field."
                : "That field has nothing to classify."}
            </div>
          )}
        </CalciteBlock>
      )}

      {error && (
        <div style={{ padding: "0.5rem 0.75rem" }}>
          <CalciteNotice open kind="danger" icon="exclamation-mark-triangle" scale="s">
            <div slot="message">{error}</div>
          </CalciteNotice>
        </div>
      )}

      <div style={{ padding: "0.6rem 0.75rem", borderTop: "1px solid var(--calcite-color-border-3, #2b2b2a)" }}>
        <CalciteButton
          appearance="outline"
          kind="neutral"
          scale="s"
          width="full"
          iconStart="reset"
          disabled={!hasEdits ? true : undefined}
          onClick={restoreDefault}
        >
          Restore default symbology
        </CalciteButton>
      </div>
    </div>
  );
}

/** Small caps-ish field caption. Calcite's own label is too loud at this density. */
function FieldLabel({ children }) {
  return (
    <div
      style={{
        fontSize: "10.5px",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--calcite-color-text-3, #8a8a86)",
        marginBottom: "0.25rem",
      }}
    >
      {children}
    </div>
  );
}

/** Caption above its control, so the value is the thing that stands out. */
function Row({ label, children }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

/** A slider with its current value beside the caption. */
function Slider({ label, value, min, max, step, onChange, format }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <FieldLabel>{label}</FieldLabel>
        <span style={{ fontSize: "11px", color: "var(--calcite-color-text-2, #c0c0bd)" }}>
          {format ? format(value) : value}
        </span>
      </div>
      <CalciteSlider
        scale="s"
        min={min}
        max={max}
        step={step}
        value={value}
        onCalciteSliderInput={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </div>
  );
}
