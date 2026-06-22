import React, { useEffect, useState } from "react";
import {
  CalciteDropdown,
  CalciteButton,
  CalciteDropdownGroup,
  CalciteDropdownItem,
} from "@esri/calcite-components-react";
import { useArcGIS } from "../../context/MapContext";
import osm from "../../assets/images/osm.jpg";
import hybrid from "../../assets/images/hybrid.jpg";
import vector from "../../assets/images/vector.jpg";
import satellite from "../../assets/images/satellite.jpg";


// Style for the Row Layout
const itemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px", // Space between image and text
  padding: "4px 0"
};

// Style for the Image itself
const imgStyle = {
  width: "60px",
  height: "45px",
  objectFit: "cover",
  borderRadius: "4px",
  border: "1px solid #555"
};

const BaseMap = () => {
  const { view } = useArcGIS();
  const [activeBasemap, setActiveBasemap] = useState("");

  useEffect(() => {
    if (!view) return;
    setActiveBasemap(view.map.basemap.id);
    
    const handle = view.map.watch("basemap", (newBasemap) => {
      if (newBasemap) setActiveBasemap(newBasemap.id);
    });

    return () => handle.remove();
  }, [view]);

  const handleBasemapChange = (event) => {
    const selectedItems = event.target.selectedItems;
    if (selectedItems.length > 0) {
      const id = selectedItems[0].getAttribute("data-value");
      if (view && id) view.map.basemap = id;
    }
  };

  return (
    <CalciteDropdown style={{width:'100%'}} onCalciteDropdownSelect={handleBasemapChange}>
      <CalciteButton slot="trigger" style={{width:'100%'}} icon-end="caret-down" > {/* appearance="outline" */}
        Select Base Map
      </CalciteButton>

      <CalciteDropdownGroup selection-mode="single">
        
        {/* SATELLITE */}
        <CalciteDropdownItem
          data-value="satellite"
          selected={activeBasemap === "satellite"}
        >
          <div style={itemStyle}>
            <img src={satellite} alt="Sat" style={imgStyle} />
            <span>Satellite</span>
          </div>
        </CalciteDropdownItem>

        {/* HYBRID */}
        {/* <CalciteDropdownItem
          data-value="hybrid"
          selected={activeBasemap === "hybrid"}
        >
          <div style={itemStyle}>
            <img src={hybrid} alt="Hybrid" style={imgStyle} />
            <span>Satellite Hybrid</span>
          </div>
        </CalciteDropdownItem> */}

        {/* OPEN STREET MAP */}
        <CalciteDropdownItem
          data-value="osm"
          selected={activeBasemap === "osm"}
        >
          <div style={itemStyle}>
            <img src={osm} alt="OSM" style={imgStyle} />
            <span>Open Street Map</span>
          </div>
        </CalciteDropdownItem>

        {/* STREETS NIGHT VECTOR */}
        <CalciteDropdownItem
          data-value="streets-night-vector"
          selected={activeBasemap === "streets-night-vector"}
        >
          <div style={itemStyle}>
            <img src={vector} alt="Night" style={imgStyle} />
            <span>Streets Night Vector</span>
          </div>
        </CalciteDropdownItem>

      </CalciteDropdownGroup>
    </CalciteDropdown>
  );
};

export default BaseMap;