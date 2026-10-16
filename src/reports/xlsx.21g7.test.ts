// Phase 21G.7 — the dependency-free .xlsx writer: a valid STORED zip (every CRC-32 checked against Node's own zlib), the Office
// Open XML parts Excel needs, a right-to-left sheet, numbers as numbers, text as inline strings — and NO formula element ever, so
// a cell like «=SUM(1,1)» is text, not a formula (no formula injection). Characters XML forbids are dropped, markup is escaped.
import { describe, it, expect } from "vitest";
import { crc32 as zlibCrc32 } from "node:zlib";
import { toXlsx, xlsxParts, crc32, columnName } from "./xlsx";

/** Reads a zip's central directory and returns { name, data, crc } per entry, checking each local header against it. */
function unzipStored(buf: Uint8Array) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const end = buf.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true), dirAt = v.getUint32(end + 16, true), dec = new TextDecoder();
  const out: { name: string; data: string; crc: number }[] = [];
  let at = dirAt;
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const method = v.getUint16(at + 10, true), crc = v.getUint32(at + 16, true), size = v.getUint32(at + 20, true), nameLen = v.getUint16(at + 28, true), local = v.getUint32(at + 42, true);
    expect(method).toBe(0);                                                   // STORED
    const name = dec.decode(buf.subarray(at + 46, at + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const dataAt = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = buf.subarray(dataAt, dataAt + size);
    expect(zlibCrc32(data)).toBe(crc);                                        // independent CRC-32
    out.push({ name, data: dec.decode(data), crc });
    at += 46 + nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
  }
  return out;
}

describe("the .xlsx writer", () => {
  it("computes the standard CRC-32 and column names", () => {
    for (const s of ["", "a", "سجل العلامات", "x".repeat(1000)]) { const b = new TextEncoder().encode(s); expect(crc32(b)).toBe(zlibCrc32(b)); }
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });

  it("writes a valid zip of the Office Open XML parts Excel needs", () => {
    const files = unzipStored(toXlsx([["a", 1]]));
    expect(files.map(f => f.name)).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]);
    for (const f of files) expect(f.data.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
  });

  it("a right-to-left sheet: numbers as numbers, text as inline strings, a bold header, never a formula", () => {
    const sheet = xlsxParts([["الطالب", "العلامة"], ["سارة", 8.5], ["=SUM(1,1)", -3], ["", NaN as unknown as number]], { rtl: true, boldRows: [0], sheetName: "سجل/العلامات" })["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('<sheetView workbookViewId="0" rightToLeft="1"/>');
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">الطالب</t></is></c>');
    expect(sheet).toContain('<c r="B2"><v>8.5</v></c>');
    expect(sheet).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">=SUM(1,1)</t></is></c>');
    expect(sheet).toContain('<c r="B3"><v>-3</v></c>');
    expect(sheet).not.toMatch(/<f[ >]/);
    expect(sheet).toContain('<row r="4"></row>');                            // an empty text and a non-finite number are empty cells, never «NaN»
    expect(xlsxParts([["x"]], { sheetName: "سجل/العلامات" })["xl/workbook.xml"]).toContain('<sheet name="سجل العلامات" sheetId="1" r:id="rId1"/>');
  });

  it("escapes markup and drops characters XML forbids", () => {
    const sheet = xlsxParts([['<b>"x" & y</b>\u0001\u0007ok']])["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;ok");
    // eslint-disable-next-line no-control-regex -- the point of the check
    expect(sheet).not.toMatch(/[\u0001\u0007]/);
  });
});
