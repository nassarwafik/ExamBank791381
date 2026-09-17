// UX-7b-2 — the ONE flat, ordered "page" model of a running exam. Pure and React-free: it maps the exam the
// page already holds (normalizeExamStructure output + the legacy flat question list) to an ordered list of
// PRESENTATION descriptors — one per displayed question — so StudentExamPage can render one question at a
// time, the bottom bar can move between them and the navigator / review screen can list them.
//
// It never clones or transforms answer content and never invents identity: a page's `id` is the exact answer
// key the long-form renderers used — `sectionQuestionId(section, q, i)` for a structured section and
// `qid(q, i)` for a legacy flat exam — so saved drafts, autosave bodies, firstN selection and grading keys
// are byte-identical to UX-7b-1. "Answered" is the existing `answered()` predicate; there is no second one.
import type { Answer, Question } from "../../StudentQuestionCard";
import { answered, qid } from "../../StudentQuestionCard";
import { type NormalizedExam, type NormalizedSection, sectionQuestionId } from "../../examStructure";

export type QuestionPage = {
  /** 0-based global position in display order. */
  index: number;
  /** The exact answer key used by the answers map / saveDraft / submit bodies. */
  id: string;
  question: Question;
  /** The owning structured section, or null for a legacy flat exam. */
  section: NormalizedSection | null;
  /** 0-based section position (0 for flat exams). */
  sectionIndex: number;
  /** 0-based position inside the owning section. */
  positionInSection: number;
  /** Number of questions in the owning section (the flat list length for flat exams). */
  sectionSize: number;
  firstInSection: boolean;
  lastInSection: boolean;
};

export type PageStatus = "current" | "answered" | "unanswered";

/** Builds the ordered pages. Flat exams keep the exact `exam.questions` order; structured exams keep section order then question order. */
export function buildQuestionPages(norm: NormalizedExam, flatQuestions: Question[]): QuestionPage[] {
  const pages: QuestionPage[] = [];
  if (!norm.structured) {
    const qs = Array.isArray(flatQuestions) ? flatQuestions : [];
    qs.forEach((q, i) => {
      pages.push({ index: i, id: qid(q, i), question: q, section: null, sectionIndex: 0, positionInSection: i, sectionSize: qs.length, firstInSection: i === 0, lastInSection: i === qs.length - 1 });
    });
    return pages;
  }
  norm.sections.forEach((section, si) => {
    section.questions.forEach((q, i) => {
      pages.push({ index: pages.length, id: sectionQuestionId(section, q, i), question: q, section, sectionIndex: si, positionInSection: i, sectionSize: section.questions.length, firstInSection: i === 0, lastInSection: i === section.questions.length - 1 });
    });
  });
  return pages;
}

/** Safe index for any exam size: an empty exam yields 0; otherwise the index is clamped into [0, total - 1]. */
export function clampPageIndex(index: number, total: number): number {
  if (!Number.isFinite(index) || total <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

/** Navigator / review status of one page — "current" wins, then the existing answered() predicate. */
export function pageStatus(page: QuestionPage, answers: Record<string, Answer>, currentIndex: number | null): PageStatus {
  if (currentIndex !== null && page.index === currentIndex) return "current";
  return answered(answers[page.id]) ? "answered" : "unanswered";
}

export const PAGE_STATUS_LABELS: Record<PageStatus, string> = { current: "الحالي", answered: "مُجاب", unanswered: "غير مُجاب" };

export type PageGroup = { section: NormalizedSection | null; sectionIndex: number; pages: QuestionPage[] };

/** Groups consecutive pages by section (one group for a flat exam) for the navigator and the review screen. */
export function groupPagesBySection(pages: QuestionPage[]): PageGroup[] {
  const groups: PageGroup[] = [];
  for (const page of pages) {
    const last = groups[groups.length - 1];
    if (last && last.sectionIndex === page.sectionIndex && last.section === page.section) last.pages.push(page);
    else groups.push({ section: page.section, sectionIndex: page.sectionIndex, pages: [page] });
  }
  return groups;
}

/** Count of pages whose stored answer satisfies answered(); local state only — persistence is SaveStatus's concern. */
export function countAnsweredPages(pages: QuestionPage[], answers: Record<string, Answer>): number {
  return pages.reduce((n, p) => n + (answered(answers[p.id]) ? 1 : 0), 0);
}
