// Phase T10 — the student periodic table beyond the curriculum's Z 1–36 (docs/enterprise-student-tools-t.md §16). Display data only.
//
// Z 1–36 come, unchanged, from the platform's verified chemistry catalog (src/chemistry/elements.ts). That catalog is a grading
// authority of the chemistry simulations and stays exactly as it is; nothing here is compiled into the server build or read by grading.
// Z 37–118 are listed below:
//   weight   — CIAAW "Abridged Standard Atomic Weights 2024" (https://www.ciaaw.org/abridged-atomic-weights.htm), the printed decimal of
//              the table, read for this phase on 2026-11-18. `null` where the table gives no standard atomic weight (an element without
//              stable isotopes or a characteristic terrestrial isotopic composition); the tool then says so instead of inventing a number.
//   group / period — IUPAC 18-column table. The lanthanides (La–Lu) and actinides (Ac–Lr) are shown in their own two rows, with group
//              `null`, the layout the classroom uses.
//   category — the common classroom classification. Mt–Og (109–118) are "unknownProperties": too few atoms were ever made to classify
//              them.
// Electron configurations are shown only for Z 1–36 (the verified engine). Heavier atoms have many exceptions, so the tool shows none
// rather than an unverified one.

import { CHEM_ELEMENTS, CHEM_CATEGORY_LABEL, type ChemCategory } from "../chemistry/elements";

export const PERIODIC_WEIGHT_SOURCE = "CIAAW Abridged Standard Atomic Weights 2024 — https://www.ciaaw.org/abridged-atomic-weights.htm (read 2026-11-18)";
export const PERIODIC_Z_MAX = 118;
export const CURRICULUM_Z_MAX = 36;

export type PeriodicCategory = ChemCategory | "lanthanide" | "actinide" | "unknownProperties";
export type PeriodicElement = {
  readonly z: number;
  readonly symbol: string;
  readonly nameAr: string;
  readonly nameEn: string;
  /** the abridged standard atomic weight as printed, or null when there is none */
  readonly weightText: string | null;
  /** 1–18, or null for a lanthanide / actinide (shown in its own row) */
  readonly group: number | null;
  readonly period: number;
  readonly category: PeriodicCategory;
};

export const PERIODIC_CATEGORY_LABEL: Readonly<Record<PeriodicCategory, string>> = Object.freeze({
  ...CHEM_CATEGORY_LABEL,
  lanthanide: "لانثانيد (عناصر الفئة f)",
  actinide: "أكتينيد (عناصر الفئة f)",
  unknownProperties: "خواص غير معروفة بعد"
});

type Row = [z: number, symbol: string, nameAr: string, nameEn: string, weight: string | null, group: number | null, period: number, category: PeriodicCategory];
const ROWS: readonly Row[] = [
  [37, "Rb", "روبيديوم", "Rubidium", "85.468", 1, 5, "alkaliMetal"],
  [38, "Sr", "سترونشيوم", "Strontium", "87.62", 2, 5, "alkalineEarthMetal"],
  [39, "Y", "إتريوم", "Yttrium", "88.906", 3, 5, "transitionMetal"],
  [40, "Zr", "زركونيوم", "Zirconium", "91.222", 4, 5, "transitionMetal"],
  [41, "Nb", "نيوبيوم", "Niobium", "92.906", 5, 5, "transitionMetal"],
  [42, "Mo", "موليبدينوم", "Molybdenum", "95.95", 6, 5, "transitionMetal"],
  [43, "Tc", "تكنيشيوم", "Technetium", null, 7, 5, "transitionMetal"],
  [44, "Ru", "روثينيوم", "Ruthenium", "101.07", 8, 5, "transitionMetal"],
  [45, "Rh", "روديوم", "Rhodium", "102.91", 9, 5, "transitionMetal"],
  [46, "Pd", "بلاديوم", "Palladium", "106.42", 10, 5, "transitionMetal"],
  [47, "Ag", "فضة", "Silver", "107.87", 11, 5, "transitionMetal"],
  [48, "Cd", "كادميوم", "Cadmium", "112.41", 12, 5, "transitionMetal"],
  [49, "In", "إنديوم", "Indium", "114.82", 13, 5, "postTransitionMetal"],
  [50, "Sn", "قصدير", "Tin", "118.71", 14, 5, "postTransitionMetal"],
  [51, "Sb", "أنتيمون", "Antimony", "121.76", 15, 5, "metalloid"],
  [52, "Te", "تيلوريوم", "Tellurium", "127.60", 16, 5, "metalloid"],
  [53, "I", "يود", "Iodine", "126.90", 17, 5, "halogen"],
  [54, "Xe", "زينون", "Xenon", "131.29", 18, 5, "nobleGas"],
  [55, "Cs", "سيزيوم", "Caesium", "132.91", 1, 6, "alkaliMetal"],
  [56, "Ba", "باريوم", "Barium", "137.33", 2, 6, "alkalineEarthMetal"],
  [57, "La", "لانثانوم", "Lanthanum", "138.91", null, 6, "lanthanide"],
  [58, "Ce", "سيريوم", "Cerium", "140.12", null, 6, "lanthanide"],
  [59, "Pr", "براسيوديميوم", "Praseodymium", "140.91", null, 6, "lanthanide"],
  [60, "Nd", "نيوديميوم", "Neodymium", "144.24", null, 6, "lanthanide"],
  [61, "Pm", "بروميثيوم", "Promethium", null, null, 6, "lanthanide"],
  [62, "Sm", "ساماريوم", "Samarium", "150.36", null, 6, "lanthanide"],
  [63, "Eu", "يوروبيوم", "Europium", "151.96", null, 6, "lanthanide"],
  [64, "Gd", "غادولينيوم", "Gadolinium", "157.25", null, 6, "lanthanide"],
  [65, "Tb", "تيربيوم", "Terbium", "158.93", null, 6, "lanthanide"],
  [66, "Dy", "ديسبروسيوم", "Dysprosium", "162.50", null, 6, "lanthanide"],
  [67, "Ho", "هولميوم", "Holmium", "164.93", null, 6, "lanthanide"],
  [68, "Er", "إربيوم", "Erbium", "167.26", null, 6, "lanthanide"],
  [69, "Tm", "ثوليوم", "Thulium", "168.93", null, 6, "lanthanide"],
  [70, "Yb", "إيتربيوم", "Ytterbium", "173.05", null, 6, "lanthanide"],
  [71, "Lu", "لوتيشيوم", "Lutetium", "174.97", null, 6, "lanthanide"],
  [72, "Hf", "هافنيوم", "Hafnium", "178.49", 4, 6, "transitionMetal"],
  [73, "Ta", "تانتالوم", "Tantalum", "180.95", 5, 6, "transitionMetal"],
  [74, "W", "تنغستن", "Tungsten", "183.84", 6, 6, "transitionMetal"],
  [75, "Re", "رينيوم", "Rhenium", "186.21", 7, 6, "transitionMetal"],
  [76, "Os", "أوزميوم", "Osmium", "190.23", 8, 6, "transitionMetal"],
  [77, "Ir", "إيريديوم", "Iridium", "192.22", 9, 6, "transitionMetal"],
  [78, "Pt", "بلاتين", "Platinum", "195.08", 10, 6, "transitionMetal"],
  [79, "Au", "ذهب", "Gold", "196.97", 11, 6, "transitionMetal"],
  [80, "Hg", "زئبق", "Mercury", "200.59", 12, 6, "transitionMetal"],
  [81, "Tl", "ثاليوم", "Thallium", "204.38", 13, 6, "postTransitionMetal"],
  [82, "Pb", "رصاص", "Lead", "207.2", 14, 6, "postTransitionMetal"],
  [83, "Bi", "بزموت", "Bismuth", "208.98", 15, 6, "postTransitionMetal"],
  [84, "Po", "بولونيوم", "Polonium", null, 16, 6, "postTransitionMetal"],
  [85, "At", "أستاتين", "Astatine", null, 17, 6, "halogen"],
  [86, "Rn", "رادون", "Radon", null, 18, 6, "nobleGas"],
  [87, "Fr", "فرانسيوم", "Francium", null, 1, 7, "alkaliMetal"],
  [88, "Ra", "راديوم", "Radium", null, 2, 7, "alkalineEarthMetal"],
  [89, "Ac", "أكتينيوم", "Actinium", null, null, 7, "actinide"],
  [90, "Th", "ثوريوم", "Thorium", "232.04", null, 7, "actinide"],
  [91, "Pa", "بروتكتينيوم", "Protactinium", "231.04", null, 7, "actinide"],
  [92, "U", "يورانيوم", "Uranium", "238.03", null, 7, "actinide"],
  [93, "Np", "نبتونيوم", "Neptunium", null, null, 7, "actinide"],
  [94, "Pu", "بلوتونيوم", "Plutonium", null, null, 7, "actinide"],
  [95, "Am", "أمريسيوم", "Americium", null, null, 7, "actinide"],
  [96, "Cm", "كوريوم", "Curium", null, null, 7, "actinide"],
  [97, "Bk", "بركيليوم", "Berkelium", null, null, 7, "actinide"],
  [98, "Cf", "كاليفورنيوم", "Californium", null, null, 7, "actinide"],
  [99, "Es", "أينشتاينيوم", "Einsteinium", null, null, 7, "actinide"],
  [100, "Fm", "فيرميوم", "Fermium", null, null, 7, "actinide"],
  [101, "Md", "مندليفيوم", "Mendelevium", null, null, 7, "actinide"],
  [102, "No", "نوبليوم", "Nobelium", null, null, 7, "actinide"],
  [103, "Lr", "لورنسيوم", "Lawrencium", null, null, 7, "actinide"],
  [104, "Rf", "رذرفورديوم", "Rutherfordium", null, 4, 7, "transitionMetal"],
  [105, "Db", "دوبنيوم", "Dubnium", null, 5, 7, "transitionMetal"],
  [106, "Sg", "سيبورغيوم", "Seaborgium", null, 6, 7, "transitionMetal"],
  [107, "Bh", "بوريوم", "Bohrium", null, 7, 7, "transitionMetal"],
  [108, "Hs", "هاسيوم", "Hassium", null, 8, 7, "transitionMetal"],
  [109, "Mt", "مايتنريوم", "Meitnerium", null, 9, 7, "unknownProperties"],
  [110, "Ds", "دارمشتاتيوم", "Darmstadtium", null, 10, 7, "unknownProperties"],
  [111, "Rg", "رونتغينيوم", "Roentgenium", null, 11, 7, "unknownProperties"],
  [112, "Cn", "كوبرنيسيوم", "Copernicium", null, 12, 7, "unknownProperties"],
  [113, "Nh", "نيهونيوم", "Nihonium", null, 13, 7, "unknownProperties"],
  [114, "Fl", "فليروفيوم", "Flerovium", null, 14, 7, "unknownProperties"],
  [115, "Mc", "موسكوفيوم", "Moscovium", null, 15, 7, "unknownProperties"],
  [116, "Lv", "ليفرموريوم", "Livermorium", null, 16, 7, "unknownProperties"],
  [117, "Ts", "تينيسين", "Tennessine", null, 17, 7, "unknownProperties"],
  [118, "Og", "أوغانيسون", "Oganesson", null, 18, 7, "unknownProperties"]
];

const HEAVY: readonly PeriodicElement[] = ROWS.map(([z, symbol, nameAr, nameEn, weightText, group, period, category]) =>
  Object.freeze({ z, symbol, nameAr, nameEn, weightText, group, period, category }));

/** Every element 1–118 in Z order: the verified catalog for 1–36, the list above for 37–118. */
export const PERIODIC_ELEMENTS: readonly PeriodicElement[] = Object.freeze([
  ...CHEM_ELEMENTS.map(e => Object.freeze({ z: e.z, symbol: e.symbol, nameAr: e.nameAr, nameEn: e.nameEn, weightText: e.weightText, group: e.group, period: e.period, category: e.category as PeriodicCategory })),
  ...HEAVY
]);

/** The elements the tool shows for a range: Z 1–36 ("curriculum") or 1–118 ("all"). */
export function periodicElements(range: "curriculum" | "all"): readonly PeriodicElement[] {
  return range === "all" ? PERIODIC_ELEMENTS : PERIODIC_ELEMENTS.filter(e => e.z <= CURRICULUM_Z_MAX);
}
