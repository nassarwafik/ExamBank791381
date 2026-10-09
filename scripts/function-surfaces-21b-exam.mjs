// Phase 21B — generated acceptance exam for the owned 3D mathematical-surface runtime.
// The JSON fixture is generated from this source; certification rebuilds it byte-for-byte.
export const SURFACES_21B = Object.freeze({
  "paraboloid": {
    "version": 1,
    "id": "surface-paraboloid",
    "title": "سطح القطع المكافئ",
    "description": "تمثيل ثلاثي الأبعاد للدالة z = x² + y² ضمن مجال العرض.",
    "expression": "x^2+y^2",
    "viewport": {
      "xMin": -2,
      "xMax": 2,
      "yMin": -2,
      "yMax": 2,
      "zMin": -1,
      "zMax": 9
    },
    "grid": {
      "xSteps": 20,
      "ySteps": 20
    }
  },
  "saddle": {
    "version": 1,
    "id": "surface-saddle",
    "title": "السطح السرجي",
    "description": "تمثيل ثلاثي الأبعاد للدالة z = x² − y² ضمن مجال العرض.",
    "expression": "x^2-y^2",
    "viewport": {
      "xMin": -2,
      "xMax": 2,
      "yMin": -2,
      "yMax": 2,
      "zMin": -5,
      "zMax": 5
    },
    "grid": {
      "xSteps": 20,
      "ySteps": 20
    }
  },
  "wave": {
    "version": 1,
    "id": "surface-wave",
    "title": "سطح موجي",
    "description": "تمثيل ثلاثي الأبعاد للدالة z = sin(x)·cos(y) ضمن المجال المعروض.",
    "expression": "sin(x)*cos(y)",
    "viewport": {
      "xMin": -3.14159,
      "xMax": 3.14159,
      "yMin": -3.14159,
      "yMax": 3.14159,
      "zMin": -1.5,
      "zMax": 1.5
    },
    "grid": {
      "xSteps": 20,
      "ySteps": 20
    }
  },
  "dome": {
    "version": 1,
    "id": "surface-dome",
    "title": "قبة كروية",
    "description": "النصف العلوي من الكرة ذات نصف القطر 2: z = √(4 − x² − y²).",
    "expression": "sqrt(4-x^2-y^2)",
    "viewport": {
      "xMin": -2,
      "xMax": 2,
      "yMin": -2,
      "yMax": 2,
      "zMin": -0.2,
      "zMax": 2.5
    },
    "grid": {
      "xSteps": 20,
      "ySteps": 20
    }
  }
});
export const SURFACES_ACCEPTANCE_PATH = "docs/fixtures/function-surfaces-21b/ExamBank_21B_3D_Surfaces_Mini_Acceptance.json";
export const serializeExam = exam => JSON.stringify(exam, null, 2) + "\n";

export function buildSurfacesAcceptanceExam() {
  const S = SURFACES_21B;
  const para = text => ({ type: "paragraph", runs: [{ text }] });
  const rich = (...blocks) => ({ schemaVersion: 1, blocks });
  const surfaceBlock = surface => ({ type: "functionSurface3D", surface });
  const mcq = (id, text, options, correct, marks, surface, note) => ({
    examQuestionId: id, presentationType: "multipleChoice", text, marks,
    richContent: rich(para(note), surfaceBlock(surface), para(text)),
    options: options.map(t => ({ text: t })), answer: { correctOptionIndex: correct }
  });
  return {
    schemaVersion: 2,
    examId: "EXAMBANK-21B-3D-SURFACES-MINI",
    title: "ExamBank 21B — اختبار القبول للأسطح الرياضية ثلاثية الأبعاد",
    status: "draft",
    metadata: {},
    coverPage: {
      enabled: true, activityType: "exam", subtitle: "قراءة وفهم الأسطح z = f(x,y)",
      instructions: "دوّر السطح من أزرار العرض عند الحاجة، ثم أجب عن الأسئلة اعتمادًا على الشكل والمعادلة.",
      instructionsRichContent: rich(para("يمكن تدوير كل سطح من أزرار العرض، كما يتوفر جدول قيم بديل يدعم قارئ الشاشة.")),
      showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true
    },
    presentation: { schemaVersion: 1, preset: "modernAcademic" },
    sections: [
      { id: "sec-a", title: "أ — القطع المكافئ", gradingPolicy: "all", questions: [
        mcq("a1", "أي وصف يطابق السطح z = x² + y²؟", ["له قيمة صغرى عند نقطة الأصل", "له نقطة سرج عند الأصل", "قيمه محصورة بين −1 و1", "هو مستوى مستوٍ"], 0, 4, S.paraboloid, "ادرس اتجاه ارتفاع السطح بعيدًا عن نقطة الأصل.")
      ] },
      { id: "sec-b", title: "ب — السطح السرجي", gradingPolicy: "all", questions: [
        mcq("b1", "ما الوصف الأنسب لسلوك z = x² − y² قرب نقطة الأصل؟", ["يرتفع في اتجاه وينخفض في اتجاه آخر", "له قيمة عظمى مطلقة عند الأصل", "له قيمة صغرى مطلقة عند الأصل", "لا يعتمد على y"], 0, 4, S.saddle, "قارن شكل السطح على اتجاه x مع شكله على اتجاه y.")
      ] },
      { id: "sec-c", title: "ج — السطح الموجي", gradingPolicy: "all", questions: [
        mcq("c1", "ما أكبر قيمة ممكنة تقريبًا للدالة z = sin(x)·cos(y)؟", ["1", "2", "π", "4"], 0, 4, S.wave, "ادرس شكل السطح وقيمه ضمن المجال المعروض قبل اختيار الإجابة.")
      ] },
      { id: "sec-d", title: "د — القبة الكروية والعرض العربي", gradingPolicy: "all", questions: [
        mcq("d1", "عند x = 0 و y = 0، ما قيمة z على القبة z = √(4 − x² − y²)؟", ["2", "0", "4", "−2"], 0, 4, S.dome, "اقرأ المعادلة ثم استخدم السطح وجدول القيم للتحقق.")
      ] }
    ]
  };
}
