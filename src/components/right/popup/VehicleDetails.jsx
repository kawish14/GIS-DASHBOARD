import React, { useMemo } from "react";
import {
  CalciteBlock,
  CalciteList,
  CalciteListItem,
  CalciteChip,
  CalciteIcon,
} from "@esri/calcite-components-react";

export default function VehicleDetails({ feature }) {
  const attr = feature.attributes;

  const fields = useMemo(
    () => [
      { label: "Registration No.", value: attr.reg_no },
      { label: "Vehicle State", value: attr.VehicleState },
      { label: "Model", value: attr.vehicle_model },
      { label: "Make", value: attr.vehicle_make },
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
      <CalciteBlock scale="s" heading="Live Vehicle Information" open collapsible={false}>
        <div slot="icon">
          <CalciteIcon icon="car" scale="s" />
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
                {field.label === "Vehicle State" ? (
                  <CalciteChip 
                    scale="s" 
                    kind={field.value === "Parked" ? "danger" : "success"} 
                    icon={field.value === "Parked" ? "minus-circle" : "gps-on"}
                  >
                    {field.value || "N/A"}
                  </CalciteChip>
                ) : (
                  <span style={{ fontSize: "0.75rem", fontWeight: "600", ...selectionStyle }}>
                    {field.value || "N/A"}
                  </span>
                )}
              </div>
            </CalciteListItem>
          ))}
        </CalciteList>
      </CalciteBlock>
    </div>
  );
}