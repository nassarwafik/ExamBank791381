// Roadmap #17/#15 — ONE presentation component for exam-level general instructions
// (exam.metadata.generalInstructions), shared by the faithful teacher preview (ExamPreview) and the real
// student runtime (StudentExamPage) so what the teacher previews is exactly what the student sees.
//
// Presentation only: plain text split into trimmed non-empty lines rendered as bullets (never HTML —
// JSX text content is escaped, so HTML-like text is shown literally). Renders nothing when empty, so
// exams without general instructions are visually unchanged. It carries NO lifecycle logic.
//
// Hierarchy: this sits AFTER the exam header/progress and BEFORE the sections/questions; section
// instructions render inside their own section; cover instructions live on the cover page.

export function generalInstructionLinesOf(text: string | null | undefined): string[] {
  return String(text ?? "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

export default function ExamGeneralInstructions({ text }: { text?: string | null }) {
  const lines = generalInstructionLinesOf(text);
  if (!lines.length) return null;
  return (
    <div className="iex-general-instructions">
      <strong className="iex-cover-section-title">التعليمات العامة</strong>
      <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}
