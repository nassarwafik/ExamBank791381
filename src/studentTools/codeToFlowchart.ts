// DG9 «ولّد من الكود» for flowcharts (docs/enterprise-diagram-editor-design.md §7, §21) — one function of C# or Python drawn as its
// flowchart: start, the inputs, the steps, the questions of its «if» / «switch» / «match», its loops (while, do-while, for, foreach,
// for-in), its outputs, its returns, end. A small, bounded reader of the STATEMENTS of one function: no compiler, no eval; nothing is
// run, nothing is sent. Comments are dropped first, and string literals are hidden from the reader (a brace or a «:» in them cannot
// confuse it) while kept for the texts drawn. Pure: no React, no DOM, no I/O.
//
// The drawing is laid out from the program's own structure: one column down the middle; an «if» splits into «نعم» on the left and «لا»
// on the right (with no «else», «لا» goes straight down); a loop's body goes down under its question, its way back up round the left
// and its «لا» round the right. A function too long for one column is continued in the next, joined by a pair of connectors «1», «2»…

import { kindSpec } from "./diagramCatalog";
import { DIAGRAM_LIMITS, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";
import { layoutNode } from "./diagramLayout";

export const FLOW_LIMITS = Object.freeze({ chars: 30_000, steps: 140 });

export type FlowLang = "csharp" | "python";
export type FlowProblem = { line: number; message: string };
export type Stmt =
  | { k: "stmt"; line: number; text: string }
  | { k: "if"; line: number; cond: string; then: Stmt[]; else: Stmt[] | null }
  | { k: "while"; line: number; cond: string; body: Stmt[]; orElse?: Stmt[] }
  | { k: "doWhile"; line: number; cond: string; body: Stmt[] }
  | { k: "for"; line: number; init: string[]; cond: string; update: string[]; body: Stmt[]; orElse?: Stmt[] }
  | { k: "each"; line: number; item: string; coll: string; body: Stmt[]; orElse?: Stmt[] }
  | { k: "switch"; line: number; subject: string; cases: { conds: string[]; body: Stmt[] }[]; dflt: Stmt[] | null }
  | { k: "return"; line: number; value: string }
  | { k: "stop"; line: number; text: string }
  | { k: "break"; line: number }
  | { k: "continue"; line: number };
export type FlowFunction = { name: string; params: string; line: number; body: Stmt[] };
/** What was read: the functions, and the program's own statements outside them (C#'s top-level statements, a Python script's body). */
export type FlowRead = { lang: FlowLang; functions: FlowFunction[]; top: Stmt[]; problems: FlowProblem[] };
export type FlowDrawing = { doc: DiagramDoc | null; summary: string; problems: FlowProblem[] };

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const lineOf = (src: string, at: number) => { let n = 1; for (let i = 0; i < at && i < src.length; i++) if (src[i] === "\n") n++; return n; };
/** The index of the bracket closing the one at `open` in `mask` (strings already hidden), or -1. */
function closing(mask: string, open: number): number {
  const a = mask[open], b = a === "(" ? ")" : a === "[" ? "]" : "}";
  let depth = 0;
  for (let i = open; i < mask.length; i++) {
    if (mask[i] === a) depth++;
    else if (mask[i] === b && --depth === 0) return i;
  }
  return -1;
}
/** Splits `text` on `sep` where `mask` (the same length, strings hidden) is outside every bracket. */
function splitTop(text: string, mask: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < mask.length; i++) {
    const c = mask[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (depth === 0 && mask.startsWith(sep, i)) { out.push(text.slice(start, i)); start = i + sep.length; i += sep.length - 1; }
  }
  out.push(text.slice(start));
  return out.map(squash).filter(Boolean);
}
/** The position of the first `sep` (a regular expression) outside every bracket of `mask`, or -1. */
function findTop(mask: string, re: RegExp, from = 0): number {
  let depth = 0;
  for (let i = from; i < mask.length; i++) {
    const c = mask[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (depth === 0) { re.lastIndex = i; const m = re.exec(mask); if (m && m.index === i) return i; }
  }
  return -1;
}
/** «(a > b)» → «a > b» (only brackets that hold the whole text). */
function unwrap(s: string): string {
  let t = s.trim();
  while (t.startsWith("(") && closing(t, 0) === t.length - 1) t = t.slice(1, -1).trim();
  return t;
}

// ── C# ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The code without its comments (same length, lines kept), and a copy of it with the insides of strings and chars hidden. */
function maskCSharp(src: string): { code: string; mask: string } {
  const code: string[] = [], mask: string[] = [];
  const push = (c: string, m = c) => { code.push(c); mask.push(m); };
  const gap = (c: string) => (c === "\n" ? "\n" : " ");
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") { push(" "); i++; } continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2), end = e < 0 ? src.length : e + 2; for (; i < end; i++) push(gap(src[i])); continue; }
    let j = i, verbatim = false;
    while ((src[j] === "$" || src[j] === "@") && j - i < 3) { if (src[j] === "@") verbatim = true; j++; }
    if (src[j] === "\"" && !/[\w]/.test(src[i - 1] ?? "")) {
      for (; i <= j; i++) push(src[i]);
      while (i < src.length) {
        if (verbatim && src[i] === "\"" && src[i + 1] === "\"") { push(src[i], "_"); push(src[i + 1], "_"); i += 2; continue; }
        if (!verbatim && src[i] === "\\" && i + 1 < src.length) { push(src[i], "_"); push(src[i + 1], src[i + 1] === "\n" ? "\n" : "_"); i += 2; continue; }
        if (src[i] === "\"") { push("\""); i++; break; }
        if (!verbatim && src[i] === "\n") break;
        push(src[i], src[i] === "\n" ? "\n" : "_");
        i++;
      }
      continue;
    }
    if (c === "'") {
      const m = /^'(?:\\.[^'\n]{0,6}|[^'\\\n])'/.exec(src.slice(i, i + 10));
      if (m) { push("'"); for (let k = 1; k < m[0].length - 1; k++) push(src[i + k], "_"); push("'"); i += m[0].length; continue; }
    }
    push(c);
    i++;
  }
  return { code: code.join(""), mask: mask.join("") };
}

const CS_CONTROL = new Set(["if", "else", "while", "do", "for", "foreach", "switch", "case", "default", "try", "catch", "finally", "return", "break", "continue",
  "throw", "goto", "using", "lock", "fixed", "checked", "unchecked", "unsafe", "new", "await", "yield", "nameof", "typeof", "sizeof", "base", "this", "when",
  "in", "is", "as", "out", "ref", "var", "get", "set", "init", "add", "remove", "operator", "delegate", "event"]);
const CS_MODIFIER = "(?:public|private|protected|internal|static|async|virtual|override|abstract|sealed|extern|unsafe|new|partial|readonly)";
const CS_HEAD = new RegExp(`^((?:${CS_MODIFIER}\\s+)*)(?:([A-Za-z_][\\w.]*(?:\\s*<[^()=;]*?>)?(?:\\s*\\[[\\s,]*\\])*\\??)\\s+)?([A-Za-z_]\\w*)\\s*(?:<[^()=;]*?>)?\\s*\\(`);
const CS_TYPE = /(?:^|\s)(class|struct|interface|record|enum)\s+[A-Za-z_]/;

class CSharpReader {
  readonly functions: FlowFunction[] = [];
  readonly top: Stmt[] = [];
  readonly problems: FlowProblem[] = [];
  private readonly told = new Set<string>();
  private readonly code: string;
  private readonly mask: string;
  constructor(code: string, mask: string) { this.code = code; this.mask = mask; }

  private tell(at: number, message: string, once = message) {
    if (this.told.has(once)) return;
    this.told.add(once);
    this.problems.push({ line: lineOf(this.mask, at), message });
  }
  private text(a: number, b: number) { return squash(this.code.slice(a, b)); }
  private ws(i: number) { while (i < this.mask.length && /\s/.test(this.mask[i])) i++; return i; }
  private word(i: number) { return /^[A-Za-z_]\w*/.exec(this.mask.slice(i, i + 40))?.[0] ?? ""; }
  /** The `;` ending the statement at `i` (outside every bracket), or the `}` closing the block it is in. */
  private end(i: number, b: number): number {
    let depth = 0;
    for (let k = i; k < b; k++) {
      const c = this.mask[k];
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) { if (--depth < 0) return k; }
      else if (c === ";" && depth === 0) return k;
    }
    return b;
  }
  /** «name ( params )» of a method or local function whose header starts at `i` and runs to `k` (its `{` or `=>`), else null. */
  private header(i: number, k: number): { name: string; params: string; type: string } | null {
    const head = this.mask.slice(i, k);
    const m = CS_HEAD.exec(head);
    if (!m) return null;
    const mods = m[1].trim().split(/\s+/).filter(Boolean), type = m[2], name = m[3];
    if (CS_CONTROL.has(name) || (type && CS_CONTROL.has(type))) return null;
    if (!type && !mods.some(x => x !== "new")) return null;   // «Foo(x)»: a call, not a declaration
    const open = i + m[0].length - 1, close = closing(this.mask, open);
    if (close < 0 || close > k) return null;
    const rest = this.mask.slice(close + 1, k).trim();
    if (rest && !/^(?:where\b|:\s*(?:base|this)\s*\()/.test(rest)) return null;
    return { name, params: this.text(open + 1, close), type: type ?? "" };
  }
  /** Where a declaration's head ends: its `{`, its `=>` or its `;` (outside brackets). */
  private headEnd(i: number, b: number): number {
    let depth = 0;
    for (let k = i; k < b; k++) {
      const c = this.mask[k];
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (depth === 0 && (c === "{" || c === ";" || (c === "=" && this.mask[k + 1] === ">"))) return k;
      else if (c === "}") return k;
    }
    return b;
  }

  /** The declarations of the file (or of a namespace, or a type's members). */
  read(a = 0, b = this.mask.length, where: "file" | "type" = "file") {
    let i = a;
    while (i < b) {
      i = this.ws(i);
      if (i >= b) break;
      if (this.mask[i] === "[" ) { const c = closing(this.mask, i); i = c < 0 ? b : c + 1; continue; }   // an attribute
      if (this.mask[i] === ";" || this.mask[i] === "}") { i++; continue; }
      const k = this.headEnd(i, b);
      const head = this.mask.slice(i, k);
      if (CS_TYPE.test(" " + head) && !/[=(]/.test(head.replace(/\([^)]*\)\s*$/, "").split(/\b(?:class|struct|interface|record|enum)\b/)[0])) {
        if (this.mask[k] === "{") {
          const c = closing(this.mask, k);
          if (!/\benum\b/.test(head)) this.read(k + 1, c < 0 ? b : c, "type");
          i = c < 0 ? b : c + 1;
        } else i = k + 1;
        continue;
      }
      if (/^namespace\b/.test(head)) {
        if (this.mask[k] === "{") { const c = closing(this.mask, k); this.read(k + 1, c < 0 ? b : c, "file"); i = c < 0 ? b : c + 1; } else i = k + 1;
        continue;
      }
      if (where === "file" && /^(?:global\s+)?using\b/.test(head) && this.mask[k] === ";" && !/^using\s*\(/.test(head) && !/^using\s+var\b/.test(head)) { i = k + 1; continue; }
      const h = this.header(i, k);
      if (h && (this.mask[k] === "{" || this.mask[k] === "=")) {
        const line = lineOf(this.mask, i);
        if (this.mask[k] === "{") {
          const c = closing(this.mask, k);
          this.functions.push({ name: h.name, params: h.params, line, body: this.block(k + 1, c < 0 ? b : c) });
          i = c < 0 ? b : c + 1;
        } else {
          const e = this.end(k + 2, b);
          const value = this.text(k + 2, e);
          this.functions.push({ name: h.name, params: h.params, line, body: [h.type === "void" ? { k: "stmt", line, text: value } : { k: "return", line, value }] });
          i = e + 1;
        }
        continue;
      }
      if (where === "file") {   // a top-level statement (C# 9: the program without Main)
        const [stmts, next] = this.one(i, b);
        this.top.push(...stmts);
        i = Math.max(next, i + 1);
        continue;
      }
      // a field, a property, an event…: not a step of any function
      if (this.mask[k] === "{") { const c = closing(this.mask, k); i = c < 0 ? b : c + 1; } else i = (this.mask[k] === "=" ? this.end(k, b) : k) + 1;
    }
  }

  /** The statements between `a` and `b`. */
  block(a: number, b: number): Stmt[] {
    const out: Stmt[] = [];
    for (let i = a; ;) {
      i = this.ws(i);
      if (i >= b) break;
      const [stmts, next] = this.one(i, b);
      out.push(...stmts);
      i = Math.max(next, i + 1);
    }
    return out;
  }
  /** The parenthesised part after a keyword at `i` («if (…)»): its text and the position after it; null when it is missing. */
  private paren(i: number): { inner: string; innerMask: string; after: number } | null {
    const p = this.ws(i);
    if (this.mask[p] !== "(") return null;
    const c = closing(this.mask, p);
    if (c < 0) return null;
    return { inner: this.code.slice(p + 1, c), innerMask: this.mask.slice(p + 1, c), after: c + 1 };
  }
  /** One statement (a block is its statements) at `i`: what it draws, and where the next one starts. */
  one(i: number, b: number): [Stmt[], number] {
    i = this.ws(i);
    if (i >= b) return [[], b];
    const c = this.mask[i], line = lineOf(this.mask, i);
    if (c === "{") { const e = closing(this.mask, i); return [this.block(i + 1, e < 0 ? b : e), e < 0 ? b : e + 1]; }
    if (c === ";") return [[], i + 1];
    const w = this.word(i);
    const after = i + w.length;
    const bad = (what: string): [Stmt[], number] => { this.tell(i, what); const e = this.end(i, b); return [[], e + 1]; };
    switch (w) {
      case "if": {
        const p = this.paren(after);
        if (!p) return bad("«if» بلا شرط بين قوسين.");
        const [then, n] = this.one(p.after, b);
        const n2 = this.ws(n);
        if (this.word(n2) === "else") { const [els, n3] = this.one(n2 + 4, b); return [[{ k: "if", line, cond: unwrap(squash(p.inner)), then, else: els }], n3]; }
        return [[{ k: "if", line, cond: unwrap(squash(p.inner)), then, else: null }], n];
      }
      case "while": {
        const p = this.paren(after);
        if (!p) return bad("«while» بلا شرط بين قوسين.");
        const [body, n] = this.one(p.after, b);
        return [[{ k: "while", line, cond: unwrap(squash(p.inner)), body }], n];
      }
      case "do": {
        const [body, n] = this.one(after, b);
        const n2 = this.ws(n);
        const p = this.word(n2) === "while" ? this.paren(n2 + 5) : null;
        if (!p) return bad("«do» بلا «while (…)» بعده.");
        const e = this.ws(p.after);
        return [[{ k: "doWhile", line, cond: unwrap(squash(p.inner)), body }], this.mask[e] === ";" ? e + 1 : e];
      }
      case "for": {
        const p = this.paren(after);
        if (!p) return bad("«for» بلا قوسين.");
        const parts = this.splitRaw(p.inner, p.innerMask, ";");
        if (parts.length !== 3) return bad("«for» يحتاج ثلاثة أجزاء بين قوسيه: البداية; الشرط; الخطوة.");
        const [body, n] = this.one(p.after, b);
        const [init, cond, update] = parts;
        return [[{ k: "for", line, init: splitTop(init.text, init.mask, ",").map(stripDecl).filter(Boolean), cond: unwrap(squash(cond.text)), update: splitTop(update.text, update.mask, ","), body }], n];
      }
      case "foreach": {
        const p = this.paren(after);
        const at = p ? findTop(p.innerMask, /\bin\b/g) : -1;
        if (!p || at < 0) return bad("«foreach» يحتاج: (النوع العنصر in المجموعة).");
        const [body, n] = this.one(p.after, b);
        const left = squash(p.inner.slice(0, at)), coll = squash(p.inner.slice(at + 2));
        const item = /\)$/.test(left) ? left.replace(/^[^(]*(?=\()/, "") : left.split(/\s+/).pop()!;
        return [[{ k: "each", line, item, coll, body }], n];
      }
      case "switch": {
        const p = this.paren(after);
        const o = p ? this.ws(p.after) : -1;
        if (!p || this.mask[o] !== "{") return bad("«switch» يحتاج: (القيمة) { case …: … }.");
        const e = closing(this.mask, o);
        return [[this.switchOf(squash(p.inner), o + 1, e < 0 ? b : e, line)], e < 0 ? b : e + 1];
      }
      case "return": case "throw": {
        const e = this.end(after, b);
        const value = this.text(after, e);
        return [[w === "return" ? { k: "return", line, value } : { k: "stop", line, text: "throw " + value }], e + 1];
      }
      case "break": case "continue": {
        const e = this.end(after, b);
        return [[{ k: w, line }], e + 1];
      }
      case "try": {
        const [body, n0] = this.one(after, b);
        let n = this.ws(n0);
        const fin: Stmt[] = [];
        for (;;) {
          const v = this.word(n);
          if (v === "catch") {
            this.tell(n, "رُسم ما في «try» فقط: معالجة الأخطاء («catch») لا تظهر في مخطط التدفّق.");
            let q = this.ws(n + 5);
            if (this.mask[q] === "(") q = closing(this.mask, q) + 1;
            q = this.ws(q);
            if (this.word(q) === "when") { const r = this.paren(q + 4); q = r ? r.after : q + 4; }
            const [, m] = this.one(q, b);
            n = this.ws(m);
          } else if (v === "finally") {
            const [f, m] = this.one(n + 7, b);
            fin.push(...f);
            n = this.ws(m);
          } else break;
        }
        return [[...body, ...fin], n];
      }
      case "using": case "lock": case "fixed": {
        const p = this.paren(after);
        if (p) return this.one(p.after, b);
        break;   // «using var x = …;» is a step
      }
      case "checked": case "unchecked": case "unsafe":
        if (this.mask[this.ws(after)] === "{") return this.one(after, b);
        break;
      case "goto": return bad("«goto» لا يُرسم: استعمل حلقة أو شرطًا.");
      case "else": return bad("«else» بلا «if» قبله.");
      case "case": case "default": if (/^\s*:/.test(this.mask.slice(after, after + 4)) || w === "case") return bad("«" + w + "» خارج «switch».");
    }
    // a local function, a type: not a step (a local function can be drawn by pasting it alone)
    const k = this.headEnd(i, b);
    const h = this.header(i, k);
    if (h && (this.mask[k] === "{" || this.mask[k] === "=")) {
      this.tell(i, "الدالة الداخلية «" + h.name + "» لم تُرسم: الصقها وحدها لرسمها.", "local:" + h.name);
      if (this.mask[k] === "{") { const e = closing(this.mask, k); return [[], e < 0 ? b : e + 1]; }
      return [[], this.end(k, b) + 1];
    }
    if (CS_TYPE.test(" " + this.mask.slice(i, k)) && this.mask[k] === "{") { const e = closing(this.mask, k); return [[], e < 0 ? b : e + 1]; }
    // a label «again:»
    const lab = /^[A-Za-z_]\w*\s*:(?!:)/.exec(this.mask.slice(i, i + 60));
    if (lab && !/^(?:default|case)\b/.test(lab[0])) return [[], i + lab[0].length];
    const e = this.end(i, b);
    const text = this.text(i, e);
    return [text ? [{ k: "stmt", line, text }] : [], e + 1];
  }
  private splitRaw(text: string, mask: string, sep: string): { text: string; mask: string }[] {
    const out: { text: string; mask: string }[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i <= mask.length; i++) {
      const ch = mask[i];
      if (ch && "([{".includes(ch)) depth++;
      else if (ch && ")]}".includes(ch)) depth--;
      else if (i === mask.length || (depth === 0 && ch === sep)) { out.push({ text: text.slice(start, i), mask: mask.slice(start, i) }); start = i + 1; }
    }
    return out;
  }
  /** A «switch» body: its sections, each with the values of its «case» labels. */
  private switchOf(subject: string, a: number, b: number, line: number): Stmt {
    const cases: { conds: string[]; body: Stmt[] }[] = [];
    let dflt: Stmt[] | null = null;
    let labels: string[] = [], isDefault = false, body: Stmt[] = [];
    const close = () => {
      if (!labels.length && !isDefault) return;
      if (isDefault) dflt = [...(dflt ?? []), ...body];
      else cases.push({ conds: labels, body });
      labels = []; isDefault = false; body = [];
    };
    for (let i = a; ;) {
      i = this.ws(i);
      if (i >= b) break;
      const w = this.word(i);
      if (w === "default" && /^default\s*:/.test(this.mask.slice(i, i + 20))) {
        if (body.length) close();
        isDefault = true;
        i = this.mask.indexOf(":", i) + 1;
        continue;
      }
      if (w === "case") {
        if (body.length) close();
        const colon = findTop(this.mask.slice(0, b), /:(?!:)/g, i + 4);
        if (colon < 0) break;
        const raw = this.text(i + 4, colon);
        const [pat, guard] = raw.split(/\s+when\s+/);
        for (const alt of pat.split(/\s+or\s+/)) labels.push(caseCond(subject, alt.trim(), guard));
        i = colon + 1;
        continue;
      }
      if (!labels.length && !isDefault) { this.tell(i, "في «switch» خطوات قبل أول «case»."); }
      const [stmts, next] = this.one(i, b);
      body.push(...stmts);
      i = Math.max(next, i + 1);
    }
    close();
    return { k: "switch", line, subject, cases, dflt };
  }
}
/** «case 5:» → «x == 5»; «case > 90:» → «x > 90»; a type pattern «case int n:» → «x is int n»; with «when g»: «… && g». */
function caseCond(subject: string, pat: string, guard?: string, and = "&&"): string {
  const s = /^(?:<=|>=|<|>|!=)/.test(pat) ? subject + " " + pat
    : /^(?:[-+]?\d[\d_.]*[a-zA-Z]?|true|false|True|False|None|null|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)+)$/.test(pat) ? subject + " == " + pat
    : subject + " is " + pat;
  return guard ? s + " " + and + " " + guard.trim() : s;
}
/** «int i = 0» → «i = 0»; «var total = 0» → «total = 0»; «string name» (no value) → "". */
function stripDecl(s: string): string {
  const t = s.trim();
  const m = /^(?:const\s+|readonly\s+|using\s+)?([A-Za-z_][\w.]*(?:\s*<[^;=()]*>)?(?:\s*\[[\s,]*\])*\??)\s+([A-Za-z_]\w*\s*(?:=(?!=)|,|$)[\s\S]*)$/.exec(t);
  if (!m || CS_CONTROL.has(m[1]) && m[1] !== "var") return t;
  const rest = m[2];
  // the names given a value: «int a = 1, b» → «a = 1»
  const parts = rest.split(/,(?![^(]*\))(?![^[]*\])(?![^{]*\})/).map(x => x.trim()).filter(x => /=/.test(x));
  return parts.join(", ");
}

// ── Python ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type PyLine = { text: string; mask: string; indent: number; line: number };
/** The logical lines of a Python file: comments dropped, lines joined inside brackets, triple-quoted strings and after «\». */
function pyLines(src: string): PyLine[] {
  const out: PyLine[] = [];
  let i = 0, line = 1, text = "", mask = "", depth = 0, start = 1, indent = 0, fresh = true;
  const flush = () => { if (text.trim()) out.push({ text: text.trimEnd(), mask: mask.trimEnd(), indent, line: start }); text = ""; mask = ""; depth = 0; fresh = true; };
  while (i < src.length) {
    const c = src[i];
    if (fresh) {
      let col = 0, j = i;
      while (src[j] === " " || src[j] === "\t" || src[j] === "\f") { col = src[j] === "\t" ? col + 8 - (col % 8) : col + 1; j++; }
      if (j >= src.length) break;
      if (src[j] === "\n" || src[j] === "\r" || src[j] === "#") {   // a blank line, or a comment alone
        while (j < src.length && src[j] !== "\n") j++;
        i = j + 1; line++;
        continue;
      }
      indent = col; start = line; i = j; fresh = false;
      continue;
    }
    if (c === "\r") { i++; continue; }
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
    const pre = /^[rRbBuUfF]{0,2}(?=["'])/.exec(src.slice(i, i + 3));
    if (pre && !/\w/.test(src[i - 1] ?? "") && /["']/.test(src[i + pre[0].length] ?? "")) {
      const q0 = i + pre[0].length, q = src.startsWith(src[q0].repeat(3), q0) ? src[q0].repeat(3) : src[q0];
      const raw = /r/i.test(pre[0]);
      text += src.slice(i, q0 + q.length); mask += src.slice(i, q0 + q.length);
      let k = q0 + q.length;
      while (k < src.length) {
        if (!raw && src[k] === "\\" && k + 1 < src.length) { text += src[k] + src[k + 1]; mask += "__"; if (src[k + 1] === "\n") line++; k += 2; continue; }
        if (src.startsWith(q, k)) break;
        if (src[k] === "\n") { if (q.length === 1) break; line++; text += " "; mask += " "; k++; continue; }
        text += src[k]; mask += "_"; k++;
      }
      if (src.startsWith(q, k)) { text += q; mask += q; k += q.length; }
      i = k;
      continue;
    }
    if (c === "\\" && (src[i + 1] === "\n" || (src[i + 1] === "\r" && src[i + 2] === "\n"))) { i += src[i + 1] === "\r" ? 3 : 2; line++; text += " "; mask += " "; continue; }
    if (c === "\n") {
      line++; i++;
      if (depth > 0) { text += " "; mask += " "; continue; }
      flush();
      continue;
    }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth = Math.max(0, depth - 1);
    text += c; mask += c; i++;
  }
  flush();
  return out;
}

const PY_COMPOUND = /^(if|elif|else|while|for|try|except|finally|with|match|case|def|class|async\s+def|async\s+for|async\s+with)\b/;
class PythonReader {
  readonly functions: FlowFunction[] = [];
  readonly top: Stmt[] = [];
  readonly problems: FlowProblem[] = [];
  private readonly told = new Set<string>();
  private readonly ls: PyLine[];
  constructor(ls: PyLine[]) { this.ls = ls; }
  private tell(line: number, message: string, once = message) {
    if (this.told.has(once)) return;
    this.told.add(once);
    this.problems.push({ line, message });
  }
  /** Where the suite under line `i` ends (the first line not indented more than it). */
  private suiteEnd(i: number, to: number): number {
    let j = i + 1;
    while (j < to && this.ls[j].indent > this.ls[i].indent) j++;
    return j;
  }
  /** A compound line: its keyword, the text of its header, and what follows its «:» on the same line. */
  private head(L: PyLine): { kw: string; head: string; headMask: string; inline: string; inlineMask: string } | null {
    const m = PY_COMPOUND.exec(L.mask);
    if (!m) return null;
    const colon = findTop(L.mask, /:(?!=)/g, m[0].length);
    if (colon < 0) return null;
    return { kw: m[1].replace(/\s+/g, " "), head: L.text.slice(m[0].length, colon).trim(), headMask: L.mask.slice(m[0].length, colon).trim(), inline: L.text.slice(colon + 1).trim(), inlineMask: L.mask.slice(colon + 1).trim() };
  }
  private bodyOf(i: number, j: number, h: { inline: string; inlineMask: string }): Stmt[] {
    if (h.inline) return this.simple(h.inline, h.inlineMask, this.ls[i].line);
    return i + 1 < j ? this.suite(i + 1, j) : [];
  }
  /** The module: its functions (and the methods of its classes), and its own statements. */
  read() {
    const walk = (from: number, to: number, inClass: boolean) => {
      for (let i = from; i < to;) {
        const L = this.ls[i], j = this.suiteEnd(i, to), h = this.head(L);
        if (h && (h.kw === "def" || h.kw === "async def")) {
          const m = /^([A-Za-z_]\w*)\s*\(([\s\S]*)\)\s*(?:->[\s\S]*)?$/.exec(h.head);
          if (m) this.functions.push({ name: m[1], params: squash(m[2]), line: L.line, body: this.bodyOf(i, j, h) });
        } else if (h && h.kw === "class") walk(i + 1, j, true);
        else if (!inClass) {
          // «if __name__ == "__main__":» runs its body: its steps are the program's
          if (h && h.kw === "if" && /^__name__\s*==\s*["']__main__["']$/.test(h.head)) this.top.push(...this.bodyOf(i, j, h));
          else { const [stmts, next] = this.statement(i, to); this.top.push(...stmts); i = next; continue; }
        }
        i = j;
      }
    };
    walk(0, this.ls.length, false);
  }
  suite(from: number, to: number): Stmt[] {
    const out: Stmt[] = [];
    for (let i = from; i < to;) {
      const [stmts, next] = this.statement(i, to);
      out.push(...stmts);
      i = next;
    }
    return out;
  }
  /** The statement at line `i` (with its suite, and its «elif» / «else» / «except» siblings): what it draws, and the next line. */
  private statement(i: number, to: number): [Stmt[], number] {
    const L = this.ls[i], j = this.suiteEnd(i, to), h = this.head(L), line = L.line;
    if (!h) return [this.simple(L.text, L.mask, line), j > i + 1 ? (this.tell(this.ls[i + 1].line, "إزاحة غير متوقعة بعد السطر " + line + "."), j) : i + 1];
    const sibling = (k: number, kw: string[]) => {
      const S = k < to ? this.ls[k] : null;
      const sh = S && S.indent === L.indent ? this.head(S) : null;
      return sh && kw.includes(sh.kw) ? sh : null;
    };
    switch (h.kw) {
      case "if": {
        const branches: { cond: string; body: Stmt[]; line: number }[] = [{ cond: unwrap(h.head), body: this.bodyOf(i, j, h), line }];
        let k = j, els: Stmt[] | null = null;
        for (;;) {
          const s = sibling(k, ["elif", "else"]);
          if (!s) break;
          const e = this.suiteEnd(k, to), body = this.bodyOf(k, e, s);
          if (s.kw === "elif") branches.push({ cond: unwrap(s.head), body, line: this.ls[k].line });
          else { els = body; k = e; break; }
          k = e;
        }
        let tail: Stmt[] | null = els;
        for (let n = branches.length - 1; n >= 0; n--) tail = [{ k: "if", line: branches[n].line, cond: branches[n].cond, then: branches[n].body, else: tail }];
        return [tail!, k];
      }
      case "while": case "for": {
        let k = j, orElse: Stmt[] | undefined;
        const s = sibling(k, ["else"]);
        if (s) { const e = this.suiteEnd(k, to); orElse = this.bodyOf(k, e, s); k = e; }
        const body = this.bodyOf(i, j, h);
        if (h.kw === "while") return [[{ k: "while", line, cond: unwrap(h.head), body, orElse }], k];
        const at = findTop(h.headMask, /\bin\b/g);
        if (at < 0) { this.tell(line, "«for» يحتاج: for العنصر in المجموعة:"); return [[], k]; }
        const item = squash(h.head.slice(0, at)), iter = squash(h.head.slice(at + 2)), iterMask = squash(h.headMask.slice(at + 2));
        const range = /^range\s*\(/.test(iterMask) && closing(iterMask, iterMask.indexOf("(")) === iterMask.length - 1;
        if (range) {
          const args = splitTop(iter.slice(iter.indexOf("(") + 1, -1), iterMask.slice(iterMask.indexOf("(") + 1, -1), ",");
          if (args.length >= 1 && args.length <= 3) {
            const [from, upTo] = args.length === 1 ? ["0", args[0]] : [args[0], args[1]];
            const step = args[2] ?? "1";
            const down = /^-\s*\d/.test(step);
            const by = down ? step.replace(/^-\s*/, "") : step;
            return [[{ k: "for", line, init: [item + " = " + from], cond: item + (down ? " > " : " < ") + upTo, update: [item + " = " + item + (down ? " - " : " + ") + by], body, orElse }], k];
          }
        }
        return [[{ k: "each", line, item, coll: iter, body, orElse }], k];
      }
      case "try": {
        const out = this.bodyOf(i, j, h);
        let k = j;
        for (;;) {
          const s = sibling(k, ["except", "else", "finally"]);
          if (!s) break;
          const e = this.suiteEnd(k, to);
          if (s.kw === "except") this.tell(this.ls[k].line, "رُسم ما في «try» فقط: معالجة الأخطاء («except») لا تظهر في مخطط التدفّق.");
          else out.push(...this.bodyOf(k, e, s));
          k = e;
        }
        return [out, k];
      }
      case "with": case "async with": return [this.bodyOf(i, j, h), j];
      case "match": {
        const subject = unwrap(h.head);
        const cases: { conds: string[]; body: Stmt[] }[] = [];
        let dflt: Stmt[] | null = null;
        for (let k = i + 1; k < j;) {
          const C = this.ls[k], ch = this.head(C), e = this.suiteEnd(k, j);
          if (!ch || ch.kw !== "case") { this.tell(C.line, "في «match» يأتي «case» فقط."); k = e; continue; }
          const body = this.bodyOf(k, e, ch);
          const [pat, guard] = splitGuard(ch.head);
          if (pat === "_" ) dflt = body;
          else cases.push({ conds: splitTop(pat, pat, " | ").map(p => caseCond(subject, p, guard, "and")), body });
          k = e;
        }
        return [[{ k: "switch", line, subject, cases, dflt }], j];
      }
      case "def": case "async def": case "class": {
        const name = /^\s*([A-Za-z_]\w*)/.exec(h.head)?.[1] ?? "";
        this.tell(line, (h.kw === "class" ? "الصنف «" : "الدالة الداخلية «") + name + "» لم يُرسم: الصقه وحده لرسمه.", "local:" + name);
        return [[], j];
      }
      default:
        this.tell(line, "«" + h.kw + "» بلا «" + (h.kw === "elif" || h.kw === "else" ? "if" : h.kw === "case" ? "match" : "try") + "» قبله.");
        return [[], j];
    }
  }
  /** The simple statements of a line (split on «;»). */
  private simple(text: string, mask: string, line: number): Stmt[] {
    const out: Stmt[] = [];
    for (const raw of splitTop(text, mask, ";")) {
      const w = /^[A-Za-z_]\w*/.exec(raw)?.[0] ?? "";
      if (w === "pass" || w === "global" || w === "nonlocal" || w === "import" || (w === "from" && /\bimport\b/.test(raw))) continue;
      if (w === "return") out.push({ k: "return", line, value: raw.slice(6).trim() });
      else if (w === "raise") out.push({ k: "stop", line, text: raw });
      else if ((w === "break" || w === "continue") && raw === w) out.push({ k: w, line });
      else out.push({ k: "stmt", line, text: squash(raw) });
    }
    return out;
  }
}
/** «x if x > 0» → ["x", "x > 0"] (a «case» pattern and its guard). */
function splitGuard(head: string): [string, string | undefined] {
  const at = findTop(head, /\sif\s/g);
  return at < 0 ? [head.trim(), undefined] : [head.slice(0, at).trim(), head.slice(at + 4).trim()];
}

// ── which language ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function detectLanguage(code: string): FlowLang {
  if (/\bConsole\s*\.|\bstatic\s+void\b|\bnamespace\s+\w|\busing\s+System\b|\bpublic\s+(?:static\s+)?(?:class|void|int|double|string)\b/.test(code)) return "csharp";
  if (/^\s*(?:def\s+\w+\s*\(|elif\b|print\s*\(|import\s+\w|from\s+\w+\s+import\b)/m.test(code) || /^\s*(?:if|while|for|else)\b[^\n{;]*:\s*(?:#.*)?$/m.test(code)) return "python";
  return /[{};]/.test(code) ? "csharp" : "python";
}

export function readFunctions(code: string): FlowRead {
  const lang = detectLanguage(code);
  if (lang === "csharp") {
    const { code: c, mask } = maskCSharp(code);
    const r = new CSharpReader(c, mask);
    r.read();
    return { lang, functions: r.functions, top: r.top, problems: r.problems };
  }
  const r = new PythonReader(pyLines(code));
  r.read();
  return { lang, functions: r.functions, top: r.top, problems: r.problems };
}

// ── the steps ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Step = { type: "io" | "process" | "subroutine"; text: string; inputs?: string[]; prompt?: boolean };
/** The output's arguments as the flowchart writes them: strings in «», Python's «end=» / «sep=» left out. */
function outText(args: string, lang: FlowLang): string {
  const parts = splitTop(args, maskQuotes(args), ",").filter(p => lang === "csharp" || !/^(?:end|sep|file|flush)\s*=/.test(p));
  const q = lang === "csharp" ? /(?:\$@|@\$|\$|@)?"((?:[^"\\]|\\.|"")*)"/g : /(?:[rRbBuUfF]{1,2})?(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  return parts.map(p => p.replace(q, (_, a, b) => "«" + (a ?? b ?? "") + "»")).join(", ");
}
/** Hides the insides of quoted strings (for splitting an argument list). */
function maskQuotes(s: string): string {
  return s.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, m => m[0] + "_".repeat(m.length - 2) + m[m.length - 1]);
}
/** One string literal and nothing else (an interpolated one only without holes): a prompt. */
function isLiteral(args: string): boolean {
  const t = args.trim(), pre = /^[$@fFrRuUbB]{0,2}/.exec(t)![0], body = t.slice(pre.length);
  return /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/.test(body) && !(/[$fF]/.test(pre) && body.includes("{"));
}
/** The left side of «target = …» (not «==», «<=», «>=», «!=», «=>»), or null. */
function assigned(text: string): string | null {
  const at = findTop(maskQuotes(text), /(?<![=<>!+\-*/%&|^:])=(?![=>])/g);
  return at < 0 ? null : text.slice(0, at).trim();
}
function callOf(text: string): string | null {
  const m = /^(?:await\s+)?(?:this\.)?([A-Za-z_]\w*)\s*\(/.exec(text);
  return m && closing(maskQuotes(text), text.indexOf("(", m[0].length - 1)) === text.length - 1 ? m[1] : null;
}
function stepOf(raw: string, lang: FlowLang, functions: ReadonlySet<string>): Step | null {
  const text = raw.replace(/;\s*$/, "").trim();
  if (!text) return null;
  if (lang === "csharp") {
    if (/\bConsole\s*\.\s*Read(?:Line|Key)?\s*\(/.test(text)) {
      const tp = /TryParse\s*\(\s*Console\s*\.\s*ReadLine\s*\(\s*\)[^,]*,\s*out\s+(?:[\w.<>[\]?]+\s+)?([A-Za-z_]\w*)\s*\)/.exec(text);
      const lhs = tp ? tp[1] : assigned(text);
      if (!lhs) return null;   // «Console.ReadKey();»: waiting for a key is not a step of the algorithm
      const name = stripDecl(lhs + " = 0").replace(/\s*=\s*0$/, "") || lhs;
      return { type: "io", text: "", inputs: [name] };
    }
    const out = /^(?:Console\s*\.\s*Write(?:Line)?|MessageBox\s*\.\s*Show)\s*\(/.exec(text);
    if (out && closing(maskQuotes(text), out[0].length - 1) === text.length - 1) {
      const args = text.slice(out[0].length, -1).trim();
      return args ? { type: "io", text: "اطبع " + isolate(outText(args, lang)), prompt: isLiteral(args) } : null;
    }
    const fn = callOf(text);
    if (fn && functions.has(fn)) return { type: "subroutine", text: text.replace(/^this\./, "") };
    const d = stripDecl(text);
    return d ? { type: "process", text: d } : null;
  }
  if (/\binput\s*\(/.test(text)) {
    const lhs = assigned(text);
    if (!lhs) return null;
    return { type: "io", text: "", inputs: [lhs.replace(/\s*:\s*[^,=]+$/, "")] };
  }
  const out = /^print\s*\(/.exec(text);
  if (out && closing(maskQuotes(text), out[0].length - 1) === text.length - 1) {
    const args = text.slice(out[0].length, -1).trim();
    const shown = outText(args, lang);
    const kept = splitTop(args, maskQuotes(args), ",").filter(p => !/^(?:end|sep|file|flush)\s*=/.test(p));
    return shown ? { type: "io", text: "اطبع " + isolate(shown), prompt: kept.length === 1 && isLiteral(kept[0]) } : null;
  }
  const fn = callOf(text);
  if (fn && functions.has(fn)) return { type: "subroutine", text };
  // «x: int = 5» → «x = 5»; «x: int» alone declares nothing to do
  const ann = /^([A-Za-z_][\w.]*)\s*:\s*[^=]+?(?:=(?!=)\s*([\s\S]+))?$/.exec(text);
  if (ann && !/^(?:lambda)\b/.test(text)) return ann[2] ? { type: "process", text: ann[1] + " = " + ann[2].trim() } : null;
  return { type: "process", text };
}

/** Code written beside an Arabic word reads in its own direction (left to right) inside the right-to-left label: «اطبع ⁦«5! =», f⁩». A
 *  text that has Arabic in it already is left as it is. */
const ARABIC = /[\u0600-\u06ff]/;
export const isolate = (code: string) => (!code || ARABIC.test(code) ? code : "\u2066" + code + "\u2069");

// ── the drawing ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Exit = { from: string; label: string };
/** The layout tree: how the steps stand on the page (worked out once their sizes are known). */
type LT =
  | { t: "node"; id: string }
  | { t: "seq"; items: LT[] }
  | { t: "if"; d: string; then: LT; else: LT | null }
  | { t: "loop"; d: string; body: LT }
  | { t: "doLoop"; body: LT; d: string }
  /** Where the page's column ends and the next begins (top level only). */
  | { t: "cut" };
type Frame = { kind: "loop" | "switch"; breaks: Exit[]; continues: Exit[] };
const YES = "نعم", NO = "لا";
/** Steps sharing a box (a name is one line; the box wraps it): «sum += i; evens++» — the way both languages write it on one line. */
const JOIN = "; ";
const V = 36, G = 60, LANE = 46, MARGIN = 40;
const clip = (s: string) => (s.length > DIAGRAM_LIMITS.text ? s.slice(0, DIAGRAM_LIMITS.text - 1) + "…" : s);

class Builder {
  readonly nodes: DNode[] = [];
  readonly edges: DEdge[] = [];
  readonly problems: FlowProblem[] = [];
  private frames: Frame[] = [];
  private columns = 0;
  private returns: Exit[] = [];
  private readonly spec = kindSpec("flowchart");
  private readonly lang: FlowLang;
  private readonly functions: ReadonlySet<string>;
  constructor(lang: FlowLang, functions: ReadonlySet<string>) { this.lang = lang; this.functions = functions; }

  node(type: string, text: string): string {
    const s = this.spec.nodes.find(n => n.type === type)!;
    const id = "n" + (this.nodes.length + 1);
    this.nodes.push({ id, type, x: 0, y: 0, w: s.minW, h: s.minH, text: { name: clip(text) }, color: "none" });
    return id;
  }
  link(exits: Exit[], to: string) {
    for (const x of exits) this.edges.push({ id: "e" + (this.edges.length + 1), type: "flow", from: x.from, to, label: x.label, fromLabel: "", toLabel: "", y: 0, route: "ortho" });
  }
  /** A decision: its question with «؟». */
  question(cond: string): string { return this.node("decision", (cond || "true") + " ؟"); }

  /** The statements in order, from the ways in (`exits`): the ways out, and how they stand. */
  seq(stmts: Stmt[], exits: Exit[], cuts?: ReadonlySet<number>): { exits: Exit[]; lt: LT } {
    const items: LT[] = [];
    let open: { id: string; kind: "input" | "process"; lines: string[] } | null = null;
    // top level: before the item numbered in `cuts`, the column ends with a connector and the next one starts with its twin
    let count = 0;
    const cut = () => {
      if (cuts?.has(count) && exits.length) {
        const mark = String(++this.columns);
        const out = this.node("connector", mark), into = this.node("connector", mark);
        this.link(exits, out);
        items.push({ t: "node", id: out }, { t: "cut" }, { t: "node", id: into });
        exits = [{ from: into, label: "" }];
      }
      count++;
    };
    for (let k = 0; k < stmts.length; k++) {
      const s = stmts[k];
      if (!exits.length) {
        this.problems.push({ line: s.line, message: "لا يصل التنفيذ إلى هذا السطر (بعد return أو break أو continue)، فلم يُرسم." });
        break;
      }
      if (s.k === "stmt") {
        const step = stepOf(s.text, this.lang, this.functions);
        if (!step) continue;
        // a prompt printed just before an input: the input box says it
        if (step.prompt) {
          const next = stmts[k + 1];
          const ns = next?.k === "stmt" ? stepOf(next.text, this.lang, this.functions) : null;
          if (ns?.inputs) continue;
        }
        const joinable = open && exits.length === 1 && exits[0].from === open.id;
        if (step.inputs && joinable && open!.kind === "input") {
          open!.lines.push(...step.inputs);
          this.nodes.find(n => n.id === open!.id)!.text.name = clip("أدخل " + isolate(open!.lines.join(", ")));
          continue;
        }
        if (step.type === "process" && joinable && open!.kind === "process" && open!.lines.length < 3 && (open!.lines.join(JOIN) + step.text).length < 80) {
          open!.lines.push(step.text);
          this.nodes.find(n => n.id === open!.id)!.text.name = clip(open!.lines.join(JOIN));
          continue;
        }
        cut();
        const id = this.node(step.type, step.inputs ? "أدخل " + isolate(step.inputs.join(", ")) : step.text);
        this.link(exits, id);
        exits = [{ from: id, label: "" }];
        items.push({ t: "node", id });
        open = step.inputs ? { id, kind: "input", lines: [...step.inputs] } : step.type === "process" ? { id, kind: "process", lines: [step.text] } : null;
        continue;
      }
      open = null;
      const before = this.nodes.length;
      if (cuts && s.k !== "break" && s.k !== "continue" && (s.k !== "return" || s.value)) cut();
      const r = this.one(s, exits);
      exits = r.exits;
      if (r.lt && this.nodes.length > before) items.push(r.lt);
    }
    return { exits, lt: { t: "seq", items } };
  }

  private one(s: Exclude<Stmt, { k: "stmt" }>, exits: Exit[]): { exits: Exit[]; lt: LT | null } {
    switch (s.k) {
      case "if": {
        const d = this.question(s.cond);
        this.link(exits, d);
        const t = this.seq(s.then, [{ from: d, label: YES }]);
        const e = s.else ? this.seq(s.else, [{ from: d, label: NO }]) : null;
        return { exits: [...t.exits, ...(e ? e.exits : [{ from: d, label: NO }])], lt: { t: "if", d, then: t.lt, else: e && e.lt } };
      }
      case "switch": {
        // a chain of questions: «x == 1 ؟» نعم → its steps; لا → the next question … the last «لا» → «default»
        const chain = (k: number): Stmt[] | null => k < s.cases.length
          ? [{ k: "if", line: s.line, cond: s.cases[k].conds.join(this.lang === "python" ? " or " : " || "), then: s.cases[k].body, else: chain(k + 1) }]
          : s.dflt;
        const stmts = chain(0);
        if (!stmts) return { exits, lt: null };
        // C#'s «break» ends the switch; Python's «match» has none (a «break» in it ends the loop)
        const frame: Frame = { kind: "switch", breaks: [], continues: [] };
        if (this.lang === "csharp") this.frames.push(frame);
        const r = this.seq(stmts, exits);
        if (this.lang === "csharp") this.frames.pop();
        return { exits: [...r.exits, ...frame.breaks], lt: r.lt };
      }
      case "while": case "each": case "for": {
        const pre: LT[] = [];
        if (s.k === "for" && s.init.length) {
          const id = this.node("process", s.init.join(JOIN));
          this.link(exits, id);
          exits = [{ from: id, label: "" }];
          pre.push({ t: "node", id });
        }
        const d = this.question(s.k === "each" ? "بقي " + isolate(s.item) + " في " + isolate(s.coll) : s.cond);
        this.link(exits, d);
        const frame: Frame = { kind: "loop", breaks: [], continues: [] };
        this.frames.push(frame);
        const b = this.seq(s.body, [{ from: d, label: YES }]);
        this.frames.pop();
        let back = [...b.exits, ...frame.continues];
        const body = b.lt as { t: "seq"; items: LT[] };
        if (s.k === "for" && s.update.length) {
          const u = this.node("process", s.update.join(JOIN));
          this.link(back, u);
          back = [{ from: u, label: "" }];
          body.items.push({ t: "node", id: u });
        }
        this.link(back, d);
        let out: Exit[] = [{ from: d, label: NO }];
        const items: LT[] = [...pre, { t: "loop", d, body }];
        if (s.orElse?.length) { const e = this.seq(s.orElse, out); out = e.exits; items.push(e.lt); }
        return { exits: [...out, ...frame.breaks], lt: { t: "seq", items } };
      }
      case "doWhile": {
        const mark = this.nodes.length;
        const frame: Frame = { kind: "loop", breaks: [], continues: [] };
        this.frames.push(frame);
        // the body first: its first step is where «نعم» goes back to
        const b = this.seq(s.body, exits);
        this.frames.pop();
        const d = this.question(s.cond);
        this.link([...b.exits, ...frame.continues], d);
        const first = this.nodes.length > mark + 1 ? this.nodes[mark].id : d;
        this.link([{ from: d, label: YES }], first);
        if (first === d) this.problems.push({ line: s.line, message: "حلقة «do» بلا خطوات." });
        return { exits: [{ from: d, label: NO }, ...frame.breaks], lt: { t: "doLoop", body: b.lt, d } };
      }
      case "return": case "stop": {
        let id: string | null = null;
        if (s.k === "stop" || s.value) {
          id = this.node("process", s.k === "stop" ? s.text : "أرجع " + isolate(s.value));
          this.link(exits, id);
        }
        this.returns.push(...(id ? [{ from: id, label: "" }] : exits));
        return { exits: [], lt: id ? { t: "node", id } : null };
      }
      case "break": case "continue": {
        const frame = [...this.frames].reverse().find(f => s.k === "break" || f.kind === "loop");
        if (!frame) { this.problems.push({ line: s.line, message: "«" + s.k + "» خارج أي حلقة." }); return { exits, lt: null }; }
        (s.k === "break" ? frame.breaks : frame.continues).push(...exits);
        return { exits: [], lt: null };
      }
    }
  }
  /** The function from «ابدأ» to «انتهِ», in columns; `cuts`: the top-level items a new column starts at. */
  build(fn: FlowFunction, title: string, cuts: ReadonlySet<number>): { columns: LT[][]; items: LT[] } {
    const start = this.node("start", title);
    const r = this.seq(fn.body, [{ from: start, label: "" }], cuts);
    const end = this.node("end", "انتهِ");
    this.link([...r.exits, ...this.returns], end);
    const items = (r.lt as { items: LT[] }).items;
    const columns: LT[][] = [[{ t: "node", id: start }]];
    for (const it of items) { if (it.t === "cut") columns.push([]); else columns[columns.length - 1].push(it); }
    columns[columns.length - 1].push({ t: "node", id: end });
    return { columns, items };
  }
}

/** A laid-out block: its extent around its middle line (x = 0) and its height; `place` puts it with its middle at `cx`, its top at `y`. */
type Block = { minX: number; maxX: number; h: number; place: (cx: number, y: number) => void };
function blockOf(lt: LT, doc: DiagramDoc, byId: ReadonlyMap<string, DNode>): Block {
  const leaf = (id: string): Block => {
    const n = byId.get(id)!;
    const b = layoutNode(doc, n)!;
    n.w = Math.max(n.w, b.w); n.h = Math.max(n.h, b.h);
    const w = n.w, h = n.h;
    return { minX: -w / 2, maxX: w / 2, h, place: (cx, y) => { n.x = Math.round(cx - w / 2); n.y = Math.round(y); } };
  };
  const stack = (parts: Block[]): Block => ({
    minX: Math.min(0, ...parts.map(p => p.minX)), maxX: Math.max(0, ...parts.map(p => p.maxX)),
    h: parts.reduce((s, p) => s + p.h, 0) + V * Math.max(0, parts.length - 1),
    place: (cx, y) => { for (const p of parts) { p.place(cx, y); y += p.h + V; } },
  });
  switch (lt.t) {
    case "node": return leaf(lt.id);
    case "cut": return { minX: 0, maxX: 0, h: 0, place: () => {} };
    case "seq": return stack(lt.items.map(x => blockOf(x, doc, byId)));
    case "if": {
      const d = leaf(lt.d), t = blockOf(lt.then, doc, byId), e = lt.else ? blockOf(lt.else, doc, byId) : null;
      const empty = (b: Block | null) => !b || b.h === 0;
      // «نعم» on the left, «لا» on the right; with no «else» steps, «لا» goes straight down the middle
      const tx = empty(t) ? 0 : Math.min(-G / 2 - t.maxX, d.minX - 16);
      const ex = empty(e) ? 0 : Math.max(G / 2 - e!.minX, d.maxX + 16);
      const gap = V * 0.6;
      return {
        minX: Math.min(d.minX, empty(t) ? 0 : tx + t.minX), maxX: Math.max(d.maxX, empty(e) ? 0 : ex + e!.maxX),
        h: d.h + gap + Math.max(empty(t) ? 0 : t.h, empty(e) ? 0 : e!.h),
        place: (cx, y) => { d.place(cx, y); if (!empty(t)) t.place(cx + tx, y + d.h + gap); if (!empty(e)) e!.place(cx + ex, y + d.h + gap); },
      };
    }
    case "loop": {
      const d = leaf(lt.d), b = blockOf(lt.body, doc, byId);
      // room on the left for the way back up, on the right for «لا»
      return {
        minX: Math.min(d.minX, b.minX) - LANE, maxX: Math.max(d.maxX, b.maxX) + LANE, h: d.h + V + b.h,
        place: (cx, y) => { d.place(cx, y); b.place(cx, y + d.h + V); },
      };
    }
    case "doLoop": {
      const b = blockOf(lt.body, doc, byId), d = leaf(lt.d);
      return {
        minX: Math.min(d.minX, b.minX) - LANE, maxX: Math.max(d.maxX, b.maxX), h: b.h + V + d.h,
        place: (cx, y) => { b.place(cx, y); d.place(cx, y + b.h + V); },
      };
    }
  }
}

/** Which function is drawn: «Main» / «main»; else the program's own statements; else the first function. */
function pick(read: FlowRead): { fn: FlowFunction; title: string } | null {
  const main = read.functions.find(f => f.name === "Main" || f.name === "main");
  if (main) return { fn: main, title: "ابدأ" };
  if (read.top.length) return { fn: { name: "", params: "", line: read.top[0].line, body: read.top }, title: "ابدأ" };
  const f = read.functions[0];
  // Python's type hints are left out of the oval: «def area(r: float)» → «ابدأ area(r)»
  return f ? { fn: f, title: "ابدأ " + isolate(f.name + "(" + (read.lang === "python" ? f.params.replace(/\s*:\s*[^,=]+/g, "") : f.params) + ")") } : null;
}

/** The code → its flowchart (null when nothing could be drawn; the learner is told why). */
export function codeToFlowchart(code: string): FlowDrawing {
  if (code.length > FLOW_LIMITS.chars) return { doc: null, summary: "", problems: [{ line: 1, message: "الكود أطول من " + FLOW_LIMITS.chars.toLocaleString("en") + " حرف: الصق الدالة التي تريد رسمها فقط." }] };
  const read = readFunctions(code);
  const chosen = pick(read);
  if (!chosen) return { doc: null, summary: "", problems: [...read.problems, { line: 1, message: "لم أجد دالة ولا خطوات أرسمها. الصق دالة كاملة، مثل static void Main() { … } أو def main(): …" }] };
  const { fn, title } = chosen;
  const names = new Set(read.functions.map(f => f.name));
  const others = read.functions.filter(f => f !== fn).map(f => f.name);
  const problems = [...read.problems];
  if (others.length) problems.push({ line: fn.line, message: "رُسمت " + (fn.name ? "الدالة «" + fn.name + "»" : "خطوات البرنامج") + " فقط. في الكود " + (others.length === 1 ? "دالة أخرى" : "دوال أخرى") + ": " + others.slice(0, 6).join("، ") + (others.length > 6 ? "…" : "") + ". لرسم واحدة منها الصقها وحدها." });

  const make = (splits: ReadonlySet<number>) => {
    const b = new Builder(read.lang, names);
    const r = b.build(fn, title, splits);
    return { b, ...r };
  };
  const tooBig = (b: Builder) => b.nodes.length > Math.min(FLOW_LIMITS.steps, DIAGRAM_LIMITS.nodes) || b.edges.length > DIAGRAM_LIMITS.edges;
  const fail = (message: string): FlowDrawing => ({ doc: null, summary: "", problems: [...problems, { line: fn.line, message }] });

  // first as one column: where does it need to continue in the next one?
  let built = make(new Set());
  if (tooBig(built.b)) return fail("الدالة أطول من أن تُرسم في مخطط واحد: قسّمها إلى دوال أصغر وارسم كل دالة وحدها.");
  const room = DIAGRAM_LIMITS.canvasH - 2 * MARGIN;
  {
    const doc: DiagramDoc = { kind: "flowchart", nodes: built.b.nodes, edges: built.b.edges };
    const byId = new Map(doc.nodes.map(n => [n.id, n]));
    const all = built.columns[0].map(lt => blockOf(lt, doc, byId));
    if (all.reduce((s, x) => s + x.h, 0) + V * (all.length - 1) > room) {
      // each top-level item's height; a new column wherever the next one would not fit, keeping room for the connector (and «انتهِ»)
      const startH = all[0].h, endH = all[all.length - 1].h, CON = 44 + V;
      const hs = built.items.map(lt => blockOf(lt, doc, byId).h);
      const cuts = new Set<number>();
      let used = startH;
      hs.forEach((h, k) => {
        const last = k === hs.length - 1;
        if (k > 0 && used + V + h + (last ? V + endH : CON) > room) { cuts.add(k); used = CON - V; }
        used += V + h;
      });
      built = make(cuts);
      if (tooBig(built.b)) return fail("الدالة أطول من أن تُرسم في مخطط واحد: قسّمها إلى دوال أصغر وارسم كل دالة وحدها.");
    }
  }
  const final: DiagramDoc = { kind: "flowchart", nodes: built.b.nodes, edges: built.b.edges };
  const byId = new Map(final.nodes.map(n => [n.id, n]));
  const cols = built.columns.map(c => blockOf({ t: "seq", items: c }, final, byId));
  if (cols.some(c => c.h > room)) return fail("في الدالة جزء واحد (حلقة أو شرط) أطول من صفحة المخطط: انقل بعض خطواته إلى دالة أخرى وارسمها وحدها.");
  let x = MARGIN;
  for (const c of cols) { c.place(x - c.minX, MARGIN); x += c.maxX - c.minX + G; }
  if (x - G + MARGIN > DIAGRAM_LIMITS.canvasW) return fail("الدالة أعرض من صفحة المخطط: قسّمها إلى دوال أصغر وارسم كل دالة وحدها.");
  problems.push(...built.b.problems);

  const decisions = final.nodes.filter(n => n.type === "decision").length;
  const summary = "رُسم مخطط التدفّق " + (fn.name ? "للدالة «" + fn.name + "»" : "للبرنامج") + " (" + (read.lang === "csharp" ? "C#" : "Python") + "): الأشكال " + final.nodes.length +
    "، والقرارات " + decisions + (cols.length > 1 ? "، في " + cols.length + " أعمدة يصل بينها الموصل" : "") + ".";
  return { doc: final, summary, problems: dedupe(problems) };
}
const dedupe = (ps: FlowProblem[]) => ps.filter((p, i) => ps.findIndex(q => q.line === p.line && q.message === p.message) === i);
