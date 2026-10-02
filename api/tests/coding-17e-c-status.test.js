import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Phase 17E-C — the STUDENT-SAFE async coding-grading status. Two independent dimensions:
//   • gradingStatus (notSubmitted | pendingReview | final) — is the overall mark final? (api/src/lib/grading-status.js, unchanged)
//   • autoGradingStatus (queued | processing | retrying | delayed | complete, omitted when not applicable) — where is the
//     OFFICIAL automatic coding grading of this completed attempt? Derived on the server ONLY from the authoritative
//     attempt.codingGrading.targets (studentCodingGradingStatus in official-grading.js) and projected as ONE aggregate field.
// Never exposed: job ids, revisions, target refs, grading keys, hashes, technical codes, recovery / delivery internals, per-case
// evidence, hidden tests. The student GET is READ-ONLY: polling it never dispatches, retries, regrades or writes.
// Fail-first on b41451ea: studentCodingGradingStatus and the autoGradingStatus field do not exist.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = () => require_("../src/functions/student-submission.js");
const dashboard = () => require_("../src/functions/student-dashboard.js");
const grading = () => require_("../src/functions/coding-grading.js");
const official = () => require_("../src/lib/coding/official-grading.js");

const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const OPEN = ["queued", "processing", "retrying", "delayed"];
const PUBLIC_RESULT_KEYS = ["attemptNumber", "submittedAt", "score", "totalMarks", "percentage", "manualReviewMarks", "finalized", "gradingStatus", "teacherFeedback", "timedOut", "startedAt", "endsAt", "extendedEndsAt", "endedAt", "endReason", "pauseCount", "autoGradingPending", "autoGradingStatus"];
// Everything the internal grading engine knows that a student must never see (identifiers, internals, evidence, secrets).
const LEAK = /cg_[A-Za-z0-9_-]{8,}|"jobId"|targetRef|"revision"|technicalCode|gradingKey|answerHash|questionFingerprint|"cases"|passedCount|testCount|passedWeight|automaticScore|"delivery"|lease|automaticAttempts|exhausted|"recovery"|callback|runner|HMAC|EXECUTION_|RUNNER_|STALE_|SWEEP|stale|hiddenTests|expectedOutput|SUM=CANARY|CANARY-REFERENCE|CANARY-HIDDEN-TITLE|"weight"|comparator|print\(|codingGrading"/;

function harness({ ctx = F.seed(), env = F.ENV, fetch = F.runnerFetch() } = {}) {
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env, fetch };
  return {
    ctx, fetch,
    submit: answers => submission().handler(F.studentRequest(F.submitBody(answers)), sDeps, quiet),
    get: () => submission().handler(F.studentRequest(null, "GET"), sDeps, quiet),
    dashboard: () => dashboard().handler({ method: "GET", url: "https://app.example.test/api/student-dashboard", params: {}, headers: new Headers({}), query: new URLSearchParams() }, { container: ctx.container, requireStudentAuth: studentAuth }, quiet),
    callback: body => grading().callbackHandler(F.callbackRequest(body), { getContainer: () => ctx.container, env }, quiet),
    attempt: (n = 1) => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n)
  };
}
const ANSWERED = { auto1: F.code("print(sum(map(int, input().split())))\n"), sa1: { kind: "text", value: "x" } };
const at = ms => new Date(Date.now() - ms).toISOString();
const attemptWith = targets => ({ codingGrading: { version: 1, targets } });
const T = (state, over = {}) => ({ mode: "hiddenTests", state, revision: 1, jobId: "cg_ABCDEFGHIJKLMNOPQRST", gradingKey: "k".repeat(64), updatedAt: at(1000), ...over });

describe("17E-C AS1–AS9 — studentCodingGradingStatus: ONE aggregate, deterministic priority, fail-safe", () => {
  const s = a => official().studentCodingGradingStatus(a);
  it("AS1 no coding targets → not applicable (undefined), for every shape", () => {
    for (const a of [null, undefined, {}, { codingGrading: null }, { codingGrading: {} }, attemptWith({}), attemptWith([])]) expect(s(a)).toBeUndefined();
  });
  it("AS2 all complete → complete", () => expect(s(attemptWith({ a: T("complete"), b: T("complete", { result: { outcome: "no-answer" } }) }))).toBe("complete"));
  it("AS3 only pending → queued", () => expect(s(attemptWith({ a: T("pending"), b: T("complete") }))).toBe("queued"));
  it("AS4 dispatched → processing (a workflow state, not runner telemetry; staleness is never shown)", () => {
    expect(s(attemptWith({ a: T("dispatched") }))).toBe("processing");
    expect(s(attemptWith({ a: T("dispatched", { updatedAt: at(5 * 3600 * 1000) }) }))).toBe("processing");
  });
  it("AS5 retryable → retrying", () => expect(s(attemptWith({ a: T("retryable", { technicalCode: "RUNNER_BUSY" }) }))).toBe("retrying"));
  it("AS6 pending + dispatched → processing", () => expect(s(attemptWith({ a: T("pending"), b: T("dispatched") }))).toBe("processing"));
  it("AS7 dispatched + retryable → retrying", () => expect(s(attemptWith({ a: T("dispatched"), b: T("retryable") }))).toBe("retrying"));
  it("AS8 complete + retryable → retrying (priority retrying > processing > queued; order-independent)", () => {
    expect(s(attemptWith({ a: T("complete"), b: T("retryable") }))).toBe("retrying");
    expect(s(attemptWith({ c: T("pending"), b: T("retryable"), a: T("dispatched") }))).toBe("retrying");
    expect(s(attemptWith({ c: T("pending"), a: T("dispatched"), b: T("complete") }))).toBe("processing");
  });
  it("AS8b recovery EXHAUSTED on every open target → delayed; one target still progressing automatically wins", () => {
    const ex = T("retryable", { recovery: { automaticAttempts: 8, exhausted: true } });
    expect(s(attemptWith({ a: ex, b: T("complete") }))).toBe("delayed");
    expect(s(attemptWith({ a: ex, b: T("dispatched") }))).toBe("processing");
    expect(s(attemptWith({ a: ex, b: T("retryable", { recovery: { automaticAttempts: 2, exhausted: false } }) }))).toBe("retrying");
  });
  it("AS9 malformed internal targets fail SAFE: never a raw internal value, never complete while something is unresolved", () => {
    expect(s(attemptWith({ a: T("bogus-internal-state") }))).toBe("processing");
    expect(s(attemptWith({ a: { state: 42 } }))).toBe("processing");
    expect(s(attemptWith({ a: null, b: "x", c: 7 }))).toBeUndefined();          // nothing that is a target at all
    expect(s(attemptWith({ a: null, b: T("complete") }))).toBe("complete");
    for (const st of ["pending", "dispatched", "retryable", "complete", "bogus", undefined]) expect(["queued", "processing", "retrying", "delayed", "complete"]).toContain(s(attemptWith({ a: T(st) })));
  });
  it("AS9b consistent with the legacy boolean: autoGradingPending ⇔ an OPEN student status", () => {
    const cases = [{}, attemptWith({ a: T("complete") }), attemptWith({ a: T("pending") }), attemptWith({ a: T("dispatched") }), attemptWith({ a: T("retryable") }), attemptWith({ a: T("retryable", { recovery: { exhausted: true } }) }), attemptWith({ a: T("weird") })];
    for (const a of cases) expect(official().autoGradingPending(a), JSON.stringify(a)).toBe(OPEN.includes(s(a)));
  });
});

describe("17E-C AS10–AS16 — the student projection carries ONLY the safe aggregate (real handlers)", () => {
  it("AS10 / AS16 submit → queued in the submit response; GET after dispatch → processing; autoGradingPending kept", async () => {
    const h = harness();
    const r = await h.submit(ANSWERED);
    expect(r.status).toBe(200);
    expect(r.jsonBody.result).toMatchObject({ autoGradingStatus: "queued", autoGradingPending: true, gradingStatus: "pendingReview" });
    expect(h.attempt().codingGrading.targets.auto1.state).toBe("dispatched");
    const g = await h.get();
    expect(g.jsonBody.state.latestResult).toMatchObject({ autoGradingStatus: "processing", autoGradingPending: true, gradingStatus: "pendingReview" });
    for (const k of Object.keys(g.jsonBody.state.latestResult)) expect(PUBLIC_RESULT_KEYS, k).toContain(k);
  });
  it("AS11 attempts[] history carries the SAME safe projection per attempt", async () => {
    const h = harness();
    await h.submit(ANSWERED);
    const st = (await h.get()).jsonBody.state;
    expect(st.attempts).toHaveLength(1);
    expect(st.latestResult.autoGradingStatus).toBe("processing");                        // the field is really present (not a vacuous equality)
    expect(st.attempts[0].autoGradingStatus).toBe("processing");
    expect(st.attempts[0]).toEqual(st.latestResult);
    for (const k of Object.keys(st.attempts[0])) expect(PUBLIC_RESULT_KEYS, k).toContain(k);
  });
  it("AS12–AS15 no technicalCode / jobId / revision / targetRef / gradingKey / hidden evidence anywhere in the student payloads (runner down → retrying)", async () => {
    for (const [fetch, env] of [[F.runnerFetch(), F.ENV], [F.runnerFetch("throw"), F.ENV], [F.runnerFetch(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } })), F.ENV], [F.runnerFetch(), { CODING_GRADING_CALLBACK_HMAC_KEY: F.CALLBACK_KEY }]]) {
      const h = harness({ fetch, env });
      const r = await h.submit(ANSWERED);
      const g = await h.get();
      const d = await h.dashboard();
      for (const body of [r.jsonBody, g.jsonBody, d.jsonBody]) expect(JSON.stringify(body)).not.toMatch(LEAK);
      const internal = h.attempt().codingGrading.targets.auto1;
      expect(g.jsonBody.state.latestResult.autoGradingStatus).toBe(internal.state === "retryable" ? "retrying" : "processing");
      expect(g.jsonBody.state.latestResult.gradingStatus).toBe("pendingReview");          // an outage is never a zero / never final
    }
  });
  it("AS16b callback completes a fully automatic exam → complete + final, autoGradingPending gone (two independent dimensions)", async () => {
    const h = harness({ ctx: F.seed({ a: F.assignment({}, { short: false }) }) });
    await h.submit({ auto1: ANSWERED.auto1 });
    const job = h.fetch.jobs()[0];
    expect((await h.callback(F.callbackBody(job, F.CANARY.expected))).status).toBe(200);
    const lr = (await h.get()).jsonBody.state.latestResult;
    expect(lr).toMatchObject({ autoGradingStatus: "complete", gradingStatus: "final", finalized: true, score: 10, percentage: 100 });
    expect(lr.autoGradingPending).toBeUndefined();
  });
  it("§31 coding hidden tests + a MANUAL question: coding complete while the mark stays pendingReview", async () => {
    const h = harness({ ctx: F.seed({ a: F.assignment({}, { manual: true, short: false }) }) });
    await h.submit({ auto1: ANSWERED.auto1, manual1: F.code("print('explain')\n") });
    await h.callback(F.callbackBody(h.fetch.jobs()[0], F.CANARY.expected));
    const lr = (await h.get()).jsonBody.state.latestResult;
    expect(lr).toMatchObject({ autoGradingStatus: "complete", gradingStatus: "pendingReview", finalized: false });
  });
  it("§33 / §34 no-coding exam and MANUAL-mode coding exam → no coding status, no autoGradingPending", async () => {
    const plain = harness({ ctx: F.seed({ a: F.assignment({}, { auto: F.shortQ(), short: false }) }) });
    await plain.submit({ sa1: { kind: "text", value: "x" } });
    const manual = harness({ ctx: F.seed({ a: F.assignment({}, { auto: F.manualQ(), short: false }) }) });
    await manual.submit({ manual1: F.code("print(1)\n") });
    for (const h of [plain, manual]) {
      const lr = (await h.get()).jsonBody.state.latestResult;
      expect(lr.autoGradingStatus).toBeUndefined();
      expect(lr.autoGradingPending).toBeUndefined();
      expect(h.fetch.calls).toHaveLength(0);
    }
  });
  it("§35 an unanswered hidden-test target is complete at submission (no runner) → complete immediately, nothing to wait for", async () => {
    const h = harness();
    const r = await h.submit({ sa1: { kind: "text", value: "x" } });
    expect(r.jsonBody.result).toMatchObject({ autoGradingStatus: "complete", gradingStatus: "final" });
    expect(r.jsonBody.result.autoGradingPending).toBeUndefined();
    expect(h.fetch.calls).toHaveLength(0);
  });
  it("§30 recovery exhausted (state stays retryable) → delayed; still never a zero / never final", async () => {
    const h = harness({ fetch: F.runnerFetch("throw") });
    await h.submit(ANSWERED);
    const doc = h.ctx.getJson(F.SUB);
    doc.attempts[0].codingGrading.targets.auto1.recovery = { automaticAttempts: 8, lastAutomaticAttemptAt: at(1000), exhausted: true };
    h.ctx.setJson(F.SUB, doc);
    const lr = (await h.get()).jsonBody.state.latestResult;
    expect(lr).toMatchObject({ autoGradingStatus: "delayed", gradingStatus: "pendingReview", autoGradingPending: true });
    expect(JSON.stringify(lr)).not.toMatch(LEAK);
  });
  it("§50 the student dashboard latestResult carries the same safe aggregate", async () => {
    const h = harness();
    await h.submit(ANSWERED);
    const d = await h.dashboard();
    expect(d.status).toBe(200);
    const item = d.jsonBody.assignments.find(x => x.assignmentId === F.AID);
    expect(item.latestResult).toMatchObject({ autoGradingStatus: "processing", autoGradingPending: true });
  });
  it("§14 / M8 the student GET (the polling endpoint) is READ-ONLY: a due / exhausted / stale target is never dispatched, retried or written", async () => {
    const h = harness({ fetch: F.runnerFetch("throw") });
    await h.submit(ANSWERED);
    const doc = h.ctx.getJson(F.SUB);
    Object.assign(doc.attempts[0].codingGrading.targets.auto1, { updatedAt: at(48 * 3600 * 1000) });   // long overdue for recovery
    h.ctx.setJson(F.SUB, doc);
    const calls = h.fetch.calls.length;
    const snapshot = JSON.stringify(h.ctx.names("platform/").sort().map(n => [n, h.ctx.getJson(n)]));
    for (let i = 0; i < 5; i++) expect((await h.get()).status).toBe(200);
    expect(h.fetch.calls).toHaveLength(calls);
    expect(JSON.stringify(h.ctx.names("platform/").sort().map(n => [n, h.ctx.getJson(n)]))).toBe(snapshot);
  });
});
