// Phase F2-UI — the student's three requests to the project exam form route. The request carries the project, the page's
// last known revision and the answers only: the student and the class come from the session on the server.
// Phase F4-UI — and the three image requests: attach one image, remove one, read one of the student's own images.
// Phase F5-UI — and the three file requests: attach (or replace) the file of a file question, remove it, download it.
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

const OFFLINE = "تعذر الاتصال بالخادم. تحقق من الإنترنت.";
const authHeaders = (token: string) => ({ "x-student-token": token, Authorization: "Bearer " + token });

async function request(token: string, url: string, init: RequestInit, fallback: string): Promise<Raw> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...authHeaders(token) } });
  } catch {
    throw new ExamFormRequestError(OFFLINE, 0);
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

/** Phase F4-UI — attach one image to a question. The server sanitizes and stores it, and answers with the form as it is now. */
export async function addExamFormImage(token: string, projectCode: string, questionId: string, dataUrl: string): Promise<ExamFormView> {
  const fallback = "تعذر رفع الصورة.";
  return viewOf(await request(token, ROUTE, { method: "POST", body: JSON.stringify({ projectCode, action: "addImage", questionId, dataUrl }) }, fallback), fallback);
}

/** Phase F4-UI — remove one attached image. A repeat is harmless (the server answers with the form as it is). */
export async function removeExamFormImage(token: string, projectCode: string, questionId: string, imageId: string): Promise<ExamFormView> {
  const fallback = "تعذر حذف الصورة.";
  return viewOf(await request(token, ROUTE, { method: "POST", body: JSON.stringify({ projectCode, action: "removeImage", questionId, imageId }) }, fallback), fallback);
}

/** Phase F4-UI — the bytes of one of the student's own images. An image has no public address: it is read with the session. */
export async function fetchExamFormImage(token: string, projectCode: string, imageId: string): Promise<Blob> {
  const fallback = "تعذر تحميل الصورة.";
  let response: Response;
  try {
    response = await fetch(ROUTE + "?" + new URLSearchParams({ projectCode, image: imageId }), { method: "GET", headers: authHeaders(token) });
  } catch {
    throw new ExamFormRequestError(OFFLINE, 0);
  }
  if (!response.ok) throw new ExamFormRequestError(fallback, response.status);
  return response.blob();
}

/** Phase F5-UI — attach the file of a file question (it replaces the question's earlier file). The server checks and stores it. */
export async function addExamFormFile(token: string, projectCode: string, questionId: string, fileName: string, dataBase64: string): Promise<ExamFormView> {
  const fallback = "تعذر رفع الملف.";
  return viewOf(await request(token, ROUTE, { method: "POST", body: JSON.stringify({ projectCode, action: "addFile", questionId, fileName, dataBase64 }) }, fallback), fallback);
}

/** Phase F5-UI — remove the attached file. A repeat is harmless (the server answers with the form as it is). */
export async function removeExamFormFile(token: string, projectCode: string, questionId: string, fileId: string): Promise<ExamFormView> {
  const fallback = "تعذر حذف الملف.";
  return viewOf(await request(token, ROUTE, { method: "POST", body: JSON.stringify({ projectCode, action: "removeFile", questionId, fileId }) }, fallback), fallback);
}

/** Phase F5-UI — the bytes of one of the student's own files. A file has no public address: it is read with the session. */
export async function fetchExamFormFile(token: string, projectCode: string, fileId: string): Promise<Blob> {
  const fallback = "تعذر تنزيل الملف.";
  let response: Response;
  try {
    response = await fetch(ROUTE + "?" + new URLSearchParams({ projectCode, file: fileId }), { method: "GET", headers: authHeaders(token) });
  } catch {
    throw new ExamFormRequestError(OFFLINE, 0);
  }
  if (!response.ok) throw new ExamFormRequestError(fallback, response.status);
  return response.blob();
}
