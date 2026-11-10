import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// 899371 P8 (docs/enterprise-899371-learning-plan.md §21) — «جرّب الكود»: the SERVER authority for running a book program from the
// Reader, over the REAL generated run index and the in-memory container; the runner is a recording double (nothing executes here —
// runner/tests/docker-official/learning-run-899371.rtest.js proves every indexed program on the real runner).
//   • the run index is exactly the build of its evidence, and its evidence is exactly the served C# programs (no drift);
//   • the wrap rule keeps the learner's line numbers;
//   • WHO: a student only for a block of a module PUBLISHED to their persisted class (course attached, class not archived); a
//     teacher (builder session); nobody else — and a refusal reaches neither the runner nor the rate-limit bucket;
//   • WHAT: exactly { pageId, blockId, source, stdin }; the server fixes language, wrapper and limits; size and blank limits;
//   • the runner receives only the minimal request (no identity, course, page or block);
//   • NO RECORD: the only write is the rate-limit bucket (its own key per course); 20 runs / 5 min then 429 + Retry-After;
//   • RUNNER_BUSY / no runner / bucket failure → 503, never a run; telemetry never carries the code, the input or the output.
const cjs = createRequire(import.meta.url);
const { handler } = cjs("../src/functions/learning-run.js");
const L = cjs("../src/lib/learning-run.js");
const B = await import("../../scripts/build-learning-run-index.mjs");
const evidenceFile = cjs("../../scripts/learning-run/899371.json");

const CID = "899371";
const INDEX = L.loadRunIndex(CID);
const entries = Object.entries(INDEX.pages).flatMap(([pageId, p]) => Object.entries(p.blocks).map(([blockId, b]) => ({ pageId, blockId, moduleId: b.moduleId })));
const M04 = entries.find(e => e.moduleId === "899371-m04"), M07 = entries.find(e => e.moduleId === "899371-m07");
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1" });
const room = (id, visible, extra = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: ["u1"], learningMaterials: visible === null ? [] : [{ courseId: CID, visibleModuleIds: visible }], ...extra });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const BUILDER_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const STUDENT_NO = { requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) };
const seed = (visible, extra = {}) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", visible), ...extra });

/** A recording double of the execution provider (17A contract). */
function provider({ available = true, execute } = {}) {
  const calls = [];
  return {
    calls,
    capabilities: () => (available ? { available: true, languages: [{ key: "csharp", languageVersion: 1 }] } : { available: false, languages: [] }),
    execute: async req => { calls.push(req); if (execute) return execute(req); return { status: "success", stdout: "OUT-CANARY\n", stderr: "", exitCode: 0, durationMs: 7 }; },
  };
}
function logs() { const all = []; const rec = level => (name, data) => all.push([level, name, data]); return { all, logInfo: rec("info"), logWarn: rec("warn"), logError: rec("error") }; }
const studentDeps = (ctx, p, extra = {}) => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container, codingExecutionProvider: p, ...extra });
const teacherDeps = (ctx, p, extra = {}) => ({ ...BUILDER_OK, container: ctx.container, getContainer: () => ctx.container, codingExecutionProvider: p, ...extra });
const list = (deps, courseId = CID) => handler({ method: "GET", url: "https://x/api/learning-run", headers: { get: () => null }, params: { courseId } }, deps);
const runText = (deps, text, courseId = CID, obs = null) => handler({ method: "POST", url: "https://x/api/learning-run", headers: { get: () => null }, params: { courseId, action: "run" }, text: async () => text }, deps, obs);
const run = (deps, body, courseId, obs) => runText(deps, JSON.stringify(body), courseId, obs);
const SOURCE = "static void Main(string[] args)\n{\n    Console.WriteLine(\"SRC-CANARY\");\n}";
const body = (e = M04, over = {}) => ({ pageId: e.pageId, blockId: e.blockId, source: SOURCE, stdin: "IN-CANARY\n", ...over });
const throttle = ctx => ctx.names("platform/throttle/");

describe("899371 P8 — the run index", () => {
  it("is exactly the build of its evidence; the evidence is exactly the served C# programs with a Main (no drift)", () => {
    const now = B.candidates(CID);
    expect(evidenceFile.candidates.map(e => [e.pageId, e.blockId, e.moduleId, e.codeSha])).toEqual(now.map(c => [c.pageId, c.blockId, c.moduleId, L.codeSha(c.code)]));
    expect(INDEX).toEqual(B.indexFrom(CID, evidenceFile.candidates));
    expect(evidenceFile.candidates).toHaveLength(93);
    expect(entries).toHaveLength(91);
    expect(evidenceFile.candidates.filter(e => e.compileExit !== 0).map(e => [e.blockId, e.diagnostics])).toEqual([["m11-l01-p03-b03", ["CS0246"]], ["m11-l01-p03-b06", ["CS8803"]]]);
    for (const e of entries) expect(e.pageId.startsWith(e.moduleId + "-"), e.pageId).toBe(true);
    expect(Object.isFrozen(INDEX.pages)).toBe(true);
  });
  it("lookups: own properties only, ids validated, a block of another page is not found", () => {
    expect(L.findRunBlock(INDEX, M04.pageId, M04.blockId)).toEqual({ moduleId: "899371-m04" });
    expect(L.findRunBlock(INDEX, M07.pageId, M04.blockId)).toBeNull();
    for (const [p, b] of [["__proto__", "x"], [M04.pageId, "__proto__"], [M04.pageId, "constructor"], ["../x", M04.blockId], [M04.pageId, ""], ["", ""]]) expect(L.findRunBlock(INDEX, p, b), p + "/" + b).toBeNull();
    expect(L.loadRunIndex("791381")).toBeNull();
    expect(L.loadRunIndex("../learning-run/899371")).toBeNull();
  });
  it("the wrap keeps the learner's line numbers; a source that declares a class is sent as it is", () => {
    const w = L.wrapProgram(SOURCE);
    expect(w.split("\n").slice(0, 4)).toEqual(["public class Program { static void Main(string[] args)", "{", "    Console.WriteLine(\"SRC-CANARY\");", "}"]);
    expect(w.split("\n").length).toBe(SOURCE.split("\n").length + 2);
    const cls = "class P { static void Main() {} }";
    expect(L.wrapProgram(cls)).toBe(cls);
  });
  it("the body parser: exactly four string fields, ids valid, size limits, a blank source refused", () => {
    expect(L.parseRunBody(JSON.stringify(body()))).toEqual(body());
    const bad = [{ ...body(), limits: { timeMs: 99999 } }, { ...body(), language: "python" }, (() => { const b = body(); delete b.stdin; return b; })(), { ...body(), source: 5 }, { ...body(), pageId: "../x" }, [body()], null];
    for (const b of bad) expect(L.parseRunBody(JSON.stringify(b)).error, JSON.stringify(b)).toBe("REQUEST_INVALID");
    expect(L.parseRunBody("{nope").error).toBe("REQUEST_INVALID");
    expect(L.parseRunBody(JSON.stringify(body(M04, { source: "x".repeat(16 * 1024 + 1) }))).error).toBe("TOO_LARGE");
    expect(L.parseRunBody(JSON.stringify(body(M04, { source: "ب".repeat(8 * 1024 + 1) }))).error).toBe("TOO_LARGE");   // bytes, not characters
    expect(L.parseRunBody(JSON.stringify(body(M04, { stdin: "1".repeat(4 * 1024 + 1) }))).error).toBe("TOO_LARGE");
    expect(L.parseRunBody(JSON.stringify(body(M04, { source: "  \n\t " }))).error).toBe("SOURCE_EMPTY");
    expect(L.parseRunBody("x".repeat(64 * 1024 + 1)).error).toBe("TOO_LARGE");
  });
});

describe("899371 P8 — who may run (GET the list, POST a run)", () => {
  it("a student sees only the blocks of the modules published to their persisted class; a teacher sees all 91", async () => {
    const ctx = seed(["899371-m04"]);
    const r = await list(studentDeps(ctx, provider()));
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, actor: "student", available: true });
    expect(Object.values(r.jsonBody.blocks).flat().sort()).toEqual(entries.filter(e => e.moduleId === "899371-m04").map(e => e.blockId).sort());
    const t = await list(teacherDeps(seed(null), provider()));
    expect(t.jsonBody.actor).toBe("teacher");
    expect(Object.values(t.jsonBody.blocks).flat()).toHaveLength(91);
    expect((await list(teacherDeps(seed(null), provider({ available: false })))).jsonBody.available).toBe(false);
  });
  it("refusals: no session 401, unknown course 404, class without the course / no class / archived class 403", async () => {
    const p = provider();
    expect((await list({ ...BUILDER_NO, ...STUDENT_NO }))).toMatchObject({ status: 401 });
    expect((await list(teacherDeps(seed(null), p), "791381")).status).toBe(404);
    expect((await list(teacherDeps(seed(null), p), "../x")).status).toBe(404);
    expect((await list(studentDeps(seed(null), p))).status).toBe(403);                                     // course not attached
    const noClass = createMemoryContainer({ [USR("u1")]: student("u1", "") });
    expect((await list(studentDeps(noClass, p))).status).toBe(403);
    const archived = seed(["899371-m04"], { [CLS("cA")]: room("cA", ["899371-m04"], { status: "archived", active: false }) });
    expect((await run(studentDeps(archived, p), body())).status).toBe(403);
    expect(p.calls).toHaveLength(0);
    expect(throttle(archived)).toEqual([]);
  });
  it("a block of a module NOT published to the class is refused before the runner and the bucket", async () => {
    const ctx = seed(["899371-m04"]);
    const p = provider();
    const r = await run(studentDeps(ctx, p), body(M07));
    expect([r.status, r.jsonBody.code]).toEqual([403, "UNAVAILABLE"]);
    expect(p.calls).toHaveLength(0);
    expect(throttle(ctx)).toEqual([]);
  });
  it("an unknown block, a block under another page, or a malformed body: refused, nothing runs, nothing written", async () => {
    const ctx = seed(["899371-m04", "899371-m07"]);
    const p = provider();
    const cases = [
      [body(M04, { blockId: "m04-l01-p05-b99" }), 404], [body(M04, { pageId: M07.pageId }), 404],
      [{ ...body(), limits: { timeMs: 60000 } }, 400], [{ ...body(), assignmentId: "a1" }, 400], [body(M04, { source: "   " }), 400],
      [body(M04, { source: "x".repeat(20000) }), 413],
    ];
    for (const [b, status] of cases) expect((await run(studentDeps(ctx, p), b)).status, JSON.stringify(b).slice(0, 80)).toBe(status);
    expect(p.calls).toHaveLength(0);
    expect(throttle(ctx)).toEqual([]);
  });
});

// The runner request names no identity, course, page or block. Its requestId is RANDOM (crypto.randomBytes(16) → 22 base64url
// characters), so it is checked as an opaque token and left out of the text scan: ~1 % of random ids contain «u1» or «cA» by
// chance, which failed CI run 42849056593 with nothing leaked.
const expectMinimalRunnerRequest = req => {
  expect(req.requestId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  const { requestId: _random, ...named } = req;
  expect(JSON.stringify(named)).not.toMatch(/u1|cA|899371|teacher|m04-l01/);
};

describe("899371 P8 — a run", () => {
  it("the runner receives only language, the WRAPPED source, the input and the server's limits; the student gets the result", async () => {
    const ctx = seed(["899371-m04"]);
    const p = provider();
    const before = ctx.names("").sort();
    const r = await run(studentDeps(ctx, p), body());
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, result: expect.objectContaining({ status: "success", stdout: "OUT-CANARY\n" }) });
    expect(p.calls).toHaveLength(1);
    const req = p.calls[0];
    expect(Object.keys(req).sort()).toEqual(["language", "languageVersion", "limits", "requestId", "source", "stdin"]);
    expect(req).toMatchObject({ language: "csharp", languageVersion: 1, source: L.wrapProgram(SOURCE), stdin: "IN-CANARY\n", limits: { timeMs: 2000, memoryMb: 128, outputBytes: 16384 } });
    expectMinimalRunnerRequest(req);
    // NO RECORD: the only new document is the rate-limit bucket
    const added = ctx.names("").sort().filter(n => !before.includes(n));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^platform\/throttle\/coding-run-[0-9a-f]{64}\.json$/);
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });
  it("a random requestId that happens to contain «u1» / «cA» is still a minimal request (CI run 42849056593)", async () => {
    const crypto = cjs("node:crypto");
    const forced = Buffer.from("u1cAu1cAu1cAu1cAu1cAu1", "base64url");                // 16 bytes whose base64url spells «u1cA…»
    const spy = vi.spyOn(crypto, "randomBytes").mockImplementation(n => (n === 16 ? Buffer.from(forced) : Buffer.alloc(n)));
    try {
      const p = provider();
      expect((await run(studentDeps(seed(["899371-m04"]), p), body())).status).toBe(200);
      expect(p.calls[0].requestId).toBe(forced.toString("base64url"));                   // «u1cA…u1cAuw»
      expectMinimalRunnerRequest(p.calls[0]);
    } finally { spy.mockRestore(); }
  });
  it("a teacher previewing the course may run any indexed block (and is rate-limited too)", async () => {
    const ctx = seed(null);
    const p = provider();
    expect((await run(teacherDeps(ctx, p), body(M07))).status).toBe(200);
    expect(p.calls).toHaveLength(1);
    expect(throttle(ctx)).toHaveLength(1);
  });
  it("20 runs per 5 minutes per learner and course, then 429 with Retry-After; the bucket is not an assignment's", async () => {
    const ctx = seed(["899371-m04"]);
    const p = provider();
    for (let i = 0; i < 20; i++) expect((await run(studentDeps(ctx, p), body())).status, "run " + (i + 1)).toBe(200);
    const r = await run(studentDeps(ctx, p), body());
    expect([r.status, r.jsonBody.code]).toEqual([429, "RATE_LIMITED"]);
    expect(Number(r.headers["Retry-After"])).toBeGreaterThan(0);
    expect(r.jsonBody.retryAfterSeconds).toBe(Number(r.headers["Retry-After"]));
    expect(p.calls).toHaveLength(20);
    const crypto = cjs("node:crypto");
    const assignmentBucket = "platform/throttle/coding-run-" + crypto.createHash("sha256").update("u1|" + CID).digest("hex") + ".json";
    expect(throttle(ctx)).toHaveLength(1);
    expect(throttle(ctx)[0]).not.toBe(assignmentBucket);
  });
  it("no runner → 503 before the bucket; RUNNER_BUSY → 503 retryable; a bucket that cannot be written → 503, never a run", async () => {
    const ctx = seed(["899371-m04"]);
    const none = provider({ available: false });
    const a = await run(studentDeps(ctx, none), body());
    expect([a.status, a.jsonBody.code, a.jsonBody.retryable]).toEqual([503, "EXECUTION_UNAVAILABLE", true]);
    expect(throttle(ctx)).toEqual([]);
    const busy = provider({ execute: () => { const e = new Error("busy"); e.code = "RUNNER_BUSY"; throw e; } });
    const b = await run(studentDeps(ctx, busy), body());
    expect([b.status, b.jsonBody.code, b.jsonBody.retryable]).toEqual([503, "RUNNER_BUSY", true]);
    const p = provider();
    const c = await run(studentDeps(ctx, p, { mutateJsonWithRetry: async () => { throw new Error("storage down"); } }), body());
    expect([c.status, c.jsonBody.code]).toEqual([503, "EXECUTION_UNAVAILABLE"]);
    expect(p.calls).toHaveLength(0);
  });
  it("a compile error is a normal answer (the learner reads the compiler), not a refusal", async () => {
    const ctx = seed(["899371-m04"]);
    const p = provider({ execute: () => ({ status: "compile-error", stdout: "", stderr: "Program.cs(3,5): error CS1002: ; expected", exitCode: 1 }) });
    const r = await run(studentDeps(ctx, p), body());
    expect(r.status).toBe(200);
    expect(r.jsonBody.result).toMatchObject({ status: "compile-error", stderr: expect.stringContaining("CS1002") });
  });
  it("telemetry never carries the code, the input or the output", async () => {
    const ctx = seed(["899371-m04"]);
    const obs = logs();
    await run(studentDeps(ctx, provider()), body(), CID, obs);
    await run(studentDeps(ctx, provider()), body(M07), CID, obs);
    await runText(studentDeps(ctx, provider()), JSON.stringify({ ...body(), extra: "SRC-CANARY" }), CID, obs);
    expect(obs.all.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(obs.all)).not.toMatch(/SRC-CANARY|IN-CANARY|OUT-CANARY/);
  });
  it("only GET (the list) and POST …/run exist", async () => {
    const ctx = seed(["899371-m04"]);
    const deps = studentDeps(ctx, provider());
    expect((await handler({ method: "POST", url: "https://x", headers: { get: () => null }, params: { courseId: CID }, text: async () => "{}" }, deps)).status).toBe(405);
    expect((await handler({ method: "GET", url: "https://x", headers: { get: () => null }, params: { courseId: CID, action: "run" } }, deps)).status).toBe(405);
    expect((await handler({ method: "DELETE", url: "https://x", headers: { get: () => null }, params: { courseId: CID } }, deps)).status).toBe(405);
  });
});
