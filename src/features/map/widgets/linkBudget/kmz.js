/**
 * Reads a KMZ (or plain KML) into flat placemark records.
 *
 * Pure: no ArcGIS, no React, no DOM beyond DOMParser -- so the parsing can be
 * read and reasoned about without the widget around it (same split as
 * outageAnalysis/diagnose.js).
 *
 * A KMZ is a ZIP with a KML inside it. We unzip it here rather than pulling in
 * a zip library: the only thing needed is one entry out of a small archive,
 * and DecompressionStream("deflate-raw") is in every browser that runs the
 * ArcGIS 4.x SDK. Sizes come from the central directory, never from the local
 * header -- an archive written with a streaming writer leaves the local
 * header's sizes at zero and puts the real ones in a trailing data
 * descriptor, which is exactly how field-survey KMZs come out of some
 * exporters.
 */

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** Scans back from the end for the End Of Central Directory record. */
function findEocd(view) {
  // The record is 22 bytes plus a comment of at most 64KB.
  const start = Math.max(0, view.byteLength - (22 + 0xffff));
  for (let i = view.byteLength - 22; i >= start; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  return -1;
}

function readZipEntries(buffer) {
  const view = new DataView(buffer);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error("Not a KMZ file — no ZIP directory found.");

  let offset = view.getUint32(eocd + 16, true);
  const count = view.getUint16(eocd + 10, true);
  const decoder = new TextDecoder("utf-8");
  const entries = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_SIG) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));

    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateEntry(buffer, entry) {
  const view = new DataView(buffer);
  if (view.getUint32(entry.localOffset, true) !== LOCAL_SIG) {
    throw new Error(`Corrupt archive entry "${entry.name}".`);
  }
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const raw = new Uint8Array(buffer, dataStart, entry.compressedSize);

  if (entry.method === 0) return raw; // stored

  if (entry.method !== 8) {
    throw new Error(`"${entry.name}" uses an unsupported compression method.`);
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot unzip KMZ files. Upload the .kml instead.");
  }

  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The KML inside a KMZ: doc.kml by convention, else the first .kml present. */
function pickKmlEntry(entries) {
  const kml = entries.filter((e) => /\.kml$/i.test(e.name));
  if (kml.length === 0) return null;
  return (
    kml.find((e) => e.name.toLowerCase() === "doc.kml") ||
    kml.find((e) => !e.name.includes("/")) ||
    kml[0]
  );
}

// --- KML ---

/** Children with this local name, whatever namespace prefix the file uses. */
function childrenNamed(node, localName) {
  const out = [];
  for (const child of node.children ?? []) {
    if (child.localName === localName) out.push(child);
  }
  return out;
}

function firstNamed(node, localName) {
  return childrenNamed(node, localName)[0] ?? null;
}

function textOf(node, localName) {
  const el = firstNamed(node, localName);
  return el ? (el.textContent ?? "").trim() : "";
}

/** "lon,lat,alt lon,lat,alt" -> [[lon, lat], ...]. Altitude is dropped. */
function parseCoordinates(text) {
  if (!text) return [];
  const points = [];
  for (const token of text.trim().split(/\s+/)) {
    const parts = token.split(",");
    if (parts.length < 2) continue;
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) points.push([lon, lat]);
  }
  return points;
}

/** <Data name=".."><value/></Data> and <SimpleData name=".."> alike. */
function parseExtendedData(placemark) {
  const data = {};
  const extended = firstNamed(placemark, "ExtendedData");
  if (!extended) return data;

  for (const el of extended.getElementsByTagName("*")) {
    const key = el.getAttribute("name");
    if (!key) continue;
    if (el.localName === "Data") {
      const value = textOf(el, "value");
      if (value) data[key] = value;
    } else if (el.localName === "SimpleData") {
      const value = (el.textContent ?? "").trim();
      if (value) data[key] = value;
    }
  }
  return data;
}

/**
 * The attribute table ArcGIS-exported KMZs hide in <description>.
 *
 * Google Earth shows a balloon; what is actually in there is the feature's
 * attribute table rendered as HTML -- two-cell rows of name and value
 * ("Splitter_Type | 2x8", "Capacity | 24F", "DC_ID | 15"). That is real data,
 * and on a design KMZ it is usually the ONLY place the split ratios and fibre
 * counts are stated, so it is read here into the same `data` map as
 * ExtendedData rather than left as decoration.
 *
 * Only rows with exactly two cells are taken: the outer table's single-cell
 * header carries the placemark name again, and reading it as a key produced
 * exactly the kind of junk that a keyword classifier then trips over.
 */
export function parseDescriptionTable(descriptionHtml) {
  const data = {};
  if (!descriptionHtml || !/<t[dr]/i.test(descriptionHtml)) return data;

  const doc = new DOMParser().parseFromString(descriptionHtml, "text/html");
  for (const row of doc.querySelectorAll("tr")) {
    const cells = row.querySelectorAll(":scope > td, :scope > th");
    if (cells.length !== 2) continue;
    const key = (cells[0].textContent ?? "").trim();
    const value = (cells[1].textContent ?? "").trim();
    // A cell holding the nested table is not a value; skip anything that still
    // contains markup rather than a leaf value.
    if (!key || !value || cells[1].querySelector("table")) continue;
    if (!(key in data)) data[key] = value;
  }
  return data;
}

/**
 * Every point and line inside one Placemark. MultiGeometry is flattened --
 * exporters routinely wrap a single route in one, and a placemark that holds
 * both a point and its label geometry should still count as one point.
 */
function collectGeometry(node, out) {
  for (const child of node.children ?? []) {
    if (child.localName === "Point") {
      const coords = parseCoordinates(textOf(child, "coordinates"));
      if (coords.length) out.points.push(coords[0]);
    } else if (child.localName === "LineString" || child.localName === "LinearRing") {
      const coords = parseCoordinates(textOf(child, "coordinates"));
      if (coords.length >= 2) out.lines.push(coords);
    } else if (child.localName === "MultiGeometry" || child.localName === "Polygon") {
      collectGeometry(child, out);
    }
  }
  return out;
}

/**
 * Walks Document/Folder recursively so each placemark keeps the folder path it
 * was filed under -- in a GPON survey the folder ("Feeder", "FAT", "ONT") is
 * usually a better type hint than the placemark's own name.
 */
function walkContainer(container, folderPath, placemarks) {
  for (const child of container.children ?? []) {
    if (child.localName === "Folder" || child.localName === "Document") {
      const name = textOf(child, "name");
      walkContainer(child, name ? [...folderPath, name] : folderPath, placemarks);
    } else if (child.localName === "Placemark") {
      const geometry = collectGeometry(child, { points: [], lines: [] });
      if (!geometry.points.length && !geometry.lines.length) continue;
      const description = textOf(child, "description");
      placemarks.push({
        name: textOf(child, "name"),
        description,
        styleUrl: textOf(child, "styleUrl"),
        folders: folderPath,
        // ExtendedData first: where a file carries both, the declared field is
        // the more trustworthy of the two.
        data: { ...parseDescriptionTable(description), ...parseExtendedData(child) },
        points: geometry.points,
        lines: geometry.lines,
      });
    }
  }
  return placemarks;
}

/**
 * Declares namespace prefixes the document uses but never declared.
 *
 * Google Earth Pro writes `<Document xsi:schemaLocation="...">` without an
 * xmlns:xsi anywhere in the file. That is not well-formed XML, so DOMParser
 * rejects the whole document -- a KMZ that Google Earth itself wrote, and that
 * every GIS tool opens, would otherwise be unreadable here. Rather than
 * special-casing xsi, any prefix that is used and not declared is bound to a
 * placeholder namespace: the parse then succeeds and the prefixed attributes
 * are simply ignored, which is what they deserve.
 */
function declareMissingPrefixes(text) {
  const rootMatch = /<([A-Za-z_][\w.-]*)((?:\s[^>]*)?)>/.exec(text.replace(/<\?[^>]*\?>/g, ""));
  if (!rootMatch) return text;

  const declared = new Set(["xml", "xmlns"]);
  for (const [, prefix] of text.matchAll(/\sxmlns:([A-Za-z_][\w.-]*)\s*=/g)) declared.add(prefix);

  const used = new Set();
  for (const [, prefix] of text.matchAll(/<\/?([A-Za-z_][\w.-]*):/g)) used.add(prefix);
  for (const [, prefix] of text.matchAll(/\s([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*\s*=\s*["']/g)) used.add(prefix);

  const missing = [...used].filter((prefix) => !declared.has(prefix));
  if (missing.length === 0) return text;

  const declarations = missing.map((prefix) => ` xmlns:${prefix}="urn:x-undeclared:${prefix}"`).join("");
  const rootTag = rootMatch[0];
  const patched = `<${rootMatch[1]}${rootMatch[2]}${declarations}>`;
  return text.replace(rootTag, patched);
}

export function parseKmlText(text) {
  let doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    doc = new DOMParser().parseFromString(declareMissingPrefixes(text), "text/xml");
  }
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("The KML inside this file could not be parsed.");
  }
  const root = doc.documentElement;
  if (!root) throw new Error("The KML file is empty.");

  const placemarks = walkContainer(root, [], []);
  if (placemarks.length === 0) {
    // A NetworkLink-only KMZ carries no geometry of its own; say so rather
    // than reporting an empty network.
    const linked = root.getElementsByTagName("*");
    for (const el of linked) {
      if (el.localName === "NetworkLink") {
        throw new Error("This KMZ only links to other files — export it with the data included.");
      }
    }
  }
  return placemarks;
}

/**
 * Reads a File (or Blob) picked in the widget. `.kml` is read as text, `.kmz`
 * is unzipped first. Returns the flat placemark list parseKmlText produces.
 */
export async function readNetworkFile(file) {
  const isKml = /\.kml$/i.test(file.name ?? "");
  if (isKml) return parseKmlText(await file.text());

  const buffer = await file.arrayBuffer();
  const entries = readZipEntries(buffer);
  const entry = pickKmlEntry(entries);
  if (!entry) throw new Error("No .kml found inside this KMZ.");

  const bytes = await inflateEntry(buffer, entry);
  return parseKmlText(new TextDecoder("utf-8").decode(bytes));
}
