// 899371 P8 (docs/enterprise-899371-learning-plan.md §21) — the «جرّب الكود» transport for ONE actor (the host supplies the auth
// headers). The browser sends only the learner's code and input; who may run, what runs, the wrapper, the language and the limits
// are the server's. Nothing is stored: there is no grade, attempt or record behind a run.
import type { CodeExecutionResult } from "../../codingContract";

export type RunBlocksResponse = { ok: true; actor: "student" | "teacher"; available: boolean; blocks: Record<string, string[]> };
export type RunResponse = { ok: true; result: CodeExecutionResult };
/** What a host hands the Reader: the session's auth headers only. The transport itself is created inside the lazy C# panel, so this
 *  module never joins the Reader's first-load graph (budget 40 KB). One object per session (the host memoizes it). */
export type CodeRunAccess = { headers: Record<string, string> };
export type CodeRunClient = {
  blocks(courseId: string): Promise<RunBlocksResponse>;
  run(courseId: string, pageId: string, blockId: string, source: string, stdin: string): Promise<RunResponse>;
};

/** A refused run: the server's Arabic message, its code, and whether trying again later can help. */
export class CodeRunError extends Error {
  status: number; code: string; retryable: boolean; retryAfterSeconds?: number;
  constructor(status: number, code: string, message: string, retryable: boolean, retryAfterSeconds?: number) {
    super(message); this.status = status; this.code = code; this.retryable = retryable; this.retryAfterSeconds = retryAfterSeconds;
  }
}

const BASE = "/api/learning-run/";

export function createCodeRunClient(headers: Record<string, string>): CodeRunClient {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const h: Record<string, string> = { ...headers };
    if (init.body) h["Content-Type"] = "application/json";
    let r: Response;
    try { r = await fetch(BASE + path, { ...init, headers: h }); }
    catch { throw new CodeRunError(0, "NETWORK", "تعذّر الاتصال بالخادم. تحقّق من الاتصال وحاول مرة أخرى.", true); }
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string; retryable?: boolean; retryAfterSeconds?: number };
    if (!r.ok || j.ok !== true) throw new CodeRunError(r.status, j.code || "FAILED", j.error || "تعذّر تشغيل الكود الآن.", j.retryable === true || r.status === 429, j.retryAfterSeconds);
    return j as T;
  }
  return {
    blocks: courseId => call<RunBlocksResponse>(encodeURIComponent(courseId)),
    run: (courseId, pageId, blockId, source, stdin) =>
      call<RunResponse>(encodeURIComponent(courseId) + "/run", { method: "POST", body: JSON.stringify({ pageId, blockId, source, stdin }) }),
  };
}
