import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import crypto from "node:crypto";

// Phase 17D-B1 — signed sweep REPLAY PROTECTION. A validly signed POST /api/coding/grading-sweep is accepted AT MOST ONCE: its
// HMAC-authenticated request id (already part of the SA-CODING-SWEEP-1 canonical input) is atomically reserved in a durable,
// server-owned ledger (platform/system/coding-sweep-replay/<sha256>.json, conditional create) AFTER signature + freshness +
// strict-body validation and BEFORE the sweep lease / engine. Exact replays → 409 REPLAYED_REQUEST; a ledger that cannot
// atomically reserve → 503 (fail closed). Records outlive the freshness window by a safety margin; cleanup is bounded.
// Fail-first on 6a50f54: no ledger exists — replays re-run the sweep, short ids are accepted, a storage failure is ignored.
const require_ = createRequire(import.meta.url);
const X = require_("./fixtures/coding-17d-a.js");
const { F, SWEEP_KEY } = X;
const routes = () => require_("../src/functions/coding-grading-recovery.js");
const ledger = () => require_("../src/lib/coding/sweep-replay-ledger.js");
const protocol = () => require_("../src/lib/coding/sweep-protocol.js");
const scheduler = () => import("../../scripts/coding-grading-sweep.mjs");

const LEDGER = "platform/system/coding-sweep-replay/";
const LOCK = "platform/system/coding-grading-sweep-lock.json";
const BODY = '{"version":1}';
const rid = () => "rp_" + crypto.randomBytes(24).toString("base64url");               // 35 chars, like the scheduler's ids
/** An INDEPENDENT signer (pins the canonical bytes; the request id is part of the HMAC input). */
const sign = (body = BODY, { key = SWEEP_KEY, timestamp = Math.floor(Date.now() / 1000), requestId = rid() } = {}) => {
  const canonical = ["SA-CODING-SWEEP-1", "POST", "/api/coding/grading-sweep", String(timestamp), requestId, crypto.createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex")].join("\n");
  return { "x-sa-sweep-protocol": "1", "x-sa-sweep-timestamp": String(timestamp), "x-sa-sweep-request-id": requestId, "x-sa-sweep-signature": "v1=" + crypto.createHmac("sha256", Buffer.from(key, "utf8")).update(canonical, "utf8").digest("hex") };
};
const request = (headers, body = BODY) => ({ method: "POST", url: "https://app.example.test/api/coding/grading-sweep", headers: new Headers({ "content-type": "application/json", ...headers }), text: async () => body, json: async () => JSON.parse(body) });
const emptyStore = () => F.seed({ doc: null });
function harness(ctx = emptyStore(), { container = ctx.container, now = () => Date.now(), handler } = {}) {
  const logs = [];
  const obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f && f.message || f)]) };
  const h = handler || routes().sweepHandler;
  return { ctx, logs, call: req => h(req, { getContainer: () => container, env: X.ENV, fetch: F.runnerFetch(), now }, obs), runs: () => logs.filter(l => l[0] === "coding.autoGrade.recovery.started").length };
}
/** Counts every storage access of a container (used to prove "no storage before auth / for garbage"). */
function counted(container) {
  const n = { count: 0, writes: [] };
  const c = new Proxy(container, { get(t, p) {
    const v = t[p];
    if (p === "getBlockBlobClient") return name => { n.count++; const b = t.getBlockBlobClient(name); return { ...b, upload: async (...a) => { n.writes.push(name); return b.upload(...a); } }; };
    return typeof v === "function" ? (...a) => { n.count++; return v.apply(t, a); } : v;
  } });
  return { c, n };
}

describe("RP — signed sweep replay protection", () => {
  it("RP1 a fresh, validly signed request with an unseen request id is accepted and the sweep runs exactly once", async () => {
    const h = harness();
    const r = await h.call(request(sign()));
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, status: "completed" });
    expect(h.runs()).toBe(1);
    expect(h.ctx.names(LEDGER)).toHaveLength(1);
  });

  it("RP2 an exact replay (same id, timestamp, signature) is refused with 409 REPLAYED_REQUEST and never reaches the sweep; the id is HMAC-bound", async () => {
    const h = harness(), headers = sign();
    expect((await h.call(request(headers))).status).toBe(200);
    for (let i = 0; i < 3; i++) {
      const again = await h.call(request(headers));
      expect(again.status).toBe(409);
      expect(again.jsonBody).toEqual({ ok: false, code: "REPLAYED_REQUEST" });
    }
    expect(h.runs()).toBe(1);
    expect(h.ctx.names(LEDGER)).toHaveLength(1);
    // the request id is covered by the HMAC: swapping it on a captured request (to dodge the ledger) breaks the signature
    const swapped = await h.call(request({ ...headers, "x-sa-sweep-request-id": rid() }));
    expect(swapped.status).toBe(401);
    expect(h.runs()).toBe(1);
  });

  it("RP3 concurrent identical requests: exactly one reserves the id (CAS) and runs; the other is REPLAYED_REQUEST", async () => {
    const h = harness(), headers = sign();
    const results = await Promise.all([h.call(request(headers)), h.call(request(headers)), h.call(request(headers))]);
    const ok = results.filter(r => r.status === 200), replayed = results.filter(r => r.status === 409 && r.jsonBody.code === "REPLAYED_REQUEST");
    expect(ok).toHaveLength(1);
    expect(replayed).toHaveLength(2);
    expect(h.runs()).toBe(1);
    const records = h.ctx.names(LEDGER);
    expect(records).toHaveLength(1);
    expect(h.ctx.getJson(records[0])).toMatchObject({ schemaVersion: 1 });
  });

  it("RP4 an invalid signature is refused (401) with NO storage access at all — no ledger record, no lease", async () => {
    const ctx = emptyStore(), { c, n } = counted(ctx.container), h = harness(ctx, { container: c });
    const r = await h.call(request(sign(BODY, { key: "k".repeat(40) })));
    expect(r.status).toBe(401);
    expect(n.count).toBe(0);
    expect(ctx.names(LEDGER)).toEqual([]);
    expect(ctx.has(LOCK)).toBe(false);
  });

  it("RP5 a validly signed but STALE request is refused (401) with no storage access — no ledger record", async () => {
    const ctx = emptyStore(), { c, n } = counted(ctx.container), h = harness(ctx, { container: c });
    for (const skew of [-301, 301, -100000]) {
      const r = await h.call(request(sign(BODY, { timestamp: Math.floor(Date.now() / 1000) + skew })));
      expect(r.status, String(skew)).toBe(401);
    }
    expect(n.count).toBe(0);
    expect(ctx.names(LEDGER)).toEqual([]);
  });

  it("RP6 distinct request ids with the same body / route / key are independent sweeps (replay protection, not body dedupe)", async () => {
    const h = harness(), ts = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 3; i++) expect((await h.call(request(sign(BODY, { timestamp: ts })))).status).toBe(200);
    expect(h.runs()).toBe(3);
    expect(h.ctx.names(LEDGER)).toHaveLength(3);
  });

  it("RP6b the scheduler signs every invocation with a fresh crypto-random id and treats REPLAYED_REQUEST as a failure", async () => {
    const { buildSweepRequest, runSweep } = await scheduler();
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      const req = buildSweepRequest({ url: "https://app.example.test/api/coding/grading-sweep", key: SWEEP_KEY });
      const id = req.init.headers["x-sa-sweep-request-id"];
      expect(id).toMatch(/^[A-Za-z0-9_-]{20,64}$/);
      expect(protocol().verifySweepRequest({ key: SWEEP_KEY, headers: new Headers(req.init.headers), body: Buffer.from(req.init.body), nowMs: Date.now() })).toEqual({ ok: true, requestId: id });
      ids.add(id);
    }
    expect(ids.size).toBe(50);
    const lines = [], seen = [];
    const env = { SMARTASSESS_GRADING_SWEEP_URL: "https://app.example.test/api/coding/grading-sweep", CODING_GRADING_SWEEP_HMAC_KEY: SWEEP_KEY };
    const code = await runSweep({ env, log: l => lines.push(l), fetch: async (_u, init) => { seen.push(init.headers["x-sa-sweep-request-id"]); return new Response(JSON.stringify({ ok: false, code: "REPLAYED_REQUEST" }), { status: 409, headers: { "content-type": "application/json" } }); } });
    expect(code).toBe(1);
    expect(lines.join("\n")).not.toContain(seen[0]);
  });

  it("RP7 a malformed request id (missing / short / long / whitespace / bad chars / traversal) is refused before ANY storage access", async () => {
    const ctx = emptyStore(), { c, n } = counted(ctx.container), h = harness(ctx, { container: c });
    const bad = ["short_id_1234", "x".repeat(65), "abcdefghij klmnopqrstu", "abcdefghijklmnopqrstu!", "../../../../platform/users/x", "..%2f..%2fplatform%2fusers", "abcdefghijklmnopqrsté", "abcdefghijklmnopqrst\n"];
    for (const id of bad) {
      const r = await h.call(request(sign(BODY, { requestId: id })));
      expect(r.status, JSON.stringify(id)).toBe(401);
    }
    const missing = sign(); delete missing["x-sa-sweep-request-id"];
    expect((await h.call(request(missing))).status).toBe(401);
    expect(n.count).toBe(0);
    expect(ctx.names(LEDGER)).toEqual([]);
    // the ledger path is a fixed-prefix SHA-256 digest of the id — never id text
    const name = ledger().replayLedgerName("abcdefghijklmnopqrstuvwxyz_-0123");
    expect(name).toMatch(/^platform\/system\/coding-sweep-replay\/[0-9a-f]{64}\.json$/);
    expect(name).not.toContain("abcdefghij");
  });

  it("RP8 replay protection is durable: a NEW handler instance (process restart) over the same storage still refuses the replay", async () => {
    const ctx = emptyStore(), headers = sign();
    expect((await harness(ctx).call(request(headers))).status).toBe(200);
    for (const p of ["../src/functions/coding-grading-recovery.js", "../src/lib/coding/sweep-replay-ledger.js", "../src/lib/coding/grading-recovery.js"]) {
      try { delete require_.cache[require_.resolve(p)]; } catch { /* not loaded */ }
    }
    const fresh = require_("../src/functions/coding-grading-recovery.js").sweepHandler;
    const h2 = harness(ctx, { handler: fresh });
    const r = await h2.call(request(headers));
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("REPLAYED_REQUEST");
    expect(h2.runs()).toBe(0);
  });

  it("RP9 retention safely exceeds the freshness window; an unexpired record is never pruned; only expired ones are", async () => {
    const L = ledger(), { SWEEP_MAX_SKEW_SECONDS } = protocol();
    // a request is acceptable until timestamp + skew, and its timestamp may be up to skew EARLIER than acceptance
    expect(L.REPLAY_RETENTION_MS).toBeGreaterThanOrEqual(2 * SWEEP_MAX_SKEW_SECONDS * 1000 + L.REPLAY_SAFETY_MARGIN_MS);
    expect(L.REPLAY_SAFETY_MARGIN_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
    let t = Date.now();
    const now = () => t, ctx = emptyStore(), h = harness(ctx, { now });
    const ts = Math.floor(t / 1000) - 299, headers = sign(BODY, { timestamp: ts });         // signed almost a full window ago
    expect((await h.call(request(headers))).status).toBe(200);
    const [name] = ctx.names(LEDGER), rec = ctx.getJson(name);
    expect(Date.parse(rec.expiresAt) - ts * 1000).toBeGreaterThanOrEqual(SWEEP_MAX_SKEW_SECONDS * 1000 + L.REPLAY_SAFETY_MARGIN_MS);
    expect(JSON.stringify(rec)).not.toMatch(/v1=|test-only|"requestId"|rp_/);
    expect((await h.call(request(headers))).status).toBe(409);                            // replay inside the window: refused
    t = Date.parse(rec.expiresAt) - 1000;                                                 // up to its expiry the record is never pruned
    for (let i = 0; i < 3; i++) await L.pruneReplayLedger(ctx.container, { nowMs: t });
    expect(ctx.has(name)).toBe(true);
    expect((await h.call(request(headers))).status).toBe(401);                            // by then the signed timestamp is long stale
    // an expired record (crafted) IS pruned; an unexpired neighbour is kept
    const old = LEDGER + "a".repeat(64) + ".json", young = LEDGER + "b".repeat(64) + ".json";
    ctx.setJson(old, { schemaVersion: 1, requestDigest: "a".repeat(64), acceptedAt: new Date(t - 3 * L.REPLAY_RETENTION_MS).toISOString(), expiresAt: new Date(t - 1000).toISOString() });
    ctx.setJson(young, { schemaVersion: 1, requestDigest: "b".repeat(64), acceptedAt: new Date(t).toISOString(), expiresAt: new Date(Date.parse(rec.expiresAt) + 3600000).toISOString() });
    for (let i = 0; i < 5; i++) await L.pruneReplayLedger(ctx.container, { nowMs: t });
    expect(ctx.has(old)).toBe(false);
    expect(ctx.has(young)).toBe(true);
    expect(ctx.has(name)).toBe(true);
    for (let i = 0; i < 5; i++) await L.pruneReplayLedger(ctx.container, { nowMs: Date.parse(rec.expiresAt) + 1000 });
    expect(ctx.has(name)).toBe(false);                                                    // expired → removable
  });

  it("RP10 cleanup is bounded (records read, deletions, one page per call) and progresses with a cursor", async () => {
    const L = ledger(), ctx = emptyStore(), t = Date.now();
    expect(L.REPLAY_CLEANUP_LIMITS.maxScanned).toBeLessThanOrEqual(50);
    expect(L.REPLAY_CLEANUP_LIMITS.maxDeleted).toBeLessThanOrEqual(L.REPLAY_CLEANUP_LIMITS.maxScanned);
    for (let i = 0; i < 300; i++) {
      const d = crypto.createHash("sha256").update("rec" + i).digest("hex");
      ctx.setJson(LEDGER + d + ".json", { schemaVersion: 1, requestDigest: d, acceptedAt: new Date(t - 3 * L.REPLAY_RETENTION_MS).toISOString(), expiresAt: new Date(t - 1000).toISOString() });
    }
    let listed = 0;
    const reads = [], deletes = [];
    const probe = new Proxy(ctx.container, { get(tt, p) {
      if (p === "getBlobClient") return name => { const c = tt.getBlobClient(name); return { ...c, download: async (...a) => { if (name.startsWith(LEDGER)) reads.push(name); return c.download(...a); }, deleteIfExists: async (...a) => { if (name.startsWith(LEDGER)) deletes.push(name); return c.deleteIfExists(...a); } }; };
      if (p === "listBlobsFlat") return o => { const it = tt.listBlobsFlat(o); return { [Symbol.asyncIterator]: () => it[Symbol.asyncIterator](), byPage: q => { const g = it.byPage(q); return { next: async () => { const s = await g.next(); if (!s.done) listed += s.value.segment.blobItems.length; return s; } }; } }; };
      const v = tt[p]; return typeof v === "function" ? v.bind(tt) : v;
    } });
    const r = await L.pruneReplayLedger(probe, { nowMs: t });
    expect(listed).toBeLessThanOrEqual(L.REPLAY_CLEANUP_LIMITS.maxScanned);
    expect(reads.length).toBeLessThanOrEqual(L.REPLAY_CLEANUP_LIMITS.maxScanned);
    expect(deletes.length).toBeLessThanOrEqual(L.REPLAY_CLEANUP_LIMITS.maxDeleted);
    expect(r.deleted).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 100 && ctx.names(LEDGER).length; i++) await L.pruneReplayLedger(ctx.container, { nowMs: t });
    expect(ctx.names(LEDGER)).toEqual([]);                                                // the cursor walks the whole ledger over calls
  });

  it("RP11 the ledger cannot atomically reserve → 503 SWEEP_UNAVAILABLE and the sweep NEVER runs (storage error or a non-'exists' CAS conflict)", async () => {
    // (a 412 ConditionNotMet on the create-only write means "already reserved" — RP3b / RP11b; a 412 with another code does not)
    for (const failure of [Object.assign(new Error("storage down"), { statusCode: 500 }), Object.assign(new Error("LeaseIdMissing"), { statusCode: 412, code: "LeaseIdMissing" }), Object.assign(new Error("precondition"), { statusCode: 412 }), Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })]) {
      const ctx = emptyStore();
      const broken = new Proxy(ctx.container, { get(t, p) {
        if (p === "getBlockBlobClient") return name => { const b = t.getBlockBlobClient(name); return { ...b, upload: async (...a) => { if (name.startsWith(LEDGER)) throw failure; return b.upload(...a); } }; };
        const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
      } });
      const h = harness(ctx, { container: broken });
      const r = await h.call(request(sign()));
      expect(r.status, String(failure.statusCode)).toBe(503);
      expect(r.jsonBody).toEqual({ ok: false, code: "SWEEP_UNAVAILABLE" });
      expect(h.runs()).toBe(0);
      expect(ctx.has(LOCK)).toBe(false);
      expect(h.logs.map(l => l[0])).toContain("coding.autoGrade.sweepReplay.storageError");
      expect(JSON.stringify(h.logs)).not.toMatch(/storage down|LeaseIdMissing|precondition|socket hang up/);
    }
  });

  it("RP12 replay responses and telemetry leak nothing (no key, signature, request id, digest internals, student / job data)", async () => {
    const ctx = F.seed({ a: F.assignment({}, { short: false }), doc: null });
    X.commitAttempt(ctx, { studentId: X.sid(1) });
    const h = harness(ctx), headers = sign();
    await h.call(request(headers));
    const replay = await h.call(request(headers));
    expect(replay.status).toBe(409);
    // the ledger record is identifier-free metadata: exactly these fields, no id / signature / key / attempt data
    const records = ctx.names(LEDGER);
    expect(records).toHaveLength(1);
    const rec = ctx.getJson(records[0]);
    expect(Object.keys(rec).sort()).toEqual(["acceptedAt", "expiresAt", "protocol", "requestDigest", "schemaVersion", "signedAt"]);
    for (const leak of [SWEEP_KEY, headers["x-sa-sweep-signature"], headers["x-sa-sweep-request-id"], X.sid(1), "cg_"]) expect(JSON.stringify(rec)).not.toContain(leak);
    expect(replay.headers["Cache-Control"]).toBe("no-store");
    expect(Object.keys(replay.jsonBody).sort()).toEqual(["code", "ok"]);
    const text = JSON.stringify(replay) + JSON.stringify(h.logs);
    const digest = ledger().replayLedgerName(headers["x-sa-sweep-request-id"]).split("/").pop().replace(".json", "");
    for (const leak of [SWEEP_KEY, headers["x-sa-sweep-signature"], headers["x-sa-sweep-request-id"], digest, X.sid(1), "cg_", "gradingKey", "SUM=", F.CANARY.expected[0]]) expect(text).not.toContain(leak);
    const events = h.logs.map(l => l[0]);
    expect(events).toContain("coding.autoGrade.sweepReplay.accepted");
    expect(events).toContain("coding.autoGrade.sweepReplay.rejected");
  });
});

// Review fix 1 — the reservation is ONE create-only write (If-None-Match: *). @azure/storage-blob 12.33 reports a failed target
// condition as a RestError { statusCode: 412, code: "ConditionNotMet", details.errorCode: "ConditionNotMet" } (pinned by driving
// the real SDK against an Azure-shaped endpoint); a backend may also answer 409 BlobAlreadyExists. Both mean "this id is already
// reserved" → 409 REPLAYED_REQUEST. Every other outcome — including 412 / 409 with any other or a missing / inconsistent error
// code — stays fail-closed (503 SWEEP_UNAVAILABLE). Either way the sweep lease and the engine are never reached.
const { RestError } = require_("@azure/storage-blob");
const azureError = (statusCode, code, message = "storage") => { const e = new RestError(message, { statusCode, code }); if (code) e.details = { errorCode: code }; return e; };
const AZURE_EXISTS = () => azureError(412, "ConditionNotMet", "The condition specified using HTTP conditional header(s) is not met.");
/** The memory store, answering a create-only write on an existing ledger record the way Azure does (412 ConditionNotMet). */
function azureStore(container, { touched = [], conditions = [] } = {}) {
  return new Proxy(container, { get(t, p) {
    if (p === "getBlockBlobClient" || p === "getBlobClient") return name => {
      touched.push(name);
      const b = t[p](name);
      if (p !== "getBlockBlobClient" || !name.startsWith(LEDGER)) return b;
      return { ...b, upload: async (body, len, opts) => {
        conditions.push(opts && opts.conditions);
        try { return await b.upload(body, len, opts); }
        catch (e) { if (e && e.statusCode === 409 && e.code === "BlobAlreadyExists") throw AZURE_EXISTS(); throw e; }
      } };
    };
    const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
  } });
}
/** A store whose ledger write fails with `failure` (no record is ever created). */
function failingLedger(container, failure) {
  return new Proxy(container, { get(t, p) {
    if (p === "getBlockBlobClient") return name => { const b = t.getBlockBlobClient(name); return { ...b, upload: async (...a) => { if (name.startsWith(LEDGER)) throw failure(); return b.upload(...a); } }; };
    const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
  } });
}

describe("RP — Azure conditional-create semantics of the replay reservation", () => {
  it("RP3b Azure-style 412 ConditionNotMet on an existing reservation → 409 REPLAYED_REQUEST; no sweep, lease untouched, rejected telemetry", async () => {
    const ctx = emptyStore(), touched = [], conditions = [];
    const h = harness(ctx, { container: azureStore(ctx.container, { touched, conditions }) }), headers = sign();
    expect((await h.call(request(headers))).status).toBe(200);
    expect(h.runs()).toBe(1);
    const lockBefore = ctx.has(LOCK) ? JSON.stringify(ctx.getJson(LOCK)) : null;
    touched.length = 0; h.logs.length = 0;
    for (let i = 0; i < 2; i++) {
      const replay = await h.call(request(headers));
      expect(replay.status).toBe(409);
      expect(replay.jsonBody).toEqual({ ok: false, code: "REPLAYED_REQUEST" });
    }
    expect(h.runs()).toBe(0);                                                             // (logs were reset) no sweep started
    expect(touched.filter(n => n === LOCK)).toEqual([]);                                  // the lease is never touched by a replay
    expect(ctx.has(LOCK) ? JSON.stringify(ctx.getJson(LOCK)) : null).toBe(lockBefore);
    expect(touched.every(n => n.startsWith(LEDGER))).toBe(true);                         // the replay's only storage access is the reservation
    const events = h.logs.map(l => l[0]);
    expect(events.filter(e => e === "coding.autoGrade.sweepReplay.rejected")).toHaveLength(2);
    expect(events).not.toContain("coding.autoGrade.sweepReplay.storageError");
    expect(events).not.toContain("coding.autoGrade.sweepReplay.accepted");
    // the reservation is exactly one create-only write — the only precondition a 412 ConditionNotMet can refer to
    expect(conditions.length).toBeGreaterThanOrEqual(3);
    for (const c of conditions) expect(c).toEqual({ ifNoneMatch: "*" });
    expect(ctx.names(LEDGER)).toHaveLength(1);
  });

  it("RP3c concurrent identical requests against Azure 412 semantics: exactly one runs, the rest are REPLAYED_REQUEST", async () => {
    const ctx = emptyStore(), h = harness(ctx, { container: azureStore(ctx.container) }), headers = sign();
    const results = await Promise.all(Array.from({ length: 4 }, () => h.call(request(headers))));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 409 && r.jsonBody.code === "REPLAYED_REQUEST")).toHaveLength(3);
    expect(results.filter(r => r.status === 503)).toHaveLength(0);
    expect(h.runs()).toBe(1);
    expect(ctx.names(LEDGER)).toHaveLength(1);
  });

  it("RP11b reservation decision matrix: only the two create-only conflict shapes are replays; everything else fails closed", async () => {
    const plain = (statusCode, code) => () => Object.assign(new Error("storage"), { statusCode, ...(code ? { code } : {}) });
    const replays = [
      ["azure 412 ConditionNotMet", () => AZURE_EXISTS()],
      ["azure 409 BlobAlreadyExists", () => azureError(409, "BlobAlreadyExists")],
      ["plain 409 BlobAlreadyExists", plain(409, "BlobAlreadyExists")],
      ["412 ConditionNotMet via details only", () => { const e = new RestError("x", { statusCode: 412 }); e.details = { errorCode: "ConditionNotMet" }; return e; }],
      ["412 ConditionNotMet via response.status", () => Object.assign(new Error("x"), { code: "ConditionNotMet", response: { status: 412 } })],
    ];
    const closed = [
      ["412 LeaseIdMissing", () => azureError(412, "LeaseIdMissing")],
      ["412 without an error code", () => azureError(412, undefined)],
      ["412 code/details disagree", () => { const e = azureError(412, "ConditionNotMet"); e.details = { errorCode: "LeaseIdMissing" }; return e; }],
      ["ConditionNotMet without a status", () => Object.assign(new Error("x"), { code: "ConditionNotMet" })],
      ["ConditionNotMet with status 400", plain(400, "ConditionNotMet")],
      ["BlobAlreadyExists with status 412", plain(412, "BlobAlreadyExists")],
      ["409 LeaseIdMissing", () => azureError(409, "LeaseIdMissing")],
      ["409 without an error code", plain(409)],
      ["status 412 vs response.status 500", () => Object.assign(azureError(412, "ConditionNotMet"), { response: { status: 500 } })],
      ["500 InternalError", () => azureError(500, "InternalError")],
      ["503 ServerBusy", () => azureError(503, "ServerBusy")],
      ["403 AuthorizationFailure", () => azureError(403, "AuthorizationFailure")],
      ["network ECONNRESET", () => Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })],
      ["REQUEST_SEND_ERROR", () => azureError(undefined, "REQUEST_SEND_ERROR")],
      ["thrown string", () => "boom"],
      ["thrown null", () => null],
      ["empty object", () => ({})],
    ];
    const L = ledger();
    for (const [label, failure, expected] of [...replays.map(r => [...r, "REPLAYED_REQUEST"]), ...closed.map(c => [...c, "LEDGER_UNAVAILABLE"])]) {
      const ctx = emptyStore();
      const direct = await L.reserveSweepRequest(failingLedger(ctx.container, failure), { requestId: rid(), timestamp: Math.floor(Date.now() / 1000), nowMs: Date.now() });
      expect(direct, label).toEqual({ ok: false, code: expected });
      const h = harness(ctx, { container: failingLedger(ctx.container, failure) });
      const r = await h.call(request(sign()));
      if (expected === "REPLAYED_REQUEST") {
        expect(r.status, label).toBe(409);
        expect(r.jsonBody, label).toEqual({ ok: false, code: "REPLAYED_REQUEST" });
        expect(h.logs.map(l => l[0]), label).toContain("coding.autoGrade.sweepReplay.rejected");
      } else {
        expect(r.status, label).toBe(503);
        expect(r.jsonBody, label).toEqual({ ok: false, code: "SWEEP_UNAVAILABLE" });
        expect(h.logs.map(l => l[0]), label).toContain("coding.autoGrade.sweepReplay.storageError");
      }
      expect(h.runs(), label).toBe(0);
      expect(ctx.has(LOCK), label).toBe(false);
      expect(ctx.names(LEDGER), label).toEqual([]);
      expect(JSON.stringify(h.logs), label).not.toMatch(/ConditionNotMet|BlobAlreadyExists|LeaseIdMissing|socket hang up|boom/);
    }
  });
});
