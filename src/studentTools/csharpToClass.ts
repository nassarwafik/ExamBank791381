// DG3 «ولّد من الكود» (docs/enterprise-diagram-editor-design.md §7, §15) — C# declarations → a class diagram. A small, bounded
// reader of the DECLARATIONS a project carries: classes, abstract classes, interfaces, enums (and structs / records, drawn as classes),
// their fields, properties, constructors and methods, their bases, and the members whose type is another class of the code
// (an association, «*» for a collection). Pure: no React, no DOM, no I/O, no eval, no compiler. Method BODIES are skipped by their
// braces and never read; nothing is executed. Comments and string literals are blanked first, so a brace inside them cannot confuse it.

import { DIAGRAM_LIMITS, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";

export const CS_LIMITS = Object.freeze({ chars: 200_000, types: 40, members: 60 });

export type CsKind = "class" | "abstract" | "interface" | "enum";
export type CsType = { name: string; kind: CsKind; line: number; bases: string[]; attrs: string[]; ops: string[]; values: string[]; refs: { to: string; many: boolean; optional: boolean }[] };
export type CsProblem = { line: number; message: string };
export type CsRead = { types: CsType[]; problems: CsProblem[] };

/** Comments, strings and chars blanked (same length: lines and brackets elsewhere keep their places). */
function blank(src: string): string {
  const out: string[] = [];
  let i = 0;
  const fill = (to: number) => { for (; i < to && i < src.length; i++) out.push(src[i] === "\n" ? "\n" : " "); };
  while (i < src.length) {
    if (src.startsWith("//", i)) { const e = src.indexOf("\n", i); fill(e < 0 ? src.length : e); continue; }
    if (src.startsWith("/*", i)) { const e = src.indexOf("*/", i + 2); fill(e < 0 ? src.length : e + 2); continue; }
    const verbatim = src.startsWith("@\"", i) || src.startsWith("$@\"", i) || src.startsWith("@$\"", i);
    if (verbatim || src[i] === "\"" || (src[i] === "$" && src[i + 1] === "\"")) {
      let j = i + (verbatim ? src.indexOf("\"", i) - i + 1 : src[i] === "$" ? 2 : 1);
      while (j < src.length) {
        if (verbatim && src[j] === "\"" && src[j + 1] === "\"") { j += 2; continue; }
        if (!verbatim && src[j] === "\\") { j += 2; continue; }
        if (src[j] === "\"" || (!verbatim && src[j] === "\n")) { j++; break; }
        j++;
      }
      out.push("\"");
      i++;
      fill(j - 1);
      if (i < src.length) { out.push("\""); i++; }
      continue;
    }
    if (src[i] === "'") {   // a char literal: '{', '\'', 'A'
      const m = /^'(?:\\.[^']{0,6}|[^'\\\n])'/.exec(src.slice(i, i + 10));
      if (m) { out.push("'"); i++; fill(i + m[0].length - 2); out.push("'"); i++; continue; }
    }
    out.push(src[i++]);
  }
  return out.join("");
}

const lineAt = (src: string, at: number) => src.slice(0, at).split("\n").length;
/** The index of the bracket closing the one at `open` (`{` / `}`), or -1. */
function closing(src: string, open: number, a = "{", b = "}"): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === a) depth++;
    else if (src[i] === b && --depth === 0) return i;
  }
  return -1;
}
/** A list split on the commas at its own level (generics, brackets and parentheses kept whole). */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i <= s.length; i++) {
    const c = s[i];
    if (c === "<" || c === "(" || c === "[") depth++;
    else if (c === ">" || c === ")" || c === "]") depth--;
    else if ((c === "," && depth === 0) || i === s.length) { out.push(s.slice(start, i).trim()); start = i + 1; }
  }
  return out.filter(Boolean);
}
const squash = (s: string) => s.replace(/\s+/g, " ").replace(/\s*([<>,[\]?])\s*/g, "$1").replace(/,/g, ", ").trim();
const bareName = (t: string) => t.replace(/<.*$/s, "").split(".").pop()!.trim();

const MODIFIERS = ["public", "private", "protected", "internal", "static", "abstract", "sealed", "partial", "readonly", "virtual", "override",
  "async", "extern", "unsafe", "new", "const", "volatile", "required", "file"];
const TYPE_HEAD = new RegExp(String.raw`(?:^|[;{}\]\s])((?:(?:` + MODIFIERS.join("|") + String.raw`)\s+)*)(class|interface|enum|struct|record(?:\s+(?:class|struct))?)\s+([A-Za-z_]\w*)\s*(<[^>{;]*>)?\s*(\([^)]*\))?\s*(?::\s*([^{;]+?))?\s*(?:where\s[^{;]*)?([{;])`, "g");

function visibility(mods: string[], inInterface: boolean): string {
  if (mods.includes("public")) return "+";
  if (mods.includes("protected")) return "#";
  if (mods.includes("internal")) return "~";
  if (mods.includes("private")) return "-";
  return inInterface ? "+" : "-";
}
/** «int id» / «ref int count = 0» → «id : int». */
function param(p: string): string {
  const t = p.replace(/=.*$/s, "").replace(/^(?:this|ref|out|in|params|scoped)\s+/g, "").trim();
  const m = /^(.*\S)\s+([A-Za-z_@]\w*)$/s.exec(t);
  return m ? m[2] + " : " + squash(m[1]) : squash(t);
}

/** An attribute (a field, a property, a record parameter); typed with another class, it is also an association (a collection «*»,
 *  nullable «0..1»). */
function addAttr(owner: CsType, vis: string, name: string, type: string) {
  owner.attrs.push(vis + " " + name + " : " + type);
  const coll = /^(?:I?List|ICollection|IEnumerable|IReadOnlyList|IReadOnlyCollection|Collection|ObservableCollection|HashSet|ISet|Queue|Stack|LinkedList)<(.+)>$/.exec(type);
  const dict = /^I?(?:Dictionary|SortedDictionary|IReadOnlyDictionary)<[^,]+,\s*(.+)>$/.exec(type);
  const arr = /^(.+)\[\]$/.exec(type);
  const inner = (coll?.[1] ?? dict?.[1] ?? arr?.[1] ?? type).replace(/\?$/, "");
  owner.refs.push({ to: bareName(inner), many: !!(coll || dict || arr), optional: /\?$/.test(type) });
}

/** The members of one type's body: fields, properties, constructors, methods (bodies skipped); an enum's values. */
function readBody(owner: CsType, body: string, problems: CsProblem[], line: number) {
  if (owner.kind === "enum") {
    owner.values = splitTop(body).map(v => v.replace(/=.*$/s, "").replace(/\[[^\]]*\]/g, "").trim()).filter(v => /^[A-Za-z_]\w*$/.test(v));
    return;
  }
  const inInterface = owner.kind === "interface";
  let i = 0, start = 0, count = 0;
  const take = (seg: string, hasBlock: boolean) => {
    let s = seg.replace(/^\s*(?:\[[^\]]*\]\s*)+/, "").replace(/\s+/g, " ").trim();
    if (!s || count >= CS_LIMITS.members) return;
    if (/\b(?:class|interface|enum|struct|record|delegate|event|operator|implicit|explicit)\b/.test(s.replace(/\(.*$/, ""))) return;   // nested types, events, operators
    if (/\bthis\s*\[/.test(s)) return;   // an indexer
    const arrow = s.indexOf("=>");
    const head = (arrow >= 0 ? s.slice(0, arrow) : s).trim();
    const paren = head.indexOf("(");
    const words = (h: string) => { const mods: string[] = []; let rest = h; for (let m; (m = /^([a-z]+)\s+/.exec(rest)) && MODIFIERS.includes(m[1]);) { mods.push(m[1]); rest = rest.slice(m[0].length); } return { mods, rest }; };
    if (paren >= 0 && (arrow < 0 || paren < arrow) && !/=/.test(head.slice(0, paren))) {
      // a method or a constructor: [mods] [Type] Name[<T>](params)
      const { mods, rest } = words(head.slice(0, paren).trim());
      const m = /^(?:(.*\S)\s+)?([A-Za-z_]\w*)\s*(<[^>]*>)?$/s.exec(rest);
      const close = closing(head, paren, "(", ")");
      if (!m || close < 0) return;
      const params = splitTop(head.slice(paren + 1, close)).map(param).join(", ");
      const isCtor = !m[1] && m[2] === owner.name;
      if (!m[1] && !isCtor) {   // «public Print() { }»: a method written without its return type (a common slip)
        problems.push({ line, message: "في «" + owner.name + "»: الدالة «" + m[2] + "» بلا نوع إرجاع (void أو int …)، فلم تُرسم." });
        return;
      }
      owner.ops.push(visibility(mods, inInterface) + " " + m[2] + (m[3] ?? "") + "(" + params + ")" + (isCtor ? "" : " : " + squash(m[1])));
      count++;
      return;
    }
    // a field or a property: [mods] Type Name [= init] / [mods] Type Name { get; set; } / [mods] Type Name => expr
    // «int a = 1, b;» declares two fields: the first part carries the type, the others are names (each initialiser dropped)
    const parts = hasBlock || arrow >= 0 ? [head] : splitTop(head);
    const { mods, rest } = words(parts[0].replace(/=(?!>).*$/s, "").trim());
    const m = /^(.*\S)\s+([A-Za-z_@]\w*)$/s.exec(rest);
    if (!m) return;
    const type = squash(m[1]);
    const names = [m[2], ...parts.slice(1).map(p => p.replace(/=.*$/s, "").trim()).filter(n => /^[A-Za-z_@]\w*$/.test(n))];
    for (const n of names) { addAttr(owner, visibility(mods, inInterface), n, type); count++; }
  };
  while (i < body.length) {
    const c = body[i];
    if (c === "{") {
      const e = closing(body, i);
      if (e < 0) { problems.push({ line, message: "في «" + owner.name + "» قوس «{» لم يُغلق." }); return; }
      take(body.slice(start, i), true);
      i = e + 1;
      // «{ get; set; } = value;» and «=> …;» after a block belong to the same member
      const tail = /^\s*(?:=[^;]*)?;/.exec(body.slice(i));
      if (tail) i += tail[0].length;
      start = i;
      continue;
    }
    if (c === ";") { take(body.slice(start, i), false); start = i + 1; }
    i++;
  }
}

/** Reads every type declaration of the code. */
export function readCSharpTypes(source: string): CsRead {
  const problems: CsProblem[] = [];
  if (source.length > CS_LIMITS.chars) return { types: [], problems: [{ line: 1, message: "الكود أطول من الحد (200 ألف حرف)." }] };
  const src = blank(source);
  const opens = (src.match(/\{/g) ?? []).length, closes = (src.match(/\}/g) ?? []).length;
  if (opens !== closes) problems.push({ line: 1, message: "الأقواس { } غير متوازنة في الكود (" + opens + " «{» و" + closes + " «}»): قد يكون صنف أو دالة لم يُغلق." });
  const types: CsType[] = [];
  TYPE_HEAD.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TYPE_HEAD.exec(src))) {
    const open = TYPE_HEAD.lastIndex - 1;
    const line = lineAt(src, m.index + (m[0].length - m[0].trimStart().length));
    // a positional record ends at its «;» (it has no body): its primary constructor is all it declares
    const bodiless = m[7] === ";";
    if (bodiless && !/^record/.test(m[2])) continue;
    const close = bodiless ? open : closing(src, open);
    const mods = m[1].trim().split(/\s+/).filter(Boolean);
    const word = m[2].split(/\s+/)[0];
    const name = m[3];
    if (close < 0) { problems.push({ line, message: "الصنف «" + name + "» لم يُغلق: ينقصه «}» في آخره." }); continue; }
    if (types.length >= CS_LIMITS.types) { problems.push({ line, message: "في الكود أكثر من " + CS_LIMITS.types + " صنفًا: قُرئت الأولى فقط." }); break; }
    if (types.some(t => t.name === name)) { problems.push({ line, message: "«" + name + "» معرَّف مرتين (partial؟): جُمعت أعضاؤه في صنف واحد." }); }
    const kind: CsKind = word === "interface" ? "interface" : word === "enum" ? "enum" : mods.includes("abstract") ? "abstract" : "class";
    const t: CsType = types.find(x => x.name === name) ?? { name, kind, line, bases: [], attrs: [], ops: [], values: [], refs: [] };
    if (!types.includes(t)) types.push(t);
    t.bases.push(...(m[6] ? splitTop(m[6]).map(b => squash(b)) : []));
    // a record's primary constructor: its parameters are its properties
    if (m[5]) for (const p of splitTop(m[5].slice(1, -1))) { const [n, ty] = param(p).split(" : "); if (ty) addAttr(t, "+", n, ty); }
    if (!bodiless) readBody(t, src.slice(open + 1, close), problems, line);
    // nested types are found by the same scan, inside this body
    TYPE_HEAD.lastIndex = open + 1;
  }
  if (!types.length && !problems.length) problems.push({ line: 1, message: "لم أجد في الكود أي صنف (class) أو واجهة (interface) أو تعداد (enum)." });
  return { types, problems };
}

/** The types as a class diagram: parents above their children, interfaces above what implements them; inheritance, interface
 *  implementation and the associations between the code's own classes. */
export function csharpToClass(read: CsRead): DiagramDoc {
  const types = read.types.slice(0, DIAGRAM_LIMITS.nodes);
  const byName = new Map(types.map(t => [t.name, t]));
  const isIface = (n: string) => byName.get(n)?.kind === "interface" || (!byName.has(n) && /^I[A-Z]/.test(n));
  type Link = { from: string; to: string; type: "inherit" | "realize" | "directed"; toLabel: string };
  const links: Link[] = [];
  for (const t of types) {
    t.bases.forEach((b, i) => {
      const n = bareName(b);
      if (!byName.has(n) || n === t.name || t.kind === "enum") return;
      if (t.kind === "interface") links.push({ from: t.name, to: n, type: "inherit", toLabel: "" });
      else if (isIface(n)) links.push({ from: t.name, to: n, type: "realize", toLabel: "" });
      else if (i === 0) links.push({ from: t.name, to: n, type: "inherit", toLabel: "" });
    });
    const seen = new Map<string, Link>();
    for (const r of t.refs) {
      const target = byName.get(r.to);
      if (!target || target.name === t.name || target.kind === "enum") continue;
      const label = r.many ? "*" : r.optional ? "0..1" : "1";
      const old = seen.get(target.name);
      if (old) { if (label === "*") old.toLabel = "*"; continue; }
      const l: Link = { from: t.name, to: target.name, type: "directed", toLabel: label };
      seen.set(target.name, l);
      links.push(l);
    }
  }
  // levels: a type sits one row under the deepest of its parents (inheritance and interfaces)
  const level = new Map<string, number>();
  const levelOf = (n: string, path: Set<string> = new Set()): number => {
    if (level.has(n)) return level.get(n)!;
    if (path.has(n)) return 0;
    path.add(n);
    const parents = links.filter(l => l.from === n && l.type !== "directed").map(l => l.to);
    const v = parents.length ? Math.max(...parents.map(p => levelOf(p, path) + 1)) : 0;
    level.set(n, v);
    return v;
  };
  types.forEach(t => levelOf(t.name));
  const rows = new Map<number, CsType[]>();
  for (const t of types) rows.set(level.get(t.name)!, [...(rows.get(level.get(t.name)!) ?? []), t]);
  const nodes: DNode[] = [];
  const idOf = new Map<string, string>();
  let y = 60;
  for (const l of [...rows.keys()].sort((a, b) => a - b)) {
    let x = 60, tallest = 0;
    for (const t of rows.get(l)!) {
      const lines = [...t.attrs, ...t.ops, ...t.values, t.name];
      const w = Math.min(460, Math.max(160, Math.ceil((Math.max(...lines.map(s => s.length)) * 7.4 + 40) / 10) * 10));
      const h = 60 + (t.attrs.length + t.ops.length + t.values.length + (t.kind === "class" ? 0 : 1)) * 17;
      if (x + w > DIAGRAM_LIMITS.canvasW - 20) { x = 60; y += tallest + 80; tallest = 0; }
      const id = "n" + (nodes.length + 1);
      idOf.set(t.name, id);
      const text: Record<string, string> = t.kind === "enum" ? { name: t.name, values: t.values.join("\n") }
        : t.kind === "interface" ? { name: t.name, ops: [...t.attrs, ...t.ops].join("\n") } : { name: t.name, attrs: t.attrs.join("\n"), ops: t.ops.join("\n") };
      for (const k of Object.keys(text)) text[k] = text[k].slice(0, k === "name" ? DIAGRAM_LIMITS.text : DIAGRAM_LIMITS.lines);
      const yy = Math.min(y, DIAGRAM_LIMITS.canvasH - 60);
      nodes.push({ id, type: t.kind, x: Math.min(x, DIAGRAM_LIMITS.canvasW - 160), y: yy, w: t.kind === "enum" ? 120 : 140, h: t.kind === "class" || t.kind === "abstract" ? 70 : 60, text, color: "none" });
      x += w + 70;
      tallest = Math.max(tallest, h);
    }
    y += tallest + 90;
  }
  const edges: DEdge[] = links.filter(l => idOf.has(l.from) && idOf.has(l.to)).slice(0, DIAGRAM_LIMITS.edges).map((l, i) => ({
    id: "e" + (i + 1), type: l.type, from: idOf.get(l.from)!, to: idOf.get(l.to)!, label: "", fromLabel: "", toLabel: l.toLabel, y: 0,
  }));
  return { kind: "class", nodes, edges };
}
