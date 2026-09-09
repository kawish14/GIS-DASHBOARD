import React from "react";
import SymbologyLayer from "../../symbology/SymbologyLayer";

export default function TwaSites() {
  // Delegate all symbology and map attachment to the dynamic configuration layer
  return <SymbologyLayer layerKey="site" defaultVisible={false} />;
}