import { describe, it, expect } from "vitest";
import { QUESTION_TYPE_CATALOG, compoundPartTypeKeys, questionTypeDefinition, effectiveQuestionTypeVersion } from "../questionTypeCatalog";
import { validateStructuredExam } from "../examQuality";
import { evaluateExamFinalization } from "../examFinalization";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { questionMaxMarks as clientQuestionMaxMarks } from "../examStructure";
import { questionMaxMarks as builderQuestionMaxMarks, computeTotalMarks, cloneQuestionWithNewIds, duplicateQuestion, structuredExamCopy } from "../examBuilderState";
import { answered } from "../answerState";
// @ts-expect-error — the server module is CommonJS without (complete) type declarations; parity needs the REAL server helpers.
import { questionMaxMarks as serverQuestionMaxMarks, examOfficialStats, isCompound as serverIsCompound } from "../../api/src/lib/exam-structure.js";
import * as model from "../compositeQuestion";
import { compositeArabicExam, compositePhysicsExam, compositeCsExam, compositeNetworkExam } from "./compositeFixtures";

// Phase 20D — composite@1 DOMAIN CONTRACT (fail-first on caac213: the catalog has 24 types, ../compositeQuestion does not exist, a composite
// question is an unknown type to finalization / marks / copy). One strict, data-only authority: exact keys, stable bounded ids, bounded
// arrays, no nesting, code-owned child vocabulary, exact versions, mark invariants, context references — every violation BLOCKS.
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
type Q = BuilderQuestion & { composite: { v: number; contexts: Record<string, unknown>[]; groups: Record<string, unknown>[] } };
const qOf = (e: StructuredExam) => e.sections[0].questions[0] as Q;
const withQ = (mut: (q: Q) => void, base = compositeArabicExam): StructuredExam => { const e = base(); mut(qOf(e)); return e; };
const errors = (e: StructuredExam) => validateStructuredExam(e).filter(i => i.severity === "error").map(i => i.code);
const FIXTURES = { A: compositeArabicExam, B: compositePhysicsExam, C: compositeCsExam, D: compositeNetworkExam };

describe("20D-1 catalog identity", () => {
  it("25 production types; composite@1 sits right after compound; compound@1 is unchanged and never nests composite", () => {
    expect(QUESTION_TYPE_CATALOG.length).toBe(29);   /* 21D-B.3 adds meshPartSelection (after scene3DSelection) · 21A.1 inserts chartSelection@1 right after composite · 21A.2 inserts functionGraphSelection@1 right after chartSelection */
    const keys = QUESTION_TYPE_CATALOG.map(d => d.key);
    expect(keys.indexOf("composite")).toBe(keys.indexOf("compound") + 1);
    expect(questionTypeDefinition("composite")).toEqual({ key: "composite", version: 1, label: "سؤال مركّب متقدّم", category: "composite", gradingMode: "composed", capabilities: { autoGrading: true, manualGrading: true, hybridGrading: true, partialCredit: true, compoundPart: false, interactive: true, requiresImage: false, offline: true }, responseKinds: ["composite"], legacy: false });
    expect(compoundPartTypeKeys()).not.toContain("composite");
    expect(effectiveQuestionTypeVersion("composite", 2)).toBeUndefined();
  });
  it("the code-owned child vocabulary: every listed identity, exact versions, never compound / composite", () => {
    expect([...model.COMPOSITE_CHILD_IDENTITIES]).toEqual([
      "multipleChoice@1", "trueFalse@1", "multiTrueFalse@1", "shortAnswer@1", "fillBlank@1", "wordBank@1", "matching@1", "ordering@1", "tableFill@1", "cliFill@1",
      "multipleSelect@1", "numericResponse@1", "matrix@1", "categorization@1", "simulation@1", "coding@1", "coding@2", "coding@3", "networkCli@1", "inlineCloze@1",
      "parametricNumeric@1", "hotspot@1", "labelDiagram@1", "openResponse@1", "smartSim@1",
      "chartSelection@1",   // 21A.1 appends the chart-selection part
      "functionGraphSelection@1"]);   // 21A.2 appends the function-graph selection part
    expect(model.isSupportedCompositeChild("compound", 1)).toBe(false);
    expect(model.isSupportedCompositeChild("composite", 1)).toBe(false);
    expect(model.isSupportedCompositeChild("coding", 4)).toBe(false);
    expect(model.isSupportedCompositeChild("coding", undefined)).toBe(true);           // absent = the canonical V1 of the family (catalog authority)
  });
});

describe("20D-2 the four acceptance fixtures are valid and finalizable", () => {
  for (const [name, f] of Object.entries(FIXTURES)) it("fixture " + name + ": no structural error, finalization allowed", () => {
    expect(errors(f())).toEqual([]);
    expect(evaluateExamFinalization(f()).canFinalize).toBe(true);
    expect(model.validateCompositeQuestion(qOf(f()) as never).filter(i => i.severity === "error")).toEqual([]);
  });
  it("legacy compound detection never claims a composite (children live under the type-owned root)", () => {
    for (const f of Object.values(FIXTURES)) { expect(serverIsCompound(qOf(f()))).toBe(false); expect("parts" in qOf(f())).toBe(false); }
  });
});

describe("20D-3 strict contract — every violation blocks finalization (fail closed, never repaired)", () => {
  const cases: [string, (q: Q) => void, string][] = [
    ["unknown root key", q => { (q.composite as Record<string, unknown>).script = "x"; }, "COMPOSITE_UNKNOWN_KEY"],
    ["schema v2", q => { (q.composite as { v: number }).v = 2; }, "COMPOSITE_SCHEMA_UNSUPPORTED"],
    ["missing composite root", q => { delete (q as Partial<Q>).composite; }, "COMPOSITE_MISSING"],
    ["question version 2", q => { q.questionTypeVersion = 2; }, "UNSUPPORTED_QUESTION_TYPE_VERSION"],
    ["question-level answer key", q => { q.answer = { correct: 1 }; }, "COMPOSITE_ANSWER_KEY_FORBIDDEN"],
    ["legacy parts on a composite", q => { (q as Record<string, unknown>).parts = [{ id: "x", type: "trueFalse" }]; }, "COMPOSITE_UNKNOWN_KEY"],
    ["unknown group key", q => { q.composite.groups[0].weight = 2; }, "COMPOSITE_UNKNOWN_KEY"],
    ["unknown part key", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[0].grader = "x"; }, "COMPOSITE_UNKNOWN_KEY"],
    ["foreign type config on a part", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[0].coding = { allowedLanguages: ["python"] }; }, "COMPOSITE_CHILD_CONFIG_FOREIGN"],
    ["executable field on a part", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[0].script = "alert(1)"; }, "COMPOSITE_UNKNOWN_KEY"],
    ["duplicate part id", q => { (q.composite.groups[1].parts as Record<string, unknown>[])[0].id = "pA1"; }, "COMPOSITE_ID_DUPLICATE"],
    ["group id equals a part id", q => { q.composite.groups[2].id = "pA1"; }, "COMPOSITE_ID_DUPLICATE"],
    ["prototype-sensitive id", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[0].id = "constructor"; }, "COMPOSITE_ID_INVALID"],
    ["__proto__ id", q => { q.composite.groups[0].id = "__proto__"; }, "COMPOSITE_ID_INVALID"],
    ["id with separator", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[0].id = "a::part::b"; }, "COMPOSITE_ID_INVALID"],
    ["nested compound child", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[0] = { id: "n1", type: "compound", text: "x", marks: 2, parts: [] }; }, "COMPOSITE_CHILD_TYPE_REFUSED"],
    ["nested composite child", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[0] = { id: "n1", type: "composite", text: "x", marks: 2 }; }, "COMPOSITE_CHILD_TYPE_REFUSED"],
    ["unknown child type", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[0].type = "essay"; }, "COMPOSITE_CHILD_TYPE_UNSUPPORTED"],
    ["unsupported child version", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[3].questionTypeVersion = 2; }, "COMPOSITE_CHILD_TYPE_UNSUPPORTED"],
    ["case-variant child type", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[0].type = "MultipleChoice"; }, "COMPOSITE_CHILD_TYPE_UNSUPPORTED"],
    ["dangling contextId", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[0].contextId = "nope"; }, "COMPOSITE_CONTEXT_REF_DANGLING"],
    ["unknown context kind", q => { q.composite.contexts[0].kind = "video"; }, "COMPOSITE_CONTEXT_INVALID"],
    ["future context version", q => { q.composite.contexts[0].version = 2; }, "COMPOSITE_CONTEXT_INVALID"],
    ["malformed source", q => { (q.composite.contexts[0].sources as Record<string, unknown>[])[0].answer = "leak"; }, "COMPOSITE_SOURCE_INVALID"],
    ["empty group", q => { q.composite.groups[2].parts = []; }, "COMPOSITE_GROUP_EMPTY"],
    ["no groups", q => { q.composite.groups = []; }, "COMPOSITE_GROUPS_EMPTY"],
    ["unknown group policy", q => { q.composite.groups[0].gradingPolicy = "capScore"; }, "COMPOSITE_GROUP_POLICY_INVALID"],
    ["all-group with a cap", q => { q.composite.groups[0].maxMarks = 5; }, "COMPOSITE_GROUP_POLICY_INVALID"],
    ["firstN without maxMarks", q => { q.composite.groups[1].maxMarks = null; }, "COMPOSITE_FIRSTN_INVALID"],
    ["firstN requiredAnswers 0", q => { q.composite.groups[1].requiredAnswers = 0; }, "COMPOSITE_FIRSTN_INVALID"],
    ["firstN requiredAnswers above parts", q => { q.composite.groups[1].requiredAnswers = 4; }, "COMPOSITE_FIRSTN_INVALID"],
    ["firstN unequal part marks", q => { (q.composite.groups[1].parts as Record<string, unknown>[])[0].marks = 3; }, "COMPOSITE_FIRSTN_INVALID"],
    ["firstN maxMarks ≠ N × marks", q => { q.composite.groups[1].maxMarks = 5; }, "COMPOSITE_FIRSTN_INVALID"],
    ["non-positive part marks", q => { (q.composite.groups[0].parts as Record<string, unknown>[])[0].marks = 0; }, "COMPOSITE_PART_MARKS_INVALID"],
    ["question marks ≠ Σ official group maxima", q => { q.marks = 21; }, "COMPOSITE_MARKS_MISMATCH"],
    ["too many groups", q => { q.composite.groups = Array.from({ length: 13 }, (_, i) => ({ ...clone(q.composite.groups[2]), id: "g" + i, parts: [{ ...clone((q.composite.groups[2].parts as unknown[])[0] as object), id: "p" + i }] })); }, "COMPOSITE_LIMIT"],
    ["unsafe composite question id", q => { q.examQuestionId = "q 4"; }, "COMPOSITE_QUESTION_ID_INVALID"],
    ["question id containing the child separator", q => { q.examQuestionId = "q::part::x"; }, "COMPOSITE_QUESTION_ID_INVALID"]
  ];
  for (const [name, mut, code] of cases) it(name + " → " + code, () => expect(errors(withQ(mut))).toContain(code));

  it("a child body runs the SAME validator as a standalone question of its type (missing MCQ key, invalid inline cloze key)", () => {
    expect(errors(withQ(q => { delete ((q.composite.groups[0].parts as Record<string, unknown>[])[0] as Record<string, unknown>).answer; }))).toContain("MISSING_ANSWER");
    expect(errors(withQ(q => { (q.composite.groups[0].parts as Record<string, unknown>[])[3].answer = { scoring: "nope", blanks: {} }; })).some(c => c.startsWith("CLOZE_"))).toBe(true);
  });
  it("an exam containing a composite refuses any OTHER question id that contains the child separator (target-key ambiguity)", () => {
    const e = compositeArabicExam();
    e.sections[0].questions.push({ examQuestionId: "q4::part::pA1", presentationType: "trueFalse", text: "t", marks: 1, answer: { correct: true } } as BuilderQuestion);
    expect(errors(e)).toContain("COMPOSITE_TARGET_KEY_AMBIGUOUS");
  });
});

describe("20D-3b first-N violations in ISOLATION — each rule blocks on its own (mutation hardening: one violation, everything else consistent)", () => {
  const firstN = (e: StructuredExam) => validateStructuredExam(e).filter(i => i.severity === "error");
  const REQUIRED = /بين 1 وعدد البنود/;                                                       // the QUOTA message (not the maxMarks = N × m one)
  it("requiredAnswers above the part count blocks even when maxMarks and the question mark are consistent with it", () => {
    const issues = firstN(withQ(q => { const g = q.composite.groups[1]; g.requiredAnswers = 4; g.maxMarks = 8; q.marks = 24; }));
    expect(issues.map(i => i.code)).toEqual(["COMPOSITE_FIRSTN_INVALID"]);
    expect(issues[0].message).toMatch(REQUIRED);
  });
  it("requiredAnswers 0 is reported as an invalid quota (not only as a maxMarks mismatch)", () => {
    const issues = firstN(withQ(q => { q.composite.groups[1].requiredAnswers = 0; }));
    expect(issues.map(i => i.code)).toEqual(["COMPOSITE_FIRSTN_INVALID"]);
    expect(issues[0].message).toMatch(REQUIRED);
  });
  it("a non-numeric maxMarks (\"4\") blocks — it is never coerced into an explicit maximum", () => {
    expect(errors(withQ(q => { (q.composite.groups[1] as Record<string, unknown>).maxMarks = "4"; }))).toContain("COMPOSITE_FIRSTN_INVALID");
  });
  it("unequal part marks block even when maxMarks = N × the FIRST part's mark", () => {
    const issues = firstN(withQ(q => { (q.composite.groups[1].parts as Record<string, unknown>[])[1].marks = 3; }));
    expect(issues.map(i => i.code)).toEqual(["COMPOSITE_FIRSTN_INVALID"]);
    expect(issues[0].message).toMatch(/علامات متساوية/);
  });
});

describe("20D-4 shared SmartSim context rules", () => {
  const sim = (q: Q) => q.composite.groups[0].parts as Record<string, unknown>[];
  it("a linked SmartSim part reads ONLY the context envelope and carries ONLY its private checks", () => {
    expect(errors(withQ(q => { sim(q)[0].smartSim = clone(q.composite.contexts[0].smartSim); }, compositePhysicsExam))).toContain("COMPOSITE_SMARTSIM_LINKED_ENVELOPE");
    expect(errors(withQ(q => { sim(q)[0].answer = { checks: [{ id: "x", label: "x", weight: 1, kind: "net.nope" }] }; }, compositePhysicsExam))).toContain("COMPOSITE_SMARTSIM_KEY_INVALID");
    expect(errors(withQ(q => { delete sim(q)[0].contextId; }, compositePhysicsExam))).toContain("COMPOSITE_SMARTSIM_CONTEXT_REQUIRED");
  });
  it("a SmartSim part may only link a SmartSim context; a malformed context envelope blocks", () => {
    const e = compositePhysicsExam(); const q = qOf(e);
    q.composite.contexts.push({ id: "ctxSrc", version: 1, kind: "source", sources: [{ id: "t", version: 1, kind: "text", text: "x" }] });
    sim(q)[0].contextId = "ctxSrc";
    expect(errors(e)).toContain("COMPOSITE_CONTEXT_REF_KIND");
    expect(errors(withQ(q => { (q.composite.contexts[0].smartSim as Record<string, unknown>).pluginVersion = 9; }, compositePhysicsExam))).toContain("COMPOSITE_SMARTSIM_CONTEXT_INVALID");
  });
  it("shared-context SmartSim parts are prohibited in firstNAnswered groups (documented v1 policy A)", () => {
    expect(errors(withQ(q => { const g = q.composite.groups[0]; g.gradingPolicy = "firstNAnswered"; g.requiredAnswers = 1; g.maxMarks = 3; (g.parts as Record<string, unknown>[]).forEach(p => { p.marks = 3; }); q.marks = 9; }, compositePhysicsExam))).toContain("COMPOSITE_FIRSTN_SHARED_SMARTSIM");
  });
});

describe("20D-5 structural marks — answer-independent, client / builder / server parity", () => {
  it("official max = Σ all-group part marks + Σ firstN group maxima; equals question marks for every fixture", () => {
    for (const [f, max] of [[compositeArabicExam, 20], [compositePhysicsExam, 18], [compositeCsExam, 18], [compositeNetworkExam, 14]] as const) {
      const q = qOf(f());
      expect(model.compositeOfficialMaxMarks(q as never)).toBe(max);
      expect(clientQuestionMaxMarks(q as never)).toBe(max);
      expect(builderQuestionMaxMarks(q)).toBe(max);
      expect(serverQuestionMaxMarks(q)).toBe(max);
      expect(computeTotalMarks(f())).toBe(max);
      expect(examOfficialStats(f()).totalMarks).toBe(max);
    }
  });
  it("a malformed composite contributes its stored marks (never a guessed structural total)", () => {
    const q = qOf(withQ(q => { (q.composite as { v: number }).v = 9; }));
    expect(model.compositeOfficialMaxMarks(q as never)).toBeUndefined();
    expect(serverQuestionMaxMarks(q)).toBe(20); expect(clientQuestionMaxMarks(q as never)).toBe(20);
  });
});

describe("20D-6 answers — the containing authority only", () => {
  it("answered ⇔ some part or some context answered; child shapes are the existing Answer kinds", () => {
    expect(answered({ kind: "composite", parts: {}, contexts: {} } as never)).toBe(false);
    expect(answered({ kind: "composite", parts: { pA1: { kind: "choice", index: 0 } }, contexts: {} } as never)).toBe(true);
    expect(answered({ kind: "composite", parts: {}, contexts: { ctxSim: { kind: "smartSim", pluginKey: "physicsFreeFall", pluginVersion: 1, actions: [{ type: "measurement.clear", measurementId: "impactTime" }], state: null } } } as never)).toBe(true);
    expect(answered({ kind: "composite", parts: { pA1: { kind: "text", value: "  " } }, contexts: {} } as never)).toBe(false);
  });
  it("the shared model's isCompositeAnswerAnswered (the SERVER authority, compiled into the shared build) agrees with the client for every shape", () => {
    const sim = { kind: "smartSim", pluginKey: "physicsFreeFall", pluginVersion: 1, actions: [{ type: "measurement.set", measurementId: "impactTime", value: 2 }], state: null };
    const samples: [unknown, boolean][] = [
      [{ kind: "composite", parts: {}, contexts: {} }, false],
      [{ kind: "composite", parts: {}, contexts: { ctxSim: sim } }, true],                       // a context-only answer IS an answer
      [{ kind: "composite", parts: { pA1: { kind: "choice", index: 0 } }, contexts: {} }, true],
      [{ kind: "composite", parts: { pA1: { kind: "text", value: "  " } }, contexts: {} }, false],
      [{ kind: "choice", index: 0 }, false]
    ];
    for (const [a, want] of samples) { expect(model.isCompositeAnswerAnswered(a), JSON.stringify(a)).toBe(want); if (want) expect(answered(a as never)).toBe(true); }
  });
  it("child target identity: <questionId>::part::<partId>, parsed unambiguously, bounded", () => {
    expect(model.compositeChildKey("q4", "pA1")).toBe("q4::part::pA1");
    expect(model.parseCompositeChildKey("core::q1::part::p2")).toEqual({ questionId: "core::q1", partId: "p2" });
    expect(model.parseCompositeChildKey("q4")).toBeNull();
    expect(model.parseCompositeChildKey("q4::part::")).toBeNull();
    expect(model.parseCompositeChildKey("q4::part::a b")).toBeNull();
  });
  it("first-N selection: answered eligible parts in display order; extra answers kept but ignored", () => {
    const q = qOf(compositeArabicExam());
    const sel = model.selectCompositeCountedParts(q as never, { kind: "composite", parts: { pB2: { kind: "fields", values: { x1: "c1" } }, pB3: { kind: "numeric", value: "70" }, pB1: { kind: "fields", values: { t1: "k1" } } }, contexts: {} });
    expect(sel.get("pB1")).toEqual({ counted: true, answered: true, ignored: false });
    expect(sel.get("pB2")).toEqual({ counted: true, answered: true, ignored: false });
    expect(sel.get("pB3")).toEqual({ counted: false, answered: true, ignored: true });
    expect(sel.get("pA1")).toEqual({ counted: true, answered: false, ignored: false });
  });
});

describe("20D-7 copy / duplicate — fresh internal identities, references remapped, semantics preserved", () => {
  const ids = (q: Q) => [...q.composite.contexts.map(c => c.id), ...q.composite.groups.map(g => g.id), ...q.composite.groups.flatMap(g => (g.parts as { id: string }[]).map(p => p.id))] as string[];
  it("cloneQuestionWithNewIds: every group / part / context id is fresh and unique; contextId references follow; versions + keys preserved", () => {
    for (const f of [compositePhysicsExam, compositeArabicExam]) {
      const q = qOf(f()), c = cloneQuestionWithNewIds(q) as Q;
      expect(c.examQuestionId).not.toBe(q.examQuestionId);
      const before = ids(q), after = ids(c);
      expect(new Set(after).size).toBe(after.length);
      expect(after.some(id => before.includes(id))).toBe(false);
      const ctxIds = new Set(c.composite.contexts.map(x => x.id));
      for (const p of c.composite.groups.flatMap(g => g.parts as Record<string, unknown>[])) if (p.contextId !== undefined) expect(ctxIds.has(p.contextId as string)).toBe(true);
      const strip = (x: Q) => JSON.stringify(x.composite.groups.map(g => (g.parts as Record<string, unknown>[]).map(p => [p.type, p.questionTypeVersion, p.marks, p.answer])));
      expect(strip(c)).toBe(strip(q));
      expect(errors({ ...f(), sections: [{ ...f().sections[0], questions: [c] }] } as StructuredExam)).toEqual([]);
    }
  });
  it("duplicateQuestion and structuredExamCopy never leave a stale reference to the original composite", () => {
    const e = compositePhysicsExam();
    const sections = duplicateQuestion(e.sections, "s1", "phys1");
    const [a, b] = sections[0].questions as Q[];
    expect(ids(a).some(id => ids(b).includes(id))).toBe(false);
    expect(errors({ ...e, sections })).toEqual([]);
    const copy = structuredExamCopy(compositeNetworkExam());
    expect(errors(copy)).toEqual([]);
    expect(ids(qOf(copy)).some(id => ids(qOf(compositeNetworkExam())).includes(id))).toBe(false);
  });
});
