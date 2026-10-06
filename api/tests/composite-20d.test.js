import { describe, it, expect, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { gradeExam, gradeQuestion } from "../src/lib/assignment-grading.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { examOfficialStats } from "../src/lib/exam-structure.js";
import { rebuildAttemptGrades } from "../src/lib/attempt-grade-rebuild.js";
import { hydrateBankAssets, normalizeBankAssetsForStorage } from "../src/lib/bank-asset-hydrate.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";
import { compositeArabicExam, compositePhysicsExam, compositeCsExam, compositeNetworkExam, ARABIC_PASSAGE } from "../../src/composite/compositeFixtures";

// Phase 20D — composite@1 on the SERVER (the official authority). Fail-first on caac213: a composite question is an unknown type there
// (graded 0 + manual review as a whole, its children never graded), its private child keys are only deny-listed (never rebuilt), its answer
// is stored unbound, and no review / override path knows a composite part.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const clone = x => JSON.parse(JSON.stringify(x));
const qOf = e => e.sections[0].questions[0];
const g = (r, id) => r.questions.find(x => x.questionId === id);
const part = (r, id, pid) => g(r, id).parts.find(p => p.partId === pid);
const GEN = { parametric: { assignmentId: "asg-20d", studentId: "stu-20d", attemptNumber: 1 } };
const fields = values => ({ kind: "fields", values });
const comp = (parts, contexts = {}) => ({ kind: "composite", parts, contexts });
const FF = (actions, state = null) => ({ kind: "smartSim", pluginKey: "physicsFreeFall", pluginVersion: 1, actions, state });
const GOOD_FF = [{ type: "measurement.set", measurementId: "impactTime", value: 2.02 }, { type: "measurement.set", measurementId: "impactSpeed", value: 19.8 }, { type: "measurement.set", measurementId: "heightAt1s", value: 15.1 }, { type: "graphPoint.set", pointId: "pointAt1s", t: 1, y: 15.1 }];
const ARABIC_ANSWER = () => comp({
  pA1: { kind: "choice", index: 0 }, pA2: fields({ r1: true, r2: false, r3: false }), pA3: fields({ m1: "نقلّل", m2: "عذب" }), pA4: fields({ b1: "الحياة", b2: "o2" }),
  pB1: fields({ t1: "k1", t2: "k1" }), pB2: fields({ x1: "c1", x2: "c2" }), pB3: { kind: "numeric", value: "70" }, pC1: { kind: "text", value: "نغلق الصنبور ونعيد الاستخدام." }
});

describe("20D-S1 official grading of a composite (ordinary children, first-N, manual review, part evidence)", () => {
  it("fixture A: every child graded by its OWN grader; first-N counts the first 2 answered parts in display order; the excess part is kept but scores 0", () => {
    const r = gradeExam(compositeArabicExam(), { q4: ARABIC_ANSWER() });
    const q = g(r, "q4");
    expect({ score: q.score, maxMarks: q.maxMarks, countedMaxMarks: q.countedMaxMarks, correct: q.correct, manualReview: q.manualReview }).toEqual({ score: 11, maxMarks: 20, countedMaxMarks: 20, correct: false, manualReview: true });
    expect([r.score, r.totalMarks, r.manualReviewMarks, r.finalized]).toEqual([11, 20, 6, false]);
    expect(q.parts.map(p => [p.partId, p.groupId, p.type, p.score, p.maxMarks, p.countedMaxMarks, p.correct, p.manualReview, p.ignored])).toEqual([
      ["pA1", "gA", "multipleChoice", 2, 2, 2, true, false, false], ["pA2", "gA", "multiTrueFalse", 2, 3, 3, false, false, false],
      ["pA3", "gA", "matching", 1, 2, 2, false, false, false], ["pA4", "gA", "inlineCloze", 3, 3, 3, true, false, false],
      ["pB1", "gB", "categorization", 1, 2, 2, false, false, false], ["pB2", "gB", "matrix", 2, 2, 2, true, false, false],
      ["pB3", "gB", "numericResponse", 0, 2, 0, false, false, true], ["pC1", "gC", "openResponse", 0, 6, 6, false, true, false]]);
    expect(part(r, "q4", "pA1").label).toBe("أ");
  });
  it("each child grade equals the grade of the SAME node as a standalone question (one implementation per type, no duplicate graders)", () => {
    const r = gradeExam(compositeArabicExam(), { q4: ARABIC_ANSWER() });
    for (const p of qOf(compositeArabicExam()).composite.groups.flatMap(x => x.parts).filter(p => p.id !== "pB3")) {
      const standalone = gradeQuestion({ ...p, presentationType: p.type, examQuestionId: p.id }, ARABIC_ANSWER().parts[p.id]);
      expect(part(r, "q4", p.id).score, p.id).toBe(Number(standalone.score.toFixed(2)));
    }
  });
  it("no answer at all: 0; pending marks are exactly what each child's OWN grader leaves for review (open response 6 + the legacy field children 3 + 2, as standalone); an unanswered firstN group counts nothing", () => {
    const r = gradeExam(compositeArabicExam(), {});
    expect([r.score, r.totalMarks, r.manualReviewMarks]).toEqual([0, 20, 11]);
    for (const pid of ["pA2", "pA3"]) expect(part(r, "q4", pid).manualReview).toBe(gradeQuestion({ ...qOf(compositeArabicExam()).composite.groups[0].parts.find(p => p.id === pid), presentationType: pid === "pA2" ? "multiTrueFalse" : "matching" }, undefined).manualReview);
    expect(["pB1", "pB2", "pB3"].map(pid => part(r, "q4", pid).countedMaxMarks)).toEqual([0, 0, 0]);
    expect(part(r, "q4", "pB1").ignored).toBe(false);
  });
  it("an unsupported child version (bypassing finalization) fails closed for THAT part only; a malformed composite fails closed as a whole", () => {
    const e = compositeArabicExam(); qOf(e).composite.groups[0].parts[3].questionTypeVersion = 2;
    const r = gradeExam(e, { q4: ARABIC_ANSWER() });
    expect(part(r, "q4", "pA4")).toMatchObject({ score: 0, manualReview: true });
    expect(part(r, "q4", "pA1").score).toBe(2);
    expect(r.manualReviewMarks).toBe(9);
    const bad = compositeArabicExam(); qOf(bad).composite.v = 2;
    expect(g(gradeExam(bad, { q4: ARABIC_ANSWER() }), "q4")).toMatchObject({ score: 0, maxMarks: 20, manualReview: true });
    const nested = compositeArabicExam(); qOf(nested).composite.groups[0].parts[0] = { id: "pA1", type: "composite", marks: 2, text: "x" };
    expect(g(gradeExam(nested, { q4: ARABIC_ANSWER() }), "q4")).toMatchObject({ score: 0, manualReview: true });
    expect(g(gradeExam(compositeArabicExam(), { q4: { kind: "compound", parts: { pA1: { kind: "choice", index: 0 } } } }), "q4").score).toBe(0);
  });
  it("structural max is answer-independent and equals gradeExam's total for every fixture", () => {
    for (const f of [compositeArabicExam, compositePhysicsExam, compositeCsExam, compositeNetworkExam]) expect(gradeExam(f(), {}).totalMarks).toBe(examOfficialStats(f()).totalMarks);
  });
  it("the composite inside a firstNAnswered question-unit SECTION: an excess composite is ignored whole (its parts too)", () => {
    const e = compositeArabicExam(); const extra = clone(qOf(e)); extra.examQuestionId = "q5";
    e.sections[0] = { ...e.sections[0], gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 20, questions: [qOf(e), extra] };
    const r = gradeExam(e, { q4: ARABIC_ANSWER(), q5: ARABIC_ANSWER() });
    expect(g(r, "q5")).toMatchObject({ score: 0, countedMaxMarks: 0, ignored: true });
    expect(g(r, "q5").parts.every(p => p.countedMaxMarks === 0 && p.score === 0)).toBe(true);
    expect(r.manualReviewMarks).toBe(6);
  });
});

describe("20D-S2 shared SmartSim context: ONE replay, several independently scored parts", () => {
  it("fixture B: linked parts read the SAME server-replayed state with their OWN private checks and marks", () => {
    const r = gradeExam(compositePhysicsExam(), { phys1: comp({ n1: { kind: "numeric", value: "9.8" }, o1: { kind: "text", value: "لأن التسارع ثابت." } }, { ctxSim: FF(GOOD_FF) }) });
    expect(g(r, "phys1").parts.map(p => [p.partId, p.score, p.correct, p.manualReview])).toEqual([["s1", 3, true, false], ["s2", 3, true, false], ["s3", 2, true, false], ["s4", 0, false, false], ["s5", 2, true, false], ["n1", 2, true, false], ["o1", 0, false, true]]);
    expect([r.score, r.manualReviewMarks]).toEqual([12, 4]);
  });
  it("a forged context state / client score / check result is never authority (the actions are replayed)", () => {
    const forged = { ...FF([], { v: 1, measurements: { impactTime: 2.02, impactSpeed: 19.8 }, points: {} }), score: 18, checks: [{ passed: true }] };
    const r = gradeExam(compositePhysicsExam(), { phys1: comp({ s1: FF(GOOD_FF), s2: { kind: "numeric", value: "1" } }, { ctxSim: forged }) });
    expect(g(r, "phys1").parts.filter(p => p.type === "smartSim").every(p => p.score === 0)).toBe(true);
  });
  it("the shared context is replayed ONCE per grading however many parts link it (counting plugin in the server registry)", () => {
    const reg = require_("../src/lib/shared-finalization/trustedSimRegistry.js");
    let runtimes = 0;
    const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
    const plugin = {
      key: "countingSim20d", version: 1, label: "عداد 20D", maxActions: 20, checkKinds: ["count.equals"],
      descriptor: { descriptorVersion: 1, key: "countingSim20d", version: 1, label: "عداد 20D", domain: "general", sceneKinds: ["2d"], rendererFamilies: ["custom"], capabilities: ["scene.2d", "value.set"], actionKinds: ["inc"], checkKinds: ["count.equals"], genericRules: [], assetKinds: [], tools: ["select"], accessibility: ["keyboardAlternative"], supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: false } },
      validateConfig: raw => (isObj(raw) && raw.v === 1 && Object.keys(raw).length === 1 ? { ok: true, config: { v: 1 } } : { ok: false, issues: [{ code: "X", message: "x" }] }),
      createRuntime: () => { runtimes++; return { n: 0 }; }, normalizeAction: raw => (isObj(raw) && raw.type === "inc" ? { ok: true, action: { type: "inc" } } : { ok: false, code: "X" }),
      applyAction: rt => ({ n: rt.n + 1 }), canonicalState: rt => ({ n: rt.n }), serializeState: s => JSON.stringify(s),
      validateCheck: raw => (Number.isInteger(raw.value) ? { ok: true, check: { id: raw.id, label: raw.label, weight: raw.weight, kind: raw.kind, value: raw.value } } : { ok: false, issues: [{ code: "Y", message: "y" }] }),
      evaluateCheck: (c, s) => ({ expected: String(c.value), actual: String(s.n), passed: s.n === c.value })
    };
    const off = reg.registerSmartSimPlugin(plugin);
    try {
      const p = (id, value) => ({ id, type: "smartSim", questionTypeVersion: 1, contextId: "ctx", text: id, marks: 1, answer: { checks: [{ id: "c", label: "c", weight: 1, kind: "count.equals", value }] } });
      const q = { examQuestionId: "cq", presentationType: "composite", questionTypeVersion: 1, text: "x", marks: 4, composite: { v: 1, contexts: [{ id: "ctx", version: 1, kind: "smartSim", smartSim: { schemaVersion: 1, pluginKey: "countingSim20d", pluginVersion: 1, config: { v: 1 } } }], groups: [{ id: "g", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [p("a", 2), p("b", 1), p("c", 2), p("d", 3)] }] } };
      runtimes = 0;
      const r = gradeExam({ sections: [{ id: "s", title: "s", gradingPolicy: "all", questions: [q] }] }, { cq: comp({}, { ctx: { kind: "smartSim", pluginKey: "countingSim20d", pluginVersion: 1, actions: [{ type: "inc" }, { type: "inc" }], state: null } }) });
      expect(g(r, "cq").parts.map(x => x.score)).toEqual([1, 0, 1, 0]);
      expect(runtimes).toBe(1);
    } finally { off(); }
  });
  it("fixture D: one networkTopology@2 replay serves four parts; the untouched topology earns nothing", () => {
    const r0 = gradeExam(compositeNetworkExam(), {});
    expect(g(r0, "net1").parts.filter(p => p.type === "smartSim").every(p => p.score === 0)).toBe(true);
    const cmd = (deviceId, ...c) => c.map(command => ({ type: (deviceId === "r1" ? "router" : "switch") + ".command", deviceId, command }));
    const actions = [...cmd("sw1", "enable", "configure terminal", "vlan 10", "vlan 20", "interface g0/1", "switchport mode trunk", "end")];
    const r = gradeExam(compositeNetworkExam(), { net1: comp({ m1: { kind: "choice", index: 0 } }, { ctxNet: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions, state: null } }) });
    expect(g(r, "net1").parts.map(p => [p.partId, p.score])).toEqual([["k1", 3], ["k2", 2], ["k3", 0], ["k4", 0], ["m1", 4]]);
  });
});

describe("20D-S3 parametric child identity — server-owned <questionId>::part::<partId>", () => {
  const PARA = id => ({ id, type: "parametricNumeric", questionTypeVersion: 1, text: "احسب ناتج ضرب {{a}} في {{b}}.", marks: 4, parametric: { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 2, max: 97, step: 1 }, { id: "b", kind: "int", min: 100, max: 997, step: 1 }], constraints: ["a < b"], response: { unit: "none" } }, answer: { expression: "a * b", mode: "tolerance", tolerance: 0 } });
  const q = () => ({ examQuestionId: "pq", presentationType: "composite", questionTypeVersion: 1, text: "x", marks: 8, composite: { v: 1, contexts: [], groups: [{ id: "g", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [PARA("pP"), PARA("pQ")] }] } });
  const exam = () => ({ sections: [{ id: "s", title: "s", gradingPolicy: "all", questions: [q()] }] });
  const delivered = gen => sanitizeExamForStudent(exam(), { parametric: gen }).sections[0].questions[0].composite.groups[0].parts;
  const { parametricReviewInstance } = require_("../src/lib/shared-finalization/parametricNumericQuestion.js");
  it("projection, official grading and review regenerate the SAME instance from the child key; different parts / attempts differ", () => {
    const [p, qq] = delivered(GEN.parametric);
    expect(p.parametric.status).toBe("ready");
    const product = p.parametric.values.a * p.parametric.values.b;
    const inst = parametricReviewInstance({ ...PARA("pP"), presentationType: "parametricNumeric" }, { ...GEN.parametric, questionKey: "pq::part::pP" });
    expect(inst.ok).toBe(true); expect(inst.expected).toBe(product); expect(inst.text).toBe(p.text);
    const r = gradeExam(exam(), { pq: comp({ pP: { kind: "numeric", value: String(product) }, pQ: { kind: "numeric", value: String(product) } }) }, GEN);
    expect(part(r, "pq", "pP")).toMatchObject({ score: 4, correct: true });
    expect(JSON.stringify(qq.parametric.values)).not.toBe(JSON.stringify(p.parametric.values));
    expect(part(r, "pq", "pQ").score).toBe(0);
    const other = delivered({ ...GEN.parametric, attemptNumber: 2 })[0];
    expect(JSON.stringify(other.parametric.values)).not.toBe(JSON.stringify(p.parametric.values));
  });
  it("no server identity ⇒ the child is UNAVAILABLE and fails closed to manual review (never a guessed instance); the private expression never leaks", () => {
    const parts = sanitizeExamForStudent(exam()).sections[0].questions[0].composite.groups[0].parts;
    expect(parts[0].parametric).toEqual({ v: 1, status: "unavailable" });
    expect(JSON.stringify(sanitizeExamForStudent(exam(), { parametric: GEN.parametric }))).not.toMatch(/a \* b|"expression"|"constraints"|"variables"/);
    expect(part(gradeExam(exam(), { pq: comp({ pP: { kind: "numeric", value: "1" } }) }), "pq", "pP")).toMatchObject({ score: 0, manualReview: true });
  });
  it("standalone parametric questions keep their exact instance (questionKey = the question id, unchanged)", () => {
    const sq = { examQuestionId: "pS", ...PARA("x"), presentationType: "parametricNumeric" }; delete sq.id;
    const ex = { sections: [{ id: "s", title: "s", gradingPolicy: "all", questions: [sq] }] };
    const d = sanitizeExamForStudent(ex, { parametric: GEN.parametric }).sections[0].questions[0];
    const inst = parametricReviewInstance(sq, { ...GEN.parametric, questionKey: "pS" });
    expect(d.parametric.values.a * d.parametric.values.b).toBe(inst.expected);
  });
});

describe("20D-S4 student projection — strict, rebuilt, no secret authority", () => {
  const SECRET = /PRIVATE-GUIDANCE-20D|MODEL-ANSWER-20D|REFERENCE-SOLUTION-20D|HIDDEN-TITLE-20D|SUM=10|"correct"|"correctOptionIndex"|"correctOptionId"|"accepted"|"hiddenTests"|"checks"|"tolerance"|"guidance"|"modelAnswer"|"rubric"|"correctColumnByRow"|"correctCategoryByItem"|"expected"|"answer":\{"|"impact-time"/;
  it("fixtures A–D: no answer key, check, hidden test, rubric guidance, model answer or teacher data anywhere in the delivered copy", () => {
    for (const f of [compositeArabicExam, compositePhysicsExam, compositeCsExam, compositeNetworkExam]) {
      const e = f(); const p = qOf(e).composite.groups[0].parts[0]; p.assessmentMeta = { bloom: "BLOOM-CANARY-20D" };
      const delivered = sanitizeExamForStudent(e, { parametric: GEN.parametric });
      expect(qOf(delivered).composite.groups, e.examId).toBeTruthy();                                // projected, not withheld
      const out = JSON.stringify(delivered);
      expect(out, e.examId).not.toMatch(SECRET);
      expect(out).not.toContain("BLOOM-CANARY-20D");
      const t = f(); qOf(t).composite.groups[0].parts[0].teacherNote = "TEACHER-NOTE-CANARY-20D";   // a non-contract field ⇒ the whole composite is withheld
      expect(qOf(sanitizeExamForStudent(t)).composite).toEqual({ v: 1, status: "unavailable" });
    }
  });
  it("shared static sources and the shared SmartSim envelope are projected ONCE on the context; linked SmartSim parts carry no envelope", () => {
    const a = sanitizeExamForStudent(compositeArabicExam()).sections[0].questions[0].composite;
    expect(a.contexts).toEqual([{ id: "ctxText", version: 1, kind: "source", title: "النص", sources: [{ id: "src1", version: 1, kind: "text", title: "الماء", text: ARABIC_PASSAGE }] }]);
    const b = sanitizeExamForStudent(compositePhysicsExam()).sections[0].questions[0].composite;
    expect(b.contexts[0].smartSim).toEqual({ schemaVersion: 1, pluginKey: "physicsFreeFall", pluginVersion: 1, config: qOf(compositePhysicsExam()).composite.contexts[0].smartSim.config });
    expect(b.groups[0].parts[0]).toEqual({ id: "s1", label: "أ", type: "smartSim", questionTypeVersion: 1, text: "زمن الوصول إلى الأرض", marks: 3, contextId: "ctxSim" });
    expect(b.groups[0]).toMatchObject({ id: "gSim", title: "القياس بالمحاكاة", gradingPolicy: "all" });
    const c = sanitizeExamForStudent(compositeCsExam()).sections[0].questions[0].composite;
    const coding = c.groups[1].parts[0].coding;
    expect(coding.publicTests).toEqual([{ id: "pub-1", input: "2 3\n", sampleOutput: "SUM=5\n" }]);
    expect(c.groups[1].parts[1].openResponse).toEqual({ v: 1, profile: "explain", instructions: "", response: { minChars: 0, maxChars: 600 }, studentRubricVisibility: "hidden" });
  });
  it("a visible child rubric arrives only as its public projection; a malformed composite is withheld as UNAVAILABLE (never spread)", () => {
    const a = sanitizeExamForStudent(compositeArabicExam()).sections[0].questions[0].composite;
    expect(a.groups[2].parts[0].openResponse.publicRubric.criteria.map(c => c.title)).toEqual(["الأفكار", "التعليل"]);
    const bad = compositeArabicExam(); qOf(bad).composite.groups[0].parts[0].smuggled = { answer: 1 };
    expect(sanitizeExamForStudent(bad).sections[0].questions[0].composite).toEqual({ v: 1, status: "unavailable" });
    const bad2 = compositePhysicsExam(); qOf(bad2).composite.contexts[0].smartSim.config.extra = "x";
    expect(sanitizeExamForStudent(bad2).sections[0].questions[0].composite).toEqual({ v: 1, status: "unavailable" });
    expect(sanitizeExamForStudent(compositeArabicExam()).sections[0].questions[0].answer).toEqual({});
  });
  it("compound@1 parts keep the OLD part projection (sanitizePartForStudent unchanged: a SmartSim / parametric part stays withheld there)", () => {
    const { sanitizePartForStudent } = require_("../src/lib/student-exam-sanitize.js");
    const smart = qOf(compositePhysicsExam()).composite.groups[0].parts[0];
    expect(sanitizePartForStudent({ ...smart, smartSim: { schemaVersion: 1, pluginKey: "physicsFreeFall", pluginVersion: 1, config: {} } }).smartSim).toBeUndefined();
  });
});

describe("20D-S5 answer binding — every nested answer is bound to the PUBLISHED composite before storage / grading", () => {
  const E = compositeArabicExam;
  it("unknown part / context ids are removed (reported), extra keys dropped, child answers bound by their own type's binder", () => {
    const r = normalizeDraftAnswers({ q4: { kind: "composite", parts: { pA1: { kind: "choice", index: 1 }, zz: { kind: "choice", index: 0 }, pC1: { kind: "text", value: "نص", score: 6 } }, contexts: { nope: { kind: "smartSim" } }, score: 20 } }, E());
    expect(r.answers.q4).toEqual({ kind: "composite", parts: { pA1: { kind: "choice", index: 1 }, pC1: { kind: "text", value: "نص" } }, contexts: {} });
    expect(r.rejected).toEqual(expect.arrayContaining([{ id: "q4.zz", code: "COMPOSITE_PART_UNKNOWN" }, { id: "q4.nope", code: "COMPOSITE_CONTEXT_UNKNOWN" }]));
  });
  it("a child refused by its binder is dropped alone (over-long open response, wrong kind on inline cloze)", () => {
    const r = normalizeDraftAnswers({ q4: comp({ pC1: { kind: "text", value: "x".repeat(801) }, pA4: { kind: "choice", index: 0 }, pA1: { kind: "choice", index: 0 } }) }, E());
    expect(r.answers.q4.parts).toEqual({ pA1: { kind: "choice", index: 0 } });
    expect(r.rejected).toEqual(expect.arrayContaining([{ id: "q4.pC1", code: "OPEN_RESPONSE_ANSWER_TOO_LONG" }, { id: "q4.pA4", code: expect.stringMatching(/^CLOZE_/) }]));
  });
  it("the shared context answer is REPLAYED against the context envelope (derived state stored); a linked SmartSim part never carries its own answer", () => {
    const r = normalizeDraftAnswers({ phys1: comp({ s1: FF(GOOD_FF) }, { ctxSim: FF(GOOD_FF, { forged: true }) }) }, compositePhysicsExam());
    expect(r.answers.phys1.parts).toEqual({});
    expect(r.rejected).toEqual([{ id: "phys1.s1", code: "COMPOSITE_PART_ANSWER_FORBIDDEN" }]);
    expect(r.answers.phys1.contexts.ctxSim.state).toEqual({ v: 1, measurements: { impactTime: 2.02, impactSpeed: 19.8, heightAt1s: 15.1 }, points: { pointAt1s: { t: 1, y: 15.1 } } });
    const bad = normalizeDraftAnswers({ phys1: comp({}, { ctxSim: FF([{ type: "camera.pan" }]) }) }, compositePhysicsExam());
    expect(bad.answers.phys1.contexts).toEqual({}); expect(bad.rejected[0]).toMatchObject({ id: "phys1.ctxSim" });
  });
  it("a coding child binds only an allowed language; a non-composite answer on a composite question is refused; oversized answers refused", () => {
    const ok = normalizeDraftAnswers({ cs1: comp({ c1: F.code("print(1)\n") }) }, compositeCsExam());
    expect(ok.answers.cs1.parts.c1).toEqual(F.code("print(1)\n"));
    const lang = normalizeDraftAnswers({ cs1: comp({ c1: F.code("x", "ruby") }) }, compositeCsExam());
    expect(lang.answers.cs1.parts).toEqual({});
    expect(normalizeDraftAnswers({ q4: { kind: "choice", index: 0 } }, E())).toEqual({ answers: {}, rejected: [{ id: "q4", code: "COMPOSITE_ANSWER_INVALID" }] });
    const huge = normalizeDraftAnswers({ q4: comp({ pA1: { kind: "choice", index: 0 }, pC1: { kind: "text", value: "x".repeat(700) } }, Object.fromEntries(Array.from({ length: 200 }, (_, i) => ["c" + i, { kind: "smartSim", pluginKey: "x", pluginVersion: 1, actions: Array.from({ length: 500 }, () => ({ type: "y".repeat(40) })), state: null }]))) }, E());
    expect(huge.rejected).toEqual(expect.arrayContaining([{ id: "q4", code: "COMPOSITE_ANSWER_TOO_LARGE" }]));
    expect(huge.answers.q4).toBeUndefined();
  });
});

describe("20D-S6 bank media inside a composite (child images + image sources) — hydrated at delivery, durable in storage", () => {
  it("bank assets on a child image and on a source image are signed / normalized like top-level media", () => {
    vi.stubEnv("BUILDER_SESSION_SECRET", "test-only-signing-secret-20d");
    const e = compositeArabicExam();
    const asset = { id: "a1", origin: "bank", blobName: "bank/img-20d.png", contentType: "image/png" };
    qOf(e).composite.groups[0].parts[0].image = { exists: true, visible: true, assets: [clone(asset)] };
    qOf(e).composite.contexts.push({ id: "ctxImg", version: 1, kind: "source", sources: [{ id: "img1", version: 1, kind: "image", alt: "صورة", image: clone(asset) }] });
    const h = hydrateBankAssets(e);
    const hq = qOf(h);
    expect(hq.composite.groups[0].parts[0].image.assets[0].dataUrl).toMatch(/^\/api\/question-image\?blob=/);
    expect(hq.composite.contexts[1].sources[0].image.dataUrl).toMatch(/^\/api\/question-image\?blob=/);
    const n = normalizeBankAssetsForStorage(h);
    expect(qOf(n).composite.groups[0].parts[0].image.assets[0]).toEqual(asset);
    expect(qOf(n).composite.contexts[1].sources[0].image).toEqual(asset);
    vi.unstubAllEnvs();
  });
});

describe("20D-S7 end to end through the REAL handlers: autosave, submit, review, per-part overrides, rubric awards", () => {
  const submission = () => require_("../src/functions/student-submission.js");
  const studentAssignment = () => require_("../src/functions/student-assignment.js");
  const review = () => require_("../src/functions/assignment-review.js");
  const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
  const teacherAuth = () => ({ ok: true, user: { sub: "teacher-20d", role: "teacher" } });
  const assignment = e => F.assignment({ examSnapshot: { title: "exam", metadata: {}, presentationTheme: "classic", sections: e.sections }, totalMarks: examOfficialStats(e).totalMarks, questionCount: 1 });
  const deps = ctx => ({ container: ctx.container, requireStudentAuth: studentAuth, requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() });
  const obs = () => ({ logInfo() {}, logWarn() {}, logError() {} });
  const save = (ctx, overrides) => review().handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides, teacherFeedback: "" }), deps(ctx), obs());
  const reviewGet = ctx => review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", undefined, "GET"), deps(ctx));
  const attemptOf = ctx => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1);
  afterEach(() => { vi.unstubAllEnvs(); });

  it("delivery → saveDraft (bound + restorable) → submit → official composite grade with part evidence", async () => {
    const ctx = F.seed({ a: assignment(compositeArabicExam()) });
    const d = await studentAssignment().handler(F.studentRequest(undefined, "GET"), deps(ctx));
    expect(d.status).toBe(200);
    expect(JSON.stringify(d.jsonBody)).not.toMatch(/PRIVATE-GUIDANCE-20D|MODEL-ANSWER-20D|"correctOptionIndex"/);
    const draft = await submission().handler(F.studentRequest({ action: "saveDraft", answers: { q4: { ...comp({ pA1: { kind: "choice", index: 0 }, zz: { kind: "choice", index: 0 } }), score: 99 } }, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), deps(ctx), obs());
    expect(draft.status).toBe(200);
    expect(ctx.getJson(F.SUB).draftAnswers.q4).toEqual(comp({ pA1: { kind: "choice", index: 0 } }));
    const s = await submission().handler(F.studentRequest(F.submitBody({ q4: ARABIC_ANSWER() })), deps(ctx), obs());
    expect(s.status).toBe(200);
    const at = attemptOf(ctx);
    expect([at.score, at.totalMarks, at.manualReviewMarks, at.finalized]).toEqual([11, 20, 6, false]);
    expect(at.questionGrades[0].parts.find(p => p.partId === "pB3")).toMatchObject({ ignored: true, countedMaxMarks: 0 });
  });
  it("teacher grades ONE open-response child with its rubric (server-computed), overrides an ordinary part, and the parent / attempt rebuild", async () => {
    const ctx = F.seed({ a: assignment(compositeArabicExam()) });
    await submission().handler(F.studentRequest(F.submitBody({ q4: ARABIC_ANSWER() })), deps(ctx), obs());
    const rv = await reviewGet(ctx);
    const rq = rv.jsonBody.questions[0];
    expect(rq.compositeReview.parts.map(p => p.childKey)).toContain("q4::part::pC1");
    expect(rq.compositeReview.parts.find(p => p.partId === "pC1").expectedAnswer.rubric.criteria[0].guidance).toBe("PRIVATE-GUIDANCE-20D-A");
    const r1 = await save(ctx, { "q4::part::pC1": { rubricAwards: { ideas: { levelId: "two" }, reason: { levelId: "full" } }, score: 0, comment: "ممتاز" } });
    expect(r1.status).toBe(200);
    let at = attemptOf(ctx);
    expect(at.manualOverrides["q4::part::pC1"]).toMatchObject({ score: 6, comment: "ممتاز", rubric: { v: 1, awarded: 6, total: 6 } });
    expect([at.score, at.manualReviewMarks, at.finalized]).toEqual([17, 0, true]);
    const r2 = await save(ctx, { "q4::part::pA3": { score: 5, comment: "" } });
    expect(r2.status).toBe(200);
    at = attemptOf(ctx);
    expect(at.questionGrades[0].parts.find(p => p.partId === "pA3").score).toBe(2);             // clamped to the part's counted max
    expect(at.manualOverrides["q4::part::pA3"].score).toBe(2);                                    // and STORED clamped (never a raw client score)
    expect(at.score).toBe(18);
    const r3 = await save(ctx, { q4: { score: 15, comment: "parent" } });                        // the existing whole-question override still wins
    expect(r3.status).toBe(200); expect(attemptOf(ctx).score).toBe(15);
  });
  it("refusals write nothing: score-only rubric child, unknown part, ignored first-N part, malformed awards", async () => {
    const ctx = F.seed({ a: assignment(compositeArabicExam()) });
    await submission().handler(F.studentRequest(F.submitBody({ q4: ARABIC_ANSWER() })), deps(ctx), obs());
    const before = JSON.stringify(ctx.getJson(F.SUB));
    for (const [overrides, code] of [
      [{ "q4::part::pC1": { score: 6 } }, "RUBRIC_GRADE_REQUIRED"],
      [{ "q4::part::nope": { score: 1 } }, "COMPOSITE_PART_UNKNOWN"],
      [{ "q4::part::pB3": { score: 2 } }, "COMPOSITE_PART_IGNORED"],
      [{ "q4::part::pC1": { rubricAwards: { ideas: { levelId: "forged" }, reason: { levelId: "full" } } } }, "RUBRIC_AWARD_INVALID"]
    ]) {
      const r = await save(ctx, overrides);
      expect(r.status, JSON.stringify(overrides)).toBe(400);
      if (code !== "RUBRIC_AWARD_INVALID") expect(r.jsonBody.code).toBe(code); else expect(r.jsonBody.code).toMatch(/^RUBRIC_/);
    }
    expect(JSON.stringify(ctx.getJson(F.SUB))).toBe(before);
  });
  it("fixture B review: the shared context review details appear ONCE; each linked part shows only its own check facts", async () => {
    const ctx = F.seed({ a: assignment(compositePhysicsExam()) });
    await submission().handler(F.studentRequest(F.submitBody({ phys1: comp({ n1: { kind: "numeric", value: "9.8" } }, { ctxSim: FF(GOOD_FF) }) })), deps(ctx), obs());
    const rq = (await reviewGet(ctx)).jsonBody.questions[0];
    expect(rq.compositeReview.contexts).toHaveLength(1);
    expect(rq.compositeReview.contexts[0]).toMatchObject({ id: "ctxSim", kind: "smartSim" });
    expect(rq.compositeReview.contexts[0].review.state).toEqual({ v: 1, measurements: { impactTime: 2.02, impactSpeed: 19.8, heightAt1s: 15.1 }, points: { pointAt1s: { t: 1, y: 15.1 } } });
    const s1 = rq.compositeReview.parts.find(p => p.partId === "s1");
    expect(s1.smartSimReview.checks.map(c => c.id)).toEqual(["impact-time"]);
    expect(s1.smartSimReview.state).toBeUndefined();
  });
  it("rebuild parity: a stored composite grade rebuilt without overrides keeps the gradeExam totals", () => {
    const r = gradeExam(compositeArabicExam(), { q4: ARABIC_ANSWER() });
    const attempt = { questionGrades: clone(r.questions), sections: clone(r.sections), manualOverrides: {}, totalMarks: r.totalMarks, score: 0 };
    rebuildAttemptGrades(attempt);
    expect([attempt.score, attempt.manualReviewMarks, attempt.finalized]).toEqual([r.score, r.manualReviewMarks, r.finalized]);
  });
});

describe("20D-S8 shared build", () => {
  it("the composite authority is compiled into the shared server build", () => {
    expect(SHARED_ENTRIES).toContain("src/compositeQuestion.ts");
  });
});
