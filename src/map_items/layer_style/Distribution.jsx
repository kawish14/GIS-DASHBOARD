import React from "react";
import SymbologyLayer from "../symbology/SymbologyLayer";

export default function Distribution() {
  // Delegate all symbology and map attachment to the dynamic configuration layer
  return <SymbologyLayer layerKey="Distribution" defaultVisible={false} />;
}