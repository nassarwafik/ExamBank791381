// Teacher C# lab (docs/enterprise-teacher-csharp-lab-spike.md; V1 in docs/enterprise-csharp-visual-lab-plan.md) — measure and prove
// the teacher's in-browser C# compiler in real Chromium, THE WAY THE SITE USES IT: a host page embeds /csharp-lab/index.html (the
// bridge) as a hidden same-origin frame and talks to it with postMessage; the bridge runs every program in its lab worker.
//   node tools/csharp-lab/smoke.mjs <published wwwroot>      (env: PLAYWRIGHT_CORE_DIR, CHROMIUM_PATH, optional REPORT_DIR)
// 1. SIZE: every file the lab can download, raw and Brotli.
// 2. START: a cold load (empty cache) to "ready", then a warm reload (HTTP cache) — the teacher's first and later visits.
// 3. BEHAVIOUR: programs the Runner's csharp@1 worker handles — output, input, compile error with the writer's line, runtime error,
//    the book's wrap rule, collections / LINQ / string formatting, the book's classes — with compile and run times.
// 4. LIMITS: a loop without end → «timeout» and the next run works (fresh worker); endless printing → «output-limit»; a recursion
//    without end → «runtime-error» and the next run works; a program cannot reach the network or storage (the worker is sealed).
// 5. POLICY: the bridge runs under its own strict CSP (+ 'wasm-unsafe-eval'), also sent as a header as the site does; any
//    violation fails the run.
// Exit 1 when an expectation fails. Writes report.json and report.md to REPORT_DIR (and the job summary when GitHub provides one).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const root = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(root, "index.html")) || !fs.existsSync(path.join(root, "bridge.js"))) { console.error("usage: smoke.mjs <published wwwroot>"); process.exit(2); }
// The header the site sends for /csharp-lab/* (staticwebapp.config.json) — read from the config itself, so the two cannot drift.
const SITE_CONFIG = JSON.parse(fs.readFileSync(new URL("../../public/staticwebapp.config.json", import.meta.url), "utf8"));
const LAB_ROUTE = SITE_CONFIG.routes.find(r => r.route === "/csharp-lab/*");
if (!LAB_ROUTE || !LAB_ROUTE.headers || !LAB_ROUTE.headers["Content-Security-Policy"]) { console.error("staticwebapp.config.json has no /csharp-lab/* policy"); process.exit(2); }
// The host page: a stand-in for the teacher's reader (same origin), with the same protocol as src/studentTools/csharpLab.ts.
const HOST = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>host</title></head><body>
<iframe id="lab" src="/csharp-lab/index.html" title="C# lab" hidden></iframe>
<script>
  const frame = document.getElementById("lab");
  const waiting = new Map(); let next = 1; const t0 = performance.now();
  window.labStates = []; window.labHello = false;
  window.addEventListener("message", e => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    const m = e.data || {};
    if (m.type === "csharp-lab:hello") { window.labHello = true; frame.contentWindow.postMessage({ type: "csharp-lab:warm" }, location.origin); }
    if (m.type === "csharp-lab:state") { window.labStates.push(m.state); if (m.state === "ready" && window.labReadyMs === undefined) window.labReadyMs = Math.round(performance.now() - t0); }
    if (m.type === "csharp-lab:result" && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
  });
  window.lab = { run: (source, stdin, library) => new Promise(resolve => { const id = next++; waiting.set(id, resolve);
    frame.contentWindow.postMessage({ type: "csharp-lab:run", id, source, stdin, library }, location.origin); }) };
</script></body></html>`;
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
const BROTLI = new Map();          // compressed once here, served from memory (compressing per request would dominate the timings)
for (const f of files) {
  const raw = fs.statSync(f).size;
  const body = zlib.brotliCompressSync(fs.readFileSync(f), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
  BROTLI.set(f, body);
  const br = body.length;
  rawBytes += raw; brBytes += br;
  byFile.push({ file: path.relative(root, f), raw, br });
}
byFile.sort((a, b) => b.br - a.br);
const mb = n => (n / 1024 / 1024).toFixed(2) + " MB";

// ── static server: the host at /, the lab at /csharp-lab/ with the site's headers (application/wasm; Brotli when accepted) ──
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".dll": "application/octet-stream", ".dat": "application/octet-stream", ".pdb": "application/octet-stream" };
let servedBytes = 0, probeHits = 0;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (pathname === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(HOST); return; }
  if (pathname === "/csharp-lab/__probe") { probeHits++; res.writeHead(200, { "Content-Type": "text/plain" }); res.end("reached"); return; }
  if (!pathname.startsWith("/csharp-lab/")) { res.writeHead(404); res.end(); return; }
  const file = path.join(root, pathname.slice("/csharp-lab/".length) || "index.html");
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const headers = { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", ...LAB_ROUTE.headers };
  let body = fs.readFileSync(file);
  if (/\bbr\b/.test(String(req.headers["accept-encoding"] || ""))) {
    body = BROTLI.get(file) || zlib.brotliCompressSync(body);
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
await page.waitForFunction(() => window.labReadyMs !== undefined, null, { timeout: 180000 });
const cold = { wallMs: Date.now() - t, runtimeReadyMs: await page.evaluate(() => window.labReadyMs), transferredBytes: servedBytes };
servedBytes = 0;
t = Date.now();
await page.reload();
await page.waitForFunction(() => window.labReadyMs !== undefined, null, { timeout: 180000 });
const warm = { wallMs: Date.now() - t, runtimeReadyMs: await page.evaluate(() => window.labReadyMs), transferredBytes: servedBytes };
expect(await page.evaluate(() => window.labHello && window.labStates[0] === "booting"), "the bridge said hello and booted on «warm»");

// ── 3. behaviour ──
const PROGRAMS = [
  { name: "hello", source: 'using System;\npublic class Program\n{\n    public static void Main()\n    {\n        Console.WriteLine("مرحبا");\n    }\n}\n', stdin: "",
    check: r => r.status === "success" && r.stdout === "مرحبا\n" },
  { name: "input (Console.ReadLine)", source: "class P { static void Main() { int a = int.Parse(Console.ReadLine()!); int b = int.Parse(Console.ReadLine()!); Console.WriteLine(a + b); } }", stdin: "2\n3\n",
    check: r => r.status === "success" && r.stdout.trim() === "5" },
  { name: "input via Console.In and `using static System.Console`", source: "using static System.Console;\nclass P { static void Main() { var a = Console.In.ReadLine(); var b = ReadLine(); WriteLine(a + \"|\" + b + \"|\" + (Console.ReadLine() == null)); } }", stdin: "x\ny\n",
    check: r => r.status === "success" && r.stdout === "x|y|True\n" },
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
// «مبنى المعطيات» — the book's own classes (scripts/ds-course/unit4/Unit4.cs), passed as the course library.
const BOOK = fs.readFileSync(new URL("../../scripts/ds-course/unit4/Unit4.cs", import.meta.url), "utf8");
PROGRAMS.push(
  { name: "book Stack<T> (Push / Pop / Top / IsEmpty, ToString)", library: BOOK, stdin: "",
    source: "static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    for (int i = 1; i <= 3; i++) s.Push(i);\n    Console.WriteLine(s);\n    Console.WriteLine(s.Pop() + \" \" + s.Top() + \" \" + s.IsEmpty());\n    Console.WriteLine(s);\n}",
    check: r => r.status === "success" && r.stdout === "[3,2,1]\n3 2 False\n[2,1]\n" },
  { name: "book Queue<T> (Insert / Remove / Head / IsEmpty, ToString)", library: BOOK, stdin: "",
    source: "static void Main()\n{\n    Queue<string> q = new Queue<string>();\n    q.Insert(\"a\"); q.Insert(\"b\"); q.Insert(\"c\");\n    Console.WriteLine(q);\n    Console.WriteLine(q.Remove() + q.Head() + q.IsEmpty());\n}",
    check: r => r.status === "success" && r.stdout === "[a,b,c]\nabFalse\n" },
  { name: "book Node<T> chain (GetValue / GetNext / HasNext)", library: BOOK, stdin: "",
    source: "static void Main()\n{\n    Node<int> first = new Node<int>(1, new Node<int>(2, new Node<int>(3)));\n    Node<int> pos = first; int sum = 0;\n    while (pos != null) { sum += pos.GetValue(); pos = pos.GetNext(); }\n    Console.WriteLine(sum + \" \" + first.HasNext() + \" \" + first.GetNext().GetNext().HasNext());\n}",
    check: r => r.status === "success" && r.stdout === "6 True False\n" },
  { name: "book BinNode<T> tree (in-order, recursion)", library: BOOK, stdin: "",
    source: "static void InOrder(BinNode<int> t)\n{\n    if (t == null) return;\n    InOrder(t.GetLeft()); Console.Write(t.GetValue() + \" \"); InOrder(t.GetRight());\n}\nstatic void Main()\n{\n    BinNode<int> t = new BinNode<int>(new BinNode<int>(1), 2, new BinNode<int>(new BinNode<int>(3), 4, null));\n    InOrder(t); Console.WriteLine(t.HasLeft() + \" \" + t.GetRight().HasRight());\n}",
    check: r => r.status === "success" && r.stdout === "1 2 3 4 True False\n" },
  { name: "writer's own Stack<T> replaces the book's (no duplicate)", library: BOOK, stdin: "",
    source: "public class Stack<T> { private T[] a = new T[10]; private int n; public void Push(T x) { a[n++] = x; } public T Pop() { return a[--n]; } }\nclass P { static void Main() { var s = new Stack<int>(); s.Push(7); Console.WriteLine(s.Pop()); var q = new Queue<int>(); q.Insert(5); Console.WriteLine(q.Head()); } }",
    check: r => r.status === "success" && r.stdout === "7\n5\n" },
  { name: "book compile error keeps the writer's line (library after)", library: BOOK, stdin: "",
    source: "static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    s.Peek();\n}",
    check: r => r.status === "compile-error" && /Program\.cs\(4,\d+\): error CS1061/.test(r.stderr) },
);
// ── 4. limits (each checked through the frame; a fresh worker must take over after a timeout or a crash) ──
PROGRAMS.push(
  { name: "loop without end → timeout", stdin: "", source: "static void Main()\n{\n    long i = 0;\n    while (true) i++;\n}",
    check: r => r.status === "timeout" },
  { name: "after a timeout: a fresh worker runs the next program", stdin: "", source: "static void Main()\n{\n    Console.WriteLine(\"alive\");\n}",
    check: r => r.status === "success" && r.stdout === "alive\n" },
  { name: "endless printing → output-limit (bounded output)", stdin: "", source: "static void Main()\n{\n    while (true) Console.WriteLine(\"xxxxxxxxxx\");\n}",
    check: r => r.status === "output-limit" && r.stdout.length === 16 * 1024 },
  { name: "printing caught by the program itself still → output-limit", stdin: "", source: "static void Main()\n{\n    try { for (int i = 0; i < 100000; i++) Console.Write(\"yy\"); } catch { }\n    Console.WriteLine(\"done\");\n}",
    check: r => r.status === "output-limit" },
  { name: "recursion without end → runtime-error", stdin: "", source: "static int F(int n)\n{\n    return F(n + 1) + 1;\n}\nstatic void Main()\n{\n    Console.WriteLine(F(0));\n}",
    check: r => r.status === "runtime-error" && /stack overflow/.test(r.stderr) },
  { name: "after a crash: the next program runs", stdin: "", source: "static void Main()\n{\n    Console.WriteLine(\"back\");\n}",
    check: r => r.status === "success" && r.stdout === "back\n" },
  // The leak path a synchronous Main still has: a request started and never awaited (it would leave after Main returns). Same origin
  // on purpose — the page's policy allows it, so only the sealed worker can stop it. The server counts what arrives (below).
  { name: "no network: a request started by the program never leaves the worker", stdin: base + "csharp-lab/__probe\n", source: "static void Main()\n{\n    string url = Console.ReadLine();\n    try { _ = new HttpClient().GetStringAsync(url); Console.WriteLine(\"started\"); }\n    catch (Exception e) { Console.WriteLine(\"blocked: \" + e.GetType().Name); }\n}",
    check: r => r.status === "success" || r.status === "runtime-error" },
  { name: "the lab keeps working after the network attempt", stdin: "", source: "static void Main()\n{\n    Console.WriteLine(\"still here\");\n}",
    check: r => r.status === "success" && r.stdout === "still here\n" },
);
const results = [];
for (const p of PROGRAMS) {
  const t0 = Date.now();
  let r;
  // Every run has its own deadline (well past the lab's 10 s limit): a lab that never answers FAILS the check, it does not hang the job.
  try { r = await page.evaluate(([s, i, l]) => Promise.race([window.lab.run(s, i, l), new Promise(res => setTimeout(() => res({ status: "no-answer", stdout: "", stderr: "" }), 30000))]), [p.source, p.stdin, p.library || ""]); }
  catch (e) { r = { status: "threw", stdout: "", stderr: String(e) }; }
  const wallMs = Date.now() - t0;
  const ok = p.check(r);
  expect(ok, "program «" + p.name + "»: " + JSON.stringify({ status: r.status, stdout: r.stdout, stderr: String(r.stderr).slice(0, 300) }));
  results.push({ name: p.name, ok, status: r.status, durationMs: r.durationMs, wallMs, detail: (String(r.stdout || "") + String(r.stderr || "")).slice(0, 300) });
}
await new Promise(r => setTimeout(r, 2000));      // time for a request the program started to arrive, if it could
expect(probeHits === 0, "a program reached the network from the lab worker (" + probeHits + " request(s) to /csharp-lab/__probe)");
expect(violations.length === 0, "CSP violations: " + violations.join(" | "));
expect(pageErrors.length === 0, "page errors: " + pageErrors.join(" | "));

await browser.close();
server.close();

// ── report ──
const report = { probeHits, size: { files: files.length, rawBytes, brotliBytes: brBytes, largest: byFile.slice(0, 12) }, start: { cold, warm }, programs: results, cspViolations: violations, pageErrors, failures };
fs.writeFileSync(path.join(reportDir, "report.json"), JSON.stringify(report, null, 2));
const md = [
  "## Teacher C# lab — in-browser Roslyn on .NET WebAssembly (bridge frame + lab worker)",
  "",
  "| Measure | Value |", "|---|---|",
  "| Files | " + files.length + " |",
  "| Download, raw | " + mb(rawBytes) + " |",
  "| Download, Brotli | " + mb(brBytes) + " |",
  "| Cold start (empty cache) → ready | " + cold.wallMs + " ms (runtime " + cold.runtimeReadyMs + " ms), transferred " + mb(cold.transferredBytes) + " |",
  "| Warm reload (HTTP cache) → ready | " + warm.wallMs + " ms (runtime " + warm.runtimeReadyMs + " ms), transferred " + mb(warm.transferredBytes) + " |",
  "| CSP violations | " + violations.length + " |",
  "",
  "| Program | OK | Status | Compile + run ms (lab) | Wall ms |", "|---|---|---|---|---|",
  ...results.map(r => "| " + r.name + " | " + (r.ok ? "✅" : "❌") + " | " + r.status + " | " + r.durationMs + " | " + r.wallMs + " |"),
  "",
  "Largest files (Brotli): " + byFile.slice(0, 8).map(f => f.file + " " + mb(f.br)).join(" · "),
  "",
  failures.length ? "### Failures\n" + failures.map(f => "- " + f).join("\n") : "**LAB PASS**",
].join("\n");
fs.writeFileSync(path.join(reportDir, "report.md"), md + "\n");
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
console.log(md);
process.exit(failures.length ? 1 : 0);
