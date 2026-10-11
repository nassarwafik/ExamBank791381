import type { SmartSimReviewDetailsProps } from "../trustedSim/smartSimUiRegistry";
import { rxnContext, type RxnConfigV1 } from "../chemistryReactionsModel";
import { studentCoefficients } from "../chemistryReactionsPlugin";
import { resolveSmartSimPlugin } from "../trustedSimPlugins";
import { conservationTable, equationText, termText } from "../chemistry/reactions";
import { REACTION_FAMILY_LABEL, REACTION_ROLE_LABEL, type ReactionFamily } from "../chemistry/reactionCatalog";
import ConservationPanel from "./ConservationPanel";
import "../chemistryStructure/chem.css";
import "./rxn.css";

// Phase 21D-D.2 — chemistryReactions@1 review details (lazy, teacher only): the student's SERVER-derived equation (given coefficients
// included), its atom-conservation table and the saved classifications and selections, as text. Views were never recorded. The config is
// read through the REGISTERED plugin (the authority the server and the workspace use), which also keeps the chemistry modules in the
// lazy plugin chunk instead of a separately preloaded one.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export default function RxnReview({ config, state }: SmartSimReviewDetailsProps) {
  const r = resolveSmartSimPlugin("chemistryReactions", 1)?.validateConfig(config);
  if (!r?.ok) return null;
  const cfg = r.config as RxnConfigV1, ctx = rxnContext(cfg), st = isObj(state) ? state : {};
  const coefficients = isObj(st.coefficients) ? (st.coefficients as Record<string, number>) : {};
  const classes = isObj(st.classifications) ? st.classifications : {}, sels = isObj(st.selections) ? st.selections : {};
  const coeffs = studentCoefficients({ coefficients }, cfg), table = conservationTable(ctx.reaction, coeffs);
  const terms = [...ctx.reaction.reactants, ...ctx.reaction.products];
  const termName = (id: string) => { const i = ctx.termIds.indexOf(id); return i >= 0 ? termText(terms[i]) : id; };
  return (
    <div className="rxn-review chem-review" data-testid="rxn-review" dir="rtl">
      <p>{ctx.catalog ? ctx.catalog.nameAr : "معادلة كتبها المعلم"}</p>
      {cfg.tasks.balance && <>
        <p>معادلة الطالب: <span className="rxn-ltr rxn-formula" data-testid="rxn-review-equation">{equationText(ctx.reaction, coeffs, { explicitOnes: true })}</span>
          {(cfg.tasks.balance.locked.length > 0) && <small> (المعاملات المعطاة: {cfg.tasks.balance.locked.map(termName).join("، ")})</small>}</p>
        <ConservationPanel table={table} caption="حفظ الذرات في إجابة الطالب" live={false} />
      </>}
      {(cfg.tasks.classifications.length > 0 || cfg.tasks.selections.length > 0) && (
        <table>
          <caption>إجابات الطالب المحفوظة (محسوبة على الخادم)</caption>
          <thead><tr><th scope="col">المهمة</th><th scope="col">الإجابة</th></tr></thead>
          <tbody>
            {cfg.tasks.classifications.map(t => { const v = classes[t.id]; return <tr key={t.id}><td>{t.label}</td><td>{Array.isArray(v) && v.length ? v.map(f => REACTION_FAMILY_LABEL[f as ReactionFamily] ?? String(f)).join("، ") : "—"}</td></tr>; })}
            {cfg.tasks.selections.map(t => { const v = sels[t.id]; return <tr key={t.id}><td>{t.label} <small>({REACTION_ROLE_LABEL[t.role]})</small></td><td className="rxn-ltr">{Array.isArray(v) && v.length ? v.map(x => termName(String(x))).join(", ") : "—"}</td></tr>; })}
          </tbody>
        </table>
      )}
    </div>
  );
}
