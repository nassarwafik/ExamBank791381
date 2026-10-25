// Phase G4 — a minimal, dependency-free Excel (.xlsx) READER for the teacher's imports, the counterpart of `./xlsx` (the writer).
// It reads the first worksheet of a workbook as rows of cells, in the browser, from the file the teacher picked: nothing is sent
// anywhere. An .xlsx file is a ZIP of Office Open XML parts; Excel, LibreOffice and Google Sheets write them DEFLATE-compressed
// (inflated with the platform's own DecompressionStream) and this repository's writer STORED; both are read.
// Safety:
//   • bounded: the file (MAX_FILE_BYTES), every part once inflated (MAX_PART_BYTES) and the rows / columns read are capped, so a
//     crafted «zip bomb» stops with an error instead of exhausting memory;
//   • values only: a formula's cached value is read like any other value and the formula itself is ignored; no external
//     reference, entity or URL is ever resolved (the XML is scanned as text, never handed to a parser that could fetch);
//   • an encrypted / password-protected entry, an unknown compression method or a part that is not there is an error, never a
//     silent empty sheet.
// QA-21 — nothing is coerced silently: a cell shown as a percentage («85%», stored 0.85) is read as the number shown (85); a
// TRUE / FALSE cell stays the text «TRUE» / «FALSE» (never the number 1 / 0); a formula with no saved value, and a value beyond
// the row / column bounds, stop the read with an error naming the problem instead of being dropped.

export type XlsxReadCell = string | number | null;
export class XlsxReadError extends Error {}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PART_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 5000, MAX_COLS = 500;

const NOT_XLSX = "الملف ليس ملف Excel صالحًا (xlsx).";

type Entry = { name: string; method: number; flags: number; compSize: number; size: number; offset: number };

function u16(b: Uint8Array, i: number) { return b[i] | (b[i + 1] << 8); }
function u32(b: Uint8Array, i: number) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }

/** The ZIP's central directory: every entry's name, method and where its data starts. */
function zipEntries(b: Uint8Array): Map<string, Entry> {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new XlsxReadError(NOT_XLSX);
  const count = u16(b, eocd + 10), cdOffset = u32(b, eocd + 16);
  const out = new Map<string, Entry>();
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw new XlsxReadError(NOT_XLSX);
    const flags = u16(b, p + 8), method = u16(b, p + 10), compSize = u32(b, p + 20), size = u32(b, p + 24);
    const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32), local = u32(b, p + 42);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    if (local + 30 > b.length || u32(b, local) !== 0x04034b50) throw new XlsxReadError(NOT_XLSX);
    const offset = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    out.set(name, { name, method, flags, compSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } }).pipeThrough(new DecompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel().catch(() => {}); throw new XlsxReadError("الملف أكبر من الحد المسموح بعد فكّ ضغطه."); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function readPart(b: Uint8Array, entries: Map<string, Entry>, name: string): Promise<string | null> {
  const e = entries.get(name);
  if (!e) return null;
  if (e.flags & 1) throw new XlsxReadError("الملف محمي بكلمة مرور أو مشفّر؛ احفظه دون حماية ثم أعد المحاولة.");
  if (e.size > MAX_PART_BYTES) throw new XlsxReadError("الملف أكبر من الحد المسموح بعد فكّ ضغطه.");
  const data = b.subarray(e.offset, e.offset + e.compSize);
  if (data.length !== e.compSize) throw new XlsxReadError(NOT_XLSX);
  let raw: Uint8Array;
  if (e.method === 0) raw = data;
  else if (e.method === 8) {
    try { raw = await inflateRaw(data, MAX_PART_BYTES); }
    catch (err) { if (err instanceof XlsxReadError) throw err; throw new XlsxReadError(NOT_XLSX); }
  } else throw new XlsxReadError("طريقة ضغط غير مدعومة في الملف؛ احفظه من Excel بصيغة xlsx ثم أعد المحاولة.");
  return new TextDecoder().decode(raw);
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e[0] !== "#") return ENTITY[e];
    const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}
/** Every <t> text inside a fragment (a shared string or an inline string), phonetic runs left out. */
function textOf(fragment: string): string {
  const clean = fragment.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) out += decodeXml(m[1] || "");
  return out;
}
const attr = (attrs: string, name: string) => {
  const m = attrs.match(new RegExp("(?:^|\\s)(?:\\w+:)?" + name + '\\s*=\\s*"([^"]*)"'));
  return m ? decodeXml(m[1]) : null;
};
/** «B12» → [11, 1] (row, column, 0-based). */
function refIndex(ref: string): [number, number] | null {
  const m = ref.match(/^([A-Z]{1,3})(\d+)$/);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]) - 1, col - 1];
}

/** The first worksheet's path: workbook.xml's first <sheet> → its relationship's target. */
function firstSheetPath(workbook: string | null, rels: string | null): string {
  const sheet = workbook && workbook.match(/<(?:\w+:)?sheet\b([^>]*)\/?>/);
  const id = sheet ? attr(sheet[1], "id") : null;
  if (id && rels) {
    for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
      if (attr(m[1], "Id") !== id) continue;
      const target = attr(m[1], "Target") || "";
      return target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
    }
  }
  return "xl/worksheets/sheet1.xml";
}

/** QA-21 — which cell styles display a number as a percentage: styles.xml's cellXfs (by index) whose number format is a percent
 *  (built-in 9 «0%» / 10 «0.00%», or a custom format code with a % that is not quoted or escaped). */
function percentStyles(styles: string | null): Set<number> {
  const out = new Set<number>();
  if (!styles) return out;
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<(?:\w+:)?numFmt\b([^>]*)\/?>/g)) custom.set(Number(attr(m[1], "numFmtId")), attr(m[1], "formatCode") || "");
  const isPercentCode = (code: string) => /%/.test(code.replace(/"[^"]*"/g, "").replace(/\\./g, ""));
  const xfs = styles.match(/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/);
  if (!xfs) return out;
  let i = 0;
  for (const m of xfs[1].matchAll(/<(?:\w+:)?xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/(?:\w+:)?xf>)/g)) {
    const id = Number(attr(m[1], "numFmtId") || 0);
    if (id === 9 || id === 10 || (custom.has(id) && isPercentCode(custom.get(id) || ""))) out.add(i);
    i++;
  }
  return out;
}
const OUT_OF_BOUNDS = "الملف أكبر من الحد المسموح للاستيراد (" + MAX_ROWS + " صف و" + MAX_COLS + " عمود). قسّمه إلى ملفات أصغر ثم أعد المحاولة.";

/** The first worksheet of an .xlsx file as rows of cells (row / column positions kept; a missing cell is null). */
export async function readXlsxRows(input: ArrayBuffer | Uint8Array): Promise<XlsxReadCell[][]> {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length > MAX_FILE_BYTES) throw new XlsxReadError("الملف أكبر من الحد المسموح (5 ميغابايت).");
  if (b.length < 22 || u32(b, 0) !== 0x04034b50) throw new XlsxReadError(NOT_XLSX);
  const entries = zipEntries(b);
  const path = firstSheetPath(await readPart(b, entries, "xl/workbook.xml"), await readPart(b, entries, "xl/_rels/workbook.xml.rels"));
  const sheet = await readPart(b, entries, path);
  if (sheet === null) throw new XlsxReadError(NOT_XLSX);
  const sharedXml = await readPart(b, entries, "xl/sharedStrings.xml");
  const percent = percentStyles(await readPart(b, entries, "xl/styles.xml"));   // QA-21
  const shared: string[] = [];
  if (sharedXml) for (const m of sharedXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) shared.push(textOf(m[1]));

  const rows: XlsxReadCell[][] = [];
  for (const m of sheet.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
    const at = refIndex(attr(m[1], "r") || "");
    if (!at) continue;
    const [r, c] = at;
    const type = attr(m[1], "t") || "n", inner = m[2] || "";
    const v = inner.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/);
    const raw = v ? decodeXml(v[1]) : null;
    // QA-21 — a formula whose value was never saved (written by a tool that does not calculate) has nothing to import: say so.
    // QA2-13 — but a text formula that saved an EMPTY result (=IF(x="","",x): t="str" with <v></v> or <v/>) did save its value,
    // the empty string: that is an empty cell, as it was before QA-21. Only a formula with no saved value at all is an error.
    const savedEmptyText = type === "str" && /<(?:\w+:)?v\b/.test(inner);
    if (/<(?:\w+:)?f\b/.test(inner) && !savedEmptyText && (raw === null || raw === "")) throw new XlsxReadError("الخلية " + (attr(m[1], "r") || "") + " تحتوي معادلة بلا قيمة محفوظة. افتح الملف في Excel واحفظه ثم أعد الاستيراد.");
    let value: XlsxReadCell = null;
    if (type === "s") value = raw !== null && shared[Number(raw)] !== undefined ? shared[Number(raw)] : null;
    else if (type === "inlineStr") value = textOf(inner.replace(/^[\s\S]*?<(?:\w+:)?is\b[^>]*>/, "").replace(/<\/(?:\w+:)?is>[\s\S]*$/, ""));
    else if (type === "b") value = raw === null || raw === "" ? null : raw === "1" ? "TRUE" : "FALSE";   // QA-21: never the number 1 / 0
    else if (type === "str" || type === "e") value = raw;
    else if (raw !== null && raw.trim() !== "") {
      const n = Number(raw);
      // QA-21 — a percent-formatted cell is read as the number it SHOWS (0.85 shown «85%» → 85), rounded off float noise.
      value = Number.isFinite(n) ? (percent.has(Number(attr(m[1], "s") || -1)) ? Math.round(n * 100 * 1e6) / 1e6 : n) : raw;
    }
    if (value === null || value === "") continue;
    if (r >= MAX_ROWS || c >= MAX_COLS) throw new XlsxReadError(OUT_OF_BOUNDS);   // QA-21: a value past the bounds is never dropped
    while (rows.length <= r) rows.push([]);
    const row = rows[r];
    while (row.length < c) row.push(null);
    row[c] = value;
  }
  return rows;
}
