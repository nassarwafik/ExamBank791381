// DG4 (docs/enterprise-diagram-editor-design.md §16) — the diagram on the sheet written back as its script, so the learner can edit
// the drawing as text, copy it, or keep it in the book's appendix. Pure. The script reads back (diagramScript.ts) to the same components
// and arrows. A free-form activity diagram has no structured form (if / else / endif) to write, so activity is not written back.

import type { DEdge, DiagramDoc, DNode } from "./diagramDoc";
import type { ScriptKind } from "./diagramScript";

const IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const q = (s: string) => '"' + s.replace(/"/g, "'") + '"';
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
/** «drives ▸» → «drives >», «◂ owns» → «< owns». */
const label = (s: string) => oneLine(s).replace(/\s*▸$/, " >").replace(/^◂\s*/, "< ");

/** A short, valid name for each component: its own name when it is an identifier, else an alias (C1, UC2 …). */
function aliases(doc: DiagramDoc, prefix: string): Map<string, string> {
  const out = new Map<string, string>(), used = new Set<string>();
  doc.nodes.forEach((n, i) => {
    const name = oneLine(n.text.name ?? "");
    const a = IDENT.test(name) && !used.has(name.toLowerCase()) ? name : prefix + (i + 1);
    used.add(a.toLowerCase());
    out.set(n.id, a);
  });
  return out;
}
const decl = (keyword: string, n: DNode, a: Map<string, string>) => {
  const name = oneLine(n.text.name ?? "");
  return keyword + " " + (a.get(n.id) === name ? name : q(name) + " as " + a.get(n.id));
};
const ends = (e: DEdge) => (e.fromLabel.trim() || e.toLabel.trim() ? [e.fromLabel.trim() ? q(e.fromLabel.trim()) + " " : "", e.toLabel.trim() ? " " + q(e.toLabel.trim()) : ""] : ["", ""]);
const inside = (n: DNode, c: DNode) => { const cx = n.x + n.w / 2, cy = n.y + n.h / 2; return cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h; };
const notesOf = (doc: DiagramDoc) => doc.nodes.filter(n => n.type === "note").map(n => {
  const t = (n.text.name ?? "").trim();
  return t.includes("\n") ? "note as N" + n.id.slice(1) + "\n" + t + "\nend note" : "note " + q(t) + " as N" + n.id.slice(1);
});

function classScript(doc: DiagramDoc): string[] {
  const a = aliases(doc, "C");
  const out: string[] = [];
  for (const n of doc.nodes) {
    if (n.type === "note") continue;
    const kw = n.type === "abstract" ? "abstract class" : n.type === "interface" ? "interface" : n.type === "enum" ? "enum" : "class";
    const members = (n.type === "enum" ? [n.text.values] : [n.text.attrs, n.text.ops]).flatMap(t => (t ?? "").split("\n")).map(l => l.trim()).filter(Boolean);
    out.push(decl(kw, n, a) + (members.length ? " {" : ""));
    if (members.length) { out.push(...members.map(m => "  " + m)); out.push("}"); }
  }
  for (const e of doc.edges) {
    const [l, r] = ends(e);
    const A = a.get(e.from)!, B = a.get(e.to)!;
    const lab = e.label.trim() ? " : " + label(e.label) : "";
    const arrow: Record<string, string> = { inherit: "<|--", realize: "<|..", composition: "*--", aggregation: "o--", directed: "-->", dependency: "..>", assoc: "--" };
    // inheritance is written parent first (B <|-- A), as books write it
    if (e.type === "inherit" || e.type === "realize") out.push(B + " " + arrow[e.type] + " " + A + lab);
    else out.push(A + " " + l + (arrow[e.type] ?? "--") + r + " " + B + lab);
  }
  return out;
}

function ucScript(doc: DiagramDoc): string[] {
  const a = aliases(doc, "UC");
  const out: string[] = [];
  const systems = doc.nodes.filter(n => n.type === "system");
  for (const n of doc.nodes) if (n.type === "actor") out.push(decl("actor", n, a));
  const placed = new Set<string>();
  for (const s of systems) {
    out.push("rectangle " + q(oneLine(s.text.name ?? "")) + " {");
    for (const n of doc.nodes) if (n.type === "usecase" && !placed.has(n.id) && inside(n, s)) { out.push("  usecase " + q(oneLine(n.text.name ?? "")) + " as " + a.get(n.id)); placed.add(n.id); }
    out.push("}");
  }
  for (const n of doc.nodes) if (n.type === "usecase" && !placed.has(n.id)) out.push("usecase " + q(oneLine(n.text.name ?? "")) + " as " + a.get(n.id));
  for (const e of doc.edges) {
    const A = a.get(e.from)!, B = a.get(e.to)!;
    const rest = label(e.label.replace(/«(include|extend)»/, "")).trim();
    if (e.type === "include" || e.type === "extend") out.push(A + " ..> " + B + " : <<" + e.type + ">>" + (rest ? " " + rest : ""));
    else if (e.type === "generalize") out.push(B + " <|-- " + A);
    else out.push(A + " --> " + B + (rest ? " : " + rest : ""));
  }
  return out;
}

function sequenceScript(doc: DiagramDoc): string[] {
  const a = aliases(doc, "P");
  const out: string[] = [];
  const lifelines = doc.nodes.filter(n => n.type === "lifeline" || n.type === "actorLifeline").sort((p, r) => p.x - r.x);
  for (const n of lifelines) out.push(decl(n.type === "actorLifeline" ? "actor" : "participant", n, a));
  const msgs = [...doc.edges].sort((p, r) => p.y - r.y);
  const frames = doc.nodes.filter(n => n.type === "fragment").map(f => ({ f, inner: msgs.filter(m => m.y > f.y && m.y < f.y + f.h) })).filter(x => x.inner.length);
  for (const m of msgs) {
    for (const x of frames) if (x.inner[0] === m) {
      // an «alt»'s else part lives in its guard text («[ok] / else [no]»): written back as one guard line
      const guard = oneLine(x.f.text.guard ?? "").replace(/^\[|\]$/g, "");
      out.push(oneLine(x.f.text.name ?? "alt") + (guard ? " " + guard : ""));
    }
    const arrow = m.type === "return" ? "-->" : m.type === "async" ? "->>" : "->";
    out.push(a.get(m.from)! + " " + arrow + " " + a.get(m.to)! + (m.label.trim() ? " : " + oneLine(m.label) : ""));
    for (const x of frames) if (x.inner[x.inner.length - 1] === m) out.push("end");
  }
  return out;
}

function stateScript(doc: DiagramDoc): string[] {
  const a = aliases(doc, "S");
  const composites = doc.nodes.filter(n => n.type === "composite");
  const parentOf = (n: DNode) => composites.filter(c => c !== n && inside(n, c)).sort((p, r) => p.w * p.h - r.w * r.h)[0];
  const name = (n: DNode) => (n.type === "initial" || n.type === "final" ? "[*]" : a.get(n.id)!);
  const out: string[] = [];
  const emit = (scope: DNode | undefined, pad: string) => {
    const members = doc.nodes.filter(n => parentOf(n) === scope && n.type !== "note");
    for (const n of members) {
      if (n.type === "state") {
        const nm = oneLine(n.text.name ?? "");
        if (a.get(n.id) !== nm) out.push(pad + "state " + q(nm) + " as " + a.get(n.id));
        else if (!doc.edges.some(e => e.from === n.id || e.to === n.id)) out.push(pad + "state " + nm);
        for (const l of (n.text.body ?? "").split("\n").map(x => x.trim()).filter(Boolean)) out.push(pad + a.get(n.id) + " : " + l);
      }
      if (n.type === "choice") out.push(pad + "state " + a.get(n.id) + " <<choice>>");
      if (n.type === "composite") {
        const nm = oneLine(n.text.name ?? "");
        out.push(pad + "state " + (a.get(n.id) === nm ? nm : q(nm) + " as " + a.get(n.id)) + " {");
        emit(n, pad + "  ");
        out.push(pad + "}");
      }
    }
    for (const e of doc.edges) {
      const from = doc.nodes.find(n => n.id === e.from)!;
      if (parentOf(from) !== scope) continue;
      out.push(pad + name(from) + " --> " + name(doc.nodes.find(n => n.id === e.to)!) + (e.label.trim() ? " : " + oneLine(e.label) : ""));
    }
  };
  emit(undefined, "");
  return out;
}

/** The diagram as its script, or null for a kind that is not written back (activity, and the non-UML kinds). */
export function diagramToScript(doc: DiagramDoc): string | null {
  const kind = doc.kind as ScriptKind;
  const body = kind === "class" ? classScript(doc) : kind === "useCase" ? ucScript(doc) : kind === "sequence" ? sequenceScript(doc) : kind === "state" ? stateScript(doc) : null;
  if (!body) return null;
  return ["@startuml", ...body, ...notesOf(doc), "@enduml"].join("\n");
}
