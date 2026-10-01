import type { StudentAttemptApi } from "../questionTypes/studentAttemptContext";
import type { CodeExecutionResult } from "../codingContract";
import type { CodingCapabilities, CodingExecutionService, CodingRunRequest } from "./codingExecution";

// Phase 17B — the browser client of the authenticated practice-execution routes (lazy: imported ONLY by the coding renderer).
//     GET  /api/coding/capabilities  → which language contracts the trusted runner offers right now
//     POST /api/coding/run           → one practice run of the student's current source with the chosen stdin
// Requests go through the exam page's attempt seam (the token never reaches this module). The body carries only
// { assignmentId, questionId, language, languageVersion, source, stdin }: the server derives limits from the published question,
// binds the request to it, and owns identity. A run never changes the Answer and is never a grade.
export type CodingRunFailure = Error & { code: string; retryAfterSeconds?: number };

const UNAVAILABLE: CodingCapabilities = { available: false, languages: [] };
const capabilitiesByRequest = new WeakMap<StudentAttemptApi["request"], Promise<CodingCapabilities>>();

const isLanguageList = (v: unknown): v is { key: string; languageVersion: number }[] =>
  Array.isArray(v) && v.every(l => !!l && typeof l === "object" && typeof (l as { key?: unknown }).key === "string" && Number.isInteger((l as { languageVersion?: unknown }).languageVersion));

/** The runner's current offer, fetched once per exam-page session (a failure is not cached, so a later mount can retry). */
export function loadCodingCapabilities(api: StudentAttemptApi): Promise<CodingCapabilities> {
  const cached = capabilitiesByRequest.get(api.request);
  if (cached) return cached;
  const pending = (async () => {
    const res = await api.request("/api/coding/capabilities", { method: "GET" });
    const body = (await res.json()) as { ok?: unknown; available?: unknown; languages?: unknown };
    if (!res.ok || body.ok !== true || body.available !== true || !isLanguageList(body.languages)) return UNAVAILABLE;
    return { available: true, languages: body.languages.map(l => ({ key: l.key, languageVersion: l.languageVersion })) };
  })().catch(() => { capabilitiesByRequest.delete(api.request); return UNAVAILABLE; });
  capabilitiesByRequest.set(api.request, pending);
  return pending;
}

const failure = (code: string, retryAfterSeconds?: number): CodingRunFailure => Object.assign(new Error(code), { code, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) });

/** A CodingExecutionService bound to ONE published question of the current assignment. */
export function createApiCodingService(api: StudentAttemptApi, questionId: string, capabilities: CodingCapabilities): CodingExecutionService {
  return {
    capabilities,
    async run(req: CodingRunRequest): Promise<CodeExecutionResult> {
      let res: Response;
      try {
        res = await api.request("/api/coding/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignmentId: api.assignmentId, questionId, language: req.language, languageVersion: req.languageVersion, source: req.source, stdin: req.stdin })
        });
      } catch { throw failure("NETWORK"); }
      let body: { ok?: unknown; code?: unknown; result?: unknown; retryAfterSeconds?: unknown } = {};
      try { body = await res.json(); } catch { body = {}; }
      if (res.ok && body.ok === true && body.result && typeof body.result === "object") return body.result as CodeExecutionResult;
      const retry = Number(body.retryAfterSeconds ?? res.headers.get("Retry-After"));
      throw failure(typeof body.code === "string" ? body.code : "EXECUTION_FAILED", Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : undefined);
    }
  };
}
