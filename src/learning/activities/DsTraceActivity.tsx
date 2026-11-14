import { useMemo, useState } from "react";
import type { LearningActivityProps } from "./engine";
import { readDsTrace, sceneOf, type DsObj, type DsVal } from "./ds";
import { ChainDrawing, Marked, QueueDrawing, StackDrawing, TreeDrawing } from "./DsDraw";

/**
 * DS-A1 (docs/enterprise-data-structures-course.md) — `simulation / ds-trace / v1`: «تتبّع البرنامج على مبنى المعطيات».
 *
 * A program of the course, one step at a time: the line that ran, one Arabic sentence, the STRUCTURES drawn as they are now (a
 * stack, a queue, a chain of cells with the names pointing at its cells, a binary tree), the variables of every method on the
 * call stack (the running one on top — recursion is a pile of frames) and everything printed so far.
 * Every step is DATA recorded by the authoring tool (scripts/ds-course/cs-lite.mjs) and checked against the real C# compiler;
 * nothing here interprets C#. No timers, no network, no persistence: the shell's reset returns to the first step.
 */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function DsTraceActivity({ block, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readDsTrace(block.config), [block.config]);
  const [state, setState] = useState({ at: 0, epoch: 0 });
  const at = state.epoch === commands.reset ? state.at : 0;

  if (!cfg) return <p className="learning-trace-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const total = cfg.steps.length;
  const step = cfg.steps[Math.min(at, total - 1)];
  const prev = at > 0 ? cfg.steps[at - 1] : undefined;
  const go = (n: number) => {
    const next = Math.max(0, Math.min(total - 1, n));
    setState({ at: next, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name: "trace-step", detail: { step: next + 1, of: total } });
  };
  const scene = sceneOf(step.frames, step.objs);
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
    return o.k === "obj" ? o.type + " #" + o.id : "خلية " + o.v;
  };
  const frames = step.frames.map((f, i) => ({ f, i })).reverse();   // the running method on top
  const was = (frame: number, name: string) => (prev?.frames[frame]?.name === step.frames[frame]?.name ? prev?.frames[frame]?.vars.find(p => p[0] === name)?.[1] : undefined);
  const drawings = scene.stacks.length + scene.queues.length + scene.chains.length + scene.trees.length;

  return (
    <div className="learning-trace learning-ds">
      {cfg.given && <p className="learning-ds-given"><span className="learning-trace-label">المعطى:</span> <Marked text={cfg.given} /></p>}
      <div className="learning-trace-controls">
        <button type="button" className="learning-trace-btn" onClick={() => go(at - 1)} disabled={at === 0}>الخطوة السابقة</button>
        <button type="button" className="learning-trace-btn is-next" onClick={() => go(at + 1)} disabled={at === total - 1}>الخطوة التالية</button>
        <span className="learning-trace-counter">الخطوة <span dir="ltr">{at + 1} / {total}</span></span>
        {total > 12 && (
          <input type="range" className="learning-trace-slider" dir="ltr" min={1} max={total} value={at + 1} aria-label="انتقل إلى الخطوة"
            aria-valuetext={"الخطوة " + (at + 1) + " من " + total} onChange={e => go(Number(e.target.value) - 1)} />
        )}
      </div>
      <p className={"learning-trace-note" + (step.error ? " learning-ds-error" : "")} role="status" aria-live="polite">
        {step.line > 0 && <span className="learning-trace-noteline">السطر <span dir="ltr">{step.line}</span>: </span>}
        <Marked text={step.note || "ننفّذ السطر."} />
      </p>
      <div className="learning-trace-grid">
        <ol className="learning-trace-code" dir="ltr" tabIndex={0} aria-label="البرنامج">
          {cfg.lines.map((l, i) => {
            const current = i + 1 === step.line;
            return (
              <li key={i} className={"learning-trace-line" + (current ? " is-current" : "")} aria-current={current ? "step" : undefined}>
                <span className="learning-trace-lineno" aria-hidden="true">{i + 1}</span>
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
          {drawings > 0 && (
            <section className="learning-ds-structures" aria-label="مباني المعطيات">
              <h4 className="learning-trace-heading">مباني المعطيات الآن</h4>
              <div className="learning-ds-row">
                {scene.stacks.map(s => <StackDrawing key={s.id} items={s.items} labels={s.labels} changed={changed(s.id)} />)}
                {scene.queues.map(q => <QueueDrawing key={q.id} items={q.items} labels={q.labels} changed={changed(q.id)} />)}
              </div>
              {scene.chains.map((c, i) => <ChainDrawing key={"c" + i} cells={c.nodes.map(n => ({ key: n.id, v: n.v, labels: n.labels, hi: changed(n.id) }))} end={c.end} join={c.join} />)}
              {scene.trees.map((t, i) => <TreeDrawing key={"t" + i} cells={t.nodes.map(n => ({ key: n.id, v: n.v, x: n.x, depth: n.depth, parent: n.parent, labels: n.labels, hi: changed(n.id) }))} />)}
            </section>
          )}
          <section className="learning-trace-memory" aria-label="المتغيّرات">
            <h4 className="learning-trace-heading">{step.frames.length > 1 ? "مكدّس الاستدعاءات والمتغيّرات" : "المتغيّرات"}</h4>
            {frames.map(({ f, i }) => (
              <div key={i} className={"learning-trace-frame" + (i === step.frames.length - 1 ? " is-top" : "")}>
                <p className="learning-trace-framename"><span dir="ltr">{f.name}</span>{step.frames.length > 1 && i === step.frames.length - 1 ? " — تعمل الآن" : ""}</p>
                {f.vars.length === 0 ? <p className="learning-trace-none">لا متغيرات</p> : (
                  <ul className="learning-trace-vars">
                    {f.vars.map(([name, v]) => {
                      const old = was(i, name);
                      const moved = !!prev && !same(old, v);
                      return (
                        <li key={name} className={"learning-trace-var" + (moved ? " is-changed" : "")}>
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
          </section>
          {scene.objects.length > 0 && (
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
    </div>
  );
}
