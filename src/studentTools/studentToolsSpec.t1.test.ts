import { describe, it, expect } from "vitest";
import {
  STUDENT_TOOL_IDS, STUDENT_TOOLS_VERSION, defaultStudentToolConfig, validateStudentTools, projectStudentToolsForStudent,
  enabledToolsForSection, studentToolsUnknownSectionIssues, type StudentToolsSpecV1
} from "./studentToolsSpec";
import { STUDENT_TOOLS_CATALOG, studentToolCatalogEntry } from "./studentToolsCatalog";
import { validateStructuredExam } from "../examQuality";
import { toSafePreviewExam } from "../examPreviewModel";
import type { StructuredExam } from "../examTypes";

const ALL: StudentToolsSpecV1 = { version: 1, tools: STUDENT_TOOL_IDS.map(defaultStudentToolConfig) };
const codes = (raw: unknown): string[] => { const v = validateStudentTools(raw); return v.ok ? [] : v.issues.map(i => i.code); };

describe("T1 — StudentToolsSpecV1 validation", () => {
  it("accepts every tool's default configuration and returns the canonical value", () => {
    const v = validateStudentTools(ALL);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value).toEqual(ALL);
  });

  it("accepts an empty tool list (no tools) but the student projection delivers nothing", () => {
    expect(validateStudentTools({ version: 1, tools: [] }).ok).toBe(true);
    expect(projectStudentToolsForStudent({ version: 1, tools: [] })).toBeUndefined();
  });

  it("canonicalizes: number bases sorted ascending, override lists in tool order, override keys sorted", () => {
    const v = validateStudentTools({
      version: 1,
      tools: [{ id: "baseConverter", bases: [16, 2, 10], showSteps: true }, { id: "calculator", variant: "basic", angleUnit: "rad" }],
      sectionOverrides: { "s2": { disabled: ["calculator", "baseConverter"] }, "s1": { disabled: ["calculator"] } }
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.tools[0]).toEqual({ id: "baseConverter", bases: [2, 10, 16], showSteps: true });
    expect(v.value.sectionOverrides).toEqual({ s1: { disabled: ["calculator"] }, s2: { disabled: ["calculator", "baseConverter"] } });
    expect(Object.keys(v.value.sectionOverrides!)).toEqual(["s1", "s2"]);
  });

  it.each([
    ["not an object", "calculator", "STUDENT_TOOLS_NOT_OBJECT"],
    ["an array", [], "STUDENT_TOOLS_NOT_OBJECT"],
    ["another version", { version: 2, tools: [] }, "STUDENT_TOOLS_UNSUPPORTED_VERSION"],
    ["no version", { tools: [] }, "STUDENT_TOOLS_UNSUPPORTED_VERSION"],
    ["a string version", { version: "1", tools: [] }, "STUDENT_TOOLS_UNSUPPORTED_VERSION"],
    ["no tool list", { version: 1 }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["an unknown root key", { version: 1, tools: [], script: "x" }, "STUDENT_TOOLS_UNKNOWN_KEY"],
    ["an unknown tool", { version: 1, tools: [{ id: "chatbot" }] }, "STUDENT_TOOLS_UNKNOWN_TOOL"],
    ["a tool that is not an object", { version: 1, tools: ["calculator"] }, "STUDENT_TOOLS_TOOL_NOT_OBJECT"],
    ["a duplicated tool", { version: 1, tools: [defaultStudentToolConfig("calculator"), defaultStudentToolConfig("calculator")] }, "STUDENT_TOOLS_DUPLICATE_TOOL"],
    ["an unknown tool key", { version: 1, tools: [{ ...defaultStudentToolConfig("calculator"), expression: "1+1" }] }, "STUDENT_TOOLS_UNKNOWN_KEY"],
    ["a calculator variant", { version: 1, tools: [{ id: "calculator", variant: "graphing", angleUnit: "deg" }] }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["a calculator angle unit", { version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "grad" }] }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["a missing calculator field", { version: 1, tools: [{ id: "calculator", variant: "basic" }] }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["an unsupported base", { version: 1, tools: [{ id: "baseConverter", bases: [2, 3], showSteps: false }] }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["a base as text", { version: 1, tools: [{ id: "baseConverter", bases: ["2", 10], showSteps: false }] }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["a duplicated base", { version: 1, tools: [{ id: "baseConverter", bases: [2, 2, 10], showSteps: false }] }, "STUDENT_TOOLS_DUPLICATE_VALUE"],
    ["a single base", { version: 1, tools: [{ id: "baseConverter", bases: [2], showSteps: false }] }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["a non-boolean flag", { version: 1, tools: [{ id: "baseConverter", bases: [2, 10], showSteps: "yes" }] }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["too many functions", { version: 1, tools: [{ id: "graphPlotter", maxFunctions: 4, showAnalysis: false }] }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["zero functions", { version: 1, tools: [{ id: "graphPlotter", maxFunctions: 0, showAnalysis: false }] }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["a fractional function count", { version: 1, tools: [{ id: "graphPlotter", maxFunctions: 1.5, showAnalysis: false }] }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["an ipv4 flag missing", { version: 1, tools: [{ id: "ipv4Calculator", showBinary: true }] }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["an override of a tool that is not enabled", { version: 1, tools: [defaultStudentToolConfig("calculator")], sectionOverrides: { s1: { disabled: ["graphPlotter"] } } }, "STUDENT_TOOLS_OVERRIDE_NOT_ENABLED"],
    ["an empty override", { version: 1, tools: [defaultStudentToolConfig("calculator")], sectionOverrides: { s1: { disabled: [] } } }, "STUDENT_TOOLS_INVALID_VALUE"],
    ["an override with an unknown key", { version: 1, tools: [defaultStudentToolConfig("calculator")], sectionOverrides: { s1: { disabled: ["calculator"], hidden: true } } }, "STUDENT_TOOLS_UNKNOWN_KEY"],
    ["a duplicated override entry", { version: 1, tools: [defaultStudentToolConfig("calculator")], sectionOverrides: { s1: { disabled: ["calculator", "calculator"] } } }, "STUDENT_TOOLS_DUPLICATE_VALUE"],
    ["a blank section id", { version: 1, tools: [defaultStudentToolConfig("calculator")], sectionOverrides: { " ": { disabled: ["calculator"] } } }, "STUDENT_TOOLS_INVALID_SECTION_ID"],
    ["a control character in a section id", { version: 1, tools: [defaultStudentToolConfig("calculator")], sectionOverrides: { "s\n1": { disabled: ["calculator"] } } }, "STUDENT_TOOLS_INVALID_SECTION_ID"],
    ["overrides that are not an object", { version: 1, tools: [], sectionOverrides: [] }, "STUDENT_TOOLS_INVALID_VALUE"]
  ])("refuses %s", (_name, raw, code) => {
    expect(codes(raw)).toContain(code);
    expect(projectStudentToolsForStudent(raw)).toBeUndefined();
  });

  it("refuses prototype-polluting keys at the root, in a tool and as a section id", () => {
    const root = JSON.parse('{"version":1,"tools":[],"__proto__":{"polluted":true}}');
    expect(codes(root)).toContain("STUDENT_TOOLS_FORBIDDEN_KEY");
    const tool = JSON.parse('{"version":1,"tools":[{"id":"calculator","variant":"basic","angleUnit":"deg","__proto__":{"x":1}}]}');
    expect(codes(tool)).toContain("STUDENT_TOOLS_FORBIDDEN_KEY");
    const section = JSON.parse('{"version":1,"tools":[{"id":"calculator","variant":"basic","angleUnit":"deg"}],"sectionOverrides":{"__proto__":{"disabled":["calculator"]}}}');
    expect(codes(section)).toContain("STUDENT_TOOLS_FORBIDDEN_KEY");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses a class instance (only plain JSON objects are configuration)", () => {
    class Fake { version = 1; tools = []; }
    expect(codes(new Fake())).toContain("STUDENT_TOOLS_NOT_OBJECT");
  });

  it("one invalid tool invalidates the whole spec (never a partially valid value)", () => {
    const raw = { version: 1, tools: [defaultStudentToolConfig("calculator"), { id: "graphPlotter", maxFunctions: 9, showAnalysis: false }] };
    expect(validateStudentTools(raw).ok).toBe(false);
    expect(projectStudentToolsForStudent(raw)).toBeUndefined();
  });

  it("the contract version constant is 1", () => {
    expect(STUDENT_TOOLS_VERSION).toBe(1);
  });
});

describe("T1 — student projection", () => {
  it("is the canonical value, never a spread of the raw input", () => {
    const raw = { version: 1, tools: [{ id: "baseConverter", bases: [16, 2], showSteps: false }] };
    const out = projectStudentToolsForStudent(raw)!;
    expect(out).toEqual({ version: 1, tools: [{ id: "baseConverter", bases: [2, 16], showSteps: false }] });
    expect(out).not.toBe(raw);
    expect(out.tools[0]).not.toBe(raw.tools[0]);
  });

  it("withholds the whole spec when anything is smuggled beside valid fields", () => {
    expect(projectStudentToolsForStudent({ ...ALL, answerKey: "SECRET" })).toBeUndefined();
    expect(projectStudentToolsForStudent({ version: 1, tools: [{ ...defaultStudentToolConfig("ipv4Calculator"), correct: "10.0.0.0" }] })).toBeUndefined();
  });

  it("absent / null ⇒ no tools", () => {
    expect(projectStudentToolsForStudent(undefined)).toBeUndefined();
    expect(projectStudentToolsForStudent(null)).toBeUndefined();
  });
});

describe("T1 — tools per section", () => {
  const spec = validateStudentTools({ version: 1, tools: [defaultStudentToolConfig("calculator"), defaultStudentToolConfig("ipv4Calculator")], sectionOverrides: { mental: { disabled: ["calculator"] } } });
  it("removes a section's disabled tools and keeps the others in spec order", () => {
    if (!spec.ok) throw new Error("fixture");
    expect(enabledToolsForSection(spec.value, "mental").map(t => t.id)).toEqual(["ipv4Calculator"]);
    expect(enabledToolsForSection(spec.value, "other").map(t => t.id)).toEqual(["calculator", "ipv4Calculator"]);
    expect(enabledToolsForSection(spec.value, undefined).map(t => t.id)).toEqual(["calculator", "ipv4Calculator"]);
  });
  it("no spec ⇒ no tools; an inherited property name is not a section override", () => {
    expect(enabledToolsForSection(undefined, "s1")).toEqual([]);
    if (!spec.ok) throw new Error("fixture");
    expect(enabledToolsForSection(spec.value, "toString").map(t => t.id)).toEqual(["calculator", "ipv4Calculator"]);
  });
  it("reports overrides that name a section the exam does not have", () => {
    if (!spec.ok) throw new Error("fixture");
    expect(studentToolsUnknownSectionIssues(spec.value, ["mental"])).toEqual([]);
    expect(studentToolsUnknownSectionIssues(spec.value, ["s1"]).map(i => i.code)).toEqual(["STUDENT_TOOLS_UNKNOWN_SECTION"]);
  });
});

describe("T1 — catalog", () => {
  it("has exactly one Arabic entry per contract tool id, in contract order", () => {
    expect(STUDENT_TOOLS_CATALOG.map(e => e.id)).toEqual([...STUDENT_TOOL_IDS]);
    for (const id of STUDENT_TOOL_IDS) {
      const e = studentToolCatalogEntry(id);
      expect(e.label.trim()).not.toBe("");
      expect(e.description.trim()).not.toBe("");
      expect(e.answerRisk.trim()).not.toBe("");
    }
  });
});

describe("T1 — Builder quality gate and teacher preview", () => {
  const exam = (extra: Partial<StructuredExam>): StructuredExam => ({
    examId: "e1", title: "امتحان",
    sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", questions: [{ examQuestionId: "q1", type: "mcq", text: "سؤال", marks: 1, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }] }],
    ...extra
  } as unknown as StructuredExam);
  const toolCodes = (e: StructuredExam) => validateStructuredExam(e).filter(i => i.code.startsWith("STUDENT_TOOLS_"));

  it("an exam without tools has no tool issue (legacy exams unchanged)", () => {
    expect(toolCodes(exam({}))).toEqual([]);
  });
  it("a valid spec has no tool issue", () => {
    expect(toolCodes(exam({ studentTools: ALL }))).toEqual([]);
  });
  it("a malformed spec BLOCKS (error severity)", () => {
    const issues = toolCodes(exam({ studentTools: { version: 1, tools: [{ id: "chatbot" }] } as unknown as StudentToolsSpecV1 }));
    expect(issues.map(i => [i.severity, i.code])).toEqual([["error", "STUDENT_TOOLS_UNKNOWN_TOOL"]]);
  });
  it("an override of a section the exam does not have BLOCKS", () => {
    const spec = { version: 1 as const, tools: [defaultStudentToolConfig("calculator")], sectionOverrides: { ghost: { disabled: ["calculator" as const] } } };
    expect(toolCodes(exam({ studentTools: spec })).map(i => [i.severity, i.code])).toEqual([["error", "STUDENT_TOOLS_UNKNOWN_SECTION"]]);
    expect(toolCodes(exam({ studentTools: { ...spec, sectionOverrides: { s1: { disabled: ["calculator"] } } } }))).toEqual([]);
  });
  it("the teacher preview shows exactly what the student receives: canonical tools or none", () => {
    const valid = toSafePreviewExam(exam({ studentTools: { version: 1, tools: [{ id: "baseConverter", bases: [16, 2], showSteps: false }] } }));
    expect(valid.studentTools).toEqual({ version: 1, tools: [{ id: "baseConverter", bases: [2, 16], showSteps: false }] });
    const smuggled = toSafePreviewExam(exam({ studentTools: { ...ALL, extra: "SECRET" } as unknown as StudentToolsSpecV1 }));
    expect("studentTools" in smuggled).toBe(false);
    expect("studentTools" in toSafePreviewExam(exam({}))).toBe(false);
  });
});
