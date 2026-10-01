// Phase 17A — the coding EXECUTION and COMPARISON contracts (pure; compiled into the shared server build). Nothing here runs,
// compiles, evaluates or imports student code: it defines what a future trusted, ISOLATED execution provider (Phase 17B) is
// asked and what it may answer, and how an official grader will compare outputs.
//
// Trust boundary (documented in docs/enterprise-coding-assessment-17a.md):
//   SmartAssess API ──(authenticated, minimal request)──▶ Execution Gateway ──▶ Isolated Worker
// The worker is UNTRUSTED with respect to the application: it never receives identity, tokens, the exam or other answers, it
// never decides a grade, and anything it returns is bounded and re-labelled here before the application looks at it.
// Student code is never promised internet access, DNS, HTTP, or package installation (npm / pip / NuGet / Maven / apt).
import { CODE_SOURCE_MAX_BYTES, CODING_COMPARATORS, CODING_LANGUAGE_KEY_PATTERN, CODING_LIMIT_RANGES, CODING_TEST_LIMITS, codingLanguage, utf8ByteLength, type CodingComparator } from "./codingQuestion";

// ── Output comparison (pure, deterministic; no fuzzy / AI comparison) ─────────────────────────────────────────────────
//   exact                   byte-for-byte equality of the two strings.
//   trimTrailingWhitespace  CRLF / CR → LF; spaces and tabs at the END of every line removed; trailing newlines at the end
//                           of the output removed. Internal spaces, leading indentation and internal blank lines are KEPT.
//   normalizeWhitespace     (explicit opt-in) every run of whitespace (spaces, tabs, newlines) → one space, then trimmed.
export function normalizeOutput(s: string, mode: CodingComparator): string {
  if (mode === "exact") return s;
  if (mode === "trimTrailingWhitespace") return s.replace(/\r\n?/g, "\n").split("\n").map(line => line.replace(/[ \t]+$/, "")).join("\n").replace(/\n+$/, "");
  return s.replace(/\s+/g, " ").trim();
}
export function compareOutput(actual: string, expected: string, mode: CodingComparator): boolean {
  if (typeof actual !== "string" || typeof expected !== "string" || !CODING_COMPARATORS.includes(mode)) return false;
  return normalizeOutput(actual, mode) === normalizeOutput(expected, mode);
}

// ── Execution contract ────────────────────────────────────────────────────────────────────────────────────────────────
export type CodeExecutionStatus = "success" | "compile-error" | "runtime-error" | "timeout" | "output-limit" | "internal-error";
export const CODE_EXECUTION_STATUSES: readonly CodeExecutionStatus[] = Object.freeze(["success", "compile-error", "runtime-error", "timeout", "output-limit", "internal-error"]);
export type CodeExecutionResult = { status: CodeExecutionStatus; stdout: string; stderr: string; exitCode?: number; durationMs?: number; memoryKb?: number };
export type CodingTestResult = { testId: string; status: CodeExecutionStatus; passed: boolean; output?: string; durationMs?: number };
/** What an execution provider may be asked for: the runner never sees a source-size limit (it receives the bounded source). */
export type CodingExecutionLimits = { timeMs: number; memoryMb: number; outputBytes: number };
/** The MINIMUM data a runner receives — never student / teacher identity, class, auth token, the exam, other answers, or
 *  hidden tests (an official grader would send ONE test's stdin at a time). */
export type CodingExecutionRequest = { requestId: string; language: string; languageVersion: number; source: string; stdin: string; limits: CodingExecutionLimits };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const inRange = (k: keyof typeof CODING_LIMIT_RANGES, v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= CODING_LIMIT_RANGES[k][0] && v <= CODING_LIMIT_RANGES[k][1];

/** Builds the request field by field (an allow-list, never a spread of caller data) and validates it. */
export function buildExecutionRequest(input: unknown): { ok: true; request: CodingExecutionRequest } | { ok: false; code: "REQUEST_INVALID" } {
  const bad = { ok: false as const, code: "REQUEST_INVALID" as const };
  if (!isObj(input) || !isObj(input.limits)) return bad;
  const { requestId, language, languageVersion, source, stdin } = input;
  const l = input.limits;
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(requestId)) return bad;
  if (typeof language !== "string" || !CODING_LANGUAGE_KEY_PATTERN.test(language)) return bad;
  const def = codingLanguage(language);
  if (!def || !def.capabilities.run || languageVersion !== def.version) return bad;
  if (typeof source !== "string" || utf8ByteLength(source) > CODE_SOURCE_MAX_BYTES) return bad;
  if (typeof stdin !== "string" || utf8ByteLength(stdin) > CODING_TEST_LIMITS.ioBytes) return bad;
  if (!inRange("timeMs", l.timeMs) || !inRange("memoryMb", l.memoryMb) || !inRange("outputBytes", l.outputBytes)) return bad;
  return { ok: true, request: { requestId, language, languageVersion: def.version, source, stdin, limits: { timeMs: l.timeMs as number, memoryMb: l.memoryMb as number, outputBytes: l.outputBytes as number } } };
}

/** Bounds and re-labels whatever a provider returned: an unknown status becomes internal-error; stdout / stderr longer than
 *  the output limit are truncated (status output-limit); every runner-internal field (env, host, tokens…) is dropped. */
export function normalizeExecutionResult(raw: unknown, outputBytes: number): CodeExecutionResult {
  if (!isObj(raw)) return { status: "internal-error", stdout: "", stderr: "" };
  let status: CodeExecutionStatus = CODE_EXECUTION_STATUSES.includes(raw.status as CodeExecutionStatus) ? (raw.status as CodeExecutionStatus) : "internal-error";
  const cut = (v: unknown) => {
    const s = typeof v === "string" ? v : "";
    if (utf8ByteLength(s) <= outputBytes) return s;
    if (status === "success") status = "output-limit";
    let end = 0, bytes = 0;                                       // the longest prefix within the limit, never splitting a code point
    while (end < s.length) { const cp = s.codePointAt(end)!, w = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; if (bytes + w > outputBytes) break; bytes += w; end += cp > 0xffff ? 2 : 1; }
    return s.slice(0, end);
  };
  const out: CodeExecutionResult = { status, stdout: cut(raw.stdout), stderr: cut(raw.stderr) };
  out.status = status;
  for (const k of ["exitCode", "durationMs", "memoryKb"] as const) { const v = raw[k]; if (typeof v === "number" && Number.isFinite(v)) out[k] = v; }
  return out;
}

/** Phase 17B building block (NOT wired to official marks in 17A): passedWeight / totalWeight over the hidden tests, matched by
 *  stable test id. The SmartAssess grader stays the authority; a runner never decides a grade. */
export function weightedPassFraction(tests: readonly { id: string; weight: number }[], results: readonly { testId: string; passed: boolean }[]): number {
  const passed = new Set(results.filter(r => r && r.passed === true).map(r => r.testId));
  let total = 0, got = 0;
  for (const t of tests) { const w = Number.isFinite(t.weight) && t.weight > 0 ? t.weight : 0; total += w; if (passed.has(t.id)) got += w; }
  return total > 0 ? got / total : 0;
}
