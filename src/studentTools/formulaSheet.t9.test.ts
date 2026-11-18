// Phase T9 — images in the formula sheet (docs/enterprise-student-tools-t.md §16): the contract's image budget, apart from the text bound.
import { describe, it, expect } from "vitest";
import {
  validateStudentTools, projectStudentToolsForStudent, projectStudentToolsForPreStart, PRE_START_SHEET_PLACEHOLDER,
  FORMULA_SHEET_MAX_BYTES, FORMULA_SHEET_MAX_IMAGES, FORMULA_SHEET_IMAGE_MAX_CHARS, FORMULA_SHEET_IMAGES_MAX_CHARS
} from "./studentToolsSpec";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const BANK = { id: "img1", origin: "bank", blobName: "bank/questions/img1.png", contentType: "image/png" };
const para = (t: string) => ({ type: "paragraph", runs: [{ text: t }] });
const img = (dataUrl = PNG) => ({ type: "image", alt: "مخطط", asset: { dataUrl, origin: "uploaded" } });
const big = (chars: number) => "data:image/png;base64," + "A".repeat(chars - "data:image/png;base64,".length);
const sheet = (blocks: unknown[]) => ({ version: 1, tools: [{ id: "formulaSheet", title: "قوانين", content: { schemaVersion: 1, blocks } }] });
const codes = (v: unknown) => { const r = validateStudentTools(v); return r.ok ? [] : r.issues.map(i => i.code); };
const ok = (v: unknown) => validateStudentTools(v).ok;

describe("T9 — the formula sheet accepts images", () => {
  it("an uploaded raster image, a figure with a caption, an image inside columns and a bank image are accepted, unchanged", () => {
    const figure = { type: "figure", alt: "دارة", caption: [{ text: "الشكل 1" }], asset: { dataUrl: PNG, origin: "uploaded" } };
    const columns = { type: "columns", columns: [{ blocks: [para("أ")] }, { blocks: [img()] }] };
    const bank = { type: "image", alt: "من البنك", asset: BANK };
    for (const blocks of [[para("v = d / t"), img()], [figure], [columns], [bank]]) {
      const r = validateStudentTools(sheet(blocks));
      expect(r.ok, JSON.stringify(blocks).slice(0, 80)).toBe(true);
      if (r.ok) expect((r.value.tools[0] as { content: { blocks: unknown[] } }).content.blocks).toEqual(blocks);
    }
  });

  it("an unsafe image is refused by the one image validator (SVG, a remote URL, an unknown key)", () => {
    for (const asset of [{ dataUrl: "data:image/svg+xml;base64,PHN2Zz4=", origin: "uploaded" }, { dataUrl: "https://x.example/a.png", origin: "uploaded" }, { dataUrl: PNG, origin: "uploaded", onload: "x" }]) {
      expect(codes(sheet([{ type: "image", alt: "x", asset }]))).toContain("STUDENT_TOOLS_INVALID_CONTENT");
    }
  });

  it("charts, graphs and 3D scenes stay refused", () => {
    const chart = { type: "dataChart", chart: { version: 1 } };
    expect(codes(sheet([chart])).some(c => c === "STUDENT_TOOLS_BLOCK_NOT_ALLOWED" || c === "STUDENT_TOOLS_INVALID_CONTENT")).toBe(true);
  });
});

describe("T9 — the image budget is apart from the text bound", () => {
  it("the budget is what the record says", () => {
    expect([FORMULA_SHEET_MAX_BYTES, FORMULA_SHEET_MAX_IMAGES, FORMULA_SHEET_IMAGE_MAX_CHARS, FORMULA_SHEET_IMAGES_MAX_CHARS]).toEqual([65536, 4, 1400000, 2800000]);
  });
  it("an image never eats into the text: almost 64 KiB of text plus a ~1 MB image is accepted", () => {
    const text = Array.from({ length: 7 }, () => para("ق".repeat(4500)));               // ≈ 63 KB of UTF-8 text
    expect(ok(sheet([...text, img(big(FORMULA_SHEET_IMAGE_MAX_CHARS))]))).toBe(true);
  });
  it("the text bound still holds with images present", () => {
    const text = Array.from({ length: 10 }, () => para("ق".repeat(4000)));              // ≈ 80 KB of text
    expect(codes(sheet([...text, img()]))).toContain("STUDENT_TOOLS_TOO_LARGE");
  });
  it("at most 4 images", () => {
    expect(ok(sheet([img(), img(), img(), img()]))).toBe(true);
    expect(codes(sheet([img(), img(), img(), img(), img()]))).toContain("STUDENT_TOOLS_TOO_LARGE");
    expect(codes(sheet([img(), img(), img(), { type: "columns", columns: [{ blocks: [img()] }, { blocks: [img()] }] }]))).toContain("STUDENT_TOOLS_TOO_LARGE");
  });
  it("one image above ~1 MB is refused; ~2 MB in all is the ceiling", () => {
    expect(codes(sheet([img(big(FORMULA_SHEET_IMAGE_MAX_CHARS + 1))]))).toContain("STUDENT_TOOLS_TOO_LARGE");
    expect(ok(sheet([img(big(FORMULA_SHEET_IMAGE_MAX_CHARS)), img(big(FORMULA_SHEET_IMAGE_MAX_CHARS))]))).toBe(true);
    expect(codes(sheet([img(big(FORMULA_SHEET_IMAGE_MAX_CHARS)), img(big(FORMULA_SHEET_IMAGE_MAX_CHARS)), img(big(1000))]))).toContain("STUDENT_TOOLS_TOO_LARGE");
  });
  it("a bank image costs nothing in the budget (it is a reference, delivered through a signed URL)", () => {
    const bank = { type: "image", alt: "ب", asset: BANK };
    expect(ok(sheet([img(big(FORMULA_SHEET_IMAGE_MAX_CHARS)), img(big(FORMULA_SHEET_IMAGE_MAX_CHARS)), bank]))).toBe(true);
  });
});

describe("T9 — projections", () => {
  it("the student projection delivers the images; the pre-start projection withholds the whole content, images included", () => {
    const spec = sheet([para("قانون"), img()]);
    expect(JSON.stringify(projectStudentToolsForStudent(spec))).toContain(PNG);
    const pre = projectStudentToolsForPreStart(spec)!;
    expect(JSON.stringify(pre)).not.toContain("data:image");
    expect((pre.tools[0] as { content: unknown }).content).toEqual(PRE_START_SHEET_PLACEHOLDER);
  });
});
