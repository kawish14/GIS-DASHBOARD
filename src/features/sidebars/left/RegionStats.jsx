import React, { useEffect, useState } from "react";
import {
  CalciteList,
  CalciteListItem,
  CalciteChip,
  CalciteBlock,
  CalciteIcon,
  CalciteNotice,
  CalciteProgress,
} from "@esri/calcite-components-react";
import { useLayers } from "../../map/state/LayersContext";
import { useMapView } from "../../map/state/MapViewContext";
import { useStats } from "../../map/state/AlarmStatsContext";
import {
  FAULT_CODES,
  DERIVED_FAULT_CODES,
  STALE_FAULT_WINDOW_DAYS,
  escapeForCql,
} from "../../../shared/constants/faultCodes";
import { LOP_VARIANTS } from "../../../shared/constants/lopDetail";

/**
 * One region's alarm breakdown, rendered per region tab by LeftSidebar.jsx.
 *
 * `region` and the selected-fault pair come from the parent because they are
 * the parent's own tab state; the counts are read straight from AlarmStatsContext
 * rather than handed down, since every tab wants the same numbers.
 *
 * The two Low Optical Power rows are summary-level on purpose: the cause
 * breakdown behind them lives in the `lopdetail` field and is a step of its
 * own in the sidebar's flow (LopDetailPanel.jsx), which the parent navigates
 * to through `onOpenLopDetails`. When a cause is selected there the parent
 * hands the matching customer ids back as `lopCauseIds`, and the map highlight
 * below narrows to them -- this component stays the only writer of
 * `featureEffect`.
 */
export default function RegionStats({
  region, selectedFault, setSelectedFault, onOpenLopDetails, lopCauseIds
}) {
  const { alertCount, realtimeStats } = useStats();
  const { customerLayerView } = useLayers();
  const { view } = useMapView();

  const handleFaultClick = (faultType) => {
    setSelectedFault(prev => prev === faultType ? null : faultType);
  };

  /**
   * A LOP row is a link into its breakdown, not a toggle: it always selects
   * the fault (so the map highlights it) and always navigates in. Coming back
   * is what clears both -- see LeftSidebar.jsx.
   */
  const handleLopClick = (variantKey) => {
    setSelectedFault(variantKey);
    onOpenLopDetails?.(variantKey);
  };

  useEffect(() => {
    if (!customerLayerView) return;

    if (!selectedFault) {
      customerLayerView.featureEffect = null;
      return;
    }

    const date = new Date();
    date.setDate(date.getDate() - STALE_FAULT_WINDOW_DAYS);
    const complete_date = date.toISOString().split("T")[0];

    let whereClause = "";

    switch (selectedFault) {
      case FAULT_CODES.POWER_OFF: 
        whereClause = `alarmstate = ${FAULT_CODES.POWER_OFF}`;
        break;
      case DERIVED_FAULT_CODES.LINK_DOWN_RECENT: 
        whereClause = `alarmstate = ${FAULT_CODES.LINK_DOWN} AND fault_time >= '${complete_date}'`;
        break;
      case DERIVED_FAULT_CODES.LINK_DOWN_STALE: 
        whereClause = `alarmstate = ${FAULT_CODES.LINK_DOWN} AND fault_time <= '${complete_date}'`;
        break;
      case FAULT_CODES.GPL: 
        whereClause = `alarmstate = ${FAULT_CODES.GPL}`;
        break;
      case DERIVED_FAULT_CODES.LOP_MINOR: 
        whereClause = `alarmstate = ${FAULT_CODES.LOP} AND LOWER(perceived_severity) <> 'warning'`;
        break;
      case DERIVED_FAULT_CODES.LOP_WARNING: 
        whereClause = `alarmstate = ${FAULT_CODES.LOP} AND LOWER(perceived_severity) = 'warning'`;
        break;
      default:
        whereClause = "1=1";
    }

    // A cause picked inside the LOP breakdown narrows the same highlight
    // rather than starting a competing one. Filtering on `id` rather than on
    // `lopdetail` is deliberate: the field is absent from the layer's schema
    // whenever the batch it inferred from carried no LOP rows, and a where
    // clause naming a field that isn't there throws.
    if (lopCauseIds?.length) {
      const idList = lopCauseIds.map((id) => `'${escapeForCql(id)}'`).join(",");
      whereClause = `(${whereClause}) AND id IN (${idList})`;
    }

    customerLayerView.featureEffect = {
      filter: { where: whereClause },
      includedEffect: "bloom(0.9, 0.6pt, 1) ",
      excludedEffect: "blur(2px) opacity(0.3) "
    };

  }, [selectedFault, customerLayerView, lopCauseIds]);

  // 1. Data Extraction
  const onlineCount = alertCount?.[region]?.Online || 0;

  const CriticalFaultData = {
    linkDownShort: realtimeStats?.[region]?.[FAULT_CODES.LINK_DOWN] || 0,
    linkDownLong: realtimeStats?.[region]?.[DERIVED_FAULT_CODES.LINK_DOWN_STALE] || 0,
    lopMinor: realtimeStats?.[region]?.[FAULT_CODES.LOP] || 0,
    lopWarning: realtimeStats?.[region]?.[DERIVED_FAULT_CODES.LOP_WARNING] || 0,
  };

  const OtherFaultData = {
    powerOff: realtimeStats?.[region]?.[FAULT_CODES.POWER_OFF] || 0,
    gpl: realtimeStats?.[region]?.[FAULT_CODES.GPL] || 0,
  }

  const totalCriticalFaults = Object.values(CriticalFaultData).reduce((a, b) => a + b, 0);
  const totalOtherFaults = Object.values(OtherFaultData).reduce((a, b) => a + b, 0);

  // Helper to determine item style based on selection.
  //
  // `stayClickable` is for the drill-in rows: a selected fault normally puts
  // the others beyond reach, but coming back from a breakdown to pick the
  // other LOP row is the move a user is most likely to make. They still dim --
  // they just answer.
  const getHighlightStyle = (faultType, { stayClickable = false } = {}) => {
    if (!selectedFault) return "transition-all duration-300 opacity-100 cursor-pointer";
    if (selectedFault === faultType) {
      return "transition-all duration-300 opacity-100 scale-[1.02] z-10 bg-[var(--calcite-ui-foreground-2)] cursor-pointer";
    }
    return stayClickable
      ? "transition-all duration-300 opacity-40 grayscale-[0.5] cursor-pointer"
      : "transition-all duration-300 opacity-30 grayscale-[0.5] blur-[0.5px] pointer-events-none cursor-default";
  };

  const [showProgress, setShowProgress] = useState(true);
  const [showCriticalProgress, setShowCriticalProgress] = useState(true);

  // FIXED: Added 'region' to the dependency array
  useEffect(() => {
    let timer;
    if (totalOtherFaults === 0) {
      setShowProgress(true);
      timer = setTimeout(() => {
        setShowProgress(false);
      }, 8000);
    } else {
      setShowProgress(false);
    }
    return () => clearTimeout(timer);
  }, [totalOtherFaults, region]);

  // FIXED: Added 'region' to the dependency array
  useEffect(() => {
    let timer;
    if (totalCriticalFaults === 0) {
      setShowCriticalProgress(true); 
      timer = setTimeout(() => {
        setShowCriticalProgress(false);
      }, 8000);
    } else {
      setShowCriticalProgress(false); 
    }
    return () => clearTimeout(timer);
  }, [totalCriticalFaults, region]);

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

        {totalCriticalFaults === 0 ? (
          showCriticalProgress ? (
            <CalciteProgress type="indeterminate" label="Calculating critical faults..." text="No critical faults detected. Monitoring..." />
          ) : (
            <div className="p-4">
              <CalciteNotice open icon="check-circle" kind="success">
                <div slot="message">No critical faults detected.</div>
              </CalciteNotice>
            </div>
          )
        ) : (
          <CalciteList>
            {CriticalFaultData.linkDownShort > 0 && (
              <CalciteListItem
                className={getHighlightStyle(DERIVED_FAULT_CODES.LINK_DOWN_RECENT)}
                onClick={() => handleFaultClick(DERIVED_FAULT_CODES.LINK_DOWN_RECENT)}
                label="Linked Down < 7 Days"
                description="The OLT cannot receive expected optical signals from ONT"
              >
                <CalciteChip slot="content-end" scale="s" style={{"--calcite-chip-background-color": "#ef4444", color: "white"}}>
                  {CriticalFaultData.linkDownShort}
                </CalciteChip>
              </CalciteListItem>
            )}

            {CriticalFaultData.linkDownLong > 0 && (
              <CalciteListItem
                className={getHighlightStyle(DERIVED_FAULT_CODES.LINK_DOWN_STALE)}
                onClick={() => handleFaultClick(DERIVED_FAULT_CODES.LINK_DOWN_STALE)}
                label="Linked Down > 7 Days"
                description="The OLT cannot receive expected optical signals from ONT"
              >
                <CalciteChip slot="content-end" scale="s" style={{"--calcite-chip-background-color": "#f97316", color: "white"}}>
                  {CriticalFaultData.linkDownLong}
                </CalciteChip>
              </CalciteListItem>
            )}

            {/* Both LOP rows open the cause breakdown. The chevron beside the
                count is the affordance; `fault-drilldown` (index.css) is the
                rest of it -- pointer cursor, and the chevron sliding and
                brightening on hover. */}
            {CriticalFaultData.lopMinor > 0 && (
              <CalciteListItem
                className={`fault-drilldown ${getHighlightStyle(DERIVED_FAULT_CODES.LOP_MINOR, { stayClickable: true })}`}
                onClick={() => handleLopClick(DERIVED_FAULT_CODES.LOP_MINOR)}
                label={LOP_VARIANTS[DERIVED_FAULT_CODES.LOP_MINOR].label}
                description={LOP_VARIANTS[DERIVED_FAULT_CODES.LOP_MINOR].description}
                title="Open the LOP cause breakdown"
              >
                <div slot="content-end" className="flex items-center gap-1">
                  <CalciteChip scale="s" style={{"--calcite-chip-background-color": LOP_VARIANTS[DERIVED_FAULT_CODES.LOP_MINOR].color, "--calcite-chip-text-color": "black"}}>
                    {CriticalFaultData.lopMinor}
                  </CalciteChip>
                  <CalciteIcon icon="chevron-right" scale="s" />
                </div>
              </CalciteListItem>
            )}

            {CriticalFaultData.lopWarning > 0 && (
              <CalciteListItem
                className={`fault-drilldown ${getHighlightStyle(DERIVED_FAULT_CODES.LOP_WARNING, { stayClickable: true })}`}
                onClick={() => handleLopClick(DERIVED_FAULT_CODES.LOP_WARNING)}
                label={LOP_VARIANTS[DERIVED_FAULT_CODES.LOP_WARNING].label}
                description={LOP_VARIANTS[DERIVED_FAULT_CODES.LOP_WARNING].description}
                title="Open the LOP cause breakdown"
              >
                <div slot="content-end" className="flex items-center gap-1">
                  <CalciteChip scale="s" style={{"--calcite-chip-background-color": LOP_VARIANTS[DERIVED_FAULT_CODES.LOP_WARNING].color, "--calcite-chip-text-color": "black"}}>
                    {CriticalFaultData.lopWarning}
                  </CalciteChip>
                  <CalciteIcon icon="chevron-right" scale="s" />
                </div>
              </CalciteListItem>
            )}
          </CalciteList>
        )}
      </CalciteBlock>

      {/* SECTION D: OTHER FAULTS */}
      <CalciteBlock scale="s" heading={`Other Faults (${totalOtherFaults.toLocaleString()})`} open collapsible>
        <CalciteIcon slot="icon" icon="exclamation-mark-triangle" style={{'--calcite-ui-icon-color': 'yellow'}} />

        {totalOtherFaults === 0 ? (
          showProgress ? (
            <CalciteProgress 
              type="indeterminate" 
              label="Calculating other faults..." 
              text="No other faults detected. Monitoring..." 
            />
          ) : (
            <div className="p-4">
              <CalciteNotice open icon="check-circle" kind="success">
                <div slot="message">No other faults detected.</div>
              </CalciteNotice>
            </div>
          )
        ) : (
          <CalciteList>
            {OtherFaultData.powerOff > 0 && (
              <CalciteListItem
                className={getHighlightStyle(FAULT_CODES.POWER_OFF)}
                onClick={() => handleFaultClick(FAULT_CODES.POWER_OFF)}
                label="Power Off"
                description="The dying-gasp of GPON ONT (DGi) is generated"
              >
                <CalciteChip slot="content-end" scale="s" style={{"--calcite-chip-background-color": "#3b82f6", color: "white"}}>
                  {OtherFaultData.powerOff}
                </CalciteChip>
              </CalciteListItem>
            )}

            {OtherFaultData.gpl > 0 && (
              <CalciteListItem
                className={getHighlightStyle(FAULT_CODES.GPL)}
                onClick={() => handleFaultClick(FAULT_CODES.GPL)}
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