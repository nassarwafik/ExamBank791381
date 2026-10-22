// Batch 5 (F1/F2) — what a teacher or a student reads when a request fails is always Arabic: never the browser's
// "Failed to fetch" / "Load failed", never a parser's "Unexpected token '<'" (a gateway HTML page), never an English
// server message ("Unauthorized"). Shared by teacherFetch and the student pages.
export const NETWORK_ERROR_TEXT = "تعذر الاتصال بالخادم. تحقق من الاتصال وأعد المحاولة.";
export const SERVER_UNAVAILABLE_TEXT = "الخادم غير متاح حاليًا. أعد المحاولة بعد قليل.";
export const UNEXPECTED_RESPONSE_TEXT = "استجابة غير متوقعة من الخادم. أعد المحاولة.";

const ARABIC_LETTER = /[؀-ۿ]/;
const isArabicText = (value: unknown): value is string => typeof value === "string" && ARABIC_LETTER.test(value);

/** The server's message when it is written for the user (Arabic), else an Arabic fallback by status. */
export function userFacingMessage(serverMessage: unknown, status: number, fallback: string): string {
  if (isArabicText(serverMessage)) return serverMessage.trim();
  return status >= 500 ? SERVER_UNAVAILABLE_TEXT : fallback;
}

/** The text to show for a caught error: its own message when Arabic, else `fallback` (a browser / parser / English error). */
export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && isArabicText(error.message) ? error.message : fallback;
}

/** The response body as JSON, or null when it is not JSON (an HTML error page, an empty body). Never throws. */
export async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  try { return (await response.json()) as T; } catch { return null; }
}
