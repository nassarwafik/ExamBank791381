// Phase 20G — certification exam B: PHYSICS, physicsFreeFall@1 only (100 marks). Conceptual, numeric and parametric questions (deterministic
// per-attempt instances), SmartSim measurements, trajectory points, impact time / speed, an upward throw, a lunar drop, a composite with ONE
// shared free-fall context (five linked parts + a firstNAnswered numeric group), open responses with rubrics.
// Hand-computed reference values (independent of the implementation):
//   classroom drop h0 = 20 m, v0 = 0, g = 9.8: t_impact = √(40/9.8) = 2.0203 s, v_impact = √(2·9.8·20) = 19.799 m/s, y(1) = 15.1 m, v(1) = −9.8 m/s;
//   upward throw h0 = 30 m, v0 = +10 m/s, g = 10: apex t = 1 s, h_max = 35 m, 5t² − 10t − 30 = 0 ⇒ t_impact = 1 + √7 = 3.6458 s, v_impact = 26.458 m/s;
//   lunar h0 = 50 m, v0 = −5 m/s, g = 1.62: 0.81t² + 5t − 50 = 0 ⇒ t_impact = (−5 + √187) / 1.62 = 5.3548 s.
import { freeFallClassroomConfig, freeFallClassroomChecks } from "../../../../src/physicsFreeFall/freeFallTemplates.ts";
import * as K from "../kit.js";

const { A } = K;
const upwardConfig = () => ({ v: 1, model: { initialHeight: 30, initialVelocity: 10, gravity: 10 }, view: { maxTime: 4, showVelocityGraph: true }, tasks: { measurements: [{ id: "impactTime", label: "زمن الوصول إلى الأرض", unit: "s" }, { id: "impactSpeed", label: "سرعة الارتطام (مقدار)", unit: "m/s" }, { id: "maxHeight", label: "أقصى ارتفاع", unit: "m" }, { id: "apexTime", label: "زمن أعلى نقطة", unit: "s" }], points: [{ id: "apexPoint", label: "أعلى نقطة على المنحنى" }] } });
const upwardChecks = () => [
  { id: "impact-time", label: "زمن الوصول إلى الأرض", weight: 3, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 },
  { id: "impact-speed", label: "سرعة الارتطام", weight: 2, kind: "physics.impactSpeed", measurementId: "impactSpeed", tolerance: 0.1 },
  { id: "max-height", label: "أقصى ارتفاع", weight: 2, kind: "numericNear@1", valueId: "maxHeight", expected: 35, tolerance: 0.05 },
  { id: "apex-time", label: "زمن أعلى نقطة", weight: 2, kind: "numericNear@1", valueId: "apexTime", expected: 1, tolerance: 0.05 },
  { id: "apex-point", label: "أعلى نقطة على المنحنى", weight: 1, kind: "physics.pointOnTrajectory", pointId: "apexPoint", tolerance: 0.1 }
];
const lunarConfig = () => ({ v: 1, model: { initialHeight: 50, initialVelocity: -5, gravity: 1.62 }, view: { maxTime: 10, showVelocityGraph: true }, tasks: { measurements: [{ id: "impactTime", label: "زمن الوصول إلى سطح القمر", unit: "s" }], points: [] } });
const sim = (pid, label, text, marks, check) => K.linkedSim(pid, label, text, marks, "ctxFall", [check]);
const n2 = (pid, label, text, expected, tol) => K.part(pid, label, K.numeric("x", text, 2, expected, tol));

export function examB() {
  return K.exam("CERT20G-B-PHY", "شهادة 20G — امتحان الفيزياء: السقوط الحر", [
    K.section("b-s1", "القسم الأول: المفاهيم", [
      K.mcq("b1-1", "ما مقدار تسارع السقوط الحر قرب سطح الأرض تقريبًا؟", 2, ["9.8 m/s²", "98 m/s²", "0.98 m/s²"], 0),
      K.mcq("b1-2", "عند إهمال مقاومة الهواء، يسقط جسمان مختلفا الكتلة من الارتفاع نفسه:", 2, ["يصلان معًا", "الأثقل أولًا", "الأخف أولًا"], 0),
      K.trueFalse("b1-3", "عند أعلى نقطة في القذف الرأسي تكون السرعة صفرًا والتسارع صفرًا.", 2, false),
      K.multiTrueFalse("b1-4", "ضع صح أو خطأ:", 3, [["r1", "السرعة في السقوط الحر تزداد بانتظام.", true], ["r2", "الإزاحة تتناسب طرديًا مع الزمن.", false], ["r3", "منحنى (الارتفاع–الزمن) قطع مكافئ.", true]]),
      K.numeric("b1-5", "ما مقدار g المستخدم في المحاكاة الأولى (m/s²)؟", 3, 9.8, 0.05)
    ]),
    K.section("b-s2", "القسم الثاني: المسائل العددية", [
      K.numeric("b2-1", "يسقط حجر من السكون من ارتفاع 45 m (g = 9.8 m/s²). احسب زمن وصوله إلى الأرض بالثانية.", 4, 3.0305, 0.02),
      K.parametric("b2-2", "يسقط جسم من السكون من ارتفاع {{h}} m (g = 10 m/s²). احسب زمن وصوله إلى الأرض بالثانية.", 6,
        { v: 2, generatorVersion: 2, variables: [{ id: "h", kind: "integer", min: 20, max: 80, step: 5 }], derivedVariables: [], constraints: [], response: { unit: "label", label: "s" } },
        { expression: "sqrt(2*h/10)", mode: "tolerance", tolerance: 0.02 }),
      K.parametric("b2-3", "يُقذف جسم رأسيًا إلى الأعلى بسرعة {{v}} m/s (g = 10 m/s²). احسب أقصى ارتفاع يبلغه فوق نقطة القذف بالمتر.", 6,
        { v: 2, generatorVersion: 2, variables: [{ id: "v", kind: "integer", min: 10, max: 30, step: 2 }], derivedVariables: [], constraints: [], response: { unit: "label", label: "m" } },
        { expression: "v^2/20", mode: "tolerance", tolerance: 0.05 })
    ]),
    K.section("b-s3", "القسم الثالث: المحاكاة", [
      K.smartSim("b3-1", "يسقط جسم من السكون من ارتفاع 20 m. شغّل المحاكاة وراقب المنحنيين ثم سجّل قياساتك.", 12, "physicsFreeFall", 1, freeFallClassroomConfig(), freeFallClassroomChecks()),
      K.smartSim("b3-2", "يُقذف جسم إلى الأعلى بسرعة 10 m/s من ارتفاع 30 m (g = 10 m/s²). لاحظ أعلى نقطة وتغيّر إشارة السرعة.", 12, "physicsFreeFall", 1, upwardConfig(), upwardChecks()),
      K.smartSim("b3-3", "يُقذف جسم إلى الأسفل بسرعة 5 m/s من ارتفاع 50 m على سطح القمر (g = 1.62 m/s²). استخدم شريط الزمن والخطوات اليدوية.", 4, "physicsFreeFall", 1, lunarConfig(), [{ id: "impact-time", label: "زمن الوصول", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 }])
    ]),
    K.section("b-s4", "القسم الرابع: التحليل والتفسير", [
      K.composite("b4-1", "يسقط جسم سقوطًا حرًا من ارتفاع 20 m. استخدم المحاكاة المشتركة للإجابة عن البنود.", 24,
        [K.simContext("ctxFall", "محاكاة السقوط الحر", "physicsFreeFall", 1, freeFallClassroomConfig())],
        [K.group("gSim", "القياس بالمحاكاة", [
          sim("s1", "أ", "زمن الوصول إلى الأرض", 3, { id: "impact-time", label: "زمن الوصول", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 }),
          sim("s2", "ب", "سرعة الارتطام", 3, { id: "impact-speed", label: "سرعة الارتطام", weight: 1, kind: "physics.impactSpeed", measurementId: "impactSpeed", tolerance: 0.1 }),
          sim("s3", "ج", "الارتفاع عند 1 ث", 2, { id: "height-1s", label: "الارتفاع عند 1 ث", weight: 1, kind: "physics.heightAtTime", measurementId: "heightAt1s", time: 1, tolerance: 0.05 }),
          sim("s4", "د", "السرعة المتجهة عند 1 ث", 2, { id: "velocity-1s", label: "السرعة عند 1 ث", weight: 1, kind: "physics.velocityAtTime", measurementId: "velocityAt1s", time: 1, tolerance: 0.05 }),
          sim("s5", "هـ", "نقطة على منحنى الحركة", 2, { id: "point-1s", label: "نقطة على المنحنى", weight: 1, kind: "physics.pointOnTrajectory", pointId: "pointAt1s", tolerance: 0.1 })
        ]), K.group("gChoice", "أجب عن بندين فقط", [
          n2("c1", "و", "ما مقدار سرعة الجسم بعد 2 ث من بدء سقوطه (m/s)؟ (g = 9.8)", 19.6, 0.05),
          n2("c2", "ز", "ما المسافة التي يقطعها الجسم في أول 1 ث (m)؟", 4.9, 0.05),
          n2("c3", "ح", "ما ارتفاع الجسم بعد 1.5 ث (m)؟", 8.975, 0.05)
        ], K.firstN(2, 4)), K.group("gWhy", "التفسير", [
          K.part("m1", "ط", K.mcq("x", "ماذا يمثّل ميل منحنى (السرعة–الزمن)؟", 4, ["التسارع", "الإزاحة", "الارتفاع"], 0), { contextId: "ctxFall" }),
          K.part("o1", "ي", K.openResponse("x", "فسّر لماذا تزداد السرعة بانتظام.", 4, "B41", [["physics", "الفهم الفيزيائي", 4, [["full", 4], ["half", 2], ["none", 0]]]]), { contextId: "ctxFall" })
        ])]),
      K.openResponse("b4-2", "اشرح لماذا تكون السرعة صفرًا عند أعلى نقطة في القذف الرأسي بينما التسارع لا يساوي صفرًا.", 10, "B42", [["concept", "الفهم الفيزيائي", 6, [["full", 6], ["half", 3], ["none", 0]]], ["terms", "المصطلحات", 4, [["full", 4], ["half", 2], ["none", 0]]]]),
      K.multipleSelect("b4-3", "اختر العبارات الصحيحة عن السقوط الحر:", 4, [["q1", "التسارع ثابت"], ["q2", "السرعة ثابتة"], ["q3", "منحنى السرعة–الزمن مستقيم"], ["q4", "الكتلة تغيّر زمن السقوط"]], ["q1", "q3"], "partialWithPenalty"),
      K.openResponse("b4-4", "قارن بين حركة الجسم على الأرض وعلى القمر من الارتفاع نفسه.", 6, "B44", [["compare", "المقارنة", 6, [["full", 6], ["half", 3], ["none", 0]]]], { visibility: "visible", profile: "compare" })
    ])
  ], {
    coverPage: K.cover("الصف العاشر — الفيزياء", "استخدم المحاكاة لتسجيل القياسات. تُصحَّح القياسات على الخادم من خطواتك فقط."),
    presentation: { schemaVersion: 1, preset: "scienceLab" }
  });
}

// ── answers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const m = (measurementId, value) => ({ type: "measurement.set", measurementId, value });
const pt = (pointId, t, y) => ({ type: "graphPoint.set", pointId, t, y });
const ff = actions => A.sim("physicsFreeFall", 1, actions);
export const CLASSROOM = [m("impactTime", 2.02), m("impactSpeed", 19.8), m("heightAt1s", 15.1), m("velocityAt1s", -9.8), pt("impactPoint", 2.02, 0), pt("pointAt1s", 1, 15.1)];
export const UPWARD = [m("impactTime", 3.65), m("impactSpeed", 26.46), m("maxHeight", 35), m("apexTime", 1), pt("apexPoint", 1, 35)];
export const LUNAR = [m("impactTime", 5.35)];
/** The delivered instance value of a parametric question (the student reads it on the screen). */
export const instanceValue = (delivery, qid, id) => { const q = delivery.sections.flatMap(s => s.questions).find(x => x.examQuestionId === qid); return Number(q.parametric.values[id]); };
const exact = d => ({
  "b1-1": A.choice(0), "b1-2": A.choice(0), "b1-3": A.choice(1), "b1-4": A.fields({ r1: true, r2: false, r3: true }), "b1-5": A.numeric(9.8),
  "b2-1": A.numeric(3.03), "b2-2": A.numeric(Math.sqrt(2 * instanceValue(d, "b2-2", "h") / 10).toFixed(3)), "b2-3": A.numeric(String(instanceValue(d, "b2-3", "v") ** 2 / 20)),
  "b3-1": ff(CLASSROOM), "b3-2": ff(UPWARD), "b3-3": ff(LUNAR),
  "b4-1": A.composite({ c1: A.numeric(19.6), c2: A.numeric(4.9), m1: A.choice(0), o1: A.text("لأن تسارع الجاذبية ثابت فتزداد السرعة بمقدار ثابت كل ثانية.") }, { ctxFall: ff(CLASSROOM.slice(0, 4).concat([pt("pointAt1s", 1, 15.1)])) }),
  "b4-2": A.text("عند أعلى نقطة تنعدم السرعة لحظيًا لأن الجسم يغيّر اتجاهه، لكن الجاذبية تبقى تؤثر فيبقى التسارع g نحو الأسفل."),
  "b4-3": A.multi(["q1", "q3"]), "b4-4": A.text("على القمر g أصغر فيستغرق السقوط زمنًا أطول وتكون سرعة الارتطام أقل.")
});
const RUB = awards => ({ rubricAwards: awards });
const withoutKeys = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const FULL_AUTO = { "b1-1": [2, 0], "b1-2": [2, 0], "b1-3": [2, 0], "b1-4": [3, 0], "b1-5": [3, 0], "b2-1": [4, 0], "b2-2": [6, 0], "b2-3": [6, 0], "b3-1": [12, 0], "b3-2": [12, 0], "b3-3": [4, 0], "b4-1": [20, 4], "b4-2": [0, 10], "b4-3": [4, 0], "b4-4": [0, 6] };
const FULL_PARTS = { "b4-1": { s1: [3, 0], s2: [3, 0], s3: [2, 0], s4: [2, 0], s5: [2, 0], c1: [2, 0], c2: [2, 0], c3: [0, 0], m1: [4, 0], o1: [0, 4] } };

export const PERSONAS = {
  EXACT: {
    answers: exact, auto: FULL_AUTO, parts: FULL_PARTS,
    review: { "b4-2": RUB({ concept: { levelId: "full" }, terms: { levelId: "full" } }), "b4-4": RUB({ compare: { levelId: "full" } }), "b4-1::part::o1": RUB({ physics: { levelId: "full" } }) },
    final: 100
  },
  SIM_RIGHT_EXPLAIN_WRONG: {
    // simulations and calculations right; the explanations earn nothing; b1-3 wrong (believes a = 0 at the apex); b4-3 also selects q2 (penalty).
    answers: d => ({ ...exact(d), "b1-3": A.choice(0), "b4-3": A.multi(["q1", "q2", "q3"]), "b4-2": A.text("لأن الجسم يتوقف فيتوقف كل شيء."), "b4-4": A.text("لا فرق."),
      "b4-1": A.composite({ c1: A.numeric(19.6), c2: A.numeric(4.9), m1: A.choice(1), o1: A.text("لأن الجسم ثقيل.") }, { ctxFall: ff(CLASSROOM.slice(0, 4).concat([pt("pointAt1s", 1, 15.1)])) }) }),
    // b4-3 partialWithPenalty: hits 2, misses 1 of 2 correct ⇒ (2 − 1)/2 · 4 = 2 · b4-1: m1 wrong ⇒ 20 − 4 = 16 automatic.
    // automatic 80 − 2 − 2 − 4 = 72; rubric: b4-2 0 + 2 of 10 ⇒ 2, b4-4 0, o1 0 ⇒ final 74.
    auto: { ...FULL_AUTO, "b1-3": [0, 0], "b4-3": [2, 0], "b4-1": [16, 4] },
    parts: { "b4-1": { ...FULL_PARTS["b4-1"], m1: [0, 0] } },
    review: { "b4-2": RUB({ concept: { levelId: "none" }, terms: { levelId: "half" } }), "b4-4": RUB({ compare: { levelId: "none" } }), "b4-1::part::o1": RUB({ physics: { levelId: "none" } }) },
    final: 74
  },
  EXPLAIN_RIGHT_MEAS_INCOMPLETE: {
    // perfect explanations; in every simulation only the impact time was recorded; composite: s1 only; parametrics unanswered.
    answers: d => ({ ...withoutKeys(exact(d), ["b2-2", "b2-3"]), "b3-1": ff([m("impactTime", 2.02)]), "b3-2": ff([m("impactTime", 3.65)]), "b3-3": ff(LUNAR),
      "b4-1": A.composite({ c1: A.numeric(19.6), c2: A.numeric(4.9), m1: A.choice(0), o1: A.text("لأن تسارع الجاذبية ثابت فتزداد السرعة بمقدار ثابت كل ثانية.") }, { ctxFall: ff([m("impactTime", 2.02)]) }) }),
    // b3-1: impact-time weight 3 of 12 ⇒ 12·3/12 = 3 · b3-2: 3 of 10 ⇒ 12·3/10 = 3.6 · composite: s1 3 + c1 2 + c2 2 + m1 4 = 11.
    // automatic 80 − 12 − 9 − 8.4 − 9 = 41.6; every rubric full (+20) ⇒ final 61.6.
    auto: { ...FULL_AUTO, "b2-2": [0, 0], "b2-3": [0, 0], "b3-1": [3, 0], "b3-2": [3.6, 0], "b4-1": [11, 4] },
    parts: { "b4-1": { ...FULL_PARTS["b4-1"], s2: [0, 0], s3: [0, 0], s4: [0, 0], s5: [0, 0] } },
    review: { "b4-2": RUB({ concept: { levelId: "full" }, terms: { levelId: "full" } }), "b4-4": RUB({ compare: { levelId: "full" } }), "b4-1::part::o1": RUB({ physics: { levelId: "full" } }) },
    final: 61.6
  },
  PARTIAL_SIM: {
    // composite simulation: impact speed out of tolerance (18.5), velocity sign wrong (+9.8), point missing; answers c2 and c3 in the first-N group
    // (c1 left empty ⇒ c2, c3 counted); c3 wrong. Standalone sims: classroom impactPoint wrong (t = 2.2), upward apex point off by 2 m.
    answers: d => ({ ...exact(d),
      "b3-1": ff([...CLASSROOM.slice(0, 4), pt("impactPoint", 2.2, 0), pt("pointAt1s", 1, 15.1)]), "b3-2": ff([...UPWARD.slice(0, 4), pt("apexPoint", 1, 33)]),
      "b4-1": A.composite({ c2: A.numeric(4.9), c3: A.numeric(11.025), m1: A.choice(0), o1: A.text("بسبب الجاذبية.") }, { ctxFall: ff([m("impactTime", 2.02), m("impactSpeed", 18.5), m("heightAt1s", 15.1), m("velocityAt1s", 9.8)]) }) }),
    // b3-1: impact-point weight 2 fails ⇒ 12·10/12 = 10 · b3-2: apex-point weight 1 fails ⇒ 12·9/10 = 10.8 · composite: s1 3 + s3 2 + c2 2 + m1 4 = 11.
    // automatic 80 − 2 − 1.2 − 9 = 67.8; rubric halves: b4-2 3 + 2 ⇒ 5, b4-4 3, o1 2 ⇒ final 77.8.
    auto: { ...FULL_AUTO, "b3-1": [10, 0], "b3-2": [10.8, 0], "b4-1": [11, 4] },
    parts: { "b4-1": { s1: [3, 0], s2: [0, 0], s3: [2, 0], s4: [0, 0], s5: [0, 0], c1: [0, 0], c2: [2, 0], c3: [0, 0], m1: [4, 0], o1: [0, 4] } },
    review: { "b4-2": RUB({ concept: { levelId: "half" }, terms: { levelId: "half" } }), "b4-4": RUB({ compare: { levelId: "half" } }), "b4-1::part::o1": RUB({ physics: { levelId: "half" } }) },
    final: 77.8
  }
};
// c3 in PARTIAL_SIM: h(1.5) = 20 − 4.9·2.25 = 8.975 m — the student wrote 11.025 (the distance fallen): counted (c1 unanswered) and wrong.
