import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Phase 17C — Independent Security Review Fix 1: HMAC key separation must FAIL CLOSED under partial / disabled runner
// configuration. Two independent secrets protect the two directions:
//     CODING_RUNNER_HMAC_KEY              SmartAssess API → Coding Runner (request signing)
//     CODING_GRADING_CALLBACK_HMAC_KEY    Coding Runner → SmartAssess grading callback
// Invariant: if both are configured and EQUAL (exact configured bytes), official callback authentication is unavailable —
// always, whatever the runner URL / kill switch / validity says. And the converse: a correctly separated callback key keeps
// working when outbound runner traffic is disabled (an already-dispatched job may still return its signed result).
// Fail-first on 68afc136: K3–K6 and the incident misconfiguration variant were accepted (the equality check only ran when
// readCodingRunnerConfig(env).enabled was true).
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = () => require_("../src/functions/student-submission.js");
const grading = () => require_("../src/functions/coding-grading.js");
const { readCodingRunnerConfig } = require_("../src/lib/coding/runner-config.js");
const separation = () => require_("../src/lib/coding/hmac-key-separation.js");

const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const ANSWERS = { auto1: F.code("a,b=map(int,input().split());print('SUM='+str(a+b))\n") };
const SAME = "test-only-shared-key-for-both-directions-0123456789";       // TEST value configured for BOTH directions

/** Submits an attempt with a WORKING runner configuration (separate keys) → one dispatched official job. */
async function dispatched() {
  const ctx = F.seed({ a: F.assignment({}, { short: false }) });
  const fetch = F.runnerFetch();
  const r = await submission().handler(F.studentRequest(F.submitBody(ANSWERS)), { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch }, null);
  expect(r.status).toBe(200);
  const job = fetch.jobs()[0];
  const target = () => ctx.getJson(F.SUB).attempts[0].codingGrading.targets.auto1;
  expect(target().state).toBe("dispatched");
  return { ctx, job, target, etag: () => ctx.store.get(F.SUB).etag };
}
/** Sends one callback signed with `signKey` to the REAL route under `env`. */
const callback = (ctx, body, env, signKey) => grading().callbackHandler(F.callbackRequest(body, { key: signKey }), { getContainer: () => ctx.container, env });

/** The partial / disabled runner configurations of the finding: every one leaves readCodingRunnerConfig(env).enabled false. */
const PARTIAL = {
  K3_url_missing: { CODING_RUNNER_HMAC_KEY: SAME, CODING_GRADING_CALLBACK_HMAC_KEY: SAME },
  K4_runner_disabled: { CODING_RUNNER_URL: F.ENV.CODING_RUNNER_URL, CODING_RUNNER_ENABLED: "false", CODING_RUNNER_HMAC_KEY: SAME, CODING_GRADING_CALLBACK_HMAC_KEY: SAME },
  K5_url_not_a_url: { CODING_RUNNER_URL: "not a url", CODING_RUNNER_HMAC_KEY: SAME, CODING_GRADING_CALLBACK_HMAC_KEY: SAME },
  K5_url_wrong_scheme: { CODING_RUNNER_URL: "ftp://runner.example.test", CODING_RUNNER_HMAC_KEY: SAME, CODING_GRADING_CALLBACK_HMAC_KEY: SAME },
  K5_url_plain_http_remote: { CODING_RUNNER_URL: "http://runner.example.test", CODING_RUNNER_HMAC_KEY: SAME, CODING_GRADING_CALLBACK_HMAC_KEY: SAME },
  K5_url_with_credentials: { CODING_RUNNER_URL: "https://u:p@runner.example.test", CODING_RUNNER_HMAC_KEY: SAME, CODING_GRADING_CALLBACK_HMAC_KEY: SAME },
  K6_kill_switch_malformed: { CODING_RUNNER_URL: F.ENV.CODING_RUNNER_URL, CODING_RUNNER_ENABLED: "maybe", CODING_RUNNER_HMAC_KEY: SAME, CODING_GRADING_CALLBACK_HMAC_KEY: SAME },
  K6_url_with_query: { CODING_RUNNER_URL: "https://runner.example.test/?x=1", CODING_RUNNER_HMAC_KEY: SAME, CODING_GRADING_CALLBACK_HMAC_KEY: SAME }
};

describe("Review Fix 1 — the key-separation authority depends ONLY on the two configured secrets", () => {
  it("separate keys → the callback key; equal keys → null in EVERY runner configuration state (enabled, missing URL, disabled, malformed, incomplete)", () => {
    const { resolveCallbackKey } = separation();
    expect(resolveCallbackKey(F.ENV)).toBe(F.CALLBACK_KEY);
    expect(resolveCallbackKey({ ...F.ENV, CODING_RUNNER_ENABLED: "false" })).toBe(F.CALLBACK_KEY);                  // K7 shape
    expect(resolveCallbackKey({ CODING_GRADING_CALLBACK_HMAC_KEY: F.CALLBACK_KEY })).toBe(F.CALLBACK_KEY);            // no runner config at all
    expect(resolveCallbackKey({ ...F.ENV, CODING_GRADING_CALLBACK_HMAC_KEY: F.RUNNER_KEY })).toBeNull();             // K2 shape
    for (const [name, env] of Object.entries(PARTIAL)) {
      expect(readCodingRunnerConfig(env).enabled, name + " precondition: the runner config is NOT enabled").toBe(false);
      expect(resolveCallbackKey(env), name).toBeNull();
    }
    expect(resolveCallbackKey({})).toBeNull();
    expect(resolveCallbackKey({ CODING_GRADING_CALLBACK_HMAC_KEY: "short" })).toBeNull();
  });
  it("equality is on the EXACT configured bytes — no trimming, case folding or other normalisation in either direction", () => {
    const { resolveCallbackKey } = separation();
    for (const runnerKey of [F.CALLBACK_KEY.toUpperCase(), F.CALLBACK_KEY + " ", " " + F.CALLBACK_KEY, F.CALLBACK_KEY + "\n", F.CALLBACK_KEY.slice(0, -1)]) {
      expect(resolveCallbackKey({ CODING_RUNNER_HMAC_KEY: runnerKey, CODING_GRADING_CALLBACK_HMAC_KEY: F.CALLBACK_KEY }), JSON.stringify(runnerKey)).toBe(F.CALLBACK_KEY);
    }
    expect(resolveCallbackKey({ CODING_RUNNER_HMAC_KEY: F.CALLBACK_KEY, CODING_GRADING_CALLBACK_HMAC_KEY: F.CALLBACK_KEY })).toBeNull();
  });
});

describe("Review Fix 1 — the REAL callback route (K1–K7)", () => {
  it("K1 separate keys + valid runner URL → the signed callback is applied", async () => {
    const { ctx, job, target } = await dispatched();
    const r = await callback(ctx, F.callbackBody(job, F.CANARY.expected), F.ENV, F.CALLBACK_KEY);
    expect(r.status).toBe(200); expect(r.jsonBody).toMatchObject({ applied: true, state: "complete" });
    expect(target().result.automaticScore).toBe(10);
  });
  it("K2 same key + VALID runner config → 503 GRADING_UNAVAILABLE before signature verification / application", async () => {
    const { ctx, job, target, etag } = await dispatched();
    const env = { ...F.ENV, CODING_RUNNER_HMAC_KEY: SAME, CODING_GRADING_CALLBACK_HMAC_KEY: SAME };
    expect(readCodingRunnerConfig(env).enabled).toBe(true);
    const before = etag();
    const r = await callback(ctx, F.callbackBody(job, F.CANARY.expected), env, SAME);
    expect(r.status).toBe(503); expect(r.jsonBody).toEqual({ ok: false, code: "GRADING_UNAVAILABLE" });
    expect(etag()).toBe(before); expect(target().state).toBe("dispatched");
  });
  for (const [name, env] of Object.entries(PARTIAL)) {
    it(name.replace(/_/g, " ") + " → same key still fails CLOSED (503, no mutation)", async () => {
      const { ctx, job, target, etag } = await dispatched();
      expect(readCodingRunnerConfig(env).enabled).toBe(false);
      const before = etag();
      const r = await callback(ctx, F.callbackBody(job, F.CANARY.expected), env, SAME);
      expect(r.status).toBe(503); expect(r.jsonBody).toEqual({ ok: false, code: "GRADING_UNAVAILABLE" });
      expect(etag()).toBe(before); expect(target().state).toBe("dispatched"); expect(target().result).toBeUndefined();
    });
  }
  it("K7 separate keys + runner DISABLED → a callback for an already-dispatched job is still authenticated and applied", async () => {
    const { ctx, job, target } = await dispatched();
    const env = { ...F.ENV, CODING_RUNNER_ENABLED: "false" };
    expect(readCodingRunnerConfig(env).enabled).toBe(false);
    const r = await callback(ctx, F.callbackBody(job, F.CANARY.expected), env, F.CALLBACK_KEY);
    expect(r.status).toBe(200); expect(target().state).toBe("complete");
    // separate keys + runner config entirely absent: still applies (callback availability never depends on outbound runner)
    const second = await dispatched();
    const r2 = await callback(second.ctx, F.callbackBody(second.job, F.CANARY.expected), { CODING_GRADING_CALLBACK_HMAC_KEY: F.CALLBACK_KEY }, F.CALLBACK_KEY);
    expect(r2.status).toBe(200); expect(second.target().state).toBe("complete");
  });
  it("exact-bytes equality at the route: a runner key that differs only by case / whitespace does NOT disable a valid callback", async () => {
    for (const runnerKey of [F.CALLBACK_KEY.toUpperCase(), F.CALLBACK_KEY + " "]) {
      const { ctx, job, target } = await dispatched();
      const r = await callback(ctx, F.callbackBody(job, F.CANARY.expected), { CODING_RUNNER_URL: F.ENV.CODING_RUNNER_URL, CODING_RUNNER_HMAC_KEY: runnerKey, CODING_GRADING_CALLBACK_HMAC_KEY: F.CALLBACK_KEY }, F.CALLBACK_KEY);
      expect(r.status, JSON.stringify(runnerKey)).toBe(200); expect(target().state).toBe("complete");
    }
  });
  it("equal keys are refused even for an UNSIGNED request (401 first) — no configuration ever makes the route public", async () => {
    const { ctx, job, etag } = await dispatched();
    const before = etag();
    const r = await grading().callbackHandler(F.callbackRequest(F.callbackBody(job, F.CANARY.expected), { unsigned: true }), { getContainer: () => ctx.container, env: PARTIAL.K3_url_missing });
    expect(r.status).toBe(401); expect(etag()).toBe(before);
  });
});

describe("Review Fix 1 — incident response: stop new runner traffic, still accept outstanding signed results", () => {
  it("dispatched → operator sets CODING_RUNNER_ENABLED=false → new dispatch is unavailable, the outstanding result still applies with the SEPARATE callback key", async () => {
    const { ctx, job, target } = await dispatched();
    const disabled = { ...F.ENV, CODING_RUNNER_ENABLED: "false" };
    // new outbound work is stopped: a teacher retry cannot reach the runner
    const fetch = F.runnerFetch();
    const retry = await grading().regradeHandler(F.teacherRequest("/api/coding/regrade", { action: "retry", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" }), { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: disabled, fetch });
    expect(retry.status).toBe(200);
    expect(fetch.calls).toHaveLength(0);
    expect(target()).toMatchObject({ state: "retryable", technicalCode: "EXECUTION_UNAVAILABLE", jobId: job.jobId, revision: 1 });
    // the outstanding signed result (same job / revision / grading key) is still accepted and graded on the server
    const r = await callback(ctx, F.callbackBody(job, [F.CANARY.expected[0], "wrong", F.CANARY.expected[2]]), disabled, F.CALLBACK_KEY);
    expect(r.status).toBe(200);
    expect(target()).toMatchObject({ state: "complete", result: expect.objectContaining({ automaticScore: 6.67, passedWeight: 4, totalWeight: 6 }) });
    expect(ctx.getJson(F.SUB).attempts[0]).toMatchObject({ finalized: true, score: 6.67 });
  });
  it("misconfiguration variant: runner disabled AND the callback key equals the runner request key → the outstanding callback is REFUSED (503), nothing changes", async () => {
    const { ctx, job, target, etag } = await dispatched();
    const misconfigured = { CODING_RUNNER_URL: F.ENV.CODING_RUNNER_URL, CODING_RUNNER_ENABLED: "false", CODING_RUNNER_HMAC_KEY: F.RUNNER_KEY, CODING_GRADING_CALLBACK_HMAC_KEY: F.RUNNER_KEY };
    expect(readCodingRunnerConfig(misconfigured).enabled).toBe(false);
    const before = etag();
    const r = await callback(ctx, F.callbackBody(job, F.CANARY.expected), misconfigured, F.RUNNER_KEY);   // forged with the REQUEST key
    expect(r.status).toBe(503); expect(r.jsonBody).toEqual({ ok: false, code: "GRADING_UNAVAILABLE" });
    expect(etag()).toBe(before); expect(target().state).toBe("dispatched"); expect(target().result).toBeUndefined();
  });
});
