import { createContext, useContext, useState, useMemo } from "react";

/**
 * The live ArcGIS MapView and Map instances.
 *
 * WRITTEN BY  features/map/MapCanvas.jsx -- the only place a view is created
 *             or destroyed. It publishes here once view.when() resolves, so
 *             `view` being non-null means "the map is ready to use".
 * READ BY     almost every map-touching component. `if (!view) return;` at the
 *             top of an effect is the standard guard.
 */
const MapViewContext = createContext(null);

export function MapViewProvider({ children }) {
  const [view, setView] = useState(null);
  const [map, setMap] = useState(null);
  const value = useMemo(() => ({ view, setView, map, setMap }), [view, map]);
  return <MapViewContext.Provider value={value}>{children}</MapViewContext.Provider>;
}

export function useMapView() {
  const ctx = useContext(MapViewContext);
  if (!ctx) throw new Error("useMapView must be used inside MapProvider");
  return ctx;
}
