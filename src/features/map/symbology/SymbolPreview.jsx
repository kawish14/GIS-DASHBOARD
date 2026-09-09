import React from "react";

/**
 * What the symbol currently being edited will look like on the map.
 *
 * The pane used to describe a symbol only in words -- a size box, an outline
 * box, a colour dot the size of a full stop -- so the only way to find out
 * what you had built was to go and look at the map. This draws it: the actual
 * geometry (a marker, a line, a fill), at the actual size, with the actual
 * outline, over a strip of the same dark ground the basemap uses.
 *
 * Deliberately not an ArcGIS symbol: rendering one needs a MapView. This is
 * SVG, and it matches what buildRenderer.js produces for each geometry type.
 */

// The map's own dark surface, so the preview shows a colour against the ground
// it will actually sit on rather than against the panel.
const MAP_GROUND = "#1a1a19";

export default function SymbolPreview({
  geometryType,
  color,
  size = 8,
  outlineColor,
  outlineWidth = 0,
  iconUrl,
  opacity = 1,
  height = 54,
}) {
  const w = 148;
  const h = height;
  const cx = w / 2;
  const cy = h / 2;

  let mark;
  if (iconUrl) {
    const px = Math.max(10, Math.min(size * 2.2, h - 12));
    mark = <image href={iconUrl} x={cx - px / 2} y={cy - px / 2} width={px} height={px} />;
  } else if (geometryType === "polyline") {
    mark = (
      <path
        d={`M 16 ${cy + 9} C ${w * 0.32} ${cy - 14}, ${w * 0.6} ${cy + 14}, ${w - 16} ${cy - 9}`}
        fill="none"
        stroke={color}
        strokeWidth={Math.max(1, size)}
        strokeLinecap="round"
      />
    );
  } else if (geometryType === "polygon") {
    mark = (
      <rect
        x={cx - 34} y={cy - 15} width={68} height={30} rx={2}
        fill={color}
        stroke={outlineWidth > 0 ? outlineColor || color : "none"}
        strokeWidth={outlineWidth}
      />
    );
  } else {
    mark = (
      <circle
        cx={cx} cy={cy} r={Math.max(3, size)}
        fill={color}
        stroke={outlineWidth > 0 ? outlineColor || "#ffffff" : "none"}
        strokeWidth={outlineWidth}
      />
    );
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Symbol preview"
      style={{ display: "block", borderRadius: "3px", background: MAP_GROUND }}
    >
      <g opacity={opacity}>{mark}</g>
    </svg>
  );
}
