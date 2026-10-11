// Phase 21D-D.2 — the trusted REACTION ENGINE (pure; compiled into the shared server build). It checks and balances AUTHORED educational
// equations; it never executes a reaction, never suggests an experimental procedure and never accepts a trusted value from a student client.
//   * terms      — { formula, charge, state? }: a canonical formula of the D.1 formula engine (H–Kr, case-sensitive, bounded) and an
//                  explicit integer net charge (the formula grammar itself refuses charge notation); the state symbol is presentation.
//   * balance    — conservation of EVERY element and of the net charge, decided in exact BigInt arithmetic (never floating point).
//   * solver     — the conservation matrix A (one row per element, plus a charge row when any term is charged; reactant columns +, product
//                  columns −) and its null space by fraction-free Gauss–Jordan elimination over the integers. Nullity 1 with a strictly
//                  positive vector ⇒ the unique smallest whole-number coefficients (divided by their gcd). Anything else is reported, never
//                  guessed: nullity 0 (only the trivial solution), a one-sided element, a charge that cannot balance, no strictly positive
//                  solution, coefficients beyond the bound, or nullity ≥ 2 (several independent balancings — see CANONICALIZATION below).
// A mathematically balanced equation is NOT evidence that the reaction occurs: conservation says nothing about thermodynamics, kinetics or
// whether the products are the real ones. Reactions shown to students come from the curated catalog (src/chemistry/reactionCatalog.ts) or
// from a teacher; this engine never invents a product.
import { parseFormula, sameComposition, displayFormula, type FormulaComposition } from "./formula";

export const REACTION_LIMITS = Object.freeze({
  termsPerSide: 8, totalTerms: 12, coefficientMax: 999, chargeAbsMax: 8
});
/** State symbols (presentation only; never graded): solid, liquid, gas, aqueous solution. */
export const REACTION_STATES = Object.freeze(["s", "l", "g", "aq"] as const);
export type ReactionState = (typeof REACTION_STATES)[number];

export type ReactionTermInput = Readonly<{ formula: string; charge: number; state?: ReactionState | null }>;
export type ReactionTerm = Readonly<{
  formula: string; charge: number; state: ReactionState | null; composition: FormulaComposition;
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
const isState = (v: unknown): v is ReactionState => typeof v === "string" && (REACTION_STATES as readonly string[]).includes(v);

/**
 * Strict published-reaction schema: formulas and integer charges are explicit; the state symbol is optional (absent ⇒ null). A species may
 * appear only once in the whole equation (same composition and charge): a repeated species makes the conservation system degenerate.
 */
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
      if (!isRecord(raw) || !(hasKeys(raw, ["formula", "charge"]) || hasKeys(raw, ["formula", "charge", "state"])) ||
        typeof raw.formula !== "string" ||
        !integer(raw.charge, -REACTION_LIMITS.chargeAbsMax, REACTION_LIMITS.chargeAbsMax) ||
        (raw.state !== undefined && raw.state !== null && !isState(raw.state))) {
        return { ok: false, code: "REACTION_TERM_INVALID", path };
      }
      const parsed = parseFormula(raw.formula);
      if (!parsed.ok || parsed.text !== raw.formula) {
        return { ok: false, code: "REACTION_FORMULA_INVALID", path: path + ".formula" };
      }
      const term: ReactionTerm = { formula: parsed.text, charge: raw.charge, state: isState(raw.state) ? raw.state : null, composition: parsed.composition };
      if ([...sides[0], ...sides[1]].some(t => t.charge === term.charge && sameComposition(t.composition, term.composition))) {
        return { ok: false, code: "REACTION_TERM_DUPLICATE", path };
      }
      sides[sideIndex].push(term);
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

// ── term identity and presentation ───────────────────────────────────────────────────────────────────────────────────────────────────
/** All terms, reactants first (the column order of every coefficient vector). */
export const reactionTerms = (r: ReactionV1): ReactionTerm[] => [...r.reactants, ...r.products];
/** Stable term ids: r1…rN for reactants, p1…pM for products (the ids actions, tasks and checks name). */
export const reactionTermIds = (r: ReactionV1): string[] => [...r.reactants.map((_, i) => "r" + (i + 1)), ...r.products.map((_, i) => "p" + (i + 1))];
/** The elements of an equation, alphabetical (the row order of the conservation table). */
export const reactionElements = (r: ReactionV1): string[] => [...new Set(reactionTerms(r).flatMap(t => Object.keys(t.composition)))].sort();
export const hasChargedTerm = (r: ReactionV1): boolean => reactionTerms(r).some(t => t.charge !== 0);
const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";
/** "2+", "−", "3−" as superscripts ("²⁺", "⁻", "³⁻"); "" for a neutral species. */
export const chargeSuperscript = (q: number): string =>
  q === 0 ? "" : (Math.abs(q) === 1 ? "" : String(Math.abs(q)).split("").map(d => SUPERSCRIPT[Number(d)]).join("")) + (q > 0 ? "⁺" : "⁻");
/** A term as display text: subscript counts, superscript charge, optional state ("Cu²⁺(aq)"). */
export const termText = (t: Pick<ReactionTerm, "formula" | "charge" | "state">, withState = false): string =>
  displayFormula(t.formula) + chargeSuperscript(t.charge) + (withState && t.state ? "(" + t.state + ")" : "");
/** The equation as text; a coefficient of 1 is written explicitly only when `explicitOnes` (an unset coefficient shows "?"). */
export function equationText(r: ReactionV1, coefficients: readonly (number | null)[] | null, opts: { states?: boolean; explicitOnes?: boolean } = {}): string {
  const terms = reactionTerms(r);
  const show = (t: ReactionTerm, i: number) => {
    const c = coefficients ? coefficients[i] : 1;
    const lead = c === null || c === undefined ? "?" : c === 1 && !opts.explicitOnes ? "" : String(c);
    return lead + termText(t, opts.states);
  };
  const n = r.reactants.length;
  return terms.slice(0, n).map((t, i) => show(t, i)).join(" + ") + " → " + terms.slice(n).map((t, i) => show(t, n + i)).join(" + ");
}

// ── the conservation table (presentation AND grading: one exact computation) ──────────────────────────────────────────────────────
/** `complete`: every term containing the element (the charge: every charged term) has a coefficient — a 0 = 0 row of unset terms is NOT "conserved". */
export type ConservationRow = { element: string; reactants: number; products: number; delta: number; balanced: boolean; complete: boolean };
export type ConservationTable = {
  rows: ConservationRow[];
  /** the net-charge row, present when any term is charged */
  charge: { reactants: number; products: number; delta: number; balanced: boolean; complete: boolean } | null;
  /** every coefficient is set */
  complete: boolean;
  /** complete AND every element AND the charge conserved */
  balanced: boolean;
};
/**
 * Counts every element (and the net charge) on both sides for a coefficient vector in term order; an unset coefficient (null) counts as 0
 * and makes the table incomplete. Summed in BigInt; the bounded results (≤ 999 × 10 000 × 12) are exact safe integers.
 */
export function conservationTable(r: ReactionV1, coefficients: readonly (number | null)[]): ConservationTable {
  const terms = reactionTerms(r), n = r.reactants.length;
  const atoms = new Map<string, [bigint, bigint]>(reactionElements(r).map(e => [e, [0n, 0n]]));
  const charge: [bigint, bigint] = [0n, 0n];
  let complete = coefficients.length === terms.length;
  const unset = new Set<string>();
  let chargeUnset = false;
  terms.forEach((t, i) => {
    const c = coefficients[i];
    if (!integer(c, 1, REACTION_LIMITS.coefficientMax)) {
      complete = false;
      for (const el of Object.keys(t.composition)) unset.add(el);
      if (t.charge !== 0) chargeUnset = true;
      return;
    }
    const side = i < n ? 0 : 1, k = BigInt(c);
    charge[side] += BigInt(t.charge) * k;
    for (const [el, count] of Object.entries(t.composition)) atoms.get(el)![side] += BigInt(count) * k;
  });
  const rows: ConservationRow[] = [...atoms.entries()].map(([element, [a, b]]) => ({ element, reactants: Number(a), products: Number(b), delta: Number(a - b), balanced: a === b, complete: !unset.has(element) }));
  const chargeRow = hasChargedTerm(r) ? { reactants: Number(charge[0]), products: Number(charge[1]), delta: Number(charge[0] - charge[1]), balanced: charge[0] === charge[1], complete: !chargeUnset } : null;
  return { rows, charge: chargeRow, complete, balanced: complete && rows.every(x => x.balanced) && (chargeRow?.balanced ?? true) };
}
/** One Arabic sentence explaining an element row ("الهيدروجين H: 4 في المتفاعلات و2 في النواتج — يزيد في المتفاعلات بمقدار 2"). */
export function describeConservationRow(row: Pick<ConservationRow, "element" | "reactants" | "products">, name = ""): string {
  const who = (name ? name + " " : "") + row.element, d = row.reactants - row.products;
  const base = who + ": " + row.reactants + " في المتفاعلات و" + row.products + " في النواتج";
  return d === 0 ? base + " — محفوظ" : base + " — " + (d > 0 ? "يزيد في المتفاعلات" : "يزيد في النواتج") + " بمقدار " + Math.abs(d);
}
export function describeChargeRow(row: { reactants: number; products: number }): string {
  const s = (q: number) => (q > 0 ? "+" + q : q < 0 ? "−" + Math.abs(q) : "0");
  const d = row.reactants - row.products;
  return "الشحنة الكلية: " + s(row.reactants) + " في المتفاعلات و" + s(row.products) + " في النواتج" + (d === 0 ? " — محفوظة" : " — غير محفوظة (الفرق " + Math.abs(d) + ")");
}

// ── the exact balancing solver ───────────────────────────────────────────────────────────────────────────────────────────────────────
// CANONICALIZATION POLICY. The answer the platform may grade as "the" coefficients is defined ONLY when the conservation system has a
// one-dimensional null space spanned by a strictly positive vector: that vector divided by the gcd of its entries (the smallest whole
// numbers) is unique. When the null space has dimension d ≥ 2 the equation superposes d independent reactions (e.g. H₂ + O₂ → H₂O + H₂O₂):
// infinitely many non-proportional whole-number balancings exist and chemistry — not arithmetic — decides which mixture occurs. The engine
// then returns REACTION_NOT_UNIQUE with a deterministic integer basis (each vector primitive, first non-zero entry positive, in free-column
// order) for diagnosis, and every consumer (authoring, grading) refuses the equation: it never picks one of the balancings.
export type BalanceFailureCode =
  | "REACTION_ELEMENT_ONE_SIDE" | "REACTION_CHARGE_UNBALANCEABLE" | "REACTION_UNBALANCEABLE"
  | "REACTION_NO_POSITIVE_SOLUTION" | "REACTION_NOT_UNIQUE" | "REACTION_COEFFICIENTS_TOO_LARGE";
export type BalanceResult =
  | { ok: true; coefficients: number[] }
  | { ok: false; code: BalanceFailureCode; elements?: string[]; dimension?: number; basis?: string[][] };

const babs = (x: bigint) => (x < 0n ? -x : x);
const bgcd = (a: bigint, b: bigint): bigint => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const primitive = (v: bigint[]): bigint[] => { const g = v.reduce((acc, x) => bgcd(acc, x), 0n); return g > 1n ? v.map(x => x / g) : v; };

/** The conservation matrix: element rows (alphabetical), then the charge row when `withCharge`. Reactant columns +, product columns −. */
export function conservationMatrix(r: ReactionV1, withCharge: boolean): bigint[][] {
  const terms = reactionTerms(r), n = r.reactants.length;
  const sign = (i: number) => (i < n ? 1n : -1n);
  const rows = reactionElements(r).map(el => terms.map((t, i) => sign(i) * BigInt(t.composition[el] ?? 0)));
  if (withCharge) rows.push(terms.map((t, i) => sign(i) * BigInt(t.charge)));
  return rows;
}
/** An integer basis of the null space of an integer matrix (fraction-free Gauss–Jordan; exact; deterministic). */
export function integerNullSpace(matrix: readonly (readonly bigint[])[], columns: number): bigint[][] {
  const rows = matrix.map(r => [...r]);
  const pivots: { row: number; col: number }[] = [];
  let r = 0;
  for (let c = 0; c < columns && r < rows.length; c++) {
    const p = rows.findIndex((row, i) => i >= r && row[c] !== 0n);
    if (p < 0) continue;
    [rows[r], rows[p]] = [rows[p], rows[r]];
    for (let i = 0; i < rows.length; i++) {
      if (i === r || rows[i][c] === 0n) continue;
      const a = rows[r][c], b = rows[i][c];
      rows[i] = primitive(rows[i].map((v, j) => a * v - b * rows[r][j]));
    }
    rows[r] = primitive(rows[r]);
    pivots.push({ row: r, col: c });
    r++;
  }
  const pivotCols = new Set(pivots.map(p => p.col));
  const basis: bigint[][] = [];
  for (let f = 0; f < columns; f++) {
    if (pivotCols.has(f)) continue;
    // x_f = D (the lcm of the pivot values), x_pivot = −row[f]·D / row[pivot]; every other free column 0
    const d = pivots.reduce((acc, p) => { const v = babs(rows[p.row][p.col]); return (acc / bgcd(acc, v)) * v; }, 1n);
    const x = new Array<bigint>(columns).fill(0n);
    x[f] = d;
    for (const p of pivots) x[p.col] = (-rows[p.row][f] * d) / rows[p.row][p.col];
    let v = primitive(x);
    const lead = v.find(e => e !== 0n) ?? 0n;
    if (lead < 0n) v = v.map(e => -e);
    basis.push(v);
  }
  return basis;
}
/** The unique smallest whole-number coefficients (term order), or the precise reason there are none. Never throws. */
export function balanceReaction(r: ReactionV1): BalanceResult {
  const left = new Set(r.reactants.flatMap(t => Object.keys(t.composition))), right = new Set(r.products.flatMap(t => Object.keys(t.composition)));
  const oneSided = reactionElements(r).filter(e => left.has(e) !== right.has(e));
  if (oneSided.length) return { ok: false, code: "REACTION_ELEMENT_ONE_SIDE", elements: oneSided };
  const columns = reactionTerms(r).length;
  const solve = (withCharge: boolean): BalanceResult => {
    const basis = integerNullSpace(conservationMatrix(r, withCharge), columns);
    if (basis.length === 0) return { ok: false, code: "REACTION_UNBALANCEABLE" };
    if (basis.length > 1) return { ok: false, code: "REACTION_NOT_UNIQUE", dimension: basis.length, basis: basis.map(v => v.map(x => x.toString())) };
    const v = basis[0];
    if (!v.every(x => x > 0n)) return { ok: false, code: "REACTION_NO_POSITIVE_SOLUTION" };
    if (v.some(x => x > BigInt(REACTION_LIMITS.coefficientMax))) return { ok: false, code: "REACTION_COEFFICIENTS_TOO_LARGE" };
    return { ok: true, coefficients: v.map(x => Number(x)) };
  };
  const charged = hasChargedTerm(r);
  const full = solve(charged);
  // a precise diagnosis: the atoms alone would balance, only the charge cannot
  if (!full.ok && charged && full.code !== "REACTION_NOT_UNIQUE" && solve(false).ok) return { ok: false, code: "REACTION_CHARGE_UNBALANCEABLE" };
  return full;
}
/** Arabic explanations of every solver refusal (shown to the teacher who authors an equation). */
export const BALANCE_FAILURE_MESSAGE: Readonly<Record<BalanceFailureCode, string>> = Object.freeze({
  REACTION_ELEMENT_ONE_SIDE: "عنصر يظهر في جهة واحدة فقط من المعادلة، فلا يمكن حفظه بمعاملات موجبة",
  REACTION_CHARGE_UNBALANCEABLE: "الذرات يمكن وزنها لكن الشحنة الكلية لا يمكن أن تتساوى في الجهتين؛ راجع شحنات الأيونات",
  REACTION_UNBALANCEABLE: "لا توجد معاملات تحفظ كل العناصر والشحنة معًا؛ راجع الصيغ",
  REACTION_NO_POSITIVE_SOLUTION: "لا توجد معاملات موجبة كلها تحفظ العناصر والشحنة (قد تكون مادة في الجهة الخطأ أو زائدة)",
  REACTION_NOT_UNIQUE: "للمعادلة أكثر من وزن مستقل (تجمع أكثر من تفاعل)؛ اكتب كل تفاعل في معادلة مستقلة",
  REACTION_COEFFICIENTS_TOO_LARGE: "أصغر معاملات صحيحة لهذه المعادلة تتجاوز " + REACTION_LIMITS.coefficientMax
});
