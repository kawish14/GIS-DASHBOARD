import React, { useMemo } from "react";
import {
  CalciteBlock,
  CalciteList,
  CalciteListItem,
  CalciteIcon,
} from "@esri/calcite-components-react";

export default function ParcelDetails({ feature }) {
  const attr = feature.attributes;

  const fields = useMemo(
    () => [
      { label: "Plot/Landuse", value: attr.plot || attr.landuse },
      { label: "Town", value: attr.town },
      { label: "Society", value: attr.society },
      { label: "Sub Block/Phase", value: attr.sub_block_phase_sector },
      { label: "Block/Phase", value: attr.block_phase_sector },
      { label: "City", value: attr.city },
      { label: "Type", value: attr.type },
      { label: "Category", value: attr.category },
      { label: "Units", value: attr.units },
    ],
    [attr]
  );

  const selectionStyle = {
    userSelect: "text",
    WebkitUserSelect: "text", 
    cursor: "text",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "2px" }}>
      <CalciteBlock scale="s" heading="Parcel Information" open collapsible={false}>
        <div slot="icon">
          <CalciteIcon icon="map-pin" scale="s" />
        </div>
        
        <CalciteList>
          {fields.map((field, index) => (
            <CalciteListItem key={index} label={field.label}>
              <div
                slot="content-end"
                style={{
                  alignSelf: "stretch",
                  display: "flex",
                  alignItems: "center",
                  borderLeft: "1px solid var(--calcite-ui-text-3)",
                  paddingLeft: "0.75rem",
                  marginLeft: "0.5rem",
                  width: "8.5vw",
                  marginTop: "-1rem",
                  marginBottom: "-1rem",
                  paddingTop: "1rem",
                  paddingBottom: "1rem",
                }}
              >
                <span style={{ fontSize: "0.75rem", fontWeight: "600", ...selectionStyle }}>
                  {field.value || "N/A"}
                </span>
              </div>
            </CalciteListItem>
          ))}
        </CalciteList>
      </CalciteBlock>
    </div>
  );
}