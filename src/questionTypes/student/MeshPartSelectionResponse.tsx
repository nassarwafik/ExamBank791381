import { useMemo } from "react";
import type { StudentRendererProps } from "../registryTypes";
import MeshModel3DView from "../../meshModels/MeshModel3DView";
import { projectMeshPartSelectionConfigForStudent } from "../../meshPartSelectionQuestion";

// Phase 21D-B.3 — the student renderer of meshPartSelection@1 (lazy). The answer is the selected NAMED PART ids of the published model —
// by clicking the model (GPU pick of the front-most part) or through the accessible parts list, which keeps working when WebGL or the asset
// is unavailable: the student can always answer, and no rendering or network failure is ever turned into a mark.
export default function MeshPartSelectionResponse({ q, answer, onAnswer, disabled }: StudentRendererProps) {
  const cfg = useMemo(() => projectMeshPartSelectionConfigForStudent((q as { meshPartSelection?: unknown }).meshPartSelection), [q]);
  if (!cfg) return <p className="vq-unavailable" role="note" data-testid="mesh-selection-unavailable">تعذّر عرض النموذج ثلاثي الأبعاد؛ أبلغ معلّمك.</p>;
  const value = answer?.kind === "meshPartSelection" && answer.modelId === cfg.model.id ? answer.parts : [];
  const label = cfg.label ?? (cfg.maxSelections > 1 ? "اختر حتى " + cfg.maxSelections + " أجزاء من النموذج." : "اختر جزءًا واحدًا من النموذج.");
  return (
    <div className="mm3d-selection-response" data-testid="mesh-selection-response">
      <p className="mm3d-instruction">{label}</p>
      <MeshModel3DView model={cfg.model} selection={{ selected: value, max: cfg.maxSelections, disabled, onChange: next => { if (!disabled) onAnswer({ kind: "meshPartSelection", modelId: cfg.model.id, parts: next }); } }} />
    </div>
  );
}
