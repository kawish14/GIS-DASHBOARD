import React, { useEffect, useRef } from "react";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils"; 
import { socket } from "../socket";
import { useArcGIS } from "../../context/MapContext";
import Graphic from "@arcgis/core/Graphic";
import { RotatingMarkers } from "./RotatingMarkers";

export default function Realtime() {
  const { layers, view, setAlertCount, setRealtimeStats, realtimeStats } = useArcGIS();
  
  // 1. Create a Buffer to hold incoming alerts
  const alertBuffer = useRef(new Map()); 
  const isProcessing = useRef(false);
  const isInitialized = useRef(false);

  let isMounted = true;

  // --- HELPER: Recalculate Stats from LayerView ---
  const refreshFaultStats = async (layer) => {
    try {
      const layerView = await view.whenLayerView(layer);

      //Wait for the layerView to finish updating.
      // If we query while updating is true, we might get stale data.
      await reactiveUtils.whenOnce(() => !layerView.updating);
      
      const date = new Date();
      date.setDate(date.getDate() - 7);
      const sevenDaysAgo = date.getTime();

      const query = layerView.createQuery();
      query.where = "alarmstate IN (2, 3, 4)";
      query.outFields = ["region", "alarmstate", "lastdowntime"];
      
      const results = await layerView.queryFeatures(query);

      // Default Structure
      const newStats = {
        North: { 2: 0, "2_long": 0, 3: 0, 4: 0 },
        South: { 2: 0, "2_long": 0, 3: 0, 4: 0 },
        Central: { 2: 0, "2_long": 0, 3: 0, 4: 0 }
      };

      results.features.forEach((feature) => {
        const region = feature.attributes.region;
        const state = feature.attributes.alarmstate;
        const lastDownTime = feature.attributes.lastdowntime;

        if (newStats[region]) {
          if (state === 2) {
            const recordTime = new Date(lastDownTime).getTime();
            if (recordTime <= sevenDaysAgo) {
              newStats[region]["2_long"]++;
            } else {
              newStats[region][2]++;
            }
          } else {
             if (newStats[region][state] !== undefined) {
                 newStats[region][state]++;
             }
          }
        }
      });

      // Update Context
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

      // --- 1. DYNAMIC FILTER LOGIC ---
      // Determine which states are currently "Visible" based on the layer's CQL Filter
      let allowedStates = [2, 3, 4]; // Default Fallback (Critical Only)
      const cql = layer.customParameters?.CQL_FILTER || "";

      // Check for specific value: "alarmstate = 1"
      const matchEqual = cql.match(/alarmstate\s*=\s*(\d+)/);
      // Check for list: "alarmstate IN (1, 2, 3, 4)"
      const matchIn = cql.match(/alarmstate\s+IN\s*\(([^)]+)\)/i);

      if (matchEqual) {
        allowedStates = [parseInt(matchEqual[1], 10)];
      } else if (matchIn) {
        // Convert "1, 2, 3" string to array of numbers [1, 2, 3]
        allowedStates = matchIn[1].split(',').map(n => parseInt(n.trim(), 10));
      }

      const alertsToProcess = Array.from(alertBuffer.current.values());
      alertBuffer.current.clear();

      // 1. Extract IDs
      const idsToCheck = alertsToProcess.map(a => `'${a.id}'`).join(",");
      
      const query = layer.createQuery();
      query.where = `id IN (${idsToCheck})`;
      query.outFields = ["*"];
      
      const existingResult = await layer.queryFeatures(query);
      const existingFeaturesMap = new Map();
      existingResult.features.forEach(f => existingFeaturesMap.set(f.attributes.id, f));

      const updates = [];
      const adds = [];
      const deletes = []; // <--- NEW: Array to hold features to remove

      // 2. Sort into Updates, Adds, or Deletes
      alertsToProcess.forEach(alert => {
        const existingGraphic = existingFeaturesMap.get(alert.id);
        //const isCritical = [2, 3, 4].includes(alert.alarmstate); // Check if it's a fault
        const isCritical = allowedStates.includes(parseInt(alert.alarmstate, 10));

        if (existingGraphic) {
          // --- SCENARIO A: Customer is already on map ---
          if (isCritical) {
            // It was faulty, and is STILL faulty (e.g., changed from 2 to 3, or just timestamp update)
            // UPDATE IT
            const updatedGraphic = existingGraphic.clone();
            updatedGraphic.attributes.category = alert.category;
            updatedGraphic.attributes.type = alert.type;
            updatedGraphic.attributes.alarmstate = alert.alarmstate;
            updatedGraphic.attributes.alarminfo = alert.alarminfo;
            updatedGraphic.attributes.lastDownCause = alert.lastDownCause;
            updatedGraphic.attributes.lastdowntime = alert.lastdowntime;
            updatedGraphic.attributes.lastuptime = alert.lastuptime;
            updatedGraphic.attributes.fault_time = alert.faultTime ? alert.faultTime : updatedGraphic.attributes.fault_time;
            
            updates.push(updatedGraphic);
          } else {
            // It was faulty, but is NOW Online (0) or Power Off (1)
            // DELETE IT (Remove from map)
            deletes.push(existingGraphic);
          }
        } else {
          // --- SCENARIO B: Customer is NOT on map ---
          if (isCritical) {
            // New Fault! Add to map.
            const newGraphic = new Graphic({
              geometry: {
                type: "point",
                longitude: alert.geometry.coordinates[0],
                latitude: alert.geometry.coordinates[1],
              },
              attributes: {
                id: alert.id,
                name: alert.name,
                address:alert.address,
                city:alert.city,
                area_town:alert.area_town,
                sub_area:alert.sub_area,
                region:alert.region,
                alarmstate: alert.alarmstate,
                type:alert.type,
                alarminfo: alert.alarminfo,
                lastDownCause: alert.lastDownCause,
                lastdowntime: alert.lastdowntime,
                lastuptime: alert.lastuptime,
                fault_time: alert.faultTime,
                category:alert.category,
                olt: alert.olt, frame: alert.frame, slot: alert.slot, port: alert.port, ontid: alert.ontid
              },
            });
            adds.push(newGraphic);
          }
          // If it's not critical (0 or 1) and not on map, do nothing.
        }
      });

      // 3. Apply ONE big edit operation (Handle Adds, Updates, AND Deletes)
      if (updates.length > 0 || adds.length > 0 || deletes.length > 0) {
        await layer.applyEdits({ 
          addFeatures: adds, 
          updateFeatures: updates,
          deleteFeatures: deletes // <--- Send deletes to API
        });
        console.log(`Batch: +${adds.length} added, ~${updates.length} updated, -${deletes.length} removed.`);
      }

      // 4. Update Animation Layer
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
          North: { 2: 0, "2_long": 0, 3: 0, 4: 0 },
          South: { 2: 0, "2_long": 0, 3: 0, 4: 0 },
          Central: { 2: 0, "2_long": 0, 3: 0, 4: 0 }
        };
        setRealtimeStats(initialStats);
        isInitialized.current = true; // Prevents re-running on re-renders
    }
    

    // --- SOCKET LISTENER ---
    const onSocketAlert = (alert) => {
      
      // Instead of processing immediately, just add to Map (deduplicates automatically by ID)
      alertBuffer.current.set(alert.id, alert);
    };

    const onRegionalStats = (data) => {
      //if (isMounted) setAlertCount(data);
      setAlertCount(prev => ({ ...prev, ...data }));
    };

    socket.on("alerts", onSocketAlert);
    socket.on("regional_alert_count", onRegionalStats);

    // --- INTERVAL TIMER ---
    // Check buffer every 2 seconds (2000ms)
    const intervalId = setInterval(() => {
      if (alertBuffer.current.size > 0) {
        processBatch();
      }
    }, 2000); 

    // Initial Animation Load
    RotatingMarkers(null, layers.Customers_test, view);
    refreshFaultStats(layers.Customers_test);

    return () => {
      socket.off("alerts", onSocketAlert);
      socket.off("regional_alert_count", onRegionalStats);
      clearInterval(intervalId);
      isMounted = false;
      setRealtimeStats(null);
      
      console.log(realtimeStats)
    };
  }, [view, layers, setAlertCount]);

  return null;
}