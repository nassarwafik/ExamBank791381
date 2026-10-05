// Phase 19F — the shared, read-only CODE STIMULUS: a short program shown with a question (predict the output, trace the execution,
// spot the bug…) on ANY question type — the answer stays the type's own (MCQ / shortAnswer / numeric / tableFill / compound…), so no
// new question type, grader or answer shape exists. Pure (no React, no DOM, no imports): compiled into the shared server build, so
// the Builder's finalization gate, the student sanitizer and the renderer apply the SAME strict contract.
//   codeStimulus = { language, source, label? }  — exactly these keys; `language` one of CODE_STIMULUS_LANGUAGES; `source` non-empty
//   text ≤ 16 KB (UTF-8) and ≤ 400 lines, shown VERBATIM (never executed, never interpreted as HTML / Markdown); `label` an optional
//   accessible caption ≤ 120 characters. A stimulus is public by design; anything else in it (a smuggled answer, an `expected` value)
//   makes the whole stimulus invalid: finalization blocks it and the student projection withholds it (fail closed).
export type CodeStimulus = { language: string; source: string; label?: string };
export type CodeStimulusIssue = { code: string; message: string; severity: "error"; path: string };
/** Display labels of the stimulus languages: the three coding languages plus language-neutral pseudocode. */
export const CODE_STIMULUS_LANGUAGES: Readonly<Record<string, string>> = Object.freeze({ python: "Python", java: "Java", csharp: "C#", pseudocode: "شبه كود" });
export const CODE_STIMULUS_LIMITS = Object.freeze({ bytes: 16384, lines: 400, label: 120 });

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
export const codeStimulusLanguageLabel = (language: string): string => (own(CODE_STIMULUS_LANGUAGES, language) ? CODE_STIMULUS_LANGUAGES[language] : language);

export type CodeStimulusResult = { ok: true; stimulus: CodeStimulus } | { ok: false; issues: CodeStimulusIssue[] };
/** Strict validation; returns the canonical copy (exact keys, nothing repaired, nothing trimmed). */
export function validateCodeStimulus(raw: unknown): CodeStimulusResult {
  const path = "codeStimulus";
  const fail = (code: string, message: string, p = path): CodeStimulusResult => ({ ok: false, issues: [{ code, message, severity: "error", path: p }] });
  if (!isPlain(raw)) return fail("CODE_STIMULUS_INVALID", "الكود المرفق بالسؤال غير صالح.");
  const keys = Object.keys(raw);
  if (!own(raw, "language") || !own(raw, "source") || keys.some(k => k !== "language" && k !== "source" && k !== "label")) return fail("CODE_STIMULUS_INVALID", "الكود المرفق بالسؤال يحتوي حقولًا غير معروفة أو ناقصة.");
  if (typeof raw.language !== "string" || !own(CODE_STIMULUS_LANGUAGES, raw.language)) return fail("CODE_STIMULUS_LANGUAGE_INVALID", "لغة الكود المرفق غير مدعومة (Python أو Java أو C# أو شبه كود).", path + ".language");
  if (typeof raw.source !== "string" || raw.source.trim() === "") return fail("CODE_STIMULUS_SOURCE_EMPTY", "اكتب الكود المرفق بالسؤال.", path + ".source");
  if (utf8Bytes(raw.source) > CODE_STIMULUS_LIMITS.bytes || raw.source.split("\n").length > CODE_STIMULUS_LIMITS.lines) return fail("CODE_STIMULUS_TOO_LARGE", "الكود المرفق أطول من الحد المسموح (16 كيلوبايت و400 سطر).", path + ".source");
  if (own(raw, "label") && (typeof raw.label !== "string" || raw.label.length > CODE_STIMULUS_LIMITS.label)) return fail("CODE_STIMULUS_LABEL_INVALID", "وصف الكود المرفق يجب أن يكون نصًا حتى 120 حرفًا.", path + ".label");
  const stimulus: CodeStimulus = { language: raw.language, source: raw.source };
  if (typeof raw.label === "string" && raw.label.trim() !== "") stimulus.label = raw.label;
  return { ok: true, stimulus };
}
/** Node-level issues (empty when the node carries no stimulus). */
export const codeStimulusIssues = (node: unknown): CodeStimulusIssue[] => {
  if (!isPlain(node) || !own(node, "codeStimulus") || node.codeStimulus === undefined) return [];
  const r = validateCodeStimulus(node.codeStimulus);
  return r.ok ? [] : r.issues;
};
/** The ONLY student projection: the strict canonical copy, or null (withheld) when anything is wrong. */
export const projectCodeStimulusForStudent = (raw: unknown): CodeStimulus | null => { const r = validateCodeStimulus(raw); return r.ok ? r.stimulus : null; };
