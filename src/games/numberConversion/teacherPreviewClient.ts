// Number Conversion Challenge — the TEACHER PREVIEW transport. It satisfies the same `NumberConversionClient`
// interface the student transport does, so the teacher previews the SAME `NumberConversionGame` students play; only the
// transport differs: teacher/builder auth, a dedicated preview endpoint, and NO persistence. The server returns an
// opaque sealed continuation with each round step; it is kept only in this closure (memory) and sent back with the next
// answer. There is no resumable state and never a best record: `getState()` is always an empty home screen, and a
// refresh or leaving the preview simply discards the round. Never a student token, never the student endpoint.
import type { NumberConversionClient, GameState, AnswerResponse } from "./numberConversionClient";

export const TEACHER_PREVIEW_BASE = "/api/game-number-conversion-preview";

export function createNumberConversionTeacherPreviewClient(builderToken: string): NumberConversionClient {
  const headers = { "x-builder-token": builderToken, Authorization: "Bearer " + builderToken, "content-type": "application/json" };
  let continuation: string | null = null;   // in memory only — the sealed server continuation of the current preview round
  const post = async (action: string, body: unknown) => {
    const r = await fetch(TEACHER_PREVIEW_BASE + "/" + action, { method: "POST", headers, body: JSON.stringify(body) });
    return r.json();
  };
  return {
    async getState(): Promise<GameState> {
      continuation = null;   // nothing to resume: a preview is never persisted
      return { ok: true, active: null, best: null };
    },
    async start(path, level): Promise<GameState> {
      const r = await post("start", { path, level });
      continuation = typeof r?.continuation === "string" ? r.continuation : null;
      return { ok: !!r?.ok, active: r?.active ?? null, best: null };
    },
    async answer(taskId, bits, answer): Promise<AnswerResponse> {
      const r = await post("answer", { taskId, bits, answer, continuation });
      // A step that advanced the round carries a new continuation (null once the round is done); a format error or a
      // conflict carries none, so the current continuation is kept (a conflict then resyncs via getState, which clears it).
      if (r && typeof r === "object" && "continuation" in r) continuation = typeof r.continuation === "string" ? r.continuation : null;
      const out: AnswerResponse & { continuation?: unknown } = { ...(r || {}) };
      delete out.continuation;
      delete out.best;   // a preview never has a best record
      return out;
    },
  };
}
