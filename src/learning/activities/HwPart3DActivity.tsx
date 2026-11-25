import { useMemo, useState } from "react";
import type { LearningActivityProps } from "./engine";
import Interactive3DView from "../../interactive3d/Interactive3DView";
import { readHwPart3D, type HwPart3D } from "./hwPart3d";

/**
 * HW-A1 (docs/enterprise-791283-course.md) — `interactive-diagram / hw-part-3d / v1`: a computer PART (a motherboard, a graphics
 * card, a network card, a cooler …) as a 3D model the learner turns, zooms and explores: choosing a piece of the model (on the
 * model itself or in the list under it) shows its name and a short explanation. The model is DATA — the platform's own
 * Interactive3DSceneSpecV1, drawn by the platform's own SVG renderer (no WebGL, no external asset, nothing executed); the
 * strict reader (hwPart3d.ts) refuses anything unexpected and the activity then says it is unavailable. The choice is
 * presentation only: never an answer, never stored, never sent. The shell's reset clears it.
 */
function Explorer({ cfg }: { cfg: HwPart3D }) {
  const [value, setValue] = useState<string[]>([]);
  const chosen = cfg.scene.targets.find(t => "object:" + t.id === value[0]);
  return (
    <div className="learning-hw3d">
      <div className="learning-hw3d-card" role="status" aria-live="polite">
        {chosen ? (
          <>
            <strong>{chosen.label}</strong>
            {chosen.detail && <p>{chosen.detail}</p>}
          </>
        ) : (
          <p>{cfg.hint ?? "اسحب النموذج لتدويره، ثم اختر جزءًا منه لترى اسمه ووظيفته."}</p>
        )}
      </div>
      <Interactive3DView
        spec={cfg.scene}
        selection={{ kind: "object", mode: "single", max: 1, value, onChange: setValue, label: "اختر جزءًا من النموذج لتقرأ عنه" }}
      />
    </div>
  );
}

export default function HwPart3DActivity({ block, commands }: LearningActivityProps) {
  const cfg = useMemo(() => readHwPart3D(block.config), [block.config]);
  if (!cfg) return <p className="learning-trace-empty" role="note">هذا النموذج غير متوفر حاليًا.</p>;
  return <Explorer key={commands.reset} cfg={cfg} />;
}
