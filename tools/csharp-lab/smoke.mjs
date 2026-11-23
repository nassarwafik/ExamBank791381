// Teacher C# lab (docs/enterprise-teacher-csharp-lab-spike.md) — measure and prove the in-browser C# compiler in real Chromium, driven
// EXACTLY as the app drives it: a host page embeds /csharp-lab/index.html in a sandboxed iframe (sandbox="allow-scripts": an opaque
// origin) and talks to it by postMessage; the runtime runs in the lab's worker. The server sends the headers the production config
// sends for /csharp-lab/* (Access-Control-Allow-Origin: *, needed by the opaque-origin page and its worker).
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
let servedBytes = 0, probeHits = 0;
const HOST_PAGE = `<!doctype html><meta charset="utf-8"><title>host</title>
<iframe id="lab" sandbox="allow-scripts" src="/csharp-lab/index.html" hidden></iframe>
<script type="module">
const frame = document.getElementById("lab"); const pending = new Map(); let n = 0, ready;
window.labReady = new Promise(r => { ready = r; }); window.labOrigins = [];
window.addEventListener("message", e => {
  if (e.source !== frame.contentWindow) return;
  window.labOrigins.push(e.origin);
  const m = e.data || {};
  if (m.type === "lab-ready") ready();
  // as the app's teacherCSharpLab.ts: the runtime's files come from THIS page's HTTP cache, a plain name under /csharp-lab/_framework/
  if (m.type === "fetch") {
    const ok = typeof m.name === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(m.name) && !m.name.startsWith(".");
    if (!ok) { frame.contentWindow.postMessage({ type: "fetched", id: m.id, error: true }, "*"); return; }
    fetch("/csharp-lab/_framework/" + m.name).then(r => (r.ok ? r.arrayBuffer() : Promise.reject())).then(
      buffer => frame.contentWindow.postMessage({ type: "fetched", id: m.id, buffer }, "*", [buffer]),
      () => frame.contentWindow.postMessage({ type: "fetched", id: m.id, error: true }, "*"));
  }
  if (m.type === "result" && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
window.labRun = (source, stdin, library) => new Promise(res => { const id = "r" + (++n); pending.set(id, res); frame.contentWindow.postMessage({ type: "run", id, source, stdin, library }, "*"); });
</script>`;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (pathname === "/" || pathname === "/index.html") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(HOST_PAGE); return; }
  if (pathname === "/csharp-lab/__probe") { probeHits++; res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }); res.end("reached"); return; }
  if (!pathname.startsWith("/csharp-lab/")) { res.writeHead(404); res.end(); return; }
  const rel = pathname.slice("/csharp-lab/".length) || "index.html";
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const headers = { "Content-Type": TYPES[path.extname(file)] || (path.extname(file) === ".txt" ? "text/plain; charset=utf-8" : "application/octet-stream"), "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" };
  const st = fs.statSync(file);
  headers.ETag = '"' + st.size.toString(16) + "-" + Math.floor(st.mtimeMs).toString(16) + '"';
  if (req.headers["if-none-match"] === headers.ETag) { res.writeHead(304, headers); res.end(); return; }
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

// ── 2. start: page → lab iframe ready → first program done (the runtime starts on the first run), cold then warm ──
const HELLO = 'class P { static void Main() { Console.WriteLine("ok"); } }';
async function firstRun() {
  servedBytes = 0;
  const t0 = Date.now();
  await page.goto(base);
  await page.evaluate(() => window.labReady);
  const labReadyMs = Date.now() - t0;
  const r = await page.evaluate(s => window.labRun(s, "", ""), HELLO);
  expect(r.status === "success" && r.stdout === "ok\n", "first run: " + JSON.stringify(r).slice(0, 300));
  return { labReadyMs, firstResultMs: Date.now() - t0, transferredBytes: servedBytes };
}
const cold = await firstRun();
const warm = await firstRun();
// The point of the parent-side fetch: a second visit revalidates (304s) instead of downloading the runtime again.
expect(warm.transferredBytes < 2 * 1024 * 1024, "warm visit must not re-download the runtime: transferred " + mb(warm.transferredBytes));
expect((await page.evaluate(() => window.labOrigins)).every(o => o === "null"), "the lab must answer from an OPAQUE origin (sandboxed)");

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
// «مبنى المعطيات» — the book's own classes (the proven Unit4.cs), passed IN the run message as the app does (it reads them from the API).
const BOOK = fs.readFileSync(new URL("../../api/src/data/course-libraries/899271d.cs", import.meta.url), "utf8");
PROGRAMS.push(
  { name: "endless loop → timeout, worker replaced", stdin: "", source: "class P { static void Main() { while (true) { } } }",
    check: r => r.status === "timeout" },
  { name: "after a timeout the next program runs (fresh worker)", stdin: "", source: HELLO,
    check: r => r.status === "success" && r.stdout === "ok\n" },
  { name: "print loop → output-limit (no memory blow-up)", stdin: "", source: 'class P { static void Main() { while (true) Console.Write("x"); } }',
    check: r => r.status === "output-limit" },
  // A recursion without end overflows the WebAssembly stack: the .NET runtime ENDS ITSELF («Program terminated with exit(1)»). The
  // teacher must get a runtime error naming the cause, and the lab must recover: the next program runs on a fresh worker.
  { name: "recursion without end → runtime-error (stack overflow)", stdin: "", source: "class P { static int F(int n) { return F(n + 1) + 1; } static void Main() { Console.WriteLine(F(0)); } }",
    check: r => r.status === "runtime-error" && /stack overflow/i.test(r.stderr) },
  { name: "after the runtime ended itself the next program runs (fresh worker)", stdin: "", source: HELLO,
    check: r => r.status === "success" && r.stdout === "ok\n" },
  // No request leaves the lab (docs/enterprise-csharp-visual-lab-plan.md §9) — not even one the program starts and never awaits (the
  // one path a synchronous Main has). The URL is the lab's own server, and the server counts what arrives. In Chrome the sandbox and
  // the frame's policy alone let it out (CI, PR #699 head b8c05bd4: 1 request); the worker's seal (worker.js) stops it.
  { name: "no network: a request started by the program never leaves the worker", stdin: "PROBE_URL\n", source: "class P { static void Main() { string url = Console.ReadLine(); try { _ = new HttpClient().GetStringAsync(url); Console.WriteLine(\"started\"); } catch (Exception e) { Console.WriteLine(\"blocked: \" + e.GetType().Name); } } }",
    check: r => r.status === "success" || r.status === "runtime-error" },
  { name: "the lab keeps working after the network attempt", stdin: "", source: HELLO,
    check: r => r.status === "success" && r.stdout === "ok\n" },
  { name: "book Stack<T> (Push / Pop / Top / IsEmpty, ToString)", courseId: "899271d", stdin: "",
    source: "static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    for (int i = 1; i <= 3; i++) s.Push(i);\n    Console.WriteLine(s);\n    Console.WriteLine(s.Pop() + \" \" + s.Top() + \" \" + s.IsEmpty());\n    Console.WriteLine(s);\n}",
    check: r => r.status === "success" && r.stdout === "[3,2,1]\n3 2 False\n[2,1]\n" },
  { name: "book Queue<T> (Insert / Remove / Head / IsEmpty, ToString)", courseId: "899271d", stdin: "",
    source: "static void Main()\n{\n    Queue<string> q = new Queue<string>();\n    q.Insert(\"a\"); q.Insert(\"b\"); q.Insert(\"c\");\n    Console.WriteLine(q);\n    Console.WriteLine(q.Remove() + q.Head() + q.IsEmpty());\n}",
    check: r => r.status === "success" && r.stdout === "[a,b,c]\nabFalse\n" },
  { name: "book Node<T> chain (GetValue / GetNext / HasNext)", courseId: "899271d", stdin: "",
    source: "static void Main()\n{\n    Node<int> first = new Node<int>(1, new Node<int>(2, new Node<int>(3)));\n    Node<int> pos = first; int sum = 0;\n    while (pos != null) { sum += pos.GetValue(); pos = pos.GetNext(); }\n    Console.WriteLine(sum + \" \" + first.HasNext() + \" \" + first.GetNext().GetNext().HasNext());\n}",
    check: r => r.status === "success" && r.stdout === "6 True False\n" },
  { name: "book BinNode<T> tree (in-order, recursion)", courseId: "899271d", stdin: "",
    source: "static void InOrder(BinNode<int> t)\n{\n    if (t == null) return;\n    InOrder(t.GetLeft()); Console.Write(t.GetValue() + \" \"); InOrder(t.GetRight());\n}\nstatic void Main()\n{\n    BinNode<int> t = new BinNode<int>(new BinNode<int>(1), 2, new BinNode<int>(new BinNode<int>(3), 4, null));\n    InOrder(t); Console.WriteLine(t.HasLeft() + \" \" + t.GetRight().HasRight());\n}",
    check: r => r.status === "success" && r.stdout === "1 2 3 4 True False\n" },
  { name: "writer's own Stack<T> replaces the book's (no duplicate)", courseId: "899271d", stdin: "",
    source: "public class Stack<T> { private T[] a = new T[10]; private int n; public void Push(T x) { a[n++] = x; } public T Pop() { return a[--n]; } }\nclass P { static void Main() { var s = new Stack<int>(); s.Push(7); Console.WriteLine(s.Pop()); var q = new Queue<int>(); q.Insert(5); Console.WriteLine(q.Head()); } }",
    check: r => r.status === "success" && r.stdout === "7\n5\n" },
  { name: "book compile error keeps the writer's line (library after)", courseId: "899271d", stdin: "",
    source: "static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    s.Peek();\n}",
    check: r => r.status === "compile-error" && /Program\.cs\(4,\d+\): error CS1061/.test(r.stderr) },
);
const results = [];
for (const p of PROGRAMS) {
  const t0 = Date.now();
  let r;
  try { r = await page.evaluate(([s, i, l]) => window.labRun(s, i, l), [p.source, p.stdin.replace("PROBE_URL", base + "csharp-lab/__probe"), p.courseId === "899271d" ? BOOK : ""]); }
  catch (e) { r = { status: "threw", stdout: "", stderr: String(e), compileMs: 0, runMs: 0 }; }
  const wallMs = Date.now() - t0;
  const ok = p.check(r);
  expect(ok, "program «" + p.name + "»: " + JSON.stringify({ status: r.status, stdout: r.stdout, stderr: String(r.stderr).slice(0, 300) }));
  results.push({ name: p.name, ok, status: r.status, compileMs: r.compileMs, runMs: r.runMs, wallMs });
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
  "## Teacher C# lab spike — in-browser Roslyn on .NET WebAssembly",
  "",
  "| Measure | Value |", "|---|---|",
  "| Files | " + files.length + " |",
  "| Download, raw | " + mb(rawBytes) + " |",
  "| Download, Brotli | " + mb(brBytes) + " |",
  "| Cold: page → lab ready / → first result | " + cold.labReadyMs + " ms / " + cold.firstResultMs + " ms, transferred " + mb(cold.transferredBytes) + " |",
  "| Warm (HTTP cache, revalidated): page → lab ready / → first result | " + warm.labReadyMs + " ms / " + warm.firstResultMs + " ms, transferred " + mb(warm.transferredBytes) + " |",
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
