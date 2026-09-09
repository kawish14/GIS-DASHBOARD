import React, { useState } from "react";
import { CalciteNotice } from "@esri/calcite-components-react";
import { IconField, SwatchField } from "./pickers";
import { CVD_SAFE_UNIQUE_CLASSES, MAX_UNIQUE_CLASSES } from "./symbologyPalettes";

/**
 * The legend, and where a class is edited.
 *
 * Each row is the class as it will read on the map: its symbol, its label, and
 * how much of the layer falls into it. The count is drawn as a bar as well as a
 * number, because "which of these classes actually matter" is the question you
 * ask of a legend, and eight right-aligned numbers answer it far more slowly
 * than eight bars do.
 *
 * Three things are editable in place:
 *   symbol      the colour or picture marker
 *   label       what the legend says -- class ranges read as "0 - 12.4" by
 *               default, which is rarely what you want a map to be captioned
 *   visibility  hiding a class leaves the features there but stops drawing
 *               them, which is how you isolate one class without touching
 *               anything else that reads the layer
 */

export default function ClassList({
  classes,
  mode,
  usePictures,
  hidden,
  sortBy,
  onSortChange,
  onColorChange,
  onIconChange,
  onLabelChange,
  onToggleHidden,
  foldedCount,
}) {
  // The colour-blindness caveat is about hue; picture markers carry shape too.
  const overCvdLimit =
    !usePictures && mode === "unique-value" && classes.length > CVD_SAFE_UNIQUE_CLASSES;
  const peak = Math.max(1, ...classes.map((c) => c.count ?? 0));
  const total = classes.reduce((sum, c) => sum + (c.count ?? 0), 0);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.4rem",
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--calcite-color-text-3, #8a8a86)" }}>
          {total.toLocaleString()} features
        </span>
        {mode === "unique-value" && (
          <select
            aria-label="Sort classes"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            style={{
              fontSize: "11px",
              padding: "1px 4px",
              color: "var(--calcite-color-text-2, #c0c0bd)",
              background: "var(--calcite-color-foreground-2, #2b2b2a)",
              border: "1px solid var(--calcite-color-border-2, #3a3a38)",
              borderRadius: "3px",
            }}
          >
            <option value="count">Most features</option>
            <option value="value">A – Z</option>
          </select>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {classes.map((c) => (
          <ClassRow
            key={c.key}
            klass={c}
            usePictures={usePictures}
            isHidden={hidden.has(c.key)}
            share={(c.count ?? 0) / peak}
            onColorChange={onColorChange}
            onIconChange={onIconChange}
            onLabelChange={onLabelChange}
            onToggleHidden={onToggleHidden}
          />
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
            marginTop: "0.4rem",
            fontSize: "10px",
            lineHeight: 1.4,
            color: "var(--calcite-color-text-3, #8a8a86)",
          }}
        >
          Above {CVD_SAFE_UNIQUE_CLASSES} categories some pairs are hard to tell apart with
          colour vision deficiency — this list is the legend that resolves them.
        </div>
      )}
    </div>
  );
}

function ClassRow({
  klass: c, usePictures, isHidden, share,
  onColorChange, onIconChange, onLabelChange, onToggleHidden,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.label);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== c.label) onLabelChange(c.key, next);
    else setDraft(c.label);
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "3px 4px",
        borderRadius: "3px",
        opacity: isHidden ? 0.4 : 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--calcite-color-foreground-2, #2b2b2a)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {/* How much of the layer this class holds, as a rule under its own
          row in its own colour. A filled block behind the row read as a
          hover state stuck on rather than as a measurement. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute", left: "30px", right: "4px", bottom: "1px",
          height: "2px", pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: `${Math.max(2, share * 100)}%`, height: "100%", borderRadius: "1px",
            background: usePictures ? "var(--calcite-color-brand, #3987e5)" : c.color,
            opacity: 0.7,
          }}
        />
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
        {usePictures ? (
          <IconField icon={c.icon} onChange={(icon) => onIconChange(c.key, icon)} />
        ) : (
          <SwatchField color={c.color} size={c.size} onChange={(color) => onColorChange(c.key, color)} />
        )}

        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraft(c.label); setEditing(false); }
            }}
            style={{
              flex: 1, minWidth: 0, fontSize: "12px", padding: "1px 4px",
              color: "var(--calcite-color-text-1, #f0f0ef)",
              background: "var(--calcite-color-foreground-1, #202020)",
              border: "1px solid var(--calcite-color-brand, #3987e5)",
              borderRadius: "2px",
            }}
          />
        ) : (
          <button
            type="button"
            title={`${c.label} — click to rename`}
            onClick={() => { setDraft(c.label); setEditing(true); }}
            style={{
              flex: 1, minWidth: 0, textAlign: "left", cursor: "text",
              background: "none", border: "none", padding: "1px 0",
              fontSize: "12px", color: "var(--calcite-color-text-1, #f0f0ef)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {c.label}
          </button>
        )}

        <span style={{ fontSize: "11px", color: "var(--calcite-color-text-3, #8a8a86)", flex: "0 0 auto" }}>
          {c.count?.toLocaleString() ?? ""}
        </span>

        <button
          type="button"
          onClick={() => onToggleHidden(c.key)}
          title={isHidden ? "Show on map" : "Hide from map"}
          aria-label={isHidden ? "Show on map" : "Hide from map"}
          aria-pressed={isHidden}
          style={{
            flex: "0 0 auto", width: "20px", height: "20px", padding: 0, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none",
            color: "var(--calcite-color-text-3, #8a8a86)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" />
            <circle cx="8" cy="8" r="1.9" />
            {isHidden && <path d="M2.5 13.5 13.5 2.5" />}
          </svg>
        </button>
      </div>
    </div>
  );
}
