"use strict";
// Phase 17F-B10-A — the LANGUAGE WORKLOAD MATRIX (P1–P4, J1–J5, C1–C5): representative, NON-destructive programs for Python, Java and
// C#. Every program carries two markers the deterministic fake sandbox (fake-sandbox.js) reads (`LOAD-KIND:<kind>` — the outcome
// it simulates — and `LOAD-FN:<fn>` — how it derives stdout from stdin); the real Docker sandbox simply runs the program, and both
// produce the same expectations, so a report from the fake stack and one from real Docker are judged by the same rules.
// Expected outputs are computed HARNESS-SIDE from stdin (never sent to the Runner, never written to a report), exactly like
// SmartAssess keeps expected outputs away from the Runner. Memory / fork pressure programs are NOT part of this matrix (they stay in
// smoke.js --staging-only).
const { LANGUAGES } = require("./metrics.js");

const KINDS = Object.freeze(["success", "cpu", "large-compile", "timeout", "runtime-error", "compile-error", "output-limit"]);
const PRACTICE_LIMITS = Object.freeze({ timeMs: 3000, memoryMb: 128, outputBytes: 4096 });
const OFFICIAL_LIMITS = Object.freeze({ timeMs: 3000, memoryMb: 128, outputBytes: 17408 });

const pad = (make, bytes) => { const parts = []; for (let i = 0; Buffer.byteLength(parts.join(""), "utf8") < bytes; i++) parts.push(make(i)); return parts.join(""); };
const JAVA_PAD = pad(i => "  static int f" + i + "(int x) { return x + " + i + "; }\n", 40000);
const CS_PAD = pad(i => "  public static int F" + i + "(int x) { return x + " + i + "; }\n", 40000);

const W = (id, language, kind, fn, source, expect, limits = {}) => Object.freeze({ id, language, kind, fn, source, expect: Object.freeze(expect), limits: Object.freeze(limits), compiled: language !== "python" });

const WORKLOADS = Object.freeze([
  // PYTHON
  W("P1", "python", "success", "double", "print(int(input()) * 2)  # LOAD-KIND:success LOAD-FN:double\n", { status: "success" }),
  W("P2", "python", "cpu", "double", "import time\nt = time.time()\nwhile time.time() - t < 1.0:\n    pass\nprint(int(input()) * 2)  # LOAD-KIND:cpu LOAD-FN:double\n", { status: "success" }),
  W("P3", "python", "timeout", "none", "while True:  # LOAD-KIND:timeout LOAD-FN:none\n    pass\n", { status: "timeout" }, { timeMs: 1000 }),
  W("P4", "python", "runtime-error", "none", "print(1 // 0)  # LOAD-KIND:runtime-error LOAD-FN:none\n", { status: "runtime-error" }),
  // JAVA
  W("J1", "java", "success", "double", "import java.util.*;\n// LOAD-KIND:success LOAD-FN:double\npublic class Main { public static void main(String[] a) { Scanner s = new Scanner(System.in); System.out.println(s.nextInt() * 2); } }\n", { status: "success" }),
  W("J2", "java", "large-compile", "double", "import java.util.*;\n// LOAD-KIND:large-compile LOAD-FN:double\npublic class Main {\n" + JAVA_PAD + "  public static void main(String[] a) { Scanner s = new Scanner(System.in); System.out.println(s.nextInt() * 2); }\n}\n", { status: "success" }),
  W("J3", "java", "compile-error", "none", "// LOAD-KIND:compile-error LOAD-FN:none\npublic class Main { public static void main(String[] a) { System.out.println(1) } }\n", { status: "compile-error" }),
  W("J4", "java", "runtime-error", "none", "// LOAD-KIND:runtime-error LOAD-FN:none\npublic class Main { public static void main(String[] a) { int[] x = new int[1]; x[2] = 1; } }\n", { status: "runtime-error" }),
  W("J5", "java", "timeout", "none", "// LOAD-KIND:timeout LOAD-FN:none\npublic class Main { public static void main(String[] a) { while (true) { } } }\n", { status: "timeout" }, { timeMs: 2000 }),
  // C#
  W("C1", "csharp", "success", "double", "// LOAD-KIND:success LOAD-FN:double\nvar n = int.Parse(Console.ReadLine()!);\nConsole.WriteLine(n * 2);\n", { status: "success" }),
  W("C2", "csharp", "large-compile", "double", "// LOAD-KIND:large-compile LOAD-FN:double\nvar n = int.Parse(Console.ReadLine()!);\nConsole.WriteLine(n * 2);\nstatic class Pad {\n" + CS_PAD + "}\n", { status: "success" }),
  W("C3", "csharp", "compile-error", "none", "// LOAD-KIND:compile-error LOAD-FN:none\nConsole.WriteLine(1)\n", { status: "compile-error" }),
  W("C4", "csharp", "runtime-error", "none", "// LOAD-KIND:runtime-error LOAD-FN:none\nthrow new InvalidOperationException(\"x\");\n", { status: "runtime-error" }),
  W("C5", "csharp", "timeout", "none", "// LOAD-KIND:timeout LOAD-FN:none\nwhile (true) { }\n", { status: "timeout" }, { timeMs: 2000 })
]);
const BY_ID = Object.freeze(Object.fromEntries(WORKLOADS.map(w => [w.id, w])));
for (const w of WORKLOADS) if (Buffer.byteLength(w.source, "utf8") > 65536) throw new Error("workload " + w.id + " exceeds the 64 KB source bound");

/** The harness-side function of a workload: stdin → expected stdout (trimmed), or null when no output is expected. */
function expectedStdout(fn, stdin) {
  if (fn === "double") { const n = parseInt(String(stdin).trim().split(/\s+/)[0], 10); return Number.isFinite(n) ? String(n * 2) : null; }
  if (fn === "echo") return String(stdin).trim();
  if (fn === "large") return "x".repeat(17000);
  return null;
}
/** Deterministic hidden-case stdins for an official job (1 ≤ n ≤ 50). */
const officialStdins = n => Array.from({ length: n }, (_, i) => String(i + 1) + "\n");
/** The expected per-case status of a workload's official run (what the API would compare on its side). */
function expectedCaseStatus(w) { return w.kind === "compile-error" ? null : w.expect.status; }

/** Validates an operator-supplied workload (same shape as the matrix entries, `source` and optional `cases` are allowed here). */
function normalizeWorkload(x) {
  if (!x || typeof x !== "object" || typeof x.id !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(x.id)) return null;
  if (!LANGUAGES.includes(x.language) || typeof x.source !== "string" || !x.source || Buffer.byteLength(x.source, "utf8") > 65536) return null;
  const kind = typeof x.kind === "string" ? x.kind : "success";
  if (!KINDS.includes(kind)) return null;
  const expect = x.expect && typeof x.expect.status === "string" ? { status: x.expect.status } : { status: kind === "cpu" || kind === "large-compile" ? "success" : kind };
  const fn = typeof x.fn === "string" ? x.fn : (/LOAD-FN:([a-z]+)/.exec(x.source) || [])[1] || "none";
  const limits = x.limits && typeof x.limits === "object" ? { ...x.limits } : {};
  const out = { id: x.id, language: x.language, kind, fn, source: x.source, expect, limits, compiled: x.language !== "python", stdin: typeof x.stdin === "string" ? x.stdin : null, cases: Array.isArray(x.cases) && x.cases.every(c => typeof c === "string") ? x.cases.slice(0, 50) : null, expectedOutputs: Array.isArray(x.expectedOutputs) ? x.expectedOutputs.slice(0, 50) : null };
  return out;
}

module.exports = { KINDS, PRACTICE_LIMITS, OFFICIAL_LIMITS, WORKLOADS, BY_ID, expectedStdout, officialStdins, expectedCaseStatus, normalizeWorkload };
