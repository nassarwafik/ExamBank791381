import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { crc32 } from "./xlsx";
import { readXlsxRows, XlsxReadError } from "./xlsxRead";
import { planScoreImport } from "../projects/scoreImport";
import type { Board } from "../projects/ProjectBulkReview";

// QA-21 / QA-22 — the project score import never coerces or guesses silently.
//
// Fail-first (QA on main c244cbab; fail-first run on 46ba9297):
//   QA-21  a cell shown as «85%» (stored 0.85) was imported as 0.85; a TRUE cell became the score 1; a formula with no saved value
//          was treated as an empty cell; values past row 5000 were dropped — all without a word to the teacher;
//   QA-22  a score column was mapped to the FIRST «· X» of its header, so a track title containing «·» sent the scores to the
//          wrong stage.

function zip(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder(), locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = enc.encode(content), data = new Uint8Array(deflateRawSync(raw)), n = enc.encode(name), crc = crc32(raw);
    const lh = new Uint8Array(30 + n.length), lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 8, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, n.length, true); lh.set(n, 30);
    const ch = new Uint8Array(46 + n.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, 8, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, n.length, true); cv.setUint32(42, offset, true); ch.set(n, 46);
    locals.push(lh, data); centrals.push(ch); offset += lh.length + data.length;
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, centrals.length, true); ev.setUint16(10, centrals.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = [...locals, ...centrals, end], out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let o = 0; for (const c of all) { out.set(c, o); o += c.length; }
  return out;
}
const STYLES = '<styleSheet><numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="0&quot;%&quot;"/></numFmts>' +
  '<cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="9" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/></cellXfs></styleSheet>';
function book(cells: string, styles: string | null = STYLES): Uint8Array {
  return zip({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": '<workbook><sheets><sheet name="s" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": "<worksheet><sheetData>" + cells + "</sheetData></worksheet>",
    ...(styles ? { "xl/styles.xml": styles } : {})
  });
}
const fail = async (bytes: Uint8Array) => { try { await readXlsxRows(bytes); return ""; } catch (e) { expect(e).toBeInstanceOf(XlsxReadError); return (e as Error).message; } };

describe("QA-21 the reader returns what the cell shows, or says why it cannot", () => {
  it("a percent-formatted number is read as the percentage shown (built-in 0% and a custom 0.0%)", async () => {
    const rows = await readXlsxRows(book('<row r="1"><c r="A1" s="1"><v>0.85</v></c><c r="B1" s="2"><v>0.855</v></c><c r="C1"><v>0.85</v></c></row>'));
    expect(rows[0]).toEqual([85, 85.5, 0.85]);
  });
  it("a format with a QUOTED «%» is not a percentage (the number is shown as is)", async () => {
    expect((await readXlsxRows(book('<row r="1"><c r="A1" s="3"><v>85</v></c></row>')))[0]).toEqual([85]);
  });
  it("TRUE / FALSE cells stay text (never the number 1 / 0)", async () => {
    expect((await readXlsxRows(book('<row r="1"><c r="A1" t="b"><v>1</v></c><c r="B1" t="b"><v>0</v></c></row>')))[0]).toEqual(["TRUE", "FALSE"]);
  });
  it("a formula with no saved value stops the read and names the cell; a formula WITH its cached value is read", async () => {
    expect(await fail(book('<row r="1"><c r="A1"><f>SUM(B1:C1)</f></c></row>'))).toContain("A1");
    expect((await readXlsxRows(book('<row r="1"><c r="A1"><f>SUM(B1:C1)</f><v>90</v></c></row>')))[0]).toEqual([90]);
  });
  // QA2-13 (QA round 2 on main 36dc60e9; a regression of the line above): a text formula that saved an EMPTY result is an empty
  // cell, not "a formula without a value" — templates use =IF(x="","",x) and the whole import used to stop.
  it("a text formula that saved an empty result (<v></v> or <v/>) is an empty cell; a text formula with NO saved value still stops", async () => {
    expect(await readXlsxRows(book('<row r="1"><c r="A1"><v>5</v></c><c r="B1" t="str"><f>IF(C1="","",C1)</f><v></v></c></row>'))).toEqual([[5]]);
    expect(await readXlsxRows(book('<row r="1"><c r="A1"><v>5</v></c><c r="B1" t="str"><f>IF(C1="","",C1)</f><v/></c></row>'))).toEqual([[5]]);
    expect((await readXlsxRows(book('<row r="1"><c r="A1" t="str"><f>IF(C1="","",C1)</f><v>نص</v></c></row>')))[0]).toEqual(["نص"]);
    expect(await fail(book('<row r="1"><c r="B1" t="str"><f>IF(C1="","",C1)</f></c></row>'))).toContain("B1");
    expect(await fail(book('<row r="1"><c r="B1"><f>SUM(C1:D1)</f><v></v></c></row>'))).toContain("B1");   // a NUMBER formula with an empty value saved nothing
  });
  it("a value past row 5000 stops the read (never dropped); an empty styled cell out there is harmless", async () => {
    expect(await fail(book('<row r="1"><c r="A1"><v>1</v></c></row><row r="5001"><c r="A5001"><v>7</v></c></row>'))).toContain("5000");
    expect(await readXlsxRows(book('<row r="1"><c r="A1"><v>1</v></c></row><row r="9000"><c r="A9000" s="1"/></row>'))).toEqual([[1]]);
  });
  it("unchanged: a workbook without styles.xml reads plain numbers as before", async () => {
    expect((await readXlsxRows(book('<row r="1"><c r="A1"><v>0.85</v></c></row>', null)))[0]).toEqual([0.85]);
  });
});

describe("QA-22 a score column belongs to the ONE stage id of this board in its header", () => {
  const stages = [{ stageId: "BK01", track: "book", title: "الغلاف", order: 1 }, { stageId: "BK02", track: "book", title: "الفهرس", order: 2 }] as Board["stages"];
  const board = { stages, students: [{ studentId: "s1", displayName: "بيان", code: "STU-9876", cells: {} }] } as unknown as Board;
  const plan = (headers: string[], values: (string | number)[]) => planScoreImport([["الطالب", "رقم", ...headers], ["بيان", "9876", ...values]], board);
  it("a track title containing «·» no longer sends the scores to the wrong stage", () => {
    const p = plan(["كتاب · الفصل الأول · BK02 الفهرس — العلامة من 100"], [70]);
    expect(p.changes).toEqual([{ studentId: "s1", stageId: "BK02", score: 70, previous: null }]);
    expect(p.unknownColumns).toEqual([]);
  });
  it("a header naming two of this board's stage ids is ambiguous: reported, never guessed", () => {
    const p = plan(["كتاب · BK01 · BK02 مراجعة — العلامة من 100", "كتاب · BK01 الغلاف — العلامة من 100"], [70, 60]);
    expect(p.unknownColumns).toEqual(["كتاب · BK01 · BK02 مراجعة — العلامة من 100"]);
    expect(p.changes).toEqual([{ studentId: "s1", stageId: "BK01", score: 60, previous: null }]);
  });
  it("QA-21 end to end: a TRUE cell in a score column is reported invalid, not imported as 1", () => {
    const p = plan(["كتاب · BK01 الغلاف — العلامة من 100"], ["TRUE"]);
    expect(p.changes).toEqual([]);
    expect(p.issues).toEqual([expect.objectContaining({ kind: "invalid", stageId: "BK01", value: "TRUE" })]);
  });
  it("unchanged: the exporter's own header maps as before", () => {
    expect(plan(["كتاب · BK01 الغلاف — العلامة من 100"], [55]).changes).toEqual([{ studentId: "s1", stageId: "BK01", score: 55, previous: null }]);
  });
});
