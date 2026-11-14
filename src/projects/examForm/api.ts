// Phase F2-UI — the student's three requests to the project exam form route. The request carries the project, the page's
// last known revision and the answers only: the student and the class come from the session on the server.
import type { ExamFormAnswer, ExamFormView } from "./types";

const ROUTE = "/api/student-project-exam-form";

/** A refusal or a failure of one request. `status` 0 = the request never reached the server (offline, network). */
export class ExamFormRequestError extends Error {
  status: number;
  code: string;
  missing: string[];
  constructor(message: string, status: number, code = "", missing: string[] = []) {
    super(message);
    this.name = "ExamFormRequestError";
    this.status = status;
    this.code = code;
    this.missing = missing;
  }
  /** Worth sending again unchanged: the network, or a temporary server condition. */
  get retryable(): boolean { return this.status === 0 || this.status >= 500; }
}

type Raw = { ok?: boolean; error?: string; code?: string; missing?: unknown; available?: boolean };

async function request(token: string, url: string, init: RequestInit, fallback: string): Promise<Raw> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), "x-student-token": token, Authorization: "Bearer " + token } });
  } catch {
    throw new ExamFormRequestError("تعذر الاتصال بالخادم. تحقق من الإنترنت.", 0);
  }
  let body: Raw = {};
  try { body = (await response.json()) as Raw; } catch { body = {}; }
  if (!response.ok || !body || body.ok !== true) {
    const missing = Array.isArray(body?.missing) ? body.missing.filter((id): id is string => typeof id === "string") : [];
    throw new ExamFormRequestError((body && typeof body.error === "string" && body.error) || fallback, response.ok ? 500 : response.status, (body && typeof body.code === "string" && body.code) || "", missing);
  }
  return body;
}

const isView = (body: Raw): body is ExamFormView => body.available === true && typeof (body as ExamFormView).form === "object" && !!(body as ExamFormView).form;

/** The form with the student's answers, or null while the teacher has not opened it for the class. */
export async function fetchExamForm(token: string, projectCode: string): Promise<ExamFormView | null> {
  const body = await request(token, ROUTE + "?" + new URLSearchParams({ projectCode }), { method: "GET" }, "تعذر تحميل الاستمارة.");
  return isView(body) ? body : null;
}

function viewOf(body: Raw, fallback: string): ExamFormView {
  if (!isView(body)) throw new ExamFormRequestError(fallback, 500);
  return body;
}

export async function saveExamFormDraft(token: string, projectCode: string, baseRevision: number, answers: Record<string, ExamFormAnswer | null>): Promise<ExamFormView> {
  const fallback = "تعذر حفظ الإجابات.";
  return viewOf(await request(token, ROUTE, { method: "POST", body: JSON.stringify({ projectCode, action: "saveDraft", baseRevision, answers }) }, fallback), fallback);
}

export async function submitExamForm(token: string, projectCode: string, baseRevision: number): Promise<ExamFormView> {
  const fallback = "تعذر تسليم الاستمارة.";
  return viewOf(await request(token, ROUTE, { method: "POST", body: JSON.stringify({ projectCode, action: "submit", baseRevision }) }, fallback), fallback);
}
