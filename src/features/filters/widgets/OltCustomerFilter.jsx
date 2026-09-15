/**
 * Customers by OLT, or by POP service area.
 *
 * Two ways of asking the same question -- "which customers belong to this bit
 * of the network?" -- so they share one widget, one scope switch and one
 * result layer. The first step picks which:
 *
 *   OLT              an attribute match, `olt = '<id>'`
 *   POP service area a spatial match against the `pop_boundary` polygon
 *                    ("POP Service Areas" in the layer list)
 *
 * and the scope decides where the answer comes from: the customer layer
 * already on the map, or a fresh read from GeoServer that lands as its own
 * layer (FILTERED_CUSTOMER_LAYER_TITLE) -- registered like any other layer, so
 * it appears in the layer list, its points open CustomerDetails, and the
 * selection tool can return them.
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  CalciteLabel,
  CalciteSelect,
  CalciteOption,
  CalciteButton,
  CalciteLoader,
  CalciteNotice,
  CalciteCombobox,
  CalciteComboboxItem,
  CalciteComboboxItemGroup,
  CalciteSegmentedControl,
  CalciteSegmentedControlItem
} from "@esri/calcite-components-react";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";
import { useArcGIS } from "../../map/state/MapProvider";
import { usePublishFilter } from "../ActiveFiltersContext";
import { useAuth } from "../../auth/AuthContext";
import { Realtime, api } from '../../../shared/config/runtimeConfig';
import { customerColumns } from '../../../shared/constants/tableColumns';
import { FILTERED_CUSTOMER_LAYER_TITLE } from '../../../shared/constants/layerLabels';
import { mergeServiceAreas, groupByRegion } from '../serviceAreas';

// Which question the widget is asking.
const MODE_OLT = "OLT";
const MODE_POP = "POP";

// The layer the service areas come from, and the fields that name one.
const POP_BOUNDARY_LAYER = "pop_boundary";

const CUSTOMER_SYMBOL = {
  type: "simple-marker", color: "#ff8c00", size: "6px",
  outline: { color: "#ffffff", width: 1 },
};

/** GeoServer answers in WGS84, so everything spatial here is converted to it first. */
function toGeographic(geometry) {
  if (!geometry) return null;
  return geometry.spatialReference?.isWebMercator
    ? webMercatorUtils.webMercatorToGeographic(geometry)
    : geometry;
}

export default function OltCustomerFilter() {
  const {
    view, layers, customerLayerView, addTableData, removeTableData, tableData,
    setTableVisibility, registerLayer, unregisterLayer,
  } = useArcGIS();
  const { user } = useAuth();
  const REGIONS = user?.permissions?.regions || [];

  const [mode, setMode] = useState(MODE_OLT);
  const [oltList, setOltList] = useState([]);
  const [selectedOlt, setSelectedOlt] = useState("");
  // Service areas are kept whole -- applying one needs its polygon, not its name.
  const [popAreas, setPopAreas] = useState([]);
  const [selectedPop, setSelectedPop] = useState("");
  const [isLoadingPops, setIsLoadingPops] = useState(false);
  const popAreasReadRef = useRef(false);
  const [filterScope, setFilterScope] = useState("CURRENT_VIEW");
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState(null);
  const [isFiltered, setIsFiltered] = useState(false);
  const [appliedSummary, setAppliedSummary] = useState(null);

  useEffect(() => {
    const fetchOLTs = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${Realtime}/api/olts`);
        const result = await response.json();
        if (result.success) {
          const permittedOLTs = REGIONS.length > 0 ? result.data.filter((item) => REGIONS.includes(item.region)) : [];
          setOltList(permittedOLTs);
        } else {
          throw new Error(result.message || "Failed to fetch OLTs");
        }
      } catch (err) { setError("Failed to load OLT data."); } finally { setIsLoading(false); }
    };
    fetchOLTs();
  }, []);

  // Service areas are read from the layer already on the map, and only once
  // the user asks for them -- the polygons are heavy, and most sessions never
  // leave OLT mode. The layer carries the user's region filter already, so
  // whatever it holds is what they are allowed to see.
  useEffect(() => {
    // Guarded by a ref, not by `popAreas.length`: a map with no service areas
    // at all would otherwise re-query on every render, since an empty result
    // looks exactly like "not read yet".
    if (mode !== MODE_POP || popAreasReadRef.current) return;

    const popLayer = layers?.[POP_BOUNDARY_LAYER];
    if (!popLayer) return;

    let isMounted = true;
    popAreasReadRef.current = true;

    (async () => {
      setIsLoadingPops(true);
      try {
        const query = popLayer.createQuery();
        query.where = "1=1";
        query.outFields = ["pop_id", "pop_name", "region"];
        query.returnGeometry = true;

        const { features } = await popLayer.queryFeatures(query);
        if (!isMounted) return;

        setPopAreas(mergeServiceAreas(features));
      } catch (err) {
        console.error("Failed to read POP service areas:", err);
        // Let switching back into this mode try again.
        popAreasReadRef.current = false;
        if (isMounted) setError("Failed to load POP service areas.");
      } finally {
        if (isMounted) setIsLoadingPops(false);
      }
    })();

    return () => { isMounted = false; };
  }, [mode, layers]);

  // Unregister rather than just remove: the layer is in the shared registry
  // (so it shows up in the layer list and the selection tool), and a registry
  // entry pointing at a layer that is no longer on the map is worse than none.
  const removeWFSLayer = () => {
    unregisterLayer(FILTERED_CUSTOMER_LAYER_TITLE);
    if (view && view.map) {
      const stray = view.map.layers.find(layer => layer.title === FILTERED_CUSTOMER_LAYER_TITLE);
      if (stray) view.map.remove(stray);
    }
  };

  /** Adds the fetched-customers layer and hands its features to the table. */
  const publishFetchedLayer = async (url, tableParams, zoomTarget) => {
    const wfsLayer = new GeoJSONLayer({
      url, title: FILTERED_CUSTOMER_LAYER_TITLE,
      // Same as the customer layer it stands in for: clicks go to the
      // right sidebar's CustomerDetails, not to an ArcGIS popup.
      popupEnabled: false,
      renderer: { type: "simple", symbol: CUSTOMER_SYMBOL },
    });
    view.map.add(wfsLayer);
    // Registering it makes it a layer like any other: it appears in the
    // layer list with its own visibility, and the selection tool can
    // return its customers.
    registerLayer(FILTERED_CUSTOMER_LAYER_TITLE, wfsLayer);
    await view.whenLayerView(wfsLayer);

    const query = wfsLayer.createQuery();
    query.where = "1=1";
    query.outFields = ["*"];
    query.returnGeometry = true;
    const featureSet = await wfsLayer.queryFeatures(query);

    if (featureSet.features.length > 0) {
      view.goTo(zoomTarget ?? featureSet.features);
      if (addTableData) addTableData("olt", "OLT Customers", featureSet.features, customerColumns, tableParams);
    }
    return featureSet.features.length;
  };

  // One entry per OLT: the endpoint lists a row per shelf, so an OLT with
  // several of them used to appear that many times in the picker.
  const oltGroups = useMemo(() => {
    const unique = new Map();
    oltList.forEach((item) => {
      if (item?.olt && !unique.has(item.olt)) unique.set(item.olt, item);
    });
    return [...unique.values()];
  }, [oltList]);

  const currentParams = JSON.stringify({ mode, selectedOlt, selectedPop, filterScope });
  const isCached = tableData?.olt?.filterParams === currentParams;

  /** `olt = '<id>'` against the layer on the map, or straight from GeoServer. */
  const applyOltFilter = async () => {
    const safeOlt = selectedOlt.replace(/'/g, "''");

    if (filterScope === "CURRENT_VIEW") {
      removeWFSLayer();
      if (customerLayerView) {
        const whereClause = `olt = '${safeOlt}'`;
        customerLayerView.filter = { where: whereClause };
        const query = customerLayerView.layer.createQuery();
        query.where = whereClause; query.outFields = ["*"]; query.returnGeometry = true;
        const featureSet = await customerLayerView.layer.queryFeatures(query);
        if (addTableData) { addTableData("olt", "OLT Customers", featureSet.features, customerColumns, currentParams); }
      }
      return;
    }

    if (customerLayerView) { customerLayerView.filter = null; }
    removeWFSLayer();
    const cqlFilter = `olt='${safeOlt}'`;
    const wfsUrl = `${api}/geoserver/web_app/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=web_app%3ACustomers_test&outputFormat=application%2Fjson&maxFeatures=1000000&cql_filter=${encodeURIComponent(cqlFilter)}`;
    await publishFetchedLayer(wfsUrl, currentParams);
  };

  /**
   * Customers inside a service-area polygon.
   *
   * Spatial, because a customer record carries no POP of its own -- the
   * boundary is what says which area it falls in. On the map that is the layer
   * view's own geometry filter; from the server it is a bounding-box read
   * narrowed to the real polygon here, rather than a CQL INTERSECTS carrying a
   * few thousand vertices through a URL.
   */
  const applyPopFilter = async () => {
    const area = popAreas.find((candidate) => candidate.id === selectedPop);
    if (!area) throw new Error("That service area is no longer on the map.");

    const geometry = area.geometry;

    if (filterScope === "CURRENT_VIEW") {
      removeWFSLayer();
      if (customerLayerView) {
        customerLayerView.filter = { geometry, spatialRelationship: "intersects" };
        const query = customerLayerView.layer.createQuery();
        query.geometry = geometry;
        query.spatialRelationship = "intersects";
        query.outFields = ["*"];
        query.returnGeometry = true;
        const featureSet = await customerLayerView.layer.queryFeatures(query);
        if (addTableData) { addTableData("olt", "OLT Customers", featureSet.features, customerColumns, currentParams); }
        view.goTo(geometry).catch(() => {});
      }
      return;
    }

    if (customerLayerView) { customerLayerView.filter = null; }
    removeWFSLayer();

    const geographic = toGeographic(geometry);
    const { xmin, ymin, xmax, ymax } = geographic.extent;
    const bboxUrl =
      `${api}/geoserver/web_app/ows?service=WFS&version=1.0.0&request=GetFeature` +
      `&typeName=web_app%3ACustomers_test&outputFormat=application%2Fjson&maxFeatures=1000000` +
      `&srsName=EPSG:4326&bbox=${xmin},${ymin},${xmax},${ymax},EPSG:4326`;

    const response = await fetch(bboxUrl);
    if (!response.ok) throw new Error(`GeoServer replied ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.features)) throw new Error("Unexpected response from GeoServer");

    // The box is bigger than the area; keep only what is actually inside it.
    const inside = payload.features.filter((feature) => {
      const coords = feature?.geometry?.coordinates;
      if (feature?.geometry?.type !== "Point" || !Array.isArray(coords)) return false;
      return geometryEngine.intersects(geographic, {
        type: "point", x: coords[0], y: coords[1], spatialReference: { wkid: 4326 },
      });
    });

    if (inside.length === 0) {
      throw new Error(`No customers fall inside ${area.name}.`);
    }

    // Handed to the layer as a blob rather than re-fetched: the server has
    // already been asked once, and the polygon test happened here.
    const blob = new Blob([JSON.stringify({ type: "FeatureCollection", features: inside })], {
      type: "application/json",
    });
    const blobUrl = URL.createObjectURL(blob);
    try {
      await publishFetchedLayer(blobUrl, currentParams, geometry);
    } finally {
      // The layer has parsed it by now; holding the URL open only leaks.
      URL.revokeObjectURL(blobUrl);
    }
  };

  const selectionMade = mode === MODE_OLT ? Boolean(selectedOlt) : Boolean(selectedPop);

  const handleActionClick = async () => {
    if (isCached) { setTableVisibility("olt", true); return; }
    if (!view || !view.map || !selectionMade) return;
    setIsApplying(true); setError(null);

    try {
      if (mode === MODE_OLT) {
        await applyOltFilter();
      } else {
        await applyPopFilter();
      }

      const scopeLabel = filterScope === "CURRENT_VIEW" ? "current view" : "all customers";
      const subject = mode === MODE_OLT
        ? selectedOlt
        : (popAreas.find((candidate) => candidate.id === selectedPop)?.name ?? selectedPop);

      setIsFiltered(true);
      setAppliedSummary([subject, scopeLabel]);
    } catch (err) {
      console.error("OLT/POP filter failed:", err);
      setError(err.message || "Failed to apply filter to map.");
    } finally { setIsApplying(false); }
  };

  const handleClear = () => {
    setSelectedOlt("");
    setSelectedPop("");
    if (customerLayerView) customerLayerView.filter = null;
    removeWFSLayer();
    if (removeTableData) removeTableData("olt");
    setIsFiltered(false); setAppliedSummary(null); setError(null);
  };

  usePublishFilter({
    id: "olt_customers",
    label: mode === MODE_OLT ? "OLT" : "POP Area",
    summary: appliedSummary,
    onClear: handleClear,
  });

  const popLayerMissing = mode === MODE_POP && !layers?.[POP_BOUNDARY_LAYER];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {error && (
        <CalciteNotice scale="m" open icon="exclamation-mark-triangle" kind="danger">
          <div slot="message">{error}</div>
        </CalciteNotice>
      )}

      {/* About the OLT list specifically, so it has nothing to say while the
          user is picking a service area. */}
      {mode === MODE_OLT && REGIONS.length === 0 && !isLoading && !error && (
        <CalciteNotice scale="m" open icon="shield" kind="warning">
          <div slot="message">You do not have permission to view any regional OLTs.</div>
        </CalciteNotice>
      )}

      {/* Step 1: which way of asking. Changing it drops the other mode's
          choice, so "View on Map" can never apply a selection you cannot see. */}
      <CalciteLabel scale="m">
        Filter By
        <CalciteSegmentedControl
          scale="m"
          width="full"
          onCalciteSegmentedControlChange={(e) => {
            setMode(e.target.selectedItem?.value ?? MODE_OLT);
            setError(null);
          }}
        >
          <CalciteSegmentedControlItem value={MODE_OLT} checked={mode === MODE_OLT ? true : undefined} iconStart="urban-model">
            OLT
          </CalciteSegmentedControlItem>
          <CalciteSegmentedControlItem value={MODE_POP} checked={mode === MODE_POP ? true : undefined} iconStart="polygon">
            POP Service Area
          </CalciteSegmentedControlItem>
        </CalciteSegmentedControl>
      </CalciteLabel>

      {popLayerMissing && (
        <CalciteNotice scale="m" open icon="layers" kind="warning">
          <div slot="message">POP Service Areas are not on this map, so there is nothing to pick from.</div>
        </CalciteNotice>
      )}

      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}>
          <CalciteLoader scale="m" label="Loading OLTs" />
        </div>
      ) : (
        <>
          <CalciteLabel scale="m">
            Search Scope
            <CalciteSelect scale="m" value={filterScope} onCalciteSelectChange={(e) => setFilterScope(e.target.value)} disabled={isApplying}>
              <CalciteOption label="Current View (Map Display)" value="CURRENT_VIEW" />
              <CalciteOption label="All Customers (Database Fetch)" value="ALL_CUSTOMERS" />
            </CalciteSelect>
          </CalciteLabel>

          {mode === MODE_OLT ? (
            <CalciteLabel scale="m">
              Select OLT
              <CalciteCombobox
                scale="m"
                selectionMode="single"
                maxItems={15}
                placeholder="Search or select an OLT..."
                disabled={REGIONS.length === 0 || isApplying}
                onCalciteComboboxChange={(e) => {
                  const selectedItems = Array.from(e.target.selectedItems || []);
                  setSelectedOlt(selectedItems.length > 0 ? selectedItems[0].value : "");
                }}
              >
                {groupByRegion(oltGroups).map(([region, items]) => (
                  <CalciteComboboxItemGroup key={region} label={region}>
                    {items.map((item) => (
                      <CalciteComboboxItem
                        key={item.olt}
                        value={item.olt}
                        heading={item.olt}
                        selected={selectedOlt === item.olt ? true : undefined}
                      />
                    ))}
                  </CalciteComboboxItemGroup>
                ))}
              </CalciteCombobox>
            </CalciteLabel>
          ) : (
            <CalciteLabel scale="m">
              Select POP Service Area
              <CalciteCombobox
                scale="m"
                selectionMode="single"
                maxItems={15}
                placeholder={isLoadingPops ? "Reading service areas..." : "Search or select a service area..."}
                disabled={popLayerMissing || isLoadingPops || isApplying ? true : undefined}
                onCalciteComboboxChange={(e) => {
                  const selectedItems = Array.from(e.target.selectedItems || []);
                  setSelectedPop(selectedItems.length > 0 ? selectedItems[0].value : "");
                }}
              >
                {groupByRegion(popAreas).map(([region, areas]) => (
                  <CalciteComboboxItemGroup key={region} label={region}>
                    {areas.map((area) => (
                      <CalciteComboboxItem
                        key={area.id}
                        value={area.id}
                        heading={area.name}
                        // Only what the name doesn't already say: the id when
                        // two areas share a name, and the piece count when an
                        // area is drawn in more than one polygon.
                        description={[
                          area.ambiguous ? area.id : null,
                          area.parts > 1 ? `${area.parts} parts` : null,
                        ].filter(Boolean).join(" · ") || undefined}
                        selected={selectedPop === area.id ? true : undefined}
                      />
                    ))}
                  </CalciteComboboxItemGroup>
                ))}
              </CalciteCombobox>
            </CalciteLabel>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <CalciteButton scale="m" appearance="solid" onClick={handleActionClick} loading={isApplying} disabled={!selectionMade || isLoading} style={{ flex: 1 }}>
          {isCached ? "View Table" : "View on Map"}
        </CalciteButton>
        <CalciteButton scale="m" onClick={handleClear} appearance="outline" kind="danger" disabled={!isFiltered && !tableData?.olt} style={{ flex: 1 }}>
          Clear
        </CalciteButton>
      </div>

      {isFiltered && (
        <CalciteNotice scale="m" kind="success" icon="check" open style={{ marginTop: '0.5rem' }}>
          <div slot="message">Filter applied successfully.</div>
        </CalciteNotice>
      )}
    </div>
  );
}
