import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import MachineDesignResponse from "../src/questionTypes/student/MachineDesignResponse";
import MachineDesignEditor from "../src/questionTypes/editors/MachineDesignEditor";
import MachineDesignReview from "../src/automata/MachineDesignReview";
import ResultBreakdown from "../src/student/exam/ResultBreakdown";
import type { Answer } from "../src/answerState";
import "../src/design-tokens.css";
import "../src/fonts.css";
import "../src/index.css";

// AUTO-A11a — the real-browser harness of the exam question «تصميم آلة: مكدّس أو تورنغ» (machineDesign@1): the student's renderer (a Turing
// machine that computes f(x) = x + 2 — the question as the student receives it, without the reference) with the answer it saves shown
// below it, and the teacher's editor of a new question. Driven by scripts/check-automata-lab-browser.mjs; never shipped.
const studentQuestion = { text: "صمّم آلة تورنغ تحسب f(x) = x + 2.", marks: 5, presentationType: "machineDesign", questionTypeVersion: 1,
  machineDesign: { v: 1, machine: "TM", mode: "compute", alphabet: ["1"], maxStates: 8, leftEnd: true, maxLength: 10, examples: { compute: [{ word: "111", output: "11111" }] } } };
export function Student() {
  const [answer, setAnswer] = useState<Answer | undefined>();
  return <>
    <MachineDesignResponse q={studentQuestion as never} id="m1" labelPrefix="" answer={answer} onAnswer={setAnswer} />
    <pre data-testid="saved-answer" dir="ltr">{answer ? JSON.stringify(answer) : ""}</pre>
  </>;
}
export function Teacher() {
  const [node, setNode] = useState<Record<string, unknown>>({ presentationType: "machineDesign", questionTypeVersion: 1, text: "", marks: 5, machineDesign: { v: 1, machine: "PDA", alphabet: ["a", "b"], maxStates: 6 }, answer: {} });
  return <>
    <MachineDesignEditor node={node as never} onChange={patch => setNode(n => ({ ...n, ...patch }))} />
    <pre data-testid="saved-question" dir="ltr">{JSON.stringify({ machineDesign: node.machineDesign, answer: node.answer })}</pre>
  </>;
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <article style={{ maxWidth: 760, margin: "0 auto", padding: 16, lineHeight: 1.8 }}>
      <h1>سؤال امتحان: تصميم آلة</h1>
      <section data-testid="student"><h2>شاشة الطالب</h2><Student /></section>
      <section data-testid="teacher"><h2>محرّر المعلم</h2><Teacher /></section>
      <section data-testid="review"><h2>مراجعة المعلم (AUTO-A11b)</h2>
        <MachineDesignReview config={{ v: 1, machine: "TM", mode: "compute", alphabet: ["1"], maxStates: 8, leftEnd: true, maxLength: 10 }}
          answerKey={{ reference: { states: ["q0", "q1", "q2"], start: "q0", accept: ["q2"], transitions: [{ from: "q0", read: "1", write: "$", move: "R", to: "q1" }, { from: "q1", read: "∆", write: "$", move: "S", to: "q2" }] } }}
          answer={{ kind: "machineDesign", machine: { states: ["p0", "p1"], start: "p0", accept: ["p1"], transitions: [{ from: "p0", read: "1", write: "1", move: "R", to: "p0" }, { from: "p0", read: "∆", write: "∆", move: "S", to: "p1" }] } }}
          feedback={{ counterexample: { word: "", expected: "", got: null } }} />
      </section>
      <section data-testid="breakdown"><h2>نتيجة الطالب بعد النشر (AUTO-A11b)</h2>
        <ResultBreakdown breakdown={{ sections: [{ id: "s1", title: "قسم", capped: false }], questions: [{ number: 1, sectionId: "s1", status: "zero", maxMarks: 5, score: 0, machine: { word: "1", expected: "111", got: "11" } }, { number: 2, sectionId: "s1", status: "full", maxMarks: 6, score: 6, machine: { agreesUpTo: { length: 8, words: 511 } } }] }} />
      </section>
    </article>
  </StrictMode>
);
