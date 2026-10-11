// Phase 21D-D.2 — chemistryReactions@1 classroom templates (fresh copies on every call; UI only). Each template is a complete, valid
// question with student tasks and PRIVATE checks (never sent to a student); every expected answer is derived by the exact solver or the
// curated catalog at grading time. Hand-checked references (independent of the implementation; sources in src/chemistry/reactionCatalog.ts):
//   water          2H₂ + O₂ → 2H₂O: H 4 = 4, O 2 = 2; a combination (and a combustion and a redox reaction).
//   methane        CH₄ + 2O₂ → CO₂ + 2H₂O: C 1 = 1, H 4 = 4, O 4 = 2 + 2; fuel CH₄.
//   iron           4Fe + 3O₂ → 2Fe₂O₃: Fe 4 = 4, O 6 = 6; Fe 0 → +3 is oxidized (reducing agent); combustion is contested (rusting), never offered.
//   CaCO₃          CaCO₃ → CaO + CO₂: Ca 1, C 1, O 3 = 1 + 2; a decomposition, NOT a redox (no oxidation number changes).
//   neutralization Mg(OH)₂ + 2HCl → MgCl₂ + 2H₂O: Mg 1, Cl 2, O 2, H 2 + 2 = 4; acid HCl, base Mg(OH)₂; double replacement contested.
//   precipitation  CaCl₂ + Na₂CO₃ → CaCO₃ + 2NaCl: precipitation AND double replacement; the precipitate is CaCO₃(s).
//   dichromate     6Fe²⁺ + Cr₂O₇²⁻ + 14H⁺ → 6Fe³⁺ + 2Cr³⁺ + 7H₂O: charge 12 − 2 + 14 = 24 = 18 + 6; Fe²⁺ reducing, Cr₂O₇²⁻ oxidizing.
//   aluminium      (teacher's own equation) 4Al + 3O₂ → 2Al₂O₃: Al 4 = 4, O 6 = 6; Al and O₂ are elements.
import type { RxnConfigV1, RxnView } from "../chemistryReactionsModel";

export type RxnTemplate = { config: RxnConfigV1; checks: Record<string, unknown>[] };
const view = (conservation: boolean, particles = true, states = true, names = true): RxnView => ({ conservation, particles, states, names });
const check = (id: string, label: string, kind: string, weight = 1, extra: Record<string, unknown> = {}) => ({ id, label, weight, kind, ...extra });

export const waterTemplate = (): RxnTemplate => ({
  config: {
    v: 1, reaction: { catalog: "waterFormation" }, view: view(true),
    tasks: { balance: { locked: [] }, classifications: [{ id: "family", label: "نوع هذا التفاعل", mode: "single", options: ["synthesis", "decomposition", "singleDisplacement", "doubleDisplacement"] }], selections: [] }
  },
  checks: [check("balanced", "المعادلة موزونة (حفظ الذرات)", "rxn.balanced", 2), check("lowest", "أصغر معاملات صحيحة", "rxn.lowest"), check("family", "تفاعل اتحاد", "rxn.classification", 1, { taskId: "family" })]
});
export const methaneTemplate = (): RxnTemplate => ({
  config: {
    v: 1, reaction: { catalog: "methaneCombustion" }, view: view(true),
    tasks: { balance: { locked: [] }, classifications: [{ id: "family", label: "نوع هذا التفاعل", mode: "single", options: ["combustion", "decomposition", "synthesis", "neutralization"] }],
      selections: [{ id: "fuel", label: "اختر الوقود في هذا التفاعل", role: "fuel" }] }
  },
  checks: [check("balanced", "المعادلة موزونة", "rxn.balanced", 2), check("lowest", "أصغر معاملات صحيحة", "rxn.lowest"), check("oxygen", "ذرات الأكسجين محفوظة", "rxn.element", 1, { element: "O" }),
    check("family", "تفاعل احتراق", "rxn.classification", 1, { taskId: "family" }), check("fuel", "الوقود هو الميثان", "rxn.selection", 1, { taskId: "fuel" })]
});
export const ironTemplate = (): RxnTemplate => ({
  config: {
    v: 1, reaction: { catalog: "ironOxidation" }, view: view(true),
    tasks: { balance: { locked: ["p1"] }, classifications: [{ id: "family", label: "نوع هذا التفاعل", mode: "single", options: ["synthesis", "decomposition", "singleDisplacement", "precipitation"] }],
      selections: [{ id: "reducer", label: "اختر المادة التي تتأكسد (العامل المختزل)", role: "reducingAgent" }] }
  },
  checks: [check("balanced", "المعادلة موزونة", "rxn.balanced", 2), check("iron", "معامل الحديد", "rxn.coefficient", 1, { termId: "r1" }), check("oxygen", "معامل الأكسجين", "rxn.coefficient", 1, { termId: "r2" }),
    check("family", "تفاعل اتحاد", "rxn.classification", 1, { taskId: "family" }), check("reducer", "الحديد يتأكسد", "rxn.selection", 1, { taskId: "reducer" })]
});
export const calciumCarbonateTemplate = (): RxnTemplate => ({
  config: {
    v: 1, reaction: { catalog: "calciumCarbonateDecomposition" }, view: view(false),
    tasks: { balance: { locked: [] }, classifications: [{ id: "families", label: "اختر كل الأنواع التي ينتمي إليها التفاعل", mode: "multiple", options: ["decomposition", "synthesis", "redox", "combustion"] }], selections: [] }
  },
  checks: [check("balanced", "المعادلة موزونة", "rxn.balanced", 1), check("families", "تفكك وليس أكسدة واختزال", "rxn.classification", 2, { taskId: "families" })]
});
export const neutralizationTemplate = (): RxnTemplate => ({
  config: {
    v: 1, reaction: { catalog: "magnesiumHydroxideHydrochloric" }, view: view(true),
    tasks: { balance: { locked: [] }, classifications: [{ id: "family", label: "نوع هذا التفاعل", mode: "single", options: ["neutralization", "combustion", "decomposition", "synthesis"] }],
      selections: [{ id: "acid", label: "اختر الحمض", role: "acid" }, { id: "base", label: "اختر القاعدة", role: "base" }] }
  },
  checks: [check("balanced", "المعادلة موزونة", "rxn.balanced", 2), check("lowest", "أصغر معاملات صحيحة", "rxn.lowest"), check("family", "تفاعل تعادل", "rxn.classification", 1, { taskId: "family" }),
    check("acid", "الحمض HCl", "rxn.selection", 1, { taskId: "acid" }), check("base", "القاعدة Mg(OH)₂", "rxn.selection", 1, { taskId: "base" })]
});
export const precipitationTemplate = (): RxnTemplate => ({
  config: {
    v: 1, reaction: { catalog: "calciumCarbonatePrecipitation" }, view: view(true),
    tasks: { balance: { locked: [] }, classifications: [{ id: "families", label: "اختر كل الأنواع التي ينتمي إليها التفاعل", mode: "multiple", options: ["precipitation", "doubleDisplacement", "redox", "combustion"] }],
      selections: [{ id: "solid", label: "اختر الراسب", role: "precipitate" }] }
  },
  checks: [check("balanced", "المعادلة موزونة", "rxn.balanced", 2), check("families", "ترسيب وإحلال مزدوج", "rxn.classification", 1, { taskId: "families" }), check("solid", "الراسب CaCO₃", "rxn.selection", 1, { taskId: "solid" })]
});
export const dichromateTemplate = (): RxnTemplate => ({
  config: {
    v: 1, reaction: { catalog: "dichromateIron" }, view: view(true, false),
    tasks: { balance: { locked: ["r2"] }, classifications: [],
      selections: [{ id: "oxidizer", label: "اختر العامل المؤكسد", role: "oxidizingAgent" }, { id: "reducer", label: "اختر العامل المختزل", role: "reducingAgent" }] }
  },
  checks: [check("balanced", "المعادلة موزونة (الذرات والشحنة)", "rxn.balanced", 3), check("charge", "الشحنة محفوظة", "rxn.charge", 1), check("lowest", "أصغر معاملات صحيحة", "rxn.lowest"),
    check("oxidizer", "Cr₂O₇²⁻ عامل مؤكسد", "rxn.selection", 1, { taskId: "oxidizer" }), check("reducer", "Fe²⁺ عامل مختزل", "rxn.selection", 1, { taskId: "reducer" })]
});
/** A teacher's own equation (not in the catalog): balancing and element / compound roles only — never a guessed family. */
export const customAluminiumTemplate = (): RxnTemplate => ({
  config: {
    v: 1, reaction: { custom: { reactants: [{ formula: "Al", charge: 0, state: "s" }, { formula: "O2", charge: 0, state: "g" }], products: [{ formula: "Al2O3", charge: 0, state: "s" }] } },
    view: view(true, true, true, false),
    tasks: { balance: { locked: [] }, classifications: [], selections: [{ id: "elements", label: "اختر المواد التي هي عناصر", role: "element" }] }
  },
  checks: [check("balanced", "المعادلة موزونة", "rxn.balanced", 2), check("aluminium", "ذرات الألومنيوم محفوظة", "rxn.element", 1, { element: "Al" }), check("oxygen", "ذرات الأكسجين محفوظة", "rxn.element", 1, { element: "O" }),
    check("lowest", "أصغر معاملات صحيحة", "rxn.lowest"), check("elements", "Al وO₂ عنصران", "rxn.selection", 1, { taskId: "elements" })]
});
export const RXN_TEMPLATES: Readonly<Record<string, { label: string; make: () => RxnTemplate }>> = Object.freeze({
  water: { label: "تكوين الماء — الوزن والتصنيف (متوسط)", make: waterTemplate },
  methane: { label: "احتراق الميثان — الوزن والتصنيف والوقود (متوسط)", make: methaneTemplate },
  iron: { label: "أكسدة الحديد — معامل معطى والعامل المختزل (متوسط)", make: ironTemplate },
  calciumCarbonate: { label: "تفكك كربونات الكالسيوم — اختيار متعدد للأنواع (متوسط)", make: calciumCarbonateTemplate },
  neutralization: { label: "تعادل هيدروكسيد المغنيسيوم — الحمض والقاعدة (ثانوي)", make: neutralizationTemplate },
  precipitation: { label: "ترسيب كربونات الكالسيوم — الراسب (متوسط)", make: precipitationTemplate },
  dichromate: { label: "الدايكرومات والحديد — حفظ الشحنة والعوامل (ثانوي)", make: dichromateTemplate },
  customAluminium: { label: "معادلة يكتبها المعلم — الألومنيوم والأكسجين (ثانوي)", make: customAluminiumTemplate }
});
