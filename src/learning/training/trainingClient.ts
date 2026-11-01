import type { Answer } from "../../StudentQuestionCard";
import type { ExamItemCheckResponse, ExamItemLoadResponse, TrainingClient, TrainingListResponse, TrainingLoadResponse, TrainingSubmitResponse } from "./types";

export class TrainingApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const BASE = "/api/learning-training";
const EXAM_ITEM_BASE = "/api/learning-exam-item";

/**
 * The learning-training transport for ONE actor: the host supplies the auth headers (student session token or the
 * teacher's builder token) and everything else — paths, JSON, error mapping — is identical for both. The browser
 * only ever sends `answers`; scores, percentages and points are computed and returned by the server.
 */
export function createTrainingClient(headers: Record<string, string>): TrainingClient {
  async function call<T extends { ok?: boolean }>(path: string, init: RequestInit = {}, base = BASE): Promise<T> {
    const h: Record<string, string> = { ...headers };
    if (init.body) h["Content-Type"] = "application/json";
    const r = await fetch(base + path, { ...init, headers: h });
    const j = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (!r.ok || !j.ok) throw new TrainingApiError(r.status, j.error || "حدث خطأ.");
    return j;
  }
  return {
    list: () => call<TrainingListResponse>(""),
    load: trainingId => call<TrainingLoadResponse>("/" + encodeURIComponent(trainingId)),
    submit: (trainingId: string, answers: Record<string, Answer>) =>
      call<TrainingSubmitResponse>("/" + encodeURIComponent(trainingId) + "/submit", { method: "POST", body: JSON.stringify({ answers }) }),
    // 791381s Phase 8C-2 — the advanced exam items (practice only; the server grades, nothing is persisted).
    examItems: {
      load: (courseId: string, itemId: string) => call<ExamItemLoadResponse>("/" + encodeURIComponent(courseId) + "/" + encodeURIComponent(itemId), {}, EXAM_ITEM_BASE),
      check: (courseId: string, itemId: string, answers: Record<string, Answer>) =>
        call<ExamItemCheckResponse>("/" + encodeURIComponent(courseId) + "/" + encodeURIComponent(itemId) + "/check", { method: "POST", body: JSON.stringify({ answers }) }, EXAM_ITEM_BASE),
    },
  };
}

/** Student headers (session token) — the same pair the portal uses everywhere. */
export const studentTrainingHeaders = (token: string) => ({ "x-student-token": token, Authorization: "Bearer " + token });
/** Teacher headers (builder token) — the same pair the platform's teacher API uses. */
export const teacherTrainingHeaders = (token: string) => ({ "x-builder-token": token, Authorization: "Bearer " + token });
