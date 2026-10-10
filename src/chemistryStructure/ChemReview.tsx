import type { SmartSimReviewDetailsProps } from "../trustedSim/smartSimUiRegistry";
import { CHEM_ACTIVITY_LABEL, validateChemConfig } from "../chemistryStructureModel";
import { CHEM_OPTION_LABEL, fmtChem } from "../chemistryStructurePlugin";
import { chemElement } from "../chemistry/elements";
import { displayFormula } from "../chemistry/formula";
import { chemMolecule } from "../chemistry/molecules";
import { Nuclide } from "./ChemWorkspace";
import "./chem.css";

// Phase 21D-D.1 — chemistryStructure@1 review details (lazy, teacher only): the GIVEN subject and the student's SERVER-derived saved answers
// as text (particles, shells, values, formulas, classifications, selection). Rotation, zoom, measurement and table browsing were never recorded.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export default function ChemReview({ config, state }: SmartSimReviewDetailsProps) {
  const r = validateChemConfig(config);
  if (!r.ok) return null;
  const cfg = r.config, st = isObj(state) ? state : {};
  const particles = isObj(st.particles) ? st.particles : null, shells = Array.isArray(st.shells) ? st.shells : null;
  const values = isObj(st.values) ? st.values : {}, formulas = isObj(st.formulas) ? st.formulas : {}, classes = isObj(st.classifications) ? st.classifications : {};
  const selected = Array.isArray(st.selected) ? st.selected.map(String) : [];
  const s = cfg.subject;
  const m = s && "molecule" in s ? chemMolecule(s.molecule) : undefined;
  return (
    <div className="chem-review" data-testid="chem-review" dir="rtl">
      <p>{CHEM_ACTIVITY_LABEL[cfg.activity]}
        {s && "element" in s && <> — المعطى: <Nuclide s={s} /> ({chemElement(s.element)?.nameAr})</>}
        {m && <> — {m.nameAr} <span className="chem-ltr">{displayFormula(m.formula)}</span></>}
        {s && "formula" in s && <> — <span className="chem-ltr">{displayFormula(s.formula)}</span></>}
      </p>
      <table>
        <caption>إجابات الطالب المحفوظة (محسوبة على الخادم)</caption>
        <thead><tr><th scope="col">المهمة</th><th scope="col">الإجابة</th></tr></thead>
        <tbody>
          {cfg.tasks.build && <tr><td>بناء الذرة</td><td className="chem-ltr">{particles ? "p = " + particles.protons + ", n = " + particles.neutrons + ", e = " + particles.electrons : "—"}</td></tr>}
          {cfg.tasks.shells && <tr><td>توزيع الإلكترونات</td><td className="chem-ltr">{shells ? shells.join(", ") || "0" : "—"}</td></tr>}
          {cfg.tasks.values.map(t => <tr key={t.id}><td>{t.label}</td><td className="chem-ltr">{typeof values[t.id] === "number" ? fmtChem(values[t.id] as number) + (t.unit === "1" ? "" : " " + t.unit) : "—"}</td></tr>)}
          {cfg.tasks.formulas.map(t => <tr key={t.id}><td>{t.label}</td><td className="chem-ltr">{typeof formulas[t.id] === "string" ? displayFormula(formulas[t.id] as string) : "—"}</td></tr>)}
          {cfg.tasks.classifications.map(t => <tr key={t.id}><td>{t.label}</td><td>{typeof classes[t.id] === "string" ? CHEM_OPTION_LABEL[classes[t.id] as string] ?? String(classes[t.id]) : "—"}</td></tr>)}
          {cfg.tasks.selection && <tr><td>{cfg.tasks.selection.label}</td><td className="chem-ltr">{selected.join(", ") || "—"}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
