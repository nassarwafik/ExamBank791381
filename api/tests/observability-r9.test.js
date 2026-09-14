import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Roadmap #9 — Observability. These tests prove: correlation ids are generated/sanitized/echoed, logs are
// structured, durations are measured, unexpected throws become a safe 500 with a request id (no stack), the
// health endpoint is minimal + no-store + correlated, storage retry/exhaustion are observed, and — most
// importantly — that NO sensitive value can ever reach a serialized log line.

process.env.BANK_SETUP_KEY = "r9-test-secret";

const obs = await import("../src/lib/observability.js");
const storage = await import("../src/lib/platform-storage.js");
const { handler: healthHandler, safeVersion } = await import("../src/functions/health.js");
const { handler: loginHandler } = await import("../src/functions/platform-login.js");
const { handler: submissionHandler } = await import("../src/functions/student-submission.js");
const { handler: manageAssignmentsHandler } = await import("../src/functions/manage-assignments.js");
const { inner: importAnalyzeInner } = await import("../src/functions/import-analyze.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");

// Capture every emitted log record.
let records = [];
beforeEach(() => { records = []; obs.setSink(r => records.push(r)); });
afterEach(() => { obs.resetSink(); });

const serialized = () => JSON.stringify(records);
const reqWith = (headers = {}, extra = {}) => ({ method: "GET", headers: { get: k => headers[String(k).toLowerCase()] ?? null }, ...extra });

// ── Wrapper: request id, structured logs, duration, safe 500, status pass-through ──
describe("R9 withObservability — correlation, structure, safety", () => {
  it("A/D: generates a request id and returns it as X-Request-ID when none is supplied", async () => {
    const wrapped = obs.withObservability("t", async () => ({ status: 200, jsonBody: { ok: true } }));
    const res = await wrapped(reqWith());
    expect(res.headers["X-Request-ID"]).toMatch(/^[A-Za-z0-9._-]{1,80}$/);
    expect(records.some(r => r.requestId === res.headers["X-Request-ID"])).toBe(true);
  });
  it("B: preserves a valid incoming x-request-id", async () => {
    const wrapped = obs.withObservability("t", async () => ({ status: 200 }));
    const res = await wrapped(reqWith({ "x-request-id": "abc-123_ID.4" }));
    expect(res.headers["X-Request-ID"]).toBe("abc-123_ID.4");
  });
  it("C: replaces an invalid / oversized / injection-y incoming id", async () => {
    const wrapped = obs.withObservability("t", async () => ({ status: 200 }));
    const bad1 = await wrapped(reqWith({ "x-request-id": "has space\nand\tctrl" }));
    const bad2 = await wrapped(reqWith({ "x-request-id": "x".repeat(200) }));
    expect(bad1.headers["X-Request-ID"]).toMatch(/^[A-Za-z0-9._-]{1,80}$/);
    expect(bad1.headers["X-Request-ID"]).not.toContain("\n");
    expect(bad2.headers["X-Request-ID"].length).toBeLessThanOrEqual(80);
  });
  it("E/G: emits a structured http.request.completed with numeric non-negative durationMs", async () => {
    const wrapped = obs.withObservability("t", async () => ({ status: 200 }));
    await wrapped(reqWith());
    const done = records.find(r => r.event === "http.request.completed");
    expect(done).toBeTruthy();
    expect(done.route).toBe("t"); expect(done.status).toBe(200);
    expect(typeof done.durationMs).toBe("number"); expect(done.durationMs).toBeGreaterThanOrEqual(0);
    expect(done.requestId).toMatch(/^[A-Za-z0-9._-]{1,80}$/);
  });
  it("F: a handler-returned 5xx is logged as http.request.failed", async () => {
    const wrapped = obs.withObservability("t", async () => ({ status: 500, jsonBody: { ok: false } }));
    await wrapped(reqWith());
    expect(records.some(r => r.event === "http.request.failed" && r.status === 500)).toBe(true);
  });
  it("H/I: an unexpected throw becomes a generic 500 with requestId and NO stack leaked to the client", async () => {
    const wrapped = obs.withObservability("t", async () => { const e = new Error("boom secret detail"); e.stack = "at secretFile:1"; throw e; });
    const res = await wrapped(reqWith());
    expect(res.status).toBe(500);
    expect(res.headers["X-Request-ID"]).toBeTruthy();
    expect(res.jsonBody.requestId).toBe(res.headers["X-Request-ID"]);
    const body = JSON.stringify(res.jsonBody);
    expect(body).not.toContain("stack");
    expect(body).not.toContain("secretFile");
    expect(body).not.toContain("boom secret detail");
    expect(records.some(r => r.event === "http.request.exception")).toBe(true);
  });
  it("X: an intentional 409 stays 409 (never converted to 500)", async () => {
    const wrapped = obs.withObservability("t", async () => ({ status: 409, jsonBody: { ok: false, error: "conflict" } }));
    const res = await wrapped(reqWith());
    expect(res.status).toBe(409);
    expect(records.find(r => r.event === "http.request.completed").errorCode).toBe("conflict");
  });
  it("Y: an intentional 401 stays 401", async () => {
    const wrapped = obs.withObservability("t", async () => ({ status: 401, jsonBody: { ok: false } }));
    const res = await wrapped(reqWith());
    expect(res.status).toBe(401);
    expect(records.find(r => r.event === "http.request.completed").errorCode).toBe("unauthorized");
  });
  it("W: a throwing log sink never breaks the endpoint", async () => {
    obs.setSink(() => { throw new Error("sink down"); });
    const wrapped = obs.withObservability("t", async () => ({ status: 200, jsonBody: { ok: true } }));
    const res = await wrapped(reqWith());
    expect(res.status).toBe(200);
    expect(res.headers["X-Request-ID"]).toBeTruthy();
  });
  it("Z: exactly one terminal event per request (no flooding); finishRequest is idempotent", async () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    ctx.finish(200); ctx.finish(200); ctx.finish(500);
    expect(records.filter(r => r.event === "http.request.completed" || r.event === "http.request.failed").length).toBe(1);
  });
});

// ── Redaction (privacy is the whole point) ───────────────────────────────────
describe("R9 redaction — sensitive fields never reach a log line", () => {
  it("J: auth/token headers are redacted", () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    ctx.logInfo("x", { authorization: "Bearer TOPSECRET", "x-student-token": "STUDTOK", "x-builder-token": "BLDTOK", "x-platform-token": "PLATTOK", cookie: "sid=SESSIONVAL" });
    const s = serialized();
    for (const v of ["TOPSECRET", "STUDTOK", "BLDTOK", "PLATTOK", "SESSIONVAL"]) expect(s).not.toContain(v);
  });
  it("K: passwords (incl. temporary) are redacted", () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    ctx.logInfo("x", { password: "PW_SECRET", temporaryPassword: "TMP_SECRET", newPassword: "NEW_SECRET" });
    const s = serialized();
    for (const v of ["PW_SECRET", "TMP_SECRET", "NEW_SECRET"]) expect(s).not.toContain(v);
  });
  it("L: passwordHash and salt are redacted", () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    ctx.logInfo("x", { passwordHash: "HASHVAL", salt: "SALTVAL", auth: { passwordHash: "NESTEDHASH" } });
    const s = serialized();
    for (const v of ["HASHVAL", "SALTVAL", "NESTEDHASH"]) expect(s).not.toContain(v);
  });
  it("M: identity numbers and names are not logged", () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    ctx.logInfo("x", { identityNumber: "123456789", displayName: "علي أحمد", firstName: "علي", familyName: "أحمد", email: "a@b.com" });
    const s = serialized();
    for (const v of ["123456789", "علي أحمد", "a@b.com"]) expect(s).not.toContain(v);
  });
  it("N: a request body is not logged", () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    ctx.logInfo("x", { body: { password: "BODYPW", userCode: "BODYCODE" }, requestBody: "raw=SECRET" });
    const s = serialized();
    for (const v of ["BODYPW", "BODYCODE", "raw=SECRET"]) expect(s).not.toContain(v);
  });
  it("O: student answers / answer keys are not logged", () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    ctx.logInfo("x", { answers: ["ANS1", "ANS2"], draftAnswers: { q1: "DRAFTANS" }, correctAnswer: "KEYANS", markScheme: "SCHEME" });
    const s = serialized();
    for (const v of ["ANS1", "ANS2", "DRAFTANS", "KEYANS", "SCHEME"]) expect(s).not.toContain(v);
  });
  it("keeps safe operational identifiers (assignmentId, classId, status, requestId)", () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    ctx.logInfo("x", { assignmentId: "A-99", classId: "C-7", status: 200, attempt: 2 });
    const s = serialized();
    expect(s).toContain("A-99"); expect(s).toContain("C-7"); expect(s).toContain("attempt");
  });
});

// ── Section 17 — the aggressive no-secret-logging regression ─────────────────
describe("R9 §17 — aggressive redaction sweep", () => {
  it("no sentinel secret value survives serialization", () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    const evil = {
      password: "S_password", temporaryPassword: "S_temporaryPassword", passwordHash: "S_passwordHash",
      salt: "S_salt", token: "S_token", authorization: "S_authorization", "x-student-token": "S_xstudenttoken",
      identityNumber: "S_identityNumber", displayName: "S_displayName", answers: ["S_answers"],
      draftAnswers: { a: "S_draftAnswers" }, correctAnswer: "S_correctAnswer",
      nested: { deep: { password: "S_deep_password", token: "S_deep_token" } },
      list: [{ salt: "S_list_salt" }, { passwordHash: "S_list_hash" }]
    };
    ctx.logInfo("evil.event", evil);
    ctx.logError("evil.error", new Error("wrapper"), evil);
    const s = serialized();
    const sentinels = ["S_password", "S_temporaryPassword", "S_passwordHash", "S_salt", "S_token", "S_authorization", "S_xstudenttoken", "S_identityNumber", "S_displayName", "S_answers", "S_draftAnswers", "S_correctAnswer", "S_deep_password", "S_deep_token", "S_list_salt", "S_list_hash"];
    for (const v of sentinels) expect(s).not.toContain(v);
    expect(records.length).toBe(2); // both events still emitted (redacted)
  });
  it("safeError reduces an Error to safe properties with no stack", () => {
    const e = new Error("domain message");
    e.stack = "at /secret/path/file.js:12";
    const safe = obs.safeError(e);
    expect(safe.errorName).toBe("Error");
    expect(JSON.stringify(safe)).not.toContain("secret/path");
    expect(JSON.stringify(safe)).not.toContain("stack");
  });
});

// ── Storage retry observability ──────────────────────────────────────────────
function storageFake(conflictTimes) {
  let uploads = 0;
  const store = { body: JSON.stringify({ v: 0 }), etag: '"e0"' };
  return {
    getBlobClient: () => ({ async download() { return { readableStreamBody: [Buffer.from(store.body, "utf8")], etag: store.etag }; } }),
    getBlockBlobClient: () => ({ async upload(body) {
      if (uploads < conflictTimes) { uploads++; const e = new Error("precondition"); e.statusCode = 412; e.code = "ConditionNotMet"; throw e; }
      store.body = String(body); store.etag = '"e' + (++uploads) + '"'; return { etag: store.etag };
    } })
  };
}

describe("R9 storage retry instrumentation", () => {
  it("P: a conflict-then-success emits storage.retry (and completes)", async () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    const result = await storage.mutateJsonWithRetry(storageFake(1), "platform/x.json", cur => ({ ...(cur || {}), touched: true }), obs.storageObserver(ctx, { operation: "test" }));
    expect(result.touched).toBe(true);
    expect(records.some(r => r.event === "storage.retry" && r.attempt === 1)).toBe(true);
    expect(records.some(r => r.event === "storage.retry.exhausted")).toBe(false);
  });
  it("Q: persistent conflict emits storage.retry.exhausted and throws StorageConflictError", async () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    await expect(storage.mutateJsonWithRetry(storageFake(99), "platform/x.json", cur => ({ ...(cur || {}), touched: true }), obs.storageObserver(ctx))).rejects.toBeInstanceOf(storage.StorageConflictError);
    expect(records.some(r => r.event === "storage.retry.exhausted")).toBe(true);
    const s = serialized();
    expect(s).not.toContain("platform/x.json"); // blob name never logged
  });
  it("existing 3-arg call sites are unaffected (observer optional)", async () => {
    const result = await storage.mutateJsonWithRetry(storageFake(0), "platform/x.json", cur => ({ ...(cur || {}), ok: 1 }));
    expect(result.ok).toBe(1);
  });
});

// ── Domain events on a real endpoint (login throttle carries no credentials) ──
describe("R9 domain events — safe", () => {
  it("R: platform-login throttle logs auth.login.throttled with NO credentials", async () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "platform-login" });
    const deps = { getContainer: () => ({}), reserveLoginAttempt: async () => ({ allowed: false, retryAfterSeconds: 5 }), clientIdFromRequest: () => "203.0.113.9" };
    const req = { method: "POST", headers: { get: () => null }, json: async () => ({ userCode: "victim@x", password: "SUPER_SECRET_PW" }) };
    const res = await loginHandler(req, deps, ctx);
    expect(res.status).toBe(429);
    const ev = records.find(r => r.event === "auth.login.throttled");
    expect(ev).toBeTruthy(); expect(ev.retryable).toBe(true);
    const s = serialized();
    expect(s).not.toContain("SUPER_SECRET_PW");
    expect(s).not.toContain("victim@x");
  });
  it("S: an endpoint failure log carries no request payload/answers", async () => {
    // Simulate a submission-style handler returning 500; the wrapper logs the failure without any body.
    const wrapped = obs.withObservability("student-submission", async () => ({ status: 500, jsonBody: { ok: false, error: "تعذر الحفظ" } }));
    await wrapped({ method: "POST", headers: { get: () => null }, json: async () => ({ answers: ["LEAKED_ANSWER"] }) });
    const s = serialized();
    expect(records.some(r => r.event === "http.request.failed")).toBe(true);
    expect(s).not.toContain("LEAKED_ANSWER");
  });
  it("T: an assignment lifecycle 409 is logged as a safe conflict", async () => {
    const wrapped = obs.withObservability("assignments", async () => ({ status: 409, jsonBody: { ok: false, error: "الواجب مؤرشف" } }));
    await wrapped(reqWith());
    const ev = records.find(r => r.event === "http.request.completed");
    expect(ev.status).toBe(409); expect(ev.errorCode).toBe("conflict");
  });
});

// ── Health endpoint ──────────────────────────────────────────────────────────
describe("R9 health endpoint", () => {
  it("U: returns minimal safe data (no secrets/env/topology)", async () => {
    process.env.SUPER_SECRET_ENV = "DO_NOT_LEAK";
    const res = await healthHandler();
    expect(res.status).toBe(200);
    expect(res.jsonBody.ok).toBe(true);
    expect(res.jsonBody.service).toBe("ExamBank791381");
    expect(typeof res.jsonBody.time).toBe("string");
    const body = JSON.stringify(res.jsonBody);
    expect(body).not.toContain("DO_NOT_LEAK");
    expect(body).not.toContain("BANK_SETUP_KEY");
    expect(body).not.toContain("r9-test-secret");
    delete process.env.SUPER_SECRET_ENV;
  });
  it("V: is no-store and (via the wrapper) carries X-Request-ID", async () => {
    const res = await healthHandler();
    expect(res.headers["Cache-Control"]).toBe("no-store");
    const wrapped = obs.withObservability("health", healthHandler);
    const wres = await wrapped(reqWith());
    expect(wres.headers["X-Request-ID"]).toBeTruthy();
    expect(wres.headers["Cache-Control"]).toBe("no-store");
  });
  it("safeVersion only returns a plain version token (never arbitrary env)", () => {
    process.env.APP_VERSION = "1.2.3+abc";
    expect(safeVersion()).toBe("1.2.3+abc");
    process.env.APP_VERSION = "evil value with spaces; rm -rf";
    expect(safeVersion()).toBe("");
    delete process.env.APP_VERSION;
  });
});

// ── Review fix #1 — an Error nested under a normal key cannot bypass redaction ──
describe("R9 fix#1 — Error objects never bypass redaction", () => {
  it("an Error under a non-sensitive key ('detail') leaks no message content", () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    ctx.logWarn("x", { detail: new Error("password=SECRET_SENTINEL identityNumber=123456789") });
    const s = serialized();
    expect(s).not.toContain("SECRET_SENTINEL");
    expect(s).not.toContain("123456789");
    // still useful for diagnostics
    expect(s).toContain("errorName");
  });
  it("an Error nested deep in objects/arrays leaks nothing", () => {
    const ctx = obs.createRequestContext(reqWith(), { route: "t" });
    ctx.logError("x", new Error("outer"), { a: { b: [{ c: new Error("token=DEEP_SENTINEL answer=علي") }] } });
    const s = serialized();
    expect(s).not.toContain("DEEP_SENTINEL");
    expect(s).not.toContain("علي");
  });
  it("safeError carries no message/stack", () => {
    const e = new Error("student answer = leak"); e.stack = "at /secret.js:1";
    const safe = obs.safeError(e);
    expect(safe.errorMessage).toBeUndefined();
    expect(JSON.stringify(safe)).not.toContain("leak");
    expect(JSON.stringify(safe)).not.toContain("secret.js");
    expect(safe.errorName).toBe("Error");
  });
});

// ── Review fix #2 — core telemetry fields are authoritative; header is canonical ──
describe("R9 fix#2 — request-id / core-field invariant", () => {
  it("caller-supplied extras cannot overwrite the six core fields", () => {
    const ctx = obs.createRequestContext(reqWith({ "x-request-id": "known-123" }), { route: "realroute" });
    ctx.logInfo("real.event", { requestId: "fake", route: "fake", event: "fake", method: "DELETE", level: "fake", timestamp: "fake", keep: "ok" });
    const rec = records[records.length - 1];
    expect(rec.requestId).toBe("known-123");
    expect(rec.route).toBe("realroute");
    expect(rec.event).toBe("real.event");
    expect(rec.method).toBe(ctx.method);
    expect(rec.level).toBe("info");
    expect(rec.keep).toBe("ok"); // non-core extras still pass through
  });
  it("a handler-provided X-Request-ID is overwritten by the canonical id; other headers preserved", async () => {
    const wrapped = obs.withObservability("t", async () => ({ status: 200, headers: { "X-Request-ID": "wrong-id", "Cache-Control": "no-store", "Retry-After": "5" }, jsonBody: { ok: true } }));
    const res = await wrapped(reqWith({ "x-request-id": "known-777" }));
    expect(res.headers["X-Request-ID"]).toBe("known-777");
    expect(Object.keys(res.headers).filter(k => k.toLowerCase() === "x-request-id").length).toBe(1);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.headers["Retry-After"]).toBe("5");
    // and the response id equals the id used in the log line
    const done = records.find(r => r.event === "http.request.completed");
    expect(done.requestId).toBe("known-777");
  });
});

// ── Review fix #3/#4 — REAL handler domain events (with DI), safe ─────────────
describe("R9 fix#3 — real endpoint domain events are emitted and safe", () => {
  const legacyAssignment = { assignmentId: "as1", classId: "c1", status: "published", durationMinutes: 0, maxAttempts: 1, dueAt: "", title: "T", examSnapshot: { questions: [] } };
  const subReq = body => ({ method: "POST", params: { assignmentId: "as1" }, headers: { get: () => null }, json: async () => body });
  const subDeps = extra => ({
    requireActiveStudentSession: async () => ({ ok: true, container: {}, student: { userId: "u1", classId: "c1", code: "S1", displayName: "Ali" } }),
    downloadJsonOrNull: async (_c, name) => name === "platform/assignments/as1.json" ? legacyAssignment : (name === "platform/classes/c1.json" ? { classId: "c1", active: true } : null),
    mutateJsonWithRetry: async (_c, _n, fn) => fn(null),
    withAssignmentLock: async (_c, _id, fn) => fn(),
    ...extra
  });

  it("A: a real student-submission failure emits student.submission.failed + a request failure, with NO answers leaked", async () => {
    // A storage write failure inside the saveDraft mutation → per-action catch logs the safe failure event,
    // then the outer catch returns 500 (the wrapper records the request failure).
    const deps = subDeps({ mutateJsonWithRetry: async () => { throw new Error("storage boom"); } });
    const wrapped = obs.withObservability("student-submission", submissionHandler);
    const res = await wrapped(subReq({ action: "saveDraft", answers: { q1: "LEAKED_ANSWER_SENTINEL" } }), deps);
    expect(res.status).toBe(500);
    const failed = records.find(r => r.event === "student.submission.failed");
    expect(failed).toBeTruthy(); expect(failed.action).toBe("saveDraft");
    expect(records.some(r => r.event === "http.request.failed")).toBe(true);
    expect(serialized()).not.toContain("LEAKED_ANSWER_SENTINEL");
    expect(serialized()).not.toContain("storage boom"); // raw error message never logged
  });

  it("D: a routine saveDraft SUCCESS does not emit an INFO domain-event flood", async () => {
    const wrapped = obs.withObservability("student-submission", submissionHandler);
    const res = await wrapped(subReq({ action: "saveDraft", answers: { q1: "x" } }), subDeps());
    expect(res.status).toBe(200);
    // no per-save domain INFO event, and exactly ONE terminal request event
    expect(records.some(r => r.event === "student.submission.completed" && r.action === "saveDraft")).toBe(false);
    expect(records.filter(r => r.event === "http.request.completed" || r.event === "http.request.failed").length).toBe(1);
  });

  it("B: a real assignment archive conflict emits assignment.lifecycle.conflict with assignmentId and NO submission content", async () => {
    const deps = {
      requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }),
      getContainer: () => ({}),
      withAssignmentLock: async (_c, _id, fn) => fn(),
      downloadJsonOrNull: async (_c, name) => name === "platform/assignments/as1.json" ? { assignmentId: "as1", classId: "c1", status: "published", title: "T" } : null,
      listBlobNames: async () => ["platform/submissions/as1/u1.json"],
      listJson: async () => [{ attempts: [], activeAttempt: { attemptNumber: 1, startedAt: new Date().toISOString(), status: "started" }, draftAnswers: { q1: "SUBMISSION_SENTINEL" } }],
      recordAuditEvent: async () => {}
    };
    const req = { method: "POST", url: "http://x/assignments", headers: { get: () => null }, json: async () => ({ action: "archive", assignmentId: "as1" }) };
    const wrapped = obs.withObservability("assignments", manageAssignmentsHandler);
    const res = await wrapped(req, deps);
    expect(res.status).toBe(409);
    expect(res.jsonBody.requiresConfirmation).toBe(true);
    const ev = records.find(r => r.event === "assignment.lifecycle.conflict");
    expect(ev).toBeTruthy(); expect(ev.assignmentId).toBe("as1");
    expect(serialized()).not.toContain("SUBMISSION_SENTINEL");
  });

  it("C: a real import-analyze failure emits import.started + import.failed, leaking no request body content", async () => {
    const prev = process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_STORAGE_CONNECTION_STRING; // getRawContainer() will throw → import.failed
    const token = createBuilderToken("t1");
    const req = { method: "POST", headers: { get: k => (String(k).toLowerCase() === "authorization" ? "Bearer " + token : null) }, json: async () => ({ importJobId: "imp-abc-123", password: "IMPORT_BODY_SENTINEL" }) };
    // Wrap the inner with the TEST's observability instance so its logs reach our sink (vitest gives ESM
    // import and the module's own require() separate instances).
    const res = await obs.withObservability("import-analyze", importAnalyzeInner)(req);
    expect(res.status).toBe(500);
    expect(res.headers["X-Request-ID"]).toBeTruthy();
    expect(records.some(r => r.event === "import.started")).toBe(true);
    expect(records.some(r => r.event === "import.failed")).toBe(true);
    expect(serialized()).not.toContain("IMPORT_BODY_SENTINEL");
    if (prev !== undefined) process.env.AZURE_STORAGE_CONNECTION_STRING = prev;
  });
});
