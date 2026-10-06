import { useEffect, useId, useMemo, useReducer, useRef, useState, type KeyboardEvent } from "react";
import Dialog from "../ui/Dialog";
import type { StructuredExam } from "../examTypes";
import { runGeneration, runModify, STAGE_LABELS, type ComposerTransport, type GenerationResult, type ModifyResult, type StageReporter } from "./composerRun";
import { composerReducer, initialComposer, isComposerBusy, type ComposerFailure, type ComposerFailureKind } from "./composerState";
import { COMPOSER_CAPABILITY_FLAGS, COMPOSER_DIFFICULTIES, COMPOSER_LANGUAGES, type ComposerCapabilityFlag } from "./composerIntent";
import { buildComposerCatalog, COMPOSER_ITEM_KINDS, COMPOSER_PRESETS, type ComposerItemKind } from "./composerCatalog";
import { applyComposerPatch, patchGroups, type ComposerMode, type DiffEntry } from "./composerPatch";
import type { ComposerScope } from "./composerProjection";
import { allQuestions, composerVerdict, verifyAiQuestion, withComposerHistory, type ComposerVerdict } from "./composerExam";
import { examRevision } from "./composerRevision";
import { COMPOSER_LIMITS, type ComposerIssue } from "./composerLimits";
import { PRESENTATION_PRESETS } from "../presentation/presentationModel";
import "./ai-composer.css";

// Phase 20F — «المؤلف الذكي للامتحان» (lazy edge of the Structured Exam Builder). The teacher fills STRUCTURED controls (they win over the
// free text), the staged pipeline (composerRun) talks to /api/ai-exam-composer through the App-owned transport, and the result is a
// STAGED draft or patch the teacher reviews here: a code-computed summary, coverage, issues, and a before → after diff. Nothing reaches the
// builder before an explicit apply; every apply re-checks the revision of the LATEST exam (stale ⇒ nothing applied) and lands as ONE
// builder update (one undo step). Cancel aborts the request; late responses of an older run are ignored by the state machine.

export type ComposerApplyOutcome = "ok" | "stale";
type Props = {
  open: boolean;
  onClose: () => void;
  transport: ComposerTransport;
  exam: StructuredExam;
  getLatestExam: () => StructuredExam;
  onApply: (updater: (prev: StructuredExam) => StructuredExam) => ComposerApplyOutcome;
  onPreview: (exam: StructuredExam) => void;
  onUndo?: () => void;
  selectedQuestionId?: string | null;
  disabled?: boolean;
};

type Tab = "generate" | "modifyExam" | "generateSection" | "question" | "presentation";
const TABS: { id: Tab; label: string }[] = [
  { id: "generate", label: "امتحان جديد" },
  { id: "modifyExam", label: "تعديل الامتحان" },
  { id: "generateSection", label: "قسم جديد" },
  { id: "question", label: "السؤال المحدد" },
  { id: "presentation", label: "التصميم" }
];
type Staged = { result: GenerationResult; verdict: ComposerVerdict; expectedExamId: string; revisionAtStart: string; summaryText: string };
type ReadyResult = { kind: "generate" } | { kind: "modify"; mod: ModifyResult; instruction: string; target: "builder" | "staged" };

const LANGUAGE_LABELS: Record<(typeof COMPOSER_LANGUAGES)[number], string> = { ar: "العربية", en: "الإنجليزية", he: "العبرية" };
const DIFFICULTY_LABELS: Record<(typeof COMPOSER_DIFFICULTIES)[number], string> = { easy: "سهل", medium: "متوسط", hard: "صعب", mixed: "متنوع" };
const PLAN_DIFFICULTY_LABELS: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };
const CAPABILITY_LABELS: Record<ComposerCapabilityFlag, string> = {
  composite: "أسئلة مركّبة", smartSim: "محاكاة SmartSim", coding: "أسئلة برمجة", parametric: "معطيات متغيرة لكل طالب", openResponse: "إجابة مفتوحة",
  richContent: "محتوى منسق", tables: "جداول", visual: "عناصر بصرية", rubrics: "سلالم تقييم"
};
const FAILURE_TITLES: Record<ComposerFailureKind, string> = {
  provider: "خدمة الذكاء الاصطناعي غير متاحة حاليًا.",
  invalidResponse: "ردّ الذكاء الاصطناعي غير صالح ولم يُعتمد.",
  unsupported: "الطلب يتضمن ميزة غير مدعومة.",
  validation: "لم يجتز اقتراح الذكاء الاصطناعي الفحوص.",
  stale: "تم تعديل الامتحان أثناء عمل الذكاء الاصطناعي.",
  cancelled: "أُلغي الطلب؛ لم يتغيّر الامتحان.",
  rateLimited: "طلبات كثيرة خلال وقت قصير.",
  timeout: "انتهت مهلة الذكاء الاصطناعي.",
  request: "الطلب غير مكتمل أو غير صالح."
};
const GENERATE_STAGES = [STAGE_LABELS.intent, STAGE_LABELS.plan, STAGE_LABELS.sections, STAGE_LABELS.validate, STAGE_LABELS.ready];
const MODIFY_STAGES = [STAGE_LABELS.modify, STAGE_LABELS.validate, STAGE_LABELS.ready];
const DIFF_LIMIT = 200;
const ISSUE_LIMIT = 60;

type GenForm = {
  subject: string; course: string; grade: string; language: (typeof COMPOSER_LANGUAGES)[number]; totalMarks: string; durationMinutes: string;
  difficulty: (typeof COMPOSER_DIFFICULTIES)[number]; sectionTarget: string; questionTarget: string; preset: string;
  types: Record<ComposerItemKind, boolean>; capabilities: Record<ComposerCapabilityFlag, boolean>; requiredTopics: string; excludedTopics: string; instruction: string;
};
const initialForm = (): GenForm => ({
  subject: "", course: "", grade: "", language: "ar", totalMarks: "", durationMinutes: "", difficulty: "mixed", sectionTarget: "", questionTarget: "", preset: "auto",
  types: Object.fromEntries(COMPOSER_ITEM_KINDS.map(k => [k, true])) as Record<ComposerItemKind, boolean>,
  capabilities: Object.fromEntries(COMPOSER_CAPABILITY_FLAGS.map(f => [f, f !== "visual"])) as Record<ComposerCapabilityFlag, boolean>,
  requiredTopics: "", excludedTopics: "", instruction: ""
});
const topicsOf = (s: string) => [...new Set(s.split(/[,،]/).map(t => t.trim()).filter(Boolean))];
const intNum = (s: string) => (s.trim() === "" ? null : Number(s));

/** The intent input exactly as normalizeComposerIntent expects it (empty optional controls are omitted; the code normalizes the rest). */
function intentInputOf(f: GenForm): Record<string, unknown> {
  const types = COMPOSER_ITEM_KINDS.filter(k => f.types[k]);
  const out: Record<string, unknown> = { v: 1, subject: f.subject.trim(), language: f.language, totalMarks: intNum(f.totalMarks), difficulty: f.difficulty, capabilities: { ...f.capabilities }, presentationPreset: f.preset };
  if (f.course.trim()) out.course = f.course.trim();
  if (f.grade.trim()) out.grade = f.grade.trim();
  if (f.durationMinutes.trim()) out.durationMinutes = intNum(f.durationMinutes);
  if (f.sectionTarget.trim()) out.sectionTarget = intNum(f.sectionTarget);
  if (f.questionTarget.trim()) out.questionTarget = intNum(f.questionTarget);
  if (types.length !== COMPOSER_ITEM_KINDS.length) out.allowedQuestionTypes = types;
  const req = topicsOf(f.requiredTopics), exc = topicsOf(f.excludedTopics);
  if (req.length) out.requiredTopics = req;
  if (exc.length) out.excludedTopics = exc;
  if (f.instruction.trim()) out.teacherInstruction = f.instruction.trim();
  return out;
}

/** Verdict of a STAGED generated exam after an AI modification (the plan no longer describes it; the intent still does). */
function stagedVerdict(exam: StructuredExam, result: GenerationResult): ComposerVerdict {
  const v = composerVerdict(exam, { intent: result.intent });
  const extra = allQuestions(exam).flatMap(verifyAiQuestion);
  return extra.length ? { ...v, ok: false, blocking: [...v.blocking, ...extra], summary: { ...v.summary, blocking: v.blocking.length + extra.length } } : v;
}

function IssueList({ issues, label }: { issues: { message: string }[]; label: string }) {
  if (!issues.length) return null;
  return (
    <ul className="ai-composer-issues" aria-label={label}>
      {issues.slice(0, ISSUE_LIMIT).map((i, n) => <li key={n}>{i.message}</li>)}
      {issues.length > ISSUE_LIMIT && <li>… و{issues.length - ISSUE_LIMIT} أخرى</li>}
    </ul>
  );
}

export default function AiExamComposerDialog({ open, onClose, transport, exam, getLatestExam, onApply, onPreview, onUndo, selectedQuestionId, disabled }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [m, dispatch] = useReducer(composerReducer<ReadyResult>, undefined, () => initialComposer<ReadyResult>());
  const [tab, setTab] = useState<Tab>("generate");
  const [form, setForm] = useState<GenForm>(initialForm);
  const [instruction, setInstruction] = useState("");
  const [sectionScope, setSectionScope] = useState("");
  const [questionId, setQuestionId] = useState(selectedQuestionId ?? "");
  const [questionAction, setQuestionAction] = useState<"replaceQuestion" | "improveContent">("improveContent");
  const [staged, setStaged] = useState<Staged | null>(null);
  const [modifyTarget, setModifyTarget] = useState<"builder" | "staged">("builder");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [unselectedGroups, setUnselectedGroups] = useState<ReadonlySet<number>>(() => new Set());
  const [applyIssues, setApplyIssues] = useState<ComposerIssue[]>([]);
  const [lastAction, setLastAction] = useState<"generate" | "modify">("generate");
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const resultHeadRef = useRef<HTMLHeadingElement | null>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ generate: null, modifyExam: null, generateSection: null, question: null, presentation: null });

  const catalog = useMemo(() => { try { return buildComposerCatalog(); } catch { return null; } }, []);
  const kindLabel = (k: string) => catalog?.questionTypes.find(t => t.key === k || t.kind === k)?.label ?? k;
  const presetLabel = (p: string | null) => (p && (PRESENTATION_PRESETS as Record<string, { label: string }>)[p]?.label) || p || "الافتراضي";

  // The exam the modify modes target: the builder's, or the staged generated draft when the teacher refines it before opening it.
  const targetExam = modifyTarget === "staged" && staged ? staged.result.exam : exam;
  const sectionOptions = useMemo(() => (targetExam.sections || []).map(s => ({ id: s.id, title: s.title || "قسم بلا عنوان" })), [targetExam]);
  const questionOptions = useMemo(() => {
    let n = 0;
    return (targetExam.sections || []).flatMap(s => (s.questions || []).map(q => {
      n++;
      const text = String(q.text ?? "").replace(/\s+/g, " ").trim();
      return { id: q.examQuestionId, label: (q.displayNumber || String(n)) + ". " + (text.length > 60 ? text.slice(0, 60) + "…" : text || "سؤال بلا نص") };
    }));
  }, [targetExam]);
  const effectiveQuestionId = questionOptions.some(q => q.id === questionId) ? questionId : questionOptions[0]?.id ?? "";
  const effectiveSection = sectionOptions.some(s => s.id === sectionScope) ? sectionScope : "";

  const busy = isComposerBusy(m);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  useEffect(() => {
    if (m.name === "ready" || m.name === "applied" || m.name === "failed" || m.name === "stale" || m.name === "cancelled") resultHeadRef.current?.focus();
  }, [m.name, m.run]);

  const reporter = (run: number): StageReporter => (name, stage, detail) => dispatch({ type: "STAGE", run, name, stage, detail });
  const begin = () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const run = ++runRef.current;
    setApplyIssues([]); setConfirmReplace(false); setShowPlan(false); setUnselectedGroups(new Set());
    dispatch({ type: "START", run });
    return { run, ctrl };
  };
  const showStaged = () => {
    const run = ++runRef.current;
    dispatch({ type: "START", run });
    dispatch({ type: "READY", run, result: { kind: "generate" } });
  };

  const generate = async () => {
    if (busy || disabled) return;
    const latest = getLatestExam();
    const revisionAtStart = examRevision(latest);
    const expectedExamId = latest.examId;
    const intentInput = intentInputOf(form);
    const summaryText = (form.instruction.trim() || form.subject.trim()).slice(0, COMPOSER_LIMITS.historySummaryChars);
    setLastAction("generate");
    const { run, ctrl } = begin();
    const r = await runGeneration(transport, intentInput, { examId: expectedExamId, signal: ctrl.signal, report: reporter(run) });
    if (run !== runRef.current) return;                                  // a newer run / cancel owns the dialog now
    if (!r.ok) { dispatch({ type: "FAIL", run, failure: r.failure }); return; }
    setStaged({ result: r.result, verdict: r.result.verdict, expectedExamId, revisionAtStart, summaryText });
    setModifyTarget("builder");
    dispatch({ type: "READY", run, result: { kind: "generate" } });
  };

  const modifyRequest = (): { mode: ComposerMode; scope: ComposerScope } | null => {
    if (tab === "modifyExam") return { mode: "modifyExam", scope: effectiveSection ? { kind: "section", sectionId: effectiveSection } : { kind: "exam" } };
    if (tab === "generateSection") return { mode: "generateSection", scope: { kind: "exam" } };
    if (tab === "question") return effectiveQuestionId ? { mode: questionAction, scope: { kind: "question", questionId: effectiveQuestionId } } : null;
    if (tab === "presentation") return { mode: "presentation", scope: { kind: "presentation" } };
    return null;
  };
  const modify = async () => {
    const req = modifyRequest();
    const text = instruction.trim();
    if (!req || !text || busy || disabled) return;
    const target: "builder" | "staged" = modifyTarget === "staged" && staged ? "staged" : "builder";
    const base = target === "staged" && staged ? staged.result.exam : getLatestExam();
    setLastAction("modify");
    const { run, ctrl } = begin();
    const r = await runModify(transport, { exam: base, mode: req.mode, scope: req.scope, instruction: text, signal: ctrl.signal, report: reporter(run) });
    if (run !== runRef.current) return;
    if (!r.ok) { dispatch({ type: "FAIL", run, failure: r.failure }); return; }
    dispatch({ type: "READY", run, result: { kind: "modify", mod: r.result, instruction: text, target } });
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    runRef.current++;                                                     // the aborted run can never land
    dispatch({ type: "CANCEL" });
  };
  const close = () => { if (busy) cancel(); onClose(); };
  const discardAll = () => { setStaged(null); setModifyTarget("builder"); setConfirmReplace(false); setApplyIssues([]); dispatch({ type: "RESET" }); };

  // ── apply: generated exam → builder ─────────────────────────────────────────────────────────────────────────────────────────────
  const applyGenerated = () => {
    if (!staged || m.name !== "ready" || !staged.verdict.ok || disabled) return;
    const latest = getLatestExam();
    if (latest.examId !== staged.expectedExamId || examRevision(latest) !== staged.revisionAtStart) { setConfirmReplace(false); dispatch({ type: "STALE" }); return; }
    if (!confirmReplace && allQuestions(latest).length > 0) { setConfirmReplace(true); return; }
    setConfirmReplace(false);
    const s = staged;
    const entry = { at: new Date().toISOString(), mode: "generate", summary: s.summaryText, baseRevision: s.revisionAtStart, status: "applied" as const, operations: 0, warnings: s.verdict.warnings.length };
    dispatch({ type: "APPLY" });
    const outcome = onApply(prev => {
      if (prev.examId !== s.expectedExamId || examRevision(prev) !== s.revisionAtStart) return prev;
      const keep: Partial<StructuredExam> = {};
      if (prev.createdAt !== undefined) keep.createdAt = prev.createdAt;
      if (prev.updatedAt !== undefined) keep.updatedAt = prev.updatedAt;
      return withComposerHistory({ ...s.result.exam, examId: prev.examId, ...keep }, entry);
    });
    if (outcome !== "ok") { dispatch({ type: "STALE" }); return; }
    setStaged(null); setModifyTarget("builder");
    dispatch({ type: "APPLIED" });
  };

  // ── apply: a patch → builder exam, or → the staged generated draft ────────────────────────────────────────────────────────────────
  const readyModify = m.name === "ready" && m.result?.kind === "modify" ? m.result : null;
  const groups = useMemo(() => (readyModify ? patchGroups(readyModify.mod.patch) : []), [readyModify]);
  const selectedOps = (all: boolean): number[] => (all ? groups.flat() : groups.filter((_, g) => !unselectedGroups.has(g)).flat()).sort((a, b) => a - b);
  const applyPatch = (all: boolean) => {
    if (!readyModify || disabled) return;
    const selected = selectedOps(all);
    if (!selected.length) return;
    const { mod, instruction: request, target } = readyModify;
    const now = new Date().toISOString();
    setApplyIssues([]);
    if (target === "staged") {
      if (!staged) return;
      const r = applyComposerPatch(staged.result.exam, mod.patch, { selected, now, request });
      if (!r.ok) { if (r.code === "STALE_REVISION") dispatch({ type: "STALE" }); else setApplyIssues(r.issues); return; }
      setStaged({ ...staged, result: { ...staged.result, exam: r.exam }, verdict: stagedVerdict(r.exam, staged.result) });
      showStaged();
      return;
    }
    const latest = getLatestExam();
    if (examRevision(latest) !== mod.patch.baseRevision) { dispatch({ type: "STALE" }); return; }
    const dry = applyComposerPatch(latest, mod.patch, { selected, now, request });
    if (!dry.ok) { if (dry.code === "STALE_REVISION") dispatch({ type: "STALE" }); else setApplyIssues(dry.issues); return; }
    dispatch({ type: "APPLY" });
    const outcome = onApply(prev => { const r = applyComposerPatch(prev, mod.patch, { selected, now, request }); return r.ok ? r.exam : prev; });
    if (outcome !== "ok") { dispatch({ type: "STALE" }); return; }
    dispatch({ type: "APPLIED" });
  };
  const cancelPatch = () => { setApplyIssues([]); if (readyModify?.target === "staged" && staged) showStaged(); else dispatch({ type: "RESET" }); };
  const refineStaged = () => { setModifyTarget("staged"); setTab("modifyExam"); setInstruction(""); setSectionScope(""); dispatch({ type: "RESET" }); };

  // ── tabs (roving focus, arrow keys) ────────────────────────────────────────────────────────────────────────────────────────────────
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex(t => t.id === tab);
    let next = -1;
    if (e.key === "ArrowLeft") next = (i + 1) % TABS.length;                // RTL: left moves forward
    else if (e.key === "ArrowRight") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };
  const set = <K extends keyof GenForm>(k: K, v: GenForm[K]) => setForm(f => ({ ...f, [k]: v }));
  const totalOk = /^\d+$/.test(form.totalMarks.trim()) && Number(form.totalMarks) >= 1;
  const anyType = COMPOSER_ITEM_KINDS.some(k => form.types[k]);
  const canGenerate = !busy && !disabled && form.subject.trim() !== "" && totalOk && anyType;
  const canModify = !busy && !disabled && instruction.trim() !== "" && !!modifyRequest();
  const lockForm = busy || !!disabled;

  // ── views ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const stagesFor = lastAction === "generate" ? GENERATE_STAGES : MODIFY_STAGES;
  const progress = (
    <div className="ai-composer-progress">
      <ol className="ai-composer-stages" aria-label="مراحل العمل">
        {stagesFor.map(label => {
          const current = m.stage === label;
          return <li key={label} className={current ? "is-current" : undefined} aria-current={current ? "step" : undefined}>{label}</li>;
        })}
        {m.stage === STAGE_LABELS.repair && <li className="is-current" aria-current="step">{STAGE_LABELS.repair}</li>}
      </ol>
      <p role="status" aria-live="polite" className="ai-composer-status">{m.stage || STAGE_LABELS.intent}</p>
      {m.detail && <p className="sb-hint ai-composer-detail">{m.detail}</p>}
      <button type="button" className="sb-btn" onClick={cancel}>إلغاء</button>
    </div>
  );

  const failureView = (f: ComposerFailure) => (
    <div role="alert" className="ai-composer-alert">
      <h3 ref={resultHeadRef} tabIndex={-1} className="ai-composer-alert-title">{FAILURE_TITLES[f.kind]}</h3>
      {f.message && f.message !== FAILURE_TITLES[f.kind] && <p>{f.message}</p>}
      <IssueList issues={f.issues} label="المشكلات" />
      {f.kind === "stale" && (
        <div className="ai-composer-actions">
          <button type="button" className="sb-btn sb-btn-primary" onClick={() => { if (lastAction === "generate") void generate(); else void modify(); }} disabled={disabled}>{lastAction === "generate" ? "إعادة التوليد" : "إعادة الطلب"}</button>
          <button type="button" className="sb-btn" onClick={discardAll}>تجاهل</button>
        </div>
      )}
    </div>
  );

  const generationView = (s: Staged) => {
    const v = s.verdict, sum = v.summary;
    const warnings = [...s.result.planWarnings, ...s.result.warnings, ...v.warnings];
    const typeMix = Object.entries(sum.typeMix);
    return (
      <section className="ai-composer-result" aria-labelledby={uid + "-gen-head"}>
        <h3 id={uid + "-gen-head"} ref={resultHeadRef} tabIndex={-1}>{s.result.exam.title || "مسودة الامتحان"}</h3>
        <p className="ai-composer-trust">مسودة من الذكاء الاصطناعي — راجعها قبل الاعتماد</p>
        {modifyTarget === "staged" && <p className="sb-hint">تتضمن المسودة تعديلات بالذكاء الاصطناعي لم تُطبَّق بعد على المحرر.</p>}
        <dl className="ai-composer-summary" data-testid="ai-composer-summary">
          <div><dt>النتيجة</dt><dd className={v.ok ? "is-pass" : "is-fail"}>{v.ok ? "PASS — اجتازت الفحوص" : "FAIL — لا يمكن فتحها في المحرر"}</dd></div>
          <div><dt>مجموع العلامات</dt><dd data-testid="ai-composer-marks">{sum.totalMarks}{sum.requestedMarks !== null ? " / " + sum.requestedMarks + " المطلوب" : ""}</dd></div>
          <div><dt>الأقسام</dt><dd>{sum.sections}</dd></div>
          <div><dt>الأسئلة</dt><dd>{sum.questions}</dd></div>
          <div><dt>أنواع الأسئلة</dt><dd>{typeMix.length ? typeMix.map(([k, n]) => kindLabel(k) + " × " + n).join("، ") : "—"}</dd></div>
          <div><dt>تصحيح آلي / يدوي</dt><dd>{sum.automaticMarks} علامة آلية · {sum.manualMarks} علامة يدوية</dd></div>
          <div><dt>محتوى متقدم</dt><dd>مركّب {sum.composite} · SmartSim {sum.smartSim} · برمجة {sum.coding} · معطيات متغيرة {sum.parametric} · جداول {sum.richTables}</dd></div>
          <div><dt>قالب العرض</dt><dd>{presetLabel(sum.presentation)}</dd></div>
          <div><dt>المشكلات</dt><dd>{sum.blocking} مانع · {warnings.length} تنبيه</dd></div>
        </dl>
        {v.coverage.length > 0 && (
          <table className="ai-composer-coverage">
            <caption>تغطية الموضوعات</caption>
            <thead><tr><th scope="col">الموضوع</th><th scope="col">العلامات</th><th scope="col">الأسئلة</th></tr></thead>
            <tbody>{v.coverage.slice(0, 60).map(c => <tr key={c.topic}><th scope="row">{c.topic}</th><td>{c.marks}</td><td>{c.questions}</td></tr>)}</tbody>
          </table>
        )}
        {v.blocking.length > 0 && <div className="ai-composer-blocking"><h4>مشكلات مانعة</h4><IssueList issues={v.blocking} label="مشكلات مانعة" /></div>}
        {warnings.length > 0 && <div className="ai-composer-warnings"><h4>تنبيهات</h4><IssueList issues={warnings.map(w => ({ message: "⚠ " + w.message }))} label="تنبيهات" /></div>}
        {showPlan && (
          <div className="ai-composer-plan" data-testid="ai-composer-plan">
            <h4>خطة الامتحان</h4>
            <ol>
              {s.result.plan.sections.map(sec => (
                <li key={sec.key}><strong>{sec.title}</strong> — {sec.marks} علامة
                  <ul>{sec.items.map(it => <li key={it.key}>{kindLabel(it.kind)} · {it.topic || "—"} · {PLAN_DIFFICULTY_LABELS[it.difficulty] ?? it.difficulty} · {it.marks} علامة</li>)}</ul>
                </li>
              ))}
            </ol>
          </div>
        )}
        {confirmReplace && (
          <div className="ai-composer-confirm" role="group" aria-label="تأكيد الاستبدال">
            <p>سيستبدل هذا محتوى الامتحان الحالي (يمكنك التراجع)</p>
            <div className="ai-composer-actions">
              <button type="button" className="sb-btn sb-btn-primary" onClick={applyGenerated} disabled={disabled}>تأكيد الاستبدال</button>
              <button type="button" className="sb-btn" onClick={() => setConfirmReplace(false)}>تراجع عن الاستبدال</button>
            </div>
          </div>
        )}
        <div className="ai-composer-actions">
          <button type="button" className="sb-btn" onClick={() => setShowPlan(v2 => !v2)} aria-expanded={showPlan}>معاينة الخطة</button>
          <button type="button" className="sb-btn" onClick={() => onPreview(s.result.exam)}>معاينة الامتحان</button>
          <button type="button" className="sb-btn sb-btn-primary" onClick={applyGenerated} disabled={!v.ok || !!disabled || confirmReplace} title={v.ok ? undefined : "أصلح المشكلات المانعة أولًا"}>فتح في المحرر</button>
          <button type="button" className="sb-btn" onClick={refineStaged} disabled={disabled}>تعديل بالذكاء الاصطناعي</button>
          <button type="button" className="sb-btn" onClick={discardAll}>تجاهل</button>
        </div>
      </section>
    );
  };

  const diffView = (r: Extract<ReadyResult, { kind: "modify" }>) => {
    const entries = r.mod.diff.slice(0, DIFF_LIMIT);
    const byGroup = new Map<number, DiffEntry[]>();
    for (const e of entries) byGroup.set(e.group, [...(byGroup.get(e.group) ?? []), e]);
    const noneSelected = groups.every((_, g) => unselectedGroups.has(g));
    return (
      <section className="ai-composer-result" aria-labelledby={uid + "-diff-head"}>
        <h3 id={uid + "-diff-head"} ref={resultHeadRef} tabIndex={-1}>التعديلات المقترحة{r.target === "staged" ? " على المسودة" : ""}</h3>
        <p className="ai-composer-trust">مسودة من الذكاء الاصطناعي — راجعها قبل الاعتماد</p>
        {r.mod.patch.summary && <p>{r.mod.patch.summary}</p>}
        <ul className="ai-composer-diff" aria-label="قائمة التعديلات">
          {[...byGroup.entries()].map(([g, list]) => {
            const id = uid + "-g" + g;
            return (
              <li key={g} className="ai-composer-diff-group">
                <label className="ai-composer-diff-pick" htmlFor={id}>
                  <input id={id} type="checkbox" checked={!unselectedGroups.has(g)} onChange={e => { const on = e.target.checked; setUnselectedGroups(prev => { const n = new Set(prev); if (on) n.delete(g); else n.add(g); return n; }); }} />
                  <span>{list[0].target}</span>
                </label>
                <ul className="ai-composer-diff-entries">
                  {list.map(e => (
                    <li key={e.index} className="ai-composer-diff-entry">
                      {e.changes.map((c, k) => <p key={k} className="ai-composer-change"><span className="ai-composer-field">{c.field}:</span> <bdi className="ai-composer-before">{c.before}</bdi> → <bdi className="ai-composer-after">{c.after}</bdi></p>)}
                      {e.warnings.map((w, k) => <p key={"w" + k} className="ai-composer-diff-warning">⚠ {w}</p>)}
                      {e.reason && <p className="sb-hint">السبب: {e.reason}</p>}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        {r.mod.diff.length > DIFF_LIMIT && <p className="sb-hint">يُعرض أول {DIFF_LIMIT} تعديل من {r.mod.diff.length}.</p>}
        {r.mod.warnings.length > 0 && <IssueList issues={r.mod.warnings.map(w => ({ message: "⚠ " + w.message }))} label="تنبيهات" />}
        {applyIssues.length > 0 && (
          <div role="alert" className="ai-composer-alert">
            <p className="ai-composer-alert-title">رُفض التطبيق: التعديل المحدد يُدخل مشكلة جديدة أو غير صالح. لم يتغيّر الامتحان.</p>
            <IssueList issues={applyIssues} label="أسباب الرفض" />
          </div>
        )}
        <div className="ai-composer-actions">
          <button type="button" className="sb-btn sb-btn-primary" onClick={() => applyPatch(true)} disabled={disabled}>تطبيق الكل</button>
          <button type="button" className="sb-btn" onClick={() => applyPatch(false)} disabled={disabled || noneSelected}>تطبيق المحدد</button>
          <button type="button" className="sb-btn" onClick={cancelPatch}>إلغاء</button>
        </div>
      </section>
    );
  };

  const appliedView = (
    <section className="ai-composer-result" aria-labelledby={uid + "-applied-head"}>
      <h3 id={uid + "-applied-head"} ref={resultHeadRef} tabIndex={-1}>تم التطبيق</h3>
      <p className="sb-hint">طُبّق التعديل كخطوة واحدة في سجل التعديلات.</p>
      <div className="ai-composer-actions">
        {onUndo && <button type="button" className="sb-btn" onClick={() => { onUndo(); onClose(); }}>تراجع</button>}
        <button type="button" className="sb-btn sb-btn-primary" onClick={onClose}>إغلاق</button>
      </div>
    </section>
  );

  const generateForm = (
    <div className="ai-composer-form">
      <p className="sb-hint">الحقول المنظَّمة (المادة، العلامات، الأنواع، الخيارات) تتقدّم دائمًا على الوصف الحر عند التعارض.</p>
      <div className="ai-composer-grid">
        <label className="sb-field"><span>المادة (مطلوب)</span><input required aria-required="true" value={form.subject} maxLength={COMPOSER_LIMITS.shortText} disabled={lockForm} onChange={e => set("subject", e.target.value)} /></label>
        <label className="sb-field"><span>المساق</span><input value={form.course} maxLength={COMPOSER_LIMITS.shortText} disabled={lockForm} onChange={e => set("course", e.target.value)} /></label>
        <label className="sb-field"><span>الصف</span><input value={form.grade} maxLength={COMPOSER_LIMITS.shortText} disabled={lockForm} onChange={e => set("grade", e.target.value)} /></label>
        <label className="sb-field"><span>اللغة</span>
          <select value={form.language} disabled={lockForm} onChange={e => set("language", e.target.value as GenForm["language"])}>{COMPOSER_LANGUAGES.map(l => <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>)}</select>
        </label>
        <label className="sb-field"><span>مجموع العلامات (مطلوب)</span><input type="number" inputMode="numeric" required aria-required="true" min={1} max={COMPOSER_LIMITS.totalMarksMax} step={1} value={form.totalMarks} disabled={lockForm} onChange={e => set("totalMarks", e.target.value)} /></label>
        <label className="sb-field"><span>المدة بالدقائق</span><input type="number" inputMode="numeric" min={1} max={COMPOSER_LIMITS.durationMax} step={1} value={form.durationMinutes} disabled={lockForm} onChange={e => set("durationMinutes", e.target.value)} /></label>
        <label className="sb-field"><span>الصعوبة</span>
          <select value={form.difficulty} disabled={lockForm} onChange={e => set("difficulty", e.target.value as GenForm["difficulty"])}>{COMPOSER_DIFFICULTIES.map(d => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}</select>
        </label>
        <label className="sb-field"><span>عدد الأقسام</span><input type="number" inputMode="numeric" min={1} max={COMPOSER_LIMITS.sections} step={1} value={form.sectionTarget} disabled={lockForm} onChange={e => set("sectionTarget", e.target.value)} /></label>
        <label className="sb-field"><span>عدد الأسئلة المستهدف</span><input type="number" inputMode="numeric" min={1} max={COMPOSER_LIMITS.items} step={1} value={form.questionTarget} disabled={lockForm} onChange={e => set("questionTarget", e.target.value)} /></label>
        <label className="sb-field"><span>قالب العرض</span>
          <select value={form.preset} disabled={lockForm} onChange={e => set("preset", e.target.value)}>
            <option value="auto">تلقائي (يقترحه الذكاء الاصطناعي)</option>
            {COMPOSER_PRESETS.map(p => <option key={p} value={p}>{presetLabel(p)}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="ai-composer-fieldset">
        <legend>الأنواع المسموحة</legend>
        <div className="ai-composer-checks">
          {COMPOSER_ITEM_KINDS.map(k => (
            <label key={k} className="ai-composer-check"><input type="checkbox" checked={form.types[k]} disabled={lockForm} onChange={e => { const on = e.target.checked; setForm(f => ({ ...f, types: { ...f.types, [k]: on } })); }} /> {kindLabel(k)}</label>
          ))}
        </div>
        {!anyType && <p className="sb-hint" role="note">اختر نوعًا واحدًا على الأقل.</p>}
      </fieldset>
      <fieldset className="ai-composer-fieldset">
        <legend>الميزات</legend>
        <div className="ai-composer-checks">
          {COMPOSER_CAPABILITY_FLAGS.map(f => (
            <label key={f} className="ai-composer-check"><input type="checkbox" checked={form.capabilities[f]} disabled={lockForm} onChange={e => { const on = e.target.checked; setForm(x => ({ ...x, capabilities: { ...x.capabilities, [f]: on } })); }} /> {CAPABILITY_LABELS[f]}</label>
          ))}
        </div>
      </fieldset>
      <div className="ai-composer-grid">
        <label className="sb-field"><span>الموضوعات المطلوبة (مفصولة بفواصل)</span><input value={form.requiredTopics} dir="auto" disabled={lockForm} onChange={e => set("requiredTopics", e.target.value)} /></label>
        <label className="sb-field"><span>الموضوعات المستبعدة (مفصولة بفواصل)</span><input value={form.excludedTopics} dir="auto" disabled={lockForm} onChange={e => set("excludedTopics", e.target.value)} /></label>
      </div>
      <label className="sb-field"><span>وصف الامتحان</span>
        <textarea value={form.instruction} rows={4} maxLength={COMPOSER_LIMITS.instructionChars} dir="auto" disabled={lockForm} onChange={e => set("instruction", e.target.value)} />
      </label>
      <div className="ai-composer-actions">
        <button type="button" className="sb-btn sb-btn-primary" onClick={() => void generate()} disabled={!canGenerate}>إنشاء الامتحان</button>
      </div>
    </div>
  );

  const modifyForm = (
    <div className="ai-composer-form">
      {modifyTarget === "staged" && staged && (
        <div className="ai-composer-staged-note">
          <p>تعديل المسودة المولّدة (لم تُفتح في المحرر بعد).</p>
          <button type="button" className="sb-btn" onClick={showStaged}>العودة إلى المسودة</button>
        </div>
      )}
      {tab === "modifyExam" && (
        <label className="sb-field"><span>نطاق التعديل</span>
          <select value={effectiveSection} disabled={lockForm} onChange={e => setSectionScope(e.target.value)}>
            <option value="">الامتحان كاملًا</option>
            {sectionOptions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
      )}
      {tab === "generateSection" && <p className="sb-hint">يُضاف قسم جديد كامل إلى الامتحان بحسب وصفك؛ تراجع التعديل قبل تطبيقه.</p>}
      {tab === "question" && (
        questionOptions.length === 0 ? <p className="sb-hint">لا توجد أسئلة في الامتحان بعد.</p> : (
          <>
            <label className="sb-field"><span>السؤال</span>
              <select value={effectiveQuestionId} disabled={lockForm} onChange={e => setQuestionId(e.target.value)}>{questionOptions.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}</select>
            </label>
            <fieldset className="ai-composer-fieldset">
              <legend>نوع التعديل</legend>
              <label className="ai-composer-check"><input type="radio" name={uid + "-qaction"} value="replaceQuestion" checked={questionAction === "replaceQuestion"} disabled={lockForm} onChange={() => setQuestionAction("replaceQuestion")} /> استبدال السؤال</label>
              <label className="ai-composer-check"><input type="radio" name={uid + "-qaction"} value="improveContent" checked={questionAction === "improveContent"} disabled={lockForm} onChange={() => setQuestionAction("improveContent")} /> تحسين المحتوى</label>
            </fieldset>
          </>
        )
      )}
      {tab === "presentation" && <p className="sb-hint">يغيّر هذا تصميم العرض فقط؛ الأسئلة والعلامات والإجابات لا تتغيّر.</p>}
      <label className="sb-field"><span>التعديل المطلوب</span>
        <textarea value={instruction} rows={4} maxLength={COMPOSER_LIMITS.instructionChars} dir="auto" disabled={lockForm} onChange={e => setInstruction(e.target.value)} />
      </label>
      <div className="ai-composer-actions">
        <button type="button" className="sb-btn sb-btn-primary" onClick={() => void modify()} disabled={!canModify}>اقتراح التعديل</button>
      </div>
    </div>
  );

  let body;
  if (busy) body = progress;
  else if (m.name === "applied") body = appliedView;
  else if ((m.name === "ready" || m.name === "applying") && m.result?.kind === "modify") body = diffView(m.result);
  else if ((m.name === "ready" || m.name === "applying") && staged) body = generationView(staged);
  else body = (
    <>
      {(m.name === "failed" || m.name === "cancelled" || m.name === "stale") && m.failure && failureView(m.failure)}
      {!(m.name === "stale") && (tab === "generate" ? generateForm : modifyForm)}
    </>
  );
  const showTabs = !busy && m.name !== "ready" && m.name !== "applying" && m.name !== "applied" && m.name !== "stale";

  return (
    <Dialog open={open} onClose={close} title="المؤلف الذكي للامتحان" size="lg" className="ai-composer-dialog">
      <div className="ai-composer" data-catalog={catalog?.version}>
        {showTabs && (
          <div role="tablist" aria-label="نوع العمل" className="ai-composer-tabs">
            {TABS.map(t => (
              <button key={t.id} ref={el => { tabRefs.current[t.id] = el; }} type="button" role="tab" id={uid + "-tab-" + t.id} aria-selected={tab === t.id} aria-controls={uid + "-panel"} tabIndex={tab === t.id ? 0 : -1}
                className={"ai-composer-tab" + (tab === t.id ? " is-active" : "")} onClick={() => setTab(t.id)} onKeyDown={onTabKey}>{t.label}</button>
            ))}
          </div>
        )}
        <div id={uid + "-panel"} role={showTabs ? "tabpanel" : undefined} aria-labelledby={showTabs ? uid + "-tab-" + tab : undefined} className="ai-composer-panel">
          {body}
        </div>
      </div>
    </Dialog>
  );
}

