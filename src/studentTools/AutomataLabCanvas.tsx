import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { edgeKey, type Machine, type PdaOp, type TmMove } from "../learning/activities/automaton";
import { Diagram } from "../learning/activities/automatonDiagram";
import type { Scene } from "../learning/activities/automatonScene";
import {
  addArrow, addStateAt, arrowSymbols, bendAt, bendStep, checkDraft, setBend, startHistory, stepHistory, EPS, FINE_STEP, GRID_MAX, handlesOf, MAX_STATES, onHandle, placeAt, placeState, removeArrow, removeState,
  snapPlace, stateAt, stateNear, swapStates, MOVE_TEXT, OP_TEXT, toggleArrowSymbol, type LabDraft, type PdaRow, type TmRow,
} from "./automataLab";
import "./automataLabCanvas.css";

/**
 * AUTO-A6b (docs/enterprise-automata-lab-a4.md §9) — «ارسم بالفأرة»: the machine drawn as the book draws it, and edited on the drawing,
 * on a desktop (a fine pointer; the transition table stays, and is the phone's way).
 * AUTO-A16a (§24) — the drawing works as the diagram editor's sheet does, with no mode to switch:
 *   • drag a state to move it — AUTO-A16b (§25): FREELY, to any place between the grid's cells (kept to two decimals in `layout`). It
 *     lines up with a nearby state's column or row, or a whole cell's (Alt: no snapping); it never lands on another state (a place that
 *     would crowd one is not taken); dropped INSIDE another state, the two swap places. The drawing's frame is held still during a drag;
 *   • the chosen state shows four link handles: drag one (or Shift + drag the state) to another state, or back onto itself — an arrow.
 *     Its window opens on the drawing: a finite automaton's symbols are put on and taken off there (a deterministic one replaces that
 *     state's arrow for the symbol; a new arrow's first symbol closes the window); a push-down automaton's or a Turing machine's transitions are written there, and a transition the
 *     machine cannot take is refused in the window (the drawing never disappears under the learner);
 *   • click an arrow: the same window — its symbols or transitions, and «حذف السهم» (the Delete key too);
 *   • AUTO-A16c (§26): DRAG an arrow to bend it (close to the straight line it snaps straight; a loop turns around its state). The
 *     bend is the drawing's only (`draft.bends`): never part of the machine, never sent with an exam answer. The window has the
 *     non-dragging way («اثنِ», «انحناء تلقائي»). «تراجع» / «إعادة» (Ctrl+Z, Ctrl+Y) step through every change of the machine,
 *     wherever it was made (the drawing, the table, the states list); one drag is one step;
 *   • double-click an empty spot: a new state there; double-click a state: accepting or not;
 *   • the non-dragging way to do everything a drag does (WCAG 2.5.7): the state list with «بداية», «قبول», «حذف», «سهم إلى» (the arrow's
 *     window with no drag), and the arrow buttons (or the keyboard's arrows) that move the chosen state one cell — onto another state,
 *     the two swap; Shift + an arrow key is a fine step.
 * Every edit goes through the same pure functions as the table (automataLab.ts); the layout is kept in the draft, so the step-by-step
 * player below draws the machine where the learner put it.
 * AUTO-A7 — the book's «صمّم الآلة» activity uses this editor too (with its exercise's state limit, `maxStates`); its styles are its own
 * (automataLabCanvas.css), so it looks the same outside the tool bar.
 */

type Cell = [number, number];
type Pt = { x: number; y: number };
type Box = Scene["box"];
/** A move keeps the draft and the layout as they were when it began: the drop (a swap above all) is computed from them, not from the
 *  places the state crossed on its way. It also keeps where in the circle the state was grabbed (`grab`), where on the screen the press
 *  was (`from`: a press that does not travel is a click, not a move) and the drawing's frame (`box`), held still until the drop — the
 *  frame follows the states, so letting it move under the pointer would move the state again. An arrow's end is a point of the drawing. */
type Drag = { kind: "move"; state: string; pointer: number; startDraft: LabDraft; startLayout: Record<string, Cell>; grab: Pt; from: Pt; moved: boolean; box: Box }
  | { kind: "arrow"; from: string; pointer: number; end: Pt }
  /** An arrow pressed: released where it was pressed, its window opens; dragged, it bends (the frame held still, as for a move). */
  | { kind: "bend"; arrow: [string, string]; pointer: number; from: Pt; moved: boolean; box: Box };
/** How far (screen pixels) a press must travel to be a move. */
const TRAVEL = 4;
/** The arrow whose window is open, and where on the editor (its own pixels) the window sits. */
type Open = { from: string; to: string; at: Pt; /** A finite automaton's arrow that had no symbol when its window opened: the first symbol put on it closes the window. */ fresh: boolean };

/** Whether this device has a fine pointer (a mouse): the drawing editor is offered there only. */
export function finePointer(): boolean {
  try { return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: fine)").matches; } catch { return false; }
}

const one = (v: string) => [...v.replace(/\s/g, "")].slice(-1).join("");
const pdaText = (r: PdaRow) => OP_TEXT[r.op] + " " + (r.read || "?") + "," + (r.top || "?") + "/" + r.write;
const tmText = (r: TmRow) => (r.read || "?") + "/" + (r.write || "?") + "," + r.move;

/** The transitions of one arrow of a push-down automaton or a Turing machine: listed, removed, and written in a small form. A row is
 *  kept in the form until it is added; one the machine cannot take is refused here, with the machine's own message. */
function RowsOfArrow({ draft, from, to, edit, say }: { draft: LabDraft; from: string; to: string; edit: (d: LabDraft) => void; say: (t: string) => void }) {
  const pda = draft.kind === "PDA";
  const fresh = () => { const d = addArrow(draft, from, to); return pda ? d.pda[d.pda.length - 1] : d.tm[d.tm.length - 1]; };
  const [row, setRow] = useState<PdaRow | TmRow>(fresh);
  const [error, setError] = useState("");
  const rows = (pda ? draft.pda : draft.tm).map((r, i) => ({ r, i })).filter(x => x.r.from === from && x.r.to === to);
  const patch = (p: Partial<PdaRow> & Partial<TmRow>) => { setRow({ ...row, ...p } as PdaRow | TmRow); setError(""); };
  const add = () => {
    const next: LabDraft = pda ? { ...draft, pda: [...draft.pda, row as PdaRow] } : { ...draft, tm: [...draft.tm, row as TmRow] };
    const c = checkDraft(next);
    if (!c.machine) { setError(c.issues[0]?.text ?? "هذا الانتقال غير صالح."); return; }
    edit(next);
    say("أُضيف الانتقال " + (pda ? pdaText(row as PdaRow) : tmText(row as TmRow)) + " من " + from + " إلى " + to + ".");
    setRow(fresh());
  };
  const drop = (i: number) => { edit(pda ? { ...draft, pda: draft.pda.filter((_, k) => k !== i) } : { ...draft, tm: draft.tm.filter((_, k) => k !== i) }); say("حُذف الانتقال."); };
  const p = row as PdaRow, t = row as TmRow;
  return (
    <>
      {rows.length > 0 && <ul className="alab-pop-rows">
        {rows.map(({ r, i }) => {
          const text = pda ? pdaText(r as PdaRow) : tmText(r as TmRow);
          return <li key={i}><span dir={pda ? "rtl" : "ltr"} className="alab-pop-notation">{text}</span><button type="button" className="alab-pop-x" aria-label={"احذف الانتقال " + text} onClick={() => drop(i)}>×</button></li>;
        })}
      </ul>}
      <div className="alab-pop-form">
        {pda ? <>
          <label>يقرأ<select className="learning-autodesign-select" dir="ltr" value={p.read} onChange={e => patch({ read: e.target.value })}>{draft.alphabet.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
          <label>القمة<input className="alab-pop-sym" dir="ltr" value={p.top} maxLength={2} autoComplete="off" spellCheck={false} onChange={e => patch({ top: one(e.target.value) })} /></label>
          <label>العملية<select className="learning-autodesign-select" value={p.op} onChange={e => patch({ op: e.target.value as PdaOp })}>{(["push", "pop", "none"] as PdaOp[]).map(o => <option key={o} value={o}>{OP_TEXT[o]}</option>)}</select></label>
          <label>يُكتب<input className="alab-pop-sym is-wide" dir="ltr" value={p.write} maxLength={8} autoComplete="off" spellCheck={false} onChange={e => patch({ write: e.target.value.replace(/\s/g, "") })} /></label>
        </> : <>
          <label>يقرأ<input className="alab-pop-sym" dir="ltr" value={t.read} maxLength={2} autoComplete="off" spellCheck={false} onChange={e => patch({ read: one(e.target.value) })} /></label>
          <label>يكتب<input className="alab-pop-sym" dir="ltr" value={t.write} maxLength={2} autoComplete="off" spellCheck={false} onChange={e => patch({ write: one(e.target.value) })} /></label>
          <label>الحركة<select className="learning-autodesign-select" value={t.move} onChange={e => patch({ move: e.target.value as TmMove })}>{(["R", "L", "S"] as TmMove[]).map(m => <option key={m} value={m}>{MOVE_TEXT[m]}</option>)}</select></label>
        </>}
        <button type="button" className="learning-autodesign-btn is-primary" onClick={add}>أضف الانتقال</button>
      </div>
      {error && <p className="alab-pop-error" role="alert">{error}</p>}
    </>
  );
}

export default function AutomataLabCanvas({ ids, draft, machine, scene, layout, edit, maxStates = MAX_STATES }: {
  ids: string; draft: LabDraft; machine: Machine; scene: Scene; layout: Record<string, Cell>; edit: (d: LabDraft) => void; maxStates?: number;
}) {
  const limit = Math.min(maxStates, MAX_STATES);
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string>(draft.start);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [said, setSaid] = useState("");
  // AUTO-A16c — «تراجع» / «إعادة»: every change of the draft is a step, wherever it was made (React's "adjusting state on a prop change")
  const [hist, setHist] = useState(() => startHistory(draft));
  const holding = (drag?.kind === "move" || drag?.kind === "bend") && drag.moved;
  if (hist.last !== draft) setHist(stepHistory(hist, draft, holding));
  const sel = draft.states.includes(selected) ? selected : draft.start;
  const fa = draft.kind === "DFA" || draft.kind === "NFA";
  // the window of an arrow whose state was removed meanwhile is closed
  const arrow = open && draft.states.includes(open.from) && draft.states.includes(open.to) ? open : null;
  const arrowId = arrow ? edgeKey(arrow.from, arrow.to) : "";
  // one more cell to the right and below, so a state can be dragged (or added) beyond the drawing's edge
  const roomy = useMemo<Scene>(() => ({ ...scene, box: { ...scene.box, x2: scene.box.x2 + scene.cell.w, y2: scene.box.y2 + scene.cell.h } }), [scene]);

  // the window takes the focus when it opens (so «سهم إلى» is a whole keyboard path), and closes when the editor is resized under it
  useEffect(() => { if (arrowId) pop.current?.querySelector<HTMLElement>("button, select, input")?.focus(); }, [arrowId]);
  useEffect(() => {
    if (!arrowId) return;
    const close = () => setOpen(null);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [arrowId]);

  const svg = () => box.current?.querySelector<SVGSVGElement>("svg.learning-automaton-svg") ?? null;
  const toDrawing = (x: number, y: number) => {
    const m = svg()?.getScreenCTM?.();
    if (!m) return null;
    const p = new DOMPoint(x, y).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const toBox = (p: Pt): Pt => {   // a drawing point → the editor box's own pixels (where an arrow's window opens)
    const m = svg()?.getScreenCTM?.(), r = box.current?.getBoundingClientRect();
    if (!m || !r) return { x: 0, y: 0 };
    const q = new DOMPoint(p.x, p.y).matrixTransform(m);
    return { x: q.x - r.left, y: q.y - r.top };
  };
  const near = (at: Cell, but?: string) => stateNear(layout, at, scene.cell, scene.r, but);

  /** One step of the chosen state: a whole cell (onto another state: they swap), or — `fine` — a small step that another state stops. */
  const nudge = (dc: number, dr: number, fine = false) => {
    const [c, r] = layout[sel], k = fine ? FINE_STEP : 1;
    const to: Cell = [Math.max(0, Math.min(GRID_MAX, c + dc * k)), Math.max(0, Math.min(GRID_MAX, r + dr * k))];
    if (to[0] === c && to[1] === r) return;
    const other = near(to, sel);
    if (other && fine) { setSaid("لا مكان هناك: " + other + " قريبة."); return; }
    edit(other ? swapStates(draft, layout, sel, other) : placeState(draft, layout, sel, to));
    setSaid(other ? "تبادلت " + sel + " و" + other + " مكانيهما." : "نُقلت " + sel + ".");
  };
  /** Opens the window of the arrow from → to: at the arrow's label when it is drawn, else between the two states (above a state, for a loop). */
  const openArrow = (from: string, to: string) => {
    const drawn = scene.edges.find(x => x.e.key === edgeKey(from, to));
    const a = scene.pos[from], b = scene.pos[to];
    const at = drawn ? drawn.label.at : from === to ? { x: a.x, y: a.y - scene.r - 30 } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    setOpen({ from, to, at: toBox(at), fresh: fa && arrowSymbols(draft, from, to).length === 0 });
  };
  const toggleSymbol = (from: string, to: string, symbol: string) => {
    const had = arrowSymbols(draft, from, to).includes(symbol);
    edit(toggleArrowSymbol(draft, from, to, symbol));
    if (open?.fresh) { setOpen(null); box.current?.focus(); }       // a new arrow is drawn: back to the drawing (pressing the arrow adds a symbol)
    setSaid(had ? "أُزيل الرمز " + symbol + " عن السهم من " + from + " إلى " + to + "."
      : "أُضيف السهم من " + from + " إلى " + to + " بالرمز " + symbol + (draft.kind === "DFA" ? " (في الحتمي يحلّ محلّ سهم الحالة نفسها بالرمز نفسه)." : "."));
  };
  const dropArrow = (from: string, to: string) => {
    const next = removeArrow(draft, from, to);
    setOpen(null);
    if (next === draft) return;
    edit(next);
    setSaid("حُذف السهم من " + from + " إلى " + to + ".");
    box.current?.focus();
  };
  const jump = (way: "undo" | "redo") => {
    const to = way === "undo" ? hist.past[hist.past.length - 1] : hist.future[hist.future.length - 1];
    if (!to || hist.jump) return;
    setHist({ ...hist, jump: way });
    setOpen(null);
    edit(to);
    setSaid(way === "undo" ? "تراجعت خطوة." : "أُعيدت الخطوة.");
  };
  const bendBy = (from: string, to: string, dir: 1 | -1) => {
    const now = scene.edges.find(x => x.e.key === edgeKey(from, to))?.bend;
    if (now === undefined) return;
    edit(setBend(draft, from, to, bendStep(now, from === to, dir)));
    setSaid(from === to ? "أُديرت الحلقة." : "ثُني السهم من " + from + " إلى " + to + ".");
  };
  const toggleAccept = (q: string) => edit({ ...draft, accept: draft.accept.includes(q) ? draft.accept.filter(s => s !== q) : [...draft.accept, q] });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    box.current?.focus({ preventScroll: true });
    const p = toDrawing(e.clientX, e.clientY);
    const capture = () => e.currentTarget.setPointerCapture?.(e.pointerId);
    // a link handle of the chosen state first (it sits outside the circle): an arrow from that state
    if (p && onHandle(p, scene.pos[sel], scene.r)) {
      setOpen(null); capture();
      setDrag({ kind: "arrow", from: sel, pointer: e.pointerId, end: p });
      e.preventDefault();
      return;
    }
    const s = p && stateAt(p, scene.pos, scene.r);
    if (p && s) {
      setSelected(s); setOpen(null); capture();
      setDrag(e.shiftKey ? { kind: "arrow", from: s, pointer: e.pointerId, end: p }
        : { kind: "move", state: s, pointer: e.pointerId, startDraft: draft, startLayout: layout, grab: { x: p.x - scene.pos[s].x, y: p.y - scene.pos[s].y },
            from: { x: e.clientX, y: e.clientY }, moved: false, box: roomy.box });
      e.preventDefault();
      return;
    }
    const key = (e.target as Element).closest?.("[data-edge]")?.getAttribute("data-edge");
    const [from, to] = key ? key.split(" ") : [];
    setOpen(null);
    if (from && to && draft.states.includes(from) && draft.states.includes(to)) {
      capture();
      setDrag({ kind: "bend", arrow: [from, to], pointer: e.pointerId, from: { x: e.clientX, y: e.clientY }, moved: false, box: roomy.box });
      e.preventDefault();
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    const p = toDrawing(e.clientX, e.clientY);
    if (!p) return;
    if (drag.kind === "arrow") { setDrag({ ...drag, end: p }); return; }
    if (drag.kind === "bend") {
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.from.x, e.clientY - drag.from.y) < TRAVEL) return;
        setDrag({ ...drag, moved: true });
      }
      const [from, to] = drag.arrow;
      edit(setBend(draft, from, to, bendAt(p, scene.pos[from], scene.pos[to])));
      return;
    }
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.from.x, e.clientY - drag.from.y) < TRAVEL) return;
      setDrag({ ...drag, moved: true });
    }
    // the state's centre follows the pointer from where it was grabbed, inside the frame held for this drag
    const b = drag.box, R = scene.r;
    const centre = { x: Math.max(b.x1 + R, Math.min(b.x2 - R, p.x - drag.grab.x)), y: Math.max(b.y1 + R, Math.min(b.y2 - R, p.y - drag.grab.y)) };
    const free = placeAt(centre, scene.cell);
    const at = e.altKey ? free : snapPlace(free, layout, scene.cell, drag.state);
    if (!near(at, drag.state)) edit(placeState(draft, layout, drag.state, at));   // live, onto free places; inside another state: a swap on the drop
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    const p = toDrawing(e.clientX, e.clientY);
    setDrag(null);
    setHist(h => (h.held ? { ...h, held: false } : h));                // the drag's step is closed
    if (drag.kind === "bend") {
      if (!drag.moved) openArrow(drag.arrow[0], drag.arrow[1]);        // a press that did not travel: the arrow's window
      else setSaid(drag.arrow[0] === drag.arrow[1] ? "أُديرت الحلقة." : "ثُني السهم من " + drag.arrow[0] + " إلى " + drag.arrow[1] + ".");
      return;
    }
    if (!p) return;
    if (drag.kind === "move") {
      if (!drag.moved) return;
      const other = Object.keys(scene.pos).find(s => s !== drag.state && Math.hypot(p.x - scene.pos[s].x, p.y - scene.pos[s].y) <= scene.r);
      if (other && drag.startLayout[other]) { edit(swapStates(drag.startDraft, drag.startLayout, drag.state, other)); setSaid("تبادلت " + drag.state + " و" + other + " مكانيهما."); }
      else setSaid("نُقلت " + drag.state + ".");
      return;
    }
    // a handle released where it was pressed is not an arrow; released inside its own state, it is a loop
    const to = stateAt(p, scene.pos, scene.r);
    if (!to) { if (!onHandle(p, scene.pos[drag.from], scene.r)) setSaid("أفلت السهم فوق حالة لترسمه."); return; }
    openArrow(drag.from, to);
    setSaid("اختر " + (fa ? "رمز" : "انتقال") + " السهم من " + drag.from + " إلى " + to + ".");
  };
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const p = toDrawing(e.clientX, e.clientY);
    if (!p || (e.target as Element).closest?.("[data-edge]")) return;
    const s = stateAt(p, scene.pos, scene.r);
    if (s) { toggleAccept(s); setSaid(draft.accept.includes(s) ? s + " لم تعد حالة قبول." : s + " حالة قبول الآن."); return; }
    if (onHandle(p, scene.pos[sel], scene.r)) return;
    if (draft.states.length >= limit) { setSaid("بلغت الحد: " + limit + " حالة."); return; }
    const c = snapPlace(placeAt(p, scene.cell), layout, scene.cell);
    if (near(c)) { setSaid("لا مكان لحالة هنا: " + near(c) + " قريبة."); return; }
    const next = addStateAt(draft, layout, c);
    edit(next);
    const q = next.states[next.states.length - 1];
    setSelected(q);
    setSaid("أُضيفت الحالة " + q + ".");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && (e.target as Element).closest?.("select, input, button")) return;
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (step[e.key]) { e.preventDefault(); nudge(...step[e.key], e.shiftKey); }
    else if (e.key === "Escape") { setOpen(null); setDrag(null); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      jump(e.key === "y" || e.key === "Y" || e.shiftKey ? "redo" : "undo");
    }
    else if ((e.key === "Delete" || e.key === "Backspace") && arrow) { e.preventDefault(); dropArrow(arrow.from, arrow.to); }
  };

  const symbols = draft.kind === "NFA" ? [...draft.alphabet, EPS] : draft.alphabet;
  const on = arrow && fa ? arrowSymbols(draft, arrow.from, arrow.to) : [];
  const has = !!arrow && (fa ? on.length > 0 : (draft.kind === "PDA" ? draft.pda : draft.tm).some(r => r.from === arrow.from && r.to === arrow.to));
  const center = scene.pos[sel];
  const over = drag?.kind === "arrow" ? stateAt(drag.end, scene.pos, scene.r) : null;
  const bent = !!arrow && draft.bends?.[arrowId] !== undefined;
  const loop = !!arrow && arrow.from === arrow.to;
  const closePop = () => { setOpen(null); box.current?.focus(); };
  return (
    <div className="alab-canvas">
      <div className="alab-canvas-tools" role="group" aria-label="أدوات الرسم">
        <label className="stt-label" htmlFor={ids + "-sel"}>الحالة</label>
        <select id={ids + "-sel"} className="learning-autodesign-select" dir="ltr" value={sel} onChange={e => setSelected(e.target.value)}>
          {draft.states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className="learning-autodesign-btn is-quiet" aria-pressed={draft.start === sel} onClick={() => edit({ ...draft, start: sel })}>بداية</button>
        <button type="button" className="learning-autodesign-btn is-quiet" aria-pressed={draft.accept.includes(sel)} onClick={() => toggleAccept(sel)}>قبول</button>
        <button type="button" className="learning-autodesign-btn is-quiet" disabled={draft.states.length <= 1}
          onClick={() => { edit(removeState(draft, sel)); setSaid("حُذفت الحالة " + sel + " وأسهمها."); }}>حذف</button>
        <button type="button" className="learning-autodesign-btn is-quiet" disabled={!hist.past.length} onClick={() => jump("undo")}>تراجع</button>
        <button type="button" className="learning-autodesign-btn is-quiet" disabled={!hist.future.length} onClick={() => jump("redo")}>إعادة</button>
        <label className="stt-label" htmlFor={ids + "-to"}>سهم إلى</label>
        <select id={ids + "-to"} className="learning-autodesign-select" dir="ltr" value="" onChange={e => { if (e.target.value) openArrow(sel, e.target.value); }}>
          <option value="">—</option>
          {draft.states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="alab-nudge" role="group" aria-label={"انقل " + sel + " خانة"}>
          <button type="button" className="learning-autodesign-btn is-quiet" aria-label="يسارًا" onClick={() => nudge(-1, 0)}>←</button>
          <button type="button" className="learning-autodesign-btn is-quiet" aria-label="أعلى" onClick={() => nudge(0, -1)}>↑</button>
          <button type="button" className="learning-autodesign-btn is-quiet" aria-label="أسفل" onClick={() => nudge(0, 1)}>↓</button>
          <button type="button" className="learning-autodesign-btn is-quiet" aria-label="يمينًا" onClick={() => nudge(1, 0)}>→</button>
        </span>
      </div>
      <p className="stt-hint">اسحب حالة لتنقلها بحرّية (تصطفّ مع ما يجاورها؛ مع Alt بلا اصطفاف). اسحب إحدى النقاط الأربع حول الحالة المختارة إلى حالة أخرى (أو إليها نفسها) لترسم سهمًا. انقر سهمًا لتعدّله أو تحذفه، واسحبه لتثنيه. انقر نقرتين على مكان فارغ لإضافة حالة، وعلى حالة لجعلها حالة قبول.</p>
      <div className="alab-canvas-stage">
        <div ref={box} className={"alab-canvas-box" + (drag ? " is-dragging" : "")} tabIndex={0}
          aria-label="محرّر الرسم: الأسهم تنقل الحالة المختارة خانة، ومع Shift خطوة صغيرة" onKeyDown={onKeyDown}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)} onDoubleClick={onDoubleClick}
          data-testid="alab-canvas">
          <Diagram machine={machine} scene={drag?.kind === "move" || drag?.kind === "bend" ? { ...scene, box: drag.box } : roomy} step={{ active: [sel], used: arrow ? [arrowId] : [] }} ids={ids + "-draw"} live={false} hit>
            <g aria-hidden="true">
              {over && <circle className="alab-canvas-target" cx={scene.pos[over].x} cy={scene.pos[over].y} r={scene.r + 6} />}
              {drag?.kind === "arrow" && <line className="alab-canvas-line" x1={scene.pos[drag.from].x} y1={scene.pos[drag.from].y} x2={drag.end.x} y2={drag.end.y} />}
              {!(drag?.kind === "move" && drag.moved) && handlesOf(center, scene.r).map((h, i) => <circle key={i} className="alab-canvas-handle" data-handle="link" cx={h.x} cy={h.y} r={5.5} />)}
            </g>
          </Diagram>
        </div>
        {arrow && (
          <div ref={pop} className="alab-pop" role="group" style={{ left: "clamp(4px, " + Math.round(arrow.at.x - 130) + "px, calc(100% - 268px))", top: Math.round(arrow.at.y + 14) + "px" }}
            aria-label={(fa ? "رمز السهم من " : "انتقالات السهم من ") + arrow.from + " إلى " + arrow.to}
            onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); closePop(); } }}>
            <p className="alab-pop-title">{fa ? "رمز السهم" : "انتقالات السهم"} من <span dir="ltr">{arrow.from}</span> إلى <span dir="ltr">{arrow.to}</span></p>
            {fa
              ? <div className="alab-pop-symbols">{symbols.map(s => <button key={s} type="button" dir="ltr" aria-pressed={on.includes(s)}
                  className={"learning-autodesign-target" + (on.includes(s) ? " is-on" : "")} onClick={() => toggleSymbol(arrow.from, arrow.to, s)}>{s}</button>)}</div>
              : <RowsOfArrow key={arrowId} draft={draft} from={arrow.from} to={arrow.to} edit={edit} say={setSaid} />}
            {has && <div className="alab-pop-bend" role="group" aria-label={loop ? "مكان الحلقة" : "انحناء السهم"}>
              <button type="button" className="learning-autodesign-btn is-quiet" aria-label={loop ? "أدِر الحلقة عكس عقارب الساعة" : "اثنِ السهم إلى جهة"} onClick={() => bendBy(arrow.from, arrow.to, -1)}>↶ {loop ? "أدِر" : "اثنِ"}</button>
              <button type="button" className="learning-autodesign-btn is-quiet" aria-label={loop ? "أدِر الحلقة مع عقارب الساعة" : "اثنِ السهم إلى الجهة الأخرى"} onClick={() => bendBy(arrow.from, arrow.to, 1)}>{loop ? "أدِر" : "اثنِ"} ↷</button>
              <button type="button" className="learning-autodesign-btn is-quiet" disabled={!bent} onClick={() => { edit(setBend(draft, arrow.from, arrow.to, undefined)); setSaid("عاد السهم إلى انحنائه التلقائي."); }}>تلقائي</button>
            </div>}
            <div className="alab-pop-actions">
              <button type="button" className="learning-autodesign-btn is-quiet" disabled={!has} onClick={() => dropArrow(arrow.from, arrow.to)}>حذف السهم</button>
              <button type="button" className="learning-autodesign-btn" onClick={closePop}>تم</button>
            </div>
          </div>
        )}
      </div>
      <p className="stt-hint" role="status">{said}</p>
    </div>
  );
}
