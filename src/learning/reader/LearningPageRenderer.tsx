import type { ReactNode } from "react";
import { IconWarning, IconBook, IconSparkles } from "../../icons";
import RichTextRenderer from "./RichTextRenderer";
import type {
  ContentBlock, ContentPage, ContentSource, CalloutKind, PracticeQuestion,
} from "../content/types";

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
 * nothing is regrouped. No answer keys are ever emitted to the DOM (see PracticeBlockView).
 */
export default function LearningPageRenderer({ header, body }: { header: ReaderPageHeader; body: ReaderPageBody }) {
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
        <ReaderBody header={header} body={body} />
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

function ReaderBody({ header, body }: { header: ReaderPageHeader; body: ReaderPageBody }) {
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
          {body.page.blocks.map(block => <BlockView key={block.id} block={block} />)}
        </div>
      );
  }
}

// ── provenance wrapper ──────────────────────────────────────────────────────────────────────────────────────
function BlockView({ block }: { block: ContentBlock }) {
  if (block.origin !== "teacher-enrichment") {
    return <div className="learning-reader-block is-book">{renderBlock(block)}</div>;
  }
  const label = enrichmentLabel(block);
  return (
    <section className={"learning-reader-block is-enrichment kind-" + block.type} aria-label={label}>
      <p className="learning-reader-enrichment-tag"><IconSparkles size={13} aria-hidden="true" />{label}</p>
      {renderBlock(block)}
    </section>
  );
}

function enrichmentLabel(block: ContentBlock): string {
  if (block.type === "callout" && block.kind === "clarification") return "توضيح المعلم";
  if (block.type === "practice") return "جرّب بنفسك";
  if (block.type === "simulation") return "محاكاة";
  if (block.type === "example") return "مثال إضافي";
  return "إثراء تعليمي";
}

// ── block bodies ────────────────────────────────────────────────────────────────────────────────────────────
const CALLOUT_LABELS: Record<CalloutKind, string> = {
  remember: "تذكّر", important: "مهم", warning: "تنبيه", tip: "نصيحة", summary: "الخلاصة", clarification: "توضيح المعلم",
};

function renderBlock(block: ContentBlock): ReactNode {
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
          <table className="learning-reader-table">
            {block.caption && <caption>{block.caption}</caption>}
            <thead><tr>{block.headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
            <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody>
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
    case "practice":
      return <PracticeBlockView question={block.question} />;
    case "simulation":
      return (
        <div className="learning-reader-simulation">
          <p className="learning-reader-simulation-kicker">محاكاة تفاعلية</p>
          <p className="learning-reader-simulation-title">{block.title}</p>
          {block.description && <p className="learning-reader-simulation-desc">{block.description}</p>}
          <p className="learning-reader-simulation-note">ستتوفر المحاكاة التفاعلية في مرحلة لاحقة.</p>
        </div>
      );
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
 * STATIC Phase-3 practice preview. It shows only the question prompt and the SHAPE of the answer (option texts /
 * an input placeholder). It NEVER renders the answer key: no `correct` flag, no `answer`/`answers`, and no
 * feedback (hint/correctFeedback/incorrectFeedback/explanation) reaches the DOM — not as text, attribute, prop or
 * label. Answer checking is Phase 4.
 */
function PracticeBlockView({ question }: { question: PracticeQuestion }) {
  return (
    <div className="learning-reader-practice">
      <p className="learning-reader-practice-prompt">{question.prompt}</p>
      {question.kind === "multipleChoice" && (
        <ul className="learning-reader-practice-options">
          {question.options.map(o => <li key={o.id} className="learning-reader-practice-option">{o.text}</li>)}
        </ul>
      )}
      {question.kind === "trueFalse" && (
        <ul className="learning-reader-practice-options">
          <li className="learning-reader-practice-option">صح</li>
          <li className="learning-reader-practice-option">خطأ</li>
        </ul>
      )}
      {(question.kind === "shortInput" || question.kind === "fillBlank") && (
        <p className="learning-reader-practice-input" aria-hidden="true">✎ ________</p>
      )}
      <p className="learning-reader-practice-hint">سيتوفر التحقق من الإجابة في مرحلة لاحقة.</p>
    </div>
  );
}
