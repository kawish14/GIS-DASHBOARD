import React, { useEffect, useState, useMemo } from "react";
import { 
  CalciteBlock, 
  CalciteList,
  CalciteListItem,
  CalciteChip,
  CalciteLoader,
  CalciteIcon,
  CalciteNotice,
  CalciteAction
} from "@esri/calcite-components-react";

export default function FeederDetails({ feature }) {

    const attr = feature.attributes;

    const fields = useMemo(() => [
    { label: "Cable ID", value: attr.cable_id },
    { label: "POP", value: attr.pop_id },
    { label: "Network", value: attr.network},
    { label: "Type", value: attr.type},
    { label: "Capacity", value: attr.capacity},
    { label: "Placement", value: attr.placement},
    { label: "Starting Point", value: attr.starting_point},
    { label: "Ending Point", value: attr.ending_point},
    { label: "Area", value: attr.town},
    { label: "City", value: attr.city},
    { label: "Region", value: attr.region},
    ], [attr]);

    const selectionStyle = {
    userSelect: "text", 
    WebkitUserSelect: "text", // For Safari/Chrome compatibility
    cursor: "text"
};

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "2px" }}>

            <CalciteBlock 
                scale="s"
                heading={attr.network || "Feeder Cable"} 
                description={`Capacity: ${attr.capacity}`}
                open 
                collapsible={false}
            >
            <div slot="icon"><CalciteIcon icon="server" scale="s" /></div>
            <CalciteList selectionMode="none">
                {fields.map((field, index) => (
                <CalciteListItem key={index} scale="s" label={field.label}>
                    <div 
                    slot="content-end" 
                    onMouseDown={(e) => e.stopPropagation()} 
                    onClick={(e) => e.stopPropagation()}
                    style={{ 
                        // 1. Remove fixed height and use stretch logic
                        alignSelf: 'stretch', 
                        display: 'flex',
                        alignItems: 'center',

                        // 2. Create the line
                        borderLeft: '1px solid var(--calcite-ui-text-3)',
                        
                        // 3. Control spacing
                        paddingLeft: '0.75rem',
                        marginLeft: '0.5rem',
                        
                        // 4. Ensure it fills the width you specified
                        width: "8.5vw",

                        // 5. Override Calcite's default slot margins if they exist
                        marginTop: '-1rem',
                        marginBottom: '-1rem',
                        paddingTop: '1rem',
                        paddingBottom: '1rem'
                    }}
                    >
                        {field.label === "Ownership" ? 
                        <CalciteChip scale="s" kind="brand" icon="user">{field.value || "N/A"}</CalciteChip> : 
                        <span style={{ fontSize: "0.75rem", fontWeight: "600", ...selectionStyle }}>{field.value || "N/A"}</span>
                        }
                    </div>
                </CalciteListItem>
                ))}
            </CalciteList>
            </CalciteBlock>

        </div>
    )
}