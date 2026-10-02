// Type declarations for the governance content canonicalization (runtime in exam-canonical.js) used by frontend parity tests.
export const GOVERNANCE_ROOT_KEYS: readonly string[];
export function canonicalizeExamContent(exam: unknown): Record<string, unknown>;
export function cleanQuestionContent(question: unknown): Record<string, unknown>;
export function stableStringify(value: unknown): string;
export function contentHashOf(canonicalExam: unknown): string;
