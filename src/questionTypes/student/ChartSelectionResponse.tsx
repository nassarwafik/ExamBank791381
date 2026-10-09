import { useMemo } from "react";
import type { StudentRendererProps } from "../registryTypes";
import DataChart from "../../charts/DataChart";
import { projectChartSelectionConfigForStudent, TARGET_KIND_LABELS } from "../../chartSelectionQuestion";

// Phase 21A.1 — chartSelection@1 student renderer (lazy registry edge). It reads ONLY the strict public projection (the declarative chart,
// the target kind, the mode and the bound) — never the key — and emits semantic target keys on the SAME chart: { kind: "chartSelection",
// chartId, targets }. Pointer (click / tap on the picture) and keyboard / screen reader (the selection list) produce the same keys.
// Zoom, hover and legend state are never part of the answer.
export default function ChartSelectionResponse({ q, answer, onAnswer, disabled }: StudentRendererProps) {
  const cfg = useMemo(() => projectChartSelectionConfigForStudent((q as { chartSelection?: unknown }).chartSelection), [q]);
  if (!cfg) return <p className="vq-unavailable" role="note" data-testid="chart-unavailable">تعذّر عرض الرسم البياني لهذا السؤال؛ أبلغ معلّمك.</p>;
  const value = answer?.kind === "chartSelection" && answer.chartId === cfg.chart.id ? answer.targets : [];
  const label = cfg.label ?? (cfg.mode === "range" ? "حدّد النطاق على الرسم" : "اختر " + TARGET_KIND_LABELS[cfg.target] + " من الرسم");
  return (
    <div className="chart-selection-response" data-testid="chart-selection-response">
      <DataChart spec={cfg.chart} selection={{
        kind: cfg.target, mode: cfg.mode, max: cfg.maxSelections, value, label, readOnly: disabled,
        onChange: next => { if (!disabled) onAnswer({ kind: "chartSelection", chartId: cfg.chart.id, targets: next }); }
      }} />
    </div>
  );
}
