"use strict";
// 899371 P8 (docs/enterprise-899371-learning-plan.md §21) — REAL Docker proof of «جرّب الكود» (requires Docker + the built csharp
// worker image; a missing daemon or image FAILS — nothing is skipped):
//   • every block of the course's run index (api/src/data/learning-run/899371.json), wrapped by the API's own rule
//     (learning-run.js wrapProgram) and run with the API's own limits through the runner's practice path, COMPILES on the real
//     worker (its first run: success, or a runtime error for a program that waits for input it was not given — never a compile
//     error, never an internal error); the two programs left out of the index really do not compile alone;
//   • end to end through the API handler (learning-run.js) with the real sandbox as its execution provider: a student's run of a
//     book program prints what C# prints, the learner's edit and input are what runs, a compile error reaches the learner with the
//     learner's own line number;
//   • no labelled container is left behind.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createDockerSandbox } = require("../../gateway/sandbox.js");
const { resolveLanguage } = require("../../gateway/registry.js");
const L = require("../../../api/src/lib/learning-run.js");
const { handler } = require("../../../api/src/functions/learning-run.js");
const { createMemoryContainer } = require("../../../api/tests/fixtures/memory-container.js");

const ROOT = path.join(__dirname, "..", "..", "..");
const CID = "899371";
const CONTENT = path.join(ROOT, "api", "src", "data", "learning-content", CID);
const EVIDENCE = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "learning-run", CID + ".json"), "utf8"));
const INDEX = L.loadRunIndex(CID);
const orphans = () => spawnSync("docker", ["ps", "-aq", "--filter", "label=smartassess.coding-runner=1"], { encoding: "utf8" }).stdout.trim();
const sandbox = createDockerSandbox();
let seq = 0;
const practice = (source, stdin = "") => sandbox.run(resolveLanguage("csharp", 1), { requestId: "req_learnrun_" + (++seq), language: "csharp", languageVersion: 1, source, stdin, limits: { ...L.RUN_LIMITS } });

/** Every C# block of the served bodies by "pageId/blockId". */
const blocks = new Map();
for (const f of fs.readdirSync(CONTENT).filter(f => f.endsWith(".json"))) {
  const mod = JSON.parse(fs.readFileSync(path.join(CONTENT, f), "utf8"));
  for (const l of mod.lessons || []) for (const p of l.pages || []) for (const b of p.blocks || []) if (b.type === "code" && b.language === "csharp") blocks.set(p.id + "/" + b.id, b.code);
}
const indexed = Object.entries(INDEX.pages).flatMap(([pageId, p]) => Object.keys(p.blocks).map(blockId => ({ pageId, blockId, moduleId: p.blocks[blockId].moduleId })));

/** The real sandbox as the API's execution provider (17A contract). */
const realProvider = { capabilities: () => ({ available: true, languages: [{ key: "csharp", languageVersion: 1 }] }), execute: req => sandbox.run(resolveLanguage(req.language, req.languageVersion), req) };
const seed = () => createMemoryContainer({
  "platform/users/u1.json": { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA" },
  "platform/classes/cA.json": { classId: "cA", name: "صف", active: true, status: "active", studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: [...new Set(indexed.map(e => e.moduleId))] }] },
});
const apiRun = (ctx, body) => handler({ method: "POST", url: "https://x/api/learning-run", headers: { get: () => null }, params: { courseId: CID, action: "run" }, text: async () => JSON.stringify(body) },
  { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: {} } }), requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student" } }), container: ctx.container, getContainer: () => ctx.container, codingExecutionProvider: realProvider });

test("preflight: Docker, the csharp worker image, and a run index of 91 blocks whose code is the served code", () => {
  assert.equal(spawnSync("docker", ["version"], { encoding: "utf8" }).status, 0, "docker daemon unreachable");
  const image = resolveLanguage("csharp", 1).image;
  assert.equal(spawnSync("docker", ["image", "inspect", image]).status, 0, "missing image " + image);
  assert.equal(indexed.length, 91);
  for (const e of indexed) assert.equal(L.codeSha(blocks.get(e.pageId + "/" + e.blockId)), INDEX.pages[e.pageId].blocks[e.blockId].codeSha, e.pageId + "/" + e.blockId + " the indexed code is the served code");
});

test("every indexed book program compiles on the real worker (wrapped and limited as the API does)", async () => {
  const bad = [];
  const queue = [...indexed];
  await Promise.all([0, 1, 2].map(async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const r = await practice(L.wrapProgram(blocks.get(e.pageId + "/" + e.blockId)));
      if (!["success", "runtime-error"].includes(r.status)) bad.push(e.pageId + "/" + e.blockId + " → " + r.status + " " + String(r.stderr).slice(0, 160));
    }
  }));
  assert.deepEqual(bad, []);
  assert.equal(orphans(), "", "no container left behind");
});

test("the two programs left out of the index really do not compile alone", async () => {
  const out = EVIDENCE.candidates.filter(c => c.compileExit !== 0);
  assert.equal(out.length, 2);
  for (const c of out) assert.equal((await practice(L.wrapProgram(blocks.get(c.pageId + "/" + c.blockId)))).status, "compile-error", c.blockId);
});

test("end to end through the API: the book's output, the learner's edit and input, and the learner's own line number", async () => {
  const ctx = seed();
  const e = { pageId: "899371-m01-l02-p01", blockId: "m01-l02-p01-b04" };
  const book = blocks.get(e.pageId + "/" + e.blockId);
  const r1 = await apiRun(ctx, { ...e, source: book, stdin: "" });
  assert.equal(r1.status, 200);
  assert.deepEqual([r1.jsonBody.result.status, r1.jsonBody.result.stdout], ["success", "9 4 11\n"]);
  const edited = "static void Main(string[] args)\n{\n    int n = int.Parse(Console.ReadLine());\n    Console.WriteLine(\"ضعف العدد: \" + (n * 2));\n}";
  const r2 = await apiRun(ctx, { ...e, source: edited, stdin: "21\n" });
  assert.deepEqual([r2.jsonBody.result.status, r2.jsonBody.result.stdout], ["success", "ضعف العدد: 42\n"]);
  const broken = "static void Main(string[] args)\n{\n    int a = 7\n    Console.WriteLine(a);\n}";
  const r3 = await apiRun(ctx, { ...e, source: broken, stdin: "" });
  assert.equal(r3.jsonBody.result.status, "compile-error");
  assert.match(r3.jsonBody.result.stderr, /\(3,\d+\): error CS1002/, "the compiler names the learner's line 3");
  assert.equal(ctx.names("platform/throttle/").length, 1, "the only write is the rate-limit bucket");
  assert.equal(orphans(), "", "no container left behind");
});
