import { useState } from "react";

// Phase 17C — the teacher's view of the OFFICIAL automatic grade of one coding@1 question (teacher review only; nothing here
// reaches a student). The server computed the mark from the isolated runner's raw evidence; this block only shows it:
// state, automatic score, comparator, test count and per-test evidence (expected output from the teacher snapshot, bounded
// actual output / stderr previews). A technical failure is shown as such — never as a wrong answer. Retry / force regrade
// send identifiers only; the manual teacher mark below remains the override that always wins.
export type CodingAutoGradeCase = { testId: string; title?: string; status?: string; passed?: boolean; durationMs?: number; weight?: number; expectedOutput?: string; actualPreview?: string; stderrPreview?: string };
export type CodingAutoGrade = { state: string; revision?: number; comparator?: string; testCount?: number; technicalCode?: string; automaticScore?: number; maxMarks?: number; passedWeight?: number; totalWeight?: number; passedCount?: number; outcome?: string; compilePreview?: string; cases?: CodingAutoGradeCase[] };

const COMPARATOR_LABEL: Record<string, string> = { exact: "مطابقة حرفية تامة", trimTrailingWhitespace: "تجاهل المسافات في نهايات الأسطر", normalizeWhitespace: "توحيد كل المسافات" };
const STATUS_LABEL: Record<string, string> = { success: "انتهى التنفيذ", "runtime-error": "خطأ أثناء التشغيل", timeout: "تجاوز الوقت", "output-limit": "تجاوز حد المخرجات", "compile-error": "خطأ في الترجمة" };
const stateLabel = (s: string) => (s === "complete" ? "مكتمل" : s === "retryable" ? "تعذر التصحيح الآلي لأسباب تقنية" : "جارٍ التصحيح الآلي");

export default function CodingAutoGradeBlock({ view, onRegrade }: { view: CodingAutoGrade; onRegrade: (action: "retry" | "force") => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const run = async (action: "retry" | "force") => {
    setBusy(true); setError("");
    try { await onRegrade(action); } catch (e) { setError(e instanceof Error ? e.message : "تعذر طلب إعادة التصحيح الآلي."); } finally { setBusy(false); }
  };
  const hasScore = typeof view.automaticScore === "number";
  const cases = Array.isArray(view.cases) ? view.cases : [];
  return (
    <section className="cx-autograde" data-testid="coding-autograde" aria-label="التصحيح الآلي">
      <div className="cx-autograde-head"><strong>التصحيح الآلي</strong><span className={"cx-autograde-state is-" + view.state} role="status">{stateLabel(view.state)}</span></div>
      <div className="cx-autograde-facts">
        {hasScore && <span>العلامة الآلية: {view.automaticScore} / {view.maxMarks}</span>}
        <span>طريقة المقارنة: {COMPARATOR_LABEL[String(view.comparator)] ?? "—"}</span>
        <span>عدد الاختبارات: {view.testCount ?? cases.length}</span>
        {hasScore && view.outcome === "graded" && <span>الاختبارات الناجحة: {view.passedCount ?? 0} · الأوزان: {view.passedWeight ?? 0} / {view.totalWeight ?? 0}</span>}
        {view.outcome === "no-answer" && <span>لا توجد إجابة: العلامة الآلية صفر.</span>}
        {view.state === "retryable" && <span>العلامة الرسمية لم تُحتسب بعد ولا تُعدّ صفرًا؛ يمكنك إعادة المحاولة أو إدخال علامة يدوية.</span>}
      </div>
      {view.outcome === "compile-error" && <div className="cx-autograde-compile"><span>خطأ في الترجمة (العلامة الآلية صفر)</span><pre dir="ltr">{view.compilePreview || "—"}</pre></div>}
      {view.outcome !== "compile-error" && cases.length > 0 && <ol className="cx-autograde-cases">
        {cases.map(c => <li key={c.testId} data-testid="coding-autograde-case" className={c.passed ? "is-pass" : "is-fail"}>
          <div><strong>{c.title || c.testId}</strong> <span>{c.passed ? "ناجح" : "فاشل"}</span>{c.status && !c.passed && <small> · {STATUS_LABEL[c.status] ?? c.status}</small>}{typeof c.weight === "number" && <small> · الوزن {c.weight}</small>}{typeof c.durationMs === "number" && <small> · {c.durationMs} ms</small>}</div>
          {!c.passed && <div className="cx-autograde-io">
            <div><span>المتوقع</span><pre dir="ltr">{c.expectedOutput ?? ""}</pre></div>
            <div><span>مخرجات الطالب</span><pre dir="ltr">{c.actualPreview ?? ""}</pre></div>
            {c.stderrPreview && <div><span>رسائل الخطأ</span><pre dir="ltr">{c.stderrPreview}</pre></div>}
          </div>}
        </li>)}
      </ol>}
      <div className="cx-autograde-actions">
        {view.state !== "complete" && <button type="button" onClick={() => void run("retry")} disabled={busy}>إعادة التصحيح الآلي</button>}
        {view.state !== "pending" && <button type="button" onClick={() => void run("force")} disabled={busy}>فرض إعادة التصحيح الآلي</button>}
      </div>
      {error && <p className="platform-error" role="alert">{error}</p>}
    </section>
  );
}
