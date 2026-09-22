// Live Challenge Generator — the teacher browser's thin transport. Two server surfaces, both teacher-authenticated
// (x-builder-token + Bearer, like App.tsx's apiRequest): the challenge store (/api/game-live-challenge) for
// save/load/list/delete, and the EXISTING saved-exams endpoint (/api/saved-exams) as a question SOURCE — its
// structured exams already hold canonical BuilderQuestion objects in sections[].questions[], so importing needs no
// transform. Injectable so components/tests can pass a fake client.
import type { BuilderQuestion } from "../../examTypes";
import type { ChallengeDefinition, ChallengeSummary } from "../domain/challenge";

export interface SourceExamListItem {
  blobName: string;
  examId: string;
  title: string;
  savedAt?: string;
  questionCount?: number;
}
export interface SourceQuestions {
  title: string;
  questions: BuilderQuestion[];
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

/** Flatten a saved STRUCTURED exam into its canonical BuilderQuestions (sections[].questions[]); ignore non-structured. */
export function flattenExamQuestions(exam: unknown): BuilderQuestion[] {
  const e = exam as { sections?: { questions?: BuilderQuestion[] }[] } | null;
  if (!e || !Array.isArray(e.sections)) return [];
  const out: BuilderQuestion[] = [];
  for (const s of e.sections) {
    if (Array.isArray(s?.questions)) {
      for (const q of s.questions) if (q && typeof q === "object" && typeof (q as BuilderQuestion).presentationType === "string") out.push(q);
    }
  }
  return out;
}

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
      return { title: String(j?.exam?.title || ""), questions: flattenExamQuestions(j?.exam) };
    },
  };
}
