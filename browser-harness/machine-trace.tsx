import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import MachineTraceResponse from "../src/questionTypes/student/MachineTraceResponse";
import MachineTraceEditor from "../src/questionTypes/editors/MachineTraceEditor";
import type { Answer } from "../src/answerState";
import "../src/design-tokens.css";
import "../src/fonts.css";
import "../src/index.css";

// AUTO-A15a — the real-browser harness of the exam question «تتبّع تشغيل آلة» (machineTrace@1): the student's renderer (a Turing machine
// on the book's tape ├ and the word «ab»), the answer it saves shown below it, and the teacher's editor of a new question. Driven by
// scripts/check-automata-lab-browser.mjs; never shipped.
const studentQuestion = { text: "تتبّع تشغيل الآلة على الكلمة.", marks: 4, presentationType: "machineTrace", questionTypeVersion: 1,
  machineTrace: { v: 1, word: "ab", machine: { kind: "TM", states: ["q0", "q1"], alphabet: ["a", "b"], start: "q0", accept: ["q1"], leftEnd: "├",
    transitions: [{ from: "q0", read: "a", write: "A", move: "R", to: "q0" }, { from: "q0", read: "b", write: "b", move: "S", to: "q1" }] } } };
export function Student() {
  const [answer, setAnswer] = useState<Answer | undefined>();
  return <>
    <MachineTraceResponse q={studentQuestion as never} id="t1" labelPrefix="" answer={answer} onAnswer={setAnswer} />
    <pre data-testid="saved-answer" dir="ltr">{answer ? JSON.stringify(answer) : ""}</pre>
  </>;
}
export function Teacher() {
  const [node, setNode] = useState<Record<string, unknown>>({ presentationType: "machineTrace", questionTypeVersion: 1, text: "", marks: 4,
    machineTrace: { v: 1, machine: { kind: "DFA", states: ["q0", "q1"], alphabet: ["a", "b"], start: "q0", accept: ["q1"], transitions: [["q0", "a", "q1"], ["q0", "b", "q0"], ["q1", "a", "q1"], ["q1", "b", "q0"]] }, word: "ab" }, answer: {} });
  return <>
    <MachineTraceEditor node={node as never} onChange={patch => setNode(n => ({ ...n, ...patch }))} />
    <pre data-testid="saved-question" dir="ltr">{JSON.stringify({ machineTrace: node.machineTrace, answer: node.answer })}</pre>
  </>;
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <article style={{ maxWidth: 760, margin: "0 auto", padding: 16, lineHeight: 1.8 }}>
      <h1>سؤال امتحان: تتبّع تشغيل آلة</h1>
      <section data-testid="student"><h2>شاشة الطالب</h2><Student /></section>
      <section data-testid="teacher"><h2>محرّر المعلم</h2><Teacher /></section>
    </article>
  </StrictMode>
);
