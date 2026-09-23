// Live Challenge Generator — the teacher browser's thin transport. Two server surfaces, both teacher-authenticated
// (x-builder-token + Bearer, like App.tsx's apiRequest): the challenge store (/api/game-live-challenge) for
// save/load/list/delete, and the EXISTING saved-exams endpoint (/api/saved-exams) as a question SOURCE. A saved exam is
// either structured (sections[].questions[]) or legacy (questions[]); both are extracted by the ONE authoritative
// helper questionsFromSourceExam. Injectable so components/tests can pass a fake client.
import type { BuilderQuestion } from "../../examTypes";
import type { ChallengeDefinition, ChallengeSummary } from "../domain/challenge";
import { questionsFromSourceExam, type SourceExamStatus } from "./sourceExamQuestions";

export interface SourceExamListItem {
  blobName: string;
  examId: string;
  title: string;
  savedAt?: string;
  questionCount?: number;
  totalMarks?: number;
}
export interface SourceQuestions {
  title: string;
  questions: BuilderQuestion[];
  /** ok / genuinely empty / not a recognizable question structure (absent → derived from `questions`). */
  status?: SourceExamStatus;
  /** Entries skipped because they are not a supported canonical question. */
  skipped?: number;
}

export interface LiveChallengeClient {
  list(): Promise<ChallengeSummary[]>;
  get(challengeId: string): Promise<ChallengeDefinition | null>;
  save(def: ChallengeDefinition): Promise<{ ok: boolean; summary?: ChallengeSummary }>;
  remove(challengeId: string): Promise<{ ok: boolean }>;
  listSourceExams(): Promise<SourceExamListItem[]>;
  loadSourceQuestions(blobName: string): Promise<SourceQuestions>;
}

const BASE = "/api/game-live-challenge";

export function createLiveChallengeClient(token: string): LiveChallengeClient {
  const headers = { "x-builder-token": token, Authorization: "Bearer " + token, "content-type": "application/json" };
  const post = async (action: string, body: unknown) => {
    const r = await fetch(BASE + "/" + action, { method: "POST", headers, body: JSON.stringify(body) });
    return r.json();
  };
  return {
    async list() {
      const r = await fetch(BASE, { headers });
      const j = await r.json();
      return Array.isArray(j.challenges) ? j.challenges : [];
    },
    async get(challengeId) {
      const j = await post("get", { challengeId });
      return j && j.ok && j.challenge ? j.challenge : null;
    },
    async save(def) {
      const j = await post("save", { challenge: def });
      return { ok: !!(j && j.ok), summary: j && j.summary };
    },
    async remove(challengeId) {
      const j = await post("delete", { challengeId });
      return { ok: !!(j && j.ok) };
    },
    async listSourceExams() {
      const r = await fetch("/api/saved-exams", { headers });
      const j = await r.json();
      return Array.isArray(j.exams) ? j.exams : [];
    },
    async loadSourceQuestions(blobName) {
      const r = await fetch("/api/saved-exams", { method: "POST", headers, body: JSON.stringify({ action: "load", blobName }) });
      const j = await r.json();
      if (!r.ok || !j || !j.exam) throw new Error("saved exam not loaded");
      const got = questionsFromSourceExam(j.exam);
      return { title: String(j.exam.title || ""), questions: got.questions, status: got.status, skipped: got.skipped };
    },
  };
}
