import { useEffect, useState } from "react";
import { useLayers, useMapView } from "../../context/MapContext";
import { loadSymbologyConfig, onSymbologyConfigChange } from "./symbologyConfig";
import { buildRendererFromConfig } from "./buildRenderer";

/**
 * Generic replacement for one-off layer style files (Longhaul.jsx, and by
 * the same pattern DC.jsx, Feeder.jsx, Distribution.jsx, etc.).
 *
 * Old way (Longhaul.jsx): the field to symbolize by (fiber_type) and every
 * value->color mapping were hardcoded in JS. Changing "fiber_type" to
 * "lmp" meant editing this file, rebuilding, and redeploying.
 *
 * New way: all of that lives in symbology-config.json, fetched at runtime.
 * This component just reads the config for `layerKey`, builds an ArcGIS
 * renderer from it, and applies it. To switch Longhaul from fiber_type to
 * lmp, an admin edits the "longhaul" entry in the JSON (by hand, or via
 * SymbologyEditor.jsx) -- no code change, no build, no deploy.
 *
 * Usage (in Layers.jsx), replacing `<Longhaul />`:
 *   <SymbologyLayer layerKey="longhaul" />
 *   <SymbologyLayer layerKey="dc_odb" defaultVisible />
 */
export default function SymbologyLayer({ layerKey, defaultVisible = false }) {
  const { layers } = useLayers();
  const { view } = useMapView();
  const [config, setConfig] = useState(null);

  // Load once on mount, and again whenever the config is live-reloaded
  // (see useSymbologyLiveReload.js).
  useEffect(() => {
    let isMounted = true;

    const applyLoadedConfig = (fullConfig) => {
      if (isMounted) setConfig(fullConfig?.[layerKey] ?? null);
    };

    loadSymbologyConfig({ force: true })
      .then(applyLoadedConfig)
      .catch((err) => console.error(`Symbology config load failed for "${layerKey}":`, err));

    const unsubscribe = onSymbologyConfigChange(applyLoadedConfig);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [layerKey]);

  // Apply the renderer once we have both the ArcGIS layer instance and its config.
  useEffect(() => {
    const layer = layers[layerKey];
    console.log(`Applying symbology for "${layerKey}"`, { layer, config, view });
    if (!layer || !config || !view) return;

    try {
      const renderer = buildRendererFromConfig(config, layer.geometryType);
      if (renderer) layer.renderer = renderer;
    } catch (err) {
      console.error(`Failed to build/apply symbology for "${layerKey}":`, err);
    }

    layer.visible = config.visible ?? defaultVisible;

    if (!view.map.layers.includes(layer)) {
      view.map.add(layer);
    }
  }, [layers, config, view, layerKey, defaultVisible]);

  return null;
}