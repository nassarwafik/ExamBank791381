// Phase 21D-D.2 — real-browser harness of the ARABIC ACCEPTANCE EXAM for chemistryReactions@1 (certification only; never shipped). The seven
// standalone simulations of docs/fixtures/chemistry-reactions-21dd2 and the shared methane context are rendered by the PRODUCTION workspace
// from the STUDENT projection (the private key never reaches the components). The page's "server" is the shared authority the API uses: every
// answer change is bound to the published question (bindSmartSimAnswerToQuestion) and autosaved; a reload restores the saved answers;
// grading (evaluateSmartSim) and the teacher review use the private key the page keeps outside the student tree.
// Query: ?review=1 renders the teacher review of the saved answers; ?author=1 renders the TEACHER editor (production RxnEditor) and exposes
// the authored question to the builder's real import → save → export → import round trip.
import { StrictMode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
// UX-R16a — the simulators read the platform's design tokens (the content family) exactly as in the app, where main.tsx loads them.
import "../src/design-tokens.css";
import exam from "../docs/fixtures/chemistry-reactions-21dd2/ExamBank_21DD2_Chemistry_Reactions_Acceptance.json";
import "../src/trustedSimPlugins";
import { bindSmartSimAnswerToQuestion, evaluateSmartSim, projectSmartSimForStudent, validateSmartSimQuestion } from "../src/trustedSimQuestion";
import RxnWorkspace from "../src/chemistryReactions/RxnWorkspace";
import RxnEditor from "../src/chemistryReactions/RxnEditor";
import RxnReview from "../src/chemistryReactions/RxnReview";
import { waterTemplate } from "../src/chemistryReactions/rxnTemplates";
import { parseStructuredExamJson } from "../src/structuredExamImport";
import { toSavedStructuredExam } from "../src/examBuilderState";

type Q = { examQuestionId: string; text: string; marks: number; smartSim: unknown; answer: unknown };
type Ans = { kind: "smartSim"; pluginKey: string; pluginVersion: number; actions: unknown[]; state: unknown };
const SECTIONS = (exam as { sections: { questions: Record<string, unknown>[] }[] }).sections;
const STANDALONE = SECTIONS.flatMap(s => s.questions).filter(q => q.presentationType === "smartSim") as unknown as Q[];
type Part = { id: string; marks: number; contextId?: string; answer?: { scoring: string; checks: unknown[] } };
const composite = SECTIONS[3].questions[0] as { composite: { contexts: { id: string; smartSim: unknown }[]; groups: { parts: Part[] }[] } };
const linked = composite.composite.groups[0].parts.filter(p => p.contextId === composite.composite.contexts[0].id);
// the shared context as a question-shaped item: the linked parts' private checks graded together (3 + 2 marks)
const CONTEXT: Q = { examQuestionId: "ctxMethane", text: "احتراق الميثان (سياق مشترك)", marks: linked.reduce((n, p) => n + p.marks, 0), smartSim: composite.composite.contexts[0].smartSim,
  answer: { scoring: "proportional", checks: linked.flatMap(p => p.answer!.checks) } };
const QUESTIONS: Q[] = [...STANDALONE, CONTEXT];
const STORE = "exam-21dd2-draft";
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
        {env ? <RxnWorkspace config={env.config} actions={answers[q.examQuestionId]?.actions ?? []} label={"السؤال " + (i + 1)}
          onChange={(actions, state) => onAnswer(q.examQuestionId, { kind: "smartSim", pluginKey: env.pluginKey, pluginVersion: env.pluginVersion, actions, state })} /> : <p>غير متاح</p>}
      </article>
    );
  })}</>;
}
type Node = Record<string, unknown>;
export function Author() {
  const t = waterTemplate();
  const [node, setNode] = useState<Node>({ examQuestionId: "q1", presentationType: "smartSim", questionTypeVersion: 1, text: "زِن معادلة تكوين الماء.", marks: 4, smartSim: { schemaVersion: 1, pluginKey: "chemistryReactions", pluginVersion: 1, config: t.config }, answer: { scoring: "proportional", checks: t.checks } });
  const latest = useRef(node);
  useEffect(() => { latest.current = node; }, [node]);
  const sim = node.smartSim as Node, key = node.answer as Node;
  const onChange = useCallback((n: { config?: unknown; checks?: unknown[]; scoring?: unknown }) => setNode(cur => {
    const s = cur.smartSim as Node, k = cur.answer as Node;
    const next = { ...cur, smartSim: n.config !== undefined ? { ...s, config: n.config } : s, answer: { ...k, ...(n.checks !== undefined ? { checks: n.checks } : {}), ...(n.scoring !== undefined ? { scoring: n.scoring } : {}) } };
    latest.current = next; return next;
  }), []);
  useEffect(() => {
    const examOf = (q: Node) => ({ ...(exam as Node), examId: "authored-21dd2", sections: [{ id: "sec-a", title: "سؤال مؤلَّف", gradingPolicy: "all", questions: [q] }] });
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
  return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 12 }} dir="rtl"><h1 style={{ fontSize: 20 }}>تأليف سؤال تفاعلات</h1>
    <RxnEditor config={sim.config} checks={key.checks as unknown[]} scoring={key.scoring} onChange={onChange} /></main>;
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
        return <section key={q.examQuestionId} data-testid={"r-" + q.examQuestionId}><h2 style={{ fontSize: 16 }}>{q.text} — <span data-testid="r-score">{Math.round(r.score * 100) / 100}</span> / {q.marks}</h2>
          <RxnReview config={(q.smartSim as { config: unknown }).config} state={r.state} details={{}} /></section>; })}
    </main>;
  }
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 12 }}>
      <h1 style={{ fontSize: 20 }}>ExamBank 21D-D.2 — اختبار القبول لمحاكاة التفاعلات والمعادلات الكيميائية</h1>
      <Exam answers={answers} onAnswer={onAnswer} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={null}>{params.get("author") === "1" ? <Author /> : <Harness />}</Suspense></StrictMode>);
