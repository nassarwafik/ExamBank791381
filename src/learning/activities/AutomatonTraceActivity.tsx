import { useId, useMemo, useState, type FormEvent } from "react";
import type { LearningActivityProps } from "./engine";
import {
  edgeKey, gridLayout, LIMITS, pdaLabel, readAutomatonConfig, runAutomaton, splitWord, tmLabel,
  type FaTransition, type Machine, type PdaTransition, type RunStep, type TmTransition, type Verdict,
} from "./automaton";
import { Diagram } from "./automatonDiagram";
import { buildScene, KIND_TEXT } from "./automatonScene";

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

const VERDICT_TEXT: Record<Verdict, string> = { accept: "الكلمة مقبولة", reject: "الكلمة مرفوضة", stuck: "الكلمة مرفوضة", nohalt: "الآلة لم تتوقف" };
const shown = (w: string) => (w === "" ? "ε" : w);

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
