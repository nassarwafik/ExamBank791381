import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

// Phase 17D-A — the bounded, resumable, lease-protected recovery SWEEP and its signed HTTP trigger (SA-CODING-SWEEP-1):
//   • paginated storage scan (listBlobNamesPage) with a durable cursor: only the lease owner advances it, and only past pages it
//     actually scanned; the end of the listing closes a cycle; an invalid / tampered token resets safely;
//   • hard bounds: submissions scanned, dispatches, concurrency, an internal deadline (stops cleanly, cursor persisted);
//   • a CAS lease makes concurrent sweeps busy (409 SWEEP_BUSY), an expired lease is taken over;
//   • POST /api/coding/grading-sweep: a THIRD HMAC key, separated from the runner and callback keys on the raw secrets; auth
//     before ANY storage access; body exactly {"version":1}; aggregate-only responses and telemetry;
//   • the GitHub Actions scheduler signs with Node crypto only, treats 409 SWEEP_BUSY as success and every other non-2xx as
//     failure, and never prints the key or the signature;
//   • Azure SWA managed Functions are HTTP-only: no timer / queue / durable trigger exists in api/.
// Fail-first on e9a3ddb: none of grading-recovery.js, sweep-protocol.js, coding-grading-recovery.js, listBlobNamesPage, the
// scheduler script or the workflow exist.
const require_ = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const X = require_("./fixtures/coding-17d-a.js");
const { F, MIN, SWEEP_KEY } = X;
const R = () => require_("../src/lib/coding/grading-recovery.js");
const P = () => require_("../src/lib/coding/sweep-protocol.js");
const storage = () => require_("../src/lib/platform-storage.js");
const keys = () => require_("../src/lib/coding/hmac-key-separation.js");
const routes = () => require_("../src/functions/coding-grading-recovery.js");
const scheduler = () => import("../../scripts/coding-grading-sweep.mjs");

const CURSOR = "platform/system/coding-grading-recovery-v1.json";
const LOCK = "platform/system/coding-grading-sweep-lock.json";
const SP = "platform/submissions/";
const BODY = '{"version":1}';
const clock = (start = Date.now()) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };

/** n committed attempts with a due pending coding target (students sid(1..n), name-sorted). */
function population(n, hooks) {
  const ctx = F.seed({ a: F.assignment({}, { short: false }), doc: null, hooks });
  for (let i = 1; i <= n; i++) X.commitAttempt(ctx, { studentId: X.sid(i) });
  return ctx;
}
async function sweep(ctx, { fetch = F.runnerFetch(), env = X.ENV, now = clock(), limits, logs = [], requestId = "sw_" + crypto.randomBytes(6).toString("hex") } = {}) {
  const obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f && f.message || f)]) };
  return R().runCodingGradingRecoverySweep(ctx.container, { requestId, ...(limits ? { limits } : {}), obs }, { env, fetch, now });
}
const signedHeaders = (body = BODY, { key = SWEEP_KEY, timestamp = Math.floor(Date.now() / 1000), requestId = "sw_" + crypto.randomBytes(12).toString("hex") } = {}) => {
  const canonical = ["SA-CODING-SWEEP-1", "POST", "/api/coding/grading-sweep", String(timestamp), requestId, crypto.createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex")].join("\n");
  return { "x-sa-sweep-protocol": "1", "x-sa-sweep-timestamp": String(timestamp), "x-sa-sweep-request-id": requestId, "x-sa-sweep-signature": "v1=" + crypto.createHmac("sha256", Buffer.from(key, "utf8")).update(canonical, "utf8").digest("hex") };
};
const sweepRequest = (body = BODY, headers = signedHeaders(body)) => ({ method: "POST", url: "https://app.example.test/api/coding/grading-sweep", headers: new Headers({ "content-type": "application/json", ...headers }), text: async () => body, json: async () => JSON.parse(body) });
/** Wraps a container so every storage access is counted (auth must happen before ANY of them). */
function counted(container) {
  const n = { count: 0 };
  const c = new Proxy(container, { get(t, p) { const v = t[p]; return typeof v === "function" ? (...a) => { n.count++; return v.apply(t, a); } : v; } });
  return { c, n };
}

describe("R2 — paginated listing (listBlobNamesPage); listBlobNames unchanged", () => {
  it("R2 pages in name order, .json only, opaque token, null at the end; an invalid token is reported as such", async () => {
    const { listBlobNamesPage, listBlobNames } = storage();
    const ctx = F.seed({ doc: null });
    for (const s of ["a", "b", "c", "d", "e"]) ctx.setJson(SP + "x/" + s + ".json", { s });
    ctx.store.set(SP + "x/zz.txt", { content: Buffer.from("t"), etag: "e" });
    const p1 = await listBlobNamesPage(ctx.container, SP, { maxPageSize: 2 });
    expect(p1.names).toEqual([SP + "x/a.json", SP + "x/b.json"]);
    expect(typeof p1.continuationToken).toBe("string");
    const p2 = await listBlobNamesPage(ctx.container, SP, { maxPageSize: 2, continuationToken: p1.continuationToken });
    expect(p2.names).toEqual([SP + "x/c.json", SP + "x/d.json"]);
    const p3 = await listBlobNamesPage(ctx.container, SP, { maxPageSize: 2, continuationToken: p2.continuationToken });
    expect(p3.names).toEqual([SP + "x/e.json"]);                                                    // zz.txt is not JSON
    expect(p3.continuationToken).toBeNull();
    await expect(listBlobNamesPage(ctx.container, SP, { maxPageSize: 2, continuationToken: "tampered" })).rejects.toMatchObject({ code: "INVALID_CONTINUATION_TOKEN" });
    expect((await listBlobNames(ctx.container, SP)).sort()).toEqual(["a", "b", "c", "d", "e"].map(s => SP + "x/" + s + ".json"));
  });
});

describe("R16–R21 — bounded, resumable, lease-protected sweep", () => {
  it("R16 the durable cursor resumes across sweeps; the end of the listing closes a cycle (null token, cycle++)", async () => {
    const ctx = population(5), fetch = F.runnerFetch(), limits = { pageSize: 2, maxScanned: 2 };
    const r1 = await sweep(ctx, { fetch, limits });
    expect(r1).toMatchObject({ scanned: 2, dispatched: 2, cycleCompleted: false });
    expect(ctx.getJson(CURSOR)).toMatchObject({ schemaVersion: 1, cycle: 0 });
    expect(typeof ctx.getJson(CURSOR).continuationToken).toBe("string");
    const r2 = await sweep(ctx, { fetch, limits });
    expect(r2).toMatchObject({ scanned: 2, dispatched: 2, cycleCompleted: false });
    const r3 = await sweep(ctx, { fetch, limits });
    expect(r3).toMatchObject({ scanned: 1, dispatched: 1, cycleCompleted: true, cycle: 1 });
    expect(ctx.getJson(CURSOR)).toMatchObject({ continuationToken: null, cycle: 1 });
    expect(new Set(fetch.jobs().map(j => j.jobId)).size).toBe(5);                                  // every student exactly once
    expect(fetch.calls).toHaveLength(5);
  });

  it("R16b an invalid / tampered / malformed cursor resets safely to the start of the listing", async () => {
    for (const bad of [{ schemaVersion: 1, continuationToken: "tampered", cycle: 3 }, { schemaVersion: 1, continuationToken: 42, cycle: "x" }, { schemaVersion: 1, continuationToken: "x".repeat(5000), cycle: 0 }, "nonsense"]) {
      const ctx = population(3);
      ctx.setJson(CURSOR, bad);
      const fetch = F.runnerFetch(), r = await sweep(ctx, { fetch });
      expect(r, JSON.stringify(bad).slice(0, 40)).toMatchObject({ status: "completed", cursorReset: true, scanned: 3, dispatched: 3, cycleCompleted: true });
      expect(ctx.getJson(CURSOR).continuationToken).toBeNull();
    }
  });

  it("R17 hard bounds: scanned ≤ maxScanned, dispatches ≤ maxDispatches, in-flight ≤ concurrency; defaults are within policy", async () => {
    const { SWEEP_LIMITS } = R();
    expect(SWEEP_LIMITS.maxScanned).toBeGreaterThanOrEqual(100); expect(SWEEP_LIMITS.maxScanned).toBeLessThanOrEqual(250);
    expect(SWEEP_LIMITS.maxDispatches).toBe(12);
    expect(SWEEP_LIMITS.concurrency).toBe(4);
    expect(SWEEP_LIMITS.deadlineMs).toBeGreaterThanOrEqual(25000); expect(SWEEP_LIMITS.deadlineMs).toBeLessThanOrEqual(30000);
    expect(SWEEP_LIMITS.leaseTtlMs).toBeGreaterThanOrEqual(2 * MIN); expect(SWEEP_LIMITS.leaseTtlMs).toBeLessThanOrEqual(5 * MIN);
    expect(Object.isFrozen(SWEEP_LIMITS)).toBe(true);
    const ctx = population(30);
    let inFlight = 0, peak = 0;
    const fetch = F.runnerFetch(async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise(r => setTimeout(r, 5)); inFlight--; return { status: 202, json: { ok: true, accepted: true, duplicate: false } }; });
    const r1 = await sweep(ctx, { fetch, limits: { maxDispatches: 5, concurrency: 2 } });
    expect(r1).toMatchObject({ dispatched: 5, stoppedBy: "dispatch-budget", cycleCompleted: false });
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBe(2);
    expect(ctx.getJson(CURSOR) && ctx.getJson(CURSOR).continuationToken).toBeFalsy();               // that page was not finished
    const r2 = await sweep(ctx, { fetch, limits: { maxDispatches: 5, concurrency: 2 } });
    expect(r2.dispatched).toBe(5);
    expect(new Set(fetch.jobs().map(j => j.jobId)).size).toBe(10);                                 // the next five, no repeats
    const big = population(12);
    const r3 = await sweep(big, { fetch: F.runnerFetch(), limits: { maxScanned: 7, pageSize: 3 } });
    expect(r3.scanned).toBe(7);
    expect(r3.stoppedBy).toBe("scan-budget");
  });

  it("R18 the internal deadline stops the sweep cleanly; the cursor only moves past fully scanned pages; nothing is lost or repeated", async () => {
    const ctx = population(10), now = clock();
    const slow = F.runnerFetch(async () => { now.advance(10 * 1000); return { status: 202, json: { ok: true, accepted: true, duplicate: false } }; });
    const r = await sweep(ctx, { fetch: slow, now, limits: { pageSize: 2, concurrency: 1, deadlineMs: 25000 } });
    expect(r.stoppedBy).toBe("deadline");
    expect(r.dispatched).toBeGreaterThanOrEqual(1);
    expect(r.dispatched).toBeLessThanOrEqual(3);
    expect(ctx.has(LOCK)).toBe(false);                                                               // the lease is released
    const fetch = F.runnerFetch();
    for (let i = 0; i < 3; i++) await sweep(ctx, { fetch });
    const all = [...slow.jobs(), ...fetch.jobs()].map(j => j.jobId);
    expect(new Set(all).size).toBe(10);
    expect(all).toHaveLength(10);                                                                   // no target dispatched twice
  });

  it("R19 lease: a concurrent sweep is busy (no scan, no dispatch); an expired lease is taken over; CAS admits exactly one owner", async () => {
    const { acquireSweepLease, releaseSweepLease } = R();
    let pages = 0;
    const ctx = population(2, { onListPage: () => { pages++; } });
    const nowMs = Date.now();
    expect(await acquireSweepLease(ctx.container, { requestId: "sw_holder01", nowMs })).toMatchObject({ ok: true });
    expect(ctx.getJson(LOCK)).toMatchObject({ owner: "sw_holder01" });
    const lk = ctx.getJson(LOCK);
    expect(Date.parse(lk.expiresAt) - Date.parse(lk.acquiredAt)).toBeGreaterThanOrEqual(2 * MIN);
    expect(Date.parse(lk.expiresAt) - Date.parse(lk.acquiredAt)).toBeLessThanOrEqual(5 * MIN);
    const fetch = F.runnerFetch(), logs = [];
    const busy = await sweep(ctx, { fetch, logs });
    expect(busy).toMatchObject({ status: "busy" });
    expect(pages).toBe(0);
    expect(fetch.calls).toHaveLength(0);
    expect(logs.map(l => l[0])).toContain("coding.autoGrade.recovery.busy");
    await releaseSweepLease(ctx.container, { requestId: "sw_holder01" });
    // an expired lease (crashed holder) is taken over
    ctx.setJson(LOCK, { schemaVersion: 1, owner: "sw_crashed01", acquiredAt: new Date(nowMs - 10 * MIN).toISOString(), expiresAt: new Date(nowMs - 6 * MIN).toISOString() });
    const ok = await sweep(ctx, { fetch });
    expect(ok.status).toBe("completed");
    expect(fetch.calls).toHaveLength(2);
    // released after the sweep: another sweep can run immediately
    expect((await acquireSweepLease(ctx.container, { requestId: "sw_after001", nowMs: Date.now() })).ok).toBe(true);
    await releaseSweepLease(ctx.container, { requestId: "sw_after001" });
    // a release by a non-owner never frees someone else's lease
    await acquireSweepLease(ctx.container, { requestId: "sw_owner001", nowMs: Date.now() });
    await releaseSweepLease(ctx.container, { requestId: "sw_intruder" });
    expect(ctx.getJson(LOCK).owner).toBe("sw_owner001");
    await releaseSweepLease(ctx.container, { requestId: "sw_owner001" });
    // CAS: two simultaneous acquisitions → exactly one owner
    const both = await Promise.all([acquireSweepLease(ctx.container, { requestId: "sw_racer_a1", nowMs: Date.now() }), acquireSweepLease(ctx.container, { requestId: "sw_racer_b1", nowMs: Date.now() })]);
    expect(both.filter(x => x.ok)).toHaveLength(1);
  });

  it("R20 only the lease owner advances the cursor: a lease lost mid-sweep stops the sweep and leaves the cursor untouched", async () => {
    let stolen = false;
    const ctx = population(4, { onListPage: () => {
      if (stolen) return;
      stolen = true;
      ctx.setJson(LOCK, { schemaVersion: 1, owner: "sw_thief0001", acquiredAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 4 * MIN).toISOString() });
    } });
    const r = await sweep(ctx, { fetch: F.runnerFetch(), limits: { pageSize: 2 } });
    expect(r.leaseLost).toBe(true);
    expect(ctx.has(CURSOR)).toBe(false);
    expect(ctx.getJson(LOCK).owner).toBe("sw_thief0001");                                           // never released by the loser
  });

  it("R21 results and telemetry are aggregate-only: no student / job / grading-key / source / hidden-test data", async () => {
    const ctx = population(3), logs = [];
    X.commitAttempt(ctx, { studentId: F.S1 });
    const r = await sweep(ctx, { logs });
    const allowed = new Set(["ok", "status", "stoppedBy", "scanned", "pages", "eligible", "dispatched", "retryable", "exhausted", "skipped", "errors", "cycle", "cycleCompleted", "cursorReset", "leaseLost", "durationMs"]);
    for (const k of Object.keys(r)) expect(allowed.has(k), k).toBe(true);
    for (const v of Object.values(r)) expect(["number", "string", "boolean"]).toContain(typeof v);
    const text = JSON.stringify(r) + JSON.stringify(logs);
    for (const leak of [F.S1, X.sid(1), X.sid(2), "cg_", "gradingKey", "SUM=", "input().split", F.CANARY.expected[0], F.CANARY.title, F.CANARY.studentName, F.AID, SWEEP_KEY, F.RUNNER_KEY, F.CALLBACK_KEY]) expect(text).not.toContain(leak);
    const events = logs.map(l => l[0]);
    expect(events).toContain("coding.autoGrade.recovery.started");
    expect(events).toContain("coding.autoGrade.recovery.completed");
    expect(ctx.names("platform/audit/").filter(n => JSON.stringify(ctx.getJson(n)).includes("recovery"))).toEqual([]);    // no per-sweep audit flood
  });
});

describe("R22–R26 — SA-CODING-SWEEP-1 and POST /api/coding/grading-sweep", () => {
  it("R22 the protocol pins the canonical bytes and is NOT interchangeable with the runner / callback protocols", () => {
    const { SWEEP_PROTOCOL, SWEEP_PATH, signSweepRequest, verifySweepRequest } = P();
    const { signCallbackRequest, verifyCallbackRequest } = require_("../src/lib/coding/callback-protocol.js");
    expect(SWEEP_PROTOCOL).toBe("SA-CODING-SWEEP-1");
    expect(SWEEP_PATH).toBe("/api/coding/grading-sweep");
    const ts = Math.floor(Date.now() / 1000), rid = "sw_parity0001_abcdefghij";
    const ours = signSweepRequest({ key: SWEEP_KEY, timestamp: ts, requestId: rid, body: BODY });
    expect(ours).toEqual(signedHeaders(BODY, { timestamp: ts, requestId: rid }));                   // independent implementation
    const v = (headers, over = {}) => verifySweepRequest({ key: SWEEP_KEY, headers: new Headers(headers), body: Buffer.from(over.body ?? BODY, "utf8"), nowMs: over.nowMs ?? Date.now() });
    expect(v(ours)).toEqual({ ok: true, requestId: rid });
    expect(v(ours, { body: '{"version":2}' })).toMatchObject({ ok: false, reason: "signature" });
    expect(v(signedHeaders(BODY, { key: "y".repeat(40) }))).toMatchObject({ ok: false, reason: "signature" });
    expect(v(ours, { nowMs: (ts + 301) * 1000 })).toMatchObject({ ok: false, reason: "stale" });
    expect(v(ours, { nowMs: (ts - 301) * 1000 })).toMatchObject({ ok: false, reason: "stale" });
    // HMAC is checked BEFORE the timestamp: a stale request with a bad signature reports the signature
    expect(v(signedHeaders(BODY, { key: "y".repeat(40), timestamp: ts - 1000 }))).toMatchObject({ ok: false, reason: "signature" });
    expect(v({ ...ours, "x-sa-sweep-protocol": "2" })).toMatchObject({ ok: false });
    expect(v({ ...ours, "x-sa-sweep-request-id": "bad id!" })).toMatchObject({ ok: false });
    expect(v({ ...ours, "x-sa-sweep-timestamp": "12" })).toMatchObject({ ok: false });
    expect(v({ ...ours, "x-sa-sweep-signature": "v2=" + "0".repeat(64) })).toMatchObject({ ok: false });
    expect(verifySweepRequest({ key: "", headers: new Headers(ours), body: Buffer.from(BODY), nowMs: Date.now() }).ok).toBe(false);
    // a callback-protocol signature (even under the SAME key) is never a sweep signature, and vice versa
    const cb = signCallbackRequest({ key: SWEEP_KEY, timestamp: ts, requestId: rid, body: BODY });
    expect(v(cb).ok).toBe(false);
    const cbAsSweep = { "x-sa-sweep-protocol": "1", "x-sa-sweep-timestamp": String(ts), "x-sa-sweep-request-id": rid, "x-sa-sweep-signature": cb["x-sa-callback-signature"] };
    expect(v(cbAsSweep)).toMatchObject({ ok: false, reason: "signature" });
    const sweepAsCb = { "x-sa-callback-protocol": "1", "x-sa-callback-timestamp": String(ts), "x-sa-callback-request-id": rid, "x-sa-callback-signature": ours["x-sa-sweep-signature"] };
    expect(verifyCallbackRequest({ key: SWEEP_KEY, headers: new Headers(sweepAsCb), body: Buffer.from(BODY), nowMs: Date.now() }).ok).toBe(false);
  });

  it("R23 resolveSweepKey: a third key, fail closed when missing / weak / equal (raw) to the runner or callback key — any partial config", () => {
    const { resolveSweepKey } = keys();
    expect(resolveSweepKey(X.ENV)).toBe(SWEEP_KEY);
    for (const bad of [undefined, "", "short", SWEEP_KEY + " ", " " + SWEEP_KEY, "a b".repeat(20), 42]) expect(resolveSweepKey({ ...X.ENV, CODING_GRADING_SWEEP_HMAC_KEY: bad }), String(bad)).toBeNull();
    const partials = [
      {}, { CODING_RUNNER_URL: "" }, { CODING_RUNNER_URL: "not a url" }, { CODING_RUNNER_ENABLED: "false" }, { CODING_RUNNER_ENABLED: "garbage" },
      { CODING_GRADING_CALLBACK_HMAC_KEY: undefined }, { CODING_RUNNER_HMAC_KEY: undefined }
    ];
    for (const p of partials) {
      expect(resolveSweepKey({ ...X.ENV, ...p, CODING_RUNNER_HMAC_KEY: SWEEP_KEY }), "= runner " + JSON.stringify(p)).toBeNull();
      expect(resolveSweepKey({ ...X.ENV, ...p, CODING_GRADING_CALLBACK_HMAC_KEY: SWEEP_KEY }), "= callback " + JSON.stringify(p)).toBeNull();
    }
    expect(resolveSweepKey({ CODING_GRADING_SWEEP_HMAC_KEY: SWEEP_KEY })).toBe(SWEEP_KEY);       // independent of runner settings
    expect(resolveSweepKey({ ...X.ENV, CODING_RUNNER_HMAC_KEY: SWEEP_KEY.toUpperCase() })).toBe(SWEEP_KEY);   // exact bytes
  });

  it("R24 auth order: unsigned → 401, key unusable → 503, oversized → 400, bad HMAC / stale → 401, strict body → 400 — all before ANY storage access", async () => {
    const { sweepHandler } = routes();
    const ctx = population(1);
    const call = async (req, env = X.ENV) => { const { c, n } = counted(ctx.container); const r = await sweepHandler(req, { getContainer: () => c, env, fetch: F.runnerFetch() }, null); return { r, n: n.count }; };
    const cases = [
      ["unsigned", sweepRequest(BODY, {}), X.ENV, 401, "UNAUTHORIZED"],
      ["unsigned + no key", sweepRequest(BODY, {}), F.ENV, 401, "UNAUTHORIZED"],
      ["no key", sweepRequest(), F.ENV, 503, "SWEEP_UNAVAILABLE"],
      ["key = runner", sweepRequest(), { ...X.ENV, CODING_RUNNER_HMAC_KEY: SWEEP_KEY }, 503, "SWEEP_UNAVAILABLE"],
      ["key = callback", sweepRequest(), { ...X.ENV, CODING_GRADING_CALLBACK_HMAC_KEY: SWEEP_KEY, CODING_RUNNER_URL: "" }, 503, "SWEEP_UNAVAILABLE"],
      ["oversized", sweepRequest(" ".repeat(2048) + BODY, signedHeaders(" ".repeat(2048) + BODY)), X.ENV, 400, "REQUEST_INVALID"],
      ["bad hmac", sweepRequest(BODY, signedHeaders(BODY, { key: "z".repeat(40) })), X.ENV, 401, "UNAUTHORIZED"],
      ["callback headers", sweepRequest(BODY, F.signCallback(BODY, { key: SWEEP_KEY })), X.ENV, 401, "UNAUTHORIZED"],
      ["stale", sweepRequest(BODY, signedHeaders(BODY, { timestamp: Math.floor(Date.now() / 1000) - 1000 })), X.ENV, 401, "UNAUTHORIZED"],
      ["extra field", sweepRequest('{"version":1,"x":1}', signedHeaders('{"version":1,"x":1}')), X.ENV, 400, "REQUEST_INVALID"],
      ["version 2", sweepRequest('{"version":2}', signedHeaders('{"version":2}')), X.ENV, 400, "REQUEST_INVALID"],
      ["array", sweepRequest("[1]", signedHeaders("[1]")), X.ENV, 400, "REQUEST_INVALID"],
      ["not json", sweepRequest("{version:1}", signedHeaders("{version:1}")), X.ENV, 400, "REQUEST_INVALID"],
      ["empty", sweepRequest("", signedHeaders("")), X.ENV, 400, "REQUEST_INVALID"]
    ];
    for (const [name, req, env, status, code] of cases) {
      const { r, n } = await call(req, env);
      expect(r.status, name).toBe(status);
      expect(r.jsonBody, name).toEqual({ ok: false, code });
      expect(r.headers["Cache-Control"], name).toBe("no-store");
      expect(n, name + " touched storage before auth").toBe(0);
    }
    const ok = await call(sweepRequest());
    expect(ok.r.status).toBe(200);
    expect(ok.r.jsonBody).toMatchObject({ ok: true, status: "completed", dispatched: 1 });
  });

  it("R25 busy → 409 SWEEP_BUSY; a failure → 500 + .failed event (lease released); telemetry carries aggregates only", async () => {
    const { sweepHandler } = routes();
    const { acquireSweepLease, releaseSweepLease } = R();
    const ctx = population(1), logs = [];
    const obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f && f.message || f)]) };
    await acquireSweepLease(ctx.container, { requestId: "sw_other0001", nowMs: Date.now() });
    const busy = await sweepHandler(sweepRequest(), { getContainer: () => ctx.container, env: X.ENV, fetch: F.runnerFetch() }, obs);
    expect(busy.status).toBe(409);
    expect(busy.jsonBody).toEqual({ ok: false, code: "SWEEP_BUSY" });
    await releaseSweepLease(ctx.container, { requestId: "sw_other0001" });
    const broken = { ...ctx.container, listBlobsFlat: () => { throw Object.assign(new Error("storage down"), { statusCode: 503 }); } };
    const failed = await sweepHandler(sweepRequest(), { getContainer: () => broken, env: X.ENV, fetch: F.runnerFetch() }, obs);
    expect(failed.status).toBe(500);
    expect(failed.jsonBody).toEqual({ ok: false, code: "INTERNAL" });
    expect(ctx.has(LOCK) && Date.parse(ctx.getJson(LOCK).expiresAt) > Date.now()).toBe(false);      // released after the failure
    const events = logs.map(l => l[0]);
    expect(events).toEqual(expect.arrayContaining(["coding.autoGrade.recovery.busy", "coding.autoGrade.recovery.failed"]));
    expect(JSON.stringify(logs)).not.toContain(SWEEP_KEY);
  });

  it("R26 both routes are registered as anonymous-transport POST routes that reject anonymous callers (401)", async () => {
    const recorded = [];
    const fnMod = require_("@azure/functions");
    const original = fnMod.app.http;
    fnMod.app.http = (name, opts) => recorded.push({ name, ...opts });
    try {
      delete require_.cache[require_.resolve("../src/functions/coding-grading-recovery.js")];
      require_("../src/functions/coding-grading-recovery.js");
    } finally { fnMod.app.http = original; }
    const byRoute = Object.fromEntries(recorded.map(r => [r.route, r]));
    expect(byRoute["coding/grading-sweep"]).toMatchObject({ name: "codingGradingSweep", methods: ["POST"], authLevel: "anonymous" });
    expect(byRoute["coding/bulk-retry"]).toMatchObject({ name: "codingBulkRetry", methods: ["POST"], authLevel: "anonymous" });
    const inventory = readFileSync(join(HERE, "route-auth-inventory-11a.test.js"), "utf8");
    expect(inventory).toMatch(/codingGradingSweep:\s*"/);
  });
});

describe("R33 — GitHub Actions scheduler (signs with Node crypto; 409 SWEEP_BUSY is success)", () => {
  const URL_OK = "https://app.example.test/api/coding/grading-sweep";
  const ENV_OK = { SMARTASSESS_GRADING_SWEEP_URL: URL_OK, CODING_GRADING_SWEEP_HMAC_KEY: SWEEP_KEY };

  it("R33a configuration is validated with clear errors that never echo the key", async () => {
    const { readSweepConfig } = await scheduler();
    expect(readSweepConfig(ENV_OK)).toMatchObject({ ok: true, url: URL_OK });
    const bad = [
      [{}, /SMARTASSESS_GRADING_SWEEP_URL/], [{ SMARTASSESS_GRADING_SWEEP_URL: URL_OK }, /CODING_GRADING_SWEEP_HMAC_KEY/],
      [{ ...ENV_OK, SMARTASSESS_GRADING_SWEEP_URL: "http://app.example.test/api/coding/grading-sweep" }, /https/],
      [{ ...ENV_OK, SMARTASSESS_GRADING_SWEEP_URL: "https://app.example.test/api/other" }, /\/api\/coding\/grading-sweep/],
      [{ ...ENV_OK, SMARTASSESS_GRADING_SWEEP_URL: "https://u:p@app.example.test/api/coding/grading-sweep" }, /SMARTASSESS_GRADING_SWEEP_URL/],
      [{ ...ENV_OK, SMARTASSESS_GRADING_SWEEP_URL: URL_OK + "?x=1" }, /SMARTASSESS_GRADING_SWEEP_URL/],
      [{ ...ENV_OK, CODING_GRADING_SWEEP_HMAC_KEY: "short" }, /CODING_GRADING_SWEEP_HMAC_KEY/]
    ];
    for (const [env, msg] of bad) {
      const c = readSweepConfig(env);
      expect(c.ok, JSON.stringify(env).slice(0, 60)).toBe(false);
      expect(c.error).toMatch(msg);
      expect(c.error).not.toContain(SWEEP_KEY);
    }
  });

  it("R33b signing proof: the scheduler's request verifies with verifySweepRequest() and passes the REAL handler", async () => {
    const { buildSweepRequest, runSweep } = await scheduler();
    const { verifySweepRequest } = P();
    const nowMs = Date.now();
    const req = buildSweepRequest({ url: URL_OK, key: SWEEP_KEY, nowMs, requestId: "gh_proof00001_abcdefghij" });
    expect(req.url).toBe(URL_OK);
    expect(req.init).toMatchObject({ method: "POST", redirect: "error", body: BODY });
    expect(verifySweepRequest({ key: SWEEP_KEY, headers: new Headers(req.init.headers), body: Buffer.from(req.init.body, "utf8"), nowMs })).toEqual({ ok: true, requestId: "gh_proof00001_abcdefghij" });
    const ctx = population(1);
    const { sweepHandler } = routes();
    const lines = [];
    const viaHandler = async (url, init) => {
      const r = await sweepHandler({ method: init.method, url, headers: new Headers(init.headers), text: async () => init.body }, { getContainer: () => ctx.container, env: X.ENV, fetch: F.runnerFetch() }, null);
      return new Response(JSON.stringify(r.jsonBody), { status: r.status, headers: { "content-type": "application/json" } });
    };
    expect(await runSweep({ env: ENV_OK, fetch: viaHandler, log: l => lines.push(l) })).toBe(0);
    expect(X.target(ctx, { studentId: X.sid(1) }).state).toBe("dispatched");
    const out = lines.join("\n");
    expect(out).not.toContain(SWEEP_KEY);
    expect(out).not.toMatch(/v1=[0-9a-f]{64}/);
  });

  it("R33c exit codes: 2xx and 409 SWEEP_BUSY succeed; 401 / 400 / 503 / 500 / other 409 / network error / missing config fail", async () => {
    const { runSweep } = await scheduler();
    const reply = (status, json) => async (_u, init) => { expect(init.redirect).toBe("error"); expect(init.signal).toBeTruthy(); return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } }); };
    const quiet = () => {};
    expect(await runSweep({ env: ENV_OK, fetch: reply(200, { ok: true, status: "completed" }), log: quiet })).toBe(0);
    expect(await runSweep({ env: ENV_OK, fetch: reply(409, { ok: false, code: "SWEEP_BUSY" }), log: quiet })).toBe(0);
    for (const [s, j] of [[401, { ok: false, code: "UNAUTHORIZED" }], [400, { ok: false, code: "REQUEST_INVALID" }], [503, { ok: false, code: "SWEEP_UNAVAILABLE" }], [500, { ok: false, code: "INTERNAL" }], [409, { ok: false, code: "OTHER" }], [302, {}]]) {
      expect(await runSweep({ env: ENV_OK, fetch: reply(s, j), log: quiet }), String(s)).toBe(1);
    }
    expect(await runSweep({ env: ENV_OK, fetch: async () => { throw new TypeError("fetch failed"); }, log: quiet })).toBe(1);
    const lines = [];
    expect(await runSweep({ env: {}, fetch: reply(200, {}), log: l => lines.push(l) })).toBe(1);
    expect(lines.join("\n")).toMatch(/SMARTASSESS_GRADING_SWEEP_URL/);
  });

  it("R33d the workflow: schedule + manual, contents: read only, first-party actions only, ONE secret + ONE variable, no cloud credentials", () => {
    const path = join(ROOT, ".github", "workflows", "coding-grading-recovery.yml");
    expect(existsSync(path)).toBe(true);
    const y = readFileSync(path, "utf8");
    expect(y).toMatch(/schedule:\s*\n\s*-\s*cron:\s*["']7,17,27,37,47,57 \* \* \* \*["']/);
    expect(y).toMatch(/workflow_dispatch:/);
    expect(y).toMatch(/permissions:\s*\n\s*contents:\s*read\s*\n/);
    expect(y).not.toMatch(/write/);
    for (const m of y.matchAll(/uses:\s*([^\s#]+)/g)) expect(m[1], m[1]).toMatch(/^actions\/(checkout|setup-node)@/);
    expect([...y.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1])).toEqual(["CODING_GRADING_SWEEP_HMAC_KEY"]);
    expect([...y.matchAll(/vars\.([A-Z0-9_]+)/g)].map(m => m[1])).toEqual(["SMARTASSESS_GRADING_SWEEP_URL"]);
    expect(y).not.toMatch(/azure|AZURE_|login|RUNNER_HMAC|CALLBACK_HMAC|SESSION_SECRET|curl|set -x/i);
    expect(y).toMatch(/node scripts\/coding-grading-sweep\.mjs/);
    expect(y).toMatch(/timeout-minutes:\s*\d+/);
    expect(y).toMatch(/concurrency:/);
  });
});

describe("R35 — HTTP-only Functions and an engine that never runs code", () => {
  it("R35 api/ declares no timer / queue / service bus / durable trigger; the engine never imports an executor", () => {
    const dir = join(ROOT, "api", "src");
    const files = [];
    const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(c|m)?js$/.test(e.name)) files.push(p); } };
    walk(dir);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/app\.(timer|storageQueue|serviceBusQueue|serviceBusTopic|eventHub|eventGrid|cosmosDB)\s*\(/);
      expect(src, f).not.toMatch(/durable-functions|\bcron\b\s*:/);
    }
    const engine = readFileSync(join(dir, "lib", "coding", "grading-recovery.js"), "utf8");
    expect(engine).not.toMatch(/child_process|worker_threads|require\(["']vm["']\)|\/runner\/|\bfetch\s*\(|signRunnerRequest|hiddenTests|expectedOutput/);
    const pkg = JSON.parse(readFileSync(join(ROOT, "api", "package.json"), "utf8"));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain("durable-functions");
  });
});
