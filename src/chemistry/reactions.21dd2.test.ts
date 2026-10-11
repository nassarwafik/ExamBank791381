import { describe, expect, it } from "vitest";
import { checkReactionBalance, sameElementInventory, validateReaction } from "./reactions";

function valid(reactants: { formula: string; charge: number }[], products: { formula: string; charge: number }[]) {
  const result = validateReaction({ reactants, products });
  if (!result.ok) throw new Error(result.code + " at " + result.path);
  return result.reaction;
}
const term = (formula: string, charge = 0) => ({ formula, charge });

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
