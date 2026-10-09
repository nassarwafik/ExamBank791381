import { useMemo } from "react";
import FunctionGraphView, { type GraphReviewMark } from "./FunctionGraphView";
import { evaluateFunctionGraphSelection, validateFunctionGraphSelectionConfig } from "../functionGraphSelectionQuestion";
import { GRAPH_TARGET_KIND_LABELS } from "./graphTargets";

// Phase 21A.2 — the TEACHER review of a functionGraphSelection@1 answer (lazy, inside the assignment review): the graph as the student saw it,
// the student's selection highlighted; every selectable target is marked in the graph's list — ✓ (selected and correct) / ✗ (selected, not
// correct) / ○ missed (correct, not selected) — and a text summary follows. It carries the key, so it is never part of a student bundle path.
type Props = { answer: unknown; answerKey: unknown; config: unknown };
export default function FunctionGraphSelectionReview({ answer, answerKey, config }: Props) {
  const cfg = useMemo(() => validateFunctionGraphSelectionConfig(config), [config]);
  const e = useMemo(() => evaluateFunctionGraphSelection(config, answerKey, answer), [config, answerKey, answer]);
  if (!cfg.ok || !e.ok) return <div className="fg-review" data-testid="graph-review"><p className="vq-unavailable" data-testid="graph-review-unavailable">لا يمكن تقييم هذا السؤال آليًا (إعداد الرسم أو مفتاح التصحيح غير صالح) — تصحيح يدوي.</p></div>;
  const marks: Record<string, GraphReviewMark> = {};
  for (const r of e.results) if (r.mark) marks[r.key] = r.mark;
  const selected = e.results.filter(r => r.selected).map(r => r.key);
  const expected = e.results.filter(r => r.expected).map(r => r.label + " " + r.detail);
  const c = cfg.config;
  return (
    <div className="fg-review" data-testid="graph-review">
      <FunctionGraphView spec={c.graph} selection={{ kind: c.target, mode: c.mode, max: c.maxSelections, value: selected, readOnly: true, review: marks, label: "اختيار الطالب (" + GRAPH_TARGET_KIND_LABELS[c.target] + ")" }} />
      <p className="vq-status" data-testid="graph-review-summary">{e.correct} من {e.total} صحيحة{selected.length > e.correct ? " · " + (selected.length - e.correct) + " اختيار غير صحيح" : ""}{e.exact ? " · إجابة مطابقة" : ""}. الإجابة المعتمدة: <bdi>{expected.join("، ")}</bdi></p>
    </div>
  );
}
