import { useId, useMemo, useState, type FormEvent } from "react";
import type { LearningActivityProps } from "./engine";
import {
  drawnEdges, edgeKey, gridLayout, LIMITS, pdaLabel, readAutomatonConfig, runAutomaton, splitWord, tmLabel,
  type DrawnEdge, type FaTransition, type Machine, type PdaTransition, type RunStep, type TmTransition, type Verdict,
} from "./automaton";

/**
 * AUTO-A1 (docs/enterprise-automata-simulator-a1.md) — `simulation / automaton-trace / v1`: «تتبّع الآلة خطوة بخطوة».
 *
 * The learner writes a word (by keyboard, or with one button per alphabet symbol on a phone) or taps an example word, then walks
 * through the run one step at a time:
 *   • the state diagram with the current state(s) lit and the arrow just used marked (an NFA lights every possible state);
 *   • the word with the symbols already read;
 *   • the stack beside it for a push-down automaton, the tape and its head for a Turing machine;
 *   • one Arabic sentence per step, and at the end «مقبولة» / «مرفوضة» in words (never by colour alone);
 *   • the transition table (an accessible equivalent of the drawing), the moves of this step marked.
 * The machine is data (automaton.ts reads and runs it); nothing from content is executed. No timers, no network, no persistence:
 * the shell's reset returns to the block's first word and step.
 */

const CELL_W = 150, CELL_H = 120, R = 24, LINE_H = 15, CHAR_W = 7.8;
const KIND_TEXT: Record<Machine["kind"], string> = { DFA: "أوتومات منتهٍ حتمي", NFA: "أوتومات منتهٍ غير حتمي", PDA: "أوتومات مكدّس", TM: "آلة تورنغ" };
const VERDICT_TEXT: Record<Verdict, string> = { accept: "الكلمة مقبولة", reject: "الكلمة مرفوضة", stuck: "الكلمة مرفوضة", nohalt: "الآلة لم تتوقف" };
const shown = (w: string) => (w === "" ? "ε" : w);
/** The drawing never shrinks below this share of its natural size on a narrow screen (then its box scrolls instead). */
const MIN_SCALE = 0.72;

type Pt = { x: number; y: number };
type Box = { x1: number; y1: number; x2: number; y2: number };
type Placed = { lines: string[]; at: Pt; anchor: "start" | "middle" | "end"; grow: "up" | "down" | "center" };

/** Where a straight segment a→b passes closer than `r` to a point (another state in the way). */
const passesNear = (a: Pt, b: Pt, p: Pt, r: number) => {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (!len2) return false;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < r;
};
/** The candidate directions around a state, in order of preference (up, down, the sides, the diagonals). */
const SLOTS = [-90, 90, 0, 180, -45, -135, 45, 135].map(d => (d * Math.PI) / 180);
const angleGap = (a: number, b: number) => { const d = Math.abs(a - b) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };
/** The free slot farthest from every arrow touching the state (ties keep the preference order). */
const freeSlot = (taken: number[], skip: number[] = [], slots: number[] = SLOTS) => {
  let best = slots[0], score = -1;
  for (const s of slots) {
    if (skip.some(k => angleGap(k, s) < 0.01)) continue;
    const gap = taken.length ? Math.min(...taken.map(a => angleGap(a, s))) : Math.PI;
    if (gap > score + 0.05) { best = s; score = gap; }
  }
  return best;
};
const unit = (a: number): Pt => ({ x: Math.cos(a), y: Math.sin(a) });
/** How a text block sits beside a point in direction `a` (anchor + which way its lines stack). */
const placeAt = (lines: string[], p: Pt, a: number): Placed => {
  const u = unit(a);
  return { lines, at: p, anchor: u.x > 0.5 ? "start" : u.x < -0.5 ? "end" : "middle", grow: u.y < -0.5 ? "up" : u.y > 0.5 ? "down" : "center" };
};
const textWidth = (lines: string[]) => Math.max(...lines.map(l => [...l].length)) * CHAR_W;
const textBox = (pl: Placed): Box => {
  const w = textWidth(pl.lines), h = pl.lines.length * LINE_H;
  const x1 = pl.anchor === "start" ? pl.at.x : pl.anchor === "end" ? pl.at.x - w : pl.at.x - w / 2;
  const y1 = pl.grow === "up" ? pl.at.y - h + 4 : pl.grow === "down" ? pl.at.y - 4 : pl.at.y - h / 2;
  return { x1, y1, x2: x1 + w, y2: y1 + h };
};
/** The baseline of the first line, so the block grows the chosen way from its anchor point. */
const firstBaseline = (pl: Placed) => {
  const n = pl.lines.length;
  return pl.grow === "up" ? pl.at.y - (n - 1) * LINE_H : pl.grow === "down" ? pl.at.y + 12 : pl.at.y - ((n - 1) * LINE_H) / 2 + 5;
};

type Scene = {
  pos: Record<string, Pt>;
  edges: { e: DrawnEdge; d: string; label: Placed }[];
  stateLabels: Record<string, Placed>;
  start: { d: string };
  box: Box;
};

/** Lays the whole drawing out once per machine: arrows, loops on the freest side, labels clear of the arrows, the bounds. */
function buildScene(machine: Machine, layout: Record<string, [number, number]>): Scene {
  const pos: Record<string, Pt> = {};
  for (const s of machine.states) { const [c, r] = layout[s]; pos[s] = { x: c * CELL_W, y: r * CELL_H }; }
  const all = drawnEdges(machine);
  const pairs = new Set(all.map(e => e.key));
  const touching: Record<string, number[]> = Object.fromEntries(machine.states.map(s => [s, [] as number[]]));
  const startAngle = Math.PI;                                            // the start arrow comes in from the left
  touching[machine.start].push(startAngle);
  const edges: Scene["edges"] = [];
  const curvePeaks: Pt[] = [];                                           // the farthest point of each bent arrow, for the bounds
  const pending: { e: DrawnEdge }[] = [];
  for (const e of all) {
    if (e.from === e.to) { pending.push({ e }); continue; }
    const a = pos[e.from], b = pos[e.to];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;                                 // the left-hand normal of a→b
    const blocked = Object.entries(pos).some(([s, p]) => s !== e.from && s !== e.to && passesNear(a, b, p, R + 10));
    const bend = pairs.has(edgeKey(e.to, e.from)) ? 26 : blocked ? 62 : 0;
    const c = { x: (a.x + b.x) / 2 + nx * bend * 2, y: (a.y + b.y) / 2 + ny * bend * 2 };
    const toward = (from: Pt, to: Pt, dist: number) => { const l = Math.hypot(to.x - from.x, to.y - from.y) || 1; return { x: from.x + (to.x - from.x) / l * dist, y: from.y + (to.y - from.y) / l * dist }; };
    const s = toward(a, bend ? c : b, R), t = toward(b, bend ? c : a, R + 2);
    touching[e.from].push(Math.atan2((bend ? c : b).y - a.y, (bend ? c : b).x - a.x));
    touching[e.to].push(Math.atan2((bend ? c : a).y - b.y, (bend ? c : a).x - b.x));
    const mid = bend ? { x: (s.x + 2 * c.x + t.x) / 4, y: (s.y + 2 * c.y + t.y) / 4 } : { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
    if (bend) {
      curvePeaks.push(mid);
      // a state this arrow bends around sees the arrow on that side (so its loop and label go elsewhere)
      for (const [st, p] of Object.entries(pos)) if (st !== e.from && st !== e.to && passesNear(a, b, p, R + 10)) touching[st].push(Math.atan2(mid.y - p.y, mid.x - p.x));
    }
    const side = Math.atan2(ny, nx);
    edges.push({ e, d: bend ? `M ${s.x} ${s.y} Q ${c.x} ${c.y} ${t.x} ${t.y}` : `M ${s.x} ${s.y} L ${t.x} ${t.y}`, label: placeAt(e.labels, { x: mid.x + nx * 10, y: mid.y + ny * 10 }, side) });
  }
  const loopAt: Record<string, number> = {};
  for (const { e } of pending) {
    const a = pos[e.from];
    // a loop goes straight up or down when either side is reasonably free (a sideways loop pushes its label past the edge)
    const upDown = freeSlot(touching[e.from], [], [SLOTS[0], SLOTS[1]]);
    const clear = touching[e.from].every(x => angleGap(x, upDown) >= Math.PI / 4);
    const ang = clear ? upDown : freeSlot(touching[e.from]);
    loopAt[e.from] = ang;
    touching[e.from].push(ang);
    const p1 = { x: a.x + Math.cos(ang - 0.5) * R, y: a.y + Math.sin(ang - 0.5) * R };
    const p2 = { x: a.x + Math.cos(ang + 0.5) * R, y: a.y + Math.sin(ang + 0.5) * R };
    const c1 = { x: a.x + Math.cos(ang - 0.62) * (R + 52), y: a.y + Math.sin(ang - 0.62) * (R + 52) };
    const c2 = { x: a.x + Math.cos(ang + 0.62) * (R + 52), y: a.y + Math.sin(ang + 0.62) * (R + 52) };
    const tip = { x: a.x + Math.cos(ang) * (R + 44), y: a.y + Math.sin(ang) * (R + 44) };
    edges.push({ e, d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`, label: placeAt(e.labels, tip, ang) });
  }
  const stateLabels: Scene["stateLabels"] = {};
  for (const s of machine.states) {
    const text = machine.stateLabels[s];
    if (!text) continue;
    const ang = freeSlot(touching[s], loopAt[s] === undefined ? [] : [loopAt[s]]);
    const u = unit(ang);
    stateLabels[s] = placeAt([text], { x: pos[s].x + u.x * (R + 8), y: pos[s].y + u.y * (R + 8) }, ang);
  }
  const sp = pos[machine.start];
  const start = { d: `M ${sp.x - R - 40} ${sp.y} L ${sp.x - R - 2} ${sp.y}` };
  const box: Box = { x1: sp.x - R - 44, y1: Infinity, x2: -Infinity, y2: -Infinity };
  const grow = (b: Box) => { box.x1 = Math.min(box.x1, b.x1); box.y1 = Math.min(box.y1, b.y1); box.x2 = Math.max(box.x2, b.x2); box.y2 = Math.max(box.y2, b.y2); };
  for (const p of Object.values(pos)) grow({ x1: p.x - R - 2, y1: p.y - R - 2, x2: p.x + R + 2, y2: p.y + R + 2 });
  for (const { e, label } of edges) {
    grow(textBox(label));
    if (e.from === e.to) { const a = pos[e.from], ang = loopAt[e.from]; grow({ x1: a.x + Math.cos(ang) * (R + 46) - 30, y1: a.y + Math.sin(ang) * (R + 46) - 30, x2: a.x + Math.cos(ang) * (R + 46) + 30, y2: a.y + Math.sin(ang) * (R + 46) + 30 }); }

  }
  for (const l of Object.values(stateLabels)) grow(textBox(l));
  for (const p of curvePeaks) grow({ x1: p.x - 4, y1: p.y - 4, x2: p.x + 4, y2: p.y + 4 });
  return { pos, edges, stateLabels, start, box: { x1: box.x1 - 12, y1: box.y1 - 12, x2: box.x2 + 12, y2: box.y2 + 12 } };
}

function Label({ pl, className, rtl }: { pl: Placed; className: string; rtl?: boolean }) {
  const y = firstBaseline(pl);
  // text-anchor follows the text's direction: in right-to-left text «start» is the RIGHT edge, so a side anchor is mirrored
  const anchor = rtl && pl.anchor !== "middle" ? (pl.anchor === "start" ? "end" : "start") : pl.anchor;
  return (
    <text className={className} x={pl.at.x} y={y} textAnchor={anchor} direction={rtl ? "rtl" : "ltr"}>
      {pl.lines.map((l, i) => <tspan key={i} x={pl.at.x} dy={i === 0 ? 0 : LINE_H}>{l}</tspan>)}
    </text>
  );
}

function Diagram({ machine, scene, step, ids }: { machine: Machine; scene: Scene; step: RunStep; ids: string }) {
  const { pos, box } = scene;
  const width = Math.ceil(box.x2 - box.x1), height = Math.ceil(box.y2 - box.y1);
  const summary = KIND_TEXT[machine.kind] + " حالاته " + machine.states.join("، ") + "؛ البداية " + machine.start
    + "؛ " + (machine.accept.length ? "القبول " + machine.accept.join("، ") : "لا حالة قبول") + ". الحالة الآن: " + (step.active.length ? step.active.join("، ") : "لا شيء") + ".";
  return (
    // LTR so a drawing wider than a phone scrolls from its LEFT edge, where the start state is
    <div className="learning-automaton-canvas" dir="ltr" tabIndex={0} role="region" aria-label="رسم الآلة">
      <svg className="learning-automaton-svg" viewBox={`${box.x1} ${box.y1} ${width} ${height}`} role="img" aria-label={summary}
        style={{ width: "100%", maxWidth: width + "px", minWidth: Math.round(width * MIN_SCALE) + "px" }}>
        <defs>
          <marker id={ids + "-a"} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="learning-automaton-head" />
          </marker>
          <marker id={ids + "-u"} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="learning-automaton-head is-used" />
          </marker>
        </defs>
        <path d={scene.start.d} className="learning-automaton-edge is-start" markerEnd={`url(#${ids}-a)`} />
        {scene.edges.map(({ e, d, label }) => {
          const used = step.used.includes(e.key);
          return (
            <g key={e.key} className={"learning-automaton-arrow" + (used ? " is-used" : "")}>
              <path d={d} className={"learning-automaton-edge" + (used ? " is-used" : "")} markerEnd={`url(#${ids}-${used ? "u" : "a"})`} />
              <Label pl={label} className="learning-automaton-label" rtl={machine.kind === "PDA"} />
            </g>
          );
        })}
        {machine.states.map(s => {
          const p = pos[s];
          const on = step.active.includes(s);
          const acc = machine.accept.includes(s);
          return (
            <g key={s} className={"learning-automaton-state" + (on ? " is-active" : "") + (acc ? " is-accept" : "")}>
              <circle cx={p.x} cy={p.y} r={R} className="learning-automaton-circle" />
              {acc && <circle cx={p.x} cy={p.y} r={R - 5} className="learning-automaton-ring" />}
              <text x={p.x} y={p.y + 5} textAnchor="middle" className="learning-automaton-name">{s}</text>
              {scene.stateLabels[s] && <Label pl={scene.stateLabels[s]} className="learning-automaton-statelabel" rtl />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TransitionTable({ machine, step }: { machine: Machine; step: RunStep }) {
  const rows = machine.transitions.map(t => {
    const what = machine.kind === "PDA" ? pdaLabel(t as PdaTransition) : machine.kind === "TM" ? tmLabel(t as TmTransition) : (t as FaTransition).symbol;
    const now = step.move === what && step.used.includes(edgeKey(t.from, t.to));
    return { from: t.from, what, to: t.to, now };
  });
  return (
    <details className="learning-automaton-table">
      <summary>جدول الانتقالات ({rows.length})</summary>
      <div className="learning-automaton-tablewrap">
        <table>
          <thead><tr><th scope="col">من</th><th scope="col">{machine.kind === "PDA" ? "الحركة" : machine.kind === "TM" ? "يقرأ/يكتب، يتحرك" : "الرمز"}</th><th scope="col">إلى</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.now ? "is-now" : undefined} aria-current={r.now ? "step" : undefined}>
                <td dir="ltr">{r.from}</td><td dir={machine.kind === "PDA" ? "rtl" : "ltr"}>{r.what}</td><td dir="ltr">{r.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function AutomatonTraceActivity({ block, commands, emit, reducedMotion }: LearningActivityProps) {
  const cfg = useMemo(() => readAutomatonConfig(block.config), [block.config]);
  const ids = "eb-fa-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [state, setState] = useState({ word: "", draft: "", at: 0, epoch: -1, error: "" });
  const fresh = state.epoch !== commands.reset;
  const word = fresh ? cfg?.word ?? "" : state.word;
  const draft = fresh ? cfg?.word ?? "" : state.draft;
  const at = fresh ? 0 : state.at;
  const error = fresh ? "" : state.error;

  const run = useMemo(() => {
    if (!cfg) return null;
    const split = splitWord(cfg.machine, word);
    return split.ok ? runAutomaton(cfg.machine, split.symbols) : null;
  }, [cfg, word]);
  const scene = useMemo(() => (cfg ? buildScene(cfg.machine, gridLayout(cfg.machine, cfg.layout)) : null), [cfg]);

  if (!cfg || !run || !scene) return <p className="learning-automaton-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;
  const m = cfg.machine;
  const total = run.steps.length;
  const step = run.steps[Math.min(at, total - 1)];
  const last = at >= total - 1;
  const symbols = [...word];

  const set = (patch: Partial<typeof state>) => setState({ word, draft, at, error, ...patch, epoch: commands.reset });
  const go = (n: number) => {
    const next = Math.max(0, Math.min(total - 1, n));
    set({ at: next });
    emit({ type: "interaction", activityId: block.id, name: "automaton-step", detail: { step: next + 1, of: total } });
  };
  const start = (w: string) => {
    const split = splitWord(m, w);
    if ([...w].length > LIMITS.word) { set({ draft: w, error: "الكلمة طويلة: " + LIMITS.word + " رمزًا على الأكثر." }); return; }
    if (!split.ok) { set({ draft: w, error: "الرمز " + split.bad + " ليس من الأبجدية {" + m.alphabet.join(", ") + "}." }); return; }
    const verdict = runAutomaton(m, split.symbols).verdict;
    set({ word: w, draft: w, at: 0, error: "" });
    emit({ type: "interaction", activityId: block.id, name: "automaton-run", detail: { length: split.symbols.length, verdict } });
  };
  const submit = (e: FormEvent) => { e.preventDefault(); start(draft.replace(/\s+/g, "")); };
  const verdictClass = run.verdict === "accept" ? "is-accept" : "is-reject";

  return (
    <div className="learning-automaton" data-reduced-motion={reducedMotion ? "true" : "false"}>
      <p className="learning-automaton-kind">{KIND_TEXT[m.kind]} · الأبجدية <span dir="ltr">{"Σ = {" + m.alphabet.join(", ") + "}"}</span></p>

      <form className="learning-automaton-form" onSubmit={submit}>
        <label className="learning-automaton-field">
          <span>الكلمة</span>
          <input type="text" dir="ltr" value={draft} maxLength={LIMITS.word * 2} autoComplete="off" autoCapitalize="off" spellCheck={false}
            onChange={e => set({ draft: e.target.value, error: "" })} aria-invalid={error ? true : undefined} aria-describedby={error ? ids + "-err" : undefined} />
        </label>
        <button type="submit" className="learning-automaton-btn is-primary">شغّل</button>
        <div className="learning-automaton-keys" role="group" aria-label="رموز الأبجدية">
          {m.alphabet.map(s => (
            <button key={s} type="button" className="learning-automaton-key" dir="ltr" aria-label={"أضف " + s} onClick={() => set({ draft: draft + s, error: "" })}>{s}</button>
          ))}
          <button type="button" className="learning-automaton-key" aria-label="احذف آخر رمز" onClick={() => set({ draft: [...draft].slice(0, -1).join(""), error: "" })}>⌫</button>
          <button type="button" className="learning-automaton-key is-wide" onClick={() => set({ draft: "", error: "" })}>مسح</button>
        </div>
        {error && <p id={ids + "-err"} className="learning-automaton-error" role="alert">{error}</p>}
      </form>

      {cfg.words.length > 0 && (
        <div className="learning-automaton-examples" role="group" aria-label="كلمات للتجربة">
          <span className="learning-automaton-label-text">جرّب:</span>
          {cfg.words.map(w => (
            <button key={w} type="button" className={"learning-automaton-chip" + (w === word ? " is-on" : "")} aria-pressed={w === word} dir="ltr" onClick={() => start(w)}>
              {shown(w)}
            </button>
          ))}
        </div>
      )}

      {m.kind !== "TM" && (
        <div className="learning-automaton-word" aria-label={"الكلمة " + shown(word) + "، قُرئ منها " + step.read + " من " + symbols.length}>
          <span className="learning-automaton-label-text">الكلمة:</span>
          {symbols.length === 0 ? <span className="learning-automaton-sym is-empty" dir="ltr">ε</span> : (
            <span className="learning-automaton-cells" dir="ltr" aria-hidden="true">
              {symbols.map((s, i) => (
                <span key={i} className={"learning-automaton-sym" + (i < step.read ? " is-read" : "") + (i === step.read - 1 && step.used.length ? " is-now" : "")}>{s}</span>
              ))}
            </span>
          )}
        </div>
      )}

      <div className="learning-automaton-controls">
        <button type="button" className="learning-automaton-btn" onClick={() => go(0)} disabled={at === 0}>البداية</button>
        <button type="button" className="learning-automaton-btn" onClick={() => go(at - 1)} disabled={at === 0}>الخطوة السابقة</button>
        <button type="button" className="learning-automaton-btn is-next" onClick={() => go(at + 1)} disabled={last}>الخطوة التالية</button>
        <button type="button" className="learning-automaton-btn" onClick={() => go(total - 1)} disabled={last}>النهاية</button>
        <span className="learning-automaton-counter">الخطوة <span dir="ltr">{at + 1} / {total}</span></span>
      </div>

      <p className="learning-automaton-note" role="status" aria-live="polite">{step.note}</p>
      {last && <p className={"learning-automaton-verdict " + verdictClass}>{run.verdict === "accept" ? "✓ " : "✗ "}{VERDICT_TEXT[run.verdict]}</p>}

      <div className="learning-automaton-grid">
        <Diagram machine={m} scene={scene} step={step} ids={ids} />
        {step.stack && (
          <section className="learning-automaton-stack" aria-label={"المكدّس من القمة: " + [...step.stack].reverse().join("، ")}>
            <h4 className="learning-automaton-heading">المكدّس</h4>
            <ol className="learning-automaton-stackcells" dir="ltr" aria-hidden="true">
              {[...step.stack].reverse().slice(0, LIMITS.stackShown).map((s, i) => (
                <li key={step.stack!.length - i} className={"learning-automaton-stackcell" + (i === 0 ? " is-top" : "")}>{s}{i === 0 && <span className="learning-automaton-toptag">القمة</span>}</li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {step.tape && (
        <section className="learning-automaton-tape" aria-label={"الشريط: " + step.tape.cells.join(" ") + "، الرأس على الخانة " + (step.tape.head + 1)}>
          <h4 className="learning-automaton-heading">الشريط</h4>
          <div className="learning-automaton-tapecells" dir="ltr" aria-hidden="true">
            {step.tape.cells.map((c, i) => (
              <span key={i} className={"learning-automaton-tapecell" + (i === step.tape!.head ? " is-head" : "")}>{c}</span>
            ))}
          </div>
        </section>
      )}

      <TransitionTable machine={m} step={step} />
    </div>
  );
}
