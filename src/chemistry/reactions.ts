// Phase 21D-D.2 — deterministic, server-shareable reaction conservation core.
// This module checks authored educational equations. It never executes reactions,
// suggests experimental procedures, or accepts trusted values from a student client.
import { parseFormula, type FormulaComposition } from "./formula";

export const REACTION_LIMITS = Object.freeze({
  termsPerSide: 8, totalTerms: 12, coefficientMax: 999, chargeAbsMax: 8
});

export type ReactionTermInput = Readonly<{ formula: string; charge: number }>;
export type ReactionTerm = Readonly<{
  formula: string; charge: number; composition: FormulaComposition;
}>;
export type ReactionV1 = Readonly<{
  reactants: readonly ReactionTerm[];
  products: readonly ReactionTerm[];
}>;
export type ReactionResult =
  | { ok: true; reaction: ReactionV1 }
  | { ok: false; code: string; path: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const hasKeys = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;

/** Strict published-reaction schema: formulas and integer charges are explicit. */
export function validateReaction(input: unknown): ReactionResult {
  if (!isRecord(input) || !hasKeys(input, ["reactants", "products"])) {
    return { ok: false, code: "REACTION_SCHEMA_INVALID", path: "reaction" };
  }
  if (!Array.isArray(input.reactants) || !Array.isArray(input.products) ||
    !input.reactants.length || !input.products.length ||
    input.reactants.length > REACTION_LIMITS.termsPerSide ||
    input.products.length > REACTION_LIMITS.termsPerSide ||
    input.reactants.length + input.products.length > REACTION_LIMITS.totalTerms) {
    return { ok: false, code: "REACTION_TERMS_INVALID", path: "reaction" };
  }
  const sides: ReactionTerm[][] = [[], []];
  for (const [sideIndex, raws] of [input.reactants, input.products].entries()) {
    for (const [i, raw] of raws.entries()) {
      const path = `reaction.${sideIndex === 0 ? "reactants" : "products"}[${i}]`;
      if (!isRecord(raw) || !hasKeys(raw, ["formula", "charge"]) ||
        typeof raw.formula !== "string" ||
        !integer(raw.charge, -REACTION_LIMITS.chargeAbsMax, REACTION_LIMITS.chargeAbsMax)) {
        return { ok: false, code: "REACTION_TERM_INVALID", path };
      }
      const parsed = parseFormula(raw.formula);
      if (!parsed.ok || parsed.text !== raw.formula) {
        return { ok: false, code: "REACTION_FORMULA_INVALID", path: path + ".formula" };
      }
      sides[sideIndex].push({ formula: parsed.text, charge: raw.charge, composition: parsed.composition });
    }
  }
  return { ok: true, reaction: { reactants: sides[0], products: sides[1] } };
}

export type ConservationResult =
  | { ok: true; balanced: boolean; atomDelta: Readonly<Record<string, string>>; chargeDelta: string }
  | { ok: false; code: "REACTION_COEFFICIENTS_INVALID" };

const sideCounts = (terms: readonly ReactionTerm[], coefficients: readonly number[]) => {
  const atoms = new Map<string, bigint>();
  let charge = 0n;
  terms.forEach((term, index) => {
    const factor = BigInt(coefficients[index]);
    charge += BigInt(term.charge) * factor;
    for (const [symbol, count] of Object.entries(term.composition)) {
      atoms.set(symbol, (atoms.get(symbol) ?? 0n) + BigInt(count) * factor);
    }
  });
  return { atoms, charge };
};

/** Positive bounded coefficients only; BigInt makes equality exact, never approximate. */
export function checkReactionBalance(
  reaction: ReactionV1,
  reactantCoefficients: readonly number[],
  productCoefficients: readonly number[]
): ConservationResult {
  if (reactantCoefficients.length !== reaction.reactants.length ||
      productCoefficients.length !== reaction.products.length ||
      ![...reactantCoefficients, ...productCoefficients].every(n =>
        integer(n, 1, REACTION_LIMITS.coefficientMax))) {
    return { ok: false, code: "REACTION_COEFFICIENTS_INVALID" };
  }
  const a = sideCounts(reaction.reactants, reactantCoefficients);
  const b = sideCounts(reaction.products, productCoefficients);
  const atomDelta: Record<string, string> = {};
  for (const symbol of [...new Set([...a.atoms.keys(), ...b.atoms.keys()])].sort()) {
    atomDelta[symbol] = ((a.atoms.get(symbol) ?? 0n) - (b.atoms.get(symbol) ?? 0n)).toString();
  }
  const chargeDelta = (a.charge - b.charge).toString();
  return {
    ok: true,
    balanced: chargeDelta === "0" && Object.values(atomDelta).every(n => n === "0"),
    atomDelta: Object.freeze(atomDelta),
    chargeDelta
  };
}

/** Ensures both the atoms and net charge can occur on both sides before grading. */
export function sameElementInventory(reaction: ReactionV1): boolean {
  const elements = (side: readonly ReactionTerm[]) =>
    [...new Set(side.flatMap(term => Object.keys(term.composition)))].sort().join("|");
  return elements(reaction.reactants) === elements(reaction.products);
}
