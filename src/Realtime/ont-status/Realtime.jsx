import React, { useEffect, useRef } from "react";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils"; 
import { socket } from "../socket";
import { useArcGIS } from "../../context/MapContext";
import { useAuth } from "../../context/AuthContext";
import Graphic from "@arcgis/core/Graphic";
import { RotatingMarkers } from "./RotatingMarkers";

export default function Realtime() {
  const { layers, view, setAlertCount, setRealtimeStats, realtimeStats } = useArcGIS();
  const { user } = useAuth();
  
  const alertBuffer = useRef(new Map()); 
  const isProcessing = useRef(false);
  const isInitialized = useRef(false);

  let isMounted = true;

  // --- HELPER: Recalculate Stats from LayerView ---
  const refreshFaultStats = async (layer) => {
    try {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      const sevenDaysAgo = date.getTime();

      const query = layer.createQuery();
      query.where = "alarmstate IN (1, 2, 3, 4)";
      // Added perceived_severity to outFields query configuration
      query.outFields = ["region", "alarmstate", "lastdowntime", "perceived_severity"];
      
      const results = await layer.queryFeatures(query);

      // Default Structure incorporating 4_warning
      const newStats = {
        North: { 1: 0, 2: 0, "2_long": 0, 3: 0, 4: 0, "4_warning": 0 },
        South: { 1: 0, 2: 0, "2_long": 0, 3: 0, 4: 0, "4_warning": 0 },
        Central: { 1: 0, 2: 0, "2_long": 0, 3: 0, 4: 0, "4_warning": 0 }
      };

      results.features.forEach((feature) => {
        const region = feature.attributes.region;
        const state = feature.attributes.alarmstate;
        const lastDownTime = feature.attributes.lastdowntime;
        const severity = feature.attributes.perceived_severity;

        if (newStats[region]) {
          if (state === 2) {
            const recordTime = new Date(lastDownTime).getTime();
            if (recordTime <= sevenDaysAgo) {
              newStats[region]["2_long"]++;
            } else {
              newStats[region][2]++;
            }
          } else if (state === 4) {
            // Check for normalized severity match
            if (severity && severity.toString().toLowerCase() === "warning") {
              newStats[region]["4_warning"]++;
            } else {
              newStats[region][4]++;
            }
          } else {
             if (newStats[region][state] !== undefined) {
                 newStats[region][state]++;
             }
          }
        }
      });

      setRealtimeStats(newStats);

    } catch (err) {
      console.error("Error refreshing stats:", err);
    }
  };

  // --- BATCH PROCESSOR ---
  const processBatch = async () => {
    if (alertBuffer.current.size === 0 || isProcessing.current || !layers.Customers_test) return;

    isProcessing.current = true;
    const layer = layers.Customers_test;

    try {
      let allowedStates = [1, 2, 3, 4]; 
      const cql = layer.customParameters?.CQL_FILTER || "";

      const matchEqual = cql.match(/alarmstate\s*=\s*(\d+)/);
      const matchIn = cql.match(/alarmstate\s+IN\s*\(([^)]+)\)/i);

      if (matchEqual) {
        allowedStates = [parseInt(matchEqual[1], 10)];
      } else if (matchIn) {
        allowedStates = matchIn[1].split(',').map(n => parseInt(n.trim(), 10));
      }

      const alertsToProcess = Array.from(alertBuffer.current.values());
      alertBuffer.current.clear();

      const idsToCheck = alertsToProcess.map(a => `'${a.id}'`).join(",");
      
      const query = layer.createQuery();
      query.where = `id IN (${idsToCheck})`;
      query.outFields = ["*"];
      
      const existingResult = await layer.queryFeatures(query);
      const existingFeaturesMap = new Map();
      existingResult.features.forEach(f => existingFeaturesMap.set(f.attributes.id, f));

      const updates = [];
      const adds = [];
      const deletes = []; 

      alertsToProcess.forEach(alert => {
        const existingGraphic = existingFeaturesMap.get(alert.id);
        const isCritical = allowedStates.includes(parseInt(alert.alarmstate, 10));

        if (existingGraphic) {
          if (isCritical) {
            const updatedGraphic = existingGraphic.clone();
            updatedGraphic.attributes.category = alert.category;
            updatedGraphic.attributes.type = alert.type;
            updatedGraphic.attributes.alarmstate = alert.alarmstate;
            updatedGraphic.attributes.alarminfo = alert.alarminfo;

            // Update perceived_severity property dynamically when an alert update hits the stream
            updatedGraphic.attributes.perceived_severity = alert.perceived_severity ? alert.perceived_severity : updatedGraphic.attributes.perceived_severity;

            updatedGraphic.attributes.lastDownCause = alert.lastDownCause ? alert.lastDownCause : updatedGraphic.attributes.lastDownCause;
            updatedGraphic.attributes.lastdowntime = alert.lastdowntime ? alert.lastdowntime : updatedGraphic.attributes.lastdowntime;
            updatedGraphic.attributes.lastuptime = alert.lastuptime ? alert.lastuptime : updatedGraphic.attributes.lastuptime;
            updatedGraphic.attributes.fault_time = alert.faultTime ? alert.faultTime : updatedGraphic.attributes.fault_time;
            
            updates.push(updatedGraphic);
          } else {
            deletes.push(existingGraphic);
          }
        } else {
          if (isCritical) {
            const newGraphic = new Graphic({
              geometry: {
                type: "point",
                longitude: alert.geometry.coordinates[0],
                latitude: alert.geometry.coordinates[1],
              },
              attributes: {
                id: alert.id,
                name: alert.name,
                address: alert.address,
                city: alert.city,
                area_town: alert.area_town,
                sub_area: alert.sub_area,
                region: alert.region,
                alarmstate: alert.alarmstate,
                type: alert.type,
                alarminfo: alert.alarminfo,
                lastDownCause: alert.lastDownCause,
                lastdowntime: alert.lastdowntime,
                lastuptime: alert.lastuptime,
                fault_time: alert.faultTime,
                category: alert.category,
                perceived_severity: alert.perceived_severity, // Capture initial severity value
                olt: alert.olt, frame: alert.frame, slot: alert.slot, port: alert.port, ontid: alert.ontid
              },
            });
            adds.push(newGraphic);
          }
        }
      });

      if (updates.length > 0 || adds.length > 0 || deletes.length > 0) {
        await layer.applyEdits({ 
          addFeatures: adds, 
          updateFeatures: updates,
          deleteFeatures: deletes 
        });
      }

      RotatingMarkers(null, layer, view); 
      await refreshFaultStats(layer);

    } catch (err) {
      console.error("Batch processing error:", err);
    } finally {
      isProcessing.current = false;
    }
  };
  
  useEffect(() => {
    if (!view || !layers.Customers_test) return;
    
    if (!isInitialized.current) {
        const initialStats = {
          North: { 1: 0, 2: 0, "2_long": 0, 3: 0, 4: 0, "4_warning": 0 },
          South: { 1: 0, 2: 0, "2_long": 0, 3: 0, 4: 0, "4_warning": 0 },
          Central: { 1: 0, 2: 0, "2_long": 0, 3: 0, 4: 0, "4_warning": 0 }
        };
        setRealtimeStats(initialStats);
        isInitialized.current = true;
    }
    
    const onSocketAlert = (alert) => {
      if (!user || !user.permissions || !user.permissions.regions) return;

      const userRegions = user.permissions.regions; 
      const alertRegion = alert.region;
      const isRegionMatch = userRegions.includes(alertRegion);

      if (!isRegionMatch) return;
      alertBuffer.current.set(alert.id, alert);
    };

    const onRegionalStats = (data) => {
      setAlertCount(prev => ({ ...prev, ...data }));
    };

    socket.on("alerts", onSocketAlert);
    socket.on("regional_alert_count", onRegionalStats);

    const intervalId = setInterval(() => {
      if (alertBuffer.current.size > 0) {
        processBatch();
      }
    }, 2000); 

    RotatingMarkers(null, layers.Customers_test, view);
    refreshFaultStats(layers.Customers_test);

    return () => {
      socket.off("alerts", onSocketAlert);
      socket.off("regional_alert_count", onRegionalStats);
      clearInterval(intervalId);
      isMounted = false;
      setRealtimeStats(null);
    };
  }, [view, layers, setAlertCount]);

  return null;
}