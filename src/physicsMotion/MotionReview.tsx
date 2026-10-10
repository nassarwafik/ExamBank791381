import type { SmartSimReviewDetailsProps } from "../trustedSim/smartSimUiRegistry";
import { MOTION_EXPERIMENT_LABEL, MOTION_PRIMARY_AXES, validateMotionConfig } from "../physicsMotionModel";
import { MOTION_PARAM_SPEC, fmtMotion } from "../physics/motionCore";
import "./motion.css";

// Phase 21D-A.1 — physicsMotion@1 review details (lazy, teacher only): the AUTHORED experiment and the student's SERVER-derived saved
// measurements and graph points, as text. Exploration and playback were never recorded, so there is nothing else to show.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? fmtMotion(v) : "—");

export default function MotionReview({ config, state }: SmartSimReviewDetailsProps) {
  const r = validateMotionConfig(config);
  if (!r.ok) return null;
  const cfg = r.config, axes = MOTION_PRIMARY_AXES[cfg.experiment];
  const st = isObj(state) ? state : {};
  const measurements = isObj(st.measurements) ? st.measurements : {}, points = isObj(st.points) ? st.points : {};
  return (
    <div className="motion-review" data-testid="motion-review" dir="rtl">
      <p>{MOTION_EXPERIMENT_LABEL[cfg.experiment]}: <span className="motion-ltr">{MOTION_PARAM_SPEC[cfg.experiment].map(s => s.key + " = " + fmtMotion(cfg.params[s.key]) + (s.unit === "1" ? "" : " " + s.unit)).join(", ")}</span></p>
      <table>
        <caption>إجابات الطالب المحفوظة (محسوبة على الخادم)</caption>
        <thead><tr><th scope="col">المهمة</th><th scope="col">القيمة</th></tr></thead>
        <tbody>
          {cfg.tasks.measurements.map(m => <tr key={m.id}><td>{m.label}</td><td><span className="motion-ltr">{num(measurements[m.id])} {m.unit}</span></td></tr>)}
          {cfg.tasks.points.map(p => { const v = isObj(points[p.id]) ? (points[p.id] as Record<string, unknown>) : undefined; return <tr key={p.id}><td>{p.label}</td><td><span className="motion-ltr">{v ? "(" + axes.x + " = " + num(v.x) + " " + axes.xUnit + ", " + axes.y + " = " + num(v.y) + " " + axes.yUnit + ")" : "—"}</span></td></tr>; })}
        </tbody>
      </table>
    </div>
  );
}
