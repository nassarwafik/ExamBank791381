import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import CodingEditor from "../coding/CodingEditor";
import type { CodeExecutionResult } from "../codingContract";
import { CSharpToolRunError, type CSharpToolRunner } from "./csharpToolRun";
import type { LabTraceResult } from "./labTrace";

// Visual lab V3: the recorded run is drawn by the course's trace view, in its own lazy chunk (only when «تشغيل مرئي» is used).
const LabTraceView = lazy(() => import("./LabTraceView"));

// Phase T14 (docs/enterprise-student-tools-csharp-editor-design.md) — «محرر C#» in the student tool bar: a C# editor (the one reusable
// CodingEditor: syntax colours, line numbers, brackets, no autocomplete) with «نسخ الكود» to paste into the answer.
// Owner decision: in exams and assignments it is a WRITING aid only (no runner is ever passed there); in a course book, when its tools
// allow it, ONE-CLICK RUNNING on the isolated Coding Runner: the output, the compiler's messages (with the learner's own line numbers),
// runtime errors, time-outs. Its own lazy chunk. The code lives in this page only (the dock keeps the tool mounted for the whole attempt); it is never
// stored, never the answer and never graded. The server decides whether a run is allowed; this panel only shows what it says.
// Visual lab V3 (docs/enterprise-csharp-visual-lab-plan.md §11): when the runner can RECORD (runner.trace — the teacher's book reader
// on a desktop), «تشغيل مرئي» runs the program on this device step by step and shows it as the course's trace activity does.

const STARTER = "using System;\n\npublic class Program\n{\n    public static void Main()\n    {\n        Console.WriteLine(\"مرحبا\");\n    }\n}\n";
const SOURCE_MAX_BYTES = 16 * 1024;
const VERDICT: Record<CodeExecutionResult["status"], string> = {
  success: "انتهى التشغيل بنجاح.",
  "compile-error": "خطأ ترجمة: الكود لا يُترجم. اقرأ رسالة المترجم؛ رقم السطر فيها هو رقم سطرك.",
  "runtime-error": "خطأ أثناء التشغيل: توقف البرنامج قبل أن ينتهي.",
  timeout: "تجاوز الوقت المسموح. هل في الكود حلقة لا تنتهي، أو ينتظر مدخلات لم تُكتب؟",
  "output-limit": "الناتج أطول من الحد المسموح، فعُرض أوله فقط.",
  "internal-error": "تعذّر التشغيل لسبب في المشغّل. حاول مرة أخرى.",
};
const READS_INPUT = /Console\s*\.\s*Read(Line)?\s*\(/;
/** Whether the runner is up (asked once when the editor opens; a run answered «unavailable» turns it down; «التحقق مرة أخرى» asks again). */
type Availability = "checking" | "up" | "down";
const DOWN_CODES = new Set(["EXECUTION_UNAVAILABLE", "LANGUAGE_UNAVAILABLE"]);
type State = { kind: "idle" } | { kind: "running" } | { kind: "done"; result: CodeExecutionResult } | { kind: "error"; message: string }
  | { kind: "traced"; result: LabTraceResult; epoch: number; source: string; stdin: string };
/** What a visual run ended as (the steps say the rest). */
const TRACED: Record<LabTraceResult["status"], string> = {
  success: "سُجّل التنفيذ خطوة خطوة. تنقّل بين الخطوات لترى المباني والمتغيّرات تتغيّر.",
  "runtime-error": "خطأ أثناء التشغيل: الخطوة الأخيرة تُظهر السطر الذي توقف عنده البرنامج.",
  "step-limit": "البرنامج أطول من 5000 خطوة: عُرضت أول 5000 خطوة فقط. هل في الكود حلقة لا تنتهي؟",
  "output-limit": "الناتج أطول من الحد المسموح، فتوقف التسجيل عنده.",
  timeout: "تجاوز الوقت المسموح أثناء التسجيل. هل في الكود حلقة لا تنتهي، أو ينتظر مدخلات لم تُكتب؟",
  "compile-error": "خطأ ترجمة: الكود لا يُترجم. اقرأ رسالة المترجم؛ رقم السطر فيها هو رقم سطرك.",
  "trace-unsupported": "تعذّر تسجيل هذا البرنامج خطوة خطوة. جرّب «تشغيل» العادي.",
  "internal-error": "تعذّر التسجيل لسبب في المختبر. حاول مرة أخرى.",
};

type Props = {
  /** Present only when running is allowed HERE: a book whose tools allow it (the dock applies the rule). Absent → write only. */
  runner?: CSharpToolRunner;
  /** Phase E1 — the panel fills the screen («ملء الشاشة»): the editor is taller (the state — code, input, output, steps — is the same). */
  full?: boolean;
};

export default function CSharpEditorTool({ runner, full = false }: Props) {
  const [source, setSource] = useState(STARTER);
  const [stdin, setStdin] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  const canRun = !!runner;
  const [copied, setCopied] = useState<"" | "ok" | "failed">("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(source); setCopied("ok"); }
    catch { setCopied("failed"); }
  };
  const [availability, setAvailability] = useState<Availability>("checking");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const check = useCallback(() => {
    if (!runner) return;
    setAvailability("checking");
    runner.available().then(up => { if (alive.current) setAvailability(up ? "up" : "down"); }, () => { if (alive.current) setAvailability("up"); });
  }, [runner]);
  useEffect(() => { if (canRun) check(); }, [canRun, check]);

  const run = async () => {
    if (!runner) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ kind: "running" });
    try {
      const result = await runner.run(source, stdin, c.signal);
      if (!c.signal.aborted) setState({ kind: "done", result });
    } catch (e) {
      if (c.signal.aborted) return;
      if (e instanceof CSharpToolRunError && DOWN_CODES.has(e.code)) { setAvailability("down"); setState({ kind: "idle" }); return; }
      const message = e instanceof CSharpToolRunError
        ? e.message + (e.code === "RATE_LIMITED" && e.retryAfterSeconds ? " (بعد " + e.retryAfterSeconds + " ثانية تقريبًا)" : "")
        : "تعذّر تشغيل الكود الآن. حاول مرة أخرى.";
      setState({ kind: "error", message });
    }
  };

  const traceRun = async () => {
    if (!runner?.trace) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ kind: "running" });
    try {
      const traced = await runner.trace(source, stdin, c.signal);
      if (!c.signal.aborted) setState(s => ({ kind: "traced", result: traced, epoch: (s.kind === "traced" ? s.epoch : 0) + 1, source, stdin }));
    } catch (e) {
      if (c.signal.aborted) return;
      setState({ kind: "error", message: e instanceof CSharpToolRunError && e.message ? e.message : "تعذّر التسجيل الآن. حاول مرة أخرى." });
    }
  };
  const traced = state.kind === "traced" ? state : null;

  const result = state.kind === "done" ? state.result : null;
  const needsInput = !!result && result.status === "runtime-error" && !stdin.trim() && READS_INPUT.test(source);
  const onDevice = runner?.where === "device";
  const tracedText = traced ? (traced.result.trace || traced.result.status !== "success" ? TRACED[traced.result.status] : "تعذّر عرض الخطوات. جرّب «تشغيل» العادي.") : "";
  const status = availability === "checking" ? "جارٍ التحقق من المشغّل…" : state.kind === "running" ? (onDevice ? "جارٍ التشغيل على جهازك… (أول تشغيل يحمّل المترجم مرة واحدة)" : "جارٍ التشغيل…") : state.kind === "error" ? state.message : traced ? tracedText : result ? VERDICT[result.status] : "";
  const errLabel = result?.status === "compile-error" ? "رسالة المترجم" : "رسالة الخطأ";

  return (
    <div className="stt-cs" data-testid="csharp-editor-tool">
      <p className="stt-hint">مسودة برمجية للتجربة: لا تُحفظ ولا تُصحّح، وليست إجابتك. انسخ ما تحتاجه إلى مكان الإجابة.</p>
      <CodingEditor value={source} onChange={v => { setSource(v); setCopied(""); }} language="csharp" label="كود C#" maxBytes={SOURCE_MAX_BYTES} minRows={full ? 24 : 10} />
      <div className="stt-row stt-cs-actions">
        <button type="button" className="stt-btn" onClick={copy} disabled={!source.trim()}>نسخ الكود</button>
        <span className="stt-hint" role="status" data-testid="csharp-copy-status">{copied === "ok" ? "نُسخ الكود. الصقه في مكان الإجابة (Ctrl+V)." : copied === "failed" ? "تعذّر النسخ تلقائيًا؛ حدّد الكود وانسخه بـ Ctrl+C." : ""}</span>
      </div>
      {canRun && availability === "down" ? (
        <div className="stt-row stt-cs-actions">
          <p className="stt-hint" role="note" data-testid="csharp-runner-down">تشغيل الكود متوقف حاليًا؛ يمكنك الكتابة في المحرر فقط.</p>
          <button type="button" className="stt-btn" onClick={check}>التحقق مرة أخرى</button>
        </div>
      ) : canRun ? (
        <>
          {onDevice && <p className="stt-hint" data-testid="csharp-on-device">يعمل على جهازك: بلا مشغّل وبلا تكلفة. أول تشغيل يحمّل المترجم مرة واحدة (نحو 10 ميغابايت)، ثم يبقى محفوظًا في المتصفح.</p>}
          {/* V14 (docs/enterprise-csharp-visual-lab-plan.md §24): the same lab on a page of its own, which can work offline */}
          {onDevice && typeof location !== "undefined" && location.pathname !== "/lab.html" && (
            <p className="stt-hint"><a href="/lab.html" target="_blank" rel="noopener" data-testid="csharp-offline-lab">مختبر C# في صفحة مستقلة (يعمل بلا إنترنت بعد تنزيله)</a></p>
          )}
          <label className="stt-cs-field">
            <span>المدخلات <small>(كل قيمة في سطر، بترتيب قراءتها بـ <bdi dir="ltr">Console.ReadLine</bdi>)</small></span>
            <textarea className="stt-cs-input" dir="ltr" lang="en" spellCheck={false} autoCapitalize="off" autoCorrect="off" rows={3} value={stdin} onChange={e => setStdin(e.target.value)} />
          </label>
          <div className="stt-row stt-cs-actions">
            <button type="button" className="stt-btn is-primary" onClick={run} disabled={availability !== "up" || state.kind === "running" || !source.trim()}>تشغيل</button>
            {runner?.trace && (
              <button type="button" className="stt-btn" onClick={traceRun} disabled={availability !== "up" || state.kind === "running" || !source.trim()}
                title="يشغّل البرنامج خطوة خطوة ويرسم المباني والمتغيّرات">تشغيل مرئي</button>
            )}
            <button type="button" className="stt-btn" onClick={() => { ctrl.current?.abort(); setState({ kind: "idle" }); }} disabled={state.kind === "idle"}>مسح الناتج</button>
            <button type="button" className="stt-btn" onClick={() => { setSource(STARTER); }} disabled={source === STARTER}>إعادة القالب</button>
          </div>
          <p className={"stt-cs-status" + (result ? " is-" + result.status : traced ? " is-" + traced.result.status : state.kind === "error" ? " is-error" : "")} role="status">{status}</p>
          {needsInput && <p className="stt-cs-hint">البرنامج يقرأ مدخلات (<bdi dir="ltr">Console.ReadLine</bdi>) ولم تكتب شيئًا في مربع المدخلات.</p>}
          {traced && (
            <div className="stt-cs-result">
              {traced.result.clipped && <p className="stt-hint" role="note" data-testid="csharp-trace-clipped">بعض القيم أو المباني أكبر من أن تُرسم كاملة، فعُرض أولها.</p>}
              {traced.result.trace && (
                <Suspense fallback={<p className="stt-hint" role="status">جارٍ تجهيز العرض…</p>}>
                  <LabTraceView trace={traced.result.trace} epoch={traced.epoch}
                    retrace={(options, signal) => runner!.trace!(traced.source, traced.stdin, signal, options)} />
                </Suspense>
              )}
              {traced.result.stderr && (traced.result.status === "compile-error" || traced.result.status === "runtime-error" || traced.result.status === "trace-unsupported") && <>
                <p className="stt-cs-label">{traced.result.status === "compile-error" ? "رسالة المترجم" : "رسالة الخطأ"}</p>
                <pre className="stt-cs-out is-error" dir="ltr" tabIndex={0} role="region" aria-label="رسالة الخطأ" data-testid="csharp-errors">{traced.result.stderr}</pre>
              </>}
            </div>
          )}
          {result && (
            <div className="stt-cs-result">
              <p className="stt-cs-label">الناتج (Output)</p>
              {result.stdout
                ? <pre className="stt-cs-out" dir="ltr" tabIndex={0} role="region" aria-label="الناتج" data-testid="csharp-output">{result.stdout}</pre>
                : <p className="stt-hint">لم يطبع البرنامج شيئًا.</p>}
              {result.stderr && <>
                <p className="stt-cs-label">{errLabel}</p>
                <pre className="stt-cs-out is-error" dir="ltr" tabIndex={0} role="region" aria-label={errLabel} data-testid="csharp-errors">{result.stderr}</pre>
              </>}
            </div>
          )}
        </>
      ) : (
        <p className="stt-hint" role="note">محرر لكتابة الكود فقط، بلا تشغيل: اكتب الكود هنا ثم انسخه إلى مكان الإجابة.</p>
      )}
    </div>
  );
}
