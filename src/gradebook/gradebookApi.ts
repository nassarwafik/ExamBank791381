// Class gradebook — the teacher UI's calls to /api/class-gradebook. Errors are TeacherHttpError (status + server code) from the shared
// teacher fetch; the caller decides what a 409 STALE_SCHEME means for the page.
import { teacherFetchJson } from "../teacherFetch";
import type { GbGradebook, GbSchemeSaved, GbSources, GbCategory } from "./types";

const URL_BASE = "/api/class-gradebook";

export function loadGradebook(token: string, classId: string): Promise<GbGradebook> {
  return teacherFetchJson<GbGradebook>(token, URL_BASE + "?classId=" + encodeURIComponent(classId), {}, "تعذر تحميل سجل العلامات.");
}

export function loadSources(token: string, classId: string): Promise<GbSources> {
  return teacherFetchJson<GbSources>(token, URL_BASE + "?classId=" + encodeURIComponent(classId) + "&resource=sources", {}, "تعذر تحميل الواجبات والمشاريع.");
}

/** Saves the scheme over the version it was opened from (`etag`; null for a new scheme). A different stored version is a 409. */
export function saveScheme(token: string, classId: string, etag: string | null, scheme: { categories: GbCategory[] }): Promise<GbSchemeSaved> {
  return teacherFetchJson<GbSchemeSaved>(token, URL_BASE, { method: "POST", body: JSON.stringify({ action: "scheme.save", classId, etag, scheme }) }, "تعذر حفظ مخطط العلامات.");
}
