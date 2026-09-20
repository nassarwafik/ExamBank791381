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
