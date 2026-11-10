// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — «شاهد التنفيذ خطوة بخطوة»: the trace transport for ONE actor
// (the host's auth headers, the same access as «جرّب الكود»). The server decides which traces this learner may watch now (an exercise
// after it is answered; a book question after the teacher opens its module, D1) and sends the recorded steps on demand. Imported only
// by the lazy C# panels, never by the Reader's first-load graph.
import { CodeRunError, type CodeRunAccess } from "./runClient";

export type TraceState = "open" | "answer-first";
export type TraceListResponse = { ok: true; actor: "student" | "teacher"; traces: Record<string, TraceState> };
/** `valuesFrom`: where a book run's values come from when the tracer adds any (its text, its teacher clarification, or chosen). */
export type TraceResponse = { ok: true; trace: { kind: "exercise" | "book"; code: string; stdin?: string; valuesFrom?: "question" | "clarification" | "chosen"; steps: unknown[] } };
const BASE = "/api/learning-trace/";

async function call<T>(headers: Record<string, string>, path: string): Promise<T> {
  let r: Response;
  try { r = await fetch(BASE + path, { headers: { ...headers } }); }
  catch { throw new CodeRunError(0, "NETWORK", "تعذّر الاتصال بالخادم. تحقّق من الاتصال وحاول مرة أخرى.", true); }
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string };
  if (!r.ok || j.ok !== true) throw new CodeRunError(r.status, j.code || "FAILED", j.error || "تعذّر تحميل التتبع الآن.", r.status >= 500 || r.status === 0);
  return j as T;
}
const LISTS = new WeakMap<CodeRunAccess, Map<string, Promise<TraceListResponse>>>();
/** The traces this learner may watch, ONE request per course for the session; `fresh` asks again (after an answer). */
export function traceList(access: CodeRunAccess, courseId: string, fresh = false): Promise<TraceListResponse> {
  let byCourse = LISTS.get(access);
  if (!byCourse) { byCourse = new Map(); LISTS.set(access, byCourse); }
  let p = fresh ? undefined : byCourse.get(courseId);
  if (!p) { p = call<TraceListResponse>(access.headers, encodeURIComponent(courseId)); byCourse.set(courseId, p); p.catch(() => byCourse!.delete(courseId)); }
  return p;
}
/** The recorded steps of one block's program (the server checks the gate again). */
export const traceSteps = (access: CodeRunAccess, courseId: string, pageId: string, blockId: string) =>
  call<TraceResponse>(access.headers, encodeURIComponent(courseId) + "/steps?pageId=" + encodeURIComponent(pageId) + "&blockId=" + encodeURIComponent(blockId));
