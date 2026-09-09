import React, { useState, useRef, useEffect } from "react";
import { useArcGIS } from "../../../context/MapContext";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import {
  CalciteButton,
  CalciteList,
  CalciteListItem,
  CalciteNotice,
  CalciteChip
} from "@esri/calcite-components-react";
// Import your predefined columns to format the table properly
import { customerColumns } from "../../../constants/columns"; 

export default function FSPOutageAnalyzer() {
  const { view, layers, addTableData, removeTableData } = useArcGIS(); 
  
  const [loading, setLoading] = useState(false);
  const [fspData, setFspData] = useState([]);
  const [error, setError] = useState("");
  
  const highlightLayer = useRef(null);
  const dcHighlightHandleRef = useRef(null); // native layer-view highlight for dc_odb, not a graphic
  const activeTableIdRef = useRef(null);     // widgetId of the currently-open table tab, so Clear can close it

  useEffect(() => {
    if (!view || !view.map) return;
    
    highlightLayer.current = new GraphicsLayer({ 
        title: "FSP Impact Highlight", 
        listMode: "hide" 
    });
    view.map.add(highlightLayer.current);

    return () => {
      if (view && view.map && highlightLayer.current) {
        view.map.remove(highlightLayer.current);
      }
      dcHighlightHandleRef.current?.remove();
      dcHighlightHandleRef.current = null;
    };
  }, [view]);

  const analyzePorts = async () => {
    if (!layers || !layers.Customers_test) {
      setError("Customer layer is not loaded yet.");
      return;
    }

    setLoading(true);
    setError("");
    setFspData([]);
    if (highlightLayer.current) highlightLayer.current.removeAll();

    try {
      const query = layers.Customers_test.createQuery();
      query.where = "alarmstate > 0"; // Find any active alarm
      // Fetch ALL fields, not just the ones this component reads directly --
      // these features are also handed to the table (addTableData) which
      // renders against customerColumns, so trimming outFields here silently
      // blanks out every column that isn't in this list.
      query.outFields = ["*"];
      query.returnGeometry = true;

      const results = await layers.Customers_test.queryFeatures(query);
      const features = results.features;

      const portMap = {};

      features.forEach((feat) => {
        const attr = feat.attributes;
        const fsp = attr.nce_fsp;
        const olt = attr.olt;
        const isVip = attr.service_tier === 'VIP';
        
        if (!fsp || !olt) return; 

        const key = `${olt} | ${fsp}`;

        if (!portMap[key]) {
          portMap[key] = {
            olt,
            fsp,
            key,
            totalFaults: 0,
            vipFaults: 0,
            features: []
          };
        }

        portMap[key].totalFaults += 1;
        if (isVip) portMap[key].vipFaults += 1;
        // Keep the whole feature so we have geometry + attributes for the table
        portMap[key].features.push(feat); 
      });

      // Filter and sort the results
      const sortedPorts = Object.values(portMap)
        .filter(port => port.totalFaults > 1) 
        .sort((a, b) => b.totalFaults - a.totalFaults);

      setFspData(sortedPorts);

      if (sortedPorts.length === 0) {
        setError("No clustered port outages detected.");
      }
    } catch (err) {
      console.error("Analyzer Error:", err);
      setError("Failed to analyze network topology.");
    } finally {
      setLoading(false);
    }
  };

  const highlightPort = async (portObj) => {
    if (!view || !highlightLayer.current) return;
    highlightLayer.current.removeAll();

    // Clear any DC highlight left over from a previously selected port
    dcHighlightHandleRef.current?.remove();
    dcHighlightHandleRef.current = null;

    // 1. Draw Customer Points (No more polygons/buffers)
    const pointGraphics = portObj.features.map(f => new Graphic({
      geometry: f.geometry,
      attributes: f.attributes,
      symbol: {
        type: "simple-marker",
        style: "circle",
        color: f.attributes.service_tier === 'VIP' ? "purple" : "red",
        size: "10px",
        outline: { color: "cyan", width: 2 }
      }
    }));

    highlightLayer.current.addMany(pointGraphics);

    // goTo target starts with the customer points; the DC's own geometry
    // (once queried below) is appended so the zoom frames both.
    const zoomTargets = [...pointGraphics];

    // 2. Highlight the parent DC using the dc_odb layer that's already on
    // the map (see DC.jsx) -- no separate graphic is drawn for it. We just
    // reveal the real layer and use its native layer-view highlight.
    const dcIds = [...new Set(portObj.features.map(f => f.attributes.dc_id).filter(Boolean))];
    
    if (dcIds.length > 0 && layers.dc_odb) {
        try {
            layers.dc_odb.visible = true; // DC.jsx defaults this layer to hidden

            // Figure out whether the DC layer's join field ("id") is numeric
            // or text -- wrapping numeric IDs in quotes makes the where clause
            // match nothing (no error thrown, it just silently returns zero
            // features), which was why the DC point never appeared.
            const idField = layers.dc_odb.fields?.find(
              (f) => f.name.toLowerCase() === "id"
            );
            const NUMERIC_TYPES = ["small-integer", "integer", "single", "double", "long"];
            const isNumericId = idField && NUMERIC_TYPES.includes(idField.type);

            const dcQuery = layers.dc_odb.createQuery();
            dcQuery.where = isNumericId
              ? `id IN (${dcIds.join(",")})`
              : `id IN ('${dcIds.map((id) => String(id).replace(/'/g, "''")).join("','")}')`;
            dcQuery.returnGeometry = true;
            dcQuery.outFields = ["*"];
            
            const dcResults = await layers.dc_odb.queryFeatures(dcQuery);

            if (dcResults.features.length === 0) {
              console.warn(
                `No DC features matched for id(s): ${dcIds.join(", ")}. ` +
                `Check that "${idField?.name ?? "id"}" is the correct join field on dc_odb.`
              );
            } else {
              zoomTargets.push(...dcResults.features);

              // Highlight the existing DC features in place (native ArcGIS
              // selection halo) instead of drawing a duplicate graphic on top.
              const dcLayerView = await view.whenLayerView(layers.dc_odb);
              dcHighlightHandleRef.current = dcLayerView.highlight(dcResults.features);
            }
        } catch (err) {
            console.error("Failed to query DC layer:", err);
            setError("Customer points highlighted, but the DC point failed to load.");
        }
    }

    // 3. Zoom the map to ensure the DC and all Customers are in frame
    view.goTo({ target: zoomTargets, padding: 50 }, { duration: 1000 });

    // 4. Open the Table Tab for the selected FSP
    if (addTableData) {
        const tableId = `fsp_tab_${portObj.fsp}`;
        activeTableIdRef.current = tableId;
        addTableData(
            tableId,                  // Unique widget ID for the tab
            `Port: ${portObj.fsp}`,   // Label that appears on the tab
            portObj.features,         // The raw feature data
            customerColumns           // Column layout definitions
        );
    }
  };

  const clearAnalysis = () => {
    if (highlightLayer.current) highlightLayer.current.removeAll();

    // Remove the native DC highlight and hide the layer again (matches
    // DC.jsx's default hidden state) since nothing selected is left to show.
    dcHighlightHandleRef.current?.remove();
    dcHighlightHandleRef.current = null;
    if (layers.dc_odb) layers.dc_odb.visible = false;

    // Close the table tab that was opened for the last highlighted port
    if (activeTableIdRef.current && removeTableData) {
      removeTableData(activeTableIdRef.current);
      activeTableIdRef.current = null;
    }

    setFspData([]);
    setError("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <CalciteNotice open icon="lightbulb" scale="s">
        <div slot="message">
          Identifies fiber cuts or hardware failures by grouping active customer alarms sharing the same OLT & PON Port.
        </div>
      </CalciteNotice>

      <div style={{ display: "flex", gap: "8px" }}>
        <CalciteButton onClick={analyzePorts} loading={loading ? true : undefined} width="full">
          Scan Network
        </CalciteButton>
        {fspData.length > 0 && (
          <CalciteButton onClick={clearAnalysis} appearance="outline" kind="danger" iconStart="trash">
            Clear
          </CalciteButton>
        )}
      </div>

      {error && <div style={{ color: "var(--calcite-ui-danger)", fontSize: "0.85rem", marginTop: "8px" }}>{error}</div>}

      {fspData.length > 0 && (
        <CalciteList style={{ maxHeight: "350px", overflowY: "auto", border: "1px solid var(--calcite-ui-border-2)" }}>
          {fspData.map((port, idx) => (
            <CalciteListItem 
              key={idx} 
              label={`Port: ${port.fsp}`}
              description={`OLT: ${port.olt}`}
              onClick={() => highlightPort(port)}
              style={{ cursor: "pointer" }}
            >
              <div slot="content-end" style={{ display: "flex", gap: "4px" }}>
                <CalciteChip value="total" scale="s" kind="danger">
                  {port.totalFaults} Down
                </CalciteChip>
                {port.vipFaults > 0 && (
                  <CalciteChip value="vip" scale="s" kind="brand">
                    {port.vipFaults} VIPs
                  </CalciteChip>
                )}
              </div>
            </CalciteListItem>
          ))}
        </CalciteList>
      )}
    </div>
  );
}