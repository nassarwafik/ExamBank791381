import { Suspense, lazy, useEffect, useId, useRef, type ReactNode } from "react";
import CodeStimulusView from "../questionTypes/CodeStimulusView";
import { isFirstScenarioMember, projectSectionScenariosForStudent, scenarioForQuestion, sourceKindLabel, type ScenarioV1, type SourceStimulusV1 } from "../scenarioSource";
import { useMediaQuery } from "../ui/useMediaQuery";
import "./scenario-student.css";
// Phase 20D.1 — the additive "rich" source kind renders through the trusted RichContent renderer (lazy). RichText re-checks the document
// with the strict authority (memoized) because composite source contexts reach ScenarioSources without this module's projection.
const RichText = lazy(() => import("../richContent/RichPrompt").then(m => ({ default: m.RichText })));

// Phase 19G — the ONE presentation of a scenario's shared sources (student exam, teacher preview, teacher review). It renders ONLY the
// strict canonical projection (a scenario that fails any rule renders nothing — the same authority the server applies), as a labelled
// region: heading → instructions → a native <details> holding the sources (open on the first linked question's page and on wide screens,
// collapsed afterwards so a student revisits the sources without scrolling back). Text is text (never HTML), a table is a semantic
// <table> (caption, column / row headers), an image carries its authored alt, code goes through the 19F CodeStimulusView (LTR, never
// executed). Answer state is untouched: the linked questions keep their own cards and ids.

/** A <details> whose initial state is set ONCE (the student's own toggle is never overridden by a re-render). */
function Details({ open, className, children }: { open: boolean; className: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => { if (ref.current) ref.current.open = open; }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- initial state only
  return <details ref={ref} className={className} open={open}>{children}</details>;
}

function SourceBody({ source: s }: { source: SourceStimulusV1 }) {
  if (s.kind === "text") return <p className="iex-scenario-text" dir="auto">{s.text}</p>;
  if (s.kind === "image") return s.image.dataUrl ? <img className="iex-image" src={s.image.dataUrl} alt={s.alt} /> : <p className="iex-scenario-unavailable" role="note">{s.alt} (الصورة غير متاحة حاليًا)</p>;
  if (s.kind === "table") return (
    <div className="iex-table-wrap">
      <table>
        {s.title && <caption>{s.title}</caption>}
        <thead><tr>{s.rowHeaders && <td aria-hidden="true" />}{s.columnHeaders.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
        <tbody>{s.rows.map((row, r) => <tr key={r}>{s.rowHeaders && <th scope="row">{s.rowHeaders[r]}</th>}{row.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  if (s.kind === "rich") return <Suspense fallback={<p className="iex-loading" role="status">جارٍ تحميل المصدر…</p>}><RichText raw={s.richContent} className="iex-scenario-rich" fallback={<p className="iex-scenario-unavailable" role="note">هذا المصدر غير متاح حاليًا.</p>} /></Suspense>;
  return <CodeStimulusView stimulus={{ language: s.language, source: s.source }} testId="scenario-code" />;
}

export function ScenarioSources({ scenario }: { scenario: ScenarioV1 }) {
  return (
    <ol className="iex-scenario-sources">
      {scenario.sources.map((s, i) => (
        <li key={s.id}>
          <figure className="iex-scenario-source" data-testid="scenario-source" data-kind={s.kind}>
            <figcaption><span>{s.title || sourceKindLabel(s.kind)}</span><span>{"المصدر " + (i + 1) + " / " + scenario.sources.length}</span></figcaption>
            <SourceBody source={s} />
          </figure>
        </li>
      ))}
    </ol>
  );
}

type ContextProps = { scenario: ScenarioV1; open: boolean; heading?: "h3" | "h4"; testId?: string; className?: string };
/** A CANONICAL scenario (already projected) as a labelled region — used by the student view below and by the teacher review. */
export function ScenarioContextView({ scenario: sc, open, heading = "h3", testId = "scenario-view", className = "iex-scenario" }: ContextProps) {
  const hid = "scn-h-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const H = heading;
  return (
    <section className={className} aria-labelledby={hid} data-testid={testId} data-scenario-id={sc.id}>
      <H id={hid} className="iex-scenario-title"><span className="iex-section-eyebrow">سيناريو</span>{sc.title || "مصادر مشتركة"}</H>
      {sc.instructions && <p className="iex-scenario-instructions">{sc.instructions}</p>}
      <Details open={open} className="iex-scenario-details">
        <summary>المصادر المشتركة ({sc.sources.length})</summary>
        <ScenarioSources scenario={sc} />
      </Details>
    </section>
  );
}

type ViewProps = { section: { questions?: unknown; scenarios?: unknown }; questionId: string; heading?: "h3" | "h4" };
/** The student / preview entry: resolves the question's scenario through the strict projection; nothing when the question has none. */
export default function ScenarioView({ section, questionId, heading = "h3" }: ViewProps) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const sc = scenarioForQuestion(projectSectionScenariosForStudent(section), questionId);
  if (!sc) return null;
  return <ScenarioContextView scenario={sc} open={wide || isFirstScenarioMember(sc, questionId)} heading={heading} />;
}
