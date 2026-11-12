import { useMemo, useRef, useState } from "react";
import { IconUpload } from "../icons";
import type { StructuredExam } from "../examTypes";
import { GRADING_POLICY_LABELS, type GradingPolicy } from "../examTypes";
import { parseStructuredExamJson, MAX_IMPORT_BYTES } from "../structuredExamImport";
import { validateStructuredExam } from "../examQuality";
import { evaluateExamFinalization } from "../examFinalization";
import { repairStructuredExamSafely, type SafeRepairChange } from "../structuredSafeRepair";
import { groupOfCode, ISSUE_GROUP_LABELS, type IssueGroup } from "../structuredAiProposal";
import { CATEGORY_LABELS, categoryLabel } from "../examLibrary";
import type { ApiResult, LibraryActivityType, LibraryAudience, OwnerLibraryItem, OwnerLibraryTeacher } from "./ownerApi";
import { ownerLibraryApi } from "./ownerApi";
import AudienceEditor from "./OwnerAudienceEditor";

/**
 * Tadris+ P6-E — «استيراد امتحان» in the Owner Console's «بنك الامتحانات» (owner direction: no editor — add a new exam to the bank by
 * importing it; it goes through the preparation stages, is published, then the owner chooses who sees it).
 *
 *   اختيار الملف → فحص الأخطاء → الإصلاح الآمن → الفحص النهائي → النشر → تحديد الجمهور
 *
 * The file is read in the browser only (JSON, the canonical structured-exam format, docs/STRUCTURED_EXAM_IMPORT.md) with the SAME
 * parser, checks and safe repair as the teacher's import wizard. There is no editor: an exam with a remaining blocker cannot be
 * published — the file is fixed and imported again. The only decision asked here is a section's grading rule when the file lacks it
 * (never guessed). «النشر» sends the prepared exam once; the SERVER decides again with the same finalization authority. A published
 * exam is in nobody's bank («لم يُحدَّد بعد») until the audience is chosen — here, or later from its row.
 */

type Send = <T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => Promise<void>;
type Stage = "file" | "check" | "repair" | "final" | "publish" | "audience";
const STAGES: { key: Stage; label: string }[] = [
  { key: "file", label: "اختيار الملف" }, { key: "check", label: "فحص الأخطاء" }, { key: "repair", label: "الإصلاح الآمن" },
  { key: "final", label: "الفحص النهائي" }, { key: "publish", label: "النشر" }, { key: "audience", label: "تحديد الجمهور" }
];
const GROUP_ORDER: IssueGroup[] = ["missingAnswer", "sequenceMismatch", "structural", "marksSection", "manual"];
const MAX_LISTED = 12;
const ACTIVITY_LABELS: Record<LibraryActivityType, string> = { exam: "امتحان", training: "تدريب" };

export default function OwnerLibraryImport({ token, busy, send, teachers, categories, onPublished, onDone, onCancel }: {
  token: string; busy: boolean; send: Send; teachers: OwnerLibraryTeacher[]; categories: string[];
  onPublished: (item: OwnerLibraryItem) => void; onDone: (notice: string) => void; onCancel: () => void;
}) {
  const [stage, setStage] = useState<Stage>("file");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [exam, setExam] = useState<StructuredExam | null>(null);
  const [errorsAtImport, setErrorsAtImport] = useState(0);
  const [changes, setChanges] = useState<SafeRepairChange[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [activityType, setActivityType] = useState<LibraryActivityType>("exam");
  const [description, setDescription] = useState("");
  const [published, setPublished] = useState<OwnerLibraryItem | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const issues = useMemo(() => (exam ? validateStructuredExam(exam) : []), [exam]);
  const errors = issues.filter(i => i.severity === "error");
  const decision = useMemo(() => (exam && (stage === "final" || stage === "publish") ? evaluateExamFinalization(exam) : null), [exam, stage]);
  const questionCount = (exam?.sections || []).reduce((n, s) => n + (s.questions?.length || 0), 0);
  const grouped = GROUP_ORDER.map(g => ({ g, n: errors.filter(i => groupOfCode(i.code) === g).length })).filter(x => x.n > 0);
  const categoryChoices = [...new Set([...Object.keys(CATEGORY_LABELS), ...categories])];
  const stageIndex = STAGES.findIndex(s => s.key === stage);

  async function onFile(file: File | null | undefined) {
    if (!file) return;
    setFileError(""); setWarnings([]);
    if (!/\.json$/i.test(file.name)) { setFileError("اختر ملف JSON (امتحان منظّم)."); return; }
    if (file.size > MAX_IMPORT_BYTES) { setFileError("الملف كبير جدًّا (الحد الأقصى ~10 ميغابايت)."); return; }
    let text = "";
    try { text = await file.text(); } catch { setFileError("تعذّر قراءة الملف."); return; }
    const result = parseStructuredExamJson(text, file.name);
    if (!result.canOpen || !result.exam) { setFileError(result.parseErrors[0]?.message || "تعذّر قراءة الملف."); return; }
    const imported = result.exam;
    setFileName(file.name);
    setWarnings(result.parseWarnings.map(w => w.message));
    setExam(imported);
    setErrorsAtImport(validateStructuredExam(imported).filter(i => i.severity === "error").length);
    setChanges([]);
    setTitle(String(imported.title || "").trim());
    setActivityType(imported.coverPage?.activityType === "training" ? "training" : "exam");
    setStage("check");
  }

  function setSectionPolicy(sectionId: string, policy: GradingPolicy) {
    setExam(prev => prev ? { ...prev, sections: prev.sections.map(s => s.id === sectionId ? { ...s, gradingPolicy: policy, ...(policy === "all" ? { maxMarks: null } : {}) } : s) } : prev);
  }
  function runSafeRepair() {
    if (!exam) return;
    const r = repairStructuredExamSafely(exam);
    setExam(r.exam); setChanges(r.changes); setStage("repair");
  }
  function restart() {
    setStage("file"); setExam(null); setFileName(""); setFileError(""); setWarnings([]); setChanges([]); setPublished(null);
  }
  function publish() {
    if (!exam || !decision?.canFinalize) return;
    void send(() => ownerLibraryApi.importExam(token, { exam, title: title.trim(), category, activityType, description: description.trim(), sourceFileName: fileName }), d => {
      setPublished(d.item);
      onPublished(d.item);
      setStage("audience");
    });
  }

  const needingPolicy = (exam?.sections || []).filter(s => !s.gradingPolicy || !["all", "capScore", "firstNAnswered"].includes(String(s.gradingPolicy)));

  return (
    <section className="eb-owner-cap-group eb-owner-import" aria-labelledby="eb-owner-import-title">
      <div className="eb-owner-panel-head">
        <h3 id="eb-owner-import-title" className="eb-owner-h3">استيراد امتحان إلى البنك</h3>
        {stage !== "audience" && <button type="button" className="eb-owner-secondary eb-owner-small" onClick={onCancel}>إلغاء</button>}
      </div>
      <p className="eb-owner-steps" aria-label="مراحل الاستيراد">
        {STAGES.map((s, i) => <span key={s.key} aria-current={i === stageIndex ? "step" : undefined}>{i + 1}. {s.label}</span>)}
      </p>

      {stage === "file" && (
        <div className="eb-owner-import-file">
          <p className="eb-owner-hint">ملف JSON بصيغة الامتحان المنظّم (القالب: <bdi dir="ltr">structured-exam-template.json</bdi>). يُقرأ الملف هنا في المتصفح، ولا يُرسل شيء قبل «النشر».</p>
          <input ref={input} type="file" accept=".json,application/json" hidden aria-label="ملف الامتحان" onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" className="auth-submit" onClick={() => input.current?.click()}><IconUpload size={16} aria-hidden="true" /> اختيار ملف JSON</button>
          {fileError && <div className="auth-error" role="alert">{fileError}</div>}
        </div>
      )}

      {stage === "check" && exam && (
        <div>
          <p className="eb-owner-hint"><bdi>{fileName}</bdi> · {exam.sections.length} قسم · {questionCount} سؤال</p>
          <p role="status"><strong>{errors.length}</strong> خطأ يمنع النشر</p>
          {grouped.length > 0 && <ul className="eb-owner-import-list">{grouped.map(x => <li key={x.g}>{ISSUE_GROUP_LABELS[x.g]}: {x.n}</li>)}</ul>}
          {warnings.length > 0 && <details><summary>ملاحظات القراءة ({warnings.length})</summary><ul className="eb-owner-import-list">{warnings.slice(0, MAX_LISTED).map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
          {needingPolicy.length > 0 && (
            <fieldset className="eb-owner-cap-group">
              <legend>قاعدة التصحيح لكل قسم (لا تُخمَّن)</legend>
              {needingPolicy.map((s, i) => (
                <label key={s.id} className="auth-field"><span>القسم «{s.title || "قسم " + (i + 1)}»</span>
                  <div className="auth-input"><select value={String(s.gradingPolicy || "")} onChange={e => setSectionPolicy(s.id, e.target.value as GradingPolicy)}>
                    <option value="" disabled>— اختر —</option>
                    {(Object.keys(GRADING_POLICY_LABELS) as GradingPolicy[]).map(p => <option key={p} value={p}>{GRADING_POLICY_LABELS[p]}</option>)}
                  </select></div>
                </label>
              ))}
            </fieldset>
          )}
          <div className="eb-owner-actions">
            <button type="button" className="auth-submit" onClick={runSafeRepair}>الإصلاح الآمن التلقائي</button>
            <button type="button" className="eb-owner-secondary" onClick={restart}>ملف آخر</button>
          </div>
        </div>
      )}

      {stage === "repair" && exam && (
        <div>
          <p role="status"><strong>{errorsAtImport}</strong> خطأ ← <strong>{errors.length}</strong> خطأ</p>
          {changes.length > 0
            ? <ul className="eb-owner-import-list">{changes.slice(0, MAX_LISTED).map((c, i) => <li key={i}>✓ {c.description}</li>)}{changes.length > MAX_LISTED && <li>… و{changes.length - MAX_LISTED} غيرها</li>}</ul>
            : <p className="eb-owner-hint">لا إصلاحات آلية آمنة ممكنة — ما بقي يحتاج قرارًا أكاديميًا في الملف.</p>}
          <p className="eb-owner-hint">الإصلاح الآمن بنيوي فقط: لا يغيّر أي إجابة أو علامة.</p>
          <div className="eb-owner-actions">
            <button type="button" className="auth-submit" onClick={() => setStage("final")}>المتابعة إلى الفحص النهائي</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setStage("check")}>رجوع</button>
          </div>
        </div>
      )}

      {stage === "final" && exam && decision && (
        <div>
          <dl className="eb-owner-import-summary">
            <div><dt>الأسئلة</dt><dd>{questionCount}</dd></div>
            <div><dt>الأخطاء عند الاستيراد</dt><dd>{errorsAtImport}</dd></div>
            <div><dt>أُصلح تلقائيًا</dt><dd>{changes.length}</dd></div>
            <div><dt>ما يمنع النشر</dt><dd>{decision.blockers.length}</dd></div>
          </dl>
          {decision.canFinalize ? (
            <p className="eb-owner-hint eb-owner-done" role="status">✓ الامتحان جاهز للنشر.</p>
          ) : (
            <div className="auth-error" role="alert">
              <span>لا يمكن نشر الامتحان: أصلح ما يلي في الملف ثم استورده من جديد.</span>
              <ul className="eb-owner-import-list">{decision.blockers.slice(0, MAX_LISTED).map(b => <li key={b.id}>{b.message}</li>)}{decision.blockers.length > MAX_LISTED && <li>… و{decision.blockers.length - MAX_LISTED} غيرها</li>}</ul>
            </div>
          )}
          <div className="eb-owner-actions">
            {decision.canFinalize
              ? <button type="button" className="auth-submit" onClick={() => setStage("publish")}>المتابعة إلى النشر</button>
              : <button type="button" className="auth-submit" onClick={restart}>ملف آخر</button>}
            <button type="button" className="eb-owner-secondary" onClick={() => setStage("repair")}>رجوع</button>
          </div>
        </div>
      )}

      {stage === "publish" && exam && (
        <form className="auth-form eb-owner-create" aria-label="نشر الامتحان في البنك" onSubmit={e => { e.preventDefault(); publish(); }}>
          <label className="auth-field"><span>عنوان الامتحان في البنك</span>
            <div className="auth-input"><input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required /></div>
          </label>
          <fieldset className="eb-owner-cap-group">
            <legend>النوع</legend>
            {(Object.keys(ACTIVITY_LABELS) as LibraryActivityType[]).map(t => (
              <label key={t} className="eb-owner-check"><input type="radio" name="eb-import-activity" checked={activityType === t} onChange={() => setActivityType(t)} /> {ACTIVITY_LABELS[t]}</label>
            ))}
          </fieldset>
          <label className="auth-field"><span>التصنيف</span>
            <div className="auth-input"><select value={category} onChange={e => setCategory(e.target.value)} required>
              <option value="" disabled>— اختر —</option>
              {categoryChoices.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select></div>
          </label>
          <label className="auth-field"><span>وصف قصير (اختياري)</span>
            <div className="auth-input"><input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} /></div>
          </label>
          <p className="eb-owner-hint">بعد النشر يكون الامتحان «لم يُحدَّد بعد»: لا يراه أي معلم حتى تختار جمهوره في الخطوة التالية.</p>
          <div className="eb-owner-actions">
            <button type="submit" className="auth-submit" disabled={busy || !title.trim() || !category}>نشر في البنك</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setStage("final")}>رجوع</button>
          </div>
        </form>
      )}

      {stage === "audience" && published && (
        <div>
          <p className="eb-owner-hint eb-owner-done" role="status">✓ نُشر «<bdi>{published.title}</bdi>» في البنك (<bdi dir="ltr">{published.libraryItemId}</bdi>). لا يراه أحد حتى تختار.</p>
          <AudienceEditor item={published} teachers={teachers} busy={busy} onCancel={() => onDone("نُشر «" + published.title + "». جمهوره «لم يُحدَّد بعد»: اختره من «تحديد الجمهور» في صفه.")}
            onSave={(audience: LibraryAudience, chosen: string[]) => send(() => ownerLibraryApi.setAudience(token, published.libraryItemId, audience, chosen), () => onDone("نُشر «" + published.title + "» وحُفظ جمهوره."))} />
        </div>
      )}
    </section>
  );
}
