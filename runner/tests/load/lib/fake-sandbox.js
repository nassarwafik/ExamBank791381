"use strict";
// Phase 17F-B10-A — a DETERMINISTIC fake sandbox for the LOCAL target (no Docker). It implements the gateway's sandbox interface
// (run / runOfficialSuite / availableLanguages / sweep) and derives every outcome from the workload markers in the source
// (`LOAD-KIND:` → status, `LOAD-FN:` → stdout from stdin) plus a per-language COST PROFILE (compile cost for Java / C#, run cost,
// timeout cost), so load runs are repeatable and fast while still exercising the real gateway, queue, journal, callback deliverer
// and the harness itself. It executes nothing. The abort signal of an official suite is honoured (a hung suite can be cancelled).
const { LANGUAGES } = require("./metrics.js");

const DEFAULT_PROFILE = Object.freeze({
  python: Object.freeze({ compileMs: 0, runMs: 20, cpuMs: 120, timeoutMs: 150 }),
  java: Object.freeze({ compileMs: 60, largeCompileMs: 150, runMs: 30, cpuMs: 120, timeoutMs: 150 }),
  csharp: Object.freeze({ compileMs: 50, largeCompileMs: 140, runMs: 30, cpuMs: 120, timeoutMs: 150 })
});
const kindOf = source => (/LOAD-KIND:([a-z-]+)/.exec(String(source)) || [])[1] || "success";
const fnOf = source => (/LOAD-FN:([a-z]+)/.exec(String(source)) || [])[1] || "none";
const stdoutFor = (fn, stdin) => {
  if (fn === "double") { const n = parseInt(String(stdin).trim().split(/\s+/)[0], 10); return (Number.isFinite(n) ? String(n * 2) : "") + "\n"; }
  if (fn === "echo") return String(stdin);
  if (fn === "large") return "x".repeat(17000) + "\n";
  return "";
};

function createFakeSandbox({ profile = DEFAULT_PROFILE, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now(), onRun } = {}) {
  let active = 0, peak = 0, runs = 0, official = 0;
  // Hotfix (admission oracle) — while a hold is set, an official suite waits before executing (it stays LIVE in the gateway: received /
  // running). The harness holds during a saturation burst so that no accepted job can leave LIVE before every arrival of the burst
  // was answered: then "accepted in the step" equals the peak LIVE count the gateway bounds. Practice runs are never held.
  let gate = null;
  const waitGate = signal => {
    const g = gate;
    if (!g) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(new Error("aborted"));
      g.promise.then(resolve);
      if (signal) signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  };
  const wait = async (ms, signal) => { if (ms <= 0) return; await new Promise(r => { const t = setTimeout(r, ms); if (signal) signal.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true }); }); void sleep; };
  const enter = () => { active++; peak = Math.max(peak, active); };
  const leave = () => { active--; };
  const costOf = (lang, kind) => { const p = profile[lang] || DEFAULT_PROFILE[lang]; return { compile: kind === "large-compile" ? (p.largeCompileMs || p.compileMs) : p.compileMs, run: kind === "cpu" ? p.cpuMs : kind === "timeout" ? p.timeoutMs : p.runMs }; };
  const caseOutcome = (kind, fn, stdin, limits) => {
    if (kind === "timeout") return { status: "timeout", stdout: "", stderr: "", exitCode: null };
    if (kind === "runtime-error") return { status: "runtime-error", stdout: "", stderr: "Traceback (fake)\n", exitCode: 1 };
    if (kind === "output-limit") return { status: "output-limit", stdout: "x".repeat(Math.min(limits.outputBytes || 4096, 4096)), stderr: "", exitCode: null };
    return { status: "success", stdout: stdoutFor(fn, stdin), stderr: "", exitCode: 0 };
  };
  return {
    stats: () => ({ active, peak, runs, official }),
    /** Holds official executions until the returned release() is called (idempotent). Nested holds share one gate. */
    holdOfficial() {
      if (!gate) { let release; const promise = new Promise(r => { release = r; }); gate = { promise, release }; }
      const g = gate;
      return () => { if (gate === g) gate = null; g.release(); };
    },
    availableLanguages: async () => LANGUAGES.map(key => ({ key, languageVersion: 1 })),
    sweep: async () => 0,
    async run(entry, request) {
      runs++; enter();
      const t0 = now();
      try {
        const kind = kindOf(request.source), fn = fnOf(request.source), cost = costOf(entry.key, kind);
        if (onRun) onRun({ phase: "practice", language: entry.key, kind });
        if (entry.compileSandbox) { await wait(cost.compile); if (kind === "compile-error") return { status: "compile-error", stdout: "", stderr: "Main.java:1: error: ';' expected (fake)\n" }; }
        else if (kind === "compile-error") { await wait(5); return { status: "compile-error", stdout: "", stderr: "SyntaxError (fake)\n" }; }
        await wait(kind === "timeout" ? Math.min(cost.run, request.limits.timeMs) : cost.run);
        const o = caseOutcome(kind, fn, request.stdin, request.limits);
        return { status: o.status, stdout: o.stdout, stderr: o.stderr, durationMs: now() - t0 };
      } finally { leave(); }
    },
    async runOfficialSuite(entry, job, { signal, caseConcurrency = 2 } = {}) {
      official++;
      await waitGate(signal);
      enter();
      try {
        const kind = kindOf(job.source), fn = fnOf(job.source), cost = costOf(entry.key, kind);
        if (onRun) onRun({ phase: "official", language: entry.key, kind, cases: job.cases.length });
        const out = {};
        if (entry.compileSandbox) {
          await wait(cost.compile, signal);
          if (signal && signal.aborted) throw new Error("aborted");
          if (kind === "compile-error") { out.compile = { status: "compile-error", stderr: "Main.java:1: error: ';' expected (fake)\n", durationMs: cost.compile }; out.cases = []; return out; }
          out.compile = { status: "compiled", durationMs: cost.compile };
        } else if (kind === "compile-error") { out.cases = job.cases.map(c => ({ token: c.token, status: "compile-error", stdout: "", stderr: "SyntaxError (fake)\n", exitCode: 1, durationMs: 1 })); return out; }
        const results = new Array(job.cases.length);
        let next = 0;
        const worker = async () => { for (;;) { const i = next++; if (i >= job.cases.length) return; if (signal && signal.aborted) throw new Error("aborted"); const c = job.cases[i]; const t0 = now(); await wait(kind === "timeout" ? Math.min(cost.run, job.limits.timeMs) : cost.run, signal); const o = caseOutcome(kind, fn, c.stdin, job.limits); results[i] = { token: c.token, status: o.status, stdout: o.stdout, stderr: o.stderr, exitCode: o.exitCode, durationMs: now() - t0 }; } };
        await Promise.all(Array.from({ length: Math.max(1, Math.min(caseConcurrency, job.cases.length)) }, worker));
        out.cases = results;
        return out;
      } finally { leave(); }
    }
  };
}

module.exports = { DEFAULT_PROFILE, createFakeSandbox, kindOf, fnOf };
