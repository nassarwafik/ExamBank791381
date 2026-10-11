// Phase 21E.0 — Review Fix 1 real-browser harness (certification only; never shipped): the keyboard focus ring INSIDE a themed
// student exam. The page mounts the REAL presentation root the student exam page uses (PresentationRoot → .exam-presentation with
// the preset's --xp-* variables) around the REAL student question card, for several code-owned presets: an inline-cloze question
// (text input + dropdown, the 21E.0-migrated .cloze-input / .cloze-select rules), a hotspot question with one placed point (the
// migrated .vq-overlay / .vq-marker rules) and a legacy multiple-choice question (a generic control that only the scoped
// `.exam-presentation :focus-visible` rule styles). scripts/check-exam-focus-ring-browser-21e0-rf1.mjs Tabs through every preset
// and reads the COMPUTED outline: inside a themed exam every control must keep the exam's 3px ring in the preset's primary colour,
// never the platform-default 2px ring. No app state, no network, no answer key.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/design-tokens.css";
import "../src/index.css";
import "../src/ui/ui.css";
import "../src/studentexam-pro.css";
import PresentationRoot from "../src/presentation/PresentationRoot";
import StudentQuestionCard from "../src/StudentQuestionCard";
import type { Answer, Question } from "../src/StudentQuestionCard";
import { PRESENTATION_PRESETS } from "../src/presentation/presentationModel";

const IMG = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#dbe4ee"/><circle cx="120" cy="100" r="40" fill="#8fa8c8"/><rect x="240" y="60" width="90" height="80" fill="#8fa8c8"/></svg>');
const CLOZE: Question = { examQuestionId: "c1", type: "inlineCloze", questionTypeVersion: 1, text: "أكمل الفقرة.", marks: 2,
  inlineCloze: { v: 1, segments: [{ type: "text", text: "يعمل البروتوكول " }, { type: "blank", id: "b1", control: "text" }, { type: "text", text: " في الطبقة الثالثة، وعنوان MAC يعمل في " },
    { type: "blank", id: "b2", control: "dropdown", options: [{ id: "o1", label: "Physical" }, { id: "o2", label: "Data Link" }] }, { type: "text", text: "." }] } as never };
const HOTSPOT: Question = { examQuestionId: "h1", type: "hotspot", questionTypeVersion: 1, text: "حدّد الجهاز على المخطط.", marks: 1,
  image: { exists: true, visible: true, assets: [{ dataUrl: IMG, origin: "uploaded", contentType: "image/svg+xml" }] }, hotspot: { v: 1, mode: "single", selections: 1, alt: "مخطط شبكة" } as never };
const MCQ: Question = { examQuestionId: "m1", type: "multipleChoice", text: "ما طبقة عنوان IP؟", marks: 1, options: [{ text: "الشبكة" }, { text: "الربط" }] };
const PRESETS = (import.meta.env.VITE_RF1_PRESETS ? String(import.meta.env.VITE_RF1_PRESETS).split(",") : ["highContrast", "default", "classicPaper"]).filter(p => p in PRESENTATION_PRESETS);

function Exam({ preset }: { preset: string }) {
  const [cloze, setCloze] = useState<Answer | undefined>();
  const [hot, setHot] = useState<Answer | undefined>({ kind: "hotspot", points: [{ x: 0.3, y: 0.5 }] } as Answer);
  const [mcq, setMcq] = useState<Answer | undefined>();
  const noop = () => {};
  return (
    <section data-preset={preset} style={{ margin: "16px 0" }}>
      <h2 style={{ fontSize: "14px", margin: "0 16px 8px" }}>{preset} — {PRESENTATION_PRESETS[preset as keyof typeof PRESENTATION_PRESETS].label}</h2>
      <PresentationRoot presentation={{ schemaVersion: 1, preset }} className="interactive-exam-page">
        <div className="iex-page-question">
          <StudentQuestionCard q={CLOZE} index={0} id="c1" answer={cloze} onChoice={noop} onSeq={noop} onTable={noop} onText={noop} onAnswer={setCloze} />
          <StudentQuestionCard q={HOTSPOT} index={1} id="h1" answer={hot} onChoice={noop} onSeq={noop} onTable={noop} onText={noop} onAnswer={setHot} />
          <StudentQuestionCard q={MCQ} index={2} id={"m1-" + preset} answer={mcq} onChoice={n => setMcq({ kind: "choice", index: n })} onSeq={noop} onTable={noop} onText={noop} />
        </div>
      </PresentationRoot>
    </section>
  );
}
function Page() {
  return <main style={{ maxWidth: 960, margin: "0 auto", fontFamily: "var(--eb-font)" }}><h1 style={{ fontSize: "18px", margin: "16px" }}>21E.0 RF1 — حلقة التركيز داخل الامتحان المُنسَّق</h1>{PRESETS.map(p => <Exam key={p} preset={p} />)}<button type="button" className="eb-button" data-probe="outside-eb-button" style={{ margin: 16 }}>زر خارج الامتحان (المرجع العام)</button></main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
