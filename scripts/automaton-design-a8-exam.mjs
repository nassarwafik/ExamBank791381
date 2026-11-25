// AUTO-A8 — deterministic Arabic acceptance exam for automatonDesign@1 («صمّم أوتومات»). The JSON fixture is generated from this source and
// validated through the production authorities (the automatonDesign@1 contract, finalization, the student sanitizer and the server grader,
// which calls the book exercises' judge): two deterministic questions (one asks a COMPLETE automaton), two non-deterministic ones (ε
// allowed), and an ordinary multiple-choice question in the same exam — 22 marks. Owner decisions: full marks or zero; finite automata only.
const machine = (states, start, accept, transitions) => ({ states, start, accept, transitions });

/** The teacher's reference machines (the course's own languages). */
export const REFERENCES_A8 = Object.freeze({
  // words over {0,1} that end with 1 — a complete DFA, as the book builds it
  endsWith1: machine(["q0", "q1"], "q0", ["q1"], [["q0", "0", "q0"], ["q0", "1", "q1"], ["q1", "0", "q0"], ["q1", "1", "q1"]]),
  // an even number of a's over {a,b}
  evenA: machine(["q0", "q1"], "q0", ["q0"], [["q0", "a", "q1"], ["q0", "b", "q0"], ["q1", "a", "q0"], ["q1", "b", "q1"]]),
  // words over {a,b} that end with ab — the book's NFA
  endsWithAb: machine(["q0", "q1", "q2"], "q0", ["q2"], [["q0", "a", "q0"], ["q0", "b", "q0"], ["q0", "a", "q1"], ["q1", "b", "q2"]]),
  // words over {a,b} that contain aa
  containsAa: machine(["q0", "q1", "q2"], "q0", ["q2"], [["q0", "a", "q0"], ["q0", "b", "q0"], ["q0", "a", "q1"], ["q1", "a", "q2"], ["q2", "a", "q2"], ["q2", "b", "q2"]]),
});

export const AUTOMATON_DESIGN_ACCEPTANCE_PATH = "docs/fixtures/automaton-design-a8/ExamBank_A8_Automaton_Design_Acceptance.json";
export const serializeExam = exam => JSON.stringify(exam, null, 2) + "\n";

export function buildAutomatonDesignAcceptanceExam() {
  const R = REFERENCES_A8;
  const design = (id, text, reference, { machine: type, alphabet, maxStates, complete = false, examples, marks }) => ({
    examQuestionId: id, presentationType: "automatonDesign", questionTypeVersion: 1, text, marks,
    automatonDesign: { v: 1, machine: type, alphabet, maxStates, ...(complete ? { complete: true } : {}), ...(examples ? { examples } : {}) },
    answer: { reference },
  });
  const paragraph = text => ({ type: "paragraph", runs: [{ text }] });
  const section = (id, title, questions) => ({ id, title, gradingPolicy: "all", questions });
  return {
    schemaVersion: 2, examId: "EXAMBANK-A8-AUTOMATON-DESIGN", title: "ExamBank A8 — اختبار القبول لأسئلة تصميم الأوتومات", status: "draft", metadata: {},
    coverPage: {
      enabled: true, activityType: "exam", subtitle: "الأوتومات المنتهي الحتمي وغير الحتمي",
      instructions: "ابنِ في كل سؤال أوتومات منتهيًا يقبل اللغة المطلوبة: الحالات، وحالة البداية، وحالات القبول، والأسهم — بالجدول أو بالرسم بالفأرة.",
      instructionsRichContent: { schemaVersion: 1, blocks: [paragraph("العلامة كاملة إن قبلت آلتك اللغة المطلوبة بالضبط، وإلا صفر. «جرّب كلمة» يشغّل آلتك أنت فقط ولا يفحص الحل.")] },
      showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true,
    },
    presentation: { schemaVersion: 1, preset: "modernAcademic" },
    sections: [
      section("sec-dfa", "أ — الأوتومات المنتهي الحتمي", [
        design("d1", "صمّم أوتومات منتهيًا حتميًا كاملًا يقبل كل الكلمات فوق الأبجدية {0, 1} التي تنتهي بـ 1.", R.endsWith1,
          { machine: "DFA", alphabet: ["0", "1"], maxStates: 3, complete: true, examples: { accept: ["1", "01"], reject: ["", "10"] }, marks: 5 }),
        design("d2", "صمّم أوتومات منتهيًا حتميًا يقبل الكلمات فوق {a, b} التي فيها عدد زوجي من الحرف a.", R.evenA,
          { machine: "DFA", alphabet: ["a", "b"], maxStates: 3, marks: 5 }),
      ]),
      section("sec-nfa", "ب — الأوتومات المنتهي غير الحتمي", [
        design("n1", "صمّم أوتومات منتهيًا غير حتمي يقبل الكلمات فوق {a, b} التي تنتهي بـ ab.", R.endsWithAb,
          { machine: "NFA", alphabet: ["a", "b"], maxStates: 4, examples: { accept: ["ab", "bab"], reject: ["", "ba"] }, marks: 6 }),
        design("n2", "صمّم أوتومات منتهيًا غير حتمي يقبل الكلمات فوق {a, b} التي فيها aa (حرفان a متتاليان).", R.containsAa,
          { machine: "NFA", alphabet: ["a", "b"], maxStates: 4, marks: 4 }),
      ]),
      section("sec-mixed", "ج — سؤال تقليدي في الامتحان نفسه", [
        { examQuestionId: "c1", presentationType: "multipleChoice", text: "كم سهمًا يخرج من كل حالة في أوتومات حتمي كامل أبجديته {a, b}؟", marks: 2,
          options: [{ text: "سهمان" }, { text: "سهم واحد" }, { text: "ثلاثة أسهم" }, { text: "عدد غير محدد" }], answer: { correctOptionIndex: 0 } },
      ]),
    ],
  };
}
