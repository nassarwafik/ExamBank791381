import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { sanitizeExamForStudent } = require_("../src/lib/student-exam-sanitize.js");
const { studentExam, preStartAssignment } = require_("../src/functions/student-assignment.js");
const { handler } = require_("../src/functions/manage-assignments.js");
const { validateStructuredExam } = require_("../src/lib/shared-finalization/examQuality.js");

// Phase T1 — the student tools contract on the server: the student copy is the canonical spec or nothing, the assignment snapshot freezes
// a canonical spec (a malformed one is refused), and the server finalization gate blocks a malformed spec exactly like the Builder.

const TOOLS = {
  version: 1,
  tools: [
    { id: "calculator", variant: "scientific", angleUnit: "deg" },
    { id: "ipv4Calculator", showBinary: true, allowSubnetting: false }
  ],
  sectionOverrides: { s1: { disabled: ["calculator"] } }
};
const exam = extra => ({
  examId: "", title: "امتحان الشبكات",
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", questions: [{ examQuestionId: "q1", type: "mcq", text: "ما عنوان الشبكة؟", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 } }] }],
  ...extra
});

describe("T1 — student sanitizer", () => {
  it("delivers a valid spec as its canonical copy", () => {
    const raw = { version: 1, tools: [{ id: "baseConverter", bases: [16, 10, 2], showSteps: false }] };
    expect(sanitizeExamForStudent(exam({ studentTools: raw })).studentTools).toEqual({ version: 1, tools: [{ id: "baseConverter", bases: [2, 10, 16], showSteps: false }] });
    expect(studentExam(exam({ studentTools: TOOLS })).studentTools).toEqual(TOOLS);
  });
  it("withholds the WHOLE spec when a key is smuggled anywhere inside it", () => {
    for (const bad of [
      { ...TOOLS, answerKey: "SECRET-T1" },
      { ...TOOLS, tools: [{ ...TOOLS.tools[0], correct: "SECRET-T1" }, TOOLS.tools[1]] },
      { ...TOOLS, sectionOverrides: { s1: { disabled: ["calculator"], note: "SECRET-T1" } } }
    ]) {
      const out = sanitizeExamForStudent(exam({ studentTools: bad }));
      expect("studentTools" in out).toBe(false);
      expect(JSON.stringify(out)).not.toContain("SECRET-T1");
    }
  });
  it("withholds an unknown version / unknown tool / non-object, and an empty tool list", () => {
    for (const bad of [{ version: 2, tools: [] }, { version: 1, tools: [{ id: "chatbot" }] }, "calculator", [], { version: 1, tools: [] }, null])
      expect("studentTools" in sanitizeExamForStudent(exam({ studentTools: bad }))).toBe(false);
  });
  it("leaves an exam without tools exactly as before (no key appears)", () => {
    expect("studentTools" in sanitizeExamForStudent(exam({}))).toBe(false);
    expect("studentTools" in sanitizeExamForStudent({ questions: [] })).toBe(false);
  });
  it("still strips the answer key of an exam that has tools", () => {
    const out = sanitizeExamForStudent(exam({ studentTools: TOOLS }));
    expect(out.sections[0].questions[0].answer).toEqual({});
  });
});

describe("T1 — pre-start payload", () => {
  const a = snap => ({ assignmentId: "a1", title: "واجب", examSnapshot: snap });
  it("announces the allowed tools on the start screen (canonical copy) without the exam body", () => {
    const out = preStartAssignment(a(exam({ studentTools: TOOLS })), true, "continuous");
    expect(out.exam.studentTools).toEqual(TOOLS);
    expect(out.exam.sections).toBeUndefined();
  });
  it("delivers the CANONICAL copy, never the stored value itself", () => {
    const raw = { version: 1, tools: [{ id: "baseConverter", bases: [16, 2, 10], showSteps: false }] };
    const out = preStartAssignment(a(exam({ studentTools: raw })), false, "continuous").exam.studentTools;
    expect(out).toEqual({ version: 1, tools: [{ id: "baseConverter", bases: [2, 10, 16], showSteps: false }] });
    expect(out).not.toBe(raw);
  });
  it("omits malformed or absent tools", () => {
    expect("studentTools" in preStartAssignment(a(exam({ studentTools: { ...TOOLS, x: 1 } })), false).exam).toBe(false);
    expect("studentTools" in preStartAssignment(a(exam({})), false).exam).toBe(false);
  });
});

describe("T1 — server finalization gate (shared build)", () => {
  it("blocks a malformed spec and an override of a missing section, accepts a valid one", () => {
    const codes = e => validateStructuredExam(e).filter(i => i.code.startsWith("STUDENT_TOOLS_")).map(i => i.severity + ":" + i.code);
    expect(codes(exam({ studentTools: TOOLS }))).toEqual([]);
    expect(codes(exam({ studentTools: { version: 1, tools: [{ id: "chatbot" }] } }))).toEqual(["error:STUDENT_TOOLS_UNKNOWN_TOOL"]);
    expect(codes(exam({ studentTools: { ...TOOLS, sectionOverrides: { ghost: { disabled: ["calculator"] } } } }))).toEqual(["error:STUDENT_TOOLS_UNKNOWN_SECTION"]);
  });
});

describe("T1 — assignment creation freezes the tools with the snapshot", () => {
  let store, uploads, deps;
  beforeEach(() => {
    store = new Map(); uploads = [];
    store.set("platform/classes/c1.json", { classId: "c1", name: "الصف الأول", active: true });
    deps = {
      requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }),
      getContainer: () => ({}),
      downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null),
      uploadJson: async (_c, key, value) => { store.set(key, value); uploads.push({ key, value }); },
      listJson: async () => [],
      mutateJsonWithRetry: async () => { throw new Error("not used"); },
      recordAuditEvent: async () => {},
      ensurePublishedAssignmentIndexed: async () => {}
    };
  });
  const create = examSnapshot => handler({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "create", classId: "c1", title: "واجب", examSnapshot, publish: true }) }, deps);

  it("stores the CANONICAL spec in the snapshot", async () => {
    const r = await create(exam({ studentTools: { version: 1, tools: [{ id: "baseConverter", bases: [16, 2], showSteps: true }] } }));
    expect(r.status).toBe(200);
    const stored = uploads.find(u => u.value && u.value.examSnapshot).value;
    expect(stored.examSnapshot.studentTools).toEqual({ version: 1, tools: [{ id: "baseConverter", bases: [2, 16], showSteps: true }] });
  });
  it("REFUSES a malformed spec with 400 STUDENT_TOOLS_INVALID and stores nothing", async () => {
    for (const bad of [{ version: 1, tools: [{ id: "chatbot" }] }, { ...TOOLS, answerKey: "x" }, "calculator", { version: 3, tools: [] }]) {
      const r = await create(exam({ studentTools: bad }));
      expect(r.status).toBe(400);
      expect(r.jsonBody.code).toBe("STUDENT_TOOLS_INVALID");
      expect(r.jsonBody.error).toMatch(/أدوات الطالب/);
    }
    expect(uploads).toEqual([]);
  });
  it("an exam without tools is assigned exactly as before", async () => {
    const r = await create(exam({}));
    expect(r.status).toBe(200);
    const stored = uploads.find(u => u.value && u.value.examSnapshot).value;
    expect("studentTools" in stored.examSnapshot).toBe(false);
  });
});

describe("T5 — the formula sheet on the server", () => {
  const SHEET = { id: "formulaSheet", title: "قوانين", content: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "SECRET-SHEET-BODY F = m a" }] }] } };
  const spec5 = { version: 1, tools: [SHEET, { id: "scratchPad", drawing: true }] };
  const a = snap => ({ assignmentId: "a1", title: "واجب", examSnapshot: snap });
  it("the started exam delivers the sheet's content", () => {
    expect(JSON.stringify(sanitizeExamForStudent(exam({ studentTools: spec5 })).studentTools)).toContain("SECRET-SHEET-BODY");
  });
  it("the pre-start payload announces the sheet by title but never carries its content", () => {
    const out = preStartAssignment(a(exam({ studentTools: spec5 })), true, "continuous");
    expect(out.exam.studentTools.tools.map(t => t.id)).toEqual(["formulaSheet", "scratchPad"]);
    expect(out.exam.studentTools.tools[0].title).toBe("قوانين");
    expect(JSON.stringify(out)).not.toContain("SECRET-SHEET-BODY");
  });
  it("a sheet with a refused block is withheld from the student and refused at assignment creation", async () => {
    const bad = { version: 1, tools: [{ ...SHEET, content: { schemaVersion: 1, blocks: [{ type: "cli", source: "show run" }] } }] };
    expect("studentTools" in sanitizeExamForStudent(exam({ studentTools: bad }))).toBe(false);
    const codes = validateStructuredExam(exam({ studentTools: bad })).filter(i => i.code.startsWith("STUDENT_TOOLS_")).map(i => i.code);
    expect(codes).toEqual(["STUDENT_TOOLS_BLOCK_NOT_ALLOWED"]);
  });
});
