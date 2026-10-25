import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { handler as bank, INDEX_BLOB, SOURCES_PREFIX } from "../src/functions/bank-questions.js";

// QA-10 / QA-12 / QA-13 — authority and grading edges.
//
// Fail-first (QA on main c244cbab; fail-first run on 46ba9297):
//   QA-10  a question the bank PRESENTS as official through its exam code (imported under a custom source id) could be edited or
//          deleted by any teacher: the write guard looked at the source id only;
//   QA-12  a technical-failure callback that arrived DURING the dispatch HTTP call (target → retryable with its code) was then
//          overwritten by the dispatcher's "dispatched" — the code erased, the target parked until the ~30-minute recovery;
//   QA-13  a review override with a comment and no score stored score 0 (clamp(undefined)), which beat the automatic score.

const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = require_("../src/functions/student-submission.js");
const review = require_("../src/functions/assignment-review.js");
const grading = require_("../src/functions/coding-grading.js");
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const ANSWERS = { auto1: F.code("a,b=map(int,input().split());print('SUM='+str(a+b))\n"), sa1: { kind: "text", value: "x" } };

describe("QA-10 a question shown as official is read-only for every write", () => {
  const IMPORT = "import-teacher-20260301-abc123";
  let store;
  beforeEach(() => {
    store = new Map();
    store.set(SOURCES_PREFIX + IMPORT + ".json", { questions: [
      { id: IMPORT + "-1", sourceId: IMPORT, examCode: "791381", questionNumber: "1", section: "BASIC", type: "shortAnswer", text: "عرّف VLAN", options: [], answer: { mode: "manual", values: [] }, assets: [], classification: { topic: "SWITCHING", difficulty: 3 }, reviewStatus: "classified" },
      { id: IMPORT + "-2", sourceId: IMPORT, questionNumber: "2", section: "BASIC", type: "shortAnswer", text: "عرّف IP", options: [], answer: { mode: "manual", values: [] }, assets: [], classification: { topic: "SWITCHING", difficulty: 3 }, reviewStatus: "classified" }
    ] });
    store.set(INDEX_BLOB, { questions: [
      { id: IMPORT + "-1", sourceId: IMPORT, section: "BASIC", type: "shortAnswer", topic: "SWITCHING", difficulty: 3, reviewStatus: "classified", hasImage: false },
      { id: IMPORT + "-2", sourceId: IMPORT, section: "BASIC", type: "shortAnswer", topic: "SWITCHING", difficulty: 3, reviewStatus: "classified", hasImage: false }
    ] });
  });
  const deps = () => ({
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), getBankContainer: () => ({}), getPlatformContainer: () => ({}),
    downloadJsonOrNull: async (_c, k) => (store.has(k) ? structuredClone(store.get(k)) : null),
    listJson: async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix) && k.endsWith(".json")).map(([, v]) => structuredClone(v)),
    mutateJsonWithRetry: async (_c, k, fn) => { const next = await fn(store.has(k) ? structuredClone(store.get(k)) : null); store.set(k, structuredClone(next)); return next; },
    isConcurrencyConflict: () => false, recordAuditEvent: async () => {}, now: () => "2026-09-17T12:00:00.000Z"
  });
  const post = body => bank({ method: "POST", url: "http://x/bank-questions", params: {}, json: async () => body }, deps());
  const question = () => ({ section: "BASIC", topic: "SWITCHING", difficulty: 3, presentationType: "open", text: "نص معدّل", answer: { values: [] } });
  it("the listing marks it official, and update / delete are refused 403 with nothing written", async () => {
    const list = await bank({ method: "GET", url: "http://x/bank-questions", params: {} }, deps());
    expect(list.jsonBody.questions.find(q => q.id === IMPORT + "-1")).toMatchObject({ official: true });
    const before = JSON.stringify([...store.entries()]);
    expect((await post({ action: "update", id: IMPORT + "-1", question: question() })).status).toBe(403);
    expect((await post({ action: "delete", id: IMPORT + "-1" })).status).toBe(403);
    expect(JSON.stringify([...store.entries()])).toBe(before);
  });
  it("unchanged: the same source's question without an official exam code stays editable", async () => {
    expect((await post({ action: "update", id: IMPORT + "-2", question: question() })).status).toBe(200);
  });
});

function harness(fetch) {
  const ctx = F.seed();
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch };
  const cDeps = { getContainer: () => ctx.container, env: F.ENV };
  return {
    ctx,
    submit: () => submission.handler(F.studentRequest(F.submitBody(ANSWERS)), sDeps, quiet),
    callback: body => grading.callbackHandler(F.callbackRequest(body), cDeps, quiet),
    saveReview: overrides => review.handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides, teacherFeedback: "" }), tDeps, quiet),
    target: () => ctx.getJson(F.SUB).attempts[0].codingGrading.targets.auto1,
    grade: () => ctx.getJson(F.SUB).attempts[0].questionGrades.find(g => g.questionId === "auto1")
  };
}

describe("QA-12 a callback that lands during the dispatch HTTP call is never overwritten by 'dispatched'", () => {
  it("a technical failure stays retryable with its code (and the grade stays under review)", async () => {
    let h;
    h = harness(F.runnerFetch(async call => {
      const job = JSON.parse(call.body);
      await h.callback({ jobId: job.jobId, outcome: "failed", technicalCode: "SANDBOX_FAILED", cases: [] });
      return { status: 202, json: { ok: true, accepted: true, duplicate: false } };
    }));
    expect((await h.submit()).status).toBe(200);
    expect(h.target()).toMatchObject({ state: "retryable", technicalCode: "SANDBOX_FAILED" });
    expect(h.grade()).toMatchObject({ manualReview: true });
  });
  it("a teacher RETRY of a retryable target: a new technical failure during that dispatch keeps its own code (state unchanged, newer write)", async () => {
    let mode = "busy", h;
    h = harness(F.runnerFetch(async call => {
      if (mode === "busy") return { status: 503, json: { ok: false, code: "RUNNER_BUSY" } };
      await h.callback({ jobId: JSON.parse(call.body).jobId, outcome: "failed", technicalCode: "SANDBOX_FAILED", cases: [] });
      return { status: 202, json: { ok: true, accepted: true, duplicate: false } };
    }));
    await h.submit();
    expect(h.target()).toMatchObject({ state: "retryable", technicalCode: "RUNNER_BUSY" });
    mode = "fail-during-dispatch";
    const r = await grading.regradeHandler(F.teacherRequest("/api/coding/regrade", { action: "retry", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" }), { requireBuilderAuth: teacherAuth, getContainer: () => h.ctx.container, env: F.ENV, fetch: F.runnerFetch(async call => { await h.callback({ jobId: JSON.parse(call.body).jobId, outcome: "failed", technicalCode: "SANDBOX_FAILED", cases: [] }); return { status: 202, json: { ok: true, accepted: true, duplicate: false } }; }) }, quiet);
    expect(r.status).toBe(200);
    expect(h.target()).toMatchObject({ state: "retryable", technicalCode: "SANDBOX_FAILED" });
  });
  it("unchanged: a completed callback during dispatch stays complete; an ordinary dispatch is marked dispatched", async () => {
    let h;
    h = harness(F.runnerFetch(async call => {
      await h.callback(F.callbackBody(JSON.parse(call.body), F.CANARY.expected));
      return { status: 202, json: { ok: true, accepted: true, duplicate: false } };
    }));
    await h.submit();
    expect(h.target().state).toBe("complete");
    const plain = harness(F.runnerFetch());
    await plain.submit();
    expect(plain.target().state).toBe("dispatched");
  });
});

describe("QA-13 a review note without a mark never manufactures a 0", () => {
  it("a comment-only override keeps the automatic score and records the comment", async () => {
    const fetch = F.runnerFetch();
    const h = harness(fetch);
    await h.submit();
    await h.callback(F.callbackBody(fetch.jobs()[0], F.CANARY.expected));
    expect(h.grade().score).toBe(10);
    const r = await h.saveReview({ auto1: { comment: "أحسنت" } });
    expect(r.status).toBe(200);
    expect(h.grade().score).toBe(10);
    expect(h.ctx.getJson(F.SUB).attempts[0].manualOverrides.auto1).toMatchObject({ comment: "أحسنت" });
    expect(h.ctx.getJson(F.SUB).attempts[0].manualOverrides.auto1.score).toBeUndefined();
  });
  it("a comment-only save on a question the teacher already marked keeps that mark", async () => {
    const fetch = F.runnerFetch();
    const h = harness(fetch);
    await h.submit();
    await h.callback(F.callbackBody(fetch.jobs()[0], F.CANARY.expected));
    await h.saveReview({ auto1: { score: 7, comment: "" } });
    expect(h.grade().score).toBe(7);
    await h.saveReview({ auto1: { comment: "ملاحظة جديدة" } });
    expect(h.grade().score).toBe(7);
    expect(h.ctx.getJson(F.SUB).attempts[0].manualOverrides.auto1).toMatchObject({ score: 7, comment: "ملاحظة جديدة" });
  });
  it("unchanged: an explicit 0 is a mark", async () => {
    const fetch = F.runnerFetch();
    const h = harness(fetch);
    await h.submit();
    await h.callback(F.callbackBody(fetch.jobs()[0], F.CANARY.expected));
    await h.saveReview({ auto1: { score: 0, comment: "" } });
    expect(h.grade().score).toBe(0);
  });
});
