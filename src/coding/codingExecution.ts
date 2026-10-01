import { createContext } from "react";
import type { CodeExecutionResult, CodeExecutionStatus } from "../codingContract";

// Phase 17A — the CLIENT seam of the execution-provider architecture. The coding renderer reads an optional service from this
// context; in 17A the application provides NONE, so the run area shows the "unavailable" notice — a normal, supported state.
// Phase 17B will provide a service that calls the authenticated server route, which forwards to the trusted, isolated
// execution provider. A browser-side result is NEVER an official score (the server grader is the only grading authority) and
// is never stored in the canonical Answer. Nothing here can execute code: it only describes a request / response.
export type CodingRunRequest = { language: string; languageVersion: number; source: string; stdin: string; testId?: string };
export type CodingCapabilities = { available: boolean; languages: { key: string; languageVersion: number }[] };
export type CodingExecutionService = { capabilities: CodingCapabilities; run: (request: CodingRunRequest) => Promise<CodeExecutionResult> };

export const CodingExecutionContext = createContext<CodingExecutionService | undefined>(undefined);

/** True only when a TRUSTED provider reported this exact language contract (never inferred, never assumed). */
export const canRun = (service: CodingExecutionService | undefined, language: string, languageVersion: number): boolean =>
  !!service && service.capabilities.available === true && Array.isArray(service.capabilities.languages) && service.capabilities.languages.some(l => l.key === language && l.languageVersion === languageVersion);

export const EXECUTION_STATUS_LABELS: Readonly<Record<CodeExecutionStatus, string>> = Object.freeze({
  success: "نجح",
  "compile-error": "خطأ في الترجمة",
  "runtime-error": "خطأ أثناء التشغيل",
  timeout: "انتهى الوقت",
  "output-limit": "تجاوز حد المخرجات",
  "internal-error": "تعذّر التشغيل في بيئة التنفيذ"
});
export const RUN_UNAVAILABLE_MESSAGE = "تشغيل الكود غير متاح حاليًا؛ يمكن حفظ الإجابة وتسليمها للمراجعة.";

// Phase 17B — Arabic messages for practice-run refusals (the run area shows one of these instead of a result).
const RUN_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  EXECUTION_UNAVAILABLE: RUN_UNAVAILABLE_MESSAGE,
  LANGUAGE_UNAVAILABLE: RUN_UNAVAILABLE_MESSAGE,
  RUNNER_BUSY: "بيئة التشغيل مشغولة حاليًا. حاول مرة أخرى بعد قليل.",
  CODE_SOURCE_TOO_LARGE: "الكود أكبر من الحد المسموح لهذا السؤال.",
  ATTEMPT_NOT_WRITABLE: "لا يمكن تشغيل الكود لأن المحاولة غير متاحة للكتابة الآن.",
  NETWORK: "تعذّر الاتصال بالخادم. تحقّق من الاتصال وحاول مرة أخرى."
});
export const RUN_FAILED_MESSAGE = "تعذّر تشغيل الكود الآن. حاول مرة أخرى لاحقًا.";
export function runErrorMessage(code: string, retryAfterSeconds?: number): string {
  if (code === "RATE_LIMITED") return "تجاوزت الحد المسموح به لمرات التشغيل مؤقتًا. حاول مرة أخرى بعد " + (retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : 60) + " ثانية.";
  return Object.prototype.hasOwnProperty.call(RUN_ERROR_MESSAGES, code) ? RUN_ERROR_MESSAGES[code] : RUN_FAILED_MESSAGE;
}
/** Bound for the practice stdin box (the platform's per-input ceiling, 16 KB UTF-8). */
export const RUN_STDIN_MAX_BYTES = 16384;
