import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";

import markerMoving from "../../assets/images/moving-icon.gif";

const RotatingMarkers = async (alert, customer, view) => {

    // 1. Get or Create Layer
    // (Moved to top so we can access it immediately for removals)
    let graphicsLayer = view.map.layers.find(layer => layer.title === "Recent_Faults_Animation");

    if (!graphicsLayer) {
        graphicsLayer = new GraphicsLayer({
            title: "Recent_Faults_Animation",
            listMode: "hide"
        });

        view.map.add(graphicsLayer);
    }

    // --- SETUP FOR NEW/UPDATED ALERTS ---
    
    // 2. STOP previous animation to prevent memory leaks/speeding up
    if (graphicsLayer._animationHandle) {
        cancelAnimationFrame(graphicsLayer._animationHandle);
        graphicsLayer._animationHandle = null;
    }
    
    // 3. Refresh Logic: Clear layer and re-fetch active faults
    // (You can choose to remove this 'removeAll' if you want to update incrementally, 
    // but keeping it ensures your map is always perfectly synced with the DB)
    graphicsLayer.removeAll(); 

    const tenMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    let query = customer.createQuery();
    query.where = `alarmstate = 2`;
    query.returnGeometry = true;
    query.outFields = ["*"]; // Ensure we get the ID and Time columns

    const results = await customer.queryFeatures(query);

    results.features.forEach(feature => {
        const lastDownTime = new Date(feature.attributes.lastdowntime);
        
        // Ensure time is valid and within the last 10 minutes
        if (lastDownTime > tenMinutesAgo) {
            const timeDifferenceMs = lastDownTime - tenMinutesAgo;
            const timeDifferenceMinutes = timeDifferenceMs / (1000 * 60);

            if (timeDifferenceMinutes <= 90) {
               
                const markerGraphic = new Graphic({
                    geometry: {
                        type: "point",
                        longitude: feature.geometry.longitude,
                        latitude: feature.geometry.latitude
                    },
                    symbol: {
                        type: "picture-marker",
                        url: markerMoving, // PinPoint.gif  // moving-icon.gif
                        width: "25px",
                        height: "25px",
                        xoffset: 0,
                        yoffset: 12,
                        angle: 0
                    }  /* {
                        type: "simple-marker",
                        style: "cross", 
                        color: [0, 255, 255, 1], // Cyan
                        size: "22px",
                        outline: {
                            color: '#525252',
                            width: 3
                        },
                        angle: 0
                    } */,
                    // IMPORTANT: Pass all attributes so we can check 'id' and 'lastdowntime' later
                    attributes: feature.attributes 
                }); attributes: feature.attributes 

                graphicsLayer.add(markerGraphic);
            }
        }
    });

    // --- FEATURE 2: Auto-Remove & Animation Loop ---
    if (graphicsLayer.graphics.length > 0) {
        
        const animate = () => {
            const now = Date.now();
            const tenMinutesMs = 30 * 60 * 1000;

            // Use .toArray() to create a copy, so we can safely remove items while looping
            graphicsLayer.graphics.toArray().forEach((graphic) => {
                
                // A. AUTO-REMOVE CHECK
                // Check if this specific graphic is now older than 10 minutes
                const faultTime = new Date(graphic.attributes.lastdowntime).getTime();
                
                if (now - faultTime > tenMinutesMs) {
                    graphicsLayer.remove(graphic);
                    return; // Stop processing this graphic (it's gone)
                }

                // B. ROTATION LOGIC
                // Only rotate if it's still valid
                const newSymbol = graphic.symbol.clone();
                //newSymbol.angle = (newSymbol.angle + 2) % 360; 
                graphic.symbol = newSymbol;
            });

            // Keep animating only if graphics remain
            if (graphicsLayer.graphics.length > 0) {
                graphicsLayer._animationHandle = requestAnimationFrame(animate);
            }
        };

        animate();
    }

    return;
}

export { RotatingMarkers };