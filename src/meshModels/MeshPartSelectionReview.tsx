import { useMemo } from "react";
import MeshModel3DView from "./MeshModel3DView";
import { evaluateMeshPartSelection, validateMeshPartSelectionConfig } from "../meshPartSelectionQuestion";
import type { MeshMark } from "./meshRenderer";

// Phase 21D-B.3 — teacher review of a meshPartSelection@1 answer (lazy, teacher only). The same shared authority the server graded with
// re-evaluates the stored answer against the published key: every labelled part is listed with its REAL label (even when the student saw
// neutral names), and the model shows the marks (correct / incorrect / missed) in the image and as text. An unclassifiable config or key is
// reported, never guessed — the server has already routed such a question to manual review.
type Props = { answer: unknown; answerKey: unknown; config: unknown };
const MARK_TEXT: Readonly<Record<MeshMark, string>> = Object.freeze({ correct: "اختيار صحيح", incorrect: "اختيار غير صحيح", missed: "جزء صحيح لم يُختر" });

export default function MeshPartSelectionReview({ answer, answerKey, config }: Props) {
  const cfg = useMemo(() => validateMeshPartSelectionConfig(config), [config]);
  const ev = useMemo(() => evaluateMeshPartSelection(config, answerKey, answer), [config, answerKey, answer]);
  if (!cfg.ok || !ev.ok) {
    const issues = !ev.ok ? ev.issues : cfg.ok ? [] : cfg.issues;
    return <div className="mm3d-issues" role="note" data-testid="mesh-review-invalid"><strong>تعذّر تقييم إجابة النموذج ثلاثي الأبعاد آليًا؛ يحتاج تصحيحًا يدويًا.</strong><ul>{issues.slice(0, 5).map((i, k) => <li key={k}>{i.message}</li>)}</ul></div>;
  }
  const marks: Record<string, MeshMark> = {};
  for (const r of ev.results) if (r.mark) marks[r.id] = r.mark;
  const chosen = ev.results.filter(r => r.selected).map(r => r.id);
  return (
    <div className="mm3d-review" data-testid="mesh-review">
      <p className="mm3d-status" data-testid="mesh-review-summary">{ev.exact ? "إجابة صحيحة تمامًا" : "الأجزاء الصحيحة المختارة: " + ev.correct + " من " + ev.total}{cfg.config.hideLabels ? " · رأى الطالب أسماء محايدة للأجزاء" : ""}</p>
      <MeshModel3DView model={cfg.config.model} marks={marks} selection={{ selected: chosen, max: cfg.config.maxSelections, disabled: true, onChange: () => {} }} />
      <ul className="mm3d-review-list">
        {ev.results.filter(r => r.mark).map(r => <li key={r.id} className={"is-" + r.mark}><strong>{r.label}</strong> — {MARK_TEXT[r.mark as MeshMark]}</li>)}
      </ul>
    </div>
  );
}
