// Phase 21D-D.1 — chemistryStructure@1 classroom presets (fresh copies on every call; UI only). Each preset is a complete, valid activity
// with student tasks and PRIVATE checks (never sent to a student). Reference values, computed by hand from the verified data
// (CIAAW 2024 weights, NIST configurations, NIST CCCBDB geometry) and independent of the implementation:
//   sodiumIon   ²³Na⁺: p = 11, n = 23 − 11 = 12, e = 11 − 1 = 10; shells 2, 8; outer shell 8 electrons; cation; s block.
//   chlorine    private species ³⁵Cl (period 3, group 17): p = 17, n = 18, e = 17; shells 2, 8, 7; valence electrons 7.
//   water       H₂O: ∠HOH = 104.4776° (CCCBDB); 2 lone pairs on O; M = 2(1.0080) + 15.999 = 18.015 g/mol; bent; polar; central atom O1.
//   glucose     C₆H₁₂O₆: M = 72.066 + 12.096 + 95.994 = 180.156 g/mol; %C = 72.066 / 180.156 = 40.0020 %; empirical formula CH₂O.
//   hydrate     CuSO₄·5H₂O: M = 159.602 + 90.075 = 249.677 g/mol; %Cu = 63.546 / 249.677 = 25.4513 %; 9 O atoms per formula unit.
import type { ChemConfigV1 } from "../chemistryStructureModel";
import { chemMolecule } from "../chemistry/molecules";

export type ChemPreset = { config: ChemConfigV1; checks: Record<string, unknown>[] };
const view = (periodicTable: "hidden" | "basic" | "detailed", identity: boolean, details: boolean, measure = false) => ({ periodicTable, identity, details, measure });
const noTasks = () => ({ build: false, shells: false, values: [], formulas: [], classifications: [], selection: null });

export const sodiumIonPreset = (): ChemPreset => ({
  config: {
    v: 1, activity: "atom", subject: { element: "Na", massNumber: 23, charge: 1 }, view: view("basic", false, false),
    tasks: { ...noTasks(), build: true, shells: true, values: [{ id: "outer", label: "عدد إلكترونات الغلاف الخارجي للأيون", unit: "1" }],
      classifications: [{ id: "ionKind", label: "نوع هذا النوع الكيميائي", property: "ionType" }, { id: "blockKind", label: "فئة الصوديوم في الجدول الدوري", property: "block" }] }
  },
  checks: [
    { id: "protons", label: "عدد البروتونات", weight: 1, kind: "chem.particles", particles: ["protons"] },
    { id: "neutrons", label: "عدد النيوترونات", weight: 1, kind: "chem.particles", particles: ["neutrons"] },
    { id: "electrons", label: "عدد الإلكترونات", weight: 1, kind: "chem.particles", particles: ["electrons"] },
    { id: "shells", label: "توزيع الإلكترونات على الأغلفة", weight: 2, kind: "chem.shells" },
    { id: "outer", label: "إلكترونات الغلاف الخارجي", weight: 1, kind: "chem.value", valueId: "outer", quantity: "outerShellElectrons", tolerance: 0 },
    { id: "ion-kind", label: "أيون موجب", weight: 1, kind: "chem.classification", taskId: "ionKind" },
    { id: "block", label: "الفئة s", weight: 1, kind: "chem.classification", taskId: "blockKind" }
  ]
});
/** The target stays PRIVATE: the student finds the element (period 3, group 17) on the table and builds its neutral ³⁵Cl atom. */
export const periodicChlorinePreset = (): ChemPreset => {
  const cl = { element: "Cl", massNumber: 35, charge: 0 };
  return {
    config: {
      v: 1, activity: "atom", subject: null, view: view("detailed", false, false),
      tasks: { ...noTasks(), build: true, shells: true, values: [{ id: "valence", label: "عدد إلكترونات التكافؤ لذرة هذا العنصر", unit: "1" }],
        selection: { label: "حدّد في الجدول العنصر الواقع في الدورة 3 والمجموعة 17", target: "elements", max: 1 } }
    },
    checks: [
      { id: "element", label: "اختيار العنصر الصحيح", weight: 2, kind: "setEquals@1", expectedIds: ["Cl"] },
      { id: "particles", label: "بناء ذرة الكلور-35 المتعادلة", weight: 3, kind: "chem.particles", particles: ["protons", "neutrons", "electrons"], species: cl },
      { id: "shells", label: "توزيع إلكترونات الكلور", weight: 2, kind: "chem.shells", species: cl },
      { id: "valence", label: "إلكترونات التكافؤ", weight: 1, kind: "chem.value", valueId: "valence", quantity: "valenceElectrons", tolerance: 0, species: cl }
    ]
  };
};
export const waterPreset = (): ChemPreset => ({
  config: {
    v: 1, activity: "molecule", subject: { molecule: "water" }, view: view("hidden", true, false, true),
    tasks: { ...noTasks(), values: [{ id: "angle", label: "زاوية H–O–H المقيسة", unit: "°" }, { id: "lonePairs", label: "عدد الأزواج غير الرابطة على ذرة الأكسجين", unit: "1" }, { id: "molarMass", label: "الكتلة المولية للماء", unit: "g/mol" }],
      classifications: [{ id: "shape", label: "الشكل الهندسي للجزيء", property: "shape" }, { id: "polarity", label: "قطبية الجزيء", property: "polarity" }],
      selection: { label: "حدّد الذرة المركزية في الجزيء", target: "atoms", max: 1 } }
  },
  checks: [
    { id: "angle", label: "الزاوية H–O–H", weight: 2, kind: "chem.value", valueId: "angle", quantity: "bondAngle", parameter: "aHOH", tolerance: 0.5 },
    { id: "lone-pairs", label: "الأزواج غير الرابطة", weight: 1, kind: "chem.value", valueId: "lonePairs", quantity: "centralLonePairs", tolerance: 0 },
    { id: "molar-mass", label: "الكتلة المولية", weight: 1, kind: "chem.value", valueId: "molarMass", quantity: "molarMass", tolerance: 0.01 },
    { id: "shape", label: "الشكل المنحني", weight: 1, kind: "chem.classification", taskId: "shape" },
    { id: "polarity", label: "جزيء قطبي", weight: 1, kind: "chem.classification", taskId: "polarity" },
    { id: "central", label: "الذرة المركزية O", weight: 1, kind: "setEquals@1", expectedIds: ["O1"] }
  ]
});
/** A generic molecule activity for any catalog molecule: shape, polarity, molar mass (and its formula). */
export function moleculePreset(id: string): ChemPreset {
  if (id === "water") return waterPreset();
  const m = chemMolecule(id) ?? chemMolecule("methane")!;
  return {
    config: {
      v: 1, activity: "molecule", subject: { molecule: m.id }, view: view("hidden", false, false, true),
      tasks: { ...noTasks(), values: [{ id: "molarMass", label: "الكتلة المولية", unit: "g/mol" }], formulas: [{ id: "formula", label: "الصيغة الجزيئية" }],
        classifications: [{ id: "shape", label: "الشكل الهندسي", property: "shape" }, { id: "polarity", label: "القطبية", property: "polarity" }] }
    },
    checks: [
      { id: "formula", label: "الصيغة الجزيئية", weight: 1, kind: "chem.formula", formulaId: "formula", target: "molecular" },
      { id: "molar-mass", label: "الكتلة المولية", weight: 1, kind: "chem.value", valueId: "molarMass", quantity: "molarMass", tolerance: 0.01 },
      { id: "shape", label: "الشكل الهندسي", weight: 1, kind: "chem.classification", taskId: "shape" },
      { id: "polarity", label: "القطبية", weight: 1, kind: "chem.classification", taskId: "polarity" }
    ]
  };
}
export const glucosePreset = (): ChemPreset => ({
  config: {
    v: 1, activity: "formula", subject: { formula: "C6H12O6" }, view: view("basic", false, false),
    tasks: { ...noTasks(), values: [{ id: "molarMass", label: "الكتلة المولية للغلوكوز", unit: "g/mol" }, { id: "carbonPercent", label: "النسبة المئوية الكتلية للكربون", unit: "%" }],
      formulas: [{ id: "empirical", label: "الصيغة الأولية (أبسط نسبة)" }] }
  },
  checks: [
    { id: "molar-mass", label: "الكتلة المولية", weight: 2, kind: "chem.value", valueId: "molarMass", quantity: "molarMass", tolerance: 0.05 },
    { id: "carbon", label: "نسبة الكربون", weight: 2, kind: "chem.value", valueId: "carbonPercent", quantity: "massPercent", element: "C", tolerance: 0.1 },
    { id: "empirical", label: "الصيغة الأولية CH₂O", weight: 2, kind: "chem.formula", formulaId: "empirical", target: "empirical" }
  ]
});
export const hydratePreset = (): ChemPreset => ({
  config: {
    v: 1, activity: "formula", subject: { formula: "CuSO4·5H2O" }, view: view("basic", false, false),
    tasks: { ...noTasks(), values: [{ id: "molarMass", label: "الكتلة المولية لكبريتات النحاس المائية", unit: "g/mol" }, { id: "copperPercent", label: "النسبة المئوية الكتلية للنحاس", unit: "%" }, { id: "oxygenAtoms", label: "عدد ذرات الأكسجين في وحدة الصيغة", unit: "1" }] }
  },
  checks: [
    { id: "molar-mass", label: "الكتلة المولية", weight: 2, kind: "chem.value", valueId: "molarMass", quantity: "molarMass", tolerance: 0.05 },
    { id: "copper", label: "نسبة النحاس", weight: 2, kind: "chem.value", valueId: "copperPercent", quantity: "massPercent", element: "Cu", tolerance: 0.1 },
    { id: "oxygen", label: "ذرات الأكسجين", weight: 1, kind: "chem.value", valueId: "oxygenAtoms", quantity: "countOf", element: "O", tolerance: 0 }
  ]
});
export const CHEM_PRESETS: Readonly<Record<string, { label: string; make: () => ChemPreset }>> = Object.freeze({
  sodiumIon: { label: "أيون الصوديوم ²³Na⁺: البناء والأغلفة", make: sodiumIonPreset },
  periodicChlorine: { label: "الجدول الدوري: عنصر الدورة 3 والمجموعة 17", make: periodicChlorinePreset },
  water: { label: "جزيء الماء ثلاثي الأبعاد", make: waterPreset },
  glucose: { label: "صيغة الغلوكوز: الكتلة المولية والصيغة الأولية", make: glucosePreset },
  hydrate: { label: "كبريتات النحاس المائية CuSO₄·5H₂O", make: hydratePreset }
});
