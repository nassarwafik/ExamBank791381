import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "node:module";
import { familyQuestion, STANDALONE_FAMILIES } from "./exams/S-stress.js";
import { examE } from "./exams/E-showcase.js";
import { publishAndAssign, normalizedAnswers } from "./lifecycle.js";
import { ledgerOf, attemptInvariants } from "./ledger.js";
import * as K from "./kit.js";

// Phase 20G — STUDENT lifecycle, the AUTOSAVE / RESTORE matrix and the SECURITY review (§10, §14, §15, §28) through the real handlers:
// one question of EVERY family (plus composite and legacy compound) answered → autosaved → the page destroyed → restored from the server
// EXACTLY → continued → submitted once; stale / concurrent / duplicate writes; completed-attempt immutability; client-forged teacher fields;
// cross-role and cross-student boundaries with REAL signed tokens; prototype-pollution, deep nesting and oversized payloads; nothing private or
// student-authored in the logs. Nothing here weakens a guard — each case states the observed outcome of the production code.
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("./platform.js");
const { A } = K;
afterEach(() => { vi.unstubAllEnvs(); });

function matrixExam() {
  const qs = [], answers = {}, expect_ = {};
  for (const f of STANDALONE_FAMILIES) {
    const id = "m-" + f.replace(/[^A-Za-z0-9]/g, "");
    const [node, ans, ex] = familyQuestion(f, id);
    qs.push(node); if (ans) { answers[id] = ans; expect_[id] = ex; }
  }
  const e = examE();
  const comp = e.sections[6].questions[1], cmpd = e.sections[6].questions[0];
  qs.push(comp, cmpd);
  answers[comp.examQuestionId] = A.composite({ a1: A.choice(0), b1: A.numeric(8), b2: A.choice(0), c1: A.text("لأنه يشفّر.") }, { ctxMoon: A.sim("physicsFreeFall", 1, [{ type: "measurement.set", measurementId: "impactTime", value: 5.35 }], { forged: true }) });
  answers[cmpd.examQuestionId] = A.compound({ p1: A.choice(0), p2: A.text("TCP") });
  expect_[comp.examQuestionId] = [11, 4]; expect_[cmpd.examQuestionId] = [5, 0];
  return { exam: K.exam("CERT20G-MATRIX", "مصفوفة الحفظ والاستعادة", [K.section("mx", "كل الأنواع", qs)]), answers, expected: expect_ };
}

describe("20G autosave / restore matrix — every family survives answer → autosave → destroy → hydrate → continue → submit", () => {
  it("each answer is restored EXACTLY as the server normalized it; continuing from the restore and submitting grades every family as its rule says", async () => {
    const { exam, answers, expected } = matrixExam();
    const p = createPlatform({ students: { "mx-s": "طالب" } });
    const { aid } = await publishAndAssign(p, exam);
    const s = p.student("mx-s");
    await s.start(aid);
    const snapshot = p.assignmentOf(aid).examSnapshot;
    const ids = Object.keys(answers);
    for (const id of ids) {                                                             // one family at a time: answer → autosave → page destroyed → hydrate
      const before = (await s.state(aid)).jsonBody.state.draftAnswers;
      const next = { ...before, [id]: answers[id] };
      expect((await s.draft(aid, next)).status, id).toBe(200);
      const restored = (await s.state(aid)).jsonBody.state.draftAnswers;
      const norm = normalizedAnswers(next, snapshot);
      expect(norm.rejected, id).toEqual([]);
      expect(restored, id).toEqual(norm.answers);                                         // nothing lost, nothing reordered, nothing invented
      expect(restored[id], id).toEqual(normalizedAnswers({ [id]: answers[id] }, snapshot).answers[id]);
    }
    const restoredAll = (await s.state(aid)).jsonBody.state.draftAnswers;
    expect(Object.keys(restoredAll).sort()).toEqual(ids.slice().sort());
    const sub = await s.submit(aid, restoredAll);                                       // the client only has what the server gave back
    expect(sub.status).toBe(200);
    const l = ledgerOf(s.attempt(aid));
    for (const [id, ex] of Object.entries(expected)) expect(l.questions[id], id).toEqual(ex);
    expect(attemptInvariants(s.attempt(aid), p.assignmentOf(aid).totalMarks)).toEqual([]);
  });
});

describe("20G student lifecycle — stale, concurrent, duplicate, completed", () => {
  const setup = async (sid = "st-s") => {
    const p = createPlatform({ students: { [sid]: "طالب", "other-s": "طالب آخر" } });
    const { aid } = await publishAndAssign(p, examE());
    const s = p.student(sid);
    await s.start(aid);
    return { p, aid, s };
  };
  it("a write composed under a STALE attempt identity (wrong startedAt / attempt number / malformed) is refused 409 and writes nothing", async () => {
    const { aid, s } = await setup();
    expect((await s.draft(aid, { "e1-1": A.choice(1) })).status).toBe(200);
    const doc = JSON.stringify(s.doc(aid));
    for (const idOver of [{ startedAt: "2020-01-01T00:00:00.000Z" }, { attemptNumber: 2 }, { attemptNumber: "1" }, { attemptNumber: 0 }, { startedAt: "" }]) {
      expect((await s.draft(aid, { "e1-1": A.choice(0) }, idOver)).status, JSON.stringify(idOver)).toBe(409);
      expect((await s.submit(aid, { "e1-1": A.choice(0) }, idOver)).status, JSON.stringify(idOver)).toBe(409);
    }
    expect(JSON.stringify(s.doc(aid))).toBe(doc);
  });
  it("two CONCURRENT submits of the same attempt produce exactly ONE graded attempt; the loser is refused and nothing is double-graded", async () => {
    const { aid, s } = await setup();
    const answers = { "e1-1": A.choice(1), "e1-3": A.choice(1) };
    const [r1, r2] = await Promise.all([s.submit(aid, answers), s.submit(aid, answers)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(s.doc(aid).attempts).toHaveLength(1);
    expect(s.attempt(aid).score).toBe(5);
  });
  it("a draft racing a submit never resurrects the finished attempt; after submit the attempt is IMMUTABLE for the student", async () => {
    const { aid, s } = await setup();
    const [d, sub] = await Promise.all([s.draft(aid, { "e1-1": A.choice(0) }), s.submit(aid, { "e1-1": A.choice(1) })]);
    expect(sub.status).toBe(200);
    expect([200, 409]).toContain(d.status);
    const done = JSON.stringify(s.attempt(aid));
    expect((await s.draft(aid, { "e1-1": A.choice(0) })).status).toBe(409);
    expect((await s.submit(aid, { "e1-1": A.choice(0) })).status).toBe(409);
    expect((await s.raw(aid, { action: "saveDraft", answers: {}, expectedAttemptNumber: 1, expectedStartedAt: s.identity(aid).startedAt })).status).toBe(409);
    expect(JSON.stringify(s.attempt(aid))).toBe(done);
    expect(s.doc(aid).activeAttempt).toBeNull();
  });
  it("client-forged TEACHER fields are ignored: score / finalized / manualOverrides / questionGrades in the body, score / correct inside answers", async () => {
    const { aid, s } = await setup();
    const forgedBody = { action: "submit", answers: { "e1-1": { kind: "choice", index: 0, correct: true, score: 3 }, "e6-2": A.sim("networkTopology", 1, [], { score: 6, checks: [] }) },
      score: 100, totalMarks: 1, finalized: true, manualOverrides: { "e1-1": { score: 3 } }, questionGrades: [], teacherFeedback: "ممتاز",
      expectedAttemptNumber: 1, expectedStartedAt: s.identity(aid).startedAt };
    const r = await s.raw(aid, forgedBody);
    expect(r.status).toBe(200);
    const at = s.attempt(aid);
    expect(ledgerOf(at).questions["e1-1"]).toEqual([0, 0]);
    expect(ledgerOf(at).questions["e6-2"]).toEqual([0, 0]);
    expect([at.score, at.finalized, at.teacherFeedback, at.manualOverrides]).toEqual([0, false, "", {}]);
    expect(at.totalMarks).toBe(100);
  });
  it("corrupted saved state (a draft map that is not an object) never crashes delivery / restore / submit", async () => {
    const { p, aid, s } = await setup();
    const name = "platform/submissions/" + aid + "/st-s.json";
    p.mem.setJson(name, { ...p.mem.getJson(name), draftAnswers: "CORRUPTED", draftSavedAt: 12 });
    expect((await s.deliver(aid)).status).toBe(200);
    expect((await s.state(aid)).status).toBe(200);
    const sub = await s.submit(aid, { "e1-1": A.choice(1) });
    expect(sub.status).toBe(200);
    expect(s.attempt(aid).score).toBe(3);
  });
});

describe("20G security review — cross-role, cross-student, hostile payloads, logs", () => {
  it("REAL signed tokens: a student token (or none) never reaches a teacher route; a teacher-only exam body is never delivered to another class", async () => {
    vi.stubEnv("BUILDER_SESSION_SECRET", "builder-secret-20g-test-only-0123456789abcdef");
    vi.stubEnv("STUDENT_SESSION_SECRET", "student-secret-20g-test-only-0123456789abcdef");
    const p = createPlatform({ students: { "rt-s": "طالب" } });
    const { aid } = await publishAndAssign(p, examE());
    const { createStudentToken } = require_("../../src/lib/student-auth.js");
    const token = createStudentToken({ userId: "rt-s", authVersion: 1, code: "x", displayName: "x", classId: "cls-20g-cert" });
    const req = (url, body, method, headers) => ({ method, url: "https://app.example.test" + url, params: {}, headers: new Headers({ "content-type": "application/json", ...headers }), query: new URLSearchParams(), json: async () => body, text: async () => JSON.stringify(body) });
    const teacherRoutes = [
      [require_("../../src/functions/assignment-review.js").handler, req("/api/assignment-review?assignmentId=" + aid + "&studentId=rt-s&attemptNumber=1", undefined, "GET", { authorization: "Bearer " + token })],
      [require_("../../src/functions/exam-governance.js").handler, req("/api/exam-governance", { action: "publish", examId: "CERT20G-E-SHOW", requestId: "x", expectedStateVersion: 1 }, "POST", { authorization: "Bearer " + token })],
      [require_("../../src/functions/manage-assignments.js").handler, req("/api/assignments", { action: "create", classId: "cls-20g-cert", title: "x", examSnapshot: { examId: "CERT20G-E-SHOW" } }, "POST", { "x-builder-token": token })],
      [require_("../../src/functions/ai-exam-composer.js").handler, req("/api/ai-exam-composer", { stage: "plan" }, "POST", { authorization: "Bearer " + token })]
    ];
    for (const [h, r] of teacherRoutes) expect((await h(r, { getContainer: () => p.mem.container, container: p.mem.container })).status).toBe(401);
    // the real student session can deliver its own assignment; a forged token for a student of another class cannot
    const deliver = require_("../../src/functions/student-assignment.js").handler;
    const own = await deliver({ ...req("/api/student-assignment/" + aid, undefined, "GET", { "x-student-token": token }), params: { assignmentId: aid } }, { container: p.mem.container });
    expect(own.status).toBe(200);
    p.mem.setJson("platform/users/intruder.json", { schemaVersion: 3, role: "student", userId: "intruder", displayName: "x", code: "y", classId: "cls-other", active: true, archived: false, authVersion: 1 });
    const intruder = createStudentToken({ userId: "intruder", authVersion: 1, code: "y", displayName: "x", classId: "cls-20g-cert" });   // a claimed class is never trusted
    const r = await deliver({ ...req("/api/student-assignment/" + aid, undefined, "GET", { "x-student-token": intruder }), params: { assignmentId: aid } }, { container: p.mem.container });
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/sections|questions/);
  });
  it("each student sees ONLY its own submission state (no id parameter exists to name another student's record)", async () => {
    const p = createPlatform({ students: { "own-a": "أ", "own-b": "ب" } });
    const { aid } = await publishAndAssign(p, examE());
    const a = p.student("own-a"), b = p.student("own-b");
    await a.start(aid); await a.draft(aid, { "e1-1": A.choice(1) });
    await b.start(aid);
    const st = (await b.state(aid)).jsonBody.state;
    expect(st.draftAnswers).toEqual({});
    expect(JSON.stringify(st)).not.toMatch(/own-a/);
  });
  it("prototype pollution through a JSON body never reaches Object.prototype nor the stored document", async () => {
    const p = createPlatform({ students: { "pp-s": "طالب" } });
    const { aid } = await publishAndAssign(p, examE());
    const s = p.student("pp-s");
    await s.start(aid);
    const text = "{\"action\":\"saveDraft\",\"expectedAttemptNumber\":1,\"expectedStartedAt\":\"" + s.identity(aid).startedAt + "\",\"answers\":{\"__proto__\":{\"polluted\":1},\"constructor\":{\"prototype\":{\"polluted\":1}},\"e1-1\":{\"kind\":\"choice\",\"index\":1,\"__proto__\":{\"admin\":true}},\"e7-2\":{\"kind\":\"composite\",\"parts\":{\"__proto__\":{\"x\":1}},\"contexts\":{}}}}";
    const r = await s.raw(aid, JSON.parse(text));
    expect(r.status).toBe(200);
    expect({}.polluted).toBeUndefined();
    expect({}.admin).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("polluted");
    const stored = s.doc(aid).draftAnswers;
    expect(Object.getPrototypeOf(stored)).toBe(Object.prototype);
    expect(stored["e7-2"]).toEqual({ kind: "composite", parts: {}, contexts: {} });                     // the modern binder drops the key
    // OBSERVATION (design record §security, finding D3): legacy answers pass VERBATIM — an inert OWN "__proto__" data property and an unknown
    // "constructor" key are stored as data. Nothing reads them: no Object.assign / for-in copy over answers exists in the API, grading reads
    // named fields only — proven by grading below.
    expect(Object.getPrototypeOf(stored["e1-1"])).toBe(Object.prototype);
    expect(stored["e1-1"].admin).toBeUndefined();
    const sub = await s.submit(aid, JSON.parse(text).answers);
    expect(sub.status).toBe(200);
    expect(ledgerOf(s.attempt(aid)).questions["e1-1"]).toEqual([3, 0]);
  });
  it("hostile sizes: 1001 SmartSim actions, a 300-command CLI overflow, a deeply nested answer and a >1 MiB composite answer are refused or bounded — never crash, never stored", async () => {
    const p = createPlatform({ students: { "hz-s": "طالب" } });
    const { aid } = await publishAndAssign(p, examE());
    const s = p.student("hz-s");
    await s.start(aid);
    let deep = { kind: "text", value: "x" }; for (let i = 0; i < 5000; i++) deep = { kind: "text", value: deep };
    const answers = {
      "e6-2": A.sim("networkTopology", 1, Array.from({ length: 1001 }, () => ({ type: "switch.command", deviceId: "sw1", command: "enable" }))),
      "e6-1": A.cli(Array.from({ length: 301 }, () => "enable")),
      "e7-2": A.composite({ c1: A.text("y".repeat(1_100_000)) }),
      "e2-1": deep
    };
    const { "e2-1": deepAnswer, ...bounded } = answers;
    const r = await s.draft(aid, bounded);
    expect(r.status).toBe(200);
    const stored = s.doc(aid).draftAnswers;
    expect(stored["e6-2"]).toBeUndefined();                                                     // SMARTSIM_ACTIONS_TOO_MANY
    expect(stored["e6-1"]).toBeUndefined();                                                     // NETCLI_HISTORY_TOO_LARGE
    expect(stored["e7-2"]).toBeUndefined();                                                     // COMPOSITE_ANSWER_TOO_LARGE
    // a 5000-level nested body is refused before ingest (nothing stored, no crash; OBSERVATION: the refusal reads as a stale-attempt 409)
    const d = await s.draft(aid, { "e2-1": deepAnswer });
    expect([400, 409]).toContain(d.status);
    expect(s.doc(aid).draftAnswers["e2-1"]).toBeUndefined();
    const sub = await s.submit(aid, bounded);
    expect(sub.status).toBe(200);
    expect(JSON.stringify(s.attempt(aid).answers).length).toBeLessThan(10000);
  });
  it("logs never carry answers, source code, hidden tests, private values or student identity text", async () => {
    const events = [];
    const obs = { logInfo: (n, d) => events.push([n, d]), logWarn: (n, d) => events.push([n, d]), logError: (n, e, d) => events.push([n, String(e && e.message), d]) };
    const p = createPlatform({ students: { "log-s": "اسم الطالب السري" }, obs });
    const { aid } = await publishAndAssign(p, examE());
    const s = p.student("log-s");
    await s.start(aid);
    await s.draft(aid, { "e2-1": A.fields({ b1: "SECRET-ANSWER-20G" }) });
    await s.submit(aid, { "e6-3": A.code("print('SOURCE-20G')\n"), "e2-1": A.fields({ b1: "SECRET-ANSWER-20G" }) });
    await s.submit(aid, {});                                                            // a refused duplicate is logged too
    const job = p.runner.jobs()[0];
    await p.runner.callback(p.runner.callbackBody(job, ["5\n"]));
    await p.teacher.saveReview(aid, "log-s", { "e7-2::part::c1": { rubricAwards: { security: { levelId: "full" } }, comment: "TEACHER-COMMENT-20G" } });
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toMatch(/SECRET-ANSWER-20G|SOURCE-20G|CERT20G-PRIVATE|اسم الطالب السري|TEACHER-COMMENT-20G|expectedOutput|hmac|signature/i);
  });
});
