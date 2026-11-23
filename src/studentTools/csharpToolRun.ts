import type { CodeExecutionResult } from "../codingContract";

// Phase T14 — the transport of the tool bar's «محرر C#»: ONE run of the learner's code through POST /api/student-tools/csharp-run.
// BOOKS ONLY (owner decision): the book reader creates it with its session auth; an exam page never does, so in an exam the editor is a
// writing aid only. The browser sends only the code, the input and the book. Who may run, the wrapper, the language and the limits are the server's. Nothing is stored or graded.
// Light on purpose (no React): the hosts import it in their first-load graph.

export type CSharpToolRunner = {
  run(source: string, stdin: string, signal?: AbortSignal): Promise<CodeExecutionResult>;
  /** Whether the runner can run C# right now (GET on the same path). Presentation only: true when the answer cannot be read, so
   *  the server — which checks every run — has the last word. */
  available(): Promise<boolean>;
  /** Teacher C# lab V1 (csharpLab.ts): "lab" = the program runs in this browser, not on the Runner (the editor says so). */
  mode?: "runner" | "lab";
  /** The run's time limit in seconds, for the editor's time-out message (absent: the Runner's 2 s). */
  timeoutSeconds?: number;
};

/** A refused or failed run: the server's Arabic message (or a fixed one), its code, and the wait it asks for. */
export class CSharpToolRunError extends Error {
  code: string; retryAfterSeconds?: number;
  constructor(code: string, message: string, retryAfterSeconds?: number) { super(message); this.code = code; this.retryAfterSeconds = retryAfterSeconds; }
}

const PATH = "/api/student-tools/csharp-run";
type Send = (init: RequestInit) => Promise<Response>;

function runnerOf(target: Record<string, string>, send: Send): CSharpToolRunner {
  return {
    async available() {
      try {
        const res = await send({ method: "GET" });
        const body = (await res.json()) as { ok?: unknown; available?: unknown };
        return !(res.ok && body.ok === true && body.available === false);
      } catch { return true; }
    },
    async run(source, stdin, signal) {
      let res: Response;
      try { res = await send({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: "book", ...target, source, stdin }), signal }); }
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

/** The book reader: the session's auth headers (the Reader's `codeRun` access) and the course. */
export function bookCSharpRunner(headers: Record<string, string>, courseId: string): CSharpToolRunner {
  return runnerOf({ courseId }, init => fetch(PATH, { ...init, headers: { ...headers, ...((init.headers as Record<string, string> | undefined) || {}) } }));
}
