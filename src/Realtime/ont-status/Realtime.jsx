import React, { useEffect, useRef } from "react";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import { socket } from "../socket";
import { useLayers, useMapView, useStats } from "../../context/MapContext";
import { useAuth } from "../../context/AuthContext";
import Graphic from "@arcgis/core/Graphic";
import { RotatingMarkers } from "./RotatingMarkers";
import { createEmptyRegionStats } from "../../constants/faultCodes";

export default function Realtime() {
  const { layers } = useLayers();
  const { view } = useMapView();
  const { setAlertCount, setRealtimeStats } = useStats();
  const { user } = useAuth();

  const alertBuffer = useRef(new Map());
  const isProcessing = useRef(false);
  const isInitialized = useRef(false);

  // BUG FIX: `isMounted` used to be a plain `let` re-created every render
  // and never actually read anywhere -- it did nothing. This ref is the
  // real guard, checked before any post-await state update below.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // --- HELPER: Recalculate Stats from LayerView ---
  const refreshFaultStats = async (layer) => {
    try {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      const sevenDaysAgo = date.getTime();

      const query = layer.createQuery();
      query.where = "alarmstate IN (1, 2, 3, 4)";
      query.outFields = ["region", "alarmstate", "lastdowntime", "perceived_severity"];

      const results = await layer.queryFeatures(query);
      if (!isMountedRef.current) return;

      const newStats = createEmptyRegionStats();

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
      if (!isMountedRef.current) return;

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
                perceived_severity: alert.perceived_severity,
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
    if (!view || !layers.Customers_test || !user) return;

    if (!isInitialized.current) {
        setRealtimeStats(createEmptyRegionStats());
        isInitialized.current = true;
    }

    const onSocketAlert = (alert) => {
      if (!user?.permissions?.regions) return;

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
      setRealtimeStats(null);
    };
    // BUG FIX: `user` is now a dependency. Previously it was read inside
    // onSocketAlert but missing from the dependency array, so if the
    // session refreshed with a different user/region set mid-session, the
    // socket handler kept checking incoming alerts against the stale,
    // captured `user` from the first render.
  }, [view, layers.Customers_test, user, setAlertCount, setRealtimeStats]);

  return null;
}