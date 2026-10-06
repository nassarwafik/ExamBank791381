import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createFakeCodingExecutionProvider } from "./fixtures/fake-coding-execution-provider.js";
import { examOfficialStats } from "../src/lib/exam-structure.js";
import { parseStructuredExamJson } from "../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../src/examBuilderState";
import { validateStructuredExam } from "../../src/examQuality";
import { AI_AUTHOR_INTENTS, AI_GENERATED_TYPES, verifyAiQuestionNode } from "../../src/aiQuestionDraft";
import { compositeArabicExam, compositePhysicsExam, compositeCsExam, compositeNetworkExam } from "../../src/composite/compositeFixtures";

// Phase 20D — ACCEPTANCE of composite@1 through the REAL handlers and authorities (new tests written with the implementation — not
// fail-first): every fixture survives JSON import / canonical save byte-for-byte; physics, CS and network fixtures go end to end (deliver →
// autosave → submit → automatic grading → per-part manual review / rubric → finalization); a composite coding child runs PRACTICE executions
// under its child key; AI authoring never produces a composite.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const clone = x => JSON.parse(JSON.stringify(x));
const qOf = e => e.sections[0].questions[0];
const comp = (parts, contexts = {}) => ({ kind: "composite", parts, contexts });
const FIXTURES = { A: compositeArabicExam, B: compositePhysicsExam, C: compositeCsExam, D: compositeNetworkExam };
const submission = () => require_("../src/functions/student-submission.js");
const studentAssignment = () => require_("../src/functions/student-assignment.js");
const review = () => require_("../src/functions/assignment-review.js");
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: "teacher-20d-acc", role: "teacher" } });
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
function harness(exam, fetch = F.runnerFetch()) {
  const ctx = F.seed({ a: F.assignment({ examSnapshot: { title: "exam", metadata: {}, presentationTheme: "classic", sections: exam.sections }, totalMarks: examOfficialStats(exam).totalMarks, questionCount: 1 }) });
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch };
  return {
    ctx, fetch,
    deliver: () => studentAssignment().handler(F.studentRequest(undefined, "GET"), sDeps),
    draft: answers => submission().handler(F.studentRequest({ action: "saveDraft", answers, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), sDeps, quiet),
    submit: answers => submission().handler(F.studentRequest(F.submitBody(answers)), sDeps, quiet),
    reviewGet: () => review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", null, "GET"), tDeps, quiet),
    save: overrides => review().handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides, teacherFeedback: "" }), tDeps, quiet),
    callback: body => require_("../src/functions/coding-grading.js").callbackHandler(F.callbackRequest(body), { getContainer: () => ctx.container, env: F.ENV }, quiet),
    attempt: () => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1)
  };
}

describe("20D-A1 save / load / JSON import / export", () => {
  for (const [name, f] of Object.entries(FIXTURES)) it("fixture " + name + ": JSON import keeps the composite byte-for-byte (fresh exam id only); canonical save keeps it; still finalizable", () => {
    const r = parseStructuredExamJson(JSON.stringify(f()), "composite-" + name + ".json");
    expect(r.parseErrors).toEqual([]);
    expect(qOf(r.exam)).toEqual(qOf(f()));
    expect(r.validationErrors.filter(i => i.severity === "error")).toEqual([]);
    const saved = toSavedStructuredExam(r.exam);
    expect(qOf(saved)).toEqual(qOf(f()));
    expect(saved.totalMarks).toBe(examOfficialStats(f()).totalMarks);
    expect(validateStructuredExam(JSON.parse(JSON.stringify(saved))).filter(i => i.severity === "error")).toEqual([]);
  });
  it("an imported composite that smuggles nesting or an unknown key opens as a draft but BLOCKS finalization (never repaired)", () => {
    const e = compositeArabicExam(); qOf(e).composite.groups[0].parts[0] = { id: "x", type: "composite", marks: 2, text: "x" };
    const r = parseStructuredExamJson(JSON.stringify(e), "bad.json");
    expect(r.validationErrors.map(i => i.code)).toContain("COMPOSITE_CHILD_TYPE_REFUSED");
  });
});

describe("20D-A2 fixture B (physics) end to end: one shared workspace, five scored parts, numeric + rubric interpretation", () => {
  const GOOD = [{ type: "measurement.set", measurementId: "impactTime", value: 2.02 }, { type: "measurement.set", measurementId: "impactSpeed", value: 19.8 }, { type: "measurement.set", measurementId: "heightAt1s", value: 15.1 }, { type: "measurement.set", measurementId: "velocityAt1s", value: -9.8 }, { type: "graphPoint.set", pointId: "pointAt1s", t: 1, y: 15.1 }];
  it("deliver → autosave (context replayed) → submit → 14 automatic + 4 pending → rubric → final 18/18", async () => {
    const h = harness(compositePhysicsExam());
    const d = await h.deliver();
    expect(d.status).toBe(200);
    const delivered = d.jsonBody.assignment.exam.sections[0].questions[0].composite;
    expect(delivered.contexts).toHaveLength(1);
    expect(JSON.stringify(d.jsonBody)).not.toMatch(/"checks"|impact-time|PRIVATE-GUIDANCE-20D-B|MODEL-ANSWER-20D-B/);
    const ff = actions => ({ kind: "smartSim", pluginKey: "physicsFreeFall", pluginVersion: 1, actions, state: { forged: 1 } });
    expect((await h.draft({ phys1: comp({}, { ctxSim: ff(GOOD.slice(0, 2)) }) })).status).toBe(200);
    expect(h.ctx.getJson(F.SUB).draftAnswers.phys1.contexts.ctxSim.state).toEqual({ v: 1, measurements: { impactTime: 2.02, impactSpeed: 19.8 }, points: {} });
    expect((await h.submit({ phys1: comp({ n1: { kind: "numeric", value: "9.8" }, o1: { kind: "text", value: "لأن تسارع الجاذبية ثابت." } }, { ctxSim: ff(GOOD) }) })).status).toBe(200);
    let at = h.attempt();
    expect([at.score, at.totalMarks, at.manualReviewMarks, at.finalized]).toEqual([14, 18, 4, false]);
    expect((await h.save({ "phys1::part::o1": { rubricAwards: { physics: { levelId: "full" } }, comment: "" } })).status).toBe(200);
    at = h.attempt();
    expect([at.score, at.manualReviewMarks, at.finalized]).toEqual([18, 0, true]);
  });
});

describe("20D-A3 fixture C (computer science) end to end incl. the official coding child and a rubric child", () => {
  it("submit → coding child dispatched → callback → explanation rubric → final", async () => {
    const h = harness(compositeCsExam());
    expect((await h.submit({ cs1: comp({ t1: { kind: "choice", index: 1 }, t2: { kind: "text", value: "6" }, c1: F.code("a,b=map(int,input().split())\nprint('SUM='+str(a+b))\n"), e1: { kind: "text", value: "الحلقة تجمع من 1 إلى n." } }) })).status).toBe(200);
    expect(h.attempt()).toMatchObject({ score: 4, manualReviewMarks: 14, finalized: false });
    expect((await h.callback(F.callbackBody(h.fetch.jobs()[0], ["SUM=3\n", "SUM=10\n"]))).status).toBe(200);
    expect(h.attempt()).toMatchObject({ score: 14, manualReviewMarks: 4, finalized: false });
    expect((await h.save({ "cs1::part::e1": { rubricAwards: { loop: { levelId: "full" } } } })).status).toBe(200);
    expect(h.attempt()).toMatchObject({ score: 18, manualReviewMarks: 0, finalized: true });
  });
  it("PRACTICE runs of the composite coding child are addressed by its child key (public material only; never graded)", async () => {
    const route = require_("../src/functions/coding-run.js");
    const provider = createFakeCodingExecutionProvider({ languages: [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }] });
    const ctx = F.seed({ a: F.assignment({ examSnapshot: { title: "exam", metadata: {}, presentationTheme: "classic", sections: compositeCsExam().sections }, totalMarks: 18, questionCount: 1 }), doc: F.activeDoc({}) });
    const before = JSON.stringify(ctx.getJson(F.SUB));
    const body = { assignmentId: F.AID, questionId: "cs1::part::c1", language: "python", languageVersion: 1, source: "print(1)\n", stdin: "2 3\n" };
    const text = JSON.stringify(body);
    const req = { method: "POST", url: "https://example.invalid/api/coding/run", params: {}, headers: new Headers({ "content-type": "application/json" }), query: new URLSearchParams(), text: async () => text, json: async () => body };
    const r = await route.runHandler(req, { container: ctx.container, requireStudentAuth: studentAuth, codingExecutionProvider: provider, env: {} }, null);
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    expect(JSON.stringify(ctx.getJson(F.SUB))).toBe(before);
    const bad = { ...body, questionId: "cs1::part::t1" }, badText = JSON.stringify(bad);
    const r2 = await route.runHandler({ ...req, text: async () => badText, json: async () => bad }, { container: ctx.container, requireStudentAuth: studentAuth, codingExecutionProvider: provider, env: {} }, null);
    expect(r2.status).not.toBe(200);
  });
});

describe("20D-A4 fixture D (network) end to end: one networkTopology@2 replay, four scored parts", () => {
  it("submit a partial configuration → only the satisfied linked parts earn marks; the topology stays immutable (no structural action exists)", async () => {
    const h = harness(compositeNetworkExam());
    const cmd = (deviceId, ...c) => c.map(command => ({ type: (deviceId === "r1" ? "router" : "switch") + ".command", deviceId, command }));
    const actions = [...cmd("sw1", "enable", "configure terminal", "vlan 10", "vlan 20", "interface g0/1", "switchport mode trunk", "end"), ...cmd("r1", "enable", "configure terminal", "interface g0/0.10", "encapsulation dot1Q 10", "interface g0/0.20", "encapsulation dot1Q 20", "end")];
    const net = list => ({ kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions: list, state: null });
    expect((await h.draft({ net1: comp({}, { ctxNet: net([{ type: "topology.addDevice", deviceId: "x" }]) }) })).status).toBe(200);
    expect(h.ctx.getJson(F.SUB).draftAnswers.net1.contexts).toEqual({});                               // a structural action is refused
    expect((await h.submit({ net1: comp({ m1: { kind: "choice", index: 0 } }, { ctxNet: net(actions) }) })).status).toBe(200);
    const at = h.attempt();
    expect(at.questionGrades[0].parts.map(p => [p.partId, p.score])).toEqual([["k1", 3], ["k2", 2], ["k3", 3], ["k4", 0], ["m1", 4]]);
    expect([at.score, at.finalized]).toEqual([12, true]);
    const rq = (await h.reviewGet()).jsonBody.questions[0];
    expect(rq.compositeReview.contexts).toHaveLength(1);
    expect(rq.compositeReview.contexts[0].review.transcripts).toBeTruthy();
  });
});

describe("20D-A5 AI authoring never produces a composite (groundwork only, not certified)", () => {
  it("composite is neither an AI intent nor a generated type; a composite node is refused by the AI verifier", () => {
    expect(AI_AUTHOR_INTENTS).not.toContain("composite");
    expect(AI_GENERATED_TYPES).not.toContain("composite");
    const full = verifyAiQuestionNode(clone(qOf(compositeArabicExam())));
    expect(full.ok).toBe(false);
    const minimal = verifyAiQuestionNode({ examQuestionId: "ai-draft", presentationType: "composite", questionTypeVersion: 1, text: "x", marks: 1, composite: { v: 1, contexts: [], groups: [] } });
    expect(minimal.ok).toBe(false);
    if (!minimal.ok) expect(minimal.issues.map(i => i.code)).toContain("AI_TYPE_NOT_ALLOWED");
  });
});

describe("20D-A6 the importable acceptance fixture files stay in sync with the code fixtures", () => {
  it("docs/fixtures/composite-20d/<name>.json === the code fixture (teachers import exactly what the tests certify)", async () => {
    const fs = await import("node:fs");
    const { COMPOSITE_FIXTURES } = await import("../../src/composite/compositeFixtures");
    for (const [k, f] of Object.entries(COMPOSITE_FIXTURES)) expect(JSON.parse(fs.readFileSync(new URL("../../docs/fixtures/composite-20d/" + k + ".json", import.meta.url), "utf8")), k).toEqual(f());
  });
});
