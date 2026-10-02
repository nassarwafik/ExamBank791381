"use strict";
// Phase 17E-B — REAL end-to-end proof of the student PRACTICE path: the SmartAssess student route (POST /api/coding/run,
// api/src/functions/coding-run.js) with a real authenticated-student session double and the in-memory blob container → the
// remote execution provider configured exactly like production (CODING_RUNNER_URL / CODING_RUNNER_HMAC_KEY, TEST key) → the real
// Coding Runner Gateway over HTTP → one real Docker sandbox per run. Python, Java and C#: stdin → stdout, a compile / syntax
// error, a bounded timeout. The runner request carries no hidden-test canary, the student's stored submission is untouched, and
// no sandbox container is left behind. Requires Docker and the built worker images (a missing daemon / image FAILS).
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createGatewayServer } = require("../../gateway/server.js");
const { createDockerSandbox } = require("../../gateway/sandbox.js");
const { createMemoryContainer } = require("../../../api/tests/fixtures/memory-container.js");
const { runHandler } = require("../../../api/src/functions/coding-run.js");

const KEY = "practice-e2e-test-only-hmac-key-0123456789abcd";
const S1 = "11111111-1111-1111-1111-111111111111", AID = "asg-17eb-docker";
const CANARY = /HIDDEN_STDIN_CANARY_17EB|HIDDEN_EXPECTED_CANARY_17EB|REFERENCE_SOLUTION_CANARY_17EB/;
const CFG = { allowedLanguages: ["python", "java", "csharp"], defaultLanguage: "python", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout",
  limits: { sourceBytes: 65536, outputBytes: 4096, timeMs: 2000, memoryMb: 256 }, publicTests: [{ id: "p1", input: "21\n", sampleOutput: "42\n" }] };
const KEYDATA = { gradingMode: "hiddenTests", scoringPolicy: "allOrNothing", comparator: "exact", hiddenTests: [{ id: "h1", input: "HIDDEN_STDIN_CANARY_17EB\n", expectedOutput: "HIDDEN_EXPECTED_CANARY_17EB\n", weight: 1 }], referenceSolutions: { python: "REFERENCE_SOLUTION_CANARY_17EB\n" } };
const now = () => new Date().toISOString();
function seed() {
  return createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "S", code: "S1", classId: "c1", active: true, archived: false, authVersion: 1 },
    "platform/classes/c1.json": { classId: "c1", name: "C", active: true, studentIds: [] },
    ["platform/assignments/" + AID + ".json"]: { schemaVersion: 2, attemptModelVersion: 3, attemptPolicy: "pausable", assignmentId: AID, classId: "c1", title: "T", instructions: "", status: "published", openAt: "", dueAt: new Date(Date.now() + 864e5).toISOString(), maxAttempts: 1, durationMinutes: 30, questionCount: 1, totalMarks: 5,
      examSnapshot: { title: "E", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "S", gradingPolicy: "all", questions: [{ examQuestionId: "c1", presentationType: "coding", questionTypeVersion: 1, text: "x", marks: 5, coding: CFG, answer: KEYDATA }] }] } },
    ["platform/submissions/" + AID + "/" + S1 + ".json"]: { schemaVersion: 1, assignmentId: AID, studentId: S1, classId: "c1", draftAnswers: { c1: { kind: "code", language: "python", languageVersion: 1, source: "DRAFT\n" } }, draftSavedAt: now(), attempts: [], activeAttempt: { attemptNumber: 1, startedAt: now(), endsAt: new Date(Date.now() + 30 * 60000).toISOString(), status: "draft", attemptEpoch: 1, pauseCount: 0 } }
  });
}
const req = body => { const text = JSON.stringify(body); return { method: "POST", url: "https://example.invalid/api/coding/run", params: {}, headers: new Headers({ "content-type": "application/json" }), text: async () => text, json: async () => JSON.parse(text) }; };

test("student route → signed gateway → real sandbox (python / java / csharp): stdin → stdout, compile error, timeout; nothing stored; no leftovers", async () => {
  const sent = [];
  const server = createGatewayServer({ key: KEY, sandbox: createDockerSandbox(), maxConcurrency: 2, logger: { info() {}, warn() {} } });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port;
  const ctx = seed();
  const before = JSON.stringify(ctx.getJson("platform/submissions/" + AID + "/" + S1 + ".json"));
  const recordingFetch = async (u, init) => { if (init && typeof init.body === "string") sent.push(init.body); return fetch(u, init); };
  const deps = { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), env: { CODING_RUNNER_URL: url, CODING_RUNNER_HMAC_KEY: KEY }, fetch: recordingFetch };
  const run = async (language, source, stdin = "21\n") => {
    const r = await runHandler(req({ assignmentId: AID, questionId: "c1", language, languageVersion: 1, source, stdin }), deps, null);
    assert.equal(r.status, 200, language + ": " + JSON.stringify(r.jsonBody));
    return r.jsonBody.result;
  };
  const programs = {
    python: { ok: "print(int(input()) * 2)\n", bad: "print(int(input()) * 2\n", loop: "while True:\n    pass\n" },
    java: { ok: "import java.util.*;\npublic class Main { public static void main(String[] a) { System.out.println(new Scanner(System.in).nextInt() * 2); } }\n", bad: "public class Main { public static void main(String[] a) { int x = ; } }\n", loop: "public class Main { public static void main(String[] a) { while (true) {} } }\n" },
    csharp: { ok: "Console.WriteLine(int.Parse(Console.ReadLine()!) * 2);\n", bad: "Console.WriteLine(;\n", loop: "while (true) {}\n" }
  };
  try {
    for (const [language, p] of Object.entries(programs)) {
      const good = await run(language, p.ok);
      assert.equal(good.status, "success", language + ": " + good.stderr); assert.equal(good.stdout, "42\n", language);
      const bad = await run(language, p.bad);
      assert.ok(["compile-error", "runtime-error"].includes(bad.status), language + " bad → " + bad.status);
      if (language !== "python") assert.equal(bad.status, "compile-error", language);
      assert.ok(bad.stderr.length > 0, language + ": diagnostics are returned");
      const slow = await run(language, p.loop, "");
      assert.equal(slow.status, "timeout", language + " loop → " + slow.status);
      for (const k of Object.keys(good)) assert.ok(["status", "stdout", "stderr", "exitCode", "durationMs", "memoryKb"].includes(k), "result field " + k);
    }
  } finally { server.close(); }
  assert.equal(sent.length > 0, true);
  for (const body of sent) { assert.doesNotMatch(body, CANARY); assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ["language", "languageVersion", "limits", "requestId", "source", "stdin"]); }
  assert.equal(JSON.stringify(ctx.getJson("platform/submissions/" + AID + "/" + S1 + ".json")), before);
  assert.equal(ctx.names("platform/coding-grading-jobs/").length, 0);
  assert.equal(spawnSync("docker", ["ps", "-aq", "--filter", "label=smartassess.coding-runner=1"], { encoding: "utf8" }).stdout.trim(), "");
});
