/**
 * Which layers the selection tool draws from.
 *
 * Pure, and separate from LayersContext, because this is the rule the whole
 * feature turns on: the layer list writes the per-layer choice, the selection
 * widget reads the resulting list, and both should be arguing with the same
 * function rather than each other.
 */
import { FILTERED_CUSTOMER_LAYER_TITLE } from "../../../shared/constants/layerLabels";

/**
 * On by default. Customers are what an operator means by "select" nearly every
 * time; the rest of the network is opt-in from the layer list, so a lasso
 * doesn't come back with a zone, a POP boundary and four cables nobody asked
 * about. The OLT filter's own customer layer is here too -- it is the same
 * customers, fetched for one OLT.
 */
export const DEFAULT_SELECTABLE_LAYERS = Object.freeze([
  "Customers_test",
  FILTERED_CUSTOMER_LAYER_TITLE,
]);

const DEFAULTS = new Set(DEFAULT_SELECTABLE_LAYERS);

/** Whether a layer is selectable before anyone touches the switch. */
export function isSelectableByDefault(title) {
  return DEFAULTS.has(title);
}

/**
 * The layers a selection should query, as [title, layer] pairs.
 *
 * Three things have to hold, and visibility is the one that matters most:
 * a layer switched off in the layer list is not on the map, so it cannot have
 * been selected. Querying `Customers_test` by name regardless is exactly the
 * bug this replaced -- hidden customers came back in the results.
 *
 * `queryFeatures` is the capability check: tile and group layers (the parcel
 * WMTS, "Home Parcels") have no features to return and would throw.
 */
export function selectableLayerEntries(layers, isLayerSelectable) {
  return Object.entries(layers || {}).filter(
    ([title, layer]) =>
      Boolean(layer) &&
      layer.visible === true &&
      typeof layer.queryFeatures === "function" &&
      isLayerSelectable(title)
  );
}
