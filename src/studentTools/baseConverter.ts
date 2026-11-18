// Phase T3 — the number-base converter engine behind the `baseConverter` student tool.
//
// Pure, exact (BigInt), bounded: non-negative integers below 2^64 in bases 2, 8, 10 and 16. No clock, no I/O, no React. It is
// self-contained on purpose (like ipv4Calculator.ts): the number-conversion GAME's helpers are presentation code for its server-graded
// board, and a student convenience tool must never be able to change what a graded activity accepts.
//
// Notation accepted: digits of the source base; spaces and underscores as group separators (1011 0101, 1111_0000); an optional base
// prefix that matches the source base (0b / 0o / 0x, case-insensitive). Hexadecimal output is upper case; binary output is grouped in
// fours, octal in threes, decimal in thousands, when grouping is asked for.

import type { NumberBase } from "./studentToolsSpec";

export const MAX_VALUE = (1n << 64n) - 1n;
export const MAX_INPUT_LENGTH = 100;

export type ConvertResult = { ok: true; value: bigint } | { ok: false; code: "EMPTY" | "INVALID_DIGIT" | "TOO_LARGE" | "TOO_LONG" | "PREFIX_MISMATCH"; message: string };

const DIGITS = "0123456789ABCDEF";
const PREFIX: Partial<Record<NumberBase, string>> = { 2: "0b", 8: "0o", 16: "0x" };
export const BASE_LABEL: Record<NumberBase, string> = { 2: "الثنائي", 8: "الثماني", 10: "العشري", 16: "الست عشري" };
const DIGIT_HINT: Record<NumberBase, string> = { 2: "0 و1", 8: "من 0 إلى 7", 10: "من 0 إلى 9", 16: "من 0 إلى 9 والحروف A إلى F" };

/** Parse `text` as a non-negative integer in `base`. */
export function parseInBase(text: string, base: NumberBase): ConvertResult {
  if (typeof text !== "string" || !text.trim()) return { ok: false, code: "EMPTY", message: "اكتب العدد الذي تريد تحويله." };
  if (text.length > MAX_INPUT_LENGTH) return { ok: false, code: "TOO_LONG", message: "العدد أطول من المسموح." };
  let t = text.trim().replace(/[\s_]/g, "").toUpperCase();
  // In base 16, "0B…" is a hexadecimal number (B is a digit): only "0X" is a prefix there.
  const m = (base === 16 ? /^0(X)/ : /^0([BOX])/).exec(t);
  if (m) {
    const want = PREFIX[base];
    if (!want || want[1].toUpperCase() !== m[1]) return { ok: false, code: "PREFIX_MISMATCH", message: "البادئة لا تطابق النظام المختار." };
    t = t.slice(2);
  }
  if (!t) return { ok: false, code: "EMPTY", message: "اكتب العدد الذي تريد تحويله." };
  let v = 0n;
  const b = BigInt(base);
  for (const ch of t) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) return { ok: false, code: "INVALID_DIGIT", message: "الرمز «" + ch + "» غير مسموح في النظام " + BASE_LABEL[base] + " (المسموح " + DIGIT_HINT[base] + ")." };
    v = v * b + BigInt(d);
    if (v > MAX_VALUE) return { ok: false, code: "TOO_LARGE", message: "العدد أكبر من المسموح (أقل من 2^64)." };
  }
  return { ok: true, value: v };
}

export function formatInBase(value: bigint, base: NumberBase): string {
  if (value < 0n) throw new RangeError("negative");
  return value.toString(base).toUpperCase();
}

const GROUP: Record<NumberBase, number> = { 2: 4, 8: 3, 10: 3, 16: 2 };
/** Digit groups for reading (binary 4, octal 3, decimal 3, hex 2), padded only for binary to whole nibbles. */
export function groupDigits(digits: string, base: NumberBase): string {
  const size = GROUP[base];
  const padded = base === 2 && digits.length % 4 ? digits.padStart(digits.length + 4 - (digits.length % 4), "0") : digits;
  const out: string[] = [];
  for (let end = padded.length; end > 0; end -= size) out.unshift(padded.slice(Math.max(0, end - size), end));
  return out.join(base === 10 ? "," : " ");
}

export type DivisionStep = { dividend: string; quotient: string; remainder: string };
export type PositionalTerm = { digit: string; base: number; power: number; value: string };
export type ConversionSteps =
  | { kind: "same" }
  | { kind: "toDecimal"; terms: PositionalTerm[]; total: string }
  | { kind: "fromDecimal"; divisions: DivisionStep[]; result: string }
  | { kind: "grouping"; groups: { from: string; to: string }[]; bitsPerDigit: number; result: string }
  | { kind: "viaDecimal"; toDecimal: Extract<ConversionSteps, { kind: "toDecimal" }>; fromDecimal: Extract<ConversionSteps, { kind: "fromDecimal" }> };

export const MAX_STEP_ROWS = 64;

function toDecimalSteps(value: bigint, from: NumberBase): Extract<ConversionSteps, { kind: "toDecimal" }> {
  const digits = formatInBase(value, from);
  const terms = [...digits].map((digit, i) => {
    const power = digits.length - 1 - i;
    return { digit, base: from, power, value: (BigInt(DIGITS.indexOf(digit)) * BigInt(from) ** BigInt(power)).toString() };
  });
  return { kind: "toDecimal", terms: terms.slice(0, MAX_STEP_ROWS), total: value.toString() };
}

function fromDecimalSteps(value: bigint, to: NumberBase): Extract<ConversionSteps, { kind: "fromDecimal" }> {
  const divisions: DivisionStep[] = [];
  const b = BigInt(to);
  let v = value;
  do {
    divisions.push({ dividend: v.toString(), quotient: (v / b).toString(), remainder: DIGITS[Number(v % b)] });
    v = v / b;
  } while (v > 0n && divisions.length < MAX_STEP_ROWS);
  return { kind: "fromDecimal", divisions, result: formatInBase(value, to) };
}

const BITS: Partial<Record<NumberBase, number>> = { 2: 1, 8: 3, 16: 4 };

/** The working a student would write: positional expansion, repeated division, or bit grouping between 2, 8 and 16. */
export function conversionSteps(value: bigint, from: NumberBase, to: NumberBase): ConversionSteps {
  if (from === to) return { kind: "same" };
  if (to === 10) return toDecimalSteps(value, from);
  if (from === 10) return fromDecimalSteps(value, to);
  const fb = BITS[from]!, tb = BITS[to]!;
  if (from === 2 || to === 2) {
    // binary ↔ octal / hex: each octal digit is 3 bits, each hex digit 4 bits.
    const per = from === 2 ? tb : fb;
    const bin = formatInBase(value, 2);
    const padded = bin.padStart(Math.ceil(bin.length / per) * per, "0");
    const groups: { from: string; to: string }[] = [];
    for (let i = 0; i < padded.length; i += per) {
      const chunk = padded.slice(i, i + per), digit = DIGITS[parseInt(chunk, 2)];
      groups.push(from === 2 ? { from: chunk, to: digit } : { from: digit, to: chunk });
    }
    return { kind: "grouping", groups, bitsPerDigit: per, result: formatInBase(value, to) };
  }
  // octal ↔ hex: through decimal (the curriculum's route); through binary would also do.
  return { kind: "viaDecimal", toDecimal: toDecimalSteps(value, from), fromDecimal: fromDecimalSteps(value, to) };
}
