import { describe, expect, it } from "vitest";
import {
  BALANCE_FAILURE_MESSAGE, REACTION_LIMITS, balanceReaction, checkReactionBalance, conservationMatrix, conservationTable, describeChargeRow, describeConservationRow,
  equationText, integerNullSpace, reactionTermIds, sameElementInventory, termText, validateReaction, type ReactionV1
} from "./reactions";

function valid(reactants: { formula: string; charge: number; state?: string | null }[], products: { formula: string; charge: number; state?: string | null }[]) {
  const result = validateReaction({ reactants, products });
  if (!result.ok) throw new Error(result.code + " at " + result.path);
  return result.reaction;
}
const term = (formula: string, charge = 0) => ({ formula, charge });
/** "H2 + O2 = H2O" (charges as "Fe+2", "Cr2O7-2") — test shorthand only. */
const eq = (text: string): ReactionV1 => {
  const side = (s: string) => s.split(" + ").map(x => { const m = /^(.+?)([+-]\d+)?$/.exec(x.trim())!; return term(m[1], m[2] ? Number(m[2]) : 0); });
  const [l, r] = text.split(" = ");
  return valid(side(l), side(r));
};
const balance = (text: string) => balanceReaction(eq(text));

describe("21D-D.2 reaction conservation", () => {
  it("balances water with exact integer coefficients", () => {
    const r = valid([term("H2"), term("O2")], [term("H2O")]);
    expect(checkReactionBalance(r, [2, 1], [2])).toMatchObject({ ok: true, balanced: true, chargeDelta: "0", atomDelta: { H: "0", O: "0" } });
    expect(checkReactionBalance(r, [1, 1], [1])).toMatchObject({ ok: true, balanced: false });
  });
  it("balances nitrogen and hydrogen into ammonia", () => {
    const r = valid([term("N2"), term("H2")], [term("NH3")]);
    expect(checkReactionBalance(r, [1, 3], [2])).toMatchObject({ ok: true, balanced: true });
  });
  it("handles parenthesized molecules without floating point", () => {
    const r = valid([term("Ca(OH)2"), term("HCl")], [term("CaCl2"), term("H2O")]);
    expect(checkReactionBalance(r, [1, 2], [1, 2])).toMatchObject({ ok: true, balanced: true });
  });
  it("rejects atom-balanced but charge-unbalanced ionic equations", () => {
    const r = valid([term("Na", 1), term("Cl", -1)], [term("NaCl", 1)]);
    expect(checkReactionBalance(r, [1, 1], [1])).toMatchObject({ ok: true, balanced: false, chargeDelta: "-1", atomDelta: { Cl: "0", Na: "0" } });
  });
  it("accepts a charge-balanced ionic equation", () => {
    const r = valid([term("Na", 1), term("Cl", -1)], [term("NaCl")]);
    expect(checkReactionBalance(r, [1, 1], [1])).toMatchObject({ ok: true, balanced: true });
  });
  it("rejects zero, negative, noninteger, enormous and mismatched coefficients", () => {
    const r = valid([term("H2"), term("O2")], [term("H2O")]);
    for (const nums of [[0, 1], [-1, 1], [1.5, 1], [1000, 1], [1], [NaN, 1]]) {
      expect(checkReactionBalance(r, nums, [1])).toEqual({ ok: false, code: "REACTION_COEFFICIENTS_INVALID" });
    }
  });
  it("rejects malformed and noncanonical published reaction formulas", () => {
    for (const formula of ["H02", "h2", "H₂O", "H2O!", "H2O "]) {
      const r = validateReaction({ reactants: [term(formula)], products: [term("H2O")] });
      expect(r.ok).toBe(false);
    }
  });
  it("rejects untrusted configuration keys and out-of-range charges", () => {
    expect(validateReaction({ reactants: [term("H2")], products: [term("H2O")], injected: true })).toMatchObject({ ok: false, code: "REACTION_SCHEMA_INVALID" });
    expect(validateReaction({ reactants: [{ formula: "H2", charge: 20 }], products: [term("H2O")] })).toMatchObject({ ok: false, code: "REACTION_TERM_INVALID" });
  });
  it("detects missing elements even when all coefficients are positive", () => {
    const r = valid([term("H2")], [term("H2O")]);
    expect(sameElementInventory(r)).toBe(false);
    expect(checkReactionBalance(r, [1], [1])).toMatchObject({ ok: true, balanced: false });
  });
});

describe("21D-D.2 strict reaction schema", () => {
  it("accepts an optional state symbol and refuses an unknown one, extra keys, unknown elements and repeated species", () => {
    expect(valid([{ formula: "H2", charge: 0, state: "g" }, { formula: "O2", charge: 0, state: null }], [term("H2O")]).reactants.map(t => t.state)).toEqual(["g", null]);
    expect(validateReaction({ reactants: [{ formula: "H2", charge: 0, state: "plasma" }], products: [term("H2O")] })).toMatchObject({ ok: false, code: "REACTION_TERM_INVALID" });
    expect(validateReaction({ reactants: [{ formula: "H2", charge: 0, note: "x" }], products: [term("H2O")] })).toMatchObject({ ok: false, code: "REACTION_TERM_INVALID" });
    expect(validateReaction({ reactants: [term("Ag")], products: [term("Ag2O")] })).toMatchObject({ ok: false, code: "REACTION_FORMULA_INVALID" });
    expect(validateReaction({ reactants: [term("Xx2")], products: [term("H2O")] })).toMatchObject({ ok: false, code: "REACTION_FORMULA_INVALID" });
    // the same species twice — even written differently (C2H5OH and C2H6O have the same composition)
    expect(validateReaction({ reactants: [term("H2O"), term("O2")], products: [term("H2O")] })).toMatchObject({ ok: false, code: "REACTION_TERM_DUPLICATE", path: "reaction.products[0]" });
    expect(validateReaction({ reactants: [term("C2H5OH"), term("C2H6O")], products: [term("CO2")] })).toMatchObject({ ok: false, code: "REACTION_TERM_DUPLICATE" });
    // same composition, different charge: two different species (Fe²⁺ and Fe³⁺)
    expect(validateReaction({ reactants: [term("Fe", 2)], products: [term("Fe", 3)] }).ok).toBe(true);
  });
  it("bounds the number of terms and the charges; refuses prototype-shaped input", () => {
    const many = Array.from({ length: REACTION_LIMITS.termsPerSide + 1 }, (_, i) => term("C" + (i + 1)));
    expect(validateReaction({ reactants: many, products: [term("H2")] })).toMatchObject({ ok: false, code: "REACTION_TERMS_INVALID" });
    const seven = Array.from({ length: 7 }, (_, i) => term("C" + (i + 1))), six = Array.from({ length: 6 }, (_, i) => term("H" + (i + 1)));
    expect(validateReaction({ reactants: seven, products: six })).toMatchObject({ ok: false, code: "REACTION_TERMS_INVALID" });
    expect(validateReaction({ reactants: [], products: [term("H2")] })).toMatchObject({ ok: false, code: "REACTION_TERMS_INVALID" });
    expect(validateReaction({ reactants: [term("Na", 9)], products: [term("Na")] })).toMatchObject({ ok: false, code: "REACTION_TERM_INVALID" });
    expect(validateReaction({ reactants: [term("Na", 1.5)], products: [term("Na")] })).toMatchObject({ ok: false, code: "REACTION_TERM_INVALID" });
    expect(validateReaction(JSON.parse('{"reactants":[{"formula":"H2","charge":0}],"products":[{"formula":"H2O","charge":0}],"__proto__":{"x":1}}'))).toMatchObject({ ok: false });
    expect(validateReaction(Object.create({ reactants: [term("H2")], products: [term("H2O")] }))).toMatchObject({ ok: false, code: "REACTION_SCHEMA_INVALID" });
    expect(validateReaction(null)).toMatchObject({ ok: false });
  });
});

describe("21D-D.2 exact balancing solver — scientific reference cases", () => {
  it.each([
    ["water formation", "H2 + O2 = H2O", [2, 1, 2]],
    ["ammonia synthesis", "N2 + H2 = NH3", [1, 3, 2]],
    ["methane combustion", "CH4 + O2 = CO2 + H2O", [1, 2, 1, 2]],
    ["iron oxidation", "Fe + O2 = Fe2O3", [4, 3, 2]],
    ["calcium carbonate decomposition", "CaCO3 = CaO + CO2", [1, 1, 1]],
    ["neutralization (HCl / NaOH)", "HCl + NaOH = NaCl + H2O", [1, 1, 1, 1]],
    ["neutralization (H2SO4 / NaOH)", "H2SO4 + NaOH = Na2SO4 + H2O", [1, 2, 1, 2]],
    ["parentheses: Ca(OH)2 + HCl", "Ca(OH)2 + HCl = CaCl2 + H2O", [1, 2, 1, 2]],
    ["parentheses on both sides", "Al2(SO4)3 + Ca(OH)2 = Al(OH)3 + CaSO4", [1, 3, 2, 3]],
    ["three products: NH4NO3", "NH4NO3 = N2 + O2 + H2O", [2, 2, 1, 4]],
    ["three products: NaHCO3", "NaHCO3 = Na2CO3 + H2O + CO2", [2, 1, 1, 1]],
    ["four products: KMnO4 + HCl", "KMnO4 + HCl = KCl + MnCl2 + Cl2 + H2O", [2, 16, 2, 2, 5, 8]],
    ["large coefficients: octane", "C8H18 + O2 = CO2 + H2O", [2, 25, 16, 18]],
    ["ionic redox (dichromate / iron)", "Fe+2 + Cr2O7-2 + H+1 = Fe+3 + Cr+3 + H2O", [6, 1, 14, 6, 2, 7]],
    ["ionic redox (permanganate / iron)", "MnO4-1 + Fe+2 + H+1 = Mn+2 + Fe+3 + H2O", [1, 5, 8, 1, 5, 4]],
    ["net ionic precipitation", "Ca+2 + CO3-2 = CaCO3", [1, 1, 1]],
    ["disproportionation in base", "Cl2 + OH-1 = Cl-1 + ClO3-1 + H2O", [3, 6, 5, 1, 3]]
  ])("%s", (_name, text, expected) => {
    const r = eq(text), b = balanceReaction(r);
    expect(b).toEqual({ ok: true, coefficients: expected });
    const t = conservationTable(r, expected);
    expect(t.balanced).toBe(true);
    expect(t.rows.every(x => x.balanced && x.reactants === x.products)).toBe(true);
  });
  it("conserves charge in ionic equations: the dichromate equation carries +24 on both sides", () => {
    const t = conservationTable(eq("Fe+2 + Cr2O7-2 + H+1 = Fe+3 + Cr+3 + H2O"), [6, 1, 14, 6, 2, 7]);
    expect(t.charge).toEqual({ reactants: 24, products: 24, delta: 0, balanced: true, complete: true });
    // atoms balanced but charge not: one Fe²⁺ short on both sides keeps the atoms equal and breaks the charge
    const off = conservationTable(eq("Fe+2 + Cr2O7-2 + H+1 = Fe+3 + Cr+3 + H2O"), [5, 1, 14, 5, 2, 7]);
    expect(off.rows.every(x => x.balanced)).toBe(true);
    expect(off.charge).toMatchObject({ reactants: 22, products: 21, balanced: false });
    expect(off.balanced).toBe(false);
  });
  it("finds the SMALLEST whole numbers and treats multiples as balanced but not lowest", () => {
    const r = eq("N2 + H2 = NH3");
    expect(balanceReaction(r)).toEqual({ ok: true, coefficients: [1, 3, 2] });
    expect(conservationTable(r, [3, 9, 6]).balanced).toBe(true);
    expect(conservationTable(r, [2, 6, 4]).balanced).toBe(true);
  });
  it("is independent of the order the terms are written in", () => {
    expect(balance("O2 + CH4 = H2O + CO2")).toEqual({ ok: true, coefficients: [2, 1, 2, 1] });
    expect(balance("H2O + Cl-1 = Cl2 + H2 + OH-1")).toEqual({ ok: true, coefficients: [2, 2, 1, 1, 2] });
    expect(balance("Cl-1 + H2O = OH-1 + H2 + Cl2")).toEqual({ ok: true, coefficients: [2, 2, 2, 1, 1] });
  });
});

describe("21D-D.2 exact balancing solver — impossible, unsupported and non-unique equations", () => {
  it("names the elements that appear on one side only", () => {
    expect(balance("H2 = H2O")).toEqual({ ok: false, code: "REACTION_ELEMENT_ONE_SIDE", elements: ["O"] });
    expect(balance("Na + Cl2 = NaCl + Br2")).toEqual({ ok: false, code: "REACTION_ELEMENT_ONE_SIDE", elements: ["Br"] });
  });
  it("diagnoses a charge that can never balance although the atoms can", () => {
    expect(balance("Na+1 + Cl-1 = NaCl+1")).toEqual({ ok: false, code: "REACTION_CHARGE_UNBALANCEABLE" });
    expect(balance("Fe+2 = Fe+3")).toEqual({ ok: false, code: "REACTION_CHARGE_UNBALANCEABLE" });
  });
  it("reports only the trivial solution (nullity 0)", () => {
    expect(balance("NO = N2O")).toEqual({ ok: false, code: "REACTION_UNBALANCEABLE" });
  });
  it("reports a one-dimensional solution that is not strictly positive", () => {
    // 2H2O → 2H2O2 − O2: the only balancing needs a NEGATIVE amount of oxygen
    expect(balance("H2O = H2O2 + O2")).toEqual({ ok: false, code: "REACTION_NO_POSITIVE_SOLUTION" });
  });
  it("refuses non-unique equations (several independent balancings) and returns a deterministic integer basis", () => {
    const r = eq("H2 + O2 = H2O + H2O2"), b = balanceReaction(r);
    expect(b).toMatchObject({ ok: false, code: "REACTION_NOT_UNIQUE", dimension: 2 });
    const basis = (b as { basis: string[][] }).basis.map(v => v.map(BigInt));
    expect(balanceReaction(r)).toEqual(b);
    const m = conservationMatrix(r, false);
    for (const v of basis) {
      for (const row of m) expect(row.reduce((s, a, j) => s + a * v[j], 0n)).toBe(0n);
      expect(v.find(x => x !== 0n)! > 0n).toBe(true);
    }
    // two genuinely different balanced mixtures exist: 2H₂ + O₂ → 2H₂O and H₂ + O₂ → H₂O₂ (and every positive combination)
    expect(conservationTable(r, [3, 2, 2, 1]).balanced).toBe(true);
    expect(conservationTable(r, [4, 3, 2, 2]).balanced).toBe(true);
  });
  it("refuses an equation whose smallest coefficients exceed the bound (exact, no overflow)", () => {
    // C: 998a = 999b, H: 999a = 998c ⇒ a = 997 002 — exactly computed, then refused
    expect(balance("C998H999 = C999 + H998")).toEqual({ ok: false, code: "REACTION_COEFFICIENTS_TOO_LARGE" });
    const basis = integerNullSpace(conservationMatrix(eq("C998H999 = C999 + H998"), false), 3);
    expect(basis.map(v => v.map(String))).toEqual([["997002", "996004", "998001"]]);
  });
  it("computes null spaces exactly for integer matrices", () => {
    expect(integerNullSpace([[1n, -1n]], 2).map(v => v.map(String))).toEqual([["1", "1"]]);
    expect(integerNullSpace([[2n, 0n, -1n], [0n, 2n, -1n]], 3).map(v => v.map(String))).toEqual([["1", "1", "2"]]);
    expect(integerNullSpace([[1n, 0n], [0n, 1n]], 2)).toEqual([]);
    expect(integerNullSpace([], 2).map(v => v.map(String))).toEqual([["1", "0"], ["0", "1"]]);
  });
  it("explains every refusal in Arabic", () => {
    for (const code of ["REACTION_ELEMENT_ONE_SIDE", "REACTION_CHARGE_UNBALANCEABLE", "REACTION_UNBALANCEABLE", "REACTION_NO_POSITIVE_SOLUTION", "REACTION_NOT_UNIQUE", "REACTION_COEFFICIENTS_TOO_LARGE"] as const) {
      expect(BALANCE_FAILURE_MESSAGE[code]).toMatch(/[؀-ۿ]/);
    }
  });
});

describe("21D-D.2 conservation table and presentation text", () => {
  const water = eq("H2 + O2 = H2O");
  it("counts each element on both sides and explains the difference", () => {
    const t = conservationTable(water, [1, 1, 1]);
    expect(t.rows).toEqual([
      { element: "H", reactants: 2, products: 2, delta: 0, balanced: true, complete: true },
      { element: "O", reactants: 2, products: 1, delta: 1, balanced: false, complete: true }
    ]);
    expect(t.charge).toBeNull();
    expect(t.complete).toBe(true);
    expect(t.balanced).toBe(false);
    expect(describeConservationRow(t.rows[1], "الأكسجين")).toBe("الأكسجين O: 2 في المتفاعلات و1 في النواتج — يزيد في المتفاعلات بمقدار 1");
    expect(describeConservationRow({ element: "H", reactants: 2, products: 4 })).toBe("H: 2 في المتفاعلات و4 في النواتج — يزيد في النواتج بمقدار 2");
    expect(describeConservationRow({ element: "H", reactants: 4, products: 4 })).toContain("محفوظ");
    expect(describeChargeRow({ reactants: 3, products: -1 })).toBe("الشحنة الكلية: +3 في المتفاعلات و−1 في النواتج — غير محفوظة (الفرق 4)");
  });
  it("treats unset coefficients as incomplete (never balanced)", () => {
    const t = conservationTable(water, [2, null, 2]);
    expect(t.complete).toBe(false);
    expect(t.balanced).toBe(false);
    expect(t.rows.find(x => x.element === "O")).toMatchObject({ reactants: 0, products: 2 });
    // a row is complete only when every term holding the element has a coefficient: 0 = 0 of unset terms is NOT conservation
    const methane = eq("CH4 + O2 = CO2 + H2O"), m = conservationTable(methane, [1, null, 1, null]);
    expect(m.rows.map(x => [x.element, x.balanced, x.complete])).toEqual([["C", true, true], ["H", false, false], ["O", false, false]]);
    const ionic = conservationTable(eq("Fe+2 + Cr2O7-2 + H+1 = Fe+3 + Cr+3 + H2O"), [1, 1, null, null, null, null]);
    expect(ionic.charge).toEqual({ reactants: 0, products: 0, delta: 0, balanced: true, complete: false });
    expect(conservationTable(water, [2, 1]).complete).toBe(false);
    expect(conservationTable(water, [2, 0, 2]).complete).toBe(false);
  });
  it("writes formulas with subscripts, charges as superscripts and coefficients in front", () => {
    expect(termText({ formula: "Cr2O7", charge: -2, state: "aq" }, true)).toBe("Cr₂O₇²⁻(aq)");
    expect(termText({ formula: "Na", charge: 1, state: null }, true)).toBe("Na⁺");
    expect(equationText(water, [2, 1, 2])).toBe("2H₂ + O₂ → 2H₂O");
    expect(equationText(water, [2, 1, 2], { explicitOnes: true })).toBe("2H₂ + 1O₂ → 2H₂O");
    expect(equationText(water, [2, null, 2])).toBe("2H₂ + ?O₂ → 2H₂O");
    expect(reactionTermIds(eq("CH4 + O2 = CO2 + H2O"))).toEqual(["r1", "r2", "p1", "p2"]);
  });
});
