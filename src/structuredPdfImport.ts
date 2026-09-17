// UX-6d — the ONE explicit conversion layer from PDF-detected questions (returned by /api/import-analyze,
// the existing authenticated PDF upload → extract → chunk → AI-detect pipeline) into a canonical
// StructuredExam DRAFT. It reuses structuredExamImport.normalizeImportedExam so id generation, embedded-
// image safety, foreign-examId distrust and status="draft" behave EXACTLY as for a JSON/HTML import — no
// second parser, no second image path. It NEVER invents academic semantics: marks, grading policy,
// required answers, answer unit, and any correct answer not explicitly present in the source are left
// unresolved for the wizard/builder. Source page numbers and the detected type are preserved as import
// metadata (exam.metadata.import — stripped from the student payload by student-exam-sanitize).

import type { StructuredExam } from "./examTypes";
import { normalizeImportedExam, computeStats, type ImportStats, type ImportMessage } from "./structuredExamImport";
import { validateStructuredExam, type StructuredIssue } from "./examQuality";

// The shape the wizard hands us (import-analyze question stamped by the panel/wizard). Only the fields we
// read are typed; extra fields are ignored.
export type PdfDetectedQuestion = {
  importedQuestionId: string;
  pageNumbers: number[];
  presentationType: "multipleChoice" | "fillBlank" | "wordBank" | "open" | null;
  text: string;
  options: { value?: string; text: string }[];
  hasVisibleAnswer: boolean;
  answerText: string;
  images?: { id: string; dataUrl: string; contentType: string }[];
  excluded?: boolean; // set true in the review stage to drop a falsely-detected block
};

export type PdfConversionResult = {
  exam: StructuredExam | null;
  issues: StructuredIssue[];
  stats: ImportStats;
  generatedIds: number;
  warnings: ImportMessage[];
  converted: number;
  // examQuestionId → the raw detected type, when it was mapped to shortAnswer (so the review can note it).
  fallbacks: { questionId: string; detectedType: string }[];
};

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const clean = (v: unknown): string => str(v).normalize("NFKC").replace(/\s+/g, " ").toLowerCase();

// Builds ONE raw structured question from a detected question. Only source-present data is used:
//  - a detected multipleChoice with ≥ 2 options stays multipleChoice; a visible answer is mapped to a
//    correctOptionIndex ONLY when it EXACTLY matches exactly one option (source evidence, unambiguous) —
//    otherwise the answer is left unset (a MISSING_ANSWER the teacher/AI resolves).
//  - every other detected type (fillBlank/wordBank without explicit field structure, open, or unknown)
//    becomes shortAnswer (manual-gradable, never blocking); a visible answer is kept as the model answer.
// Marks are NEVER invented (left unset → the teacher sets them). Images pass through the shared safe-image
// sanitizer in normalizeImportedExam.
function toRawQuestion(dq: PdfDetectedQuestion, fallbacks: { questionId: string; detectedType: string }[]): Record<string, unknown> {
  const examQuestionId = "pdfq-" + str(dq.importedQuestionId);
  const image = Array.isArray(dq.images) && dq.images.length
    ? { exists: true, visible: true, assets: dq.images.map(im => ({ dataUrl: im.dataUrl })) }
    : undefined;
  const base: Record<string, unknown> = { examQuestionId, text: str(dq.text), ...(image ? { image } : {}) };

  const options = Array.isArray(dq.options) ? dq.options.filter(o => str(o.text)) : [];
  if (dq.presentationType === "multipleChoice" && options.length >= 2) {
    const q: Record<string, unknown> = { ...base, presentationType: "multipleChoice", options: options.map(o => ({ text: str(o.text) })), answer: {} };
    if (dq.hasVisibleAnswer && str(dq.answerText)) {
      const matches = options.map((o, i) => ({ i, t: clean(o.text) })).filter(o => o.t === clean(dq.answerText));
      if (matches.length === 1) q.answer = { correctOptionIndex: matches[0].i }; // unambiguous source-derived key
    }
    return q;
  }

  if (dq.presentationType && dq.presentationType !== "open") {
    fallbacks.push({ questionId: examQuestionId, detectedType: dq.presentationType });
  }
  const q: Record<string, unknown> = { ...base, presentationType: "shortAnswer" };
  if (dq.hasVisibleAnswer && str(dq.answerText)) q.answer = { text: str(dq.answerText) };
  return q;
}

/**
 * Converts the INCLUDED PDF-detected questions into a canonical StructuredExam draft. Excluded items are
 * dropped. Pure — no network. Runs the canonical validator so the wizard shows the real issue counts.
 */
export function detectedQuestionsToStructuredExam(questions: PdfDetectedQuestion[], opts: { fileName: string }): PdfConversionResult {
  const included = (questions || []).filter(q => !q.excluded);
  const fallbacks: { questionId: string; detectedType: string }[] = [];
  const pdfPages: Record<string, number[]> = {};
  const rawQuestions = included.map(dq => {
    const raw = toRawQuestion(dq, fallbacks);
    pdfPages[String(raw.examQuestionId)] = Array.isArray(dq.pageNumbers) ? dq.pageNumbers : [];
    return raw;
  });

  const raw = {
    title: opts.fileName.replace(/\.[^.]+$/, ""),
    sections: [{ id: "pdf-section-1", title: "القسم الأول", questions: rawQuestions }]
  };
  const ctx = { errors: [] as ImportMessage[], warnings: [] as ImportMessage[], generated: 0 };
  const exam = normalizeImportedExam(raw, { fileName: opts.fileName, sourceFormat: "json" }, ctx);
  if (exam) {
    const meta = (exam.metadata || {}) as Record<string, unknown>;
    const imp = (meta.import || {}) as Record<string, unknown>;
    meta.import = { ...imp, source: "pdf", sourceFileName: opts.fileName, pdfPages };
    (exam as unknown as { metadata: Record<string, unknown> }).metadata = meta;
  }
  const issues = exam ? validateStructuredExam(exam) : [];
  return {
    exam,
    issues,
    stats: computeStats(exam),
    generatedIds: ctx.generated,
    warnings: ctx.warnings.concat(ctx.errors),
    converted: rawQuestions.length,
    fallbacks
  };
}
