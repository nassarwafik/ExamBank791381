import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { examA, PERSONAS, SOL } from "./exams/A-network.js";
import { publishAndAssign, takeExam } from "./lifecycle.js";
import { ledgerOf, attemptInvariants } from "./ledger.js";
import { scanProjection } from "./scan.js";
import { A } from "./kit.js";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";

// Phase 20G — CERTIFICATION EXAM A (networking, 100 marks) through the REAL platform: authoring validity, export/import round trip, governance
// publication (server finalization), assignment of the immutable published revision, five student personas (full / partial / one misconfigured
// trunk / incomplete / reload-and-continue), sanitized delivery scanned for every private value, autosave → reload → exact restore → continue →
// submit once, server replay of every network lab, expected score ledgers (derived by hand), teacher rubric review and final scores.
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("./platform.js");
const { examOfficialStats } = require_("../../src/lib/exam-structure.js");
const SECRETS = ["Class2026", "192.168.20.254", "255.255.255.0\",\"192.168.20.1", "SW-LAB\",\"vlans"];   // private check / key values (never in the stem)
const STUDENTS = { "a-full": "طالب كامل", "a-partial": "طالب جزئي", "a-misconfig": "طالب خطأ ترنك", "a-incomplete": "طالب غير مكتمل", "a-reload": "طالب إعادة تحميل" };

describe("20G-A networking exam — authoring", () => {
  it("is finalizable, 100 marks, sections 21 / 12 (first 2 of 3) / 22 / 45, and round-trips through JSON export → import → canonical save", () => {
    const e = examA();
    const fin = evaluateExamFinalization(e);
    expect(fin.blockers.map(b => b.id), JSON.stringify(fin.blockers)).toEqual([]);
    expect(fin.canFinalize).toBe(true);
    const stats = examOfficialStats(e);
    expect(stats.totalMarks).toBe(100);
    expect(stats.sections.map(s => s.totalMarks)).toEqual([21, 12, 22, 45]);
    const imp = parseStructuredExamJson(JSON.stringify(e), "A-network.json");
    expect(imp.parseErrors).toEqual([]);
    expect(imp.validationErrors.filter(i => i.severity === "error")).toEqual([]);
    const qs = x => x.sections.flatMap(s => s.questions);
    expect(qs(imp.exam)).toEqual(qs(e));
    const saved = toSavedStructuredExam(imp.exam);
    expect(qs(saved)).toEqual(qs(e));
    expect(examOfficialStats(saved).totalMarks).toBe(100);
    expect(evaluateExamFinalization(JSON.parse(JSON.stringify(saved))).canFinalize).toBe(true);
  });
  it("contains no unsupported routing / filtering simulation (OSPF, RIP, EIGRP, ACL, NAT)", () => {
    expect(JSON.stringify(examA())).not.toMatch(/ospf|eigrp|"rip"|access-list|ip nat/i);
  });
});

describe("20G-A networking exam — full platform lifecycle", () => {
  let p, aid, published;
  const runs = {};
  beforeAll(async () => {
    p = createPlatform({ students: STUDENTS });
    published = await publishAndAssign(p, examA());
    aid = published.aid;
    runs.FULL = await takeExam(p, aid, "a-full", PERSONAS.FULL.answers, { chunks: 3 });
    runs.PARTIAL = await takeExam(p, aid, "a-partial", PERSONAS.PARTIAL.answers);
    runs.MISCONFIG = await takeExam(p, aid, "a-misconfig", PERSONAS.MISCONFIG.answers);
    runs.INCOMPLETE = await takeExam(p, aid, "a-incomplete", PERSONAS.INCOMPLETE.answers, { chunks: 1 });
  }, 120000);

  it("the assignment binds the immutable PUBLISHED revision (server snapshot, official total 100)", () => {
    const a = p.assignmentOf(aid);
    expect(a.source).toMatchObject({ kind: "governed-revision", examId: "CERT20G-A-NET", revisionNumber: 1 });
    expect(a.totalMarks).toBe(100);
    expect(a.examSnapshot.sections.flatMap(s => s.questions).map(q => q.examQuestionId)).toEqual(examA().sections.flatMap(s => s.questions).map(q => q.examQuestionId));
  });
  it("pre-start delivery carries NO exam body; after start the delivery is sanitized (no private key, no canary, no private check value) for every persona", () => {
    for (const [name, r] of Object.entries(runs)) {
      expect(r.preStart.status, name).toBe(200);
      expect(r.preStart.jsonBody.assignment.exam.sections, name).toBeUndefined();
      expect(r.preStart.jsonBody.assignment.marksDistribution.total, name).toBe(100);
      expect(scanProjection(r.preStart.jsonBody, { secrets: SECRETS }), name).toEqual([]);
      expect(r.delivery.status, name).toBe(200);
      expect(scanProjection(r.delivery.jsonBody, { secrets: SECRETS }), name).toEqual([]);
      expect(r.start.jsonBody.state.activeAttempt.startedAt).toBe(r.startAgain.jsonBody.state.activeAttempt.startedAt);   // idempotent start
    }
  });
  it("every autosave restores EXACTLY what the server normalized; forged SmartSim / CLI states never survive; continuing from the restore loses nothing", () => {
    for (const [name, r] of Object.entries(runs)) {
      for (const x of r.restores) { expect(x.status, name).toBe(200); expect(x.restored, name).toEqual(x.expected.answers); expect(x.expected.rejected, name).toEqual([]); }
      expect(Object.keys(r.restores.at(-1).restored).sort(), name).toEqual(Object.keys(PERSONAS[name].answers).sort());
      expect(JSON.stringify(r.restores), name).not.toMatch(/"forged"|"score":999|FORGED/);
    }
  });
  it("submit grades once; a duplicate submit is refused (409) and changes nothing; the active attempt and draft are cleared", () => {
    for (const [name, r] of Object.entries(runs)) {
      expect(r.submit.status, name).toBe(200);
      expect(r.duplicateSubmit.status, name).toBe(409);
      expect(r.doc.attempts, name).toHaveLength(1);
      expect([r.doc.activeAttempt, r.doc.draftAnswers], name).toEqual([null, {}]);
    }
  });
  it("the server ledger equals the hand-derived ledger for every persona (per question and per composite part) and satisfies every attempt invariant", () => {
    for (const [name, r] of Object.entries(runs)) {
      const l = ledgerOf(r.attempt);
      expect(l.questions, name).toEqual(PERSONAS[name].auto);
      expect(l.parts, name).toEqual(PERSONAS[name].parts);
      expect(attemptInvariants(r.attempt, 100), name).toEqual([]);
      const pending = Object.values(PERSONAS[name].auto).reduce((n, [, m]) => n + m, 0);
      expect(r.submit.jsonBody.result.manualReviewMarks, name).toBe(pending);
      expect(r.submit.jsonBody.result.finalized, name).toBe(pending === 0);
    }
  });
  it("firstNAnswered counts exactly the first TWO answered questions of section 2 (display order); the third answered unit is ignored, never pending", () => {
    const full = runs.FULL.attempt.questionGrades.filter(g => g.sectionId === "a-s2");
    expect(full.map(g => [g.questionId, g.countedMaxMarks, g.ignored])).toEqual([["a2-1", 6, false], ["a2-2", 6, false], ["a2-3", 0, false]]);
    const partial = runs.PARTIAL.attempt.questionGrades.filter(g => g.sectionId === "a-s2");
    expect(partial.map(g => [g.questionId, g.countedMaxMarks, g.manualReview])).toEqual([["a2-1", 0, false], ["a2-2", 6, false], ["a2-3", 6, true]]);
  });
  it("teacher review (rubric levels, per-part composite rubric, explicit zero for an unanswered legacy table) produces the expected FINAL scores", async () => {
    const ids = { FULL: "a-full", PARTIAL: "a-partial", MISCONFIG: "a-misconfig", INCOMPLETE: "a-incomplete" };
    for (const [name, sid] of Object.entries(ids)) {
      const get = await p.teacher.reviewGet(aid, sid);
      expect(get.status, name).toBe(200);
      const comp = get.jsonBody.questions.find(q => q.questionId === "a4-1");
      expect(comp.compositeReview.contexts, name).toHaveLength(2);
      const saved = await p.teacher.saveReview(aid, sid, PERSONAS[name].review);
      expect(saved.status, name + " " + JSON.stringify(saved.jsonBody)).toBe(200);
      expect([saved.jsonBody.result.score, saved.jsonBody.result.manualReviewMarks, saved.jsonBody.result.finalized], name).toEqual([PERSONAS[name].final, 0, true]);
      const at = p.student(sid).attempt(aid, 1);
      expect(attemptInvariants(at, 100), name).toEqual([]);
      // a client-supplied plain score can never replace a rubric decision on an open-response question
      const forged = await p.teacher.saveReview(aid, sid, { "a2-1": { score: 6 } });
      if (PERSONAS[name].answers["a2-1"]) expect(forged.status, name).toBe(400);
    }
  });
  it("RELOAD persona: answers the first half, reloads (new page: the delivery and state come back from the server), continues, submits — same final as FULL's automatic part", async () => {
    const s = p.student("a-reload");
    await s.start(aid);
    const ids = Object.keys(PERSONAS.FULL.answers), half = Object.fromEntries(ids.slice(0, 7).map(k => [k, PERSONAS.FULL.answers[k]]));
    expect((await s.draft(aid, half)).status).toBe(200);
    // the page is destroyed: a NEW client knows nothing but what the server returns
    const again = await s.deliver(aid), st = await s.state(aid);
    expect(again.jsonBody.assignment.exam.sections).toHaveLength(4);
    const restored = st.jsonBody.state.draftAnswers;
    expect(Object.keys(restored)).toEqual(Object.keys(half));
    const rest = Object.fromEntries(ids.slice(7).map(k => [k, PERSONAS.FULL.answers[k]]));
    const sub = await s.submit(aid, { ...restored, ...rest });
    expect(sub.status).toBe(200);
    expect(ledgerOf(s.attempt(aid)).questions).toEqual(PERSONAS.FULL.auto);
  });
  it("the network labs are graded by SERVER REPLAY: a forged high-scoring state with no actions earns nothing; a structural topology action is refused at ingest", async () => {
    const forged = { ...PERSONAS.INCOMPLETE.answers, "a4-2": A.sim("networkTopology", 2, [], { v: 2, devices: {}, ops: {}, score: 10 }), "a4-3": A.sim("networkTopology", 2, [{ type: "topology.addDevice", deviceId: "x", kind: "router" }, ...SOL.capstone]) };
    const p2 = createPlatform({ students: { "a-forger": "طالب" } });
    const { aid: aid2 } = await publishAndAssign(p2, examA());
    const s = p2.student("a-forger");
    await s.start(aid2);
    expect((await s.draft(aid2, forged)).status).toBe(200);
    const restored = (await s.state(aid2)).jsonBody.state.draftAnswers;
    expect(restored["a4-3"]).toBeUndefined();                                   // the whole answer carrying a structural action is refused
    expect(restored["a4-2"].state).not.toHaveProperty("score");
    const sub = await s.submit(aid2, forged);
    expect(sub.status).toBe(200);
    expect(ledgerOf(s.attempt(aid2)).questions["a4-2"]).toEqual([0, 0]);
    expect(ledgerOf(s.attempt(aid2)).questions["a4-3"]).toEqual([0, 0]);
  });
});
