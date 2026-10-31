import type { StudyActivityKey } from "./eligibility";

/** The learner's response to one eligible in-page exercise — the ONLY thing the browser sends; the server judges it. */
export type StudyResponse =
  | { kind: "multipleChoice"; optionId: string }
  | { kind: "trueFalse"; value: boolean }
  | { kind: "shortInput"; text: string }
  | { kind: "practice-table"; choices: Record<string, string> }
  | { kind: "wordBank"; choices: Record<string, string> }
  | { kind: "matching"; choices: Record<string, string> }
  | { kind: "ordering"; order: string[] }
  | { kind: "classify"; choices: Record<string, string> };

/** The server's study policy: each module is worth up to `modulePointsMax` (20) = round(completed / eligible × 20). */
export type StudyPolicy = { modulePointsMax: number; moduleCount: number };
/** A page's completion state: the completed eligible activity ids and how many eligible activities the page carries. */
export type StudyPageState = { moduleId: string; completed: string[]; eligible: number };
/** A module's Strength: uniquely completed / eligible activities → points (≤ max = 20). */
export type StudyModuleState = { completed: number; eligible: number; points: number; max: number };

/** `GET /api/learning-study/{courseId}` */
export type StudyStateResponse = {
  ok: true; actor: "teacher" | "student"; courseId: string; policy: StudyPolicy;
  pages: Record<string, StudyPageState>; modules: Record<string, StudyModuleState>; totalPoints: number;
};
/** `POST /api/learning-study/{courseId}/attempt` — the server's verdict and the derived state after it. */
export type StudyAttemptResponse = {
  ok: true; actor: "teacher" | "student"; correct: boolean; persisted: boolean; alreadyCompleted: boolean;
  /** The ACTUAL Study Strength gained by THIS completion — the server's study total after minus before through the
   *  module formula round(completed / eligible × 20) (0 for a repeat, and 0 when one more completion does not move the
   *  rounded module value yet). Never a page delta. */
  gained: number;
  page: { pageId: string; moduleId: string; completed: string[]; eligible: number };
  module: StudyModuleState; totalPoints: number;
  /** L.6b — false for a self-check block (judged and answered, never recorded). */
  study?: boolean;
  /** L.6b — only what THIS answer earns: right → the right message and the explanation; wrong → the wrong message and the hints. */
  feedback?: StudyFeedback;
  /** L.6b — a practice-table: for every answered cell ("row:col"), whether its choice is right. */
  cells?: Record<string, boolean>;
  /** 791381s Phase 3 — a structured question: for every answered part (blank / left item / item), whether it is right. */
  parts?: Record<string, boolean>;
  /** 791381s Phase 2 — a REVEAL block: the right answer, sent with the verdict on an answer (never before one). */
  reveal?: StudyReveal;
  /** 791381s Phase 2 — a right answer AFTER the right answer was shown (a wrong answer came first): judged, never recorded. */
  revealedBefore?: boolean;
};
/** The right answer of a reveal block, as the server sends it after an answer. */
export type StudyReveal =
  | { kind: "multipleChoice"; optionIds: string[] }
  | { kind: "trueFalse"; answer: boolean }
  | { kind: "wordBank"; answers: Record<string, string> }
  | { kind: "matching"; pairs: Record<string, string> }
  | { kind: "ordering"; order: string[] }
  | { kind: "classify"; assign: Record<string, string> };
export type StudyFeedback = { message?: string; explanation?: string; hints?: string[] };

export interface StudyClient {
  state(courseId: string): Promise<StudyStateResponse>;
  attempt(courseId: string, pageId: string, activityId: string, response: StudyResponse): Promise<StudyAttemptResponse>;
}

/** What a page / an exercise sees of the host: the current page state and one way to report a correct answer. */
export type StudyPageStatus =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; completed: ReadonlySet<string>; eligible: number; module: StudyModuleState | null };
export interface StudyHost {
  /** The current status of a page (the host reads the state once per mount and updates it from each attempt). */
  pageStatus(pageId: string): StudyPageStatus;
  /** Send an answer: EVERY answer of a served block (L.6b: no key in the browser), or a locally-right answer of an authored one.
   *  Resolves with the SERVER's verdict and feedback. Rejects on transport failure. */
  report(pageId: string, activityId: string, response: StudyResponse): Promise<StudyAttemptResponse>;
}
export type { StudyActivityKey };
