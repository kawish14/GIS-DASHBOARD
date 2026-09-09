import React, { useEffect } from "react";
import SymbologyLayer from "../symbology/SymbologyLayer";

export default function Feeder() {
  // Delegate all symbology and map attachment to the dynamic configuration layer
  return <SymbologyLayer layerKey="Feeder" defaultVisible={false} />;
}