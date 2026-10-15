/**
 * Phase 21E L3-B — the student's CURRENT release set for one course, read from the authenticated server endpoint
 * (GET /api/student-learning-materials, published modules only — the same endpoint «موادي التعليمية» reads).
 *
 * Used to re-check the entitlement when a search result is opened, so a module the teacher hid after the Reader was
 * opened never opens from search. Returns the released module ids (an empty set when the course is no longer listed),
 * or `null` when the entitlement cannot be established (network / server / malformed response, any non-2xx status
 * including 401) — callers treat `null` as DENY. This is a re-check on an application path, not the authority: the
 * server's release list is.
 */
export async function fetchReleasedModuleIds(token: string, courseId: string): Promise<ReadonlySet<string> | null> {
  try {
    const r = await fetch("/api/student-learning-materials", { headers: { "x-student-token": token, Authorization: "Bearer " + token } });
    if (!r.ok) return null;
    const j = await r.json() as { ok?: boolean; materials?: unknown };
    if (!j || j.ok !== true || !Array.isArray(j.materials)) return null;
    const course = (j.materials as { courseId?: unknown; modules?: unknown }[]).find(c => c && c.courseId === courseId);
    if (!course || !Array.isArray(course.modules)) return new Set();
    const ids = (course.modules as { moduleId?: unknown }[])
      .map(m => (m && typeof m.moduleId === "string" ? m.moduleId.trim() : ""))
      .filter(Boolean);
    return new Set(ids);
  } catch {
    return null;
  }
}
