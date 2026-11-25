import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Machine } from "../learning/activities/automaton";
import { Diagram } from "../learning/activities/automatonDiagram";
import type { Scene } from "../learning/activities/automatonScene";
import { addArrow, addStateAt, cellAt, EPS, GRID_MAX, MAX_STATES, moveStateTo, removeState, stateAt, type LabDraft } from "./automataLab";
import "./automataLabCanvas.css";

/**
 * AUTO-A6b (docs/enterprise-automata-lab-a4.md §9) — «ارسم بالفأرة»: the machine drawn as the book draws it, and edited on the drawing,
 * on a desktop (a fine pointer; the transition table stays, and is the phone's way):
 *   • drag a state to move it — it snaps to the drawing's grid; dropped on another state, the two swap places;
 *   • «رسم الأسهم» (or Shift + drag): from a state to another (or to itself) — a finite automaton then asks the symbol (a deterministic
 *     one replaces that state's arrow for it); a push-down automaton or a Turing machine gets a new row, completed in the list below;
 *   • double-click an empty spot: a new state there;
 *   • click a state to select it: «بداية», «قبول», «حذف», and the arrow buttons (or the keyboard's arrows) move it one cell — the
 *     non-dragging way to do everything a drag does (WCAG 2.5.7).
 * Every edit goes through the same pure functions as the table (automataLab.ts); the layout is kept in the draft, so the step-by-step
 * player below draws the machine where the learner put it.
 * AUTO-A7 — the book's «صمّم الآلة» activity uses this editor too (with its exercise's state limit, `maxStates`); its styles are its own
 * (automataLabCanvas.css), so it looks the same outside the tool bar.
 */

type Cell = [number, number];
/** A move keeps the draft and the layout as they were when it began: the drop (a swap above all) is computed from them, not from the
 *  free cells the state crossed on its way. */
type Drag = { kind: "move"; state: string; pointer: number; startDraft: LabDraft; startLayout: Record<string, Cell> } | { kind: "arrow"; from: string; pointer: number; end: { x: number; y: number } };

/** Whether this device has a fine pointer (a mouse): the drawing editor is offered there only. */
export function finePointer(): boolean {
  try { return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: fine)").matches; } catch { return false; }
}

export default function AutomataLabCanvas({ ids, draft, machine, scene, layout, edit, maxStates = MAX_STATES }: {
  ids: string; draft: LabDraft; machine: Machine; scene: Scene; layout: Record<string, Cell>; edit: (d: LabDraft) => void; maxStates?: number;
}) {
  const limit = Math.min(maxStates, MAX_STATES);
  const box = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"move" | "arrow">("move");
  const [selected, setSelected] = useState<string>(draft.start);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const [said, setSaid] = useState("");
  const sel = draft.states.includes(selected) ? selected : draft.start;
  // one more cell to the right and below, so a state can be dragged (or added) beyond the drawing's edge
  const roomy = useMemo<Scene>(() => ({ ...scene, box: { ...scene.box, x2: scene.box.x2 + scene.cell.w, y2: scene.box.y2 + scene.cell.h } }), [scene]);

  const svg = () => box.current?.querySelector<SVGSVGElement>("svg.learning-automaton-svg") ?? null;
  const toDrawing = (x: number, y: number) => {
    const m = svg()?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(x, y).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const toBox = (p: { x: number; y: number }) => {   // a drawing point → the editor box's own pixels (for the arrow being drawn)
    const m = svg()?.getScreenCTM(), r = box.current?.getBoundingClientRect();
    if (!m || !r) return p;
    const q = new DOMPoint(p.x, p.y).matrixTransform(m);
    return { x: q.x - r.left, y: q.y - r.top };
  };
  const taken = (c: Cell, but?: string) => Object.entries(layout).find(([s, l]) => s !== but && l[0] === c[0] && l[1] === c[1])?.[0];

  const move = (q: string, c: Cell) => { edit(moveStateTo(draft, layout, q, c)); };
  const nudge = (dc: number, dr: number) => {
    const [c, r] = layout[sel];
    const to: Cell = [Math.max(0, Math.min(GRID_MAX, c + dc)), Math.max(0, Math.min(GRID_MAX, r + dr))];
    if (to[0] === c && to[1] === r) return;
    const other = taken(to, sel);
    move(sel, to);
    setSaid(other ? "تبادلت " + sel + " و" + other + " مكانيهما." : "نُقلت " + sel + ".");
  };
  const finishArrow = (from: string, to: string, symbol?: string) => {
    edit(addArrow(draft, from, to, symbol));
    setPending(null);
    setSaid(draft.kind === "PDA" || draft.kind === "TM"
      ? "أُضيف انتقال من " + from + " إلى " + to + ": أكمله في القائمة تحت الرسم."
      : "أُضيف السهم من " + from + " إلى " + to + " بالرمز " + symbol + (draft.kind === "DFA" ? " (في الحتمي يحلّ محلّ سهم الحالة نفسها بالرمز نفسه)." : "."));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = toDrawing(e.clientX, e.clientY);
    const s = p && stateAt(p, scene.pos, scene.r);
    if (!p || !s) return;
    setSelected(s);
    setPending(null);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(mode === "arrow" || e.shiftKey ? { kind: "arrow", from: s, pointer: e.pointerId, end: toBox(p) } : { kind: "move", state: s, pointer: e.pointerId, startDraft: draft, startLayout: layout });
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    const p = toDrawing(e.clientX, e.clientY);
    if (!p) return;
    if (drag.kind === "arrow") { setDrag({ ...drag, end: toBox(p) }); return; }
    const c = cellAt(p, scene.cell);
    if (!taken(c, drag.state)) move(drag.state, c);                  // live, onto free cells; an occupied one swaps on the drop
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    const p = toDrawing(e.clientX, e.clientY);
    setDrag(null);
    if (!p) return;
    if (drag.kind === "move") {
      const c = cellAt(p, scene.cell);
      const other = Object.keys(drag.startLayout).find(s => s !== drag.state && drag.startLayout[s][0] === c[0] && drag.startLayout[s][1] === c[1]);
      if (other) { edit(moveStateTo(drag.startDraft, drag.startLayout, drag.state, c)); setSaid("تبادلت " + drag.state + " و" + other + " مكانيهما."); }
      return;
    }
    const to = stateAt(p, scene.pos, scene.r);
    if (!to) { setSaid("أفلت السهم فوق حالة لترسمه."); return; }
    if (draft.kind === "DFA" || draft.kind === "NFA") setPending({ from: drag.from, to });
    else finishArrow(drag.from, to);
  };
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const p = toDrawing(e.clientX, e.clientY);
    if (!p || stateAt(p, scene.pos, scene.r)) return;
    if (draft.states.length >= limit) { setSaid("بلغت الحد: " + limit + " حالة."); return; }
    const c = cellAt(p, scene.cell);
    if (taken(c)) return;
    const next = addStateAt(draft, layout, c);
    edit(next);
    const q = next.states[next.states.length - 1];
    setSelected(q);
    setSaid("أُضيفت الحالة " + q + ".");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (step[e.key]) { e.preventDefault(); nudge(...step[e.key]); }
    else if (e.key === "Escape") { setPending(null); setDrag(null); }
  };

  const symbols = draft.kind === "NFA" ? [...draft.alphabet, EPS] : draft.alphabet;
  const line = drag?.kind === "arrow" ? { a: toBox(scene.pos[drag.from]), b: drag.end } : null;
  return (
    <div className="alab-canvas">
      <div className="alab-canvas-tools" role="group" aria-label="أدوات الرسم">
        <label className="learning-autodesign-toggle"><input type="radio" name={ids + "-mode"} checked={mode === "move"} onChange={() => setMode("move")} /><span>تحريك الحالات</span></label>
        <label className="learning-autodesign-toggle"><input type="radio" name={ids + "-mode"} checked={mode === "arrow"} onChange={() => setMode("arrow")} /><span>رسم الأسهم</span></label>
        <label className="stt-label" htmlFor={ids + "-sel"}>الحالة</label>
        <select id={ids + "-sel"} className="learning-autodesign-select" dir="ltr" value={sel} onChange={e => setSelected(e.target.value)}>
          {draft.states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="alab-nudge" role="group" aria-label={"انقل " + sel + " خانة"}>
          <button type="button" className="learning-autodesign-btn is-quiet" aria-label="يسارًا" onClick={() => nudge(-1, 0)}>←</button>
          <button type="button" className="learning-autodesign-btn is-quiet" aria-label="أعلى" onClick={() => nudge(0, -1)}>↑</button>
          <button type="button" className="learning-autodesign-btn is-quiet" aria-label="أسفل" onClick={() => nudge(0, 1)}>↓</button>
          <button type="button" className="learning-autodesign-btn is-quiet" aria-label="يمينًا" onClick={() => nudge(1, 0)}>→</button>
        </span>
        <button type="button" className="learning-autodesign-btn is-quiet" aria-pressed={draft.start === sel} onClick={() => edit({ ...draft, start: sel })}>بداية</button>
        <button type="button" className="learning-autodesign-btn is-quiet" aria-pressed={draft.accept.includes(sel)}
          onClick={() => edit({ ...draft, accept: draft.accept.includes(sel) ? draft.accept.filter(s => s !== sel) : [...draft.accept, sel] })}>قبول</button>
        <button type="button" className="learning-autodesign-btn is-quiet" disabled={draft.states.length <= 1}
          onClick={() => { edit(removeState(draft, sel)); setSaid("حُذفت الحالة " + sel + " وأسهمها."); }}>حذف</button>
      </div>
      <p className="stt-hint">اسحب حالة لتنقلها. في «رسم الأسهم» (أو مع Shift) اسحب من حالة إلى أخرى. انقر نقرتين على مكان فارغ لإضافة حالة.</p>
      <div ref={box} className={"alab-canvas-box" + (drag ? " is-dragging" : "") + (mode === "arrow" ? " is-arrow" : "")} tabIndex={0}
        aria-label="محرّر الرسم: الأسهم تنقل الحالة المختارة" onKeyDown={onKeyDown}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)} onDoubleClick={onDoubleClick}
        data-testid="alab-canvas">
        <Diagram machine={machine} scene={roomy} step={{ active: [sel], used: [] }} ids={ids + "-draw"} live={false} />
        {line && <svg className="alab-canvas-line" aria-hidden="true"><line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} /></svg>}
      </div>
      {pending && (
        <div className="alab-pick" role="group" aria-label={"رمز السهم من " + pending.from + " إلى " + pending.to}>
          <span>رمز السهم من <span dir="ltr">{pending.from}</span> إلى <span dir="ltr">{pending.to}</span>:</span>
          {symbols.map(s => <button key={s} type="button" className="learning-autodesign-target" dir="ltr" onClick={() => finishArrow(pending.from, pending.to, s)}>{s}</button>)}
          <button type="button" className="learning-autodesign-btn is-quiet" onClick={() => setPending(null)}>إلغاء</button>
        </div>
      )}
      <p className="stt-hint" role="status">{said}</p>
    </div>
  );
}
