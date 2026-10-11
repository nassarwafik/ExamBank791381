import { chemElement } from "../chemistry/elements";
import { chargeSuperscript, termText, type ReactionTerm, type ReactionV1 } from "../chemistry/reactions";
import type { CatalogTerm } from "../chemistry/reactionCatalog";
import { atomColor, atomInk } from "../chemistryStructure/chemView";
import { copiesFor, miniProjection, particleCaption, termMolecule, unitDots } from "./rxnView";

// Phase 21D-D.2 — the PARTICLE PICTURE of an equation (presentation only). Every term is drawn as `coefficient` separate particles: the
// coefficient is the NUMBER of particles, the subscripts are the atoms INSIDE one particle — the picture never merges the two. A catalog
// molecule (H₂, O₂, H₂O, CH₄, CO₂, NH₃ …) is drawn with its real ball-and-stick geometry (D.1 projection of NIST CCCBDB structures); any
// other species is a tile of element dots — an ionic compound is labelled as a formula unit, never drawn as a molecule. Decorative only for
// assistive technology: each group carries a text equivalent ("2 × جزيء H₂ — 4 ذرات H").
const SIZE = 56;
function MiniMolecule({ term }: { term: ReactionTerm }) {
  const m = termMolecule(term)!, p = miniProjection(m, SIZE);
  return (
    <svg className="rxn-particle-svg" viewBox={"0 0 " + SIZE + " " + SIZE} aria-hidden="true" focusable="false">
      {p.bonds.map(b => <line key={b.id} x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} className="rxn-bond" />)}
      {[...p.atoms].sort((a, b) => a.depth - b.depth).map(a => (
        <g key={a.id}><circle cx={a.x} cy={a.y} r={a.r} fill={atomColor(a.element)} className="rxn-atom" />
          {a.r >= 7 && <text x={a.x} y={a.y} dy="0.35em" fill={atomInk(a.element)} className="rxn-atom-text">{a.element}</text>}</g>
      ))}
    </svg>
  );
}
function UnitTile({ term }: { term: ReactionTerm }) {
  const dots = unitDots(term.composition);
  return (
    <span className="rxn-unit" aria-hidden="true">
      {dots ? <span className="rxn-dots">{dots.map((el, i) => <span key={i} className="rxn-dot" style={{ background: atomColor(el), color: atomInk(el) }}>{el}</span>)}</span>
        : <span className="rxn-unit-big rxn-ltr">{termText({ ...term, charge: 0, state: null })}</span>}
      {term.charge !== 0 && <span className="rxn-charge rxn-ltr">{chargeSuperscript(term.charge)}</span>}
    </span>
  );
}
const atomsText = (term: ReactionTerm, k: number) => Object.entries(term.composition).map(([el, n]) => (n * k) + " " + (chemElement(el)?.nameAr ?? el)).join("، ");
function TermGroup({ term, coefficient, catalogTerm }: { term: ReactionTerm; coefficient: number | null; catalogTerm?: CatalogTerm }) {
  const { drawn, more, unset } = copiesFor(coefficient), molecule = !!termMolecule(term), caption = particleCaption(term, catalogTerm?.kind);
  const label = unset ? "معامل " + termText(term) + " لم يُحدَّد بعد" : coefficient + " × " + caption + " " + termText(term) + " — " + atomsText(term, coefficient!);
  return (
    <li className={"rxn-group" + (unset ? " is-unset" : "")} role="img" aria-label={label} data-testid="rxn-particles-term" data-count={coefficient ?? 0}>
      <span className="rxn-group-head rxn-ltr"><b>{unset ? "?" : coefficient}</b> × {termText(term)}</span>
      <span className="rxn-copies">
        {Array.from({ length: drawn }, (_, i) => <span key={i} className="rxn-particle">{molecule ? <MiniMolecule term={term} /> : <UnitTile term={term} />}</span>)}
        {more > 0 && <span className="rxn-more rxn-ltr">+{more}</span>}
      </span>
      <small className="rxn-caption">{caption}</small>
    </li>
  );
}
export default function ParticleView({ reaction, coefficients, catalogTerms }: { reaction: ReactionV1; coefficients: readonly (number | null)[]; catalogTerms?: readonly CatalogTerm[] }) {
  const n = reaction.reactants.length;
  return (
    <figure className="rxn-particles" data-testid="rxn-particles">
      <div className="rxn-particles-row" dir="ltr">
        <ul className="rxn-side" aria-label="جسيمات المتفاعلات">{reaction.reactants.map((t, i) => <TermGroup key={i} term={t} coefficient={coefficients[i]} catalogTerm={catalogTerms?.[i]} />)}</ul>
        <span className="rxn-arrow" aria-hidden="true">→</span>
        <ul className="rxn-side" aria-label="جسيمات النواتج">{reaction.products.map((t, i) => <TermGroup key={i} term={t} coefficient={coefficients[n + i]} catalogTerm={catalogTerms?.[n + i]} />)}</ul>
      </div>
      <figcaption className="rxn-help">المعامل هو <strong>عدد الجسيمات</strong>؛ الرقم الصغير داخل الصيغة (مثل 2 في H₂) هو عدد الذرات داخل الجسيم الواحد ولا يتغير عند الوزن. الجزيئات المعروفة مرسومة بأشكالها الحقيقية؛ المركبات الأيونية تُمثَّل بوحدة صيغة لا بجزيء. الألوان وأحجام الذرات توضيحية.</figcaption>
    </figure>
  );
}
