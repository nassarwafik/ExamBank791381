// 899371 P2 (docs/enterprise-899371-learning-plan.md §14) — reads the owner's Word source («أسس علم الحاسوب 899371.docx») into an
// ordered list of BODY items, so the course can be generated from, and proved equal to, the source itself:
//   { kind: "p", index, text, runs: [{ text, bold, mono }], numbered: { numId, level, format } | null, image: "imageN.png" | null }
//     (format: the list level's numFmt in word/numbering.xml — "bullet", "decimal"…)
//   { kind: "table", index, rows: [[ cellText ]] }        (a cell's paragraphs joined by "\n")
// Text is taken exactly: <w:t> text (XML entities decoded), <w:br/> → "\n", <w:tab/> → "\t". No normalisation of any kind.
// Pure Node (zlib for the deflated zip entries, no dependency). The source has no tracked changes, fields, symbols or formulas
// (checked in P2); an element this reader does not know is ignored only if it carries no text.
import { inflateRawSync } from "node:zlib";

/** One file of a zip archive (stored or deflated), by its name. */
export function readZipEntry(zip, name) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip archive");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("broken zip central directory");
    const method = zip.readUInt16LE(p + 10), size = zip.readUInt32LE(p + 20), nameLen = zip.readUInt16LE(p + 28), extraLen = zip.readUInt16LE(p + 30), commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const entry = zip.toString("utf8", p + 46, p + 46 + nameLen);
    if (entry === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error("unsupported zip method " + method);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("no " + name + " in the archive");
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()]);
const MONO = /Cascadia|Courier|Consolas|Mono/i;

/** The top-level children of <w:body> in order: paragraphs and tables (a table's own paragraphs are inside it). */
function bodyChildren(xml) {
  const body = xml.slice(xml.indexOf("<w:body>") + 8, xml.lastIndexOf("</w:body>"));
  const out = [];
  let i = 0;
  while (i < body.length) {
    const p = body.indexOf("<w:p", i), t = body.indexOf("<w:tbl>", i);
    const next = [p, t].filter(x => x >= 0).sort((a, b) => a - b)[0];
    if (next === undefined) break;
    if (next === t) { const end = matchingEnd(body, t, "w:tbl"); out.push({ tag: "tbl", xml: body.slice(t, end) }); i = end; continue; }
    if (!/^<w:p[ >]/.test(body.slice(p, p + 5))) { i = p + 4; continue; }   // <w:pPr>, <w:proofErr>… at top level are not paragraphs
    const end = matchingEnd(body, p, "w:p");
    out.push({ tag: "p", xml: body.slice(p, end) });
    i = end;
  }
  return out;
}
/** The index just after the element that opens at `start` (nesting of the same tag counted). */
function matchingEnd(s, start, tag) {
  const open = new RegExp("<" + tag + "(?=[ >/])", "g"), close = "</" + tag + ">";
  let depth = 0, i = start;
  open.lastIndex = start;
  for (;;) {
    open.lastIndex = i;
    const o = open.exec(s);
    const c = s.indexOf(close, i);
    if (c < 0) throw new Error("unclosed <" + tag + ">");
    if (o && o.index < c) {
      const selfClosing = s.slice(o.index, s.indexOf(">", o.index) + 1).endsWith("/>");
      if (!selfClosing) depth++;
      i = s.indexOf(">", o.index) + 1;
      continue;
    }
    depth--; i = c + close.length;
    if (depth === 0) return i;
  }
}

function paragraph(xml, rels, formats = {}) {
  const runs = [];
  for (const r of xml.matchAll(/<w:r(?=[ >])[\s\S]*?<\/w:r>/g)) {
    const rx = r[0];
    if (rx.includes("<w:txbxContent")) continue;   // a text box's own runs are not paragraph text (the source's two are empty)
    const props = (rx.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
    const bold = /<w:b\/>|<w:b w:val="(1|true|on)"\/>|<w:bCs\/>/.test(props) && !/<w:b w:val="(0|false|off)"\/>/.test(props);
    const font = (props.match(/w:ascii="([^"]+)"/) || [])[1] || "";
    let text = "";
    for (const piece of rx.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:t\/>|<w:br\/>|<w:tab\/>/g)) {
      if (piece[0] === "<w:br/>") text += "\n"; else if (piece[0] === "<w:tab/>") text += "\t"; else if (piece[1] !== undefined) text += decode(piece[1]);
    }
    if (text) runs.push({ text, bold, mono: MONO.test(font) });
  }
  const num = xml.match(/<w:numPr>[\s\S]*?<w:ilvl w:val="(\d+)"\/>[\s\S]*?<w:numId w:val="(\d+)"\/>/) || xml.match(/<w:numPr>[\s\S]*?<w:numId w:val="(\d+)"\/>/);
  const numbered = num ? (num.length === 3 ? { numId: Number(num[2]), level: Number(num[1]) } : { numId: Number(num[1]), level: 0 }) : null;
  if (numbered) numbered.format = (formats[numbered.numId] || {})[numbered.level] || "bullet";
  const embed = (xml.match(/r:embed="([^"]+)"/) || [])[1];
  return { text: runs.map(r => r.text).join(""), runs, numbered, image: embed && rels[embed] ? rels[embed].split("/").pop() : null };
}

/** numId → { level → numFmt } from word/numbering.xml (a num points at an abstractNum; a level override is not used by the source). */
function numberingFormats(xml) {
  const abstract = {};
  for (const a of xml.matchAll(/<w:abstractNum [^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    abstract[a[1]] = Object.fromEntries([...a[2].matchAll(/<w:lvl w:ilvl="(\d+)"[^>]*>[\s\S]*?<w:numFmt w:val="([^"]+)"/g)].map(l => [Number(l[1]), l[2]]));
  }
  return Object.fromEntries([...xml.matchAll(/<w:num w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId w:val="(\d+)"/g)].map(n => [Number(n[1]), abstract[n[2]] || {}]));
}

/** The ordered body items of a .docx buffer. */
export function readDocxBody(docx) {
  const xml = readZipEntry(docx, "word/document.xml").toString("utf8");
  const relsXml = readZipEntry(docx, "word/_rels/document.xml.rels").toString("utf8");
  const rels = Object.fromEntries([...relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
  const formats = numberingFormats(readZipEntry(docx, "word/numbering.xml").toString("utf8"));
  return bodyChildren(xml).map((c, index) => {
    if (c.tag === "p") return { kind: "p", index, ...paragraph(c.xml, rels, formats) };
    const rows = [...c.xml.matchAll(/<w:tr(?=[ >])[\s\S]*?<\/w:tr>/g)].map(tr =>
      [...tr[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(tc => [...tc[0].matchAll(/<w:p(?=[ >])[\s\S]*?<\/w:p>/g)].map(p => paragraph(p[0], rels).text).join("\n")));
    return { kind: "table", index, rows };
  });
}
