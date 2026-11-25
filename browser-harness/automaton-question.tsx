import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import AutomatonDesignResponse from "../src/questionTypes/student/AutomatonDesignResponse";
import AutomatonDesignEditor from "../src/questionTypes/editors/AutomatonDesignEditor";
import type { Answer } from "../src/answerState";
import "../src/design-tokens.css";
import "../src/fonts.css";
import "../src/index.css";

// AUTO-A8 — the real-browser harness of the exam question «تصميم أوتومات» (automatonDesign@1): the student's renderer (a complete DFA, at
// most 3 states — the question as the student receives it, without the reference) with the answer it saves shown below it, and the
// teacher's editor of a new question. Driven by scripts/check-automata-lab-browser.mjs; never shipped.
const studentQuestion = { text: "صمّم أوتومات منتهيًا حتميًا كاملًا للكلمات التي تنتهي بـ 1.", marks: 5, presentationType: "automatonDesign", questionTypeVersion: 1,
  automatonDesign: { v: 1, machine: "DFA", alphabet: ["0", "1"], maxStates: 3, complete: true } };
export function Student() {
  const [answer, setAnswer] = useState<Answer | undefined>();
  return <>
    <AutomatonDesignResponse q={studentQuestion as never} id="a1" labelPrefix="" answer={answer} onAnswer={setAnswer} />
    <pre data-testid="saved-answer" dir="ltr">{answer ? JSON.stringify(answer) : ""}</pre>
  </>;
}
export function Teacher() {
  const [node, setNode] = useState<Record<string, unknown>>({ presentationType: "automatonDesign", questionTypeVersion: 1, text: "", marks: 5, automatonDesign: { v: 1, machine: "DFA", alphabet: ["a", "b"], maxStates: 4 }, answer: {} });
  return <>
    <AutomatonDesignEditor node={node as never} onChange={patch => setNode(n => ({ ...n, ...patch }))} />
    <pre data-testid="saved-question" dir="ltr">{JSON.stringify({ automatonDesign: node.automatonDesign, answer: node.answer })}</pre>
  </>;
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <article style={{ maxWidth: 760, margin: "0 auto", padding: 16, lineHeight: 1.8 }}>
      <h1>سؤال امتحان: تصميم أوتومات</h1>
      <section data-testid="student"><h2>شاشة الطالب</h2><Student /></section>
      <section data-testid="teacher"><h2>محرّر المعلم</h2><Teacher /></section>
    </article>
  </StrictMode>
);
