import type { SmartSimReviewDetailsProps } from "../trustedSim/smartSimUiRegistry";
import type { ChemLabConfigV1, ChemLabStateV1 } from "../chemistryLabModel";
import { resolveSmartSimPlugin } from "../trustedSimPlugins";
import { indicatorById } from "../chemistry/lab/acidBase";
import { answerUnits, experimentTitle, isolateQuantities, ltr, optionText, recordRow } from "./labView";
import "../chemistryStructure/chem.css";
import "./chemLab.css";

// Phase 21D-D.3 — chemistryLab@1 review details (lazy, teacher only): the SERVER-replayed bench state, the observation record and the saved
// answers, as text. The verdicts, the derived expected answers and their tolerances are the server's check list shown above this panel. The
// config is read through the REGISTERED plugin (the authority the server and the workspace use); the state is the one the server replayed.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export default function ChemLabReview({ config, state }: SmartSimReviewDetailsProps) {
  const r = resolveSmartSimPlugin("chemistryLab", 1)?.validateConfig(config);
  if (!r?.ok || !isObj(state) || !isObj(state.lab) || !Array.isArray(state.observations) || !isObj(state.answers)) return null;
  const cfg = r.config as ChemLabConfigV1, st = state as unknown as ChemLabStateV1, lab = st.lab;
  const bench = lab.kind === "solutions"
    ? (lab.flask === null ? "لم يُختر دورق" : "دورق " + ltr(lab.flask + " mL")) + " · " + (lab.mass !== null ? ltr(lab.mass + " g") : lab.pipette !== null ? "ماصّة " + ltr(lab.pipette + " mL") : "لم تُضف المادة") + " · " + (lab.madeUp ? "مكمّل إلى العلامة" : "غير مكمّل")
    : lab.kind === "titration" ? "قراءة السحاحة " + ltr(lab.added + " mL") + " · الكاشف: " + (lab.indicator ? indicatorById(lab.indicator)?.nameAr ?? lab.indicator : "بلا كاشف") : null;
  return (
    <div className="clab-review chem-review" data-testid="clab-review" dir="rtl">
      <p><strong>{experimentTitle(cfg)}</strong></p>
      {bench && <p data-testid="clab-review-bench">حالة الأدوات عند التسليم (أعاد الخادم بناءها): <span>{bench}</span></p>}
      <table>
        <caption>جدول ملاحظات الطالب ({st.observations.length})</caption>
        <thead><tr><th scope="col">#</th><th scope="col">النوع</th><th scope="col">العينة أو القراءة</th><th scope="col">ما لوحظ</th></tr></thead>
        <tbody>
          {st.observations.length === 0 ? <tr><td colSpan={4}>—</td></tr> : st.observations.map((o, i) => { const row = recordRow(cfg, o); return <tr key={i}><td>{i + 1}</td><td>{row.kind}</td><td>{row.what}</td><td>{row.detail}</td></tr>; })}
        </tbody>
      </table>
      <table>
        <caption>إجابات الطالب المحفوظة</caption>
        <thead><tr><th scope="col">المهمة</th><th scope="col">الإجابة</th></tr></thead>
        <tbody>
          {cfg.tasks.filter(t => t.kind === "number" || t.kind === "choice").map(t => {
            const a = st.answers[t.id];
            const text = !a ? "—" : a.kind === "number" ? ltr(a.value + " " + (t.kind === "number" ? answerUnits(cfg, t).find(u => u.id === a.unit)?.label ?? a.unit : a.unit)) : isolateQuantities(a.options.map(o => optionText(cfg, o)).join("، "));
            return <tr key={t.id} data-testid="clab-review-answer"><td>{isolateQuantities(t.label)}</td><td className={a && a.kind === "number" ? "clab-num" : undefined}>{text}</td></tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
