// AUTO-A11a — deterministic Arabic acceptance exam for machineDesign@1 («تصميم آلة: مكدّس أو تورنغ»). The JSON fixture is generated from this
// source and validated through the production authorities (the machineDesign@1 contract, finalization, the student sanitizer and the server
// grader, which calls the book exercises' judge): a push-down automaton for aⁿbⁿ, a Turing machine that recognises awb and one that computes
// f(x) = x + 2 (the answer between two $), and an ordinary multiple-choice question in the same exam — 18 marks. The references are the
// book's own machines (scripts/automata-course/u08.mjs, u10.mjs). Owner decisions: agreement up to length N → full marks; a certain
// separating word → 0; a Turing machine that does not halt → teacher review.
import { ANBN } from "./automata-course/u08.mjs";
import { AWB, PLUS2 } from "./automata-course/u10.mjs";

const shape = m => ({ states: [...m.states], start: m.start, accept: [...m.accept], transitions: m.transitions.map(t => ({ ...t })) });
/** The teacher's reference machines (the book's). */
export const REFERENCES_A11 = Object.freeze({ anbn: shape(ANBN), awb: shape(AWB), plus2: shape(PLUS2) });

export const MACHINE_DESIGN_ACCEPTANCE_PATH = "docs/fixtures/machine-design-a11/ExamBank_A11_Machine_Design_Acceptance.json";
export const serializeExam = exam => JSON.stringify(exam, null, 2) + "\n";

export function buildMachineDesignAcceptanceExam() {
  const R = REFERENCES_A11;
  const design = (id, text, reference, config, marks) => ({
    examQuestionId: id, presentationType: "machineDesign", questionTypeVersion: 1, text, marks,
    machineDesign: { v: 1, ...config }, answer: { reference },
  });
  const paragraph = text => ({ type: "paragraph", runs: [{ text }] });
  const section = (id, title, questions) => ({ id, title, gradingPolicy: "all", questions });
  return {
    schemaVersion: 2, examId: "EXAMBANK-A11-MACHINE-DESIGN", title: "ExamBank A11 — اختبار القبول لأسئلة تصميم أوتومات المكدّس وآلة تورنغ", status: "draft", metadata: {},
    coverPage: {
      enabled: true, activityType: "exam", subtitle: "أوتومات المكدّس وآلة تورنغ",
      instructions: "ابنِ في كل سؤال الآلة المطلوبة: الحالات، وحالة البداية، وحالات القبول، والانتقالات بترميز المادة — بالصفوف أو بالرسم بالفأرة.",
      instructionsRichContent: { schemaVersion: 1, blocks: [paragraph("يشغّل التصحيح آلتك والآلة النموذجية على كل الكلمات حتى طول معيّن: اتفاقهما العلامة كاملة. «شغّل» يشغّل آلتك أنت فقط ولا يفحص الحل.")] },
      showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true,
    },
    presentation: { schemaVersion: 1, preset: "modernAcademic" },
    sections: [
      section("sec-pda", "أ — أوتومات المكدّس", [
        design("p1", "صمّم أوتومات مكدّس حتميًا يقبل اللغة {aⁿbⁿ | n ≥ 0} فوق الأبجدية {a, b}.", R.anbn,
          { machine: "PDA", alphabet: ["a", "b"], maxStates: 6, examples: { accept: ["", "ab", "aabb"], reject: ["a", "ba", "abb"] } }, 6),
      ]),
      section("sec-tm", "ب — آلة تورنغ", [
        design("t1", "صمّم آلة تورنغ تقبل الكلمات فوق {a, b} التي تبدأ بـ a وتنتهي بـ b (اللغة {awb}).", R.awb,
          { machine: "TM", alphabet: ["a", "b"], maxStates: 6, leftEnd: true, examples: { accept: ["ab", "abb"], reject: ["", "a", "ba"] } }, 5),
        design("t2", "صمّم آلة تورنغ تحسب f(x) = x + 2: المدخل x بالتمثيل الأحادي، والناتج يُكتب على الشريط كقيمة أحادية بين علامتي $.", R.plus2,
          { machine: "TM", mode: "compute", alphabet: ["1"], maxStates: 8, leftEnd: true, maxLength: 10, examples: { compute: [{ word: "111", output: "11111" }, { word: "", output: "11" }] } }, 5),
      ]),
      section("sec-mixed", "ج — سؤال تقليدي في الامتحان نفسه", [
        { examQuestionId: "c1", presentationType: "multipleChoice", text: "متى تتوقف آلة تورنغ؟", marks: 2,
          options: [{ text: "حين لا يُعرَّف انتقال للحالة والرمز تحت الرأس" }, { text: "حين تنتهي الكلمة" }, { text: "بعد عدد خطوات مساوٍ لطول الكلمة" }, { text: "حين تصل إلى خانة فارغة" }], answer: { correctOptionIndex: 0 } },
      ]),
    ],
  };
}
