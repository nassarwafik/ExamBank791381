// Phase 17A — TEST-ONLY in-memory execution provider. It NEVER executes, evaluates, compiles, imports or spawns the source it
// receives: results are a pure function of (language, stdin) chosen by the test, so provider routing, capability checks,
// request minimisation and result normalisation can be proven without a runner. Production code never imports this file
// (guarded by api/tests/coding-guards-17a.test.js).
function createFakeCodingExecutionProvider({ languages = [{ key: "python", languageVersion: 1 }], respond } = {}) {
  const requests = [];
  return {
    id: "fake-test-provider",
    requests,
    capabilities: () => ({ available: true, languages: languages.map(l => ({ ...l })) }),
    execute: async request => {
      requests.push(JSON.parse(JSON.stringify(request)));
      if (typeof respond === "function") return respond(request);
      return { status: "success", stdout: "echo:" + request.stdin, stderr: "", exitCode: 0, durationMs: 1, memoryKb: 1024 };
    }
  };
}

module.exports = { createFakeCodingExecutionProvider };
