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

// ── Phase 17C — OFFICIAL grading evaluation (pure). The ONLY place an official coding mark is derived: the SmartAssess server
// passes the hidden tests from the assignment snapshot, the stored comparator and the RAW evidence the runner observed; nothing
// here trusts a runner-reported status beyond the fixed execution vocabulary, and nothing a runner adds (passed / score / weight)
// is ever read. An infrastructure failure is NEVER a zero: it is a technical result and no score is produced.
/** Per-case stdout the official runner captures: the hidden-test I/O contract (16 KB) + a small margin to detect excess output. */
export const OFFICIAL_STDOUT_CAPTURE_BYTES = CODING_TEST_LIMITS.ioBytes + 1024;
/** Per-case stderr the official runner forwards (diagnostics only — stderr never decides correctness). */
export const OFFICIAL_STDERR_CAPTURE_BYTES = 4096;
/** Bounded teacher evidence previews (actual stdout / stderr of a failed test, compiler diagnostics). */
export const OFFICIAL_PREVIEW_BYTES = 4096;
/** Opaque case token for the i-th hidden test (the runner never learns the canonical test id). */
export const officialCaseToken = (index: number): string => "c" + String(index + 1).padStart(2, "0");
export type OfficialCaseStatus = "success" | "runtime-error" | "timeout" | "output-limit" | "internal-error";
const OFFICIAL_CASE_STATUSES: readonly OfficialCaseStatus[] = Object.freeze(["success", "runtime-error", "timeout", "output-limit", "internal-error"]);
export type OfficialCaseEvidence = { token: string; status: string; stdout: string; stderr: string; exitCode?: number; durationMs?: number };
export type OfficialRunEvidence = { compile?: { status: string; stderr?: string; durationMs?: number }; cases: OfficialCaseEvidence[] };
export type OfficialCaseOutcome = { testId: string; token: string; status: CodeExecutionStatus; passed: boolean; durationMs?: number; actualPreview?: string; stderrPreview?: string };
export type OfficialEvaluation =
  | { kind: "complete"; passedWeight: number; totalWeight: number; passedCount: number; testCount: number; compileError: boolean; compilePreview?: string; cases: OfficialCaseOutcome[] }
  | { kind: "technical"; code: string };

/** The longest prefix of s within maxBytes UTF-8 bytes, never splitting a code point. */
export function utf8Prefix(s: string, maxBytes: number): string {
  if (utf8ByteLength(s) <= maxBytes) return s;
  let end = 0, bytes = 0;
  while (end < s.length) { const cp = s.codePointAt(end)!, w = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; if (bytes + w > maxBytes) break; bytes += w; end += cp > 0xffff ? 2 : 1; }
  return s.slice(0, end);
}
const weightOf = (w: unknown) => (typeof w === "number" && Number.isFinite(w) && w > 0 ? w : 0);

/** Evaluates the raw evidence of ONE official run against the authoritative hidden tests (matched by order ↔ opaque token). */
export function evaluateOfficialCodingRun({ tests, comparator, run }: { tests: readonly { id: string; expectedOutput: string; weight: number }[]; comparator: CodingComparator; run: OfficialRunEvidence }): OfficialEvaluation {
  const technical = (code: string): OfficialEvaluation => ({ kind: "technical", code });
  if (!Array.isArray(tests) || tests.length === 0 || !CODING_COMPARATORS.includes(comparator) || !isObj(run) || !Array.isArray(run.cases)) return technical("EVIDENCE_INVALID");
  const totalWeight = tests.reduce((s, t) => s + weightOf(t.weight), 0);
  if (!(totalWeight > 0)) return technical("NO_GRADEABLE_WEIGHT");
  if (run.compile !== undefined) {
    if (!isObj(run.compile) || (run.compile.status !== "compiled" && run.compile.status !== "compile-error")) return technical("EVIDENCE_INVALID");
    if (run.compile.status === "compile-error") {
      if (run.cases.length !== 0) return technical("EVIDENCE_INVALID");
      const compilePreview = utf8Prefix(typeof run.compile.stderr === "string" ? run.compile.stderr : "", OFFICIAL_PREVIEW_BYTES);
      return { kind: "complete", passedWeight: 0, totalWeight, passedCount: 0, testCount: tests.length, compileError: true, compilePreview, cases: tests.map((t, i) => ({ testId: t.id, token: officialCaseToken(i), status: "compile-error", passed: false })) };
    }
  }
  if (run.cases.length !== tests.length) return technical("SUITE_INCOMPLETE");
  const byToken = new Map<string, OfficialCaseEvidence>();
  for (const c of run.cases) {
    if (!isObj(c) || typeof c.token !== "string" || byToken.has(c.token) || typeof c.stdout !== "string" || typeof c.stderr !== "string") return technical("EVIDENCE_INVALID");
    byToken.set(c.token, c);
  }
  let passedWeight = 0, passedCount = 0;
  const cases: OfficialCaseOutcome[] = [];
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i], token = officialCaseToken(i), c = byToken.get(token);
    if (!c) return technical("SUITE_INCOMPLETE");
    if (!OFFICIAL_CASE_STATUSES.includes(c.status as OfficialCaseStatus)) return technical("EVIDENCE_INVALID");
    if (c.status === "internal-error") return technical("CASE_INTERNAL_ERROR");                  // infrastructure: never a failed test
    const passed = c.status === "success" && compareOutput(c.stdout, t.expectedOutput, comparator);
    const out: OfficialCaseOutcome = { testId: t.id, token, status: c.status as CodeExecutionStatus, passed };
    if (typeof c.durationMs === "number" && Number.isFinite(c.durationMs) && c.durationMs >= 0) out.durationMs = Math.round(c.durationMs);
    if (!passed) {
      if (c.stdout !== "") out.actualPreview = utf8Prefix(c.stdout, OFFICIAL_PREVIEW_BYTES);
      if (c.stderr !== "") out.stderrPreview = utf8Prefix(c.stderr, OFFICIAL_PREVIEW_BYTES);
    } else { passedWeight += weightOf(t.weight); passedCount++; }
    cases.push(out);
  }
  return { kind: "complete", passedWeight, totalWeight, passedCount, testCount: tests.length, compileError: false, cases };
}

/** The official automatic mark: maxMarks × passedWeight / totalWeight, rounded ONCE (the platform's 2-decimal rounding). */
export function officialCodingScore(maxMarks: number, passedWeight: number, totalWeight: number): number {
  const m = typeof maxMarks === "number" && Number.isFinite(maxMarks) && maxMarks > 0 ? maxMarks : 0;
  if (!(totalWeight > 0) || !(passedWeight > 0)) return 0;
  return Number((m * Math.min(passedWeight, totalWeight) / totalWeight).toFixed(2));
}
