// DS-A2 — the AUTHORING helpers of the course «مبنى المعطيات» (docs/enterprise-data-structures-course.md).
//
// A unit is written once in scripts/ds-course/uNN.mjs with these helpers; scripts/build-ds-course.mjs turns it into the site's
// content files. Nothing here runs in the browser.
//
// Inline text: `…` = a left-to-right run (code, names, values) · **…** = bold · __…__ = a term. Write EVERY piece of code or
// punctuation-bearing value in `…`, also in exercise prompts, options, explanations and titles (see `iso` below).
// Provenance: what the book «مقدّمة في مباني المعلومات بلغة C#» says (its definitions, class tables, code, examples and exercises,
// shortened where the owner asked for a shorter text) is origin "book"; everything the author ADDS — the traces, the lab, the
// drawings, the exercises, «نحلّ معًا», the owner's own stack / queue question sheets, clarifications — is "teacher-enrichment".
// The X* helpers are the enrichment forms of the text helpers.
//
// Programs: TRACE records a C# program step by step with the course interpreter (cs-lite.mjs); `prove` on an exercise runs a
// program and compares its output. Every such program is ALSO compiled and run by the real C# compiler (prove-dotnet.mjs →
// proofs.json), and ds-course.proof.test.ts requires both outputs to be equal.
import { createHash } from "node:crypto";
import { run } from "./cs-lite.mjs";
import * as A from "../automata-course/dsl.mjs";

const { spans, plain, P, VIS, ADDED, TRUE_FALSE } = A;
export { spans, plain, P, VIS, ADDED, TRUE_FALSE };

/**
 * Code inside a PLAIN string (an exercise prompt, an option, an explanation, a table cell, a title): the reader shows such strings
 * as right-to-left text, where `st.Push(x);` would be reordered. A `…` run is therefore kept left-to-right with the Unicode
 * isolates U+2066 … U+2069 (invisible; the same idea as the U+200E marks in the summary booklet). Rich text (P, callouts, list
 * items) needs none: there a `…` run is a left-to-right span.
 */
export const LRI = "\u2066", PDI = "\u2069";
export const iso = s => (typeof s === "string" ? s.replace(/`([^`]+)`/g, LRI + "$1" + PDI) : s);
/** The text without its isolates (for comparing with a program's output). */
export const bare = s => s.replaceAll(LRI, "").replaceAll(PDI, "");
const isoExtra = extra => ({ ...extra, ...(extra.hints ? { hints: extra.hints.map(iso) } : {}) });
// the shared helpers, with code runs kept left-to-right wherever the content model holds a plain string
export const H = (text, level) => A.H(iso(text), level);
const callout = fn => (title, md) => (md === undefined ? fn(title) : fn(iso(title), md));
export const DEF = callout(A.DEF), NOTE = callout(A.NOTE), REM = callout(A.REM), TIP = callout(A.TIP), SUM = callout(A.SUM), CLAR = callout(A.CLAR);
export const LIST = (items, opts = {}) => A.LIST(items.map(it => (Array.isArray(it) ? [iso(it[0]), it[1]] : it)), { ...opts, ...(opts.title ? { title: iso(opts.title) } : {}) });
export const OL = (items, opts = {}) => LIST(items, { ...opts, variant: "ordered" });
export const TABLE = (headers, rows, opts = {}) => A.TABLE(headers.map(iso), rows.map(r => r.map(iso)), { ...opts, ...(opts.caption ? { caption: iso(opts.caption) } : {}) });
export const EX = ({ title, prompt, steps = [], result, explanation, mode }) => A.EX({ title: iso(title), prompt: iso(prompt), steps: steps.map(st => (typeof st === "string" ? iso(st) : { text: iso(st.text), note: iso(st.note) })), result: iso(result), explanation: iso(explanation), ...(mode ? { mode } : {}) });
export const GUIDED = ({ title, prompt, steps, result, explanation }) => A.GUIDED({ title: iso(title), prompt, steps, result, explanation: iso(explanation) });
export const MC = (prompt, options, explanation, extra = {}) => A.MC(iso(prompt), options.map(iso), iso(explanation), isoExtra(extra));
export const TF = (prompt, answer, explanation, extra = {}) => A.TF(iso(prompt), answer, iso(explanation), isoExtra(extra));
export const SHORT = (prompt, answer, explanation, extra = {}) => A.SHORT(iso(prompt), answer, iso(explanation), isoExtra(extra));
export const CLASSIFY = (prompt, groups, items, explanation, extra = {}) => A.CLASSIFY(iso(prompt), groups.map(iso), items.map(([t, g]) => [iso(t), g]), iso(explanation), isoExtra(extra));
export const MATCH = (prompt, pairs, explanation, extra = {}) => A.MATCH(iso(prompt), pairs.map(([l, r]) => [iso(l), iso(r)]), iso(explanation), isoExtra(extra));
export const ORDER = (prompt, inOrder, explanation, extra = {}) => A.ORDER(iso(prompt), inOrder.map(iso), iso(explanation), isoExtra(extra));
/** Word bank: the text may hold `code`; the [[answers]] and the distractors are words of the bank and stay as written. */
export const WORDS = (prompt, text, distractors, explanation, extra = {}) => A.WORDS(iso(prompt), iso(text), distractors, iso(explanation), isoExtra(extra));
export const PTABLE = (headers, rows, opts = {}) => A.PTABLE(headers.map(iso), rows.map(r => r.map(c => (typeof c === "string" ? iso(c) : c))), { ...opts, ...(opts.caption ? { caption: iso(opts.caption) } : {}) });

const enr = b => ({ ...b, origin: "teacher-enrichment" });
const x = fn => (...a) => ADDED(fn(...a));
// the same text helpers, for what the author adds
export const XP = x(P), XH = x(H), XDEF = x(DEF), XNOTE = x(NOTE), XREM = x(REM), XTIP = x(TIP), XSUM = x(SUM), XLIST = x(LIST), XOL = x(OL), XTABLE = x(TABLE), XEX = x(EX);

/** Removes the common indentation of a template literal and its first / last blank lines. */
export function dedent(text) {
  const lines = text.replace(/\t/g, "    ").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const pad = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  return lines.map(l => l.slice(pad).trimEnd()).join("\n");
}
/** A C# listing of the book. */
export const CS = code => ({ type: "code", language: "csharp", dir: "ltr", code: dedent(code), origin: "book" });
/** A C# listing the author adds. */
export const XCS = code => enr({ type: "code", language: "csharp", dir: "ltr", code: dedent(code) });
/** Plain left-to-right text (a printed output, a formula). */
export const OUT = text => ({ type: "code", language: "text", dir: "ltr", code: dedent(text), origin: "book" });
export const XOUT = text => enr({ type: "code", language: "text", dir: "ltr", code: dedent(text) });

/** A class table of the book: rows [signature, description] (+ the efficiency when given). */
export const API = (name, rows, opts = {}) => {
  const eff = rows.some(r => r.length > 2);
  return TABLE(eff ? ["العملية", "الوصف", "النجاعة"] : ["العملية", "الوصف"], rows.map(r => (eff ? [r[0], r[1], r[2] ?? ""] : [r[0], r[1]])), { caption: opts.caption ?? "واجهة الفئة `" + name.replaceAll("`", "") + "`", ltr: eff ? [0, 2] : [0] });
};

// ── programs ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * A program of the course: `code` is what the learner sees. When it has no Main (the book often prints one operation), `run`
 * is the hidden driver — the statements that build the given structure and call the operation. `lib` = hidden helper code the
 * shown code calls (operations or classes printed elsewhere on the page: CopyStack …), a string or a list of strings.
 */
export function program({ code, run: driver, lib, stdin, allowError, quiet }) {
  const shown = dedent(code);
  const hidden = driver ? dedent(driver) : null;
  const extra = lib ? [lib].flat().map(dedent).join("\n") : null;
  const source = shown + (extra ? "\n" + extra : "") + (hidden ? "\npublic static void __Run()\n{\n" + hidden + "\n}" : "");
  const id = createHash("sha256").update(JSON.stringify([shown, extra, hidden, stdin ?? ""])).digest("hex").slice(0, 16);
  return { id, code: shown, lib: extra, driver: hidden, stdin: stdin ?? "", source, shownLines: shown.split("\n").length, entry: hidden ? "__Run" : "Main", allowError: !!allowError, quiet: quiet ?? [] };
}
/** Runs a program with the course interpreter. */
export function execute(prog, maxSteps = 400) {
  return run(prog.source, { shown: prog.shownLines, entry: prog.entry, stdin: prog.stdin, maxSteps, allowError: prog.allowError, quiet: prog.quiet });
}
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** The compact step list the activity reads: frames / objects are written only when they changed. */
function compact(steps, out) {
  let f = null, h = null;
  return steps.map(s => {
    const o = { l: s.line, n: s.note, o: s.out.length };
    if (!out.startsWith(s.out)) throw new Error("a step's output is not a prefix of the final output");
    if (!sameJson(s.frames, f)) { o.f = s.frames; f = s.frames; }
    if (!sameJson(s.objs, h)) { o.h = s.objs; h = s.objs; }
    if (s.error) o.e = true;
    return o;
  });
}

/**
 * «تتبّع البرنامج على مبنى المعطيات» (simulation / ds-trace / v1) on a program. `given` says, in words, what the hidden driver
 * prepared (shown above the trace). `max` = the longest trace allowed (default 150 steps; keep examples short). `quiet` = names
 * of helper operations that run without steps of their own (CopyStack, IsOpenBracket …).
 */
export function TRACE({ title, code, run: driver, lib, stdin, given, description, max = 150, allowError, quiet }) {
  const prog = program({ code, run: driver, lib, stdin, allowError, quiet });
  const r = execute(prog, max);
  if (!r.steps.length) throw new Error("TRACE «" + title + "»: the program has no step in the shown code");
  return enr({
    type: "simulation", simulationType: "ds-trace", version: 1, title: iso(title ?? "تتبّع البرنامج خطوة بخطوة"),
    ...(description ? { description: iso(description) } : {}),
    capabilities: { fullscreen: true, reset: true, interactive: true },
    config: { code: prog.code, ...(given ? { given } : {}), ...(prog.stdin ? { stdin: prog.stdin } : {}), out: r.out, steps: compact(r.steps, r.out) },
    fallback: { text: "تتبّع تفاعلي لبرنامج C# خطوة بخطوة (" + r.steps.length + " خطوة)" + (r.out.trim() ? "؛ ناتج البرنامج: " + r.out.trim().replace(/\n/g, " ↵ ") : "") + "." },
    _prog: prog, _out: r.out, _error: r.error,
  });
}
/** The output of a program (for writing an answer key from the run itself — still proven against real C#). */
export const output = spec => execute(program(spec)).out;

/** «مختبر مبنى المعطيات» (simulation / ds-lab / v1). structure: "stack" | "queue" | "chain" | "bst" | "tree". */
export function LAB(structure, opts = {}) {
  const NAMES = { stack: "مختبر الراصّة", queue: "مختبر الدور", chain: "مختبر سلسلة الخلايا", bst: "مختبر شجرة البحث الثنائية", tree: "مختبر الشجرة الثنائية" };
  const tree = structure === "bst" || structure === "tree";
  return enr({
    type: "simulation", simulationType: "ds-lab", version: 1, title: iso(opts.title ?? NAMES[structure]),
    ...(opts.description ? { description: iso(opts.description) } : {}),
    capabilities: { fullscreen: true, reset: true, interactive: true },
    config: { structure, ...(opts.name ? { name: opts.name } : {}), ...(tree ? { tree: opts.tree ?? null } : { valueType: opts.type ?? "int", values: opts.values ?? [] }) },
    fallback: { text: opts.fallback ?? NAMES[structure] + ": نشاط تفاعلي تنفّذ فيه عمليات المبنى وترى الرسم يتغيّر." },
  });
}

/**
 * A drawing (interactive-diagram / ds-figure / v1). panels: { kind: "stack" | "queue", items, label? } (stack items from the head
 * down; queue items from the head) · { kind: "chain", items, pointers?: [[name, index]], hi?: [index], label? } ·
 * { kind: "tree", tree: [value, left, right], pointers?: [[name, "LR"]], hi?: ["L"], facts?: true, label? }.
 */
export function FIG(title, panels, opts = {}) {
  const said = p => (p.kind === "tree" ? "شجرة ثنائية" : p.kind === "chain" ? "سلسلة خلايا: " + p.items.join(" ← ") + " ← null" : (p.kind === "stack" ? "راصّة من الرأس إلى القاع: " : "دور من الرأس إلى الذيل: ") + (p.items.join("، ") || "فارغ")) + (p.label ? " (" + p.label + ")" : "");
  return enr({
    type: "interactive-diagram", interactionType: "ds-figure", version: 1, title: iso(title),
    ...(opts.description ? { description: iso(opts.description) } : {}),
    capabilities: { fullscreen: true },
    config: { panels: panels.map(p => (p.label ? { ...p, label: iso(p.label) } : p)) },
    fallback: { text: opts.fallback ?? "رسم: " + panels.map(said).join("؛ ") + "." },
  });
}

/**
 * Attaches a proof to an exercise: the program's real output must be `out` (the proof test runs it on the interpreter AND compares
 * with the real compiler's recorded output). For a multiple-choice question the correct option must contain `out` (or be
 * contained in it) unless `loose: true`; for a short answer the key must equal it.
 */
export const proved = (block, spec) => ({ ...block, _prove: { type: "output", prog: program(spec), out: spec.out, loose: !!spec.loose } });

/** The same, for «how many times does this statement run?»: the number of trace steps on the line whose text is `line`. */
export const provedCount = (block, spec, line, count) => ({ ...block, _prove: { type: "count", prog: program(spec), line, count } });

// ── hidden-driver snippets: the «given» structure of a question ───────────────────────────────────────────────────────
const csLit = (v, type) => (type === "char" ? "'" + v + "'" : type === "string" ? "\"" + v + "\"" : String(v));
/** A stack given from its HEAD down: stackOf("st", "int", [11, 3, 5]) → 11 is the head. */
export const stackOf = (name, type, topFirst) => [`Stack<${type}> ${name} = new Stack<${type}>();`, ...[...topFirst].reverse().map(v => `${name}.Push(${csLit(v, type)});`)].join("\n");
/** A queue given from its HEAD to its tail. */
export const queueOf = (name, type, headFirst) => [`Queue<${type}> ${name} = new Queue<${type}>();`, ...headFirst.map(v => `${name}.Insert(${csLit(v, type)});`)].join("\n");
/** A chain of cells given from its first cell. */
export const chainOf = (name, type, values) => `Node<${type}> ${name} = ${values.reduceRight((next, v) => `new Node<${type}>(${csLit(v, type)}${next ? ", " + next : ""})`, "") || "null"};`;
/** A binary tree of ints written [value, left, right] (a bare value is a leaf). */
export const treeOf = (name, tree) => {
  const e = t => (t === null || t === undefined ? "null" : !Array.isArray(t) ? `new BinNode<int>(${t})` : t[1] == null && t[2] == null ? `new BinNode<int>(${t[0]})` : `new BinNode<int>(${e(t[1])}, ${t[0]}, ${e(t[2])})`);
  return `BinNode<int> ${name} = ${e(tree)};`;
};

// ── DS-A3: questions by difficulty, solved ones and homework with a solution window ───────────────────────────────────
/** The three difficulty levels, easiest first. Questions of a page are written in this order. */
export const LEVELS = ["سهل", "متوسط", "متقدّم"];
/** The heading of a question on a «… محلولة» or «وظيفة: …» page: «سؤال 3 · متوسط — title». */
export function QH(n, level, title) {
  if (!LEVELS.includes(level)) throw new Error("QH: the level is one of " + LEVELS.join(" / "));
  return enr({ type: "heading", level: 3, text: iso("سؤال " + n + " · " + level + (title ? " — " + title : "")), _question: { n, level } });
}
/**
 * The «الحل» button of a homework question (guided / ds-solution / v1): pressing it opens a window with the solution.
 *   steps      the reasoning, one sentence per step (inline markup) — at least one
 *   answer     the final answer in one line (optional)
 *   code       the solution's C# code (for a writing question)
 *   checklist  what a correct solution must contain (plain strings with `code` runs)
 *   trace      { code?, run?, lib?, given?, quiet?, max? } — the recorded trace shown in the window; `code` defaults to the
 *              solution's code. The program is proven like every TRACE.
 *   prove      { code?, run, lib?, out } — when there is code but no trace: the program must print `out` (so no solution code
 *              is ever shown without having been compiled and run).
 */
export function SOLUTION({ title = "الحل", steps, answer, code, checklist, trace, prove, note }) {
  if (!Array.isArray(steps) || !steps.length) throw new Error("SOLUTION «" + title + "»: at least one step");
  const shown = code ? dedent(code) : undefined;
  if (shown && !trace && !prove) throw new Error("SOLUTION «" + title + "»: code needs a `trace` or a `prove` (it must be compiled and run)");
  let traced = null, proof = null;
  if (trace) {
    const prog = program({ code: trace.code ?? code, run: trace.run, lib: trace.lib, stdin: trace.stdin, quiet: trace.quiet, allowError: trace.allowError });
    const r = execute(prog, trace.max ?? 150);
    if (!r.steps.length) throw new Error("SOLUTION «" + title + "»: the trace has no step in the shown code");
    traced = { prog, out: r.out, config: { code: prog.code, ...(trace.given ? { given: trace.given } : {}), ...(prog.stdin ? { stdin: prog.stdin } : {}), out: r.out, steps: compact(r.steps, r.out) } };
  }
  if (prove) proof = { type: "output", prog: program({ code: prove.code ?? code, run: prove.run, lib: prove.lib, stdin: prove.stdin, quiet: prove.quiet }), out: prove.out, loose: true };
  return enr({
    type: "guided", guidedType: "ds-solution", version: 1, title: iso(title),
    steps: steps.map((st, i) => ({ id: "s" + (i + 1), text: spans(st) })),
    ...(answer ? { result: spans(answer) } : {}), ...(note ? { explanation: plain(iso(note)) } : {}),
    capabilities: { interactive: true },
    config: { ...(shown ? { code: shown } : {}), ...(checklist?.length ? { checklist } : {}), ...(traced ? { trace: traced.config } : {}) },
    fallback: { text: "حل السؤال: " + steps.map(plain).join(" ") },
    ...(traced ? { _prog: traced.prog, _out: traced.out } : {}), ...(proof ? { _prove: proof } : {}),
  });
}
