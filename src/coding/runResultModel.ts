import { compareOutput, type CodeExecutionResult } from "../codingContract";

// Phase 19F — the pure helpers of the practice-run result view (shared by the coding@1/@2 and coding@3 renderers).
export const sampleTitle = (t: { title?: string }, i: number) => t.title || "مثال " + (i + 1);
export const matchOf = (r: CodeExecutionResult | undefined, sample: string | undefined) =>
  !r || r.status !== "success" || sample === undefined ? "none" : compareOutput(r.stdout, sample, "trimTrailingWhitespace") ? "match" : "mismatch";
export const MATCH_TEXT = { match: "يطابق المخرجات النموذجية (للتدريب فقط)", mismatch: "لا يطابق المخرجات النموذجية (للتدريب فقط)" } as const;
