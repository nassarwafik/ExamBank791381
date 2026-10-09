import { useMemo } from "react";
import DataChart, { type ChartTargetMark } from "./DataChart";
import { evaluateChartSelection, projectChartSelectionConfigForStudent, TARGET_KIND_LABELS } from "../chartSelectionQuestion";

// Phase 21A.1 — the TEACHER review of a chartSelection@1 answer (lazy, inside the assignment review): the chart exactly as the student saw
// it, with the student's selection highlighted on the picture; every selectable target is marked in the chart's list — ✓ (selected and
// correct) / ✗ (selected, not correct) / ○ missed (correct, not selected) — and a text summary follows. It carries the key, so it is never
// part of a student bundle path.
type Props = { answer: unknown; answerKey: unknown; config: unknown };
export default function ChartSelectionReview({ answer, answerKey, config }: Props) {
  const cfg = useMemo(() => projectChartSelectionConfigForStudent(config), [config]);
  const e = useMemo(() => evaluateChartSelection(config, answerKey, answer), [config, answerKey, answer]);
  if (!cfg || !e.ok) return <div className="xp-chart-review" data-testid="chart-review"><p className="vq-unavailable" data-testid="chart-review-unavailable">لا يمكن تقييم هذا السؤال آليًا (إعداد الرسم أو مفتاح التصحيح غير صالح) — تصحيح يدوي.</p></div>;
  const marks: Record<string, ChartTargetMark> = {};
  for (const r of e.results) if (r.mark) marks[r.key] = r.mark;
  const selected = e.results.filter(r => r.selected).map(r => r.key);
  const expected = e.results.filter(r => r.expected).map(r => r.label);
  return (
    <div className="xp-chart-review" data-testid="chart-review">
      <DataChart spec={cfg.chart} selection={{ kind: cfg.target, mode: cfg.mode, max: cfg.maxSelections, value: selected, readOnly: true, marks, label: "اختيار الطالب (" + TARGET_KIND_LABELS[cfg.target] + ")" }} />
      <p className="vq-status" data-testid="chart-review-summary">{e.correct} من {e.total} صحيحة{selected.length > e.correct ? " · " + (selected.length - e.correct) + " اختيار غير صحيح" : ""}{e.exact ? " · إجابة مطابقة" : ""}. الإجابة المعتمدة: {expected.join("، ")}</p>
    </div>
  );
}
