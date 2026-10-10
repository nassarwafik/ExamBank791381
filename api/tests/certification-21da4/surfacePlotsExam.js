// Phase 21D-A.4 — deterministic Arabic acceptance exam for the versioned multi-surface 3D plot (functionSurface3D, surface.version 2):
// paraboloid + inverted paraboloid, saddle + plane, cone + slanted plane, a three-surface plot with a teacher-restricted view, and an
// unchanged Phase 21B V1 surface in the same exam (backward compatibility). The plots are rich stimuli of EXISTING question types
// (multipleChoice, trueFalse); grading stays with their certified authorities. The JSON fixture is generated from this source
// (drift-tested); every decision about it is made by the production authorities.
import * as K from "../certification-20g/kit.js";
import { surfacePlotPreset } from "../../../src/functionSurfaces/surfacePlotPresets.ts";
import { surfaceTemplate } from "../../../src/functionSurfaces/surfaceEditing.ts";

export const SURFACE_PLOTS_ACCEPTANCE_PATH = "docs/fixtures/function-surfaces-21da4/ExamBank_21DA4_Advanced_3D_Plots_Acceptance.json";
export const serializeExam = exam => JSON.stringify(exam, null, 2) + "\n";
const para = text => ({ type: "paragraph", runs: [{ text }] });
const rich = (...blocks) => ({ schemaVersion: 1, blocks });
const plotBlock = surface => ({ type: "functionSurface3D", surface });

/** Three surfaces in one window; the teacher allows rotation only (no zoom, no hiding), starts from a chosen view, high quality. */
export const threeSurfaces = () => ({
  ...surfacePlotPreset("single", "plot-three"),
  title: "ثلاثة أسطح في نظام إحداثيات واحد", description: "مستوى وسطح سرجي وسطح موجي ضمن المجال نفسه.",
  surfaces: [
    { id: "plane", label: "المستوى z = 1 − x − y", expression: "1-x-y", color: "green" },
    { id: "saddle", label: "السطح السرجي z = xy", expression: "x*y", color: "rose" },
    { id: "wave", label: "السطح الموجي z = sin(x)·cos(y)", expression: "sin(x)*cos(y)", color: "lavender" }
  ],
  viewport: { xMin: -2, xMax: 2, yMin: -2, yMax: 2, zMin: -3, zMax: 3 },
  axes: { x: { label: "x", unit: "m" }, y: { label: "y", unit: "m" }, z: { label: "z", unit: "m" } },
  quality: "high", display: { style: "transparent", grid: true }, controls: { rotate: true, zoom: false, toggleSurfaces: false },
  camera: { azimuth: -0.9, elevation: 0.5, zoom: 1.1 }
});

export function buildSurfacePlotsAcceptanceExam() {
  const q = (make, note, surface, ask) => ({ ...make, richContent: rich(para(note), plotBlock(surface), para(ask)) });
  return K.exam("EXAMBANK-21DA4-ADVANCED-3D-PLOTS", "ExamBank 21D-A.4 — اختبار القبول للرسوم الرياضية ثلاثية الأبعاد متعددة الأسطح", [
    K.section("sec-a", "أ — قطعان مكافئان متقابلان", [q(
      K.mcq("a1", "على أي ارتفاع يتقاطع السطحان z = x² + y² و z = 4 − x² − y²؟", 4, ["z = 2", "z = 0", "z = 4", "لا يتقاطعان"], 0),
      "دوّر الرسم وكبّره لترى منحنى التقاطع، ويمكنك إخفاء أحد السطحين من المفتاح.", surfacePlotPreset("paraboloids", "plot-paraboloids"), "أجب اعتمادًا على الرسم والمعادلتين.")]),
    K.section("sec-b", "ب — سطح سرجي ومستوى", [q(
      K.mcq("b1", "ما شكل منحنى تقاطع السطح z = x² − y² مع المستوى z = 1؟", 4, ["قطع زائد", "دائرة", "نقطة واحدة", "مستقيم"], 0),
      "لاحظ أين يعلو السطح السرجي فوق المستوى وأين ينخفض تحته.", surfacePlotPreset("saddlePlane", "plot-saddle-plane"), "اختر الشكل الصحيح.")]),
    K.section("sec-c", "ج — مخروط ومستوى مائل", [q(
      K.mcq("c1", "ما شكل منحنى تقاطع المخروط z = √(x² + y²) مع المستوى z = 0.5x + 1؟", 4, ["قطع ناقص", "قطع زائد", "قطع مكافئ", "مستقيمان"], 0),
      "ميل المستوى أقل من ميل جوانب المخروط.", surfacePlotPreset("conePlane", "plot-cone-plane"), "اختر الشكل الصحيح.")]),
    K.section("sec-d", "د — ثلاثة أسطح وعرض يحدده المعلم", [q(
      K.trueFalse("d1", "المستوى z = 1 − x − y يمر بالنقطة (0, 0, 1).", 4, true),
      "التكبير والإخفاء غير متاحين في هذا السؤال؛ التدوير متاح.", threeSurfaces(), "حدّد صحة العبارة.")]),
    K.section("sec-e", "هـ — سطح بالإصدار الأول (توافق)", [q(
      K.mcq("e1", "عند x = 0 و y = 0، ما قيمة z على القبة z = √(4 − x² − y²)؟", 4, ["2", "0", "4", "−2"], 0),
      "هذا السطح محفوظ بصيغة الإصدار الأول ويُعرض كما كان.", surfaceTemplate("dome", "surface-dome-v1"), "اختر القيمة الصحيحة.")])
  ], { coverPage: { enabled: true, activityType: "exam", subtitle: "رسوم z = f(x, y) متعددة الأسطح", instructions: "يمكنك تدوير كل رسم وتكبيره وإعادة عرضه، وإخفاء الأسطح عندما يسمح السؤال بذلك.", showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true }, presentation: { schemaVersion: 1, preset: "modernAcademic" } });
}
