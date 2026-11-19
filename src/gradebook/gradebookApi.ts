// Class gradebook — the teacher UI's calls to /api/class-gradebook. Errors are TeacherHttpError (status + server code) from the shared
// teacher fetch; the caller decides what a 409 STALE_SCHEME means for the page.
import { teacherFetchJson } from "../teacherFetch";
import type { GbGradebook, GbSchemeSaved, GbSources, GbCategory, GbEntryItem, GbEntriesSaved, GbApprovalSaved } from "./types";

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

/** GB5 — saves manual scores and excused / zero decisions. Each item carries the value the teacher saw (`expected`): a cell changed
 *  elsewhere meanwhile is returned in `stale` and kept on the server; a 409 STALE_ENTRIES means none applied. */
export function saveEntries(token: string, classId: string, items: GbEntryItem[]): Promise<GbEntriesSaved> {
  return teacherFetchJson<GbEntriesSaved>(token, URL_BASE, { method: "POST", body: JSON.stringify({ action: "entries.save", classId, items }) }, "تعذر حفظ العلامات.");
}

/** GB6 — approve one part (categoryId) or, with null, the final mark, over the scheme revision the teacher saw. The server refuses an
 *  incomplete or unreleased part (409 PART_NOT_READY / FINAL_NOT_READY, with the reasons) and a stale revision (409 STALE_SCHEME). */
export function approve(token: string, classId: string, categoryId: string | null, schemeRevision: number): Promise<GbApprovalSaved> {
  const body = categoryId === null ? { action: "final.approve", classId, schemeRevision } : { action: "part.approve", classId, categoryId, schemeRevision };
  return teacherFetchJson<GbApprovalSaved>(token, URL_BASE, { method: "POST", body: JSON.stringify(body) }, "تعذر الاعتماد.");
}

/** GB6 — reopen an approved part (categoryId) or, with null, the final mark; the reason is recorded in the history and the audit. */
export function reopen(token: string, classId: string, categoryId: string | null, reason: string): Promise<GbApprovalSaved> {
  const body = categoryId === null ? { action: "final.reopen", classId, reason } : { action: "part.reopen", classId, categoryId, reason };
  return teacherFetchJson<GbApprovalSaved>(token, URL_BASE, { method: "POST", body: JSON.stringify(body) }, "تعذرت إعادة الفتح.");
}
