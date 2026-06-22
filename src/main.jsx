import { StrictMode } from "react";
import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { MapProvider } from "./context/MapContext";

// 1. Load Calcite CSS
import "@esri/calcite-components/dist/calcite/calcite.css";

// 2. Load the Component Definitions
import { defineCustomElements } from "@esri/calcite-components/dist/loader";

// 3. Load ArcGIS CSS
import "@arcgis/core/assets/esri/themes/dark/main.css";
import "./index.css";

// 4. Register components (This makes tags like <calcite-shell> work)
defineCustomElements(window);

// 5. Set Dark Mode globally
document.body.classList.add("calcite-mode-dark");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MapProvider>
          <App />
        </MapProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);