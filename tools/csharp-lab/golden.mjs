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
  // Visual lab V4 part 2 — «اكشف الداخل»: the book's Stack<T> recorded as the object it is (its Head) and its Node<T> chain
  { name: "«اكشف الداخل»: the book's Stack<T> as an object whose Head points at the Node<T> chain 3 → 2 → 1", stdin: "", library: true, options: { inside: true },
    source: "static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    for (int i = 1; i <= 3; i++) s.Push(i);\n    Console.WriteLine(s);\n}",
    check: (t, steps) => {
      const last = steps.at(-1);
      const st = last && last.objs.find(o => o.k === "obj" && o.type === "Stack");
      const head = st && st.fields.find(([n]) => n === "Head");
      const byId = new Map((last?.objs || []).map(o => [o.id, o]));
      const chain = [];
      for (let id = head && head[1].id; id != null && chain.length < 10; id = byId.get(id)?.next) chain.push(byId.get(id)?.v);
      return t.status === "success" && t.stdout === "[3,2,1]\n" && !last.objs.some(o => o.k === "stack") && chain.join(",") === "3,2,1";
    } },
  { name: "«اكشف الداخل»: the book's Queue<T> as an object whose First → 1 → 2 and Last → 2", stdin: "", library: true, options: { inside: true },
    source: "static void Main()\n{\n    Queue<int> q = new Queue<int>();\n    q.Insert(1); q.Insert(2);\n    Console.WriteLine(q);\n}",
    check: (t, steps) => {
      const last = steps.at(-1);
      const qu = last && last.objs.find(o => o.k === "obj" && o.type === "Queue");
      const field = name => qu && qu.fields.find(([n]) => n === name)?.[1];
      const byId = new Map((last?.objs || []).map(o => [o.id, o]));
      const chain = [];
      for (let id = field("First")?.id; id != null && chain.length < 10; id = byId.get(id)?.next) chain.push(byId.get(id)?.v);
      return t.status === "success" && t.stdout === "[1,2]\n" && !last.objs.some(o => o.k === "queue") && chain.join(",") === "1,2"
        && byId.get(field("Last")?.id)?.v === "2";
    } },
  // Viz.Show / Viz.Pause: the visual run's own marks (a «تشغيل» of the same program does not know Viz: compile error, by design)
  { name: "Viz.Show gives the step its title, Viz.Pause marks a stop; «تشغيل» does not know Viz", stdin: "", library: true, plainCompileError: true,
    source: "static void Main()\n{\n    Queue<int> q = new Queue<int>();\n    q.Insert(1); q.Insert(2);\n    Viz.Show(\"بعد الإدخال\");\n    q.Remove();\n    Viz.Pause(\"قبل الطباعة\");\n    Console.WriteLine(q);\n}",
    check: (t, steps) => t.status === "success" && t.stdout === "[2]\n"
      && steps.some(s => s.line === 5 && s.note === "بعد الإدخال" && !s.pause)
      && steps.some(s => s.line === 7 && s.note === "قبل الطباعة" && s.pause === true)
      && steps.filter(s => s.pause).length === 1 },
  { name: "a program with its own class Viz keeps it (no duplicate, no marks)", stdin: "",
    source: "class Viz { public static void Show(string s) { Console.WriteLine(\"mine \" + s); } }\nclass Program { static void Main() { Viz.Show(\"x\"); } }",
    check: (t, steps) => t.status === "success" && t.stdout === "mine x\n" && !steps.some(s => s.pause || s.note === "x") },
  { name: "the step limit: a loop without end stops as «step-limit» with exactly the limit's steps", stdin: "", options: { maxSteps: 50 },
    source: "static void Main()\n{\n    long i = 0;\n    while (true) i++;\n}",
    check: (t, steps) => t.status === "step-limit" && steps.length === 50 },
  { name: "a run-time error: a last step on the failing line, marked as an error", stdin: "",
    source: "static void Main()\n{\n    int z = 0;\n    int r = 10 / z;\n}",
    check: (t, steps) => t.status === "runtime-error" && steps.at(-1).error === true && steps.at(-1).line === 4 && /DivideByZero/.test(t.stderr) },
  // Visual lab V5 — rich types (option `rich`, the teacher's visual run only; every case above, and the 219, are recorded without it)
  { name: "V5 Queue<Student>: each item keeps its text and refers to the Student object, recorded with its fields", stdin: "", library: true, options: { rich: true },
    source: "class Student { public string Name; public int Grade; public Student(string n, int g) { Name = n; Grade = g; } }\nclass Program\n{\n    static void Main()\n    {\n        Queue<Student> q = new Queue<Student>();\n        q.Insert(new Student(\"Ali\", 92));\n        q.Insert(new Student(\"Sara\", 88));\n        Console.WriteLine(q.Head().Name);\n    }\n}",
    check: (t, steps) => {
      const last = steps.at(-1), byId = new Map(last.objs.map(o => [o.id, o]));
      const q = last.objs.find(o => o.k === "queue");
      const people = (q?.refs || []).map(id => byId.get(id));
      return t.status === "success" && t.stdout === "Ali\n" && q.items.join("|") === "(Ali, 92)|(Sara, 88)"
        && people.length === 2 && people.every(o => o?.k === "obj" && o.type === "Student")
        && JSON.stringify(people[1].fields) === JSON.stringify([["Name", { t: "v", s: "\"Sara\"" }], ["Grade", { t: "v", s: "88" }]]);
    } },
  { name: "V5 Node<Student>: the cell's value refers to the Student", stdin: "", library: true, options: { rich: true },
    source: "class Student { public string Name; public Student(string n) { Name = n; } public override string ToString() => Name; }\nclass Program\n{\n    static void Main()\n    {\n        Node<Student> n = new Node<Student>(new Student(\"Omar\"));\n        Console.WriteLine(n.GetValue());\n    }\n}",
    check: (t, steps) => {
      const last = steps.at(-1), node = last.objs.find(o => o.k === "node"), byId = new Map(last.objs.map(o => [o.id, o]));
      return t.status === "success" && t.stdout === "Omar\n" && node?.v === "Omar" && byId.get(node.ref)?.type === "Student";
    } },
  { name: "V5 Stack<Queue<int>>: each item of the stack refers to its queue, drawn with its own items", stdin: "", library: true, options: { rich: true },
    source: "static void Main()\n{\n    Stack<Queue<int>> s = new Stack<Queue<int>>();\n    Queue<int> a = new Queue<int>(); a.Insert(1); a.Insert(2);\n    Queue<int> b = new Queue<int>(); b.Insert(3);\n    s.Push(a); s.Push(b);\n    Console.WriteLine(s.Top());\n}",
    check: (t, steps) => {
      const last = steps.at(-1), byId = new Map(last.objs.map(o => [o.id, o]));
      const st = last.objs.find(o => o.k === "stack");
      const inner = (st?.refs || []).map(id => byId.get(id));
      return t.status === "success" && t.stdout === "[3]\n" && st.items.join("|") === "[3]|[1,2]"
        && inner.map(o => o?.k + ":" + o?.items.join(",")).join("|") === "queue:3|queue:1,2";
    } },
  { name: "V5 an array is an object a variable refers to; a[i] gives the pointer pair; its cells change in place", stdin: "", options: { rich: true },
    source: "static void Main()\n{\n    int[] a = { 5, 3, 8 };\n    for (int i = 0; i < a.Length; i++) a[i] = a[i] * 2;\n    Console.WriteLine(a[2]);\n}",
    check: (t, steps) => {
      const last = steps.at(-1), arr = last.objs.find(o => o.k === "array");
      const aVar = last.frames[0].vars.find(([n]) => n === "a")?.[1];
      return t.status === "success" && t.stdout === "16\n" && arr?.type === "int[]" && arr.items.join(",") === "10,6,16"
        && aVar?.t === "ref" && aVar.id === arr.id && JSON.stringify(t.pointers) === JSON.stringify([["a", "i"]])
        && steps.some(s => s.objs.find(o => o.k === "array")?.items.join(",") === "10,3,8");
    } },
  { name: "V5 C#'s collections: List<string>, Dictionary<string,int>, HashSet<int>, Stack<int>, Queue<int>", stdin: "", options: { rich: true },
    source: "static void Main()\n{\n    List<string> names = new List<string> { \"a\", \"b\" };\n    Dictionary<string, int> ages = new Dictionary<string, int>();\n    ages[\"a\"] = 7;\n    HashSet<int> seen = new HashSet<int> { 4 };\n    Stack<int> st = new Stack<int>(); st.Push(1); st.Push(2);\n    Queue<int> qu = new Queue<int>(); qu.Enqueue(9);\n    Console.WriteLine(names.Count + ages[\"a\"]);\n}",
    check: (t, steps) => {
      const o = steps.at(-1).objs, of = k => o.filter(x => x.k === k);
      return t.status === "success" && t.stdout === "9\n"
        && of("array").some(x => x.type === "List<string>" && x.items.join(",") === "a,b")
        && of("map").some(x => x.type === "Dictionary<string, int>" && x.keys.join() === "a" && x.items.join() === "7")
        && of("set").some(x => x.type === "HashSet<int>" && x.items.join() === "4")
        && of("stack").some(x => x.items.join(",") === "2,1") && of("queue").some(x => x.items.join() === "9");
    } },
  { name: "V5 without `rich` the same Queue<Student> is recorded as before (no refs, no Student objects)", stdin: "", library: true,
    source: "class Student { public string Name; public int Grade; public Student(string n, int g) { Name = n; Grade = g; } }\nclass Program\n{\n    static void Main()\n    {\n        Queue<Student> q = new Queue<Student>();\n        q.Insert(new Student(\"Ali\", 92));\n        int[] a = { 1 };\n        Console.WriteLine(a[0]);\n    }\n}",
    check: (t, steps) => {
      const last = steps.at(-1);
      return t.status === "success" && !("pointers" in t) && last.objs.every(o => !("refs" in o) && o.k !== "array" && o.type !== "Student")
        && steps.every(s => !("ret" in s) && s.frames.every(f => !("call" in f)))   // V8: no call ids, no returned values
        && last.frames[0].vars.some(([n, v]) => n === "a" && v.t === "arr");
    } },
  // Visual lab V8 — the call tree's data (rich only): a call id per frame, the returned value on the returning step
  { name: "V8 Fib(4): every call has its own id, its parent is the frame below it, and each return carries its value", stdin: "", options: { rich: true },
    source: "static int Fib(int n)\n{\n    if (n < 2) return n;\n    return Fib(n - 1) + Fib(n - 2);\n}\nstatic void Main()\n{\n    Console.WriteLine(Fib(4));\n}",
    check: (t, steps) => {
      const calls = new Map();                                    // call → { name, parent, n }
      for (const s of steps) s.frames.forEach((f, d) => { if (!calls.has(f.call)) calls.set(f.call, { name: f.name, parent: d ? s.frames[d - 1].call : null, n: f.vars.find(([k]) => k === "n")?.[1].s }); });
      const fibs = [...calls.values()].filter(c => c.name === "Fib");
      const rets = steps.filter(s => "ret" in s).map(s => s.frames.at(-1).call + "=" + s.ret);
      const root = [...calls.entries()].find(([, c]) => c.name === "Fib" && calls.get(c.parent)?.name === "Main");
      return t.status === "success" && t.stdout === "3\n" && fibs.length === 9 && fibs.map(c => c.n).join(",") === "4,3,2,1,0,1,2,1,0"
        && rets.length === 9 && rets.at(-1) === root[0] + "=3" && steps.every(s => s.frames.every(f => Number.isInteger(f.call)));
    } },
  // Visual lab V9 — «أسس علم الحاسوب» (rich only): expression values, variable types, digits, a 2D array, string indexing
  { name: "V9 digits: n % 10 and n / 10 noted with their values each turn; the program names n as taken apart in base 10; types", stdin: "", options: { rich: true },
    source: "static void Main()\n{\n    int n = 1234, sum = 0;\n    while (n > 0)\n    {\n        sum += n % 10;\n        n = n / 10;\n    }\n    Console.WriteLine(sum);\n}",
    check: (t, steps) => {
      const ev = steps.flatMap(s => s.evals || []).map(([e, v]) => e + "=" + v);
      const types = steps.find(s => s.frames[0].types)?.frames[0].types;
      return t.status === "success" && t.stdout === "10\n" && JSON.stringify(t.digits) === JSON.stringify([["n", 10]])
        && ev.includes("n % 10=4") && ev.includes("n / 10=123") && ev.includes("n % 10=1") && ev.includes("n > 0=true") && ev.includes("n > 0=false")
        && JSON.stringify(types) === JSON.stringify(["int", "int"]);
    } },
  { name: "V9 booleans: each part of && / || / ! with its value; short-circuit unchanged (the right side is not run)", stdin: "", options: { rich: true },
    source: "static bool Side() { Console.WriteLine(\"side\"); return true; }\nstatic void Main()\n{\n    int a = 3, b = 7;\n    bool ok = a > 0 && b < 5;\n    bool skip = a < 0 && Side();\n    bool not = !(a == b) || Side();\n    Console.WriteLine(ok + \" \" + skip + \" \" + not);\n}",
    check: (t, steps) => {
      const on = line => (steps.find(s => s.line === line && s.evals)?.evals || []).map(([e, v]) => e + "=" + v).join(" | ");
      return t.status === "success" && t.stdout === "False False True\n"
        && on(5) === "a > 0=true | b < 5=false | a > 0 && b < 5=false"
        && on(6) === "a < 0=false | a < 0 && Side()=false"
        && on(7) === "a == b=false | !(a == b)=true | !(a == b) || Side()=true";
    } },
  { name: "V9 a two-dimensional array is a grid of rows, and a[i, j] gives the pointer triple", stdin: "", options: { rich: true },
    source: "static void Main()\n{\n    int[,] g = new int[2, 3];\n    for (int i = 0; i < 2; i++)\n        for (int j = 0; j < 3; j++)\n            g[i, j] = i * 3 + j;\n    Console.WriteLine(g[1, 2]);\n}",
    check: (t, steps) => {
      const grid = steps.at(-1).objs.find(o => o.k === "grid");
      return t.status === "success" && t.stdout === "5\n" && grid?.type === "int[,]" && JSON.stringify(grid.rows) === JSON.stringify([["0", "1", "2"], ["3", "4", "5"]])
        && JSON.stringify(t.pointers) === JSON.stringify([["g", "i", "j"]]);
    } },
  { name: "V9 a string indexed by s[i] gives the pointer pair; its type is string", stdin: "", options: { rich: true },
    source: "static void Main()\n{\n    string s = \"abc\";\n    for (int i = 0; i < s.Length; i++) Console.Write(s[i]);\n}",
    check: (t, steps) => t.status === "success" && t.stdout === "abc" && JSON.stringify(t.pointers) === JSON.stringify([["s", "i"]])
      && steps.some(s => s.frames[0].types?.join(",") === "string,int") },
  { name: "V9 without rich: no evals, no types, no digits, and a 2D array stays a value", stdin: "",
    source: "static void Main()\n{\n    int n = 12;\n    int[,] g = new int[1, 2];\n    if (n % 10 > 1) g[0, 1] = n / 10;\n    Console.WriteLine(g[0, 1]);\n}",
    check: (t, steps) => t.status === "success" && t.stdout === "1\n" && !("digits" in t) && !("pointers" in t)
      && steps.every(s => !("evals" in s) && s.frames.every(f => !("types" in f)) && s.objs.every(o => o.k !== "grid")) },
  // Visual lab V6 — the trimmed lab: a program that needs a library the download leaves out is refused before it is recorded (LAB0001)
  { name: "V6 a program needing a left-out library (System.Xml) is refused before it is recorded (LAB0001)", stdin: "", options: { rich: true },
    source: "using System.Xml;\nclass P { static void Main() { Console.WriteLine(new XmlDocument().Name); } }",
    check: (t, steps) => t.status === "compile-error" && /LAB0001: 'System\.Xml\.XmlDocument'/.test(t.stderr) && steps.length === 0 },
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
  const sameOutput = b.plainCompileError ? plain.status === "compile-error" && /Viz/.test(plain.stderr)
    : traced.status === "compile-error" || traced.status === "step-limit" || traced.stdout === plain.stdout;
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
