// Teacher-side fetch for the Reports Center (route /api/reports). Same auth pattern as the rest.
export async function reportGet<T>(token: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params);
  const headers = new Headers({ "Content-Type": "application/json", "x-builder-token": token, Authorization: "Bearer " + token });
  const response = await fetch("/api/reports?" + qs.toString(), { headers });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "تعذر تجهيز التقرير.");
  return data;
}
