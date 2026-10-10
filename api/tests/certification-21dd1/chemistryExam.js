// Phase 21D-D.1 — deterministic Arabic acceptance exam for chemistryStructure@1: atoms / ions (²³Na⁺), the periodic table with a PRIVATE
// target species (³⁵Cl), 3D molecules (water, carbon dioxide), formulas and composition (glucose, CuSO₄·5H₂O) and a shared composite
// context (ammonia). Plain data written the way a teacher's saved exam looks; the presets are the ones the teacher editor offers. The JSON
// fixture is generated from this source (drift-tested) and every decision about it is made by the production authorities.
import * as K from "../certification-20g/kit.js";
import { glucosePreset, hydratePreset, moleculePreset, periodicChlorinePreset, sodiumIonPreset, waterPreset } from "../../../src/chemistryStructure/chemTemplates.ts";

export const CHEMISTRY_ACCEPTANCE_PATH = "docs/fixtures/chemistry-structure-21dd1/ExamBank_21DD1_Chemistry_Structure_Acceptance.json";
export const serializeExam = exam => JSON.stringify(exam, null, 2) + "\n";

/** Ammonia shared by a composite question: its shape and the H–N–H angle measured with the probe (CCCBDB: 106.67°). */
export const ammoniaContext = () => ({
  v: 1, activity: "molecule", subject: { molecule: "ammonia" }, view: { periodicTable: "hidden", identity: true, details: false, measure: true },
  tasks: { build: false, shells: false, values: [{ id: "angleHNH", label: "زاوية H–N–H المقيسة", unit: "°" }], formulas: [],
    classifications: [{ id: "shape", label: "الشكل الهندسي لجزيء الأمونيا", property: "shape" }], selection: null }
});

export function buildChemistryAcceptanceExam() {
  const sim = (id, text, marks, preset) => K.smartSim(id, text, marks, "chemistryStructure", 1, preset.config, preset.checks);
  return K.exam("EXAMBANK-21DD1-CHEMISTRY-STRUCTURE", "ExamBank 21D-D.1 — اختبار القبول لمحاكاة البنية الذرية والجزيئية", [
    K.section("sec-a", "أ — بنية الذرة والأيون", [sim("a1", "ابنِ أيون الصوديوم ²³Na⁺ (عدد البروتونات والنيوترونات والإلكترونات)، ثم وزّع إلكتروناته على الأغلفة وصنّفه.", 8, sodiumIonPreset())]),
    K.section("sec-b", "ب — الجدول الدوري", [sim("b1", "حدّد في الجدول الدوري العنصر الواقع في الدورة 3 والمجموعة 17، ثم ابنِ ذرته المتعادلة ذات العدد الكتلي 35 ووزّع إلكتروناتها.", 8, periodicChlorinePreset())]),
    K.section("sec-c", "ج — الجزيئات ثلاثية الأبعاد", [
      sim("c1", "دوّر جزيء الماء وقِس الزاوية H–O–H، وحدّد الذرة المركزية، ثم أجب عن شكله وقطبيته وكتلته المولية.", 7, waterPreset()),
      sim("c2", "تأمل جزيء ثاني أكسيد الكربون: اكتب صيغته الجزيئية وكتلته المولية وصنّف شكله وقطبيته.", 4, moleculePreset("carbonDioxide"))
    ]),
    K.section("sec-d", "د — الصيغ الكيميائية والتركيب", [
      sim("d1", "للغلوكوز C₆H₁₂O₆: احسب الكتلة المولية والنسبة المئوية الكتلية للكربون، واكتب الصيغة الأولية.", 6, glucosePreset()),
      sim("d2", "لكبريتات النحاس المائية CuSO₄·5H₂O: احسب الكتلة المولية ونسبة النحاس وعدد ذرات الأكسجين في وحدة الصيغة.", 5, hydratePreset())
    ]),
    K.section("sec-e", "هـ — سياق مشترك", [
      K.composite("e1", "استخدم نموذج جزيء الأمونيا المشترك للإجابة.", 5,
        [K.simContext("ctxAmmonia", "جزيء الأمونيا", "chemistryStructure", 1, ammoniaContext())],
        [K.group("gA", "مرتبط بالنموذج", [
          K.linkedSim("p1", "أ", "قِس الزاوية H–N–H وصنّف شكل الجزيء.", 3, "ctxAmmonia", [
            { id: "shape", label: "هرم ثلاثي", weight: 1, kind: "chem.classification", taskId: "shape" },
            { id: "angle", label: "الزاوية H–N–H", weight: 1, kind: "chem.value", valueId: "angleHNH", quantity: "bondAngle", parameter: "aHNH", tolerance: 0.5 }
          ]),
          K.part("p2", "ب", K.mcq("x", "لماذا تقل الزاوية H–N–H في الأمونيا عن الزاوية الرباعية 109.5°؟", 2, ["لأن زوج الإلكترونات غير الرابط يتنافر بقوة أكبر مع أزواج الروابط", "لأن الروابط N–H ثنائية", "لأن ذرة النيتروجين أكبر من ذرة الكربون"], 0))
        ])])
    ])
  ], { coverPage: K.cover("بنية الذرة والأيون، الجدول الدوري، الجزيئات ثلاثية الأبعاد، الصيغ والتركيب", "احفظ كل إجابة صراحةً. التدوير والتكبير والقياس واستكشاف الجدول لا تُقيَّم. الكتل الذرية: CIAAW 2024."), presentation: { schemaVersion: 1, preset: "modernAcademic" } });
}
