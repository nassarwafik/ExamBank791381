import { useEffect, useRef, useState } from "react";
import type { CodeExecutionResult } from "../../codingContract";
import { CodeRunError } from "../run/runClient";
import type { CodeRunTarget } from "./CSharpCodePanel";
import { runClientFor } from "../run/runAccess";
import "./codeRun.css";

// 899371 P8 (docs/enterprise-899371-learning-plan.md §21) — «جرّب الكود»: an editable COPY of a book program, its input, and its run.
// Its own lazy chunk (opened from CSharpCodePanel). The book's code is never changed; nothing here is stored or graded. The server
// decides everything that matters (who, which block, the wrapper, the language, the limits); this panel only shows what it says.

const VERDICT: Record<CodeExecutionResult["status"], string> = {
  success: "انتهى التشغيل",
  "compile-error": "خطأ ترجمة: الكود لا يُترجم. اقرأ رسالة المترجم، ورقم السطر فيها هو رقم سطرك.",
  "runtime-error": "خطأ أثناء التشغيل",
  timeout: "تجاوز الوقت المسموح (ثانيتان). هل في الكود حلقة لا تنتهي، أو ينتظر مدخلات لم تُكتب؟",
  "output-limit": "الناتج أطول من الحد المسموح، فعُرض أوله فقط.",
  "internal-error": "تعذّر التشغيل لسبب في المشغّل. حاول مرة أخرى.",
};
const READS_INPUT = /Console\s*\.\s*Read(Line)?\s*\(/;
type State = { kind: "idle" } | { kind: "running" } | { kind: "done"; result: CodeExecutionResult } | { kind: "error"; message: string };

export default function CodeRunPanel({ id, code, target }: { id: string; code: string; target: CodeRunTarget }) {
  const [source, setSource] = useState(code);
  const [stdin, setStdin] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const edited = source !== code;
  const run = async () => {
    setState({ kind: "running" });
    try {
      const r = await runClientFor(target.access).run(target.courseId, target.pageId, target.blockId, source, stdin);
      if (alive.current) setState({ kind: "done", result: r.result });
    } catch (e) {
      const message = e instanceof CodeRunError
        ? e.message + (e.code === "RATE_LIMITED" && e.retryAfterSeconds ? " (بعد " + e.retryAfterSeconds + " ثانية تقريبًا)" : "")
        : "تعذّر تشغيل الكود الآن.";
      if (alive.current) setState({ kind: "error", message });
    }
  };
  const result = state.kind === "done" ? state.result : null;
  // A program that reads input, given none, and stopped with an error: say what is missing (the commonest first-run surprise).
  const needsInput = !!result && result.status === "runtime-error" && !stdin.trim() && READS_INPUT.test(source);
  const status = state.kind === "running" ? "جارٍ التشغيل…" : state.kind === "error" ? state.message : result ? VERDICT[result.status] : "";
  const rows = Math.min(18, source.split("\n").length + 1);
  return (
    <section id={id} className="learning-run" aria-label="جرّب الكود">
      <p className="learning-run-note">نسخة للتجربة: عدّل الكود وشغّله وشاهد ما يحدث. لا علامة ولا حفظ، وكود الكتاب أعلاه لا يتغيّر.</p>
      <label className="learning-run-field">
        <span>الكود (C#)</span>
        <textarea className="learning-run-code" dir="ltr" lang="en" spellCheck={false} autoCapitalize="off" autoCorrect="off" rows={rows} value={source} onChange={e => setSource(e.target.value)} />
      </label>
      <label className="learning-run-field">
        <span>المدخلات <small>(كل قيمة في سطر، بترتيب قراءتها بـ <bdi dir="ltr">Console.ReadLine</bdi>)</small></span>
        <textarea className="learning-run-input" dir="ltr" spellCheck={false} rows={3} value={stdin} onChange={e => setStdin(e.target.value)} />
      </label>
      <div className="learning-run-actions">
        <button type="button" className="eb-button is-primary is-small learning-run-go" onClick={run} disabled={state.kind === "running" || !source.trim()}>تشغيل</button>
        <button type="button" className="eb-button is-small learning-run-reset" onClick={() => { setSource(code); setState({ kind: "idle" }); }} disabled={!edited}>إعادة كود الكتاب</button>
      </div>
      <p className={"learning-run-status" + (result ? " is-" + result.status : state.kind === "error" ? " is-error" : "")} role="status">{status}</p>
      {needsInput && <p className="learning-run-hint">البرنامج يقرأ مدخلات (<bdi dir="ltr">Console.ReadLine</bdi>) ولم تكتب شيئًا في مربع المدخلات.</p>}
      {result && (
        <div className="learning-run-result">
          <p className="learning-run-label">الناتج</p>
          {result.stdout
            ? <pre className="learning-run-out" dir="ltr" tabIndex={0} role="region" aria-label="الناتج">{result.stdout}</pre>
            : <p className="learning-run-note">لم يطبع البرنامج شيئًا.</p>}
          {result.stderr && <>
            <p className="learning-run-label">{result.status === "compile-error" ? "رسالة المترجم" : "رسالة الخطأ"}</p>
            <pre className="learning-run-err" dir="ltr" tabIndex={0} role="region" aria-label={result.status === "compile-error" ? "رسالة المترجم" : "رسالة الخطأ"}>{result.stderr}</pre>
          </>}
        </div>
      )}
    </section>
  );
}
