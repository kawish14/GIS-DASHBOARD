import { MapViewProvider, useMapView } from "./MapViewContext";
import { LayersProvider, useLayers } from "./LayersContext";
import { AlarmStatsProvider, useStats } from "./AlarmStatsContext";
import { RightPanelProvider, useRightPanel } from "./RightPanelContext";
import { SelectionProvider, useSelection } from "./SelectionContext";
import { FeatureTableDataProvider, useFeatureTableData } from "./FeatureTableDataContext";

/**
 * Composes the map session's state. Mounted once, in app/AppProviders.jsx.
 *
 * The nesting is not arbitrary: LayersProvider and SelectionProvider both need
 * the live `view` so they can tear themselves down when it goes away, and the
 * view lives in the outermost provider -- hence the bridge below, which reads
 * it and hands it down as a prop.
 *
 * Each context is its own file in this folder; start there to find who writes
 * and reads a given piece of state.
 */
function MapViewBridge({ children }) {
  const { view } = useMapView();
  return children(view);
}

export function MapProvider({ children }) {
  return (
    <MapViewProvider>
      <MapViewBridge>
        {(view) => (
          <LayersProvider view={view}>
            <AlarmStatsProvider>
              <RightPanelProvider>
                <SelectionProvider view={view}>
                  <FeatureTableDataProvider>{children}</FeatureTableDataProvider>
                </SelectionProvider>
              </RightPanelProvider>
            </AlarmStatsProvider>
          </LayersProvider>
        )}
      </MapViewBridge>
    </MapViewProvider>
  );
}

/**
 * Everything at once. Convenient, but it re-renders on ANY of the six contexts
 * changing -- prefer the specific hook (useMapView, useLayers, useStats,
 * useRightPanel, useSelection, useFeatureTableData) in anything that renders
 * often or renders a lot.
 */
export function useArcGIS() {
  return {
    ...useMapView(),
    ...useLayers(),
    ...useStats(),
    ...useRightPanel(),
    ...useSelection(),
    ...useFeatureTableData(),
  };
}
