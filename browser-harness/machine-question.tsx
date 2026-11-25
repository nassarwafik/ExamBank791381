import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import MachineDesignResponse from "../src/questionTypes/student/MachineDesignResponse";
import MachineDesignEditor from "../src/questionTypes/editors/MachineDesignEditor";
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
    </article>
  </StrictMode>
);
