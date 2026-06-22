import React, { useState, useEffect } from "react";
import {
  CalciteList,
  CalciteListItem,
  CalciteChip,
  CalciteBlock,
  CalciteIcon,
  CalciteNotice,
  CalciteProgress,
  CalciteButton
} from "@esri/calcite-components-react";
import { useArcGIS } from "../../context/MapContext";

export default function RegionStats({ 
  region, alertCount, realtimeStats, selectedFault, setSelectedFault 
}) {
  const { layers, view, customerLayerView } = useArcGIS();

  const handleFaultClick = (faultType) => {
    setSelectedFault(prev => prev === faultType ? null : faultType);
    console.log("customerLayerView", customerLayerView)
  };

  useEffect(() => {
    if (!customerLayerView) return;

    if (!selectedFault) {
      customerLayerView.featureEffect = null;
      return;
    }

    const date = new Date();
    date.setDate(date.getDate() - 7);
    const complete_date = date.toISOString().split("T")[0];

    let whereClause = "";

    // Updated Logic for distinct fault states, splitting both 2 and 4
    switch (selectedFault) {
      case 1: // Power Off
        whereClause = "alarmstate = 1";
        break;
      case 2: // Link Down (New - < 7 days)
        whereClause = "alarmstate = 2"; // Fallback/Original or matching state
        break;
      case "2_stale": // Link Down (New - < 7 days from UI click mapping)
        whereClause = `alarmstate = 2 AND lastdowntime >= '${complete_date}'`;
        break;
      case "2_long": // Link Down (Stale - > 7 days)
        whereClause = `alarmstate = 2 AND lastdowntime <= '${complete_date}'`;
        break;
      case 3: // GPL
        whereClause = "alarmstate = 3";
        break;
      case "4": // LOP Minor
        whereClause = "alarmstate = 4 AND LOWER(perceived_severity) <> 'warning'";
        break;
      case "4_warning": // LOP Warning
        whereClause = "alarmstate = 4 AND LOWER(perceived_severity) = 'warning'";
        break;
      default:
        whereClause = "1=1";
    }

    customerLayerView.featureEffect = {
      filter: { where: whereClause },
      includedEffect: "bloom(0.9, 0.6pt, 1) ",
      excludedEffect: "blur(2px) opacity(0.3) "
    };

  }, [selectedFault, customerLayerView]);

  // 1. Data Extraction
  const onlineCount = alertCount?.[region]?.Online || 0;
  
  const CriticalFaultData = {
    linkDownShort: realtimeStats?.[region]?.[2] || 0,
    linkDownLong: realtimeStats?.[region]?.["2_long"] || 0,
    lopMinor: realtimeStats?.[region]?.[4] || 0,         // Maps to base alarm state 4 count (Minor)
    lopWarning: realtimeStats?.[region]?.["4_warning"] || 0, // Maps to warning count
  };

  const OtherFaultData = {
    powerOff: realtimeStats?.[region]?.[1] || 0,
    gpl: realtimeStats?.[region]?.[3] || 0,
  }

  const totalCriticalFaults = Object.values(CriticalFaultData).reduce((a, b) => a + b, 0);
  const totalOtherFaults = Object.values(OtherFaultData).reduce((a, b) => a + b, 0);

  // Kafka Stats for Health %
  const onlineKafka = alertCount?.[region]?.Online || 0;
  const criticalFaultsKafka = (alertCount?.[region]?.['Linked Down'] || 0) +
                              (alertCount?.[region]?.['Low Optical Power'] || 0);

  const otherFaultsKafka = (alertCount?.[region]?.['Power Off'] || 0) +
                           (alertCount?.[region]?.['GEM Packet Loss'] || 0);
  
  const totalAssets = onlineKafka + criticalFaultsKafka + otherFaultsKafka;
  const healthPercentage = totalAssets > 0 ? ((onlineKafka / totalAssets) * 100).toFixed(1) : 0;

  // Helper to determine item style based on selection
  const getHighlightStyle = (faultType) => {
    if (!selectedFault) return "transition-all duration-300 opacity-100 cursor-pointer";
    return selectedFault === faultType 
      ? "transition-all duration-300 opacity-100 scale-[1.02] z-10 bg-[var(--calcite-ui-foreground-2)] cursor-pointer" 
      : "transition-all duration-300 opacity-30 grayscale-[0.5] blur-[0.5px] pointer-events-none cursor-default";
  };

  return (
    <div className="flex flex-col h-full bg-[var(--calcite-ui-foreground-1)]">
      {/* SECTION B: OPERATIONAL STATUS */}
      <CalciteBlock scale="s" heading="Operational Status" open collapsible>
        <CalciteIcon slot="icon" icon="check-circle" style={{'--calcite-ui-icon-color': 'rgba(0, 255, 94, 0.95)'}} />
        <CalciteList>
          <CalciteListItem label="Online Active" description="Devices working normally">
            <div slot="content-end" className="flex items-center gap-2">
              <span className="text-green-500 text-sm font-bold">{onlineCount.toLocaleString()}</span>
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
            </div>
          </CalciteListItem>
        </CalciteList>
      </CalciteBlock>

      {/* SECTION C: CRITICAL FAULTS */}
      <CalciteBlock scale="s" heading={`Critical Faults (${totalCriticalFaults.toLocaleString()})`} open collapsible>
        <CalciteIcon slot="icon" icon="exclamation-mark-triangle" style={{'--calcite-ui-icon-color': 'red'}} />
        
        {totalCriticalFaults === 0 ? 
          <CalciteProgress type="indeterminate" label="Calculating critical faults..." text="No critical faults detected. Monitoring..." />
          : null
        }

        {criticalFaultsKafka === 0 ? (
          <div className="p-4">
            <CalciteNotice open icon="check-circle" kind="success">
              <div slot="message">No critical faults detected.</div>
            </CalciteNotice>
          </div>
        ) : (
          <CalciteList>
            {/* Link Down New */}
            {CriticalFaultData.linkDownShort > 0 && (
              <CalciteListItem
                className={getHighlightStyle('2_stale')}
                onClick={() => handleFaultClick('2_stale')}
                label="Linked Down < 7 Days"
                description="The OLT cannot receive expected optical signals from ONT"
              >
                <CalciteChip slot="content-end" scale="s" style={{"--calcite-chip-background-color": "#ef4444", color: "white"}}>
                  {CriticalFaultData.linkDownShort}
                </CalciteChip>
              </CalciteListItem>
            )}

            {/* Link Down Stale */}
            {CriticalFaultData.linkDownLong > 0 && (
              <CalciteListItem
                className={getHighlightStyle('2_long')}
                onClick={() => handleFaultClick('2_long')}
                label="Linked Down > 7 Days"
                description="The OLT cannot receive expected optical signals from ONT"
              >
                <CalciteChip slot="content-end" scale="s" style={{"--calcite-chip-background-color": "#f97316", color: "white"}}>
                  {CriticalFaultData.linkDownLong}
                </CalciteChip>
              </CalciteListItem>
            )}

            {/* LOP Minor */}
            {CriticalFaultData.lopMinor > 0 && (
              <CalciteListItem
                className={getHighlightStyle('4')}
                onClick={() => handleFaultClick('4')}
                label="Low Optical Power"
                description="Remote optical transceiver parameters exceed alarm threshold"
              >
                <CalciteChip slot="content-end" scale="s" style={{"--calcite-chip-background-color": "#e6ff04", "--calcite-chip-text-color": "black"}}>
                  {CriticalFaultData.lopMinor}
                </CalciteChip>
              </CalciteListItem>
            )}

            {/* LOP Warning */}
            {CriticalFaultData.lopWarning > 0 && (
              <CalciteListItem
                className={getHighlightStyle('4_warning')}
                onClick={() => handleFaultClick('4_warning')}
                label="Low Optical Power (Warning)"
                description="Remote optical transceiver parameters exceed warning threshold"
              >
                <CalciteChip slot="content-end" scale="s" style={{"--calcite-chip-background-color": "#bff705", "--calcite-chip-text-color": "black"}}>
                  {CriticalFaultData.lopWarning}
                </CalciteChip>
              </CalciteListItem>
            )}
          </CalciteList>
        )}
      </CalciteBlock>

      {/* SECTION D: OTHER FAULTS */}
      <CalciteBlock scale="s" heading={`Other Faults (${totalOtherFaults.toLocaleString()})`} open collapsible>
        <CalciteIcon slot="icon" icon="exclamation-mark-triangle" style={{'--calcite-ui-icon-color': 'yellow'}} />
        
        {totalOtherFaults === 0 ? 
          <CalciteProgress type="indeterminate" label="Calculating other faults..." text="No other faults detected. Monitoring..." />
          : null
        }

        {otherFaultsKafka === 0 ? (
          <div className="p-4">
            <CalciteNotice open icon="check-circle" kind="success">
              <div slot="message">No other faults detected.</div>
            </CalciteNotice>
          </div>
        ) : (
          <CalciteList>
            {/* Power Off */}
            {OtherFaultData.powerOff > 0 && (
              <CalciteListItem
                className={getHighlightStyle(1)}
                onClick={() => handleFaultClick(1)}
                label="Power Off"
                description="The dying-gasp of GPON ONT (DGi) is generated"
              >
                <CalciteChip slot="content-end" scale="s" style={{"--calcite-chip-background-color": "#3b82f6", color: "white"}}>
                  {OtherFaultData.powerOff}
                </CalciteChip>
              </CalciteListItem>
            )}

            {/* GPL */}
            {OtherFaultData.gpl > 0 && (
              <CalciteListItem
                className={getHighlightStyle(3)}
                onClick={() => handleFaultClick(3)}
                label="GEM Packet Loss"
                description="The loss of GEM channel delineation (LCDGi) occurs"
              >
                <CalciteChip slot="content-end" scale="s" style={{"--calcite-chip-background-color": "#000000", color: "white"}}>
                  {OtherFaultData.gpl}
                </CalciteChip>
              </CalciteListItem>
            )}
          </CalciteList>
        )}
      </CalciteBlock>
    </div>
  );
}