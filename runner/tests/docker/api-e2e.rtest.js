"use strict";
// Phase 17B — end-to-end smoke of the full trust chain with REAL components: the SmartAssess API's remote execution provider
// (api/src/lib/coding/execution-provider.js, configured exactly like production through CODING_RUNNER_URL /
// CODING_RUNNER_HMAC_KEY with a TEST key) → the real Coding Runner Gateway over HTTP → one real Docker sandbox per run.
// Requires Docker and the built worker images (a missing daemon / image FAILS).
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createGatewayServer } = require("../../gateway/server.js");
const { createDockerSandbox } = require("../../gateway/sandbox.js");
const provider = require("../../../api/src/lib/coding/execution-provider.js");

const KEY = "e2e-test-only-hmac-key-0123456789abcdefghij";
const LIMITS = { timeMs: 3000, memoryMb: 128, outputBytes: 4096 };

test("API provider → gateway → sandbox: capabilities, a successful run per language, and a wrong key is refused", async () => {
  const server = createGatewayServer({ key: KEY, sandbox: createDockerSandbox(), maxConcurrency: 2, logger: { info() {}, warn() {} } });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port;
  try {
    const p = provider.resolveCodingExecutionProvider({ env: { CODING_RUNNER_URL: url, CODING_RUNNER_HMAC_KEY: KEY } });
    assert.deepEqual(await provider.loadCodingCapabilities(p), { available: true, languages: [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }] });
    const programs = {
      python: "print(int(input()) * 2)\n",
      java: "import java.util.*;\npublic class Main { public static void main(String[] a) { System.out.println(new Scanner(System.in).nextInt() * 2); } }\n",
      csharp: "Console.WriteLine(int.Parse(Console.ReadLine()!) * 2);\n"
    };
    for (const [language, source] of Object.entries(programs)) {
      const r = await provider.runCodingExecution(p, { requestId: "e2e_" + language + "_" + Date.now(), language, languageVersion: 1, source, stdin: "21\n", limits: LIMITS });
      assert.equal(r.ok, true, language); assert.equal(r.result.status, "success", language + ": " + r.result.stderr); assert.equal(r.result.stdout, "42\n", language);
    }
    const wrong = provider.resolveCodingExecutionProvider({ env: { CODING_RUNNER_URL: url, CODING_RUNNER_HMAC_KEY: "a-different-test-only-key-0123456789abcdef" } });
    assert.deepEqual(await provider.loadCodingCapabilities(wrong), { available: false, languages: [] });
  } finally { server.close(); }
  assert.equal(spawnSync("docker", ["ps", "-aq", "--filter", "label=smartassess.coding-runner=1"], { encoding: "utf8" }).stdout.trim(), "");
});
