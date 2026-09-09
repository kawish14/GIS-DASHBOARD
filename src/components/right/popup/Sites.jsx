import React, { useEffect, useState, useMemo } from "react";
import {
  CalciteBlock,
  CalciteList,
  CalciteListItem,
  CalciteChip,
  CalciteLoader,
  CalciteIcon,
  CalciteNotice,
  CalciteAction,
} from "@esri/calcite-components-react";

export default function Sites({ feature }) {
    const attr = feature.attributes;

    const fields = useMemo(
      () => [
        { label: "Site Name", value: attr.site_name },
        { label: "Region", value: attr.region },
        { label: "Sub Region", value: attr.sub_region },
        { label: "Type", value: attr.site_type }
      ],
      [attr],
    );

     const selectionStyle = {
        userSelect: "text",
        WebkitUserSelect: "text", // For Safari/Chrome compatibility
        cursor: "text",
      };

    return (
        <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                gap: "2px",
              }}
            >
              <CalciteBlock scale="s" heading={"Joint"} open collapsible={false}>
                <div slot="icon">
                  <CalciteIcon icon="server" scale="s" />
                </div>
                <CalciteList selectionMode="none">
                  {fields.map((field, index) => (
                    <CalciteListItem key={index} scale="s" label={field.label}>
                      <div
                        slot="content-end"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          // 1. Remove fixed height and use stretch logic
                          alignSelf: "stretch",
                          display: "flex",
                          alignItems: "center",
        
                          // 2. Create the line
                          borderLeft: "1px solid var(--calcite-ui-text-3)",
        
                          // 3. Control spacing
                          paddingLeft: "0.75rem",
                          marginLeft: "0.5rem",
        
                          // 4. Ensure it fills the width you specified
                          width: "8.5vw",
        
                          // 5. Override Calcite's default slot margins if they exist
                          marginTop: "-1rem",
                          marginBottom: "-1rem",
                          paddingTop: "1rem",
                          paddingBottom: "1rem",
                        }}
                      >
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: "600",
                              ...selectionStyle,
                            }}
                          >
                            {field.value || "N/A"}
                          </span>
                      
                      </div>
                    </CalciteListItem>
                  ))}
                </CalciteList>
              </CalciteBlock>
            </div>
    )
}