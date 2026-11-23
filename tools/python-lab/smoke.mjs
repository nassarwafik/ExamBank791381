// Python lab (docs/enterprise-python-lab-spike.md) — measure and prove CPython 3.13 (Pyodide) in real Chromium, driven exactly as
// the app drives the C# lab: a host page embeds /python-lab/index.html in a sandboxed iframe (sandbox="allow-scripts": an opaque origin)
// and talks to it by postMessage; Python runs in the lab's worker. The server sends the headers production sends for the C# lab
// (Access-Control-Allow-Origin: *, needed by the opaque-origin page and its worker).
//   node tools/python-lab/smoke.mjs <wwwroot with pyodide/>      (env: PLAYWRIGHT_CORE_DIR, CHROMIUM_PATH, optional REPORT_DIR)
// 1. SIZE: every file the page can download, raw and Brotli.
// 2. START: a cold load (empty cache) to the first result, then a warm reload (HTTP cache).
// 3. BEHAVIOUR: what the Runner's python@1 does — output, input (input(), sys.stdin), syntax error → compile-error, exceptions with a
//    traceback, sys.exit codes, recursion, time-out, output limit, the standard library — and the same version (3.13).
// 4. ISOLATION: state left by one program is put back before the next; a `fresh` run starts a new interpreter; a program cannot reach
//    the network (the worker is sealed after boot) — a request it starts never arrives.
// 5. POLICY: the page runs under its own strict CSP (+ 'wasm-unsafe-eval'); any violation or page error fails the spike.
// Exit 1 when an expectation fails. Writes report.json and report.md to REPORT_DIR (and the job summary when GitHub provides one).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const root = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(root, "index.html")) || !fs.existsSync(path.join(root, "pyodide", "pyodide.asm.wasm"))) {
  console.error("usage: smoke.mjs <wwwroot with pyodide/> (run fetch-pyodide.mjs first)"); process.exit(2);
}
const reportDir = path.resolve(process.env.REPORT_DIR || "python-lab-report");
fs.mkdirSync(reportDir, { recursive: true });
const mb = n => (n / 1024 / 1024).toFixed(2) + " MB";

// ── 1. size ──
const files = [];
(function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else files.push(p); } })(root);
let rawBytes = 0, brBytes = 0;
const byFile = [];
const brCache = new Map();
for (const f of files) {
  const raw = fs.statSync(f).size;
  const br = zlib.brotliCompressSync(fs.readFileSync(f), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } });
  brCache.set(f, br);
  rawBytes += raw; brBytes += br.length;
  byFile.push({ file: path.relative(root, f), raw, br: br.length });
}
byFile.sort((a, b) => b.br - a.br);

// ── static server (application/wasm; Brotli when accepted; ETag revalidation) + a probe that counts requests that reach it ──
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".zip": "application/zip" };
let servedBytes = 0, probeHits = 0;
const HOST_PAGE = `<!doctype html><meta charset="utf-8"><title>host</title>
<iframe id="lab" sandbox="allow-scripts" src="/python-lab/index.html" hidden></iframe>
<script type="module">
const frame = document.getElementById("lab"); const pending = new Map(); let n = 0, ready;
window.labReady = new Promise(r => { ready = r; }); window.labOrigins = [];
window.addEventListener("message", e => {
  if (e.source !== frame.contentWindow) return;
  window.labOrigins.push(e.origin);
  const m = e.data || {};
  if (m.type === "lab-ready") ready();
  // as the app's devicePythonLab.ts: the interpreter's files come from THIS page's HTTP cache, a plain name under /python-lab/pyodide/
  if (m.type === "fetch") {
    const ok = typeof m.name === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(m.name) && !m.name.startsWith(".");
    if (!ok) { frame.contentWindow.postMessage({ type: "fetched", id: m.id, error: true }, "*"); return; }
    fetch("/python-lab/pyodide/" + m.name).then(r => (r.ok ? r.arrayBuffer() : Promise.reject())).then(
      buffer => frame.contentWindow.postMessage({ type: "fetched", id: m.id, buffer }, "*", [buffer]),
      () => frame.contentWindow.postMessage({ type: "fetched", id: m.id, error: true }, "*"));
  }
  if (m.type === "result" && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
window.labRun = (source, stdin, fresh) => new Promise(res => { const id = "r" + (++n); pending.set(id, res); frame.contentWindow.postMessage({ type: "run", id, source, stdin, ...(fresh ? { fresh: true } : {}) }, "*"); });
</script>`;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (pathname === "/" || pathname === "/index.html") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(HOST_PAGE); return; }
  if (pathname.startsWith("/python-lab/__probe")) { probeHits++; res.writeHead(200, { "Access-Control-Allow-Origin": "*" }); res.end("probe"); return; }
  if (!pathname.startsWith("/python-lab/")) { res.writeHead(404); res.end(); return; }
  const file = path.join(root, pathname.slice("/python-lab/".length) || "index.html");
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const headers = { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" };
  const st = fs.statSync(file);
  headers.ETag = '"' + st.size.toString(16) + "-" + Math.floor(st.mtimeMs).toString(16) + '"';
  if (req.headers["if-none-match"] === headers.ETag) { res.writeHead(304, headers); res.end(); return; }
  let body = fs.readFileSync(file);
  if (/\bbr\b/.test(String(req.headers["accept-encoding"] || ""))) { body = brCache.get(file) || zlib.brotliCompressSync(body); headers["Content-Encoding"] = "br"; }
  servedBytes += body.length;
  res.writeHead(200, headers);
  res.end(body);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port + "/";

// ── browser ──
const require = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || process.cwd(), "package.json"));
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext();
const page = await context.newPage();
const violations = [], pageErrors = [];
await page.exposeFunction("__cspViolation", v => violations.push(v));
await page.addInitScript(() => document.addEventListener("securitypolicyviolation", e => window.__cspViolation(e.violatedDirective + " " + e.blockedURI)));
page.on("pageerror", e => pageErrors.push(String(e)));
const failures = [];
const expect = (ok, what) => { if (!ok) failures.push(what); };
const run = (source, stdin = "", fresh = false) => page.evaluate(([s, i, f]) => window.labRun(s, i, f), [source, stdin, fresh]);

// ── 2. start ──
async function firstRun() {
  servedBytes = 0;
  const t0 = Date.now();
  await page.goto(base);
  await page.evaluate(() => window.labReady);
  const labReadyMs = Date.now() - t0;
  const r = await run('print("ok")');
  expect(r.status === "success" && r.stdout === "ok\n", "first run: " + JSON.stringify(r).slice(0, 300));
  return { labReadyMs, firstResultMs: Date.now() - t0, bootMs: r.bootMs, transferredBytes: servedBytes };
}
const cold = await firstRun();
const warm = await firstRun();
// The point of the parent-side fetch: a second visit revalidates (304s) instead of downloading the interpreter again.
expect(warm.transferredBytes < 1024 * 1024, "warm visit must not re-download the interpreter: transferred " + mb(warm.transferredBytes));
expect((await page.evaluate(() => window.labOrigins)).every(o => o === "null"), "the lab must answer from an OPAQUE origin (sandboxed)");

// ── 3 / 4. behaviour and isolation ──
const PROBE = base + "python-lab/__probe";
const PROGRAMS = [
  { name: "the same Python as the Runner (3.13)", source: "import sys\nprint('%d.%d' % sys.version_info[:2])", check: r => r.status === "success" && r.stdout === "3.13\n" },
  { name: "hello (Arabic text)", source: 'print("مرحبا")', check: r => r.status === "success" && r.stdout === "مرحبا\n" },
  { name: "input(): two numbers", source: "a = int(input())\nb = int(input())\nprint(a + b)", stdin: "2\n3\n", check: r => r.status === "success" && r.stdout === "5\n" },
  { name: "input(prompt) writes the prompt to stdout, as CPython does", source: "n = input('n? ')\nprint(n * 2)", stdin: "ab\n", check: r => r.status === "success" && r.stdout === "n? abab\n" },
  { name: "sys.stdin.read() and sys.stdin.buffer", source: "import sys\nprint(sum(map(int, sys.stdin.read().split())))", stdin: "1 2\n3\n4", check: r => r.status === "success" && r.stdout === "10\n" },
  { name: "sys.stdin.buffer (bytes)", source: "import sys\nprint(len(sys.stdin.buffer.read()))", stdin: "שלום\n", check: r => r.status === "success" && r.stdout === "9\n" },
  { name: "Arabic input echoed", source: "print(input()[::-1])", stdin: "سلام\n", check: r => r.status === "success" && r.stdout === "مالس\n" },
  { name: "syntax error → compile-error naming the line", source: "x = 1\nif x > 0\n    print(x)\n", check: r => r.status === "compile-error" && /line 2/.test(r.stderr) && /SyntaxError/.test(r.stderr) },
  { name: "indentation error → compile-error", source: "def f():\nprint(1)\n", check: r => r.status === "compile-error" && /IndentationError/.test(r.stderr) },
  { name: "exception → runtime-error with a traceback (main.py, line)", source: "a = 1\nprint('before')\nprint(a / 0)\n", check: r => r.status === "runtime-error" && r.stdout === "before\n" && /File "main\.py", line 3/.test(r.stderr) && /ZeroDivisionError/.test(r.stderr) && !/__lab_run/.test(r.stderr) },
  { name: "input() with no input left → EOFError (runtime-error)", source: "input()\ninput()", stdin: "one\n", check: r => r.status === "runtime-error" && /EOFError/.test(r.stderr) },
  { name: "sys.exit(0) → success", source: "import sys\nprint('a')\nsys.exit(0)\nprint('b')", check: r => r.status === "success" && r.stdout === "a\n" },
  { name: "sys.exit(3) → runtime-error", source: "import sys\nsys.exit(3)", check: r => r.status === "runtime-error" },
  { name: "sys.exit('message') → runtime-error, message on stderr", source: "import sys\nsys.exit('bad input')", check: r => r.status === "runtime-error" && /bad input/.test(r.stderr) },
  { name: "recursion 900 deep is fine (CPython's default limit is 1000)", source: "def f(n):\n    return 0 if n == 0 else 1 + f(n - 1)\nprint(f(900))", check: r => r.status === "success" && r.stdout === "900\n" },
  { name: "recursion without end → RecursionError (runtime-error)", source: "def f(n):\n    return f(n + 1)\nf(0)", check: r => r.status === "runtime-error" && /RecursionError/.test(r.stderr) },
  { name: "after the RecursionError the next program runs", source: "print('back')", check: r => r.status === "success" && r.stdout === "back\n" },
  { name: "standard library: collections, itertools, math, fractions, re, json, dataclasses, functools, datetime", source: [
      "from collections import Counter, deque, defaultdict", "from itertools import permutations", "import math, re, json", "from fractions import Fraction",
      "from dataclasses import dataclass", "from functools import lru_cache", "from datetime import date",
      "@dataclass", "class P:", "    x: int", "    y: int",
      "@lru_cache(None)", "def fib(n): return n if n < 2 else fib(n-1) + fib(n-2)",
      "print(Counter('banana').most_common(1), len(list(permutations(range(4)))), math.gcd(12, 18), Fraction(1, 3) + Fraction(1, 6))",
      "print(re.findall(r'\\d+', 'a1b22c333'), json.dumps({'a': [1, 2]}), P(1, 2), fib(80), date(2026, 1, 1).isoformat())",
      "d = deque([1, 2]); d.appendleft(0); dd = defaultdict(int); dd['k'] += 1; print(list(d), dict(dd), f'{math.pi:.3f}', 2 ** 100)"].join("\n"),
    check: r => r.status === "success" && r.stdout === "[('a', 3)] 24 6 1/2\n['1', '22', '333'] {\"a\": [1, 2]} P(x=1, y=2) 23416728348467685 2026-01-01\n[0, 1, 2] {'k': 1} 3.142 1267650600228229401496703205376\n" },
  { name: "a million-step loop (speed, see run ms)", source: "s = 0\nfor i in range(1_000_000):\n    s += i\nprint(s)", check: r => r.status === "success" && r.stdout === "499999500000\n" },
  { name: "endless loop → timeout", source: "while True:\n    pass", check: r => r.status === "timeout" },
  { name: "after a timeout the next program runs (new worker)", source: "print('ok')", check: r => r.status === "success" && r.stdout === "ok\n" },
  { name: "print loop → output-limit", source: "while True:\n    print('x' * 100)", check: r => r.status === "output-limit" && r.stdout.length <= 16 * 1024 },
  { name: "a program changing builtins…", source: "import builtins\nbuiltins.print = lambda *a, **k: None\nbuiltins.LEFT = 1", check: r => r.status === "success" },
  { name: "…is put back for the next program (practice runs)", source: "import builtins\nprint(hasattr(builtins, 'LEFT'))", check: r => r.status === "success" && r.stdout === "False\n" },
  { name: "state left on the sys module survives a plain run (why grading uses fresh)", source: "import sys\nsys.LEFT = 'behind'\nprint('set')", check: r => r.status === "success" && r.stdout === "set\n" },
  { name: "…visible to the next plain run", source: "import sys\nprint(getattr(sys, 'LEFT', 'none'))", check: r => r.status === "success" && r.stdout === "behind\n" },
  { name: "a FRESH run starts clean (grading isolation between students)", fresh: true, source: "import sys\nprint(getattr(sys, 'LEFT', 'none'))", check: r => r.status === "success" && r.stdout === "none\n" },
  { name: "no network: js.fetch / XMLHttpRequest / pyodide.http are refused", fresh: true, stdin: "HIDDEN-INPUT-42\n", source: [
      "import js", "d = input()", "tries = []",
      "for name, call in [('fetch', lambda: js.fetch('" + PROBE + "?d=' + d)), ('xhr', lambda: js.XMLHttpRequest.new()), ('pyfetch', lambda: __import__('pyodide.http', fromlist=['pyfetch']).pyfetch('" + PROBE + "?d=' + d))]:",
      "    try:", "        r = call()", "        tries.append(name + ':started')", "    except BaseException as e:", "        tries.append(name + ':refused')",
      "print(' '.join(tries))"].join("\n"),
    check: r => r.status === "success" && /fetch:refused/.test(r.stdout) && /xhr:refused/.test(r.stdout) },
  { name: "no network: urllib cannot open a URL", source: "import urllib.request\ntry:\n    urllib.request.urlopen('" + PROBE + "?u=1', timeout=2)\n    print('opened')\nexcept BaseException as e:\n    print('refused')", check: r => r.status === "success" && r.stdout === "refused\n" },
];
const results = [];
for (const p of PROGRAMS) {
  const t0 = Date.now();
  let r;
  try { r = await run(p.source, p.stdin || "", !!p.fresh); }
  catch (e) { r = { status: "threw", stdout: "", stderr: String(e), compileMs: 0, runMs: 0 }; }
  const wallMs = Date.now() - t0;
  const ok = p.check(r);
  expect(ok, "program «" + p.name + "»: " + JSON.stringify({ status: r.status, stdout: String(r.stdout).slice(0, 300), stderr: String(r.stderr).slice(0, 400) }));
  results.push({ name: p.name, ok, status: r.status, runMs: r.runMs, wallMs });
}
// A SLOWER computer (an older school machine): the CPU slowed 4× (Chromium's own throttling) — interpreter start and a loop.
let slow = null;
{
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const s = await firstRun();
  const loop = await run("s = 0\nfor i in range(1_000_000):\n    s += i\nprint(s)");
  expect(loop.status === "success", "4× slower CPU: the loop still runs (" + loop.status + ")");
  slow = { ...s, loopRunMs: loop.runMs };
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
}
await new Promise(r => setTimeout(r, 2000));      // time for a request a program started to arrive, if it could
expect(probeHits === 0, "a program reached the network from the Python lab (" + probeHits + " request(s) to the probe)");
expect(violations.length === 0, "CSP violations: " + violations.join(" | "));
expect(pageErrors.length === 0, "page errors: " + pageErrors.join(" | "));
await browser.close();
server.close();

// ── report ──
const report = { size: { files: files.length, rawBytes, brotliBytes: brBytes, largest: byFile.slice(0, 8) }, start: { cold, warm, slowCpu4x: slow }, programs: results, probeHits, cspViolations: violations, pageErrors, failures };
fs.writeFileSync(path.join(reportDir, "report.json"), JSON.stringify(report, null, 2));
const md = [
  "## Python lab spike — CPython 3.13 (Pyodide) in the browser",
  "",
  "| Measure | Value |", "|---|---|",
  "| Files | " + files.length + " |",
  "| Download, raw | " + mb(rawBytes) + " |",
  "| Download, Brotli | " + mb(brBytes) + " |",
  "| Cold: page → lab ready / → first result | " + cold.labReadyMs + " ms / " + cold.firstResultMs + " ms (interpreter start " + cold.bootMs + " ms), transferred " + mb(cold.transferredBytes) + " |",
  "| Warm (HTTP cache, revalidated): page → lab ready / → first result | " + warm.labReadyMs + " ms / " + warm.firstResultMs + " ms (interpreter start " + warm.bootMs + " ms), transferred " + mb(warm.transferredBytes) + " |",
  "| 4× slower CPU: interpreter start / a million-step loop | " + slow.bootMs + " ms / " + slow.loopRunMs + " ms |",
  "| Requests that reached the network probe | " + probeHits + " |",
  "| CSP violations / page errors | " + violations.length + " / " + pageErrors.length + " |",
  "",
  "| Program | OK | Status | Run ms | Wall ms |", "|---|---|---|---|---|",
  ...results.map(r => "| " + r.name + " | " + (r.ok ? "✅" : "❌") + " | " + r.status + " | " + (r.runMs ?? "") + " | " + r.wallMs + " |"),
  "",
  "Largest files (Brotli): " + byFile.slice(0, 5).map(f => f.file + " " + mb(f.br)).join(" · "),
  "",
  failures.length ? "### Failures\n" + failures.map(f => "- " + f).join("\n") : "**SPIKE PASS**",
].join("\n");
fs.writeFileSync(path.join(reportDir, "report.md"), md + "\n");
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
console.log(md);
process.exit(failures.length ? 1 : 0);
