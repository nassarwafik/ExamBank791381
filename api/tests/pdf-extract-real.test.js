import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// The PDF import extracts text through the REAL pdf-parse (no mock): a small, valid two-page PDF built here — one page with a text
// layer, one blank page. Before this test nothing exercised the library itself, so a dependency update that changed its API (pdf-parse
// v2: require() returns an object, not a function — Dependabot #464) kept CI green while PDF import would fail at runtime.

const require_ = createRequire(import.meta.url);
const { extractPages, SCANNED_PAGE_TEXT_THRESHOLD } = require_("../src/lib/pdf-extract.js");

/** A minimal, valid PDF (correct xref offsets): page 1 draws `text` in Helvetica, page 2 is blank. */
function twoPagePdf(text) {
  const stream = "BT /F1 18 Tf 72 720 Td (" + text.replace(/[\\()]/g, m => "\\" + m) + ") Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 6 0 R >> >> >>",
    "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += (i + 1) + " 0 obj\n" + body + "\nendobj\n"; });
  const xref = out.length;
  out += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n" + offsets.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
  return Buffer.from(out, "latin1");
}

describe("PDF import through the real pdf-parse", () => {
  it("the installed pdf-parse has the v1 call shape the import uses", () => {
    expect(typeof require_("pdf-parse")).toBe("function");
  });
  it("a text page is extracted as text; a blank page is marked scanned for manual review", async () => {
    const line = "Question 1: Explain how a router forwards packets.";
    expect(line.length).toBeGreaterThanOrEqual(SCANNED_PAGE_TEXT_THRESHOLD);
    const { pages, warnings } = await extractPages(twoPagePdf(line));
    expect(pages.map(p => [p.pageNumber, p.kind])).toEqual([[1, "text"], [2, "scanned"]]);
    expect(pages[0].text).toBe(line);
    expect(pages[1].text).toBe("");
    expect(warnings).toEqual(["1 page(s) had no extractable text and were marked for manual review."]);
  });
  it("a corrupt file is rejected (the caller reports it), never returned as empty pages", async () => {
    await expect(extractPages(Buffer.from("%PDF-1.4\nnot really a pdf"))).rejects.toBeTruthy();
  });
});
