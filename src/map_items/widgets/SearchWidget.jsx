import React, { useEffect, useRef } from "react";
import { useArcGIS } from "../../context/MapContext";
import Search from "@arcgis/core/widgets/Search";

export default function SearchWidget () {
    const { view, layers, setPopupFeature } = useArcGIS();
    const searchRef = useRef(null);

    useEffect(() => {
    if (!view || !searchRef.current || !layers?.Customers_test) return;

    const customerLayer = layers.Customers_test;
    
    // Check if the tracking layer is registered yet
    const vehicleLayer = layers.Vehicles; 

    // Setup sources array
    const searchSources = [
      {
        layer: customerLayer,
        searchFields: ["id", "name"], 
        displayField: "name",
        exactMatch: false,
        outFields: ["*"], 
        name: "Customers",
        placeholder: "Customer Name or ID",
        maxResults: 6,
        maxSuggestions: 6,
        suggestionsEnabled: true,
        minSuggestCharacters: 1,
      }
    ];

    // --- PRO ADDITION: Dynamically add Vehicles to search if available ---
    if (vehicleLayer) {
      searchSources.push({
        layer: vehicleLayer,
        searchFields: ["reg_no", "vehicle_model"], // Allow searching by Registration or Model
        displayField: "reg_no",
        exactMatch: false,
        outFields: ["*"],
        name: "Live Vehicles",
        placeholder: "Search Vehicles...",
        maxResults: 4,
        maxSuggestions: 4,
        suggestionsEnabled: true,
        minSuggestCharacters: 2,
      });
    }

    // Initialize the Search widget
    const searchWidget = new Search({
      view: view,
      container: searchRef.current,
      includeDefaultSources: true,
      locationEnabled: false, 
      popupEnabled: false,     
      resultGraphicEnabled: true,
      searchAllEnabled: true, // Set to true so user can search both Customers & Vehicles
      sources: searchSources
    });

    const handleSelectResult = (event) => {
      if (event && event.result && event.result.feature) {
        const feature = event.result.feature;
        
        setPopupFeature(feature);
        
        view.goTo({
          target: feature.geometry,
          zoom: 18 
        }, {
          duration: 1000, 
          easing: "ease-in-out"
        }).catch((err) => {
          if (err.name !== "AbortError") {
            console.error("Zoom failed: ", err);
          }
        });
      }
    };

    searchWidget.on("select-result", handleSelectResult);

    return () => {
      if (searchWidget) {
        searchWidget.destroy();
      }
    };
  }, [view, layers]); // Re-run effect if layers change (so Vehicles gets picked up)

  return (
    <div 
      ref={searchRef} 
      style={{ width: "100%", padding: "10px", backgroundColor: "var(--calcite-ui-foreground-1)" }} 
    />
  );
}