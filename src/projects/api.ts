// Teacher-side fetch wrapper for the generic Project Tracker API (route /api/project-tracker),
// matching the app's teacherApi pattern (x-builder-token + Bearer, JSON in/out, throw on !ok).
export async function projectApi<T>(token: string, url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  headers.set("x-builder-token", token);
  headers.set("Authorization", "Bearer " + token);
  const response = await fetch(url, { ...options, headers });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "حدث خطأ.");
  return data;
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
