// Phase 20D — the four ACCEPTANCE fixtures of composite@1 (data only; fresh copies on every call). Each is a complete, importable
// structured exam (one section, one composite question) that exercises a different composition:
//   A — Arabic reading: one shared text passage serving MCQ / multiTrueFalse / matching / inlineCloze, a firstNAnswered analysis group
//       (categorization / matrix / numeric) and a rubric-graded open response.
//   B — Physics: ONE shared physicsFreeFall@1 workspace serving five independently scored SmartSim parts, plus a numericResponse and an
//       open-response interpretation.
//   C — Computer science: a shared code source, an MCQ trace, a short "predict the output" answer, a coding@2 hidden-test child (official
//       Runner lifecycle) and an open-response explanation.
//   D — Network: ONE shared networkTopology@2 Router-on-a-Stick context serving four independently scored SmartSim parts + an MCQ.
// Every private key below (answer keys, checks, hidden tests, rubrics, model answers) is TEACHER data: the student projection removes it.
// Nothing here is code-owned behaviour — the engines know nothing about fixtures; tests and the docs use them.
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { freeFallClassroomConfig } from "../physicsFreeFall/freeFallTemplates";
import { net2TemplateById } from "../networkTopology2/net2Templates";

type Json = Record<string, unknown>;
const lv = (id: string, label: string, points: number, description = "") => ({ id, label, points, description });
const exam = (examId: string, title: string, question: Json): StructuredExam => ({
  schemaVersion: 1, examId, title, status: "draft", metadata: {},
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", questions: [question as unknown as BuilderQuestion] }]
} as unknown as StructuredExam);

export const ARABIC_PASSAGE = "الماءُ أصلُ الحياة، وتعتمد عليه الكائنات الحية جميعها. ويغطي الماء نحو سبعين في المئة من سطح الأرض، غير أن معظمه مالح لا يصلح للشرب. لذلك يجب أن نحافظ على المياه العذبة ونقتصد في استهلاكها.";

/** Fixture A — Arabic reading comprehension (20 marks). */
export function compositeArabicExam(): StructuredExam {
  return exam("CMP-20D-A", "فهم المقروء — الماء", {
    examQuestionId: "q4", displayNumber: "4", presentationType: "composite", questionTypeVersion: 1, marks: 20,
    text: "اقرأ النص الآتي ثم أجب عن الأسئلة التي تليه.",
    composite: {
      v: 1,
      contexts: [{ id: "ctxText", version: 1, kind: "source", title: "النص", sources: [{ id: "src1", version: 1, kind: "text", title: "الماء", text: ARABIC_PASSAGE }] }],
      groups: [
        { id: "gA", title: "مجموعة أ — فهم النص", instructions: "أجب عن جميع البنود.", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [
          { id: "pA1", label: "أ", type: "multipleChoice", questionTypeVersion: 1, contextId: "ctxText", text: "ما الفكرة الرئيسة للنص؟", marks: 2, options: [{ text: "أهمية الماء والمحافظة عليه" }, { text: "مساحة اليابسة" }, { text: "أنواع الكائنات الحية" }], answer: { correctOptionIndex: 0 } },
          { id: "pA2", label: "ب", type: "multiTrueFalse", questionTypeVersion: 1, contextId: "ctxText", text: "ضع إشارة صح أو خطأ:", marks: 3, fields: [
            { id: "r1", statement: "يغطي الماء نحو سبعين في المئة من سطح الأرض.", kind: "boolean", correct: true },
            { id: "r2", statement: "معظم مياه الأرض عذبة صالحة للشرب.", kind: "boolean", correct: false },
            { id: "r3", statement: "يدعو النص إلى الاقتصاد في استهلاك الماء.", kind: "boolean", correct: true }] },
          { id: "pA3", label: "ج", type: "matching", questionTypeVersion: 1, contextId: "ctxText", text: "صِل الكلمة بمعناها:", marks: 2, fields: [
            { id: "m1", label: "نقتصد", kind: "select", options: [{ text: "نقلّل" }, { text: "نزيد" }], correct: "نقلّل" },
            { id: "m2", label: "مالح", kind: "select", options: [{ text: "عذب" }, { text: "غير عذب" }], correct: "غير عذب" }], answer: { text: "نقتصد=نقلّل;مالح=غير عذب" } },
          { id: "pA4", label: "د", type: "inlineCloze", questionTypeVersion: 1, contextId: "ctxText", text: "أكمل:", marks: 3, inlineCloze: { v: 1, segments: [
            { type: "text", text: "الماء أصل " }, { type: "blank", id: "b1", control: "text" }, { type: "text", text: "، ومعظمه " },
            { type: "blank", id: "b2", control: "dropdown", options: [{ id: "o1", label: "عذب" }, { id: "o2", label: "مالح" }] }] },
            answer: { scoring: "proportional", blanks: { b1: { accepted: ["الحياة"], caseSensitive: false }, b2: { correctOptionId: "o2" } } } }
        ] },
        { id: "gB", title: "مجموعة ب — التحليل", instructions: "أجب عن بندين فقط من الثلاثة.", gradingPolicy: "firstNAnswered", requiredAnswers: 2, maxMarks: 4, parts: [
          { id: "pB1", label: "هـ", type: "categorization", questionTypeVersion: 1, contextId: "ctxText", text: "صنّف:", marks: 2, categorization: { categories: [{ id: "k1", label: "مصدر عذب" }, { id: "k2", label: "مصدر مالح" }], items: [{ id: "t1", label: "النهر" }, { id: "t2", label: "البحر" }] }, answer: { correctCategoryByItem: { t1: "k1", t2: "k2" } } },
          { id: "pB2", label: "و", type: "matrix", questionTypeVersion: 1, contextId: "ctxText", text: "حدّد نوع كل جملة:", marks: 2, matrix: { rows: [{ id: "x1", label: "الماء أصل الحياة." }, { id: "x2", label: "حافظوا على الماء!" }], columns: [{ id: "c1", label: "خبرية" }, { id: "c2", label: "إنشائية" }] }, answer: { correctColumnByRow: { x1: "c1", x2: "c2" } } },
          { id: "pB3", label: "ز", type: "numericResponse", questionTypeVersion: 1, contextId: "ctxText", text: "ما النسبة المئوية لمساحة سطح الأرض التي يغطيها الماء بحسب النص؟", marks: 2, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 70, tolerance: 0 } }
        ] },
        { id: "gC", title: "مجموعة ج — الاستنتاج", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [
          { id: "pC1", label: "ح", type: "openResponse", questionTypeVersion: 1, contextId: "ctxText", text: "اقترح طريقتين للمحافظة على الماء، وعلّل.", marks: 6,
            openResponse: { v: 1, profile: "justify", instructions: "اكتب فقرة قصيرة.", response: { minChars: 0, maxChars: 800 }, studentRubricVisibility: "visible" },
            answer: { rubric: { v: 1, criteria: [
              { id: "ideas", title: "الأفكار", description: "طريقتان صحيحتان", maxPoints: 4, allowCustomPoints: false, guidance: "PRIVATE-GUIDANCE-20D-A", levels: [lv("two", "طريقتان", 4), lv("one", "طريقة", 2), lv("none", "لا شيء", 0)] },
              { id: "reason", title: "التعليل", description: "", maxPoints: 2, allowCustomPoints: true, guidance: "", levels: [lv("full", "كامل", 2), lv("none", "لا شيء", 0)] }] }, modelAnswer: "MODEL-ANSWER-20D-A" } }
        ] }
      ]
    }
  });
}

/** Fixture B — Physics: ONE shared free-fall workspace, five linked SmartSim parts + numeric + open response (18 marks). */
export function compositePhysicsExam(): StructuredExam {
  const sim = (id: string, label: string, text: string, marks: number, check: Json) => ({ id, label, type: "smartSim", questionTypeVersion: 1, contextId: "ctxSim", text, marks, answer: { scoring: "proportional", checks: [check] } });
  return exam("CMP-20D-B", "السقوط الحر — محاكاة واحدة", {
    examQuestionId: "phys1", displayNumber: "1", presentationType: "composite", questionTypeVersion: 1, marks: 18,
    text: "يسقط جسم سقوطًا حرًا من ارتفاع 20 m. استخدم المحاكاة للإجابة عن البنود.",
    composite: {
      v: 1,
      contexts: [{ id: "ctxSim", version: 1, kind: "smartSim", title: "محاكاة السقوط الحر", instructions: "سجّل قياساتك ونقاطك في المحاكاة.", smartSim: { schemaVersion: 1, pluginKey: "physicsFreeFall", pluginVersion: 1, config: freeFallClassroomConfig() } }],
      groups: [
        { id: "gSim", title: "القياس بالمحاكاة", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [
          sim("s1", "أ", "زمن الوصول إلى الأرض", 3, { id: "impact-time", label: "زمن الوصول", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 }),
          sim("s2", "ب", "سرعة الارتطام", 3, { id: "impact-speed", label: "سرعة الارتطام", weight: 1, kind: "physics.impactSpeed", measurementId: "impactSpeed", tolerance: 0.1 }),
          sim("s3", "ج", "الارتفاع عند 1 ث", 2, { id: "height-1s", label: "الارتفاع عند 1 ث", weight: 1, kind: "physics.heightAtTime", measurementId: "heightAt1s", time: 1, tolerance: 0.05 }),
          sim("s4", "د", "السرعة المتجهة عند 1 ث", 2, { id: "velocity-1s", label: "السرعة عند 1 ث", weight: 1, kind: "physics.velocityAtTime", measurementId: "velocityAt1s", time: 1, tolerance: 0.05 }),
          sim("s5", "هـ", "نقطة على منحنى الحركة", 2, { id: "point-1s", label: "نقطة على المنحنى", weight: 1, kind: "physics.pointOnTrajectory", pointId: "pointAt1s", tolerance: 0.1 })
        ] },
        { id: "gInt", title: "التفسير", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [
          { id: "n1", label: "و", type: "numericResponse", questionTypeVersion: 1, contextId: "ctxSim", text: "ما مقدار تسارع السقوط الحر المستخدم في المحاكاة (m/s²)؟", marks: 2, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 9.8, tolerance: 0.05 } },
          { id: "o1", label: "ز", type: "openResponse", questionTypeVersion: 1, contextId: "ctxSim", text: "فسّر لماذا تزداد السرعة بانتظام.", marks: 4,
            openResponse: { v: 1, profile: "explain", instructions: "", response: { minChars: 0, maxChars: 600 }, studentRubricVisibility: "hidden" },
            answer: { rubric: { v: 1, criteria: [{ id: "physics", title: "الفهم الفيزيائي", description: "", maxPoints: 4, allowCustomPoints: false, guidance: "PRIVATE-GUIDANCE-20D-B", levels: [lv("full", "كامل", 4), lv("half", "جزئي", 2), lv("none", "لا شيء", 0)] }] }, modelAnswer: "MODEL-ANSWER-20D-B" } }
        ] }
      ]
    }
  });
}

export const CS_SOURCE = "def f(n):\n    total = 0\n    for i in range(1, n + 1):\n        total += i\n    return total\n\nprint(f(4))\n";
export const CS_HIDDEN = Object.freeze([
  { id: "h1", title: "HIDDEN-TITLE-20D-C", input: "1 2\n", expectedOutput: "SUM=3\n", weight: 1 },
  { id: "h2", input: "5 5\n", expectedOutput: "SUM=10\n", weight: 3 }
]);
/** Fixture C — Computer science: shared code source + trace MCQ + predict-output + coding@2 hidden tests + explanation (18 marks). */
export function compositeCsExam(): StructuredExam {
  return exam("CMP-20D-C", "تتبّع الكود وكتابته", {
    examQuestionId: "cs1", displayNumber: "2", presentationType: "composite", questionTypeVersion: 1, marks: 18,
    text: "ادرس الكود الآتي ثم أجب.",
    composite: {
      v: 1,
      contexts: [{ id: "ctxCode", version: 1, kind: "source", title: "الكود", sources: [{ id: "code1", version: 1, kind: "code", title: "sum.py", language: "python", source: CS_SOURCE }] }],
      groups: [
        { id: "gTrace", title: "تتبّع", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [
          { id: "t1", label: "أ", type: "multipleChoice", questionTypeVersion: 1, contextId: "ctxCode", text: "ما مخرجات البرنامج؟", marks: 2, options: [{ text: "4" }, { text: "10" }, { text: "6" }], answer: { correctOptionIndex: 1 } },
          { id: "t2", label: "ب", type: "shortAnswer", questionTypeVersion: 1, contextId: "ctxCode", text: "ما قيمة f(3)؟", marks: 2, answer: { text: "6" } }
        ] },
        { id: "gCode", title: "البرمجة", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [
          { id: "c1", label: "ج", type: "coding", questionTypeVersion: 2, text: "اكتب برنامجًا يقرأ عددين ويطبع SUM=<المجموع>.", marks: 10,
            coding: { allowedLanguages: ["python", "java", "csharp"], defaultLanguage: "python", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 128 }, publicTests: [{ id: "pub-1", input: "2 3\n", sampleOutput: "SUM=5\n" }] },
            answer: { gradingMode: "hiddenTests", comparator: "trimTrailingWhitespace", compileErrorPolicy: "manualReview", hiddenTests: CS_HIDDEN.map(t => ({ ...t })), referenceSolutions: { python: "REFERENCE-SOLUTION-20D-C" } } },
          { id: "e1", label: "د", type: "openResponse", questionTypeVersion: 1, contextId: "ctxCode", text: "اشرح عمل الحلقة في الكود.", marks: 4,
            openResponse: { v: 1, profile: "explain", instructions: "", response: { minChars: 0, maxChars: 600 }, studentRubricVisibility: "hidden" },
            answer: { rubric: { v: 1, criteria: [{ id: "loop", title: "شرح الحلقة", description: "", maxPoints: 4, allowCustomPoints: false, guidance: "PRIVATE-GUIDANCE-20D-C", levels: [lv("full", "كامل", 4), lv("none", "لا شيء", 0)] }] }, modelAnswer: "MODEL-ANSWER-20D-C" } }
        ] }
      ]
    }
  });
}

/** Fixture D — Network: ONE shared networkTopology@2 Router-on-a-Stick context, four linked SmartSim parts + an MCQ (14 marks). */
export function compositeNetworkExam(): StructuredExam {
  const t = net2TemplateById("roas")!;
  const byKind = new Map<string, Json[]>();
  for (const c of t.checks()) { const list = byKind.get(c.kind) || []; list.push(c); byKind.set(c.kind, list); }
  const pick = (kind: string, i = 0) => ({ ...(byKind.get(kind) as Json[])[i] });
  const sim = (id: string, label: string, text: string, marks: number, checks: Json[]) => ({ id, label, type: "smartSim", questionTypeVersion: 1, contextId: "ctxNet", text, marks, answer: { scoring: "proportional", checks } });
  return exam("CMP-20D-D", "Router-on-a-Stick — طوبولوجيا واحدة", {
    examQuestionId: "net1", displayNumber: "3", presentationType: "composite", questionTypeVersion: 1, marks: 14,
    text: "اضبط الشبكة في المحاكاة ثم أجب.",
    composite: {
      v: 1,
      contexts: [{ id: "ctxNet", version: 1, kind: "smartSim", title: "شبكة المدرسة", smartSim: { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: t.config() } }],
      groups: [
        { id: "gCfg", title: "الإعداد", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [
          sim("k1", "أ", "أنشئ VLAN 10 و VLAN 20 على SW1.", 3, [pick("switch.vlanExists", 0), pick("switch.vlanExists", 1)]),
          sim("k2", "ب", "اجعل Gi0/1 منفذ Trunk.", 2, [pick("switch.portMode", 1)]),
          sim("k3", "ج", "أنشئ الواجهات الفرعية dot1Q على R1.", 3, [pick("router.subinterfaceVlan", 0), pick("router.subinterfaceVlan", 1)]),
          sim("k4", "د", "تحقّق من الاتصال بين PC1 و PC3.", 2, [pick("reachability", 0)])
        ] },
        { id: "gWhy", title: "الفهم", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [
          { id: "m1", label: "هـ", type: "multipleChoice", questionTypeVersion: 1, contextId: "ctxNet", text: "لماذا نحتاج منفذ Trunk بين SW1 و R1؟", marks: 4, options: [{ text: "لنقل أكثر من VLAN عبر وصلة واحدة" }, { text: "لزيادة السرعة فقط" }], answer: { correctOptionIndex: 0 } }
        ] }
      ]
    }
  });
}

export const COMPOSITE_FIXTURES = Object.freeze({ arabic: compositeArabicExam, physics: compositePhysicsExam, cs: compositeCsExam, network: compositeNetworkExam });
