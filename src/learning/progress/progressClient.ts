// Phase L.3 — the learning-progress transport for ONE student (the host supplies the auth headers). Reading progress is a
// convenience, never an authority over content: every failure resolves quietly (null / false) and the Reader keeps working
// on this device's own memory.

export type ReadingProgress = {
  lastPageId: string | null;
  lastReadAt: string | null;
  /** Pages read (any device), in reading order, restricted to the units published to the class now. */
  visited: string[];
  modules: Record<string, { read: number; total: number }>;
};

export type ProgressClient = {
  /** The student's progress in a course, or null when it cannot be read now. */
  get: (courseId: string) => Promise<ReadingProgress | null>;
  /** Record a page as read and as the last page; resolves false when it could not be saved. */
  visit: (courseId: string, pageId: string) => Promise<boolean>;
};

const BASE = "/api/learning-progress/";

function asProgress(j: unknown): ReadingProgress | null {
  if (!j || typeof j !== "object" || (j as { ok?: unknown }).ok !== true) return null;
  const v = j as Partial<ReadingProgress>;
  return {
    lastPageId: typeof v.lastPageId === "string" ? v.lastPageId : null,
    lastReadAt: typeof v.lastReadAt === "string" ? v.lastReadAt : null,
    visited: Array.isArray(v.visited) ? v.visited.filter((id): id is string => typeof id === "string") : [],
    modules: v.modules && typeof v.modules === "object" ? v.modules : {},
  };
}

export function createProgressClient(headers: Record<string, string>): ProgressClient {
  return {
    async get(courseId) {
      try {
        const r = await fetch(BASE + encodeURIComponent(courseId), { headers });
        return r.ok ? asProgress(await r.json().catch(() => null)) : null;
      } catch { return null; }
    },
    async visit(courseId, pageId) {
      try {
        const r = await fetch(BASE + encodeURIComponent(courseId) + "/visit", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ pageId }) });
        return r.ok;
      } catch { return false; }
    },
  };
}
