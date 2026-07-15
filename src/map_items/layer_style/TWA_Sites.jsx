import React from "react";
import SymbologyLayer from "../symbology/SymbologyLayer";

export default function TWA_Site() {
  // Delegate all symbology and map attachment to the dynamic configuration layer
  return <SymbologyLayer layerKey="site" defaultVisible={false} />;
}