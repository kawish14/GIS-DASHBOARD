import React from "react";
import {
  CalciteTabs,
  CalciteTabNav,
  CalciteTabTitle,
  CalciteTab,
  CalciteIcon,
  CalcitePanel,
  CalciteNotice
} from "@esri/calcite-components-react";
import { usePopup } from "../../context/MapContext";

// Import your detailed view components
import CustomerDetails from "./popup/CustomerDetails";
import DcDetail from "./popup/DcDetails";
import PopDetails from "./popup//PopDetails";

export default function FeatureDetailsSidebar() {
  const { 
    popupFeatures, 
    setPopupFeatures, 
    activePopupIndex, 
    setActivePopupIndex 
  } = usePopup();

  // 1. Check the new array length!
  if (!popupFeatures || popupFeatures.length === 0) {
    return null; // Closes the panel if nothing is selected
  }

  const handleTabChange = (event) => {
    const tabs = Array.from(event.target.querySelectorAll("calcite-tab-title"));
    const selectedIndex = tabs.indexOf(event.target.selectedItems[0]);
    if (selectedIndex !== -1) setActivePopupIndex(selectedIndex);
  };

  const handleCloseTab = (index, e) => {
    e.stopPropagation(); 
    const newFeatures = popupFeatures.filter((_, i) => i !== index);
    setPopupFeatures(newFeatures);

    if (newFeatures.length === 0) {
      setActivePopupIndex(0);
    } else if (index <= activePopupIndex && activePopupIndex > 0) {
      setActivePopupIndex(prev => prev - 1);
    }
  };

  const renderComponent = (feature) => {
    const title = feature.layer?.title;
    switch (title) {
      case "Customers_test": return <CustomerDetails feature={feature} />;
      case "dc_odb": return <DcDetail feature={feature} />;
      case "pop": return <PopDetails feature={feature} />;
      default: return <div style={{ padding: "1rem" }}>Unsupported layer: {title}</div>;
    }
  };

  const getTabLabel = (feature) => {
    const id = feature.attributes?.id || feature.attributes?.OBJECTID || "Unknown";
    const title = feature.layer?.title || "Feature";
    if (title === "Customers_test") return `Cust: ${id}`;
    if (title === "dc_odb") return `DC: ${id}`;
    if (title === "pop") return `POP: ${id}`;
    return `${title.substring(0, 5)}: ${id}`;
  };

  return (
    <CalcitePanel heading="Selected Features">
      <CalciteTabs layout="center" onCalciteTabsChange={handleTabChange}>
        <CalciteTabNav slot="title-group">
          {popupFeatures.map((feature, index) => (
            <CalciteTabTitle
              key={`tab-title-${index}`}
              selected={index === activePopupIndex ? true : undefined}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>{getTabLabel(feature)}</span>
                <div 
                  onClick={(e) => handleCloseTab(index, e)}
                  style={{ display: "flex", padding: "2px", cursor: "pointer" }}
                >
                  <CalciteIcon icon="x" scale="s" />
                </div>
              </div>
            </CalciteTabTitle>
          ))}
        </CalciteTabNav>

        {popupFeatures.map((feature, index) => (
          <CalciteTab
            key={`tab-content-${index}`}
            selected={index === activePopupIndex ? true : undefined}
          >
            <div style={{ height: "100%", overflowY: "auto" }}>
              {renderComponent(feature)}
            </div>
          </CalciteTab>
        ))}
      </CalciteTabs>
    </CalcitePanel>
  );
}