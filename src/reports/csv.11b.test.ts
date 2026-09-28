// @vitest-environment happy-dom
// Phase 11B — CSV formula-injection guard: leading whitespace / control characters must not hide a formula.
// A spreadsheet may skip leading spaces, tabs, CR/LF, other C0 controls, NBSP, zero-width and bidi marks before
// deciding a cell is a formula, so the guard looks at the first MEANINGFUL character. Only a single quote is added;
// the user's text (including its leading spacing) is exported unchanged.
import { describe, it, expect, vi, afterEach } from "vitest";
import { csvCell, toCsv, downloadCsv } from "./csv";
import { readyReportRows } from "./reportCsv";

afterEach(() => vi.restoreAllMocks());

const guarded = (raw: string) => '"' + ("'" + raw).replace(/"/g, '""') + '"';
const plain = (raw: string) => '"' + raw.replace(/"/g, '""') + '"';

describe("csvCell — formula-shaped text behind leading whitespace is neutralised (11B)", () => {
  const LEADING = [
    " =SUM(1,1)",
    "   +1+1",
    " \t=1+1",
    " \r=1+1",
    "    @cmd",
    " \t \t-2+3",
    "\n=1+1",                     // LF before the formula
    " =1+1",                  // NBSP
    "　+1",                    // ideographic space
    "​=1+1",                  // zero-width space
    "‏=HYPERLINK(\"http://x\")", // RTL mark (common in Arabic text)
    "﻿@x",                    // stray BOM
    "\u0001=1+1"                   // other C0 control
  ];
  for (const raw of LEADING) {
    it(JSON.stringify(raw) + " → quote-prefixed, original spacing kept", () => {
      const out = csvCell(raw);
      expect(out).toBe(guarded(raw));
      expect(out.slice(2, -1)).toBe(raw.replace(/"/g, '""'));            // exactly the original text after the added quote
    });
  }
  it("the pre-11B cases are unchanged: = + - @ at position 0 and a leading TAB / CR", () => {
    for (const raw of ["=SUM(A1)", "+1", "-1", "@x", "\t1", "\r1", "\tplain", "-خالد"]) expect(csvCell(raw)).toBe(guarded(raw));
  });
  it("ordinary text and numbers are NOT prefixed (including leading spaces before safe text)", () => {
    for (const raw of ["محمد", "  محمد", " 12", "12", "0", "3.5", "a=b", "x+1", "user@example.com", "  (1)", "", "   "]) expect(csvCell(raw)).toBe(plain(raw));
    expect(csvCell(12)).toBe('"12"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
  it("quotes are still doubled after the prefix", () => {
    expect(csvCell(' ="a"')).toBe('"\' =""a"""');
  });
  it("toCsv applies the guard to every cell and keeps CRLF row joins", () => {
    expect(toCsv([["الاسم", "الملاحظة"], ["زيد", "  =cmd|' /C calc'!A0"], ["نور", " 12"]]))
      .toBe('"الاسم","الملاحظة"\r\n"زيد","\'  =cmd|\' /C calc\'!A0"\r\n"نور"," 12"');
  });
});

describe("report export (downloadCsv + a real report row builder) — end to end (11B)", () => {
  it("a leading-space formula in a report cell reaches the file quote-prefixed; BOM, MIME, CRLF unchanged", async () => {
    let captured: Blob | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn((b: Blob) => { captured = b; return "blob:x"; });
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    const rows = readyReportRows([{ displayName: "  =HYPERLINK(\"http://x\")", stages: [{ stageId: "B02", title: " \t@cmd" }] }] as unknown as Parameters<typeof readyReportRows>[0]);
    downloadCsv("ready-794589", rows);
    const blob = captured as unknown as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8;");
    const bytes = new Uint8Array(await new Response(blob).arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1);
    expect(text.split("\r\n")[1]).toBe('"\'  =HYPERLINK(""http://x"")","B02","\' \t@cmd"');
  });
});
