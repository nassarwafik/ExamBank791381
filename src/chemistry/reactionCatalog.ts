// Phase 21D-D.2 — the curated REACTION CATALOG (pure data + derived facts; compiled into the shared server build).
// Every equation here is a standard school-chemistry equation taken from a cited open source (REACTION_SOURCES, retrieved 2026-10-11);
// nothing is generated. For each reaction:
//   equation      — formulas, explicit charges, state symbols exactly as the source prints them (null where it prints none) and the
//                   smallest whole-number coefficients as printed by the source; the tests prove the exact solver (src/chemistry/reactions.ts)
//                   reproduces them. One recorded deviation: LibreTexts prints "CO2 (s)" in glucose combustion; it is recorded as CO₂(g).
//   families      — the reaction families the reaction CERTAINLY belongs to under the cited definitions (LibreTexts §7.5 for combination,
//                   decomposition, single / double replacement and combustion; OpenStax §4.2 for precipitation, neutralization and redox).
//   contested     — families whose membership depends on the textbook or the conditions (e.g. "is the rusting of iron a combustion?",
//                   "is HCl + NaOH a double replacement?"). A classification task may NEVER offer a contested family for that reaction:
//                   the platform neither requires nor forbids it, so a student is never marked wrong for a defensible answer.
//                   Every family that is neither listed nor contested certainly does NOT apply.
//   oxidation     — the oxidation number of each element in each term (OpenStax §4.2 rules; an AVERAGE where atoms of one element differ,
//                   e.g. C in C₇H₁₆ = −16/7, N in NH₄NO₃ = +1). The redox family and the oxidizing / reducing agents are DERIVED from these
//                   numbers (never pattern-matched from formulas); the tests check each term's numbers sum to its charge.
//   roles         — curated substance roles (acid, base, precipitate, fuel); element / compound / ion are derived from formula and charge.
// A catalog entry is immutable once published (chemistryReactions@1 questions name it by id); a correction is a new id.
import { REACTION_STATES, validateReaction, type ReactionState, type ReactionV1 } from "./reactions";

export const REACTION_FAMILIES = Object.freeze(["synthesis", "decomposition", "singleDisplacement", "doubleDisplacement", "combustion", "neutralization", "precipitation", "redox"] as const);
export type ReactionFamily = (typeof REACTION_FAMILIES)[number];
export const REACTION_FAMILY_LABEL: Readonly<Record<ReactionFamily, string>> = Object.freeze({
  synthesis: "اتحاد (تكوين)", decomposition: "تفكك (تحلل)", singleDisplacement: "إحلال أحادي", doubleDisplacement: "إحلال مزدوج",
  combustion: "احتراق", neutralization: "تعادل (حمض وقاعدة)", precipitation: "ترسيب", redox: "أكسدة واختزال"
});
export const REACTION_ROLES = Object.freeze(["oxidizingAgent", "reducingAgent", "acid", "base", "precipitate", "fuel", "element", "compound", "ion"] as const);
export type ReactionRole = (typeof REACTION_ROLES)[number];
export const REACTION_ROLE_LABEL: Readonly<Record<ReactionRole, string>> = Object.freeze({
  oxidizingAgent: "العامل المؤكسد (المادة التي تُختزل)", reducingAgent: "العامل المختزل (المادة التي تتأكسد)", acid: "الحمض", base: "القاعدة",
  precipitate: "الراسب (ناتج صلب غير ذائب)", fuel: "الوقود", element: "عنصر", compound: "مركب", ion: "أيون"
});
/** Roles that only the curated catalog can answer (no trusted rule derives them from a typed formula). */
export const CATALOG_ONLY_ROLES: readonly ReactionRole[] = Object.freeze(["oxidizingAgent", "reducingAgent", "acid", "base", "precipitate", "fuel"] as ReactionRole[]);
export const REACTION_TERM_KINDS = Object.freeze(["molecule", "ionic", "metal", "element", "ion"] as const);
export type ReactionTermKind = (typeof REACTION_TERM_KINDS)[number];
export const REACTION_LEVELS = Object.freeze(["middle", "secondary"] as const);
export type ReactionLevel = (typeof REACTION_LEVELS)[number];
export const REACTION_LEVEL_LABEL: Readonly<Record<ReactionLevel, string>> = Object.freeze({ middle: "المرحلة المتوسطة", secondary: "المرحلة الثانوية" });

const RETRIEVED = " (retrieved 2026-10-11)";
const OPENSTAX = "OpenStax, Chemistry 2e (CC BY 4.0), ";
export const REACTION_SOURCES = Object.freeze({
  OS41: OPENSTAX + "§4.1 Writing and Balancing Chemical Equations — https://openstax.org/books/chemistry-2e/pages/4-1-writing-and-balancing-chemical-equations" + RETRIEVED,
  OS42: OPENSTAX + "§4.2 Classifying Chemical Reactions — https://openstax.org/books/chemistry-2e/pages/4-2-classifying-chemical-reactions" + RETRIEVED,
  OS45: OPENSTAX + "§4.5 Quantitative Chemical Analysis — https://openstax.org/books/chemistry-2e/pages/4-5-quantitative-chemical-analysis" + RETRIEVED,
  OS53: OPENSTAX + "§5.3 Enthalpy (incl. Table 5.2, standard molar enthalpies of combustion) — https://openstax.org/books/chemistry-2e/pages/5-3-enthalpy" + RETRIEVED,
  OS151: OPENSTAX + "§15.1 Precipitation and Dissolution — https://openstax.org/books/chemistry-2e/pages/15-1-precipitation-and-dissolution" + RETRIEVED,
  LT75: "LibreTexts, Introduction to Chemistry (Anoka-Ramsey Community College; derived from CK-12 Chemistry), §7.5 Classifying Chemical Reactions — https://chem.libretexts.org/Courses/Anoka-Ramsey_Community_College/Introduction_to_Chemistry/07%3A_Chemical_Reactions/7.05%3A_Classifying_Chemical_Reactions" + RETRIEVED,
  CU130: "University of Colorado Boulder, Lecture Demonstration Manual, S130 Precipitation CaCl2 + Na2CO3 → CaCO3 — https://www.colorado.edu/lab/lecture-demo-manual/general-reactions/s130-chemical-rxns-precipitation-cacl2-na2co3-caco3" + RETRIEVED
});
export type ReactionSourceKey = keyof typeof REACTION_SOURCES;

/** An oxidation number: an integer, or an average written "n/d" (exact rational). */
export type OxidationNumber = number | `${number}/${number}`;
export type CatalogTerm = {
  readonly formula: string; readonly charge: number; readonly state: ReactionState | null; readonly nameAr: string; readonly kind: ReactionTermKind;
  readonly oxidation: Readonly<Record<string, OxidationNumber>>;
};
export type CatalogReaction = {
  readonly id: string; readonly nameAr: string; readonly nameEn: string; readonly level: ReactionLevel;
  readonly reactants: readonly CatalogTerm[]; readonly products: readonly CatalogTerm[];
  /** the smallest whole-number coefficients, term order (reactants then products), as printed by the source */
  readonly coefficients: readonly number[];
  readonly families: readonly ReactionFamily[]; readonly contested: readonly ReactionFamily[];
  /** curated roles (term ids); oxidizingAgent / reducingAgent / element / compound / ion are derived — see catalogRoleTerms */
  readonly roles: Readonly<Partial<Record<"acid" | "base" | "precipitate" | "fuel", readonly string[]>>>;
  readonly sources: readonly ReactionSourceKey[]; readonly notes: readonly string[];
};

type T = [formula: string, charge: number, state: ReactionState | null, nameAr: string, kind: ReactionTermKind, oxidation: Record<string, OxidationNumber>];
type Spec = Omit<CatalogReaction, "reactants" | "products" | "contested" | "roles" | "notes"> & { reactants: T[]; products: T[]; contested?: ReactionFamily[]; roles?: CatalogReaction["roles"]; notes?: string[] };
// frequently used terms
const H2: T = ["H2", 0, "g", "الهيدروجين", "molecule", { H: 0 }];
/** the same species where the source prints no state symbol */
const bare = (t: T): T => [t[0], t[1], null, t[3], t[4], t[5]];
const O2: T = ["O2", 0, "g", "الأكسجين", "molecule", { O: 0 }];
const H2O_L: T = ["H2O", 0, "l", "الماء", "molecule", { H: 1, O: -2 }];
const H2O_G: T = ["H2O", 0, "g", "بخار الماء", "molecule", { H: 1, O: -2 }];
const CO2_G: T = ["CO2", 0, "g", "ثاني أكسيد الكربون", "molecule", { C: 4, O: -2 }];
const CL2_G: T = ["Cl2", 0, "g", "الكلور", "molecule", { Cl: 0 }];
const HCL_AQ: T = ["HCl", 0, "aq", "حمض الهيدروكلوريك", "molecule", { H: 1, Cl: -1 }];
const NACL_AQ: T = ["NaCl", 0, "aq", "كلوريد الصوديوم", "ionic", { Na: 1, Cl: -1 }];
const OH_AQ: T = ["OH", -1, "aq", "أيون الهيدروكسيد", "ion", { O: -2, H: 1 }];
const CACO3_S: T = ["CaCO3", 0, "s", "كربونات الكالسيوم", "ionic", { Ca: 2, C: 4, O: -2 }];

const SPECS: Spec[] = [
  // ── combination (synthesis) ──
  { id: "waterFormation", nameAr: "تكوين الماء من الهيدروجين والأكسجين", nameEn: "Formation of water", level: "middle",
    reactants: [H2, O2], products: [H2O_L], coefficients: [2, 1, 2], families: ["synthesis", "combustion", "redox"], roles: { fuel: ["r1"] },
    sources: ["OS53", "OS41", "LT75"], notes: ["الهيدروجين وقود يحترق في الأكسجين (جدول إنثالبيات الاحتراق في OpenStax §5.3)."] },
  { id: "ammoniaSynthesis", nameAr: "تحضير الأمونيا (هابر–بوش)", nameEn: "Ammonia synthesis", level: "middle",
    reactants: [["N2", 0, null, "النيتروجين", "molecule", { N: 0 }], bare(H2)], products: [["NH3", 0, null, "الأمونيا", "molecule", { N: -3, H: 1 }]], coefficients: [1, 3, 2],
    families: ["synthesis", "redox"], sources: ["OS41", "LT75"],
    notes: ["التفاعل عكوس ويصل إلى حالة اتزان؛ يُجرى صناعيًا عند ضغط ودرجة حرارة مرتفعين بوجود عامل حفاز.", "المعاملات 3، 9، 6 موزونة أيضًا لكنها ليست أصغر الأعداد الصحيحة (OpenStax §4.1)."] },
  { id: "ironOxidation", nameAr: "أكسدة الحديد إلى أكسيد الحديد (III)", nameEn: "Oxidation of iron to iron(III) oxide", level: "middle",
    reactants: [["Fe", 0, "s", "الحديد", "metal", { Fe: 0 }], O2], products: [["Fe2O3", 0, "s", "أكسيد الحديد (III)", "ionic", { Fe: 3, O: -2 }]], coefficients: [4, 3, 2],
    families: ["synthesis", "redox"], contested: ["combustion"], sources: ["LT75"],
    notes: ["نموذج مبسّط للصدأ: الصدأ الحقيقي أكسيد حديد (III) مائي يتكوّن ببطء بوجود الماء والأكسجين، لذلك لا يُعدّ احتراقًا في كل المناهج."] },
  { id: "magnesiumOxygen", nameAr: "تفاعل المغنيسيوم مع الأكسجين", nameEn: "Magnesium and oxygen", level: "middle",
    reactants: [["Mg", 0, "s", "المغنيسيوم", "metal", { Mg: 0 }], O2], products: [["MgO", 0, "s", "أكسيد المغنيسيوم", "ionic", { Mg: 2, O: -2 }]], coefficients: [2, 1, 2],
    families: ["synthesis", "redox"], contested: ["combustion"], sources: ["LT75"] },
  { id: "sulfurOxygen", nameAr: "تفاعل الكبريت مع الأكسجين", nameEn: "Sulfur and oxygen", level: "middle",
    reactants: [["S", 0, "s", "الكبريت", "element", { S: 0 }], O2], products: [["SO2", 0, "g", "ثاني أكسيد الكبريت", "molecule", { S: 4, O: -2 }]], coefficients: [1, 1, 1],
    families: ["synthesis", "redox"], contested: ["combustion"], sources: ["LT75"], notes: ["يُكتب الكبريت الصلب S اختصارًا لجزيئاته الحلقية S₈."] },
  { id: "calciumOxideWater", nameAr: "تفاعل أكسيد الكالسيوم مع الماء", nameEn: "Calcium oxide and water", level: "middle",
    reactants: [["CaO", 0, "s", "أكسيد الكالسيوم", "ionic", { Ca: 2, O: -2 }], H2O_L], products: [["Ca(OH)2", 0, "aq", "هيدروكسيد الكالسيوم", "ionic", { Ca: 2, O: -2, H: 1 }]], coefficients: [1, 1, 1],
    families: ["synthesis"], sources: ["LT75"] },
  { id: "sodiumChlorine", nameAr: "تكوين كلوريد الصوديوم من عنصريه", nameEn: "Sodium and chlorine", level: "middle",
    reactants: [["Na", 0, "s", "الصوديوم", "metal", { Na: 0 }], CL2_G], products: [["NaCl", 0, "s", "كلوريد الصوديوم", "ionic", { Na: 1, Cl: -1 }]], coefficients: [2, 1, 2],
    families: ["synthesis", "redox"], sources: ["OS42", "LT75"], notes: ["الصوديوم يتأكسد (0 → +1) والكلور يُختزل (0 → −1)."] },
  { id: "hydrogenChlorine", nameAr: "تكوين كلوريد الهيدروجين", nameEn: "Hydrogen and chlorine", level: "secondary",
    reactants: [H2, CL2_G], products: [["HCl", 0, "g", "كلوريد الهيدروجين", "molecule", { H: 1, Cl: -1 }]], coefficients: [1, 1, 2],
    families: ["synthesis", "redox"], contested: ["combustion"], sources: ["OS42", "LT75"] },
  // ── combustion ──
  { id: "methaneCombustion", nameAr: "احتراق الميثان", nameEn: "Combustion of methane", level: "middle",
    reactants: [["CH4", 0, "g", "الميثان", "molecule", { C: -4, H: 1 }], O2], products: [CO2_G, H2O_G], coefficients: [1, 2, 1, 2],
    families: ["combustion", "redox"], roles: { fuel: ["r1"] }, sources: ["OS41", "LT75"] },
  { id: "ethaneCombustion", nameAr: "احتراق الإيثان", nameEn: "Combustion of ethane", level: "secondary",
    reactants: [["C2H6", 0, null, "الإيثان", "molecule", { C: -3, H: 1 }], bare(O2)], products: [bare(H2O_G), bare(CO2_G)], coefficients: [2, 7, 6, 4],
    families: ["combustion", "redox"], roles: { fuel: ["r1"] }, sources: ["OS41", "LT75"], notes: ["ترتيب النواتج كما في المصدر (الماء ثم ثاني أكسيد الكربون)."] },
  { id: "etheneCombustion", nameAr: "احتراق الإيثين", nameEn: "Combustion of ethene", level: "secondary",
    reactants: [["C2H4", 0, "g", "الإيثين", "molecule", { C: -2, H: 1 }], O2], products: [CO2_G, H2O_L], coefficients: [1, 3, 2, 2],
    families: ["combustion", "redox"], roles: { fuel: ["r1"] }, sources: ["OS42"] },
  { id: "heptaneCombustion", nameAr: "احتراق الهبتان", nameEn: "Combustion of heptane", level: "secondary",
    reactants: [["C7H16", 0, "l", "الهبتان", "molecule", { C: "-16/7", H: 1 }], O2], products: [CO2_G, H2O_G], coefficients: [1, 11, 7, 8],
    families: ["combustion", "redox"], roles: { fuel: ["r1"] }, sources: ["LT75"], notes: ["رقم تأكسد الكربون في الهبتان متوسط على ذراته السبع (−16/7)."] },
  { id: "glucoseCombustion", nameAr: "احتراق الجلوكوز (المعادلة الإجمالية للتنفس الخلوي)", nameEn: "Combustion of glucose", level: "secondary",
    reactants: [["C6H12O6", 0, "s", "الجلوكوز", "molecule", { C: 0, H: 1, O: -2 }], O2], products: [CO2_G, H2O_L], coefficients: [1, 6, 6, 6],
    families: ["combustion", "redox"], roles: { fuel: ["r1"] }, sources: ["LT75"], notes: ["في الخلية الحية يتم التحول عبر سلسلة خطوات كثيرة؛ المعادلة تلخّص التفاعل الإجمالي فقط.", "يكتب المصدر CO₂ بالحالة (s) خطأً مطبعيًا؛ سُجّلت هنا غازًا (g)."] },
  // ── decomposition ──
  { id: "calciumCarbonateDecomposition", nameAr: "التفكك الحراري لكربونات الكالسيوم", nameEn: "Thermal decomposition of calcium carbonate", level: "middle",
    reactants: [CACO3_S], products: [["CaO", 0, "s", "أكسيد الكالسيوم", "ionic", { Ca: 2, O: -2 }], CO2_G], coefficients: [1, 1, 1],
    families: ["decomposition"], sources: ["OS41", "LT75"], notes: ["يحتاج إلى تسخين شديد (يُرمز له بـ Δ فوق السهم)."] },
  { id: "waterElectrolysis", nameAr: "التحليل الكهربائي للماء", nameEn: "Electrolysis of water", level: "middle",
    reactants: [bare(H2O_L)], products: [bare(H2), bare(O2)], coefficients: [2, 2, 1], families: ["decomposition", "redox"], sources: ["OS41"],
    notes: ["يحتاج إلى طاقة كهربائية؛ عكس تفاعل تكوين الماء."] },
  { id: "hydrogenPeroxideDecomposition", nameAr: "تفكك فوق أكسيد الهيدروجين", nameEn: "Decomposition of hydrogen peroxide", level: "secondary",
    reactants: [["H2O2", 0, "aq", "فوق أكسيد الهيدروجين", "molecule", { H: 1, O: -1 }]], products: [H2O_L, O2], coefficients: [2, 2, 1],
    families: ["decomposition", "redox"], sources: ["OS42", "LT75"], notes: ["يُسرّعه حفاز مثل MnO₂.", "الأكسجين يتأكسد ويُختزل في التفاعل نفسه (أكسدة واختزال ذاتي)."] },
  { id: "ammoniumNitrateDecomposition", nameAr: "تفكك نترات الأمونيوم", nameEn: "Decomposition of ammonium nitrate", level: "secondary",
    reactants: [["NH4NO3", 0, null, "نترات الأمونيوم", "ionic", { N: 1, H: 1, O: -2 }]], products: [["N2", 0, null, "النيتروجين", "molecule", { N: 0 }], ["O2", 0, null, "الأكسجين", "molecule", { O: 0 }], ["H2O", 0, null, "الماء", "molecule", { H: 1, O: -2 }]],
    coefficients: [2, 2, 1, 4], families: ["decomposition", "redox"], sources: ["OS41"],
    notes: ["رقم تأكسد النيتروجين المستخدم متوسط ذرتي النيتروجين (−3 في NH₄⁺ و+5 في NO₃⁻).", "مثال لمعادلة بثلاثة نواتج."] },
  // ── single replacement ──
  { id: "zincHydrochloricAcid", nameAr: "تفاعل الخارصين مع حمض الهيدروكلوريك", nameEn: "Zinc and hydrochloric acid", level: "middle",
    reactants: [["Zn", 0, "s", "الخارصين (الزنك)", "metal", { Zn: 0 }], HCL_AQ], products: [["ZnCl2", 0, "aq", "كلوريد الخارصين", "ionic", { Zn: 2, Cl: -1 }], H2], coefficients: [1, 2, 1, 1],
    families: ["singleDisplacement", "redox"], roles: { acid: ["r2"] }, sources: ["OS42"] },
  { id: "magnesiumCopperNitrate", nameAr: "إحلال المغنيسيوم محل النحاس", nameEn: "Magnesium and copper(II) nitrate", level: "secondary",
    reactants: [["Mg", 0, null, "المغنيسيوم", "metal", { Mg: 0 }], ["Cu(NO3)2", 0, null, "نترات النحاس (II)", "ionic", { Cu: 2, N: 5, O: -2 }]],
    products: [["Mg(NO3)2", 0, null, "نترات المغنيسيوم", "ionic", { Mg: 2, N: 5, O: -2 }], ["Cu", 0, null, "النحاس", "metal", { Cu: 0 }]], coefficients: [1, 1, 1, 1],
    families: ["singleDisplacement", "redox"], sources: ["LT75"] },
  { id: "chlorineBromide", nameAr: "إحلال الكلور محل البروم", nameEn: "Chlorine and sodium bromide", level: "secondary",
    reactants: [["NaBr", 0, "aq", "بروميد الصوديوم", "ionic", { Na: 1, Br: -1 }], CL2_G], products: [NACL_AQ, ["Br2", 0, "l", "البروم", "molecule", { Br: 0 }]], coefficients: [2, 1, 2, 1],
    families: ["singleDisplacement", "redox"], sources: ["LT75"] },
  { id: "sodiumWater", nameAr: "تفاعل الصوديوم مع الماء", nameEn: "Sodium and water", level: "middle",
    reactants: [["Na", 0, "s", "الصوديوم", "metal", { Na: 0 }], H2O_L], products: [["NaOH", 0, "aq", "هيدروكسيد الصوديوم", "ionic", { Na: 1, O: -2, H: 1 }], H2], coefficients: [2, 2, 2, 1],
    families: ["redox"], contested: ["singleDisplacement"], sources: ["OS41"], notes: ["تفاعل عنيف؛ يُعرض في المختبر فقط بإشراف مختص وبكميات صغيرة جدًا."] },
  // ── acid–base neutralization ──
  { id: "hydrochloricSodiumHydroxide", nameAr: "تعادل حمض الهيدروكلوريك مع هيدروكسيد الصوديوم", nameEn: "Hydrochloric acid and sodium hydroxide", level: "middle",
    reactants: [HCL_AQ, ["NaOH", 0, "aq", "هيدروكسيد الصوديوم", "ionic", { Na: 1, O: -2, H: 1 }]], products: [NACL_AQ, H2O_L], coefficients: [1, 1, 1, 1],
    families: ["neutralization"], contested: ["doubleDisplacement"], roles: { acid: ["r1"], base: ["r2"] }, sources: ["OS45", "OS42"] },
  { id: "magnesiumHydroxideHydrochloric", nameAr: "تعادل هيدروكسيد المغنيسيوم مع حمض الهيدروكلوريك (مضاد الحموضة)", nameEn: "Magnesium hydroxide and hydrochloric acid", level: "secondary",
    reactants: [["Mg(OH)2", 0, "s", "هيدروكسيد المغنيسيوم", "ionic", { Mg: 2, O: -2, H: 1 }], HCL_AQ], products: [["MgCl2", 0, "aq", "كلوريد المغنيسيوم", "ionic", { Mg: 2, Cl: -1 }], H2O_L], coefficients: [1, 2, 1, 2],
    families: ["neutralization"], contested: ["doubleDisplacement"], roles: { base: ["r1"], acid: ["r2"] }, sources: ["OS42"] },
  { id: "hydroniumHydroxide", nameAr: "المعادلة الأيونية الصافية للتعادل", nameEn: "Net ionic neutralization", level: "secondary",
    reactants: [["H3O", 1, "aq", "أيون الهيدرونيوم", "ion", { H: 1, O: -2 }], OH_AQ], products: [H2O_L], coefficients: [1, 1, 2],
    families: ["neutralization"], contested: ["synthesis"], roles: { acid: ["r1"], base: ["r2"] }, sources: ["OS42"] },
  // ── precipitation ──
  { id: "calciumCarbonatePrecipitation", nameAr: "ترسيب كربونات الكالسيوم", nameEn: "Precipitation of calcium carbonate", level: "middle",
    reactants: [["CaCl2", 0, "aq", "كلوريد الكالسيوم", "ionic", { Ca: 2, Cl: -1 }], ["Na2CO3", 0, "aq", "كربونات الصوديوم", "ionic", { Na: 1, C: 4, O: -2 }]], products: [CACO3_S, NACL_AQ], coefficients: [1, 1, 1, 2],
    families: ["precipitation", "doubleDisplacement"], roles: { precipitate: ["p1"] }, sources: ["CU130", "OS42", "LT75"] },
  { id: "calciumCarbonateNetIonic", nameAr: "المعادلة الأيونية الصافية لترسيب كربونات الكالسيوم", nameEn: "Net ionic precipitation of calcium carbonate", level: "secondary",
    reactants: [["Ca", 2, "aq", "أيون الكالسيوم", "ion", { Ca: 2 }], ["CO3", -2, "aq", "أيون الكربونات", "ion", { C: 4, O: -2 }]], products: [CACO3_S], coefficients: [1, 1, 1],
    families: ["precipitation"], contested: ["synthesis", "doubleDisplacement"], roles: { precipitate: ["p1"] }, sources: ["OS151", "OS42"],
    notes: ["عكس اتزان الذوبان CaCO₃(s) ⇌ Ca²⁺(aq) + CO₃²⁻(aq)؛ أيونات الصوديوم والكلوريد أيونات متفرجة حُذفت."] },
  { id: "magnesiumHydroxideNetIonic", nameAr: "المعادلة الأيونية الصافية لترسيب هيدروكسيد المغنيسيوم", nameEn: "Net ionic precipitation of magnesium hydroxide", level: "secondary",
    reactants: [["Mg", 2, "aq", "أيون المغنيسيوم", "ion", { Mg: 2 }], OH_AQ], products: [["Mg(OH)2", 0, "s", "هيدروكسيد المغنيسيوم", "ionic", { Mg: 2, O: -2, H: 1 }]], coefficients: [1, 2, 1],
    families: ["precipitation"], contested: ["synthesis", "doubleDisplacement"], roles: { precipitate: ["p1"], base: ["r2"] }, sources: ["OS151", "OS42"] },
  // ── ionic equations and selected redox ──
  { id: "carbonDioxideHydroxide", nameAr: "تفاعل ثاني أكسيد الكربون مع أيونات الهيدروكسيد (أيونية صافية)", nameEn: "Carbon dioxide and hydroxide (net ionic)", level: "secondary",
    reactants: [["CO2", 0, "aq", "ثاني أكسيد الكربون", "molecule", { C: 4, O: -2 }], OH_AQ], products: [["CO3", -2, "aq", "أيون الكربونات", "ion", { C: 4, O: -2 }], H2O_L], coefficients: [1, 2, 1, 1],
    families: [], contested: ["neutralization"], roles: { base: ["r2"] }, sources: ["OS41"], notes: ["مثال على حفظ الشحنة: −2 في الجهتين."] },
  { id: "brineElectrolysisNetIonic", nameAr: "التحليل الكهربائي لمحلول كلوريد الصوديوم (أيونية صافية)", nameEn: "Electrolysis of brine (net ionic)", level: "secondary",
    reactants: [["Cl", -1, "aq", "أيون الكلوريد", "ion", { Cl: -1 }], H2O_L], products: [OH_AQ, H2, CL2_G], coefficients: [2, 2, 2, 1, 1],
    families: ["redox"], sources: ["OS41"], notes: ["يحتاج إلى طاقة كهربائية؛ أيونات الصوديوم متفرجة."] },
  { id: "chlorineDisproportionation", nameAr: "تأكسد واختزال الكلور الذاتي في محلول قاعدي", nameEn: "Disproportionation of chlorine in base", level: "secondary",
    reactants: [["Cl2", 0, "aq", "الكلور", "molecule", { Cl: 0 }], OH_AQ], products: [["Cl", -1, "aq", "أيون الكلوريد", "ion", { Cl: -1 }], ["ClO3", -1, "aq", "أيون الكلورات", "ion", { Cl: 5, O: -2 }], H2O_L], coefficients: [3, 6, 5, 1, 3],
    families: ["redox"], sources: ["OS42"], notes: ["الكلور نفسه يتأكسد (0 → +5) ويُختزل (0 → −1)."] },
  { id: "dichromateIron", nameAr: "أكسدة أيونات الحديد (II) بالدايكرومات في وسط حمضي", nameEn: "Iron(II) and dichromate in acid", level: "secondary",
    reactants: [["Fe", 2, null, "أيون الحديد (II)", "ion", { Fe: 2 }], ["Cr2O7", -2, null, "أيون الدايكرومات", "ion", { Cr: 6, O: -2 }], ["H", 1, null, "أيون الهيدروجين", "ion", { H: 1 }]],
    products: [["Fe", 3, null, "أيون الحديد (III)", "ion", { Fe: 3 }], ["Cr", 3, null, "أيون الكروم (III)", "ion", { Cr: 3 }], ["H2O", 0, null, "الماء", "molecule", { H: 1, O: -2 }]], coefficients: [6, 1, 14, 6, 2, 7],
    families: ["redox"], sources: ["OS42"], notes: ["H⁺ اختصار لأيون الهيدرونيوم H₃O⁺ في المحلول المائي.", "الشحنة الكلية +24 في الجهتين."] },
  { id: "permanganateOxalicAcid", nameAr: "تفاعل البرمنغنات مع حمض الأكساليك", nameEn: "Permanganate and oxalic acid", level: "secondary",
    reactants: [["MnO4", -1, "aq", "أيون البرمنغنات", "ion", { Mn: 7, O: -2 }], ["H2C2O4", 0, "aq", "حمض الأكساليك", "molecule", { H: 1, C: 3, O: -2 }], ["H", 1, "aq", "أيون الهيدروجين", "ion", { H: 1 }]],
    products: [CO2_G, ["Mn", 2, "aq", "أيون المنغنيز (II)", "ion", { Mn: 2 }], H2O_L], coefficients: [2, 5, 6, 10, 2, 8],
    families: ["redox"], sources: ["OS45"], notes: ["معادلة معايرة أكسدة واختزال؛ الشحنة الكلية +4 في الجهتين."] }
];

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") { for (const v of Object.values(o)) deepFreeze(v); Object.freeze(o); }
  return o;
}
const term = ([formula, charge, state, nameAr, kind, oxidation]: T): CatalogTerm => ({ formula, charge, state, nameAr, kind, oxidation: { ...oxidation } });
export const REACTION_CATALOG: readonly CatalogReaction[] = deepFreeze(SPECS.map(s => ({
  id: s.id, nameAr: s.nameAr, nameEn: s.nameEn, level: s.level, reactants: s.reactants.map(term), products: s.products.map(term), coefficients: [...s.coefficients],
  families: [...s.families], contested: [...(s.contested ?? [])], roles: { ...(s.roles ?? {}) }, sources: [...s.sources], notes: [...(s.notes ?? [])]
})));
const BY_ID = new Map(REACTION_CATALOG.map(r => [r.id, r]));
export const REACTION_CATALOG_IDS: readonly string[] = Object.freeze(REACTION_CATALOG.map(r => r.id));
export const catalogReaction = (id: unknown): CatalogReaction | undefined => (typeof id === "string" ? BY_ID.get(id) : undefined);

/** The engine form of a catalog reaction (through the strict validator, so the catalog obeys exactly the authored rules). */
const ENGINE = new Map<string, ReactionV1>();
export function catalogReactionV1(c: CatalogReaction): ReactionV1 | undefined {
  const hit = ENGINE.get(c.id);
  if (hit) return hit;
  const r = validateReaction({ reactants: c.reactants.map(t => ({ formula: t.formula, charge: t.charge, state: t.state })), products: c.products.map(t => ({ formula: t.formula, charge: t.charge, state: t.state })) });
  if (!r.ok) return undefined;
  ENGINE.set(c.id, r.reaction);
  return r.reaction;
}

// ── derived facts ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** An oxidation number as an exact fraction [numerator, denominator > 0]. */
export function oxidationFraction(x: OxidationNumber): [number, number] {
  if (typeof x === "number") return [x, 1];
  const [n, d] = x.split("/").map(Number);
  return d < 0 ? [-n, -d] : [n, d];
}
const compare = (a: OxidationNumber, b: OxidationNumber) => { const [an, ad] = oxidationFraction(a), [bn, bd] = oxidationFraction(b); return Math.sign(an * bd - bn * ad); };
/**
 * Redox roles derived from the oxidation numbers: a REACTANT is the reducing agent when one of its elements appears in some product with a
 * higher oxidation number (it is oxidized), the oxidizing agent when one of its elements appears in some product with a lower one (it is
 * reduced). A disproportionating reactant (H₂O₂, Cl₂ in base) is both.
 */
export function redoxRoles(c: CatalogReaction): { oxidizingAgent: string[]; reducingAgent: string[] } {
  const ox: string[] = [], red: string[] = [];
  c.reactants.forEach((t, i) => {
    let up = false, down = false;
    for (const [el, n] of Object.entries(t.oxidation)) for (const p of c.products) {
      const m = p.oxidation[el];
      if (m === undefined) continue;
      const s = compare(m, n);
      if (s > 0) up = true;
      if (s < 0) down = true;
    }
    if (up) red.push("r" + (i + 1));
    if (down) ox.push("r" + (i + 1));
  });
  return { oxidizingAgent: ox, reducingAgent: red };
}
/** The term ids having a role in a catalog reaction (derived or curated), in term order. */
export function catalogRoleTerms(c: CatalogReaction, role: ReactionRole): string[] {
  const all = [...c.reactants.map((t, i) => ({ id: "r" + (i + 1), t })), ...c.products.map((t, i) => ({ id: "p" + (i + 1), t }))];
  if (role === "oxidizingAgent" || role === "reducingAgent") return redoxRoles(c)[role];
  if (role === "element" || role === "compound" || role === "ion") return all.filter(x => termRole(x.t) === role).map(x => x.id);
  const curated = c.roles[role] ?? [];
  return all.filter(x => curated.includes(x.id)).map(x => x.id);
}
/** element (neutral, one element), compound (neutral, ≥ 2 elements) or ion (charged): definitions, true for any term. */
export const termRole = (t: { charge: number; composition?: Readonly<Record<string, number>>; formula?: string; oxidation?: Readonly<Record<string, unknown>> }): "element" | "compound" | "ion" => {
  if (t.charge !== 0) return "ion";
  const elements = t.composition ? Object.keys(t.composition).length : Object.keys(t.oxidation ?? {}).length;
  return elements === 1 ? "element" : "compound";
};
/** How a family applies to a catalog reaction: "yes", "contested" or "no". */
export const familyStatus = (c: CatalogReaction, f: ReactionFamily): "yes" | "contested" | "no" => (c.families.includes(f) ? "yes" : c.contested.includes(f) ? "contested" : "no");
export const REACTION_STATE_LABEL: Readonly<Record<string, string>> = Object.freeze({ s: "صلب", l: "سائل", g: "غاز", aq: "محلول مائي" });
export const isReactionState = (v: unknown): v is ReactionState => typeof v === "string" && (REACTION_STATES as readonly string[]).includes(v);
