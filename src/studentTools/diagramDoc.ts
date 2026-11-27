// «محرّر المخططات» (docs/enterprise-diagram-editor-design.md) — the diagram document and every change to it, the undo history, and the
// file / draft format with its strict reader. Pure: no React, no DOM, no storage, no network. The tool decides where a file goes.
//
// A diagram is a kind, a list of components (nodes) and a list of arrows (edges). Every operation returns a NEW document (or the reason
// it cannot be done), so the history is a plain list of documents and nothing is ever mutated in place.

import { DIAGRAM_COLOR_IDS, edgeSpec, isDiagramKind, kindSpec, nodeSpec, type DiagramColor, type DiagramKind } from "./diagramCatalog";

export type DNode = { id: string; type: string; x: number; y: number; w: number; h: number; text: Record<string, string>; color: DiagramColor };
/** `y`: a sequence diagram's message height on the page (its order, top to bottom); 0 in every other kind. */
export type DEdge = { id: string; type: string; from: string; to: string; label: string; fromLabel: string; toLabel: string; y: number };
export type DiagramDoc = { kind: DiagramKind; nodes: DNode[]; edges: DEdge[] };
export type DocResult = { ok: true; doc: DiagramDoc } | { ok: false; error: string };

export const DIAGRAM_LIMITS = Object.freeze({
  nodes: 150, edges: 300, text: 200, lines: 3000, canvasW: 2400, canvasH: 1600, fileBytes: 512 * 1024, history: 100
});
/** A sequence diagram: every lifeline's head stands on this line; messages start under it, one step apart. */
export const SEQ_TOP = 40;
export const SEQ_FIRST = 140;
export const SEQ_STEP = 46;
export const GRID = 10;

export const emptyDoc = (kind: DiagramKind): DiagramDoc => ({ kind, nodes: [], edges: [] });
const snap = (v: number) => Math.round(v / GRID) * GRID;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function nextId(doc: DiagramDoc, prefix: "n" | "e"): string {
  let max = 0;
  for (const x of prefix === "n" ? doc.nodes : doc.edges) {
    const m = /^[ne](\d+)$/.exec(x.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return prefix + (max + 1);
}
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const isContainer = (doc: DiagramDoc, n: DNode) => !!nodeSpec(doc.kind, n.type)?.resizable;

/** Adds a component of `type` near `at` (the centre of what the learner sees), on a free spot. */
export function addNode(doc: DiagramDoc, type: string, at: { x: number; y: number }): DocResult & { id?: string } {
  const spec = nodeSpec(doc.kind, type);
  if (!spec) return { ok: false, error: "هذا المكوّن ليس من مكوّنات هذا المخطط." };
  if (doc.nodes.length >= DIAGRAM_LIMITS.nodes) return { ok: false, error: `وصلت إلى الحد: ${DIAGRAM_LIMITS.nodes} مكوّنًا في المخطط.` };
  const w = spec.minW, h = spec.minH;
  const lifeline = spec.form === "lifeline";
  let x = snap(at.x - w / 2), y = lifeline ? SEQ_TOP : snap(at.y - h / 2);
  // a free spot: step right and down until nothing (but a container) is under the new component
  const solid = doc.nodes.filter(n => !isContainer(doc, n));
  for (let i = 0; i < 40 && !spec.resizable && solid.some(n => overlaps({ x, y, w, h }, n)); i++) {
    if (lifeline) x += 40; else { x += 30; y += 30; }
  }
  x = clamp(x, 0, DIAGRAM_LIMITS.canvasW - w);
  y = clamp(y, 0, DIAGRAM_LIMITS.canvasH - h);
  const id = nextId(doc, "n");
  const node: DNode = { id, type, x, y, w, h, text: { ...spec.defaults }, color: "none" };
  // a container goes UNDER everything (first in the list is drawn first)
  const nodes = spec.resizable ? [node, ...doc.nodes] : [...doc.nodes, node];
  return { ok: true, doc: { ...doc, nodes }, id };
}

export function moveNode(doc: DiagramDoc, id: string, x: number, y: number): DiagramDoc {
  const n = doc.nodes.find(v => v.id === id);
  if (!n) return doc;
  const lifeline = nodeSpec(doc.kind, n.type)?.form === "lifeline";
  const nx = clamp(snap(x), 0, DIAGRAM_LIMITS.canvasW - n.w), ny = lifeline ? SEQ_TOP : clamp(snap(y), 0, DIAGRAM_LIMITS.canvasH - n.h);
  if (nx === n.x && ny === n.y) return doc;
  return { ...doc, nodes: doc.nodes.map(v => (v.id === id ? { ...v, x: nx, y: ny } : v)) };
}

/** Moves several components by the same step (a container and what it holds). */
export function moveNodesBy(doc: DiagramDoc, ids: readonly string[], dx: number, dy: number): DiagramDoc {
  const set = new Set(ids);
  const moving = doc.nodes.filter(n => set.has(n.id));
  if (!moving.length) return doc;
  // the step that keeps every moved component on the page
  let sx = snap(dx), sy = snap(dy);
  for (const n of moving) {
    sx = clamp(sx, -n.x, DIAGRAM_LIMITS.canvasW - n.w - n.x);
    const lifeline = nodeSpec(doc.kind, n.type)?.form === "lifeline";
    sy = lifeline ? sy : clamp(sy, -n.y, DIAGRAM_LIMITS.canvasH - n.h - n.y);
  }
  if (!sx && !sy) return doc;
  return { ...doc, nodes: doc.nodes.map(n => {
    if (!set.has(n.id)) return n;
    const lifeline = nodeSpec(doc.kind, n.type)?.form === "lifeline";
    return { ...n, x: n.x + sx, y: lifeline ? SEQ_TOP : n.y + sy };
  }) };
}

/** The components lying wholly inside a container (they move with it). */
export function insideOf(doc: DiagramDoc, id: string): string[] {
  const c = doc.nodes.find(n => n.id === id);
  if (!c || !isContainer(doc, c)) return [];
  return doc.nodes.filter(n => n.id !== id && n.x >= c.x && n.y >= c.y && n.x + n.w <= c.x + c.w && n.y + n.h <= c.y + c.h).map(n => n.id);
}

export function resizeNode(doc: DiagramDoc, id: string, w: number, h: number): DiagramDoc {
  const n = doc.nodes.find(v => v.id === id);
  const spec = n && nodeSpec(doc.kind, n.type);
  if (!n || !spec?.resizable) return doc;
  const nw = clamp(snap(w), spec.minW, DIAGRAM_LIMITS.canvasW - n.x), nh = clamp(snap(h), spec.minH, DIAGRAM_LIMITS.canvasH - n.y);
  if (nw === n.w && nh === n.h) return doc;
  return { ...doc, nodes: doc.nodes.map(v => (v.id === id ? { ...v, w: nw, h: nh } : v)) };
}

/** The bounded, clean form of a text the learner typed into a field. */
export function cleanText(value: string, lines: boolean): string {
  const max = lines ? DIAGRAM_LIMITS.lines : DIAGRAM_LIMITS.text;
  // eslint-disable-next-line no-control-regex
  let s = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");
  if (!lines) s = s.replace(/\n/g, " ");
  return s.slice(0, max);
}

export function setText(doc: DiagramDoc, id: string, key: string, value: string): DiagramDoc {
  const n = doc.nodes.find(v => v.id === id);
  const field = n && nodeSpec(doc.kind, n.type)?.fields.find(f => f.key === key);
  if (!n || !field) return doc;
  const v = cleanText(value, !!field.lines);
  if (n.text[key] === v) return doc;
  return { ...doc, nodes: doc.nodes.map(x => (x.id === id ? { ...x, text: { ...x.text, [key]: v } } : x)) };
}

export function setColor(doc: DiagramDoc, id: string, color: DiagramColor): DiagramDoc {
  if (!DIAGRAM_COLOR_IDS.includes(color)) return doc;
  return { ...doc, nodes: doc.nodes.map(x => (x.id === id ? { ...x, color } : x)) };
}

/** Removes a component and every arrow that touches it. */
export function removeNode(doc: DiagramDoc, id: string): DiagramDoc {
  if (!doc.nodes.some(n => n.id === id)) return doc;
  return { ...doc, nodes: doc.nodes.filter(n => n.id !== id), edges: doc.edges.filter(e => e.from !== id && e.to !== id) };
}

export function duplicateNode(doc: DiagramDoc, id: string): DocResult & { id?: string } {
  const n = doc.nodes.find(v => v.id === id);
  if (!n) return { ok: false, error: "اختر مكوّنًا أولًا." };
  if (doc.nodes.length >= DIAGRAM_LIMITS.nodes) return { ok: false, error: `وصلت إلى الحد: ${DIAGRAM_LIMITS.nodes} مكوّنًا في المخطط.` };
  const nid = nextId(doc, "n");
  const lifeline = nodeSpec(doc.kind, n.type)?.form === "lifeline";
  const copy: DNode = { ...n, id: nid, text: { ...n.text },
    x: clamp(n.x + (lifeline ? n.w + 40 : 30), 0, DIAGRAM_LIMITS.canvasW - n.w), y: lifeline ? SEQ_TOP : clamp(n.y + 30, 0, DIAGRAM_LIMITS.canvasH - n.h) };
  const at = doc.nodes.indexOf(n) + 1;
  return { ok: true, doc: { ...doc, nodes: [...doc.nodes.slice(0, at), copy, ...doc.nodes.slice(at)] }, id: nid };
}

/** The height of the next message in a sequence diagram: under the lowest one. */
export const nextMessageY = (doc: DiagramDoc): number => doc.edges.reduce((m, e) => Math.max(m, e.y + SEQ_STEP), SEQ_FIRST);

/** Draws an arrow of `type` from one component to another (or to itself). */
export function connect(doc: DiagramDoc, from: string, to: string, type: string): DocResult & { id?: string } {
  const spec = edgeSpec(doc.kind, type);
  if (!spec) return { ok: false, error: "هذا السهم ليس من أسهم هذا المخطط." };
  const a = doc.nodes.find(n => n.id === from), b = doc.nodes.find(n => n.id === to);
  if (!a || !b) return { ok: false, error: "اختر عنصرين موجودين في المخطط." };
  const sa = nodeSpec(doc.kind, a.type), sb = nodeSpec(doc.kind, b.type);
  if (sa?.form === "note" || sb?.form === "note") {
    if (from === to) return { ok: false, error: "لا يوصل سهم بين الملاحظة ونفسها." };
  }
  if (doc.kind === "sequence" && (sa?.form !== "lifeline" || sb?.form !== "lifeline")) return { ok: false, error: "في مخطط التسلسل تصل الرسالة بين كائنين (خطّي حياة)." };
  if (doc.edges.length >= DIAGRAM_LIMITS.edges) return { ok: false, error: `وصلت إلى الحد: ${DIAGRAM_LIMITS.edges} سهمًا في المخطط.` };
  const id = nextId(doc, "e");
  const y = doc.kind === "sequence" ? nextMessageY(doc) : 0;
  if (y > DIAGRAM_LIMITS.canvasH - 40) return { ok: false, error: "لا مكان لرسالة أخرى في أسفل الصفحة." };
  const edge: DEdge = { id, type, from, to, label: spec.defaultLabel ?? "", fromLabel: spec.defaultFromLabel ?? "", toLabel: spec.defaultToLabel ?? "", y };
  return { ok: true, doc: { ...doc, edges: [...doc.edges, edge] }, id };
}

export function setEdge(doc: DiagramDoc, id: string, patch: Partial<Pick<DEdge, "type" | "label" | "fromLabel" | "toLabel">>): DiagramDoc {
  const e = doc.edges.find(v => v.id === id);
  if (!e) return doc;
  const next: DEdge = { ...e };
  if (patch.type !== undefined) {
    const spec = edgeSpec(doc.kind, patch.type);
    if (!spec) return doc;
    const old = edgeSpec(doc.kind, e.type);
    // a text the learner never changed follows the new arrow's own default («include» → «extend», 1/∞ → 1/1)
    if (e.label === (old?.defaultLabel ?? "")) next.label = spec.defaultLabel ?? "";
    if (e.fromLabel === (old?.defaultFromLabel ?? "")) next.fromLabel = spec.defaultFromLabel ?? "";
    if (e.toLabel === (old?.defaultToLabel ?? "")) next.toLabel = spec.defaultToLabel ?? "";
    next.type = patch.type;
  }
  for (const k of ["label", "fromLabel", "toLabel"] as const) if (patch[k] !== undefined) next[k] = cleanText(patch[k]!, false);
  return { ...doc, edges: doc.edges.map(v => (v.id === id ? next : v)) };
}

export function reverseEdge(doc: DiagramDoc, id: string): DiagramDoc {
  return { ...doc, edges: doc.edges.map(e => (e.id === id ? { ...e, from: e.to, to: e.from, fromLabel: e.toLabel, toLabel: e.fromLabel } : e)) };
}

export function removeEdge(doc: DiagramDoc, id: string): DiagramDoc {
  if (!doc.edges.some(e => e.id === id)) return doc;
  if (doc.kind !== "sequence") return { ...doc, edges: doc.edges.filter(e => e.id !== id) };
  // a sequence closes the gap: the messages under it move up one step
  const gone = doc.edges.find(e => e.id === id)!;
  return { ...doc, edges: doc.edges.filter(e => e.id !== id).map(e => (e.y > gone.y ? { ...e, y: e.y - SEQ_STEP } : e)) };
}

/** A sequence diagram: swaps a message with the one above (-1) or below (+1). */
export function moveMessage(doc: DiagramDoc, id: string, dir: -1 | 1): DiagramDoc {
  const sorted = [...doc.edges].sort((a, b) => a.y - b.y);
  const i = sorted.findIndex(e => e.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return doc;
  const a = sorted[i], b = sorted[j];
  return { ...doc, edges: doc.edges.map(e => (e.id === a.id ? { ...e, y: b.y } : e.id === b.id ? { ...e, y: a.y } : e)) };
}

// ── history ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type History = { past: DiagramDoc[]; present: DiagramDoc; future: DiagramDoc[] };
export const startHistory = (doc: DiagramDoc): History => ({ past: [], present: doc, future: [] });
/** A new present; the old one becomes undoable (unless nothing changed). */
export function commit(h: History, doc: DiagramDoc): History {
  if (doc === h.present) return h;
  return { past: [...h.past, h.present].slice(-DIAGRAM_LIMITS.history), present: doc, future: [] };
}
/** Replaces the present without a history step (a drag in progress); `commit` from the drag's start ends it. */
export const preview = (h: History, doc: DiagramDoc): History => (doc === h.present ? h : { ...h, present: doc });
export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

// ── file and draft ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const DIAGRAM_FILE_FORMAT = "tadris.diagram";
export const DIAGRAM_DRAFT_FORMAT = "tadris.diagram.draft";
export type ParseResult = { ok: true; doc: DiagramDoc } | { ok: false; error: string };

const BAD_FILE = "هذا الملف ليس مخططًا صالحًا من «محرّر المخططات».";
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const closed = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every(k => keys.includes(k)) && keys.every(k => k in o);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
// eslint-disable-next-line no-control-regex
const cleanString = (v: unknown, max: number, lines: boolean): v is string => typeof v === "string" && v.length <= max && !(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(v);
const ID = /^[ne][0-9]{1,6}$/;

/** The diagram's parts, read strictly for `kind`: a closed set of keys, known components and arrows, bounded texts, no dangling arrow. */
export function readDiagramBody(kind: DiagramKind, nodesRaw: unknown, edgesRaw: unknown): ParseResult {
  const k = kindSpec(kind);
  if (!Array.isArray(nodesRaw) || !Array.isArray(edgesRaw)) return { ok: false, error: BAD_FILE };
  if (nodesRaw.length > DIAGRAM_LIMITS.nodes || edgesRaw.length > DIAGRAM_LIMITS.edges) return { ok: false, error: "المخطط في الملف أكبر من حدود المحرّر." };
  const nodes: DNode[] = [], ids = new Set<string>();
  for (const raw of nodesRaw) {
    if (!isPlain(raw) || !closed(raw, ["id", "type", "x", "y", "w", "h", "text", "color"])) return { ok: false, error: BAD_FILE };
    const spec = k.nodes.find(n => n.type === raw.type);
    if (!spec || typeof raw.id !== "string" || !ID.test(raw.id) || ids.has(raw.id)) return { ok: false, error: BAD_FILE };
    if (!isInt(raw.w, spec.minW, DIAGRAM_LIMITS.canvasW) || !isInt(raw.h, spec.minH, DIAGRAM_LIMITS.canvasH)) return { ok: false, error: BAD_FILE };
    if (!isInt(raw.x, 0, DIAGRAM_LIMITS.canvasW - raw.w) || !isInt(raw.y, 0, DIAGRAM_LIMITS.canvasH - raw.h)) return { ok: false, error: BAD_FILE };
    if (typeof raw.color !== "string" || !DIAGRAM_COLOR_IDS.includes(raw.color as DiagramColor) || !isPlain(raw.text)) return { ok: false, error: BAD_FILE };
    const text: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw.text)) {
      const f = spec.fields.find(x => x.key === key);
      if (!f || !cleanString(value, f.lines ? DIAGRAM_LIMITS.lines : DIAGRAM_LIMITS.text, !!f.lines)) return { ok: false, error: BAD_FILE };
      text[key] = value;
    }
    ids.add(raw.id);
    nodes.push({ id: raw.id, type: spec.type, x: raw.x, y: raw.y, w: raw.w, h: raw.h, text, color: raw.color as DiagramColor });
  }
  const edges: DEdge[] = [], eids = new Set<string>();
  for (const raw of edgesRaw) {
    if (!isPlain(raw) || !closed(raw, ["id", "type", "from", "to", "label", "fromLabel", "toLabel", "y"])) return { ok: false, error: BAD_FILE };
    const spec = k.edges.find(e => e.type === raw.type);
    if (!spec || typeof raw.id !== "string" || !ID.test(raw.id) || eids.has(raw.id)) return { ok: false, error: BAD_FILE };
    if (typeof raw.from !== "string" || typeof raw.to !== "string" || !ids.has(raw.from) || !ids.has(raw.to)) return { ok: false, error: BAD_FILE };
    if (![raw.label, raw.fromLabel, raw.toLabel].every(v => cleanString(v, DIAGRAM_LIMITS.text, false))) return { ok: false, error: BAD_FILE };
    if (!isInt(raw.y, 0, DIAGRAM_LIMITS.canvasH)) return { ok: false, error: BAD_FILE };
    eids.add(raw.id);
    edges.push({ id: raw.id, type: spec.type, from: raw.from, to: raw.to, label: raw.label as string, fromLabel: raw.fromLabel as string, toLabel: raw.toLabel as string, y: raw.y });
  }
  return { ok: true, doc: { kind, nodes, edges } };
}

export function serializeDiagram(doc: DiagramDoc): string {
  return JSON.stringify({ format: DIAGRAM_FILE_FORMAT, version: 1, kind: doc.kind, nodes: doc.nodes, edges: doc.edges }, null, 1);
}

/** Reads a file the learner opened: nothing but a valid diagram@1 is accepted. */
export function parseDiagram(text: string): ParseResult {
  if (typeof text !== "string" || text.length > DIAGRAM_LIMITS.fileBytes) return { ok: false, error: "الملف أكبر من الحد المسموح (512 KB)." };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: BAD_FILE }; }
  if (!isPlain(raw) || !closed(raw, ["format", "version", "kind", "nodes", "edges"]) || raw.format !== DIAGRAM_FILE_FORMAT) return { ok: false, error: BAD_FILE };
  if (raw.version !== 1) return { ok: false, error: "هذا الملف من إصدار أحدث من «محرّر المخططات»." };
  if (!isDiagramKind(raw.kind)) return { ok: false, error: BAD_FILE };
  return readDiagramBody(raw.kind, raw.nodes, raw.edges);
}

/** The draft: the learner's last diagram of each kind, and the kind open last. */
export type DiagramDraft = { current: DiagramKind; docs: Partial<Record<DiagramKind, DiagramDoc>> };
export function serializeDraft(d: DiagramDraft): string {
  const docs: Record<string, { nodes: DNode[]; edges: DEdge[] }> = {};
  for (const [kind, doc] of Object.entries(d.docs)) if (doc && doc.nodes.length) docs[kind] = { nodes: doc.nodes, edges: doc.edges };
  return JSON.stringify({ format: DIAGRAM_DRAFT_FORMAT, version: 1, current: d.current, docs });
}
/** A draft that is not wholly valid is dropped kind by kind (a damaged kind never hides the others). */
export function parseDraft(text: string | null): DiagramDraft | null {
  if (!text || text.length > DIAGRAM_LIMITS.fileBytes * 4) return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!isPlain(raw) || !closed(raw, ["format", "version", "current", "docs"]) || raw.format !== DIAGRAM_DRAFT_FORMAT || raw.version !== 1) return null;
  if (!isDiagramKind(raw.current) || !isPlain(raw.docs)) return null;
  const docs: Partial<Record<DiagramKind, DiagramDoc>> = {};
  for (const [kind, body] of Object.entries(raw.docs)) {
    if (!isDiagramKind(kind) || !isPlain(body) || !closed(body, ["nodes", "edges"])) continue;
    const r = readDiagramBody(kind, body.nodes, body.edges);
    if (r.ok) docs[kind] = r.doc;
  }
  return { current: raw.current, docs };
}

export const diagramFileName = (kind: DiagramKind): string => "مخطط-" + kindSpec(kind).label.replace(/\s*\(.*\)\s*/g, "").replace(/\s+/g, "-");
