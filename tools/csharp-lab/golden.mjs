// Teacher C# lab, phase V2 (docs/enterprise-csharp-visual-lab-plan.md §10) — the GOLDEN proof of the trace recorder (Tracer.cs):
// every traced program of «مبنى المعطيات» is recorded by the real C# compiler in the lab (real Chromium, the lab's own frame and
// worker, as the teacher's page uses it) and compared, step by step, with the steps the course recorded for it
// (scripts/ds-course/cs-lite.mjs — the recording every published «ds-trace» shows, itself proven equal in output to dotnet by
// scripts/ds-course/ds-course.proof.test.ts).
//   node tools/csharp-lab/golden.mjs <published wwwroot>      (env: PLAYWRIGHT_CORE_DIR, CHROMIUM_PATH, optional REPORT_DIR)
// Compared, per step: the line; each frame's name and variables (name and value); the objects (kind, value / items / fields, and
// which object each reference points at); the output so far; the error mark. Object ids are compared as IDENTITIES: both traces
// are renumbered by first appearance across the whole trace, so the same object must keep one number from step to step on both
// sides. The Arabic notes are NOT compared (the lab writes its own). Exit 1 when one program differs; the report lists them.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildCourse } from "../../scripts/build-ds-course.mjs";
import { execute } from "../../scripts/ds-course/dsl.mjs";

const root = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(root, "index.html"))) { console.error("usage: golden.mjs <published wwwroot>"); process.exit(2); }
const reportDir = path.resolve(process.env.REPORT_DIR || "csharp-lab-report");
fs.mkdirSync(reportDir, { recursive: true });
const BOOK = fs.readFileSync(new URL("../../api/src/data/course-libraries/899271d.cs", import.meta.url), "utf8");

// ── the course's traced programs and what the course recorded for them ──
const { raw } = buildCourse();
const programs = new Map();
for (const r of raw) if (r.block._prog) programs.set(r.block._prog.id, { prog: r.block._prog, where: r.block.id });
const only = process.env.GOLDEN_ONLY ? new Set(process.env.GOLDEN_ONLY.split(",")) : null;   // debugging: some programs (by block id)
if (!only && programs.size < 200) { console.error("expected the course's ~219 traced programs, found " + programs.size); process.exit(1); }
const cases = [...programs.values()].filter(x => !only || only.has(x.where)).map(({ prog, where }) => ({ prog, where, expected: execute(prog, 2000) }));

// ── canonical form: ids renumbered by first appearance across the whole trace ──
function canonical(steps) {
  const map = new Map();
  const idOf = id => { if (!map.has(id)) map.set(id, map.size + 1); return map.get(id); };
  return steps.map(st => {
    const byId = new Map((st.objs || []).map(o => [o.id, o]));
    const order = [];
    const seen = new Set();
    const visit = id => {
      if (id === null || id === undefined || seen.has(id)) return;
      seen.add(id); idOf(id); order.push(id);
      const o = byId.get(id);
      if (!o) return;
      if (o.k === "node") visit(o.next);
      if (o.k === "bin") { visit(o.l); visit(o.r); }
      if (o.k === "obj") for (const [, v] of o.fields) if (v.t === "ref") visit(v.id);
    };
    const val = v => (v.t === "ref" ? { t: "ref", id: idOf(v.id) } : v);
    const frames = (st.frames || []).map(f => ({ name: f.name, vars: f.vars.map(([n, v]) => { if (v.t === "ref") visit(v.id); return [n, val(v)]; }) }));
    for (const f of st.frames || []) for (const [, v] of f.vars) if (v.t === "ref") visit(v.id);
    for (const o of st.objs || []) visit(o.id);
    const objs = (st.objs || []).map(o => {
      const c = { ...o, id: idOf(o.id) };
      if (o.k === "node") c.next = o.next === null ? null : idOf(o.next);
      if (o.k === "bin") { c.l = o.l === null ? null : idOf(o.l); c.r = o.r === null ? null : idOf(o.r); }
      if (o.k === "obj") c.fields = o.fields.map(([n, v]) => [n, val(v)]);
      return c;
    }).sort((a, b) => a.id - b.id);
    return { line: st.line, frames, objs, out: st.out, error: !!st.error };
  });
}
function firstDifference(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = JSON.stringify(a[i]), y = JSON.stringify(b[i]);
    if (x !== y) return { step: i, course: a[i] ?? null, lab: b[i] ?? null };
  }
  return null;
}

// ── the lab, as the teacher's page uses it (sandboxed frame; the runtime's files through this page) ──
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
const HOST_PAGE = `<!doctype html><meta charset="utf-8"><title>host</title>
<iframe id="lab" sandbox="allow-scripts" src="/csharp-lab/index.html" hidden></iframe>
<script type="module">
const frame = document.getElementById("lab"); const pending = new Map(); let n = 0, ready;
window.labReady = new Promise(r => { ready = r; });
window.addEventListener("message", e => {
  if (e.source !== frame.contentWindow) return;
  const m = e.data || {};
  if (m.type === "lab-ready") ready();
  if (m.type === "fetch") {
    fetch("/csharp-lab/_framework/" + m.name).then(r => (r.ok ? r.arrayBuffer() : Promise.reject())).then(
      buffer => frame.contentWindow.postMessage({ type: "fetched", id: m.id, buffer }, "*", [buffer]),
      () => frame.contentWindow.postMessage({ type: "fetched", id: m.id, error: true }, "*"));
  }
  if (m.type === "result" && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
window.labRun = (source, stdin, library) => new Promise(res => { const id = "r" + (++n); pending.set(id, res); frame.contentWindow.postMessage({ type: "run", id, source, stdin, library }, "*"); });
window.labTrace = (source, stdin, library, options) => new Promise(res => { const id = "t" + (++n); pending.set(id, res); frame.contentWindow.postMessage({ type: "trace", id, source, stdin, library, options }, "*"); });
</script>`;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (pathname === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(HOST_PAGE); return; }
  const file = path.join(root, pathname.replace(/^\/csharp-lab\//, ""));
  if (!pathname.startsWith("/csharp-lab/") || !file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Access-Control-Allow-Origin": "*" });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const require = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || process.cwd(), "package.json"));
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", e => pageErrors.push(String(e)));
await page.goto("http://127.0.0.1:" + server.address().port + "/");
await page.evaluate(() => window.labReady);

const results = [];
const started = Date.now();
for (const c of cases) {
  const p = c.prog;
  const options = JSON.stringify({ shown: p.shownLines, entry: p.entry, quiet: p.quiet, maxSteps: 2000 });
  let r;
  // As the course's real-compiler proof compiles it (scripts/ds-course/prove-dotnet.mjs): the whole program inside one static class —
  // on its FIRST line, so every line number is unchanged.
  const source = "public static class Prog { " + p.source + "\n}";
  try { r = await page.evaluate(([s, i, l, o]) => Promise.race([window.labTrace(s, i, l, o), new Promise(res => setTimeout(() => res({ status: "no-answer", steps: [] }), 60000))]), [source, p.stdin, BOOK, options]); }
  catch (e) { r = { status: "threw", stderr: String(e), steps: [] }; }
  const course = canonical(c.expected.steps);
  const lab = canonical(r.steps || []);
  const diff = firstDifference(course, lab);
  const statusOk = c.expected.error ? r.status === "runtime-error" : r.status === "success";
  const ok = !diff && statusOk;
  results.push({ id: p.id, where: c.where, ok, status: r.status, courseSteps: course.length, labSteps: lab.length, diff, stderr: ok ? undefined : String(r.stderr || "").slice(0, 400) });
  if (!ok) console.log("✗ " + c.where + " (" + p.id + "): " + r.status + (diff ? " — first difference at step " + diff.step : ""));
  if (!ok && only) console.log(JSON.stringify({ source: p.source, shown: p.shownLines, course: diff?.course, lab: diff?.lab, courseSteps: course.slice(0, 3), labSteps: lab.slice(0, 3) }, null, 1));
}

// ── beyond the course: the recorder must never change what a program does, and must keep its own limits ──
// Each program is traced AND run: the traced output must equal the plain run's output (the recorder adds nothing to stdout).
const BEYOND = [
  { name: "foreach, List<T>, LINQ, string interpolation", stdin: "",
    source: "static void Main()\n{\n    var list = new List<int> { 4, 1, 3 };\n    int sum = 0;\n    foreach (var x in list) sum += x;\n    Console.WriteLine($\"{sum} {list.Where(v => v > 1).Count()} {string.Join(\",\", list.OrderBy(v => v))}\");\n}",
    check: (t, steps) => t.status === "success" && steps.some(s => s.frames[0].vars.some(([n, v]) => n === "sum" && v.s === "8")) },
  { name: "switch, a lambda, a local function, a ternary", stdin: "",
    source: "static void Main()\n{\n    int k = 2;\n    Func<int, int> twice = v => v * 2;\n    int Sq(int v) { return v * v; }\n    switch (k)\n    {\n        case 1: Console.WriteLine(\"one\"); break;\n        case 2: Console.WriteLine(twice(k) + Sq(k)); break;\n        default: Console.WriteLine(\"other\"); break;\n    }\n    Console.WriteLine(k > 1 ? \"big\" : \"small\");\n}",
    check: (t) => t.status === "success" && t.stdout === "8\nbig\n" },
  { name: "a class with a property and ToString inside the book's Queue<T> (an item shows by its ToString)", stdin: "", library: true,
    source: "public class Student\n{\n    public string Name { get; set; }\n    public int Grade;\n    public Student(string n, int g) { Name = n; Grade = g; }\n    public override string ToString() { return Name + \" (\" + Grade + \")\"; }\n}\npublic class Program\n{\n    public static void Main()\n    {\n        Queue<Student> q = new Queue<Student>();\n        q.Insert(new Student(\"Ali\", 92));\n        q.Insert(new Student(\"Sara\", 88));\n        Console.WriteLine(q.Remove());\n    }\n}",
    check: (t, steps) => t.status === "success" && t.stdout === "Ali (92)\n" && steps.some(s => s.objs.some(o => o.k === "queue" && o.items.join("|") === "Ali (92)|Sara (88)")) },
  { name: "a writer's object with fields (Name from its auto-property)", stdin: "",
    source: "public class P\n{\n    public string Name { get; set; } = \"x\";\n    public int Age = 3;\n}\npublic class Program\n{\n    public static void Main()\n    {\n        P p = new P();\n        p.Age = 4;\n        Console.WriteLine(p.Age);\n    }\n}",
    check: (t, steps) => t.status === "success" && steps.some(s => s.objs.some(o => o.k === "obj" && o.type === "P" && JSON.stringify(o.fields) === JSON.stringify([["Name", { t: "v", s: "\"x\"" }], ["Age", { t: "v", s: "4" }]]))) },
  { name: "a ref parameter, an out parameter, a struct, an expression-bodied method", stdin: "",
    source: "struct Pt { public int X; }\nclass Program\n{\n    static void Inc(ref int v) { v++; }\n    static bool Half(int v, out int h) { h = v / 2; return v % 2 == 0; }\n    static int Sq(int v) => v * v;\n    static void Main()\n    {\n        int a = 5;\n        Inc(ref a);\n        Half(a, out int h);\n        Pt p = new Pt { X = Sq(h) };\n        Console.WriteLine(a + \" \" + h + \" \" + p.X);\n    }\n}",
    check: (t) => t.status === "success" && t.stdout === "6 3 9\n" },
  { name: "input with Console.ReadLine while traced", stdin: "7\n",
    source: "static void Main()\n{\n    int n = int.Parse(Console.ReadLine());\n    Console.WriteLine(n * n);\n}",
    check: (t, steps) => t.status === "success" && t.stdout === "49\n" && steps.some(s => s.frames[0].vars.some(([v, x]) => v === "n" && x.s === "7")) },
  { name: "the step limit: a loop without end stops as «step-limit» with exactly the limit's steps", stdin: "", options: { maxSteps: 50 },
    source: "static void Main()\n{\n    long i = 0;\n    while (true) i++;\n}",
    check: (t, steps) => t.status === "step-limit" && steps.length === 50 },
  { name: "a run-time error: a last step on the failing line, marked as an error", stdin: "",
    source: "static void Main()\n{\n    int z = 0;\n    int r = 10 / z;\n}",
    check: (t, steps) => t.status === "runtime-error" && steps.at(-1).error === true && steps.at(-1).line === 4 && /DivideByZero/.test(t.stderr) },
  { name: "a compile error: reported on the writer's line, nothing recorded", stdin: "",
    source: "static void Main()\n{\n    int x = 1\n}",
    check: (t, steps) => t.status === "compile-error" && /Program\.cs\(3,\d+\): error CS1002/.test(t.stderr) && steps.length === 0 },
];
const beyond = [];
for (const b of BEYOND) {
  const lib = b.library ? BOOK : "";
  const traced = await page.evaluate(([s, i, l, o]) => window.labTrace(s, i, l, o), [b.source, b.stdin, lib, JSON.stringify(b.options || {})]);
  const plain = await page.evaluate(([s, i, l]) => window.labRun(s, i, l), [b.source, b.stdin, lib]);
  const steps = traced.steps || [];
  const sameOutput = traced.status === "compile-error" || traced.status === "step-limit" || traced.stdout === plain.stdout;
  const ok = !!b.check(traced, steps) && sameOutput;
  beyond.push({ name: b.name, ok, status: traced.status, steps: steps.length, sameOutput });
  if (!ok) console.log("✗ beyond: " + b.name + " — " + JSON.stringify({ status: traced.status, stdout: traced.stdout, plain: plain.stdout, stderr: String(traced.stderr).slice(0, 300) }));
}

await browser.close();
server.close();

const passed = results.filter(r => r.ok).length;
const beyondOk = beyond.every(b => b.ok);
const report = { programs: results.length, passed, failed: results.length - passed, seconds: Math.round((Date.now() - started) / 1000), pageErrors, beyond, results };
fs.writeFileSync(path.join(reportDir, "golden.json"), JSON.stringify(report, null, 2));
const md = "## Trace recorder — golden proof\n\n" + passed + " / " + results.length + " traced programs of «مبنى المعطيات» recorded step for step as the course recorded them"
  + " (" + report.seconds + " s)." + (pageErrors.length ? "\n\nPage errors: " + pageErrors.join(" | ") : "") + "\n\n"
  + "| Beyond the course | OK | Status | Steps |\n|---|---|---|---|\n" + beyond.map(b => "| " + b.name + " | " + (b.ok ? "✅" : "❌") + " | " + b.status + " | " + b.steps + " |").join("\n") + "\n\n"
  + (passed === results.length && beyondOk && !pageErrors.length ? "**GOLDEN PASS**" : "### Differences\n" + results.filter(r => !r.ok).map(r => "- " + r.where + " (" + r.id + "): " + r.status + (r.diff ? ", step " + r.diff.step : "")).join("\n") + beyond.filter(b => !b.ok).map(b => "\n- beyond: " + b.name).join(""));
fs.writeFileSync(path.join(reportDir, "golden.md"), md + "\n");
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
console.log(md);
process.exit(passed === results.length && beyondOk && !pageErrors.length ? 0 : 1);
