import { describe, it, expect } from "vitest";
import { validateStudentTools, projectStudentToolsForStudent, projectStudentToolsForPreStart, defaultStudentToolConfig, PRE_START_SHEET_PLACEHOLDER, FORMULA_SHEET_MAX_BYTES } from "./studentToolsSpec";
import { STUDENT_TOOLS_CATALOG } from "./studentToolsCatalog";
import { questionRiskFor } from "./studentToolsRisk";

const para = (text: string) => ({ type: "paragraph", runs: [{ text }] });
const sheet = (over: Record<string, unknown> = {}) => ({ id: "formulaSheet", title: "قوانين الحركة", content: { schemaVersion: 1, blocks: [{ type: "heading", level: 2, runs: [{ text: "الحركة" }] }, para("السرعة = المسافة ÷ الزمن"), { type: "math", source: "v = v_0 + a t" }, { type: "table", columnHeaders: ["الثابت", "القيمة"], rows: [["g", "9.8"]] }] }, ...over });
const spec = (...tools: unknown[]) => ({ version: 1, tools });
const codes = (raw: unknown) => { const v = validateStudentTools(raw); return v.ok ? [] : v.issues.map(i => i.code); };

describe("T5 — formula sheet contract", () => {
  it("accepts text, maths and tables and returns the canonical document (title trimmed)", () => {
    const v = validateStudentTools(spec(sheet({ title: "  قوانين الحركة  " })));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const t = v.value.tools[0];
    expect(t.id === "formulaSheet" && t.title).toBe("قوانين الحركة");
    expect(t.id === "formulaSheet" && t.content.blocks.map(b => b.type)).toEqual(["heading", "paragraph", "math", "table"]);
  });
  it("the default sheet is valid", () => {
    expect(validateStudentTools(spec(defaultStudentToolConfig("formulaSheet"))).ok).toBe(true);
  });
  it.each([
    ["no title", sheet({ title: undefined }), "STUDENT_TOOLS_INVALID_VALUE"],
    ["a blank title", sheet({ title: "  " }), "STUDENT_TOOLS_INVALID_VALUE"],
    ["a long title", sheet({ title: "ق".repeat(81) }), "STUDENT_TOOLS_INVALID_VALUE"],
    ["a bidi control in the title", sheet({ title: "قوانين‮" }), "STUDENT_TOOLS_INVALID_VALUE"],
    ["empty content", sheet({ content: { schemaVersion: 1, blocks: [] } }), "STUDENT_TOOLS_INVALID_CONTENT"],
    ["no content", sheet({ content: undefined }), "STUDENT_TOOLS_INVALID_CONTENT"],
    ["raw HTML", sheet({ content: { schemaVersion: 1, blocks: [para("<script>alert(1)</script>")] } }), "STUDENT_TOOLS_INVALID_CONTENT"],
    ["a (valid) image block", sheet({ content: { schemaVersion: 1, blocks: [{ type: "image", alt: "صورة", asset: { dataUrl: "data:image/png;base64,iVBORw0KGgo=", origin: "uploaded" } }] } }), "STUDENT_TOOLS_BLOCK_NOT_ALLOWED"],
    ["an unknown key", sheet({ answer: "x" }), "STUDENT_TOOLS_UNKNOWN_KEY"],
    ["an oversized document", sheet({ content: { schemaVersion: 1, blocks: Array.from({ length: 10 }, () => para("ق".repeat(4000))) } }), "STUDENT_TOOLS_TOO_LARGE"]
  ])("refuses %s", (_n, tool, code) => {
    expect(codes(spec(tool))).toContain(code);
    expect(projectStudentToolsForStudent(spec(tool))).toBeUndefined();
  });
  it("refuses blocks outside the allow-list, also inside columns (charts, graphs, code-free rich media)", () => {
    const graph = { type: "functionGraph", graph: { version: 1, id: "g", title: "رسم", description: "و", viewport: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, curves: [{ id: "f", kind: "explicit", expression: "x" }] } };
    expect(codes(spec(sheet({ content: { schemaVersion: 1, blocks: [graph] } })))).toContain("STUDENT_TOOLS_BLOCK_NOT_ALLOWED");
    expect(codes(spec(sheet({ content: { schemaVersion: 1, blocks: [{ type: "columns", columns: [{ blocks: [para("أ")] }, { blocks: [graph] }] }] } })))).toContain("STUDENT_TOOLS_BLOCK_NOT_ALLOWED");
    expect(codes(spec(sheet({ content: { schemaVersion: 1, blocks: [{ type: "cli", source: "show ip" }] } })))).toContain("STUDENT_TOOLS_BLOCK_NOT_ALLOWED");
  });
  it("the size bound is a real bound", () => {
    expect(FORMULA_SHEET_MAX_BYTES).toBe(65536);
  });
});

describe("T5 — scratch pad contract", () => {
  it("accepts the drawing switch and its default", () => {
    expect(validateStudentTools(spec({ id: "scratchPad", drawing: false })).ok).toBe(true);
    expect(defaultStudentToolConfig("scratchPad")).toEqual({ id: "scratchPad", drawing: true });
  });
  it.each([[{ id: "scratchPad" }], [{ id: "scratchPad", drawing: "yes" }], [{ id: "scratchPad", drawing: true, save: true }]])("refuses %j", t => {
    expect(validateStudentTools(spec(t)).ok).toBe(false);
  });
});

describe("T5 — the pre-start projection withholds the sheet's content", () => {
  it("keeps the title, replaces the content with the fixed placeholder, leaves the other tools as they are", () => {
    const raw = spec({ id: "calculator", variant: "basic", angleUnit: "deg" }, sheet(), { id: "scratchPad", drawing: true });
    const pre = projectStudentToolsForPreStart(raw)!;
    expect(pre.tools[0]).toEqual({ id: "calculator", variant: "basic", angleUnit: "deg" });
    expect(pre.tools[1]).toEqual({ id: "formulaSheet", title: "قوانين الحركة", content: PRE_START_SHEET_PLACEHOLDER });
    expect(pre.tools[2]).toEqual({ id: "scratchPad", drawing: true });
    expect(JSON.stringify(pre)).not.toContain("v_0");
    expect(validateStudentTools(pre).ok).toBe(true);                       // still a valid spec (the client re-projects it)
    expect(projectStudentToolsForPreStart({ ...raw, x: 1 })).toBeUndefined();
  });
});

describe("T5 — catalog and risk", () => {
  it("both tools are listed and available; neither is named by the risk heuristic", () => {
    expect(STUDENT_TOOLS_CATALOG.filter(e => e.id === "formulaSheet" || e.id === "scratchPad").map(e => [e.id, e.available])).toEqual([["formulaSheet", true], ["scratchPad", true]]);
    expect(questionRiskFor("formulaSheet", { text: "حوّل إلى الثنائي 192.168.1.1" })).toBe(false);
    expect(questionRiskFor("scratchPad", { text: "حوّل إلى الثنائي" })).toBe(false);
  });
});
