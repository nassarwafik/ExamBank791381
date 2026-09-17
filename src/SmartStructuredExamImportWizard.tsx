import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import useFocusTrap from "./ui/useFocusTrap";
import useBodyScrollLock from "./ui/useBodyScrollLock";
import type { StructuredExam, QuestionBody } from "./examTypes";
import { QUESTION_TYPE_LABELS, GRADING_POLICY_LABELS, type GradingPolicy } from "./examTypes";
import { importStructuredExam } from "./structuredExamHtmlParser";
import { MAX_IMPORT_BYTES } from "./structuredExamImport";
import { validateStructuredExam, type StructuredIssue } from "./examQuality";
import { repairStructuredExamSafely, type SafeRepairChange } from "./structuredSafeRepair";
import { collectAiTargets, applyProposal, proposalIsFresh, groupOfCode, ISSUE_GROUP_LABELS, type StructuredAiProposal, type AiTarget, type IssueGroup } from "./structuredAiProposal";
import { detectedQuestionsToStructuredExam, type PdfDetectedQuestion } from "./structuredPdfImport";
import { withTrackingCode } from "./lib/requestTrace";
import "./structured-builder.css";
import "./smart-import.css";

// UX-6d — Smart Structured Exam Import & Repair wizard. One coherent flow:
//   اختيار الملف → تحليل الامتحان → فحص الأخطاء → الإصلاح الآمن → اقتراحات الذكاء الاصطناعي →
//   مراجعة المعلم → الفحص النهائي → فتح في الباني.
// It NEVER auto-saves and the AI NEVER changes the exam without teacher review. JSON/HTML parse fully
// client-side (zero requests); PDF reuses the existing authenticated import-upload → import-analyze pipeline.
// The canonical validateStructuredExam runs after every phase; no competing issue engine exists.

type Stage = "file" | "analyze" | "pdfReview" | "issues" | "safeRepair" | "ai" | "review" | "final";
type Props = { token: string; onClose: () => void; onOpenInBuilder: (exam: StructuredExam) => void };
type ProposalMap = Record<string, StructuredAiProposal>;

const ACCEPT = ".json,.html,.htm,.pdf";
const STAGE_LABELS: { key: Stage; label: string }[] = [
  { key: "file", label: "اختيار الملف" }, { key: "analyze", label: "تحليل الامتحان" }, { key: "issues", label: "فحص الأخطاء" },
  { key: "safeRepair", label: "الإصلاح الآمن" }, { key: "ai", label: "اقتراحات الذكاء الاصطناعي" }, { key: "review", label: "مراجعة المعلم" },
  { key: "final", label: "الفحص النهائي" }
];
const targetKey = (t: { questionId: string; partId?: string }) => t.questionId + (t.partId ? "::" + t.partId : "");
const blockingCount = (exam: StructuredExam | null): number => (exam ? validateStructuredExam(exam).filter(i => i.severity === "error").length : 0);
const AI_CONCURRENCY = 2;

// Finds a question/part node for rendering its current answerable body.
function findBody(exam: StructuredExam, questionId: string, partId?: string): (QuestionBody & { presentationType?: string; type?: string }) | null {
  for (const s of exam.sections || []) for (const q of s.questions || []) {
    if (q.examQuestionId !== questionId) continue;
    if (partId) { const p = (q.parts || []).find(x => x.id === partId); return p ? (p as unknown as QuestionBody & { type?: string }) : null; }
    return q as unknown as QuestionBody & { presentationType?: string };
  }
  return null;
}

export default function SmartStructuredExamImportWizard({ token, onClose, onOpenInBuilder }: Props) {
  const [stage, setStage] = useState<Stage>("file");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [exam, setExam] = useState<StructuredExam | null>(null);
  const [importErrorCount, setImportErrorCount] = useState(0);
  const [afterRepairCount, setAfterRepairCount] = useState<number | null>(null);
  const [repairChanges, setRepairChanges] = useState<SafeRepairChange[]>([]);
  const [detected, setDetected] = useState<PdfDetectedQuestion[] | null>(null);
  const [pdfWarnings, setPdfWarnings] = useState<string[]>([]);
  const [proposals, setProposals] = useState<ProposalMap>({});
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose); useEffect(() => { onCloseRef.current = onClose; });
  const cancelRef = useRef(false);
  useFocusTrap(overlayRef, true, useCallback(() => onCloseRef.current(), []));
  useBodyScrollLock(true);
  const titleId = "ux6d-title-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const liveId = "ux6d-live-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const api = useCallback(async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
    const h = new Headers(options.headers || {});
    if (!(options.body instanceof ArrayBuffer)) h.set("Content-Type", "application/json");
    h.set("x-builder-token", token); h.set("Authorization", "Bearer " + token);
    const r = await fetch(url, { ...options, headers: h });
    const j = await r.json() as T & { error?: string };
    if (!r.ok) throw new Error(withTrackingCode(j.error || "حدث خطأ.", r.status, r));
    return j;
  }, [token]);

  const liveIssues = useMemo(() => (exam ? validateStructuredExam(exam) : []), [exam]);
  const remainingBlocking = liveIssues.filter(i => i.severity === "error").length;
  const questionCount = useMemo(() => (exam?.sections || []).reduce((n, s) => n + (s.questions?.length || 0), 0), [exam]);
  const proposalList = Object.values(proposals);
  const acceptedCount = proposalList.filter(p => p.status === "accepted").length;
  const needsManualCount = proposalList.filter(p => p.status === "needsManualReview" || p.status === "failed").length;
  const safeFixed = afterRepairCount === null ? 0 : Math.max(0, importErrorCount - afterRepairCount);

  const groupedIssues = useMemo(() => {
    const map: Record<IssueGroup, StructuredIssue[]> = { missingAnswer: [], sequenceMismatch: [], structural: [], marksSection: [], manual: [] };
    for (const i of liveIssues) map[groupOfCode(i.code)].push(i);
    return map;
  }, [liveIssues]);

  // ── file intake ────────────────────────────────────────────────────────────
  async function onFile(file: File | null | undefined) {
    if (!file) return;
    setFileError(""); setNotice("");
    if (file.size > MAX_IMPORT_BYTES) { setFileError("الملف كبير جدًّا (الحد الأقصى ~10 ميغابايت)."); return; }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    setFileName(file.name);
    if (ext === "pdf") { void analyzePdf(file); return; }
    // JSON / HTML — fully client-side, zero requests.
    setBusy(true);
    try {
      const text = await file.text();
      const result = importStructuredExam(file.name, text);
      if (!result.canOpen || !result.exam) {
        setFileError(result.parseErrors[0]?.message || "تعذّر قراءة الملف.");
        setBusy(false); return;
      }
      startWithExam(result.exam);
    } catch { setFileError("تعذّر قراءة الملف."); }
    finally { setBusy(false); }
  }

  function startWithExam(imported: StructuredExam) {
    setExam(imported);
    setImportErrorCount(blockingCount(imported));
    setAfterRepairCount(null); setRepairChanges([]); setProposals({});
    setStage("issues");
  }

  // ── PDF path (reuses import-upload → import-analyze) ─────────────────────────
  async function analyzePdf(file: File) {
    setStage("analyze"); setBusy(true); setProgress("جارٍ رفع الملف…"); setFileError("");
    try {
      const buf = await file.arrayBuffer();
      const up = await api<{ ok: true; importJobId: string }>("/api/import-upload", {
        method: "POST", body: buf,
        headers: { "x-file-name": encodeURIComponent(file.name), "x-file-type": file.type || "application/pdf" }
      });
      const collected: PdfDetectedQuestion[] = [];
      const warnings: string[] = [];
      for (let attempt = 0; attempt < 20 && !cancelRef.current; attempt++) {
        setProgress("جارٍ تحليل الأسئلة… (" + (attempt + 1) + ")");
        const res = await api<{ status: string; questions: PdfDetectedQuestion[]; processedChunks: number; totalChunks: number; warnings: string[]; lastChunkError: string | null }>(
          "/api/import-analyze", { method: "POST", body: JSON.stringify({ importJobId: up.importJobId, provider: "openai" }) });
        for (const q of res.questions || []) if (!collected.some(c => c.importedQuestionId === q.importedQuestionId)) collected.push(q);
        for (const w of res.warnings || []) if (!warnings.includes(w)) warnings.push(w);
        if (res.lastChunkError) { setFileError("تعذر تحليل الملف بواسطة OpenAI حاليًا."); setBusy(false); return; }
        if (res.status === "done") break;
        setProgress("جارٍ التحليل… (" + res.processedChunks + "/" + res.totalChunks + ")");
      }
      setPdfWarnings(warnings);
      if (!collected.length) {
        // No extractable questions — a scanned/image-only PDF is the common cause. Never invent content.
        setFileError("تعذر استخراج نص من هذا الملف. يبدو أن الملف ممسوح ضوئيًا. يحتاج إلى OCR أو مراجعة يدوية.");
        setStage("file"); setBusy(false); return;
      }
      setDetected(collected);
      setStage("pdfReview");
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "تعذر تحليل الملف.");
      setStage("file");
    } finally { setBusy(false); }
  }

  function toggleDetected(id: string) {
    setDetected(prev => (prev || []).map(q => (q.importedQuestionId === id ? { ...q, excluded: !q.excluded } : q)));
  }
  function convertPdf() {
    if (!detected) return;
    const conv = detectedQuestionsToStructuredExam(detected, { fileName });
    if (!conv.exam) { setFileError("لم يتبقَّ أي سؤال بعد الاستبعاد."); return; }
    startWithExam(conv.exam);
  }

  // ── safe repair (zero requests) ──────────────────────────────────────────────
  function runSafeRepair() {
    if (!exam) return;
    const r = repairStructuredExamSafely(exam);
    setExam(r.exam);
    setRepairChanges(r.changes);
    setAfterRepairCount(blockingCount(r.exam));
    setStage("safeRepair");
  }

  // ── AI proposals (one request per unresolved question, bounded concurrency, cancellable) ──
  const aiTargets = useMemo<AiTarget[]>(() => (exam ? collectAiTargets(exam, validateStructuredExam(exam)) : []), [exam]);

  async function requestProposals(targets: AiTarget[]) {
    if (!targets.length) { setStage("review"); return; }
    cancelRef.current = false;
    setAiProgress({ done: 0, total: targets.length }); setBusy(true); setStage("review");
    let done = 0; let idx = 0;
    const worker = async () => {
      while (idx < targets.length && !cancelRef.current) {
        const t = targets[idx++];
        const key = targetKey(t);
        try {
          const res = await api<{ proposal?: { patch: StructuredAiProposal["patch"]; explanation: string }; needsManualReview?: boolean; failed?: boolean; reason?: string }>(
            "/api/structured-exam-ai-fix", { method: "POST", body: JSON.stringify({ question: { id: t.questionId, ...t.node }, issueCodes: t.issueCodes, fingerprint: t.fingerprint, questionId: t.questionId, partId: t.partId }) });
          setProposals(prev => ({ ...prev, [key]: {
            proposalId: key, sectionId: t.sectionId, questionId: t.questionId, partId: t.partId, presentationType: t.presentationType,
            issueCodes: t.issueCodes, fingerprint: t.fingerprint,
            patch: res.proposal?.patch ?? null,
            status: res.proposal ? "proposed" : res.failed ? "failed" : "needsManualReview",
            explanation: res.proposal?.explanation || "", statusReason: res.reason || ""
          } }));
        } catch {
          setProposals(prev => ({ ...prev, [key]: { proposalId: key, sectionId: t.sectionId, questionId: t.questionId, partId: t.partId, presentationType: t.presentationType, issueCodes: t.issueCodes, fingerprint: t.fingerprint, patch: null, status: "failed", explanation: "", statusReason: "تعذّر الاقتراح — أعد المحاولة." } }));
        }
        done++; setAiProgress({ done, total: targets.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(AI_CONCURRENCY, targets.length) }, worker));
    setBusy(false); setAiProgress(null);
  }

  function acceptProposal(key: string) {
    setProposals(prev => {
      const p = prev[key];
      if (!p || !exam) return prev;
      if (!proposalIsFresh(exam, p)) return { ...prev, [key]: { ...p, status: "stale", statusReason: "انتهت صلاحية الاقتراح — تم تعديل السؤال." } };
      const { exam: next, applied } = applyProposal(exam, p);
      if (!applied) return { ...prev, [key]: { ...p, status: "stale", statusReason: "انتهت صلاحية الاقتراح — تم تعديل السؤال." } };
      setExam(next);
      return { ...prev, [key]: { ...p, status: "accepted" } };
    });
  }
  function rejectProposal(key: string) { setProposals(prev => ({ ...prev, [key]: { ...prev[key], status: "rejected" } })); }
  function applySelected(keys: string[]) { keys.forEach(acceptProposal); }

  function cancelAi() { cancelRef.current = true; }

  // Inline section grading-policy control (teacher decision — never AI).
  function setSectionPolicy(sectionId: string, policy: GradingPolicy) {
    setExam(prev => prev ? { ...prev, sections: prev.sections.map(s => s.id === sectionId ? { ...s, gradingPolicy: policy, ...(policy === "all" ? { maxMarks: null } : {}) } : s) } : prev);
  }

  const stageIndex = STAGE_LABELS.findIndex(s => s.key === (stage === "pdfReview" || stage === "analyze" ? "analyze" : stage));

  return (
    <div ref={overlayRef} className="sb-preview-overlay smart-import" role="dialog" aria-modal="true" aria-labelledby={titleId} dir="rtl">
      <header className="sb-preview-head">
        <strong id={titleId}>✨ استيراد امتحان منظّم — استيراد وإصلاح ذكي</strong>
        <button type="button" className="sb-btn" onClick={onClose}>✕ إغلاق</button>
      </header>

      <ol className="si-steps" aria-label="مراحل الاستيراد">
        {STAGE_LABELS.map((s, i) => <li key={s.key} className={"si-step" + (i === stageIndex ? " is-active" : i < stageIndex ? " is-done" : "")} aria-current={i === stageIndex ? "step" : undefined}>{s.label}</li>)}
      </ol>

      <p id={liveId} className="si-live" role="status">{progress || notice}</p>

      <div className="si-body">
        {stage === "file" && (
          <section aria-label="اختيار الملف">
            <div className="sb-import-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }} onClick={() => inputRef.current?.click()}>
              <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={e => void onFile(e.target.files?.[0])} />
              <p className="sb-import-drop-title">اسحب ملف <b>JSON</b> أو <b>HTML</b> أو <b>PDF</b> هنا، أو اضغط للاختيار</p>
              <button type="button" className="sb-btn sb-import-choose" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>اختيار ملف</button>
              <p className="sb-hint">JSON/HTML يُقرأان محليًا دون رفع. PDF يُرفع ويُحلَّل عبر خط الاستيراد المعتمد. الملفات الممسوحة ضوئيًا (بلا نص) تحتاج OCR ولن نخترع لها محتوى.</p>
            </div>
            {fileError && <div className="sb-banner sb-banner-error" role="alert">{fileError}</div>}
          </section>
        )}

        {stage === "analyze" && (
          <section aria-label="تحليل الامتحان" className="si-analyze">
            <p className="sb-hint">⏳ {progress || "جارٍ التحليل…"}</p>
            {fileError && <div className="sb-banner sb-banner-error" role="alert">{fileError}</div>}
          </section>
        )}

        {stage === "pdfReview" && detected && (
          <section aria-label="مراجعة أسئلة PDF">
            <p className="sb-hint">راجِع الأسئلة المكتشفة قبل التحويل. استبعد أي عنصر لم يُكتشف كسؤال فعلي.</p>
            {pdfWarnings.map((w, i) => <div key={i} className="sb-banner sb-banner-warn" role="status">⚠ {w}</div>)}
            <ul className="si-detected">
              {detected.map(q => (
                <li key={q.importedQuestionId} className={"si-detected-row" + (q.excluded ? " is-excluded" : "")}>
                  <label className="si-check"><input type="checkbox" checked={!q.excluded} onChange={() => toggleDetected(q.importedQuestionId)} aria-label={"تضمين السؤال من الصفحة " + q.pageNumbers.join("،")} /> تضمين</label>
                  <div className="si-detected-main">
                    <span className="si-badge">صفحة {q.pageNumbers.join("،") || "—"}</span>
                    <span className="si-badge">{q.presentationType ? QUESTION_TYPE_LABELS[q.presentationType as keyof typeof QUESTION_TYPE_LABELS] || q.presentationType : "غير محدد"}</span>
                    <p className="si-detected-text">{q.text}</p>
                    {q.options?.length > 0 && <p className="sb-hint">خيارات: {q.options.map(o => o.text).join(" · ")}</p>}
                    {q.hasVisibleAnswer && q.answerText && <p className="sb-hint">إجابة ظاهرة في المصدر: {q.answerText}</p>}
                    {q.images?.length ? <p className="sb-hint">🖼 صورة مرتبطة</p> : null}
                  </div>
                </li>
              ))}
            </ul>
            <div className="sb-import-actions">
              <button type="button" className="sb-btn" onClick={() => setStage("file")}>↺ ملف آخر</button>
              <button type="button" className="sb-btn sb-btn-primary" onClick={convertPdf}>تحويل إلى امتحان منظّم</button>
            </div>
            {fileError && <div className="sb-banner sb-banner-error" role="alert">{fileError}</div>}
          </section>
        )}

        {stage === "issues" && exam && (
          <section aria-label="فحص الأخطاء">
            <p className="si-count"><strong>{remainingBlocking}</strong> خطأ في {questionCount} سؤالًا</p>
            <IssueGroups grouped={groupedIssues} />
            <PolicyControls exam={exam} onPolicy={setSectionPolicy} />
            <div className="sb-import-actions">
              <button type="button" className="sb-btn" onClick={onClose}>إلغاء</button>
              <button type="button" className="sb-btn sb-btn-primary" onClick={runSafeRepair}>الإصلاح الآمن التلقائي</button>
            </div>
          </section>
        )}

        {stage === "safeRepair" && exam && (
          <section aria-label="الإصلاح الآمن">
            <p className="si-count"><strong>{importErrorCount}</strong> خطأ ← <strong>{afterRepairCount}</strong> خطأ</p>
            <p className="sb-banner sb-banner-ok" role="status">تم إصلاح {safeFixed} مشكلة بنيوية بأمان (دون تغيير أي إجابة أكاديمية).</p>
            {repairChanges.length > 0 ? (
              <ul className="si-changes">{repairChanges.map((c, i) => <li key={i}>✓ {c.description}</li>)}</ul>
            ) : <p className="sb-hint">لا توجد إصلاحات آلية آمنة ممكنة — الأخطاء المتبقية تحتاج قرارًا أكاديميًا.</p>}
            <div className="sb-import-actions">
              <button type="button" className="sb-btn" onClick={() => setStage("issues")}>← رجوع</button>
              {aiTargets.length > 0
                ? <button type="button" className="sb-btn sb-btn-primary" onClick={() => setStage("ai")}>✨ اقتراح حلول بالذكاء الاصطناعي ({aiTargets.length})</button>
                : <button type="button" className="sb-btn sb-btn-primary" onClick={() => setStage("final")}>المتابعة إلى الفحص النهائي</button>}
            </div>
          </section>
        )}

        {stage === "ai" && exam && (
          <section aria-label="اقتراحات الذكاء الاصطناعي">
            <p className="sb-hint">الذكاء الاصطناعي يقترح فقط — لا يغيّر الامتحان. كل اقتراح يحتاج موافقتك. {aiTargets.length} سؤالًا يحتاج مفتاح إجابة.</p>
            <div className="sb-import-actions">
              <button type="button" className="sb-btn" onClick={() => setStage("safeRepair")}>← رجوع</button>
              <button type="button" className="sb-btn sb-btn-primary" onClick={() => void requestProposals(aiTargets)}>اقتراح للكل</button>
            </div>
          </section>
        )}

        {stage === "review" && exam && (
          <section aria-label="مراجعة المعلم">
            {aiProgress && <p className="sb-hint" role="status">جارٍ توليد الاقتراحات… ({aiProgress.done}/{aiProgress.total}) <button type="button" className="sb-mini-btn" onClick={cancelAi}>إيقاف</button></p>}
            <div className="sb-import-actions">
              <button type="button" className="sb-btn" onClick={() => applySelected(proposalList.filter(p => p.status === "proposed").map(p => p.proposalId))} disabled={busy}>تطبيق كل المقترحة</button>
              <button type="button" className="sb-btn sb-btn-primary" onClick={() => setStage("final")}>المتابعة إلى الفحص النهائي</button>
            </div>
            <ul className="si-proposals">
              {proposalList.map(p => <ProposalCard key={p.proposalId} p={p} exam={exam} onAccept={() => acceptProposal(p.proposalId)} onReject={() => rejectProposal(p.proposalId)} />)}
              {proposalList.length === 0 && <li className="sb-hint">لا توجد اقتراحات بعد — اضغط «اقتراح للكل».</li>}
            </ul>
          </section>
        )}

        {stage === "final" && exam && (
          <section aria-label="الفحص النهائي">
            <dl className="si-summary">
              <div><dt>الأسئلة</dt><dd>{questionCount}</dd></div>
              <div><dt>الأخطاء عند الاستيراد</dt><dd>{importErrorCount}</dd></div>
              <div><dt>أُصلح تلقائيًا بأمان</dt><dd>{safeFixed}</dd></div>
              <div><dt>اقتراحات AI المقبولة</dt><dd>{acceptedCount}</dd></div>
              <div><dt>يحتاج مراجعة يدوية</dt><dd>{needsManualCount}</dd></div>
              <div><dt>الأخطاء المتبقية</dt><dd>{remainingBlocking}</dd></div>
            </dl>
            {remainingBlocking === 0
              ? <p className="sb-banner sb-banner-ok" role="status">✓ الامتحان جاهز — لا توجد أخطاء أساسية متبقية.</p>
              : <div className="sb-banner sb-banner-warn" role="alert">لا يمكن اعتماد الامتحان نهائيًا قبل إصلاح الأخطاء المتبقية ({remainingBlocking}). يمكنك فتحه كمسودة لإكمال إصلاحه في الباني.</div>}
            <div className="sb-import-actions">
              <button type="button" className="sb-btn" onClick={() => setStage("review")}>← رجوع</button>
              <button type="button" className="sb-btn sb-btn-primary" onClick={() => onOpenInBuilder(exam)}>{remainingBlocking === 0 ? "فتح في باني الامتحان" : "فتح كمسودة في الباني"}</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function IssueGroups({ grouped }: { grouped: Record<IssueGroup, StructuredIssue[]> }) {
  const order: IssueGroup[] = ["missingAnswer", "sequenceMismatch", "structural", "marksSection", "manual"];
  return (
    <ul className="si-groups">
      {order.map(g => grouped[g].length > 0 && (
        <li key={g} className="si-group"><span className="si-group-count">{grouped[g].length}</span> {ISSUE_GROUP_LABELS[g]}</li>
      ))}
    </ul>
  );
}

function PolicyControls({ exam, onPolicy }: { exam: StructuredExam; onPolicy: (sectionId: string, p: GradingPolicy) => void }) {
  const needing = (exam.sections || []).filter(s => !s.gradingPolicy || !["all", "capScore", "firstNAnswered"].includes(String(s.gradingPolicy)));
  if (!needing.length) return null;
  return (
    <div className="si-policy" aria-label="يتطلب قرار المعلم">
      <p className="sb-hint">يتطلب قرار المعلم — اختر قاعدة تصحيح لكل قسم:</p>
      {needing.map((s, i) => (
        <label key={s.id} className="si-policy-row">قاعدة التصحيح للقسم «{s.title || "قسم " + (i + 1)}»:
          <select value={String(s.gradingPolicy || "")} onChange={e => onPolicy(s.id, e.target.value as GradingPolicy)}>
            <option value="" disabled>— اختر —</option>
            {(Object.keys(GRADING_POLICY_LABELS) as GradingPolicy[]).map(p => <option key={p} value={p}>{GRADING_POLICY_LABELS[p]}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

function ProposalCard({ p, exam, onAccept, onReject }: { p: StructuredAiProposal; exam: StructuredExam; onAccept: () => void; onReject: () => void }) {
  const node = findBody(exam, p.questionId, p.partId);
  const fresh = p.status === "proposed" && node ? proposalIsFresh(exam, p) : false;
  const suggestion = describePatch(p, node);
  const badge: Record<string, string> = { proposed: "مقترح", accepted: "مقبول", rejected: "مرفوض", needsManualReview: "يحتاج مراجعة يدوية", failed: "تعذّر الاقتراح", stale: "انتهت الصلاحية" };
  return (
    <li className={"si-proposal si-status-" + p.status}>
      <div className="si-proposal-head">
        <strong>{p.partId ? "بند " + p.partId : "سؤال"} — {QUESTION_TYPE_LABELS[p.presentationType as keyof typeof QUESTION_TYPE_LABELS] || p.presentationType}</strong>
        <span className="si-status-badge">{badge[p.status] || p.status}</span>
      </div>
      <p className="sb-hint">{node ? String((node as { text?: string }).text || "") : ""}</p>
      {p.status === "proposed" && p.patch && <p className="si-suggestion"><b>الإجابة المقترحة:</b> {suggestion}{p.explanation ? " — " + p.explanation : ""}</p>}
      {(p.status === "needsManualReview" || p.status === "failed" || p.status === "stale") && <p className="sb-hint">{p.statusReason}</p>}
      {p.status === "proposed" && (
        <div className="si-proposal-actions">
          <button type="button" className="sb-btn sb-btn-primary" onClick={onAccept} disabled={!fresh}>✓ قبول</button>
          <button type="button" className="sb-btn" onClick={onReject}>رفض</button>
        </div>
      )}
      {p.status === "proposed" && !fresh && <p className="sb-hint">انتهت صلاحية الاقتراح — تم تعديل السؤال.</p>}
    </li>
  );
}

// Renders the proposed answer as human text (never a confidence score), from the CURRENT node + patch.
function describePatch(p: StructuredAiProposal, node: (QuestionBody & { presentationType?: string; type?: string }) | null): string {
  if (!p.patch || !node) return "";
  if (p.patch.correctOptionIndex !== undefined) {
    const opt = (node.options || [])[p.patch.correctOptionIndex];
    return "الخيار " + (p.patch.correctOptionIndex + 1) + (opt ? " — " + (opt.text ?? opt.label ?? opt.value ?? "") : "");
  }
  if (p.patch.correct !== undefined) return p.patch.correct ? "صحيح" : "غير صحيح";
  if (p.patch.fieldBooleans) return Object.entries(p.patch.fieldBooleans).map(([, v]) => (v ? "صحيح" : "غير صحيح")).join("، ");
  if (p.patch.fieldValues) return Object.values(p.patch.fieldValues).join("، ");
  return "";
}

