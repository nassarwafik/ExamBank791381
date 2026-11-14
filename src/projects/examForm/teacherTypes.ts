// Phase F3-UI — the teacher's views of the project exam form, exactly as /api/project-tracker returns them
// (resources exam-form-questions / exam-form-students / exam-form-student and the examForm.* actions). Unlike the student's
// view, the teacher's view of one student carries the answer keys and the rubric.
import type { ExamFormAnswers, ExamFormEntry, ExamFormProgress, ExamFormQuestion } from "./types";

export type TeacherFormStatus = "not_started" | "draft" | "submitted" | "returned" | "approved";

export type TeacherFormRow = {
  studentId: string; displayName: string; code?: string; status: TeacherFormStatus;
  answered: number; total: number; submittedAt: string; updatedAt: string;
  /** Weighted sections the teacher has rated, and how many there are. */
  rated: number; toRate: number;
  /** Only for an approved form. */
  mark: number | null;
};
export type TeacherFormList = {
  readOnly?: boolean; state: "open" | "closed"; formVersion: number; title: string;
  counts: Record<TeacherFormStatus, number>; students: TeacherFormRow[];
};

export type TeacherAnswerKey = { correctOptionId?: string; correctOptionIds?: string[]; pairs?: Record<string, string>; order?: string[] };
export type TeacherQuestion = ExamFormQuestion & { answer?: TeacherAnswerKey };
export type TeacherSection = { sectionId: string; title: string; order: number; weight: number; questions: TeacherQuestion[] };
export type RubricLevel = { value: number; label: string };
export type SectionRating = { level: number; note?: string };

export type TeacherFormView = {
  readOnly?: boolean; changed?: boolean; state: "open" | "closed";
  student: { studentId: string; displayName?: string; code?: string };
  form: { projectCode: string; formVersion: number; title: string; rubric: { levels: RubricLevel[] }; sections: TeacherSection[] };
  answers: ExamFormAnswers;
  status: TeacherFormStatus;
  revision: number;
  submittedAt: string; updatedAt: string; returnNote: string; approvedAt: string;
  progress: ExamFormProgress;
  /** The auto-marked questions: right (true), wrong (false) or not answered (null), and the counts. */
  auto: { byQuestion: Record<string, boolean | null>; total: number; answered: number; correct: number };
  review: { ratings: Record<string, SectionRating>; generalNote: string; updatedAt: string };
  /** Weighted sections that still have no rating: what blocks an approval. */
  unrated: string[];
  result: { mark: number; outOf: number } | null;
};

/** The questions the teacher can hide before the first open (no key). */
export type TeacherFormQuestions = {
  frozen: boolean; hiddenQuestionIds: string[];
  sections: { sectionId: string; title: string; weight: number; questions: { questionId: string; prompt: string; kind: string; grading: string; required: boolean }[] }[];
};

export const STATUS_BADGE: Record<TeacherFormStatus, { tone: "success" | "neutral" | "warn" | "danger" | "info"; text: string }> = {
  not_started: { tone: "neutral", text: "لم يبدأ" },
  draft: { tone: "info", text: "قيد التعبئة" },
  submitted: { tone: "warn", text: "سُلّمت — بانتظار تقديرك" },
  returned: { tone: "neutral", text: "أُعيدت للطالب" },
  approved: { tone: "success", text: "اعتُمدت" }
};

export const entryText = (list: ExamFormEntry[] | undefined, id: string) => (list || []).find(e => e.id === id)?.text || id;
