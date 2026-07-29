// src/permissions/featureRegistry.js
//
// AUTO-DISCOVERY FEATURE REGISTRY
// ================================
// This is now the single source of truth for "what gated features exist in
// the app right now." It replaces the hand-maintained `AVAILABLE_FEATURES`
// array that used to live in AdminPanel.jsx with a build-time scan of the
// codebase itself.
//
// HOW IT WORKS
// ------------
// Any file, anywhere under src/, can export a `featureMeta` object (or an
// array of them) describing the FeatureGuard key(s) it declares:
//
//   export const featureMeta = {
//     key: "tool_FaultAnalytics",  // MUST match the featureKey passed to <FeatureGuard>
//     label: "Fault Analytics",    // shown in the admin panel toggle grid
//     group: "Dashboard Tab",      // top-level section heading in the admin panel
//     tab: "tab_Filter",           // optional -- nests this under a parent feature's group
//   };
//
// `import.meta.glob` (Vite) eagerly imports every module under src/ at
// build time, and this file just harvests whichever ones export
// `featureMeta`. There is nothing to register by hand in a second place,
// and nothing to remember to remove: when a component file is deleted, its
// featureMeta export is deleted with it, and the very next build simply
// stops seeing that feature. AdminPanel can no longer drift out of sync
// with the actual codebase, because it no longer has its own copy of this
// list -- it reads the same one every component declares itself.
//
// NOT ON VITE?
// If this project is Webpack/CRA instead, swap the glob call below for:
//
//   const ctx = require.context("../", true, /\.jsx?$/);
//   const modules = Object.fromEntries(ctx.keys().map((k) => [k, ctx(k)]));
//
// everything else in this file works unchanged either way.

const modules = import.meta.glob("/src/**/*.{jsx,js}", { eager: true });

function collectFeatures() {
  const byKey = new Map();
  const duplicates = [];

  for (const [path, mod] of Object.entries(modules)) {
    if (!mod || !mod.featureMeta) continue;

    const entries = Array.isArray(mod.featureMeta) ? mod.featureMeta : [mod.featureMeta];

    for (const entry of entries) {
      if (!entry?.key) continue;

      if (byKey.has(entry.key)) {
        duplicates.push({ key: entry.key, files: [byKey.get(entry.key).sourcePath, path] });
        continue; // first declaration wins -- duplicate is reported below, not silently dropped
      }

      byKey.set(entry.key, { ...entry, sourcePath: path });
    }
  }

  if (duplicates.length && import.meta.env?.DEV) {
    // A duplicate key means two components think they own the same
    // permission gate -- almost always a copy-paste of an existing
    // featureMeta block with the key left unchanged. Surfacing this at
    // build time in dev is much cheaper than debugging "why does toggling
    // this admin checkbox affect an unrelated widget" in production.
    // eslint-disable-next-line no-console
    console.error(
      "[featureRegistry] Duplicate feature keys declared in multiple files -- " +
        "only the first one found is used. Give each feature a unique key:",
      duplicates
    );
  }

  return Array.from(byKey.values());
}

export const FEATURE_REGISTRY = collectFeatures();

// Fast lookup set for FeatureGuard / AdminPanel.
export const FEATURE_KEYS = new Set(FEATURE_REGISTRY.map((f) => f.key));

export function isKnownFeature(key) {
  return FEATURE_KEYS.has(key);
}

// Given a user's stored `permissions.features` map, returns the keys that
// no longer correspond to anything in the live registry -- i.e. features
// that were deleted or renamed in code but are still sitting in that
// user's saved permissions from before. AdminPanel surfaces these so they
// can be reviewed and cleared with one click instead of accumulating as
// silent dead weight in every user's permission record forever.
export function findOrphanedFeatureKeys(userFeatures = {}) {
  return Object.keys(userFeatures).filter((key) => !FEATURE_KEYS.has(key));
}

