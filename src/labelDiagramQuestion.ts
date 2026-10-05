// Phase 19D — the labelDiagram@1 QUESTION model («تسمية أجزاء الرسم»). Pure (no React, no DOM, no I/O): compiled into the shared server
// build. Zone geometry is validated by the shared engine (visualGeometry.ts) — nothing is duplicated here.
//
// Public vs private:
//   • PUBLIC  `question.labelDiagram` = { v: 1, alt, allowReuse, zones: [{ id, shape, name? }], labels: [{ id, text }] } — the drop
//     ZONES are public (the student must see where labels go), as are the label texts and whether one label may be used twice.
//   • PRIVATE `question.answer` = { scoring: "proportional" | "allOrNothing", correctLabelByZone: { zoneId: labelId } } — never sent to
//     a student.
//   • The student answer is the existing `fields` Answer (`{ kind: "fields", values: { zoneId: labelId } }`, like matrix /
//     categorization / inlineCloze): registry-native, no new answer kind.
//
// Grading: config, key AND the canonical image are re-validated through ONE strict authority before comparison; invalid ⇒ 0 + manual
// review. Every zone is one part: proportional = marks × correct / zones; allOrNothing = marks only when every zone is right. A
// response naming an unknown label, or using a label twice while reuse is disabled, is malformed ⇒ an ordinary 0 (no manual review);
// unknown (forged) zone ids are ignored.
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import { VISUAL_IMAGE_MESSAGES, VISUAL_SHAPE_MESSAGES, isVisualId, validateVisualImage, validateVisualShape, type VisualShape } from "./visualGeometry";

export const LABEL_DIAGRAM_TYPE_KEY = "labelDiagram";
export const LABEL_DIAGRAM_CONFIG_VERSION = 1;
export const LABEL_DIAGRAM_LIMITS = Object.freeze({ zones: 50, labels: 50, labelChars: 120, nameChars: 60, altMin: 3, altChars: 500, responseKeys: 200 });
export type LabelDiagramScoringMode = "proportional" | "allOrNothing";
export type LabelDiagramZone = { id: string; shape: VisualShape; name?: string };
export type LabelDiagramLabel = { id: string; text: string };
export type LabelDiagramConfigV1 = { v: 1; alt: string; allowReuse: boolean; zones: LabelDiagramZone[]; labels: LabelDiagramLabel[] };
export type LabelDiagramAnswerKeyV1 = { scoring: LabelDiagramScoringMode; correctLabelByZone: Record<string, string> };
export type LabelDiagramIssue = { code: string; message: string; severity: "error"; path?: string };

const err = (code: string, message: string, path?: string): LabelDiagramIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]): boolean => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN_KEYS.has(k));
const own = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const normText = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

export const defaultLabelDiagramConfig = (): LabelDiagramConfigV1 => ({ v: 1, alt: "", allowReuse: false, zones: [], labels: [] });
export const defaultLabelDiagramAnswerKey = (): LabelDiagramAnswerKeyV1 => ({ scoring: "proportional", correctLabelByZone: {} });
export const labelDiagramQuestionVersion = (node: unknown): number | undefined => (isPlain(node) ? effectiveQuestionTypeVersion(LABEL_DIAGRAM_TYPE_KEY, node.questionTypeVersion) : undefined);

// ── the PUBLIC contract ────────────────────────────────────────────────────────────────────────────────────────────────────
export type LabelDiagramConfigResult = { ok: true; config: LabelDiagramConfigV1; issues: [] } | { ok: false; issues: LabelDiagramIssue[] };
/**
 * Root exactly { v: 1, alt, allowReuse, zones, labels }: alt 3..500 chars; allowReuse boolean; 1..50 zones, each exactly { id, shape,
 * name? } (unique stable id, valid shared-engine shape, optional non-empty name ≤ 60); 1..50 labels, each exactly { id, text } (unique
 * id, non-empty text ≤ 120, unique by normalized text). Unknown fields are REFUSED, never dropped.
 */
export function validateLabelDiagramConfig(raw: unknown): LabelDiagramConfigResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("LABEL_CONFIG_MISSING", "إعداد سؤال «تسمية أجزاء الرسم» مفقود أو غير صالح.", "labelDiagram")] };
  const issues: LabelDiagramIssue[] = [];
  if (!onlyKeys(raw, ["v", "alt", "allowReuse", "zones", "labels"])) issues.push(err("LABEL_CONFIG_UNKNOWN_KEY", "إعداد السؤال يحتوي حقولًا غير معروفة.", "labelDiagram"));
  if (raw.v !== LABEL_DIAGRAM_CONFIG_VERSION) issues.push(err("LABEL_CONFIG_VERSION", "إصدار بنية سؤال التسمية غير مدعوم.", "labelDiagram.v"));
  const alt = typeof raw.alt === "string" ? raw.alt.trim() : null;
  if (alt === null || alt.length < LABEL_DIAGRAM_LIMITS.altMin || alt.length > LABEL_DIAGRAM_LIMITS.altChars) issues.push(err("LABEL_ALT_INVALID", "اكتب وصفًا واضحًا للصورة (من " + LABEL_DIAGRAM_LIMITS.altMin + " إلى " + LABEL_DIAGRAM_LIMITS.altChars + " حرفًا) لمن لا يرى الصورة.", "labelDiagram.alt"));
  if (typeof raw.allowReuse !== "boolean") issues.push(err("LABEL_REUSE_INVALID", "حدّد هل يمكن استخدام التسمية أكثر من مرة.", "labelDiagram.allowReuse"));
  const zones: LabelDiagramZone[] = [], labels: LabelDiagramLabel[] = [];
  const zl = raw.zones;
  if (!Array.isArray(zl) || zl.length === 0 || zl.length > LABEL_DIAGRAM_LIMITS.zones) issues.push(err("LABEL_ZONES_INVALID", "أضف على الصورة منطقة واحدة على الأقل (حتى " + LABEL_DIAGRAM_LIMITS.zones + ").", "labelDiagram.zones"));
  else {
    const ids = new Set<string>();
    zl.forEach((z, i) => {
      const path = "labelDiagram.zones." + i, n = i + 1;
      if (!isPlain(z) || !onlyKeys(z, ["id", "shape", "name"]) || !own(z, "id") || !own(z, "shape") || (own(z, "name") && (typeof z.name !== "string" || z.name.trim() === "" || z.name.trim().length > LABEL_DIAGRAM_LIMITS.nameChars))) { issues.push(err("LABEL_ZONE_INVALID", "المنطقة " + n + " غير صالحة.", path)); return; }
      if (!isVisualId(z.id)) { issues.push(err("LABEL_ZONE_ID_INVALID", "معرّف المنطقة " + n + " غير صالح.", path + ".id")); return; }
      if (ids.has(z.id)) { issues.push(err("LABEL_ZONE_ID_DUPLICATE", "معرّف المنطقة «" + z.id + "» مكرّر.", path + ".id")); return; }
      ids.add(z.id);
      const shape = validateVisualShape(z.shape);
      if (!shape.ok) { issues.push(err("LABEL_ZONE_SHAPE_INVALID", "المنطقة " + n + ": " + (VISUAL_SHAPE_MESSAGES[shape.code] ?? "شكل غير صالح."), path + ".shape")); return; }
      zones.push({ id: z.id, shape: shape.shape, ...(typeof z.name === "string" ? { name: z.name.trim() } : {}) });
    });
  }
  const ll = raw.labels;
  if (!Array.isArray(ll) || ll.length === 0 || ll.length > LABEL_DIAGRAM_LIMITS.labels) issues.push(err("LABEL_LABELS_INVALID", "أضف تسمية واحدة على الأقل في بنك التسميات (حتى " + LABEL_DIAGRAM_LIMITS.labels + ").", "labelDiagram.labels"));
  else {
    const ids = new Set<string>(), texts = new Set<string>();
    ll.forEach((l, i) => {
      const path = "labelDiagram.labels." + i, n = i + 1;
      if (!isPlain(l) || !onlyKeys(l, ["id", "text"]) || !own(l, "id") || typeof l.text !== "string" || l.text.trim() === "" || l.text.trim().length > LABEL_DIAGRAM_LIMITS.labelChars) { issues.push(err("LABEL_LABEL_INVALID", "التسمية " + n + " غير صالحة (نص غير فارغ حتى " + LABEL_DIAGRAM_LIMITS.labelChars + " حرفًا).", path)); return; }
      if (!isVisualId(l.id)) { issues.push(err("LABEL_LABEL_ID_INVALID", "معرّف التسمية " + n + " غير صالح.", path + ".id")); return; }
      if (ids.has(l.id)) { issues.push(err("LABEL_LABEL_ID_DUPLICATE", "معرّف التسمية «" + l.id + "» مكرّر.", path + ".id")); return; }
      const t = normText(l.text);
      if (texts.has(t)) { issues.push(err("LABEL_TEXT_DUPLICATE", "نص التسمية «" + l.text.trim() + "» مكرّر.", path + ".text")); return; }
      ids.add(l.id); texts.add(t);
      labels.push({ id: l.id, text: l.text.trim() });
    });
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, config: { v: 1, alt: alt as string, allowReuse: raw.allowReuse as boolean, zones, labels }, issues: [] };
}

// ── the PRIVATE contract ───────────────────────────────────────────────────────────────────────────────────────────────────
export type LabelDiagramAnswerKeyResult = { ok: true; key: LabelDiagramAnswerKeyV1; issues: [] } | { ok: false; issues: LabelDiagramIssue[] };
/** Root exactly { scoring, correctLabelByZone }: scoring never defaulted; every zone exactly one known label; no unknown zone; no
 *  prototype key; with reuse disabled no label is the correct label of two zones. Any problem invalidates the WHOLE key. */
export function validateLabelDiagramAnswerKey(raw: unknown, rawConfig: unknown): LabelDiagramAnswerKeyResult {
  const cfg = validateLabelDiagramConfig(rawConfig);
  if (!cfg.ok) return { ok: false, issues: [err("LABEL_KEY_CONFIG_INVALID", "لا يمكن التحقق من التسميات الصحيحة لأن إعداد السؤال غير صالح.", "labelDiagram")] };
  return checkAnswerKey(raw, cfg.config);
}
function checkAnswerKey(raw: unknown, cfg: LabelDiagramConfigV1 | null): LabelDiagramAnswerKeyResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("LABEL_ANSWER_KEY_INVALID", "مفتاح تصحيح سؤال التسمية مفقود أو غير صالح.", "answer")] };
  const issues: LabelDiagramIssue[] = [];
  if (!onlyKeys(raw, ["scoring", "correctLabelByZone"])) issues.push(err("LABEL_ANSWER_KEY_INVALID", "مفتاح التصحيح يحتوي حقولًا غير معروفة.", "answer"));
  const scoring = raw.scoring;
  if (scoring !== "proportional" && scoring !== "allOrNothing") issues.push(err("LABEL_SCORING_UNKNOWN", "طريقة الاحتساب غير معروفة (المدعوم: نسبية أو الكل أو لا شيء).", "answer.scoring"));
  const map = raw.correctLabelByZone;
  if (!isPlain(map) || Object.keys(map).some(k => FORBIDDEN_KEYS.has(k))) { issues.push(err("LABEL_ANSWER_KEY_INVALID", "التسميات الصحيحة في مفتاح التصحيح غير صالحة.", "answer.correctLabelByZone")); return { ok: false, issues }; }
  if (!cfg) return issues.length ? { ok: false, issues } : { ok: true, key: { scoring: scoring as LabelDiagramScoringMode, correctLabelByZone: {} }, issues: [] };
  const zoneIds = new Set(cfg.zones.map(z => z.id)), labelIds = new Set(cfg.labels.map(l => l.id));
  for (const z of Object.keys(map)) if (!zoneIds.has(z)) issues.push(err("LABEL_KEY_UNKNOWN_ZONE", "مفتاح التصحيح يذكر منطقة غير موجودة «" + z + "».", "answer.correctLabelByZone." + z));
  const out: Record<string, string> = {}, used = new Map<string, number>();
  cfg.zones.forEach((z, i) => {
    const path = "answer.correctLabelByZone." + z.id;
    if (!own(map, z.id)) { issues.push(err("LABEL_KEY_MISSING_ZONE", "المنطقة " + (i + 1) + " بلا تسمية صحيحة.", path)); return; }
    const l = map[z.id];
    if (typeof l !== "string" || !labelIds.has(l)) { issues.push(err("LABEL_KEY_UNKNOWN_LABEL", "التسمية الصحيحة للمنطقة " + (i + 1) + " ليست من بنك التسميات.", path)); return; }
    out[z.id] = l;
    used.set(l, (used.get(l) ?? 0) + 1);
  });
  if (!cfg.allowReuse && [...used.values()].some(n => n > 1)) issues.push(err("LABEL_KEY_REUSE", "التسمية نفسها صحيحة لأكثر من منطقة؛ فعّل «السماح باستخدام التسمية أكثر من مرة» أو غيّر التسميات.", "answer.correctLabelByZone"));
  if (issues.length) return { ok: false, issues };
  return { ok: true, key: { scoring: scoring as LabelDiagramScoringMode, correctLabelByZone: out }, issues: [] };
}

/** labelDiagram@1 finalization rules (client and server run the same code). */
export function validateLabelDiagramQuestion(node: Record<string, unknown>): LabelDiagramIssue[] {
  const out: LabelDiagramIssue[] = [];
  if (labelDiagramQuestionVersion(node) === undefined) out.push(err("LABEL_VERSION_UNSUPPORTED", "إصدار سؤال «تسمية أجزاء الرسم» غير مدعوم في هذا الإصدار من التطبيق.", "questionTypeVersion"));
  const cfg = validateLabelDiagramConfig(node.labelDiagram);
  if (!cfg.ok) out.push(...cfg.issues);
  const key = checkAnswerKey(node.answer, cfg.ok ? cfg.config : null);
  if (!key.ok) out.push(...key.issues);
  const img = validateVisualImage(node.image);
  if (!img.ok) out.push(err(img.code, VISUAL_IMAGE_MESSAGES[img.code], "image"));
  return out;
}

// FNV-1a (32-bit) of a label's own public content: the delivery order of the bank depends only on each label, never on where the
// teacher wrote it (authored order usually follows the zones, so it would reveal the key).
const labelRank = (l: LabelDiagramLabel) => { let h = 0x811c9dc5; for (const c of l.id + "\u0000" + l.text) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0; return h; };
/**
 * The student projection: the strictly valid canonical public config (rebuilt) or null — never a repaired config. The label bank is
 * re-ordered deterministically by a content hash (ties by id), independent of the authored order; idempotent.
 */
export function projectLabelDiagramConfigForStudent(raw: unknown): LabelDiagramConfigV1 | null {
  const r = validateLabelDiagramConfig(raw);
  if (!r.ok) return null;
  const labels = r.config.labels.map(l => ({ l, k: labelRank(l) })).sort((a, b) => a.k - b.k || (a.l.id < b.l.id ? -1 : a.l.id > b.l.id ? 1 : 0)).map(e => e.l);
  return { ...r.config, labels };
}

// ── student answers ────────────────────────────────────────────────────────────────────────────────────────────────────────
export type LabelDiagramAnswer = { kind: "fields"; values: Record<string, string> };
type ReadResult = { ok: true; values: Record<string, string> } | { ok: false; code: string };
/**
 * Reads a `fields` response against a VALID config: unknown zone ids are ignored; an empty value means "unassigned"; a prototype key,
 * a non-string value, an unknown label or (reuse disabled) a label used twice makes the response malformed.
 */
function readResponse(response: unknown, cfg: LabelDiagramConfigV1): ReadResult {
  if (!isPlain(response) || response.kind !== "fields" || !isPlain(response.values)) return { ok: false, code: "LABEL_ANSWER_INVALID" };
  const keys = Object.keys(response.values);
  if (keys.length > LABEL_DIAGRAM_LIMITS.responseKeys || keys.some(k => FORBIDDEN_KEYS.has(k))) return { ok: false, code: "LABEL_ANSWER_INVALID" };
  const zoneIds = new Set(cfg.zones.map(z => z.id)), labelIds = new Set(cfg.labels.map(l => l.id));
  const values: Record<string, string> = {}, used = new Set<string>();
  for (const k of keys) {
    const v = response.values[k];
    if (typeof v !== "string") return { ok: false, code: "LABEL_ANSWER_INVALID" };
    if (!zoneIds.has(k) || v === "") continue;
    if (!labelIds.has(v)) return { ok: false, code: "LABEL_ANSWER_INVALID" };
    if (!cfg.allowReuse && used.has(v)) return { ok: false, code: "LABEL_REUSE_NOT_ALLOWED" };
    used.add(v);
    values[k] = v;
  }
  return { ok: true, values };
}
export type LabelDiagramAnswerResult = { ok: true; answer: LabelDiagramAnswer } | { ok: false; code: string };
/**
 * Ingest binding (draft save / submit / pause) for an answer to a labelDiagram@1 question: a `fields` Answer reduced to the question's
 * own zones with known labels (unknown zones stripped, every other root field dropped); unknown labels, reuse abuse, prototype keys
 * and oversized maps are rejected. A defective published config keeps only well-formed id → id strings (bounded) so a teacher-side
 * defect never destroys the student's work — grading still fails closed.
 */
export function bindLabelDiagramAnswerToQuestion(a: unknown, question: unknown): LabelDiagramAnswerResult {
  const cfg = isPlain(question) ? projectLabelDiagramConfigForStudent(question.labelDiagram) : null;
  if (cfg) { const r = readResponse(a, cfg); return r.ok ? { ok: true, answer: { kind: "fields", values: r.values } } : r; }
  if (!isPlain(a) || a.kind !== "fields" || !isPlain(a.values)) return { ok: false, code: "LABEL_ANSWER_INVALID" };
  const values: Record<string, string> = {};
  let n = 0;
  for (const k of Object.keys(a.values)) { const v = a.values[k]; if (isVisualId(k) && isVisualId(v) && ++n <= LABEL_DIAGRAM_LIMITS.zones) values[k] = v; }
  return { ok: true, answer: { kind: "fields", values } };
}

// ── grading + review ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type LabelDiagramScore = { score: number; correct: boolean; manualReview: boolean; parts: { correct: number; total: number } };
export const LABEL_DIAGRAM_FAIL_CLOSED: Readonly<LabelDiagramScore> = Object.freeze({ score: 0, correct: false, manualReview: true, parts: Object.freeze({ correct: 0, total: 0 }) });
type Authority = { config: LabelDiagramConfigV1; key: LabelDiagramAnswerKeyV1 };
function authorityOf(rawConfig: unknown, rawKey: unknown, rawImage: unknown): Authority | null {
  const cfg = validateLabelDiagramConfig(rawConfig);
  if (!cfg.ok) return null;
  const key = validateLabelDiagramAnswerKey(rawKey, rawConfig);
  if (!key.ok || !validateVisualImage(rawImage).ok) return null;
  return { config: cfg.config, key: key.key };
}
/** The authoritative scorer (server grader + teacher review). */
export function scoreLabelDiagram(input: { config: unknown; answerKey: unknown; image: unknown; response: unknown; maxMarks: number }): LabelDiagramScore {
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  const auth = authorityOf(input.config, input.answerKey, input.image);
  if (!auth) return { ...LABEL_DIAGRAM_FAIL_CLOSED, parts: { ...LABEL_DIAGRAM_FAIL_CLOSED.parts } };
  const total = auth.config.zones.length;
  const r = readResponse(input.response, auth.config);
  if (!r.ok) return { score: 0, correct: false, manualReview: false, parts: { correct: 0, total } };
  let correct = 0;
  for (const z of auth.config.zones) if (own(r.values, z.id) && r.values[z.id] === auth.key.correctLabelByZone[z.id]) correct++;
  const all = correct === total;
  const score = auth.key.scoring === "allOrNothing" ? (all ? max : 0) : max * correct / total;
  return { score: Math.min(max, Math.max(0, score)), correct: all, manualReview: false, parts: { correct, total } };
}
export type LabelDiagramEvaluation =
  | { ok: true; correct: number; total: number; results: { zoneId: string; index: number; name: string; given: string; expected: string; ok: boolean }[] }
  | { ok: false; issues: LabelDiagramIssue[] };
/** Teacher review only (it carries the correct labels): per zone the student's label text, the correct label text and ✓ / ✗. */
export function evaluateLabelDiagram(rawConfig: unknown, rawKey: unknown, rawImage: unknown, rawValues: unknown): LabelDiagramEvaluation {
  const auth = authorityOf(rawConfig, rawKey, rawImage);
  if (!auth) {
    const cfg = validateLabelDiagramConfig(rawConfig), key = validateLabelDiagramAnswerKey(rawKey, rawConfig), img = validateVisualImage(rawImage);
    return { ok: false, issues: [...(cfg.ok ? [] : cfg.issues), ...(cfg.ok && !key.ok ? key.issues : []), ...(img.ok ? [] : [err(img.code, VISUAL_IMAGE_MESSAGES[img.code], "image")])] };
  }
  const text = new Map(auth.config.labels.map(l => [l.id, l.text]));
  const values: Record<string, unknown> = isPlain(rawValues) ? rawValues : {};
  const results = auth.config.zones.map((z, i) => {
    const g = own(values, z.id) && typeof values[z.id] === "string" ? (values[z.id] as string) : "";
    const expected = auth.key.correctLabelByZone[z.id];
    return { zoneId: z.id, index: i + 1, name: z.name ?? "", given: text.get(g) ?? "", expected: text.get(expected) ?? "", ok: g !== "" && g === expected };
  });
  return { ok: true, correct: results.filter(r => r.ok).length, total: results.length, results };
}
