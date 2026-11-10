import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CodeRunError } from "../run/runClient";
import { traceList, traceSteps, comparable, type TraceResponse } from "../run/traceClient";
import type { CodeRunTarget } from "./CSharpCodePanel";
import type { SimulationBlock } from "../content/types";
import "./codeRun.css";

// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §3.2, §9) — «شاهد التنفيذ خطوة بخطوة» under a question's program: the
// program's RECORDED run (the server sends it on demand; nothing is computed here) in the C# tracer of P6. Its own lazy chunk, opened from
// CSharpCodePanel. For a BOOK question it first offers «تنبّأ ثم تحقّق»: the learner writes the output they expect, then compares it with
// what the program really printed. The server decides who may watch what (an exercise after it is answered; a book question after the
// teacher opens its module, D1); this panel only shows what it says. Nothing is sent but the request, nothing is stored.

const CSharpTraceActivity = lazy(() => import("../activities/CSharpTraceActivity"));
const noop = () => {};
type Trace = TraceResponse["trace"];
type State = { kind: "loading" } | { kind: "refused"; message: string } | { kind: "ready"; trace: Trace };
const finalOutput = (trace: Trace): string => {
  const last = trace.steps[trace.steps.length - 1] as { out?: unknown } | undefined;
  return typeof last?.out === "string" ? last.out : "";
};

export default function CodeTracePanel({ id, target }: { id: string; target: CodeRunTarget }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [guess, setGuess] = useState("");
  const [phase, setPhase] = useState<"predict" | "watch">("predict");
  const [checked, setChecked] = useState<string | null>(null);   // the prediction compared, or null (watched without one)
  const [epoch, setEpoch] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    traceSteps(target.access, target.courseId, target.pageId, target.blockId)
      .then(r => { if (alive.current) setState({ kind: "ready", trace: r.trace }); })
      .catch(e => {
        // after a refusal the session's list may be stale (an exercise just answered, a module just opened): ask again next time
        void traceList(target.access, target.courseId, true).catch(() => undefined);
        if (alive.current) setState({ kind: "refused", message: e instanceof CodeRunError ? e.message : "تعذّر تحميل التتبع الآن." });
      });
    return () => { alive.current = false; };
  }, [target.access, target.courseId, target.pageId, target.blockId]);

  if (state.kind === "loading") return <section id={id} className="learning-run learning-trace-panel" aria-label="شاهد التنفيذ"><p className="learning-run-status" role="status">جارٍ تحميل التنفيذ…</p></section>;
  if (state.kind === "refused") return <section id={id} className="learning-run learning-trace-panel" aria-label="شاهد التنفيذ"><p className="learning-run-status is-error" role="status">{state.message}</p></section>;

  const trace = state.trace;
  const predicting = trace.kind === "book" && phase === "predict";
  const block: SimulationBlock = {
    id: target.blockId + "-trace", type: "simulation", origin: "teacher-enrichment", simulationType: "csharp-trace", version: 1, title: "تتبّع البرنامج خطوة خطوة",
    capabilities: { fullscreen: false, reset: true, interactive: true },
    config: { code: trace.code, ...(trace.stdin !== undefined ? { stdin: trace.stdin } : {}), steps: trace.steps } as SimulationBlock["config"],
  };
  const out = finalOutput(trace);
  const match = checked !== null && comparable(checked) === comparable(out);
  return (
    <section id={id} className="learning-run learning-trace-panel" aria-label="شاهد التنفيذ خطوة بخطوة">
      <p className="learning-run-note"><span className="learning-trace-panel-tag">إثراء تعليمي</span> تنفيذ البرنامج كما سُجّل بتشغيله فعلًا{trace.stdin ? "، بالمدخلات المكتوبة تحت" : ""}. لا علامة ولا حفظ.</p>
      {trace.valuesFrom === "chosen" && <p className="learning-run-note">قيم هذا التشغيل مقترحة للتتبع، فالسؤال لا يحددها.</p>}
      {trace.valuesFrom === "clarification" && <p className="learning-run-note">قيم هذا التشغيل من «توضيح المعلم» في الصفحة.</p>}
      {predicting ? (
        <>
          <label className="learning-run-field">
            <span>تنبّأ ثم تحقّق: اكتب الناتج الذي تتوقعه</span>
            <textarea className="learning-run-input" dir="ltr" spellCheck={false} rows={4} value={guess} onChange={e => setGuess(e.target.value)} />
          </label>
          <div className="learning-run-actions">
            <button type="button" className="eb-button is-primary is-small" disabled={!guess.trim()} onClick={() => { setChecked(guess); setPhase("watch"); }}>قارن توقّعي بالتنفيذ</button>
            <button type="button" className="eb-button is-small" onClick={() => { setChecked(null); setPhase("watch"); }}>شاهد دون توقّع</button>
          </div>
        </>
      ) : (
        <>
          {checked !== null && (
            <div className={"learning-trace-verdict" + (match ? " is-match" : " is-diff")} role="status">
              <p className="learning-trace-verdict-head">{match ? "✓ توقّعك يطابق ناتج البرنامج." : "توقّعك يختلف عن ناتج البرنامج. امشِ في الخطوات وابحث عن السطر الذي اختلف عنده."}</p>
              {!match && (
                <div className="learning-trace-verdict-grid">
                  <div><p className="learning-run-label">توقّعك</p><pre className="learning-run-out" dir="ltr" tabIndex={0} role="region" aria-label="توقّعك">{checked}</pre></div>
                  <div><p className="learning-run-label">الناتج</p><pre className="learning-run-out" dir="ltr" tabIndex={0} role="region" aria-label="ناتج البرنامج">{out || " "}</pre></div>
                </div>
              )}
            </div>
          )}
          <Suspense fallback={<p className="learning-run-status" role="status">جارٍ فتح المتتبّع…</p>}>
            <CSharpTraceActivity block={block} courseId={target.courseId} reducedMotion={false} fullscreen={false} commands={{ reset: epoch, replay: 0 }} emit={noop} />
          </Suspense>
          <div className="learning-run-actions">
            <button type="button" className="eb-button is-small" onClick={() => setEpoch(n => n + 1)}>من البداية</button>
            {trace.kind === "book" && <button type="button" className="eb-button is-small" onClick={() => { setPhase("predict"); setEpoch(n => n + 1); }}>توقّع من جديد</button>}
          </div>
        </>
      )}
    </section>
  );
}
