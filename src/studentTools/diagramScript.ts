// DG4 «اكتب المخطط نصًّا» (docs/enterprise-diagram-editor-design.md §16) — a small diagram SCRIPT: the learner writes the diagram as
// text and it is drawn. The language is PlantUML's everyday core (so an example from a book or the web works as written), not all of
// PlantUML: classes, use cases, sequences, activities and states. Pure: no React, no DOM, no I/O, no eval. Unknown lines are named with
// their line number and skipped; nothing is guessed silently. Bounded: 50 000 characters, the editor's 150 components and 300 arrows.
//
//   @startuml                          ← optional
//   class Car                          ← a class (also: abstract class, interface, enum, with a { … } body)
//   Driver - Car : drives >            ← an association with its label; «>» / «<» say which way it reads
//   Car *- Wheel : have 4 >            ← composition (o- aggregation, <|-- inheritance, ..|> interface, --> direction, ..> dependency)
//   Car "1" -- "*" Person : < owns    ← multiplicities in quotes beside each end
//   @enduml

import { DIAGRAM_LIMITS, SEQ_FIRST, SEQ_STEP, SEQ_TOP, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";
import { nodeSpec, type DiagramKind } from "./diagramCatalog";

export const SCRIPT_KINDS = ["class", "useCase", "sequence", "activity", "state"] as const satisfies readonly DiagramKind[];
export type ScriptKind = (typeof SCRIPT_KINDS)[number];
export const isScriptKind = (k: DiagramKind): k is ScriptKind => (SCRIPT_KINDS as readonly string[]).includes(k);
export const SCRIPT_MAX_CHARS = 50_000;

export type ScriptProblem = { line: number; message: string };
export type ScriptResult = { kind: ScriptKind; doc: DiagramDoc; problems: ScriptProblem[] };

type Line = { n: number; text: string };
type Note = { n: number; text: string };

// ── reading the text ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The notes («note "text" as N1», «note left of A : text», «note right of A … end note»), taken out of the lines. */
function takeNotes(lines: Line[]): { lines: Line[]; notes: Note[] } {
  const out: Line[] = [], notes: Note[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/^note\b/i.test(l.text)) { out.push(l); continue; }
    const one = /^note\s+"([^"]*)"/i.exec(l.text) ?? /^note\b[^:]*:\s*(.*)$/i.exec(l.text);
    if (one) { notes.push({ n: l.n, text: one[1] }); continue; }
    const body: string[] = [];
    for (i++; i < lines.length && !/^end\s*note$/i.test(lines[i].text); i++) body.push(lines[i].text);
    notes.push({ n: l.n, text: body.join("\n") });
  }
  return { lines: out, notes };
}

/** The meaningful lines: comments (' … and /' … '/), @startuml / @enduml and the styling directives taken out. */
function linesOf(src: string): Line[] {
  const out: Line[] = [];
  let block = false;
  src.split(/\r?\n/).forEach((raw, i) => {
    let t = raw.trim();
    if (block) { const e = t.indexOf("'/"); if (e < 0) return; block = false; t = t.slice(e + 2).trim(); }
    const b = t.indexOf("/'");
    if (b >= 0) { const e = t.indexOf("'/", b + 2); if (e < 0) { block = true; t = t.slice(0, b).trim(); } else t = (t.slice(0, b) + t.slice(e + 2)).trim(); }
    if (!t || t.startsWith("'")) return;
    if (/^@(start|end)\w*/i.test(t)) return;
    if (/^(skinparam|title|hide|show|scale|caption|header|footer|legend|endlegend|left to right direction|top to bottom direction|!|autonumber|activate|deactivate|destroy|newpage|===|\.\.\.|\|\|\||allowmixing|set\s+namespaceseparator)\b/i.test(t)) return;
    out.push({ n: i + 1, text: t });
  });
  return out;
}

const NAME = String.raw`"[^"]+"|[\p{L}_][\p{L}\p{N}_.]*`;
const unq = (s: string) => s.trim().replace(/^"(.*)"$/s, "$1").trim();
/** «drives >» → «drives ▸», «< owns» → «◂ owns»: the reading direction kept as a small triangle. */
function arrowLabel(s: string | undefined): string {
  if (!s) return "";
  let t = s.trim();
  if (t.endsWith(">") && !/<<[^>]*>>$/.test(t)) t = t.slice(0, -1).trim() + " ▸";
  else if (t.startsWith("<") && !t.startsWith("<<")) t = "◂ " + t.slice(1).trim();
  return t.slice(0, DIAGRAM_LIMITS.text);
}

/** An arrow token: its two heads and whether its line is dashed. «<|--», «*-», «..>», «-up->», «->>», «-->». */
type Arrow = { left: string; right: string; dashed: boolean; double: boolean };
const ARROW = String.raw`(<\|?|<<|[*o#x}+^]|<)?(-+|\.+)(?:(?:up|down|left|right|u|d|l|r)(-+|\.+))?(\|>|>>|>|[*o#x{+^])?`;
function parseArrow(m: RegExpExecArray, at: number): Arrow {
  return { left: m[at] ?? "", right: m[at + 3] ?? "", dashed: (m[at + 1] ?? "").startsWith("."), double: (m[at + 1] ?? "").length > 1 };
}

// ── the document being built ───────────────────────────────────────────────────────────────────────────────────────────────────────
class Builder {
  nodes: DNode[] = [];
  edges: DEdge[] = [];
  problems: ScriptProblem[] = [];
  byKey = new Map<string, DNode>();
  kind: ScriptKind;
  constructor(kind: ScriptKind) { this.kind = kind; }
  node(key: string, type: string, text: Record<string, string>, line: number): DNode | null {
    const k = key.toLowerCase();
    const found = this.byKey.get(k);
    if (found) return found;
    if (this.nodes.length >= DIAGRAM_LIMITS.nodes) { this.problems.push({ line, message: "في النص أكثر من " + DIAGRAM_LIMITS.nodes + " مكوّنًا: رُسم أوّلها فقط." }); return null; }
    const spec = nodeSpec(this.kind, type)!;
    const n: DNode = { id: "n" + (this.nodes.length + 1), type, x: 0, y: 0, w: spec.minW, h: spec.minH, color: "none",
      text: Object.fromEntries(spec.fields.map(f => [f.key, (text[f.key] ?? "").slice(0, f.lines ? DIAGRAM_LIMITS.lines : DIAGRAM_LIMITS.text)])) };
    this.nodes.push(n);
    this.byKey.set(k, n);
    return n;
  }
  edge(type: string, from: DNode | null, to: DNode | null, label: string, fromLabel = "", toLabel = "", line = 0): DEdge | null {
    if (!from || !to) return null;
    if (this.edges.length >= DIAGRAM_LIMITS.edges) { this.problems.push({ line, message: "في النص أكثر من " + DIAGRAM_LIMITS.edges + " سهمًا: رُسم أوّلها فقط." }); return null; }
    const e: DEdge = { id: "e" + (this.edges.length + 1), type, from: from.id, to: to.id, label: label.slice(0, DIAGRAM_LIMITS.text),
      fromLabel: fromLabel.slice(0, DIAGRAM_LIMITS.text), toLabel: toLabel.slice(0, DIAGRAM_LIMITS.text), y: 0 };
    this.edges.push(e);
    return e;
  }
  /** Another name for a component (a use case written «(Login)» and declared «usecase "Login" as UC1»). */
  alias(name: string, n: DNode | null) { if (n && !this.byKey.has(name.toLowerCase())) this.byKey.set(name.toLowerCase(), n); }
  /** Changes a component's type (a name first met in a relation, declared after), keeping the texts its new type has. */
  retype(n: DNode, type: string) {
    if (n.type === type) return;
    const old = n.text;
    n.type = type;
    const spec = nodeSpec(this.kind, type)!;
    n.text = Object.fromEntries(spec.fields.map(f => [f.key, old[f.key] ?? (f.key === "ops" ? [old.attrs, old.ops].filter(Boolean).join("\n") : "")]));
    n.w = Math.max(n.w, spec.minW); n.h = Math.max(n.h, spec.minH);
  }
  notes(list: Note[]) { list.forEach((t, i) => this.node("note:" + i + ":" + t.n, "note", { name: t.text }, t.n)); }
  unknown(l: Line) { this.problems.push({ line: l.n, message: "لم أفهم السطر: «" + l.text.slice(0, 60) + "»." }); }
  doc(): DiagramDoc { return { kind: this.kind, nodes: this.nodes, edges: this.edges }; }
}

const widthOf = (n: DNode) => {
  const longest = Math.max(...Object.values(n.text).flatMap(t => t.split("\n").map(l => l.length)), 0);
  return Math.min(460, Math.max(n.w, Math.ceil((longest * 7.6 + 40) / 10) * 10));
};
const heightOf = (n: DNode) => Math.max(n.h, 46 + Object.entries(n.text).filter(([k]) => k !== "name").reduce((s, [, t]) => s + (t ? t.split("\n").length : 1) * 17 + 10, 0));
/** Every component on the page, on the grid, and never under its type's smallest size (what the strict reader accepts). */
const clampOnPage = (doc: DiagramDoc) => {
  for (const n of doc.nodes) {
    const spec = nodeSpec(doc.kind, n.type);
    if (spec) { n.w = Math.max(Math.ceil(n.w), spec.minW); n.h = Math.max(Math.ceil(n.h), spec.minH); }
    n.x = Math.max(0, Math.min(Math.round(n.x / 10) * 10, DIAGRAM_LIMITS.canvasW - n.w));
    n.y = Math.max(0, Math.min(Math.round(n.y / 10) * 10, DIAGRAM_LIMITS.canvasH - n.h));
  }
};

// ── class ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function readClass(lines: Line[]): Builder {
  const b = new Builder("class");
  const typeOf = (kw: string) => (/^interface/i.test(kw) ? "interface" : /^enum/i.test(kw) ? "enum" : /^abstract/i.test(kw) ? "abstract" : "class");
  const add = (n: DNode | null, member: string) => {
    if (!n) return;
    const m = member.replace(/\{(static|abstract|field|method|classifier)\}\s*/gi, "").trim();
    if (!m || /^(--+|==+|\.\.+|__+)/.test(m)) return;
    const key = n.type === "enum" ? "values" : n.type === "interface" || /\(/.test(m) ? "ops" : "attrs";
    n.text[key] = (n.text[key] ? n.text[key] + "\n" : "") + m;
  };
  const declare = (kw: string, name: string, alias: string | undefined, line: number) => {
    const n = b.node(alias ? unq(alias) : unq(name), typeOf(kw), { name: unq(name), attrs: "", ops: "", values: "" }, line);
    if (alias) b.alias(unq(name), n);
    if (n) b.retype(n, typeOf(kw));   // first met in a relation, declared after
    return n;
  };
  const named = (s: string, line: number) => b.node(unq(s), "class", { name: unq(s), attrs: "", ops: "", values: "" }, line);
  const DECL = new RegExp(String.raw`^(abstract\s+class|abstract|class|interface|enum|entity)\s+(` + NAME + String.raw`)(?:\s+as\s+(` + NAME + String.raw`))?\s*(?:<<[^>]*>>)?\s*(?:extends\s+(` + NAME + String.raw`))?\s*(?:implements\s+([^{]+?))?\s*(\{)?\s*(\})?$`, "iu");
  const REL = new RegExp("^(" + NAME + String.raw`)\s*(?:"([^"]*)"\s*)?` + ARROW + String.raw`\s*(?:"([^"]*)"\s*)?(` + NAME + String.raw`)\s*(?::\s*(.+))?$`, "u");
  const MEMBER = new RegExp("^(" + NAME + String.raw`)\s*:\s*(.+)$`, "u");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m: RegExpExecArray | null;
    if ((m = DECL.exec(l.text))) {
      const n = declare(m[1], m[2], m[3], l.n);
      if (m[4]) b.edge("inherit", n, named(m[4], l.n), "", "", "", l.n);
      if (m[5]) for (const iface of m[5].split(",")) {
        const t = b.node(unq(iface), "interface", { name: unq(iface), attrs: "", ops: "", values: "" }, l.n);
        b.edge("realize", n, t, "", "", "", l.n);
      }
      if (m[6] && !m[7]) {   // a body: one member per line up to «}»
        for (i++; i < lines.length && lines[i].text !== "}"; i++) add(n, lines[i].text);
        if (i >= lines.length) b.problems.push({ line: l.n, message: "الصنف «" + unq(m[2]) + "» لم يُغلق: ينقصه «}»." });
      }
      continue;
    }
    if ((m = REL.exec(l.text))) {
      const a = named(m[1], l.n), c = named(m[8], l.n);
      const arrow = parseArrow(m, 3);
      const ml = m[2] ?? "", mr = m[7] ?? "", label = arrowLabel(m[9]);
      const L = arrow.left, R = arrow.right;
      if (L === "<|") b.edge(arrow.dashed ? "realize" : "inherit", c, a, label, mr, ml, l.n);
      else if (R === "|>") b.edge(arrow.dashed ? "realize" : "inherit", a, c, label, ml, mr, l.n);
      else if (L === "*") b.edge("composition", a, c, label, ml, mr, l.n);
      else if (R === "*") b.edge("composition", c, a, label, mr, ml, l.n);
      else if (L === "o") b.edge("aggregation", a, c, label, ml, mr, l.n);
      else if (R === "o") b.edge("aggregation", c, a, label, mr, ml, l.n);
      else if (R === ">") b.edge(arrow.dashed ? "dependency" : "directed", a, c, label, ml, mr, l.n);
      else if (L === "<") b.edge(arrow.dashed ? "dependency" : "directed", c, a, label, mr, ml, l.n);
      else b.edge("assoc", a, c, label, ml, mr, l.n);
      continue;
    }
    if ((m = MEMBER.exec(l.text))) { add(named(m[1], l.n), m[2]); continue; }
    b.unknown(l);
  }
  // layout: parents above children (inheritance and interfaces), the rest in rows
  layered(b.doc(), e => e.type === "inherit" || e.type === "realize");
  return b;
}

/** Rows by level, centred, wrapped to the page width. With «parent» arrows (inheritance), a node sits one row under the deepest node it
 *  points at; without any, the most connected node stands on top and the others below it by their distance from it. In each row the
 *  nodes follow the mean position of their neighbours in the rows above (fewer crossings). */
function layered(doc: DiagramDoc, parentEdge: (e: DEdge) => boolean) {
  const level = new Map<string, number>();
  const parents = doc.edges.filter(parentEdge);
  const notes = new Set(doc.nodes.filter(n => n.type === "note").map(n => n.id));
  const members = doc.nodes.filter(n => !notes.has(n.id));
  if (parents.length) {
    const levelOf = (id: string, path: Set<string> = new Set()): number => {
      if (level.has(id)) return level.get(id)!;
      if (path.has(id)) return 0;
      path.add(id);
      const ups = parents.filter(e => e.from === id).map(e => e.to);
      const v = ups.length ? Math.max(...ups.map(u => levelOf(u, path) + 1)) : 0;
      level.set(id, v);
      return v;
    };
    members.forEach(n => levelOf(n.id));
  } else {
    // each connected group from its most connected node (breadth first); the groups one under the other
    const degree = (id: string) => doc.edges.filter(e => e.from === id || e.to === id).length;
    let base = 0;
    for (const start of [...members].sort((a, c) => degree(c.id) - degree(a.id))) {
      if (level.has(start.id)) continue;
      level.set(start.id, base);
      let deepest = base;
      for (const queue = [start.id]; queue.length;) {
        const id = queue.shift()!;
        for (const e of doc.edges) {
          const other = e.from === id ? e.to : e.to === id ? e.from : "";
          if (other && !notes.has(other) && !level.has(other)) { level.set(other, level.get(id)! + 1); deepest = Math.max(deepest, level.get(other)!); queue.push(other); }
        }
      }
      base = deepest + 1;
    }
  }
  const rows = new Map<number, DNode[]>();
  for (const n of members) rows.set(level.get(n.id)!, [...(rows.get(level.get(n.id)!) ?? []), n]);
  const keys = [...rows.keys()].sort((a, c) => a - c);
  const centreX = new Map<string, number>();
  const neighbours = (id: string) => doc.edges.flatMap(e => (e.from === id ? [e.to] : e.to === id ? [e.from] : []));
  // the widest row sets the page's centre
  const rowWidth = (list: DNode[]) => list.reduce((s, n) => s + widthOf(n) + 70, -70);
  const middle = 60 + Math.min(DIAGRAM_LIMITS.canvasW - 160, Math.max(...keys.map(k => rowWidth(rows.get(k)!)))) / 2;
  let y = 60;
  for (const k of keys) {
    const row = rows.get(k)!;
    const bary = (n: DNode) => { const xs = neighbours(n.id).map(id => centreX.get(id)).filter((v): v is number => v !== undefined); return xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : Infinity; };
    row.sort((a, c) => bary(a) - bary(c));
    // wrap a row too wide for the page
    const lines: DNode[][] = [[]];
    let used = 0;
    for (const n of row) {
      const w = widthOf(n) + 70;
      if (used + w > DIAGRAM_LIMITS.canvasW - 120 && lines[lines.length - 1].length) { lines.push([]); used = 0; }
      lines[lines.length - 1].push(n);
      used += w;
    }
    for (const line of lines) {
      let x = middle - rowWidth(line) / 2, tallest = 0;
      for (const n of line) {
        n.x = x; n.y = y;
        centreX.set(n.id, x + widthOf(n) / 2);
        x += widthOf(n) + 70;
        tallest = Math.max(tallest, heightOf(n));
      }
      y += tallest + 90;
    }
  }
  clampOnPage(doc);
}

// ── use case ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function readUseCase(lines: Line[]): Builder {
  const b = new Builder("useCase");
  const inSystem = new Map<string, string>();   // use case id → system id
  const systems: DNode[] = [];
  let current: DNode | null = null;
  // «(Login)», «(Login) as UC1», «usecase "Login" as UC1», «:Student:», «actor Student», a bare name (an actor, as PlantUML reads it)
  const endpoint = (s: string, line: number): DNode | null => {
    const t = s.trim();
    let m: RegExpExecArray | null;
    if ((m = /^\(([^)]+)\)$/.exec(t))) return addUseCase(m[1], undefined, line);
    if ((m = /^:([^:]+):$/.exec(t))) return b.node(unq(m[1]), "actor", { name: unq(m[1]) }, line);
    const known = b.byKey.get(unq(t).toLowerCase());
    return known ?? b.node(unq(t), "actor", { name: unq(t) }, line);
  };
  const addUseCase = (name: string, alias: string | undefined, line: number) => {
    const n = b.byKey.get(unq(name).toLowerCase()) ?? b.node(alias ? unq(alias) : unq(name), "usecase", { name: unq(name) }, line);
    if (alias) { b.alias(unq(alias), n); b.alias(unq(name), n); }
    if (n && current && !inSystem.has(n.id)) inSystem.set(n.id, current.id);
    return n;
  };
  const P = String.raw`\([^)]+\)|:[^:]+:|` + NAME;
  const REL = new RegExp("^(" + P + String.raw`)\s*` + ARROW + String.raw`\s*(` + P + String.raw`)\s*(?::\s*(.+))?$`, "u");
  for (const l of lines) {
    let m: RegExpExecArray | null;
    if ((m = /^(?:rectangle|package|frame|node)\s+(".*?"|\S+)(?:\s+as\s+\S+)?\s*\{$/i.exec(l.text))) {
      if (current) { b.problems.push({ line: l.n, message: "حدود نظام داخل حدود نظام: رُسمت الخارجية فقط." }); continue; }
      current = b.node("system:" + unq(m[1]), "system", { name: unq(m[1]) }, l.n);
      if (current) systems.push(current);
      continue;
    }
    if (l.text === "}") { current = null; continue; }
    if ((m = new RegExp(String.raw`^actor\s+(` + NAME + String.raw`|:[^:]+:)(?:\s+as\s+(` + NAME + "))?$", "iu").exec(l.text))) {
      const name = unq(m[1].replace(/^:|:$/g, ""));
      b.alias(name, b.node(m[2] ? unq(m[2]) : name, "actor", { name }, l.n));
      continue;
    }
    if ((m = new RegExp(String.raw`^usecase\s+(\([^)]+\)|` + NAME + String.raw`)(?:\s+as\s+(` + NAME + "))?$", "iu").exec(l.text))) {
      addUseCase(m[1].replace(/^\(|\)$/g, ""), m[2], l.n);
      continue;
    }
    if ((m = REL.exec(l.text))) {
      const a = endpoint(m[1], l.n), c = endpoint(m[6], l.n);
      const arrow = parseArrow(m, 2);
      const label = (m[7] ?? "").trim();
      const stereo = /<<\s*(include|extend)\s*>>/i.exec(label)?.[1]?.toLowerCase();
      const rest = arrowLabel(label.replace(/<<\s*(include|extend)\s*>>/i, "").trim());
      if (arrow.left === "<|") b.edge("generalize", c, a, rest);
      else if (arrow.right === "|>") b.edge("generalize", a, c, rest);
      else if (stereo) {
        const [from, to] = arrow.left === "<" ? [c, a] : [a, c];
        b.edge(stereo, from, to, "«" + stereo + "»" + (rest ? " " + rest : ""));
      } else b.edge("assoc", a, c, rest);
      continue;
    }
    if ((m = /^\(([^)]+)\)(?:\s+as\s+(\S+))?$/.exec(l.text))) { addUseCase(m[1], m[2], l.n); continue; }
    b.unknown(l);
  }
  // layout: actors on the two sides (alternately), the use cases in a column inside their system
  const actors = b.nodes.filter(n => n.type === "actor"), cases = b.nodes.filter(n => n.type === "usecase");
  const boxW = Math.max(240, ...cases.map(c => widthOf(c) + 80));
  const free = cases.filter(c => !inSystem.has(c.id));
  let y = 80;
  const sysX = 260;
  for (const s of systems) {
    const mine = cases.filter(c => inSystem.get(c.id) === s.id);
    s.x = sysX; s.y = y - 40; s.w = boxW; s.h = Math.max(200, mine.length * 100 + 60);
    mine.forEach((c, i) => { c.w = Math.max(c.w, widthOf(c)); c.x = sysX + (boxW - c.w) / 2; c.y = y + 20 + i * 100; });
    y += s.h + 60;
  }
  free.forEach((c, i) => { c.w = Math.max(c.w, widthOf(c)); c.x = sysX + (boxW - c.w) / 2; c.y = y + i * 100; });
  const rightX = sysX + boxW + 140;
  actors.forEach((a, i) => { a.x = i % 2 ? rightX : 80; a.y = 100 + Math.floor(i / 2) * 160; });
  // a system box comes first in the list, so it is drawn under everything
  b.nodes.sort((p, q) => Number(q.type === "system") - Number(p.type === "system"));
  clampOnPage(b.doc());
  return b;
}

// ── sequence ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function readSequence(lines: Line[]): Builder {
  const b = new Builder("sequence");
  const part = (s: string, line: number, type = "lifeline") => b.node(unq(s), type, { name: unq(s) }, line);
  const frames: { op: string; guard: string; first: number; last: number; line: number }[] = [];
  const open: number[] = [];
  const MSG = new RegExp("^(" + NAME + String.raw`)\s*(<<?-{1,2}|-{1,2}>>?|-{1,2}[xo]|<-{1,2}[xo]?)\s*(` + NAME + String.raw`)\s*(?::\s*(.*))?$`, "u");
  for (const l of lines) {
    let m: RegExpExecArray | null;
    if ((m = new RegExp(String.raw`^(participant|actor|boundary|control|entity|database|collections|queue)\s+(` + NAME + String.raw`)(?:\s+as\s+(` + NAME + String.raw`))?(?:\s+order\s+\d+)?$`, "iu").exec(l.text))) {
      b.alias(unq(m[2]), b.node(unq(m[3] ?? m[2]), m[1].toLowerCase() === "actor" ? "actorLifeline" : "lifeline", { name: unq(m[2]) }, l.n));
      continue;
    }
    if ((m = MSG.exec(l.text))) {
      const a = part(m[1], l.n), c = part(m[3], l.n);
      const arrow = m[2];
      const back = arrow.startsWith("<");
      const type = arrow.includes("--") ? "return" : arrow.includes(">>") || arrow.includes("<<") ? "async" : "sync";
      b.edge(type, back ? c : a, back ? a : c, (m[4] ?? "").trim(), "", "", l.n);
      continue;
    }
    if ((m = /^(alt|opt|loop|par|break|critical|group)\b\s*(.*)$/i.exec(l.text))) {
      frames.push({ op: m[1].toLowerCase(), guard: m[2].trim() ? "[" + m[2].trim().replace(/^\[|\]$/g, "") + "]" : "", first: b.edges.length, last: -1, line: l.n });
      open.push(frames.length - 1);
      continue;
    }
    if ((m = /^else\b\s*(.*)$/i.exec(l.text))) {
      const f = frames[open[open.length - 1]];
      if (f) f.guard += " / else" + (m[1].trim() ? " [" + m[1].trim().replace(/^\[|\]$/g, "") + "]" : "");
      continue;
    }
    if (/^end$/i.test(l.text)) {
      const i = open.pop();
      if (i === undefined) b.problems.push({ line: l.n, message: "«end» بلا إطار مفتوح (alt / opt / loop) قبله." });
      else frames[i].last = b.edges.length - 1;
      continue;
    }
    b.unknown(l);
  }
  for (const i of open) b.problems.push({ line: frames[i].line, message: "الإطار «" + frames[i].op + "» لم يُغلق: ينقصه «end»." });
  // layout: lifelines left to right in the order met, messages top to bottom, a frame around its messages
  const lifelines = b.nodes.filter(n => n.type === "lifeline" || n.type === "actorLifeline");
  let x = 60;
  for (const n of lifelines) { n.w = Math.max(n.w, widthOf(n)); n.x = x; n.y = SEQ_TOP; x += Math.max(n.w, 120) + 70; }
  b.edges.forEach((e, i) => { e.y = SEQ_FIRST + i * SEQ_STEP; });
  for (const f of frames) {
    if (f.last < f.first) continue;
    const msgs = b.edges.slice(f.first, f.last + 1);
    const ends = msgs.flatMap(e => [e.from, e.to]).map(id => b.nodes.find(n => n.id === id)!);
    const left = Math.min(...ends.map(n => n.x)) - 20, right = Math.max(...ends.map(n => n.x + n.w)) + 20;
    const n = b.node("frame:" + f.line, "fragment", { name: f.op, guard: f.guard }, f.line);
    if (!n) continue;
    n.x = left; n.y = msgs[0].y - 34; n.w = Math.max(260, right - left); n.h = Math.max(120, msgs[msgs.length - 1].y - msgs[0].y + 56);
  }
  clampOnPage(b.doc());
  return b;
}

// ── activity (the new syntax: start, :action;, if / else / endif, while / endwhile, fork, stop) ──────────────────────────────────────
type Act =
  | { t: "action"; text: string; line: number } | { t: "start" | "stop"; line: number }
  | { t: "if"; cond: string; branches: { label: string; body: Act[] }[]; line: number }
  | { t: "while"; cond: string; yes: string; no: string; body: Act[]; line: number }
  | { t: "fork"; branches: Act[][]; line: number };

function parseActivity(lines: Line[], b: Builder): Act[] {
  let i = 0;
  const label = (s: string | undefined) => (s ? "[" + s.trim().replace(/^\(|\)$/g, "").trim() + "]" : "");
  const seq = (stops: RegExp): Act[] => {
    const out: Act[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (stops.test(l.text)) return out;
      i++;
      let m: RegExpExecArray | null;
      if (/^start$/i.test(l.text)) { out.push({ t: "start", line: l.n }); continue; }
      if (/^(stop|end|kill|detach)$/i.test(l.text)) { out.push({ t: "stop", line: l.n }); continue; }
      if (l.text.startsWith(":")) {
        let text = l.text.slice(1);
        while (!/[;|<>\]}/]$/.test(text) && i < lines.length) text += "\n" + lines[i++].text;
        out.push({ t: "action", text: text.replace(/[;|<>\]}/]$/, "").trim(), line: l.n });
        continue;
      }
      if ((m = /^if\s*\((.*?)\)\s*(?:then\s*(\(.*\)))?$/i.exec(l.text))) {
        const node: Act = { t: "if", cond: m[1].trim(), branches: [{ label: label(m[2]), body: [] }], line: l.n };
        node.branches[0].body = seq(/^(elseif|else|endif)\b/i);
        while (i < lines.length && /^(elseif|else)\b/i.test(lines[i].text)) {
          const e = lines[i++].text;
          const em = /^elseif\s*\((.*?)\)\s*(?:then\s*(\(.*\)))?$/i.exec(e);
          const lab = em ? label(em[2] ?? "(" + em[1] + ")") : label(/^else\s*(\(.*\))?$/i.exec(e)?.[1]);
          node.branches.push({ label: lab, body: seq(/^(elseif|else|endif)\b/i) });
        }
        if (i < lines.length && /^endif\b/i.test(lines[i].text)) i++;
        else b.problems.push({ line: l.n, message: "«if» لم يُغلق: ينقصه «endif»." });
        out.push(node);
        continue;
      }
      if ((m = /^while\s*\((.*?)\)\s*(?:is\s*(\(.*\)))?$/i.exec(l.text))) {
        const node: Act = { t: "while", cond: m[1].trim(), yes: label(m[2]), no: "", body: seq(/^endwhile\b/i), line: l.n };
        if (i < lines.length) { node.no = label(/^endwhile\s*(\(.*\))?$/i.exec(lines[i].text)?.[1]); i++; }
        else b.problems.push({ line: l.n, message: "«while» لم يُغلق: ينقصه «endwhile»." });
        out.push(node);
        continue;
      }
      if (/^fork$/i.test(l.text)) {
        const node: Act = { t: "fork", branches: [seq(/^(fork\s+again|end\s*fork|end\s*merge)\b/i)], line: l.n };
        while (i < lines.length && /^fork\s+again\b/i.test(lines[i].text)) { i++; node.branches.push(seq(/^(fork\s+again|end\s*fork|end\s*merge)\b/i)); }
        if (i < lines.length && /^end\s*(fork|merge)\b/i.test(lines[i].text)) i++;
        else b.problems.push({ line: l.n, message: "«fork» لم يُغلق: ينقصه «end fork»." });
        out.push(node);
        continue;
      }
      if (/^\|.*\|$/.test(l.text)) continue;   // a swimlane: its actions are drawn in the main flow
      b.unknown(l);
    }
    return out;
  };
  return seq(/(?!)/);   // the top level reads to the end
}

function readActivity(lines: Line[]): Builder {
  const b = new Builder("activity");
  const tree = parseActivity(lines, b);
  const GAP_Y = 70, GAP_X = 50;
  const size = (n: DNode) => ({ w: n.type === "action" ? widthOf(n) : n.w, h: n.type === "action" ? Math.max(n.h, 44) : n.h });
  const widthOfSeq = (s: Act[]): number => Math.max(120, ...s.map(widthOfAct));
  function widthOfAct(a: Act): number {
    if (a.t === "action") return Math.min(460, Math.max(120, Math.ceil((Math.max(...a.text.split("\n").map(x => x.length)) * 7.6 + 40) / 10) * 10));
    if (a.t === "if") return a.branches.reduce((s, br) => s + widthOfSeq(br.body) + GAP_X, -GAP_X);
    if (a.t === "while") return 2 * (widthOfSeq(a.body) + 110);
    if (a.t === "fork") return a.branches.reduce((s, br) => s + widthOfSeq(br) + GAP_X, -GAP_X);
    return 40;
  }
  let key = 0;
  const make = (type: string, text: Record<string, string>, line: number) => b.node("a" + key++, type, text, line);
  const place = (n: DNode | null, cx: number, y: number) => { if (!n) return 0; const s = size(n); n.w = s.w; n.h = s.h; n.x = cx - s.w / 2; n.y = y; return s.h; };
  /** Lays a sequence out around the centre `cx` from `y`; `ins` are the arrows waiting to enter its first node. Returns the exits. */
  type Exit = { from: DNode; label: string };
  const layout = (s: Act[], cx: number, y: number, ins: Exit[]): { y: number; outs: Exit[] } => {
    let outs = ins;
    for (const a of s) {
      if (a.t === "action" || a.t === "start" || a.t === "stop") {
        const n = make(a.t === "action" ? "action" : a.t === "start" ? "start" : "end", a.t === "action" ? { name: a.text } : {}, a.line);
        y += place(n, cx, y) + GAP_Y;
        for (const o of outs) b.edge("flow", o.from, n, o.label);
        outs = a.t === "stop" || !n ? [] : [{ from: n, label: "" }];
        continue;
      }
      if (a.t === "if") {
        const d = make("decision", { name: a.cond }, a.line);
        y += place(d, cx, y) + GAP_Y;
        for (const o of outs) b.edge("flow", o.from, d, o.label);
        const widths = a.branches.map(br => widthOfSeq(br.body));
        const total = widths.reduce((p, w) => p + w + GAP_X, -GAP_X);
        let left = cx - total / 2, bottom = y;
        const exits: Exit[] = [];
        const branches = a.branches.length === 1 ? [...a.branches, { label: "", body: [] as Act[] }] : a.branches;
        branches.forEach((br, k) => {
          const w = widths[k] ?? 0;
          if (!d) return;
          if (!br.body.length) { exits.push({ from: d, label: br.label }); return; }
          const r = layout(br.body, left + w / 2, y, [{ from: d, label: br.label }]);
          exits.push(...r.outs);
          bottom = Math.max(bottom, r.y);
          left += w + GAP_X;
        });
        const merge = make("decision", { name: "" }, a.line);
        bottom += place(merge, cx, bottom) + GAP_Y;
        for (const o of exits) b.edge("flow", o.from, merge, o.label);
        y = bottom;
        outs = merge ? [{ from: merge, label: "" }] : [];
        continue;
      }
      if (a.t === "while") {
        const d = make("decision", { name: a.cond }, a.line);
        y += place(d, cx, y) + GAP_Y;
        for (const o of outs) b.edge("flow", o.from, d, o.label);
        // the loop's body stands beside its test (the way out goes straight down, never through the body)
        const side = cx + 70 + widthOfSeq(a.body) / 2 + 40;
        const r = layout(a.body, side, y, d ? [{ from: d, label: a.yes }] : []);
        for (const o of r.outs) if (d) b.edge("flow", o.from, d, o.label);   // back to the test
        y = r.y;
        outs = d ? [{ from: d, label: a.no }] : [];
        continue;
      }
      // fork: a bar, the branches side by side, a bar
      const f = a as Extract<Act, { t: "fork" }>;
      const total = widthOfAct(f);
      const bar = make("fork", {}, a.line);
      if (bar) bar.w = Math.max(140, total);
      y += place(bar, cx, y) + GAP_Y;
      for (const o of outs) b.edge("flow", o.from, bar, o.label);
      let left = cx - total / 2, bottom = y;
      const exits: Exit[] = [];
      for (const br of f.branches) {
        const w = widthOfSeq(br);
        const r = layout(br, left + w / 2, y, bar ? [{ from: bar, label: "" }] : []);
        exits.push(...r.outs);
        bottom = Math.max(bottom, r.y);
        left += w + GAP_X;
      }
      const join = make("fork", {}, a.line);
      if (join) join.w = Math.max(140, total);
      bottom += place(join, cx, bottom) + GAP_Y;
      for (const o of exits) b.edge("flow", o.from, join, o.label);
      y = bottom;
      outs = join ? [{ from: join, label: "" }] : [];
    }
    return { y, outs };
  };
  const cx = 60 + widthOfSeq(tree) / 2 + 40;
  layout(tree, Math.max(cx, 300), 40, []);
  clampOnPage(b.doc());
  return b;
}

// ── state ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function readState(lines: Line[]): Builder {
  const b = new Builder("state");
  const scope: (DNode | null)[] = [null];   // the composite state we are inside (null: the top)
  const parentOf = new Map<string, string | null>();
  const here = () => scope[scope.length - 1];
  const state = (s: string, line: number, type = "state", name?: string) => {
    const n = b.node(unq(s), type, type === "state" || type === "composite" ? { name: name ?? unq(s), body: "" } : {}, line);
    if (n && !parentOf.has(n.id)) parentOf.set(n.id, here()?.id ?? null);
    return n;
  };
  /** «[*]»: the scope's initial state (as a source) or its final state (as a target); one of each per scope. */
  const pseudo = (side: "initial" | "final", line: number) => {
    const sc = here();
    const n = b.node(side + ":" + (sc?.id ?? "top"), side, {}, line);
    if (n) parentOf.set(n.id, sc?.id ?? null);
    return n;
  };
  const end = (s: string, line: number, side: "initial" | "final") => (s.trim() === "[*]" ? pseudo(side, line) : state(s, line));
  const P = String.raw`\[\*\]|` + NAME;
  const TR = new RegExp("^(" + P + String.raw`)\s*` + ARROW + String.raw`\s*(` + P + String.raw`)\s*(?::\s*(.*))?$`, "u");
  for (const l of lines) {
    let m: RegExpExecArray | null;
    if ((m = new RegExp(String.raw`^state\s+(` + NAME + String.raw`)(?:\s+as\s+(` + NAME + String.raw`))?\s*(<<\s*(choice|fork|join|end)\s*>>)?\s*(\{)?\s*$`, "iu").exec(l.text))) {
      const key = m[2] ?? m[1];
      if (m[4]) {
        if (m[4].toLowerCase() === "choice") { const c = state(key, l.n, "choice"); if (c) b.retype(c, "choice"); }
        else b.problems.push({ line: l.n, message: "«<<" + m[4] + ">>» غير مدعوم في المحرّر: استعمل «<<choice>>» أو حالة عادية." });
        continue;
      }
      const n = state(key, l.n, m[5] ? "composite" : "state", unq(m[1]));
      if (m[2]) { b.alias(unq(m[1]), n); if (n) n.text.name = unq(m[1]); }
      if (n && m[5]) { b.retype(n, "composite"); scope.push(n); }
      continue;
    }
    if (l.text === "}") { if (scope.length > 1) scope.pop(); else b.problems.push({ line: l.n, message: "«}» زائد." }); continue; }
    if ((m = TR.exec(l.text))) {
      const a = end(m[1], l.n, "initial"), c = end(m[6], l.n, "final");
      const arrow = parseArrow(m, 2);
      const [from, to] = arrow.left === "<" ? [c, a] : [a, c];
      b.edge("transition", from, to, (m[7] ?? "").trim(), "", "", l.n);
      continue;
    }
    if ((m = new RegExp("^(" + NAME + String.raw`)\s*:\s*(.+)$`, "u").exec(l.text))) {
      const n = state(m[1], l.n);
      if (n && n.type === "state") n.text.body = (n.text.body ? n.text.body + "\n" : "") + m[2].trim();
      continue;
    }
    b.unknown(l);
  }
  if (scope.length > 1) b.problems.push({ line: lines[lines.length - 1]?.n ?? 1, message: "الحالة المركّبة «" + scope[scope.length - 1]!.text.name + "» لم تُغلق: ينقصها «}»." });
  // layout: in each scope, columns by distance from its initial state (left to right); a composite is laid out inside first
  const sizeOf = (n: DNode) => n.type === "state" ? { w: Math.max(n.w, widthOf(n)), h: heightOf(n) } : { w: n.w, h: n.h };
  const layoutScope = (parent: string | null, ox: number, oy: number): { w: number; h: number } => {
    const members = b.nodes.filter(n => parentOf.get(n.id) === parent && n.type !== "note");
    const ids = new Set(members.map(n => n.id));
    const dist = new Map<string, number>();
    const startN = members.find(n => n.type === "initial") ?? members[0];
    if (!startN) return { w: 0, h: 0 };
    dist.set(startN.id, 0);
    for (const queue = [startN.id]; queue.length;) {
      const id = queue.shift()!;
      for (const e of b.edges) if (e.from === id && ids.has(e.to) && !dist.has(e.to)) { dist.set(e.to, dist.get(id)! + 1); queue.push(e.to); }
    }
    let far = Math.max(0, ...dist.values());
    for (const n of members) if (!dist.has(n.id)) dist.set(n.id, n.type === "final" ? far + 1 : ++far);
    // finals go after everything else in their scope
    const last = Math.max(...members.filter(n => n.type !== "final").map(n => dist.get(n.id)!), 0);
    for (const n of members) if (n.type === "final") dist.set(n.id, Math.max(dist.get(n.id)!, last + 1));
    const cols = new Map<number, DNode[]>();
    for (const n of members) cols.set(dist.get(n.id)!, [...(cols.get(dist.get(n.id)!) ?? []), n]);
    let x = ox, maxY = oy;
    for (const c of [...cols.keys()].sort((p, q) => p - q)) {
      let y = oy, widest = 0;
      for (const n of cols.get(c)!) {
        if (n.type === "composite") {
          const inner = layoutScope(n.id, x + 30, y + 50);
          n.x = x; n.y = y; n.w = Math.max(n.w, inner.w + 60); n.h = Math.max(n.h, inner.h + 80);
        } else { const s = sizeOf(n); n.x = x; n.y = y; n.w = s.w; n.h = s.h; }
        y += n.h + 60;
        widest = Math.max(widest, n.w);
      }
      maxY = Math.max(maxY, y - 60);
      x += widest + 90;
    }
    return { w: x - 90 - ox, h: maxY - oy };
  };
  layoutScope(null, 60, 80);
  // composites first (drawn under what they hold)
  b.nodes.sort((p, q) => Number(q.type === "composite") - Number(p.type === "composite"));
  clampOnPage(b.doc());
  return b;
}

// ── which kind is the text? ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The kind the text is written for, from clear signs only (a keyword or an arrow that belongs to one kind); null when the text could
 *  be several kinds (plain «A --> B»), and the editor's current kind is kept. */
export function detectScriptKind(src: string): ScriptKind | null {
  const ls = linesOf(src).map(l => l.text);
  const has = (re: RegExp) => ls.some(t => re.test(t));
  if (has(/^(start|stop)$/i) || has(/^:.+[;|<>\]}/]$/) || has(/^(if\s*\(|while\s*\(|repeat\b|fork$)/i)) return "activity";
  if (has(/\[\*\]/) || has(/^state\s/i)) return "state";
  if (has(/^(participant|boundary|control|database|collections|queue)\s/i) || has(/^(alt|opt|loop|par|break|critical|group)\b/i) || has(/-{1,2}>>/)) return "sequence";
  if (has(/^usecase\b/i) || has(/(^|\s)\([^)]+\)(\s|$)/) || has(/^:[^:]+:/) || has(/<<\s*(include|extend)\s*>>/i) || has(/^(rectangle|package)\b.*\{$/i)) return "useCase";
  if (has(/^(class|interface|enum|abstract)\b/i) || has(/<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|\*-\s|\s-\*/)) return "class";
  return null;
}

/** Reads a script into a diagram of `kind` (or the kind the text is written for). */
export function readDiagramScript(src: string, fallback: ScriptKind): ScriptResult {
  if (src.length > SCRIPT_MAX_CHARS) return { kind: fallback, doc: { kind: fallback, nodes: [], edges: [] }, problems: [{ line: 1, message: "النص أطول من الحد (50 ألف حرف)." }] };
  const kind = detectScriptKind(src) ?? fallback;
  const { lines, notes } = takeNotes(linesOf(src));
  const b = kind === "class" ? readClass(lines) : kind === "useCase" ? readUseCase(lines) : kind === "sequence" ? readSequence(lines) : kind === "activity" ? readActivity(lines) : readState(lines);
  // the notes stand in a column beside the drawing
  const right = b.nodes.reduce((m, n) => Math.max(m, n.x + Math.max(n.w, widthOf(n))), 0);
  const before = b.nodes.length;
  b.notes(notes);
  b.nodes.slice(before).forEach((n, i) => { n.w = Math.max(n.w, Math.min(300, widthOf(n))); n.x = right + 60; n.y = 60 + i * 100; });
  clampOnPage(b.doc());
  b.problems.sort((p, q) => p.line - q.line);
  return { kind, doc: b.doc(), problems: b.problems };
}

/** Keeps where the learner put things: a component of the new diagram that the old one already had (same kind and name) keeps its
 *  place; the rest follow the automatic layout. */
export function keepPositions(next: DiagramDoc, old: DiagramDoc | undefined): DiagramDoc {
  if (!old || old.kind !== next.kind || !old.nodes.length) return next;
  const key = (n: DNode) => n.type + "|" + (n.text.name ?? "").trim().toLowerCase();
  const was = new Map<string, DNode>();
  for (const n of old.nodes) if ((n.text.name ?? "").trim() && !was.has(key(n))) was.set(key(n), n);
  return { ...next, nodes: next.nodes.map(n => {
    const o = was.get(key(n));
    if (!o || nodeSpec(next.kind, n.type)?.resizable) return n;
    return { ...n, x: Math.min(o.x, DIAGRAM_LIMITS.canvasW - n.w), y: next.kind === "sequence" ? n.y : Math.min(o.y, DIAGRAM_LIMITS.canvasH - n.h) };
  }) };
}
