/**
 * Layer title -> the name a person should read.
 *
 * Layers are titled after their GeoServer/table names ("dc_odb",
 * "Customers_test"), which is not what anyone wants to see in the layer list
 * or in identify results. Kept here rather than next to either consumer
 * because both the layer list and the right sidebar's coincident-feature
 * pager name the same layers, and two copies of this map drift apart.
 */
/**
 * The layer features/filters/widgets/OltCustomerFilter.jsx adds for an
 * "all customers" OLT search. It is a second view of the customer layer, drawn
 * from the same GeoServer type, so everything that dispatches on a layer title
 * -- the right sidebar's detail panels, the labels below -- has to know it
 * means the same thing as `Customers_test`.
 */
export const OLT_CUSTOMER_LAYER_TITLE = "Customers_test_WFS";

export const LAYER_LABELS = {
  fat: "Fiber Access Terminal (FAT)",
  Backhaul: "Backhaul Routes",
  Customers_test: "Customers",
  [OLT_CUSTOMER_LAYER_TITLE]: "Customers",
  Customers_inactive: "Inactive Customers",
  Distribution: "Distribution OFC",
  Feeder: "Feeder OFC",
  dc_odb: "Distribution Cabinets (DC/ODB)",
  pop: "POP",
  jc: "Joint Closure (JC)",
  pop_boundary: "POP Service Areas",
  zones: "Zones",
  site: "TWA Site",
  longhaul: "TWA Longhaul",
  Vehicles: "Live Vehicles",
  "Home Parcels": "Home Parcels",
};

/** Display name for a layer title, falling back to the raw title. */
export function layerLabel(title) {
  if (!title) return "Feature";
  return LAYER_LABELS[title] || title;
}
