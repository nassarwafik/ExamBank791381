// Phase 21D-D.3 — deterministic Arabic 100-mark acceptance exam for chemistryLab@1: Lab A (a standard solution from a solid; a dilution),
// Lab B (pH meter and acid / base classification; indicators without a meter), Lab C (a strong acid / strong base titration with the pH meter
// and the curve; an unknown acid by indicator only), Lab D (reaction rate: temperature and a catalyst), a section of conventional questions
// graded "first 2 answered", and a shared titration context (limewater, a 2 : 1 mole ratio) graded by linked SmartSim parts and a
// conventional part. Plain data written the way a teacher's saved exam looks; the templates are the ones the teacher editor offers. The JSON
// fixture is generated from this source (drift-tested) and every decision about it is made by the production authorities.
import * as K from "../certification-20g/kit.js";
import { dilutionTemplate, indicatorTemplate, phCompareTemplate, rateTemplate, solidPrepareTemplate, titrationTemplate, unknownTitrationTemplate } from "../../../src/chemistryLab/labTemplates.ts";

export const CHEMISTRY_LAB_ACCEPTANCE_PATH = "docs/fixtures/chemistry-lab-21dd3/ExamBank_21DD3_Chemistry_Lab_Acceptance.json";
export const serializeExam = exam => JSON.stringify(exam, null, 2) + "\n";

/** Limewater titrated with hydrochloric acid (exam mode: indicator only): 2HCl + Ca(OH)₂ → CaCl₂ + 2H₂O, V_eq = 25.00 mL. */
export const limewaterContext = () => ({
  v: 1,
  experiment: { kind: "titration", analyte: { species: "CaOH2", volume: "25.00", concentration: "0.0100", equivalence: null }, titrant: { species: "HCl", concentration: "0.0200" }, indicators: ["methylOrange", "bromothymolBlue", "phenolphthalein"] },
  view: { readouts: false, graph: false },
  tasks: [
    { id: "veq", label: "ما حجم HCl عند نقطة التكافؤ؟", kind: "number", quantity: "equivalenceVolume", subject: null, other: null, at: null, unit: "mL", precision: { decimals: 2 } },
    { id: "nH", label: "احسب عدد مولات HCl المستهلكة حتى نقطة التكافؤ (بالملي مول).", kind: "number", quantity: "titrantMoles", subject: null, other: null, at: null, unit: "mmol", precision: { significant: 3 } },
    { id: "suitable", label: "أيّ الكواشف مناسب لهذه المعايرة (خطأ نقطة النهاية لا يتجاوز 0.10 mL)؟", kind: "choice", question: "suitableIndicators", subject: null, other: null, mode: "multiple", options: ["methylOrange", "bromothymolBlue", "phenolphthalein"] }
  ]
});

export function buildChemistryLabAcceptanceExam() {
  const sim = (id, text, marks, t) => K.smartSim(id, text, marks, "chemistryLab", 1, t.config, t.checks);
  return K.exam("EXAMBANK-21DD3-CHEMISTRY-LAB", "ExamBank 21D-D.3 — اختبار القبول للمختبر الكيميائي الافتراضي", [
    K.section("sec-a", "أ — المحاليل والتخفيف", [
      sim("a1", "حضّر محلولًا قياسيًا من كلوريد الصوديوم بالوزن والإكمال إلى العلامة، ثم احسب تركيزه وعدد مولاته.", 12, solidPrepareTemplate()),
      sim("a2", "حضّر محلولًا مخففًا من كبريتات النحاس (II) باختيار الماصّة المناسبة، وبيّن ما يبقى ثابتًا عند التخفيف.", 10, dilutionTemplate())
    ]),
    K.section("sec-b", "ب — الأحماض والقواعد والرقم الهيدروجيني", [
      sim("b1", "قِس pH أربعة محاليل وصنّفها، وقارن بين الحمض القوي والحمض الضعيف عند التركيز نفسه.", 12, phCompareTemplate()),
      sim("b2", "استخدم الكواشف (دون جهاز قياس) لتمييز الأوساط، واحسب pH محلول حمض قوي.", 8, indicatorTemplate())
    ]),
    K.section("sec-c", "ج — المعايرة", [
      sim("c1", "عايِر 25.00 mL من HCl ‏0.100 mol/L بمحلول NaOH ‏0.100 mol/L مستخدمًا جهاز pH، وحدّد نقطة التكافؤ.", 12, titrationTemplate()),
      sim("c2", "عيّن تركيز حمض الهيدروكلوريك المجهول بالمعايرة مع الكاشف، واختر الكواشف المناسبة.", 12, unknownTitrationTemplate())
    ]),
    K.section("sec-d", "د — سرعة التفاعل", [
      sim("d1", "شغّل التجارب الثلاث وقارن السرعات، واحسب عمر النصف ونسبة السرعة بين درجتي الحرارة.", 12, rateTemplate())
    ]),
    K.section("sec-e", "هـ — أسئلة تقليدية (أجب عن سؤالين فقط)", [
      K.mcq("e1", "ما الفرق بين نقطة التكافؤ ونقطة النهاية في المعايرة؟", 4, [
        "نقطة التكافؤ تتحدد بنسب المعادلة الموزونة، ونقطة النهاية هي الحجم الذي يتغير عنده لون الكاشف",
        "هما الشيء نفسه في كل معايرة",
        "نقطة النهاية تسبق نقطة التكافؤ دائمًا"
      ], 0),
      K.numeric("e2", "خُفّف 25.0 mL من محلول تركيزه 0.200 mol/L إلى 100.0 mL. ما التركيز الجديد بوحدة mol/L؟", 4, 0.05, 0.0005),
      K.trueFalse("e3", "الحافز يزيد سرعة التفاعل لأنه يخفض طاقة التنشيط دون أن يُستهلك في التفاعل.", 4, true)
    ], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 2, maxMarks: 8 }),
    K.section("sec-f", "و — سياق مشترك", [
      K.composite("f1", "استخدم معايرة ماء الجير المشتركة للإجابة.", 14,
        [K.simContext("ctxLimewater", "معايرة ماء الجير بحمض الهيدروكلوريك", "chemistryLab", 1, limewaterContext())],
        [K.group("gA", "مرتبط بالمعايرة", [
          K.linkedSim("p1", "أ", "حدّد حجم نقطة التكافؤ وعدد مولات الحمض المستهلكة.", 6, "ctxLimewater", [
            { id: "veq", label: "حجم التكافؤ", weight: 2, kind: "lab.number", taskId: "veq" },
            { id: "nH", label: "مولات HCl", weight: 1, kind: "lab.number", taskId: "nH" }
          ]),
          K.linkedSim("p2", "ب", "اختر الكواشف المناسبة.", 4, "ctxLimewater", [
            { id: "suitable", label: "الكواشف المناسبة", weight: 1, kind: "lab.choice", taskId: "suitable" }
          ]),
          K.part("p3", "ج", K.mcq("x", "لماذا يلزم 25.00 mL من HCl ‏0.0200 mol/L لمعايرة 25.00 mL من Ca(OH)₂ ‏0.0100 mol/L؟", 4, [
            "لأن كل وحدة صيغة من Ca(OH)₂ تعطي أيوني OH⁻ فيلزمها مولان من HCl",
            "لأن الحمض أقوى من القاعدة",
            "لأن pH نقطة التكافؤ أقل من 7"
          ], 0))
        ])])
    ])
  ], { coverPage: K.cover("المحاليل والتخفيف، pH والكواشف، المعايرة، سرعة التفاعل", "أجرِ التجارب في المختبر الافتراضي وسجّل ملاحظاتك، ثم اكتب الإجابات بالدقة والوحدة المطلوبة. الألوان تمثيل توضيحي. هذه محاكاة للتعلّم وليست دليلًا لتجارب حقيقية."), presentation: { schemaVersion: 1, preset: "modernAcademic" } });
}
