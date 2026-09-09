import React, { useState, useEffect } from "react";
import {
  CalciteList,
  CalciteListItem,
  CalciteAction,
  CalciteAlert,
  CalciteBlock,
  CalciteIcon,
  CalciteLoader,
  CalciteButton
} from "@esri/calcite-components-react";

const SURFACE = {
  panelBg: "linear-gradient(180deg, #2b2b2b, #2b2b2b, 100%)",
  cardBg: "#333333",
  border: "#444444",
  label: "#efecec",
};

export default function CoordinateDetails({ feature }) {
  const { lat, lon } = feature.attributes;
  const [alertMessage, setAlertMessage] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [addressData, setAddressData] = useState(null);
  const [isLoadingAddress, setIsLoadingAddress] = useState(true);

  // --- Helper: Estimate UTM Zone for Pakistan (Typically Zone 42 or 43) ---
  const getUtmZone = (longitude) => {
    return Math.floor((longitude + 180) / 6) + 1;
  };

  // --- Fetch Reverse Geocoding via Nominatim API ---
  useEffect(() => {
    let isMounted = true;

    const fetchAddress = async () => {
      setIsLoadingAddress(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );

        const data = await res.json();

        if (isMounted) {
          if (data && data.address) {
            setAddressData({
              fullName: data.display_name || "Address unavailable",
              road: data.address.road || data.address.pedestrian || "N/A",
              suburb: data.address.suburb || data.address.neighbourhood || data.address.residential || "N/A",
              city: data.address.city || data.address.town || data.address.county || "N/A",
              state: data.address.state || "N/A",
              country: data.address.country || "Pakistan",
              postcode: data.address.postcode || "N/A"
            });
          } else {
            setAddressData(null);
          }
        }
      } catch (error) {
        console.error("Reverse geocoding failed:", error);
        if (isMounted) setAddressData(null);
      } finally {
        if (isMounted) setIsLoadingAddress(false);
      }
    };

    fetchAddress();

    return () => { isMounted = false; };
  }, [lat, lon]);

  const triggerAlert = (msg) => {
    setAlertMessage(msg);
    setAlertOpen(true);
    setTimeout(() => setAlertOpen(false), 3000);
  };

  // --- Combined Copy Handler for Coordinates & Address ---
  const handleCopyDetails = () => {
    const formattedText = `Coordinates: ${lat.toFixed(5)}, ${lon.toFixed(5)}\nAddress: ${addressData?.fullName || "Resolving address..."}`;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(formattedText);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = formattedText;
      textArea.style.position = "absolute";
      textArea.style.left = "-999999px";
      document.body.prepend(textArea);
      textArea.select();
      try { document.execCommand("copy"); } finally { textArea.remove(); }
    }
    triggerAlert("Coordinates and address copied to clipboard!");
  };

  // External Navigation Handlers
  const openGoogleMaps = () => window.open(`https://www.google.com/maps?q=${lat},${lon}`, "_blank");
  const openOSM = () => window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`, "_blank");

  return (
    <div scale="s" style={{ display: "flex", flexDirection: "column", fontFamily: "var(--calcite-sans-family, inherit)" }}>
      <CalciteAlert open={alertOpen ? true : undefined} icon="check-circle" kind="success" label="Copied" placement="top" scale="s">
        <div slot="title">Copied</div>
        <div slot="message">{alertMessage}</div>
      </CalciteAlert>

      {/* 1. Header Panel */}
      <div style={{ display: "flex", flexDirection: "column", padding: "0.85rem 1rem", background: SURFACE.panelBg }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: SURFACE.label }}>
              Searched Coordinates
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
              <CalciteIcon icon="pin" scale="s" style={{ color: "#009af2" }} />
              <div style={{ fontSize: "1rem", fontWeight: 700, fontFamily: "var(--calcite-mono-family, monospace)", color: "#009af2", lineHeight: 1.3 }}>
                {lat.toFixed(5)}, {lon.toFixed(5)}
              </div>
            </div>
          </div>
          <CalciteAction 
            icon="copy-to-clipboard" 
            text="Copy Details" 
            scale="s" 
            onClick={handleCopyDetails} 
          />
        </div>
      </div>

      {/* 2. Quick Technical Metadata Card */}
      <div style={{ padding: "0 1rem 0.75rem", background: SURFACE.panelBg }}>
        <div style={{
          background: SURFACE.cardBg,
          border: `1px solid ${SURFACE.border}`,
          borderRadius: "6px",
          padding: "0.75rem",
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "0.5rem"
        }}>
          <div>
            <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", color: SURFACE.label }}>
              Spatial Ref System
            </div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#009af2", fontFamily: "monospace", marginTop: "2px" }}>
              EPSG:4326 (WGS84)
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", color: SURFACE.label }}>
              Est. UTM Zone
            </div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#009af2", fontFamily: "monospace", marginTop: "2px" }}>
              Zone {getUtmZone(lon)}N
            </div>
          </div>
        </div>
      </div>

      {/* 3. Detailed Address Breakdown */}
      <div style={{ background: SURFACE.panelBg }}>
        <CalciteBlock scale="s" open heading="Address & Location Details">
          {isLoadingAddress ? (
            <div style={{ padding: "1.5rem", textAlign: "center" }}>
              <CalciteLoader scale="s" active inline />
              <div style={{ fontSize: "0.75rem", color: "var(--calcite-ui-text-3)", marginTop: "0.5rem" }}>
                Resolving reverse geocode...
              </div>
            </div>
          ) : (
            <CalciteList>
              
              <CalciteListItem scale="s" label="Full Address">
                <div slot="content-end" style={{ maxWidth: "210px", textAlign: "right", fontSize: "0.75rem", fontWeight: "600", color: "var(--calcite-ui-text-1)", userSelect: "text" }}>
                  {addressData?.fullName || "No address found"}
                </div>
              </CalciteListItem>

              <CalciteListItem scale="s" label="Road / Street">
                <div slot="content-end" style={{ fontWeight: "bold", fontSize: "0.75rem", color: "var(--calcite-ui-text-2)" }}>
                  {addressData?.road || "N/A"}
                </div>
              </CalciteListItem>

              <CalciteListItem scale="s" label="Area / Suburb">
                <div slot="content-end" style={{ fontWeight: "bold", fontSize: "0.75rem", color: "var(--calcite-ui-text-2)" }}>
                  {addressData?.suburb || "N/A"}
                </div>
              </CalciteListItem>

              <CalciteListItem scale="s" label="City / Region">
                <div slot="content-end" style={{ fontWeight: "bold", fontSize: "0.75rem", color: "var(--calcite-ui-text-2)" }}>
                  {addressData?.city} ({addressData?.state})
                </div>
              </CalciteListItem>

            </CalciteList>
          )}
        </CalciteBlock>
      </div>

      {/* 4. Action Buttons / GIS Integrations */}
      <div style={{ padding: "0.75rem 1rem", background: SURFACE.panelBg, borderTop: `1px solid ${SURFACE.border}` }}>
        <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: SURFACE.label, marginBottom: "0.5rem" }}>
          External Map Launchers
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <CalciteButton appearance="outline" kind="neutral" iconStart="map-pin" width="full" onClick={openGoogleMaps}>
            Google Maps
          </CalciteButton>
          <CalciteButton appearance="outline" kind="neutral" iconStart="launch" width="full" onClick={openOSM}>
            OpenStreetMap
          </CalciteButton>
        </div>
      </div>

    </div>
  );
}