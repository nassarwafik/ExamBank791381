// Phase 21D-D.3 — VIRTUAL LAB B: acids, bases and pH (pure; compiled into the shared server build).
//
// MODEL (stated, bounded):
//   * ideal dilute aqueous solutions at 25 °C: activities = concentrations, Kw = [H₃O⁺][OH⁻] = 1.0 × 10⁻¹⁴ (pKw = 14.00);
//   * ONE solute per solution (no mixtures, no buffers — a buffer or any other mixture is UNSUPPORTED, never estimated);
//   * strong acids / bases dissociate completely; weak monoprotic acids / bases use Ka / Kb at 25 °C;
//   * every [H₃O⁺] is the exact root of the CHARGE BALANCE including water's autoionization, so very dilute solutions come out right
//     (1.0 × 10⁻⁸ M HCl has pH 6.98, not 8): strong — closed form; weak — monotone bisection in log space (no approximation x ≪ c).
// Temperature is fixed at 25 °C; concentrations are bounded per species; outside the bounds the model returns UNSUPPORTED.
// Indicator colours are CATEGORICAL (acid colour / transition / base colour over the cited transition range) — an illustrative rendering,
// not a spectroscopic prediction; the transition ranges differ slightly between sources (see the design record).
import { cmp, parseDecimal, toNumber, type Q } from "./exact";

export const KW = 1.0e-14;
export const PKW = 14;
export const LAB_TEMPERATURE_C = 25;
export const ACID_BASE_KINDS = Object.freeze(["strongAcid", "strongBase", "weakAcid", "weakBase", "neutral"] as const);
export type AcidBaseKind = (typeof ACID_BASE_KINDS)[number];
export type AcidBaseSpecies = Readonly<{
  id: string; formula: string; nameAr: string; kind: AcidBaseKind; ions: 1 | 2; constant: number | null;
  cMin: Q; cMax: Q; source: string; cation?: { symbol: string; charge: 1 | 2 }; anion?: { formula: string; group: boolean }; note: string;
}>;
const D = (s: string) => parseDecimal(s) as Q;
const sp = (o: Omit<AcidBaseSpecies, "cMin" | "cMax"> & { cMin: string; cMax: string }): AcidBaseSpecies => Object.freeze({ ...o, cMin: D(o.cMin), cMax: D(o.cMax) });
export const ACID_BASE_SOURCES = Object.freeze({
  OS14: "OpenStax Chemistry 2e §14.1–14.3 (Kw = 1.0 × 10⁻¹⁴ at 25 °C; pH, pOH; strong acids and bases), CC BY 4.0, retrieved 2026-10-11",
  OSH: "OpenStax Chemistry 2e Appendix H, Table H1 (Ka at 25 °C: acetic acid 1.8 × 10⁻⁵), CC BY 4.0, retrieved 2026-10-11",
  OSI: "OpenStax Chemistry 2e Appendix I, Table I1 (Kb at 25 °C: ammonia 1.8 × 10⁻⁵), CC BY 4.0, retrieved 2026-10-11",
  LTI: "LibreTexts, Reference Tables: Acid-Base Indicators (transition ranges), CC BY-NC-SA 4.0, retrieved 2026-10-11"
});
/** The supported solutes of the pH lab (one per solution). */
export const ACID_BASE_SPECIES: readonly AcidBaseSpecies[] = Object.freeze([
  sp({ id: "HCl", formula: "HCl", nameAr: "حمض الهيدروكلوريك", kind: "strongAcid", ions: 1, constant: null, cMin: "0.000000001", cMax: "1.0", source: "OS14", anion: { formula: "Cl", group: false }, note: "حمض قوي أحادي البروتون: يتأين كليًا." }),
  sp({ id: "HNO3", formula: "HNO3", nameAr: "حمض النيتريك", kind: "strongAcid", ions: 1, constant: null, cMin: "0.000000001", cMax: "1.0", source: "OS14", anion: { formula: "NO3", group: true }, note: "حمض قوي أحادي البروتون: يتأين كليًا." }),
  sp({ id: "NaOH", formula: "NaOH", nameAr: "هيدروكسيد الصوديوم", kind: "strongBase", ions: 1, constant: null, cMin: "0.000000001", cMax: "1.0", source: "OS14", cation: { symbol: "Na", charge: 1 }, note: "قاعدة قوية: تتفكك كليًا وتعطي OH⁻ واحدًا لكل وحدة صيغة." }),
  sp({ id: "KOH", formula: "KOH", nameAr: "هيدروكسيد البوتاسيوم", kind: "strongBase", ions: 1, constant: null, cMin: "0.000000001", cMax: "1.0", source: "OS14", cation: { symbol: "K", charge: 1 }, note: "قاعدة قوية: تتفكك كليًا." }),
  sp({ id: "CaOH2", formula: "Ca(OH)2", nameAr: "هيدروكسيد الكالسيوم", kind: "strongBase", ions: 2, constant: null, cMin: "0.000000001", cMax: "0.010", source: "OS14", cation: { symbol: "Ca", charge: 2 }, note: "قاعدة قوية تعطي أيوني OH⁻ لكل وحدة صيغة؛ قليلة الذوبان، لذا التركيز محدود بـ 0.010 mol/L (دون حد الذوبان ≈ 0.02 mol/L)." }),
  sp({ id: "CH3COOH", formula: "CH3COOH", nameAr: "حمض الإيثانويك (الخليك)", kind: "weakAcid", ions: 1, constant: 1.8e-5, cMin: "0.000001", cMax: "1.0", source: "OSH", note: "حمض ضعيف: Ka = 1.8 × 10⁻⁵ عند 25 °C؛ يتأين جزئيًا." }),
  sp({ id: "NH3", formula: "NH3", nameAr: "الأمونيا", kind: "weakBase", ions: 1, constant: 1.8e-5, cMin: "0.000001", cMax: "1.0", source: "OSI", note: "قاعدة ضعيفة: Kb = 1.8 × 10⁻⁵ عند 25 °C." }),
  sp({ id: "NaCl", formula: "NaCl", nameAr: "كلوريد الصوديوم", kind: "neutral", ions: 1, constant: null, cMin: "0.000000001", cMax: "1.0", source: "OS14", note: "ملح من حمض قوي وقاعدة قوية: محلوله متعادل في النموذج المثالي." }),
  sp({ id: "H2O", formula: "H2O", nameAr: "ماء نقي", kind: "neutral", ions: 1, constant: null, cMin: "0", cMax: "0", source: "OS14", note: "ماء نقي: [H₃O⁺] = [OH⁻] = 1.0 × 10⁻⁷ mol/L عند 25 °C." })
]);
export const acidBaseSpecies = (id: unknown): AcidBaseSpecies | undefined => ACID_BASE_SPECIES.find(s => s.id === id);
export const isPureWater = (s: AcidBaseSpecies): boolean => s.id === "H2O";
/** pH text to a number of decimals; a value that rounds to zero is "0.00", never "-0.00" (1.0 M HCl has pH −4 × 10⁻¹⁵ in exact arithmetic). */
export function formatPh(pH: number, decimals = 2): string {
  const t = pH.toFixed(decimals);
  return /^-0\.?0*$/.test(t) ? t.slice(1) : t;
}

export type PhResult = { ok: true; h3o: number; oh: number; pH: number; pOH: number } | { ok: false; code: "LAB_PH_UNSUPPORTED" };
/** The positive root x of x² − a·x − Kw = 0 (the strong-electrolyte charge balance), computed without cancellation for either sign of a. */
export function excessRoot(a: number): number {
  const s = Math.sqrt(a * a + 4 * KW);
  return a >= 0 ? (a + s) / 2 : (2 * KW) / (s - a);
}
/** The weak monoprotic charge balance x = c·K / (K + x) + Kw / x, solved by bisection on log₁₀ x (f is strictly increasing). */
export function weakRoot(c: number, K: number): number {
  let lo = -16, hi = 1;
  const f = (lx: number) => { const x = 10 ** lx; return x - (c * K) / (K + x) - KW / x; };
  for (let i = 0; i < 200 && hi - lo > 1e-15; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
  return 10 ** ((lo + hi) / 2);
}
const pack = (h3o: number): PhResult => { const oh = KW / h3o, pH = -Math.log10(h3o); return { ok: true, h3o, oh, pH, pOH: PKW - pH }; };
/** pH of ONE solute at concentration c (mol/L), 25 °C; unsupported outside the species' bounds. */
export function solutionPh(s: AcidBaseSpecies, c: Q): PhResult {
  if (cmp(c, s.cMin) < 0 || cmp(c, s.cMax) > 0) return { ok: false, code: "LAB_PH_UNSUPPORTED" };
  const x = toNumber(c);
  switch (s.kind) {
    case "strongAcid": return pack(excessRoot(s.ions * x));
    case "strongBase": return pack(KW / excessRoot(s.ions * x));
    case "weakAcid": return pack(weakRoot(x, s.constant as number));
    case "weakBase": return pack(KW / weakRoot(x, s.constant as number));
    default: return pack(Math.sqrt(KW));
  }
}
/** Acidic / neutral / basic — decided EXACTLY by the kind of solute (any positive acid concentration makes [H₃O⁺] > [OH⁻]), never by a rounded pH. */
export type PhClass = "acidic" | "neutral" | "basic";
export const phClassOf = (s: AcidBaseSpecies): PhClass => (s.kind === "strongAcid" || s.kind === "weakAcid" ? "acidic" : s.kind === "neutral" ? "neutral" : "basic");
export const PH_CLASS_LABEL: Readonly<Record<PhClass, string>> = Object.freeze({ acidic: "حمضي", neutral: "متعادل", basic: "قاعدي" });
export const ACID_BASE_KIND_LABEL: Readonly<Record<AcidBaseKind, string>> = Object.freeze({
  strongAcid: "حمض قوي", strongBase: "قاعدة قوية", weakAcid: "حمض ضعيف", weakBase: "قاعدة ضعيفة", neutral: "متعادل"
});

// ── indicators ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Indicator = Readonly<{ id: string; nameAr: string; low: number; high: number; acidColour: string; baseColour: string; acidName: string; baseName: string }>;
/** Transition ranges as printed by the LibreTexts reference table (LTI); colours are display approximations. */
export const INDICATORS: readonly Indicator[] = Object.freeze([
  Object.freeze({ id: "methylOrange", nameAr: "الميثيل البرتقالي", low: 3.2, high: 4.4, acidColour: "#d7301f", baseColour: "#f2c80f", acidName: "أحمر", baseName: "أصفر" }),
  Object.freeze({ id: "methylRed", nameAr: "الميثيل الأحمر", low: 4.8, high: 6.0, acidColour: "#c51b29", baseColour: "#f2c80f", acidName: "أحمر", baseName: "أصفر" }),
  Object.freeze({ id: "bromothymolBlue", nameAr: "أزرق البروموثيمول", low: 6.0, high: 7.6, acidColour: "#e8c51b", baseColour: "#2166ac", acidName: "أصفر", baseName: "أزرق" }),
  Object.freeze({ id: "phenolphthalein", nameAr: "الفينولفثالين", low: 8.2, high: 10.0, acidColour: "#ffffff", baseColour: "#e7298a", acidName: "عديم اللون", baseName: "وردي" })
]);
export const indicatorById = (id: unknown): Indicator | undefined => INDICATORS.find(i => i.id === id);
export type IndicatorAppearance = { state: "acid" | "transition" | "base"; fraction: number; label: string };
/** The categorical colour state at a pH; `fraction` (0 at the low end, 1 at the high end) only shades the illustrative transition colour. */
export function indicatorAppearance(ind: Indicator, pH: number): IndicatorAppearance {
  if (pH < ind.low) return { state: "acid", fraction: 0, label: ind.acidName };
  if (pH > ind.high) return { state: "base", fraction: 1, label: ind.baseName };
  return { state: "transition", fraction: (pH - ind.low) / (ind.high - ind.low), label: "بين " + ind.acidName + " و" + ind.baseName };
}
/** The pH at the middle of the transition range (≈ pK of the indicator): the end-point pH the titration model uses. */
export const indicatorMidpoint = (ind: Indicator): number => (ind.low + ind.high) / 2;
