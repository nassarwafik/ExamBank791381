"use strict";
// 899371 enrichment P14 (docs/enterprise-899371-enrichment-plan.md §11) — REAL Docker proof of «حلّ وافحص» (requires Docker + the
// built csharp worker image; a missing daemon or image FAILS — nothing is skipped):
//   • for EVERY checked question of the server's solve index (api/src/data/learning-solve/899371.json), through the runner's OFFICIAL
//     suite (compile once, a fresh sandbox per case) and compared exactly as the route compares (normalizeWhitespace):
//       – the REFERENCE program — for a template question the server's OWN reconstruction (learning-solve.js programFromAnswer) of the
//         published template with the reference gap values — passes the public example and every hidden input;
//       – the KNOWN-WRONG program (scripts/learning-solve-899371, never served) compiles and FAILS at least one hidden input;
//   • every run-only question's reference compiles and ends normally on its public example (the practice path);
//   • end to end through the API handler (learning-solve.js) with the real sandbox as its execution provider: «افحص حلي» says
//     «passed» for a reference (whole program and template), «failed» for the known-wrong program, and stops at a compile error with
//     the learner's own line number;
//   • no labelled container is left behind.
// So an expected output a real C# program cannot reproduce, or a hidden set a plausible wrong program passes, fails CI.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { createDockerSandbox } = require("../../gateway/sandbox.js");
const { resolveLanguage } = require("../../gateway/registry.js");
const { evaluateOfficialCodingRun, officialCaseToken } = require("../../../api/src/lib/shared-finalization/codingContract.js");
const S = require("../../../api/src/lib/learning-solve.js");
const { RUN_LIMITS } = require("../../../api/src/lib/learning-run.js");
const { handler } = require("../../../api/src/functions/learning-solve.js");
const { createMemoryContainer } = require("../../../api/tests/fixtures/memory-container.js");

const ROOT = path.join(__dirname, "..", "..", "..");
const CID = "899371";
const INDEX = S.loadSolveIndex(CID);
const ids = Object.keys(INDEX.questions);
const orphans = () => spawnSync("docker", ["ps", "-aq", "--filter", "label=smartassess.coding-runner=1"], { encoding: "utf8" }).stdout.trim();
let seq = 0;
const jobId = () => "cg_learnsolve899371" + String(++seq).padStart(6, "0");
let authored;   // the authored questions (ESM module, loaded once)
const loadAuthored = async () => (authored ||= Object.fromEntries((await import(pathToFileURL(path.join(ROOT, "scripts/lib/solve-899371.mjs")).href)).readSolve().map(q => [q.book, q])));
/** A program exactly as the route builds it from an answer. */
const programOf = (s, answer) => { const p = S.programFromAnswer(s, answer); assert.ok(p.ok, "the route accepts the answer: " + p.code); return p.source; };
const answerOf = (s, a, which) => (s.version === 3 ? { values: which === "reference" ? a.referenceGaps : a.wrongGaps } : { source: which === "reference" ? a.reference : a.wrong });

async function suite(sb, s, source) {
  const tests = [...s.node.publicTests.map(t => ({ input: t.input, expectedOutput: t.sampleOutput })), ...s.hidden.map(h => ({ input: h.input, expectedOutput: h.expected }))].map((t, i) => ({ id: "t" + i, weight: 1, ...t }));
  const r = await sb.runOfficialSuite(resolveLanguage("csharp", 1), {
    jobId: jobId(), language: "csharp", languageVersion: 1, source,
    cases: tests.map((t, i) => ({ token: officialCaseToken(i), stdin: t.input })), limits: { ...RUN_LIMITS },
  }, { signal: new AbortController().signal });
  return { r, evaluation: evaluateOfficialCodingRun({ tests, comparator: "normalizeWhitespace", run: { compile: r.compile, cases: r.cases } }), publicCount: s.node.publicTests.length };
}

test("preflight: Docker, the csharp worker image, and a solve index of the 80 writing questions", async () => {
  assert.equal(spawnSync("docker", ["version"], { encoding: "utf8" }).status, 0, "docker daemon unreachable");
  const image = resolveLanguage("csharp", 1).image;
  assert.equal(spawnSync("docker", ["image", "inspect", image]).status, 0, "missing image " + image);
  assert.equal(ids.length, 80);
  const a = await loadAuthored();
  assert.deepEqual(Object.keys(a).sort(), [...ids].sort(), "the index is the authored questions");
});

for (const mod of [...new Set(ids.map(id => INDEX.questions[id].moduleId))].sort()) {
  test(mod + " — every reference passes and every known-wrong program fails, on the real runner", async () => {
    const a = await loadAuthored();
    const sb = createDockerSandbox();
    for (const id of ids.filter(id => INDEX.questions[id].moduleId === mod)) {
      const s = INDEX.questions[id];
      if (!s.check) {
        const r = await sb.run(resolveLanguage("csharp", 1), { requestId: "req_learnsolve_" + (++seq), language: "csharp", languageVersion: 1, source: programOf(s, answerOf(s, a[id], "reference")), stdin: s.node.publicTests[0].input, limits: { ...RUN_LIMITS } });
        assert.equal(r.status, "success", id + " (run-only) the reference compiles and ends normally: " + String(r.stderr).slice(0, 200));
        continue;
      }
      const ref = await suite(sb, s, programOf(s, answerOf(s, a[id], "reference")));
      assert.equal(ref.r.compile.status, "compiled", id + " the reference compiles: " + (ref.r.compile.stderr || ""));
      assert.equal(ref.evaluation.kind, "complete", id);
      assert.equal(ref.evaluation.passedCount, ref.evaluation.testCount, id + " the reference passes every case: " + JSON.stringify(ref.evaluation.cases.filter(c => !c.passed)));
      const wrong = await suite(sb, s, programOf(s, answerOf(s, a[id], "wrong")));
      assert.equal(wrong.r.compile.status, "compiled", id + " the known-wrong program compiles (a logic slip, not a syntax error)");
      assert.equal(wrong.evaluation.kind, "complete", id);
      assert.ok(wrong.evaluation.cases.slice(wrong.publicCount).some(c => !c.passed), id + " the known-wrong program fails at least one hidden input");
    }
    assert.equal(orphans(), "", "no container left behind");
  });
}

test("end to end through the API: passed for a reference, failed for a wrong program, a compile error with the learner's line", async () => {
  const a = await loadAuthored();
  const sb = createDockerSandbox();
  const realProvider = { capabilities: () => ({ available: true, languages: [{ key: "csharp", languageVersion: 1 }] }), execute: req => sb.run(resolveLanguage(req.language, req.languageVersion), req) };
  const V2 = ids.find(id => INDEX.questions[id].check && INDEX.questions[id].version === 2);
  const V3 = ids.find(id => INDEX.questions[id].check && INDEX.questions[id].version === 3);
  const check = async (id, answer) => {
    const s = INDEX.questions[id];
    const ctx = createMemoryContainer({
      "platform/users/u1.json": { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA" },
      "platform/classes/cA.json": { classId: "cA", name: "صف", active: true, status: "active", studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: [s.moduleId] }] },
    });
    const r = await handler({ method: "POST", url: "https://x/api/learning-solve/" + CID + "/check", headers: { get: () => null }, params: { courseId: CID, action: "check" }, text: async () => JSON.stringify({ questionId: id, ...answer }) },
      { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: {} } }), requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student" } }), container: ctx.container, getContainer: () => ctx.container, codingExecutionProvider: realProvider });
    assert.equal(r.status, 200, id + " " + JSON.stringify(r.jsonBody));
    assert.deepEqual(ctx.names("").filter(n => !n.startsWith("platform/users/") && !n.startsWith("platform/classes/") && !n.startsWith("platform/throttle/")), [], "no record: only the rate-limit bucket is written");
    return r.jsonBody.check;
  };
  for (const id of [V2, V3]) {
    const s = INDEX.questions[id];
    const ok = await check(id, answerOf(s, a[id], "reference"));
    assert.deepEqual([ok.outcome, ok.passed, ok.total], ["passed", ok.total, s.node.publicTests.length + s.hidden.length], id + " reference");
    const bad = await check(id, answerOf(s, a[id], "wrong"));
    assert.equal(bad.outcome, "failed", id + " known-wrong");
    for (const c of bad.cases.filter(c => c.kind === "hidden")) assert.deepEqual(Object.keys(c).filter(k => !["kind", "passed", "why"].includes(k)), [], id + " a hidden case is pass / fail only");
  }
  const broken = "using System;\npublic class Program\n{\n    public static void Main()\n    {\n        int a = 7\n        Console.WriteLine(a);\n    }\n}\n";
  const ce = await check(V2, { source: broken });
  assert.equal(ce.outcome, "compile-error");
  assert.match(ce.message, /\(6,\d+\): error CS1002/, "the compiler names the learner's line 6");
  assert.equal(orphans(), "", "no container left behind");
});

// 899371 enrichment P18 (decision D4-b) — the same checks through the REAL gateway on loopback and the API's own REMOTE provider:
// ONE signed POST /v1/check per check (compiled once, a fresh sandbox per input) and no /v1/execute; the same verdicts as the per-input
// path; a gateway that predates the route (its sandbox has no suite runner → 404) is driven one input at a time, with the same answer.
test("D4-b: through the real gateway, one check request per «افحص حلي», the same verdicts; an older gateway falls back", async () => {
  const crypto = require("node:crypto");
  const { createGatewayServer } = require("../../gateway/server.js");
  const { resolveCodingExecutionProvider } = require("../../../api/src/lib/coding/execution-provider.js");
  const a = await loadAuthored();
  const KEY = crypto.randomBytes(32).toString("base64url");
  const events = [];
  const logger = { info: m => events.push(JSON.parse(m).event), warn: m => events.push(JSON.parse(m).event), error: () => {} };
  const sb = createDockerSandbox();
  const start = async sandbox => { const g = createGatewayServer({ key: KEY, sandbox, maxConcurrency: 2, logger }); await new Promise(r => g.listen(0, "127.0.0.1", r)); return g; };
  const viaGateway = (g, extra = {}) => resolveCodingExecutionProvider({ env: { CODING_RUNNER_URL: "http://127.0.0.1:" + g.address().port, CODING_RUNNER_HMAC_KEY: KEY }, now: Date.now, ...extra });
  const checkWith = async (provider, id, answer) => {
    const s = INDEX.questions[id];
    const ctx = createMemoryContainer({
      "platform/users/u1.json": { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA" },
      "platform/classes/cA.json": { classId: "cA", name: "صف", active: true, status: "active", studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: [s.moduleId] }] },
    });
    const t0 = Date.now();
    const r = await handler({ method: "POST", url: "https://x/api/learning-solve/" + CID + "/check", headers: { get: () => null }, params: { courseId: CID, action: "check" }, text: async () => JSON.stringify({ questionId: id, ...answer }) },
      { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: {} } }), requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student" } }), container: ctx.container, getContainer: () => ctx.container, codingExecutionProvider: provider });
    assert.equal(r.status, 200, id + " " + JSON.stringify(r.jsonBody));
    return { check: r.jsonBody.check, ms: Date.now() - t0 };
  };
  const g = await start(sb);
  try {
    const picked = [ids_ => ids_.find(id => INDEX.questions[id].check && INDEX.questions[id].version === 2), ids_ => ids_.find(id => INDEX.questions[id].check && INDEX.questions[id].version === 3), () => "c11-p-q4"].map(f => f(ids));
    for (const id of picked) {
      const s = INDEX.questions[id];
      events.length = 0;
      const ok = await checkWith(viaGateway(g), id, answerOf(s, a[id], "reference"));
      assert.deepEqual([ok.check.outcome, ok.check.passed], ["passed", s.node.publicTests.length + s.hidden.length], id + " reference");
      assert.deepEqual([events.filter(e => e === "runner.check.completed").length, events.filter(e => e === "runner.execute.completed").length], [1, 0], id + ": ONE check request, no practice run");
      const bad = await checkWith(viaGateway(g), id, answerOf(s, a[id], "wrong"));
      assert.equal(bad.check.outcome, "failed", id + " known-wrong");
    }
    // the largest checked C# question, both paths, the same answer; how long each took (the 45 s Static Web Apps ceiling)
    const big = ids_ => ids_.filter(id => INDEX.questions[id].check).sort((x, y) => (INDEX.questions[y].hidden.length + INDEX.questions[y].node.publicTests.length) - (INDEX.questions[x].hidden.length + INDEX.questions[x].node.publicTests.length))[0];
    const id = big(ids), s = INDEX.questions[id];
    const remote = viaGateway(g);
    const perInput = { capabilities: () => remote.capabilities(), execute: req => remote.execute(req) };   // no checkSuite: D4-a
    const one = await checkWith(remote, id, answerOf(s, a[id], "reference"));
    const each = await checkWith(perInput, id, answerOf(s, a[id], "reference"));
    assert.deepEqual(one.check, each.check, id + ": the same verdict on both paths");
    console.log(`  ${id}: ${s.node.publicTests.length + s.hidden.length} inputs — one check ${one.ms} ms, one run per input ${each.ms} ms`);
    assert.ok(one.ms < each.ms, "compiled once is faster than compiling per input");
  } finally { g.close(); }
  // a gateway that predates the route: its sandbox has no suite runner → 404 → the API runs one input at a time
  const oldSandbox = { ...sb };
  delete oldSandbox.runOfficialSuite;
  const old = await start(oldSandbox);
  try {
    const id = ids.find(x => INDEX.questions[x].check && INDEX.questions[x].version === 2), s = INDEX.questions[id];
    events.length = 0;
    const ok = await checkWith(viaGateway(old), id, answerOf(s, a[id], "reference"));
    assert.equal(ok.check.outcome, "passed");
    assert.equal(events.filter(e => e === "runner.execute.completed").length, s.node.publicTests.length + s.hidden.length, "one practice run per input");
  } finally { old.close(); }
  assert.equal(orphans(), "", "no container left behind");
});
