import type { SmartSimReviewDetailsProps } from "../trustedSim/smartSimUiRegistry";
import { FUNCTION_STUDY_TASKS, validateFunctionStudyConfig } from "../functionStudyModel";
import { EXTREMUM_LABEL, INTERVAL_LABEL, TASK_TITLE, showEndpoint, showList, showPoint } from "./functionStudyLabels";
import "./function-study.css";

// Phase 20A.2 — functionStudy2d@1 review details (lazy, teacher only): the assigned function and the student's SERVER-derived analysis per
// enabled task group — as text (LTR numbers, ∞ symbols).
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const pt = (v: unknown) => (isObj(v) && typeof v.x === "number" && typeof v.y === "number" ? showPoint({ x: v.x, y: v.y }) : "—");
const arr = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);

export default function FunctionStudyReview({ config, state }: SmartSimReviewDetailsProps) {
  const r = validateFunctionStudyConfig(config);
  if (!r.ok) return null;
  const st = isObj(state) ? state : {};
  const text: Record<string, string> = {
    domainExclusions: showList(st.domainExclusions),
    xIntercepts: arr(st.xIntercepts).map(pt).join("، ") || "—",
    yIntercept: isObj(st.yIntercept) ? pt(st.yIntercept) : "—",
    verticalAsymptotes: showList(st.verticalAsymptotes),
    horizontalAsymptotes: showList(st.horizontalAsymptotes),
    extrema: arr(st.extrema).map(p => (EXTREMUM_LABEL[String(p.kind)] ?? "—") + " " + pt(p)).join("، ") || "—",
    monotonicIntervals: arr(st.monotonicIntervals).map(i => (INTERVAL_LABEL[String(i.kind)] ?? "—") + " (" + showEndpoint(i.from) + ", " + showEndpoint(i.to) + ")").join("، ") || "—"
  };
  return (
    <div className="fnstudy-review" data-testid="fnstudy-review">
      <p>الدالة: <code className="fnstudy-ltr" dir="ltr">f(x) = {r.config.expression.source}</code></p>
      <dl>
        {FUNCTION_STUDY_TASKS.filter(k => r.config.tasks[k]).map(k => <div key={k} style={{ display: "contents" }}><dt>{TASK_TITLE[k]}</dt><dd><span className="fnstudy-ltr">{text[k]}</span></dd></div>)}
      </dl>
    </div>
  );
}
