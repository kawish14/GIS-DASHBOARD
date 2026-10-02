import React from "react";
import SymbologyLayer from "../symbology/SymbologyLayer";

export default function Conduit() {
  // Delegate all symbology and map attachment to the dynamic configuration layer
  return <SymbologyLayer layerKey="conduit" defaultVisible={false} />;
}