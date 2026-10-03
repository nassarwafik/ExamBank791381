import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ConfirmOptions } from "../ui/ConfirmDialog";
import {
  normalizeEvidence, evidenceStatusLabel, evidenceTone, isOpenStatus, technicalLabel, comparatorLabel, languageLabel, fmtScore,
  CASE_OUTCOME_LABEL, SCORING_POLICY_LABEL, RECOVERY_LABEL, SUPERSEDED_NOTE, TECHNICAL_MESSAGE, NOT_ZERO_NOTE, NO_ANSWER_LABEL, INCOMPLETE_LABEL,
  COMPILE_REVIEW_LABEL, COMPILE_REVIEW_NOTE, COMPILE_REVIEW_HINT,
  RETRY_LABEL, FORCE_LABEL, RETRY_HELP, FORCE_HELP, type TeacherCodingCase
} from "./codingTeacherEvidence";

// Phase 17E-D — the teacher's EVIDENCE panel of the official automatic grade of one coding@1 question, inside AssignmentReview
// (the one detailed review surface; nothing here reaches a student). It DISPLAYS server authority only: the status (a result of
// an older revision while a newer one runs is "historical", never "complete"), automatic score vs teacher override vs the
// effective (canonical) score — never computed here —, language / scoring policy / comparator, the execution summary and the
// per-test evidence (expected output from the published snapshot, bounded actual output and stderr, each in its own LTR block),
// the recovery / technical state (a technical failure is never a wrong answer and never a zero; a raw technical code only in a
// closed support disclosure). Actions: retry = the SAME revision (one click); force = a NEW revision (confirmation first). Both
// send identifiers only (through `onAction`), are guarded synchronously against double clicks and are followed by an
// authoritative reload done by the owner — nothing is synthesised locally.
export type EvidenceActionResult = { ok: true } | { ok: false; message: string } | { stale: true };
type Props = {
  evidence: unknown;
  questionNumber: number;
  studentName: string;
  attemptNumber: number;
  onAction: (action: "retry" | "force") => Promise<EvidenceActionResult>;
  onRefresh: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  refreshing?: boolean;
};
type Filter = "all" | "failed" | "passed";

function CaseRow({ c, expanded, onToggle }: { c: TeacherCodingCase; expanded: boolean; onToggle: () => void }) {
  const bodyId = "cx-ev-case-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const passed = c.outcome === "passed";
  return (
    <li data-testid="coding-autograde-case" className={"cx-ev-case " + (passed ? "is-pass" : "is-fail")}>
      <button type="button" className="cx-ev-case-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle}>
        <strong>{c.title || c.testId}</strong>
        <span className="cx-ev-case-outcome">{CASE_OUTCOME_LABEL[c.outcome]}</span>
        {c.weight !== null && <small> · الوزن {c.weight}</small>}
        {c.durationMs !== null && <small dir="ltr"> · {c.durationMs} ms</small>}
      </button>
      {expanded && (
        <div id={bodyId} className="cx-ev-io">
          <div data-ev-io="expected"><span>المخرجات المتوقعة</span><pre dir="ltr" className="cx-ev-output">{c.expectedOutput}</pre></div>
          {c.actualPreview !== undefined && <div data-ev-io="actual"><span>مخرجات الطالب</span><pre dir="ltr" className="cx-ev-output">{c.actualPreview}</pre></div>}
          {c.stderrPreview !== undefined && c.stderrPreview !== "" && <div data-ev-io="stderr"><span>رسائل الخطأ</span><pre dir="ltr" className="cx-ev-output">{c.stderrPreview}</pre></div>}
          {c.outcome === "not-run" && <p className="cx-ev-muted">لا توجد نتيجة تنفيذ لهذا الاختبار في هذه النسخة.</p>}
        </div>
      )}
    </li>
  );
}

export default function CodingAutoGradeBlock({ evidence, questionNumber, studentName, attemptNumber, onAction, onRefresh, confirm, refreshing = false }: Props) {
  const e = useMemo(() => normalizeEvidence(evidence), [evidence]);
  const headingId = "cx-ev-h-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const busyRef = useRef(false), mounted = useRef(true), sectionRef = useRef<HTMLElement>(null), headingRef = useRef<HTMLHeadingElement>(null), keepFocus = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // After an action / reload the control that had focus may be gone (e.g. retry hidden once complete): keep focus in the panel.
  useEffect(() => {
    if (!keepFocus.current || busy) return;
    keepFocus.current = false;
    const root = sectionRef.current, active = document.activeElement;
    if (root && (!active || active === document.body || !document.contains(active))) headingRef.current?.focus();
  });
  if (!e) return null;

  const run = async (action: "retry" | "force") => {
    if (busyRef.current) return;                                   // synchronous guard: rapid clicks send ONE request
    busyRef.current = true;
    if (action === "force") {
      const ok = await confirm({
        title: FORCE_LABEL,
        message: "سيتم إنشاء محاولة تصحيح آلي جديدة لهذا السؤال.\nتبقى علامة المعلم اليدوية، إن وُجدت، هي المعتمدة حتى يتم تغييرها يدويًا.\n\nالطالب: " + studentName + " · المحاولة " + attemptNumber + " · السؤال " + questionNumber,
        confirmLabel: "بدء إعادة التصحيح"
      });
      if (!ok) { busyRef.current = false; return; }
    }
    if (mounted.current) { setBusy(true); setError(""); }
    let r: EvidenceActionResult;
    try { r = await onAction(action); } catch { r = { ok: false, message: TECHNICAL_MESSAGE }; }
    busyRef.current = false;
    if (!mounted.current || "stale" in r) return;                  // the review moved on (closed / other attempt / student)
    keepFocus.current = true;
    setBusy(false);
    if (!r.ok) setError(r.message);
  };

  const historical = e.automaticScore !== null && !e.resultCurrent && e.resultRevision !== null && e.revision !== null && e.resultRevision < e.revision;
  const technical = e.automaticStatus === "retrying" || e.automaticStatus === "delayed";
  const automaticOpen = isOpenStatus(e.automaticStatus);
  const max = fmtScore(e.maxMarks);
  const failed = e.cases.filter(c => c.outcome !== "passed"), passedCases = e.cases.filter(c => c.outcome === "passed");
  const shown = filter === "failed" ? failed : filter === "passed" ? passedCases : e.cases;
  const isExpanded = (c: TeacherCodingCase) => open[c.testId] ?? (c.outcome !== "passed" && c.outcome !== "compile-error" && c.outcome !== "not-run" && e.outcome !== "compile-error");
  const unsupported = e.status === "unsupported";

  return (
    <section ref={sectionRef} className="cx-ev" data-testid="coding-autograde" aria-labelledby={headingId} aria-busy={busy || refreshing || undefined}>
      <div className="cx-ev-head">
        <h4 id={headingId} ref={headingRef} tabIndex={-1}>أدلة التصحيح الآلي</h4>
        <span className={"cx-ev-status is-" + evidenceTone(e)} data-testid="ev-status">{evidenceStatusLabel(e)}</span>
        {e.override.active && <span className="cx-ev-badge" data-testid="ev-override-badge">علامة المعلم معتمدة</span>}
      </div>
      {e.status === "superseded" && <p className="cx-ev-note">{SUPERSEDED_NOTE}</p>}
      {e.incomplete && e.status !== "unknown" && <p className="cx-ev-note is-warn">{INCOMPLETE_LABEL}</p>}

      <dl className="cx-ev-facts">
        <div><dt>اللغة</dt><dd dir="ltr">{languageLabel(e.language)}</dd></div>
        <div><dt>سياسة التصحيح</dt><dd>{SCORING_POLICY_LABEL[e.scoringPolicy]}</dd></div>
        <div><dt>طريقة المقارنة</dt><dd>{comparatorLabel(e.comparator)}</dd></div>
        <div><dt>عدد الاختبارات</dt><dd>{e.testCount}</dd></div>
      </dl>

      <div className="cx-ev-scores">
        {e.automaticScore !== null && <div data-testid="ev-automatic-score" className={"cx-ev-score" + (e.override.active || historical ? " is-evidence" : "")}><span>{historical ? "آخر نتيجة مكتملة: " : "العلامة الآلية: "}</span><strong dir="ltr">{fmtScore(e.automaticScore)} / {max}</strong></div>}
        {e.override.active && <div data-testid="ev-teacher-score" className="cx-ev-score is-authority"><span>العلامة المعتمدة من المعلم: </span><strong dir="ltr">{fmtScore(e.override.score)} / {max}</strong></div>}
        {e.effectiveScore !== null && <div data-testid="ev-effective-score" className="cx-ev-score"><span>العلامة المعتمدة حاليًا: </span><strong dir="ltr">{fmtScore(e.effectiveScore)} / {max}</strong></div>}
      </div>
      {historical && <p className="cx-ev-revision" data-testid="ev-revision">النتيجة المعروضة من الإصدار {e.resultRevision} · جارٍ التصحيح بالإصدار {e.revision}</p>}

      {!unsupported && e.outcome === "no-answer" && <p className="cx-ev-summary">{NO_ANSWER_LABEL}</p>}
      {!unsupported && e.outcome === "graded" && e.passedCount !== null && <p className="cx-ev-summary">نجح {e.passedCount} من {e.testCount} اختبارات{e.scoringPolicy === "proportional" && e.passedWeight !== null && e.totalWeight !== null ? " · الأوزان الناجحة " + e.passedWeight + " / " + e.totalWeight : ""}</p>}
      {!unsupported && e.outcome === "compile-error" && e.reviewRequired && (
        <div className="cx-ev-review" data-testid="ev-review-required" role="status">
          <strong>{COMPILE_REVIEW_LABEL}</strong>
          <p>{COMPILE_REVIEW_NOTE}{e.maxMarks !== null ? " علامة السؤال " + max + "." : ""}</p>
          {!e.override.active && <p>{COMPILE_REVIEW_HINT}</p>}
        </div>
      )}
      {!unsupported && e.outcome === "compile-error" && <div className="cx-ev-compile"><span>{e.reviewRequired ? "رسالة المترجم (دليل للمعلم)" : "خطأ في الترجمة"}</span>{e.compilePreview !== undefined && e.compilePreview !== "" && <pre dir="ltr" className="cx-ev-output">{e.compilePreview}</pre>}</div>}

      {technical && (
        <div className="cx-ev-technical" data-testid="ev-technical">
          <p>{TECHNICAL_MESSAGE}</p>
          {technicalLabel(e.technicalCode) !== TECHNICAL_MESSAGE && <p>{technicalLabel(e.technicalCode)}</p>}
          {e.automaticStatus === "delayed" && <p>توقفت المحاولات التلقائية؛ يمكنك طلب إعادة المحاولة.</p>}
          {!e.override.active && <p>{NOT_ZERO_NOTE}</p>}
          {e.technicalCode && <details className="cx-ev-support"><summary>تفاصيل للدعم الفني</summary><code dir="ltr">{e.technicalCode}</code></details>}
        </div>
      )}
      {!technical && e.recovery !== "none" && automaticOpen && <p className="cx-ev-muted">{RECOVERY_LABEL[e.recovery]}</p>}

      {e.cases.length > 0 && (
        <div className="cx-ev-cases-wrap">
          <div className="cx-ev-filter" role="group" aria-label="تصفية الاختبارات">
            {([["all", "الكل", e.cases.length], ["failed", "الفاشلة", failed.length], ["passed", "الناجحة", passedCases.length]] as const).map(([f, label, n]) =>
              <button key={f} type="button" aria-pressed={filter === f} className={filter === f ? "is-active" : undefined} onClick={() => setFilter(f)}>{label} ({n})</button>)}
          </div>
          <ol className="cx-ev-cases">
            {shown.map(c => <CaseRow key={c.testId} c={c} expanded={isExpanded(c)} onToggle={() => setOpen(o => ({ ...o, [c.testId]: !isExpanded(c) }))} />)}
          </ol>
        </div>
      )}

      {!unsupported && (
        <div className="cx-ev-actions">
          {automaticOpen && <div><button type="button" onClick={() => void run("retry")} disabled={busy}>{RETRY_LABEL}</button><small>{RETRY_HELP}</small></div>}
          {e.automaticStatus !== "queued" && <div><button type="button" onClick={() => void run("force")} disabled={busy}>{FORCE_LABEL}</button><small>{FORCE_HELP}</small></div>}
          <div><button type="button" className="is-quiet" onClick={onRefresh}>تحديث حالة التصحيح</button></div>
        </div>
      )}
      {(busy || refreshing) && <p className="cx-ev-muted">{busy ? "جارٍ إرسال الطلب..." : "جارٍ تحديث البيانات..."}</p>}
      {error && <p className="platform-error" role="alert">{error}</p>}
    </section>
  );
}
