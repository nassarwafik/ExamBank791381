// Phase 21D-B.3 — deterministic Arabic acceptance exam for realistic 3D mesh models (meshPartSelection@1). The JSON fixture is generated
// from this source and validated through the production authorities (MeshModelSpecV1 against the reviewed library catalog, the
// meshPartSelection@1 config/key validators, finalization, the student sanitizer and the server grader). Library references are pinned by
// id, version and SHA-256: a drifted catalog fails the lifecycle certification instead of silently resolving another file.
const HEART = Object.freeze({ source: "library", id: "human-heart-bp3d", version: 1, sha256: "61e01bcfb305f44ce5a81d7a403f193a3b7e66c022a4f694fb5304b7c1c219d7" });
const BRAIN = Object.freeze({ source: "library", id: "human-brain-bp3d", version: 1, sha256: "6de4ff20027acf242675d73e99da45b5e285abb7e7e6b79dc40e4ad6a30ccf5c" });
const HEART_CAMERA = Object.freeze({ azimuth: 0, elevation: 0.2, zoom: 1.2 });
const BRAIN_CAMERA = Object.freeze({ azimuth: -1.57, elevation: 0.15, zoom: 1.3 });
const CONTROLS = Object.freeze({ rotate: true, zoom: true, hideParts: true });

const part = (id, label, description) => ({ id, label, ...(description ? { description } : {}) });
const model = (id, title, asset, camera, parts) => ({
  version: 1, id, title, description: "دوّر النموذج وكبّره، وتفحّص أجزاءه المسمّاة. النموذج تعليمي مشتق من BodyParts3D وليس أداة تشخيص سريري.",
  asset: { ...asset }, parts, controls: { ...CONTROLS }, camera: { ...camera }
});

export const MODELS_21DB3 = Object.freeze({
  heartChambers: model("heartChambers", "قلب الإنسان — الحجرات والأوعية الكبرى", HEART, HEART_CAMERA, [
    part("rightAtrium", "الأذين الأيمن", "يستقبل الدم غير المؤكسج من الجسم."),
    part("leftAtrium", "الأذين الأيسر", "يستقبل الدم المؤكسج من الرئتين."),
    part("rightVentricle", "البطين الأيمن"),
    part("leftVentricle", "البطين الأيسر"),
    part("aorta", "الأبهر (الشريان الأورطي)"),
    part("pulmonaryTrunk", "الجذع الرئوي")
  ]),
  heartVessels: model("heartVessels", "قلب الإنسان — الأوعية", HEART, HEART_CAMERA, [
    part("aorta", "الأبهر (الشريان الأورطي)"),
    part("pulmonaryTrunk", "الجذع الرئوي"),
    part("superiorVenaCava", "الوريد الأجوف العلوي"),
    part("inferiorVenaCava", "الوريد الأجوف السفلي"),
    part("coronaryArteries", "الشرايين التاجية")
  ]),
  heartValves: model("heartValves", "قلب الإنسان — الصمامات", HEART, HEART_CAMERA, [
    part("tricuspidValve", "الصمام ثلاثي الشرفات"),
    part("mitralValve", "الصمام التاجي (ثنائي الشرفات)"),
    part("aorticValve", "الصمام الأبهري"),
    part("pulmonaryValve", "الصمام الرئوي")
  ]),
  brainBalance: model("brainBalance", "دماغ الإنسان — التوازن والتنسيق", BRAIN, BRAIN_CAMERA, [
    part("frontalLobe", "الفص الجبهي"),
    part("occipitalLobe", "الفص القذالي"),
    part("cerebellum", "المخيخ"),
    part("pons", "الجسر (القنطرة)"),
    part("medullaOblongata", "النخاع المستطيل")
  ]),
  brainStem: model("brainStem", "دماغ الإنسان — جذع الدماغ", BRAIN, BRAIN_CAMERA, [
    part("temporalLobe", "الفص الصدغي"),
    part("cerebellum", "المخيخ"),
    part("midbrain", "الدماغ المتوسط"),
    part("pons", "الجسر (القنطرة)"),
    part("medullaOblongata", "النخاع المستطيل")
  ]),
  brainLobes: model("brainLobes", "دماغ الإنسان — فصوص المخ", BRAIN, BRAIN_CAMERA, [
    part("frontalLobe", "الفص الجبهي"),
    part("parietalLobe", "الفص الجداري"),
    part("temporalLobe", "الفص الصدغي"),
    part("occipitalLobe", "الفص القذالي")
  ])
});

export const MESH_MODELS_ACCEPTANCE_PATH = "docs/fixtures/mesh-models-21db3/ExamBank_21DB3_Mesh_Models_Acceptance.json";
export const serializeExam = exam => JSON.stringify(exam, null, 2) + "\n";

export function buildMeshModelsAcceptanceExam() {
  const M = MODELS_21DB3;
  const select = (id, text, m, { mode = "single", maxSelections = 1, scoring = "allOrNothing", correct, marks = 4, hideLabels = false, label }) => ({
    examQuestionId: id, presentationType: "meshPartSelection", questionTypeVersion: 1, text, marks,
    meshPartSelection: { v: 1, model: m, mode, maxSelections, ...(label ? { label } : {}), ...(hideLabels ? { hideLabels: true } : {}) },
    answer: { scoring, correct }
  });
  const paragraph = text => ({ type: "paragraph", runs: [{ text }] });
  const rich = (...blocks) => ({ schemaVersion: 1, blocks });
  const section = (id, title, questions) => ({ id, title, gradingPolicy: "all", questions });
  return {
    schemaVersion: 2, examId: "EXAMBANK-21DB3-MESH-MODELS", title: "ExamBank 21D-B — اختبار القبول للنماذج التشريحية ثلاثية الأبعاد", status: "draft", metadata: {},
    coverPage: {
      enabled: true, activityType: "exam", subtitle: "القلب والدماغ بنماذج تشريحية واقعية",
      instructions: "دوّر النموذج واسحبه وكبّره، واستخدم «إعادة الضبط» للعودة إلى العرض الأصلي، ثم اختر الجزء المطلوب بالنقر عليه أو من قائمة الأجزاء.",
      instructionsRichContent: rich(paragraph("حركة الكاميرا وإخفاء الأجزاء لا تُعدّ إجابة؛ يُصحَّح السؤال على الخادم من معرّفات الأجزاء المختارة فقط.")),
      showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true
    },
    presentation: { schemaVersion: 1, preset: "modernAcademic" },
    sections: [
      section("sec-heart", "أ — القلب", [
        select("h1", "انقر الحجرة التي تضخ الدم المؤكسج إلى الجسم عبر الشريان الأبهر.", M.heartChambers, { correct: ["leftVentricle"] }),
        select("h2", "اختر الوعاءين اللذين يخرجان من البطينين (الشريانين الكبيرين).", M.heartVessels, { mode: "multiple", maxSelections: 2, scoring: "partial", correct: ["aorta", "pulmonaryTrunk"], label: "اختر وعاءين اثنين." }),
        select("h3", "حدّد الصمام الذي يفصل الأذين الأيسر عن البطين الأيسر (أسماء الأجزاء مخفية).", M.heartValves, { correct: ["mitralValve"], hideLabels: true })
      ]),
      section("sec-brain", "ب — الدماغ", [
        select("b1", "انقر الجزء المسؤول أساسًا عن التوازن وتنسيق الحركة.", M.brainBalance, { correct: ["cerebellum"] }),
        select("b2", "اختر أجزاء جذع الدماغ الثلاثة.", M.brainStem, { mode: "multiple", maxSelections: 3, correct: ["midbrain", "pons", "medullaOblongata"], marks: 6 }),
        select("b3", "حدّد الفص المسؤول أساسًا عن معالجة الإبصار (أسماء الأجزاء مخفية).", M.brainLobes, { correct: ["occipitalLobe"], hideLabels: true })
      ]),
      section("sec-mixed", "ج — سؤال تقليدي في الامتحان نفسه", [
        { examQuestionId: "c1", presentationType: "multipleChoice", text: "أي حجرات القلب جدارها العضلي الأسمك؟", marks: 2, options: [{ text: "البطين الأيسر" }, { text: "الأذين الأيمن" }, { text: "الأذين الأيسر" }, { text: "البطين الأيمن" }], answer: { correctOptionIndex: 0 } }
      ])
    ]
  };
}
