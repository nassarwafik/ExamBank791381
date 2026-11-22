import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase T14 (docs/enterprise-student-tools-csharp-editor-design.md) — POST /api/student-tools/csharp-run: the SERVER authority for
// running code from the student tool bar's «محرر C#», through the REAL handler, the in-memory container and real access helpers.
// The runner is a recording double (nothing executes here). Owner decision: running from the tool bar is for BOOKS only — an exam or
// assignment never runs (its editor is a writing aid), so the route has no exam context and an exam-shaped body reaches nothing.
//   • WHO: the class offers the course and the book's tools for that class allow running (teacher choice or built-in set); a teacher
//     only for a book they are entitled to.
//   • WHAT: exactly one body shape; language, wrapper and limits are the server's.
//   • every refusal reaches neither the runner nor the rate-limit bucket; NO RECORD besides the bucket; 20 / 5 min then 429;
//     runner absent / bucket storage failure → 503; telemetry never carries the code, the input or the output.
const cjs = createRequire(import.meta.url);
const { handler, parseToolRunBody } = cjs("../src/functions/student-tool-run.js");

const S1 = "11111111-1111-1111-1111-111111111111", AID = "asg-t14-run", AID2 = "asg-t14-other";
const BOOK = "899271d";   // مبنى المعطيات: its built-in tool set has the C# editor with running on
const RUN_SPEC = { version: 1, tools: [{ id: "csharpEditor", allowRun: true }, { id: "calculator", variant: "basic", angleUnit: "deg" }] };
const exam = (studentTools = RUN_SPEC) => ({ title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [
  { examQuestionId: "t1", presentationType: "shortAnswer", text: "نص", marks: 2, answer: "x" }] }, { id: "s2", title: "القسم ٢", gradingPolicy: "all", questions: [
  { examQuestionId: "t2", presentationType: "shortAnswer", text: "نص", marks: 2, answer: "y" }] }], ...(studentTools === null ? {} : { studentTools }) });
const nowIso = () => new Date().toISOString();
const assignment = (over = {}) => ({ schemaVersion: 2, attemptModelVersion: 3, attemptPolicy: "pausable", assignmentId: AID, classId: "c1", title: "واجب", instructions: "", status: "published", openAt: "", dueAt: new Date(Date.now() + 864e5).toISOString(), maxAttempts: 1, durationMinutes: 30, questionCount: 2, totalMarks: 4, examSnapshot: exam(), ...over });
const activeDoc = (over = {}) => ({ schemaVersion: 1, assignmentId: AID, studentId: S1, classId: "c1", draftAnswers: {}, draftSavedAt: nowIso(), attempts: [], activeAttempt: { attemptNumber: 1, startedAt: nowIso(), endsAt: new Date(Date.now() + 30 * 60000).toISOString(), status: "draft", attemptEpoch: 1, pauseCount: 0 }, ...over });
const SUB = "platform/submissions/" + AID + "/" + S1 + ".json";
const room = (over = {}) => ({ classId: "c1", name: "الصف", active: true, status: "active", studentIds: [S1], learningMaterials: [{ courseId: BOOK, visibleModuleIds: [] }], ...over });

function seed({ a = assignment(), doc = activeDoc(), classroom = room(), extra = {} } = {}) {
  return createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "سارة", code: "S1", classId: "c1", active: true, archived: false, authVersion: 1 },
    ...(classroom ? { "platform/classes/c1.json": classroom } : {}),
    ["platform/assignments/" + AID + ".json"]: a,
    ["platform/assignments/" + AID2 + ".json"]: assignment({ assignmentId: AID2, classId: "c2" }),
    ...(doc ? { [SUB]: doc } : {}),
    ...extra
  });
}
function provider({ available = true, languages = [{ key: "csharp", languageVersion: 1 }], execute } = {}) {
  const calls = [];
  return {
    calls,
    capabilities: () => (available ? { available: true, languages } : { available: false, languages: [] }),
    execute: async r => { calls.push(r); if (execute) return execute(r); return { status: "success", stdout: "OUT-CANARY\n", stderr: "", exitCode: 0, durationMs: 5 }; }
  };
}
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) };
const BUILDER_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const studentDeps = (ctx, p, extra = {}) => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), container: ctx.container, getContainer: () => ctx.container, codingExecutionProvider: p, env: {}, ...extra });
const teacherDeps = (ctx, p, extra = {}) => ({ ...BUILDER_OK, container: ctx.container, getContainer: () => ctx.container, codingExecutionProvider: p, env: {}, ...extra });
const req = (text, method = "POST") => ({ method, url: "https://x/api/student-tools/csharp-run", params: {}, headers: new Headers({ "content-type": "application/json" }), text: async () => text });
const run = (deps, body, obs = null, method = "POST") => handler(req(typeof body === "string" ? body : JSON.stringify(body), method), deps, obs);
const SOURCE = "static void Main()\n{\n    Console.WriteLine(Console.ReadLine());\n}";
const EXAM_BODY = { context: "exam", assignmentId: AID, source: SOURCE, stdin: "IN-CANARY\n" };
const BOOK_BODY = { context: "book", courseId: BOOK, source: SOURCE, stdin: "IN-CANARY\n" };
const throttle = ctx => ctx.names("platform/throttle/");
const stored = ctx => JSON.stringify(ctx.names("platform/").filter(n => !n.startsWith("platform/throttle/")).sort().map(n => [n, ctx.getJson(n)]));
function logs() { const all = []; const rec = level => (name, data) => all.push([level, name, data]); return { all, logInfo: rec("info"), logWarn: rec("warn"), logError: rec("error") }; }

describe("T14 — the body: books only", () => {
  it("exactly { context: book, courseId, source, stdin }, strings, bounded (bytes), a blank source refused", () => {
    expect(parseToolRunBody(JSON.stringify(BOOK_BODY))).toEqual(BOOK_BODY);
    const bad = [EXAM_BODY, { ...BOOK_BODY, assignmentId: AID }, { ...BOOK_BODY, context: "exam" }, { ...EXAM_BODY, context: "book" },
      { ...BOOK_BODY, limits: { timeMs: 60000 } }, { ...BOOK_BODY, language: "python" }, { ...BOOK_BODY, sectionId: "s1" }, { ...BOOK_BODY, context: "other" },
      { ...BOOK_BODY, source: 5 }, { ...BOOK_BODY, courseId: 7 }, (() => { const b = { ...BOOK_BODY }; delete b.stdin; return b; })(), [BOOK_BODY], null];
    for (const b of bad) expect(parseToolRunBody(JSON.stringify(b)).error, JSON.stringify(b)).toBe("REQUEST_INVALID");
    expect(parseToolRunBody("{nope").error).toBe("REQUEST_INVALID");
    expect(parseToolRunBody(JSON.stringify({ ...BOOK_BODY, source: "ب".repeat(8 * 1024 + 1) })).error).toBe("TOO_LARGE");
    expect(parseToolRunBody(JSON.stringify({ ...BOOK_BODY, stdin: "1".repeat(4 * 1024 + 1) })).error).toBe("TOO_LARGE");
    expect(parseToolRunBody("x".repeat(64 * 1024 + 1)).error).toBe("TOO_LARGE");
    expect(parseToolRunBody(JSON.stringify({ ...BOOK_BODY, source: " \n\t" })).error).toBe("SOURCE_EMPTY");
  });
});

describe("T14 — an exam never runs from the tool bar (owner decision)", () => {
  it("an exam-shaped body is 400 even when the exam's own spec says allowRun, for a student with a writable attempt; nothing reached", async () => {
    const ctx = seed();                                                          // exam(): csharpEditor + allowRun:true, attempt open
    const before = stored(ctx);
    const p = provider();
    for (const actorDeps of [studentDeps(ctx, p), teacherDeps(ctx, p)]) {
      const r = await run(actorDeps, EXAM_BODY);
      expect([r.status, r.jsonBody.code]).toEqual([400, "REQUEST_INVALID"]);
    }
    expect(p.calls).toHaveLength(0);
    expect(throttle(ctx)).toEqual([]);
    expect(stored(ctx)).toBe(before);
  });
});

describe("T14 — book context: the class's book tools decide", () => {
  it("the built-in set of a C# book allows it; a book whose set has no editor refuses", async () => {
    const ctx = seed(), p = provider();
    const before = stored(ctx);
    expect((await run(studentDeps(ctx, p), BOOK_BODY)).status).toBe(200);
    const call = p.calls[0];
    expect(Object.keys(call).sort()).toEqual(["language", "languageVersion", "limits", "requestId", "source", "stdin"]);
    expect([call.language, call.languageVersion, call.limits, call.stdin]).toEqual(["csharp", 1, { timeMs: 2000, memoryMb: 128, outputBytes: 16384 }, "IN-CANARY\n"]);
    expect(call.source.startsWith("public class Program { static void Main()")).toBe(true);
    expect(stored(ctx)).toBe(before);                                                     // nothing stored but the bucket
    expect(throttle(ctx)).toHaveLength(1);
    const net = seed({ classroom: room({ learningMaterials: [{ courseId: "791381", visibleModuleIds: [] }] }) });
    const r = await run(studentDeps(net, p), { ...BOOK_BODY, courseId: "791381" });
    expect([r.status, r.jsonBody.code]).toEqual([403, "RUN_NOT_ALLOWED"]);
    expect(p.calls).toHaveLength(1);
    expect(throttle(net)).toEqual([]);
  });
  it("the teacher's choice for the class wins over the built-in set, both ways", async () => {
    const p = provider();
    const off = seed({ classroom: room({ learningMaterials: [{ courseId: BOOK, visibleModuleIds: [], studentTools: { version: 1, tools: [{ id: "csharpEditor", allowRun: false }] } }] }) });
    expect((await run(studentDeps(off, p), BOOK_BODY)).jsonBody.code).toBe("RUN_NOT_ALLOWED");
    const none = seed({ classroom: room({ learningMaterials: [{ courseId: BOOK, visibleModuleIds: [], studentTools: { version: 1, tools: [] } }] }) });
    expect((await run(studentDeps(none, p), BOOK_BODY)).jsonBody.code).toBe("RUN_NOT_ALLOWED");
    expect(p.calls).toHaveLength(0);
    const on = seed({ classroom: room({ learningMaterials: [{ courseId: "791381", visibleModuleIds: [], studentTools: { version: 1, tools: [{ id: "csharpEditor", allowRun: true }] } }] }) });
    expect((await run(studentDeps(on, p), { ...BOOK_BODY, courseId: "791381" })).status).toBe(200);
  });
  it("refused: course not attached, no class, archived class, unknown / malformed course id", async () => {
    const p = provider();
    const cases = [
      [seed({ classroom: room({ learningMaterials: [] }) }), BOOK_BODY, 403],
      [seed({ classroom: null }), BOOK_BODY, 403],
      [seed({ classroom: room({ status: "archived", active: false }) }), BOOK_BODY, 403],
      [seed(), { ...BOOK_BODY, courseId: "../x" }, 404],
      [seed(), { ...BOOK_BODY, courseId: "toString" }, 403],
    ];
    for (const [ctx, b, status] of cases) {
      expect((await run(studentDeps(ctx, p), b)).status, JSON.stringify(b)).toBe(status);
      expect(throttle(ctx)).toEqual([]);
    }
    expect(p.calls).toHaveLength(0);
  });
  it("a teacher entitled to the course may run in a book (the Reader's preview)", async () => {
    const ctx = seed({ classroom: null }), p = provider();
    expect((await run(teacherDeps(ctx, p), BOOK_BODY)).status).toBe(200);
    expect((await run(teacherDeps(ctx, p), { ...BOOK_BODY, courseId: "000000" })).status).toBe(404);
    expect(p.calls).toHaveLength(1);
  });
});

describe("T14 — runner, budget, telemetry", () => {
  it("no runner / no C# → 503 before the bucket; RUNNER_BUSY → 503 retryable; a run result is relayed as it is (compile error)", async () => {
    for (const p of [provider({ available: false }), provider({ languages: [{ key: "python", languageVersion: 1 }] })]) {
      const ctx = seed();
      const r = await run(studentDeps(ctx, p), BOOK_BODY);
      expect(r.status).toBe(503);
      expect(p.calls).toHaveLength(0);
      expect(throttle(ctx)).toEqual([]);
    }
    const busy = await run(studentDeps(seed(), provider({ execute: () => { const e = new Error("busy"); e.code = "RUNNER_BUSY"; throw e; } })), BOOK_BODY);
    expect(busy.status).toBe(503);
    expect(busy.jsonBody.retryable).toBe(true);
    const ce = await run(studentDeps(seed(), provider({ execute: () => ({ status: "compile-error", stdout: "", stderr: "Program.cs(3,5): error CS1002: ; expected", exitCode: 1 }) })), BOOK_BODY);
    expect([ce.status, ce.jsonBody.result.status, ce.jsonBody.result.stderr]).toEqual([200, "compile-error", "Program.cs(3,5): error CS1002: ; expected"]);
  });
  it("20 runs per 5 minutes per actor and book, then 429 with Retry-After; a bucket storage failure fails closed", async () => {
    const ctx = seed(), p = provider();
    for (let i = 0; i < 20; i++) expect((await run(studentDeps(ctx, p), BOOK_BODY)).status).toBe(200);
    const r = await run(studentDeps(ctx, p), BOOK_BODY);
    expect([r.status, r.jsonBody.code]).toEqual([429, "RATE_LIMITED"]);
    expect(Number(r.headers["Retry-After"])).toBeGreaterThan(0);
    expect((await run(studentDeps(ctx, p), { ...BOOK_BODY, courseId: "899371" })).status).toBe(403);   // (no class course) never reaches the bucket
    expect(p.calls).toHaveLength(20);
    const failing = studentDeps(seed(), p, { mutateJsonWithRetry: async () => { throw new Error("storage down"); } });
    const f = await run(failing, BOOK_BODY);
    expect([f.status, f.jsonBody.code]).toEqual([503, "EXECUTION_UNAVAILABLE"]);
    expect(p.calls).toHaveLength(20);
  });
  it("GET answers whether the runner offers C# now, to a signed-in actor only; it runs nothing and writes nothing", async () => {
    const ctx = seed();
    const get = (deps) => handler(req("", "GET"), deps);
    expect((await get(studentDeps(ctx, provider()))).jsonBody).toEqual({ ok: true, available: true });
    expect((await get(teacherDeps(ctx, provider()))).jsonBody).toEqual({ ok: true, available: true });
    expect((await get(studentDeps(ctx, provider({ available: false })))).jsonBody).toEqual({ ok: true, available: false });
    expect((await get(studentDeps(ctx, provider({ languages: [{ key: "python", languageVersion: 1 }] })))).jsonBody).toEqual({ ok: true, available: false });
    expect((await get({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), container: ctx.container, env: {} })).status).toBe(401);
    expect(throttle(ctx)).toEqual([]);
  });
  it("telemetry never carries the code, the input or the output; PUT is 405", async () => {
    const o = logs();
    await run(studentDeps(seed(), provider()), BOOK_BODY, o);
    await run(studentDeps(seed({ classroom: room({ learningMaterials: [] }) }), provider()), BOOK_BODY, o);
    const text = JSON.stringify(o.all);
    expect(o.all.map(([, name]) => name)).toEqual(["student-tool.run.completed", "student-tool.run.refused"]);
    for (const canary of ["Console", "IN-CANARY", "OUT-CANARY", S1]) expect(text).not.toContain(canary);
    expect((await run(studentDeps(seed(), provider()), BOOK_BODY, null, "PUT")).status).toBe(405);
  });
});
