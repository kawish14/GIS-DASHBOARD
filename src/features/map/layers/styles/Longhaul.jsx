import SymbologyLayer from "../symbology/SymbologyLayer";

/**
 * BEFORE: this file hardcoded the fiber_type field and its color mapping
 * directly in JS (see the old version in your uploads). Changing which
 * field drove symbology meant editing this file, rebuilding, redeploying.
 *
 * AFTER: symbology now lives in symbology-config.json under the
 * "longhaul" key, loaded at runtime. This file is now just three lines --
 * it stays as a component (rather than inlining <SymbologyLayer
 * layerKey="longhaul" /> directly in Layers.jsx) only so Layers.jsx's
 * import list doesn't have to change, keeping this a drop-in replacement.
 *
 * To point Longhaul at "lmp" instead of "fiber_type": edit the "longhaul"
 * entry in symbology-config.json (see symbology-config.example.json for
 * exactly what that edit looks like). No change needed here.
 */
export default function Longhaul() {
  return <SymbologyLayer layerKey="longhaul" defaultVisible={false} />;
}