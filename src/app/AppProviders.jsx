import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../features/auth/AuthContext";
import { MapProvider } from "../features/map/state/MapProvider";
import { SidebarLayoutProvider } from "../features/dashboard/SidebarLayoutContext";
import { ActiveFiltersProvider } from "../features/filters/ActiveFiltersContext";

/**
 * Every context the app runs on, in one place, in dependency order.
 *
 *   BrowserRouter          routing; AuthProvider navigates on logout
 *   AuthProvider           signed-in user + permissions (features/auth)
 *   MapProvider            the map session: view, layers, alarm stats,
 *                          selection, table tabs (features/map/state)
 *   SidebarLayoutProvider  dock vs overlay, which panel is open, and the
 *                          measured insets the table and map UI step aside by
 *   ActiveFiltersProvider  which filters are applied, for the map's filter bar
 *
 * They are all mounted above the router's routes rather than inside the
 * dashboard so state survives navigating to /admin and back.
 */
export default function AppProviders({ children }) {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MapProvider>
          <SidebarLayoutProvider>
            <ActiveFiltersProvider>{children}</ActiveFiltersProvider>
          </SidebarLayoutProvider>
        </MapProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
