// Batch 5 (F1/F2) — the ONE JSON request helper of the teacher pages that are not under TeacherPlatform / App (assignments,
// review, bank, projects, dashboard, import, audit, smart import). Before, each page had its own copy that parsed the body
// before looking at the status and showed whatever the server or the browser said: an expired session left the teacher in
// the app with the English "Unauthorized", a gateway HTML page surfaced "Unexpected token '<'", a dropped connection
// "Failed to fetch". Now:
//   • a network failure, a non-JSON body and an English (or missing) server message become Arabic text;
//   • a 401 announces the expired session once (TEACHER_SESSION_EXPIRED_EVENT, handled by App: the teacher is signed out)
//     and fails with the Arabic session-expired text;
//   • an unexpected status keeps its tracking code (lib/requestTrace).
import { withTrackingCode } from "./lib/requestTrace";
import { NETWORK_ERROR_TEXT, UNEXPECTED_RESPONSE_TEXT, userFacingMessage } from "./userFacingErrors";

export const TEACHER_SESSION_EXPIRED_EVENT = "eb:teacher-session-expired";
export const SESSION_EXPIRED_TEXT = "انتهت صلاحية الجلسة. سجّل الدخول من جديد ثم أعد المحاولة.";

export class TeacherHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TeacherHttpError";
    this.status = status;
  }
}

/** Tells the app shell that the teacher's session ended (App signs the teacher out). Never throws. */
export function announceTeacherSessionExpired(): void {
  try { window.dispatchEvent(new Event(TEACHER_SESSION_EXPIRED_EVENT)); } catch { /* no window (tests / SSR) */ }
}

const isBinaryBody = (body: BodyInit | null | undefined) =>
  body instanceof ArrayBuffer || (typeof Blob !== "undefined" && body instanceof Blob) || (typeof FormData !== "undefined" && body instanceof FormData);

export async function teacherFetchJson<T>(token: string, url: string, options: RequestInit = {}, fallback = "حدث خطأ."): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!isBinaryBody(options.body) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("x-builder-token", token);
  headers.set("Authorization", "Bearer " + token);
  let response: Response;
  try { response = await fetch(url, { ...options, headers }); }
  catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;                 // a cancelled request is not a failure
    throw new TeacherHttpError(NETWORK_ERROR_TEXT, 0);
  }
  let body: (T & { error?: unknown }) | null = null;
  try { body = (await response.json()) as T & { error?: unknown }; } catch { body = null; }
  if (response.status === 401) {
    announceTeacherSessionExpired();
    throw new TeacherHttpError(SESSION_EXPIRED_TEXT, 401);
  }
  if (!response.ok) {
    throw new TeacherHttpError(withTrackingCode(userFacingMessage(body?.error, response.status, fallback), response.status, response), response.status);
  }
  if (body === null) throw new TeacherHttpError(UNEXPECTED_RESPONSE_TEXT, response.status);
  return body;
}
