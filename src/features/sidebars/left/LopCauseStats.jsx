import React from "react";
import { CalciteAction, CalciteIcon, CalciteLoader, CalciteNotice } from "@esri/calcite-components-react";
import { LOP_VARIANTS, UNCLASSIFIED_LOP_CAUSE } from "../../../shared/constants/lopDetail";
import useLopBreakdown from "./useLopBreakdown";

/**
 * One Low Optical Power row's `lopdetail` breakdown: how its count splits
 * across the causes behind it.
 *
 * RegionStats.jsx brings this to the front of the panel when a row is clicked,
 * over its own blurred content -- not a dropdown under the row, and not a view
 * you navigate to. The sidebar never moves and the map is never covered; the
 * numbers simply come forward and go away again.
 *
 * Counts only, deliberately. The customers behind each cause are what the map
 * and the attribute table are for; repeating them here would turn a summary
 * into a list to scroll past.
 */

/** Rounds a share to one decimal, but never to a bare "0.0%" for a real count. */
function formatShare(share) {
  const percent = share * 100;
  return percent < 0.1 ? "<0.1%" : `${percent.toFixed(1)}%`;
}

export default function LopCauseStats({ region, variant, onClose }) {
  const { status, error, byVariant, truncated, refresh } = useLopBreakdown(region, { enabled: true });

  const meta = LOP_VARIANTS[variant];
  const summary = byVariant[variant] ?? { total: 0, causes: [] };

  if (!meta) return null;

  return (
    <div
      style={{
        // A card, not a section: solid ground of its own, the row's colour
        // along the top, and a shadow, so it reads as being in front of the
        // panel rather than part of the list behind it.
        background: "var(--calcite-ui-foreground-1)",
        border: "1px solid var(--calcite-ui-border-3, #2d3748)",
        borderTop: `3px solid ${meta.color}`,
        borderRadius: "4px",
        boxShadow: "0 12px 28px rgba(0, 0, 0, 0.55)",
        maxHeight: "60vh",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", padding: "0.4rem 0.35rem 0.3rem 0.6rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--calcite-ui-text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meta.label}
          </div>
          <div style={{ fontSize: "0.58rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--calcite-ui-text-2)" }}>
            {status === "ready" ? `By cause · ${summary.total.toLocaleString()} total` : "By cause"}
          </div>
        </div>
        <CalciteAction
          scale="s"
          appearance="transparent"
          icon="refresh"
          text="Refresh"
          title="Re-read lopdetail from GeoServer"
          disabled={status === "loading" ? true : undefined}
          onClick={refresh}
        />
        <CalciteAction
          scale="s"
          appearance="transparent"
          icon="x"
          text="Close"
          title="Close the breakdown"
          onClick={onClose}
        />
      </div>

      {status === "loading" && (
        <div style={{ padding: "0.75rem", display: "flex", justifyContent: "center" }}>
          <CalciteLoader label="Loading LOP causes" scale="s" active inline />
        </div>
      )}

      {status === "error" && (
        <div style={{ padding: "0 0.5rem 0.5rem 0.6rem" }}>
          <CalciteNotice open kind="danger" scale="s" icon="exclamation-mark-triangle">
            <div slot="message">{error}</div>
          </CalciteNotice>
        </div>
      )}

      {status === "ready" && summary.causes.length === 0 && (
        <div style={{ padding: "0 0.6rem 0.5rem", fontSize: "0.65rem", color: "var(--calcite-ui-text-2)" }}>
          No {meta.label.toLowerCase()} alarms in {region} right now.
        </div>
      )}

      {status === "ready" && summary.causes.map((cause) => {
        const isUnclassified = cause.code === UNCLASSIFIED_LOP_CAUSE;
        return (
          <div
            key={cause.code}
            // The raw tags are on the tooltip so an unmapped code can still be
            // traced back to exactly what NCE sent.
            title={cause.samples.length ? cause.samples.join(" | ") : "No lopdetail on these alarms"}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0.6rem" }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "0.72rem", fontWeight: 600, color: "var(--calcite-ui-text-1)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontStyle: isUnclassified ? "italic" : "normal",
              }}>
                {cause.label}
              </div>

              {/* Which cause dominates is the whole question; a column of
                  numbers alone makes that a subtraction exercise. */}
              <div style={{ marginTop: "0.25rem", height: "3px", borderRadius: "2px", background: "var(--calcite-ui-foreground-3)" }}>
                <div style={{
                  width: `${Math.max(cause.share * 100, 2)}%`, height: "100%", borderRadius: "2px",
                  background: isUnclassified ? "var(--calcite-ui-text-2)" : meta.color,
                }} />
              </div>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--calcite-ui-text-1)" }}>
                {cause.count.toLocaleString()}
              </div>
              <div style={{ fontSize: "0.55rem", color: "var(--calcite-ui-text-2)" }}>{formatShare(cause.share)}</div>
            </div>
          </div>
        );
      })}

      {/* Said only when it is true: the read hit its ceiling, so every count
          here is a floor rather than the number. */}
      {status === "ready" && truncated && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.15rem 0.6rem 0.5rem" }}>
          <CalciteIcon icon="exclamation-mark-triangle" scale="s" />
          <span style={{ fontSize: "0.55rem", color: "var(--calcite-ui-text-2)" }}>
            Too many alarms for one read -- these counts are a floor.
          </span>
        </div>
      )}
    </div>
  );
}
