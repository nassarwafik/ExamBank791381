// Phase 21D-D.1 — real-browser harness of the ARABIC ACCEPTANCE EXAM for chemistryStructure@1 (certification only; never shipped). The
// six standalone simulations of docs/fixtures/chemistry-structure-21dd1 and the shared ammonia context are rendered by the PRODUCTION
// workspace from the STUDENT projection (the private key never reaches the components). The page's "server" is the shared authority the API
// uses: every answer change is bound to the published question (bindSmartSimAnswerToQuestion) and autosaved; a reload restores the saved
// answers; grading (evaluateSmartSim) and the teacher review use the private key the page keeps outside the student tree.
// Query: ?review=1 renders the teacher review of the saved answers; ?author=1 renders the TEACHER editor (production ChemEditor) and exposes
// the authored question to the builder's real import → save → export → import round trip.
import { StrictMode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import exam from "../docs/fixtures/chemistry-structure-21dd1/ExamBank_21DD1_Chemistry_Structure_Acceptance.json";
import "../src/trustedSimPlugins";
import { bindSmartSimAnswerToQuestion, evaluateSmartSim, projectSmartSimForStudent, validateSmartSimQuestion } from "../src/trustedSimQuestion";
import ChemWorkspace from "../src/chemistryStructure/ChemWorkspace";
import ChemEditor from "../src/chemistryStructure/ChemEditor";
import ChemReview from "../src/chemistryStructure/ChemReview";
import { waterPreset } from "../src/chemistryStructure/chemTemplates";
import { parseStructuredExamJson } from "../src/structuredExamImport";
import { toSavedStructuredExam } from "../src/examBuilderState";

type Q = { examQuestionId: string; text: string; marks: number; smartSim: unknown; answer: unknown };
type Ans = { kind: "smartSim"; pluginKey: string; pluginVersion: number; actions: unknown[]; state: unknown };
const SECTIONS = (exam as { sections: { questions: Record<string, unknown>[] }[] }).sections;
const STANDALONE = SECTIONS.flatMap(s => s.questions).filter(q => q.presentationType === "smartSim") as unknown as Q[];
const composite = SECTIONS[4].questions[0] as { composite: { contexts: { id: string; smartSim: unknown }[]; groups: { parts: { id: string; marks: number; answer?: unknown }[] }[] } };
// the shared context as a question-shaped item (its linked part p1 carries the private checks)
const CONTEXT: Q = { examQuestionId: "ctxAmmonia", text: "جزيء الأمونيا (سياق مشترك)", marks: 3, smartSim: composite.composite.contexts[0].smartSim, answer: composite.composite.groups[0].parts[0].answer };
const QUESTIONS: Q[] = [...STANDALONE, CONTEXT];
const STORE = "exam-21dd1-draft";
const params = new URLSearchParams(location.search);
declare global { interface Window { __exam: Record<string, unknown>; __author: Record<string, unknown> } }

const readDraft = (): Record<string, Ans> => { try { return JSON.parse(sessionStorage.getItem(STORE) || "{}"); } catch { return {}; } };
const bind = (q: Q, a: unknown) => bindSmartSimAnswerToQuestion(a, { type: "smartSim", presentationType: "smartSim", questionTypeVersion: 1, smartSim: q.smartSim, answer: q.answer });
/** the page's "server": bind each answer to the PUBLISHED question, keep only accepted answers, persist. */
function autosave(answers: Record<string, unknown>): { saved: Record<string, Ans>; rejected: string[] } {
  const saved: Record<string, Ans> = {}, rejected: string[] = [];
  for (const [id, a] of Object.entries(answers)) {
    const q = QUESTIONS.find(x => x.examQuestionId === id);
    const r = q ? bind(q, a) : { ok: false as const, code: "UNKNOWN" };
    if (r.ok) saved[id] = r.answer as unknown as Ans; else rejected.push(id);
  }
  sessionStorage.setItem(STORE, JSON.stringify(saved));
  return { saved, rejected };
}
const grade = (answers: Record<string, Ans>) => QUESTIONS.map(q => {
  const r = evaluateSmartSim({ envelope: q.smartSim, answerKey: q.answer, response: answers[q.examQuestionId] ?? null, maxMarks: q.marks });
  return { id: q.examQuestionId, score: r.score, maxMarks: q.marks, manualReview: r.manualReview };
});

export function Exam({ answers, onAnswer }: { answers: Record<string, Ans>; onAnswer: (id: string, a: Ans) => void }) {
  return <>{QUESTIONS.map((q, i) => {
    const env = projectSmartSimForStudent(q.smartSim) as { config: unknown; pluginKey: string; pluginVersion: number } | undefined;
    return (
      <article key={q.examQuestionId} data-testid={"q-" + q.examQuestionId} style={{ borderTop: "1px solid #ccd", padding: "12px 0" }}>
        <h2 style={{ fontSize: 17 }}>السؤال {i + 1} ({q.marks} علامات): {q.text}</h2>
        {env ? <ChemWorkspace config={env.config} actions={answers[q.examQuestionId]?.actions ?? []} label={"السؤال " + (i + 1)}
          onChange={(actions, state) => onAnswer(q.examQuestionId, { kind: "smartSim", pluginKey: env.pluginKey, pluginVersion: env.pluginVersion, actions, state })} /> : <p>غير متاح</p>}
      </article>
    );
  })}</>;
}
type Node = Record<string, unknown>;
export function Author() {
  const p = waterPreset();
  const [node, setNode] = useState<Node>({ examQuestionId: "q1", presentationType: "smartSim", questionTypeVersion: 1, text: "تأمل جزيء الماء وأجب.", marks: 7, smartSim: { schemaVersion: 1, pluginKey: "chemistryStructure", pluginVersion: 1, config: p.config }, answer: { scoring: "proportional", checks: p.checks } });
  const latest = useRef(node);
  useEffect(() => { latest.current = node; }, [node]);
  const sim = node.smartSim as Node, key = node.answer as Node;
  const onChange = useCallback((n: { config?: unknown; checks?: unknown[]; scoring?: unknown }) => setNode(cur => {
    const s = cur.smartSim as Node, k = cur.answer as Node;
    const next = { ...cur, smartSim: n.config !== undefined ? { ...s, config: n.config } : s, answer: { ...k, ...(n.checks !== undefined ? { checks: n.checks } : {}), ...(n.scoring !== undefined ? { scoring: n.scoring } : {}) } };
    latest.current = next; return next;
  }), []);
  useEffect(() => {
    const examOf = (q: Node) => ({ ...(exam as Node), examId: "authored-21dd1", sections: [{ id: "sec-a", title: "سؤال مؤلَّف", gradingPolicy: "all", questions: [q] }] });
    window.__author = {
      node: () => latest.current,
      issues: () => validateSmartSimQuestion(latest.current),
      roundTrip: () => {
        const first = parseStructuredExamJson(JSON.stringify(examOf(latest.current)), "authored.json");
        const again = parseStructuredExamJson(JSON.stringify(toSavedStructuredExam(first.exam as never)), "re-export.json");
        const q = (again.exam as { sections: { questions: Node[] }[] }).sections[0].questions[0];
        return { canOpen: first.canOpen && again.canOpen, errors: [...first.validationErrors, ...again.validationErrors].filter(i => i.severity === "error").map(i => i.code), same: JSON.stringify([q.smartSim, q.answer]) === JSON.stringify([latest.current.smartSim, latest.current.answer]) };
      }
    };
  }, []);
  return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 12 }} dir="rtl"><h1 style={{ fontSize: 20 }}>تأليف سؤال كيمياء</h1>
    <ChemEditor config={sim.config} checks={key.checks as unknown[]} scoring={key.scoring} onChange={onChange} /></main>;
}
export function Harness() {
  const [answers, setAnswers] = useState<Record<string, Ans>>(() => readDraft());
  const [lastSave, setLastSave] = useState<{ rejected: string[] }>({ rejected: [] });
  const latest = useRef(answers);
  useEffect(() => { latest.current = answers; }, [answers]);
  const onAnswer = useCallback((id: string, a: Ans) => {
    const r = autosave({ ...latest.current, [id]: a });
    latest.current = r.saved; setLastSave({ rejected: r.rejected }); setAnswers(r.saved);
  }, []);
  useEffect(() => {
    window.__exam = {
      answers: () => latest.current, grade: () => grade(latest.current), lastSave: () => lastSave,
      // a forged client answer goes through the same server binding (never trusted)
      forge: (id: string, a: unknown) => { const r = autosave({ ...latest.current, [id]: a }); latest.current = r.saved; setAnswers(r.saved); return r; },
      questions: QUESTIONS.map(q => q.examQuestionId)
    };
  }, [answers, lastSave]);
  if (params.get("review") === "1") {
    const saved = readDraft();
    return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 12 }}><h1 style={{ fontSize: 20 }}>مراجعة المعلم</h1>
      {QUESTIONS.map(q => { const r = evaluateSmartSim({ envelope: q.smartSim, answerKey: q.answer, response: saved[q.examQuestionId] ?? null, maxMarks: q.marks }, { withDetails: true });
        return <section key={q.examQuestionId} data-testid={"r-" + q.examQuestionId}><h2 style={{ fontSize: 16 }}>{q.text} — <span data-testid="r-score">{r.score}</span> / {q.marks}</h2>
          <ChemReview config={(q.smartSim as { config: unknown }).config} state={r.state} details={{}} /></section>; })}
    </main>;
  }
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 12 }}>
      <h1 style={{ fontSize: 20 }}>ExamBank 21D-D.1 — اختبار القبول لمحاكاة البنية الذرية والجزيئية</h1>
      <Exam answers={answers} onAnswer={onAnswer} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={null}>{params.get("author") === "1" ? <Author /> : <Harness />}</Suspense></StrictMode>);
