import React from "react";
import { useActiveFilters } from "./ActiveFiltersContext";

// Floats over the map rather than living in the Filter tab, because the whole
// point is to be readable when that tab isn't: the filters keep narrowing the
// map long after the sidebar is closed or switched to Layers.
//
// Anchored top-centre. Top-left is where the ArcGIS zoom/compass/home stack
// sits, and the inset variables (published by SidebarLayoutContext) keep the
// bar centred on the part of the map an overlay sidebar isn't covering.
const WRAPPER_STYLE = {
  position: "absolute",
  top: "12px",
  insetInlineStart: "var(--app-panel-inset-start, 0px)",
  insetInlineEnd: "var(--app-panel-inset-end, 0px)",
  display: "flex",
  justifyContent: "center",
  // The bar is a thin strip across the full width of the map; only the pill
  // itself should swallow clicks, never the map around it.
  pointerEvents: "none",
  zIndex: 10,
};

const BAR_STYLE = {
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  maxWidth: "min(94%, 1040px)",
  padding: "0.3rem 0.35rem 0.3rem 0.6rem",
  borderRadius: "999px",
  background: "rgba(24, 27, 33, 0.92)",
  border: "1px solid var(--border-color, #2d3748)",
  boxShadow: "0 6px 20px rgba(0, 0, 0, 0.45)",
  backdropFilter: "blur(6px)",
  color: "var(--text-muted, #a0aab7)",
  fontSize: "11px",
  lineHeight: 1.2,
  fontFamily: "system-ui, -apple-system, sans-serif",
};

const COUNT_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  flex: "0 0 auto",
  color: "var(--text-highlight, #38bdf8)",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const CHIP_ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  overflowX: "auto",
  scrollbarWidth: "thin",
  padding: "1px 0",
};

const CHIP_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  flex: "0 0 auto",
  maxWidth: "220px",
  padding: "0.2rem 0.2rem 0.2rem 0.55rem",
  borderRadius: "999px",
  background: "rgba(59, 130, 246, 0.16)",
  border: "1px solid rgba(59, 130, 246, 0.45)",
};

const CHIP_TEXT_STYLE = {
  display: "flex",
  alignItems: "baseline",
  gap: "0.3rem",
  minWidth: 0,
};

const CHIP_LABEL_STYLE = {
  color: "var(--text-highlight, #38bdf8)",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const CHIP_VALUE_STYLE = {
  color: "#e2e8f0",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const ICON_BUTTON_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  width: "16px",
  height: "16px",
  padding: 0,
  border: "none",
  borderRadius: "50%",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: "13px",
};

const CLEAR_ALL_STYLE = {
  flex: "0 0 auto",
  padding: "0.25rem 0.65rem",
  borderRadius: "999px",
  border: "1px solid var(--border-color, #2d3748)",
  background: "transparent",
  color: "var(--text-muted, #a0aab7)",
  cursor: "pointer",
  fontSize: "11px",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

function FunnelIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1 2.5A.5.5 0 0 1 1.5 2h13a.5.5 0 0 1 .37.84L10 8.2V13a.5.5 0 0 1-.74.44l-3-1.66A.5.5 0 0 1 6 11.34V8.2L1.13 2.84A.5.5 0 0 1 1 2.5Z" />
    </svg>
  );
}

// Inline styles carry the layout above; these are the states they can't
// express. Scoped to the bar's own class names so nothing leaks onto the map.
const INTERACTION_CSS = `
  .active-filters-chip-clear:hover,
  .active-filters-chip-clear:focus-visible {
    background: rgba(239, 68, 68, 0.22);
    color: #fca5a5;
    outline: none;
  }
  .active-filters-clear-all:hover,
  .active-filters-clear-all:focus-visible {
    border-color: var(--text-highlight, #38bdf8);
    color: var(--text-highlight, #38bdf8);
    outline: none;
  }
  .active-filters-chips::-webkit-scrollbar { height: 4px; }
  .active-filters-chips::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.5);
    border-radius: 4px;
  }
`;

export default function ActiveFiltersBar() {
  const { activeFilters, clearAll } = useActiveFilters();

  // Nothing applied, nothing to say -- an empty bar would just be furniture
  // sitting on top of the map.
  if (activeFilters.length === 0) return null;

  return (
    <div style={WRAPPER_STYLE}>
      <div style={BAR_STYLE} role="status" aria-label="Active filters">
        <style>{INTERACTION_CSS}</style>

        <span style={COUNT_STYLE}>
          <FunnelIcon />
          {activeFilters.length} active {activeFilters.length === 1 ? "filter" : "filters"}
        </span>

        <span aria-hidden="true" style={{ flex: "0 0 auto", opacity: 0.35 }}>|</span>

        <div style={CHIP_ROW_STYLE} className="active-filters-chips">
          {activeFilters.map((filter) => {
            const values = filter.summary.join(" · ");
            return (
              <span key={filter.id} style={CHIP_STYLE} title={`${filter.label} — ${values}`}>
                <span style={CHIP_TEXT_STYLE}>
                  <span style={CHIP_LABEL_STYLE}>{filter.label}</span>
                  <span style={CHIP_VALUE_STYLE}>{values}</span>
                </span>
                <button
                  type="button"
                  className="active-filters-chip-clear"
                  style={ICON_BUTTON_STYLE}
                  onClick={filter.clear}
                  title={`Clear ${filter.label}`}
                  aria-label={`Clear ${filter.label}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>

        <button
          type="button"
          className="active-filters-clear-all"
          style={CLEAR_ALL_STYLE}
          onClick={clearAll}
          title="Clear every active filter"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
