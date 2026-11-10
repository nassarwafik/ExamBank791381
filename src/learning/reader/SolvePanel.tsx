import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CodingExecutionContext, type CodingExecutionService } from "../../coding/codingExecution";
import type { CodeExecutionResult } from "../../codingContract";
import { CodeRunError } from "../run/runClient";
import type { CheckResult, SolveAnswer, SolveView } from "../run/solveClient";
import "./codeRun.css";

// 899371 enrichment P14 (docs/enterprise-899371-enrichment-plan.md §3.3, §11) — «حلّ وافحص» under a writing question of the book. Its
// own lazy chunk, opened from CSharpCodePanel (which gives the transport, so the Reader's first-load graph does not change):
//   • the EDITOR is the exam's own coding renderer — Monaco for a whole program (coding@2), the locked template with its gaps for a
//     method / class question (coding@3) — fed by the question's PUBLIC projection; «تشغيل» and the public example run through the
//     server (learning-solve /run);
//   • «افحص حلي» asks the server to run the program on the public example and every hidden input: the public example is shown in full,
//     each hidden input as passed / failed only. A question that cannot be checked automatically says so and keeps «تشغيل»;
//   • «الحل المقترح» opens the reference and its idea only when the server says the teacher released the module (decision D1);
//   • «✓ حُلَّ» is a mark for the learner only, in this browser (decision D3: no points, nothing stored on the server).

const CodingResponse = lazy(() => import("../../questionTypes/student/CodingResponse"));
const CodingTemplateResponse = lazy(() => import("../../questionTypes/student/CodingTemplateResponse"));
type Answer = { kind: "code"; language: string; languageVersion: number; source: string } | { kind: "codeTemplate"; language: string; languageVersion: number; values: Record<string, string> };
type Props = {
  id: string; courseId: string; view: SolveView; available: boolean;
  run: (answer: SolveAnswer, stdin: string) => Promise<{ result: CodeExecutionResult }>;
  check: (answer: SolveAnswer) => Promise<{ check: CheckResult }>;
  solution: () => Promise<{ solution: { reference: string; explanation: string } }>;
};
const WHY: Record<string, string> = { "wrong-output": "ناتج مختلف", "runtime-error": "خطأ أثناء التشغيل", timeout: "تجاوز الوقت", "output-limit": "الناتج أطول من الحد" };
/** `…` in an explanation is code: left to right in its own isolate. */
const withCode = (text: string): ReactNode[] => text.split(/(`[^`]+`)/).filter(Boolean).map((p, i) => (p.startsWith("`") && p.endsWith("`") && p.length > 2 ? <bdi key={i} dir="ltr"><code>{p.slice(1, -1)}</code></bdi> : p));
const solvedKey = (courseId: string, qid: string) => "eb.learning.solved.v1." + courseId + "." + qid;
const readSolved = (key: string) => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
const writeSolved = (key: string) => { try { localStorage.setItem(key, "1"); } catch { /* the mark is a convenience only */ } };

export default function SolvePanel({ id, courseId, view, available, run, check, solution }: Props) {
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);
  const [epoch, setEpoch] = useState(0);   // remounts the editor when the reference is copied into it
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkError, setCheckError] = useState("");
  const [card, setCard] = useState<{ state: "closed" } | { state: "loading" } | { state: "error"; message: string } | { state: "open"; reference: string; explanation: string }>({ state: "closed" });
  const key = solvedKey(courseId, view.questionId);
  const [solved, setSolved] = useState(() => readSolved(key));
  const runRef = useRef(run);   // the service stays one object; it reads the latest transport when it runs
  useEffect(() => { runRef.current = run; }, [run]);

  const q = useMemo(() => ({ id: view.questionId, type: "coding", presentationType: "coding", questionTypeVersion: view.version, text: "", coding: view.node }), [view]);
  const service = useMemo<CodingExecutionService>(() => ({
    capabilities: { available, languages: available ? [{ key: "csharp", languageVersion: 1 }] : [] },
    run: async req => (await runRef.current(req.values ? { values: req.values } : { source: req.source }, req.stdin)).result,
  }), [available]);
  const starter = (): SolveAnswer => {
    if (view.version === 3) {
      const segs = ((view.node.template as { segments?: { kind: string; id?: string; starter?: string }[] } | undefined)?.segments) || [];
      return { values: Object.fromEntries(segs.filter(s => s.kind === "editable" && s.id).map(s => [s.id!, s.starter ?? ""])) };
    }
    return { source: ((view.node.starterCode as Record<string, string> | undefined)?.csharp) ?? "" };
  };
  const current = (): SolveAnswer => (answer?.kind === "codeTemplate" ? { values: answer.values } : answer?.kind === "code" ? { source: answer.source } : starter());

  const doCheck = async () => {
    setChecking(true); setCheckError(""); setResult(null);
    try {
      const r = (await check(current())).check;
      setResult(r);
      if (r.outcome === "passed") { writeSolved(key); setSolved(true); }
    } catch (e) {
      setCheckError(e instanceof CodeRunError ? e.message + (e.code === "RATE_LIMITED" && e.retryAfterSeconds ? " (بعد " + e.retryAfterSeconds + " ثانية تقريبًا)" : "") : "تعذّر الفحص الآن.");
    } finally { setChecking(false); }
  };
  const openCard = async () => {
    if (card.state === "open") { setCard({ state: "closed" }); return; }
    setCard({ state: "loading" });
    try { const r = (await solution()).solution; setCard({ state: "open", reference: r.reference, explanation: r.explanation }); }
    catch (e) { setCard({ state: "error", message: e instanceof CodeRunError ? e.message : "تعذّر فتح الحل الآن." }); }
  };
  const Editor = view.version === 3 ? CodingTemplateResponse : CodingResponse;

  return (
    <section id={id} className="learning-run learning-solve" aria-label={"حلّ وافحص: السؤال " + view.number}>
      <p className="learning-run-note">
        <span className="learning-trace-panel-tag">إثراء تعليمي</span> اكتب حلّك وشغّله، ثم «افحص حلي»: نجربه على المثال وعلى حالات مخفية. لا علامة ولا حفظ.
        {solved && <span className="learning-solve-done"> ✓ حُلَّ</span>}
      </p>
      {view.text && <p className="learning-solve-text"><strong>ما يُفحص:</strong> {withCode(view.text)}</p>}
      <CodingExecutionContext.Provider value={service}>
        <Suspense fallback={<p className="learning-run-status" role="status">جارٍ فتح المحرر…</p>}>
          <Editor key={epoch} q={q as never} id={id + "-editor"} answer={answer as never} onAnswer={a => setAnswer(a as Answer)} labelPrefix={"السؤال " + view.number} />
        </Suspense>
      </CodingExecutionContext.Provider>
      <div className="learning-run-actions">
        {view.check
          ? <button type="button" className="eb-button is-primary is-small learning-solve-check" onClick={doCheck} disabled={checking || !available}>{checking ? "جارٍ الفحص…" : "افحص حلي"}</button>
          : <p className="learning-run-note" role="note">هذا السؤال لا يُفحص آليًا: شغّل برنامجك وتأكد من ناتجه بنفسك.</p>}
        <button type="button" className="eb-button is-small learning-solve-card-toggle" onClick={openCard} aria-expanded={card.state === "open"}>{card.state === "open" ? "إخفاء الحل المقترح" : "الحل المقترح"}</button>
      </div>
      {checkError && <p className="learning-run-status is-error" role="status">{checkError}</p>}
      {result && (
        <div className={"learning-solve-result is-" + result.outcome} role="status">
          {result.outcome === "compile-error" ? (
            <>
              <p className="learning-solve-verdict">خطأ ترجمة: الكود لا يُترجم. رقم السطر في الرسالة هو رقم سطرك.</p>
              {result.message && <pre className="learning-run-err" dir="ltr" tabIndex={0} role="region" aria-label="رسالة المترجم">{result.message}</pre>}
            </>
          ) : (
            <>
              <p className="learning-solve-verdict">{result.outcome === "passed" ? `✓ حُلَّ! نجح برنامجك في المثال وفي كل الحالات المخفية (${result.passed} من ${result.total}).` : `نجح برنامجك في ${result.passed} من ${result.total}. راجع ما فشل وحاول مرة أخرى.`}</p>
              <ul className="learning-solve-cases">
                {result.cases.map((c, i) => c.kind === "public" ? (
                  <li key={i} className={c.passed ? "is-pass" : "is-fail"}>
                    <span>المثال: {c.passed ? "✓ نجح" : "✗ لم ينجح — " + (WHY[c.why || ""] || "ناتج مختلف")}</span>
                    {!c.passed && (
                      <div className="learning-trace-verdict-grid">
                        <div><p className="learning-run-label">الناتج المتوقع</p><pre className="learning-run-out" dir="ltr" tabIndex={0} role="region" aria-label="الناتج المتوقع">{c.expected || " "}</pre></div>
                        <div><p className="learning-run-label">ناتج برنامجك</p><pre className="learning-run-out" dir="ltr" tabIndex={0} role="region" aria-label="ناتج برنامجك">{c.actual || " "}</pre></div>
                      </div>
                    )}
                  </li>
                ) : (
                  <li key={i} className={c.passed ? "is-pass" : "is-fail"}>حالة مخفية {i + 1 - result.cases.filter(x => x.kind === "public").length}: {c.passed ? "✓ نجحت" : "✗ فشلت — " + (WHY[c.why || ""] || "ناتج مختلف")}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {card.state === "loading" && <p className="learning-run-status" role="status">جارٍ فتح الحل…</p>}
      {card.state === "error" && <p className="learning-run-status" role="status">{card.message}</p>}
      {card.state === "open" && (
        <div className="learning-solve-card" role="region" aria-label="الحل المقترح">
          <p className="learning-solve-idea"><strong>الفكرة:</strong> {withCode(card.explanation)}</p>
          <pre className="learning-run-out learning-solve-reference" dir="ltr" tabIndex={0} role="region" aria-label="برنامج الحل المقترح">{card.reference}</pre>
          {view.version === 2 && (
            <button type="button" className="eb-button is-small" onClick={() => { setAnswer({ kind: "code", language: "csharp", languageVersion: 1, source: card.reference }); setEpoch(n => n + 1); setResult(null); }}>انسخه إلى المحرر (يستبدل كودك)</button>
          )}
        </div>
      )}
    </section>
  );
}
