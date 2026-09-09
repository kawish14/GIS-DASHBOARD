import React, { useEffect, useState } from "react";
import {
  CalciteDropdown,
  CalciteButton,
  CalciteDropdownGroup,
  CalciteDropdownItem,
} from "@esri/calcite-components-react";
import { useArcGIS } from "../state/MapProvider";
import osm from "../../../assets/images/osm.jpg";
import vector from "../../../assets/images/vector.jpg";
import satellite from "../../../assets/images/satellite.jpg";

const itemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "4px 0"
};

const imgStyle = {
  width: "60px",
  height: "45px",
  objectFit: "cover",
  borderRadius: "4px",
  border: "1px solid #555"
};

const BaseMapPicker = () => {
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
    <CalciteDropdown scale="m" style={{width:'100%'}} onCalciteDropdownSelect={handleBasemapChange}>
      <CalciteButton scale="m" slot="trigger" style={{width:'100%'}} icon-end="caret-down">
        Select Base Map
      </CalciteButton>

      <CalciteDropdownGroup selection-mode="single">
        <CalciteDropdownItem data-value="satellite" selected={activeBasemap === "satellite"}>
          <div style={itemStyle}>
            <img src={satellite} alt="Sat" style={imgStyle} />
            <span style={{ fontSize: "0.85rem" }}>Satellite</span>
          </div>
        </CalciteDropdownItem>
        <CalciteDropdownItem data-value="osm" selected={activeBasemap === "osm"}>
          <div style={itemStyle}>
            <img src={osm} alt="OSM" style={imgStyle} />
            <span style={{ fontSize: "0.85rem" }}>Open Street Map</span>
          </div>
        </CalciteDropdownItem>
        <CalciteDropdownItem data-value="streets-night-vector" selected={activeBasemap === "streets-night-vector"}>
          <div style={itemStyle}>
            <img src={vector} alt="Night" style={imgStyle} />
            <span style={{ fontSize: "0.85rem" }}>Streets Night Vector</span>
          </div>
        </CalciteDropdownItem>
      </CalciteDropdownGroup>
    </CalciteDropdown>
  );
};

export default BaseMapPicker;