import { createCodeRunClient, type CodeRunAccess, type CodeRunClient, type RunBlocksResponse } from "./runClient";

// 899371 P8 (docs/enterprise-899371-learning-plan.md §21) — the run transport and the runnable list, ONE of each per session access
// (and course) for the whole Reader session. Imported only by the lazy C# panels, never by the Reader's first-load graph.
// A failed list is forgotten so a later page asks again.
const CLIENTS = new WeakMap<CodeRunAccess, CodeRunClient>();
const LISTS = new WeakMap<CodeRunAccess, Map<string, Promise<RunBlocksResponse>>>();
export function runClientFor(access: CodeRunAccess): CodeRunClient {
  let c = CLIENTS.get(access);
  if (!c) { c = createCodeRunClient(access.headers); CLIENTS.set(access, c); }
  return c;
}
export function runnableList(access: CodeRunAccess, courseId: string): Promise<RunBlocksResponse> {
  let byCourse = LISTS.get(access);
  if (!byCourse) { byCourse = new Map(); LISTS.set(access, byCourse); }
  let p = byCourse.get(courseId);
  if (!p) { p = runClientFor(access).blocks(courseId); byCourse.set(courseId, p); p.catch(() => byCourse!.delete(courseId)); }
  return p;
}
