import type { DsMark, DsObj, DsStep, DsVal } from "../learning/activities/ds";

/**
 * Visual lab V10 (docs/enterprise-csharp-visual-lab-plan.md §20) — the OBJECT DIAGRAM of one step of the visual run (rich traces
 * only; the course's trace activity never builds one). Pure: no React, nothing executed.
 *
 * What is drawn: every object of the writer's classes, and every array / List / set / Dictionary that is connected to one (an
 * array of Persons, a Person's int[] of marks, a List<Person>). Each is a box of rows — an object's fields, an array's cells, a
 * Dictionary's keys — and a row that refers to another box is an ARROW to it: a class inside a class, an array of objects, an
 * array inside a class, one object shared by two, objects that refer to each other. The variables that refer to a box are on
 * the left, with their arrows.
 *
 * Compared with the step before: a row whose value changed is `changed` (the field that changed in this step); a box that did not
 * exist is `fresh` (new: `new` just made it). The first step has no step before it, so nothing is marked.
 *
 * Columns: the boxes a variable refers to are in column 1, what they refer to in column 2 … (breadth first); a box no variable
 * reaches starts its own column 1. Bounded: at most OG_NODES boxes, OG_ROWS rows a box and OG_ROOTS variables; what is left out
 * is counted (`more`, `hidden`) and said, never dropped silently.
 *
 * V11 (§21): a struct is a VALUE: inside an object it is that object's own rows (Pos.X, Pos.Y — no box, no arrow), and a struct
 * variable whose field refers to an object starts an arrow from «p.Owner». The static fields of the writer's types that refer to a
 * box are variables too, named «Type.field».
 */
export type OgRow = { key: string; text: string; ref: number | null; changed: boolean; marks: string[] };
export type OgNode = { id: number; kind: "obj" | "array" | "set" | "map"; title: string; rows: OgRow[]; more: number; col: number; fresh: boolean; changed: boolean };
export type OgRoot = { name: string; top: boolean; target: number };
export type OgGraph = { roots: OgRoot[]; nodes: OgNode[]; hidden: number };

export const OG_NODES = 24;
export const OG_ROWS = 16;
export const OG_ROOTS = 12;

type Drawn = Extract<DsObj, { k: "obj" | "array" | "set" | "map" }>;
const isDrawn = (o: DsObj | undefined): o is Drawn => !!o && (o.k === "obj" || o.k === "array" || o.k === "set" || o.k === "map");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** V11: fields with each struct's fields spread out under its name (Pos.X, Pos.Y), as the rows of a box. */
function flat(fields: [string, DsVal][], prefix = ""): [string, DsVal][] {
  return fields.flatMap(([n, v]): [string, DsVal][] => (v.t === "rec" ? flat(v.fields, prefix + n + ".") : [[prefix + n, v]]));
}

/** The boxes an object refers to (any kind: the caller keeps the ones it draws). */
function targets(o: Drawn): number[] {
  if (o.k === "obj") return flat(o.fields).flatMap(([, v]) => (v.t === "ref" ? [v.id] : []));
  return (o.refs ?? []).filter((r): r is number => r !== null);
}

/** What a reference to something NOT in the diagram says (a stack, a chain cell … drawn elsewhere in «مباني المعطيات»). */
function outside(o: DsObj | undefined): string {
  if (!o) return "?";
  if (o.k === "stack" || o.k === "queue") return (o.k === "stack" ? "راصّة [" : "دور [") + o.items.join(",") + "]";
  if (o.k === "node" || o.k === "bin") return "خلية " + o.v;
  if (o.k === "grid") return o.type + " #" + o.id;
  return "#" + o.id;
}

/**
 * The diagram of `step` (null when it has no object of the writer's classes). `prev` = the step before (for changed / new);
 * `marks` = the index variables pointing at an array's cell (sceneOf's, so a[i] is marked in the diagram as in the row drawing).
 */
export function objectGraphOf(step: DsStep, prev?: DsStep, marks?: ReadonlyMap<number, DsMark[]>): OgGraph | null {
  const byId = new Map(step.objs.map(o => [o.id, o]));
  // the boxes: every component (by references, either way) of drawable kinds that holds an object of the writer's classes
  const near = new Map<number, number[]>();
  for (const o of step.objs) if (isDrawn(o)) near.set(o.id, []);
  for (const o of step.objs) {
    if (!isDrawn(o)) continue;
    for (const t of targets(o)) if (near.has(t)) { near.get(o.id)!.push(t); near.get(t)!.push(o.id); }
  }
  const inGraph = new Set<number>();
  for (const o of step.objs) {
    if (o.k !== "obj" || inGraph.has(o.id)) continue;
    const todo = [o.id];
    while (todo.length) { const id = todo.pop()!; if (inGraph.has(id)) continue; inGraph.add(id); todo.push(...(near.get(id) ?? [])); }
  }
  if (!inGraph.size) return null;

  // the variables that refer to a box: the running method first, then its callers, then the static fields (V11)
  const roots: OgRoot[] = [];
  const root = (vars: [string, DsVal][], top: boolean, prefix = "") => {
    for (const [name, v] of flat(vars, prefix)) {
      if (v.t !== "ref" || !inGraph.has(v.id) || roots.length >= OG_ROOTS) continue;
      if (!roots.some(r => r.name === name && r.target === v.id)) roots.push({ name, top, target: v.id });
    }
  };
  for (let i = step.frames.length - 1; i >= 0; i--) root(step.frames[i].vars, i === step.frames.length - 1);
  for (const t of step.statics ?? []) root(t.vars, true, t.name + ".");
  // columns, breadth first from the variables; then from each box no variable reaches (in the order recorded)
  const col = new Map<number, number>();
  const order: number[] = [];
  const spread = (starts: number[]) => {
    let wave = starts.filter(id => !col.has(id)), c = 1;
    while (wave.length) {
      const next: number[] = [];
      for (const id of wave) {
        if (col.has(id)) continue;
        col.set(id, c); order.push(id);
        for (const t of targets(byId.get(id) as Drawn)) if (inGraph.has(t) && !col.has(t)) next.push(t);
      }
      wave = next; c++;
    }
  };
  spread(roots.map(r => r.target));
  for (const o of step.objs) if (inGraph.has(o.id) && !col.has(o.id)) spread([o.id]);

  const kept = new Set(order.slice(0, OG_NODES));
  const before = new Map((prev?.objs ?? []).map(o => [o.id, o]));
  const text = (v: DsVal): string => (v.t === "v" ? v.s : v.t === "null" ? "null" : v.t === "arr" ? "{" + v.items.join(", ") + "}" : "");
  const nodes: OgNode[] = order.slice(0, OG_NODES).map(id => {
    const o = byId.get(id) as Drawn;
    const was = before.get(id);
    const old = was && was.k === o.k ? was : undefined;
    const link = (ref: number | null | undefined, plain: string) =>
      ref === null || ref === undefined ? { text: plain, ref: null } : kept.has(ref) ? { text: "", ref } : { text: inGraph.has(ref) ? "#" + ref : "→ " + outside(byId.get(ref)), ref: null };
    let rows: OgRow[];
    if (o.k === "obj") {
      const oldFields = old?.k === "obj" ? new Map(flat(old.fields)) : undefined;
      rows = flat(o.fields).map(([name, v]) => ({ key: name, ...link(v.t === "ref" ? v.id : null, text(v)), changed: !!prev && !!old && !same(oldFields?.get(name), v), marks: [] }));
    } else {
      const keys = o.k === "map" ? o.keys : o.k === "set" ? o.items.map(() => "•") : o.items.map((_, i) => String(i));
      const oldItems = old && old.k !== "obj" ? old.items : undefined, oldRefs = old && old.k !== "obj" ? old.refs : undefined;
      const oldKeys = old?.k === "map" ? old.keys : undefined;
      const at = new Map<number, string[]>();
      for (const m of o.k === "array" ? marks?.get(id) ?? [] : []) at.set(m.at, [...(at.get(m.at) ?? []), m.name]);
      // a cell that refers to an object changed only when it refers to ANOTHER one: the object's own change is lit on its field,
      // not on every cell whose short text (Sara, 23, …) mentions it
      const cellChanged = (i: number, item: string) => {
        const r = o.refs?.[i] ?? null, was = oldRefs?.[i] ?? null;
        return r !== null || was !== null ? r !== was || oldItems === undefined || i >= oldItems.length : oldItems?.[i] !== item;
      };
      rows = o.items.map((item, i) => ({ key: keys[i], ...link(o.refs?.[i], item),
        changed: !!prev && !!old && (cellChanged(i, item) || (o.k === "map" && oldKeys?.[i] !== keys[i])),
        marks: at.get(i) ?? [] }));
    }
    const shown = rows.slice(0, OG_ROWS);
    const removed = !!old && (old.k === "obj" ? flat(old.fields).length : old.items.length) > rows.length;
    return { id, kind: o.k, title: o.type, rows: shown, more: rows.length - shown.length, col: col.get(id)!,
      fresh: !!prev && !was, changed: rows.some(r => r.changed) || removed };
  });
  return { roots: roots.filter(r => kept.has(r.target)), nodes, hidden: order.length - nodes.length };
}

/** The diagram in words (the drawing's screen-reader sentence). */
export function graphSentence(g: OgGraph): string {
  const name = (id: number) => { const n = g.nodes.find(x => x.id === id); return n ? n.title + " #" + id : "#" + id; };
  const parts: string[] = ["مخطّط الكائنات."];
  for (const r of g.roots) parts.push(r.name + " يشير إلى " + name(r.target) + ".");
  for (const n of g.nodes) {
    const rows = n.rows.map(r => (n.kind === "obj" ? r.key : n.kind === "set" ? "" : "[" + r.key + "]") + (r.ref !== null ? (n.kind === "set" ? "" : " ") + "→ " + name(r.ref) : (n.kind === "set" ? "" : " = ") + r.text));
    parts.push(name(n.id) + (n.fresh ? " (جديد)" : "") + ": " + (rows.length ? rows.join("، ") : "فارغ") + (n.more ? "، و" + n.more + " أخرى" : "") + ".");
  }
  const changed = g.nodes.flatMap(n => n.rows.filter(r => r.changed).map(r => name(n.id) + (n.kind === "obj" ? "." + r.key : "[" + r.key + "]")));
  if (changed.length) parts.push("تغيّر في هذه الخطوة: " + changed.join("، ") + ".");
  if (g.hidden) parts.push("و" + g.hidden + " كائنات أخرى لا تتسع لها الصورة.");
  return parts.join(" ");
}
