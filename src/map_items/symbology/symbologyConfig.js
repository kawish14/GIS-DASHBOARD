// 1. Uncomment your API URL import (adjust the relative path if necessary)
import { Realtime } from "../../../url";
console.log("Realtime URL:", Realtime); // Log the Realtime URL to verify it's correct
// 2. Change the URL to point to your new backend Realtime route. 
// Make sure this matches the exact endpoint route you create on your backend server.
const SYMBOLOGY_CONFIG_URL = `${Realtime}/symbology-config.json`; 

let cache = null;
let inflightRequest = null;
const listeners = new Set();

export async function loadSymbologyConfig({ force = false } = {}) {
  if (cache && !force) return cache;
  if (inflightRequest && !force) return inflightRequest;

  // Cache-bust with a timestamp so a browser/CDN cache never serves a stale
  // config after an admin publishes a change.
  inflightRequest = fetch(`${SYMBOLOGY_CONFIG_URL}?v=${Date.now()}`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load symbology config: HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      cache = json;
      inflightRequest = null;
      listeners.forEach((fn) => fn(cache));
      return cache;
    })
    .catch((err) => {
      inflightRequest = null;
      throw err;
    });

  return inflightRequest;
}

export function getCachedSymbologyConfig() {
  return cache;
}

/**
 * Subscribe to config reloads (e.g. triggered by reloadSymbologyConfig()
 * after an admin saves a change via the socket event below). Returns an
 * unsubscribe function.
 */
export function onSymbologyConfigChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Force a fresh fetch, bypassing the cache. */
export function reloadSymbologyConfig() {
  return loadSymbologyConfig({ force: true });
}