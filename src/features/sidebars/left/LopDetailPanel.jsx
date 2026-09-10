import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalciteAction,
  CalciteChip,
  CalciteFlowItem,
  CalciteIcon,
  CalciteLoader,
  CalciteNotice,
} from "@esri/calcite-components-react";
import { useLayers } from "../../map/state/LayersContext";
import { useMapView } from "../../map/state/MapViewContext";
import { useSelection } from "../../map/state/SelectionContext";
import { escapeForCql } from "../../../shared/constants/faultCodes";
import { LOP_VARIANTS, UNCLASSIFIED_LOP_CAUSE } from "../../../shared/constants/lopDetail";
import useLopBreakdown from "./useLopBreakdown";

/**
 * The view behind a Low Optical Power row: the same alarm, broken down by its
 * `lopdetail` cause.
 *
 * This is a `calcite-flow-item`, not a window. LeftSidebar.jsx renders it as
 * the second item of the Alarm State flow, so opening it slides the sidebar
 * forward over the region tabs and calcite gives us the back arrow for free
 * (the flow puts one on any item past the first, and its `back` event is what
 * closes this). Navigation, in other words -- the map is never covered, which
 * matters because putting these customers on the map is the point of the list.
 *
 * Clicking a cause selects it, which does two things at once: reveals the
 * customers under it, and asks the parent to narrow the map highlight to
 * exactly those points. The view never writes `featureEffect` itself --
 * RegionStats.jsx is the single writer, and it takes the id list as a prop.
 */

// The map highlight is an `id IN (...)` where clause, so it cannot take an
// unbounded list. Past this many customers the cause stays selected and
// listed, but the highlight is left showing the whole variant.
const MAX_HIGHLIGHT_IDS = 500;

// How many customers to render under an open cause before falling back to a
// count. Long enough to work a fault from, short enough that opening the
// biggest bucket doesn't mount thousands of rows.
const MAX_LISTED_CUSTOMERS = 50;

const BORDER = "1px solid var(--calcite-ui-border-3, #2d3748)";

function formatFaultTime(value) {
  if (!value) return "No fault time";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

/**
 * One cause: its share of the variant, and -- when open -- the customers
 * behind it.
 *
 * Laid out for a ~320px panel: one line per fact, everything that can overflow
 * ellipsised, and no horizontal scrolling anywhere.
 */
function CauseRow({ cause, isOpen, accent, onToggle, onLocate }) {
  const listed = cause.customers.slice(0, MAX_LISTED_CUSTOMERS);
  const isUnclassified = cause.code === UNCLASSIFIED_LOP_CAUSE;
  const highlightCapped = cause.count > MAX_HIGHLIGHT_IDS;

  return (
    <div style={{ borderBottom: BORDER }}>
      <button
        type="button"
        onClick={onToggle}
        // The raw tags are kept on the tooltip so an unmapped code can still
        // be traced back to exactly what NCE sent.
        title={cause.samples.length ? cause.samples.join(" | ") : "No lopdetail on these alarms"}
        aria-expanded={isOpen}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.55rem 0.75rem", background: isOpen ? "var(--calcite-ui-foreground-2)" : "transparent",
          border: "none", cursor: "pointer", textAlign: "left", color: "inherit",
        }}
      >
        <CalciteIcon icon={isOpen ? "chevron-down" : "chevron-right"} scale="s" />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: "0.78rem", fontWeight: 600, color: "var(--calcite-ui-text-1)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontStyle: isUnclassified ? "italic" : "normal",
          }}>
            {cause.label}
          </div>

          {/* Share bar -- the point of a breakdown is which cause dominates,
              and a column of numbers makes that a subtraction exercise. */}
          <div style={{ marginTop: "0.3rem", height: "4px", borderRadius: "2px", background: "var(--calcite-ui-foreground-3)" }}>
            <div style={{
              width: `${Math.max(cause.share * 100, 2)}%`, height: "100%", borderRadius: "2px",
              background: isUnclassified ? "var(--calcite-ui-text-2)" : accent,
            }} />
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--calcite-ui-text-1)" }}>{cause.count}</div>
          <div style={{ fontSize: "0.58rem", color: "var(--calcite-ui-text-2)" }}>{(cause.share * 100).toFixed(1)}%</div>
        </div>
      </button>

      {isOpen && (
        <div style={{ padding: "0 0.75rem 0.6rem 1.6rem" }}>
          {listed.map((customer) => (
            <div
              key={customer.id}
              style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.3rem 0", borderTop: BORDER }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--calcite-ui-text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {customer.name || customer.id}
                </div>
                <div style={{ fontSize: "0.6rem", color: "var(--calcite-ui-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[customer.id, customer.area_town].filter(Boolean).join(" · ")}
                </div>
                {/* Tertiary by size and opacity, not by --calcite-ui-text-3:
                    this theme maps that token to a border colour, which is
                    invisible against the panel. */}
                <div style={{ fontSize: "0.58rem", color: "var(--calcite-ui-text-2)", opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[customer.olt, formatFaultTime(customer.fault_time)].filter(Boolean).join(" · ")}
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
            <div style={{ fontSize: "0.6rem", color: "var(--calcite-ui-text-2)", paddingTop: "0.45rem" }}>
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
  // matters as much as setting: navigating back must not leave the map
  // filtered down to a cause the user can no longer see.
  useEffect(() => {
    const cause = summary.causes.find((c) => c.code === openCause);
    const ids = cause?.customers.map((customer) => customer.id).filter(Boolean) ?? [];
    onCauseSelect(ids.length && ids.length <= MAX_HIGHLIGHT_IDS ? ids : null);
  }, [openCause, summary, onCauseSelect]);

  useEffect(() => () => onCauseSelect(null), [onCauseSelect]);

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
    if (status !== "ready") return region;
    const customers = `${summary.total.toLocaleString()} customer${summary.total === 1 ? "" : "s"}`;
    const causes = `${summary.causes.length} cause${summary.causes.length === 1 ? "" : "s"}`;
    return `${region} · ${customers} · ${causes}`;
  }, [region, status, summary]);

  if (!meta) return null;

  return (
    <CalciteFlowItem
      // Mounted means showing: LeftSidebar deselects the summary item in the
      // same render, so the flow always has exactly one selected step.
      selected
      heading={meta.label}
      description={subtitle}
      // The flow puts a back arrow on any item past the first, and this is
      // what it fires: go back to the region's alarm list.
      onCalciteFlowItemBack={onClose}
    >
      {/* The row's own colour, carried into the view it opened, so which of
          the two LOP rows you drilled into is never in doubt. A strip rather
          than the header's border token: flow-item does not apply that token
          to the header calcite-panel renders. */}
      <div style={{ height: "3px", background: meta.color }} />

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
        <div style={{ padding: "0.75rem" }}>
          <CalciteNotice open kind="danger" icon="exclamation-mark-triangle" scale="s">
            <div slot="title">Could not load the breakdown</div>
            <div slot="message">{error}</div>
          </CalciteNotice>
        </div>
      )}

      {status === "ready" && summary.causes.length === 0 && (
        <div style={{ padding: "0.75rem" }}>
          <CalciteNotice open kind="success" icon="check-circle" scale="s">
            <div slot="message">No {meta.label.toLowerCase()} alarms in {region} right now.</div>
          </CalciteNotice>
        </div>
      )}

      {status === "ready" && summary.causes.length > 0 && (
        <>
          <div style={{ padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", gap: "0.4rem", borderBottom: BORDER }}>
            <CalciteIcon icon="cursor-click" scale="s" />
            <span style={{ fontSize: "0.62rem", color: "var(--calcite-ui-text-2)" }}>
              Pick a cause to list its customers and highlight them on the map.
            </span>
          </div>

          {locateNotice && (
            <div style={{ padding: "0.6rem 0.75rem 0" }}>
              <CalciteNotice open kind="warning" icon="exclamation-mark-triangle" scale="s" closable
                onCalciteNoticeClose={() => setLocateNotice("")}>
                <div slot="message">{locateNotice}</div>
              </CalciteNotice>
            </div>
          )}

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
        </>
      )}

      <div slot="footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", width: "100%" }}>
        <span style={{ fontSize: "0.6rem", color: "var(--calcite-ui-text-2)" }}>
          {loadedAt ? `Read ${loadedAt.toLocaleTimeString()}` : " "}
        </span>
        {truncated && (
          <CalciteChip scale="s" icon="exclamation-mark-triangle" title="Only the first records were read">
            Truncated
          </CalciteChip>
        )}
      </div>
    </CalciteFlowItem>
  );
}
