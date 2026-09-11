import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalciteAction, CalciteIcon } from "@esri/calcite-components-react";
import { layerLabel } from "../../../shared/constants/layerLabels";

/**
 * ArcGIS-style paging for features that share a spot on the map.
 *
 * A click on stacked points identifies all of them (see GlobalClickHandler),
 * but only one set of details fits in the panel. This is the control that says
 * which one you're looking at -- "2 of 6", with arrows either side and a list
 * of everything that was under the cursor when you click the count.
 *
 * Renders nothing for a single feature, so it costs an ordinary click nothing.
 */

// Attributes worth showing as "which one is this", best first. Layers name
// their key differently, so the ones that belong to a single layer come first
// -- a vehicle is its registration number, a cable its cable_id, a TWA site
// its name -- and only then the `id` that most layers share. The object id is
// the last resort: it means nothing to the user, but it still tells two
// otherwise identical rows apart.
const IDENTITY_FIELDS = [
  "reg_no",     // Vehicles
  "site_name",  // TWA sites
  "cable_id",   // Feeder / Distribution / Longhaul
  "plot",       // Parcels
  "id",         // Customers, POP, DC, FAT, JC
  "name",
  "ontid",
  "objectid",
];

function firstValue(attributes, fields) {
  for (const field of fields) {
    const value = attributes[field];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function featureIdentity(feature) {
  if (feature?.isAggregate) {
    const count = feature.attributes?.cluster_count;
    return count ? `${count} features` : "Cluster";
  }

  const attributes = feature?.attributes ?? {};
  const primary = firstValue(attributes, IDENTITY_FIELDS);
  const name = firstValue(attributes, ["name"]);

  // Where a layer carries both -- "Korangi POP" alongside its 2110 -- show
  // them together, since the name is what someone recognises and the id is
  // what tells two of them apart.
  if (name && primary && name !== primary) return `${name} \u00b7 ${primary}`;
  return primary || name;
}

export default function CoincidentFeaturePager({ entryId, candidates, index, onSelect }) {
  const [listOpen, setListOpen] = useState(false);
  const containerRef = useRef(null);
  const total = candidates?.length ?? 0;

  // A fresh click brings a different set of features -- don't leave the
  // previous set's list hanging open over them. Keyed on the selection rather
  // than the array, which is rebuilt whenever a background attribute query
  // lands and would otherwise snap the list shut under the user.
  useEffect(() => { setListOpen(false); }, [entryId]);

  // Click-away and Escape, the two ways anyone expects a popover to close.
  useEffect(() => {
    if (!listOpen) return;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setListOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setListOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [listOpen]);

  const rows = useMemo(
    () => (candidates ?? []).map((feature, i) => ({
      key: `${feature?.layer?.title ?? "layer"}-${i}`,
      title: layerLabel(feature?.layer?.title),
      identity: featureIdentity(feature),
      index: i,
    })),
    [candidates]
  );

  if (total <= 1) return null;

  // Wraps around rather than dead-ending at either edge: with a handful of
  // features stacked on one point, cycling is what you want.
  const step = (delta) => onSelect((index + delta + total) % total);

  return (
    <div
      ref={containerRef}
      style={{
        // Positioned only so the list can hang off it; the bar itself is the
        // last row of the details column, held there by the layout.
        position: "relative",
        flex: "0 0 auto",
        zIndex: 2,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: "2px",
        padding: "4px 6px",
        borderTop: "1px solid var(--calcite-ui-border-3)",
        backgroundColor: "var(--calcite-ui-foreground-1)",
      }}
    >
      {listOpen && (
        <div
          role="listbox"
          aria-label="Features at this location"
          style={{
            position: "absolute",
            right: "6px",
            bottom: "100%",
            marginBottom: "4px",
            minWidth: "220px",
            maxWidth: "min(320px, calc(100% - 12px))",
            maxHeight: "260px",
            overflowY: "auto",
            borderRadius: "6px",
            border: "1px solid var(--calcite-ui-border-2)",
            backgroundColor: "var(--calcite-ui-foreground-1)",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
          }}
        >
          {rows.map((row) => {
            const isActive = row.index === index;
            return (
              <div
                key={row.key}
                role="option"
                aria-selected={isActive}
                onClick={() => { onSelect(row.index); setListOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--calcite-ui-border-3)",
                  backgroundColor: isActive ? "var(--calcite-ui-brand)" : "transparent",
                  color: isActive ? "#fff" : "var(--calcite-ui-text-1)",
                }}
              >
                <span style={{ fontSize: "0.7rem", opacity: 0.75, minWidth: "1.4em" }}>
                  {row.index + 1}
                </span>
                <span style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.78rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {row.title}
                  </div>
                  {row.identity && (
                    <div
                      style={{
                        fontSize: "0.7rem",
                        opacity: 0.75,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.identity}
                    </div>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <CalciteAction
        scale="s"
        icon="chevron-left"
        appearance="transparent"
        text="Previous feature"
        title="Previous feature at this location"
        onClick={() => step(-1)}
      />

      <div
        role="button"
        tabIndex={0}
        aria-expanded={listOpen}
        title="Show all features at this location"
        onClick={() => setListOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setListOpen((open) => !open);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 8px",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "0.75rem",
          whiteSpace: "nowrap",
          userSelect: "none",
          color: "var(--calcite-ui-text-1)",
          backgroundColor: listOpen ? "var(--calcite-ui-foreground-3)" : "var(--calcite-ui-foreground-2)",
        }}
      >
        <span>{index + 1} of {total}</span>
        <CalciteIcon scale="s" icon={listOpen ? "chevron-down" : "chevron-up"} />
      </div>

      <CalciteAction
        scale="s"
        icon="chevron-right"
        appearance="transparent"
        text="Next feature"
        title="Next feature at this location"
        onClick={() => step(1)}
      />
    </div>
  );
}
