// Phase F5-UI — what the page says about a picked file before it is sent. A convenience for the student, never
// protection: the server decides what a file must look like (api/src/lib/project-tracker/exam-form-files.js).

/** The server's bound on one file (MAX_FILE_BYTES). */
export const FILE_MAX_BYTES = 10 * 1024 * 1024;

/** A size in words: «188 كيلوبايت», «2.3 ميغابايت». */
export function fileSizeText(bytes: number): string {
  if (!(bytes > 0)) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " كيلوبايت";
  return (Math.round((bytes / (1024 * 1024)) * 10) / 10) + " ميغابايت";
}

/** Why a picked file cannot be attached, in words for the student; "" when it can be sent. */
export function fileRefusal(accept: string[], name: string, size: number): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  if (!ext || !accept.includes(ext)) return "نوع الملف غير مقبول لهذا السؤال. المقبول: " + accept.join("، ") + ".";
  if (size <= 0) return "الملف فارغ.";
  if (size > FILE_MAX_BYTES) return "الملف أكبر من الحد المسموح (10 ميغابايت). إن كان كتابًا كبيرًا فاحفظه بصيغة PDF ثم أرفقه.";
  return "";
}
