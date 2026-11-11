import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// 899371 enrichment P18 (docs/enterprise-899371-enrichment-plan.md §14, decision D4-b) — «افحص حلي» through ONE synchronous check of
// the Runner (compiled once, a fresh sandbox per input) instead of one practice run per input, and the fallback while the live Runner
// predates it:
//   • runCodingCheck (execution-provider.js): a provider without checkSuite → «unsupported»; the reply is checked case by case
//     (count, tokens, statuses, compile outcome) — anything else is EXECUTION_FAILED, never a partial result; busy / unavailable map
//     as for one run; output is bounded like one run;
//   • the REMOTE provider: POST /v1/check, signed; a gateway that answers 404 NOT_FOUND is «unsupported» and not asked again for a
//     while; 503 RUNNER_BUSY / 422 / anything else map like /v1/execute;
//   • the route: a check provider → ONE checkSuite call, no execute, the same verdict the per-input path gives; «unsupported» → one
//     run per input (D4-a, unchanged); an internal-error case → 503, no verdict; a compile error → the compile-error reply; the
//     request carries only the program, the inputs and the limits.
const cjs = createRequire(import.meta.url);
const { handler } = cjs("../src/functions/learning-solve.js");
const L = cjs("../src/lib/learning-solve.js");
const P = cjs("../src/lib/coding/execution-provider.js");

const CID = "899371";
const INDEX = L.loadSolveIndex(CID);
const V2 = Object.entries(INDEX.questions).map(([id, q]) => ({ id, ...q })).find(q => q.check && q.version === 2 && q.moduleId === "899371-m02");
const inputsOf = q => [...q.node.publicTests.map(t => t.input), ...q.hidden.map(h => h.input)];
const expectedOf = q => [...q.node.publicTests.map(t => t.sampleOutput), ...q.hidden.map(h => h.expected)];
const CAPS = { available: true, languages: [{ key: "csharp", languageVersion: 1 }] };
const SRC = "using System;\npublic class Program { public static void Main() { Console.WriteLine(\"SRC-CANARY\"); } }\n";
const LIMITS = { timeMs: 2000, memoryMb: 128, outputBytes: 16384 };
const token = i => "c" + String(i + 1).padStart(2, "0");
const okCase = (i, stdout) => ({ token: token(i), status: "success", stdout, stderr: "", exitCode: 0, durationMs: 9 });

/** A provider double with the synchronous check (and execute, which must NOT be used when the check answers). */
function checkProvider(suiteFor, { withCheck = true } = {}) {
  const checks = [], runs = [];
  return {
    checks, runs,
    capabilities: () => CAPS,
    execute: async req => { runs.push(req); const k = inputsOf(V2).indexOf(req.stdin); return { status: "success", stdout: expectedOf(V2)[k] ?? "?", stderr: "", exitCode: 0 }; },
    ...(withCheck ? { checkSuite: async check => { checks.push(check); return suiteFor(check); } } : {}),
  };
}
const asExpected = check => ({ suite: { compile: { status: "compiled", durationMs: 900 }, cases: check.cases.map((c, i) => okCase(i, expectedOf(V2)[i])) } });
const USR = "platform/users/u1.json", CLS = "platform/classes/cA.json";
const student = { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "علي", code: "S1" };
const seed = () => createMemoryContainer({ [USR]: student, [CLS]: { classId: "cA", name: "صف", active: true, status: "active", studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: [V2.moduleId] }] } });
const deps = (ctx, p) => ({ requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: {} } }), requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student" } }), container: ctx.container, getContainer: () => ctx.container, codingExecutionProvider: p });
const logs = () => { const all = []; const rec = level => (name, data) => all.push([level, name, data]); return { all, logInfo: rec("info"), logWarn: rec("warn"), logError: rec("error") }; };
const check = (ctx, p, obs) => handler({ method: "POST", url: "https://x/api/learning-solve/" + CID + "/check", headers: { get: () => null }, params: { courseId: CID, action: "check" }, text: async () => JSON.stringify({ questionId: V2.id, source: SRC }) }, deps(ctx, p), obs);

describe("899371 P18 — runCodingCheck", () => {
  const input = { requestId: "req_p18_0000000001", language: "csharp", languageVersion: 1, source: SRC, inputs: ["1\n", "2\n"], limits: LIMITS };
  it("a provider without the check → unsupported; no runner → 503; one case per input, in order, bounded like one run", async () => {
    expect(await P.runCodingCheck(checkProvider(asExpected, { withCheck: false }), input)).toEqual({ ok: true, unsupported: true });
    expect(await P.runCodingCheck({ capabilities: () => ({ available: false, languages: [] }), execute: async () => ({}), checkSuite: async () => ({}) }, input)).toEqual({ ok: false, status: 503, code: "EXECUTION_UNAVAILABLE" });
    const p = checkProvider(c => ({ suite: { compile: { status: "compiled" }, cases: c.cases.map((x, i) => okCase(i, "x".repeat(20000))) } }));
    const r = await P.runCodingCheck(p, input);
    expect(r.ok).toBe(true);
    expect(r.results.map(x => x.status)).toEqual(["output-limit", "output-limit"]);   // bounded like one run (16384 bytes)
    expect(p.checks[0]).toEqual({ requestId: input.requestId, language: "csharp", languageVersion: 1, source: SRC, cases: [{ token: "c01", stdin: "1\n" }, { token: "c02", stdin: "2\n" }], limits: LIMITS });
  });
  it("evidence that is not exactly what was asked is EXECUTION_FAILED — never a partial result", async () => {
    const bad = [
      () => ({ suite: { cases: [okCase(0, "1")] } }),                                                         // one case for two inputs
      () => ({ suite: { cases: [okCase(0, "1"), okCase(1, "2"), okCase(2, "3")] } }),                         // a case nobody asked for
      () => ({ suite: { cases: [okCase(1, "1"), okCase(0, "2")] } }),                                         // tokens out of order
      () => ({ suite: { cases: [okCase(0, "1"), { ...okCase(1, "2"), status: "graded" }] } }),                 // an unknown status
      () => ({ suite: { cases: [okCase(0, "1"), { ...okCase(1, "2"), stdout: 5 }] } }),                        // output not text
      () => ({ suite: { compile: { status: "compile-error", stderr: "e" }, cases: [okCase(0, "1")] } }),     // a compile error that ran
      () => ({ suite: { compile: { status: "ok" }, cases: [okCase(0, "1"), okCase(1, "2")] } }),             // an unknown compile status
      () => ({ suite: null }), () => ({}), () => null,
    ];
    for (const b of bad) expect(await P.runCodingCheck(checkProvider(b), input), String(b)).toEqual({ ok: false, status: 502, code: "EXECUTION_FAILED" });
    const busy = checkProvider(() => { const e = new Error("busy"); e.code = "RUNNER_BUSY"; throw e; });
    expect(await P.runCodingCheck(busy, input)).toEqual({ ok: false, status: 503, code: "RUNNER_BUSY" });
    const ce = checkProvider(() => ({ suite: { compile: { status: "compile-error", stderr: "Program.cs(3,1): error CS1002" }, cases: [] } }));
    expect(await P.runCodingCheck(ce, input)).toEqual({ ok: true, compileError: { stderr: "Program.cs(3,1): error CS1002" } });
    expect((await P.runCodingCheck(checkProvider(asExpected), { ...input, inputs: Array(13).fill("1\n") })).code).toBe("REQUEST_INVALID");
  });
});

describe("899371 P18 — the remote provider's check", () => {
  const KEY = "test-only-runner-hmac-key-0123456789abcdef";
  const ENV = { CODING_RUNNER_URL: "https://runner.example.test", CODING_RUNNER_HMAC_KEY: KEY };
  function gateway(answer) {
    const calls = [];
    const fetch = vi.fn(async (url, init = {}) => {
      const u = new URL(url);
      calls.push({ path: u.pathname, method: init.method || "GET", headers: Object.fromEntries(new Headers(init.headers || {}).entries()), body: init.body });
      const r = u.pathname === "/v1/capabilities" ? { status: 200, json: { ok: true, available: true, languages: [{ key: "csharp", languageVersion: 1 }] } } : answer(calls[calls.length - 1]);
      return new Response(r.text !== undefined ? r.text : JSON.stringify(r.json), { status: r.status, headers: { "content-type": r.text !== undefined ? "text/plain" : "application/json" } });
    });
    let t = 1_700_000_000_000;
    const now = () => t;
    return { calls, provider: P.resolveCodingExecutionProvider({ env: ENV, fetch, now }), advance: ms => { t += ms; } };
  }
  const input = { requestId: "req_p18_0000000002", language: "csharp", languageVersion: 1, source: SRC, inputs: ["1\n", "2\n"], limits: LIMITS };
  it("POST /v1/check, signed, with the request id bound; the raw evidence comes back", async () => {
    const g = gateway(c => ({ status: 200, json: { ok: true, suite: { compile: { status: "compiled", durationMs: 5 }, cases: JSON.parse(c.body).cases.map((x, i) => okCase(i, "out" + i)) } } }));
    const r = await P.runCodingCheck(g.provider, input);
    expect(r.results.map(x => x.stdout)).toEqual(["out0", "out1"]);
    const post = g.calls.find(c => c.path === "/v1/check");
    expect(post.method).toBe("POST");
    expect(Object.keys(JSON.parse(post.body)).sort()).toEqual(["cases", "language", "languageVersion", "limits", "requestId", "source"]);
    expect(post.headers["x-sa-runner-request-id"]).toBe(input.requestId);
    expect(post.headers["x-sa-runner-signature"]).toMatch(/\S{20,}/);
  });
  it("a gateway without the route (404) is «unsupported» and is not asked again for five minutes; busy and failures map", async () => {
    const g = gateway(() => ({ status: 404, json: { ok: false, code: "NOT_FOUND" } }));
    expect(await P.runCodingCheck(g.provider, input)).toEqual({ ok: true, unsupported: true });
    expect(await P.runCodingCheck(g.provider, { ...input, requestId: "req_p18_0000000003" })).toEqual({ ok: true, unsupported: true });
    expect(g.calls.filter(c => c.path === "/v1/check")).toHaveLength(1);
    g.advance(5 * 60 * 1000 + 1);
    await P.runCodingCheck(g.provider, { ...input, requestId: "req_p18_0000000004" });
    expect(g.calls.filter(c => c.path === "/v1/check")).toHaveLength(2);
    // the live VM's reverse proxy (Caddy, runner/deploy/azure-vm/Caddyfile.example) answers an unknown path with a BARE 404, no JSON:
    // that too is «unsupported», never a failed check
    expect(await P.runCodingCheck(gateway(() => ({ status: 404, text: "" })).provider, input)).toEqual({ ok: true, unsupported: true });
    expect(await P.runCodingCheck(gateway(() => ({ status: 404, text: "<html>Not Found</html>" })).provider, input)).toEqual({ ok: true, unsupported: true });
    expect(await P.runCodingCheck(gateway(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } })).provider, input)).toEqual({ ok: false, status: 503, code: "RUNNER_BUSY" });
    expect(await P.runCodingCheck(gateway(() => ({ status: 502, json: { ok: false, code: "CHECK_FAILED" } })).provider, input)).toEqual({ ok: false, status: 502, code: "EXECUTION_FAILED" });
    expect(await P.runCodingCheck(gateway(() => ({ status: 401, json: { ok: false, code: "UNAUTHORIZED" } })).provider, input)).toEqual({ ok: false, status: 502, code: "EXECUTION_FAILED" });
  });
});

describe("899371 P18 — «افحص حلي» through the check", () => {
  it("ONE check, no practice run, and the same verdict the per-input path gives", async () => {
    const p = checkProvider(asExpected);
    const obs = logs();
    const viaCheck = (await check(seed(), p, obs)).jsonBody.check;
    expect(p.checks).toHaveLength(1);
    expect(p.runs).toEqual([]);
    expect(p.checks[0].cases.map(c => c.stdin)).toEqual(inputsOf(V2));
    expect(p.checks[0].source).toBe(SRC);
    const { requestId, ...content } = p.checks[0];   // the random, opaque request id can contain any letters (cf. hotfix #597)
    expect(requestId).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(JSON.stringify(content)).not.toMatch(/u1|c0\d-p-q|899371/);   // only the program, the inputs and the limits
    const viaRuns = (await check(seed(), checkProvider(asExpected, { withCheck: false }))).jsonBody.check;
    expect(viaCheck).toEqual(viaRuns);
    expect(viaCheck.outcome).toBe("passed");
    expect(obs.all.find(e => e[1] === "learning.solve.check")[2].path).toBe("check");
  });
  it("a Runner without the check: one practice run per input (D4-a), the same answer", async () => {
    const p = checkProvider(() => ({ unsupported: true }));
    const r = (await check(seed(), p)).jsonBody.check;
    expect(p.checks).toHaveLength(1);
    expect(p.runs.map(x => x.stdin)).toEqual(inputsOf(V2));
    expect(r.outcome).toBe("passed");
  });
  it("a failed case is reported without its input or output; an internal-error case or a broken reply is a 503, never a verdict", async () => {
    const wrong = checkProvider(c => ({ suite: { compile: { status: "compiled" }, cases: c.cases.map((x, i) => okCase(i, i === c.cases.length - 1 ? "WRONG-CANARY" : expectedOf(V2)[i])) } }));
    const r = (await check(seed(), wrong)).jsonBody.check;
    expect([r.outcome, r.cases[r.cases.length - 1]]).toEqual(["failed", { kind: "hidden", passed: false, why: "wrong-output" }]);
    expect(JSON.stringify(r)).not.toContain("WRONG-CANARY");
    const internal = checkProvider(c => ({ suite: { compile: { status: "compiled" }, cases: c.cases.map((x, i) => (i === 1 ? { ...okCase(i, ""), status: "internal-error" } : okCase(i, expectedOf(V2)[i]))) } }));
    const a = await check(seed(), internal);
    expect([a.status, a.jsonBody.code, a.jsonBody.check]).toEqual([503, "EXECUTION_FAILED", undefined]);
    const broken = checkProvider(() => ({ suite: { cases: [] } }));
    const b = await check(seed(), broken);
    expect([b.status, b.jsonBody.code, b.jsonBody.check]).toEqual([502, "EXECUTION_FAILED", undefined]);
    expect(broken.runs).toEqual([]);   // a broken reply never falls back to running the program again
  });
  it("a compile error stops the check with the compiler's message", async () => {
    const p = checkProvider(() => ({ suite: { compile: { status: "compile-error", stderr: "Program.cs(2,9): error CS1002: ; expected" }, cases: [] } }));
    const r = (await check(seed(), p)).jsonBody.check;
    expect(r).toEqual({ outcome: "compile-error", message: "Program.cs(2,9): error CS1002: ; expected", passed: 0, total: inputsOf(V2).length, cases: [] });
    expect(p.runs).toEqual([]);
  });
});
