import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalciteButton,
  CalciteColorPicker,
  CalciteInputNumber,
  CalciteLabel,
  CalciteLoader,
  CalciteNotice,
  CalciteOption,
  CalcitePopover,
  CalciteSelect,
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
import { DEFAULT_MARKER_ICON, MARKER_ICONS, pictureSymbol } from "./markerIcons";
import {
  CATEGORICAL_SCHEMES,
  CVD_SAFE_UNIQUE_CLASSES,
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
 *
 * Producing the same config shape buildRenderer already understands is
 * deliberate: what the user builds here is exactly what could be saved into
 * symbology-config.json later, and there is one renderer builder, not two.
 *
 * Scope: changes are live for the session and are NOT persisted -- a reload
 * restores whatever symbology-config.json says. See CODEBASE_GUIDE.md.
 */

const PRIMARY_SYMBOLOGY = [
  { id: "simple", name: "Single Symbol", needsField: false, numericOnly: false },
  { id: "unique-value", name: "Unique Values", needsField: true, numericOnly: false },
  { id: "graduated-color", name: "Graduated Colors", needsField: true, numericOnly: true },
  { id: "graduated-symbol", name: "Graduated Symbols", needsField: true, numericOnly: true },
];

// Only layers that can actually carry a renderer and answer a query.
const SYMBOLIZABLE_LAYER_TYPES = new Set(["feature", "geojson", "csv", "ogc-feature"]);

const MIN_SIZE = 4;
const MAX_SIZE = 28;

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
  const [singleColor, setSingleColor] = useState(DEFAULT_SIMPLE_COLOR);

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
  const [classes, setClasses] = useState([]);
  const [foldedCount, setFoldedCount] = useState(0);
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState(null);

  // Each layer's renderer as it was before this widget first touched it, so
  // "Restore default" is a real restore and not a guess at the original.
  const originalRenderers = useRef(new Map());
  // Guards against an older, slower query overwriting a newer one's classes.
  const queryToken = useRef(0);

  const symbolizableLayers = useMemo(
    () =>
      Object.entries(layers)
        .filter(([, layer]) => layer && SYMBOLIZABLE_LAYER_TYPES.has(layer.type))
        .map(([id, layer]) => ({ id, title: layer.title || id })),
    [layers]
  );

  // Wraps a setter so using the control counts as taking the layer over.
  const edit = useCallback((setter) => (value) => { setHasEdits(true); setter(value); }, []);

  const layer = layerId ? layers[layerId] : null;
  const activeMode = PRIMARY_SYMBOLOGY.find((m) => m.id === mode);
  const selectedField = fields.find((f) => f.name === field) ?? null;
  const isGraduated = mode === "graduated-color" || mode === "graduated-symbol";
  const isPointLayer = ["point", "multipoint"].includes(layer?.geometryType);
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

  /** Reads the column off the layer and rebuilds the class list. */
  const rebuildClasses = useCallback(async () => {
    setError(null);
    setFoldedCount(0);

    if (!layer || !activeMode) return;
    if (mode === "simple") {
      setClasses([]);
      return;
    }
    if (!field) return;
    if (activeMode.numericOnly && !isNumericField(selectedField)) {
      setClasses([]);
      setError("Graduated symbology needs a numeric field.");
      return;
    }

    const token = (queryToken.current += 1);
    setIsBuilding(true);
    try {
      const query = layer.createQuery();
      query.where = "1=1";
      query.outFields = [field];
      query.returnGeometry = false;
      const { features } = await layer.queryFeatures(query);
      if (token !== queryToken.current) return; // a newer request won

      const values = features.map((f) => f.attributes?.[field]);
      const scheme = findScheme(schemeId) ?? schemes[0];

      if (mode === "unique-value") {
        const all = distinctValues(values);
        const shown = all.slice(0, MAX_UNIQUE_CLASSES);
        const colors = sampleScheme(scheme, shown.length, { reverse });
        setFoldedCount(all.length - shown.length);
        setClasses(
          shown.map((entry, i) => ({
            key: String(entry.value),
            label: String(entry.value),
            color: colors[i],
            icon: MARKER_ICONS[i % MARKER_ICONS.length].url,
            count: entry.count,
            value: entry.value,
          }))
        );
      } else {
        const breaks = classifyBreaks(values, method, classCount);
        if (breaks.length === 0) {
          setClasses([]);
          setError("That field has no numeric values to classify.");
          return;
        }
        const colors = sampleScheme(scheme, breaks.length, { reverse });
        const sizeStep = breaks.length > 1 ? (MAX_SIZE - MIN_SIZE) / (breaks.length - 1) : 0;
        setClasses(
          breaks.map((b, i) => ({
            key: `${b.min}-${b.max}`,
            label: `${formatNumber(b.min)} – ${formatNumber(b.max)}`,
            // Graduated symbols hold one colour and vary size; graduated
            // colours do the reverse. Both are class breaks underneath.
            color: mode === "graduated-symbol" ? singleColor : colors[i],
            size: mode === "graduated-symbol" ? Math.round(MIN_SIZE + i * sizeStep) : size,
            icon: singleIcon,
            count: b.count,
            min: b.min,
            max: b.max,
          }))
        );
      }
    } catch (err) {
      if (token === queryToken.current) setError(`Could not read that field: ${err.message}`);
    } finally {
      if (token === queryToken.current) setIsBuilding(false);
    }
  }, [
    layer, activeMode, mode, field, selectedField, schemeId, schemes,
    reverse, method, classCount, size, singleColor, singleIcon,
  ]);

  useEffect(() => {
    rebuildClasses();
  }, [rebuildClasses]);

  // Everything the widget shows, as a config buildRenderer understands.
  const rendererConfig = useMemo(() => {
    if (!layer) return null;

    // A `symbol` key wins over the colour/size fields in buildRenderer, which
    // is how a picture marker gets through unchanged.
    const shape = (color, px) => ({ color, size: px, outlineWidth });
    const forClass = (c) =>
      usePictures ? { symbol: pictureSymbol(c.icon ?? singleIcon, c.size ?? size) } : shape(c.color, c.size ?? size);

    if (mode === "simple") {
      return {
        type: "simple",
        defaultSymbol: usePictures
          ? { symbol: pictureSymbol(singleIcon, size) }
          : { color: singleColor, size, width: outlineWidth || 1, outlineWidth },
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
      values: classes.map((c) => ({ min: c.min, max: c.max, ...forClass(c) })),
    };
  }, [layer, mode, classes, field, singleColor, size, outlineWidth, usePictures, singleIcon]);

  // Applied as you go, like Pro's pane -- there is no Apply button because
  // every control here is cheap and reversible.
  useEffect(() => {
    if (!hasEdits || !layer || !rendererConfig || !view) return;
    if (!originalRenderers.current.has(layerId)) {
      originalRenderers.current.set(layerId, layer.renderer);
    }
    try {
      const renderer = buildRendererFromConfig(rendererConfig, layer.geometryType);
      if (renderer) layer.renderer = renderer;
    } catch (err) {
      setError(`Could not apply symbology: ${err.message}`);
    }
  }, [hasEdits, layer, layerId, rendererConfig, view]);

  const restoreDefault = () => {
    if (!layer) return;
    const original = originalRenderers.current.get(layerId);
    if (original) layer.renderer = original;
    originalRenderers.current.delete(layerId);
    setHasEdits(false);
    setMode("simple");
    setClasses([]);
    setError(null);
  };

  // Picking a different layer to look at is not an edit -- it must not restyle
  // the layer you just switched to.
  const selectLayer = (id) => {
    setHasEdits(false);
    setLayerId(id);
  };

  const setClassColor = (key, color) => {
    setHasEdits(true);
    setClasses((prev) => prev.map((c) => (c.key === key ? { ...c, color } : c)));
  };

  const setClassIcon = (key, icon) => {
    setHasEdits(true);
    setClasses((prev) => prev.map((c) => (c.key === key ? { ...c, icon } : c)));
  };

  if (symbolizableLayers.length === 0) {
    return (
      <CalciteNotice open icon="information" scale="s">
        <div slot="message">No symbolizable layers are loaded yet.</div>
      </CalciteNotice>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <CalciteLabel scale="s">
        Layer
        <CalciteSelect
          label="Layer"
          scale="s"
          value={layerId}
          onCalciteSelectChange={(e) => selectLayer(e.target.value)}
        >
          {symbolizableLayers.map((l) => (
            <CalciteOption key={l.id} value={l.id}>{l.title}</CalciteOption>
          ))}
        </CalciteSelect>
      </CalciteLabel>

      <CalciteLabel scale="s">
        Primary symbology
        <CalciteSelect
          label="Primary symbology"
          scale="s"
          value={mode}
          onCalciteSelectChange={(e) => edit(setMode)(e.target.value)}
        >
          {PRIMARY_SYMBOLOGY.map((m) => (
            <CalciteOption key={m.id} value={m.id}>{m.name}</CalciteOption>
          ))}
        </CalciteSelect>
      </CalciteLabel>

      {activeMode?.needsField && (
        <CalciteLabel scale="s">
          Field
          <CalciteSelect
            label="Field"
            scale="s"
            value={field}
            onCalciteSelectChange={(e) => edit(setField)(e.target.value)}
          >
            {fields
              .filter((f) => !activeMode.numericOnly || isNumericField(f))
              .map((f) => (
                <CalciteOption key={f.name} value={f.name}>{f.alias}</CalciteOption>
              ))}
          </CalciteSelect>
        </CalciteLabel>
      )}

      {isGraduated && (
        <>
          <CalciteLabel scale="s">
            Method
            <CalciteSelect
              label="Method"
              scale="s"
              value={method}
              onCalciteSelectChange={(e) => edit(setMethod)(e.target.value)}
            >
              {CLASSIFICATION_METHODS.map((m) => (
                <CalciteOption key={m.id} value={m.id}>{m.name}</CalciteOption>
              ))}
            </CalciteSelect>
          </CalciteLabel>

          <CalciteLabel scale="s">
            Classes
            <CalciteInputNumber
              scale="s"
              min={2}
              max={9}
              value={String(classCount)}
              onCalciteInputNumberChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) edit(setClassCount)(Math.min(9, Math.max(2, n)));
              }}
            />
          </CalciteLabel>
        </>
      )}

      {allowsPictures && (
        <CalciteLabel scale="s">
          Symbol type
          <CalciteSelect
            label="Symbol type"
            scale="s"
            value={symbolStyle}
            onCalciteSelectChange={(e) => edit(setSymbolStyle)(e.target.value)}
          >
            <CalciteOption value="shape">Shape</CalciteOption>
            <CalciteOption value="picture">Picture marker</CalciteOption>
          </CalciteSelect>
        </CalciteLabel>
      )}

      {mode !== "simple" && mode !== "graduated-symbol" && !usePictures && (
        <>
          <CalciteLabel scale="s">
            Color scheme
            <CalciteSelect
              label="Color scheme"
              scale="s"
              value={schemeId}
              onCalciteSelectChange={(e) => edit(setSchemeId)(e.target.value)}
            >
              {schemes.map((s) => (
                <CalciteOption key={s.id} value={s.id}>{s.name}</CalciteOption>
              ))}
            </CalciteSelect>
          </CalciteLabel>
          <CalciteLabel layout="inline" scale="s">
            <CalciteSwitch
              scale="s"
              checked={reverse ? true : undefined}
              onCalciteSwitchChange={(e) => edit(setReverse)(e.target.checked)}
            />
            Reverse colors
          </CalciteLabel>
        </>
      )}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <CalciteLabel scale="s" style={{ flex: 1 }}>
          {mode === "graduated-symbol" ? "Max size" : "Symbol size"}
          <CalciteInputNumber
            scale="s"
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={String(size)}
            onCalciteInputNumberChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) edit(setSize)(Math.min(MAX_SIZE, Math.max(MIN_SIZE, n)));
            }}
          />
        </CalciteLabel>
        <CalciteLabel scale="s" style={{ flex: 1 }}>
          Outline
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
        </CalciteLabel>
      </div>

      {(mode === "simple" || mode === "graduated-symbol") &&
        (usePictures ? (
          <IconField label="Marker" icon={singleIcon} onChange={edit(setSingleIcon)} />
        ) : (
          <SwatchField label="Color" color={singleColor} onChange={edit(setSingleColor)} />
        ))}

      {error && (
        <CalciteNotice open kind="danger" icon="exclamation-mark-triangle" scale="s">
          <div slot="message">{error}</div>
        </CalciteNotice>
      )}

      {isBuilding && <CalciteLoader label="Reading field values" scale="s" inline />}

      {!isBuilding && classes.length > 0 && (
        <ClassList
          classes={classes}
          mode={mode}
          usePictures={usePictures}
          onColorChange={setClassColor}
          onIconChange={setClassIcon}
          foldedCount={foldedCount}
        />
      )}

      <CalciteButton
        appearance="outline"
        kind="neutral"
        scale="s"
        width="full"
        iconStart="reset"
        onClick={restoreDefault}
      >
        Restore default symbology
      </CalciteButton>
    </div>
  );
}

/** The legend, and the only place a class colour can be edited. */
function ClassList({ classes, mode, usePictures, onColorChange, onIconChange, foldedCount }) {
  // The colour-blindness caveat is about hue; picture markers carry shape too.
  const overCvdLimit =
    !usePictures && mode === "unique-value" && classes.length > CVD_SAFE_UNIQUE_CLASSES;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "var(--text-muted, #a0aab7)",
          marginBottom: "0.35rem",
        }}
      >
        <span>{classes.length} classes</span>
        <span>features</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {classes.map((c) => (
          <div
            key={c.key}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "2px 0" }}
          >
            {usePictures ? (
              <IconField icon={c.icon} onChange={(icon) => onIconChange(c.key, icon)} />
            ) : (
              <SwatchField
                color={c.color}
                size={c.size}
                onChange={(color) => onColorChange(c.key, color)}
              />
            )}
            <span
              title={c.label}
              style={{
                flex: 1, minWidth: 0, fontSize: "12px", color: "#e2e8f0",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {c.label}
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted, #a0aab7)" }}>
              {c.count?.toLocaleString() ?? ""}
            </span>
          </div>
        ))}
      </div>

      {foldedCount > 0 && (
        <CalciteNotice open icon="information" scale="s" style={{ marginTop: "0.5rem" }}>
          <div slot="message">
            {foldedCount} rarer {foldedCount === 1 ? "value is" : "values are"} drawn as
            &ldquo;Other&rdquo;. Past {MAX_UNIQUE_CLASSES} classes the map stops being readable
            at a glance.
          </div>
        </CalciteNotice>
      )}

      {overCvdLimit && (
        <div
          style={{
            marginTop: "0.4rem", fontSize: "10px", lineHeight: 1.4,
            color: "var(--text-muted, #a0aab7)",
          }}
        >
          Above {CVD_SAFE_UNIQUE_CLASSES} categories some pairs are hard to tell apart with
          colour vision deficiency — this list is the legend that resolves them.
        </div>
      )}
    </div>
  );
}

/** Picks one of the bundled picture markers. The picture-symbol twin of SwatchField. */
function IconField({ label, icon, onChange }) {
  const [open, setOpen] = useState(false);
  const idRef = useRef(`icon-${Math.random().toString(36).slice(2)}`);

  return (
    <>
      {label && (
        <span style={{ fontSize: "12px", color: "var(--text-muted, #a0aab7)", marginRight: "0.5rem" }}>
          {label}
        </span>
      )}
      <button
        type="button"
        id={idRef.current}
        onClick={() => setOpen((v) => !v)}
        title="Change marker"
        aria-label={label ? `Change ${label}` : "Change class marker"}
        style={{
          flex: "0 0 auto", width: "24px", height: "24px", padding: 0, cursor: "pointer",
          borderRadius: "4px", border: "1px solid var(--border-color, #2d3748)",
          background: "transparent", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <img src={icon} alt="" style={{ maxWidth: "18px", maxHeight: "18px" }} />
      </button>
      <CalcitePopover
        open={open ? true : undefined}
        referenceElement={idRef.current}
        placement="leading-start"
        overlayPositioning="fixed"
        onCalcitePopoverClose={() => setOpen(false)}
      >
        <div
          style={{
            display: "grid", gridTemplateColumns: "repeat(4, 40px)", gap: "4px", padding: "8px",
          }}
        >
          {MARKER_ICONS.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.name}
              onClick={() => { onChange(m.url); setOpen(false); }}
              style={{
                width: "40px", height: "40px", cursor: "pointer", borderRadius: "4px",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: m.url === icon ? "rgba(59,130,246,0.25)" : "transparent",
                border: `1px solid ${m.url === icon ? "var(--text-highlight, #38bdf8)" : "transparent"}`,
              }}
            >
              <img src={m.url} alt={m.name} style={{ maxWidth: "24px", maxHeight: "24px" }} />
            </button>
          ))}
        </div>
      </CalcitePopover>
    </>
  );
}

/** A colour chip that opens a picker. Doubles as the class size preview. */
function SwatchField({ label, color, size, onChange }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const idRef = useRef(`swatch-${Math.random().toString(36).slice(2)}`);
  const dot = Math.min(18, Math.max(8, size ?? 14));

  return (
    <>
      {label && (
        <span style={{ fontSize: "12px", color: "var(--text-muted, #a0aab7)", marginRight: "0.5rem" }}>
          {label}
        </span>
      )}
      <button
        type="button"
        id={idRef.current}
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        title="Change color"
        aria-label={label ? `Change ${label}` : "Change class color"}
        style={{
          flex: "0 0 auto", width: "24px", height: "24px", padding: 0, cursor: "pointer",
          borderRadius: "4px", border: "1px solid var(--border-color, #2d3748)",
          background: "transparent", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span
          style={{
            width: `${dot}px`, height: `${dot}px`, borderRadius: "50%",
            background: color, border: "1px solid rgba(255,255,255,0.35)",
          }}
        />
      </button>
      <CalcitePopover
        open={open ? true : undefined}
        referenceElement={idRef.current}
        placement="leading-start"
        overlayPositioning="fixed"
        onCalcitePopoverClose={() => setOpen(false)}
      >
        <CalciteColorPicker
          scale="s"
          format="hex"
          value={color}
          onCalciteColorPickerChange={(e) => onChange(String(e.target.value))}
        />
      </CalcitePopover>
    </>
  );
}
