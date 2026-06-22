import { useEffect, useState, useRef } from "react";
import {
  CalciteDropdown,
  CalciteButton,
  CalciteDropdownGroup,
  CalciteDropdownItem,
} from "@esri/calcite-components-react";
import { useAuth } from "../../context/AuthContext";
import { useArcGIS } from "../../context/MapContext";
import logo from "../../assets/images/TesLogo.png";
import SearchWidget from "../../map_items/widgets/SearchWidget";
import FeatureGuard from "../auth/FeatureGuard";

export default function TopBar() {
  const { user, logout } = useAuth();
  const { view, layers, setRealtimeStats } = useArcGIS();

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

  useEffect(() => {
    if (!view || !layers.Customers_test || !user) return;

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
            faultQuery = "alarmstate IN (1, 2, 3, 4)";
        } else {
            const joinedValues = selectedValues.join(",");
            faultQuery = `alarmstate IN (${joinedValues})`;
        }

        const finalCql = `${regionQuery} AND ${faultQuery}`;
        
        layers.Customers_test.customParameters.CQL_FILTER = finalCql;
        layers.Customers_test.refresh();

        view.whenLayerView(layers.Customers_test).then((layerView) => {
            const watcher = layerView.watch("updating", async (val) => {
                if (!val) {
                    watcher.remove();
                    await refreshStatsAfterFilter(layers.Customers_test);
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
  }, [view, layers, user]);

  const refreshStatsAfterFilter = async (layer) => {
    try {
      const layerView = await view.whenLayerView(layer);
      
      const date = new Date();
      date.setDate(date.getDate() - 7);
      const sevenDaysAgo = date.getTime();

      const query = layerView.createQuery();
      query.where = "alarmstate IN (1, 2, 3, 4)";
      query.outFields = ["*"];
      
      const results = await layerView.queryFeatures(query);

      const newStats = {
        North: { 1: 0, 2: 0, "2_long": 0, 3: 0, 4: 0 },
        South: { 1: 0, 2: 0, "2_long": 0, 3: 0, 4: 0 },
        Central: { 1: 0, 2: 0, "2_long": 0, 3: 0, 4: 0 }
      };

      results.features.forEach((feature) => {
        const region = feature.attributes.region;
        const state = feature.attributes.alarmstate;
        const lastDownTime = feature.attributes.lastdowntime;

        if (newStats[region]) {
          if (state === 2) {
            const recordTime = new Date(lastDownTime).getTime();
            if (recordTime <= sevenDaysAgo) {
              newStats[region]["2_long"]++;
            } else {
              newStats[region][2]++;
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

  const isLayerReady = layers && layers.Customers_test;


  return (
    <calcite-navigation slot="header" className="border-b border-slate-700">
      {/* 1. Moved logo further left with ml-8 and added py-2 for vertical breathing room */}
      <div slot="logo" className="flex items-center ml-8 py-2">
        <img src={logo} alt="Logo" style={{ width: "140px", height: "auto", display: "block" }} />
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
          
          {/* Notification Bell with Dark Theme hover */}
         {/*  <button className="text-slate-400 hover:text-white transition-colors pt-1 hover:bg-slate-700 p-1 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
          </button> */}

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
                  {/* <button className="w-full text-left px-5 py-2.5 text-[13px] text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
                    Account overview
                  </button> */}
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