// Phase 21D-A.1 — deterministic acceptance exam for physicsMotion@1 (SIM-01 free fall, SIM-02 projectile, SIM-03 Newton's second law,
// SIM-04 inclined plane, plus the incline as a SHARED composite context). Plain data written the way a teacher's saved exam looks; the
// classroom presets are the same ones the teacher editor offers. The JSON fixture is generated from this source (drift-tested) and every
// decision about it — import, finalization, sanitization, grading — is made by the production authorities.
import * as K from "../certification-20g/kit.js";
import { MOTION_PRESETS } from "../../../src/physicsMotion/motionTemplates.ts";

export const PHYSICS_MOTION_ACCEPTANCE_PATH = "docs/fixtures/physics-motion-21da1/ExamBank_21DA1_Physics_Motion_Acceptance.json";
export const serializeExam = exam => JSON.stringify(exam, null, 2) + "\n";

/** The frictionless incline used as a shared composite context: θ = 30°, μ = 0 ⇒ a = g·sin30° = 4.9 m/s², t = √(2·10/4.9) = 2.02031 s. */
export const frictionlessIncline = () => {
  const { config } = MOTION_PRESETS.incline();
  return { ...config, params: { ...config.params, muStatic: 0, muKinetic: 0 }, tasks: { measurements: [{ id: "acceleration", label: "تسارع الجسم دون احتكاك", unit: "m/s²" }, { id: "timeToBottom", label: "زمن الوصول إلى الأسفل", unit: "s" }], points: [] } };
};

export function buildPhysicsMotionAcceptanceExam() {
  const P = MOTION_PRESETS;
  const sim = (id, text, marks, preset) => K.smartSim(id, text, marks, "physicsMotion", 1, preset.config, preset.checks);
  return K.exam("EXAMBANK-21DA1-PHYSICS-MOTION", "ExamBank 21D-A.1 — اختبار القبول لمحاكيات الحركة", [
    K.section("sec-a", "أ — السقوط الحر", [sim("a1", "يسقط جسم من السكون من ارتفاع 45 m (g = 9.8 m/s²). شغّل المحاكاة وراقب المنحنيات ثم سجّل قياساتك.", 6, P.freeFall())]),
    K.section("sec-b", "ب — حركة المقذوفات", [sim("b1", "يُقذف جسم بسرعة 20 m/s بزاوية 45° من سطح الأرض. سجّل المدى وأقصى ارتفاع وزمن الطيران وحدّد نقطة السقوط.", 6, P.projectile())]),
    K.section("sec-c", "ج — قانون نيوتن الثاني", [sim("c1", "تؤثر قوة أفقية 10 N في صندوق كتلته 2 kg على سطح خشن (μs = 0.3، μk = 0.2). سجّل التسارع وقوة الاحتكاك والسرعة بعد 4 ث.", 5, P.newton2())]),
    K.section("sec-d", "د — المستوى المائل", [sim("d1", "ينزلق صندوق كتلته 5 kg من قمة مستوى مائل طوله 10 m وزاويته 30° (μs = 0.3، μk = 0.2). سجّل القياسات المطلوبة.", 5, P.incline())]),
    K.section("sec-e", "هـ — سياق مشترك", [
      K.composite("e1", "استخدم محاكاة المستوى المائل الأملس المشتركة للإجابة.", 5,
        [K.simContext("ctxIncline", "مستوى مائل أملس", "physicsMotion", 1, frictionlessIncline())],
        [K.group("gA", "مرتبط بالمحاكاة", [
          K.linkedSim("p1", "أ", "سجّل تسارع الجسم على المستوى الأملس.", 3, "ctxIncline", [{ id: "acc", label: "التسارع", weight: 1, kind: "motion.referenceValue", measurementId: "acceleration", quantity: "initialAcceleration", tolerance: 0.05 }]),
          K.part("p2", "ب", K.mcq("x", "إذا ضاعفنا كتلة الجسم على المستوى الأملس فإن تسارعه:", 2, ["يبقى كما هو", "يتضاعف", "ينقص إلى النصف"], 0))
        ])])
    ])
  ], { coverPage: K.cover("محاكيات الحركة: السقوط الحر، المقذوفات، قانون نيوتن الثاني، المستوى المائل", "شغّل كل محاكاة، استخدم الإيقاف المؤقت والخطوة المفردة عند الحاجة، ثم سجّل القياسات بوحدات SI."), presentation: { schemaVersion: 1, preset: "modernAcademic" } });
}
