// Phase T6 — the bitwise calculator behind the `bitwiseCalculator` student tool: AND, OR, XOR, NOT, NAND, NOR, logical shifts.
// Exact (BigInt), unsigned, on the teacher's word width (8, 16 or 32 bits). Operands in binary, decimal or hexadecimal (the base
// converter's strict parser). Pure; no I/O.

import { parseInBase, formatInBase } from "./baseConverter";

export const BIT_WIDTHS = [8, 16, 32] as const;
export type BitWidth = (typeof BIT_WIDTHS)[number];
export const BITWISE_OPS = ["AND", "OR", "XOR", "NAND", "NOR", "NOT", "SHL", "SHR"] as const;
export type BitwiseOp = (typeof BITWISE_OPS)[number];
export type OperandBase = 2 | 10 | 16;

export const BITWISE_LABEL: Record<BitwiseOp, string> = {
  AND: "AND", OR: "OR", XOR: "XOR", NAND: "NAND", NOR: "NOR", NOT: "NOT (لـ A)", SHL: "إزاحة لليسار <<", SHR: "إزاحة لليمين >>"
};

export type BitwiseValue = { bin: string; dec: string; hex: string };
export type BitwiseResult = { ok: true; a: BitwiseValue; b: BitwiseValue | null; result: BitwiseValue } | { ok: false; message: string };

const mask = (w: BitWidth) => (1n << BigInt(w)) - 1n;
export function bitwiseView(v: bigint, w: BitWidth): BitwiseValue {
  const bin = formatInBase(v, 2).padStart(w, "0");
  return { bin: bin.replace(/(.{4})(?=.)/g, "$1 "), dec: v.toString(), hex: formatInBase(v, 16).padStart(w / 4, "0") };
}

function operand(text: string, base: OperandBase, w: BitWidth, label: string): { ok: true; v: bigint } | { ok: false; message: string } {
  const r = parseInBase(text, base);
  if (!r.ok) return { ok: false, message: label + ": " + r.message };
  if (r.value > mask(w)) return { ok: false, message: label + ": العدد لا يتسع في " + w + " بت (أكبر قيمة " + mask(w).toString() + ")." };
  return { ok: true, v: r.value };
}

/** `b` is the second operand, or the shift count (decimal, 0…width) for SHL / SHR; ignored for NOT. */
export function bitwise(op: BitwiseOp, aText: string, bText: string, base: OperandBase, w: BitWidth): BitwiseResult {
  const a = operand(aText, base, w, "A");
  if (!a.ok) return a;
  const m = mask(w);
  if (op === "NOT") return { ok: true, a: bitwiseView(a.v, w), b: null, result: bitwiseView(~a.v & m, w) };
  if (op === "SHL" || op === "SHR") {
    const t = String(bText).trim();
    if (!/^\d{1,2}$/.test(t) || Number(t) > w) return { ok: false, message: "مقدار الإزاحة عدد صحيح من 0 إلى " + w + "." };
    const n = BigInt(Number(t));
    const v = op === "SHL" ? (a.v << n) & m : a.v >> n;
    return { ok: true, a: bitwiseView(a.v, w), b: { bin: t, dec: t, hex: t }, result: bitwiseView(v, w) };
  }
  const b = operand(bText, base, w, "B");
  if (!b.ok) return b;
  const r = op === "AND" ? a.v & b.v : op === "OR" ? a.v | b.v : op === "XOR" ? a.v ^ b.v : op === "NAND" ? ~(a.v & b.v) & m : ~(a.v | b.v) & m;
  return { ok: true, a: bitwiseView(a.v, w), b: bitwiseView(b.v, w), result: bitwiseView(r, w) };
}
