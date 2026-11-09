import { useMemo, useState, type ReactNode } from "react";
import type { LearningActivityProps } from "./engine";
import { readTraceConfig, type Val } from "./csharpTrace";

/**
 * 899371 P6 (docs/enterprise-899371-learning-plan.md §19) — `simulation / csharp-trace / v1`: a C# program STEP BY STEP.
 *
 * One step shows what the program looked like right after a line ran:
 *   • the program with that line marked (left to right, numbered like the book's code panel);
 *   • the MEMORY: one box per variable in each call-stack frame (the running method on top), a value that just changed marked;
 *     an array as numbered cells, a two-dimensional array as a grid, a string as its letters with their indexes, a reference as
 *     an arrow to its object;
 *   • the expressions this step evaluated («b > max» → True), the objects with their fields, and everything printed so far;
 *   • one short sentence saying what happened.
 * Every step is DATA recorded by running the very program shown (scripts/trace-899371.mjs); nothing here interprets C#. No timers,
 * no animation, no network, no persistence: «السابق» / «التالي» move one step; the shell's reset returns to the first step.
 * An unreadable config shows a short note instead of guessing.
 */
const same = (a: Val | undefined, b: Val | undefined) => JSON.stringify(a) === JSON.stringify(b);
const cell = (v: Val): string => (v.t === "v" ? v.s : v.t === "str" ? "\"" + v.s + "\"" : v.t === "char" ? "'" + v.s + "'" : v.t === "null" ? "null" : v.t === "ref" ? "→ #" + v.id : "…");

/** One value as boxes. `label` names it for assistive technology (the visible name sits beside it). */
function Value({ v, label }: { v: Val; label: string }): ReactNode {
  if (v.t === "arr") {
    return (
      <span className="learning-trace-cells" role="group" aria-label={label + ": " + v.items.map(cell).join("، ")}>
        {v.items.map((it, i) => (
          <span key={i} className="learning-trace-cellbox" aria-hidden="true"><span className="learning-trace-cell">{cell(it)}</span><span className="learning-trace-idx">{i}</span></span>
        ))}
      </span>
    );
  }
  if (v.t === "mat") {
    return (
      <table className="learning-trace-matrix" aria-label={label}>
        <thead><tr><td /> {v.rows[0]?.map((_, j) => <th key={j} scope="col">{j}</th>)}</tr></thead>
        <tbody>{v.rows.map((r, i) => <tr key={i}><th scope="row">{i}</th>{r.map((x, j) => <td key={j}>{x}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  if (v.t === "str" && v.s.length > 0 && v.s.length <= 16) {
    return (
      <span className="learning-trace-cells is-text" role="group" aria-label={label + ": \"" + v.s + "\""}>
        {[...v.s].map((ch, i) => (
          <span key={i} className="learning-trace-cellbox" aria-hidden="true"><span className="learning-trace-cell">{ch === " " ? "␣" : ch}</span><span className="learning-trace-idx">{i}</span></span>
        ))}
      </span>
    );
  }
  return <span className={"learning-trace-box" + (v.t === "ref" ? " is-ref" : "")}>{cell(v)}</span>;
}

export default function CSharpTraceActivity({ block, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readTraceConfig(block.config), [block.config]);
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
  const before = (frame: number, name: string) => prev?.frames[frame]?.name === step.frames[frame]?.name ? prev?.frames[frame]?.vars.find(p => p[0] === name)?.[1] : undefined;
  const frames = step.frames.map((f, i) => ({ f, i })).reverse();   // the running method on top

  return (
    <div className="learning-trace">
      <div className="learning-trace-controls">
        <button type="button" className="learning-trace-btn" onClick={() => go(at - 1)} disabled={at === 0}>الخطوة السابقة</button>
        <button type="button" className="learning-trace-btn is-next" onClick={() => go(at + 1)} disabled={at === total - 1}>الخطوة التالية</button>
        <span className="learning-trace-counter">الخطوة <span dir="ltr">{at + 1} / {total}</span></span>
      </div>
      <p className="learning-trace-note" role="status" aria-live="polite">
        <span className="learning-trace-noteline">السطر <span dir="ltr">{step.line}</span>:</span> {step.note}
      </p>
      <div className="learning-trace-grid">
        <ol className="learning-trace-code" dir="ltr" aria-label="البرنامج">
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
          <section className="learning-trace-memory" aria-label="الذاكرة">
            <h4 className="learning-trace-heading">الذاكرة</h4>
            {frames.map(({ f, i }) => (
              <div key={i} className={"learning-trace-frame" + (i === step.frames.length - 1 ? " is-top" : "")}>
                <p className="learning-trace-framename"><span dir="ltr">{f.name}</span>{step.frames.length > 1 && i === step.frames.length - 1 ? " — تعمل الآن" : ""}</p>
                {f.vars.length === 0 ? <p className="learning-trace-none">لا متغيرات</p> : (
                  <ul className="learning-trace-vars">
                    {f.vars.map(([name, v]) => {
                      const changed = !!prev && !same(before(i, name), v);
                      return (
                        <li key={name} className={"learning-trace-var" + (changed ? " is-changed" : "")}>
                          <span className="learning-trace-name" dir="ltr">{name}</span>
                          <span dir="ltr"><Value v={v} label={name} /></span>
                          {changed && <span className="learning-trace-tag">تغيّر</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </section>
          {step.evals.length > 0 && (
            <section className="learning-trace-evals" aria-label="تقييم">
              <h4 className="learning-trace-heading">تقييم</h4>
              <ul className="learning-trace-vars">
                {step.evals.map(([expr, v]) => (
                  <li key={expr} className="learning-trace-var is-eval"><code className="learning-trace-name" dir="ltr">{expr}</code><span className="learning-trace-arrow" aria-hidden="true">←</span><span dir="ltr"><Value v={v} label={expr} /></span></li>
                ))}
              </ul>
            </section>
          )}
          {step.heap.length > 0 && (
            <section className="learning-trace-heap" aria-label="الكائنات">
              <h4 className="learning-trace-heading">الكائنات</h4>
              {step.heap.map(o => (
                <div key={o.id} className="learning-trace-object">
                  <p className="learning-trace-framename" dir="ltr">#{o.id} {o.type}</p>
                  <ul className="learning-trace-vars">
                    {o.fields.map(([name, v]) => (
                      <li key={name} className="learning-trace-var"><span className="learning-trace-name" dir="ltr">{name}</span><span dir="ltr"><Value v={v} label={"#" + o.id + " " + name} /></span></li>
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
