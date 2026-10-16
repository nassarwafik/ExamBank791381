import { useId, useMemo } from "react";
import type { BuilderQuestionType, StructuredExam } from "../examTypes";
import type { StructuredIssue } from "../examQuality";
import type { FinalizationDecision } from "../examFinalization";
import type { IssueTarget } from "../builder/issueIndex";
import type { ToolbarItem } from "../builder/BuilderToolbar";
import { QUESTION_TYPE_LABELS } from "../examTypes";
import { buildAssessmentProfile, blueprintCognitiveLevels, difficultyValues } from "../assessmentBlueprint";
import { IconWarning, IconInfo, IconCheck, IconEye, IconChevronBack, IconFile } from "../icons";
import { questionReadiness, readinessState, reviewItems, distribution, type DistributionRow, type ReviewItem, type ReadinessState } from "./studioReview";
import type { StudioStepKey } from "./studioSteps";

// Phase 21F.6 — the Studio's review step: is the exam ready, what must be fixed, and what does it assess. Every figure is the builder's
// own: the ONE finalization decision (blockers / warnings, the exact refusal the final save applies), the issue index's targets
// («إصلاح» opens the issue in its card, through the builder's openIssue) and the assessment profile (official marks per section /
// type / cognitive level / difficulty). Nothing is re-validated or scored here.

type Props = {
  exam: StructuredExam;
  decision: FinalizationDecision;
  issuesOfQuestion: ReadonlyMap<string, readonly StructuredIssue[]>;
  targets: ReadonlyMap<StructuredIssue, IssueTarget>;
  /** The builder's tools that review uses (coverage, policies, readiness, blueprint): the same items as the «أدوات» menu. */
  tools: readonly ToolbarItem[];
  onOpenIssue: (target: IssueTarget, issue: StructuredIssue) => void;
  onPreview: () => void;
  onStep: (step: StudioStepKey) => void;
};

const STATE_TEXT: Record<ReadinessState, { title: string; note: string }> = {
  empty: { title: "لا توجد أسئلة بعد", note: "أضف أسئلة في خطوة المحتوى، ثم عُد للمراجعة." },
  blocked: { title: "غير جاهز للاعتماد", note: "أصلح العوائق أدناه؛ الاعتماد النهائي يرفضها." },
  review: { title: "جاهز، مع تنبيهات", note: "يمكن الاعتماد. راجع التنبيهات قبل النشر." },
  ready: { title: "جاهز للاعتماد", note: "لا عوائق ولا تنبيهات." }
};
const SOURCE_TEXT: Record<ReviewItem["source"], string> = { structural: "بنية الامتحان", quality: "بوابة جودة", policy: "سياسة الجودة" };
const RING_R = 70, RING_C = 2 * Math.PI * RING_R;
const qCount = (n: number) => (n === 1 ? "سؤال واحد" : n === 2 ? "سؤالان" : n >= 3 && n <= 10 ? n + " أسئلة" : n + " سؤالًا");
const fmt = (n: number) => String(Math.round(n * 100) / 100);

export default function StudioReview({ exam, decision, issuesOfQuestion, targets, tools, onOpenIssue, onPreview, onStep }: Props) {
  const sections = exam.sections;
  const readiness = useMemo(() => questionReadiness(sections, issuesOfQuestion, decision.canFinalize), [sections, issuesOfQuestion, decision.canFinalize]);
  const state = readinessState(readiness, decision);
  const items = useMemo(() => reviewItems(decision, targets), [decision, targets]);
  const blockers = items.filter(i => i.level === "blocker"), warnings = items.filter(i => i.level === "warning");
  const charts = useMemo(() => {
    const profile = buildAssessmentProfile(exam);
    const total = profile.totalOfficialMarks;
    const levels = [...blueprintCognitiveLevels(exam.blueprint)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const levelLabel = new Map(levels.map(l => [l.id, l.label]));
    const classified = Object.keys(profile.byCognitiveLevel).some(k => k !== "unspecified");
    const rated = Object.keys(profile.byDifficulty).some(k => k !== "unspecified");
    const bySection = new Map(sections.map((s, i) => [s.id, "القسم " + (i + 1) + (s.title?.trim() ? ": " + s.title.trim() : "")]));
    return {
      total,
      sections: distribution(profile.bySection, k => bySection.get(k) ?? k, total, sections.map(s => s.id)),
      types: distribution(profile.byType, k => (k === "unspecified" ? "غير محدد" : QUESTION_TYPE_LABELS[k as BuilderQuestionType] ?? k), total),
      levels: classified ? distribution(profile.byCognitiveLevel, k => (k === "unspecified" ? "غير مصنّف" : levelLabel.get(k) ?? k), total, levels.map(l => l.id), true) : null,
      difficulty: rated ? distribution(profile.byDifficulty, k => (k === "unspecified" ? "غير محددة" : "الصعوبة " + k), total, difficultyValues(exam.blueprint).map(String), true) : null,
      unclassified: profile.unclassified.count
    };
  }, [exam, sections]);
  const tool = (key: string) => tools.find(t => t.key === key && !t.disabled);
  const fixOf = (item: ReviewItem): { label: string; run: () => void } | null => {
    const fix = item.fix;
    if (!fix) return null;
    if (fix.kind === "issue") return { label: "إصلاح", run: () => onOpenIssue(fix.target, fix.issue) };
    const t = tool(fix.kind);
    return t ? { label: "فتح", run: t.onSelect } : null;
  };
  const reviewTools = ["readiness", "coverage", "policy", "blueprint"].map(tool).filter((t): t is ToolbarItem => !!t);
  const percent = state === "empty" ? 0 : readiness.share;
  const ringTone = state === "blocked" ? "is-blocked" : state === "review" ? "is-review" : state === "ready" ? "is-ready" : "";

  return (
    <div className="st-step-view st-review" data-studio-step="review">
      <div className="st-step-grid">
        <header className="st-step-head">
          <div>
            <h2>مراجعة الامتحان</h2>
            <p>ما يجب إصلاحه قبل الاعتماد، وكيف تتوزّع العلامات على الأقسام والأنواع والمستويات.</p>
          </div>
          <div className="st-row-actions">
            <button type="button" className="st-btn" onClick={onPreview}><IconEye size={16} aria-hidden="true" />معاينة كما يراه الطالب</button>
            <button type="button" className="st-btn is-primary" onClick={() => onStep("publish")}>الانتقال إلى النشر<IconChevronBack size={16} aria-hidden="true" /></button>
          </div>
        </header>
        <div className="st-cols">
          <section className="st-panel" aria-labelledby="st-review-ready">
            <h3 id="st-review-ready">الجاهزية</h3>
            <div className={"st-ring " + ringTone} role="img" aria-label={"الأسئلة السليمة " + (readiness.ok + readiness.warn) + " من " + readiness.total + " (" + percent + "%)"}>
              <svg viewBox="0 0 170 170" width="170" height="170" aria-hidden="true">
                <circle cx="85" cy="85" r={RING_R} className="st-ring-track" />
                <circle cx="85" cy="85" r={RING_R} className="st-ring-fill" strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - percent / 100)} />
              </svg>
              <span className="st-ring-v" aria-hidden="true">{percent}%<small>أسئلة سليمة</small></span>
            </div>
            <p className={"st-ready-state is-" + state} data-readiness={state}><b>{STATE_TEXT[state].title}</b><span>{STATE_TEXT[state].note}</span></p>
            <dl className="st-kv">
              <dt>أسئلة سليمة</dt><dd>{readiness.ok}</dd>
              <dt>أسئلة بتنبيهات</dt><dd>{readiness.warn}</dd>
              <dt>أسئلة بأخطاء</dt><dd>{readiness.error}</dd>
              <dt>الأقسام</dt><dd>{sections.length}</dd>
              <dt>مجموع العلامات</dt><dd>{fmt(charts.total)}</dd>
            </dl>
          </section>
          <section className="st-panel" aria-labelledby="st-review-issues">
            <h3 id="st-review-issues">ما يجب إصلاحه</h3>
            <p className="st-sub">{blockers.length ? blockers.length + " عائق" : "لا عوائق"} · {warnings.length ? warnings.length + " تنبيه" : "لا تنبيهات"}</p>
            {items.length === 0
              ? <p className="st-review-empty"><IconCheck size={18} aria-hidden="true" />لا توجد مشكلات. الامتحان جاهز للنشر.</p>
              : <ReviewList items={items} fixOf={fixOf} />}
          </section>
          <div className="st-review-side">
            <section className="st-panel" aria-labelledby="st-review-sections">
              <h3 id="st-review-sections">العلامات حسب الأقسام</h3>
              <Bars rows={charts.sections} label="العلامات حسب الأقسام" />
            </section>
            <section className="st-panel" aria-labelledby="st-review-types">
              <h3 id="st-review-types">أنواع الأسئلة</h3>
              <Bars rows={charts.types} label="أنواع الأسئلة" teal />
            </section>
          </div>
        </div>
        <div className="st-cols is-three">
          <section className="st-panel" aria-labelledby="st-review-levels">
            <h3 id="st-review-levels">المستويات المعرفية</h3>
            {charts.levels ? <Bars rows={charts.levels} label="المستويات المعرفية" />
              : <p className="st-sub">لم تُصنَّف الأسئلة بعد حسب المستوى المعرفي. صنّفها من تبويب «التصنيف» في لوحة خصائص السؤال.</p>}
          </section>
          <section className="st-panel" aria-labelledby="st-review-difficulty">
            <h3 id="st-review-difficulty">الصعوبة</h3>
            {charts.difficulty ? <Bars rows={charts.difficulty} label="الصعوبة" teal />
              : <p className="st-sub">لم تُحدَّد صعوبة الأسئلة بعد.</p>}
          </section>
          <section className="st-panel" aria-labelledby="st-review-tools">
            <h3 id="st-review-tools">أدوات المراجعة</h3>
            {charts.unclassified > 0 && <p className="st-sub">{qCount(charts.unclassified)} بلا موضوع رئيسي في المخطط.</p>}
            {reviewTools.length
              ? <ul className="st-tool-list">{reviewTools.map(t => (
                  <li key={t.key} className="st-tool">
                    <span className="st-tool-ic" aria-hidden="true">{t.icon ?? <IconFile size={18} />}</span>
                    <b>{t.label}</b>
                    <button type="button" className="st-btn is-small" onClick={t.onSelect} aria-haspopup={t.dialog ? "dialog" : undefined} aria-label={"فتح " + t.label}>فتح</button>
                  </li>
                ))}</ul>
              : <p className="st-sub">لا توجد أدوات مراجعة لهذا الامتحان.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function ReviewList({ items, fixOf }: { items: readonly ReviewItem[]; fixOf: (item: ReviewItem) => { label: string; run: () => void } | null }) {
  const base = "st-rv-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <ul className="st-issue-list" aria-label="العوائق والتنبيهات">
      {items.map((item, n) => {
        const fix = fixOf(item);
        const id = base + "-" + n;
        return (
          <li key={item.id} className={"st-issue " + (item.level === "blocker" ? "is-error" : "is-warn")} data-review-level={item.level}>
            <span className="st-issue-ic">{item.level === "blocker" ? <IconWarning size={16} role="img" aria-label="عائق" /> : <IconInfo size={16} role="img" aria-label="تنبيه" />}</span>
            <div><b id={id}>{item.message}</b><span>{item.place ? item.place + " · " : ""}{SOURCE_TEXT[item.source]}</span></div>
            {fix ? <button type="button" className="st-btn is-small" onClick={fix.run} aria-describedby={id}>{fix.label}</button> : <span />}
          </li>
        );
      })}
    </ul>
  );
}

function Bars({ rows, label, teal = false }: { rows: readonly DistributionRow[]; label: string; teal?: boolean }) {
  if (!rows.length) return <p className="st-sub">لا توجد بيانات بعد.</p>;
  return (
    <ul className="st-bars" aria-label={label}>
      {rows.map(r => (
        <li key={r.key} className="st-bar">
          <span className="st-bar-label">{r.label}</span>
          <span className="st-bar-track" aria-hidden="true"><i className={teal ? "is-teal" : undefined} style={{ inlineSize: r.share + "%" }} /></span>
          <b>{r.share}%</b>
          <span className="st-visually-hidden">: {qCount(r.count)}، {fmt(r.marks)} من العلامات</span>
        </li>
      ))}
    </ul>
  );
}
