import type { CodeExecutionResult } from "../codingContract";

// Phase T14 — the transport of the tool bar's «محرر C#»: ONE run of the learner's code through POST /api/student-tools/csharp-run.
// The host (the exam page, the book reader) creates it with its own auth; the browser sends only the code, the input and WHERE it
// runs (this exam / this book). Who may run, the wrapper, the language and the limits are the server's. Nothing is stored or graded.
// Light on purpose (no React): the hosts import it in their first-load graph.

export type CSharpToolRunner = {
  /** "exam" → the dock applies the exam rule (csharpRunAllowedInExam); "book" → the book rule. The server checks it again. */
  context: "exam" | "book";
  run(source: string, stdin: string, signal?: AbortSignal): Promise<CodeExecutionResult>;
};

/** A refused or failed run: the server's Arabic message (or a fixed one), its code, and the wait it asks for. */
export class CSharpToolRunError extends Error {
  code: string; retryAfterSeconds?: number;
  constructor(code: string, message: string, retryAfterSeconds?: number) { super(message); this.code = code; this.retryAfterSeconds = retryAfterSeconds; }
}

const PATH = "/api/student-tools/csharp-run";
type Send = (init: RequestInit) => Promise<Response>;

function runnerOf(context: "exam" | "book", target: Record<string, string>, send: Send): CSharpToolRunner {
  return {
    context,
    async run(source, stdin, signal) {
      let res: Response;
      try { res = await send({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context, ...target, source, stdin }), signal }); }
      catch { throw new CSharpToolRunError(signal?.aborted ? "ABORTED" : "NETWORK", "تعذّر الاتصال بالخادم. تحقّق من الاتصال وحاول مرة أخرى."); }
      let body: { ok?: unknown; code?: unknown; error?: unknown; result?: unknown; retryAfterSeconds?: unknown } = {};
      try { body = await res.json(); } catch { body = {}; }
      if (res.ok && body.ok === true && body.result && typeof body.result === "object") return body.result as CodeExecutionResult;
      const retry = Number(body.retryAfterSeconds ?? res.headers.get("Retry-After"));
      throw new CSharpToolRunError(typeof body.code === "string" ? body.code : "EXECUTION_FAILED",
        typeof body.error === "string" && body.error ? body.error : "تعذّر تشغيل الكود الآن. حاول مرة أخرى.",
        Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : undefined);
    }
  };
}

/** The exam page: its attempt request seam (it adds the student token) and the assignment. */
export function examCSharpRunner(request: (path: string, init?: RequestInit) => Promise<Response>, assignmentId: string): CSharpToolRunner {
  return runnerOf("exam", { assignmentId }, init => request(PATH, init));
}

/** The book reader: the session's auth headers (the Reader's `codeRun` access) and the course. */
export function bookCSharpRunner(headers: Record<string, string>, courseId: string): CSharpToolRunner {
  return runnerOf("book", { courseId }, init => fetch(PATH, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } }));
}
