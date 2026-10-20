// Teacher-side fetch for the Reports Center (route /api/reports). Same auth pattern as the rest.
// Phase R-2: every failure becomes a calm Arabic message — a non-JSON reply (the platform's HTML 502 / 504 page) or a network
// failure never surfaces as parser text («Unexpected token…» / «Failed to fetch»); a server JSON error keeps its own message; a
// 401 is marked (`status`) so the caller can end the teacher session. An aborted request rethrows the AbortError untouched.
export const SESSION_EXPIRED_TEXT = "انتهت صلاحية الجلسة. سجّل الدخول من جديد ثم أعد المحاولة.";
export const SERVER_UNAVAILABLE_TEXT = "تعذر الاتصال بالخادم حاليًا. حاول مرة أخرى بعد قليل.";
export const NETWORK_TEXT = "تعذر الاتصال بالخادم. تحقّق من الاتصال بالإنترنت ثم أعد المحاولة.";

export class ReportHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.name = "ReportHttpError"; this.status = status; }
}
export const isAbortError = (e: unknown) => e instanceof DOMException ? e.name === "AbortError" : !!e && (e as { name?: string }).name === "AbortError";
export const isSessionExpired = (e: unknown) => e instanceof ReportHttpError && e.status === 401;

export async function reportGet<T>(token: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams(params);
  const headers = new Headers({ "Content-Type": "application/json", "x-builder-token": token, Authorization: "Bearer " + token });
  let response: Response;
  try { response = await fetch("/api/reports?" + qs.toString(), { headers, signal }); }
  catch (e) { if (isAbortError(e)) throw e; throw new ReportHttpError(NETWORK_TEXT, 0); }
  let data: (T & { error?: unknown }) | null = null;
  try { data = (await response.json()) as T & { error?: unknown }; } catch (e) { if (isAbortError(e)) throw e; }
  if (response.status === 401) throw new ReportHttpError(SESSION_EXPIRED_TEXT, 401);
  if (!response.ok) {
    const serverText = data && typeof data.error === "string" && data.error.trim() ? data.error : "";
    throw new ReportHttpError(serverText || (response.status >= 500 || !data ? SERVER_UNAVAILABLE_TEXT : "تعذر تجهيز التقرير."), response.status);
  }
  if (!data) throw new ReportHttpError(SERVER_UNAVAILABLE_TEXT, response.status);
  return data;
}
