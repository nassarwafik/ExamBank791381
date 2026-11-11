import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// 899371 enrichment P14 (docs/enterprise-899371-enrichment-plan.md §11) — «حلّ وافحص» and the solution card: the SERVER authority
// over the REAL generated solve index and the in-memory container; the runner is a recording double (nothing executes here —
// scripts/prove-899371-solve.mjs ran every reference and known-wrong solution on the real csharp@1 image, and the index refuses a
// question whose program or inputs changed since).
//   • the index is exactly the build of its authored questions and proven runs (no drift), one entry per writing question of the book;
//   • WHO: a teacher (builder session) sees every question; a student only through their persisted class (not archived, course
//     attached) and only a PUBLISHED module; the solution card only for a teacher or after the teacher released the module (D1);
//   • WHAT the reader receives: the public projection only — never a hidden input, a hidden expected output, the reference or its idea
//     before release; «افحص حلي» answers pass / fail per hidden input, never its input or output;
//   • THE CHECK: the public example then every hidden input, one run each, the same program, compared by the server; a compile error
//     stops it; a runner failure (busy, unavailable, internal-error) is a 503, never a «failed»; a run-only question refuses it (409);
//   • version 3: the PUBLISHED locked template with the learner's gaps — locked text never comes from the request;
//   • NO RECORD: the only writes are the rate-limit buckets (run and check apart, 20 / 5 min each); telemetry carries codes only.
const cjs = createRequire(import.meta.url);
const { handler } = cjs("../src/functions/learning-solve.js");
const L = cjs("../src/lib/learning-solve.js");
const { reconstructTemplateSource } = cjs("../src/lib/shared-finalization/codingTemplate.js");
const B = await import("../../scripts/build-learning-solve-index.mjs");

const CID = "899371";
const INDEX = L.loadSolveIndex(CID);
const all = Object.entries(INDEX.questions).map(([id, q]) => ({ id, ...q }));
// a hidden input that appears nowhere in the public projection, so a leak is visible
const PUBLIC_TEXT = JSON.stringify(Object.values(INDEX.questions).map(q => q.node));
const leaky = q => q.hidden.some(h => h.input.trim().length > 3 && !PUBLIC_TEXT.includes(JSON.stringify(h.input).slice(1, -1)));
const V2 = all.find(q => q.check && q.version === 2 && q.moduleId === "899371-m02" && leaky(q));
const V3 = all.find(q => q.check && q.version === 3 && q.moduleId === "899371-m11" && leaky(q));
const RUNONLY = all.find(q => !q.check && q.moduleId === "899371-m07");
const USR = "platform/users/u1.json", CLS = "platform/classes/cA.json";
const student = { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "علي", code: "S1" };
const room = (materials, extra = {}) => ({ classId: "cA", name: "صف", active: true, status: "active", studentIds: ["u1"], learningMaterials: materials, ...extra });
const seed = (materials, extra = {}) => createMemoryContainer({ [USR]: student, [CLS]: room(materials, extra) });
const visible = (mods, released) => [{ courseId: CID, visibleModuleIds: mods, ...(released ? { releasedModuleIds: released } : {}) }];
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) };

/** A recording double of the execution provider: by default it prints what the question expects for that input. */
function provider(q, { available = true, execute } = {}) {
  const calls = [];
  const out = new Map([...(q ? q.node.publicTests.map(t => [t.input, t.sampleOutput]) : []), ...(q ? q.hidden.map(h => [h.input, h.expected]) : [])]);
  return {
    calls,
    capabilities: () => (available ? { available: true, languages: [{ key: "csharp", languageVersion: 1 }] } : { available: false, languages: [] }),
    execute: async req => { calls.push(req); if (execute) return execute(req, calls.length); return { status: "success", stdout: out.get(req.stdin) ?? "?", stderr: "", exitCode: 0, durationMs: 5 }; },
  };
}
const logs = () => { const all = []; const rec = level => (name, data) => all.push([level, name, data]); return { all, logInfo: rec("info"), logWarn: rec("warn"), logError: rec("error") }; };
const studentDeps = (ctx, p, extra = {}) => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container, codingExecutionProvider: p || provider(), ...extra });
const teacherDeps = (ctx, p, extra = {}) => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, codingExecutionProvider: p || provider(), ...extra });
const req = (method, action, extra = {}) => ({ method, url: "https://x/api/learning-solve/" + CID + (action ? "/" + action : "") + (extra.query || ""), headers: { get: () => null }, params: { courseId: CID, ...(action ? { action } : {}) }, ...extra });
const list = deps => handler(req("GET"), deps);
const solution = (deps, q, obs) => handler(req("GET", "solution", { query: "?questionId=" + encodeURIComponent(q.id) }), deps, obs);
const post = (deps, action, body, obs) => handler(req("POST", action, { text: async () => JSON.stringify(body) }), deps, obs);
const SRC = "using System;\npublic class Program { public static void Main() { Console.WriteLine(\"SRC-CANARY\"); } }\n";
const gaps = q => Object.fromEntries(q.node.template.segments.filter(s => s.kind === "editable").map(s => [s.id, "/*GAP-CANARY*/"]));
const answerOf = q => (q.version === 3 ? { values: gaps(q) } : { source: SRC });
const throttle = ctx => ctx.names("platform/throttle/");
/** every key anywhere in a value */
const keysOf = v => (v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)]) : []);

describe("899371 P14 — the solve index the route serves", () => {
  it("is exactly the build of the authored questions and their proven runs: one entry per writing question of the book", () => {
    expect(INDEX).toEqual(JSON.parse(JSON.stringify(B.buildSolveIndex())));
    expect(all).toHaveLength(80);
    expect(all.filter(q => q.check).length).toBeGreaterThanOrEqual(60);
    for (const q of all) {
      expect(q.blockId, q.id).toBe(B.solveBlockId(q.pageId, q.number));
      expect(q.pageId.startsWith(q.moduleId + "-"), q.id).toBe(true);
      expect(q.node.publicTests.length, q.id).toBeGreaterThanOrEqual(1);
      expect(q.reference.length && q.explanation.trim().length, q.id).toBeTruthy();
      expect(q.check ? q.hidden.length >= 1 : q.hidden.length === 0, q.id).toBe(true);
      if (q.version === 3) expect(q.node.template.segments.some(s => s.kind === "editable"), q.id).toBe(true);
    }
    expect(V2 && V3 && RUNONLY).toBeTruthy();
  });
  it("lookups: own properties only, ids validated; another course has no index", () => {
    expect(L.findSolve(INDEX, V2.id)).toBeTruthy();
    for (const id of ["__proto__", "constructor", "../x", "", "c01-p-q99"]) expect(L.findSolve(INDEX, id), id).toBeNull();
    expect(L.loadSolveIndex("791381")).toBeNull();
    expect(L.loadSolveIndex("../learning-solve/899371")).toBeNull();
  });
  it("the public view never carries the hidden inputs, the reference or its idea", () => {
    for (const q of all) {
      const v = L.publicView(q.id, INDEX.questions[q.id], false);
      expect(keysOf(v).filter(k => ["hidden", "reference", "explanation", "expected"].includes(k)), q.id).toEqual([]);
      expect(v.solution).toBe("locked");
    }
  });
});

describe("899371 P14 — who may solve, and who may see the solution", () => {
  it("a teacher lists every question with the card open", async () => {
    const r = await list(teacherDeps(seed([])));
    expect([r.status, r.jsonBody.actor, r.jsonBody.available]).toEqual([200, "teacher", true]);
    expect(Object.keys(r.jsonBody.questions)).toHaveLength(80);
    expect(new Set(Object.values(r.jsonBody.questions).map(v => v.solution))).toEqual(new Set(["open"]));
    expect(r.jsonBody.questions[V2.pageId + "/" + V2.blockId].questionId).toBe(V2.id);
  });
  it("a student lists only the PUBLISHED modules' questions, the card locked until the teacher releases the module", async () => {
    let r = await list(studentDeps(seed(visible(["899371-m02"]))));
    const keys = Object.keys(r.jsonBody.questions);
    expect(keys.length).toBe(all.filter(q => q.moduleId === "899371-m02").length);
    expect(keys.every(k => k.startsWith("899371-m02-"))).toBe(true);
    expect(new Set(Object.values(r.jsonBody.questions).map(v => v.solution))).toEqual(new Set(["locked"]));
    r = await list(studentDeps(seed(visible(["899371-m02"], ["899371-m02"]))));
    expect(new Set(Object.values(r.jsonBody.questions).map(v => v.solution))).toEqual(new Set(["open"]));
  });
  it("the list never carries a hidden input, an expected output of a hidden case, the reference or its idea — even released", async () => {
    for (const deps of [teacherDeps(seed([])), studentDeps(seed(visible(["899371-m02", "899371-m11"], ["899371-m02", "899371-m11"])))]) {
      const r = await list(deps);
      expect(keysOf(r.jsonBody).filter(k => ["hidden", "reference", "explanation", "expected"].includes(k))).toEqual([]);
      // exactly the public projection of each listed question, nothing more
      const listed = Object.values(r.jsonBody.questions).map(v => v.questionId);
      expect(r.jsonBody.questions).toEqual(Object.fromEntries(listed.map(id => { const q = INDEX.questions[id]; return [q.pageId + "/" + q.blockId, L.publicView(id, q, true)]; })));
      // and a hidden input of these two questions (absent from every public example) is not in the reply
      const text = JSON.stringify(r.jsonBody);
      for (const q of [V2, V3]) for (const h of q.hidden) if (h.input.trim().length > 3 && !PUBLIC_TEXT.includes(JSON.stringify(h.input).slice(1, -1))) expect(text.includes(JSON.stringify(h.input).slice(1, -1)), q.id).toBe(false);
    }
  });
  it("the solution card: 403 NOT_RELEASED before the release, 200 after; a released but unpublished module stays closed", async () => {
    const obs = logs();
    let r = await solution(studentDeps(seed(visible(["899371-m02"]))), V2, obs);
    expect([r.status, r.jsonBody.code]).toEqual([403, "NOT_RELEASED"]);
    expect(r.jsonBody.solution).toBeUndefined();
    expect(obs.all).toEqual([["warn", "learning.solve.refused", { code: "NOT_RELEASED", status: 403 }]]);
    r = await solution(studentDeps(seed(visible(["899371-m02"], ["899371-m02"]))), V2);
    expect(r.status).toBe(200);
    expect(r.jsonBody.solution).toEqual({ reference: V2.reference, explanation: V2.explanation });
    r = await solution(studentDeps(seed(visible(["899371-m03"], ["899371-m02"]))), V2);
    expect([r.status, r.jsonBody.code]).toEqual([403, "UNAVAILABLE"]);
    r = await solution(teacherDeps(seed([])), V3);
    expect(r.jsonBody.solution.reference).toBe(V3.reference);
    r = await handler(req("GET", "solution", { query: "?questionId=__proto__" }), teacherDeps(seed([])));
    expect([r.status, r.jsonBody.code]).toEqual([404, "NOT_FOUND"]);
  });
  it("no session, an archived class, a class without the course, a hidden module: refused before the runner", async () => {
    const p = provider(V2);
    const none = { ...BUILDER_NO, requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), codingExecutionProvider: p };
    expect((await post(none, "check", { questionId: V2.id, ...answerOf(V2) })).status).toBe(401);
    let ctx = seed(visible(["899371-m02"]), { status: "archived", active: false });
    expect((await post(studentDeps(ctx, p), "check", { questionId: V2.id, ...answerOf(V2) })).jsonBody.code).toBe("ARCHIVED");
    ctx = seed([]);
    expect((await post(studentDeps(ctx, p), "check", { questionId: V2.id, ...answerOf(V2) })).jsonBody.code).toBe("UNAVAILABLE");
    ctx = seed(visible(["899371-m03"]));
    const r = await post(studentDeps(ctx, p), "run", { questionId: V2.id, ...answerOf(V2), stdin: "" });
    expect([r.status, r.jsonBody.code]).toEqual([403, "UNAVAILABLE"]);
    expect(p.calls).toEqual([]);
    expect(throttle(ctx)).toEqual([]);
  });
});

describe("899371 P14 — «افحص حلي»", () => {
  it("passes when every case matches: the public example in full, each hidden input as pass only; one run per case, in order", async () => {
    const ctx = seed(visible(["899371-m02"]));
    const p = provider(V2);
    const r = await post(studentDeps(ctx, p), "check", { questionId: V2.id, source: SRC });
    expect(r.status).toBe(200);
    const c = r.jsonBody.check;
    const n = V2.node.publicTests.length;
    expect([c.outcome, c.passed, c.total]).toEqual(["passed", n + V2.hidden.length, n + V2.hidden.length]);
    expect(c.cases.slice(0, n)).toEqual(V2.node.publicTests.map(t => ({ kind: "public", input: t.input, expected: t.sampleOutput, actual: t.sampleOutput, passed: true })));
    expect(c.cases.slice(n)).toEqual(V2.hidden.map(() => ({ kind: "hidden", passed: true })));
    expect(p.calls.map(x => x.stdin)).toEqual([...V2.node.publicTests.map(t => t.input), ...V2.hidden.map(h => h.input)]);
    expect(new Set(p.calls.map(x => x.source))).toEqual(new Set([SRC]));
    // the runner receives the minimal request: no identity, course or question
    expect(Object.keys(p.calls[0]).sort()).toEqual(["language", "languageVersion", "limits", "requestId", "source", "stdin"]);
    // (the requestId is random and opaque: it can contain any letters, so only the rest of the request is scanned — cf. hotfix #597)
    expect(JSON.stringify(p.calls.map(c => ({ ...c, requestId: undefined })))).not.toMatch(/u1|899371|c0\d-p-q/);
    for (const c of p.calls) expect(c.requestId).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });
  it("the server compares (whitespace-normalised, as official grading): a wrong hidden case fails with no input and no output", async () => {
    const ctx = seed(visible(["899371-m02"]));
    const bad = V2.hidden[V2.hidden.length - 1].input;
    const p = provider(V2, { execute: rq => ({ status: "success", stdout: rq.stdin === bad ? "WRONG-CANARY\n" : (V2.hidden.find(h => h.input === rq.stdin)?.expected ?? V2.node.publicTests[0].sampleOutput) + "  \n", stderr: "", exitCode: 0 }) });
    const r = await post(studentDeps(ctx, p), "check", { questionId: V2.id, source: SRC });
    const c = r.jsonBody.check;
    expect([c.outcome, c.passed, c.total]).toEqual(["failed", c.total - 1, V2.node.publicTests.length + V2.hidden.length]);
    expect(c.cases[c.cases.length - 1]).toEqual({ kind: "hidden", passed: false, why: "wrong-output" });
    expect(JSON.stringify(r.jsonBody)).not.toContain("WRONG-CANARY");
    expect(JSON.stringify(r.jsonBody)).not.toContain(JSON.stringify(bad).slice(1, -1));
  });
  it("timeouts and runtime errors are named per case; a compile error stops the check after one run, with the compiler's message", async () => {
    const ctx = seed(visible(["899371-m02"]));
    let p = provider(V2, { execute: (rq, k) => (k === 2 ? { status: "timeout", stdout: "", stderr: "" } : k === 3 ? { status: "runtime-error", stdout: "", stderr: "boom" } : { status: "success", stdout: V2.node.publicTests[0].sampleOutput, stderr: "" }) });
    let c = (await post(studentDeps(ctx, p), "check", { questionId: V2.id, source: SRC })).jsonBody.check;
    expect(c.outcome).toBe("failed");
    expect(c.cases.slice(1, 3).map(x => x.why)).toEqual(["timeout", "runtime-error"]);
    p = provider(V2, { execute: () => ({ status: "compile-error", stdout: "", stderr: "Program.cs(2,1): error CS1002: ; expected" }) });
    const r = await post(studentDeps(ctx, p), "check", { questionId: V2.id, source: SRC });
    expect(r.jsonBody.check).toEqual({ outcome: "compile-error", message: "Program.cs(2,1): error CS1002: ; expected", passed: 0, total: V2.node.publicTests.length + V2.hidden.length, cases: [] });
    expect(p.calls).toHaveLength(1);
  });
  it("a runner failure is never a verdict: busy, unavailable or internal-error mid-check → 503 retryable, no partial result", async () => {
    const ctx = seed(visible(["899371-m02"]));
    const busy = provider(V2, { execute: (rq, k) => { if (k === 3) { const e = new Error("busy"); e.code = "RUNNER_BUSY"; throw e; } return { status: "success", stdout: "x", stderr: "" }; } });
    let r = await post(studentDeps(ctx, busy), "check", { questionId: V2.id, source: SRC });
    expect([r.status, r.jsonBody.code, r.jsonBody.retryable, r.jsonBody.check]).toEqual([503, "RUNNER_BUSY", true, undefined]);
    const internal = provider(V2, { execute: (rq, k) => (k === 2 ? { status: "internal-error", stdout: "", stderr: "" } : { status: "success", stdout: "x", stderr: "" }) });
    r = await post(studentDeps(ctx, internal), "check", { questionId: V2.id, source: SRC });
    expect([r.status, r.jsonBody.code, r.jsonBody.check]).toEqual([503, "EXECUTION_FAILED", undefined]);
    const none = provider(V2, { available: false });
    const fresh = seed(visible(["899371-m02"]));
    for (const action of ["check", "run"]) {
      r = await post(studentDeps(fresh, none), action, { questionId: V2.id, source: SRC, ...(action === "run" ? { stdin: "" } : {}) });
      expect([r.status, r.jsonBody.code], action).toEqual([503, "EXECUTION_UNAVAILABLE"]);
    }
    expect(none.calls).toEqual([]);
    expect(throttle(fresh)).toEqual([]);   // no runner costs the learner nothing: no bucket is touched
  });
  it("a run-only question refuses the check (409) and keeps «تشغيل»", async () => {
    const ctx = seed(visible([RUNONLY.moduleId]));
    const p = provider(RUNONLY);
    const r = await post(studentDeps(ctx, p), "check", { questionId: RUNONLY.id, ...answerOf(RUNONLY) });
    expect([r.status, r.jsonBody.code]).toEqual([409, "NOT_CHECKABLE"]);
    expect(p.calls).toEqual([]);
    const run = await post(studentDeps(ctx, p), "run", { questionId: RUNONLY.id, ...answerOf(RUNONLY), stdin: "" });
    expect(run.status).toBe(200);
    expect(p.calls).toHaveLength(1);
  });
});

describe("899371 P14 — what a program is", () => {
  it("version 3: the PUBLISHED template with the learner's gaps; locked text never comes from the request", async () => {
    const ctx = seed(visible([V3.moduleId]));
    const p = provider(V3);
    const values = gaps(V3);
    expect((await post(studentDeps(ctx, p), "run", { questionId: V3.id, values, stdin: "IN-CANARY" })).status).toBe(200);
    expect(p.calls[0].source).toBe(reconstructTemplateSource({ language: "csharp", segments: V3.node.template.segments }, values));
    expect(p.calls[0].stdin).toBe("IN-CANARY");
    const bad = [
      { questionId: V3.id, source: SRC },                                        // a whole program for a template question
      { questionId: V3.id, values: { ...values, extra: "x" } },                  // a gap that is not there
      { questionId: V3.id, values: Object.fromEntries(Object.entries(values).slice(1)) },   // a gap missing
      { questionId: V3.id, values: Object.fromEntries(Object.keys(values).map(k => [k, 5])) },
      { questionId: V3.id, values, template: { segments: [] } },               // an unknown key
    ];
    for (const b of bad) {
      const r = await post(studentDeps(ctx, p), "check", b);
      expect([r.status, r.jsonBody.code], JSON.stringify(b).slice(0, 80)).toEqual([400, "REQUEST_INVALID"]);
    }
    const big = Object.fromEntries(Object.keys(values).map((k, i) => [k, i === 0 ? "x".repeat(8193) : ""]));
    expect((await post(studentDeps(ctx, p), "check", { questionId: V3.id, values: big })).status).toBe(413);
    expect(p.calls).toHaveLength(1);
  });
  it("version 2: a whole program, ≤ 16 KB and not blank; a run takes ≤ 4 KB of input", async () => {
    const ctx = seed(visible(["899371-m02"]));
    const p = provider(V2);
    expect((await post(studentDeps(ctx, p), "check", { questionId: V2.id, source: "x".repeat(16385) })).status).toBe(413);
    expect((await post(studentDeps(ctx, p), "check", { questionId: V2.id, source: " \n " })).jsonBody.code).toBe("SOURCE_EMPTY");
    expect((await post(studentDeps(ctx, p), "check", { questionId: V2.id, values: {} })).jsonBody.code).toBe("REQUEST_INVALID");
    expect((await post(studentDeps(ctx, p), "check", { questionId: V2.id, source: SRC, stdin: "x" })).jsonBody.code).toBe("REQUEST_INVALID");   // the check chooses its inputs
    expect((await post(studentDeps(ctx, p), "run", { questionId: V2.id, source: SRC, stdin: "1".repeat(4097) })).status).toBe(413);
    expect((await post(studentDeps(ctx, p), "run", { questionId: "c01-p-q99", source: SRC, stdin: "" })).status).toBe(404);
    expect(p.calls).toEqual([]);
    const r = await post(studentDeps(ctx, p), "run", { questionId: V2.id, source: SRC, stdin: "IN-CANARY" });
    expect([r.status, r.jsonBody.result.status]).toEqual([200, "success"]);
    expect(p.calls.map(c => [c.source, c.stdin])).toEqual([[SRC, "IN-CANARY"]]);
  });
  it("only GET (the list, the card) and POST …/run, …/check exist", async () => {
    const deps = studentDeps(seed(visible(["899371-m02"])));
    expect((await handler(req("POST", undefined, { text: async () => "{}" }), deps)).status).toBe(405);
    expect((await handler(req("GET", "check"), deps)).status).toBe(405);
    expect((await handler(req("POST", "solution", { text: async () => "{}" }), deps)).status).toBe(405);
    expect((await handler(req("DELETE"), deps)).status).toBe(405);
  });
});

describe("899371 P14 — no record, its own buckets, quiet telemetry", () => {
  it("the only writes are two rate-limit buckets (run and check apart); 20 checks / 5 min, then 429 with Retry-After", async () => {
    const ctx = seed(visible(["899371-m02"]));
    const p = provider(V2);
    const before = ctx.names("");
    for (let i = 0; i < 20; i++) expect((await post(studentDeps(ctx, p), "check", { questionId: V2.id, source: SRC })).status, "check " + (i + 1)).toBe(200);
    const r = await post(studentDeps(ctx, p), "check", { questionId: V2.id, source: SRC });
    expect([r.status, r.jsonBody.code]).toEqual([429, "RATE_LIMITED"]);
    expect(Number(r.headers["Retry-After"])).toBeGreaterThan(0);
    expect(throttle(ctx)).toHaveLength(1);
    // the run bucket is another one: runs are still allowed
    expect((await post(studentDeps(ctx, p), "run", { questionId: V2.id, source: SRC, stdin: "" })).status).toBe(200);
    expect(throttle(ctx)).toHaveLength(2);
    expect(ctx.names("").filter(n => !before.includes(n))).toEqual(throttle(ctx));
  });
  it("telemetry never carries the code, the input or the output", async () => {
    const ctx = seed(visible(["899371-m02", V3.moduleId]));
    const obs = logs();
    const p = provider(V2, { execute: () => ({ status: "success", stdout: "OUT-CANARY", stderr: "" }) });
    await post(studentDeps(ctx, p), "check", { questionId: V2.id, source: SRC }, obs);
    await post(studentDeps(ctx, p), "run", { questionId: V3.id, values: gaps(V3), stdin: "IN-CANARY" }, obs);
    await post(studentDeps(ctx, p), "run", { questionId: V2.id, source: SRC, stdin: "IN-CANARY", extra: "SRC-CANARY" }, obs);
    expect(obs.all.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(obs.all)).not.toMatch(/SRC-CANARY|IN-CANARY|OUT-CANARY|GAP-CANARY/);
    for (const h of V2.hidden) if (h.input.trim().length > 3) expect(JSON.stringify(obs.all)).not.toContain(JSON.stringify(h.input).slice(1, -1));
  });
});

// 899371 enrichment P16 (plan §13) — the owner's decisions of 2026-11-10: practice never rehearses an official test, and D5 is closed.
describe("899371 P16 — own hidden inputs, and the six corrected questions", () => {
  const fs = cjs("node:fs"), path = cjs("node:path");
  const ITEMS = path.join(__dirname, "..", "src", "data", "exam-library", "items");
  // the hidden inputs of each lab question as SHIPPED, by the book question it was built on
  const labOf = new Map(fs.readdirSync(ITEMS).filter(f => /^CL899371-\d\d\.json$/.test(f))
    .flatMap(f => JSON.parse(fs.readFileSync(path.join(ITEMS, f), "utf8")).examSnapshot.questions.map(q => [q.sourceQuestionId, new Set(q.answer.hiddenTests.map(t => t.input))])));
  it("a reused question never practises on its coding-lab question's hidden inputs (CL899371-*, as shipped)", async () => {
    const { readSolve } = await import("../../scripts/lib/solve-899371.mjs");
    const reused = readSolve().filter(q => q.reuse);
    expect(reused).toHaveLength(36);
    for (const q of reused) {
      const lab = labOf.get(q.book);
      expect(lab && lab.size, q.book + " has its lab question").toBeGreaterThan(0);
      expect(INDEX.questions[q.book].hidden.filter(h => lab.has(h.input)).map(h => h.input), q.book).toEqual([]);
      expect(INDEX.questions[q.book].hidden.length, q.book).toBeGreaterThanOrEqual(4);
    }
  });
  it("every checked question has at least 3 hidden inputs; the six questions that waited for the owner's correction (D5) are checked", () => {
    for (const q of all.filter(x => x.check)) expect(q.hidden.length, q.id).toBeGreaterThanOrEqual(3);
    for (const id of ["c04-p-q10", "c08-p-q3", "c10-p-q2", "c11-h-q4", "c11-p-q1", "c11-p-q4"]) {
      expect(INDEX.questions[id].check, id).toBe(true);
      expect((INDEX.questions[id].text || "").length, id + " shows its corrected wording").toBeGreaterThan(40);
    }
    expect(all.filter(q => q.check)).toHaveLength(74);
  });
});

describe("899371 P16 — the authoring reader refuses a reused question without its own hidden inputs", () => {
  it("no hidden inputs, or a coding-lab hidden input among them → refused (the index can never be built from it)", async () => {
    const os = cjs("node:os"), fs = cjs("node:fs"), path = cjs("node:path");
    const { readSolve } = await import("../../scripts/lib/solve-899371.mjs");
    const { readLab } = await import("../../scripts/build-899371-coding-lab.mjs");
    const lab = readLab();
    const base = lab.m01[0];   // CL899371-01-Q01
    const write = q => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solve-p16-")); fs.writeFileSync(path.join(dir, "m01.json"), JSON.stringify({ module: "m01", questions: [q] })); return dir; };
    const entry = { book: base.book, reuse: "CL899371-01-Q01", explanation: "فكرة." };
    expect(() => readSolve(write(entry), lab)).toThrow(/needs its own hidden inputs/);
    expect(() => readSolve(write({ ...entry, hidden: [base.hidden[0], "123456\n", "-7\n"] }), lab)).toThrow(/also a coding-lab hidden input/);
    expect(() => readSolve(write({ ...entry, hidden: ["123456\n", "-7\n"] }), lab)).toThrow(/≥ 3 hidden inputs/);
    expect(readSolve(write({ ...entry, hidden: ["123456\n", "-7\n", "31\n"] }), lab)[0].hidden).toEqual(["123456\n", "-7\n", "31\n"]);
  });
});
