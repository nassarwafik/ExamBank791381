// Phase 21G.7 — a minimal, dependency-free Excel (.xlsx) writer for the teacher's exports: one right-to-left worksheet built from
// the SAME row builders as the CSV export, so every format carries exactly the same cells. An .xlsx file is a ZIP of a few
// Office Open XML parts; this writes them STORED (uncompressed — every reader supports it) with their CRC-32.
// Safety: a text cell is written as an inline string and a number as a number — the file contains no formula element at all, so a
// cell starting with «=», «+», «-» or «@» is only ever text (no formula injection). Characters XML 1.0 forbids are dropped.

export type XlsxCell = string | number;
export type XlsxOptions = { sheetName?: string; rtl?: boolean; boldRows?: readonly number[] };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// eslint-disable-next-line no-control-regex
const XML_FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;
const xml = (s: string) => s.replace(XML_FORBIDDEN, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** «A», «B», … «Z», «AA» … — the column letters of a 0-based index. */
export function columnName(i: number): string {
  let n = i + 1, s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function sheetXml(rows: readonly (readonly XlsxCell[])[], o: XlsxOptions): string {
  const bold = new Set(o.boldRows || []);
  const body = rows.map((row, r) => {
    const cells = row.map((v, c) => {
      const ref = columnName(c) + (r + 1), style = bold.has(r) ? ' s="1"' : "";
      if (typeof v === "number") return Number.isFinite(v) ? '<c r="' + ref + '"' + style + "><v>" + v + "</v></c>" : "";   // never «NaN»
      const text = v === null || v === undefined ? "" : String(v);
      return text === "" ? "" : '<c r="' + ref + '" t="inlineStr"' + style + '><is><t xml:space="preserve">' + xml(text) + "</t></is></c>";
    }).join("");
    return '<row r="' + (r + 1) + '">' + cells + "</row>";
  }).join("");
  const widest = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const cols = widest ? "<cols>" + Array.from({ length: widest }, (_, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="22" customWidth="1"/>').join("") + "</cols>" : "";
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"' + (o.rtl ? ' rightToLeft="1"' : "") + "/></sheetViews>" + cols + "<sheetData>" + body + "</sheetData></worksheet>";
}

/** The workbook's parts, by path (exported for tests). */
export function xlsxParts(rows: readonly (readonly XlsxCell[])[], o: XlsxOptions = {}): Record<string, string> {
  const name = xml((o.sheetName || "Sheet1").replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  return {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + name + '" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    "xl/worksheets/sheet1.xml": sheetXml(rows, o)
  };
}

/** A STORED (uncompressed) ZIP of the given files, in order. */
export function zipStored(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder(), chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: DataView, at: number, n: number) => v.setUint16(at, n, true), u32 = (v: DataView, at: number, n: number) => v.setUint32(at, n >>> 0, true);
  for (const [path, text] of Object.entries(files)) {
    const name = enc.encode(path), data = enc.encode(text), crc = crc32(data);
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0); u16(lv, 10, 0); u16(lv, 12, 0x21);
    u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length); u16(lv, 26, name.length); u16(lv, 28, 0); local.set(name, 30);
    const dir = new Uint8Array(46 + name.length), dv = new DataView(dir.buffer);
    u32(dv, 0, 0x02014b50); u16(dv, 4, 20); u16(dv, 6, 20); u16(dv, 8, 0x0800); u16(dv, 10, 0); u16(dv, 12, 0); u16(dv, 14, 0x21);
    u32(dv, 16, crc); u32(dv, 20, data.length); u32(dv, 24, data.length); u16(dv, 28, name.length); u16(dv, 30, 0); u16(dv, 32, 0);
    u16(dv, 34, 0); u16(dv, 36, 0); u32(dv, 38, 0); u32(dv, 42, offset); dir.set(name, 46);
    chunks.push(local, data); central.push(dir); offset += local.length + data.length;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer), count = central.length;
  u32(ev, 0, 0x06054b50); u16(ev, 4, 0); u16(ev, 6, 0); u16(ev, 8, count); u16(ev, 10, count); u32(ev, 12, dirSize); u32(ev, 16, offset); u16(ev, 20, 0);
  const all = [...chunks, ...central, end], out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) { out.set(c, at); at += c.length; }
  return out;
}

export const toXlsx = (rows: readonly (readonly XlsxCell[])[], o: XlsxOptions = {}) => zipStored(xlsxParts(rows, o));

/** Triggers a client download of the rows as an .xlsx workbook. */
export function downloadXlsx(filename: string, rows: readonly (readonly XlsxCell[])[], o: XlsxOptions = {}): void {
  const blob = new Blob([toXlsx(rows, o) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : filename + ".xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
