import { describe, it, expect } from "vitest";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { hydrateBankAssets, normalizeBankAssetsForStorage } from "../src/lib/bank-asset-hydrate.js";

// Phase T9 — a formula sheet's images follow the platform's one image model: an uploaded raster rides inside the exam (as question images
// do); a bank image is stored as its durable identity and delivered through a freshly signed URL. The pre-start payload never carries the
// sheet's content (T5), images included.
process.env.BUILDER_SESSION_SECRET = process.env.BUILDER_SESSION_SECRET || "test-signing-secret-t9";   // bank delivery URLs are HMAC-signed (test-only value)
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const BANK = { id: "img1", origin: "bank", blobName: "bank/questions/img1.png", contentType: "image/png" };
const tools = blocks => ({ version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "deg" }, { id: "formulaSheet", title: "قوانين", content: { schemaVersion: 1, blocks } }] });
const exam = st => ({ title: "امتحان", studentTools: st, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "اختر", marks: 1, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }] }] });
const sheetOf = e => e.studentTools.tools.find(t => t.id === "formulaSheet");

describe("T9 — sheet images in storage and delivery", () => {
  it("delivery signs a bank image of the sheet (top level and inside columns); the student projection keeps it", () => {
    const e = exam(tools([{ type: "image", alt: "أ", asset: BANK }, { type: "columns", columns: [{ blocks: [{ type: "paragraph", runs: [{ text: "ب" }] }] }, { blocks: [{ type: "figure", alt: "ج", caption: [], asset: BANK }] }] }]));
    const hydrated = hydrateBankAssets(e);
    const [top, cols] = sheetOf(hydrated).content.blocks;
    expect(top.asset.dataUrl).toMatch(/^\/api\/question-image\?blob=bank%2Fquestions%2Fimg1\.png&exp=\d+&sig=/);
    expect(cols.columns[1].blocks[0].asset.dataUrl).toMatch(/^\/api\/question-image\?/);
    expect(sheetOf(e).content.blocks[0].asset.dataUrl).toBeUndefined();           // the input is never modified
    const student = sanitizeExamForStudent(hydrated);
    expect(sheetOf(student).content.blocks[0].asset.dataUrl).toMatch(/^\/api\/question-image\?/);
  });

  it("storage keeps only the durable identity of a bank image (a signed URL sent back by a browser is dropped)", () => {
    const signed = hydrateBankAssets(exam(tools([{ type: "image", alt: "أ", asset: BANK }])));
    const stored = normalizeBankAssetsForStorage(signed);
    expect(sheetOf(stored).content.blocks[0].asset).toEqual(BANK);
    expect(JSON.stringify(stored)).not.toMatch(/sig=/);
  });

  it("an uploaded raster and an exam without sheet images are the same reference (nothing rewritten)", () => {
    const up = exam(tools([{ type: "image", alt: "أ", asset: { dataUrl: PNG, origin: "uploaded" } }]));
    expect(hydrateBankAssets(up).studentTools).toBe(up.studentTools);
    expect(normalizeBankAssetsForStorage(up).studentTools).toBe(up.studentTools);
    const none = exam({ version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "deg" }] });
    expect(hydrateBankAssets(none).studentTools).toBe(none.studentTools);
    const noTools = { title: "x", sections: [] };
    expect(hydrateBankAssets(noTools).studentTools).toBeUndefined();
  });

  it("the student projection of an uploaded sheet image is the image, and a malformed sheet image drops the whole tools value", () => {
    const up = sanitizeExamForStudent(exam(tools([{ type: "image", alt: "أ", asset: { dataUrl: PNG, origin: "uploaded" } }])));
    expect(sheetOf(up).content.blocks[0].asset).toEqual({ dataUrl: PNG, origin: "uploaded" });
    const bad = sanitizeExamForStudent(exam(tools([{ type: "image", alt: "أ", asset: { dataUrl: "javascript:alert(1)", origin: "uploaded" } }])));
    expect(bad.studentTools).toBeUndefined();
    expect(JSON.stringify(bad)).not.toContain("javascript:");
  });
});
