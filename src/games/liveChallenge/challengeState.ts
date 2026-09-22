// Live Challenge — pure authoring-state operations over a ChallengeDefinition. No IO, no React, deterministic.
//
// Every question added to a challenge is an IMMUTABLE SNAPSHOT: it is deep-cloned with fresh ids through the canonical
// cloneQuestionWithNewIds helper, so a challenge never stays dynamically linked to the source Exam/Training/Bank
// question (editing the source later cannot change an authored challenge, and editing the challenge copy cannot change
// the source). New manual questions come from the canonical newQuestion constructor. There is no second question model
// and no transform layer — the snapshot IS a canonical BuilderQuestion.

import type { BuilderQuestion, BuilderQuestionType } from "../../examTypes";
import { newQuestion, cloneQuestionWithNewIds, genId } from "../../examBuilderState";
import {
  CHALLENGE_SCHEMA_VERSION, CHALLENGE_COURSE_ID,
  type ChallengeDefinition, type ChallengeQuestion, type ChallengeQuestionSource, type ChallengeSummary,
} from "../domain/challenge";

/** A fresh, empty Challenge Definition. */
export function newChallengeDefinition(opts: { challengeId?: string; title?: string; now?: string } = {}): ChallengeDefinition {
  const now = opts.now || new Date().toISOString();
  return {
    schemaVersion: CHALLENGE_SCHEMA_VERSION,
    challengeId: opts.challengeId || genId("challenge"),
    title: opts.title ?? "",
    courseId: CHALLENGE_COURSE_ID,
    questions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** An immutable snapshot of a canonical question for a challenge: deep-cloned with fresh ids + a source tag. */
export function snapshotQuestion(question: BuilderQuestion, source: ChallengeQuestionSource): ChallengeQuestion {
  return { question: cloneQuestionWithNewIds(question), source };
}

const touch = (def: ChallengeDefinition, questions: ChallengeQuestion[], now?: string): ChallengeDefinition =>
  ({ ...def, questions, updatedAt: now || new Date().toISOString() });

const indexOf = (def: ChallengeDefinition, id: string) => def.questions.findIndex(cq => cq.question.examQuestionId === id);

/** Rename the challenge. */
export function setChallengeTitle(def: ChallengeDefinition, title: string, now?: string): ChallengeDefinition {
  return { ...def, title, updatedAt: now || new Date().toISOString() };
}

/** Append a brand-new manual question of the given canonical type. */
export function addManualQuestion(def: ChallengeDefinition, type: BuilderQuestionType = "multipleChoice", now?: string): ChallengeDefinition {
  const cq: ChallengeQuestion = { question: newQuestion(type), source: { kind: "manual" } };
  return touch(def, [...def.questions, cq], now);
}

/** Append immutable snapshots of imported source questions (each deep-cloned; the sources are never referenced again). */
export function addImportedQuestions(def: ChallengeDefinition, items: { question: BuilderQuestion; source: ChallengeQuestionSource }[], now?: string): ChallengeDefinition {
  const snaps = items.map(it => snapshotQuestion(it.question, it.source));
  return touch(def, [...def.questions, ...snaps], now);
}

/** Merge a content patch into one challenge question's snapshot (the composer's onChange payload). */
export function updateChallengeQuestion(def: ChallengeDefinition, id: string, patch: Partial<BuilderQuestion>, now?: string): ChallengeDefinition {
  const i = indexOf(def, id);
  if (i < 0) return def;
  const next = def.questions.map((cq, k) => (k === i ? { ...cq, question: { ...cq.question, ...patch } } : cq));
  return touch(def, next, now);
}

/** Duplicate a challenge question (fresh ids) and insert the copy immediately after the original. */
export function duplicateChallengeQuestion(def: ChallengeDefinition, id: string, now?: string): ChallengeDefinition {
  const i = indexOf(def, id);
  if (i < 0) return def;
  const src = def.questions[i];
  const copy: ChallengeQuestion = { question: cloneQuestionWithNewIds(src.question), source: src.source };
  const next = [...def.questions.slice(0, i + 1), copy, ...def.questions.slice(i + 1)];
  return touch(def, next, now);
}

/** Remove a challenge question. */
export function removeChallengeQuestion(def: ChallengeDefinition, id: string, now?: string): ChallengeDefinition {
  const i = indexOf(def, id);
  if (i < 0) return def;
  return touch(def, def.questions.filter((_, k) => k !== i), now);
}

/** Move a challenge question by delta (−1 up, +1 down); clamped, order otherwise preserved. */
export function moveChallengeQuestion(def: ChallengeDefinition, id: string, delta: number, now?: string): ChallengeDefinition {
  const i = indexOf(def, id);
  if (i < 0) return def;
  const j = Math.max(0, Math.min(def.questions.length - 1, i + delta));
  if (j === i) return def;
  const next = def.questions.slice();
  const [moved] = next.splice(i, 1);
  next.splice(j, 0, moved);
  return touch(def, next, now);
}

/** A well-formed Challenge Definition from whatever is stored/loaded (missing/malformed → safe empty-ish shape). */
export function normalizeChallengeDefinition(raw: unknown): ChallengeDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ChallengeDefinition>;
  if (typeof r.challengeId !== "string" || !r.challengeId) return null;
  const questions = Array.isArray(r.questions)
    ? r.questions.filter((cq): cq is ChallengeQuestion =>
        !!cq && typeof cq === "object" && !!(cq as ChallengeQuestion).question && typeof (cq as ChallengeQuestion).question === "object"
        && typeof (cq as ChallengeQuestion).question.examQuestionId === "string")
      .map(cq => ({
        question: cq.question,
        source: (cq.source && typeof cq.source === "object" && typeof (cq.source as ChallengeQuestionSource).kind === "string")
          ? cq.source : ({ kind: "manual" } as ChallengeQuestionSource),
      }))
    : [];
  return {
    schemaVersion: CHALLENGE_SCHEMA_VERSION,
    challengeId: r.challengeId,
    title: typeof r.title === "string" ? r.title : "",
    courseId: typeof r.courseId === "string" && r.courseId ? r.courseId : CHALLENGE_COURSE_ID,
    questions,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
  };
}

/** A client-safe summary (no question content) for a saved-challenges list. */
export function challengeSummary(def: ChallengeDefinition): ChallengeSummary {
  return { challengeId: def.challengeId, title: def.title, questionCount: def.questions.length, updatedAt: def.updatedAt };
}
