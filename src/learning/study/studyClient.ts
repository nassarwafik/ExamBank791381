import type { StudyClient, StudyStateResponse, StudyAttemptResponse } from "./types";

export class StudyApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const BASE = "/api/learning-study";

/**
 * The learning-study transport for ONE actor (the host supplies the auth headers). The browser only ever sends the
 * learner's response; correctness, points and completion are decided and returned by the server.
 */
export function createStudyClient(headers: Record<string, string>): StudyClient {
  async function call<T extends { ok?: boolean }>(path: string, init: RequestInit = {}): Promise<T> {
    const h: Record<string, string> = { ...headers };
    if (init.body) h["Content-Type"] = "application/json";
    const r = await fetch(BASE + path, { ...init, headers: h });
    const j = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (!r.ok || !j.ok) throw new StudyApiError(r.status, j.error || "حدث خطأ.");
    return j;
  }
  return {
    state: courseId => call<StudyStateResponse>("/" + encodeURIComponent(courseId)),
    attempt: (courseId, pageId, activityId, response) =>
      call<StudyAttemptResponse>("/" + encodeURIComponent(courseId) + "/attempt", { method: "POST", body: JSON.stringify({ pageId, activityId, response }) }),
  };
}
