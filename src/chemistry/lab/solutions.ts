// Phase 21D-D.3 — VIRTUAL LAB A: solutions, concentration and dilution (pure; compiled into the shared server build).
//
// Models (ideal, 20–25 °C, volumes additive only in the sense of "made up to the mark of a volumetric flask"):
//   amount of solute   n = m / M                    (M from the D.1 CIAAW-2024 weights: exact integers ÷ 10⁴)
//   molar concentration c = n / V                   (V in litres)
//   dilution            n is conserved: c₁V₁ = c₂V₂  (an aliquot V₁ of a stock c₁ made up to V₂)
// Every result is an exact fraction. The glassware is a fixed, code-owned catalog of volumetric flasks and transfer pipettes; the balance
// reads to 0.01 g. A solution above its solute's supported concentration is OUTSIDE the model: it is reported as unsupported, never computed.
// The colour of a solution is ILLUSTRATIVE (a hue for coloured solutes, its intensity growing with c); it is not an optical prediction.
import { molarMassScaled, parseFormula } from "../formula";
import { CHEM_WEIGHT_SCALE } from "../elements";
import { cmp, div, mul, parseDecimal, pow10, q, qi, roundHalfAway, sign, sub, toNumber, type Q } from "./exact";

export const LAB_FLASKS_ML: readonly number[] = Object.freeze([25, 50, 100, 250, 500, 1000]);
export const LAB_PIPETTES_ML: readonly number[] = Object.freeze([1, 2, 5, 10, 20, 25, 50]);
export const BALANCE_RESOLUTION = parseDecimal("0.01") as Q;

export type LabSolute = Readonly<{
  id: string; formula: string; solutionFormula: string; nameAr: string; molarMass: Q;
  maxConcentration: Q; colour: string | null; note: string;
}>;
const mm = (formula: string): Q => {
  const p = parseFormula(formula);
  if (!p.ok) throw new Error("catalog formula " + formula);
  return q(BigInt(molarMassScaled(p.composition)), BigInt(CHEM_WEIGHT_SCALE));
};
const solute = (id: string, formula: string, solutionFormula: string, nameAr: string, max: string, colour: string | null, note: string): LabSolute =>
  Object.freeze({ id, formula, solutionFormula, nameAr, molarMass: mm(formula), maxConcentration: parseDecimal(max) as Q, colour, note });
/** The weighable solutes. The supported maximum concentration is a MODEL bound far below saturation at 20–25 °C (see the design record). */
export const LAB_SOLUTES: readonly LabSolute[] = Object.freeze([
  solute("NaCl", "NaCl", "NaCl", "كلوريد الصوديوم", "1.00", null, "محلول عديم اللون."),
  solute("KCl", "KCl", "KCl", "كلوريد البوتاسيوم", "1.00", null, "محلول عديم اللون."),
  solute("CaCl2", "CaCl2", "CaCl2", "كلوريد الكالسيوم", "1.00", null, "محلول عديم اللون."),
  solute("glucose", "C6H12O6", "C6H12O6", "الجلوكوز", "1.00", null, "مادة جزيئية لا تتأين؛ محلول عديم اللون."),
  solute("CuSO4", "CuSO4·5H2O", "CuSO4", "كبريتات النحاس (II) المائية", "0.50", "#1f78c8",
    "يُوزن البلّور المائي CuSO₄·5H₂O (الكتلة المولية تشمل ماء التبلور)؛ المحلول أزرق ويزداد لونه عمقًا كلما زاد التركيز (تمثيل توضيحي).")
]);
export const labSolute = (id: unknown): LabSolute | undefined => LAB_SOLUTES.find(s => s.id === id);

export type SolutionResult =
  | { ok: true; moles: Q; volumeL: Q; concentration: Q }
  | { ok: false; code: "LAB_SOLUTION_ABOVE_MODEL" | "LAB_SOLUTION_INVALID"; moles?: Q; volumeL?: Q };
const litres = (ml: number | Q): Q => mul(typeof ml === "number" ? qi(ml) : ml, pow10(-3));

/** A solid solute of mass m (g) dissolved and made up to the mark of a flask V (mL). */
export function prepareFromSolid(s: LabSolute, massG: Q, flaskML: number): SolutionResult {
  if (sign(massG) <= 0 || !LAB_FLASKS_ML.includes(flaskML)) return { ok: false, code: "LAB_SOLUTION_INVALID" };
  const moles = div(massG, s.molarMass), volumeL = litres(flaskML), concentration = div(moles, volumeL);
  if (cmp(concentration, s.maxConcentration) > 0) return { ok: false, code: "LAB_SOLUTION_ABOVE_MODEL", moles, volumeL };
  return { ok: true, moles, volumeL, concentration };
}
/** An aliquot V₁ (mL, pipette) of a stock c₁ (mol/L) made up to the mark of a flask V₂ (mL): n = c₁V₁ is conserved, c₂ = c₁V₁ / V₂. */
export function dilute(stock: Q, aliquotML: number, flaskML: number): SolutionResult {
  if (sign(stock) <= 0 || !LAB_PIPETTES_ML.includes(aliquotML) || !LAB_FLASKS_ML.includes(flaskML) || aliquotML >= flaskML) return { ok: false, code: "LAB_SOLUTION_INVALID" };
  const moles = mul(stock, litres(aliquotML)), volumeL = litres(flaskML);
  return { ok: true, moles, volumeL, concentration: div(moles, volumeL) };
}
/** The mass (g) a target c (mol/L) in V (mL) needs, exactly, and as the balance can weigh it (rounded to 0.01 g, half away from zero). */
export function requiredMass(s: LabSolute, concentration: Q, volumeML: number | Q): { exact: Q; weighable: Q } {
  const exact = mul(mul(concentration, litres(volumeML)), s.molarMass);
  return { exact, weighable: roundHalfAway(exact, 2) };
}
/** The aliquot V₁ = c₂V₂ / c₁ (mL) a dilution needs, exactly. */
export const requiredAliquot = (stock: Q, target: Q, flaskML: number): Q => div(mul(target, qi(flaskML)), stock);
/** The largest mass the configured balance offers: the supported concentration in the largest available flask, rounded DOWN to 0.01 g. */
export function balanceMax(s: LabSolute, flasksML: readonly number[]): Q {
  const v = Math.max(...flasksML), exact = mul(mul(s.maxConcentration, litres(v)), s.molarMass);
  const down = roundHalfAway(exact, 2);
  return cmp(down, exact) > 0 ? sub(down, BALANCE_RESOLUTION) : down;
}
/** A mass a student may put on the balance: a multiple of 0.01 g in (0, max]. */
export const isBalanceMass = (m: Q, maxMass: Q): boolean =>
  sign(m) > 0 && cmp(m, maxMass) <= 0 && mul(m, q(100n)).d === 1n;
/** Concentration of the same amount n spread over V (mL): the c-versus-V relation the workspace plots (c ∝ 1/V at constant n). */
export const concentrationAtVolume = (moles: Q, volumeML: number): Q => div(moles, litres(volumeML));
/** Illustrative colour intensity in [0, 1] (proportional to c / c_max); 0 for colourless solutes. */
export const illustrativeIntensity = (s: LabSolute, c: Q): number =>
  s.colour ? Math.max(0, Math.min(1, toNumber(div(c, s.maxConcentration)))) : 0;
