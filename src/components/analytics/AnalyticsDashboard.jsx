import React from "react";
import FaultAnalytics from "../../map_items/widgets/customer/FaultAnalytics";
import FeatureGuard from "../auth/FeatureGuard";

/**
 * Top-level "Dashboard" tab (ArcGIS Pro style: Map tab / Dashboard tab).
 *
 * This intentionally does NOT touch MapContext's map/view lifecycle -- it
 * only reads data through hooks (useLayers, etc., inside FaultAnalytics
 * itself). The Map tab's <MapViews /> stays mounted in the background the
 * whole time this tab is active, so switching tabs never tears down or
 * reloads the ArcGIS view/layers.
 *
 * Add further widgets here as siblings inside the grid -- each one gets an
 * auto-sized column, and it reflows down to a single column on narrow
 * screens.
 */
export default function AnalyticsDashboard() {
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        overflow: "auto",
        padding: "1.5rem",
        boxSizing: "border-box",
        background: "var(--bg-primary, #1a1a1a)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <FeatureGuard featureKey="tool_FaultAnalytics">
          <FaultAnalytics />
        </FeatureGuard>

        {/* Future widgets go here as additional grid items, e.g.:
            <FeatureGuard featureKey="tool_SlaTrends"><SlaTrends /></FeatureGuard>
        */}
      </div>
    </div>
  );
}