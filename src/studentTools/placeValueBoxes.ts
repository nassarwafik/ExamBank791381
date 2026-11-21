// Phase T13 — the place values of the conversion boxes (the owner's document: «صناديق التحويل بدون حسابات»). Pure and tiny on purpose:
// the tool only lays out the place values and keeps what the student typed. It never adds, converts or checks anything.

/** The place values, most significant first: width 8 → 128, 64, 32, 16, 8, 4, 2, 1. */
export function placeValues(width: 4 | 8 | 16): number[] {
  return Array.from({ length: width }, (_, i) => 2 ** (width - 1 - i));
}

/** What a box keeps from the student's keystroke: the last 0 or 1 typed, or empty. Anything else is ignored. */
export function boxDigit(typed: string): "" | "0" | "1" {
  const digits = typed.replace(/[^01]/g, "");
  return digits ? (digits[digits.length - 1] as "0" | "1") : "";
}

/** Rows of at most 8 boxes (16 boxes are shown as two bytes). */
export function boxRows(width: 4 | 8 | 16): number[][] {
  const values = placeValues(width);
  const rows: number[][] = [];
  for (let i = 0; i < values.length; i += 8) rows.push(values.slice(i, i + 8));
  return rows;
}

/** The hex ↔ binary reference list, 0 – F. */
export const HEX_BINARY_ROWS: readonly { hex: string; bin: string; dec: number }[] = Object.freeze(
  Array.from({ length: 16 }, (_, n) => ({ hex: n.toString(16).toUpperCase(), bin: n.toString(2).padStart(4, "0"), dec: n })));
