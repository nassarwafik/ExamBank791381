// Phase 21D-D.1 — the trusted CHEMICAL-FORMULA engine (pure; compiled into the shared server build). Nothing here trusts a formula it
// did not parse itself: model-generated or student text is accepted only through this strict, bounded grammar.
//   formula   := part ("·" part){0,2}                    one or two hydrate dots ("CuSO4·5H2O"); "." "*" "•" "⋅" are read as "·"
//   part      := [multiplier] group+                     a multiplier (2–99) is allowed only after a dot ("·5H2O"); never at the start
//   group     := Element [count] | "(" group+ ")" [count] Element = a catalog symbol, CASE-SENSITIVE ("Co" cobalt ≠ "CO")
//   count     := 1–999 without leading zeros; Unicode subscript digits (H₂O) are read as digits
// Bounds: ≤ 64 characters, parentheses nested ≤ 3, ≤ 10 000 atoms in total. Charges, isotopes, brackets, spaces, names and structural
// notation are refused (not guessed). Masses are summed EXACTLY in integer units of 1/10 000 g/mol (CIAAW 2024 abridged weights).
import { CHEM_WEIGHT_SCALE, chemElement } from "./elements";

export const FORMULA_LIMITS = Object.freeze({ chars: 64, depth: 3, atoms: 10000, count: 999, multiplier: 99, dots: 2 });
export type FormulaComposition = Readonly<Record<string, number>>;
export type ParsedFormula = { ok: true; text: string; composition: FormulaComposition; atoms: number };
export type FormulaError = { ok: false; code: string; message: string; at: number };
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/** The canonical TEXT of a formula input: trimmed, subscript digits → ASCII, every hydrate-dot variant → "·". */
export function normalizeFormulaText(raw: string): string {
  let out = "";
  for (const ch of raw.trim()) {
    const sub = SUBSCRIPT.indexOf(ch);
    out += sub >= 0 ? String(sub) : ch === "." || ch === "*" || ch === "•" || ch === "⋅" ? "·" : ch;
  }
  return out;
}
const fail = (code: string, message: string, at: number): FormulaError => ({ ok: false, code, message, at });

export function parseFormula(raw: unknown): ParsedFormula | FormulaError {
  if (typeof raw !== "string") return fail("FORMULA_INVALID", "الصيغة يجب أن تكون نصًا.", 0);
  const text = normalizeFormulaText(raw);
  if (!text) return fail("FORMULA_EMPTY", "اكتب الصيغة الكيميائية.", 0);
  if (text.length > FORMULA_LIMITS.chars) return fail("FORMULA_TOO_LONG", "الصيغة أطول من " + FORMULA_LIMITS.chars + " حرفًا.", FORMULA_LIMITS.chars);
  let i = 0;
  const peek = () => text[i];
  const digit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
  const readNumber = (max: number): number | FormulaError => {
    const start = i;
    if (peek() === "0") return fail("FORMULA_COUNT_INVALID", "العدد لا يبدأ بصفر.", i);
    while (digit(peek())) i++;
    const n = Number(text.slice(start, i));
    if (!Number.isInteger(n) || n < 1 || n > max) return fail("FORMULA_COUNT_INVALID", "العدد يجب أن يكون من 1 إلى " + max + ".", start);
    return n;
  };
  const merge = (into: Map<string, number>, from: Map<string, number>, times: number) => { for (const [k, v] of from) into.set(k, (into.get(k) ?? 0) + v * times); };
  const total = (m: Map<string, number>) => { let t = 0; for (const v of m.values()) t += v; return t; };
  /** group+ until ")" / "·" / end. */
  const readGroups = (depth: number): Map<string, number> | FormulaError => {
    const acc = new Map<string, number>();
    let any = false;
    while (i < text.length && peek() !== ")" && peek() !== "·") {
      const c = peek();
      let unit: Map<string, number>;
      if (c === "(") {
        if (depth >= FORMULA_LIMITS.depth) return fail("FORMULA_TOO_DEEP", "الأقواس متداخلة أكثر من " + FORMULA_LIMITS.depth + " مستويات.", i);
        const open = i++;
        const inner = readGroups(depth + 1);
        if ("ok" in inner) return inner;
        if (peek() !== ")") return fail("FORMULA_PAREN_UNCLOSED", "قوس مفتوح دون إغلاق.", open);
        if (!inner.size) return fail("FORMULA_PAREN_EMPTY", "قوسان دون عناصر.", open);
        i++;
        unit = inner;
      } else if (c >= "A" && c <= "Z") {
        const start = i++;
        if (peek() !== undefined && peek() >= "a" && peek() <= "z") i++;
        const symbol = text.slice(start, i), e = chemElement(symbol);
        if (!e) return fail("FORMULA_ELEMENT_UNKNOWN", "رمز عنصر غير معروف في هذه المحاكاة: " + symbol + " (الرموز حساسة لحالة الأحرف، والعناصر المدعومة من H إلى Kr).", start);
        unit = new Map([[symbol, 1]]);
      } else if (c === "[" || c === "]" || c === "+" || c === "-" || c === "^" || /\s/.test(c)) {
        return fail("FORMULA_NOTATION_UNSUPPORTED", "هذه الرموز غير مدعومة في الصيغة (الشحنات والأقواس المربعة والمسافات).", i);
      } else if (c >= "a" && c <= "z") {
        return fail("FORMULA_CASE", "رمز العنصر يبدأ بحرف كبير (مثل Na وليس na).", i);
      } else if (digit(c)) {
        return fail("FORMULA_COUNT_MISPLACED", "عدد في غير موضعه (الأعداد تأتي بعد رمز العنصر أو القوس).", i);
      } else return fail("FORMULA_CHARACTER", "حرف غير مسموح في الصيغة.", i);
      let count = 1;
      if (digit(peek())) { const n = readNumber(FORMULA_LIMITS.count); if (typeof n !== "number") return n; count = n; }
      merge(acc, unit, count);
      if (total(acc) > FORMULA_LIMITS.atoms) return fail("FORMULA_TOO_LARGE", "عدد الذرات يتجاوز " + FORMULA_LIMITS.atoms + ".", i);
      any = true;
    }
    if (!any && depth === 0) return fail("FORMULA_EMPTY_PART", "جزء فارغ في الصيغة.", i);
    return acc;
  };
  const all = new Map<string, number>();
  let dots = 0;
  for (;;) {
    let times = 1;
    if (dots > 0 && digit(peek())) { const n = readNumber(FORMULA_LIMITS.multiplier); if (typeof n !== "number") return n; times = n; }
    const part = readGroups(0);
    if ("ok" in part) return part;
    merge(all, part, times);
    if (total(all) > FORMULA_LIMITS.atoms) return fail("FORMULA_TOO_LARGE", "عدد الذرات يتجاوز " + FORMULA_LIMITS.atoms + ".", i);
    if (i >= text.length) break;
    if (peek() === ")") return fail("FORMULA_PAREN_UNOPENED", "قوس إغلاق دون فتح.", i);
    // peek() === "·"
    if (++dots > FORMULA_LIMITS.dots) return fail("FORMULA_TOO_MANY_DOTS", "عدد نقاط الماء/الإضافة أكبر من " + FORMULA_LIMITS.dots + ".", i);
    i++;
    if (i >= text.length) return fail("FORMULA_EMPTY_PART", "جزء فارغ بعد النقطة.", i);
  }
  const composition: Record<string, number> = {};
  for (const k of [...all.keys()].sort()) composition[k] = all.get(k) as number;
  return { ok: true, text, composition: Object.freeze(composition), atoms: total(all) };
}
/** Hill order: C first, H second, then alphabetical — or fully alphabetical when there is no carbon. */
export function hillOrder(c: FormulaComposition): string[] {
  const keys = Object.keys(c).sort();
  if (!keys.includes("C")) return keys;
  return ["C", ...(keys.includes("H") ? ["H"] : []), ...keys.filter(k => k !== "C" && k !== "H")];
}
export const hillFormula = (c: FormulaComposition): string => hillOrder(c).map(k => k + (c[k] > 1 ? String(c[k]) : "")).join("");
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
/** The empirical (simplest whole-number ratio) composition. */
export function empiricalComposition(c: FormulaComposition): FormulaComposition {
  const values = Object.values(c), g = values.reduce((acc, v) => gcd(acc, v), 0) || 1;
  const out: Record<string, number> = {};
  for (const k of Object.keys(c).sort()) out[k] = c[k] / g;
  return Object.freeze(out);
}
export const sameComposition = (a: FormulaComposition, b: FormulaComposition): boolean => {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};
/** Molar mass in exact integer units of 1/10 000 g/mol. */
export function molarMassScaled(c: FormulaComposition): number {
  let sum = 0;
  for (const [k, n] of Object.entries(c)) {
    const e = chemElement(k);
    if (!e) throw new Error("unknown element");
    sum += e.weightScaled * n;
  }
  return sum;
}
export const molarMass = (c: FormulaComposition): number => molarMassScaled(c) / CHEM_WEIGHT_SCALE;
/** Mass percentage of an element (0 when absent). */
export function massPercent(c: FormulaComposition, symbol: string): number {
  const e = chemElement(symbol), total = molarMassScaled(c);
  if (!e || !total || !c[symbol]) return 0;
  return (100 * e.weightScaled * c[symbol]) / total;
}
const SUB_DIGITS = (s: string) => s.replace(/[0-9]/g, d => SUBSCRIPT[Number(d)]);
/** Display text with subscript counts ("CuSO₄·5H₂O": hydrate multipliers stay full size). */
export function displayFormula(text: string): string {
  return text.split("·").map((part, i) => {
    const lead = i > 0 ? /^\d+/.exec(part)?.[0] ?? "" : "";
    return lead + SUB_DIGITS(part.slice(lead.length));
  }).join("·");
}
