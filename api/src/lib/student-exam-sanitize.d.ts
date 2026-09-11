// Type declarations for the pure CommonJS student-safe sanitizer, so the frontend structured-builder
// tests can import the authoritative implementation under strict TypeScript without suppressions.
// Runtime behaviour is defined in student-exam-sanitize.js.

export function sanitizeExamForStudent(exam: unknown): Record<string, unknown>;
export function sanitizeSectionForStudent(section: unknown): Record<string, unknown>;
export function sanitizeQuestionForStudent(question: unknown): Record<string, unknown>;
export function sanitizePartForStudent(part: unknown): Record<string, unknown>;
export function sanitizeFieldForStudent(field: unknown): Record<string, unknown>;
export function sanitizeOptionForStudent(option: unknown): Record<string, unknown>;
