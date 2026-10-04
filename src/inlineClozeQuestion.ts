// Phase 19A — the inlineCloze@1 QUESTION model («إكمال نص تفاعلي»). Pure (no React, no DOM, no I/O): compiled into the shared
// server build so the Builder, finalization, the student sanitizer, the draft-answer ingest, the authoritative grader and the
// teacher review apply the SAME contract.
//
// A passage is an ordered list of segments: TEXT segments and BLANK segments. A blank is an inline response control with a
// stable id: a TEXT input or a DROPDOWN (V1 supports exactly these two controls, in any order and mix).
//
// Public vs private: everything a student may see lives under `question.inlineCloze` (the passage text, blank ids / controls
// and the dropdown options); every accepted answer, the case policy, the correct option and the scoring mode live ONLY under
// `question.answer`, which the student sanitizer always removes. The student answer is the existing `fields` Answer
// (`{ kind: "fields", values: { <blankId>: <text or optionId> } }`, like matrix / categorization).
//
// Authority: ONE strict validator owns validity (validateInlineClozeConfig + validateInlineClozeAnswerKey). The scorer
// re-validates BOTH before grading; a malformed published config or key fails closed (score 0, manual review) — never a partial
// grade of a valid-looking subset, never a defaulted policy. A malformed STUDENT response under a valid contract is an ordinary
// incorrect answer. Text comparison is deterministic and server-owned (NFC, trimmed, internal whitespace collapsed, optional case
// folding); there is no fuzzy or AI grading.
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";

export const INLINE_CLOZE_TYPE_KEY = "inlineCloze";
export const INLINE_CLOZE_CONFIG_VERSION = 1;
export const INLINE_CLOZE_LIMITS = Object.freeze({ segments: 400, textChars: 2000, passageChars: 20000, blanks: 50, minOptions: 2, options: 12, labelChars: 200, accepted: 20, acceptedChars: 200, responseChars: 500 });
export type InlineClozeScoringMode = "proportional" | "allOrNothing";
export const INLINE_CLOZE_SCORING_MODES: readonly InlineClozeScoringMode[] = Object.freeze(["proportional", "allOrNothing"]);
export type InlineClozeControl = "text" | "dropdown";

export type InlineClozeTextSegment = { type: "text"; text: string };
export type InlineClozeOption = { id: string; label: string };
export type InlineClozeTextBlank = { type: "blank"; id: string; control: "text" };
export type InlineClozeDropdownBlank = { type: "blank"; id: string; control: "dropdown"; options: InlineClozeOption[] };
export type InlineClozeBlank = InlineClozeTextBlank | InlineClozeDropdownBlank;
export type InlineClozeSegment = InlineClozeTextSegment | InlineClozeBlank;
export type InlineClozeConfigV1 = { v: 1; segments: InlineClozeSegment[] };
export type InlineClozeTextKey = { accepted: string[]; caseSensitive?: boolean };
export type InlineClozeDropdownKey = { correctOptionId: string };
export type InlineClozeAnswerKeyV1 = { scoring: InlineClozeScoringMode; blanks: Record<string, InlineClozeTextKey | InlineClozeDropdownKey> };
export type InlineClozeNormalizedBlankKey = { control: "text"; accepted: string[]; caseSensitive: boolean } | { control: "dropdown"; correctOptionId: string };
export type InlineClozeNormalizedKey = { scoring: InlineClozeScoringMode; blanks: Record<string, InlineClozeNormalizedBlankKey>; parts: number };
export type InlineClozeIssue = { code: string; message: string; severity: "error"; path?: string };

const err = (code: string, message: string, path?: string): InlineClozeIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });
/** A PLAIN JSON object (never an array, never a class instance, never a prototype-polluted object). */
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const isId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v) && !FORBIDDEN_KEYS.has(v);
/** True when every own key of `o` is in `allowed` (and none is prototype-sensitive). */
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]): boolean => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN_KEYS.has(k));
const own = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Deterministic, server-owned text normalization: NFC, trim, internal whitespace runs → one space, optional case folding. */
export function normalizeClozeText(value: string, caseSensitive: boolean): string {
  const s = String(value).normalize("NFC").replace(/\s+/g, " ").trim();
  return caseSensitive ? s : s.toLowerCase();
}

export const defaultInlineClozeConfig = (): InlineClozeConfigV1 => ({ v: 1, segments: [{ type: "text", text: "اكتب النص هنا، ثم أدرج فراغًا: " }, { type: "blank", id: "b1", control: "text" }] });
export const defaultInlineClozeAnswerKey = (): InlineClozeAnswerKeyV1 => ({ scoring: "proportional", blanks: { b1: { accepted: [], caseSensitive: false } } });
export const inlineClozeQuestionVersion = (node: unknown): number | undefined => (isPlain(node) ? effectiveQuestionTypeVersion(INLINE_CLOZE_TYPE_KEY, node.questionTypeVersion) : undefined);

/** The blanks of a (canonical) config in passage order, with their 1-based position. */
export function inlineClozeBlanks(cfg: InlineClozeConfigV1): (InlineClozeBlank & { index: number })[] {
  const out: (InlineClozeBlank & { index: number })[] = [];
  for (const s of cfg.segments) if (s.type === "blank") out.push({ ...s, index: out.length + 1 });
  return out;
}

/** A plain-text rendering of a (canonical) passage with positional blank markers — «[فراغ 1]» — for author previews. No answers. */
export function inlineClozePreviewText(cfg: InlineClozeConfigV1): string {
  let n = 0;
  return cfg.segments.map(s => (s.type === "text" ? s.text : "[فراغ " + ++n + "]")).join("");
}

// ── the PUBLIC contract — ONE strict authority ─────────────────────────────────────────────────────────────────────────────
export type InlineClozeConfigResult = { ok: true; config: InlineClozeConfigV1; issues: [] } | { ok: false; issues: InlineClozeIssue[] };
/**
 * Validates AND canonicalizes the public passage. Root exactly `{ v: 1, segments }`; every segment is exactly a text segment
 * `{ type: "text", text }` (non-empty, bounded) or a blank `{ type: "blank", id, control: "text" }` /
 * `{ type: "blank", id, control: "dropdown", options: [{ id, label }] }` (2–12 options, unique option ids, non-empty unique labels);
 * blank ids are unique across the passage; 1–50 blanks. Unknown fields, controls and segment types are REFUSED, never dropped —
 * a malformed control can never become valid by projection.
 */
export function validateInlineClozeConfig(raw: unknown): InlineClozeConfigResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("CLOZE_CONFIG_MISSING", "إعداد سؤال «إكمال نص تفاعلي» مفقود أو غير صالح.", "inlineCloze")] };
  const issues: InlineClozeIssue[] = [];
  if (!onlyKeys(raw, ["v", "segments"])) issues.push(err("CLOZE_CONFIG_UNKNOWN_KEY", "إعداد النص التفاعلي يحتوي حقولًا غير معروفة.", "inlineCloze"));
  if (raw.v !== INLINE_CLOZE_CONFIG_VERSION) issues.push(err("CLOZE_CONFIG_VERSION", "إصدار بنية النص التفاعلي غير مدعوم.", "inlineCloze.v"));
  const segs = raw.segments;
  if (!Array.isArray(segs) || segs.length === 0 || segs.length > INLINE_CLOZE_LIMITS.segments) {
    issues.push(err("CLOZE_SEGMENTS_INVALID", "النص التفاعلي يحتاج مقاطع (نص وفراغات) ضمن الحد المسموح.", "inlineCloze.segments"));
    return { ok: false, issues };
  }
  const segments: InlineClozeSegment[] = [];
  const blankIds = new Set<string>();
  let blanks = 0, chars = 0;
  segs.forEach((s, i) => {
    const path = "inlineCloze.segments." + i;
    if (!isPlain(s)) { issues.push(err("CLOZE_SEGMENT_INVALID", "مقطع غير صالح في النص التفاعلي (رقم " + (i + 1) + ").", path)); return; }
    if (s.type === "text") {
      if (!onlyKeys(s, ["type", "text"]) || typeof s.text !== "string" || s.text.length === 0 || s.text.length > INLINE_CLOZE_LIMITS.textChars) {
        issues.push(err("CLOZE_SEGMENT_INVALID", "مقطع نصي فارغ أو غير صالح في النص التفاعلي (رقم " + (i + 1) + ").", path));
        return;
      }
      chars += s.text.length;
      segments.push({ type: "text", text: s.text });
      return;
    }
    if (s.type !== "blank") { issues.push(err("CLOZE_SEGMENT_INVALID", "نوع مقطع غير معروف في النص التفاعلي (رقم " + (i + 1) + ").", path)); return; }
    blanks++;
    if (!isId(s.id)) { issues.push(err("CLOZE_BLANK_ID_INVALID", "معرّف فراغ غير صالح في النص التفاعلي.", path + ".id")); return; }
    if (blankIds.has(s.id)) issues.push(err("CLOZE_BLANK_ID_DUPLICATE", "معرّف الفراغ «" + s.id + "» مكرّر.", path + ".id"));
    blankIds.add(s.id);
    if (s.control === "text") {
      if (!onlyKeys(s, ["type", "id", "control"])) { issues.push(err("CLOZE_SEGMENT_INVALID", "فراغ الكتابة «" + s.id + "» يحتوي حقولًا غير معروفة.", path)); return; }
      segments.push({ type: "blank", id: s.id, control: "text" });
      return;
    }
    if (s.control !== "dropdown") { issues.push(err("CLOZE_CONTROL_UNKNOWN", "نوع الفراغ «" + String(s.control) + "» غير مدعوم (المدعوم: كتابة أو قائمة منسدلة).", path + ".control")); return; }
    if (!onlyKeys(s, ["type", "id", "control", "options"])) { issues.push(err("CLOZE_SEGMENT_INVALID", "القائمة المنسدلة «" + s.id + "» تحتوي حقولًا غير معروفة.", path)); return; }
    const opts = s.options;
    if (!Array.isArray(opts) || opts.length < INLINE_CLOZE_LIMITS.minOptions || opts.length > INLINE_CLOZE_LIMITS.options) {
      issues.push(err("CLOZE_DROPDOWN_OPTIONS_INVALID", "القائمة المنسدلة «" + s.id + "» تحتاج من " + INLINE_CLOZE_LIMITS.minOptions + " إلى " + INLINE_CLOZE_LIMITS.options + " خيارات.", path + ".options"));
      return;
    }
    const options: InlineClozeOption[] = [];
    const optionIds = new Set<string>(), labels = new Set<string>();
    let ok = true;
    opts.forEach((o, j) => {
      if (!isPlain(o) || !onlyKeys(o, ["id", "label"]) || !isId(o.id) || typeof o.label !== "string" || o.label.trim() === "" || o.label.length > INLINE_CLOZE_LIMITS.labelChars) {
        issues.push(err("CLOZE_OPTION_INVALID", "الخيار " + (j + 1) + " في القائمة المنسدلة «" + s.id + "» غير صالح (معرّف ونص غير فارغ فقط).", path + ".options." + j));
        ok = false;
        return;
      }
      if (optionIds.has(o.id)) { issues.push(err("CLOZE_OPTION_ID_DUPLICATE", "معرّف خيار مكرّر في القائمة المنسدلة «" + s.id + "».", path + ".options." + j)); ok = false; }
      const norm = normalizeClozeText(o.label, false);
      if (labels.has(norm)) { issues.push(err("CLOZE_OPTION_LABEL_DUPLICATE", "نص خيار مكرّر في القائمة المنسدلة «" + s.id + "».", path + ".options." + j)); ok = false; }
      optionIds.add(o.id); labels.add(norm);
      options.push({ id: o.id, label: o.label });
    });
    if (ok) segments.push({ type: "blank", id: s.id, control: "dropdown", options });
  });
  if (blanks === 0) issues.push(err("CLOZE_NO_BLANKS", "النص التفاعلي يحتاج فراغًا واحدًا على الأقل.", "inlineCloze.segments"));
  if (blanks > INLINE_CLOZE_LIMITS.blanks) issues.push(err("CLOZE_TOO_MANY_BLANKS", "عدد الفراغات يتجاوز الحد (" + INLINE_CLOZE_LIMITS.blanks + ").", "inlineCloze.segments"));
  if (chars > INLINE_CLOZE_LIMITS.passageChars) issues.push(err("CLOZE_PASSAGE_TOO_LONG", "النص التفاعلي أطول من الحد المسموح.", "inlineCloze.segments"));
  if (issues.length) return { ok: false, issues };
  return { ok: true, config: { v: 1, segments }, issues: [] };
}

// ── the PRIVATE grading contract — ONE strict authority ────────────────────────────────────────────────────────────────────
export type InlineClozeAnswerKeyResult = { ok: true; key: InlineClozeNormalizedKey; issues: [] } | { ok: false; issues: InlineClozeIssue[] };
/**
 * Validates AND normalizes the private key against the (strictly validated) public config. Root exactly `{ scoring, blanks }`;
 * `scoring` is "proportional" or "allOrNothing" (never defaulted); every blank of the passage has exactly one key and no key names
 * a blank that does not exist. A TEXT blank key is `{ accepted: string[1..20], caseSensitive?: boolean }` (every accepted answer
 * non-empty after normalization; stored normalized + de-duplicated); a DROPDOWN key is exactly `{ correctOptionId }` naming ONE of
 * that dropdown's options. Any problem makes the WHOLE key invalid.
 */
export function validateInlineClozeAnswerKey(raw: unknown, rawConfig: unknown): InlineClozeAnswerKeyResult {
  const cfg = validateInlineClozeConfig(rawConfig);
  if (!cfg.ok) return { ok: false, issues: [err("CLOZE_KEY_CONFIG_INVALID", "لا يمكن التحقق من مفتاح التصحيح لأن إعداد النص التفاعلي غير صالح.", "inlineCloze")] };
  if (!isPlain(raw)) return { ok: false, issues: [err("CLOZE_ANSWER_KEY_INVALID", "مفتاح تصحيح النص التفاعلي مفقود أو غير صالح.", "answer")] };
  const issues: InlineClozeIssue[] = [];
  if (!onlyKeys(raw, ["scoring", "blanks"])) issues.push(err("CLOZE_ANSWER_KEY_INVALID", "مفتاح التصحيح يحتوي حقولًا غير معروفة.", "answer"));
  const scoring = raw.scoring;
  if (scoring !== "proportional" && scoring !== "allOrNothing") issues.push(err("CLOZE_SCORING_UNKNOWN", "طريقة الاحتساب غير معروفة (المدعوم: نسبية أو كل شيء أو لا شيء).", "answer.scoring"));
  const blanksRaw = raw.blanks;
  if (!isPlain(blanksRaw) || Object.keys(blanksRaw).some(k => FORBIDDEN_KEYS.has(k))) {
    issues.push(err("CLOZE_ANSWER_KEY_INVALID", "إجابات الفراغات في مفتاح التصحيح غير صالحة.", "answer.blanks"));
    return { ok: false, issues };
  }
  const blanks = inlineClozeBlanks(cfg.config);
  const known = new Map(blanks.map(b => [b.id, b]));
  for (const id of Object.keys(blanksRaw)) if (!known.has(id)) issues.push(err("CLOZE_KEY_UNKNOWN_BLANK", "مفتاح التصحيح يذكر فراغًا غير موجود «" + id + "».", "answer.blanks." + id));
  const out: Record<string, InlineClozeNormalizedBlankKey> = {};
  for (const b of blanks) {
    const path = "answer.blanks." + b.id;
    if (!own(blanksRaw, b.id)) { issues.push(err("CLOZE_KEY_MISSING_BLANK", "الفراغ " + b.index + " بلا إجابة صحيحة في مفتاح التصحيح.", path)); continue; }
    const k = blanksRaw[b.id];
    if (b.control === "dropdown") {
      if (!isPlain(k) || !onlyKeys(k, ["correctOptionId"]) || typeof k.correctOptionId !== "string" || !b.options.some(o => o.id === k.correctOptionId)) {
        issues.push(err("CLOZE_DROPDOWN_KEY_INVALID", "الفراغ " + b.index + " (قائمة منسدلة) يحتاج خيارًا صحيحًا واحدًا من خياراته.", path));
        continue;
      }
      out[b.id] = { control: "dropdown", correctOptionId: k.correctOptionId };
      continue;
    }
    if (!isPlain(k) || !onlyKeys(k, ["accepted", "caseSensitive"]) || !Array.isArray(k.accepted) || k.accepted.length > INLINE_CLOZE_LIMITS.accepted || !k.accepted.every(a => typeof a === "string" && a.length <= INLINE_CLOZE_LIMITS.acceptedChars) || (k.caseSensitive !== undefined && typeof k.caseSensitive !== "boolean")) {
      issues.push(err("CLOZE_TEXT_KEY_INVALID", "مفتاح الفراغ " + b.index + " غير صالح (قائمة إجابات مقبولة ومطابقة حالة الأحرف فقط).", path));
      continue;
    }
    const caseSensitive = k.caseSensitive === true;
    const accepted = (k.accepted as string[]).map(a => normalizeClozeText(a, true));
    if (accepted.length === 0 || accepted.some(a => a === "")) { issues.push(err("CLOZE_TEXT_ACCEPTED_EMPTY", "الفراغ " + b.index + " يحتاج إجابة مقبولة واحدة على الأقل (ولا إجابة فارغة).", path)); continue; }
    out[b.id] = { control: "text", accepted: [...new Set(accepted)], caseSensitive };
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, key: { scoring: scoring as InlineClozeScoringMode, blanks: out, parts: blanks.length }, issues: [] };
}

/** inlineCloze@1 finalization rules: every problem BLOCKS (client and server run the same code). */
export function validateInlineClozeQuestion(node: Record<string, unknown>): InlineClozeIssue[] {
  const out: InlineClozeIssue[] = [];
  if (inlineClozeQuestionVersion(node) === undefined) out.push(err("CLOZE_VERSION_UNSUPPORTED", "إصدار سؤال «إكمال نص تفاعلي» غير مدعوم في هذا الإصدار من التطبيق.", "questionTypeVersion"));
  const cfg = validateInlineClozeConfig(node.inlineCloze);
  if (!cfg.ok) return [...out, ...cfg.issues];
  const key = validateInlineClozeAnswerKey(node.answer, node.inlineCloze);
  return key.ok ? out : [...out, ...key.issues];
}

/** The student projection: the strictly valid canonical config (public fields only, rebuilt) or null. Never a repaired config. */
export function projectInlineClozeConfigForStudent(raw: unknown): InlineClozeConfigV1 | null {
  const r = validateInlineClozeConfig(raw);
  return r.ok ? r.config : null;
}

// ── student answers ────────────────────────────────────────────────────────────────────────────────────────────────────────
export type InlineClozeAnswer = { kind: "fields"; values: Record<string, string> };
export type InlineClozeAnswerResult = { ok: true; answer: InlineClozeAnswer } | { ok: false; code: string };
/**
 * Ingest binding (draft save / submit / pause) for an answer to an inlineCloze@1 question: the answer must be a `fields` Answer;
 * only STRING values for the question's own blank ids survive, bounded to responseChars. A config the projection refuses keeps
 * only well-formed ids (bounded count) so a teacher-side defect never destroys the student's work — grading still fails closed.
 */
export function bindInlineClozeAnswerToQuestion(a: unknown, question: unknown): InlineClozeAnswerResult {
  if (!isPlain(a) || a.kind !== "fields" || !isPlain(a.values)) return { ok: false, code: "CLOZE_ANSWER_INVALID" };
  const cfg = isPlain(question) ? projectInlineClozeConfigForStudent(question.inlineCloze) : null;
  const allowed = cfg ? new Set(inlineClozeBlanks(cfg).map(b => b.id)) : null;
  const values: Record<string, string> = {};
  let n = 0;
  for (const id of Object.keys(a.values)) {
    if (!isId(id) || (allowed && !allowed.has(id))) continue;
    const v = a.values[id];
    if (typeof v !== "string") continue;
    if (++n > INLINE_CLOZE_LIMITS.blanks) break;
    values[id] = v.slice(0, INLINE_CLOZE_LIMITS.responseChars);
  }
  return { ok: true, answer: { kind: "fields", values } };
}

/** The response values of a well-formed fields Answer (own string values only), or null for any other shape. */
function responseValues(response: unknown): Record<string, string> | null {
  if (!isPlain(response) || response.kind !== "fields" || !isPlain(response.values)) return null;
  const out: Record<string, string> = {};
  for (const k of Object.keys(response.values)) { const v = response.values[k]; if (!FORBIDDEN_KEYS.has(k) && typeof v === "string") out[k] = v; }
  return out;
}
const blankCorrect = (key: InlineClozeNormalizedBlankKey, value: string | undefined): boolean => {
  if (typeof value !== "string" || value.length > INLINE_CLOZE_LIMITS.responseChars) return false;
  if (key.control === "dropdown") return value === key.correctOptionId;
  const given = normalizeClozeText(value, key.caseSensitive);
  return given !== "" && key.accepted.some(a => normalizeClozeText(a, key.caseSensitive) === given);
};

// ── grading + review ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type InlineClozeScore = { score: number; correct: boolean; manualReview: boolean; parts: { correct: number; total: number } };
/** The fail-closed result: an INVALID grading contract yields no automatic academic mark and routes the question to manual review. */
export const INLINE_CLOZE_FAIL_CLOSED: Readonly<InlineClozeScore> = Object.freeze({ score: 0, correct: false, manualReview: true, parts: Object.freeze({ correct: 0, total: 0 }) });
/**
 * The authoritative scorer (server grader + teacher review). Validates the published public config AND the private key through the
 * ONE strict authority BEFORE any blank is compared; either invalid ⇒ INLINE_CLOZE_FAIL_CLOSED. Under a valid contract every blank
 * is one grading part: proportional = marks × correct / total; allOrNothing = marks only when every blank is correct. A dropdown is
 * graded by OPTION ID (never by label). A malformed / missing / foreign STUDENT response is an ordinary zero (manualReview false).
 */
export function scoreInlineCloze(input: { config: unknown; answerKey: unknown; response: unknown; maxMarks: number }): InlineClozeScore {
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  const key = validateInlineClozeAnswerKey(input.answerKey, input.config);
  if (!key.ok) return { ...INLINE_CLOZE_FAIL_CLOSED, parts: { ...INLINE_CLOZE_FAIL_CLOSED.parts } };
  const total = key.key.parts;
  const values = responseValues(input.response);
  if (!values) return { score: 0, correct: false, manualReview: false, parts: { correct: 0, total } };
  let correct = 0;
  for (const id of Object.keys(key.key.blanks)) if (blankCorrect(key.key.blanks[id], own(values, id) ? values[id] : undefined)) correct++;
  const all = total > 0 && correct === total;
  const score = key.key.scoring === "allOrNothing" ? (all ? max : 0) : (total ? max * correct / total : 0);
  return { score: Math.min(max, Math.max(0, score)), correct: all, manualReview: false, parts: { correct, total } };
}

export type InlineClozeBlankResult = { id: string; index: number; control: InlineClozeControl; given: string; ok: boolean; expected: string[] };
/** Per-blank review evaluation (teacher review only — it carries the expected values). Invalid contract ⇒ { ok: false }. */
export function evaluateInlineCloze(rawConfig: unknown, rawKey: unknown, rawValues: unknown): { ok: true; results: InlineClozeBlankResult[]; correct: number; total: number } | { ok: false; issues: InlineClozeIssue[] } {
  const cfg = validateInlineClozeConfig(rawConfig);
  if (!cfg.ok) return { ok: false, issues: cfg.issues };
  const key = validateInlineClozeAnswerKey(rawKey, rawConfig);
  if (!key.ok) return { ok: false, issues: key.issues };
  const values = isPlain(rawValues) ? responseValues({ kind: "fields", values: rawValues }) ?? {} : {};
  const results = inlineClozeBlanks(cfg.config).map(b => {
    const k = key.key.blanks[b.id];
    const raw = own(values, b.id) ? values[b.id] : "";
    const ok = blankCorrect(k, raw === "" ? undefined : raw);
    if (b.control === "dropdown" && k.control === "dropdown") {
      const chosen = b.options.find(o => o.id === raw);
      return { id: b.id, index: b.index, control: b.control, given: chosen ? chosen.label : raw, ok, expected: b.options.filter(o => o.id === k.correctOptionId).map(o => o.label) };
    }
    return { id: b.id, index: b.index, control: b.control, given: raw, ok, expected: k.control === "text" ? [...k.accepted] : [] };
  });
  const correct = results.filter(r => r.ok).length;
  return { ok: true, results, correct, total: results.length };
}
