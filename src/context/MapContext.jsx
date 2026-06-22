import { createContext, useContext, useState, useRef, useEffect } from "react";

const MapContext = createContext(null);

export function MapProvider({ children }) {
  const [view, setView] = useState(null);
  const [map, setMap] = useState(null);
  const [alertCount, setAlertCount] = useState(null);

  const [customerLayerView, setCustomerLayerView] = useState(null);
  const [popupFeature, setPopupFeature] = useState(null);
  const [parcelFeature, setParcelFeature] = useState(null);

  const [selectedFeatures, setSelectedFeatures] = useState([]);

  const [realtimeStats, setRealtimeStats] = useState(null)

  const [layers, setLayers] = useState({});
  const[layerView, setLayerView] = useState({});

  const highlightHandleRef = useRef(null);

  const registerLayer = (id, instance) => {
    setLayers(prev => ({ ...prev, [id]: instance }));
  };


  const unregisterLayer = (id) => {
  setLayers(prev => {
    const layerInstance = prev[id];
    if (layerInstance) {
      // 1. Physically remove it from the map if it's there
      if (view && view.map) {
        view.map.remove(layerInstance);
      }
      // 2. Destroy the instance to free up memory/web workers
      if (!layerInstance.destroyed) {
        layerInstance.destroy();
      }
    }
    const next = { ...prev };
    delete next[id];
    return next;
  });
};

  useEffect(() => {
    if (!view) {
      // The map is gone, so the layers and views are invalid. Clear them.
      setLayers({});
      setLayerView({});
      setPopupFeature(null);
    }
  }, [view]);

  return (
    <MapContext.Provider value={{ 
      view, setView, map, setMap,
      layers, registerLayer, unregisterLayer, alertCount, setAlertCount,
      realtimeStats, setRealtimeStats, customerLayerView, setCustomerLayerView,
      popupFeature, setPopupFeature, layerView, setLayerView,
      selectedFeatures, setSelectedFeatures, highlightHandleRef,
      parcelFeature, setParcelFeature
      
      }}>
      
      {children}
    </MapContext.Provider>
  );
}

export function useArcGIS() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error("useArcGIS must be used inside MapProvider");
  }
  return context;
}