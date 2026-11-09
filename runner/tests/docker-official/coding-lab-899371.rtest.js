"use strict";
// 899371 P7 (docs/enterprise-899371-learning-plan.md §20) — REAL Docker proof of the coding lab «مختبر البرمجة» (requires Docker + the
// built csharp worker image; a missing daemon or image FAILS — nothing is skipped). For every question of the 11 library items
// CL899371-01…11 (api/src/data/exam-library/items), through the runner's OFFICIAL suite (compile once, a fresh sandbox per hidden case,
// only opaque tokens and stdin — exactly what the API sends):
//   • the REFERENCE program (the shipped referenceSolutions.csharp; for coding@3 the server's own reconstruction of the published
//     template with the reference gap values) earns FULL marks under the API's evaluation (evaluateOfficialCodingRun +
//     officialCodingScoreFor, the shared contract), every case "success";
//   • the KNOWN-WRONG program (scripts/coding-lab-899371/mNN.json, never shipped) compiles and earns LESS than full marks;
//   • no labelled container is left behind.
// So a hidden test whose expected output a real C# program cannot reproduce on the real runner, or a test set that a plausible wrong
// program passes, fails CI.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createDockerSandbox } = require("../../gateway/sandbox.js");
const { resolveLanguage } = require("../../gateway/registry.js");
const { evaluateOfficialCodingRun, officialCodingScoreFor, officialCaseToken } = require("../../../api/src/lib/shared-finalization/codingContract.js");
const { reconstructTemplateSource } = require("../../../api/src/lib/shared-finalization/codingTemplate.js");

const ROOT = path.join(__dirname, "..", "..", "..");
const ITEMS = path.join(ROOT, "api", "src", "data", "exam-library", "items");
const LAB = path.join(ROOT, "scripts", "coding-lab-899371");
const orphans = () => spawnSync("docker", ["ps", "-aq", "--filter", "label=smartassess.coding-runner=1"], { encoding: "utf8" }).stdout.trim();
let seq = 0;
const jobId = () => "cg_codinglab899371" + String(++seq).padStart(6, "0");

const items = fs.readdirSync(ITEMS).filter(f => /^CL899371-\d\d\.json$/.test(f)).sort().map(f => JSON.parse(fs.readFileSync(path.join(ITEMS, f), "utf8")));
const lab = Object.fromEntries(fs.readdirSync(LAB).filter(f => /^m\d\d\.json$/.test(f)).map(f => [f.slice(0, 3), JSON.parse(fs.readFileSync(path.join(LAB, f), "utf8")).questions]));
/** The known-wrong program of a shipped question (coding@3: the published template with the wrong gap values). */
function wrongProgram(item, index, node) {
  const q = lab["m" + item.libraryItemId.slice(-2)][index];
  assert.equal(q.book, node.sourceQuestionId, "the authored question matches the shipped one");
  return node.questionTypeVersion === 3 ? reconstructTemplateSource(node.coding.template, q.wrongGaps) : q.wrong;
}
async function officialRun(sb, node, source) {
  const r = await sb.runOfficialSuite(resolveLanguage("csharp", 1), {
    jobId: jobId(), language: "csharp", languageVersion: 1, source,
    cases: node.answer.hiddenTests.map((t, i) => ({ token: officialCaseToken(i), stdin: t.input })),
    limits: { timeMs: node.coding.limits.timeMs, memoryMb: node.coding.limits.memoryMb, outputBytes: node.coding.limits.outputBytes },
  }, { signal: new AbortController().signal });
  const evaluation = evaluateOfficialCodingRun({ tests: node.answer.hiddenTests, comparator: node.answer.comparator, run: { compile: r.compile, cases: r.cases } });
  return { r, evaluation, score: evaluation.kind === "complete" ? officialCodingScoreFor(node.answer.scoringPolicy, node.marks, evaluation) : null };
}

test("preflight: Docker and the csharp worker image (17C tag) exist; the 11 coding-lab items are there", () => {
  assert.equal(spawnSync("docker", ["version"], { encoding: "utf8" }).status, 0, "docker daemon unreachable");
  const image = resolveLanguage("csharp", 1).image;
  assert.match(image, /:17c-v1$/);
  assert.equal(spawnSync("docker", ["image", "inspect", image]).status, 0, "missing image " + image);
  assert.deepEqual(items.map(i => i.libraryItemId), Array.from({ length: 11 }, (_, i) => "CL899371-" + String(i + 1).padStart(2, "0")));
});

for (const item of items) {
  test(item.libraryItemId + " — every reference earns full marks and every known-wrong program less, on the real runner", async () => {
    const sb = createDockerSandbox();
    for (const [index, node] of item.examSnapshot.questions.entries()) {
      const where = node.examQuestionId + " (" + node.sourceQuestionId + ")";
      const ref = await officialRun(sb, node, node.answer.referenceSolutions.csharp);
      assert.equal(ref.r.compile.status, "compiled", where + " the reference compiles: " + (ref.r.compile.stderr || ""));
      assert.deepEqual(ref.r.cases.map(c => c.status), node.answer.hiddenTests.map(() => "success"), where + " every reference case ends normally");
      assert.equal(ref.evaluation.kind, "complete", where);
      assert.equal(ref.evaluation.passedCount, node.answer.hiddenTests.length, where + " the reference passes every hidden test: " + JSON.stringify(ref.evaluation.cases.filter(c => !c.passed)));
      assert.equal(ref.score, node.marks, where + " full marks");
      const wrong = await officialRun(sb, node, wrongProgram(item, index, node));
      assert.equal(wrong.r.compile.status, "compiled", where + " the known-wrong program compiles (a logic slip, not a syntax error)");
      assert.equal(wrong.evaluation.kind, "complete", where);
      assert.ok(wrong.score < node.marks, where + " the known-wrong program earns less than full marks (" + wrong.score + ")");
    }
    assert.equal(orphans(), "", "no container left behind");
  });
}
