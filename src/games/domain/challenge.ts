// Educational Games — Live Challenge domain vocabulary (Phase 3B: challenge AUTHORING only).
//
// A Challenge Definition is an ordered list of IMMUTABLE question snapshots the teacher authors ahead of a later live
// session. The playable content is the canonical `BuilderQuestion` (the SAME model the Structured Exam Builder edits —
// there is no second question model and no transform layer); a challenge question only wraps that snapshot with light
// source metadata for traceability. This file is pure vocabulary + tiny constants, like domain/types.ts and
// examTypes.ts — it deliberately models NOTHING about the live session (players, lobby, join code, broadcast, answers,
// rankings, reconnect); those belong to later phases and never appear on a Challenge Definition.

import type { BuilderQuestion } from "../../examTypes";

export const CHALLENGE_SCHEMA_VERSION = 1;
/** Games target the core course material only (see the games scope) — a challenge is pinned to this course. */
export const CHALLENGE_COURSE_ID = "791381";

/** Where a snapshotted challenge question originally came from — traceability only; the playable content is the snapshot. */
export type ChallengeQuestionSource =
  | { kind: "manual" }
  | { kind: "exam"; sourceId?: string; sourceTitle?: string }
  | { kind: "training"; sourceId?: string; sourceTitle?: string }
  | { kind: "bank"; sourceId?: string; sourceTitle?: string };

/** The Arabic label for a source kind (display only). */
export const CHALLENGE_SOURCE_LABELS: Record<ChallengeQuestionSource["kind"], string> = {
  manual: "سؤال جديد",
  exam: "من امتحان",
  training: "من تدريب",
  bank: "من بنك الأسئلة",
};

/**
 * One entry in a challenge: the immutable canonical question snapshot plus its source tag. Identity is the snapshot's
 * own `question.examQuestionId` (stable, unique per snapshot) — no second id is introduced.
 */
export interface ChallengeQuestion {
  question: BuilderQuestion;
  source: ChallengeQuestionSource;
}

/**
 * A saved, authoring-time Challenge Definition. Minimal identity/metadata + the ordered immutable question snapshots.
 * NO live-runtime state (players, sockets, lobby, live answers, rankings, current-question broadcast, reconnect).
 */
export interface ChallengeDefinition {
  schemaVersion: number;
  challengeId: string;
  title: string;
  courseId: string;
  questions: ChallengeQuestion[];
  createdAt?: string;
  updatedAt?: string;
}

/** A client-safe summary for a saved-challenges list (no question content). */
export interface ChallengeSummary {
  challengeId: string;
  title: string;
  questionCount: number;
  updatedAt?: string;
}
