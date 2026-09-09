/**
 * The picture markers the symbology widget can assign to a class.
 *
 * Point layers in this app are drawn with picture markers, not coloured
 * circles -- the alarm-state icons on the customer layer, the network-asset
 * icons on POP/DC/JC, and so on. A symbology tool that could only produce
 * shapes would be a downgrade for exactly the layers people symbolize most,
 * so these are offered alongside the colour ramps.
 *
 * Curated rather than globbed over the whole assets folder: only what is
 * listed here ends up in the bundle, and the names are what the picker shows.
 */

// Alarm-state markers -- the same six the customer layer uses by default
// (see features/map/layers/styles/Customer.jsx).
import zero from "../../../assets/images/zero.png";
import one from "../../../assets/images/one.png";
import two from "../../../assets/images/two.png";
import twoLong from "../../../assets/images/two_1.png";
import three from "../../../assets/images/three.png";
import four from "../../../assets/images/four.png";

// Network assets.
import pop from "../../../assets/images/POP.png";
import dc from "../../../assets/images/DC.png";
import jc from "../../../assets/images/JC.png";
import fat from "../../../assets/images/black_fat.png";
import olt from "../../../assets/images/olt1.png";
import customer from "../../../assets/images/Customer.png";
import network from "../../../assets/images/network.png";

// General-purpose pins.
import marker from "../../../assets/images/marker.png";
import danger from "../../../assets/images/danger.png";
import office from "../../../assets/images/office.png";

export const MARKER_ICONS = [
  { id: "zero", name: "Online", url: zero },
  { id: "one", name: "Power Off", url: one },
  { id: "two", name: "Link Down", url: two },
  { id: "two_1", name: "Link Down (long)", url: twoLong },
  { id: "three", name: "GEM Packet Loss", url: three },
  { id: "four", name: "LOP", url: four },
  { id: "pop", name: "POP", url: pop },
  { id: "dc", name: "DC / ODB", url: dc },
  { id: "jc", name: "Joint Closure", url: jc },
  { id: "fat", name: "FAT", url: fat },
  { id: "olt", name: "OLT", url: olt },
  { id: "customer", name: "Customer", url: customer },
  { id: "network", name: "Network", url: network },
  { id: "marker", name: "Pin", url: marker },
  { id: "danger", name: "Alert", url: danger },
  { id: "office", name: "Office", url: office },
];

export const DEFAULT_MARKER_ICON = MARKER_ICONS[MARKER_ICONS.length - 3].url; // Pin

/**
 * A picture-marker symbol, in the shape buildRenderer.js passes straight
 * through (`def.symbol` wins over the colour/size auto-generation).
 */
export function pictureSymbol(url, size) {
  const px = `${Math.round(size)}px`;
  return { type: "picture-marker", url, width: px, height: px };
}
