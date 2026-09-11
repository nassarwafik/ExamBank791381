// Type declarations for the pure CommonJS grader so the frontend structured-builder tests can import
// the authoritative implementation under strict TypeScript without any suppressions. Runtime behaviour
// is defined in assignment-grading.js; this only describes its public shape.

export type QuestionGrade = {
  questionId: string;
  questionNumber: number;
  sectionId?: string;
  score: number;
  maxMarks: number;
  countedMaxMarks?: number;
  correct: boolean;
  manualReview: boolean;
  ignored?: boolean;
  parts?: Array<Record<string, unknown>> | null;
};

export type ExamGrade = {
  score: number;
  totalMarks: number;
  percentage: number;
  manualReviewMarks: number;
  finalized: boolean;
  questions: QuestionGrade[];
  sections?: Array<Record<string, unknown>>;
};

export function gradeExam(exam: unknown, answers: Record<string, unknown>): ExamGrade;
export function gradeQuestion(question: unknown, response: unknown): Record<string, unknown>;
export function gradeFields(question: unknown, response: unknown, max: number): Record<string, unknown>;
export function gradeCompound(question: unknown, response: unknown): Record<string, unknown>;
export function matchField(got: unknown, correct: unknown): boolean;
