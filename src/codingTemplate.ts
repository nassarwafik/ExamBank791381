// Phase 19F — the coding@3 LOCKED TEMPLATE contract. Pure (no React, no DOM, no I/O): compiled into the shared server build so the
// Builder, finalization, the student sanitizer, draft / submit ingest and the OFFICIAL grading pipeline apply the SAME contract.
//
// A locked template is an ordered list of canonical segments for ONE language:
//   { kind: "locked", text }            — published source the student can never change (public by design);
//   { kind: "editable", id, starter }   — a gap the student fills (the starter is the initial, public text).
// The student answer carries ONLY the gap values: { kind: "codeTemplate", language, languageVersion, values: { gapId: text } }.
// The OFFICIAL source is reconstructed on the server by plain concatenation of the PUBLISHED locked text and the bound gap values,
// in segment order, byte for byte (no regex, no interpolation, no evaluation, no newline / indentation normalization): the
// template author writes every newline and indent in the locked text; a gap value is inserted verbatim. Nothing a browser sends can
// change locked text, and a client-reconstructed "source" is never read.
import { CODE_SOURCE_MAX_BYTES, codingLanguage, utf8ByteLength } from "./codingLanguages";

export const CODING_TEMPLATE_LIMITS = Object.freeze({ segments: 100, gaps: 30, gapBytes: 16384 });
export type CodingTemplateSegment = { kind: "locked"; text: string } | { kind: "editable"; id: string; starter: string };
export type CodingTemplateV1 = { language: string; segments: CodingTemplateSegment[] };
export type CodeTemplateAnswer = { kind: "codeTemplate"; language: string; languageVersion: number; values: Record<string, string> };
export type CodingTemplateIssue = { code: string; message: string; severity: "error"; path?: string };

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const GAP_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => own(o, k)) && Object.keys(o).every(k => !FORBIDDEN_KEYS.has(k));
export const isTemplateGapId = (v: unknown): v is string => typeof v === "string" && GAP_ID.test(v) && !FORBIDDEN_KEYS.has(v);
const err = (code: string, message: string, path?: string): CodingTemplateIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });

const M = {
  invalid: "القالب المقفل غير صالح أو يحتوي حقولًا غير معروفة.",
  language: "لغة القالب المقفل يجب أن تكون لغة برمجة مدعومة.",
  segments: "القالب المقفل يحتاج من 1 إلى " + CODING_TEMPLATE_LIMITS.segments + " مقطعًا.",
  segment: "مقطع غير صالح في القالب المقفل.",
  locked: "المقطع المقفل يجب أن يكون نصًا غير فارغ.",
  adjacent: "لا يجوز أن يتجاور مقطعان مقفلان: ادمجهما في مقطع واحد.",
  gapId: "معرّف الفراغ غير صالح (حرف إنجليزي أولًا، حتى 32 حرفًا).",
  gapDup: "معرّف الفراغ مكرر.",
  gapCount: "القالب المقفل يحتاج من 1 إلى " + CODING_TEMPLATE_LIMITS.gaps + " فراغًا قابلًا للتعديل.",
  starter: "النص الابتدائي للفراغ يجب أن يكون نصًا حتى " + CODING_TEMPLATE_LIMITS.gapBytes + " بايت.",
  tooLarge: "الكود الكامل للقالب (مع النصوص الابتدائية) أكبر من حد حجم الكود."
};

export type CodingTemplateResult = { ok: true; template: CodingTemplateV1; issues: [] } | { ok: false; issues: CodingTemplateIssue[] };
/**
 * Strict validation of a published template: exactly { language, segments }; a registered language; 1..100 segments, each exactly
 * { kind: "locked", text } (non-empty) or { kind: "editable", id, starter }; never two adjacent locked segments (one canonical form);
 * 1..30 gaps with unique strict ids; every starter ≤ 16 KB; the source reconstructed from the starters ≤ `sourceLimit` bytes.
 * Nothing is ever repaired.
 */
export function validateCodingTemplate(raw: unknown, sourceLimit: number = CODE_SOURCE_MAX_BYTES): CodingTemplateResult {
  const path = "coding.template";
  if (!isPlain(raw) || !exactKeys(raw, ["language", "segments"])) return { ok: false, issues: [err("CODING_TEMPLATE_INVALID", M.invalid, path)] };
  const issues: CodingTemplateIssue[] = [];
  if (!codingLanguage(raw.language)) issues.push(err("CODING_TEMPLATE_LANGUAGE_INVALID", M.language, path + ".language"));
  const list = raw.segments;
  if (!Array.isArray(list) || list.length === 0 || list.length > CODING_TEMPLATE_LIMITS.segments) return { ok: false, issues: [...issues, err("CODING_TEMPLATE_SEGMENTS_COUNT", M.segments, path + ".segments")] };
  const segments: CodingTemplateSegment[] = [];
  const ids = new Set<string>();
  let previousLocked = false;
  list.forEach((s, i) => {
    const p = path + ".segments." + i;
    if (isPlain(s) && s.kind === "locked" && exactKeys(s, ["kind", "text"])) {
      if (typeof s.text !== "string" || s.text === "") { issues.push(err("CODING_TEMPLATE_LOCKED_INVALID", M.locked, p)); return; }
      if (previousLocked) issues.push(err("CODING_TEMPLATE_ADJACENT_LOCKED", M.adjacent, p));
      previousLocked = true;
      segments.push({ kind: "locked", text: s.text });
      return;
    }
    if (isPlain(s) && s.kind === "editable" && exactKeys(s, ["kind", "id", "starter"])) {
      previousLocked = false;
      if (!isTemplateGapId(s.id)) issues.push(err("CODING_TEMPLATE_GAP_ID_INVALID", M.gapId, p + ".id"));
      else if (ids.has(s.id)) issues.push(err("CODING_TEMPLATE_GAP_ID_DUPLICATE", M.gapDup, p + ".id"));
      else ids.add(s.id);
      if (typeof s.starter !== "string" || utf8ByteLength(s.starter) > CODING_TEMPLATE_LIMITS.gapBytes) issues.push(err("CODING_TEMPLATE_STARTER_INVALID", M.starter, p + ".starter"));
      segments.push({ kind: "editable", id: s.id as string, starter: typeof s.starter === "string" ? s.starter : "" });
      return;
    }
    previousLocked = false;
    issues.push(err("CODING_TEMPLATE_SEGMENT_INVALID", M.segment, p));
  });
  const gaps = segments.filter(s => s.kind === "editable").length;
  if (gaps === 0 || gaps > CODING_TEMPLATE_LIMITS.gaps) issues.push(err("CODING_TEMPLATE_GAP_COUNT", M.gapCount, path + ".segments"));
  if (issues.length) return { ok: false, issues };
  const template: CodingTemplateV1 = { language: raw.language as string, segments };
  const starters: Record<string, string> = {};
  for (const s of segments) if (s.kind === "editable") starters[s.id] = s.starter;
  if (utf8ByteLength(reconstructTemplateSource(template, starters)) > Math.min(sourceLimit, CODE_SOURCE_MAX_BYTES)) return { ok: false, issues: [err("CODING_TEMPLATE_TOO_LARGE", M.tooLarge, path)] };
  return { ok: true, template, issues: [] };
}

/** The gap ids of a VALID template, in segment order. */
export const templateGapIds = (t: CodingTemplateV1): string[] => t.segments.flatMap(s => (s.kind === "editable" ? [s.id] : []));
/** The starter values of a VALID template (the initial student state; also what "reset" restores). */
export const templateStarterValues = (t: CodingTemplateV1): Record<string, string> => Object.fromEntries(t.segments.flatMap(s => (s.kind === "editable" ? [[s.id, s.starter] as const] : [])));

/**
 * THE canonical reconstruction: the published locked text and the bound gap values concatenated in segment order, byte for byte.
 * Callers pass a VALID template and values bound to it (bindCodeTemplateAnswer); nothing is trimmed, re-indented or normalized.
 */
export function reconstructTemplateSource(t: CodingTemplateV1, values: Record<string, string>): string {
  let out = "";
  for (const s of t.segments) out += s.kind === "locked" ? s.text : values[s.id];
  return out;
}

/** Unbound shape check of a codeTemplate answer (no question at hand): exactly the four keys' meaning; extras dropped. */
export function normalizeCodeTemplateAnswer(a: unknown): { ok: true; answer: CodeTemplateAnswer } | { ok: false; code: string } {
  if (!isPlain(a) || a.kind !== "codeTemplate" || typeof a.language !== "string" || !isPlain(a.values)) return { ok: false, code: "CODE_TEMPLATE_ANSWER_INVALID" };
  const def = codingLanguage(a.language);
  if (!def || a.languageVersion !== def.version) return { ok: false, code: "CODE_TEMPLATE_ANSWER_INVALID" };
  const keys = Object.keys(a.values);
  if (keys.length > CODING_TEMPLATE_LIMITS.gaps) return { ok: false, code: "CODE_TEMPLATE_ANSWER_INVALID" };
  const values: Record<string, string> = {};
  for (const k of keys) {
    const v = a.values[k];
    if (!isTemplateGapId(k)) return { ok: false, code: "CODE_TEMPLATE_GAP_UNKNOWN" };
    if (typeof v !== "string") return { ok: false, code: "CODE_TEMPLATE_ANSWER_INVALID" };
    if (utf8ByteLength(v) > CODING_TEMPLATE_LIMITS.gapBytes) return { ok: false, code: "CODE_TEMPLATE_GAP_TOO_LARGE" };
    values[k] = v;
  }
  return { ok: true, answer: { kind: "codeTemplate", language: a.language, languageVersion: def.version, values } };
}

export type BoundTemplateAnswer = { ok: true; answer: CodeTemplateAnswer; source: string } | { ok: false; code: string };
/**
 * Binds a codeTemplate answer to the PUBLISHED template it answers: the language must be the template's; the values must name
 * EXACTLY the template's gaps (a missing gap, an unknown / extra gap or a prototype key is refused); the reconstructed source must
 * fit `sourceLimit` (≤ 64 KB). Returns the canonical answer AND the server-reconstructed official source.
 */
export function bindCodeTemplateAnswer(a: unknown, template: CodingTemplateV1, sourceLimit: number): BoundTemplateAnswer {
  const base = normalizeCodeTemplateAnswer(a);
  if (!base.ok) return base;
  if (base.answer.language !== template.language) return { ok: false, code: "CODE_LANGUAGE_NOT_ALLOWED" };
  const ids = templateGapIds(template), given = base.answer.values;
  for (const k of Object.keys(given)) if (!ids.includes(k)) return { ok: false, code: "CODE_TEMPLATE_GAP_UNKNOWN" };
  for (const id of ids) if (!own(given, id)) return { ok: false, code: "CODE_TEMPLATE_GAP_MISSING" };
  const values: Record<string, string> = {};
  for (const id of ids) values[id] = given[id];
  const source = reconstructTemplateSource(template, values);
  if (utf8ByteLength(source) > Math.min(sourceLimit, CODE_SOURCE_MAX_BYTES)) return { ok: false, code: "CODE_SOURCE_TOO_LARGE" };
  return { ok: true, answer: { ...base.answer, values }, source };
}
/** Answered ⇔ at least one gap holds non-blank text (the locked text alone is never an answer). */
export const isCodeTemplateAnswered = (a: unknown): boolean => isPlain(a) && a.kind === "codeTemplate" && isPlain(a.values) && Object.values(a.values).some(v => typeof v === "string" && v.trim() !== "");
