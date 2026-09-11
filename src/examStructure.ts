// Front-end mirror of api/src/lib/exam-structure.js. Same pure structural logic, used ONLY for live
// display (section headers, progress, "extra answer" hints, submission validation). The server copy
// remains authoritative for the official score — this exists so the student sees section-aware
// progress without a round-trip, and it is kept deliberately identical to the backend so the two
// never diverge (both are covered by mirror unit tests). No React import: pure and unit-testable.

import type { Question, QuestionPart, Answer } from "./StudentQuestionCard";
import { answered } from "./StudentQuestionCard";

export type GradingPolicy = "all" | "capScore" | "firstNAnswered";
export type AnswerUnit = "question" | "part";

// Lightweight shared stimulus (a topology image, a command output, a passage) rendered ONCE before
// the questions that reference it via groupId. Not a page builder — just common material + questions.
export type Stimulus = { title?: string; text?: string; image?: { dataUrl?: string } };

export type ExamSection = {
  id?: string;
  title?: string;
  instructions?: string;
  maxMarks?: number | null;
  gradingPolicy?: GradingPolicy;
  requiredAnswers?: number | null;
  answerUnit?: AnswerUnit;
  stimuli?: Record<string, Stimulus> | null;
  questions: Question[];
};

export type NormalizedSection = {
  id: string;
  title: string;
  instructions: string;
  maxMarks: number | null;
  gradingPolicy: GradingPolicy;
  requiredAnswers: number | null;
  answerUnit: AnswerUnit;
  stimuli: Record<string, Stimulus> | null;
  questions: Question[];
};

export type NormalizedExam = { structured: boolean; sections: NormalizedSection[] };

export type StructuredExam = { questions?: Question[]; sections?: ExamSection[] };

const POLICIES: GradingPolicy[] = ["all", "capScore", "firstNAnswered"];

export const questionId = (q: Question, i: number): string =>
  String(q?.examQuestionId ?? q?.id ?? q?.number ?? i + 1);
// Section-scoped identity — mirror of the backend sectionQuestionId. Explicit ids win; otherwise a
// real structured section (not the "__default__" legacy wrapper) yields "sectionId::qN" so question
// number 1 of two different sections never share the answer key "1".
export const sectionQuestionId = (section: { id?: string }, q: Question, i: number): string => {
  if (q && q.examQuestionId != null && q.examQuestionId !== "") return String(q.examQuestionId);
  if (q && q.id != null && q.id !== "") return String(q.id);
  if (section && section.id && section.id !== "__default__") return section.id + "::q" + (i + 1);
  return String((q && q.number) || i + 1);
};
export const partId = (p: QuestionPart, i: number): string => String(p?.id ?? i + 1);
export const fieldId = (f: { id?: string; number?: number }, i: number): string =>
  String(f?.id ?? f?.number ?? i + 1);

// Arabic ordinal labels for compound parts (أ، ب، ج …); explicit part.label wins, number past the end.
const ARABIC_ORDINALS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي", "ك", "ل", "م", "ن", "س", "ع", "ف", "ص", "ق", "ر", "ش", "ت", "ث", "خ", "ذ", "ض", "ظ", "غ"];
export const partLabel = (part: QuestionPart, i: number): string =>
  part && part.label != null && String(part.label).trim() !== "" ? String(part.label) : (ARABIC_ORDINALS[i] || String(i + 1));

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const questionParts = (q: Question): QuestionPart[] => (Array.isArray(q?.parts) ? q.parts : []);
export const isCompound = (q: Question): boolean => questionParts(q).length > 0;

// Marks per part — same distribution rules as the backend (explicit / equal split / mixed).
export function distributePartMarks(q: Question): number[] {
  const parts = questionParts(q);
  if (!parts.length) return [];
  const total = num(q?.marks, 0);
  const hasMark = parts.map(p => p && p.marks != null && Number.isFinite(Number(p.marks)));
  if (hasMark.every(Boolean)) return parts.map(p => num(p.marks));
  if (!hasMark.some(Boolean)) {
    const each = total / parts.length;
    return parts.map(() => each);
  }
  const known = parts.reduce((s, p, i) => s + (hasMark[i] ? num(p.marks) : 0), 0);
  const restCount = hasMark.filter(x => !x).length;
  const each = restCount ? Math.max(0, total - known) / restCount : 0;
  return parts.map((p, i) => (hasMark[i] ? num(p.marks) : each));
}

// Reuses the exact StudentQuestionCard.answered() so "answered" means the same thing in the progress
// bar, the graded-unit selection, and each question card.
export const isAnswerUnitAnswered = (a: Answer | undefined): boolean => answered(a);

function normalizeSection(s: ExamSection, si: number): NormalizedSection {
  const policy: GradingPolicy = POLICIES.includes(s?.gradingPolicy as GradingPolicy)
    ? (s.gradingPolicy as GradingPolicy)
    : "all";
  return {
    id: String(s?.id ?? "section-" + (si + 1)),
    title: String(s?.title ?? ""),
    instructions: String(s?.instructions ?? ""),
    maxMarks: s?.maxMarks == null ? null : num(s.maxMarks),
    gradingPolicy: policy,
    requiredAnswers: s?.requiredAnswers == null ? null : Math.max(0, Math.floor(num(s.requiredAnswers))),
    answerUnit: s?.answerUnit === "part" ? "part" : "question",
    stimuli: s && s.stimuli && typeof s.stimuli === "object" ? s.stimuli : null,
    questions: Array.isArray(s?.questions) ? s.questions : []
  };
}

// The single entry point. Legacy `exam.questions` => one implicit "all" section, so StudentExamPage's
// structured renderer reproduces the flat-list behaviour when a section wrapper is used, and the
// legacy page keeps using its own untouched path.
export function normalizeExamStructure(exam: StructuredExam | null | undefined): NormalizedExam {
  const ex = exam || {};
  if (Array.isArray(ex.sections) && ex.sections.length) {
    return { structured: true, sections: ex.sections.map(normalizeSection) };
  }
  return {
    structured: false,
    sections: [
      {
        id: "__default__",
        title: "",
        instructions: "",
        maxMarks: null,
        gradingPolicy: "all",
        requiredAnswers: null,
        answerUnit: "question",
        stimuli: null,
        questions: Array.isArray(ex.questions) ? ex.questions : []
      }
    ]
  };
}

export type AnswerUnitInfo = { questionId: string; partId: string | null; answered: boolean };

export const unitKey = (u: { questionId: string; partId: string | null }): string =>
  u.partId ? u.questionId + "::" + u.partId : u.questionId;

export function getAnswerUnits(section: NormalizedSection, answers: Record<string, Answer>): AnswerUnitInfo[] {
  const units: AnswerUnitInfo[] = [];
  section.questions.forEach((q, qi) => {
    const qid = sectionQuestionId(section, q, qi);
    const resp = answers ? answers[qid] : undefined;
    if (section.answerUnit === "part" && isCompound(q)) {
      questionParts(q).forEach((p, pi) => {
        const pid = partId(p, pi);
        const pans = resp && resp.kind === "compound" ? resp.parts?.[pid] : undefined;
        units.push({ questionId: qid, partId: pid, answered: isAnswerUnitAnswered(pans) });
      });
    } else {
      units.push({ questionId: qid, partId: null, answered: isAnswerUnitAnswered(resp) });
    }
  });
  return units;
}

// First-N-answered selection in DISPLAY order — identical policy to the backend.
export function selectGradedUnits(
  section: NormalizedSection,
  answers: Record<string, Answer>
): { countedKeys: Set<string>; units: AnswerUnitInfo[] } {
  const units = getAnswerUnits(section, answers);
  if (section.gradingPolicy !== "firstNAnswered" || section.requiredAnswers == null) {
    return { countedKeys: new Set(units.map(unitKey)), units };
  }
  const countedKeys = new Set<string>();
  let taken = 0;
  for (const u of units) {
    if (taken >= section.requiredAnswers) break;
    if (u.answered) {
      countedKeys.add(unitKey(u));
      taken++;
    }
  }
  return { countedKeys, units };
}

export type SectionProgress = {
  total: number;
  answered: number;
  required: number | null;
  counted: number;
  excess: number;
  gradingPolicy: GradingPolicy;
  maxMarks: number | null;
};

export function calculateSectionProgress(
  section: NormalizedSection,
  answers: Record<string, Answer>
): SectionProgress {
  const units = getAnswerUnits(section, answers);
  const total = units.length;
  const answeredCount = units.filter(u => u.answered).length;
  const required = section.gradingPolicy === "firstNAnswered" ? section.requiredAnswers : null;
  const excess = required != null ? Math.max(0, answeredCount - required) : 0;
  return {
    total,
    answered: answeredCount,
    required,
    counted: required != null ? Math.min(answeredCount, required) : answeredCount,
    excess,
    gradingPolicy: section.gradingPolicy,
    maxMarks: section.maxMarks
  };
}
