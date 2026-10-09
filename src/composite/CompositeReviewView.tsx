import { lazy, Suspense, useId, type ReactNode } from "react";
import { questionTypeLabel } from "../questionTypeCatalog";
import { scoreOpenResponseRubric } from "../openResponseQuestion";
import { ScenarioSources } from "../scenario/ScenarioView";
import type { ScenarioV1 } from "../scenarioSource";
import { resolveSmartSimUi } from "../trustedSim/smartSimUiRegistry";
import { CodeSourceView, CodeKeySummary } from "../coding/CodeSourceView";
import CodingAutoGradeBlock, { type EvidenceActionResult } from "../coding/CodingAutoGradeBlock";
import { normalizeEvidence, evidenceStatusLabel, RETRY_LABEL, FORCE_LABEL } from "../coding/codingTeacherEvidence";
import type { ConfirmOptions } from "../ui/ConfirmDialog";
import "./composite-review.css";

// Phase 20D — the TEACHER review of ONE composite@1 question (lazy chunk of the assignment review). It renders the server's review
// projection as a tree: every shared context ONCE at the top (a source context → its sources; a SmartSim context → the server-derived
// state + plugin review ONCE), then one section per group (title, counting rule) and one row per part keyed by its child key
// <questionId>::part::<partId>: label, type, marks, counted / ignored state, the stored automatic score, the manual-review state, the
// student's answer through the existing per-type review views (each loaded on demand), the private expected answer (teacher only), and the
// per-part override (a score bounded by the part's COUNTED maximum, or rubric selections for an open response) + a comment. Nothing here
// grades: the host sends the overrides and the SERVER recomputes the official part and composite scores. Everything is rendered as TEXT.
const SmartSimReviewView = lazy(() => import("../trustedSim/SmartSimReviewView"));
const RubricGradingPanel = lazy(() => import("../openResponse/RubricGradingPanel"));
const ParametricAnswerView = lazy(() => import("../parametric/ParametricReviewView").then(m => ({ default: m.ParametricAnswerView })));
// Phase 21A.1 — a chartSelection@1 child is reviewed on its chart (✓ / ✗ / missed), exactly like a standalone chart question (teacher-only, lazy).
const ChartSelectionReview = lazy(() => import("../charts/ChartSelectionReview"));
// Phase 21A.2 — a functionGraphSelection@1 child is reviewed on its graph (✓ / ✗ / missed), like a standalone graph question (teacher-only, lazy).
const FunctionGraphSelectionReview = lazy(() => import("../functionGraphs/FunctionGraphSelectionReview"));

export type CompositePartOverride = { score?: number | string; comment?: string; rubricAwards?: unknown };
type Json = Record<string, unknown>;
type PartGrade = { score?: number; maxMarks?: number; countedMaxMarks?: number; correct?: boolean; manualReview?: boolean; ignored?: boolean; counted?: boolean; reviewed?: boolean };
type ReviewPart = { partId: string; groupId?: string; childKey: string; label?: string; type?: string; questionTypeVersion?: unknown; marks?: number; text?: string; contextId?: string; node?: Json; studentAnswer?: unknown; expectedAnswer?: unknown; autoGrade?: PartGrade | null; manualScore?: number | null; teacherComment?: string; smartSimReview?: unknown; rubricReview?: unknown; parametricInstance?: unknown; codeTemplateReview?: { ok?: boolean; language?: string; source?: string }; codingEvidence?: unknown };
type ReviewContext = { id: string; kind?: string; title?: string; instructions?: string; sources?: unknown; smartSim?: unknown; studentAnswer?: unknown; review?: Json };
type RootGroup = { id: string; title?: string; instructions?: string; gradingPolicy?: string; requiredAnswers?: number | null; maxMarks?: number | null; parts?: { id: string; label?: string; type?: string; marks?: number; text?: string }[] };
export type CompositeReviewQuestion = { questionId: string; questionNumber?: number; marks?: number; type?: string; autoGrade?: unknown; composite?: unknown; compositeReview?: unknown };
type CodingHost = { confirm: (options: ConfirmOptions) => Promise<boolean>; attemptNumber: number; studentName: string; refreshing?: boolean; onRefresh: () => void };
type Props = {
  question: CompositeReviewQuestion;
  overrides: Record<string, CompositePartOverride>;
  onOverride: (childKey: string, next: CompositePartOverride) => void;
  disabled?: boolean;
  onRegrade?: (childKey: string, action: "retry" | "force") => Promise<EvidenceActionResult> | void;
  /** When given, a coding part shows the full evidence panel (status, per-test evidence, retry / confirmed force regrade). */
  coding?: CodingHost;
};

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const fmt = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—");
const show = (v: unknown): string => (v === null || v === undefined ? "—" : typeof v === "string" ? v || "—" : JSON.stringify(v, null, 2));
const partCap = (g: PartGrade | null | undefined) => Number(g?.countedMaxMarks ?? g?.maxMarks ?? 0);
const rubricNode = (p: ReviewPart) => ({ presentationType: "openResponse", questionTypeVersion: p.questionTypeVersion ?? undefined, marks: Number(p.marks ?? 0), openResponse: p.node?.openResponse, answer: p.expectedAnswer });
const ruleText = (g: RootGroup, n: number) => g.gradingPolicy === "firstNAnswered" ? "أجب عن " + (g.requiredAnswers ?? "؟") + " من " + n + " — تُحتسب أول " + (g.requiredAnswers ?? "؟") + " إجابات فقط" : "تُحتسب جميع البنود";
const Loading = ({ text }: { text: string }) => <p role="status" className="platform-loading">{text}</p>;

function ContextBlock({ c, root }: { c: ReviewContext; root: Json | undefined }) {
  const hid = "cmp-rv-c-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const title = c.title ?? (typeof root?.title === "string" ? root.title : undefined);
  const instructions = c.instructions ?? (typeof root?.instructions === "string" ? root.instructions : undefined);
  let body: ReactNode;
  if (c.kind === "smartSim") {
    const env = isObj(c.smartSim) ? c.smartSim : isObj(root?.smartSim) ? root.smartSim : {};
    const r = isObj(c.review) ? c.review : {};
    const { valid, answered, state, issues, ...details } = r;
    const ui = resolveSmartSimUi(env.pluginKey, env.pluginVersion);
    body = <>
      <p className="cmp-review-note" data-testid="cmp-review-context-answered">{answered === true ? "استخدم الطالب المحاكاة المشتركة؛ الحالة أدناه أعاد الخادم بناءها من أفعاله." : "لم يستخدم الطالب المحاكاة المشتركة (لا توجد أفعال محفوظة)."}</p>
      {valid === false && <p className="cmp-review-warn" role="note">تعذّر إعادة بناء حالة المحاكاة المشتركة؛ البنود المرتبطة بها بحاجة إلى تصحيح يدوي. {arr<string>(issues).join(" ")}</p>}
      {ui && state !== undefined && <Suspense fallback={<Loading text="جارٍ تحميل حالة المحاكاة..." />}><ui.ReviewDetails config={env.config} state={state} details={details} /></Suspense>}
    </>;
  } else {
    const sources = Array.isArray(c.sources) ? c.sources : arr(root?.sources);
    body = sources.length ? <ScenarioSources scenario={{ id: c.id, version: 1, sources, questionIds: [] } as unknown as ScenarioV1} /> : <p className="cmp-review-note">لا توجد مصادر.</p>;
  }
  return (
    <section className="cmp-review-context" aria-labelledby={hid} data-context-id={c.id} data-kind={c.kind}>
      <h4 id={hid}><span className="cmp-review-eyebrow">{c.kind === "smartSim" ? "محاكاة مشتركة" : "مصدر مشترك"}</span>{title || "سياق مشترك"}</h4>
      {instructions && <p className="cmp-review-instructions" dir="auto">{instructions}</p>}
      {body}
    </section>
  );
}

function AnswerBlock({ p, ctx, question, override, onOverride, locked, onRegrade, coding }: { p: ReviewPart; ctx: ReviewContext | undefined; question: CompositeReviewQuestion; override: CompositePartOverride; onOverride: Props["onOverride"]; locked: boolean; onRegrade: Props["onRegrade"]; coding?: CodingHost }) {
  const a = isObj(p.studentAnswer) ? p.studentAnswer : null;
  if (p.type === "openResponse") return (
    <Suspense fallback={<Loading text="جارٍ تحميل سلم التقييم..." />}>
      <RubricGradingPanel disabled={locked} question={{ questionId: p.childKey, questionNumber: Number(question.questionNumber ?? 0), marks: Number(p.marks ?? 0), openResponse: p.node?.openResponse, questionTypeVersion: p.questionTypeVersion, expectedAnswer: p.expectedAnswer, studentAnswer: p.studentAnswer, rubricReview: p.rubricReview }}
        awards={(isObj(override.rubricAwards) ? override.rubricAwards : {}) as never} onChange={aw => onOverride(p.childKey, { ...override, rubricAwards: aw })} />
    </Suspense>
  );
  if (p.type === "smartSim") return (
    <div className="cmp-review-cell"><span>إجابة الطالب (فحوص الخادم لهذا البند)</span>
      <Suspense fallback={<Loading text="جارٍ تحميل مراجعة المحاكاة..." />}><SmartSimReviewView review={p.smartSimReview} envelope={ctx?.kind === "smartSim" ? ctx.smartSim : p.node?.smartSim} /></Suspense>
    </div>
  );
  if (p.type === "chartSelection") return (
    <div className="cmp-review-cell"><span>إجابة الطالب على الرسم (الإجابة المعتمدة للمعلم فقط)</span>
      <Suspense fallback={<Loading text="جارٍ تحميل مراجعة الرسم البياني..." />}><ChartSelectionReview config={p.node?.chartSelection} answerKey={p.expectedAnswer} answer={p.studentAnswer} /></Suspense>
    </div>
  );
  if (p.type === "functionGraphSelection") return (
    <div className="cmp-review-cell"><span>إجابة الطالب على رسم الدالة (الإجابة المعتمدة للمعلم فقط)</span>
      <Suspense fallback={<Loading text="جارٍ تحميل مراجعة رسم الدالة..." />}><FunctionGraphSelectionReview config={p.node?.functionGraphSelection} answerKey={p.expectedAnswer} answer={p.studentAnswer} /></Suspense>
    </div>
  );
  let student: ReactNode, expected: ReactNode;
  if (p.type === "parametricNumeric") {
    student = <Suspense fallback={<Loading text="جارٍ تحميل الحالة المولّدة..." />}><ParametricAnswerView instance={p.parametricInstance} answer={p.studentAnswer} /></Suspense>;
    expected = <bdi dir="ltr">{isObj(p.expectedAnswer) && typeof p.expectedAnswer.expression === "string" ? p.expectedAnswer.expression : "—"}</bdi>;
  } else if (a?.kind === "code" && typeof a.source === "string") {
    student = <CodeSourceView source={a.source} language={String(a.language || "")} />;
    expected = <CodeKeySummary answerKey={p.expectedAnswer} />;
  } else if (a?.kind === "codeTemplate") {
    student = p.codeTemplateReview?.ok && typeof p.codeTemplateReview.source === "string" ? <CodeSourceView source={p.codeTemplateReview.source} language={String(p.codeTemplateReview.language || "")} /> : <p role="note">تعذّر إعادة بناء البرنامج من القالب المنشور وإجابات الفراغات؛ لا تُعرض شيفرة مُخمَّنة.</p>;
    expected = <CodeKeySummary answerKey={p.expectedAnswer} />;
  } else {
    student = <pre dir="auto">{show(p.studentAnswer)}</pre>;
    expected = p.type === "coding" ? <CodeKeySummary answerKey={p.expectedAnswer} /> : <pre dir="auto">{show(p.expectedAnswer)}</pre>;
  }
  const ev = p.codingEvidence !== undefined && p.codingEvidence !== null ? normalizeEvidence(p.codingEvidence) : null;
  return <>
    <div className="cmp-review-answer">
      <div className="cmp-review-cell"><span>إجابة الطالب</span>{student}</div>
      <div className="cmp-review-cell cmp-review-expected"><span>الإجابة المعتمدة (للمعلم فقط)</span>{expected}</div>
    </div>
    {p.codingEvidence !== undefined && p.codingEvidence !== null && (coding
      ? <CodingAutoGradeBlock key={coding.attemptNumber + ":" + p.childKey} evidence={p.codingEvidence} questionNumber={Number(question.questionNumber ?? 0)} studentName={coding.studentName} attemptNumber={coding.attemptNumber} confirm={coding.confirm} refreshing={coding.refreshing} onRefresh={coding.onRefresh}
          onAction={async act => (await onRegrade?.(p.childKey, act)) ?? { ok: true }} />
      : <div className="cmp-review-coding" data-testid="cmp-review-coding">
          <p>التصحيح الآلي: {ev ? evidenceStatusLabel(ev) : "—"} · العلامة الآلية: <bdi dir="ltr">{ev && ev.automaticScore !== null ? fmt(ev.automaticScore) : "—"}</bdi></p>
          {onRegrade && <div className="cmp-review-actions"><button type="button" disabled={locked} onClick={() => void onRegrade(p.childKey, "retry")}>{RETRY_LABEL}</button><button type="button" disabled={locked} onClick={() => void onRegrade(p.childKey, "force")}>{FORCE_LABEL}</button></div>}
        </div>)}
  </>;
}

export default function CompositeReviewView({ question, overrides, onOverride, disabled = false, onRegrade, coding }: Props) {
  const root = isObj(question.composite) ? question.composite : {};
  const review = isObj(question.compositeReview) ? question.compositeReview : {};
  const groups = arr<RootGroup>(root.groups).filter(isObj) as RootGroup[];
  const rootContexts = new Map(arr<Json>(root.contexts).filter(isObj).map(c => [String(c.id), c]));
  const contexts = arr<ReviewContext>(review.contexts).filter(isObj) as ReviewContext[];
  const parts = new Map((arr<ReviewPart>(review.parts).filter(isObj) as ReviewPart[]).map(p => [String(p.partId), p]));
  const qGrade = isObj(question.autoGrade) ? (question.autoGrade as PartGrade) : null;
  const questionIgnored = !!qGrade && qGrade.countedMaxMarks !== undefined && !(Number(qGrade.countedMaxMarks) > 0);
  return (
    <div className="cmp-review" dir="rtl" data-testid="composite-review">
      {review.valid === false && <p className="cmp-review-warn" role="note" data-testid="cmp-review-invalid">بنية السؤال المركّب المنشورة غير صالحة؛ لا يُعرض تصحيح جزئي، والسؤال بحاجة إلى تصحيح يدوي كامل. {arr<string>(review.issues).join(" ")}</p>}
      {contexts.length > 0 && <div className="cmp-review-contexts">{contexts.map(c => <ContextBlock key={c.id} c={c} root={rootContexts.get(String(c.id))} />)}</div>}
      {groups.map(g => {
        const rootParts = arr<{ id: string; label?: string; type?: string; marks?: number; text?: string }>(g.parts).filter(isObj);
        const max = g.maxMarks ?? rootParts.reduce((s, p) => s + (Number(p.marks) || 0), 0);
        return (
          <section key={g.id} className="cmp-review-group" data-group-id={g.id} aria-label={g.title || "مجموعة"}>
            <header className="cmp-review-group-head"><strong dir="auto">{g.title || "مجموعة"}</strong><span>{ruleText(g, rootParts.length)}</span><span>العلامة القصوى للمجموعة: <bdi dir="ltr">{fmt(Number(max))}</bdi></span></header>
            {g.instructions && <p className="cmp-review-instructions" dir="auto">{g.instructions}</p>}
            {rootParts.map(rp => {
              const p: ReviewPart = parts.get(String(rp.id)) ?? { partId: rp.id, childKey: question.questionId + "::part::" + rp.id, label: rp.label, type: rp.type, marks: rp.marks, text: rp.text, autoGrade: null };
              const childKey = p.childKey;
              const ag = isObj(p.autoGrade) ? p.autoGrade : null;
              const cap = partCap(ag);
              const ignored = questionIgnored || !ag || ag.ignored === true || ag.counted === false || !(cap > 0);
              const locked = disabled || ignored;
              const o = overrides[childKey] ?? {};
              const ctx = p.contextId ? contexts.find(c => c.id === p.contextId) : undefined;
              const isRubric = p.type === "openResponse";
              const aw = isObj(o.rubricAwards) ? o.rubricAwards : {};
              const rubricScore = isRubric && Object.keys(aw).length ? (r => (r.ok ? r.score : null))(scoreOpenResponseRubric(rubricNode(p), aw as never)) : null;
              const label = "البند " + (p.label || rp.label || p.partId);
              return (
                <div key={childKey} className={"cmp-review-part" + (ignored ? " cmp-review-part-ignored" : "") + (ag?.manualReview ? " needs-review" : "")} data-child-key={childKey} data-part-id={p.partId}>
                  <div className="cmp-review-part-head">
                    <strong>{label}</strong>
                    <span className="cmp-review-chip">{questionTypeLabel(p.type) || p.type || "—"}</span>
                    <span>{fmt(Number(p.marks ?? rp.marks ?? 0))} علامة</span>
                    {ignored ? <span className="cmp-review-chip cmp-review-chip-muted">غير محتسب{ag?.ignored ? " (إجابة زائدة عن العدد المطلوب)" : !ag ? " (لا توجد علامة مخزّنة)" : ""}</span> : <span className="cmp-review-chip">محتسب من {fmt(cap)}</span>}
                    {!ignored && ag?.manualReview && <em className="cmp-review-chip cmp-review-chip-warn">يحتاج تصحيحًا يدويًا</em>}
                    {!ignored && ag && !ag.manualReview && ag.reviewed && <span className="cmp-review-chip">تمت مراجعته</span>}
                    <span className="cmp-review-auto">آلي: <bdi dir="ltr">{ag ? fmt(ag.score) : "—"} / {fmt(cap)}</bdi></span>
                  </div>
                  {(p.text || rp.text) && <p className="cmp-review-part-text" dir="auto">{p.text || rp.text}</p>}
                  {ctx && <p className="cmp-review-note">مرتبط بالسياق المشترك «{ctx.title || String(rootContexts.get(ctx.id)?.title ?? ctx.id)}»</p>}
                  <AnswerBlock p={p} ctx={ctx} question={question} override={o} onOverride={onOverride} locked={locked} onRegrade={onRegrade} coding={coding} />
                  <div className="cmp-review-grade">
                    {isRubric
                      ? <p data-testid="cmp-review-rubric-score">الدرجة من سلم التقييم: <bdi dir="ltr">{rubricScore ?? p.manualScore ?? "—"} / {fmt(Number(p.marks ?? 0))}</bdi> <small>(يحتسبها الخادم عند الحفظ)</small></p>
                      : <label>علامة المعلم للبند<input type="number" min={0} max={cap} step={0.25} disabled={locked} aria-label={"علامة المعلم — " + label} value={o.score ?? ""} placeholder={ag ? fmt(ag.score) : ""}
                          onChange={e => onOverride(childKey, { ...o, score: e.target.value === "" ? "" : Number(e.target.value) })} /><small>من {fmt(cap)}</small></label>}
                    <label className="cmp-review-comment">ملاحظة على البند<textarea rows={2} disabled={locked} aria-label={"ملاحظة — " + label} value={o.comment ?? ""} placeholder="اختياري" onChange={e => onOverride(childKey, { ...o, comment: e.target.value })} /></label>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
