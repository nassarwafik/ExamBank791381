// Phase 21D-D.3 — units of the virtual chemistry laboratory (pure; compiled into the shared server build).
//
// Each DIMENSION has a canonical unit (SI-based, the one the models compute in) and a short list of accepted units with an EXACT conversion
// factor (powers of ten, or 60 for minutes); temperature is affine (K = °C + 273.15, exact). A student's numeric answer carries its unit
// and is converted exactly before it is compared: 25.0 mL and 0.0250 L are the same answer. A unit outside the task's dimension is refused.
import { ONE, add, div, mul, parseDecimal, pow10, q, sub, type Q } from "./exact";

export const LAB_DIMENSIONS = Object.freeze([
  "volume", "amount", "mass", "concentration", "time", "temperature", "pH", "rate", "rateConstant0", "rateConstant1", "rateConstant2", "energy", "ratio"
] as const);
export type LabDimension = (typeof LAB_DIMENSIONS)[number];
export type LabUnitSpec = Readonly<{ id: string; label: string; factor: Q; offset?: Q }>;

const u = (id: string, label: string, factor: Q, offset?: Q): LabUnitSpec => Object.freeze(offset ? { id, label, factor, offset } : { id, label, factor });
const KELVIN_OFFSET = parseDecimal("273.15") as Q;
/** The accepted units per dimension; the FIRST one is canonical (factor 1). */
export const LAB_UNITS: Readonly<Record<LabDimension, readonly LabUnitSpec[]>> = Object.freeze({
  volume: Object.freeze([u("L", "L", ONE), u("mL", "mL", pow10(-3))]),
  amount: Object.freeze([u("mol", "mol", ONE), u("mmol", "mmol", pow10(-3))]),
  mass: Object.freeze([u("g", "g", ONE), u("mg", "mg", pow10(-3)), u("kg", "kg", pow10(3))]),
  concentration: Object.freeze([u("mol/L", "mol/L", ONE), u("mmol/L", "mmol/L", pow10(-3))]),
  time: Object.freeze([u("s", "s", ONE), u("min", "min", q(60n))]),
  temperature: Object.freeze([u("K", "K", ONE), u("°C", "°C", ONE, KELVIN_OFFSET)]),
  pH: Object.freeze([u("pH", "", ONE)]),
  rate: Object.freeze([u("mol/(L·s)", "mol/(L·s)", ONE), u("mol/(L·min)", "mol/(L·min)", q(1n, 60n))]),
  rateConstant0: Object.freeze([u("mol/(L·s)", "mol/(L·s)", ONE), u("mol/(L·min)", "mol/(L·min)", q(1n, 60n))]),
  rateConstant1: Object.freeze([u("1/s", "s⁻¹", ONE), u("1/min", "min⁻¹", q(1n, 60n))]),
  rateConstant2: Object.freeze([u("L/(mol·s)", "L/(mol·s)", ONE), u("L/(mol·min)", "L/(mol·min)", q(1n, 60n))]),
  energy: Object.freeze([u("J/mol", "J/mol", ONE), u("kJ/mol", "kJ/mol", pow10(3))]),
  ratio: Object.freeze([u("1", "", ONE)])
});
export const isLabDimension = (v: unknown): v is LabDimension => typeof v === "string" && (LAB_DIMENSIONS as readonly string[]).includes(v);
export const canonicalUnit = (d: LabDimension): LabUnitSpec => LAB_UNITS[d][0];
export const labUnit = (d: LabDimension, id: unknown): LabUnitSpec | undefined => (typeof id === "string" ? LAB_UNITS[d].find(x => x.id === id) : undefined);
/** value [unit] → canonical unit, exactly. */
export const toCanonical = (value: Q, unit: LabUnitSpec): Q => add(mul(value, unit.factor), unit.offset ?? q(0n));
/** canonical → value [unit], exactly. */
export const fromCanonical = (value: Q, unit: LabUnitSpec): Q => div(sub(value, unit.offset ?? q(0n)), unit.factor);
