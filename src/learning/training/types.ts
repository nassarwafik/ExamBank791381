import type { Answer, Question } from "../../StudentQuestionCard";

/** A student's persisted best result for one training (server-computed; the browser never derives points). */
export type TrainingBest = {
  bestPercentage: number;
  bestPoints: number;
  maxPoints: number;
  attempts: number;
  lastCompletedAt: string | null;
};

/** One row of `GET /api/learning-training` — a training's metadata plus the caller's availability/best result.
 *  `title` is present ONLY when the training is available to the caller (disclosure rule). */
export type TrainingListEntry = {
  trainingId: string;
  order: number;
  label: string;
  requiredModuleId: string;
  courseId: string;
  available: boolean;
  /** Server policy: EVERY canonical Learning-Practice item (T01–T30 and F01–F06) feeds Unified Strength with the same
   *  ceiling (maxPoints 40). The flag is kept in the contract for an unknown id (false, maxPoints 0); older responses
   *  without it are treated as eligible. */
  strengthEligible?: boolean;
  title?: string;
  best?: TrainingBest;
};
export type TrainingListResponse = { ok: true; actor: "teacher" | "student"; trainings: TrainingListEntry[] };

/** `GET /api/learning-training/{id}` — the sanitized exam (no answers/hints) plus the training metadata. */
export type TrainingLoadResponse = {
  ok: true;
  actor: "teacher" | "student";
  training: TrainingListEntry & { title: string; questionCount: number; totalMarks: number; maxPoints: number };
  exam: { examId?: string; title?: string; questions: Question[]; totalMarks?: number };
  best?: TrainingBest;
};

/** One graded question as returned by the server AFTER submission (the only moment answer keys reach the browser). */
export type TrainingReviewRow = {
  questionId: string;
  questionNumber: number;
  correct: boolean;
  /** The server's grader could not auto-grade this question (e.g. an open question of a final exam). */
  manualReview?: boolean;
  chosenIndex: number | null;
  correctOptionIndex: number | null;
  /** Post-submit key of a non-choice question (matching / table pairs) as the item's own answer text. */
  correctText?: string;
  hint: string;
};
export type TrainingResult = {
  correctCount: number;
  questionCount: number;
  score: number;
  totalMarks: number;
  percentage: number;
  review: TrainingReviewRow[];
};
export type TrainingSubmitResponse = {
  ok: true;
  actor: "teacher" | "student";
  persisted: boolean;
  result: TrainingResult;
  /** Student only: the persisted best after the max-merge (retries never lower it). */
  practice?: TrainingBest & { improved: boolean; pointsGained: number; earnedPoints: number };
};

/** The transport a host injects into the runner/host seam. Both actors use the SAME client shape. */
export interface TrainingClient {
  list(): Promise<TrainingListResponse>;
  load(trainingId: string): Promise<TrainingLoadResponse>;
  submit(trainingId: string, answers: Record<string, Answer>): Promise<TrainingSubmitResponse>;
  /** 791381s Phase 8C-2 — the advanced exam items, over the same auth headers. Absent → exam-item cards stay static. */
  examItems?: ExamItemClient;
}

/** What the Reader shows on a `library-training` block: decided by the HOST, never by the content. */
export type TrainingStatus =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unavailable" }
  | { kind: "available"; title: string; best: TrainingBest | null };

/** The Reader's injection seam for trainings. Absent → the block renders a generic, non-interactive label card. */
export interface LibraryTrainingHost {
  status(trainingId: string): TrainingStatus;
  onOpen(trainingId: string): void;
  onRetry?(): void;
}

// ── 791381s Phase 8C-2 — the learning book's ADVANCED exam items (GET / POST /api/learning-exam-item/{course}/{item}) ──────────────
/** `GET` — the card metadata and the SANITIZED exam (the platform's student projection: no key, no explanation). */
export type ExamItemLoadResponse = {
  ok: true;
  actor: "teacher" | "student";
  item: { itemId: string; label: string; moduleId: string; questionCount: number; totalMarks: number };
  exam: { sections?: { id: string; questions: Question[] }[]; questions?: Question[] };
};
/** One question as the official grader judged it (after an answer only — never a key). */
export type ExamItemQuestionResult = { questionId: string; answered: boolean; correct: boolean; manualReview: boolean; score: number; maxMarks: number; parts?: { correct: number; total: number }; explanation?: string };
/** `POST …/check` — practice only (`persisted: false`). */
/** 791381s Phase 8D — the item as a STUDY activity (present when the item is in the course's study index): completed only with
 *  full marks; `revealedBefore` when a wrong answer showed the explanation first (answered, never counted). */
export type ExamItemStudy = { counted: true; completed: boolean; persisted: boolean; alreadyCompleted?: boolean; revealedBefore?: boolean; gained: number; module?: { completed: number; eligible: number; points: number; max: number } | null; totalPoints?: number };
/** `POST …/check` — practice: never an exam record or a grade; a student's full marks may complete the study activity. */
export type ExamItemCheckResponse = { ok: true; actor: "teacher" | "student"; persisted: boolean; result: { score: number; totalMarks: number; percentage: number; questions: ExamItemQuestionResult[] }; study?: ExamItemStudy };
/** The transport of the exam items, built from the SAME auth headers as the trainings (student session / teacher builder). */
export interface ExamItemClient {
  load(courseId: string, itemId: string): Promise<ExamItemLoadResponse>;
  check(courseId: string, itemId: string, answers: Record<string, Answer>): Promise<ExamItemCheckResponse>;
}
/** The Reader's seam for `exam-item` blocks: the course is the host's. Absent → a static card (no network). */
export interface ExamItemHost {
  load(itemId: string): Promise<ExamItemLoadResponse>;
  check(itemId: string, answers: Record<string, Answer>): Promise<ExamItemCheckResponse>;
}
