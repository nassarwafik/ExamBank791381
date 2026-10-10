// Phase 21D-D.1 — the trusted ELEMENT CATALOG of ExamBank's chemistry simulations (pure data + lookups; compiled into the shared server
// build). Scope: Z = 1–36 (periods 1–4). Every number below is a VERIFIED FACT with recorded provenance (docs/enterprise-chemistry-smartsim-21d-d.md §3):
//   weight    — CIAAW "Abridged Standard Atomic Weights 2024" (https://www.ciaaw.org/abridged-atomic-weights.htm, retrieved 2026-10-10),
//               written as the exact decimal of the table and converted once to an integer number of 1/10 000 g/mol (exact sums).
//   isotopes  — the naturally occurring isotopes of the CIAAW isotopic-composition table (https://www.ciaaw.org/isotopic-abundances.htm,
//               retrieved 2026-10-10). `classroom` adds the two radioisotopes taught in schools (³H, ¹⁴C), flagged as radioactive.
//   group / period / block — IUPAC 18-column periodic table (re-derived from the NIST ground configurations by the tests).
// Curriculum choices (NOT facts about nature): `ions` lists the common monatomic ions of secondary curricula (charges −3…+3); `category`
// follows the common classroom classification (Zn listed with the d-block metals; B, Si, Ge, As as metalloids).
export const CHEM_ELEMENT_DATA_SOURCE = Object.freeze({
  weights: "CIAAW Abridged Standard Atomic Weights 2024 — https://www.ciaaw.org/abridged-atomic-weights.htm (retrieved 2026-10-10)",
  isotopes: "CIAAW isotopic compositions of the elements — https://www.ciaaw.org/isotopic-abundances.htm (retrieved 2026-10-10)",
  configurations: "NIST Atomic Spectra Database, Ground Levels and Ionization Energies for the Neutral Atoms — https://physics.nist.gov/cgi-bin/ASD/ie.pl (retrieved 2026-10-10)"
});
export const CHEM_WEIGHT_SCALE = 10000;
export const CHEM_Z_MAX = 36;
export const CHEM_CATEGORIES = Object.freeze(["alkaliMetal", "alkalineEarthMetal", "transitionMetal", "postTransitionMetal", "metalloid", "nonmetal", "halogen", "nobleGas"] as const);
export type ChemCategory = (typeof CHEM_CATEGORIES)[number];
export type ChemMetalClass = "metal" | "metalloid" | "nonmetal";
export type ChemElement = {
  readonly z: number;
  readonly symbol: string;
  readonly nameAr: string;
  readonly nameEn: string;
  /** the abridged standard atomic weight exactly as tabulated (decimal text) */
  readonly weightText: string;
  /** weightText × CHEM_WEIGHT_SCALE, an exact integer */
  readonly weightScaled: number;
  readonly group: number;
  readonly period: number;
  readonly category: ChemCategory;
  readonly isotopes: readonly number[];
  readonly radioisotopes: readonly number[];
  readonly ions: readonly number[];
};
type Row = [z: number, symbol: string, nameAr: string, nameEn: string, weight: string, group: number, period: number, category: ChemCategory, isotopes: number[], ions: number[], radio?: number[]];
const ROWS: readonly Row[] = [
  [1, "H", "هيدروجين", "Hydrogen", "1.0080", 1, 1, "nonmetal", [1, 2], [1, -1], [3]],
  [2, "He", "هيليوم", "Helium", "4.0026", 18, 1, "nobleGas", [3, 4], []],
  [3, "Li", "ليثيوم", "Lithium", "6.94", 1, 2, "alkaliMetal", [6, 7], [1]],
  [4, "Be", "بيريليوم", "Beryllium", "9.0122", 2, 2, "alkalineEarthMetal", [9], [2]],
  [5, "B", "بورون", "Boron", "10.81", 13, 2, "metalloid", [10, 11], []],
  [6, "C", "كربون", "Carbon", "12.011", 14, 2, "nonmetal", [12, 13], [], [14]],
  [7, "N", "نيتروجين", "Nitrogen", "14.007", 15, 2, "nonmetal", [14, 15], [-3]],
  [8, "O", "أكسجين", "Oxygen", "15.999", 16, 2, "nonmetal", [16, 17, 18], [-2]],
  [9, "F", "فلور", "Fluorine", "18.998", 17, 2, "halogen", [19], [-1]],
  [10, "Ne", "نيون", "Neon", "20.180", 18, 2, "nobleGas", [20, 21, 22], []],
  [11, "Na", "صوديوم", "Sodium", "22.990", 1, 3, "alkaliMetal", [23], [1]],
  [12, "Mg", "مغنيسيوم", "Magnesium", "24.305", 2, 3, "alkalineEarthMetal", [24, 25, 26], [2]],
  [13, "Al", "ألومنيوم", "Aluminium", "26.982", 13, 3, "postTransitionMetal", [27], [3]],
  [14, "Si", "سيليكون", "Silicon", "28.085", 14, 3, "metalloid", [28, 29, 30], []],
  [15, "P", "فوسفور", "Phosphorus", "30.974", 15, 3, "nonmetal", [31], [-3]],
  [16, "S", "كبريت", "Sulfur", "32.06", 16, 3, "nonmetal", [32, 33, 34, 36], [-2]],
  [17, "Cl", "كلور", "Chlorine", "35.45", 17, 3, "halogen", [35, 37], [-1]],
  [18, "Ar", "أرغون", "Argon", "39.95", 18, 3, "nobleGas", [36, 38, 40], []],
  [19, "K", "بوتاسيوم", "Potassium", "39.098", 1, 4, "alkaliMetal", [39, 40, 41], [1]],
  [20, "Ca", "كالسيوم", "Calcium", "40.078", 2, 4, "alkalineEarthMetal", [40, 42, 43, 44, 46, 48], [2]],
  [21, "Sc", "سكانديوم", "Scandium", "44.956", 3, 4, "transitionMetal", [45], [3]],
  [22, "Ti", "تيتانيوم", "Titanium", "47.867", 4, 4, "transitionMetal", [46, 47, 48, 49, 50], []],
  [23, "V", "فاناديوم", "Vanadium", "50.942", 5, 4, "transitionMetal", [50, 51], []],
  [24, "Cr", "كروم", "Chromium", "51.996", 6, 4, "transitionMetal", [50, 52, 53, 54], [2, 3]],
  [25, "Mn", "منغنيز", "Manganese", "54.938", 7, 4, "transitionMetal", [55], [2]],
  [26, "Fe", "حديد", "Iron", "55.845", 8, 4, "transitionMetal", [54, 56, 57, 58], [2, 3]],
  [27, "Co", "كوبالت", "Cobalt", "58.933", 9, 4, "transitionMetal", [59], [2]],
  [28, "Ni", "نيكل", "Nickel", "58.693", 10, 4, "transitionMetal", [58, 60, 61, 62, 64], [2]],
  [29, "Cu", "نحاس", "Copper", "63.546", 11, 4, "transitionMetal", [63, 65], [1, 2]],
  [30, "Zn", "خارصين (زنك)", "Zinc", "65.38", 12, 4, "transitionMetal", [64, 66, 67, 68, 70], [2]],
  [31, "Ga", "غاليوم", "Gallium", "69.723", 13, 4, "postTransitionMetal", [69, 71], [3]],
  [32, "Ge", "جرمانيوم", "Germanium", "72.630", 14, 4, "metalloid", [70, 72, 73, 74, 76], []],
  [33, "As", "زرنيخ", "Arsenic", "74.922", 15, 4, "metalloid", [75], [-3]],
  [34, "Se", "سيلينيوم", "Selenium", "78.971", 16, 4, "nonmetal", [74, 76, 77, 78, 80, 82], [-2]],
  [35, "Br", "بروم", "Bromine", "79.904", 17, 4, "halogen", [79, 81], [-1]],
  [36, "Kr", "كريبتون", "Krypton", "83.798", 18, 4, "nobleGas", [78, 80, 82, 83, 84, 86], []]
];
/** "12.011" → 120110 (exact: the text has at most 4 decimals). */
export function scaledWeight(text: string): number {
  const m = /^(\d+)\.(\d{1,4})$/.exec(text);
  if (!m) throw new Error("atomic weight text");
  return Number(m[1]) * CHEM_WEIGHT_SCALE + Number(m[2].padEnd(4, "0"));
}
const freezeArr = <T,>(a: T[]): readonly T[] => Object.freeze(a.slice());
export const CHEM_ELEMENTS: readonly ChemElement[] = Object.freeze(ROWS.map(([z, symbol, nameAr, nameEn, weight, group, period, category, isotopes, ions, radio]) => Object.freeze({
  z, symbol, nameAr, nameEn, weightText: weight, weightScaled: scaledWeight(weight), group, period, category,
  isotopes: freezeArr(isotopes), radioisotopes: freezeArr(radio ?? []), ions: freezeArr(ions)
})));
const BY_SYMBOL: ReadonlyMap<string, ChemElement> = new Map(CHEM_ELEMENTS.map(e => [e.symbol, e]));
/** The element with EXACTLY this symbol (case-sensitive: "Co" is cobalt, "CO" is not a symbol). */
export const chemElement = (symbol: unknown): ChemElement | undefined => (typeof symbol === "string" ? BY_SYMBOL.get(symbol) : undefined);
export const chemElementByZ = (z: number): ChemElement | undefined => (Number.isInteger(z) && z >= 1 && z <= CHEM_Z_MAX ? CHEM_ELEMENTS[z - 1] : undefined);
export const CHEM_SYMBOLS: readonly string[] = Object.freeze(CHEM_ELEMENTS.map(e => e.symbol));
export const chemMetalClass = (c: ChemCategory): ChemMetalClass => (c === "metalloid" ? "metalloid" : c === "nonmetal" || c === "halogen" || c === "nobleGas" ? "nonmetal" : "metal");
/** Every mass number a species of this element may use (natural isotopes + flagged classroom radioisotopes), ascending. */
export const chemMassNumbers = (e: ChemElement): number[] => [...e.isotopes, ...e.radioisotopes].sort((a, b) => a - b);
export const CHEM_CATEGORY_LABEL: Readonly<Record<ChemCategory, string>> = Object.freeze({
  alkaliMetal: "فلز قلوي", alkalineEarthMetal: "فلز قلوي ترابي", transitionMetal: "فلز انتقالي (عناصر الفئة d)", postTransitionMetal: "فلز بعد انتقالي",
  metalloid: "شبه فلز", nonmetal: "لافلز", halogen: "هالوجين", nobleGas: "غاز نبيل"
});
export const CHEM_METAL_CLASS_LABEL: Readonly<Record<ChemMetalClass, string>> = Object.freeze({ metal: "فلز", metalloid: "شبه فلز", nonmetal: "لافلز" });
