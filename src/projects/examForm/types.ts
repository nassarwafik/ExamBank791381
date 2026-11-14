// Phase F2-UI — the student's view of a project exam form, exactly as /api/student-project-exam-form returns it. The page
// never sees an answer key: the server sends the questions through its allow-list projection.

export type ExamFormEntry = { id: string; text: string };

export type ExamFormQuestionKind =
  | "shortText" | "paragraph" | "cli" | "table" | "image" | "file"
  | "choice" | "multiChoice" | "matching" | "ordering" | "scale" | "checklist" | "declaration";

export type ExamFormQuestion = {
  questionId: string;
  prompt: string;
  kind: ExamFormQuestionKind;
  grading: "auto" | "teacher" | "none";
  required: boolean;
  help?: string;
  maxLength?: number;
  columns?: { id: string; title: string }[];
  minRows?: number;
  maxRows?: number;
  options?: ExamFormEntry[];
  justification?: boolean;
  left?: ExamFormEntry[];
  right?: ExamFormEntry[];
  items?: ExamFormEntry[];
  min?: number;
  max?: number;
  images?: { min: number; max: number };
  accept?: string[];
};

export type ExamFormSection = { sectionId: string; title: string; order: number; questions: ExamFormQuestion[] };

/** One stored answer. Which fields it carries depends on the question's kind. */
export type ExamFormAnswer = {
  text?: string;
  rows?: Record<string, string>[];
  optionId?: string | null;
  justification?: string;
  optionIds?: string[];
  pairs?: Record<string, string>;
  order?: string[];
  values?: Record<string, number>;
  checked?: string[];
  accepted?: boolean;
};

export type ExamFormAnswers = Record<string, ExamFormAnswer>;
export type ExamFormProgress = { total: number; answered: number; deferred: number; missing: string[] };

export type ExamFormView = {
  ok: true;
  projectCode: string;
  available: true;
  state: "open" | "closed";
  form: { projectCode: string; formVersion: number; title: string; sections: ExamFormSection[] };
  answers: ExamFormAnswers;
  revision: number;
  status: "draft" | "submitted";
  submittedAt: string;
  updatedAt: string;
  progress: ExamFormProgress;
  deferredKinds: string[];
  readOnly?: boolean;
  changed?: boolean;
};

/** The few facts the project page shows on its form card (additive field of the student tracker response). */
export type ExamFormSummary = { title: string; state: "open" | "closed"; status: "draft" | "submitted"; started: boolean; answered: number; total: number };
