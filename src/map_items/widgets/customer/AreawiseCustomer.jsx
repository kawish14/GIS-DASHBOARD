import React, { useEffect, useState, useRef } from "react";
import {
  CalciteDropdown,
  CalciteButton,
  CalciteDropdownGroup,
  CalciteDropdownItem,
  CalciteIcon,
  CalciteScrim, // <-- Imported Scrim for the loading overlay
} from "@esri/calcite-components-react";
import { useArcGIS } from "../../../context/MapContext";
import { useAuth } from "../../../context/AuthContext"; 

export default function AreawiseCustomer() {
  const { view, layers } = useArcGIS();
  const { user } = useAuth(); 

  const [selectedRegion, setSelectedRegion] = useState("all");
  const [selectedZone, setSelectedZone] = useState("all");

  const [locations, setLocations] = useState([]);
  const [uniqueRegions, setUniqueRegions] = useState([]);
  const [filteredZones, setFilteredZones] = useState([]);
  
  // Loading states
  const [isFetchingOptions, setIsFetchingOptions] = useState(true);
  const [isApplyingFilter, setIsApplyingFilter] = useState(false);

  const zoneDropdownRef = useRef(null);

  // 1. Fetch Region and Zone Data
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        setIsFetchingOptions(true);
        const url = "http://gis.tes.com.pk:29881/geoserver/web_app/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=web_app%3Azones&outputFormat=application%2Fjson&propertyName=region,zone";
        const response = await fetch(url);
        const data = await response.json();

        const uniquePairs = new Set();
        const processedLocations = [];
        const regionsSet = new Set();

        data.features.forEach((feature) => {
          const regionVal = feature.properties.region?.trim();
          const zoneVal = feature.properties.zone?.trim();

          if (regionVal || zoneVal) {
            const key = `${regionVal}|${zoneVal}`;
            if (!uniquePairs.has(key)) {
              uniquePairs.add(key);
              processedLocations.push({ region: regionVal, zone: zoneVal });
              if (regionVal) regionsSet.add(regionVal);
            }
          }
        });

        setLocations(processedLocations);
        setUniqueRegions(Array.from(regionsSet).sort());
        
        const allZones = new Set(processedLocations.map(loc => loc.zone).filter(Boolean));
        setFilteredZones(Array.from(allZones).sort());

      } catch (error) {
        console.error("Error fetching region/zone data:", error);
      } finally {
        setIsFetchingOptions(false);
      }
    };

    fetchLocations();
  }, []);

  // 2. Cascading Dropdown Logic
  useEffect(() => {
    if (selectedRegion === "all") {
      const allZones = new Set(locations.map(loc => loc.zone).filter(Boolean));
      setFilteredZones(Array.from(allZones).sort());
    } else {
      const relevantZones = new Set(
        locations
          .filter(loc => loc.region === selectedRegion)
          .map(loc => loc.zone)
          .filter(Boolean)
      );
      setFilteredZones(Array.from(relevantZones).sort());
      
      if (selectedZone !== "all" && !relevantZones.has(selectedZone)) {
        setSelectedZone("all");
      }
    }
  }, [selectedRegion, locations, selectedZone]);

  useEffect(() => {
    const zoneDropdown = zoneDropdownRef.current;
    const handleZoneSelect = (event) => {
      const selectedItem = event.target.selectedItems[0];
      if (selectedItem) setSelectedZone(selectedItem.accessKey || selectedItem.getAttribute("accessKey"));
    };

    if (zoneDropdown) zoneDropdown.addEventListener("calciteDropdownSelect", handleZoneSelect);
    return () => {
      if (zoneDropdown) zoneDropdown.removeEventListener("calciteDropdownSelect", handleZoneSelect);
    };
  }, []);

  // 3. APPLY SPATIAL FILTER
  const handleApplyFilter = async () => {
    if (!layers.Customers_test || !user || !view) return;

    try {
      setIsApplyingFilter(true);
      let esriGeom = null;

      if (selectedRegion !== "all" || selectedZone !== "all") {
        let boundsCql = [];
        if (selectedRegion !== "all") boundsCql.push(`region = '${selectedRegion}'`);
        if (selectedZone !== "all") boundsCql.push(`zone = '${selectedZone}'`);
        
        const spatialUrl = `http://gis.tes.com.pk:29881/geoserver/web_app/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=web_app%3Azones&outputFormat=application%2Fjson&CQL_FILTER=${encodeURIComponent(boundsCql.join(" AND "))}`;
        
        const res = await fetch(spatialUrl);
        const geojson = await res.json();

        if (geojson.features && geojson.features.length > 0) {
          const rings = [];
          geojson.features.forEach(feat => {
              const geom = feat.geometry;
              console.log(geom)
              if (geom.type === "Polygon") {
                  geom.coordinates.forEach(ring => rings.push(ring));
              } else if (geom.type === "MultiPolygon") {
                  geom.coordinates.forEach(poly => {
                      poly.forEach(ring => rings.push(ring));
                  });
              }
          });

          if (rings.length > 0) {
              esriGeom = {
                  type: "polygon",
                  rings: rings,
                  spatialReference: { wkid: 4326 } 
              };
          }
        }
      }

      const baseRegions = user.permissions.regions.map(r => `'${r}'`).join(",");
      let serverCql = `alarmstate IN (0,1,2,3,4)`;
      
      if (!esriGeom) serverCql += ` AND region IN (${baseRegions})`;

      layers.Customers_test.customParameters.CQL_FILTER = serverCql;
      layers.Customers_test.refresh();

      const layerView = await view.whenLayerView(layers.Customers_test);
      
      if (esriGeom) {
          layerView.filter = {
              geometry: esriGeom,
              spatialRelationship: "intersects"
          };
          view.goTo({ target: esriGeom, tilt: 0 }).catch(() => {});
      } else {
          layerView.filter = null; 
      }

    } catch (err) {
      console.error("Failed to apply spatial filter:", err);
    } finally {
      setIsApplyingFilter(false);
    }
  };

  // 4. CLEAR SPATIAL FILTER
  const handleClearFilter = async () => {
    if (!layers.Customers_test || !user || !view) return;
    
    setSelectedRegion("all");
    setSelectedZone("all");

    const layerView = await view.whenLayerView(layers.Customers_test);
    layerView.filter = null; 

    const baseRegions = user.permissions.regions.map(r => `'${r}'`).join(",");
    const defaultCql = `region IN (${baseRegions}) AND alarmstate IN (1,2,3,4)`;

    layers.Customers_test.customParameters.CQL_FILTER = defaultCql;
    layers.Customers_test.refresh();
  };

  const isLayerReady = layers && layers.Customers_test;
  const isComponentDisabled = !isLayerReady || isFetchingOptions || isApplyingFilter;
  const isLoading = isFetchingOptions || isApplyingFilter;

  return (
    // Added position: "relative" so the scrim perfectly overlays this div
    <div style={{ position: "relative", display: "flex", flexDirection:"column", alignItems: "center", gap: "1.5rem", padding: "10px 15px", backgroundColor: "#2b2b2c", borderRadius: "8px", border: "1px solid #e0e0e0" }}>
      
      {/* Renders the overlay spinner while fetching initial options or applying the spatial filter */}
      {isLoading && <CalciteScrim loading={true} />}

      {/* REGION BUTTONS */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "14px", fontWeight: "600", color: "#d1d1d1", display: "flex", alignItems: "center", gap: "4px" }}>
          <CalciteIcon icon="map-pin" scale="s" /> Region:
        </span>
        <div style={{ display: "flex", gap: "0.25rem", backgroundColor: "#1e1d1d", padding: "4px", borderRadius: "6px", border: "1px solid #2c2929" }}>
          <CalciteButton
            appearance={selectedRegion === "all" ? "solid" : "transparent"}
            kind={selectedRegion === "all" ? "brand" : "neutral"}
            scale="s"
            disabled={isComponentDisabled ? true : undefined}
            onClick={() => setSelectedRegion("all")}
          >
            All
          </CalciteButton>
          
          {uniqueRegions.map((region) => (
            <CalciteButton
              key={region}
              appearance={selectedRegion === region ? "solid" : "transparent"}
              kind={selectedRegion === region ? "brand" : "neutral"}
              scale="s"
              disabled={isComponentDisabled ? true : undefined}
              onClick={() => setSelectedRegion(region)}
            >
              {region}
            </CalciteButton>
          ))}
        </div>
      </div>

      {/* ZONE DROPDOWN & ACTION BUTTONS */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", width: "100%", justifyContent: "center" }}>
        
        {/* Dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem"}}>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#d1d1d1" }}>Zone:</span>
          <CalciteDropdown ref={zoneDropdownRef} close-on-select="true" disabled={isComponentDisabled || selectedRegion === "all" ? true : undefined}>
            <CalciteButton
              slot="trigger"
              appearance="outline"
              icon-end="caret-down"
              disabled={isComponentDisabled || selectedRegion === "all" ? true : undefined}
            >
              {selectedRegion === "all" ? "Select Region" : selectedZone === "all" ? "All Zones" : selectedZone}
            </CalciteButton>

            <CalciteDropdownGroup selection-mode="single">
              <CalciteDropdownItem accessKey="all" selected={selectedZone === "all" ? true : undefined}>
                All Zones
              </CalciteDropdownItem>
              {filteredZones.map((zone) => (
                <CalciteDropdownItem key={zone} accessKey={zone} selected={selectedZone === zone ? true : undefined}>
                  {zone}
                </CalciteDropdownItem>
              ))}
            </CalciteDropdownGroup>
          </CalciteDropdown>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <CalciteButton 
            appearance="solid" 
            kind="brand" 
            icon-start="filter"
            disabled={isComponentDisabled ? true : undefined}
            onClick={handleApplyFilter}
          >
            Apply 
          </CalciteButton>

          <CalciteButton 
            appearance="outline-fill" 
            kind="danger" 
            icon-start="trash"
            disabled={isComponentDisabled ? true : undefined}
            onClick={handleClearFilter}
          >
            Clear
          </CalciteButton>
        </div>

      </div>
    </div>
  );
}