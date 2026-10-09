import { useMemo } from "react";
import type { StudentRendererProps } from "../registryTypes";
import FunctionGraphView from "../../functionGraphs/FunctionGraphView";
import { projectFunctionGraphSelectionConfigForStudent } from "../../functionGraphSelectionQuestion";
import { GRAPH_TARGET_KIND_LABELS } from "../../functionGraphs/graphTargets";

// Phase 21A.2 — functionGraphSelection@1 student renderer (lazy registry edge). It reads ONLY the strict public projection (the graph without
// teacher-only semantics, the target kind, the mode and the bound) — never the key — and emits semantic target keys on the SAME graph:
// { kind: "functionGraphSelection", graphId, targets }. Pointer / touch (the picture) and keyboard / screen reader (the selection list)
// produce the same keys. Zoom, pan and trace are never part of the answer.
export default function FunctionGraphSelectionResponse({ q, answer, onAnswer, disabled }: StudentRendererProps) {
  const cfg = useMemo(() => projectFunctionGraphSelectionConfigForStudent((q as { functionGraphSelection?: unknown }).functionGraphSelection), [q]);
  if (!cfg) return <p className="vq-unavailable" role="note" data-testid="graph-unavailable">تعذّر عرض رسم الدالة لهذا السؤال؛ أبلغ معلّمك.</p>;
  const value = answer?.kind === "functionGraphSelection" && answer.graphId === cfg.graph.id ? answer.targets : [];
  const label = cfg.label ?? "اختر " + GRAPH_TARGET_KIND_LABELS[cfg.target] + " من الرسم";
  return (
    <div className="fg-selection-response" data-testid="graph-selection-response">
      <FunctionGraphView spec={cfg.graph} selection={{
        kind: cfg.target, mode: cfg.mode, max: cfg.maxSelections, value, label, readOnly: disabled,
        onChange: next => { if (!disabled) onAnswer({ kind: "functionGraphSelection", graphId: cfg.graph.id, targets: next }); }
      }} />
    </div>
  );
}
