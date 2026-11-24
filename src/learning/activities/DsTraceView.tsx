import { useState, type ReactNode } from "react";
import { extrasOf, sceneOf, type DsMark, type DsObj, type DsStep, type DsTrace, type DsVal } from "./ds";
import { ChainDrawing, GridDrawing, MapDrawing, Marked, PlaceValueDrawing, QueueDrawing, RowDrawing, StackDrawing, TreeDrawing } from "./DsDraw";
import { freshOf, motionOf } from "./dsMotion";

/**
 * DS-A1 (docs/enterprise-data-structures-course.md) — a recorded C# program, one step at a time: the line that ran, one Arabic
 * sentence, the STRUCTURES drawn as they are now (a stack, a queue, a chain of cells with the names pointing at its cells, a
 * binary tree), the variables of every method on the call stack (the running one on top — recursion is a pile of frames) and
 * everything printed so far. Every step is DATA; nothing here interprets C#. No timers, no network, no persistence.
 */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The trace itself: `epoch` is the reset signal (a new value returns to the first step); `onStep` reports a move. Used by the
 * trace activity and inside the solution window (DsSolutionActivity).
 */
/**
 * Visual lab V4 (docs/enterprise-csharp-visual-lab-plan.md §12) — OPTIONAL, for the teacher's player only (the course passes none):
 * `at` = the step the player shows (it then owns the navigation: `controls={false}` hides this view's own buttons); `breakpoints` /
 * `onToggleBreakpoint` = a line number becomes a toggle; `motion` = what just entered / left is marked for the player's animation.
 */
/** Visual lab V10 (§20), the player only: the step's objects drawn as an object diagram (`node`); the arrays / Lists / Dictionaries
 *  it draws (`drawn`) are then not drawn a second time among the structures. The course passes none: its «الكائنات» list is unchanged. */
export type HeapDiagram = (step: DsStep, prev: DsStep | undefined, marks: ReadonlyMap<number, DsMark[]>) => { node: ReactNode; drawn: ReadonlySet<number> } | null;

export default function DsTraceView({ cfg, epoch, onStep, at: atProp, controls = true, breakpoints, onToggleBreakpoint, motion = false, hidden, onReveal, heap }: {
  cfg: DsTrace; epoch: number; onStep?: (step: number, of: number) => void;
  at?: number; controls?: boolean; breakpoints?: ReadonlySet<number>; onToggleBreakpoint?: (line: number) => void; motion?: boolean;
  /** V4 part 2, «توقّع قبل أن ترى»: the structures, variables and objects of this step are covered until `onReveal` (a variable
   *  that refers to a stack says its contents, so it would give the answer away). */
  hidden?: boolean; onReveal?: () => void;
  heap?: HeapDiagram;
}) {
  const [state, setState] = useState({ at: 0, epoch: 0 });
  const total = cfg.steps.length;
  const at = atProp !== undefined ? Math.max(0, Math.min(total - 1, atProp)) : state.epoch === epoch ? state.at : 0;

  const step = cfg.steps[Math.min(at, total - 1)];
  const prev = at > 0 ? cfg.steps[at - 1] : undefined;
  const go = (n: number) => {
    const next = Math.max(0, Math.min(total - 1, n));
    setState({ at: next, epoch });
    onStep?.(next + 1, total);
  };
  const scene = sceneOf(step.frames, step.objs, cfg.pointers);
  const extra = extrasOf(step, cfg.pointers, cfg.digits);   // V9 (rich traces only: a course trace has none of it)
  const diagram = heap && !hidden ? heap(step, prev, new Map(scene.rows.map(r => [r.id, r.marks]))) : null;   // V10
  const rows = diagram ? scene.rows.filter(r => !diagram.drawn.has(r.id)) : scene.rows;
  const maps = diagram ? scene.maps.filter(m => !diagram.drawn.has(m.id)) : scene.maps;
  const moves = motion ? motionOf(prev, step) : null;
  const fresh = motion ? freshOf(prev, step) : null;
  // with motion a stack / queue drawing is a new element at every step, so its entry / exit animation starts again (the course,
  // without motion, keeps one element and its short colour transition)
  const before = new Map((prev?.objs ?? []).map(o => [o.id, o]));
  const changed = (id: number) => !!prev && !same(before.get(id), step.objs.find(o => o.id === id));
  const byId = new Map(step.objs.map(o => [o.id, o]));
  /** What a name holds, in words (a reference says what it points at; the drawing shows it). */
  const told = (v: DsVal): string => {
    if (v.t === "v") return v.s;
    if (v.t === "null") return "null";
    if (v.t === "arr") return "{" + v.items.join(", ") + "}";
    const o: DsObj | undefined = byId.get(v.id);
    if (!o) return "?";
    if (o.k === "stack" || o.k === "queue") return (o.k === "stack" ? "راصّة [" : "دور [") + o.items.join(",") + "]";
    if (o.k === "array" || o.k === "set" || o.k === "map" || o.k === "grid") return o.type + " #" + o.id;   // V5 / V9: drawn beside, named by the variable
    return o.k === "obj" ? o.type + " #" + o.id : "خلية " + o.v;
  };
  const frames = step.frames.map((f, i) => ({ f, i })).reverse();   // the running method on top
  const was = (frame: number, name: string) => (prev?.frames[frame]?.name === step.frames[frame]?.name ? prev?.frames[frame]?.vars.find(p => p[0] === name)?.[1] : undefined);
  const drawings = scene.stacks.length + scene.queues.length + scene.chains.length + scene.trees.length + rows.length + maps.length
    + extra.grids.length + extra.texts.length + extra.places.length;

  return (
    <div className="learning-trace learning-ds">
      {cfg.given && <p className="learning-ds-given"><span className="learning-trace-label">المعطى:</span> <Marked text={cfg.given} /></p>}
      {controls && <div className="learning-trace-controls">
        <button type="button" className="learning-trace-btn" onClick={() => go(at - 1)} disabled={at === 0}>الخطوة السابقة</button>
        <button type="button" className="learning-trace-btn is-next" onClick={() => go(at + 1)} disabled={at === total - 1}>الخطوة التالية</button>
        <span className="learning-trace-counter">الخطوة <span dir="ltr">{at + 1} / {total}</span></span>
        {total > 12 && (
          <input type="range" className="learning-trace-slider" dir="ltr" min={1} max={total} value={at + 1} aria-label="انتقل إلى الخطوة"
            aria-valuetext={"الخطوة " + (at + 1) + " من " + total} onChange={e => go(Number(e.target.value) - 1)} />
        )}
      </div>}
      <p className={"learning-trace-note" + (step.error ? " learning-ds-error" : "")} role="status" aria-live="polite">
        {step.line > 0 && <span className="learning-trace-noteline">السطر <span dir="ltr">{step.line}</span>: </span>}
        <Marked text={step.note || "ننفّذ السطر."} />
      </p>
      {step.evals && !hidden && (
        <section className="lab-evals" aria-label="قيم التعابير في هذه الخطوة">
          <span className="learning-trace-label">قيم التعابير:</span>
          <ul className="lab-evals-list">
            {step.evals.map(([e, v], k) => <li key={k} className="lab-eval" dir="ltr"><code>{e}</code> → <strong>{v}</strong></li>)}
          </ul>
        </section>
      )}
      <div className="learning-trace-grid">
        <ol className="learning-trace-code" dir="ltr" tabIndex={0} aria-label="البرنامج">
          {cfg.lines.map((l, i) => {
            const current = i + 1 === step.line;
            return (
              <li key={i} className={"learning-trace-line" + (current ? " is-current" : "")} aria-current={current ? "step" : undefined}>
                {onToggleBreakpoint ? (
                  <button type="button" className={"learning-trace-lineno is-toggle" + (breakpoints?.has(i + 1) ? " is-break" : "")} aria-pressed={!!breakpoints?.has(i + 1)}
                    aria-label={"نقطة توقّف على السطر " + (i + 1)} onClick={() => onToggleBreakpoint(i + 1)}>{i + 1}</button>
                ) : <span className="learning-trace-lineno" aria-hidden="true">{i + 1}</span>}
                <code className="learning-trace-linecode">{l || " "}</code>
                {current && <span className="learning-trace-sr">(السطر الذي نُفّذ الآن)</span>}
              </li>
            );
          })}
        </ol>
        <div className="learning-trace-state">
          {cfg.stdin !== undefined && (
            <p className="learning-trace-stdin"><span className="learning-trace-label">المدخلات:</span> <span dir="ltr">{cfg.stdin.split("\n").join(" ")}</span></p>
          )}
          {hidden ? (
            <section className="learning-ds-structures lab-trace-guess" aria-label="مباني المعطيات" data-testid="lab-trace-guess">
              <h4 className="learning-trace-heading">مباني المعطيات والمتغيّرات الآن</h4>
              <p className="lab-trace-guess-ask">تغيّرت المباني في هذه الخطوة. توقّعوا كيف أصبحت، ثم اكشفوا.</p>
              <button type="button" className="learning-trace-btn is-next" onClick={onReveal}>اكشف</button>
            </section>
          ) : drawings > 0 && (
            <section className="learning-ds-structures" aria-label="مباني المعطيات">
              <h4 className="learning-trace-heading">مباني المعطيات الآن</h4>
              <div className="learning-ds-row">
                {scene.stacks.map(s => <StackDrawing key={motion ? s.id + ":" + at : s.id} items={s.items} labels={s.labels} changed={changed(s.id)} motion={moves?.get(s.id)} />)}
                {scene.queues.map(q => <QueueDrawing key={motion ? q.id + ":" + at : q.id} items={q.items} labels={q.labels} changed={changed(q.id)} motion={moves?.get(q.id)} />)}
              </div>
              {(extra.places.length > 0 || extra.texts.length > 0 || extra.grids.length > 0) && (
                <div className="learning-ds-row">
                  {extra.places.map(p => <PlaceValueDrawing key={p.name + p.base} name={p.name} base={p.base} value={p.value} digits={p.digits} hot={p.hot} />)}
                  {extra.texts.map(t => <RowDrawing key={"s" + t.name} kind="string" type="string" items={t.chars} labels={[{ name: t.name }]} indexed marks={t.marks} />)}
                  {extra.grids.map(g => <GridDrawing key={g.id} type={g.type} rows={g.rows} labels={g.labels} mark={g.mark} />)}
                </div>
              )}
              {(rows.length > 0 || maps.length > 0) && (
                <div className="learning-ds-row">
                  {rows.map(r => <RowDrawing key={r.id} kind={r.k} type={r.type} items={r.items} labels={r.labels} indexed={r.indexed} marks={r.marks} />)}
                  {maps.map(m => <MapDrawing key={m.id} type={m.type} keys={m.keys} items={m.items} labels={m.labels} />)}
                </div>
              )}
              {scene.chains.map((c, i) => <ChainDrawing key={"c" + i} cells={c.nodes.map(n => ({ key: n.id, v: n.v, labels: n.labels, hi: changed(n.id), fresh: fresh?.has(n.id) }))} end={c.end} join={c.join} />)}
              {scene.trees.map((t, i) => <TreeDrawing key={"t" + i} cells={t.nodes.map(n => ({ key: n.id, v: n.v, x: n.x, depth: n.depth, parent: n.parent, labels: n.labels, hi: changed(n.id), fresh: fresh?.has(n.id) }))} />)}
            </section>
          )}
          {!hidden && <section className="learning-trace-memory" aria-label="المتغيّرات">
            <h4 className="learning-trace-heading">{step.frames.length > 1 ? "مكدّس الاستدعاءات والمتغيّرات" : "المتغيّرات"}</h4>
            {frames.map(({ f, i }) => (
              <div key={i} className={"learning-trace-frame" + (i === step.frames.length - 1 ? " is-top" : "")}>
                <p className="learning-trace-framename"><span dir="ltr">{f.name}</span>{step.frames.length > 1 && i === step.frames.length - 1 ? " — تعمل الآن" : ""}</p>
                {f.vars.length === 0 ? <p className="learning-trace-none">لا متغيرات</p> : (
                  <ul className="learning-trace-vars">
                    {f.vars.map(([name, v], j) => {
                      const old = was(i, name);
                      const moved = !!prev && !same(old, v);
                      const type = f.types?.[j];   // V9: the declared type (rich traces only)
                      return (
                        <li key={name} className={"learning-trace-var" + (moved ? " is-changed" : "")}>
                          {type && <span className="lab-var-type" dir="ltr">{type}</span>}
                          <span className="learning-trace-name" dir="ltr">{name}</span>
                          <span className={"learning-trace-box" + (v.t === "ref" ? " is-ref" : "")} dir={v.t === "ref" ? undefined : "ltr"}>{v.t === "ref" ? "→ " + told(v) : told(v)}</span>
                          {moved && <span className="learning-trace-tag">تغيّر</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </section>}
          {!hidden && !diagram && scene.objects.length > 0 && (
            <section className="learning-trace-heap" aria-label="الكائنات">
              <h4 className="learning-trace-heading">الكائنات</h4>
              {scene.objects.map(o => (
                <div key={o.id} className="learning-trace-object">
                  <p className="learning-trace-framename" dir="ltr">#{o.id} {o.type}</p>
                  <ul className="learning-trace-vars">
                    {o.fields.map(([name, v]) => (
                      <li key={name} className="learning-trace-var"><span className="learning-trace-name" dir="ltr">{name}</span><span className="learning-trace-box" dir={v.t === "ref" ? undefined : "ltr"}>{v.t === "ref" ? "→ " + told(v) : told(v)}</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
          <section className="learning-trace-output" aria-label="الناتج">
            <h4 className="learning-trace-heading">الناتج</h4>
            <pre className="learning-trace-out" dir="ltr" tabIndex={0} role="region" aria-label="الناتج حتى الآن">{step.out || " "}</pre>
          </section>
        </div>
      </div>
      {diagram && (   // V10: under the program and its state, the whole width — a diagram of several columns needs it
        <section className="learning-trace-heap lab-og-section" aria-label="الكائنات">
          <h4 className="learning-trace-heading">الكائنات</h4>
          {diagram.node}
        </section>
      )}
    </div>
  );
}
