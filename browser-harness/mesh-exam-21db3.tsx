// Phase 21D-B.3 — real-browser harness of the ARABIC ACCEPTANCE EXAM for realistic 3D models (certification only; never shipped). The six
// meshPartSelection@1 questions of docs/fixtures/mesh-models-21db3 are rendered on ONE exam page by the production student renderer, from
// the STUDENT projection (the private key never reaches the components). The "server" of this page is the shared authority the API uses:
// every answer change is bound to the published question (bindMeshPartSelectionAnswerToQuestion) and autosaved; a reload restores the
// saved answers; grading and the teacher review use the private key the page keeps outside the student tree.
// Query: ?review=1 renders the teacher review of the saved answers; ?mount=0 starts with the exam unmounted.
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import exam from "../docs/fixtures/mesh-models-21db3/ExamBank_21DB3_Mesh_Models_Acceptance.json";
import MeshPartSelectionResponse from "../src/questionTypes/student/MeshPartSelectionResponse";
import MeshPartSelectionReview from "../src/meshModels/MeshPartSelectionReview";
import { bindMeshPartSelectionAnswerToQuestion, projectMeshPartSelectionConfigForStudent, scoreMeshPartSelection } from "../src/meshPartSelectionQuestion";
import { meshRendererLiveCount } from "../src/meshModels/meshRenderer";

type Q = { examQuestionId: string; presentationType: string; text: string; marks: number; meshPartSelection?: unknown; answer?: unknown };
type Ans = { kind: "meshPartSelection"; modelId: string; parts: string[] };
const QUESTIONS = (exam as { sections: { questions: Q[] }[] }).sections.flatMap(s => s.questions).filter(q => q.presentationType === "meshPartSelection");
const STORE = "exam-21db3-draft";
const params = new URLSearchParams(location.search);
declare global { interface Window { __exam: Record<string, unknown> } }

const readDraft = (): Record<string, Ans> => { try { return JSON.parse(sessionStorage.getItem(STORE) || "{}"); } catch { return {}; } };
/** the page's "server": bind each answer to the PUBLISHED question (teacher copy), keep only accepted answers, persist. */
function autosave(answers: Record<string, Ans>): { saved: Record<string, Ans>; rejected: string[] } {
  const saved: Record<string, Ans> = {}, rejected: string[] = [];
  for (const [id, a] of Object.entries(answers)) {
    const q = QUESTIONS.find(x => x.examQuestionId === id);
    const r = q ? bindMeshPartSelectionAnswerToQuestion(a, q) : { ok: false as const, code: "UNKNOWN" };
    if (r.ok) saved[id] = r.answer as Ans; else rejected.push(id);
  }
  sessionStorage.setItem(STORE, JSON.stringify(saved));
  return { saved, rejected };
}
const grade = (answers: Record<string, Ans>) => QUESTIONS.map(q => ({ id: q.examQuestionId, ...scoreMeshPartSelection({ config: q.meshPartSelection, answerKey: q.answer, response: answers[q.examQuestionId], maxMarks: q.marks }) }));

export function Exam({ answers, onAnswer }: { answers: Record<string, Ans>; onAnswer: (id: string, a: Ans) => void }) {
  return <>{QUESTIONS.map((q, i) => {
    const studentQ = { id: q.examQuestionId, type: q.presentationType, presentationType: q.presentationType, text: q.text, marks: q.marks, meshPartSelection: projectMeshPartSelectionConfigForStudent(q.meshPartSelection) };
    return <article key={q.examQuestionId} data-testid={"q-" + q.examQuestionId} style={{ borderTop: "1px solid #ccd", padding: "12px 0" }}>
      <h2 style={{ fontSize: 17 }}>السؤال {i + 1} ({q.marks} علامات): {q.text}</h2>
      <MeshPartSelectionResponse q={studentQ as never} id={q.examQuestionId} labelPrefix="" answer={answers[q.examQuestionId] as never} onAnswer={a => onAnswer(q.examQuestionId, a as Ans)} />
    </article>;
  })}</>;
}

export function Harness() {
  const [answers, setAnswers] = useState<Record<string, Ans>>(() => readDraft());
  const [mounted, setMounted] = useState(params.get("mount") !== "0");
  const [lastSave, setLastSave] = useState<{ rejected: string[] }>({ rejected: [] });
  const latest = useRef(answers);
  useEffect(() => { latest.current = answers; }, [answers]);
  const onAnswer = useCallback((id: string, a: Ans) => {
    const r = autosave({ ...latest.current, [id]: a });
    latest.current = r.saved;
    setLastSave({ rejected: r.rejected });
    setAnswers(r.saved);
  }, []);
  useEffect(() => {
    window.__exam = {
      answers: () => answers, grade: () => grade(answers), live: () => meshRendererLiveCount(), setMounted, lastSave: () => lastSave,
      // a forged client answer goes through the same server binding (never trusted)
      forge: (id: string, a: unknown) => { const r = autosave({ ...latest.current, [id]: a as Ans }); latest.current = r.saved; setAnswers(r.saved); return r; },
      questions: QUESTIONS.map(q => q.examQuestionId)
    };
  }, [answers, lastSave]);
  if (params.get("review") === "1") {
    const saved = readDraft();
    return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 12 }}><h1 style={{ fontSize: 20 }}>مراجعة المعلم</h1>
      {QUESTIONS.map(q => <section key={q.examQuestionId} data-testid={"r-" + q.examQuestionId}><h2 style={{ fontSize: 16 }}>{q.text}</h2><MeshPartSelectionReview config={q.meshPartSelection} answerKey={q.answer} answer={saved[q.examQuestionId] ?? null} /></section>)}
    </main>;
  }
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 12 }}>
      <h1 style={{ fontSize: 20 }}>ExamBank 21D-B — اختبار القبول للنماذج التشريحية ثلاثية الأبعاد</h1>
      <output data-testid="answers">{JSON.stringify(answers)}</output>
      {mounted && <Exam answers={answers} onAnswer={onAnswer} />}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
