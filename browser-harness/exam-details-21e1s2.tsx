// Phase 21E.1 (slice 2) — real-browser harness for audit finding F3 (certification only; never shipped). Mounts the REAL
// ExamDetailsDisclosure with the same children the student exam page renders (src/StudentExamPage.tsx), inside the real
// `.interactive-exam-page` root and the real stylesheets, collapsed (no general instructions) as a running exam shows it.
// scripts/check-exam-details-browser-21e1s2.mjs reads the COMPUTED display / height and clicks the toggle twice.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/design-tokens.css";
import "../src/index.css";
import "../src/ui/ui.css";
import "../src/studentexam-pro.css";
import ExamDetailsDisclosure from "../src/student/exam/ExamDetailsDisclosure";

const page = (
  <main className="interactive-exam-page" style={{ padding: "16px" }}>
    <ExamDetailsDisclosure summary="22 أسئلة · 100 علامة" defaultOpen={false}>
      <p className="iex-details-instructions">أجب عن جميع الأسئلة، واحفظ إجاباتك قبل انتهاء الوقت.</p>
      <dl className="iex-details-list">
        <div><dt>الطالب</dt><dd>سارة أحمد</dd></div>
        <div><dt>الصف</dt><dd>الصف العاشر — شعبة أ</dd></div>
        <div><dt>الأسئلة</dt><dd>22</dd></div>
        <div><dt>العلامات</dt><dd>100</dd></div>
        <div><dt>آخر موعد</dt><dd>2026-10-20 10:00</dd></div>
        <div><dt>المحاولة</dt><dd>1 من 2</dd></div>
      </dl>
    </ExamDetailsDisclosure>
    <h2 id="q1" style={{ marginBlock: "16px" }}>السؤال 1 من 22</h2>
    <p>ما عنوان الشبكة للعنوان 192.168.1.37/24؟</p>
  </main>
);
createRoot(document.getElementById("root")!).render(<StrictMode>{page}</StrictMode>);
