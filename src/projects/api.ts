import { teacherFetchJson } from "../teacherFetch";

// Teacher-side fetch wrapper for the generic Project Tracker API (route /api/project-tracker): x-builder-token + Bearer,
// JSON in/out, throw on !ok. Batch 5 (F1): built on teacherFetch (an expired session signs the teacher out; Arabic text only).
export function projectApi<T>(token: string, url: string, options: RequestInit = {}): Promise<T> {
  return teacherFetchJson<T>(token, url, options);
}

// GET helper: /api/project-tracker?projectCode=..&resource=..&...extra
export function trackerGet<T>(token: string, projectCode: string, resource: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams({ projectCode, resource, ...params });
  return projectApi<T>(token, "/api/project-tracker?" + qs.toString());
}

// POST helper: body always carries projectCode.
export function trackerPost<T>(token: string, projectCode: string, body: Record<string, unknown>): Promise<T> {
  return projectApi<T>(token, "/api/project-tracker", { method: "POST", body: JSON.stringify({ projectCode, ...body }) });
}
