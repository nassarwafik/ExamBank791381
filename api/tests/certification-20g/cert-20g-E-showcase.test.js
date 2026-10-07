import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { examE, PERSONAS, LEN_OK } from "./exams/E-showcase.js";
import { publishAndAssign, takeExam } from "./lifecycle.js";
import { ledgerOf, attemptInvariants } from "./ledger.js";
import { scanProjection } from "./scan.js";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";

// Phase 20G — CERTIFICATION EXAM E (mixed showcase, 100 marks): 22 production families in one exam through the REAL platform — capScore section
// above its cap, legacy compound beside an advanced composite (shared RICH source + shared SmartSim context + firstNAnswered group with an excess
// answer + rubric), the frozen networkTopology@1 lab, visual questions on TEACHER images, an official coding question, and the assetRequest gate
// (an unresolved image request blocks finalization in the Builder AND at governance review; resolving it lets finalization succeed).
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("./platform.js");
const { examOfficialStats } = require_("../../src/lib/exam-structure.js");
const FAMILIES = ["multipleChoice", "multipleSelect", "trueFalse", "multiTrueFalse", "inlineCloze", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "matrix", "categorization",
  "numericResponse", "parametricNumeric", "hotspot", "labelDiagram", "networkCli", "smartSim", "coding", "compound", "composite", "shortAnswer", "openResponse"];
const STUDENTS = { "e-perfect": "طالب مثالي", "e-mixed": "طالب مختلط" };

describe("20G-E showcase — authoring and the assetRequest gate", () => {
  it("contains every listed family (top level or composite / compound child), 100 marks; capScore section counts 15 of 20 raw", () => {
    const e = examE();
    const types = new Set();
    for (const q of e.sections.flatMap(s => s.questions)) { types.add(q.presentationType); for (const g of q.composite?.groups ?? []) for (const p of g.parts) types.add(p.type); for (const p of q.parts ?? []) types.add(p.type); }
    for (const f of FAMILIES) expect(types.has(f), f).toBe(true);
    const s = examOfficialStats(e);
    expect([s.totalMarks, ...s.sections.map(x => x.totalMarks)]).toEqual([100, 12, 14, 15, 10, 12, 17, 20]);
    expect(evaluateExamFinalization(e).blockers.map(b => b.message)).toEqual([]);
    const imp = parseStructuredExamJson(JSON.stringify(e), "E.json");
    expect(imp.validationErrors.filter(i => i.severity === "error")).toEqual([]);
    expect(imp.exam.sections.flatMap(x => x.questions)).toEqual(e.sections.flatMap(x => x.questions));
  });
  it("an UNRESOLVED assetRequest blocks finalization in the Builder AND is refused by governance review (422, no publication); resolving it publishes", async () => {
    const unresolved = examE({ resolved: false });
    const fin = evaluateExamFinalization(unresolved);
    expect(fin.canFinalize).toBe(false);
    expect(fin.structuralErrors.map(i => i.code)).toEqual(["AI_ASSET_REQUEST_UNRESOLVED"]);
    const p = createPlatform();
    const refused = await p.teacher.publish(unresolved);
    expect(refused.ok).toBe(false);
    expect(refused.steps.at(-1)).toMatchObject({ status: 422, jsonBody: { code: "FINALIZATION_REFUSED" } });
    expect((await p.teacher.assign(unresolved.examId)).status).toBe(409);       // nothing published ⇒ nothing assignable
    // the teacher attaches the image and removes the request: a new revision passes review, is approved, published and assignable
    const m = refused.steps[0].jsonBody.manifest;
    const back = await p.teacher.governance({ action: "create-revision", examId: unresolved.examId, exam: examE(), expectedStateVersion: m.stateVersion });
    expect(back.status, JSON.stringify(back.jsonBody)).toBe(200);
    let st = back.jsonBody.manifest;
    for (const action of ["submit-review", "approve", "publish"]) {
      const r = await p.teacher.governance({ action, examId: unresolved.examId, expectedStateVersion: st.stateVersion, ...(action === "submit-review" ? { revisionId: st.latestRevisionId } : {}) });
      expect(r.status, action + JSON.stringify(r.jsonBody)).toBe(200);
      st = r.jsonBody.manifest;
    }
    expect((await p.teacher.assign(unresolved.examId)).status).toBe(200);
  });
});

describe("20G-E showcase — full platform lifecycle", () => {
  let p, aid;
  const runs = {};
  beforeAll(async () => {
    p = createPlatform({ students: STUDENTS });
    aid = (await publishAndAssign(p, examE())).aid;
    runs.PERFECT = await takeExam(p, aid, "e-perfect", PERSONAS.PERFECT.answers, { chunks: 4 });
    runs.MIXED = await takeExam(p, aid, "e-mixed", PERSONAS.MIXED.answers, { chunks: 2 });
  }, 120000);

  it("delivery is sanitized across every family (visual targets, rubric, hidden test, cloze keys, compound answers, composite children)", () => {
    for (const [name, r] of Object.entries(runs)) {
      expect(scanProjection(r.delivery.jsonBody, { secrets: ["rgn-router", "rgn-switch", "0.137", "\"z1\":\"l-app\"", "abcde", "DHCP\"", "BR1-SW1", "192.168.10.254"] }), name).toEqual([]);
      const comp = r.delivery.jsonBody.assignment.exam.sections[6].questions[1].composite;
      expect(comp.contexts.map(c => c.kind), name).toEqual(["source", "smartSim"]);
      expect(comp.contexts[0].sources[0].kind, name).toBe("rich");
    }
  });
  it("ledgers per persona (capScore cap, firstNAnswered excess ignored, compound parts, v1 lab replay) and every attempt invariant", () => {
    for (const [name, r] of Object.entries(runs)) {
      expect([r.submit.status, r.duplicateSubmit.status], name).toEqual([200, 409]);
      for (const x of r.restores) expect(x.restored, name).toEqual(x.expected.answers);
      expect(ledgerOf(r.attempt).questions, name).toEqual(PERSONAS[name].auto);
      expect(ledgerOf(r.attempt).parts, name).toEqual(PERSONAS[name].parts);
      expect(attemptInvariants(r.attempt, 100), name).toEqual([]);
      expect(r.attempt.sections.find(s => s.id === "e-s3"), name).toMatchObject({ score: 15, maxMarks: 15 });
    }
    const ignored = runs.MIXED.attempt.questionGrades.find(g => g.questionId === "e7-2").parts.find(x => x.partId === "b3");
    expect(ignored).toMatchObject({ counted: false, ignored: true, score: 0, manualReview: false });
  });
  it("coding callback + teacher rubric ⇒ FINAL scores", async () => {
    for (const [name, sid] of [["PERFECT", "e-perfect"], ["MIXED", "e-mixed"]]) {
      const t = p.student(sid).attempt(aid).codingGrading.targets["e6-3"];
      const job = p.runner.jobs().find(j => j.jobId === t.jobId);
      expect(job.source, name).toBe(name === "PERFECT" ? LEN_OK : "print(input())\n");
      expect((await p.runner.callback(p.runner.callbackBody(job, PERSONAS[name].callbacks["e6-3"]))).status, name).toBe(200);
      const rv = await p.teacher.saveReview(aid, sid, PERSONAS[name].review);
      expect([rv.status, rv.jsonBody.result.score, rv.jsonBody.result.finalized], name).toEqual([200, PERSONAS[name].final, true]);
      expect(attemptInvariants(p.student(sid).attempt(aid), 100), name).toEqual([]);
    }
  });
});
