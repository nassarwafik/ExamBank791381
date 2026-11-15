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

/** Phase F4 — one image the student attached to a question. The server writes these references; the page never does. */
export type ExamFormImageRef = { id: string; width: number; height: number; bytes: number; addedAt?: string };

/** Phase F5 — the file the student attached to a file question. The server writes this reference; the page never does. */
export type ExamFormFileRef = { id: string; name: string; ext: string; bytes: number; addedAt?: string };

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
  /** Phase F4 — references to the images the student attached to this question (served by the API only). */
  images?: ExamFormImageRef[];
  /** Phase F5 — the reference to the file the student attached to this (file) question (served by the API only, as a download). */
  file?: ExamFormFileRef;
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
  status: ExamFormStatus;
  submittedAt: string;
  updatedAt: string;
  progress: ExamFormProgress;
  deferredKinds: string[];
  readOnly?: boolean;
  changed?: boolean;
  /** Phase F3 — a returned form: why the teacher sent it back. */
  returnNote?: string;
  /** Phase F3 — after the teacher's approval only: the mark and the ratings (never an answer key). */
  result?: ExamFormResult;
};

/** draft → submitted → (returned → submitted)* → approved. The student may write a draft and a returned form. */
export type ExamFormStatus = "draft" | "submitted" | "returned" | "approved";

export type ExamFormResult = {
  mark: number;
  outOf: number;
  approvedAt: string;
  generalNote: string;
  sections: { sectionId: string; level: number; topLevel: number; weight: number; points: number; levelLabel: string; note: string }[];
  /** For each auto-marked question: right, wrong, or not answered (null). */
  auto: Record<string, boolean | null>;
};

/** The few facts the project page shows on its form card (additive field of the student tracker response). */
export type ExamFormSummary = { title: string; state: "open" | "closed"; status: ExamFormStatus; started: boolean; answered: number; total: number; mark?: number; outOf?: number };
