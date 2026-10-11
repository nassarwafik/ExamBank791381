// UX-003 — real-browser harness of the TEACHER GRADING WORKSPACE (certification only; never shipped): the production AssignmentReview
// with the production stylesheets, driven by an in-page "server" that answers GET / POST /api/assignment-review the way the real
// handler does for the review projection (teacher-only keys, canonical questionGrades, manual overrides re-applied on save). No token
// leaves the page, no network. `window.__host` exposes the close / save counters and the POST bodies for the certification script.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/design-tokens.css";
import "../src/index.css";
import "../src/App.css";
import "../src/platform.css";
import "../src/shell.css";
import "../src/studentexam-pro.css";
import "../src/review-pro.css";
import "../src/ui/ui.css";
import AssignmentReview from "../src/AssignmentReview";

type Grade = { score: number; maxMarks: number; manualReview: boolean; correct: boolean; reviewed?: boolean; manualScore?: number; teacherComment?: string };
type Q = { questionId: string; questionNumber: number; text: string; marks: number; type: string; options?: { text: string }[]; studentAnswer: unknown; expectedAnswer: unknown };
const QUESTIONS: Q[] = [
  { questionId: "q1", questionNumber: 1, text: "أي جهاز يعمل في الطبقة الثالثة من نموذج OSI؟", marks: 2, type: "multipleChoice", options: [{ text: "الهب (Hub)" }, { text: "السويتش (Switch)" }, { text: "الراوتر (Router)" }], studentAnswer: { kind: "choice", index: 2 }, expectedAnswer: { correctOptionIndex: 2 } },
  { questionId: "q2", questionNumber: 2, text: "ما قناع الشبكة الافتراضي للفئة C؟", marks: 2, type: "multipleChoice", options: [{ text: "255.0.0.0" }, { text: "255.255.0.0" }, { text: "255.255.255.0" }], studentAnswer: { kind: "choice", index: 1 }, expectedAnswer: { correctOptionIndex: 2 } },
  { questionId: "q3", questionNumber: 3, text: "اشرح الفرق بين TCP و UDP مع مثال لكل منهما.", marks: 5, type: "shortAnswer", studentAnswer: { kind: "text", value: "TCP موثوق ويضمن الوصول والترتيب مثل HTTP، أما UDP فسريع بلا ضمان مثل بث الفيديو." }, expectedAnswer: { text: "TCP: اتصال موثوق، ترتيب، إعادة إرسال (HTTP, FTP). UDP: بلا اتصال، سريع (DNS, VoIP)." } },
  { questionId: "q4", questionNumber: 4, text: "احسب عدد المضيفين في الشبكة /26.", marks: 4, type: "shortAnswer", studentAnswer: { kind: "text", value: "64" }, expectedAnswer: { text: "62" } },
  { questionId: "q5", questionNumber: 5, text: "عرّف بروتوكول DHCP.", marks: 3, type: "shortAnswer", studentAnswer: null, expectedAnswer: { text: "يوزّع عناوين IP تلقائيًا" } },
  { questionId: "q6", questionNumber: 6, text: "عنوان 192.168.1.1 عنوان عام (Public).", marks: 1, type: "trueFalse", options: [], studentAnswer: { kind: "choice", index: 0 }, expectedAnswer: { correct: false } },
  { questionId: "q7", questionNumber: 7, text: "اذكر ثلاث طبقات من نموذج OSI.", marks: 3, type: "shortAnswer", studentAnswer: { kind: "text", value: "Physical, Network, Application" }, expectedAnswer: { text: "أي ثلاث طبقات" } },
];
const AUTO: Record<string, Grade> = {
  q1: { score: 2, maxMarks: 2, manualReview: false, correct: true },
  q2: { score: 0, maxMarks: 2, manualReview: false, correct: false },
  q3: { score: 0, maxMarks: 5, manualReview: true, correct: false },
  q4: { score: 2, maxMarks: 4, manualReview: false, correct: false },
  q5: { score: 0, maxMarks: 3, manualReview: false, correct: false },
  q6: { score: 0, maxMarks: 1, manualReview: false, correct: false },
  q7: { score: 0, maxMarks: 3, manualReview: true, correct: false },
};
// RF1 — TWO attempts per student (attempt 2 = a later, fully automatic attempt with no pending question) so the attempt-switch guard
// and the mode counts can be certified; overrides and feedback are stored per attempt, exactly like the real submission document.
const AUTO2: Record<string, Grade> = { ...AUTO, q3: { score: 5, maxMarks: 5, manualReview: false, correct: true }, q7: { score: 0, maxMarks: 3, manualReview: false, correct: false } };
const overridesByAttempt: Record<number, Record<string, { score: number; comment: string }>> = { 1: {}, 2: { q2: { score: 1, comment: "نصف العلامة" } } };
const feedbackByAttempt: Record<number, string> = { 1: "", 2: "" };
const posts: unknown[] = [];
const autoOf = (n: number) => (n === 2 ? AUTO2 : AUTO);
function attemptView(n: number) {
  const auto = autoOf(n), overrides = overridesByAttempt[n];
  let score = 0, pending = 0;
  for (const q of QUESTIONS) { const g = auto[q.questionId], o = overrides[q.questionId]; if (o) score += o.score; else { score += g.score; if (g.manualReview) pending += g.maxMarks; } }
  const total = QUESTIONS.reduce((s, q) => s + q.marks, 0);
  const t = n === 2 ? "2026-10-11T09:00:00.000Z" : "2026-10-10T09:30:00.000Z";
  return { attemptNumber: n, submittedAt: t, startedAt: t, endedAt: t, endReason: "submitted", timedOut: false, score, totalMarks: total, percentage: Math.round(score / total * 100), manualReviewMarks: pending, finalized: pending === 0, gradingStatus: pending === 0 ? "final" : "pendingReview" };
}
function reviewBody(n: number) {
  const a = attemptView(n), auto = autoOf(n), overrides = overridesByAttempt[n];
  return { ok: true, scenarios: [], assignment: { assignmentId: "a1", title: "امتحان الشبكات — الفصل الأول", totalMarks: a.totalMarks }, student: { studentId: "s1", studentName: "سارة أحمد", studentCode: "ST-1042" },
    attempt: { ...a, teacherFeedback: feedbackByAttempt[n] }, attempts: [attemptView(1), attemptView(2)],
    questions: QUESTIONS.map(q => { const g = auto[q.questionId], o = overrides[q.questionId]; const grade: Grade = o ? { ...g, score: o.score, manualScore: o.score, manualReview: false, reviewed: true, teacherComment: o.comment } : { ...g, reviewed: !g.manualReview };
      return { ...q, options: q.options ?? [], fields: [], wordBank: [], parts: null, sectionId: "s1", autoGrade: grade, manualScore: o ? o.score : null, teacherComment: o ? o.comment : "" }; }) };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input), method = (init && init.method) || "GET";
  await new Promise(r => setTimeout(r, 40));
  if (url.startsWith("/api/assignment-review") && method === "GET") { const n = Number(new URL(url, location.origin).searchParams.get("attemptNumber") || 1); return json(200, reviewBody(n === 2 ? 2 : 1)); }
  if (url.startsWith("/api/assignment-review")) {
    const b = JSON.parse(String(init?.body || "{}")); posts.push(b);
    if (b.action !== "saveReview") return json(400, { ok: false, error: "Unsupported review action." });
    const n = Number(b.attemptNumber) === 2 ? 2 : 1, auto = autoOf(n), overrides = overridesByAttempt[n];
    for (const [id, v] of Object.entries(b.overrides || {})) { const g = auto[id]; const o = v as { score?: number; comment?: string }; if (!g || typeof o.score !== "number") continue; overrides[id] = { score: Math.min(g.maxMarks, Math.max(0, o.score)), comment: String(o.comment || "") }; }
    feedbackByAttempt[n] = String(b.teacherFeedback || "");
    const a = attemptView(n);
    return json(200, { ok: true, result: { attemptNumber: n, score: a.score, totalMarks: a.totalMarks, percentage: a.percentage, manualReviewMarks: a.manualReviewMarks, finalized: a.finalized, gradingStatus: a.gradingStatus, teacherFeedback: feedbackByAttempt[n] } });
  }
  return json(404, { ok: false });
};
declare global { interface Window { __host: { closed: number; saved: number; posts: unknown[]; reopen: () => void } } }
window.__host = { closed: 0, saved: 0, posts, reopen: () => {} };

function Host() {
  const [open, setOpen] = useState(true);
  window.__host.reopen = () => setOpen(true);
  return (
    <>
      <main className="eb-shell-content" data-testid="teacher-workspace"><h1>نتائج الواجب</h1><p>قائمة الطلاب تظهر هنا؛ «مراجعة» يفتح ورقة الطالب.</p></main>
      {open && <AssignmentReview token="harness" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => { window.__host.closed += 1; setOpen(false); }} onSaved={() => { window.__host.saved += 1; }} />}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Host /></StrictMode>);
