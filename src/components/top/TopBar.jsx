import { useEffect, useState, useRef } from "react";
import {
  CalciteDropdown,
  CalciteButton,
  CalciteDropdownGroup,
  CalciteDropdownItem,
} from "@esri/calcite-components-react";
import { useAuth } from "../../context/AuthContext";
import { useMapView, useLayers, useStats } from "../../context/MapContext";
import logo from "../../assets/images/TesLogo.png";
import SearchWidget from "../../map_items/widgets/SearchWidget";
import FeatureGuard from "../auth/FeatureGuard";
import { FAULT_CODES, DERIVED_FAULT_CODES, STALE_FAULT_WINDOW_DAYS, createEmptyRegionStats } from "../../constants/faultCodes";

export default function TopBar({ activeView, onViewChange }) {
  const { user, logout } = useAuth();
  const { view } = useMapView();
  const { layers } = useLayers();
  const { setRealtimeStats } = useStats();

  const [isLoading, setIsLoading] = useState(false);
  const [selectedFaults, setSelectedFaults] = useState(["2", "3", "4"]);
  const faultDropdownRef = useRef();

  // State and ref for the custom profile dropdown
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const customerLayer = layers.Customers_test;

  useEffect(() => {
    if (!view || !customerLayer || !user) return;

    const handleSelect = (event) => {
        const selectedValues = event
            ? Array.from(event.target.selectedItems).map(item => item.accessKey || item.getAttribute("accessKey"))
            : selectedFaults;

        setSelectedFaults(selectedValues);
        setIsLoading(true);

        const regions = user.permissions.regions.map((r) => `'${r}'`).join(",");
        const regionQuery = `region IN (${regions})`;

        let faultQuery = "";
        if (selectedValues.length === 0) {
            faultQuery = `alarmstate IN (${FAULT_CODES.POWER_OFF}, ${FAULT_CODES.LINK_DOWN}, ${FAULT_CODES.GPL}, ${FAULT_CODES.LOP})`;
        } else {
            const joinedValues = selectedValues.join(",");
            faultQuery = `alarmstate IN (${joinedValues})`;
        }

        const finalCql = `${regionQuery} AND ${faultQuery}`;

        customerLayer.customParameters.CQL_FILTER = finalCql;
        customerLayer.refresh();

        view.whenLayerView(customerLayer).then((layerView) => {
            const watcher = layerView.watch("updating", async (val) => {
                if (!val) {
                    watcher.remove();
                    await refreshStatsAfterFilter(customerLayer);
                    setIsLoading(false);
                }
            });
        });
    };

    handleSelect(null);

    const dropdown = faultDropdownRef.current;
    if (dropdown) {
        dropdown.addEventListener("calciteDropdownSelect", handleSelect);
    }

    return () => {
        if (dropdown) {
            dropdown.removeEventListener("calciteDropdownSelect", handleSelect);
        }
    };
    // BUG FIX: depend on `customerLayer` (layers.Customers_test) specifically,
    // not the whole `layers` object. `layers` gets a new identity every time
    // ANY layer registers (Vehicles, dc_odb, Feeder, ...), which previously
    // re-ran this effect -- and therefore re-queried and refreshed the
    // customer layer -- on every unrelated layer mount.
  }, [view, customerLayer, user]);

  const refreshStatsAfterFilter = async (layer) => {
    try {
      const layerView = await view.whenLayerView(layer);

      const date = new Date();
      date.setDate(date.getDate() - STALE_FAULT_WINDOW_DAYS);
      const staleThreshold = date.getTime();

      const query = layerView.createQuery();
      query.where = `alarmstate IN (${FAULT_CODES.POWER_OFF}, ${FAULT_CODES.LINK_DOWN}, ${FAULT_CODES.GPL}, ${FAULT_CODES.LOP})`;
      query.outFields = ["region", "alarmstate", "lastdowntime", "perceived_severity"];

      const results = await layerView.queryFeatures(query);

      const newStats = createEmptyRegionStats();

      results.features.forEach((feature) => {
        const region = feature.attributes.region;
        const state = feature.attributes.alarmstate;
        const lastDownTime = feature.attributes.lastdowntime;
        const severity = feature.attributes.perceived_severity;

        if (newStats[region]) {
          if (state === FAULT_CODES.LINK_DOWN) {
            const recordTime = new Date(lastDownTime).getTime();
            if (recordTime <= staleThreshold) {
              newStats[region][DERIVED_FAULT_CODES.LINK_DOWN_STALE]++;
            } else {
              newStats[region][state]++;
            }
          } else if (state === FAULT_CODES.LOP) {
            // BUG FIX: this branch was missing entirely, so every LOP fault
            // (warning or not) fell through to the generic `else` below,
            // which only ever incremented `newStats[region][4]` and never
            // `"4_warning"` -- silently dropping the warning/minor split
            // that Realtime.jsx tracks. That mismatch in shape is what
            // caused every region tab to blink together (see faultCodes.js).
            if (severity && severity.toString().toLowerCase() === "warning") {
              newStats[region][DERIVED_FAULT_CODES.LOP_WARNING]++;
            } else {
              newStats[region][state]++;
            }
          } else {
             if (newStats[region][state] !== undefined) {
                 newStats[region][state]++;
             }
          }
        }
      });

      setRealtimeStats(newStats);
    } catch (err) {
      console.error("Error refreshing stats after filter:", err);
    }
  };

  const isLayerReady = Boolean(customerLayer);

  return (
    <calcite-navigation slot="header" className="border-b border-slate-700">
      {/* 1. Moved logo further left with ml-8 and added py-2 for vertical breathing room */}
      <div slot="logo" className="flex items-center ml-8 py-2">
        <img src={logo} alt="Logo" style={{ width: "140px", height: "auto", display: "block" }} />
      </div>

      {/* Map / Dashboard workspace switcher -- mirrors ArcGIS Pro's ribbon
          tabs. Lives in content-center so it stays visually distinct from
          the logo and the right-aligned tools/profile menu. */}
      <div slot="content-center" className="flex items-center gap-1">
        <CalciteButton
          appearance={activeView === "map" ? "solid" : "transparent"}
          kind={activeView === "map" ? "brand" : "neutral"}
          scale="m"
          iconStart="map"
          onClick={() => onViewChange?.("map")}
        >
          Map
        </CalciteButton>
        <CalciteButton
          appearance={activeView === "analytics" ? "solid" : "transparent"}
          kind={activeView === "analytics" ? "brand" : "neutral"}
          scale="m"
          iconStart="graph-bar"
          onClick={() => onViewChange?.("analytics")}
        >
          Dashboard
        </CalciteButton>
      </div>

      <calcite-menu slot="content-end" className="flex items-center pr-6 gap-2">

        <FeatureGuard featureKey="SearchWidget">
          <div className="flex items-center mr-2">
            <SearchWidget />
          </div>
        </FeatureGuard>

        <FeatureGuard featureKey="tab_CustomerDropDwon">
          <CalciteDropdown ref={faultDropdownRef} width="s" disabled={isLoading ? true : undefined} close-on-select="false" className="mr-4">
            <CalciteButton slot="trigger" appearance="outline" icon-end="caret-down" icon-start="filter" loading={isLoading ? true : undefined}>
              {!isLayerReady ? "Loading Layer..." : selectedFaults.length === 0 ? "Select Faults" : `Faults (${selectedFaults.length})`}
            </CalciteButton>

            <CalciteDropdownGroup selection-mode="multiple">
              <CalciteDropdownItem accessKey="1" selected={selectedFaults.includes("1") ? true : undefined}>1 - Power Off</CalciteDropdownItem>
              <CalciteDropdownItem accessKey="2" selected={selectedFaults.includes("2") ? true : undefined}>2 - Linked Down</CalciteDropdownItem>
              <CalciteDropdownItem accessKey="3" selected={selectedFaults.includes("3") ? true : undefined}>3 - GPL (Packet Loss)</CalciteDropdownItem>
              <CalciteDropdownItem accessKey="4" selected={selectedFaults.includes("4") ? true : undefined}>4 - LOP (Optical Power)</CalciteDropdownItem>
            </CalciteDropdownGroup>
          </CalciteDropdown>
        </FeatureGuard>

        {/* Custom Notifications & User Profile Section */}
        <div className="flex items-center gap-4 profile-notification">

          {/* Profile Dropdown */}
          <div className="relative" ref={profileRef}>

            {/* 2. Avatar Trigger matched to #334155 (bg-slate-700) */}
            <div
              className="cursor-pointer"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              <calcite-avatar
                full-name= {user.full_name}
                scale="m"
              />
            </div>

            {/* 3. Dropdown Card matched to Dark Theme */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-3 w-64 bg-[#2b2b2b] rounded-lg shadow-2xl border border-slate-700 z-[9999] flex flex-col overflow-hidden">

                {/* Header Profile Info - Slightly darker bg for separation */}
                <div className="flex items-center p-4">
                  <calcite-icon icon="user" />
                  <div className="ml-3 overflow-hidden">
                    <p className="text-sm font-bold text-white truncate">{user.full_name}</p>
                    <p className="text-[12px] text-slate-400 truncate tracking-tight">{user.email}</p>
                  </div>
                </div>

                {/* Dropdown Links */}
                <div className="py-2 bg-[#2b2b2b]">
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-5 py-2.5 text-[13px] text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors border-t border-slate-700 mt-1"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </calcite-menu>
    </calcite-navigation>
  );
}