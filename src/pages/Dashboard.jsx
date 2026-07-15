import { useState, useEffect } from "react";
import TopBar from "../components/top/TopBar";
import MapViews from "../components/center/MapView";
import RightSidebar from "../components/right/RightSidebar";
import LeftSidebar from "../components/left/LeftSidebar";
import FeatureTable from "../components/bottom/FeatureTable";
import { useLayers, useMapView, usePopup } from "../context/MapContext";
import {
  CalciteTabs,
  CalciteTabNav,
  CalciteTabTitle,
  CalciteTab,
  CalciteIcon,
  CalciteShell
} from "@esri/calcite-components-react";

function Dashboard() {
  const { layers, setCustomerLayerView } = useLayers();
  const { view } = useMapView();
  const { selectedFeatures, setSelectedFeatures } = usePopup();
  const [isLoading, setIsLoading] = useState(true);

  const MAX_WAIT_MS = 5000;
  const CHECK_INTERVAL_MS = 200;

  useEffect(() => {
    if (!view) return;
    setIsLoading(true);

    let elapsedTime = 0;
    let watcherHandle = null;

    const intervalId = setInterval(() => {
      if (layers.Customers_test) {
        clearInterval(intervalId);
        view.whenLayerView(layers.Customers_test).then((layerView) => {
          setCustomerLayerView(layerView);
          watcherHandle = layerView.watch("updating", (isUpdating) => {
            if (!isUpdating) {
              setIsLoading(false);
              if (watcherHandle) { watcherHandle.remove(); watcherHandle = null; }
            }
          });
        }).catch(() => setIsLoading(false));
      }
      elapsedTime += CHECK_INTERVAL_MS;
      if (elapsedTime >= MAX_WAIT_MS) { clearInterval(intervalId); setIsLoading(false); }
    }, CHECK_INTERVAL_MS);

    return () => { clearInterval(intervalId); if (watcherHandle) watcherHandle.remove(); };
    // Depend on the specific layer key rather than the whole `layers` object
    // -- `layers` gets a new reference every time ANY layer registers
    // (Vehicles, dc_odb, Feeder, ...), which would otherwise restart this
    // polling loop for unrelated layer mounts.
  }, [view, layers.Customers_test]);

  return (
    <CalciteShell
      style={{
        "--calcite-ui-foreground-1": "var(--bg-secondary)",
        "--calcite-ui-text-1": "var(--text-primary)",
      }}
    >
      <TopBar slot="header" /> {/* Ensure TopBar is in header slot if applicable, otherwise default flow */}

      {/* Assuming Sidebars are Calcite Panels or correctly positioned via CSS */}
      <LeftSidebar />
      <RightSidebar />

      {/* CENTER CONTENT AREA
         This flex container becomes the "main" content of the shell.
         It holds the Map and the Table vertically.
      */}

      <div
        style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            overflow: "hidden",
            transition: "width 300ms ease-in-out",
            // CSS containment: tells the browser this subtree's layout/paint
            // is self-contained, so it doesn't need to be recomputed when a
            // sibling (LeftSidebar / RightSidebar's CalciteShellPanel)
            // resizes, and its own resizing doesn't ripple back out either.
            // This is what stops one panel's open/close transition from
            // visually disturbing its sibling.
            contain: "layout style",
        }}
      >
        {/* Map takes all available space initially */}
      <MapViews isLoading={isLoading} />

        {/* Table takes fixed space when visible, pushing map up */}
        {selectedFeatures.length > 0 && (
            <div style={{ flex: "0 0 auto", height: "auto", maxHeight: "40%" }}>
                <FeatureTable
                    features={selectedFeatures}
                />
            </div>
        )}
      </div>

    </CalciteShell>
  );
}

export default Dashboard;