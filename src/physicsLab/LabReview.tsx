import type { SmartSimReviewDetailsProps } from "../trustedSim/smartSimUiRegistry";
import { LAB_EXPERIMENT_LABEL, LAB_PRIMARY_AXES, validateLabConfig } from "../physicsLabModel";
import { LAB_PARAM_SPEC, fmtLab } from "../physics/labCore";
import "./lab.css";

// Phase 21D-A.2 — physicsLab@1 review details (lazy, teacher only): the AUTHORED experiment and the student's SERVER-derived saved
// measurements and graph points, as text. Playback, dragging, meter selection and exploration were never recorded.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? fmtLab(v) : "—");

export default function LabReview({ config, state }: SmartSimReviewDetailsProps) {
  const r = validateLabConfig(config);
  if (!r.ok) return null;
  const cfg = r.config, axes = LAB_PRIMARY_AXES[cfg.experiment];
  const st = isObj(state) ? state : {};
  const measurements = isObj(st.measurements) ? st.measurements : {}, points = isObj(st.points) ? st.points : {};
  const params = LAB_PARAM_SPEC[cfg.experiment].map(s => { const o = s.options?.find(x => x.value === cfg.params[s.key]); return s.key + " = " + (o ? o.label : fmtLab(cfg.params[s.key]) + (s.unit === "1" ? "" : " " + s.unit)); });
  return (
    <div className="motion-review lab-review" data-testid="lab-review" dir="rtl">
      <p>{LAB_EXPERIMENT_LABEL[cfg.experiment]}: <span className="motion-ltr">{params.join(", ")}</span></p>
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
