// DS-A1 — a small interpreter for the C# SUBSET the data-structures course uses, for the AUTHORING tool only (never shipped to
// the browser). It runs a program of the course and RECORDS it step by step: the line that ran, one Arabic sentence, the call
// stack with its variables, the structures (Stack / Queue / Node / BinNode / objects) and the output so far. The recorded steps
// are the data the «ds-trace» activity shows. Every traced program is also compiled and run by the real C# compiler
// (scripts/ds-course/prove-dotnet.mjs); ds-course.proof.test.ts requires the two outputs to be equal, so the interpreter is never
// trusted on its own word.
//
// Supported: static methods, classes with fields / constructors / instance methods, int / double / bool / char / string, arrays,
// if / else, while, do-while, for, return, break, continue, ref parameters, the usual operators, Math, Console.Write(Line),
// Console.ReadLine, int.Parse, and the course's library (Node<T>, BinNode<T>, Stack<T>, Queue<T>) built in.
// Anything else is a build ERROR (CsError) — never a guess.

export class CsError extends Error {
  constructor(message, line) { super(line ? "line " + line + ": " + message : message); this.line = line; }
}
/** A run-time failure of the traced program itself (null reference, Pop on an empty stack …). */
export class CsRuntimeError extends CsError {}

// ── tokens ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const OPS = ["++", "--", "+=", "-=", "*=", "/=", "%=", "==", "!=", "<=", ">=", "&&", "||", "=>", "+", "-", "*", "/", "%", "=", "<", ">", "!", "?", ":", ".", ",", ";", "(", ")", "{", "}", "[", "]"];
export function tokenize(src) {
  const out = [];
  let i = 0, line = 1;
  const push = (t, v, start) => out.push({ t, v, line, pos: start, end: i });
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); if (e < 0) throw new CsError("unterminated comment", line); line += src.slice(i, e).split("\n").length - 1; i = e + 2; continue; }
    const start = i;
    if (/[A-Za-z_]/.test(c)) { while (i < src.length && /\w/.test(src[i])) i++; push("id", src.slice(start, i), start); continue; }
    if (/\d/.test(c)) {
      while (i < src.length && /\d/.test(src[i])) i++;
      let dbl = false;
      if (src[i] === "." && /\d/.test(src[i + 1] ?? "")) { dbl = true; i++; while (i < src.length && /\d/.test(src[i])) i++; }
      const text = src.slice(start, i);
      if (/[dDfF]/.test(src[i] ?? "")) { dbl = true; i++; }
      push(dbl ? "dbl" : "int", Number(text), start);
      continue;
    }
    if (c === '"' || c === "'") {
      let s = ""; i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\n") throw new CsError("unterminated literal", line);
        if (src[i] === "\\") { const n = src[i + 1]; s += n === "n" ? "\n" : n === "t" ? "\t" : n === "0" ? "\0" : n; i += 2; } else s += src[i++];
      }
      if (i >= src.length) throw new CsError("unterminated literal", line);
      i++;
      if (c === "'") { if ([...s].length !== 1) throw new CsError("bad char literal", line); push("chr", s, start); } else push("str", s, start);
      continue;
    }
    const op = OPS.find(o => src.startsWith(o, i));
    if (!op) throw new CsError("unexpected character " + JSON.stringify(c), line);
    i += op.length;
    push("op", op, start);
  }
  out.push({ t: "eof", v: "", line, pos: i, end: i });
  return out;
}

// ── parser ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const MODIFIERS = new Set(["public", "private", "protected", "internal", "static", "override", "virtual", "readonly", "sealed"]);
const PRIMS = new Set(["int", "double", "bool", "char", "string", "long", "float", "object"]);
const LIBRARY = new Set(["Node", "BinNode", "Stack", "Queue"]);
const ASSIGN = new Set(["=", "+=", "-=", "*=", "/=", "%="]);
const BIN = [["||"], ["&&"], ["==", "!="], ["<", ">", "<=", ">="], ["+", "-"], ["*", "/", "%"]];

export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const classNames = new Set(LIBRARY);
  for (let i = 0; i < toks.length - 1; i++) if (toks[i].t === "id" && toks[i].v === "class" && toks[i + 1].t === "id") classNames.add(toks[i + 1].v);
  const peek = (k = 0) => toks[Math.min(p + k, toks.length - 1)];
  const is = (v, k = 0) => { const t = peek(k); return (t.t === "op" || t.t === "id") && t.v === v; };
  const eat = v => (is(v) ? (p++, true) : false);
  const fail = (msg, t = peek()) => { throw new CsError(msg + " (found " + JSON.stringify(t.v) + ")", t.line); };
  const expect = v => { if (!eat(v)) fail("expected " + JSON.stringify(v)); return toks[p - 1]; };
  const ident = () => { const t = peek(); if (t.t !== "id") fail("expected a name"); p++; return t.v; };

  /** Type: Name [<Type, …>] {[]}. Returns null (position unchanged) when the tokens are not a type. */
  function tryType() {
    const save = p;
    if (peek().t !== "id") return null;
    const name = toks[p++].v;
    const args = [];
    if (is("<")) {
      p++;
      for (;;) { const a = tryType(); if (!a) { p = save; return null; } args.push(a); if (eat(",")) continue; break; }
      if (!eat(">")) { p = save; return null; }
    }
    let rank = 0;
    while (is("[") && is("]", 1)) { p += 2; rank++; }
    return { name, args, rank };
  }
  const type = () => tryType() ?? fail("expected a type");

  function program() {
    const members = [];
    while (peek().t !== "eof") members.push(...member(null));
    return members;
  }
  /** One member: a class, a constructor, a method or field(s). */
  function member(className) {
    let isStatic = false;
    while (peek().t === "id" && MODIFIERS.has(peek().v)) { if (peek().v === "static") isStatic = true; p++; }
    if (is("class")) {
      p++;
      const name = ident();
      if (is("<")) { p++; while (!eat(">")) p++; }
      expect("{");
      const inner = [];
      while (!is("}")) inner.push(...member(name));
      expect("}");
      return [{ k: "class", name, members: inner }];
    }
    const line = peek().line;
    if (className && peek().t === "id" && peek().v === className && is("(", 1)) {
      p++;
      const params = paramList();
      const body = block();
      return [{ k: "ctor", cls: className, params, body, line, endLine: body.endLine }];
    }
    const ret = type();
    const name = ident();
    if (is("(")) {
      const params = paramList();
      const body = block();
      return [{ k: "method", cls: className, isStatic: isStatic || !className, name, ret, params, body, line, endLine: body.endLine }];
    }
    const fields = [];
    let nm = name;
    for (;;) {
      fields.push({ k: "field", cls: className, isStatic, type: ret, name: nm, init: eat("=") ? expr() : null, line });
      if (eat(",")) { nm = ident(); continue; }
      break;
    }
    expect(";");
    return fields;
  }
  function paramList() {
    expect("(");
    const out = [];
    while (!is(")")) {
      const ref = eat("ref") || eat("out");
      const t = type();
      out.push({ ref, type: t, name: ident() });
      if (!eat(",")) break;
    }
    expect(")");
    return out;
  }
  function block() {
    const line = expect("{").line;
    const body = [];
    while (!is("}")) body.push(statement());
    const endLine = expect("}").line;
    return { k: "block", body, line, endLine };
  }
  function declOrExpr(needSemi) {
    const save = p, line = peek().line;
    const t = tryType();
    if (t && peek().t === "id" && (is("=", 1) || is(";", 1) || is(",", 1))) {
      const vars = [];
      for (;;) { const name = ident(); vars.push({ name, init: eat("=") ? (is("{") ? arrayInit() : expr()) : null }); if (!eat(",")) break; }
      if (needSemi) expect(";");
      return { k: "decl", type: t, vars, line };
    }
    p = save;
    const e = expr();
    if (needSemi) expect(";");
    return { k: "expr", e, line };
  }
  function arrayInit() {
    const t0 = expect("{");
    const items = [];
    while (!is("}")) { items.push(expr()); if (!eat(",")) break; }
    expect("}");
    return { k: "arrlit", items, line: t0.line, s: t0.pos, e: toks[p - 1].end };
  }
  function statement() {
    const t = peek(), line = t.line;
    if (is("{")) return block();
    if (eat(";")) return { k: "empty", line };
    if (eat("if")) { expect("("); const c = expr(); expect(")"); const then = statement(); const els = eat("else") ? statement() : null; return { k: "if", c, then, els, line }; }
    if (eat("while")) { expect("("); const c = expr(); expect(")"); return { k: "while", c, body: statement(), line }; }
    if (eat("do")) { const body = statement(); const wl = expect("while").line; expect("("); const c = expr(); expect(")"); expect(";"); return { k: "do", c, body, line, condLine: wl }; }
    if (eat("for")) {
      expect("(");
      const init = is(";") ? null : declOrExpr(false);
      expect(";");
      const c = is(";") ? null : expr();
      expect(";");
      const update = [];
      while (!is(")")) { update.push(expr()); if (!eat(",")) break; }
      expect(")");
      return { k: "for", init, c, update, body: statement(), line };
    }
    if (eat("return")) { const e = is(";") ? null : expr(); expect(";"); return { k: "return", e, line }; }
    if (eat("break")) { expect(";"); return { k: "break", line }; }
    if (eat("continue")) { expect(";"); return { k: "continue", line }; }
    if (t.t === "id" && ["switch", "foreach", "try", "throw", "goto", "using"].includes(t.v)) fail("«" + t.v + "» is not supported by the course interpreter");
    return declOrExpr(true);
  }

  // expressions — every node carries its source span (s, e) and line
  const node = (start, n) => ({ ...n, line: start.line, s: start.pos, e: toks[p - 1].end });
  function expr() {
    const start = peek();
    const left = ternary();
    const t = peek();
    if (t.t === "op" && ASSIGN.has(t.v)) {
      if (!["name", "member", "index"].includes(left.k)) fail("cannot assign to this expression");
      p++;
      const value = expr();
      return node(start, { k: "assign", op: t.v, target: left, value });
    }
    return left;
  }
  function ternary() {
    const start = peek();
    const c = binary(0);
    if (eat("?")) { const a = expr(); expect(":"); const b = expr(); return node(start, { k: "cond", c, a, b }); }
    return c;
  }
  function binary(level) {
    if (level === BIN.length) return unary();
    const start = peek();
    let left = binary(level + 1);
    for (;;) {
      const t = peek();
      if (t.t !== "op" || !BIN[level].includes(t.v)) return left;
      p++;
      const right = binary(level + 1);
      left = node(start, { k: "bin", op: t.v, a: left, b: right });
    }
  }
  function unary() {
    const start = peek();
    if (start.t === "op" && ["!", "-", "+"].includes(start.v)) { p++; return node(start, { k: "un", op: start.v, a: unary() }); }
    if (start.t === "op" && (start.v === "++" || start.v === "--")) { p++; return node(start, { k: "incdec", op: start.v, prefix: true, target: unary() }); }
    if (is("(")) {   // a cast: ( type ) followed by something that starts an operand
      const save = p;
      p++;
      const t = tryType();
      if (t && is(")") && (PRIMS.has(t.name) || classNames.has(t.name))) {
        const after = peek(1);
        if (after.t !== "op" || ["(", "!", "-"].includes(after.v)) { p++; return node(start, { k: "cast", type: t, a: unary() }); }
      }
      p = save;
    }
    return postfix();
  }
  function args() {
    expect("(");
    const out = [];
    while (!is(")")) { const ref = eat("ref") || eat("out"); const e = expr(); out.push(ref ? { ...e, ref: true } : e); if (!eat(",")) break; }
    expect(")");
    return out;
  }
  function postfix() {
    const start = peek();
    let e = primary();
    for (;;) {
      if (is("(")) { e = node(start, { k: "call", f: e, args: args() }); continue; }
      if (eat(".")) { e = node(start, { k: "member", o: e, name: ident() }); continue; }
      if (eat("[")) { const i = expr(); expect("]"); e = node(start, { k: "index", o: e, i }); continue; }
      const t = peek();
      if (t.t === "op" && (t.v === "++" || t.v === "--")) { p++; e = node(start, { k: "incdec", op: t.v, prefix: false, target: e }); continue; }
      return e;
    }
  }
  function primary() {
    const t = peek();
    if (t.t === "int") { p++; return node(t, { k: "lit", v: t.v }); }
    if (t.t === "dbl") { p++; return node(t, { k: "lit", v: new CsDouble(t.v) }); }
    if (t.t === "str") { p++; return node(t, { k: "lit", v: t.v }); }
    if (t.t === "chr") { p++; return node(t, { k: "lit", v: new CsChar(t.v) }); }
    if (eat("(")) { const e = expr(); expect(")"); return node(t, { k: "paren", a: e }); }
    if (t.t !== "id") fail("unexpected token");
    if (t.v === "true" || t.v === "false") { p++; return node(t, { k: "lit", v: t.v === "true" }); }
    if (t.v === "null") { p++; return node(t, { k: "lit", v: null }); }
    if (t.v === "new") {
      p++;
      const save = p;
      if (peek().t !== "id") fail("expected a type after new");
      const name = toks[p++].v;
      const targs = [];
      if (is("<")) { p++; for (;;) { targs.push(type()); if (!eat(",")) break; } expect(">"); }
      if (is("[")) {   // new int[n]  /  new int[] { … }
        p++;
        const size = is("]") ? null : expr();
        expect("]");
        const init = is("{") ? arrayInit() : null;
        if (!size && !init) fail("array needs a size or an initializer");
        return node(t, { k: "newarr", elem: { name, args: targs, rank: 0 }, size, init });
      }
      if (!is("(")) { p = save; fail("expected ( after the type"); }
      return node(t, { k: "new", type: { name, args: targs, rank: 0 }, args: args() });
    }
    p++;
    return node(t, { k: "name", name: t.v });
  }
  return { members: program(), classNames };
}

// ── values ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export class CsDouble { constructor(v) { this.v = v; } }
export class CsChar { constructor(c) { this.c = c; } }
class CsArray { constructor(id, items) { this.id = id; this.items = items; } }
class CsObject { constructor(id, cls) { this.id = id; this.cls = cls; this.fields = new Map(); } }
class LStack { constructor(id) { this.id = id; this.items = []; } }           // top = last
class LQueue { constructor(id) { this.id = id; this.items = []; } }           // head = first
class LNode { constructor(id, value, next) { this.id = id; this.value = value; this.next = next; } }
class LBin { constructor(id, left, value, right) { this.id = id; this.left = left; this.value = value; this.right = right; } }

class Signal { constructor(kind, value) { this.kind = kind; this.value = value; } }
const INT_MAX = 2147483647;
const isNum = v => typeof v === "number" || v instanceof CsDouble;
const num = v => (v instanceof CsDouble ? v.v : v instanceof CsChar ? v.c.codePointAt(0) : v);
const zero = t => (t.rank ? null : t.name === "int" || t.name === "long" ? 0 : t.name === "double" || t.name === "float" ? new CsDouble(0) : t.name === "bool" ? false : t.name === "char" ? new CsChar("\0") : null);
const fmtDouble = v => (Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : String(v));

/** Runs a program and records it. `shown` = the number of lines the learner sees (steps on later lines are the hidden driver). */
export function run(src, opts = {}) {
  const { members } = parse(src);
  const shown = opts.shown ?? src.split("\n").length;
  const maxSteps = opts.maxSteps ?? 400;
  const stdin = (opts.stdin ?? "").split("\n");
  const sourceOf = n => src.slice(n.s, n.e).replace(/\s+/g, " ");
  const funcs = new Map(), classes = new Map();
  const reg = m => {
    if (m.k === "class") {
      const c = { name: m.name, fields: [], ctors: [], methods: new Map(), statics: new Map() };
      classes.set(m.name, c);
      for (const x of m.members) {
        if (x.k === "class") reg(x);
        else if (x.k === "field") { if (x.isStatic) throw new CsError("static fields are not supported", x.line); c.fields.push(x); }
        else if (x.k === "ctor") c.ctors.push(x);
        else if (x.isStatic) addFunc(x);
        else { if (!c.methods.has(x.name)) c.methods.set(x.name, []); c.methods.get(x.name).push(x); }
      }
    } else if (m.k === "method") addFunc(m);
    else throw new CsError("a field outside a class", m.line);
  };
  const addFunc = m => { if (!funcs.has(m.name)) funcs.set(m.name, []); funcs.get(m.name).push(m); };
  members.forEach(m => reg(m));

  let out = "", nextId = 1, events = [], stepsLeft = 200000;
  const frames = [];       // { name, scopes: [Map name → slot], self }
  const steps = [];
  const newId = () => nextId++;

  // display ------------------------------------------------------------------------------------------------------------
  /** As C# prints it. */
  function str(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "True" : "False";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return v;
    if (v instanceof CsDouble) return fmtDouble(v.v);
    if (v instanceof CsChar) return v.c;
    if (v instanceof LStack) return "[" + [...v.items].reverse().map(str).join(",") + "]";
    if (v instanceof LQueue) return "[" + v.items.map(str).join(",") + "]";
    if (v instanceof LNode || v instanceof LBin) return str(v.value);
    if (v instanceof CsArray) return "System.Array";
    if (v instanceof CsObject) { const m = v.cls.methods.get("ToString")?.find(x => x.params.length === 0); return m ? str(quiet(() => invoke(m, [], v, m.line))) : v.cls.name; }
    return String(v);
  }
  /** As a C# literal, for notes and memory boxes. */
  function lit(v) {
    if (v === null) return "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return "\"" + v + "\"";
    if (v instanceof CsChar) return "'" + v.c + "'";
    if (v instanceof CsArray) return "{" + v.items.map(lit).join(", ") + "}";
    if (v instanceof CsObject) return cell(v);
    return str(v);
  }
  /** Inside a structure's cell. */
  function cell(v) {
    if (v === null) return "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (v instanceof CsObject) return v.cls.methods.has("ToString") ? str(v) : "(" + [...v.fields.values()].map(f => cell(f.value)).join(", ") + ")";
    return str(v);
  }
  /** A reference, in words, for a note. */
  function describe(v) {
    if (v === null) return "`null`";
    if (v instanceof LNode || v instanceof LBin) return "الخلية التي قيمتها `" + cell(v.value) + "`";
    if (v instanceof LStack) return "الراصّة `" + str(v) + "`";
    if (v instanceof LQueue) return "الدور `" + str(v) + "`";
    return "`" + lit(v) + "`";
  }
  const isRef = v => v instanceof LNode || v instanceof LBin || v instanceof LStack || v instanceof LQueue || v instanceof CsObject;

  // recording ----------------------------------------------------------------------------------------------------------
  let muted = 0;
  function quiet(fn) { muted++; const ev = events; events = []; try { return fn(); } finally { muted--; events = ev; } }
  function snapVal(v) {
    if (v === null || v === undefined) return { t: "null" };
    if (isRef(v)) return { t: "ref", id: v.id };
    if (v instanceof CsArray) return { t: "arr", items: v.items.map(cell) };
    return { t: "v", s: lit(v) };
  }
  function snapshot() {
    const objs = new Map();
    const visit = v => {
      if (!isRef(v) || objs.has(v.id)) return;
      if (v instanceof LStack) objs.set(v.id, { id: v.id, k: "stack", items: [...v.items].reverse().map(cell) });
      else if (v instanceof LQueue) objs.set(v.id, { id: v.id, k: "queue", items: v.items.map(cell) });
      else if (v instanceof LNode) { objs.set(v.id, { id: v.id, k: "node", v: cell(v.value), next: v.next ? v.next.id : null }); visit(v.next); }
      else if (v instanceof LBin) { objs.set(v.id, { id: v.id, k: "bin", v: cell(v.value), l: v.left ? v.left.id : null, r: v.right ? v.right.id : null }); visit(v.left); visit(v.right); }
      else if (v instanceof CsObject) { const o = { id: v.id, k: "obj", type: v.cls.name, fields: [] }; objs.set(v.id, o); for (const [n, f] of v.fields) { o.fields.push([n, snapVal(f.value)]); visit(f.value); } }
    };
    const fr = frames.map(f => {
      const vars = [];
      if (f.self) { vars.push(["this", snapVal(f.self)]); visit(f.self); }
      for (const sc of f.scopes) for (const [n, slot] of sc) { const v = slot.ref ? slot.ref.get() : slot.value; if (slot.unset) continue; vars.push([n, snapVal(v)]); visit(v); if (v instanceof CsArray) v.items.forEach(visit); }
      return { name: f.name, vars };
    });
    return { frames: fr, objs: [...objs.values()].sort((a, b) => a.id - b.id) };
  }
  let pending = null;   // what the hidden driver did after the last step the learner saw (it becomes the closing step)
  function rec(line, note) {
    if (muted) return;
    const ev = events; events = [];
    const text = [...ev, note].filter(Boolean).join(" ");
    if (line > shown) { pending = { notes: [...(pending?.notes ?? []), ...ev], snap: snapshot(), out }; return; }   // the hidden driver: not a step of the shown program
    pending = null;
    if (steps.length >= maxSteps) throw new CsError("the trace is longer than " + maxSteps + " steps", line);
    steps.push({ line, note: text, ...snapshot(), out });
  }
  const say = text => { if (!muted) events.push(text); };

  // scopes -------------------------------------------------------------------------------------------------------------
  const frame = () => frames[frames.length - 1];
  function lookup(name) {
    const f = frame();
    for (let i = f.scopes.length - 1; i >= 0; i--) if (f.scopes[i].has(name)) return f.scopes[i].get(name);
    if (f.self instanceof CsObject && f.self.fields.has(name)) return f.self.fields.get(name);
    return null;
  }
  const coerce = (t, v) => (t && !t.rank && (t.name === "double" || t.name === "float") && typeof v === "number" ? new CsDouble(v) : v);
  function declare(name, t, v, unset = false) {
    const sc = frame().scopes[frame().scopes.length - 1];
    if (sc.has(name)) throw new CsError("«" + name + "» is declared twice");
    sc.set(name, { type: t, value: coerce(t, v), unset });
  }

  // library ------------------------------------------------------------------------------------------------------------
  const nameOf = e => (e && e.k === "name" ? " `" + e.name + "`" : "");
  const need = (v, line, what) => { if (v === null || v === undefined) throw new CsRuntimeError("NullReferenceException: " + what + " على null", line); return v; };
  function libraryNew(t, a, line) {
    const n = t.name;
    if (n === "Stack") { if (a.length) throw new CsError("Stack() takes no arguments", line); return new LStack(newId()); }
    if (n === "Queue") { if (a.length) throw new CsError("Queue() takes no arguments", line); return new LQueue(newId()); }
    if (n === "Node") {
      if (a.length < 1 || a.length > 2) throw new CsError("Node(value) or Node(value, next)", line);
      const v = coerce(t.args[0], a[0]);
      say("ننشئ خلية جديدة قيمتها `" + cell(v) + "`" + (a.length === 2 ? (a[1] ? "، تشير إلى " + describe(a[1]) : "، وبعدها `null`") : "") + ".");
      return new LNode(newId(), v, a.length === 2 ? a[1] : null);
    }
    if (n === "BinNode") {
      if (a.length !== 1 && a.length !== 3) throw new CsError("BinNode(value) or BinNode(left, value, right)", line);
      const v = coerce(t.args[0], a.length === 1 ? a[0] : a[1]);
      say("ننشئ خلية شجرة قيمتها `" + cell(v) + "`" + (a.length === 3 ? " مع ابنيها" : " بلا أبناء") + ".");
      return new LBin(newId(), a.length === 3 ? a[0] : null, v, a.length === 3 ? a[2] : null);
    }
    return undefined;
  }
  function libraryCall(o, name, a, line, recv) {
    const nm = nameOf(recv);
    const arity = n => { if (a.length !== n) throw new CsError(name + " takes " + n + " argument(s)", line); };
    if (o instanceof LStack) {
      switch (name) {
        case "Push": arity(1); o.items.push(a[0]); say("نُدخل `" + cell(a[0]) + "` إلى رأس الراصّة" + nm + "."); return undefined;
        case "Pop": { arity(0); if (!o.items.length) throw new CsRuntimeError("Pop من راصّة فارغة", line); const v = o.items.pop(); say("نُخرج `" + cell(v) + "` من رأس الراصّة" + nm + "."); return v; }
        case "Top": arity(0); if (!o.items.length) throw new CsRuntimeError("Top على راصّة فارغة", line); say("رأس الراصّة" + nm + " هو `" + cell(o.items.at(-1)) + "` (لا يخرج)."); return o.items.at(-1);
        case "IsEmpty": arity(0); return o.items.length === 0;
        case "ToString": arity(0); return str(o);
      }
    } else if (o instanceof LQueue) {
      switch (name) {
        case "Insert": arity(1); o.items.push(a[0]); say("نُدخل `" + cell(a[0]) + "` إلى نهاية الدور" + nm + "."); return undefined;
        case "Remove": { arity(0); if (!o.items.length) throw new CsRuntimeError("Remove من دور فارغ", line); const v = o.items.shift(); say("نُخرج `" + cell(v) + "` من رأس الدور" + nm + "."); return v; }
        case "Head": arity(0); if (!o.items.length) throw new CsRuntimeError("Head على دور فارغ", line); say("رأس الدور" + nm + " هو `" + cell(o.items[0]) + "` (لا يخرج)."); return o.items[0];
        case "IsEmpty": arity(0); return o.items.length === 0;
        case "ToString": arity(0); return str(o);
      }
    } else if (o instanceof LNode) {
      switch (name) {
        case "GetValue": arity(0); return o.value;
        case "GetNext": arity(0); return o.next;
        case "HasNext": arity(0); return o.next !== null;
        case "SetValue": arity(1); say("قيمة الخلية" + nm + " تتغيّر من `" + cell(o.value) + "` إلى `" + cell(a[0]) + "`."); o.value = a[0]; return undefined;
        case "SetNext": arity(1); if (a[0] !== null && !(a[0] instanceof LNode)) throw new CsError("SetNext needs a Node", line); say("الخلية" + nm + " (قيمتها `" + cell(o.value) + "`) تشير الآن إلى " + describe(a[0]) + "."); o.next = a[0]; return undefined;
        case "ToString": arity(0); return str(o);
      }
    } else if (o instanceof LBin) {
      switch (name) {
        case "GetValue": arity(0); return o.value;
        case "GetLeft": arity(0); return o.left;
        case "GetRight": arity(0); return o.right;
        case "HasLeft": arity(0); return o.left !== null;
        case "HasRight": arity(0); return o.right !== null;
        case "SetValue": arity(1); say("قيمة الخلية" + nm + " تتغيّر من `" + cell(o.value) + "` إلى `" + cell(a[0]) + "`."); o.value = a[0]; return undefined;
        case "SetLeft": arity(1); say("الابن الأيسر للخلية" + nm + " (قيمتها `" + cell(o.value) + "`) يصبح " + describe(a[0]) + "."); o.left = a[0]; return undefined;
        case "SetRight": arity(1); say("الابن الأيمن للخلية" + nm + " (قيمتها `" + cell(o.value) + "`) يصبح " + describe(a[0]) + "."); o.right = a[0]; return undefined;
        case "ToString": arity(0); return str(o);
      }
    }
    throw new CsError("unknown operation ." + name + "()", line);
  }
  function stringCall(s, name, a, line) {
    const n = a.map(num);
    switch (name) {
      case "Substring": if (n[0] < 0 || n[0] > s.length || (a.length > 1 && n[0] + n[1] > s.length)) throw new CsRuntimeError("Substring خارج حدود النص", line); return a.length > 1 ? s.substr(n[0], n[1]) : s.slice(n[0]);
      case "Split": return new CsArray(newId(), s.split(str(a[0])));
      case "IndexOf": return s.indexOf(str(a[0]));
      case "Contains": return s.includes(str(a[0]));
      case "ToUpper": return s.toUpperCase();
      case "ToLower": return s.toLowerCase();
      case "Equals": return s === a[0];
      case "ToString": return s;
    }
    throw new CsError("unknown string operation ." + name + "()", line);
  }
  function staticCall(cls, name, a, line) {
    const n = a.map(num), allInt = a.every(v => typeof v === "number");
    const d = v => new CsDouble(v);
    if (cls === "Math") {
      switch (name) {
        case "Abs": return allInt ? Math.abs(n[0]) : d(Math.abs(n[0]));
        case "Max": return allInt ? Math.max(n[0], n[1]) : d(Math.max(n[0], n[1]));
        case "Min": return allInt ? Math.min(n[0], n[1]) : d(Math.min(n[0], n[1]));
        case "Pow": return d(Math.pow(n[0], n[1]));
        case "Sqrt": return d(Math.sqrt(n[0]));
        case "Floor": return d(Math.floor(n[0]));
        case "Ceiling": return d(Math.ceil(n[0]));
      }
    } else if (cls === "Console") {
      if (name === "WriteLine" || name === "Write") {
        if (a.length > 1) throw new CsError("Console." + name + " with a format is not supported", line);
        const text = a.length ? str(a[0]) : "";
        out += text + (name === "WriteLine" ? "\n" : "");
        say(a.length ? "نطبع: `" + (text === "" ? " " : text.replace(/\n/g, " ↵ ")) + "`" + (name === "WriteLine" ? "" : " (بلا سطر جديد)") + "." : "نطبع سطرًا فارغًا.");
        return undefined;
      }
      if (name === "ReadLine") { if (!stdin.length) throw new CsRuntimeError("لا مدخلات كافية", line); const s = stdin.shift(); say("نقرأ من المدخلات: `" + s + "`."); return s; }
    } else if ((cls === "int" || cls === "Convert") && (name === "Parse" || name === "ToInt32")) {
      const s = str(a[0]).trim(); if (!/^-?\d+$/.test(s)) throw new CsRuntimeError("FormatException: «" + s + "» ليس عددًا صحيحًا", line); return Number(s);
    } else if (cls === "double" && name === "Parse") { return d(Number(str(a[0]))); }
    else if (cls === "char") {
      const c = a[0] instanceof CsChar ? a[0].c : "";
      switch (name) {
        case "IsDigit": return /^\d$/.test(c);
        case "IsLetter": return /^\p{L}$/u.test(c);
        case "IsUpper": return /^\p{Lu}$/u.test(c);
        case "IsLower": return /^\p{Ll}$/u.test(c);
        case "ToUpper": return new CsChar(c.toUpperCase());
        case "ToLower": return new CsChar(c.toLowerCase());
      }
    }
    throw new CsError("unknown operation " + cls + "." + name + "()", line);
  }

  // calls --------------------------------------------------------------------------------------------------------------
  function pick(list, argc, name, line) {
    const m = list?.find(x => x.params.length === argc);
    if (!m) throw new CsError("no operation " + name + " with " + argc + " parameter(s)", line);
    return m;
  }
  const silent = new Set(opts.quiet ?? []);
  /** A call; an operation named in `quiet` runs without steps of its own (the caller's line tells what it returned). */
  function invoke(m, argv, self, callLine) {
    if (m.k === "method" && silent.has(m.name) && !muted) return quiet(() => invoke(m, argv, self, callLine));
    if (frames.length > 60) throw new CsRuntimeError("StackOverflow: التراجعية لا تتوقّف", callLine);
    const isEntry = frames.length === 0;
    const f = { name: m.k === "ctor" ? m.cls : m.name === "__Run" ? "Main" : m.name, scopes: [new Map()], self };
    frames.push(f);
    if (!isEntry) m.params.forEach((prm, i) => { if (prm.ref) f.scopes[0].set(prm.name, { type: prm.type, ref: argv[i] }); else f.scopes[0].set(prm.name, { type: prm.type, value: coerce(prm.type, argv[i]) }); });
    const shownArgs = isEntry ? [] : m.params.map((prm, i) => (prm.ref ? "`" + prm.name + " = " + lit(argv[i].get()) + "`" : isRef(argv[i]) || argv[i] === null ? "`" + prm.name + "` = " + describe(argv[i]) : "`" + prm.name + " = " + lit(coerce(prm.type, argv[i])) + "`"));
    rec(m.line, isEntry ? "يبدأ البرنامج من العملية `Main`." : (m.k === "ctor" ? "تبدأ العملية البنائية `" : "تبدأ العملية `") + f.name + "`" + (shownArgs.length ? " مع " + shownArgs.join("، ") : "") + ".");
    let result;
    try {
      execBlock(m.body, false);
      if (m.k === "method" && m.ret.name !== "void") throw new CsError("«" + m.name + "» ended without return", m.endLine);
      rec(m.endLine, isEntry ? "ينتهي البرنامج." : "تنتهي العملية `" + f.name + "` ونعود إلى من استدعاها.");
    } catch (s) {
      if (!(s instanceof Signal) || s.kind !== "return") throw s;
      result = m.k === "method" ? coerce(m.ret, s.value) : undefined;
    } finally { frames.pop(); }
    return result;
  }

  // expressions --------------------------------------------------------------------------------------------------------
  function lvalue(e) {
    if (e.k === "paren") return lvalue(e.a);
    if (e.k === "name") {
      const slot = lookup(e.name);
      if (!slot) throw new CsError("unknown name «" + e.name + "»", e.line);
      return slot.ref ? slot.ref : { get: () => { if (slot.unset) throw new CsError("«" + e.name + "» is read before it gets a value", e.line); return slot.value; }, set: v => { slot.value = coerce(slot.type, v); slot.unset = false; } };
    }
    if (e.k === "member") {
      const o = e.o.k === "name" && e.o.name === "this" ? frame().self : ev(e.o);
      need(o, e.line, "." + e.name);
      if (!(o instanceof CsObject) || !o.fields.has(e.name)) throw new CsError("no field «" + e.name + "»", e.line);
      const slot = o.fields.get(e.name);
      return { get: () => slot.value, set: v => { slot.value = coerce(slot.type, v); } };
    }
    if (e.k === "index") {
      const o = need(ev(e.o), e.line, "[]"), i = num(ev(e.i));
      if (!(o instanceof CsArray)) throw new CsError("only arrays can be assigned by index", e.line);
      if (i < 0 || i >= o.items.length) throw new CsRuntimeError("IndexOutOfRangeException: الإندكس " + i + " خارج حدود المصفوفة", e.line);
      return { get: () => o.items[i], set: v => { o.items[i] = typeof o.items[i] === "object" && o.items[i] instanceof CsDouble && typeof v === "number" ? new CsDouble(v) : v; } };
    }
    throw new CsError("not assignable", e.line);
  }
  function arith(op, a, b, line) {
    if (op === "+" && (typeof a === "string" || typeof b === "string")) return str(a) + str(b);
    if (!(isNum(a) || a instanceof CsChar) || !(isNum(b) || b instanceof CsChar)) throw new CsError("operator " + op + " on non-numbers", line);
    const dbl = a instanceof CsDouble || b instanceof CsDouble, x = num(a), y = num(b);
    let r;
    switch (op) {
      case "+": r = x + y; break;
      case "-": r = x - y; break;
      case "*": r = x * y; break;
      case "/": if (!dbl && y === 0) throw new CsRuntimeError("DivideByZeroException: قسمة على صفر", line); r = dbl ? x / y : Math.trunc(x / y); break;
      case "%": if (!dbl && y === 0) throw new CsRuntimeError("DivideByZeroException: قسمة على صفر", line); r = x % y; break;
    }
    if (dbl) return new CsDouble(r);
    if (Math.abs(r) > INT_MAX) throw new CsError("int overflow (the course interpreter refuses it)", line);
    return r === 0 ? 0 : r;   // no negative zero
  }
  function equal(a, b) {
    if (a === null || b === null) return a === b;
    if (isNum(a) && isNum(b)) return num(a) === num(b);
    if (a instanceof CsChar && b instanceof CsChar) return a.c === b.c;
    if (a instanceof CsChar || b instanceof CsChar) return num(a) === num(b);
    return a === b;
  }
  function ev(e) {
    if (--stepsLeft < 0) throw new CsRuntimeError("البرنامج لا يتوقّف", e.line);
    switch (e.k) {
      case "lit": return e.v;
      case "paren": return ev(e.a);
      case "name": {
        if (e.name === "this") return frame().self;
        const slot = lookup(e.name);
        if (!slot) throw new CsError("unknown name «" + e.name + "»", e.line);
        if (slot.unset) throw new CsError("«" + e.name + "» is read before it gets a value", e.line);
        return slot.ref ? slot.ref.get() : slot.value;
      }
      case "arrlit": return new CsArray(newId(), e.items.map(ev));
      case "newarr": {
        if (e.init) return new CsArray(newId(), e.init.items.map(x => coerce(e.elem, ev(x))));
        const n = num(ev(e.size));
        if (n < 0 || n > 1000) throw new CsRuntimeError("حجم مصفوفة غير مقبول", e.line);
        return new CsArray(newId(), Array.from({ length: n }, () => zero(e.elem)));
      }
      case "new": {
        const a = e.args.map(ev);
        const lib = LIBRARY.has(e.type.name) ? libraryNew(e.type, a, e.line) : undefined;
        if (lib !== undefined) return lib;
        const cls = classes.get(e.type.name);
        if (!cls) throw new CsError("unknown class «" + e.type.name + "»", e.line);
        const o = new CsObject(newId(), cls);
        for (const f of cls.fields) o.fields.set(f.name, { type: f.type, value: zero(f.type) });
        if (cls.fields.some(f => f.init)) { frames.push({ name: cls.name, scopes: [new Map()], self: o }); try { for (const f of cls.fields) if (f.init) o.fields.get(f.name).value = coerce(f.type, ev(f.init)); } finally { frames.pop(); } }
        if (cls.ctors.length || a.length) invoke(pick(cls.ctors, a.length, "new " + cls.name, e.line), a, o, e.line);
        return o;
      }
      case "cast": {
        const v = ev(e.a), t = e.type.name;
        if (e.type.rank || !PRIMS.has(t)) return v;
        if (t === "int" || t === "long") { if (!(isNum(v) || v instanceof CsChar)) throw new CsError("(int) on a non-number", e.line); return Math.trunc(num(v)); }
        if (t === "double" || t === "float") return new CsDouble(num(v));
        if (t === "char") return new CsChar(String.fromCodePoint(num(v)));
        return v;
      }
      case "un": {
        const v = ev(e.a);
        if (e.op === "!") { if (typeof v !== "boolean") throw new CsError("! on a non-bool", e.line); return !v; }
        if (!isNum(v)) throw new CsError("unary " + e.op + " on a non-number", e.line);
        return e.op === "-" ? (v instanceof CsDouble ? new CsDouble(-v.v) : v === 0 ? 0 : -v) : v;
      }
      case "incdec": {
        const lv = lvalue(e.target), old = lv.get();
        if (!(isNum(old) || old instanceof CsChar)) throw new CsError(e.op + " on a non-number", e.line);
        const d = e.op === "++" ? 1 : -1;
        const next = old instanceof CsChar ? new CsChar(String.fromCodePoint(num(old) + d)) : arith("+", old, d, e.line);
        lv.set(next);
        return e.prefix ? next : old;
      }
      case "bin": {
        if (e.op === "&&" || e.op === "||") {
          const a = ev(e.a);
          if (typeof a !== "boolean") throw new CsError(e.op + " on a non-bool", e.line);
          if (e.op === "&&" ? !a : a) return a;
          const b = ev(e.b);
          if (typeof b !== "boolean") throw new CsError(e.op + " on a non-bool", e.line);
          return b;
        }
        const a = ev(e.a), b = ev(e.b);
        switch (e.op) {
          case "==": return equal(a, b);
          case "!=": return !equal(a, b);
          case "<": case ">": case "<=": case ">=": {
            if (!(isNum(a) || a instanceof CsChar) || !(isNum(b) || b instanceof CsChar)) throw new CsError(e.op + " on non-numbers", e.line);
            const x = num(a), y = num(b);
            return e.op === "<" ? x < y : e.op === ">" ? x > y : e.op === "<=" ? x <= y : x >= y;
          }
          default: return arith(e.op, a, b, e.line);
        }
      }
      case "cond": { const c = ev(e.c); if (typeof c !== "boolean") throw new CsError("?: needs a bool", e.line); return ev(c ? e.a : e.b); }
      case "assign": {
        const lv = lvalue(e.target);
        const v = e.op === "=" ? (e.value.k === "arrlit" ? ev(e.value) : ev(e.value)) : arith(e.op[0], lv.get(), ev(e.value), e.line);
        lv.set(v);
        return lv.get();
      }
      case "index": {
        const o = need(ev(e.o), e.line, "[]"), i = num(ev(e.i));
        if (typeof o === "string") { if (i < 0 || i >= o.length) throw new CsRuntimeError("IndexOutOfRangeException: الإندكس " + i + " خارج حدود النص", e.line); return new CsChar(o[i]); }
        if (!(o instanceof CsArray)) throw new CsError("[] on something that is not an array", e.line);
        if (i < 0 || i >= o.items.length) throw new CsRuntimeError("IndexOutOfRangeException: الإندكس " + i + " خارج حدود المصفوفة", e.line);
        return o.items[i];
      }
      case "member": {
        if (e.o.k === "name" && !lookup(e.o.name) && e.o.name !== "this") throw new CsError("unknown name «" + e.o.name + "." + e.name + "»", e.line);
        const o = need(ev(e.o), e.line, "." + e.name);
        if (e.name === "Length" && typeof o === "string") return o.length;
        if (e.name === "Length" && o instanceof CsArray) return o.items.length;
        if (o instanceof CsObject && o.fields.has(e.name)) return o.fields.get(e.name).value;
        throw new CsError("no field «" + e.name + "»", e.line);
      }
      case "call": return call(e);
    }
    throw new CsError("unsupported expression " + e.k, e.line);
  }
  function argsOf(m, e) {
    return e.args.map((a, i) => {
      if (m.params[i].ref) { if (!a.ref) throw new CsError("argument " + (i + 1) + " needs ref", e.line); return lvalue(a); }
      return ev(a);
    });
  }
  function call(e) {
    const f = e.f;
    if (f.k === "name") {   // a method of this object, else a static method of the program
      const self = frame().self;
      if (self instanceof CsObject && self.cls.methods.has(f.name)) { const m = pick(self.cls.methods.get(f.name), e.args.length, f.name, e.line); return invoke(m, argsOf(m, e), self, e.line); }
      const m = pick(funcs.get(f.name), e.args.length, f.name, e.line);
      return invoke(m, argsOf(m, e), null, e.line);
    }
    if (f.k !== "member") throw new CsError("not callable", e.line);
    if (f.o.k === "name" && !lookup(f.o.name) && f.o.name !== "this") {   // Class.Method(…)
      if (classes.has(f.o.name) || f.o.name === "Program") { const m = pick(funcs.get(f.name), e.args.length, f.name, e.line); return invoke(m, argsOf(m, e), null, e.line); }
      return staticCall(f.o.name, f.name, e.args.map(ev), e.line);
    }
    const o = ev(f.o);
    need(o, e.line, "." + f.name + "()");
    if (typeof o === "string") return stringCall(o, f.name, e.args.map(ev), e.line);
    if (o instanceof CsObject) {
      if (!o.cls.methods.has(f.name)) { if (f.name === "ToString" && !e.args.length) return str(o); throw new CsError("no operation «" + f.name + "» in " + o.cls.name, e.line); }
      const m = pick(o.cls.methods.get(f.name), e.args.length, f.name, e.line);
      return invoke(m, argsOf(m, e), o, e.line);
    }
    if (f.name === "ToString" && !e.args.length && !isRef(o)) return str(o);
    return libraryCall(o, f.name, e.args.map(ev), e.line, f.o);
  }

  // statements ---------------------------------------------------------------------------------------------------------
  const strip = e => (e.k === "paren" ? strip(e.a) : e);
  /** The sentence for «name gets v». */
  function gets(name, v, e) {
    const x = e ? strip(e) : null;
    if (v instanceof LStack && x?.k === "new") return "ننشئ راصّة فارغة باسم `" + name + "`.";
    if (v instanceof LQueue && x?.k === "new") return "ننشئ دورًا فارغًا باسم `" + name + "`.";
    if ((v instanceof LNode || v instanceof LBin) && x?.k === "new") return "`" + name + "` يشير إلى الخلية الجديدة.";
    if (v instanceof CsObject && x?.k === "new") return "ننشئ كائنًا من `" + v.cls.name + "` و`" + name + "` يشير إليه.";
    if (isRef(v) || v === null) return "`" + name + "` يشير الآن إلى " + describe(v) + ".";
    return "`" + name + " = " + lit(v) + "`.";
  }
  function execBlock(b, scoped = true) {
    if (scoped) frame().scopes.push(new Map());
    try { for (const s of b.body) exec(s); } finally { if (scoped) frame().scopes.pop(); }
  }
  function test(c, line, yes, no) {
    const v = ev(c);
    if (typeof v !== "boolean") throw new CsError("the condition is not a bool", line);
    rec(line, "الشرط `" + sourceOf(c) + "` " + (v ? "صحيح" : "غير صحيح") + ": " + (v ? yes : no) + ".");
    return v;
  }
  function loopBody(s) {
    try { exec(s); } catch (sig) { if (!(sig instanceof Signal)) throw sig; if (sig.kind === "break") return true; if (sig.kind !== "continue") throw sig; }
    return false;
  }
  function exec(s) {
    if (--stepsLeft < 0) throw new CsRuntimeError("البرنامج لا يتوقّف", s.line);
    switch (s.k) {
      case "empty": return;
      case "block": return execBlock(s);
      case "decl": {
        const notes = [];
        for (const d of s.vars) {
          if (!d.init) { declare(d.name, s.type, zero(s.type), true); notes.push("نعرّف المتغيّر `" + d.name + "`."); continue; }
          const v = ev(d.init);
          declare(d.name, s.type, v);
          notes.push(gets(d.name, lookup(d.name).value, d.init));
        }
        rec(s.line, notes.join(" "));
        return;
      }
      case "expr": {
        const e = strip(s.e);
        if (e.k === "assign") {
          const before = e.op === "=" ? null : lvalue(e.target).get();
          const v = ev(e);
          const name = sourceOf(e.target);
          rec(s.line, e.op === "=" ? gets(name, v, e.value) : "قيمة `" + name + "` كانت `" + lit(before) + "` وتصبح `" + lit(v) + "`.");
        } else if (e.k === "incdec") {
          ev(e);
          rec(s.line, "قيمة `" + sourceOf(e.target) + "` " + (e.op === "++" ? "تزيد" : "تنقص") + " بواحد وتصبح `" + lit(lvalue(e.target).get()) + "`.");
        } else { ev(e); rec(s.line, ""); }
        return;
      }
      case "if": {
        if (test(s.c, s.line, "ننفّذ ما بعد `if`", s.els ? "ننتقل إلى `else`" : "نتخطّى ما بعد `if`")) exec(s.then); else if (s.els) exec(s.els);
        return;
      }
      case "while": {
        while (test(s.c, s.line, "ننفّذ جسم الحلقة", "نخرج من الحلقة")) if (loopBody(s.body)) break;
        return;
      }
      case "do": {
        do { if (loopBody(s.body)) break; } while (test(s.c, s.condLine, "نعيد جسم الحلقة", "نخرج من الحلقة"));
        return;
      }
      case "for": {
        frame().scopes.push(new Map());
        try {
          if (s.init) exec(s.init);
          for (;;) {
            if (s.c && !test(s.c, s.line, "ننفّذ جسم الحلقة", "نخرج من الحلقة")) break;
            if (loopBody(s.body)) break;
            for (const u of s.update) exec({ k: "expr", e: u, line: s.line });
          }
        } finally { frame().scopes.pop(); }
        return;
      }
      case "return": {
        const v = s.e ? ev(s.e) : undefined;
        rec(s.line, s.e ? "العملية `" + frame().name + "` تُعيد " + (isRef(v) || v === null ? describe(v) : "`" + lit(v) + "`") + "." : "نخرج من العملية `" + frame().name + "`.");
        throw new Signal("return", v);
      }
      case "break": rec(s.line, "`break`: نخرج من الحلقة."); throw new Signal("break");
      case "continue": rec(s.line, "`continue`: ننتقل إلى الدورة التالية."); throw new Signal("continue");
    }
    throw new CsError("unsupported statement " + s.k, s.line);
  }

  // run ----------------------------------------------------------------------------------------------------------------
  const entryName = opts.entry ?? "Main";
  const entry = funcs.get(entryName)?.[0];
  if (!entry) throw new CsError("no «" + entryName + "» to run");
  let error = null;
  try {
    invoke(entry, entry.params.map(() => null), null, entry.line);
    if (pending) steps.push({ line: 0, note: [...pending.notes, "انتهى التنفيذ."].join(" "), ...pending.snap, out });
  } catch (e) {
    if (e instanceof Signal) throw new CsError("break / continue outside a loop");
    if (!(e instanceof CsRuntimeError) || !opts.allowError) throw e;
    error = e.message.replace(/^line \d+: /, "");
    if (e.line <= shown) steps.push({ line: e.line, note: "خطأ في التشغيل: " + error + ". البرنامج يتوقّف هنا.", frames: steps.at(-1)?.frames ?? [], objs: steps.at(-1)?.objs ?? [], out, error: true });
  }
  return { steps, out, error };
}
