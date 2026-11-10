// 899371 enrichment P14 (docs/enterprise-899371-enrichment-plan.md §3.3, §11) — «حلّ وافحص»: the transport for ONE actor (the host's
// auth headers, the same access as «جرّب الكود»). The server decides everything that matters — who may solve which question, the
// program a template answer becomes, the language and the limits, the hidden inputs and the verdict, and whether the solution card is
// open (decision D1). Imported only by the lazy C# panels, never by the Reader's first-load graph. Nothing is stored: no grade, no
// attempt (decision D3).
import type { CodeExecutionResult } from "../../codingContract";
import { CodeRunError, type CodeRunAccess } from "./runClient";

/** What the editor may show of one writing question (never its hidden inputs, never its solution). */
export type SolveView = {
  questionId: string; number: number; version: 2 | 3; check: boolean; title?: string; text?: string;
  node: Record<string, unknown>; solution: "open" | "locked";
};
export type SolveListResponse = { ok: true; actor: "student" | "teacher"; available: boolean; questions: Record<string, SolveView> };
export type SolveAnswer = { source: string } | { values: Record<string, string> };
export type CheckCase =
  | { kind: "public"; input: string; expected: string; actual: string; passed: boolean; why?: string; stderr?: string }
  | { kind: "hidden"; passed: boolean; why?: string };
export type CheckResult = { outcome: "passed" | "failed" | "compile-error"; passed: number; total: number; message?: string; cases: CheckCase[] };
const BASE = "/api/learning-solve/";

async function call<T>(headers: Record<string, string>, path: string, body?: unknown): Promise<T> {
  const h: Record<string, string> = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  let r: Response;
  try { r = await fetch(BASE + path, { method: body === undefined ? "GET" : "POST", headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new CodeRunError(0, "NETWORK", "تعذّر الاتصال بالخادم. تحقّق من الاتصال وحاول مرة أخرى.", true); }
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string; retryable?: boolean; retryAfterSeconds?: number };
  if (!r.ok || j.ok !== true) throw new CodeRunError(r.status, j.code || "FAILED", j.error || "تعذّر تنفيذ الطلب الآن.", j.retryable === true || r.status === 429, j.retryAfterSeconds);
  return j as T;
}
const LISTS = new WeakMap<CodeRunAccess, Map<string, Promise<SolveListResponse>>>();
/** The writing questions this learner may solve, ONE request per course for the session; `fresh` asks again. */
export function solveList(access: CodeRunAccess, courseId: string, fresh = false): Promise<SolveListResponse> {
  let byCourse = LISTS.get(access);
  if (!byCourse) { byCourse = new Map(); LISTS.set(access, byCourse); }
  let p = fresh ? undefined : byCourse.get(courseId);
  if (!p) { p = call<SolveListResponse>(access.headers, encodeURIComponent(courseId)); byCourse.set(courseId, p); p.catch(() => byCourse!.delete(courseId)); }
  return p;
}
export const solveRun = (access: CodeRunAccess, courseId: string, questionId: string, answer: SolveAnswer, stdin: string) =>
  call<{ ok: true; result: CodeExecutionResult }>(access.headers, encodeURIComponent(courseId) + "/run", { questionId, ...answer, stdin });
export const solveCheck = (access: CodeRunAccess, courseId: string, questionId: string, answer: SolveAnswer) =>
  call<{ ok: true; check: CheckResult }>(access.headers, encodeURIComponent(courseId) + "/check", { questionId, ...answer });
export const solveSolution = (access: CodeRunAccess, courseId: string, questionId: string) =>
  call<{ ok: true; solution: { reference: string; explanation: string } }>(access.headers, encodeURIComponent(courseId) + "/solution?questionId=" + encodeURIComponent(questionId));
