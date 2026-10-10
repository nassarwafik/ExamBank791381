// Phase 21D-A.2 — deterministic Arabic acceptance exam for physicsLab@1: SIM-05 pendulum, SIM-06 Hooke's law / spring, SIM-07 mechanical
// energy (without and WITH a dissipative force), SIM-08 DC circuit, plus a parallel circuit shared as a composite context. Plain data
// written the way a teacher's saved exam looks; the classroom presets are the ones the teacher editor offers. The JSON fixture is generated
// from this source (drift-tested) and every decision about it is made by the production authorities.
import * as K from "../certification-20g/kit.js";
import { LAB_PRESETS } from "../../../src/physicsLab/labTemplates.ts";

export const PHYSICS_LAB_ACCEPTANCE_PATH = "docs/fixtures/physics-lab-21da2/ExamBank_21DA2_Advanced_Physics_Acceptance.json";
export const serializeExam = exam => JSON.stringify(exam, null, 2) + "\n";

/** SIM-07 with air resistance b = 0.5 kg/s: energy is NOT conserved; the student measures the energy dissipated before impact. */
export const energyWithDrag = () => {
  const { config } = LAB_PRESETS.energy();
  return {
    config: { ...config, params: { ...config.params, drag: 0.5 }, view: { ...config.view, maxTime: 6 },
      tasks: { measurements: [{ id: "initialEnergy", label: "الطاقة الميكانيكية الابتدائية", unit: "J" }, { id: "energyLost", label: "الطاقة المبددة بالمقاومة حتى الارتطام", unit: "J" }], points: [] } },
    checks: [
      { id: "initial-energy", label: "الطاقة الابتدائية", weight: 1, kind: "lab.referenceValue", measurementId: "initialEnergy", quantity: "initialEnergy", tolerance: 1 },
      { id: "energy-lost", label: "الطاقة المبددة", weight: 2, kind: "lab.referenceValue", measurementId: "energyLost", quantity: "energyDissipated", tolerance: 2 }
    ]
  };
};
/** A parallel circuit (12 V; 6 Ω ∥ 12 Ω ∥ 4 Ω = 2 Ω; I = 6 A) shared by a composite question. */
export const parallelCircuit = () => {
  const { config } = LAB_PRESETS.circuit();
  return { ...config, params: { voltage: 12, r1: 6, r2: 12, r3: 4, topology: 2 }, controls: [],
    tasks: { measurements: [{ id: "totalCurrent", label: "التيار الكلي في الدائرة", unit: "A" }, { id: "current3", label: "التيار في R3", unit: "A" }], points: [] } };
};

export function buildPhysicsLabAcceptanceExam() {
  const P = LAB_PRESETS, drag = energyWithDrag();
  const sim = (id, text, marks, preset) => K.smartSim(id, text, marks, "physicsLab", 1, preset.config, preset.checks);
  return K.exam("EXAMBANK-21DA2-ADVANCED-PHYSICS", "ExamBank 21D-A.2 — اختبار القبول لمختبر الفيزياء المتقدم", [
    K.section("sec-a", "أ — البندول البسيط", [sim("a1", "بندول طول خيطه 1 m يُفلت من زاوية 10°. قِس دوره من الحركة، واحسب دوره بتقريب الزاوية الصغيرة، وسجّل أقصى سرعة للثقل.", 6, P.pendulum())]),
    K.section("sec-b", "ب — قانون هوك والنابض", [sim("b1", "كتلة 0.5 kg معلّقة بنابض ثابته 20 N/m أُزيحت 0.1 m أسفل موضع الاتزان ثم أُفلتت. سجّل الدور واستطالة الاتزان والقوة المُعيدة، وحدّد أول مرور بالاتزان.", 6, P.spring())]),
    K.section("sec-c", "ج — الطاقة الميكانيكية", [
      sim("c1", "يُقذف جسم كتلته 2 kg إلى الأعلى بسرعة 10 m/s من ارتفاع 20 m دون مقاومة هواء. تتبّع الطاقة الحركية وطاقة الوضع والطاقة الكلية.", 5, P.energy()),
      sim("c2", "الجسم نفسه مع مقاومة هواء خطية b = 0.5 kg/s: الطاقة الميكانيكية لا تُحفظ. سجّل الطاقة الابتدائية والطاقة المبددة حتى الارتطام.", 5, drag)
    ]),
    K.section("sec-d", "د — الدوائر الكهربائية", [sim("d1", "مصدر 12 V يغذّي R1 = 2 Ω على التوالي مع (R2 = 6 Ω ∥ R3 = 3 Ω). استخدم الأميتر والفولتميتر لتسجيل القيم المطلوبة.", 7, P.circuit())]),
    K.section("sec-e", "هـ — سياق مشترك", [
      K.composite("e1", "استخدم دائرة التوازي المشتركة للإجابة.", 5,
        [K.simContext("ctxParallel", "دائرة توازٍ", "physicsLab", 1, parallelCircuit())],
        [K.group("gA", "مرتبط بالدائرة", [
          K.linkedSim("p1", "أ", "سجّل التيار الكلي في الدائرة.", 3, "ctxParallel", [{ id: "itotal", label: "التيار الكلي", weight: 1, kind: "lab.referenceValue", measurementId: "totalCurrent", quantity: "totalCurrent", tolerance: 0.05 }]),
          K.part("p2", "ب", K.mcq("x", "في دائرة التوازي يكون فرق الجهد على كل مقاومة:", 2, ["مساويًا لجهد المصدر", "مساويًا لنصف جهد المصدر", "متناسبًا عكسيًا مع المقاومة"], 0))
        ])])
    ])
  ], { coverPage: K.cover("البندول، قانون هوك، الطاقة الميكانيكية، الدوائر الكهربائية", "شغّل كل محاكاة واستخدم الإيقاف والخطوة المفردة والقياس، ثم سجّل القيم بوحدات SI. الاستكشاف لا يُقيَّم."), presentation: { schemaVersion: 1, preset: "modernAcademic" } });
}
