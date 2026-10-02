"use strict";
// Phase 17F-A1 — operator SMOKE TOOL for the Coding Runner pilot. Secrets come ONLY from the environment (never arguments, never
// files in the repository); nothing secret, no signature and no program output beyond a short status is printed. It reuses the
// gateway's own signers (auth.js signRequest, callback.js signCallbackRequest / encodeCallbackBody) — no second implementation.
//
//   Runner surface (signed with RUNNER_HMAC_KEY; RUNNER_URL = https://runner.<domain> or http://127.0.0.1:8787 on the VM):
//     node deploy/azure-vm/smoke.js runner [--languages=python,java,csharp] [--security] [--sandbox] [--staging-only] [--gate-p1] [--json]
//   SmartAssess callback path (signed with SMARTASSESS_CALLBACK_HMAC_KEY to SMARTASSESS_CALLBACK_BASE_URL):
//     node deploy/azure-vm/smoke.js callback [--near-max] [--json]
//
// SAFE ON PRODUCTION: practice runs persist nothing; every OFFICIAL request it sends is deliberately INVALID (400 proves the
// route is enabled, nothing is journaled); every CALLBACK it sends names a job that does not exist (404 UNKNOWN_JOB proves the
// key relationship and the body size path, nothing is written). Destructive pressure tests run only with --staging-only.
// End-to-end OFFICIAL grading (score applied once) is verified with the dedicated test assignment (smoke-matrix.md).
// Exit: 0 all checks passed · 1 a check failed · 2 usage / configuration.
const crypto = require("node:crypto");
const { signRequest } = require("../../gateway/auth.js");
const { signCallbackRequest, encodeCallbackBody, CALLBACK_PATH } = require("../../gateway/callback.js");
const { OFFICIAL_MAX_BODY_BYTES } = require("../../gateway/server.js");

const P1_CEILING_MS = 40000;                     // Pilot Gate P1: SWA managed API request ceiling 45 s minus a 5 s margin
const rid = p => p + crypto.randomBytes(9).toString("hex");
const PRACTICE = Object.freeze({ timeMs: 3000, memoryMb: 128, outputBytes: 4096 });

// The pilot language matrix (practice path; the official-score matrix uses the same programs through the test assignment).
const MATRIX = {
  python: [
    { id: "pass", source: "print(int(input()) * 2)\n", stdin: "21\n", status: "success", stdout: "42" },
    { id: "wrong-output", source: "print(41)\n", stdin: "21\n", status: "success", stdout: "41" },
    { id: "runtime-error", source: "print(1 // 0)\n", stdin: "", status: "runtime-error" },
    { id: "timeout", source: "while True:\n    pass\n", stdin: "", status: "timeout", limits: { timeMs: 1000 } }
  ],
  java: [
    { id: "pass", source: "import java.util.*;\npublic class Main { public static void main(String[] a) { Scanner s = new Scanner(System.in); System.out.println(s.nextInt() * 2); } }\n", stdin: "21\n", status: "success", stdout: "42" },
    { id: "compile-error", source: "public class Main { public static void main(String[] a) { System.out.println(1) } }\n", stdin: "", status: "compile-error" },
    { id: "wrong-output", source: "public class Main { public static void main(String[] a) { System.out.println(41); } }\n", stdin: "21\n", status: "success", stdout: "41" },
    { id: "runtime-error", source: "public class Main { public static void main(String[] a) { int[] x = new int[1]; x[2] = 1; } }\n", stdin: "", status: "runtime-error" },
    { id: "timeout", source: "public class Main { public static void main(String[] a) { while (true) { } } }\n", stdin: "", status: "timeout", limits: { timeMs: 2000 } }
  ],
  csharp: [
    { id: "pass", source: "var n = int.Parse(Console.ReadLine()!);\nConsole.WriteLine(n * 2);\n", stdin: "21\n", status: "success", stdout: "42" },
    { id: "compile-error", source: "Console.WriteLine(1)\n", stdin: "", status: "compile-error" },
    { id: "wrong-output", source: "Console.WriteLine(41);\n", stdin: "21\n", status: "success", stdout: "41" },
    { id: "runtime-error", source: "throw new InvalidOperationException(\"x\");\n", stdin: "", status: "runtime-error" },
    { id: "timeout", source: "while (true) { }\n", stdin: "", status: "timeout", limits: { timeMs: 2000 } }
  ]
};
// Container-boundary probes, executed as student code (python). `stagingOnly` ones apply pressure and never run on production.
const SANDBOX = [
  { id: "network-unavailable", source: "import socket\ns = socket.socket(); s.settimeout(2)\ntry:\n    s.connect(('1.1.1.1', 53)); print('CONNECTED')\nexcept OSError:\n    print('blocked')\n", expect: r => r.status === "success" && r.stdout.trim() === "blocked" },
  { id: "host-filesystem-unavailable", source: "import os\nprint(sorted(p for p in ('/data/smartassess-runner', '/etc/smartassess-runner', '/var/lib/docker', '/etc/caddy', '/opt/smartassess-runner') if os.path.exists(p)))\ntry:\n    open('/etc/probe', 'w'); print('WROTE')\nexcept OSError:\n    print('read-only')\n", expect: r => r.status === "success" && /\[\]/.test(r.stdout) && /read-only/.test(r.stdout) },
  { id: "docker-socket-unavailable", source: "import os\nprint(any(os.path.exists(p) for p in ('/var/run/docker.sock', '/run/docker.sock')))\n", expect: r => r.status === "success" && r.stdout.trim() === "False" },
  { id: "infinite-loop-bounded", source: "while True:\n    pass\n", limits: { timeMs: 1000 }, expect: r => r.status === "timeout" },
  { id: "huge-stdout-bounded", source: "while True:\n    print('x' * 1000)\n", limits: { timeMs: 5000 }, expect: r => r.status === "output-limit" && Buffer.byteLength(r.stdout, "utf8") <= PRACTICE.outputBytes },
  { id: "fork-pressure-bounded", stagingOnly: true, source: "import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        pass\n", limits: { timeMs: 2000 }, expect: r => r.status === "timeout" || r.status === "runtime-error" },
  { id: "memory-pressure-bounded", stagingOnly: true, source: "a = []\nwhile True:\n    a.append(bytearray(10 ** 7))\n", limits: { memoryMb: 64, timeMs: 5000 }, expect: r => r.status === "runtime-error" || r.status === "timeout" }
];

/** Near-worst LEGITIMATE practice requests (max time limit, a program using ~85% of it, Java / C# source near the 64 KB cap). */
function p1Programs() {
  const javaMethods = [], csMethods = [];
  for (let i = 0; Buffer.byteLength(javaMethods.join(""), "utf8") < 60000; i++) javaMethods.push("  static int f" + i + "(int x) { return x + " + i + "; }\n");
  for (let i = 0; Buffer.byteLength(csMethods.join(""), "utf8") < 60000; i++) csMethods.push("  public static int F" + i + "(int x) { return x + " + i + "; }\n");
  return [
    { language: "python", source: "import time\nt = time.time()\nwhile time.time() - t < 8.5:\n    pass\nprint('done')\n" },
    { language: "java", source: "public class Main {\n" + javaMethods.join("") + "  public static void main(String[] a) { long t = System.nanoTime(); while (System.nanoTime() - t < 8_500_000_000L) { } System.out.println(\"done\"); }\n}\n" },
    { language: "csharp", source: "var sw = System.Diagnostics.Stopwatch.StartNew();\nwhile (sw.ElapsedMilliseconds < 8500) { }\nConsole.WriteLine(\"done\");\nstatic class Pad {\n" + csMethods.join("") + "}\n" }
  ];
}

function client({ baseUrl, key, fetchImpl = globalThis.fetch, timeoutMs = 75000 }) {
  const base = baseUrl.replace(/\/+$/, "");
  async function call(method, p, { body, signKey = key, requestId = rid("smk_"), timestamp = Math.floor(Date.now() / 1000), headers: extra, unsigned, rawBody } = {}) {
    const text = rawBody !== undefined ? rawBody : body === undefined ? "" : JSON.stringify(body);
    const buf = Buffer.from(text, "utf8");
    const headers = { ...(unsigned ? {} : signRequest({ key: signKey, method, path: p, timestamp, requestId, body: buf })), ...(method === "POST" ? { "content-type": "application/json" } : {}), ...(extra || {}) };
    const t0 = Date.now();
    const res = await fetchImpl(base + p, { method, headers, body: method === "POST" ? buf : undefined, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    const raw = await res.text();
    let json = null;
    try { json = JSON.parse(raw); } catch { json = null; }
    return { status: res.status, json, ms: Date.now() - t0, requestId, timestamp, text };
  }
  return { call };
}

const practiceBody = (language, source, stdin, limits) => ({ requestId: rid("smk_"), language, languageVersion: 1, source, stdin, limits: { ...PRACTICE, ...(limits || {}) } });

async function smokeRunner({ baseUrl, key, fetchImpl, languages = ["python", "java", "csharp"], security = true, sandbox = true, stagingOnly = false, gateP1 = false } = {}) {
  const c = client({ baseUrl, key, fetchImpl });
  const out = [];
  const check = async (id, fn) => { try { const r = await fn(); out.push({ id, ok: !!r.ok, detail: r.detail, ...(r.ms !== undefined ? { ms: r.ms } : {}) }); } catch (e) { out.push({ id, ok: false, detail: "request failed (" + (e && e.name || "error") + ")" }); } };
  const execute = async (body, opts = {}) => { const b = { ...body, requestId: opts.requestId || body.requestId }; return c.call("POST", "/v1/execute", { body: b, requestId: b.requestId, ...opts }); };

  await check("liveness", async () => { const r = await c.call("GET", "/healthz", { unsigned: true }); return { ok: r.status === 200 && r.json && r.json.ok === true, detail: "HTTP " + r.status }; });
  await check("capabilities", async () => {
    const r = await c.call("GET", "/v1/capabilities");
    const langs = r.json && Array.isArray(r.json.languages) ? r.json.languages.map(l => l.key).sort() : [];
    return { ok: r.status === 200 && ["csharp", "java", "python"].every(k => langs.includes(k)), detail: "HTTP " + r.status + " languages " + (langs.join(",") || "none") };
  });

  if (security) {
    const valid = practiceBody("python", "print(1)\n", "", null);
    await check("unsigned-rejected", async () => { const r = await c.call("POST", "/v1/execute", { body: valid, unsigned: true }); return { ok: r.status === 401, detail: "HTTP " + r.status }; });
    await check("wrong-hmac-rejected", async () => { const r = await execute(practiceBody("python", "print(1)\n", "", null), { signKey: crypto.randomBytes(32).toString("hex") }); return { ok: r.status === 401, detail: "HTTP " + r.status }; });
    await check("stale-timestamp-rejected", async () => { const r = await execute(practiceBody("python", "print(1)\n", "", null), { timestamp: Math.floor(Date.now() / 1000) - 600 }); return { ok: r.status === 401, detail: "HTTP " + r.status }; });
    await check("replay-rejected", async () => {
      const b = practiceBody("python", "print(1)\n", "", null), ts = Math.floor(Date.now() / 1000);
      const first = await execute(b, { requestId: b.requestId, timestamp: ts });
      const second = await execute(b, { requestId: b.requestId, timestamp: ts });
      return { ok: first.status === 200 && second.status === 401, detail: "first HTTP " + first.status + ", replay HTTP " + second.status };
    });
    await check("tampered-body-rejected", async () => {
      const b = practiceBody("python", "print(1)\n", "", null), ts = Math.floor(Date.now() / 1000), text = JSON.stringify(b);
      const headers = signRequest({ key, method: "POST", path: "/v1/execute", timestamp: ts, requestId: b.requestId, body: Buffer.from(text) });
      const r = await c.call("POST", "/v1/execute", { unsigned: true, headers, rawBody: text.replace("print(1)", "print(2)") });
      return { ok: r.status === 401, detail: "HTTP " + r.status };
    });
    await check("oversized-source-rejected", async () => { const r = await execute(practiceBody("python", "#" + "x".repeat(70000) + "\n", "", null)); return { ok: r.status === 400 && r.json && r.json.code === "REQUEST_INVALID", detail: "HTTP " + r.status }; });
    await check("unsupported-language-rejected", async () => { const r = await execute(practiceBody("ruby", "puts 1\n", "", null)); return { ok: r.status === 400, detail: "HTTP " + r.status }; });
    await check("arbitrary-image-rejected", async () => { const r = await execute({ ...practiceBody("python", "print(1)\n", "", null), image: "alpine:latest" }); return { ok: r.status === 400, detail: "HTTP " + r.status }; });
    await check("official-route-enabled", async () => {
      const r = await c.call("POST", "/v1/official-grading-jobs", { body: { probe: true } });
      return { ok: r.status === 400 && r.json && r.json.code === "REQUEST_INVALID", detail: r.status === 503 ? "HTTP 503 " + (r.json && r.json.code) + " — official grading is DISABLED on the gateway" : "HTTP " + r.status };
    });
    await check("proxy-accepts-near-max-official-body", async () => {
      // a signed, deliberately INVALID official body just under the gateway's 2 MiB bound: 400 proves no proxy in front refused it
      const pad = "x".repeat(OFFICIAL_MAX_BODY_BYTES - 4096);
      const r = await c.call("POST", "/v1/official-grading-jobs", { body: { probe: pad } });
      return { ok: r.status === 400 && r.json && r.json.code === "REQUEST_INVALID", detail: "HTTP " + r.status + (r.json ? "" : " (non-JSON answer — a proxy refused the body)") };
    });
    await check("oversized-official-body-rejected", async () => {
      const r = await c.call("POST", "/v1/official-grading-jobs", { rawBody: "x".repeat(OFFICIAL_MAX_BODY_BYTES + 1) });
      return { ok: r.status === 413, detail: "HTTP " + r.status };
    });
  }

  for (const lang of languages) {
    for (const t of MATRIX[lang] || []) {
      await check("practice:" + lang + ":" + t.id, async () => {
        const r = await execute(practiceBody(lang, t.source, t.stdin, t.limits));
        const res = r.json && r.json.result;
        const ok = r.status === 200 && res && res.status === t.status && (t.stdout === undefined || String(res.stdout).trim() === t.stdout);
        return { ok, detail: "HTTP " + r.status + " status " + (res ? res.status : "-"), ms: r.ms };
      });
    }
  }

  if (sandbox) {
    for (const t of SANDBOX) {
      if (t.stagingOnly && !stagingOnly) continue;
      await check("sandbox:" + t.id, async () => {
        const r = await execute(practiceBody("python", t.source, "", t.limits));
        const res = r.json && r.json.result;
        return { ok: r.status === 200 && !!res && t.expect(res), detail: "HTTP " + r.status + " status " + (res ? res.status : "-"), ms: r.ms };
      });
    }
    if (stagingOnly) await check("liveness-after-pressure", async () => { const r = await c.call("GET", "/healthz", { unsigned: true }); return { ok: r.status === 200, detail: "HTTP " + r.status }; });
  }

  if (gateP1) {
    for (const p of p1Programs()) {
      await check("gate-p1:" + p.language, async () => {
        const r = await execute(practiceBody(p.language, p.source, "", { timeMs: 10000, memoryMb: 256 }));
        const res = r.json && r.json.result;
        return { ok: r.status === 200 && res && res.status === "success" && r.ms <= P1_CEILING_MS, detail: "HTTP " + r.status + " status " + (res ? res.status : "-") + " in " + r.ms + " ms (ceiling " + P1_CEILING_MS + " ms, Runner leg only)", ms: r.ms };
      });
    }
  }
  return out;
}

/** A callback body for a job id that cannot exist; `nearMax` fills 50 cases with worst-case JSON-escaped evidence. */
function probeCallbackBody({ nearMax = false } = {}) {
  const jobId = "cg_smokeprobe_" + crypto.randomBytes(12).toString("hex");
  if (!nearMax) return { jobId, outcome: "failed", technicalCode: "SMOKE_PROBE", cases: [] };
  const cases = [];
  for (let i = 0; i < 50; i++) cases.push({ token: "c" + String(i + 1).padStart(2, "0"), status: "success", stdout: "\u0001".repeat(17408), stderr: "\u0001".repeat(4096), exitCode: 0, durationMs: 1 });
  return { jobId, outcome: "completed", cases };
}

async function smokeCallback({ baseUrl, key, fetchImpl = globalThis.fetch, nearMax = false } = {}) {
  const out = [];
  const url = new URL(baseUrl).origin + CALLBACK_PATH;
  const send = async (body, signKey) => {
    const text = encodeCallbackBody(body), buf = Buffer.from(text, "utf8");
    const headers = { "content-type": "application/json; charset=utf-8", ...signCallbackRequest({ key: signKey, timestamp: Math.floor(Date.now() / 1000), requestId: rid("cbsmk_"), body: buf }) };
    const t0 = Date.now();
    const res = await fetchImpl(url, { method: "POST", headers, body: buf, redirect: "error", signal: AbortSignal.timeout(60000) });
    let json = null;
    try { json = JSON.parse(await res.text()); } catch { json = null; }
    return { status: res.status, code: json && json.code, ms: Date.now() - t0, bytes: buf.length };
  };
  const meaning = r => r.status === 404 && r.code === "UNKNOWN_JOB" ? "authenticated, validated, nothing applied" : r.status === 401 ? "UNAUTHORIZED — the API callback key does not match" : r.status === 503 ? "GRADING_UNAVAILABLE — API callback key missing / weak / equal to the runner key" : "unexpected";
  const run = async (id, body, signKey, expect) => { try { const r = await send(body, signKey); out.push({ id, ok: expect(r), detail: "HTTP " + r.status + " " + (r.code || "") + " — " + meaning(r) + " (" + r.bytes + " bytes)", ms: r.ms }); } catch (e) { out.push({ id, ok: false, detail: "request failed (" + (e && e.name || "error") + ")" }); } };
  await run("callback-key-matches-api", probeCallbackBody(), key, r => r.status === 404 && r.code === "UNKNOWN_JOB");
  await run("callback-wrong-key-rejected", probeCallbackBody(), crypto.randomBytes(32).toString("hex"), r => r.status === 401);
  if (nearMax) await run("callback-near-max-body-accepted", probeCallbackBody({ nearMax: true }), key, r => r.status === 404 && r.code === "UNKNOWN_JOB");
  return out;
}

async function main() {
  const [target, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter(a => !a.startsWith("--languages=")));
  const langArg = rest.find(a => a.startsWith("--languages="));
  const known = new Set(["--security", "--sandbox", "--staging-only", "--gate-p1", "--near-max", "--json"]);
  if (!["runner", "callback"].includes(target) || [...flags].some(f => !known.has(f))) { console.error("usage: smoke.js runner [--languages=python,java,csharp] [--security] [--sandbox] [--staging-only] [--gate-p1] [--json] | smoke.js callback [--near-max] [--json]"); process.exit(2); }
  let results;
  if (target === "runner") {
    const baseUrl = process.env.RUNNER_URL, key = process.env.RUNNER_HMAC_KEY;
    if (!baseUrl || !key) { console.error("RUNNER_URL and RUNNER_HMAC_KEY must be set in the environment"); process.exit(2); }
    const languages = langArg ? langArg.slice(12).split(",").filter(Boolean) : ["python", "java", "csharp"];
    const anyMode = flags.has("--security") || flags.has("--sandbox") || flags.has("--gate-p1") || langArg;
    results = await smokeRunner({ baseUrl, key, languages: anyMode && !langArg ? [] : languages, security: !anyMode || flags.has("--security"), sandbox: !anyMode || flags.has("--sandbox"), stagingOnly: flags.has("--staging-only"), gateP1: flags.has("--gate-p1") });
  } else {
    const baseUrl = process.env.SMARTASSESS_CALLBACK_BASE_URL, key = process.env.SMARTASSESS_CALLBACK_HMAC_KEY;
    if (!baseUrl || !key) { console.error("SMARTASSESS_CALLBACK_BASE_URL and SMARTASSESS_CALLBACK_HMAC_KEY must be set in the environment"); process.exit(2); }
    results = await smokeCallback({ baseUrl, key, nearMax: flags.has("--near-max") });
  }
  for (const r of results) console.log(flags.has("--json") ? JSON.stringify({ event: "runner.smoke.check", ...r }) : (r.ok ? "PASS " : "FAIL ") + r.id.padEnd(44) + " " + r.detail + (r.ms !== undefined ? " [" + r.ms + " ms]" : ""));
  const failed = results.filter(r => !r.ok).length;
  console.log(failed ? "SMOKE FAILED: " + failed + " of " + results.length : "SMOKE OK: " + results.length + " checks");
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main().catch(() => { console.error("SMOKE FAILED: unexpected error"); process.exit(1); });

module.exports = { MATRIX, SANDBOX, P1_CEILING_MS, p1Programs, smokeRunner, smokeCallback, probeCallbackBody };
