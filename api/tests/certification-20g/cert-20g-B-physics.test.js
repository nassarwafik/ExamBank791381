import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { examB, PERSONAS, CLASSROOM, instanceValue } from "./exams/B-physics.js";
import { publishAndAssign, takeExam } from "./lifecycle.js";
import { ledgerOf, attemptInvariants } from "./ledger.js";
import { scanProjection } from "./scan.js";
import { A } from "./kit.js";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";

// Phase 20G — CERTIFICATION EXAM B (physics, physicsFreeFall@1 only, 100 marks) through the REAL platform: four personas (exact; simulation right
// but explanation wrong; explanation right but measurements incomplete; partial SmartSim work) plus an abandoned-and-restored attempt; per-attempt
// parametric instances generated from the server-owned identity (stable across refresh, never chosen by the client); server replay of every
// measurement; presentation actions (play / scrub / camera) can never enter the graded action stream; expected ledgers derived by hand.
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("./platform.js");
const { examOfficialStats } = require_("../../src/lib/exam-structure.js");
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
// private check values that never appear in a stem: the classroom pointNear expectation and the upward-throw numericNear expectations' companions
const SECRETS = ["2.0203", "sqrt(2*h/10)", "v^2/20"];
const STUDENTS = { "b-exact": "طالب دقيق", "b-simwrong": "طالب تفسير خاطئ", "b-measinc": "طالب قياسات ناقصة", "b-partial": "طالب محاكاة جزئية", "b-restore": "طالب استعادة" };
const ids = { EXACT: "b-exact", SIM_RIGHT_EXPLAIN_WRONG: "b-simwrong", EXPLAIN_RIGHT_MEAS_INCOMPLETE: "b-measinc", PARTIAL_SIM: "b-partial" };

describe("20G-B physics exam — authoring", () => {
  it("finalizable, 100 marks (12 / 16 / 28 / 44), composite 24 = 12 + first-2-of-3 (4) + 8, JSON round trip", () => {
    const e = examB();
    const fin = evaluateExamFinalization(e);
    expect(fin.blockers.map(b => b.id + ":" + (b.structural && b.structural.code)), JSON.stringify(fin.blockers.map(b => b.message))).toEqual([]);
    const stats = examOfficialStats(e);
    expect([stats.totalMarks, ...stats.sections.map(s => s.totalMarks)]).toEqual([100, 12, 16, 28, 44]);
    const imp = parseStructuredExamJson(JSON.stringify(e), "B.json");
    expect(imp.validationErrors.filter(i => i.severity === "error")).toEqual([]);
    expect(imp.exam.sections.flatMap(s => s.questions)).toEqual(e.sections.flatMap(s => s.questions));
  });
  it("uses ONLY physicsFreeFall@1 (no other plugin, no other version)", () => {
    const ids = [...JSON.stringify(examB()).matchAll(/"pluginKey":"([^"]+)","pluginVersion":(\d+)/g)].map(m => m[1] + "@" + m[2]);
    expect(new Set(ids)).toEqual(new Set(["physicsFreeFall@1"]));
  });
});

describe("20G-B physics exam — full platform lifecycle", () => {
  let p, aid;
  const runs = {};
  beforeAll(async () => {
    p = createPlatform({ students: STUDENTS });
    aid = (await publishAndAssign(p, examB())).aid;
    for (const [name, sid] of Object.entries(ids)) runs[name] = await takeExam(p, aid, sid, PERSONAS[name].answers, { chunks: 3 });
  }, 120000);

  it("sanitized delivery: no rubric guidance / model answer / check / tolerance / parametric expression; a VISIBLE rubric shows levels only", () => {
    for (const [name, r] of Object.entries(runs)) {
      expect(scanProjection(r.delivery.jsonBody, { secrets: SECRETS, allowKeysAt: [] }), name).toEqual([]);
      const qs = r.delivery.jsonBody.assignment.exam.sections.flatMap(s => s.questions);
      const visible = qs.find(q => q.examQuestionId === "b4-4");
      expect(visible.openResponse.publicRubric.criteria[0].levels.map(l => l.points), name).toEqual([6, 3, 0]);
      expect(qs.find(q => q.examQuestionId === "b4-2").openResponse.publicRubric, name).toBeUndefined();
      const par = qs.find(q => q.examQuestionId === "b2-2");
      expect(par.parametric.status, name).toBe("ready");
      expect(par.text, name).not.toContain("{{h}}");
      expect(par.text, name).toContain(String(par.parametric.values.h));
    }
  });
  it("autosave → reload restores exactly the server-normalized answers (SmartSim state re-derived; forged state / score dropped)", () => {
    for (const [name, r] of Object.entries(runs)) {
      for (const x of r.restores) { expect(x.status, name).toBe(200); expect(x.restored, name).toEqual(x.expected.answers); expect(x.expected.rejected, name).toEqual([]); }
      expect(JSON.stringify(r.restores), name).not.toMatch(/"forged"|"score":999/);
      const restored = r.restores.at(-1).restored["b3-1"];
      expect(restored.state, name).toEqual(expect.objectContaining({ v: 1 }));
    }
  });
  it("ledgers per persona = hand-derived; invariants hold; submit once, duplicate 409", () => {
    for (const [name, r] of Object.entries(runs)) {
      expect([r.submit.status, r.duplicateSubmit.status], name).toEqual([200, 409]);
      const l = ledgerOf(r.attempt);
      expect(l.questions, name).toEqual(PERSONAS[name].auto);
      expect(l.parts, name).toEqual(PERSONAS[name].parts);
      expect(attemptInvariants(r.attempt, 100), name).toEqual([]);
    }
  });
  it("parametric instances: deterministic for the attempt (refresh = same values), graded on the SAME instance the student saw", async () => {
    const s = p.student("b-restore");
    await s.start(aid);
    const d1 = (await s.deliver(aid)).jsonBody.assignment.exam, d2 = (await s.deliver(aid)).jsonBody.assignment.exam;
    expect(instanceValue(d1, "b2-2", "h")).toBe(instanceValue(d2, "b2-2", "h"));
    expect(instanceValue(d1, "b2-3", "v")).toBe(instanceValue(d2, "b2-3", "v"));
    // a client cannot choose its instance: no request field names the generation identity; the delivered value equals the stored grading key's instance
    const exact = runs.EXACT;
    const g = exact.attempt.questionGrades.find(x => x.questionId === "b2-2");
    expect(g.score).toBe(6);
  });
  it("ABANDONED-AND-RESTORED attempt: half the answers saved, the session abandoned, a new session restores everything (same parametric instance) and finishes", async () => {
    const s = p.student("b-restore");                                      // started in the previous test (same attempt)
    const d = (await s.deliver(aid)).jsonBody.assignment.exam;
    const all = PERSONAS.EXACT.answers(d), keys = Object.keys(all), half = Object.fromEntries(keys.slice(0, 8).map(k => [k, all[k]]));
    expect((await s.draft(aid, half)).status).toBe(200);
    // abandonment: nothing else happens. A NEW session (new page, new device) only has the server:
    const back = (await s.state(aid)).jsonBody.state, again = (await s.deliver(aid)).jsonBody.assignment.exam;
    expect(Object.keys(back.draftAnswers)).toEqual(Object.keys(half));
    expect(instanceValue(again, "b2-2", "h")).toBe(instanceValue(d, "b2-2", "h"));
    const rest = Object.fromEntries(keys.slice(8).map(k => [k, all[k]]));
    const sub = await s.submit(aid, { ...back.draftAnswers, ...rest });
    expect(sub.status).toBe(200);
    expect(ledgerOf(s.attempt(aid)).questions).toEqual(PERSONAS.EXACT.auto);
  });
  it("teacher rubric review produces the expected FINAL score for every persona", async () => {
    for (const [name, sid] of Object.entries(ids)) {
      const saved = await p.teacher.saveReview(aid, sid, PERSONAS[name].review);
      expect(saved.status, name + JSON.stringify(saved.jsonBody)).toBe(200);
      expect([saved.jsonBody.result.score, saved.jsonBody.result.finalized], name).toEqual([PERSONAS[name].final, true]);
      expect(attemptInvariants(p.student(sid).attempt(aid), 100), name).toEqual([]);
    }
  });
});

describe("20G-B presentation never alters grading state", () => {
  it("play / pause / restart / scrub / camera / frame actions are refused at ingest (never graded); only measurement and point decisions are", () => {
    const e = examB();
    const presentation = ["simulation.play", "simulation.pause", "simulation.restart", "timeline.scrub", "camera.zoom", "view.pan", "animation.frame", "ui.toggleVectors"];
    for (const type of presentation) {
      const r = normalizeDraftAnswers({ "b3-1": A.sim("physicsFreeFall", 1, [{ type, t: 1.2 }, ...CLASSROOM]) }, e);
      expect(r.answers["b3-1"], type).toBeUndefined();
      expect(r.rejected.map(x => x.id), type).toEqual(["b3-1"]);
    }
    const ok = normalizeDraftAnswers({ "b3-1": A.sim("physicsFreeFall", 1, CLASSROOM) }, e);
    expect(ok.answers["b3-1"].state).toEqual({ v: 1, measurements: { heightAt1s: 15.1, impactSpeed: 19.8, impactTime: 2.02, velocityAt1s: -9.8 }, points: { impactPoint: { t: 2.02, y: 0 }, pointAt1s: { t: 1, y: 15.1 } } });
  });
  it("the replayed state is identical whatever the playback history the client had (same decisions ⇒ same state ⇒ same score)", () => {
    const e = examB();
    const a = normalizeDraftAnswers({ "b3-1": A.sim("physicsFreeFall", 1, CLASSROOM, { t: 0.4, playing: true, rate: 2 }) }, e).answers["b3-1"];
    const b = normalizeDraftAnswers({ "b3-1": A.sim("physicsFreeFall", 1, CLASSROOM, { t: 2.9, playing: false, reducedMotion: true }) }, e).answers["b3-1"];
    expect(a).toEqual(b);
  });
});
