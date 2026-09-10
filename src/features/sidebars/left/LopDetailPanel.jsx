import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalciteAction,
  CalciteChip,
  CalciteIcon,
  CalciteLoader,
  CalciteNotice,
  CalcitePanel,
} from "@esri/calcite-components-react";
import { useLayers } from "../../map/state/LayersContext";
import { useMapView } from "../../map/state/MapViewContext";
import { useSelection } from "../../map/state/SelectionContext";
import { escapeForCql } from "../../../shared/constants/faultCodes";
import { LOP_VARIANTS, UNCLASSIFIED_LOP_CAUSE } from "../../../shared/constants/lopDetail";
import useLopBreakdown from "./useLopBreakdown";

/**
 * The window behind a Low Optical Power row: the same alarm, broken down by
 * its `lopdetail` cause.
 *
 * Opened by RegionStats.jsx and owned by LeftSidebar.jsx, which keeps exactly
 * one of these on screen (see the note on `lopDrilldown` there). It renders
 * over the map through a portal rather than inside the sidebar for two
 * reasons: `calcite-shell-panel` is ~320px wide, far too narrow for a cause
 * plus a customer list, and in overlay mode it transforms its content, which
 * would break `position: fixed` on anything nested inside it.
 *
 * Clicking a cause selects it, which does two things at once: reveals the
 * customers under it, and asks the parent to narrow the map highlight to
 * exactly those points. The panel never writes `featureEffect` itself --
 * RegionStats.jsx is the single writer, and it takes the id list as a prop.
 *
 * It floats rather than blocking: the map stays visible and clickable
 * underneath, so an operator can work down a cause's customer list, sending
 * one after another to the map, without dismissing the window each time.
 */

// The map highlight is a `id IN (...)` where clause, so it cannot take an
// unbounded list. Past this many customers the cause stays selected and
// listed, but the highlight is left showing the whole variant.
const MAX_HIGHLIGHT_IDS = 500;

// How many customers to render under an open cause before falling back to a
// count. Long enough to work a fault from, short enough that opening the
// biggest bucket doesn't mount thousands of rows.
const MAX_LISTED_CUSTOMERS = 50;

function formatFaultTime(value) {
  if (!value) return "No fault time";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

/**
 * One cause: its share of the variant, and -- when open -- the customers
 * behind it.
 */
function CauseRow({ cause, isOpen, accent, onToggle, onLocate }) {
  const listed = cause.customers.slice(0, MAX_LISTED_CUSTOMERS);
  const isUnclassified = cause.code === UNCLASSIFIED_LOP_CAUSE;
  const highlightCapped = cause.count > MAX_HIGHLIGHT_IDS;

  return (
    <div style={{ borderBottom: "1px solid var(--calcite-ui-border-3, #2d3748)" }}>
      <button
        type="button"
        onClick={onToggle}
        // The raw tags are kept on the tooltip so an unmapped code can still
        // be traced back to exactly what NCE sent.
        title={cause.samples.length ? cause.samples.join(" | ") : "No lopdetail on these alarms"}
        aria-expanded={isOpen}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "0.6rem 0.85rem", background: isOpen ? "var(--calcite-ui-foreground-2)" : "transparent",
          border: "none", cursor: "pointer", textAlign: "left", color: "inherit",
        }}
      >
        <CalciteIcon icon={isOpen ? "chevron-down" : "chevron-right"} scale="s" />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: "0.8rem", fontWeight: 600, color: "var(--calcite-ui-text-1)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontStyle: isUnclassified ? "italic" : "normal",
          }}>
            {cause.label}
          </div>

          {/* Share bar -- the point of the breakdown is which cause dominates,
              and a number alone makes that a subtraction exercise. */}
          <div style={{ marginTop: "0.35rem", height: "4px", borderRadius: "2px", background: "var(--calcite-ui-foreground-3)" }}>
            <div style={{
              width: `${Math.max(cause.share * 100, 2)}%`, height: "100%", borderRadius: "2px",
              background: isUnclassified ? "var(--calcite-ui-text-3)" : accent,
            }} />
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--calcite-ui-text-1)" }}>{cause.count}</div>
          <div style={{ fontSize: "0.6rem", color: "var(--calcite-ui-text-2)" }}>{(cause.share * 100).toFixed(1)}%</div>
        </div>
      </button>

      {isOpen && (
        <div style={{ padding: "0 0.85rem 0.75rem 2.2rem" }}>
          {listed.map((customer) => (
            <div
              key={customer.id}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.35rem 0", borderTop: "1px solid var(--calcite-ui-border-3, #2d3748)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--calcite-ui-text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {customer.name || customer.id}
                </div>
                <div style={{ fontSize: "0.62rem", color: "var(--calcite-ui-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[customer.id, customer.area_town, customer.olt].filter(Boolean).join(" · ")}
                </div>
                <div style={{ fontSize: "0.6rem", color: "var(--calcite-ui-text-3)" }}>
                  {formatFaultTime(customer.fault_time)}
                </div>
              </div>

              <CalciteAction
                scale="s"
                icon="zoom-to-object"
                text="Zoom to customer"
                title="Zoom to customer and open its details"
                onClick={() => onLocate(customer)}
              />
            </div>
          ))}

          {cause.customers.length > listed.length && (
            <div style={{ fontSize: "0.62rem", color: "var(--calcite-ui-text-2)", paddingTop: "0.5rem" }}>
              Showing {listed.length} of {cause.count}.
              {highlightCapped
                ? " Too many to pick out on the map, so the highlight stays on the whole alarm."
                : " The rest are highlighted on the map."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LopDetailPanel({ region, variant, onClose, onCauseSelect }) {
  const { layers } = useLayers();
  const { view } = useMapView();
  const { startNewSelection } = useSelection();

  const [openCause, setOpenCause] = useState(null);
  const [locateNotice, setLocateNotice] = useState("");

  const { status, error, byVariant, loadedAt, truncated, refresh } = useLopBreakdown(region, { enabled: true });

  const meta = LOP_VARIANTS[variant];
  // Memoised, not just read: the fallback would otherwise be a new object on
  // every render, and the effect below feeds the map highlight off it.
  const summary = useMemo(() => byVariant[variant] ?? { total: 0, causes: [] }, [byVariant, variant]);

  // The open cause is what the map is asked to narrow to. Clearing on unmount
  // matters as much as setting: closing the panel must not leave the map
  // filtered down to a cause the user can no longer see.
  useEffect(() => {
    const cause = summary.causes.find((c) => c.code === openCause);
    const ids = cause?.customers.map((customer) => customer.id).filter(Boolean) ?? [];
    onCauseSelect(ids.length && ids.length <= MAX_HIGHLIGHT_IDS ? ids : null);
  }, [openCause, summary, onCauseSelect]);

  useEffect(() => () => onCauseSelect(null), [onCauseSelect]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  /**
   * Drills from a row all the way through to the map: the WFS record carries
   * no geometry, so re-query the customer layer for the real graphic, then
   * hand it to the selection stack -- which is what opens the right sidebar
   * on CustomerDetails, `lopdetail` field and all.
   */
  const handleLocate = useCallback(async (customer) => {
    if (!customer?.id) return;

    const layer = layers.Customers_test;
    if (!view || !layer) {
      setLocateNotice("The customer layer is still loading -- try again in a moment.");
      return;
    }

    setLocateNotice("");
    try {
      const query = layer.createQuery();
      query.where = `id = '${escapeForCql(customer.id)}'`;
      query.outFields = ["*"];
      query.returnGeometry = true;

      const { features } = await layer.queryFeatures(query);
      const [feature] = features;
      if (!feature) {
        // Every fault filter in the app narrows this layer, so a customer can
        // be in the breakdown and off the map at the same time. Say so
        // instead of appearing to do nothing.
        setLocateNotice(`${customer.id} is not on the map under the current fault filter.`);
        return;
      }

      feature.layer = layer; // RightSidebar picks its detail panel off layer.title
      startNewSelection(feature, { label: layer.title });
      view.goTo({ target: feature, zoom: 17 }).catch((err) => {
        if (err.name !== "AbortError") console.error("Zoom to LOP customer failed:", err);
      });
    } catch (err) {
      console.error("Locating LOP customer failed:", err);
      setLocateNotice(`Could not locate ${customer.id}.`);
    }
  }, [layers, view, startNewSelection]);

  const subtitle = useMemo(() => {
    if (status === "ready") {
      return `${region} · ${summary.total.toLocaleString()} customer${summary.total === 1 ? "" : "s"} · ${summary.causes.length} cause${summary.causes.length === 1 ? "" : "s"}`;
    }
    return region;
  }, [region, status, summary]);

  if (!meta) return null;

  return createPortal(
    // Floating, not modal, and deliberately so: the whole point of the list is
    // to put customers on the map, which a dimmed backdrop would hide and a
    // click trap would block. The wrapper is click-through (`pointer-events:
    // none`) so only the window itself takes the mouse; Escape and the panel's
    // own close button are what dismiss it. It is anchored to the top of the
    // screen, under the navigation, leaving the middle of the map -- where
    // `goTo` lands a located customer -- clear.
    <div
      role="presentation"
      style={{
        position: "fixed", inset: 0, zIndex: 900, pointerEvents: "none",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "4.5rem 1rem 1rem",
      }}
    >
      <div
        role="dialog"
        aria-label={`${meta.label} breakdown for ${region}`}
        style={{
          pointerEvents: "auto",
          width: "min(560px, 100%)", maxHeight: "55vh", display: "flex", flexDirection: "column",
          borderRadius: "6px", overflow: "hidden", boxShadow: "0 18px 48px rgba(0, 0, 0, 0.6)",
          borderTop: `3px solid ${meta.color}`, background: "var(--calcite-ui-foreground-1)",
        }}
      >
        {/* calcite-panel scrolls its own content area -- the flex sizing is
            what lets it do that inside a max-height dialog. */}
        <CalcitePanel
          heading={meta.label}
          description={subtitle}
          closable
          onCalcitePanelClose={onClose}
          style={{ flex: 1, minHeight: 0 }}
        >
          <CalciteAction
            slot="header-actions-end"
            icon="refresh"
            text="Refresh"
            title="Re-read lopdetail from GeoServer"
            scale="s"
            disabled={status === "loading" ? true : undefined}
            onClick={refresh}
          />

          {status === "loading" && (
            <div style={{ padding: "2rem", display: "flex", justifyContent: "center" }}>
              <CalciteLoader label="Loading LOP causes" scale="m" active />
            </div>
          )}

          {status === "error" && (
            <div style={{ padding: "1rem" }}>
              <CalciteNotice open kind="danger" icon="exclamation-mark-triangle">
                <div slot="title">Could not load the breakdown</div>
                <div slot="message">{error}</div>
              </CalciteNotice>
            </div>
          )}

          {status === "ready" && summary.causes.length === 0 && (
            <div style={{ padding: "1rem" }}>
              <CalciteNotice open kind="success" icon="check-circle">
                <div slot="message">No {meta.label.toLowerCase()} alarms in {region} right now.</div>
              </CalciteNotice>
            </div>
          )}

          {status === "ready" && summary.causes.length > 0 && (
            <>
              <div style={{ padding: "0.6rem 0.85rem", display: "flex", alignItems: "center", gap: "0.5rem", borderBottom: "1px solid var(--calcite-ui-border-3, #2d3748)" }}>
                <CalciteIcon icon="filter" scale="s" />
                <span style={{ fontSize: "0.65rem", color: "var(--calcite-ui-text-2)" }}>
                  Select a cause to list its customers and highlight them on the map.
                </span>
              </div>

              {locateNotice && (
                <div style={{ padding: "0.75rem 0.85rem 0" }}>
                  <CalciteNotice open kind="warning" icon="exclamation-mark-triangle" scale="s" closable
                    onCalciteNoticeClose={() => setLocateNotice("")}>
                    <div slot="message">{locateNotice}</div>
                  </CalciteNotice>
                </div>
              )}

              <div>
                {summary.causes.map((cause) => (
                  <CauseRow
                    key={cause.code}
                    cause={cause}
                    accent={meta.color}
                    isOpen={openCause === cause.code}
                    onToggle={() => setOpenCause((current) => (current === cause.code ? null : cause.code))}
                    onLocate={handleLocate}
                  />
                ))}
              </div>
            </>
          )}

          <div slot="footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", width: "100%" }}>
            <span style={{ fontSize: "0.6rem", color: "var(--calcite-ui-text-2)" }}>
              {loadedAt ? `Read ${loadedAt.toLocaleTimeString()}` : " "}
            </span>
            {truncated && (
              <CalciteChip scale="s" icon="exclamation-mark-triangle" title="Only the first records were read">
                Truncated
              </CalciteChip>
            )}
          </div>
        </CalcitePanel>
      </div>
    </div>,
    document.body
  );
}
