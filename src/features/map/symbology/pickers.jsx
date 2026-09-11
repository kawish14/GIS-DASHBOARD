import React, { useRef, useState } from "react";
import { CalciteColorPicker, CalcitePopover } from "@esri/calcite-components-react";
import { MARKER_ICONS } from "./markerIcons";

/**
 * The two swatch controls the symbology pane edits symbols through.
 *
 * Both are the same shape on purpose -- a chip you click, and a popover with
 * the choices -- so a colour class and a picture-marker class read as the same
 * kind of control in the legend even though one paints and the other picks an
 * image.
 */

const CHIP = {
  flex: "0 0 auto",
  padding: 0,
  cursor: "pointer",
  borderRadius: "3px",
  border: "1px solid var(--calcite-color-border-2, #3a3a38)",
  background: "var(--calcite-color-foreground-2, #2b2b2a)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

/** A colour chip that opens a picker. The dot also previews the symbol size. */
export function SwatchField({ color, size, onChange, box = 22, title = "Change colour" }) {
  const [open, setOpen] = useState(false);
  const idRef = useRef(`swatch-${Math.random().toString(36).slice(2)}`);
  const dot = Math.min(box - 6, Math.max(8, size ?? 14));

  return (
    <>
      <button
        type="button"
        id={idRef.current}
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-label={title}
        style={{ ...CHIP, width: `${box}px`, height: `${box}px` }}
      >
        <span
          style={{
            width: `${dot}px`,
            height: `${dot}px`,
            borderRadius: "50%",
            background: color,
            border: "1px solid rgba(255,255,255,0.35)",
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

/** Picks one of the bundled picture markers. The picture twin of SwatchField. */
export function IconField({ icon, onChange, box = 22, title = "Change marker" }) {
  const [open, setOpen] = useState(false);
  const idRef = useRef(`icon-${Math.random().toString(36).slice(2)}`);

  return (
    <>
      <button
        type="button"
        id={idRef.current}
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-label={title}
        style={{ ...CHIP, width: `${box}px`, height: `${box}px` }}
      >
        <img src={icon} alt="" style={{ maxWidth: `${box - 6}px`, maxHeight: `${box - 6}px` }} />
      </button>
      <CalcitePopover
        open={open ? true : undefined}
        referenceElement={idRef.current}
        placement="leading-start"
        overlayPositioning="fixed"
        onCalcitePopoverClose={() => setOpen(false)}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 38px)", gap: "4px", padding: "8px" }}>
          {MARKER_ICONS.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.name}
              onClick={() => { onChange(m.url); setOpen(false); }}
              style={{
                width: "38px", height: "38px", cursor: "pointer", borderRadius: "3px",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: m.url === icon ? "var(--calcite-color-brand, #3987e5)" : "transparent",
                border: "1px solid transparent",
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
