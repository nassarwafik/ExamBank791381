// Phase 21D-D.3 — VIRTUAL LAB D: reaction rate (pure; compiled into the shared server build).
//
// MODEL (a MODEL reaction A → products in solution; the teacher chooses an order and the parameters within bounds):
//   rate law            rate = k[A]ⁿ,  n ∈ {0, 1, 2}
//   integrated laws     n = 0: [A] = [A]₀ − kt (until A is used up);  n = 1: [A] = [A]₀e^(−kt);  n = 2: 1/[A] = 1/[A]₀ + kt
//   half-lives          n = 0: [A]₀ / 2k;  n = 1: ln 2 / k;  n = 2: 1 / (k[A]₀)
//   temperature         Arrhenius, k = A·e^(−Ea/RT), R = 8.314 J/(mol·K), parametrized by k at 25 °C: ln k(T) = ln k₂₅ − (Ea/R)(1/T − 1/298.15)
//   catalyst            lowers the activation energy by ΔEa with the SAME pre-exponential factor A (a stated simplification)
// Temperature 0–100 °C (aqueous solution), Ea 10–250 kJ/mol. Nothing here is an animation speed: every curve, rate and half-life the
// workspace shows is computed from these laws (OpenStax Chemistry 2e §12.3–12.5, §12.7).
export const GAS_CONSTANT = 8.314;
export const T_REF_K = 298.15;
export const KINETICS_LIMITS = Object.freeze({
  orders: [0, 1, 2] as readonly number[], temperatureMinC: 0, temperatureMaxC: 100, eaMinKJ: 10, eaMaxKJ: 250,
  concentrationMin: 0.001, concentrationMax: 2, kMin: 1e-8, kMax: 1e3, durationMinS: 10, durationMaxS: 36000
});
export type RateOrder = 0 | 1 | 2;
export type RateModel = Readonly<{ order: RateOrder; k25: number; eaKJ: number; catalystDropKJ: number | null }>;
export const toKelvin = (c: number): number => c + 273.15;
/** k at a temperature (°C), with or without the catalyst. */
export function rateConstant(m: RateModel, temperatureC: number, catalyst: boolean): number {
  const T = toKelvin(temperatureC), ea = m.eaKJ * 1000, drop = catalyst && m.catalystDropKJ ? m.catalystDropKJ * 1000 : 0;
  const lnA = Math.log(m.k25) + ea / (GAS_CONSTANT * T_REF_K);
  return Math.exp(lnA - (ea - drop) / (GAS_CONSTANT * T));
}
export function concentrationAt(order: RateOrder, k: number, a0: number, t: number): number {
  if (order === 0) return Math.max(0, a0 - k * t);
  if (order === 1) return a0 * Math.exp(-k * t);
  return a0 / (1 + k * a0 * t);
}
export const rateAt = (order: RateOrder, k: number, a: number): number => k * a ** order;
export const initialRate = (order: RateOrder, k: number, a0: number): number => rateAt(order, k, a0);
export function halfLife(order: RateOrder, k: number, a0: number): number {
  if (order === 0) return a0 / (2 * k);
  if (order === 1) return Math.LN2 / k;
  return 1 / (k * a0);
}
/** Ea (J/mol) from two (T, k) pairs — the two-point Arrhenius form ln(k₂/k₁) = (Ea/R)(1/T₁ − 1/T₂). */
export const activationEnergyFrom = (k1: number, t1K: number, k2: number, t2K: number): number => (GAS_CONSTANT * Math.log(k2 / k1)) / (1 / t1K - 1 / t2K);
/** Time for the concentration to fall to a fraction f of [A]₀ (0 < f < 1). */
export function timeToFraction(order: RateOrder, k: number, a0: number, f: number): number {
  if (order === 0) return (a0 * (1 - f)) / k;
  if (order === 1) return -Math.log(f) / k;
  return (1 / (f * a0) - 1 / a0) / k;
}
export const RATE_ORDER_LABEL: Readonly<Record<RateOrder, string>> = Object.freeze({ 0: "رتبة صفرية", 1: "رتبة أولى", 2: "رتبة ثانية" });
/** The k-unit dimension per order (mol/(L·s), 1/s, L/(mol·s)). */
export const rateConstantDimension = (order: RateOrder) => (order === 0 ? "rateConstant0" : order === 1 ? "rateConstant1" : "rateConstant2") as "rateConstant0" | "rateConstant1" | "rateConstant2";
/** A display curve [A](t) with n + 1 samples over [0, duration]. */
export function decayCurve(order: RateOrder, k: number, a0: number, duration: number, n = 120): { t: number; c: number }[] {
  return Array.from({ length: n + 1 }, (_, i) => { const t = (duration * i) / n; return { t, c: concentrationAt(order, k, a0, t) }; });
}
