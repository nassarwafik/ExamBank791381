// Phase 21D-D.3 — VIRTUAL LAB C: an educational STRONG acid / STRONG base titration (pure; compiled into the shared server build).
//
// MODEL (the D.1 plan's bounded first case; weak-acid, polyprotic and buffer titrations are NOT supported and are refused):
//   * the neutralization equation is written from the two species and balanced by the D.2 exact solver; its coefficients give the mole ratio
//     (HCl + NaOH → NaCl + H₂O is 1 : 1; 2 HCl + Ca(OH)₂ → CaCl₂ + 2 H₂O is 2 : 1);
//   * EQUIVALENCE POINT: the volume of titrant that delivers exactly the stoichiometric amount — an exact fraction;
//   * pH after V mL: the excess strong acid (or base) δ = (n_H⁺ − n_OH⁻) / (V_analyte + V) gives [H₃O⁺] from the charge balance with Kw
//     (no approximation; at equivalence pH = 7.00 at 25 °C), volumes additive;
//   * END POINT: where the indicator is seen to change — taken at the middle of its transition range (≈ pK of the indicator). The end point
//     differs from the equivalence point; the difference is the INDICATOR ERROR (mL). An indicator is called suitable when that error does
//     not exceed the volume uncertainty of a burette titre, 2 × 0.05 mL = 0.10 mL; errors within ±0.01 mL of that limit are AMBIGUOUS
//     and may not be offered in a graded task.
// The burette (50 mL, graduations of 0.1 mL, read to ±0.05 mL, one drop ≈ 0.05 mL) and the stylised liquid / colour animation are
// illustrative; this is a virtual simulation, not a laboratory procedure.
import { validateReaction, balanceReaction } from "../reactions";
import { KW, PKW, acidBaseSpecies, excessRoot, indicatorMidpoint, type AcidBaseSpecies, type Indicator } from "./acidBase";
import { add, cmp, div, mul, parseDecimal, qi, sign, sub, toNumber, type Q } from "./exact";

export const BURETTE = Object.freeze({ capacityML: 50, graduationML: parseDecimal("0.1") as Q, readingUncertaintyML: parseDecimal("0.05") as Q, dropML: parseDecimal("0.05") as Q });
export const ENDPOINT_TOLERANCE_ML = 0.10;
export const ENDPOINT_AMBIGUITY_ML = 0.01;
export const TITRATION_LIMITS = Object.freeze({ concentrationMin: parseDecimal("0.0010") as Q, concentrationMax: parseDecimal("0.50") as Q, analyteMinML: 5, analyteMaxML: 50, equivalenceMinML: 5, equivalenceMaxML: 45 });

export type TitrationSpec = Readonly<{ analyte: { species: string; concentration: Q; volumeML: Q }; titrant: { species: string; concentration: Q } }>;
export type TitrationSetup = Readonly<{
  analyte: AcidBaseSpecies; titrant: AcidBaseSpecies; acidIsAnalyte: boolean; ca: Q; va: Q; cb: Q;
  coefficients: readonly [number, number]; equation: string; equivalenceML: Q; analyteMoles: Q;
}>;
export type TitrationResult = { ok: true; setup: TitrationSetup } | { ok: false; code: string };

const salt = (acid: AcidBaseSpecies, base: AcidBaseSpecies): string => {
  const cat = base.cation!, an = acid.anion!;
  const anion = cat.charge === 1 ? an.formula : an.group ? "(" + an.formula + ")" + cat.charge : an.formula + cat.charge;
  return cat.symbol + anion;
};
/** Validates the pair and derives the equation, mole ratio and the exact equivalence volume. */
export function titrationSetup(spec: TitrationSpec): TitrationResult {
  const analyte = acidBaseSpecies(spec.analyte.species), titrant = acidBaseSpecies(spec.titrant.species), L = TITRATION_LIMITS;
  if (!analyte || !titrant) return { ok: false, code: "LAB_TITRATION_SPECIES_UNKNOWN" };
  const strong = (s: AcidBaseSpecies) => s.kind === "strongAcid" || s.kind === "strongBase";
  if (!strong(analyte) || !strong(titrant)) return { ok: false, code: "LAB_TITRATION_UNSUPPORTED" }; // weak / buffered systems: not modelled
  if ((analyte.kind === "strongAcid") === (titrant.kind === "strongAcid")) return { ok: false, code: "LAB_TITRATION_PAIR_INVALID" };
  const inRange = (c: Q, s: AcidBaseSpecies) => cmp(c, L.concentrationMin) >= 0 && cmp(c, L.concentrationMax) <= 0 && cmp(c, s.cMax) <= 0;
  if (!inRange(spec.analyte.concentration, analyte) || !inRange(spec.titrant.concentration, titrant)) return { ok: false, code: "LAB_TITRATION_CONCENTRATION_RANGE" };
  if (cmp(spec.analyte.volumeML, qi(L.analyteMinML)) < 0 || cmp(spec.analyte.volumeML, qi(L.analyteMaxML)) > 0) return { ok: false, code: "LAB_TITRATION_VOLUME_RANGE" };
  const acidIsAnalyte = analyte.kind === "strongAcid", acid = acidIsAnalyte ? analyte : titrant, base = acidIsAnalyte ? titrant : analyte;
  // the neutralization equation, balanced EXACTLY by the D.2 engine — the stoichiometric ratio is never typed by hand
  const r = validateReaction({ reactants: [{ formula: acid.formula, charge: 0 }, { formula: base.formula, charge: 0 }], products: [{ formula: salt(acid, base), charge: 0 }, { formula: "H2O", charge: 0 }] });
  if (!r.ok) return { ok: false, code: "LAB_TITRATION_EQUATION_INVALID" };
  const b = balanceReaction(r.reaction);
  if (!b.ok) return { ok: false, code: "LAB_TITRATION_EQUATION_INVALID" };
  const [aCoef, bCoef] = b.coefficients;
  const analyteMoles = mul(spec.analyte.concentration, div(spec.analyte.volumeML, qi(1000)));
  // moles of titrant needed = moles of analyte × (titrant coefficient / analyte coefficient)
  const ratio = acidIsAnalyte ? div(qi(bCoef), qi(aCoef)) : div(qi(aCoef), qi(bCoef));
  const equivalenceML = mul(div(mul(analyteMoles, ratio), spec.titrant.concentration), qi(1000));
  if (cmp(equivalenceML, qi(L.equivalenceMinML)) < 0 || cmp(equivalenceML, qi(L.equivalenceMaxML)) > 0) return { ok: false, code: "LAB_TITRATION_EQUIVALENCE_RANGE" };
  const coef = (n: number) => (n === 1 ? "" : String(n));
  const equation = coef(aCoef) + acid.formula + " + " + coef(bCoef) + base.formula + " → " + coef(b.coefficients[2]) + salt(acid, base) + " + " + coef(b.coefficients[3]) + "H2O";
  return { ok: true, setup: Object.freeze({ analyte, titrant, acidIsAnalyte, ca: spec.analyte.concentration, va: spec.analyte.volumeML, cb: spec.titrant.concentration, coefficients: [aCoef, bCoef] as const, equation, equivalenceML, analyteMoles }) };
}
/** Excess strong acid (mol/L, negative = excess base) after V mL of titrant — exact. */
export function excessAcid(s: TitrationSetup, vML: Q): Q {
  const acidSpecies = s.acidIsAnalyte ? s.analyte : s.titrant, baseSpecies = s.acidIsAnalyte ? s.titrant : s.analyte;
  const vaL = div(s.va, qi(1000)), vL = div(vML, qi(1000));
  const nAcid = s.acidIsAnalyte ? mul(s.ca, vaL) : mul(s.cb, vL), nBase = s.acidIsAnalyte ? mul(s.cb, vL) : mul(s.ca, vaL);
  const nH = mul(nAcid, qi(acidSpecies.ions)), nOH = mul(nBase, qi(baseSpecies.ions));
  return div(sub(nH, nOH), add(vaL, vL));
}
/** pH after V mL of titrant (25 °C). */
export const titrationPh = (s: TitrationSetup, vML: Q): number => -Math.log10(excessRoot(toNumber(excessAcid(s, vML))));
/** The titrant volume (mL) at which the solution reaches a given pH (exact algebra on the double [H₃O⁺]): V = (n_excess − δ·Va) / (c·ions + δ) ... */
export function volumeAtPh(s: TitrationSetup, pH: number): number {
  const h = 10 ** -pH, delta = h - KW / h; // excess acid concentration (mol/L) at that pH
  const acidSpecies = s.acidIsAnalyte ? s.analyte : s.titrant, baseSpecies = s.acidIsAnalyte ? s.titrant : s.analyte;
  const ca = toNumber(s.ca), cb = toNumber(s.cb), va = toNumber(s.va);
  if (s.acidIsAnalyte) {
    // δ(Va + V) = ions_a·ca·Va − ions_b·cb·V
    return (acidSpecies.ions * ca * va - delta * va) / (baseSpecies.ions * cb + delta);
  }
  // δ(Va + V) = ions_a·cb·V − ions_b·ca·Va
  return (baseSpecies.ions * ca * va + delta * va) / (acidSpecies.ions * cb - delta);
}
export const equivalencePh = (): number => PKW / 2;
/** The end point with an indicator (mid-range pH) and its error relative to the equivalence point (mL, + = after). */
export function indicatorEndpoint(s: TitrationSetup, ind: Indicator): { volumeML: number; errorML: number } {
  const v = volumeAtPh(s, indicatorMidpoint(ind));
  return { volumeML: v, errorML: v - toNumber(s.equivalenceML) };
}
export type Suitability = "suitable" | "unsuitable" | "ambiguous";
export function indicatorSuitability(s: TitrationSetup, ind: Indicator): Suitability {
  const e = Math.abs(indicatorEndpoint(s, ind).errorML);
  if (Math.abs(e - ENDPOINT_TOLERANCE_ML) <= ENDPOINT_AMBIGUITY_ML) return "ambiguous";
  return e <= ENDPOINT_TOLERANCE_ML ? "suitable" : "unsuitable";
}
/** Titrant additions a student may make: a multiple of one drop (0.05 mL), positive, not beyond the burette capacity. */
export const isBuretteStep = (v: Q): boolean => sign(v) > 0 && mul(v, qi(20)).d === 1n && cmp(v, qi(BURETTE.capacityML)) <= 0;
/** A curve for display: dense near the equivalence point, every value from the exact excess (never interpolated). */
export function titrationCurve(s: TitrationSetup, maxML: number): { v: number; pH: number }[] {
  const veq = toNumber(s.equivalenceML), pts = new Set<number>();
  for (let i = 0; i <= 100; i++) pts.add(Math.round((maxML * i / 100) * 1000) / 1000);
  for (const d of [-2, -1, -0.5, -0.2, -0.1, -0.05, -0.02, -0.01, 0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2]) {
    const v = Math.round((veq + d) * 1000) / 1000;
    if (v >= 0 && v <= maxML) pts.add(v);
  }
  return [...pts].sort((a, b) => a - b).map(v => ({ v, pH: titrationPh(s, parseDecimal(v.toFixed(3)) as Q) }));
}
