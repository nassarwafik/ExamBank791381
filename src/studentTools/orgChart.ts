// DG11 «الهيكل التنظيمي» (docs/enterprise-diagram-editor-design.md §23) — who reports to whom in a company: people (a picture from the
// icon library, a name, a position) and departments, joined by «يتبع لـ» lines drawn from a manager down to the ones under them.
//   • treeLayout: «رتّب الشجرة» — each manager over the ones who report to him, centred over them, level under level; the order
//     among colleagues is the order the learner drew them in (left to right); notes, icons and texts stay where they are;
//   • addReport: «أضف تابعًا» — a new person under the chosen one, joined to them, and the tree arranged again;
//   • DG12: the reporting line drawn dotted with an arrowhead, as some books draw it; an assistant / adviser («مساعد / مستشار») beside
//     a manager, joined by a dotted line on his level (placed beside him by «رتّب الشجرة»); addAssistant: «أضف مساعدًا بجانبه».
// Pure: no React, no DOM.

import { DIAGRAM_LIMITS, addNode, connect, type DiagramDoc, type DNode } from "./diagramDoc";

/** The components that are the chart itself (a note, an icon, a text beside it are not). */
export const MEMBERS: readonly string[] = ["person", "unit"];
export const REPORTS = "reports";
/** DG12: the reporting line, dotted with an arrowhead (the same line, drawn another way). */
export const REPORTS_DOTTED = "reportsDotted";
export const REPORT_TYPES: readonly string[] = [REPORTS, REPORTS_DOTTED];
/** DG12: from a manager to his assistant or adviser, beside him. */
export const ASSISTS = "assists";
const GAP_X = 28, GAP_Y = 64, MARGIN = 40;

type Size = { w: number; h: number };
/** Each member's manager (the first «يتبع لـ» into it from another member) and its team, in the order they are drawn, left to right;
 *  DG12: each assistant (a member with no manager and no team, joined to a manager by «مساعد / مستشار») and the manager it sits beside. */
export function orgTree(doc: DiagramDoc): { boss: Map<string, string>; team: Map<string, string[]>; members: DNode[]; aideOf: Map<string, string> } {
  const members = doc.nodes.filter(n => MEMBERS.includes(n.type));
  const isMember = new Set(members.map(n => n.id));
  const boss = new Map<string, string>();
  for (const e of doc.edges) if (REPORT_TYPES.includes(e.type) && e.from !== e.to && isMember.has(e.from) && isMember.has(e.to) && !boss.has(e.to)) boss.set(e.to, e.from);
  const at = new Map(members.map(n => [n.id, n]));
  const byX = (a: string, b: string) => at.get(a)!.x - at.get(b)!.x || at.get(a)!.y - at.get(b)!.y || (a < b ? -1 : 1);
  const team = new Map<string, string[]>();
  for (const [child, b] of boss) team.set(b, [...(team.get(b) ?? []), child]);
  for (const t of team.values()) t.sort(byX);
  const aideOf = new Map<string, string>();
  for (const e of doc.edges) {
    if (e.type !== ASSISTS || e.from === e.to || !isMember.has(e.from) || !isMember.has(e.to) || aideOf.has(e.to)) continue;
    if (boss.has(e.to) || team.has(e.to) || aideOf.has(e.from)) continue;   // one with a place of its own in the tree stays there
    aideOf.set(e.to, e.from);
  }
  // an assistant of an assistant, or a manager who is himself placed as an assistant: no side place
  for (const [aide, m] of [...aideOf]) if (aideOf.has(m)) aideOf.delete(aide);
  return { boss, team, members, aideOf };
}

/** «رتّب الشجرة»: the members placed as a tree (several trees side by side), from where the chart's top left already is. `sizes`: each
 *  component's size as drawn. Too wide for the page: `fits` false (placed anyway, held on the page). */
export function treeLayout(doc: DiagramDoc, sizes: ReadonlyMap<string, Size>): { doc: DiagramDoc; fits: boolean } {
  const { boss, team, members, aideOf } = orgTree(doc);
  if (!members.length) return { doc, fits: true };
  const aides = (id: string) => members.filter(n => aideOf.get(n.id) === id).map(n => n.id);
  const size = (id: string): Size => sizes.get(id) ?? { w: members.find(n => n.id === id)!.w, h: members.find(n => n.id === id)!.h };
  const at = new Map(members.map(n => [n.id, n]));
  // the tops: no manager; then anyone left in a loop of managers, as a top of its own
  const seen = new Set<string>();
  const order: string[] = [];
  const tops = members.filter(n => !boss.has(n.id) && !aideOf.has(n.id)).sort((a, b) => a.x - b.x || a.y - b.y).map(n => n.id);
  const walk = (id: string, depth: number, depthOf: Map<string, number>) => {
    if (seen.has(id)) return;
    seen.add(id); order.push(id); depthOf.set(id, depth);
    for (const c of team.get(id) ?? []) walk(c, depth + 1, depthOf);
  };
  const depthOf = new Map<string, number>();
  for (const t of tops) walk(t, 0, depthOf);
  for (const n of [...members].sort((a, b) => a.x - b.x || a.y - b.y)) if (!seen.has(n.id) && !aideOf.has(n.id)) { tops.push(n.id); walk(n.id, 0, depthOf); }
  // DG12: an assistant stands on his manager's level, on his left, the room for them kept on both sides so the manager stays centred
  for (const [aide, m] of aideOf) if (depthOf.has(m)) depthOf.set(aide, depthOf.get(m)!);
  const aideRoom = (id: string) => aides(id).reduce((s, a) => s + size(a).w + GAP_X * 2, 0);
  const kids = (id: string) => (team.get(id) ?? []).filter(c => depthOf.get(c) === depthOf.get(id)! + 1);
  // the levels' heights
  const levelH: number[] = [];
  for (const [id, d] of depthOf) levelH[d] = Math.max(levelH[d] ?? 0, size(id).h);
  const levelY: number[] = [];
  const top = Math.max(MARGIN / 2, Math.min(...members.map(n => n.y)));
  levelH.forEach((_, d) => { levelY[d] = d ? levelY[d - 1] + levelH[d - 1] + GAP_Y : top; });
  // DG12: the room a manager's assistants need on his left that his team's middle does not leave (found by placing, then placing again)
  const extra = new Map<string, number>();
  const width = new Map<string, number>();
  const place = new Map<string, { x: number; y: number }>();
  // each subtree's width: its team side by side, or the manager (and his assistants), and the room added on the left
  const measure = (id: string): number => {
    const ks = kids(id);
    const w = Math.max(size(id).w + aideRoom(id), ks.reduce((s, k) => s + measure(k), 0) + GAP_X * Math.max(0, ks.length - 1)) + (extra.get(id) ?? 0);
    width.set(id, w);
    return w;
  };
  // place: each subtree in its own span, the manager centred over his team, his assistants on his left
  let short = false;
  const put = (id: string, left: number) => {
    const ks = kids(id), w = width.get(id)!, d = depthOf.get(id)!, room = aideRoom(id), more = extra.get(id) ?? 0;
    const inner = ks.reduce((s, k) => s + width.get(k)!, 0) + GAP_X * Math.max(0, ks.length - 1);
    let x = left + more + (w - more - inner) / 2;
    for (const k of ks) { put(k, x); x += width.get(k)! + GAP_X; }
    // over the middle of his team (its first and last), held inside his own span
    const centre = ks.length ? (place.get(ks[0])!.x + size(ks[0]).w / 2 + place.get(ks[ks.length - 1])!.x + size(ks[ks.length - 1]).w / 2) / 2 : left + more + room + (w - more - room) / 2;
    const px = Math.max(left, Math.min(left + w - size(id).w, centre - size(id).w / 2));
    if (px - room < left - 0.5) { extra.set(id, more + Math.ceil(left - (px - room))); short = true; }
    place.set(id, { x: Math.round(px), y: Math.round(levelY[d] + (levelH[d] - size(id).h) / 2) });
    let ax = Math.round(px);
    for (const a of aides(id)) {
      ax -= GAP_X * 2 + size(a).w;
      place.set(a, { x: ax, y: place.get(id)!.y });   // top to top: the two pictures side by side, their line level
    }
  };
  let left = 0;
  for (let pass = 0; pass < 20; pass++) {
    short = false;
    place.clear();
    for (const t of tops) measure(t);
    left = Math.max(MARGIN / 2, Math.min(...members.map(n => n.x)));
    for (const t of tops) { put(t, left); left += width.get(t)! + GAP_X * 2; }
    if (!short) break;
  }
  const fits = left - GAP_X * 2 <= DIAGRAM_LIMITS.canvasW && levelY[levelY.length - 1] + levelH[levelH.length - 1] <= DIAGRAM_LIMITS.canvasH;
  return {
    doc: { ...doc, nodes: doc.nodes.map(n => {
      const p = place.get(n.id);
      if (!p || !at.has(n.id)) return n;
      return { ...n, x: Math.max(0, Math.min(DIAGRAM_LIMITS.canvasW - n.w, p.x)), y: Math.max(0, Math.min(DIAGRAM_LIMITS.canvasH - n.h, p.y)) };
    }) },
    fits,
  };
}

/** «أضف تابعًا»: a new person under `bossId`, joined to them with a right-angled «يتبع لـ», then the tree arranged again. The new one goes
 *  to the left of the team (Arabic reads right to left: the first one added stays first, on the right). */
export function addReport(doc: DiagramDoc, bossId: string, sizes: (d: DiagramDoc) => ReadonlyMap<string, Size>): { ok: true; doc: DiagramDoc; id: string; fits: boolean } | { ok: false; error: string } {
  const b = doc.nodes.find(n => n.id === bossId);
  if (!b || !MEMBERS.includes(b.type)) return { ok: false, error: "اختر شخصًا أو قسمًا في الهيكل أولًا." };
  const team = orgTree(doc).team.get(bossId) ?? [];
  const leftmost = Math.min(b.x, ...doc.nodes.filter(n => team.includes(n.id)).map(n => n.x));
  const added = addNode(doc, "person", { x: Math.max(40, leftmost - 60), y: Math.min(DIAGRAM_LIMITS.canvasH - 100, b.y + b.h + GAP_Y + 45) });
  if (added.ok && team.length) {   // the free spot is found by stepping right: hold it left of the team
    const n = added.doc.nodes.find(x => x.id === added.id)!;
    n.x = Math.min(n.x, Math.max(0, leftmost - n.w - GAP_X));
  }
  if (!added.ok) return added;
  const joined = connect(added.doc, bossId, added.id!, reportStyle(doc), "ortho");
  if (!joined.ok) return joined;
  const laid = treeLayout(joined.doc, sizes(joined.doc));
  return { ok: true, doc: laid.doc, id: added.id!, fits: laid.fits };
}

/** DG12: the reporting line the chart already draws (dotted when all its lines are dotted; solid otherwise, and in a new chart). */
export function reportStyle(doc: DiagramDoc): string {
  const lines = doc.edges.filter(e => REPORT_TYPES.includes(e.type));
  return lines.length && lines.every(e => e.type === REPORTS_DOTTED) ? REPORTS_DOTTED : REPORTS;
}

/** DG12 «أضف مساعدًا بجانبه»: a new person beside the manager `bossId` (an assistant, a secretary, an adviser), joined by «مساعد /
 *  مستشار», then the tree arranged again (the assistant on the manager's left, on his level). */
export function addAssistant(doc: DiagramDoc, bossId: string, sizes: (d: DiagramDoc) => ReadonlyMap<string, Size>): { ok: true; doc: DiagramDoc; id: string; fits: boolean } | { ok: false; error: string } {
  const b = doc.nodes.find(n => n.id === bossId);
  if (!b || !MEMBERS.includes(b.type)) return { ok: false, error: "اختر شخصًا أو قسمًا في الهيكل أولًا." };
  if (orgTree(doc).aideOf.has(bossId)) return { ok: false, error: "المختار مساعد لغيره: اختر المدير نفسه." };
  const added = addNode(doc, "person", { x: Math.max(40, b.x - 80), y: b.y + b.h / 2 });
  if (!added.ok) return added;
  const n = added.doc.nodes.find(x => x.id === added.id)!;
  n.text = { ...n.text, details: "مساعد" };
  const joined = connect(added.doc, bossId, added.id!, ASSISTS, "ortho");
  if (!joined.ok) return joined;
  const laid = treeLayout(joined.doc, sizes(joined.doc));
  return { ok: true, doc: laid.doc, id: added.id!, fits: laid.fits };
}
