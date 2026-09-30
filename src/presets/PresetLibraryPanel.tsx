import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Dialog from "../ui/Dialog";
import { useConfirm } from "../ui/useConfirm";
import type { StructuredExam } from "../examTypes";
import { extractAssessmentPresetFromExam, instantiateExamFromPreset, validateAssessmentPreset, PRESET_LABEL, PRESET_TITLE_MAX, PRESET_DESCRIPTION_MAX, type AssessmentPresetV1, type AssessmentPresetRecordV1, type AssessmentPresetSummary, type PresetIssue } from "../assessmentPreset";
import { PresetRequestError, type AssessmentPresetService } from "./assessmentPresetClient";
import { EFFECT_LABEL } from "../assessmentQualityPolicy";
import "./presetLibrary.css";

// Phase 15A — «القوالب الأكاديمية»: the signed-in teacher's personal Assessment Presets. A preset is a reusable assessment
// DESIGN (Blueprint + Quality Policy + section structure + theme) — never questions, answers, stimuli or governance state.
//   • the library lists the caller's presets as factual metadata (server summaries; no quality score, no fake question counts);
//   • preview inspects identity / targets / sections / constraints / policy rules before use;
//   • «حفظ التصميم الحالي كقالب أكاديمي» extracts the design from the CURRENT exam through the allow-list authority, validates it
//     locally, and lets the server validate again — the exam itself is untouched (no history entry, no dirty state);
//   • «تحديث القالب من التصميم الحالي» replaces a preset's design with optimistic concurrency (expectedVersion → 409 shows the
//     conflict and reloads, never auto-retries);
//   • «إنشاء امتحان جديد من هذا القالب» instantiates a NEW draft and hands it to the owner, which runs the 13A unsaved-work
//     protection before replacing the active exam; the panel never merges into the current exam.
type Props = {
  open: boolean;
  onClose: () => void;
  exam: StructuredExam;
  /** The latest COMMITTED exam (13A authority) — the design a preset is extracted from, never a stale render. */
  getLatestExam?: () => StructuredExam;
  service: AssessmentPresetService;
  /** Opens the instantiated exam as a NEW draft (the owner applies the unsaved-work guard); resolves true when it was opened. */
  onCreateExam: (exam: StructuredExam) => Promise<boolean> | boolean;
};
const NO_BLUEPRINT_MESSAGE = "أضف مخطط الامتحان أولًا قبل حفظ قالب أكاديمي.";
const fmt = (iso: string | undefined) => { if (!iso) return ""; const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : iso; };
const POLICY_LABEL: Record<string, string> = { all: "كل الأسئلة", capScore: "حد أعلى للعلامة", firstNAnswered: "أول N إجابات" };
const DIMENSION_LABEL: Record<string, string> = { topic: "موضوع", objective: "هدف", difficulty: "صعوبة", cognitiveLevel: "مستوى معرفي", questionType: "نوع سؤال", capability: "مهارة", section: "قسم" };

export default function PresetLibraryPanel({ open, onClose, exam, getLatestExam, service, onCreateExam }: Props) {
  const [items, setItems] = useState<AssessmentPresetSummary[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issues, setIssues] = useState<PresetIssue[]>([]);
  const [preview, setPreview] = useState<AssessmentPresetRecordV1 | null>(null);
  const [saveDialog, setSaveDialog] = useState<{ mode: "create" } | { mode: "update"; record: AssessmentPresetRecordV1 } | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const alive = useRef(true);
  const loadSeq = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const latest = useCallback(() => (getLatestExam ? getLatestExam() : exam), [getLatestExam, exam]);
  const hasBlueprint = !!latest().blueprint;

  const refresh = useCallback(async (q: string) => {
    const seq = ++loadSeq.current;
    const page = await service.list(q, null);
    if (!alive.current || seq !== loadSeq.current) return;
    setItems(page.items); setCursor(page.nextCursor);
  }, [service]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try { await refresh(query); }
      catch (e) { if (!cancelled) setError(e instanceof PresetRequestError ? e.message : "تعذر تحميل القوالب الأكاديمية."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, refresh, query]);

  async function guard(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setIssues([]);
    try { await run(); }
    catch (e) {
      if (e instanceof PresetRequestError && e.status === 409) {
        setError("تغيّر هذا القالب على الخادم منذ تحميله (إصدار أحدث). أُعيد تحميل القائمة؛ راجع القالب قبل إعادة المحاولة.");
        try { await refresh(query); } catch { /* the conflict message stands */ }
      } else if (e instanceof PresetRequestError && e.status === 400 && e.issues) {
        setError("رفض الخادم القالب: " + e.message); setIssues(e.issues);
      } else setError(e instanceof PresetRequestError ? e.message : "تعذر تنفيذ الإجراء.");          // never an internal runtime message
    } finally { if (alive.current) setBusy(false); }
  }
  // Independent Review Fix 1 — the source design is validated BEFORE anything is copied (extractAssessmentPresetFromExam is
  // fail-closed): a malformed imported / legacy design shows structured issues in «مشكلات التحقق», never a runtime message, and
  // no request is sent. A missing Blueprint stays the distinct factual case.
  const extractCurrent = (title: string, description: string): AssessmentPresetV1 | null => {
    const result = extractAssessmentPresetFromExam(latest(), { title, description });
    if (result.ok) return result.preset;
    if (result.reason === "no-blueprint") setError(NO_BLUEPRINT_MESSAGE);
    else { setError("لا يمكن حفظ تصميم غير صالح كقالب أكاديمي."); setIssues(result.issues); }
    return null;
  };
  const saveCurrent = (title: string, description: string) => {
    const target = saveDialog; setSaveDialog(null);
    void guard(async () => {
      const preset = extractCurrent(title, description);
      if (!preset) return;
      if (target && target.mode === "update") {
        const rec = await service.update(target.record.presetId, target.record.version, { ...preset, presetId: target.record.presetId });
        setNotice("✓ حُدِّث القالب «" + rec.preset.title + "» إلى الإصدار " + rec.version + ". الامتحان الحالي لم يتغيّر.");
      } else {
        const rec = await service.create(preset);
        setNotice("✓ حُفظ التصميم الحالي كقالب أكاديمي «" + rec.preset.title + "». الامتحان الحالي لم يتغيّر.");
      }
      await refresh(query);
    });
  };
  const openPreview = (s: AssessmentPresetSummary) => guard(async () => { const rec = await service.load(s.presetId); if (alive.current) setPreview(rec); });
  const createExam = (s: AssessmentPresetSummary | AssessmentPresetRecordV1) => guard(async () => {
    const rec = "preset" in s ? s : await service.load(s.presetId);
    const local = validateAssessmentPreset(rec.preset);
    if (local.length) { setError("القالب المحفوظ غير صالح ولا يمكن إنشاء امتحان منه."); setIssues(local); return; }
    const newExam = instantiateExamFromPreset(rec.preset);
    const opened = await onCreateExam(newExam);
    if (!alive.current) return;
    if (opened) { setPreview(null); onClose(); }
  });
  const remove = (s: AssessmentPresetSummary) => guard(async () => {
    const ok = await confirm({ title: "حذف القالب الأكاديمي", message: "سيُحذف القالب «" + s.title + "» (الإصدار " + s.version + ") من قوالبك الشخصية.\nالامتحانات التي أُنشئت منه سابقًا لا تتأثر إطلاقًا، ولا تتغيّر أي إصدارات أو حالات نشر.", confirmLabel: "حذف القالب", cancelLabel: "إلغاء", tone: "danger" });
    if (!ok || !alive.current) return;
    await service.remove(s.presetId, s.version);
    setNotice("✓ حُذف القالب «" + s.title + "». الامتحانات المُنشأة منه سابقًا لم تتأثر.");
    await refresh(query);
  });
  const more = () => guard(async () => { if (cursor == null) return; const p = await service.list(query, cursor); setItems(prev => [...prev, ...p.items]); setCursor(p.nextCursor); });
  const filterId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="القوالب الأكاديمية" className="ap-dialog">
      <div className="ap-library">
        <p className="sb-hint">{PRESET_LABEL} = تصميم امتحان قابل لإعادة الاستخدام: المادة والمقرر والمستوى، المواضيع والأهداف، مفردات المستويات المعرفية والصعوبة، القيود والأهداف العددية، سياسة الجودة، وبنية الأقسام. لا يحوي أسئلة ولا إجابات ولا نصوصًا مرجعية، ولا يحمل أي حالة نشر.</p>
        {error && <div className="sb-banner sb-banner-error" role="alert">{error}</div>}
        {issues.length > 0 && <ul className="ap-issues" aria-label="مشكلات التحقق">{issues.map((i, k) => <li key={k}>{i.message}{i.path ? <code> {i.path}</code> : null}</li>)}</ul>}
        {notice && !error && <div className="sb-banner sb-banner-ok" role="status">{notice}</div>}
        <div className="ap-toolbar">
          <button type="button" className="sb-btn sb-btn-primary" onClick={() => { if (!hasBlueprint) { setError(NO_BLUEPRINT_MESSAGE); return; } setError(""); setSaveDialog({ mode: "create" }); }} disabled={busy} aria-describedby={hasBlueprint ? undefined : filterId + "-nobp"}>حفظ التصميم الحالي كقالب أكاديمي</button>
          {!hasBlueprint && <span className="sb-hint" id={filterId + "-nobp"} role="note">{NO_BLUEPRINT_MESSAGE}</span>}
          <label className="sb-field ap-filter" htmlFor={filterId}><span>تصفية (العنوان / المادة / المقرر)</span><input id={filterId} className="sb-input" type="search" value={query} onChange={e => { setLoading(true); setQuery(e.target.value); }} placeholder="ابحث في قوالبك…" /></label>
        </div>
        <div role="status" aria-live="polite" className="sb-hint ap-live">{busy ? "جارٍ التنفيذ…" : ""}</div>
        {loading ? <p className="sb-hint" role="status">جارٍ تحميل القوالب الأكاديمية…</p> : items.length === 0 ? (
          <p className="ap-empty" data-testid="ap-empty">{query ? "لا قوالب تطابق التصفية." : "لا قوالب أكاديمية بعد. احفظ تصميم امتحان يحوي مخططًا ليصبح قالبًا قابلًا لإعادة الاستخدام."}</p>
        ) : (
          <ul className="ap-cards" aria-label="القوالب الأكاديمية">
            {items.map(s => (
              <li key={s.presetId} className="ap-card" data-testid="ap-card" data-preset-id={s.presetId}>
                <div className="ap-card-head">
                  <h3 className="ap-card-title">{s.title}</h3>
                  <span className="ap-version" aria-label={"إصدار القالب " + s.version}>v{s.version}</span>
                </div>
                {s.description && <p className="ap-card-desc">{s.description}</p>}
                <dl className="ap-facts">
                  <div><dt>المادة</dt><dd>{s.subject || "—"}</dd></div>
                  {s.course && <div><dt>المقرر</dt><dd>{s.course}</dd></div>}
                  {s.level && <div><dt>المستوى</dt><dd>{s.level}</dd></div>}
                  <div><dt>الأقسام</dt><dd>{s.sectionCount}</dd></div>
                  <div><dt>المواضيع</dt><dd>{s.topicCount}</dd></div>
                  <div><dt>الأهداف</dt><dd>{s.objectiveCount}</dd></div>
                  <div><dt>القيود</dt><dd>{s.constraintCount}</dd></div>
                  <div><dt>قواعد الجودة</dt><dd>{s.qualityRuleCount}</dd></div>
                  <div><dt>آخر تحديث</dt><dd>{fmt(s.updatedAt)}</dd></div>
                </dl>
                <div className="ap-actions" role="group" aria-label={"إجراءات القالب " + s.title}>
                  <button type="button" className="sb-btn sb-btn-primary" onClick={() => void createExam(s)} disabled={busy}>إنشاء امتحان جديد من هذا القالب</button>
                  <button type="button" className="sb-btn" onClick={() => void openPreview(s)} disabled={busy}>معاينة</button>
                  <button type="button" className="sb-btn" onClick={() => void guard(async () => { if (!hasBlueprint) { setError(NO_BLUEPRINT_MESSAGE); return; } const rec = await service.load(s.presetId); if (alive.current) setSaveDialog({ mode: "update", record: rec }); })} disabled={busy}>تحديث القالب من التصميم الحالي</button>
                  <button type="button" className="sb-btn sb-btn-danger" onClick={() => void remove(s)} disabled={busy}>حذف</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {cursor != null && <button type="button" className="sb-btn sb-btn-sm" onClick={() => void more()} disabled={busy}>قوالب أقدم</button>}
      </div>
      {preview && <PresetPreview record={preview} busy={busy} onClose={() => setPreview(null)} onCreate={() => void createExam(preview)} />}
      {saveDialog && <SaveDesignDialog mode={saveDialog.mode} initialTitle={saveDialog.mode === "update" ? saveDialog.record.preset.title : latest().title} initialDescription={saveDialog.mode === "update" ? saveDialog.record.preset.description ?? "" : ""} targetVersion={saveDialog.mode === "update" ? saveDialog.record.version : undefined} busy={busy} onCancel={() => setSaveDialog(null)} onConfirm={saveCurrent} />}
      {confirmDialog}
    </Dialog>
  );
}

function SaveDesignDialog({ mode, initialTitle, initialDescription, targetVersion, busy, onCancel, onConfirm }: { mode: "create" | "update"; initialTitle: string; initialDescription: string; targetVersion?: number; busy: boolean; onCancel: () => void; onConfirm: (title: string, description: string) => void }) {
  const [title, setTitle] = useState(initialTitle.slice(0, PRESET_TITLE_MAX));
  const [description, setDescription] = useState(initialDescription);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ref = useRef<HTMLInputElement>(null);
  const valid = title.trim().length > 0 && title.trim().length <= PRESET_TITLE_MAX && description.length <= PRESET_DESCRIPTION_MAX;
  const submit = () => { if (!busy && valid) onConfirm(title.trim(), description.trim()); };
  return (
    <Dialog open onClose={onCancel} size="md" title={mode === "update" ? "تحديث القالب من التصميم الحالي" : "حفظ التصميم الحالي كقالب أكاديمي"} initialFocusRef={ref}
      footer={<><button type="button" className="sb-btn" onClick={onCancel} disabled={busy}>إلغاء</button><button type="button" className="sb-btn sb-btn-primary" onClick={submit} disabled={busy || !valid} data-testid="ap-save-confirm">{mode === "update" ? "تحديث القالب (الإصدار " + targetVersion + " → " + ((targetVersion ?? 0) + 1) + ")" : "حفظ القالب"}</button></>}>
      <form className="ap-form" onSubmit={e => { e.preventDefault(); submit(); }}>
        <p className="sb-hint">{mode === "update" ? "يستبدل هذا الإجراء تصميم القالب المحفوظ بتصميم الامتحان الحالي (المخطط، سياسة الجودة، بنية الأقسام، المظهر). لا يغيّر الامتحان الحالي ولا الامتحانات المُنشأة سابقًا من القالب." : "يُستخرج من الامتحان الحالي المخطط وسياسة الجودة وبنية الأقسام والمظهر فقط — بلا أسئلة أو إجابات. الامتحان الحالي لا يتغيّر."}</p>
        <label className="sb-field" htmlFor={"ap-title-" + id}><span>عنوان القالب (مطلوب)</span><input id={"ap-title-" + id} ref={ref} className="sb-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={PRESET_TITLE_MAX} aria-required disabled={busy} /></label>
        <label className="sb-field" htmlFor={"ap-desc-" + id}><span>وصف (اختياري)</span><textarea id={"ap-desc-" + id} className="sb-input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={PRESET_DESCRIPTION_MAX} disabled={busy} /></label>
      </form>
    </Dialog>
  );
}

function PresetPreview({ record, busy, onClose, onCreate }: { record: AssessmentPresetRecordV1; busy: boolean; onClose: () => void; onCreate: () => void }) {
  const p = record.preset; const bp = p.blueprint;
  const sectionTitle = useMemo(() => new Map(p.sections.map(s => [s.presetSectionId, s.title])), [p.sections]);
  const refLabel = (dimension: string, ref: string) => dimension === "topic" ? bp.topics.find(t => t.id === ref)?.label ?? ref : dimension === "objective" ? bp.objectives.find(o => o.id === ref)?.label ?? ref : dimension === "section" ? sectionTitle.get(ref) ?? ref : dimension === "cognitiveLevel" ? bp.cognitiveLevels?.find(l => l.id === ref)?.label ?? ref : ref;
  const constraintLabel = (id: string) => { const c = bp.constraints.find(x => x.id === id); return c ? DIMENSION_LABEL[c.dimension] + ": " + refLabel(c.dimension, c.ref) : id; };
  return (
    <Dialog open onClose={onClose} size="lg" title={"معاينة القالب — " + p.title} className="ap-preview" readOnly
      footer={<button type="button" className="sb-btn sb-btn-primary" onClick={onCreate} disabled={busy}>إنشاء امتحان جديد من هذا القالب</button>}>
      <div className="ap-preview-body" data-testid="ap-preview">
        <p className="sb-hint">الإصدار {record.version} · آخر تحديث {fmt(record.updatedAt)}{p.description ? " · " + p.description : ""}</p>
        <section aria-labelledby={"ap-id-" + record.presetId}><h3 id={"ap-id-" + record.presetId} className="sb-bp-h">الهوية الأكاديمية</h3>
          <dl className="ap-facts"><div><dt>المادة</dt><dd>{bp.subject.label}</dd></div>{bp.curriculum && <div><dt>المنهاج</dt><dd>{bp.curriculum.label}</dd></div>}{bp.course && <div><dt>المقرر</dt><dd>{bp.course.label}</dd></div>}{bp.level && <div><dt>المستوى</dt><dd>{bp.level.label}</dd></div>}{p.presentationTheme && <div><dt>المظهر</dt><dd>{p.presentationTheme}</dd></div>}</dl></section>
        <section aria-labelledby={"ap-tg-" + record.presetId}><h3 id={"ap-tg-" + record.presetId} className="sb-bp-h">الأهداف</h3>
          <dl className="ap-facts"><div><dt>الأسئلة المستهدفة</dt><dd>{bp.targets?.totalQuestions ?? "—"}</dd></div><div><dt>العلامات المستهدفة</dt><dd>{bp.targets?.totalMarks ?? "—"}</dd></div><div><dt>المواضيع</dt><dd>{bp.topics.length}</dd></div><div><dt>الأهداف التعليمية</dt><dd>{bp.objectives.length}</dd></div></dl>
          {bp.objectives.length > 0 && <ul className="ap-list">{bp.objectives.map(o => <li key={o.id}>{o.label}</li>)}</ul>}</section>
        <section aria-labelledby={"ap-sec-" + record.presetId}><h3 id={"ap-sec-" + record.presetId} className="sb-bp-h">الأقسام</h3>
          <ul className="ap-list">{p.sections.map(s => <li key={s.presetSectionId}><strong>{s.title || "قسم"}</strong> · {POLICY_LABEL[s.gradingPolicy] ?? s.gradingPolicy}{s.maxMarks != null ? " · حد أعلى " + s.maxMarks : ""}{s.requiredAnswers != null ? " · " + s.requiredAnswers + " إجابات مطلوبة" : ""}{s.answerUnit === "part" ? " · بالجزء" : ""}</li>)}</ul></section>
        <section aria-labelledby={"ap-c-" + record.presetId}><h3 id={"ap-c-" + record.presetId} className="sb-bp-h">القيود</h3>
          {bp.constraints.length === 0 ? <p className="sb-hint">لا قيود.</p> : <ul className="ap-list">{bp.constraints.map(c => <li key={c.id}>{DIMENSION_LABEL[c.dimension] ?? c.dimension}: <strong>{refLabel(c.dimension, c.ref)}</strong> · {c.metric === "count" ? "عدد" : "علامات"}{c.unit === "percent" ? " %" : ""}{c.min !== undefined ? " · الأدنى " + c.min : ""}{c.target !== undefined ? " · الهدف " + c.target : ""}{c.max !== undefined ? " · الأعلى " + c.max : ""}</li>)}</ul>}</section>
        <section aria-labelledby={"ap-q-" + record.presetId}><h3 id={"ap-q-" + record.presetId} className="sb-bp-h">سياسات الجودة</h3>
          {!bp.qualityPolicy || bp.qualityPolicy.rules.length === 0 ? <p className="sb-hint">لا سياسة جودة.</p> : <ul className="ap-list">{bp.qualityPolicy.rules.map(r => <li key={r.id}>{r.enabled ? "مفعّلة" : "معطّلة"} · {EFFECT_LABEL[r.effect]} · {r.source.kind === "constraint" ? constraintLabel(r.source.constraintId) : r.source.kind}{r.note ? " · " + r.note : ""}</li>)}</ul>}
          {bp.qualityPolicy && <p className="sb-hint">السياسة {bp.qualityPolicy.enabled ? "مفعّلة" : "معطّلة"} على مستوى القالب.</p>}</section>
      </div>
    </Dialog>
  );
}
