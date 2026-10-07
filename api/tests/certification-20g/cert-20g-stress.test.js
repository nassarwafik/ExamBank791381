import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { stressExam, STANDALONE_FAMILIES, CHILD_FAMILIES } from "./exams/S-stress.js";
import { publishAndAssign } from "./lifecycle.js";
import { ledgerOf, attemptInvariants } from "./ledger.js";
import { scanProjection } from "./scan.js";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";

// Phase 20G — STRESS certification. Size chosen BY MEASUREMENT (design record §stress): 8 sections × (30 rotating-family questions + one
// kitchen-sink composite + one kitchen-sink legacy compound) = 256 questions, ~206 KB exam JSON, ~183 KB student projection, ~66 KB of answers; every pipeline stage measured
// 13–40 ms locally and scales linearly from 62 to 496 questions. 256 is ~2.5× the largest realistic school exam (≤ 100 questions) and each
// kitchen-sink composite sits at the composite caps that matter (3 SmartSim contexts, one child of every supported child identity, a
// firstNAnswered group). Budgets are the measured baseline × a documented margin (≥ 40×) — they catch an algorithmic blow-up, never CI noise.
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("./platform.js");
const { examOfficialStats } = require_("../../src/lib/exam-structure.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const SIZE = { sections: 8, perSection: 30 };
const BUDGET_MS = 1500;
const timed = fn => { const t0 = performance.now(); const v = fn(); return [v, performance.now() - t0]; };

describe("20G stress fixture — authoring authorities at scale", () => {
  const { exam } = stressExam(SIZE);
  const qs = exam.sections.flatMap(s => s.questions);
  it("256 questions, unique ids everywhere (questions, composite parts within each composite), every family present; official total = Σ marks", () => {
    expect(qs.length).toBe(256);
    expect(new Set(qs.map(q => q.examQuestionId)).size).toBe(qs.length);
    for (const q of qs.filter(x => x.composite)) { const ids = q.composite.groups.flatMap(g => g.parts.map(p => p.id)); expect(new Set(ids).size).toBe(ids.length); }
    const fams = new Set(qs.map(q => q.presentationType === "coding" ? "coding@" + q.questionTypeVersion : q.presentationType === "smartSim" ? "smartSim:" + q.smartSim.pluginKey + "@" + q.smartSim.pluginVersion : q.presentationType));
    for (const f of STANDALONE_FAMILIES) expect(fams.has(f), f).toBe(true);
    const ks = qs.find(q => q.composite).composite;
    expect(ks.contexts.filter(c => c.kind === "smartSim")).toHaveLength(3);
    expect(ks.groups.flatMap(g => g.parts)).toHaveLength(CHILD_FAMILIES.length + 6);
    expect(examOfficialStats(exam).totalMarks).toBe(qs.reduce((n, q) => n + q.marks, 0));
  });
  it("finalization, export → import, canonical save and the student projection all stay within budget and stay exact", () => {
    const [fin, tFin] = timed(() => evaluateExamFinalization(exam));
    expect(fin.blockers.map(b => b.message)).toEqual([]);
    const [imp, tImp] = timed(() => parseStructuredExamJson(JSON.stringify(exam), "stress.json"));
    expect(imp.validationErrors.filter(i => i.severity === "error")).toEqual([]);
    expect(imp.exam.sections.flatMap(s => s.questions)).toEqual(qs);
    const [saved, tSave] = timed(() => toSavedStructuredExam(imp.exam));
    expect(saved.sections.flatMap(s => s.questions)).toEqual(qs);
    const [san, tSan] = timed(() => sanitizeExamForStudent(exam, { parametric: { assignmentId: "a", studentId: "s", attemptNumber: 1 } }));
    expect(scanProjection(san)).toEqual([]);
    for (const [stage, ms] of Object.entries({ tFin, tImp, tSave, tSan })) expect(ms, stage).toBeLessThan(BUDGET_MS);
  });
});

describe("20G stress fixture — full platform lifecycle at scale", () => {
  let p, aid, s, answers, expected, timings = {};
  beforeAll(async () => {
    ({ answers, expected } = stressExam(SIZE));
    p = createPlatform({ students: { "st-1": "طالب الضغط" } });
    let t0 = performance.now();
    aid = (await publishAndAssign(p, stressExam(SIZE).exam)).aid;
    timings.publish = performance.now() - t0;
    s = p.student("st-1");
    await s.start(aid);
    t0 = performance.now(); await s.deliver(aid); timings.deliver = performance.now() - t0;
    t0 = performance.now(); await s.draft(aid, answers); timings.draft = performance.now() - t0;
    t0 = performance.now(); await s.submit(aid, answers); timings.submit = performance.now() - t0;
  }, 120000);

  it("publish, delivery, autosave and submit each stay within budget (governance finalization + content hash on the full revision)", () => {
    for (const [stage, ms] of Object.entries(timings)) expect(ms, stage).toBeLessThan(BUDGET_MS * 2);
  });
  it("the autosaved draft restored EXACTLY (no answer lost at scale) and its stored size is bounded by the answers' own size", async () => {
    // the draft was cleared by submit: replay it on a fresh student and compare the restore
    const p2 = createPlatform({ students: { "st-2": "طالب" } });
    const aid2 = (await publishAndAssign(p2, stressExam(SIZE).exam)).aid;
    const s2 = p2.student("st-2");
    await s2.start(aid2);
    expect((await s2.draft(aid2, answers)).status).toBe(200);
    const restored = (await s2.state(aid2)).jsonBody.state.draftAnswers;
    expect(Object.keys(restored).sort()).toEqual(Object.keys(answers).sort());
    const size = JSON.stringify(s2.doc(aid2)).length;
    expect(size).toBeLessThan(2 * JSON.stringify(answers).length + 200000);
  });
  it("grading at scale: every standalone question and every composite part matches its family-rule expectation; attempt invariants hold", () => {
    const at = s.attempt(aid);
    const l = ledgerOf(at);
    for (const [qid, ex] of Object.entries(expected)) {
      if (Array.isArray(ex)) { expect(l.questions[qid], qid).toEqual(ex); continue; }
      // composite: every answered part as its family rule says; the unanswered parametric child (its answer needs the delivered instance) is a 0
      expect(l.parts[qid], qid).toEqual({ ...Object.fromEntries(Object.keys(l.parts[qid]).map(pid => [pid, [0, 0]])), ...ex.parts });
    }
    expect(attemptInvariants(at, examOfficialStats(p.assignmentOf(aid).examSnapshot).totalMarks)).toEqual([]);
    // every hidden-test coding target (standalone + composite children) was planned and dispatched once — never graded zero meanwhile
    const targets = Object.values(at.codingGrading.targets);
    expect(targets.length).toBe(p.runner.jobs().length);
    expect(targets.every(t => t.state === "dispatched")).toBe(true);
  });
  it("teacher review of the whole attempt loads within budget", async () => {
    const t0 = performance.now();
    const r = await p.teacher.reviewGet(aid, "st-1");
    expect(r.status).toBe(200);
    expect(r.jsonBody.questions).toHaveLength(256);
    expect(performance.now() - t0).toBeLessThan(BUDGET_MS * 2);
  });
});
