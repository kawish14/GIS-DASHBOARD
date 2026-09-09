import React, { useState, useEffect } from "react";
import {
  CalciteBlock,
  CalciteLabel,
  CalciteSelect,
  CalciteOption,
  CalciteButton,
  CalciteInputNumber,
  CalciteColorPicker,
  CalcitePopover,
  CalciteList,
  CalciteListItem,
  CalciteIcon
} from "@esri/calcite-components-react";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import { useArcGIS } from "../../context/MapContext"; // Your context path

const SymbologyPanel = () => {
  const { view } = useArcGIS();
  
  // State
  const [layers, setLayers] = useState([]);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState("");
  
  // The list of unique values (classes) to render
  // Structure: { value: "VIP", color: "#ff0000", label: "VIP Customer" }
  const [uniqueInfos, setUniqueInfos] = useState([]);
  
  // Global symbol settings
  const [symbolSize, setSymbolSize] = useState(8);

  // 1. Load Layers on Mount
  useEffect(() => {
    if (view && view.map) {
      // Filter for FeatureLayers only
      const feats = view.map.layers.items
      /*   .filter(l => l.type === "feature")
        .map(l => ({ id: l.id, title: l.title })); */

      setLayers(view.map.layers.items);
  
      if (feats.length > 0) setSelectedLayerId(feats[0].id);
    }
  }, [view]);

  // 2. Load Fields when Layer Changes
  useEffect(() => {
    if (!view || !selectedLayerId) return;
    const layer = view.map.findLayerById(selectedLayerId);
    if (layer) {
      // Load fields (ensure layer is loaded first)
      layer.load().then(() => {
        const validFields = layer.fields
          .filter(f => f.type !== "geometry" && f.type !== "oid")
          .map(f => ({ name: f.name, alias: f.alias }));
        setFields(validFields);
        if (validFields.length > 0) setSelectedField(validFields[0].name);
      });
    }
  }, [view, selectedLayerId]);

  // 3. Helper: Generate Distinct Values from Server
  const handleLoadValues = async () => {
    if (!view || !selectedLayerId || !selectedField) return;
    
    const layer = view.map.findLayerById(selectedLayerId);
    
    // Query for distinct values
    const query = layer.createQuery();
    query.outFields = [selectedField];
    query.returnDistinctValues = true;
    query.returnGeometry = false;
    query.where = "1=1"; 

    try {
      const results = await layer.queryFeatures(query);
      const features = results.features;
      
      // Generate initial colors (random hex generator)
      const newInfos = features.map((f, index) => {
        const val = f.attributes[selectedField];
        const randomColor = "#" + Math.floor(Math.random()*16777215).toString(16);
        return {
          value: val,
          label: val ? val.toString() : "Null",
          color: randomColor
        };
      });
      
      setUniqueInfos(newInfos);
      updateRenderer(newInfos); // Apply immediately
    } catch (err) {
      console.error("Error querying values:", err);
    }
  };

  // 4. Update the Map Renderer
  const updateRenderer = (infos) => {
    const layer = view.map.findLayerById(selectedLayerId);
    if (!layer) return;

    // Construct the UniqueValueRenderer
    const renderer = new UniqueValueRenderer({
      field: selectedField,
      defaultSymbol: new SimpleMarkerSymbol({
        color: "gray",
        size: symbolSize,
        outline: { width: 0.5, color: "white" }
      }),
      defaultLabel: "Other",
      uniqueValueInfos: infos.map(info => ({
        value: info.value,
        label: info.label,
        symbol: new SimpleMarkerSymbol({
          color: info.color,
          size: symbolSize,
          outline: { width: 0.5, color: "white" }
        })
      }))
    });

    layer.renderer = renderer;
  };

  // 5. Handle Color Change for a specific row
  const handleColorChange = (index, newColor) => {
    const updatedInfos = [...uniqueInfos];
    updatedInfos[index].color = newColor;
    setUniqueInfos(updatedInfos);
    updateRenderer(updatedInfos);
  };

  return (
    <div className="space-y-4">
      {/* Configuration Section */}
      <CalciteBlock heading="Data Source" open collapsible>
        <CalciteLabel>
          Layer
          <CalciteSelect value={selectedLayerId} onCalciteSelectChange={e => setSelectedLayerId(e.target.value)}>
            {layers.map(l => <CalciteOption key={l.id} value={l.id} label={l.title} />)}
          </CalciteSelect>
        </CalciteLabel>

        <CalciteLabel>
          Field (Attribute)
          <CalciteSelect value={selectedField} onCalciteSelectChange={e => setSelectedField(e.target.value)}>
            {fields.map(f => <CalciteOption key={f.name} value={f.name} label={f.alias || f.name} />)}
          </CalciteSelect>
        </CalciteLabel>

        <CalciteButton width="full" iconStart="refresh" onClick={handleLoadValues}>
          Load Unique Values
        </CalciteButton>
      </CalciteBlock>

      {/* Symbology Classes Section */}
      {uniqueInfos.length > 0 && (
        <CalciteBlock heading="Classes" open collapsible>
          
          <CalciteLabel>
            Global Symbol Size
            <CalciteInputNumber 
              value={symbolSize} 
              min={1} 
              max={50} 
              onCalciteInputNumberChange={(e) => {
                setSymbolSize(parseFloat(e.target.value));
                updateRenderer(uniqueInfos); // Re-trigger render
              }} 
            />
          </CalciteLabel>

          <CalciteList>
            {uniqueInfos.map((info, index) => (
              <CalciteListItem 
                key={index} 
                label={info.label} 
                description={`Value: ${info.value}`}
              >
                {/* Custom Color Input for List Item */}
                <div slot="actions-end" style={{ display: 'flex', alignItems: 'center', paddingRight: '10px' }}>
                  <input 
                    type="color" 
                    value={info.color} 
                    onChange={(e) => handleColorChange(index, e.target.value)}
                    style={{
                      width: '24px', 
                      height: '24px', 
                      border: 'none', 
                      padding: 0, 
                      cursor: 'pointer',
                      borderRadius: '50%'
                    }}
                  />
                </div>
              </CalciteListItem>
            ))}
          </CalciteList>
        </CalciteBlock>
      )}
    </div>
  );
};

export default SymbologyPanel;