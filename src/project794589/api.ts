// Teacher-side fetch wrapper for the project tracker, matching the app's existing teacherApi pattern
// (x-builder-token + Authorization: Bearer, JSON in/out, throw on !ok).
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
