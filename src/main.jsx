import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Calcite's stylesheet and web-component definitions, then ArcGIS's, then ours
// -- index.css overrides both, so it has to come last.
import "@esri/calcite-components/dist/calcite/calcite.css";
import { defineCustomElements } from "@esri/calcite-components/dist/loader";
import "@arcgis/core/assets/esri/themes/dark/main.css";
import "./index.css";

import App from "./app/App";
import AppProviders from "./app/AppProviders";

// Registers <calcite-shell>, <calcite-panel> and friends as real custom
// elements. Must run before anything renders them.
defineCustomElements(window);
document.body.classList.add("calcite-mode-dark");

// Entry point. Routing lives in app/App.jsx, the context stack in
// app/AppProviders.jsx -- this file only wires them to the DOM.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>
);
