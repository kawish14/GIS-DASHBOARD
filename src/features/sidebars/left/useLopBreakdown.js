import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../shared/config/runtimeConfig";
import { FAULT_CODES, escapeForCql } from "../../../shared/constants/faultCodes";
import {
  LOP_DETAIL_FIELD,
  LOP_VARIANTS,
  isWarningSeverity,
  summariseLopDetail,
} from "../../../shared/constants/lopDetail";

/**
 * The `lopdetail` breakdown for one region, fetched on demand.
 *
 * Loaded straight from GeoServer rather than from the customer layer already
 * on the map, for two reasons:
 *
 *  - `GeoJSONLayer` infers its schema from the first features it parses, and
 *    `lopdetail` is only populated on LOP alarms. On a batch that opens with
 *    Power Off rows the field never makes it into the layer's field list, and
 *    every `attributes.lopdetail` reads back `undefined` -- a breakdown that
 *    is silently 100% "Unclassified".
 *  - The realtime socket feed (features/realtime/OntStatusFeed.jsx) rebuilds
 *    graphics from the alert payload, which has only recently started carrying
 *    the field at all.
 *
 * One request covers both LOP rows: it asks for `alarmstate = 4` and splits
 * warning from minor here, using the same comparison TopBar.jsx counts with,
 * so a breakdown's total always matches the chip on the row above it. Nothing
 * is fetched until a row is expanded -- the sidebar stays a summary until the
 * user asks for the split.
 *
 * @param {string} region     region tab to load, e.g. "South"
 * @param {object} options
 * @param {boolean} options.enabled  false parks the hook (row collapsed)
 */

// Two fields, because two fields are all a count needs: which bucket the row
// belongs to, and which cause it counts towards. No geometry, no identity --
// the rows are tallied and dropped.
const BREAKDOWN_FIELDS = ["perceived_severity", LOP_DETAIL_FIELD];

// A hard ceiling on one region's LOP population. Well above any real count,
// low enough that a runaway alarm storm can't hand the browser a 100k-row
// JSON document; `truncated` tells the panel to say so if it is ever hit.
const MAX_FEATURES = 20000;

function buildBreakdownUrl(region) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName: "web_app:Customers_test",
    outputFormat: "application/json",
    maxFeatures: String(MAX_FEATURES),
    propertyName: BREAKDOWN_FIELDS.join(","),
    CQL_FILTER: `region = '${escapeForCql(region)}' AND alarmstate = ${FAULT_CODES.LOP}`,
  });

  return `${api}/geoserver/web_app/ows?${params.toString()}`;
}

const IDLE = Object.freeze({ status: "idle", records: [], error: null, truncated: false });

export default function useLopBreakdown(region, { enabled = true } = {}) {
  const [fetched, setFetched] = useState(IDLE);
  // Bumped by refresh() to re-run the fetch effect without duplicating it.
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef(null);

  // A parked hook reports idle by derivation rather than by an effect writing
  // state back: one render fewer, and no window in which a closed panel's
  // last answer is still readable.
  const state = enabled && region ? fetched : IDLE;

  useEffect(() => {
    if (!enabled || !region) return;

    const controller = new AbortController();
    abortRef.current = controller;
    let isMounted = true;

    const load = async () => {
      setFetched((prev) => ({ ...prev, status: "loading", error: null }));
      try {
        const response = await fetch(buildBreakdownUrl(region), { signal: controller.signal });
        if (!response.ok) throw new Error(`GeoServer replied ${response.status}`);

        const payload = await response.json();
        // A WFS exception comes back as a document with no feature array
        // rather than as an HTTP error, so shape-check before trusting it.
        if (!Array.isArray(payload?.features)) throw new Error("Unexpected response from GeoServer");
        if (!isMounted) return;

        const records = payload.features.map((feature) => feature.properties ?? {});
        setFetched({
          status: "ready",
          records,
          error: null,
          truncated: records.length >= MAX_FEATURES,
        });
      } catch (err) {
        if (err.name === "AbortError" || !isMounted) return;
        console.error("LOP breakdown fetch failed:", err);
        setFetched({ status: "error", records: [], error: err.message, truncated: false });
      }
    };

    load();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [region, enabled, reloadToken]);

  const refresh = useCallback(() => {
    abortRef.current?.abort();
    setReloadToken((token) => token + 1);
  }, []);

  // Both variants are summarised up front: expanding the other LOP row costs
  // no round trip, and the work is one pass over a list already in memory.
  const byVariant = useMemo(() => {
    const warning = [];
    const minor = [];
    state.records.forEach((record) => {
      (isWarningSeverity(record.perceived_severity) ? warning : minor).push(record);
    });

    return Object.fromEntries(
      Object.values(LOP_VARIANTS).map((variant) => [
        variant.key,
        summariseLopDetail(variant.isWarning ? warning : minor),
      ])
    );
  }, [state.records]);

  return { ...state, byVariant, refresh };
}
