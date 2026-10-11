// Phase 21D-D.3 — exact rational arithmetic for the virtual chemistry laboratory (pure; compiled into the shared server build).
//
// Every quantity the laboratory derives from an AUTHORED or STUDENT-CHOSEN decimal (a mass on the balance, a pipette volume, a stock
// concentration, a burette reading) is computed as an exact fraction of BigInts: c = n / V, c₁V₁ = c₂V₂, the equivalence volume of a
// titration. Only the transcendental models (pH = −log₁₀[H₃O⁺], Arrhenius, exponential decay) use doubles, and their results enter the
// comparisons below through an EXACT conversion of the double. Rounding is therefore never a floating-point accident: "0.1 + 0.2" or a
// value sitting exactly on a rounding boundary is decided by integer arithmetic.
export type Q = Readonly<{ n: bigint; d: bigint }>;

const babs = (x: bigint) => (x < 0n ? -x : x);
const bgcd = (a: bigint, b: bigint): bigint => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
/** A reduced fraction with a positive denominator. */
export function q(n: bigint, d: bigint = 1n): Q {
  if (d === 0n) throw new RangeError("division by zero");
  if (d < 0n) { n = -n; d = -d; }
  const g = bgcd(n, d) || 1n;
  return Object.freeze({ n: n / g, d: d / g });
}
export const ZERO = q(0n);
export const ONE = q(1n);
export const qi = (k: number): Q => q(BigInt(k));
export const add = (a: Q, b: Q): Q => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Q, b: Q): Q => q(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Q, b: Q): Q => q(a.n * b.n, a.d * b.d);
export const div = (a: Q, b: Q): Q => q(a.n * b.d, a.d * b.n);
export const neg = (a: Q): Q => q(-a.n, a.d);
export const abs = (a: Q): Q => q(babs(a.n), a.d);
export const sign = (a: Q): -1 | 0 | 1 => (a.n < 0n ? -1 : a.n > 0n ? 1 : 0);
export const cmp = (a: Q, b: Q): -1 | 0 | 1 => sign(sub(a, b));
export const eq = (a: Q, b: Q): boolean => a.n === b.n && a.d === b.d;
export const max = (a: Q, b: Q): Q => (cmp(a, b) >= 0 ? a : b);
export const min = (a: Q, b: Q): Q => (cmp(a, b) <= 0 ? a : b);
/** 10^k for a small integer k (the laboratory never needs more than ±60). */
export function pow10(k: number): Q {
  if (!Number.isInteger(k) || Math.abs(k) > 60) throw new RangeError("exponent out of range");
  const p = 10n ** BigInt(Math.abs(k));
  return k >= 0 ? q(p) : q(1n, p);
}

/** Plain decimals or e-notation, bounded: "0.100", "25.00", "-3", "1.0e-5". Anything else (Infinity, NaN, hex, spaces, "1,5") is refused. */
export const DECIMAL_PATTERN = /^-?(0|[1-9]\d{0,11})(\.\d{1,12})?([eE][+-]?\d{1,2})?$/;
export function parseDecimal(raw: unknown): Q | null {
  if (typeof raw !== "string" || raw.length > 32 || !DECIMAL_PATTERN.test(raw)) return null;
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!m) return null;
  const digits = BigInt(m[2] + (m[3] ?? "")), scale = (m[3] ?? "").length, exp = m[4] ? Number(m[4]) : 0;
  if (Math.abs(exp) > 30) return null;
  const v = mul(q(digits, 10n ** BigInt(scale)), pow10(exp));
  return m[1] === "-" ? neg(v) : v;
}
/** The EXACT value of a finite double (every double is a dyadic rational); null for NaN / ±Infinity. */
export function fromNumber(x: number): Q | null {
  if (!Number.isFinite(x)) return null;
  if (x === 0) return ZERO;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0), lo = view.getUint32(4);
  const negative = hi >>> 31 === 1, biased = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e: number;
  if (biased === 0) e = -1074; else { mant |= 1n << 52n; e = biased - 1075; }
  const v = e >= 0 ? q(mant << BigInt(e)) : q(mant, 1n << BigInt(-e));
  return negative ? neg(v) : v;
}
/** A double for display and for the transcendental models (relative error ≈ 1e-16; never used for a comparison). */
export function toNumber(a: Q): number {
  const bits = (x: bigint) => babs(x).toString(2).length;
  const shift = Math.max(0, Math.max(bits(a.n), bits(a.d)) - 900);
  return shift ? Number(a.n >> BigInt(shift)) / Number(a.d >> BigInt(shift)) : Number(a.n) / Number(a.d);
}
/** Round half AWAY from zero to `places` decimal places (places may be negative: −1 rounds to tens). */
export function roundHalfAway(a: Q, places: number): Q {
  const unit = pow10(-places), x = div(abs(a), unit);
  const whole = x.n / x.d, rem = sub(x, q(whole));
  const r = cmp(rem, q(1n, 2n)) >= 0 ? whole + 1n : whole;
  const v = mul(q(r), unit);
  return sign(a) < 0 ? neg(v) : v;
}
/** Fixed-point text with exactly `places` decimals (places ≥ 0), after rounding half away from zero. */
export function toFixed(a: Q, places: number): string {
  if (!Number.isInteger(places) || places < 0 || places > 20) throw new RangeError("places out of range");
  const r = roundHalfAway(a, places), scaled = babs(r.n * 10n ** BigInt(places) / r.d);
  const s = scaled.toString().padStart(places + 1, "0");
  const text = places ? s.slice(0, s.length - places) + "." + s.slice(s.length - places) : s;
  return (sign(r) < 0 ? "-" : "") + text;
}
/** ⌊log₁₀|a|⌋ for a ≠ 0, exactly. */
export function floorLog10(a: Q): number {
  const x = abs(a);
  if (sign(x) === 0) throw new RangeError("log of zero");
  let e = Math.floor(Math.log10(toNumber(x)));
  if (!Number.isFinite(e)) e = 0;
  while (cmp(x, pow10(e)) < 0) e--;
  while (cmp(x, pow10(e + 1)) >= 0) e++;
  return e;
}
/** Text with `digits` significant figures (fixed notation when 10⁻⁶ ≤ |a| < 10⁹, otherwise "m × 10ⁿ"-style e-notation). */
export function toSignificant(a: Q, digits: number): string {
  if (!Number.isInteger(digits) || digits < 1 || digits > 15) throw new RangeError("digits out of range");
  if (sign(a) === 0) return digits > 1 ? "0." + "0".repeat(digits - 1) : "0";
  let e = floorLog10(a);
  let r = roundHalfAway(a, digits - 1 - e);
  const e2 = floorLog10(r);
  if (e2 !== e) { e = e2; r = roundHalfAway(a, digits - 1 - e); }
  if (e >= -6 && e < 9) return toFixed(r, Math.max(0, digits - 1 - e));
  const mant = div(r, pow10(e));
  return toFixed(mant, digits - 1) + "e" + e;
}
