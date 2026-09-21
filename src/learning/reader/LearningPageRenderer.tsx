import type { ReactNode } from "react";
import { IconWarning, IconBook, IconSparkles, IconCheck } from "../../icons";
import RichTextRenderer from "./RichTextRenderer";
import { isActivityBlock, type ContentBlock, type ContentPage, type ContentSource, type CalloutKind, type ListBlock, type UnitOpenerBlock, type LibraryTrainingBlock } from "../content/types";
import type { LibraryTrainingHost } from "../training/types";
import type { StudyHost } from "../study/types";
import { eligibleStudyActivities } from "../study/eligibility";
import LearningActivityHost from "../activities/LearningActivityHost";
import PracticeTableView from "./PracticeTableView";
import PracticeBlockView from "./PracticeBlockView";
import VisualBlockView from "../visuals/VisualBlockView";
import { ACTIVITY_ENRICHMENT_LABEL } from "../activities/labels";
import type { LearningActivityRegistry, LearningActivityEventSink } from "../activities/engine";

/** Injection seam for the interactive-activity engine. The reader passes nothing → the PRODUCTION registry (the
 *  enumerated, test-pinned allowlist in `activities/engine.ts` — every renderer is a static import thunk keyed by
 *  kind/key/version and pinned by `engine.test.ts` / `activities.guards.test.ts`) and the no-op
 *  event sink are used; a descriptor without a trusted renderer shows its faithful static fallback and nothing is
 *  persisted. Tests inject a synthetic registry / sink to exercise the live path. */
export type ActivityRenderContext = {
  courseId: string;
  registry?: LearningActivityRegistry;
  emit?: LearningActivityEventSink;
  /** Learning-Practice seam: the HOST decides a training's availability/title/best result and owns "open". Absent
   *  (e.g. a Reader with no session) → a generic label card with no CTA and no network. */
  training?: LibraryTrainingHost;
  /** Study-Practice seam: the HOST holds the student's completion state and reports a correct answer to the server,
   *  which alone decides correctness and points. Absent (no session / teacher preview) → practice stays local. */
  study?: StudyHost;
  /** The id of the page being rendered (set only for a ready body) — what an exercise reports against. */
  pageId?: string;
};

// The page header is always derived from the MANIFEST, so title/context/position/source render immediately —
// even while the module body is still loading, or when it is not yet converted.
export type ReaderPageHeader = {
  courseId: string;
  pageTitle: string;
  moduleTitle: string;
  lessonTitle: string;
  position: { index: number; total: number };
  source?: ContentSource;
};

// The body of the current page, resolved from the (lazily loaded) module — or a controlled non-content state.
export type ReaderPageBody =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | { kind: "unavailable" }
  | { kind: "missing" }
  | { kind: "ready"; page: ContentPage };

/**
 * Renders one interactive learning page: a manifest-derived header (title, lesson context, reader position and a
 * visually-quiet source reference) plus a body. Book content is the dominant surface; teacher-enrichment blocks
 * are wrapped in a clearly-labelled (non-color-only) enrichment surface. Blocks render in EXACT authored order —
 * nothing is regrouped. No answer key reaches the DOM before the student answers (see PracticeBlockView).
 */
export default function LearningPageRenderer({ header, body, activity, training, study }: {
  header: ReaderPageHeader;
  body: ReaderPageBody;
  /** Optional activity-engine injection. Omitted in production → the production allowlist registry + no-op sink. */
  activity?: { registry?: LearningActivityRegistry; emit?: LearningActivityEventSink };
  /** Optional Learning-Practice host (availability + open). Omitted → generic training cards, no CTA. */
  training?: LibraryTrainingHost;
  /** Optional Study-Practice host (completion state + report). Omitted → in-page practice stays local, no points UI. */
  study?: StudyHost;
}) {
  const ctx: ActivityRenderContext = { courseId: header.courseId, registry: activity?.registry, emit: activity?.emit, training, study, pageId: body.kind === "ready" ? body.page.id : undefined };

  // Unit-opener pages render an intentionally distinct hero instead of the normal lesson header. The hero owns the
  // focus target (its <h2> carries the reader's title id/class); the source line is kept for traceability.
  if (body.kind === "ready" && body.page.layout === "opener") {
    const opener = body.page.blocks.find((b): b is UnitOpenerBlock => b.type === "unit-opener");
    return (
      <article className="learning-reader-page is-opener" aria-labelledby="learning-reader-page-title">
        {opener
          ? <UnitOpenerView block={opener} headed />
          : <h2 id="learning-reader-page-title" className="learning-reader-opener-title" tabIndex={-1}>{header.pageTitle}</h2>}
        {header.source && <SourceLine source={header.source} />}
        {body.page.blocks.filter(b => b.type !== "unit-opener").map(b => <BlockView key={b.id} block={b} ctx={ctx} />)}
      </article>
    );
  }

  return (
    <article className="learning-reader-page" aria-labelledby="learning-reader-page-title">
      <header className="learning-reader-pagehead">
        <p className="learning-reader-kicker">كتاب {header.courseId}</p>
        <h2 id="learning-reader-page-title" className="learning-reader-page-title" tabIndex={-1}>{header.pageTitle}</h2>
        <p className="learning-reader-context">{header.moduleTitle} · {header.lessonTitle}</p>
        <div className="learning-reader-metarow">
          <span className="learning-reader-position">صفحة {header.position.index} من {header.position.total}</span>
          <span className="learning-reader-frombook"><IconBook size={14} aria-hidden="true" />من الكتاب</span>
        </div>
        {header.source && <SourceLine source={header.source} />}
      </header>
      <div className="learning-reader-pagebody">
        <ReaderBody header={header} body={body} ctx={ctx} />
      </div>
    </article>
  );
}

function SourceLine({ source }: { source: ContentSource }) {
  const range = source.pdfPageEnd && source.pdfPageEnd !== source.pdfPageStart
    ? `الصفحات ${source.pdfPageStart}–${source.pdfPageEnd}`
    : `صفحة PDF ${source.pdfPageStart}`;
  return (
    <p className="learning-reader-source">
      <span>المصدر: كتاب {source.sourceId} · {range}</span>
      {source.printedPage !== undefined && <span className="learning-reader-printed">صفحة الكتاب المطبوعة: {source.printedPage}</span>}
    </p>
  );
}

function ReaderBody({ header, body, ctx }: { header: ReaderPageHeader; body: ReaderPageBody; ctx: ActivityRenderContext }) {
  switch (body.kind) {
    case "loading":
      return <p className="learning-reader-status" role="status">جارٍ تحميل الصفحة...</p>;
    case "error":
      return (
        <div className="learning-reader-state is-error" role="alert">
          <IconWarning size={22} aria-hidden="true" />
          <p className="learning-reader-state-title">تعذّر تحميل هذه الصفحة</p>
          <p className="learning-reader-state-text">حدث خطأ أثناء تحميل محتوى الصفحة. يمكنك المحاولة مرة أخرى.</p>
          <button type="button" className="eb-button is-primary" onClick={body.onRetry}>إعادة المحاولة</button>
        </div>
      );
    case "missing":
      return (
        <div className="learning-reader-state" role="status">
          <p className="learning-reader-state-title">هذه الصفحة غير متوفرة حاليًا</p>
          <p className="learning-reader-state-text">لم يتم العثور على محتوى هذه الصفحة ضمن الوحدة. سيتم توفيرها لاحقًا.</p>
        </div>
      );
    case "unavailable":
      return (
        <div className="learning-reader-state" role="status">
          <p className="learning-reader-state-title">المحتوى التفاعلي لهذه الصفحة قيد الإعداد</p>
          <p className="learning-reader-state-text">
            يجري تحويل هذه المادة من الكتاب إلى صفحة تعليمية تفاعلية مع الحفاظ على محتواها الأصلي.
          </p>
          <dl className="learning-reader-state-meta">
            <div><dt>الصفحة</dt><dd>{header.pageTitle}</dd></div>
            <div><dt>الوحدة</dt><dd>{header.moduleTitle}</dd></div>
            <div><dt>الدرس</dt><dd>{header.lessonTitle}</dd></div>
          </dl>
        </div>
      );
    case "ready":
      return (
        <div className="learning-reader-blocks">
          {ctx.study && <StudyPageBar page={body.page} host={ctx.study} />}
          {body.page.blocks.map(block => <BlockView key={block.id} block={block} ctx={ctx} />)}
        </div>
      );
  }
}

/**
 * The quiet study-points line of a page that carries eligible exercises: «نقاط الدراسة لهذه الصفحة: n / 2» (+ the
 * module's «n / 15» when the host knows it). Only what the SERVER reported is shown; a page without an eligible
 * exercise shows nothing. Never an animation, never a modal.
 */
function StudyPageBar({ page, host }: { page: ContentPage; host: StudyHost }) {
  if (eligibleStudyActivities(page).length === 0) return null;
  const status = host.pageStatus(page.id);
  if (status.kind === "loading") return <p className="learning-reader-study is-loading" role="status">جارٍ تحميل نقاط الدراسة...</p>;
  if (status.kind === "error") return <p className="learning-reader-study is-error" role="status">تعذّر تحميل نقاط الدراسة لهذه الصفحة.</p>;
  const full = status.points >= status.max;
  return (
    <p className={"learning-reader-study" + (full ? " is-full" : "")} role="status">
      <span className="learning-reader-study-page">
        {full ? "اكتملت نقاط الدراسة لهذه الصفحة: " : "نقاط الدراسة لهذه الصفحة: "}
        <span dir="ltr">{status.points} / {status.max}</span>
      </span>
      {status.module && (
        <span className="learning-reader-study-module">نقاط الدراسة في هذه الوحدة: <span dir="ltr">{status.module.points} / {status.module.max}</span></span>
      )}
    </p>
  );
}

// ── provenance wrapper ──────────────────────────────────────────────────────────────────────────────────────
/**
 * A teacher-enrichment block that already renders its OWN complete framed surface (a bordered card / figure) does not
 * also need the heavy tinted enrichment box around it — that only produces nested surfaces and stacked blue boxes.
 * These "self-framed" blocks keep the small textual enrichment tag (the non-color-only provenance marker) but drop the
 * outer container (see `.is-selfframed` in reader.css): visual (`.eb-visual-figure`), the interactive activities
 * (`.learning-activity` card), the practice-table (its bordered worksheet) and inline practice (its bordered option
 * controls). Text-like enrichment (clarification, example, an enrichment text/list) keeps the light tinted container so
 * it stays visibly separate from ordinary book prose.
 */
function isSelfFramedEnrichment(block: ContentBlock): boolean {
  return block.type === "visual" || block.type === "practice" || block.type === "practice-table" || isActivityBlock(block);
}
function BlockView({ block, ctx }: { block: ContentBlock; ctx: ActivityRenderContext }) {
  if (block.origin !== "teacher-enrichment") {
    return <div className="learning-reader-block is-book">{renderBlock(block, ctx)}</div>;
  }
  const label = enrichmentLabel(block);
  const selfFramed = isSelfFramedEnrichment(block);
  return (
    <section className={"learning-reader-block is-enrichment" + (selfFramed ? " is-selfframed" : "") + " kind-" + block.type} aria-label={label}>
      <p className="learning-reader-enrichment-tag"><IconSparkles size={13} aria-hidden="true" />{label}</p>
      {renderBlock(block, ctx)}
    </section>
  );
}

function enrichmentLabel(block: ContentBlock): string {
  if (block.type === "callout" && block.kind === "clarification") return "توضيح المعلم";
  if (block.type === "practice") return "جرّب بنفسك";
  if (isActivityBlock(block)) return ACTIVITY_ENRICHMENT_LABEL[block.type];
  if (block.type === "example") return "مثال إضافي";
  if (block.type === "visual") return "رسم توضيحي";
  return "إثراء تعليمي";
}

// ── block bodies ────────────────────────────────────────────────────────────────────────────────────────────
const CALLOUT_LABELS: Record<CalloutKind, string> = {
  remember: "تذكّر", important: "مهم", warning: "تنبيه", tip: "نصيحة", summary: "الخلاصة", clarification: "توضيح المعلم",
};

/** Generic labelled/feature list. `cards` → a responsive grid (collapses on mobile); `checklist` → checked rows;
 *  `plain` → a simple list. Semantic <ul>/<li>; term is a real <strong>; text is safe spans, never raw HTML. */
function ListView({ block }: { block: ListBlock }) {
  const variant = block.variant ?? "cards";
  // An "ordered" list is a real <ol> (numbered procedure); every other variant is a semantic <ul>.
  const ListTag = variant === "ordered" ? "ol" : "ul";
  return (
    <div className={"learning-reader-list variant-" + variant}>
      {block.title && <p className="learning-reader-list-title">{block.title}</p>}
      <ListTag className="learning-reader-list-items">
        {block.items.map(it => (
          <li key={it.id} className="learning-reader-list-item">
            {variant === "checklist" && <IconCheck size={16} className="learning-reader-list-check" aria-hidden="true" />}
            <div className="learning-reader-list-itembody">
              {it.term && <span className="learning-reader-list-term">{it.term}</span>}
              <span className="learning-reader-list-text" dir={block.dir}><RichTextRenderer spans={it.text} /></span>
              {it.note && <span className="learning-reader-list-note">{it.note}</span>}
            </div>
          </li>
        ))}
      </ListTag>
    </div>
  );
}

/** Generic unit-opener hero content (unit label + number + title + subtitle + goal). Course-agnostic. The title
 *  carries the reader's focus id/class so post-navigation focus lands here on opener pages too. */
function UnitOpenerView({ block, headed = false }: { block: UnitOpenerBlock; headed?: boolean }) {
  const titleProps = headed ? { id: "learning-reader-page-title", className: "learning-reader-opener-title", tabIndex: -1 as const } : { className: "learning-reader-opener-title" };
  return (
    <div className="learning-reader-opener">
      {block.unitNumber && <span className="learning-reader-opener-number" aria-hidden="true">{block.unitNumber}</span>}
      <div className="learning-reader-opener-body">
        {block.unitLabel && <p className="learning-reader-opener-label">{block.unitLabel}</p>}
        <h2 {...titleProps}>{block.title}</h2>
        {block.subtitle && <p className="learning-reader-opener-subtitle">{block.subtitle}</p>}
        {block.goal && <p className="learning-reader-opener-goal">{block.goal}</p>}
      </div>
    </div>
  );
}

function renderBlock(block: ContentBlock, ctx: ActivityRenderContext): ReactNode {
  switch (block.type) {
    case "text":
      return <p className="learning-reader-text" dir={block.dir}><RichTextRenderer spans={block.spans} /></p>;
    case "heading": {
      const Tag = (`h${Math.min(block.level + 1, 6)}`) as "h3" | "h4" | "h5";
      return <Tag className="learning-reader-heading" dir={block.dir}>{block.text}</Tag>;
    }
    case "image":
      return (
        <figure className="learning-reader-figure">
          <img className="learning-reader-image" src={block.src} alt={block.decorative ? "" : block.alt} aria-hidden={block.decorative || undefined} loading="lazy" />
          {block.caption && <figcaption className="learning-reader-caption">{block.caption}</figcaption>}
        </figure>
      );
    case "callout":
      // A clarification is always teacher-enrichment, so it is already inside the enrichment wrapper, which supplies
      // the light tinted container AND the «توضيح المعلم» tag. Rendering its own bordered callout box + a matching
      // label here only nests a second surface and repeats the label — emit just the body (surface economy).
      if (block.kind === "clarification") {
        return <p className="learning-reader-callout-body" dir={block.dir}><RichTextRenderer spans={block.spans} /></p>;
      }
      return (
        <div className={"learning-reader-callout kind-" + block.kind}>
          <p className="learning-reader-callout-label">{block.title || CALLOUT_LABELS[block.kind]}</p>
          <p className="learning-reader-callout-body" dir={block.dir}><RichTextRenderer spans={block.spans} /></p>
        </div>
      );
    case "example":
      return <ExampleView block={block} />;
    case "table":
      return (
        <div className="learning-reader-tablewrap">
          <table className="learning-reader-table" dir={block.dir}>
            {block.caption && <caption>{block.caption}</caption>}
            <thead><tr>{block.headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
            {/* Optional per-COLUMN direction (generic): LTR technical cells inside an RTL table keep their digit order. */}
            <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} dir={block.columnDirs?.[c]}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <div className="learning-reader-codewrap">
          <pre className="learning-reader-code"><code dir="ltr" className={"lang-" + block.language}>{block.code}</code></pre>
        </div>
      );
    case "diagram":
      return block.src
        ? (
          <figure className="learning-reader-figure">
            <img className="learning-reader-image" src={block.src} alt={block.decorative ? "" : block.alt} aria-hidden={block.decorative || undefined} loading="lazy" />
            {block.caption && <figcaption className="learning-reader-caption">{block.caption}</figcaption>}
          </figure>
        )
        : (
          <div className="learning-reader-diagram-missing" role="img" aria-label={block.alt}>
            <IconWarning size={18} aria-hidden="true" />
            <span>الرسم التوضيحي قيد الإعداد</span>
          </div>
        );
    case "list":
      return <ListView block={block} />;
    case "unit-opener":
      return <UnitOpenerView block={block} />;
    case "practice":
      return <PracticeBlockView question={block.question} activityId={block.id} pageId={ctx.pageId} study={ctx.study} />;
    case "practice-table":
      return <PracticeTableView block={block} pageId={ctx.pageId} study={ctx.study} />;
    case "visual":
      return <VisualBlockView block={block} />;
    case "library-training":
      return <LibraryTrainingView block={block} host={ctx.training} />;
    // Interactive activities are DELEGATED to the engine shell (never rendered inline here): it resolves the
    // trusted registry (an exact allowlist; unmatched descriptors → faithful static fallback), isolates a live renderer, and owns
    // fullscreen/reduced-motion. This keeps the renderer lean and the security boundary in one place.
    case "simulation":
    case "animation":
    case "guided":
    case "interactive-diagram":
      return <LearningActivityHost block={block} courseId={ctx.courseId} registry={ctx.registry} emit={ctx.emit} />;
  }
}

function ExampleView({ block }: { block: Extract<ContentBlock, { type: "example" }> }) {
  const solved = (block.mode ?? "solved") === "solved";
  return (
    <div className="learning-reader-example">
      <p className="learning-reader-example-kicker">{solved ? "مثال محلول" : "مثال للحل"}</p>
      {block.title && <p className="learning-reader-example-title">{block.title}</p>}
      {block.prompt && <p className="learning-reader-example-prompt"><span className="learning-reader-example-tag">المطلوب</span>{block.prompt}</p>}
      {block.steps.length > 0 && (
        <ol className="learning-reader-example-steps">
          {block.steps.map((s, i) => (
            <li key={i}><span className="learning-reader-step-text">{s.text}</span>{s.note && <span className="learning-reader-step-note">{s.note}</span>}</li>
          ))}
        </ol>
      )}
      {solved && block.result !== undefined && (
        <p className="learning-reader-example-result"><span className="learning-reader-example-tag">النتيجة</span><span dir="ltr" className="learning-reader-mono">{block.result}</span></p>
      )}
      {solved && block.explanation && <p className="learning-reader-example-explain">{block.explanation}</p>}
    </div>
  );
}

/**
 * A `library-training` block: the book's printed training label plus whatever the HOST allows to be shown. The
 * content never carries a title, questions or answers; the host's status is the ONLY source of the title/best
 * result, so a training whose module is hidden from a class shows the printed label and the availability note only.
 * Never hardcodes training ids — any course can point at any registered training.
 */
function LibraryTrainingView({ block, host }: { block: LibraryTrainingBlock; host?: LibraryTrainingHost }) {
  const status = host ? host.status(block.trainingId) : null;
  const headingId = "learning-reader-training-" + block.id;
  const available = status?.kind === "available" ? status : null;
  const best = available?.best ?? null;
  const solved = !!best && best.attempts > 0;
  return (
    <section className={"learning-reader-training " + (available ? "is-available" : "is-pending")} aria-labelledby={headingId}>
      <p className="learning-reader-training-head">
        <span className="learning-reader-training-code" dir="ltr">{block.trainingId}</span>
        <span id={headingId} className="learning-reader-training-label">{block.label}</span>
      </p>
      {!host && <p className="learning-reader-training-note">يُحلّ هذا التدريب تفاعليًا من داخل المنصة.</p>}
      {status?.kind === "loading" && <p className="learning-reader-training-note" role="status">جارٍ التحقق من إتاحة التدريب...</p>}
      {status?.kind === "error" && (
        <p className="learning-reader-training-note" role="status">
          تعذّر التحقق من إتاحة التدريب.
          {host?.onRetry && <button type="button" className="eb-button is-quiet is-small" onClick={() => host.onRetry?.()}>إعادة المحاولة</button>}
        </p>
      )}
      {status?.kind === "unavailable" && (
        <>
          <p className="learning-reader-training-note">سيصبح متاحًا عند نشر الجزء المرتبط به.</p>
          <button type="button" className="eb-button learning-reader-training-cta" disabled aria-describedby={headingId}>ابدأ التدريب</button>
        </>
      )}
      {available && (
        <>
          <p className="learning-reader-training-title">{available.title}</p>
          {best
            ? <p className="learning-reader-training-best">أفضل نتيجة: <span dir="ltr">{best.bestPercentage}%</span>{best.maxPoints > 0 && <> · نقاط التقوية: <span dir="ltr">{best.bestPoints} / {best.maxPoints}</span></>}</p>
            : <p className="learning-reader-training-note">لم تحلّ هذا التدريب بعد.</p>}
          <button type="button" className="eb-button is-primary learning-reader-training-cta" onClick={() => host?.onOpen(block.trainingId)} aria-describedby={headingId}>
            <IconSparkles size={16} aria-hidden="true" />{solved ? "أعد التدريب" : "ابدأ التدريب"}
          </button>
        </>
      )}
    </section>
  );
}
