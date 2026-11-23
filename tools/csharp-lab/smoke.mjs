// SPIKE (docs/enterprise-teacher-csharp-lab-spike.md) — measure and prove the teacher's in-browser C# compiler in real Chromium.
//   node tools/csharp-lab/smoke.mjs <published wwwroot>      (env: PLAYWRIGHT_CORE_DIR, CHROMIUM_PATH, optional REPORT_DIR)
// 1. SIZE: every file the page can download, raw and Brotli (the published .br when present, else compressed here).
// 2. START: a cold load (empty cache) to "ready", then a warm reload (HTTP cache) — the teacher's first and later visits.
// 3. BEHAVIOUR: programs the Runner's csharp@1 worker handles — output, input, compile error with the writer's line, runtime error,
//    the book's wrap rule, collections / LINQ / string formatting — with compile and run times (first compile and warm compiles).
// 4. POLICY: the page runs under its own strict CSP (+ 'wasm-unsafe-eval'); any violation fails the spike.
// Exit 1 when an expectation fails. Writes report.json and report.md to REPORT_DIR (and the job summary when GitHub provides one).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const root = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(root, "index.html"))) { console.error("usage: smoke.mjs <published wwwroot>"); process.exit(2); }
const reportDir = path.resolve(process.env.REPORT_DIR || "csharp-lab-report");
fs.mkdirSync(reportDir, { recursive: true });

// ── 1. size ──
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (!/\.(br|gz)$/.test(e.name)) files.push(p);
  }
})(root);
let rawBytes = 0, brBytes = 0;
const byFile = [];
for (const f of files) {
  const raw = fs.statSync(f).size;
  const br = fs.existsSync(f + ".br") ? fs.statSync(f + ".br").size
    : zlib.brotliCompressSync(fs.readFileSync(f), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  rawBytes += raw; brBytes += br;
  byFile.push({ file: path.relative(root, f), raw, br });
}
byFile.sort((a, b) => b.br - a.br);
const mb = n => (n / 1024 / 1024).toFixed(2) + " MB";

// ── static server (application/wasm for .wasm; Brotli when the browser accepts it, as a CDN would) ──
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".dll": "application/octet-stream", ".dat": "application/octet-stream", ".pdb": "application/octet-stream" };
let servedBytes = 0;
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const headers = { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "public, max-age=3600" };
  let body = fs.readFileSync(file);
  if (/\bbr\b/.test(String(req.headers["accept-encoding"] || ""))) {
    body = fs.existsSync(file + ".br") ? fs.readFileSync(file + ".br") : zlib.brotliCompressSync(body);
    headers["Content-Encoding"] = "br";
  }
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

// ── 2. start: cold, then warm ──
servedBytes = 0;
let t = Date.now();
await page.goto(base);
await page.waitForFunction(() => window.csharpLab, null, { timeout: 180000 });
const cold = { wallMs: Date.now() - t, runtimeReadyMs: await page.evaluate(() => window.csharpLab.readyMs), transferredBytes: servedBytes };
servedBytes = 0;
t = Date.now();
await page.reload();
await page.waitForFunction(() => window.csharpLab, null, { timeout: 180000 });
const warm = { wallMs: Date.now() - t, runtimeReadyMs: await page.evaluate(() => window.csharpLab.readyMs), transferredBytes: servedBytes };

// ── 3. behaviour ──
const PROGRAMS = [
  { name: "hello", source: 'using System;\npublic class Program\n{\n    public static void Main()\n    {\n        Console.WriteLine("مرحبا");\n    }\n}\n', stdin: "",
    check: r => r.status === "success" && r.stdout === "مرحبا\n" },
  { name: "input (Console.ReadLine)", source: "class P { static void Main() { int a = int.Parse(Console.ReadLine()!); int b = int.Parse(Console.ReadLine()!); Console.WriteLine(a + b); } }", stdin: "2\n3\n",
    check: r => r.status === "success" && r.stdout.trim() === "5" },
  { name: "compile error keeps the writer's line", source: "class P\n{\n    static void Main()\n    {\n        int x = 1\n    }\n}\n", stdin: "",
    check: r => r.status === "compile-error" && /Program\.cs\(5,\d+\): error CS1002/.test(r.stderr) },
  { name: "runtime error", source: "class P { static void Main() { int z = 0; Console.WriteLine(1 / z); } }", stdin: "",
    check: r => r.status === "runtime-error" && /DivideByZeroException/.test(r.stderr) },
  { name: "book wrap rule (Main only, line numbers kept)", source: "static void Main()\n{\n    Console.WriteLine(\"ok\")\n}", stdin: "",
    check: r => r.status === "compile-error" && /Program\.cs\(3,\d+\): error CS1002/.test(r.stderr) },
  { name: "collections, LINQ, formatting", source: "class P { static void Main() { var l = new List<int> { 5, 3, 8, 1 }; l.Sort(); Console.WriteLine(string.Join(\",\", l.Where(x => x > 2))); var d = new Dictionary<string, int> { [\"a\"] = 1 }; Console.WriteLine($\"{d[\"a\"]:D3} {Math.Sqrt(16)}\"); int[,] m = new int[2, 2]; m[1, 1] = 7; Console.WriteLine(m[1, 1]); } }", stdin: "",
    check: r => r.status === "success" && r.stdout === "3,5,8\n001 4\n7\n" },
  { name: "warm compile (a second small program)", source: "static void Main()\n{\n    Console.WriteLine(\"again\");\n}", stdin: "",
    check: r => r.status === "success" && r.stdout === "again\n" },
];
const results = [];
for (const p of PROGRAMS) {
  const t0 = Date.now();
  let r;
  try { r = await page.evaluate(([s, i]) => window.csharpLab.run(s, i), [p.source, p.stdin]); }
  catch (e) { r = { status: "threw", stdout: "", stderr: String(e), compileMs: 0, runMs: 0 }; }
  const wallMs = Date.now() - t0;
  const ok = p.check(r);
  expect(ok, "program «" + p.name + "»: " + JSON.stringify({ status: r.status, stdout: r.stdout, stderr: String(r.stderr).slice(0, 300) }));
  results.push({ name: p.name, ok, status: r.status, compileMs: r.compileMs, runMs: r.runMs, wallMs });
}
expect(violations.length === 0, "CSP violations: " + violations.join(" | "));
expect(pageErrors.length === 0, "page errors: " + pageErrors.join(" | "));

await browser.close();
server.close();

// ── report ──
const report = { size: { files: files.length, rawBytes, brotliBytes: brBytes, largest: byFile.slice(0, 12) }, start: { cold, warm }, programs: results, cspViolations: violations, pageErrors, failures };
fs.writeFileSync(path.join(reportDir, "report.json"), JSON.stringify(report, null, 2));
const md = [
  "## Teacher C# lab spike — in-browser Roslyn on .NET WebAssembly",
  "",
  "| Measure | Value |", "|---|---|",
  "| Files | " + files.length + " |",
  "| Download, raw | " + mb(rawBytes) + " |",
  "| Download, Brotli | " + mb(brBytes) + " |",
  "| Cold start (empty cache) → ready | " + cold.wallMs + " ms (runtime " + cold.runtimeReadyMs + " ms), transferred " + mb(cold.transferredBytes) + " |",
  "| Warm reload (HTTP cache) → ready | " + warm.wallMs + " ms (runtime " + warm.runtimeReadyMs + " ms), transferred " + mb(warm.transferredBytes) + " |",
  "| CSP violations | " + violations.length + " |",
  "",
  "| Program | OK | Status | Compile ms | Run ms | Wall ms |", "|---|---|---|---|---|---|",
  ...results.map(r => "| " + r.name + " | " + (r.ok ? "✅" : "❌") + " | " + r.status + " | " + r.compileMs + " | " + r.runMs + " | " + r.wallMs + " |"),
  "",
  "Largest files (Brotli): " + byFile.slice(0, 8).map(f => f.file + " " + mb(f.br)).join(" · "),
  "",
  failures.length ? "### Failures\n" + failures.map(f => "- " + f).join("\n") : "**SPIKE PASS**",
].join("\n");
fs.writeFileSync(path.join(reportDir, "report.md"), md + "\n");
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
console.log(md);
process.exit(failures.length ? 1 : 0);
