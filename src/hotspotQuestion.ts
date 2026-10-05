// Phase 19D — the hotspot@1 QUESTION model («تحديد منطقة على صورة»). Pure (no React, no DOM, no I/O): compiled into the shared server
// build so the Builder, finalization, the student sanitizer, the draft-answer ingest, the authoritative grader and the teacher review
// apply the SAME contract. All geometry comes from the shared engine (visualGeometry.ts) — nothing is duplicated here.
//
// Public vs private:
//   • PUBLIC  `question.hotspot` = { v: 1, mode: "single" | "multiple", selections, alt } — how many places the student marks and the
//     image description; the image itself is the question's canonical `image` (existing secure media path).
//   • PRIVATE `question.answer`  = { scoring: "proportional" | "allOrNothing", regions: [{ id, shape }] } — the target geometry, which
//     the student sanitizer always removes. In multiple mode the public `selections` IS the exact target count (intentionally public:
//     the student must know how many places to mark; capping the selections at that count prevents click farming without any
//     penalty scoring). Single mode = exactly one target and one selection.
//   • The student answer is `{ kind: "hotspot", points: [{ x, y }] }` — normalized points only; never a score, a matched target id,
//     a region, or pixel dimensions.
//
// Grading: the published config, the private key AND the canonical image are re-validated through ONE strict authority before any
// point is compared; invalid authority ⇒ 0 + manual review (never partial credit). Under a valid contract the student's points are
// matched to the targets by MAXIMUM one-to-one matching (a point satisfies at most one target; duplicate clicks never earn repeated
// credit; overlapping targets are resolved optimally and order-independently). proportional = marks × matched / targets;
// allOrNothing = marks only when every target is matched. More points than `selections`, a non-hotspot kind or any malformed point
// is an ordinary incorrect answer (score 0, manual review false).
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import {
  VISUAL_IMAGE_MESSAGES, VISUAL_SHAPE_MESSAGES, isNormalizedCoordinate, isVisualId, maxOneToOneMatching, validateVisualImage, validateVisualShape,
  type NormalizedPoint, type VisualShape
} from "./visualGeometry";

export const HOTSPOT_TYPE_KEY = "hotspot";
export const HOTSPOT_CONFIG_VERSION = 1;
export const HOTSPOT_LIMITS = Object.freeze({ regions: 50, selections: 50, points: 50, altMin: 3, altChars: 500 });
export type HotspotMode = "single" | "multiple";
export type HotspotScoringMode = "proportional" | "allOrNothing";
export type HotspotConfigV1 = { v: 1; mode: HotspotMode; selections: number; alt: string };
export type HotspotRegion = { id: string; shape: VisualShape };
export type HotspotAnswerKeyV1 = { scoring: HotspotScoringMode; regions: HotspotRegion[] };
export type HotspotAnswer = { kind: "hotspot"; points: NormalizedPoint[] };
export type HotspotIssue = { code: string; message: string; severity: "error"; path?: string };

const err = (code: string, message: string, path?: string): HotspotIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]): boolean => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN_KEYS.has(k));

export const defaultHotspotConfig = (): HotspotConfigV1 => ({ v: 1, mode: "single", selections: 1, alt: "" });
export const defaultHotspotAnswerKey = (): HotspotAnswerKeyV1 => ({ scoring: "allOrNothing", regions: [] });
export const hotspotQuestionVersion = (node: unknown): number | undefined => (isPlain(node) ? effectiveQuestionTypeVersion(HOTSPOT_TYPE_KEY, node.questionTypeVersion) : undefined);

// ── the PUBLIC contract ────────────────────────────────────────────────────────────────────────────────────────────────────
export type HotspotConfigResult = { ok: true; config: HotspotConfigV1; issues: [] } | { ok: false; issues: HotspotIssue[] };
/** Root exactly { v: 1, mode, selections, alt }: single ⇒ selections 1; multiple ⇒ 2..50 (integer); alt 3..500 chars after trim. */
export function validateHotspotConfig(raw: unknown): HotspotConfigResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("HOTSPOT_CONFIG_MISSING", "إعداد سؤال «تحديد منطقة على صورة» مفقود أو غير صالح.", "hotspot")] };
  const issues: HotspotIssue[] = [];
  if (!onlyKeys(raw, ["v", "mode", "selections", "alt"])) issues.push(err("HOTSPOT_CONFIG_UNKNOWN_KEY", "إعداد السؤال يحتوي حقولًا غير معروفة.", "hotspot"));
  if (raw.v !== HOTSPOT_CONFIG_VERSION) issues.push(err("HOTSPOT_CONFIG_VERSION", "إصدار بنية سؤال الصورة غير مدعوم.", "hotspot.v"));
  const mode = raw.mode;
  if (mode !== "single" && mode !== "multiple") issues.push(err("HOTSPOT_MODE_UNKNOWN", "طريقة التحديد غير معروفة (المدعوم: نقطة واحدة أو عدة نقاط).", "hotspot.mode"));
  const s = raw.selections;
  const sOk = typeof s === "number" && Number.isInteger(s) && (mode === "single" ? s === 1 : mode === "multiple" ? s >= 2 && s <= HOTSPOT_LIMITS.selections : true);
  if (!sOk) issues.push(err("HOTSPOT_SELECTIONS_INVALID", mode === "multiple" ? "وضع «عدة نقاط» يحتاج من 2 إلى " + HOTSPOT_LIMITS.selections + " منطقة صحيحة." : "وضع «نقطة واحدة» يقبل تحديدًا واحدًا فقط.", "hotspot.selections"));
  const alt = typeof raw.alt === "string" ? raw.alt.trim() : null;
  if (alt === null || alt.length < HOTSPOT_LIMITS.altMin || alt.length > HOTSPOT_LIMITS.altChars) issues.push(err("HOTSPOT_ALT_INVALID", "اكتب وصفًا واضحًا للصورة (من " + HOTSPOT_LIMITS.altMin + " إلى " + HOTSPOT_LIMITS.altChars + " حرفًا) لمن لا يرى الصورة.", "hotspot.alt"));
  if (issues.length) return { ok: false, issues };
  return { ok: true, config: { v: 1, mode: mode as HotspotMode, selections: s as number, alt: alt as string }, issues: [] };
}

// ── the PRIVATE contract ───────────────────────────────────────────────────────────────────────────────────────────────────
export type HotspotAnswerKeyResult = { ok: true; key: HotspotAnswerKeyV1; issues: [] } | { ok: false; issues: HotspotIssue[] };
/**
 * Root exactly { scoring, regions } validated against the (strict) public config: scoring is never defaulted; 1..50 regions, each
 * exactly { id, shape } with a unique stable id and a valid shape (shared engine); the number of regions equals `selections`.
 */
export function validateHotspotAnswerKey(raw: unknown, rawConfig: unknown): HotspotAnswerKeyResult {
  const cfg = validateHotspotConfig(rawConfig);
  if (!cfg.ok) return { ok: false, issues: [err("HOTSPOT_KEY_CONFIG_INVALID", "لا يمكن التحقق من المناطق الصحيحة لأن إعداد السؤال غير صالح.", "hotspot")] };
  return checkAnswerKey(raw, cfg.config);
}
/** The key rules; `cfg` null (a defective public config, authoring feedback only) skips the target-count rule. */
function checkAnswerKey(raw: unknown, cfg: HotspotConfigV1 | null): HotspotAnswerKeyResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("HOTSPOT_ANSWER_KEY_INVALID", "مفتاح تصحيح سؤال الصورة مفقود أو غير صالح.", "answer")] };
  const issues: HotspotIssue[] = [];
  if (!onlyKeys(raw, ["scoring", "regions"])) issues.push(err("HOTSPOT_ANSWER_KEY_INVALID", "مفتاح التصحيح يحتوي حقولًا غير معروفة.", "answer"));
  const scoring = raw.scoring;
  if (scoring !== "proportional" && scoring !== "allOrNothing") issues.push(err("HOTSPOT_SCORING_UNKNOWN", "طريقة الاحتساب غير معروفة (المدعوم: نسبية أو الكل أو لا شيء).", "answer.scoring"));
  const list = raw.regions;
  if (!Array.isArray(list) || list.length === 0 || list.length > HOTSPOT_LIMITS.regions) {
    issues.push(err("HOTSPOT_REGIONS_INVALID", "حدّد على الصورة منطقة صحيحة واحدة على الأقل (حتى " + HOTSPOT_LIMITS.regions + ").", "answer.regions"));
    return { ok: false, issues };
  }
  const regions: HotspotRegion[] = [];
  const ids = new Set<string>();
  list.forEach((r, i) => {
    const path = "answer.regions." + i, n = i + 1;
    if (!isPlain(r) || !onlyKeys(r, ["id", "shape"]) || !("id" in r) || !("shape" in r)) { issues.push(err("HOTSPOT_REGION_INVALID", "المنطقة " + n + " غير صالحة.", path)); return; }
    if (!isVisualId(r.id)) { issues.push(err("HOTSPOT_REGION_ID_INVALID", "معرّف المنطقة " + n + " غير صالح.", path + ".id")); return; }
    if (ids.has(r.id)) { issues.push(err("HOTSPOT_REGION_ID_DUPLICATE", "معرّف المنطقة «" + r.id + "» مكرّر.", path + ".id")); return; }
    ids.add(r.id);
    const shape = validateVisualShape(r.shape);
    if (!shape.ok) { issues.push(err("HOTSPOT_REGION_SHAPE_INVALID", "المنطقة " + n + ": " + (VISUAL_SHAPE_MESSAGES[shape.code] ?? "شكل غير صالح."), path + ".shape")); return; }
    regions.push({ id: r.id, shape: shape.shape });
  });
  if (!issues.length && cfg && regions.length !== cfg.selections)
    issues.push(err("HOTSPOT_TARGET_COUNT", cfg.mode === "single" ? "وضع «نقطة واحدة» يحتاج منطقة صحيحة واحدة فقط." : "عدد المناطق الصحيحة (" + regions.length + ") يجب أن يساوي عدد التحديدات المطلوبة (" + cfg.selections + ").", "answer.regions"));
  if (issues.length) return { ok: false, issues };
  return { ok: true, key: { scoring: scoring as HotspotScoringMode, regions }, issues: [] };
}

/** hotspot@1 finalization rules (client and server run the same code): version, public config, private key, canonical image. */
export function validateHotspotQuestion(node: Record<string, unknown>): HotspotIssue[] {
  const out: HotspotIssue[] = [];
  if (hotspotQuestionVersion(node) === undefined) out.push(err("HOTSPOT_VERSION_UNSUPPORTED", "إصدار سؤال «تحديد منطقة على صورة» غير مدعوم في هذا الإصدار من التطبيق.", "questionTypeVersion"));
  const cfg = validateHotspotConfig(node.hotspot);
  if (!cfg.ok) out.push(...cfg.issues);
  const key = checkAnswerKey(node.answer, cfg.ok ? cfg.config : null);
  if (!key.ok) out.push(...key.issues);
  const img = validateVisualImage(node.image);
  if (!img.ok) out.push(err(img.code, VISUAL_IMAGE_MESSAGES[img.code], "image"));
  return out;
}

/** The student projection: the strictly valid canonical public config (rebuilt) or null — never a repaired config. */
export function projectHotspotConfigForStudent(raw: unknown): HotspotConfigV1 | null {
  const r = validateHotspotConfig(raw);
  return r.ok ? r.config : null;
}

// ── student answers ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** x / y read from a submitted point (extra keys ignored, never trusted); null when either is not a finite number in [0, 1]. */
const readPoint = (p: unknown): NormalizedPoint | null => (isPlain(p) && isNormalizedCoordinate(p.x) && isNormalizedCoordinate(p.y) ? { x: p.x, y: p.y } : null);
/** The points of a well-formed hotspot response bounded by `max`, or null (wrong kind, malformed point, too many points). */
function responsePoints(response: unknown, max: number): NormalizedPoint[] | null {
  if (!isPlain(response) || response.kind !== "hotspot" || !Array.isArray(response.points) || response.points.length > max) return null;
  const out: NormalizedPoint[] = [];
  for (const p of response.points) { const q = readPoint(p); if (!q) return null; out.push(q); }
  return out;
}
export type HotspotAnswerResult = { ok: true; answer: HotspotAnswer } | { ok: false; code: string };
/** Unbound normalization (shape / bounds only): rebuilt to exactly { kind, points: [{ x, y }] } with ≤ HOTSPOT_LIMITS.points points. */
export function normalizeHotspotAnswer(a: unknown): HotspotAnswerResult {
  const points = responsePoints(a, HOTSPOT_LIMITS.points);
  return points ? { ok: true, answer: { kind: "hotspot", points } } : { ok: false, code: "HOTSPOT_ANSWER_INVALID" };
}
/**
 * Ingest binding (draft save / submit / pause): the answer must belong to a hotspot question; it is rebuilt to exactly
 * { kind, points: [{ x, y }] } (every foreign field — score, matched ids, regions, pixel sizes — dropped) and may carry at most the
 * question's `selections` points (the global bound when the published config is defective; grading still fails closed then).
 */
export function bindHotspotAnswerToQuestion(a: unknown, question: unknown): HotspotAnswerResult {
  if (!isPlain(question) || question.presentationType !== HOTSPOT_TYPE_KEY) return { ok: false, code: "HOTSPOT_QUESTION_MISMATCH" };
  const cfg = projectHotspotConfigForStudent(question.hotspot);
  const points = responsePoints(a, cfg ? cfg.selections : HOTSPOT_LIMITS.points);
  return points ? { ok: true, answer: { kind: "hotspot", points } } : { ok: false, code: "HOTSPOT_ANSWER_INVALID" };
}
/** answered ⇔ at least one point (mirrors answerState / exam-structure). */
export const isHotspotAnswerAnswered = (a: unknown): boolean => isPlain(a) && a.kind === "hotspot" && Array.isArray(a.points) && a.points.length > 0;

// ── grading + review ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type HotspotScore = { score: number; correct: boolean; manualReview: boolean; parts: { correct: number; total: number } };
/** The fail-closed result: invalid published authority yields no automatic academic mark and routes the question to manual review. */
export const HOTSPOT_FAIL_CLOSED: Readonly<HotspotScore> = Object.freeze({ score: 0, correct: false, manualReview: true, parts: Object.freeze({ correct: 0, total: 0 }) });
type Authority = { config: HotspotConfigV1; key: HotspotAnswerKeyV1 };
function authorityOf(rawConfig: unknown, rawKey: unknown, rawImage: unknown): Authority | null {
  const cfg = validateHotspotConfig(rawConfig);
  if (!cfg.ok) return null;
  const key = validateHotspotAnswerKey(rawKey, rawConfig);
  if (!key.ok || !validateVisualImage(rawImage).ok) return null;
  return { config: cfg.config, key: key.key };
}
/** The authoritative scorer (server grader + teacher review). Reads ONLY the response's normalized points. */
export function scoreHotspot(input: { config: unknown; answerKey: unknown; image: unknown; response: unknown; maxMarks: number }): HotspotScore {
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  const auth = authorityOf(input.config, input.answerKey, input.image);
  if (!auth) return { ...HOTSPOT_FAIL_CLOSED, parts: { ...HOTSPOT_FAIL_CLOSED.parts } };
  const total = auth.key.regions.length;
  const points = responsePoints(input.response, auth.config.selections);
  if (!points) return { score: 0, correct: false, manualReview: false, parts: { correct: 0, total } };
  const matched = maxOneToOneMatching(points, auth.key.regions.map(r => r.shape)).size;
  const all = matched === total;
  const score = auth.key.scoring === "allOrNothing" ? (all ? max : 0) : max * matched / total;
  return { score: Math.min(max, Math.max(0, score)), correct: all, manualReview: false, parts: { correct: matched, total } };
}
export type HotspotEvaluation =
  | { ok: true; matched: number; total: number; targets: { id: string; index: number; shape: VisualShape; matched: boolean }[]; points: { x: number; y: number; target: string | null }[] }
  | { ok: false; issues: HotspotIssue[] };
/** Teacher review only (it carries the private targets): per target matched / missed and per point the target it satisfied. */
export function evaluateHotspot(rawConfig: unknown, rawKey: unknown, rawImage: unknown, response: unknown): HotspotEvaluation {
  const auth = authorityOf(rawConfig, rawKey, rawImage);
  if (!auth) {
    const cfg = validateHotspotConfig(rawConfig), key = validateHotspotAnswerKey(rawKey, rawConfig), img = validateVisualImage(rawImage);
    return { ok: false, issues: [...(cfg.ok ? [] : cfg.issues), ...(cfg.ok && !key.ok ? key.issues : []), ...(img.ok ? [] : [err(img.code, VISUAL_IMAGE_MESSAGES[img.code], "image")])] };
  }
  const points = responsePoints(response, auth.config.selections) ?? [];
  const m = maxOneToOneMatching(points, auth.key.regions.map(r => r.shape));
  const hit = new Set(m.targetOfPoint.filter((j): j is number => j !== null));
  return {
    ok: true, matched: m.size, total: auth.key.regions.length,
    targets: auth.key.regions.map((r, j) => ({ id: r.id, index: j + 1, shape: r.shape, matched: hit.has(j) })),
    points: points.map((p, i) => { const j = m.targetOfPoint[i]; return { x: p.x, y: p.y, target: j === null ? null : auth.key.regions[j].id }; })
  };
}
