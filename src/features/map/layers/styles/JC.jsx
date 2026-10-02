import React from "react";
import SymbologyLayer from "../symbology/SymbologyLayer";

export default function JC() {
  // Delegate all symbology and map attachment to the dynamic configuration layer
  return <SymbologyLayer layerKey="jc" defaultVisible={false} />;
}