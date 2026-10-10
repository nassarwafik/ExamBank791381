// Phase 21D-B.3 — meshPartSelection@1: the student selects NAMED PARTS of a realistic 3D mesh model (MeshModelSpecV1: a reviewed library
// asset or a server-validated upload). Student answers carry stable part ids only — never pixels, camera angles, renderer or asset state —
// so grading is purely semantic and independent of WebGL, the network or the asset bytes: a student whose device cannot draw the model
// still answers through the accessible parts list, and no infrastructure failure can turn into a mark. The answer key (correct part ids,
// scoring) lives in `answer`, which the student sanitizer removes; the model itself carries no key and is projected unchanged.
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import { CONTROL, RAW_HTML, UNSAFE_BIDI, UNSAFE_INVISIBLE } from "./richContent/proseGuard";
import { isMeshPartId } from "./meshModels/glbAsset";
import { isMeshModelId, validateMeshModelSpec, type MeshModelPartV1, type MeshModelSpecV1 } from "./meshModels/meshModelSpec";

export const MESH_PART_SELECTION_TYPE_KEY = "meshPartSelection";
export const MESH_PART_SELECTION_LIMITS = Object.freeze({ labelChars: 160, minParts: 2, responseParts: 64 });
export const MESH_PART_SELECTION_MODES = Object.freeze(["single", "multiple"] as const);
export type MeshPartSelectionMode = (typeof MESH_PART_SELECTION_MODES)[number];
export const MESH_PART_SELECTION_SCORING = Object.freeze(["allOrNothing", "partial"] as const);
export type MeshPartSelectionScoring = (typeof MESH_PART_SELECTION_SCORING)[number];
/** `hideLabels`: the student sees neutral part names («الجزء ١»…) instead of the teacher's labels — for identification questions. This is
 *  PEDAGOGICAL (the list no longer names the answer), not secrecy: part ids stay visible to the client, as target keys do in
 *  scene3DSelection@1, and the correct parts are never sent. */
export type MeshPartSelectionConfigV1 = { v: 1; model: MeshModelSpecV1; mode: MeshPartSelectionMode; maxSelections: number; label?: string; hideLabels?: true };
export type MeshPartSelectionAnswerKeyV1 = { scoring: MeshPartSelectionScoring; correct: string[] };
export type MeshPartSelectionAnswer = { kind: "meshPartSelection"; modelId: string; parts: string[] };
export type MeshPartSelectionIssue = { code: string; message: string; severity: "error"; path?: string };

const err = (code: string, message: string, path?: string): MeshPartSelectionIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) return false; const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]) => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN.has(k));
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export const defaultMeshPartSelectionAnswerKey = (): MeshPartSelectionAnswerKeyV1 => ({ scoring: "allOrNothing", correct: [] });
export const meshPartSelectionQuestionVersion = (node: unknown): number | undefined => isPlain(node) ? effectiveQuestionTypeVersion(MESH_PART_SELECTION_TYPE_KEY, node.questionTypeVersion) : undefined;

export type MeshPartSelectionConfigResult = { ok: true; config: MeshPartSelectionConfigV1; parts: MeshModelPartV1[]; issues: [] } | { ok: false; issues: MeshPartSelectionIssue[] };
export function validateMeshPartSelectionConfig(raw: unknown): MeshPartSelectionConfigResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("MESH_SELECTION_CONFIG_MISSING", "إعداد سؤال الاختيار من نموذج ثلاثي الأبعاد مفقود؛ اختر نموذجًا وسمِّ أجزاءه.", "meshPartSelection")] };
  const issues: MeshPartSelectionIssue[] = [];
  if (!onlyKeys(raw, ["v", "model", "mode", "maxSelections", "label", "hideLabels"])) issues.push(err("MESH_SELECTION_UNKNOWN_KEY", "إعداد السؤال يحتوي حقولًا غير معروفة.", "meshPartSelection"));
  if (raw.v !== 1) issues.push(err("MESH_SELECTION_VERSION", "إصدار إعداد السؤال غير مدعوم.", "meshPartSelection.v"));
  const model = validateMeshModelSpec(raw.model);
  if (!model.ok) issues.push(...model.issues.slice(0, 10).map(i => err("MESH_SELECTION_MODEL_INVALID", i.message + " [" + i.code + "]", "meshPartSelection." + i.path)));
  const mode = raw.mode;
  if (typeof mode !== "string" || !(MESH_PART_SELECTION_MODES as readonly string[]).includes(mode)) issues.push(err("MESH_SELECTION_MODE_INVALID", "طريقة الاختيار غير معروفة.", "meshPartSelection.mode"));
  let label: string | undefined;
  if (own(raw, "label")) {
    const l = raw.label;
    if (typeof l !== "string" || !l.trim() || l.trim().length > MESH_PART_SELECTION_LIMITS.labelChars || CONTROL.test(l) || RAW_HTML.test(l) || UNSAFE_BIDI.test(l) || UNSAFE_INVISIBLE.test(l)) issues.push(err("MESH_SELECTION_LABEL_INVALID", "تعليمة الاختيار نص عادي غير فارغ حتى 160 حرفًا.", "meshPartSelection.label"));
    else label = l.trim();
  }
  if (own(raw, "hideLabels") && raw.hideLabels !== true) issues.push(err("MESH_SELECTION_HIDE_LABELS_INVALID", "إخفاء التسميات قيمته true أو يُحذف الحقل.", "meshPartSelection.hideLabels"));
  const parts = model.ok ? model.value.parts : [];
  if (model.ok && parts.length < MESH_PART_SELECTION_LIMITS.minParts) issues.push(err("MESH_SELECTION_PARTS_TOO_FEW", "يحتاج السؤال جزأين مسمّيين على الأقل يختار الطالب بينهما.", "meshPartSelection.model.parts"));
  const max = raw.maxSelections;
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || (parts.length > 0 && max > parts.length) || (mode === "single" && max !== 1)) issues.push(err("MESH_SELECTION_MAX_INVALID", "الحد الأقصى للاختيارات غير صالح.", "meshPartSelection.maxSelections"));
  if (issues.length || !model.ok) return { ok: false, issues };
  return { ok: true, config: { v: 1, model: model.value, mode: mode as MeshPartSelectionMode, maxSelections: max as number, ...(label ? { label } : {}), ...(raw.hideLabels === true ? { hideLabels: true as const } : {}) }, parts, issues: [] };
}

type Cfg = { config: MeshPartSelectionConfigV1; parts: MeshModelPartV1[] };
type KeyResult = { ok: true; key: MeshPartSelectionAnswerKeyV1; issues: [] } | { ok: false; issues: MeshPartSelectionIssue[] };
function checkKey(raw: unknown, cfg: Cfg | null): KeyResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("MESH_SELECTION_KEY_INVALID", "مفتاح تصحيح السؤال مفقود أو غير صالح.", "answer")] };
  const issues: MeshPartSelectionIssue[] = [];
  if (!onlyKeys(raw, ["scoring", "correct"])) issues.push(err("MESH_SELECTION_KEY_INVALID", "مفتاح التصحيح يحتوي حقولًا غير معروفة.", "answer"));
  const scoring = raw.scoring;
  if (typeof scoring !== "string" || !(MESH_PART_SELECTION_SCORING as readonly string[]).includes(scoring)) issues.push(err("MESH_SELECTION_SCORING_UNKNOWN", "طريقة الاحتساب غير معروفة.", "answer.scoring"));
  const correct = raw.correct;
  if (!Array.isArray(correct) || correct.some(x => typeof x !== "string")) { issues.push(err("MESH_SELECTION_KEY_INVALID", "الأجزاء الصحيحة غير صالحة.", "answer.correct")); return { ok: false, issues }; }
  if (!cfg) return issues.length ? { ok: false, issues } : { ok: true, key: { scoring: scoring as MeshPartSelectionScoring, correct: [...(correct as string[])] }, issues: [] };
  if (cfg.config.mode === "single" && scoring === "partial") issues.push(err("MESH_SELECTION_SCORING_UNKNOWN", "الاختيار الواحد يُصحَّح بالكل أو لا شيء.", "answer.scoring"));
  const order = cfg.parts.map(p => p.id), keys = correct as string[];
  if (!keys.length) issues.push(err("MESH_SELECTION_KEY_EMPTY", "حدّد الجزء الصحيح (أو الأجزاء الصحيحة) على النموذج.", "answer.correct"));
  if (new Set(keys).size !== keys.length) issues.push(err("MESH_SELECTION_KEY_DUPLICATE", "الإجابة الصحيحة مكررة.", "answer.correct"));
  const unknown = keys.filter(k => !order.includes(k));
  if (unknown.length) issues.push(err("MESH_SELECTION_KEY_UNKNOWN_PART", "مفتاح التصحيح يذكر جزءًا غير مسمّى في النموذج: «" + unknown[0].slice(0, 48) + "».", "answer.correct"));
  if (cfg.config.mode === "single" && keys.length > 1) issues.push(err("MESH_SELECTION_KEY_SINGLE", "الاختيار الواحد له إجابة صحيحة واحدة.", "answer.correct"));
  if (keys.length > cfg.config.maxSelections) issues.push(err("MESH_SELECTION_KEY_UNREACHABLE", "عدد الأجزاء الصحيحة أكبر من الحد المتاح للطالب.", "answer.correct"));
  return issues.length ? { ok: false, issues } : { ok: true, key: { scoring: scoring as MeshPartSelectionScoring, correct: order.filter(k => keys.includes(k)) }, issues: [] };
}
export function validateMeshPartSelectionAnswerKey(raw: unknown, rawConfig: unknown): KeyResult {
  const cfg = validateMeshPartSelectionConfig(rawConfig);
  if (!cfg.ok) return { ok: false, issues: [err("MESH_SELECTION_KEY_CONFIG_INVALID", "لا يمكن فحص المفتاح لأن إعداد السؤال غير صالح.", "meshPartSelection")] };
  return checkKey(raw, cfg);
}
export function validateMeshPartSelectionQuestion(node: Record<string, unknown>): MeshPartSelectionIssue[] {
  const out: MeshPartSelectionIssue[] = [];
  if (meshPartSelectionQuestionVersion(node) === undefined) out.push(err("MESH_SELECTION_VERSION_UNSUPPORTED", "إصدار السؤال غير مدعوم.", "questionTypeVersion"));
  const cfg = validateMeshPartSelectionConfig(node.meshPartSelection); if (!cfg.ok) out.push(...cfg.issues);
  const key = checkKey(node.answer, cfg.ok ? cfg : null); if (!key.ok) out.push(...key.issues);
  return out;
}
/** Arabic-Indic ordinal names for hidden-label questions («الجزء ١»…). */
export const meshNeutralPartLabel = (i: number): string => "الجزء " + String(i + 1).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
/** The student projection: the canonical config (the model holds no answer data); with `hideLabels` the teacher's labels and part
 *  descriptions are replaced by neutral names BEFORE anything leaves the server. null when the config is not valid. */
export function projectMeshPartSelectionConfigForStudent(raw: unknown): MeshPartSelectionConfigV1 | null {
  const r = validateMeshPartSelectionConfig(raw);
  if (!r.ok) return null;
  if (!r.config.hideLabels) return r.config;
  return { ...r.config, model: { ...r.config.model, parts: r.config.model.parts.map((p, i) => ({ id: p.id, label: meshNeutralPartLabel(i) })) } };
}

type ReadResult = { ok: true; parts: string[] } | { ok: false; code: string };
function readResponse(response: unknown, cfg: Cfg): ReadResult {
  if (!isPlain(response) || response.kind !== "meshPartSelection" || !Array.isArray(response.parts)) return { ok: false, code: "MESH_SELECTION_ANSWER_INVALID" };
  if (response.modelId !== cfg.config.model.id) return { ok: false, code: "MESH_SELECTION_MODEL_MISMATCH" };
  const given = response.parts;
  if (given.length > Math.min(cfg.config.maxSelections, MESH_PART_SELECTION_LIMITS.responseParts)) return { ok: false, code: "MESH_SELECTION_TOO_MANY" };
  if (given.some(k => typeof k !== "string")) return { ok: false, code: "MESH_SELECTION_ANSWER_INVALID" };
  const order = cfg.parts.map(p => p.id);
  if ((given as string[]).some(k => !order.includes(k))) return { ok: false, code: "MESH_SELECTION_PART_UNKNOWN" };
  if (new Set(given).size !== given.length) return { ok: false, code: "MESH_SELECTION_DUPLICATE" };
  return { ok: true, parts: order.filter(k => (given as string[]).includes(k)) };
}
export type MeshPartSelectionAnswerResult = { ok: true; answer: MeshPartSelectionAnswer } | { ok: false; code: string };
export function normalizeMeshPartSelectionAnswer(a: unknown): MeshPartSelectionAnswerResult {
  if (!isPlain(a) || a.kind !== "meshPartSelection" || !isMeshModelId(a.modelId) || !Array.isArray(a.parts) || !onlyKeys(a, ["kind", "modelId", "parts"])) return { ok: false, code: "MESH_SELECTION_ANSWER_INVALID" };
  if (a.parts.length > MESH_PART_SELECTION_LIMITS.responseParts) return { ok: false, code: "MESH_SELECTION_TOO_MANY" };
  if (a.parts.some(k => !isMeshPartId(k) || FORBIDDEN.has(k as string))) return { ok: false, code: "MESH_SELECTION_ANSWER_INVALID" };
  if (new Set(a.parts).size !== a.parts.length) return { ok: false, code: "MESH_SELECTION_DUPLICATE" };
  return { ok: true, answer: { kind: "meshPartSelection", modelId: a.modelId, parts: [...(a.parts as string[])] } };
}
/** Draft / submission binding: the shape check, then (when the published question is valid) the question's own parts and limits. */
export function bindMeshPartSelectionAnswerToQuestion(a: unknown, question: unknown): MeshPartSelectionAnswerResult {
  const shape = normalizeMeshPartSelectionAnswer(a); if (!shape.ok) return shape;
  const cfg = isPlain(question) ? validateMeshPartSelectionConfig(question.meshPartSelection) : null;
  if (!cfg || !cfg.ok) return shape;
  const r = readResponse(shape.answer, cfg);
  return r.ok ? { ok: true, answer: { kind: "meshPartSelection", modelId: cfg.config.model.id, parts: r.parts } } : r;
}
export const isMeshPartSelectionAnswerAnswered = (a: unknown): boolean => isPlain(a) && a.kind === "meshPartSelection" && Array.isArray(a.parts) && a.parts.length > 0;

export type MeshPartSelectionScore = { score: number; correct: boolean; manualReview: boolean; parts: { correct: number; total: number } };
/** A question whose config or key cannot be classified with certainty never yields an automatic mark: teacher review. */
export const MESH_PART_SELECTION_FAIL_CLOSED: Readonly<MeshPartSelectionScore> = Object.freeze({ score: 0, correct: false, manualReview: true, parts: Object.freeze({ correct: 0, total: 0 }) });
type Authority = Cfg & { key: MeshPartSelectionAnswerKeyV1 };
function authorityOf(rawConfig: unknown, rawKey: unknown): Authority | null {
  const cfg = validateMeshPartSelectionConfig(rawConfig); if (!cfg.ok) return null;
  const key = checkKey(rawKey, cfg); return key.ok ? { config: cfg.config, parts: cfg.parts, key: key.key } : null;
}
export function scoreMeshPartSelection(input: { config: unknown; answerKey: unknown; response: unknown; maxMarks: number }): MeshPartSelectionScore {
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0, auth = authorityOf(input.config, input.answerKey);
  if (!auth) return { ...MESH_PART_SELECTION_FAIL_CLOSED, parts: { ...MESH_PART_SELECTION_FAIL_CLOSED.parts } };
  const total = auth.key.correct.length, r = readResponse(input.response, auth);
  if (!r.ok) return { score: 0, correct: false, manualReview: false, parts: { correct: 0, total } };
  const hits = r.parts.filter(k => auth.key.correct.includes(k)).length, union = new Set([...r.parts, ...auth.key.correct]).size;
  const exact = hits === total && r.parts.length === total;
  const score = auth.key.scoring === "allOrNothing" ? (exact ? max : 0) : max * hits / Math.max(1, union);
  return { score: Math.min(max, Math.max(0, score)), correct: exact, manualReview: false, parts: { correct: hits, total } };
}
export type MeshPartSelectionEvaluation =
  | { ok: true; correct: number; total: number; exact: boolean; results: { id: string; label: string; selected: boolean; expected: boolean; mark: "correct" | "incorrect" | "missed" | null }[] }
  | { ok: false; issues: MeshPartSelectionIssue[] };
/** Teacher review: every labelled part with what the student selected and what the key expects. */
export function evaluateMeshPartSelection(rawConfig: unknown, rawKey: unknown, rawResponse: unknown): MeshPartSelectionEvaluation {
  const auth = authorityOf(rawConfig, rawKey);
  if (!auth) { const cfg = validateMeshPartSelectionConfig(rawConfig); return { ok: false, issues: cfg.ok ? validateMeshPartSelectionAnswerKey(rawKey, rawConfig).issues : cfg.issues }; }
  const r = readResponse(rawResponse, auth), chosen = new Set(r.ok ? r.parts : []);
  const results = auth.parts.map(p => {
    const selected = chosen.has(p.id), expected = auth.key.correct.includes(p.id);
    return { id: p.id, label: p.label, selected, expected, mark: selected && expected ? "correct" as const : selected ? "incorrect" as const : expected ? "missed" as const : null };
  });
  const hits = results.filter(x => x.mark === "correct").length;
  return { ok: true, correct: hits, total: auth.key.correct.length, exact: hits === auth.key.correct.length && chosen.size === hits, results };
}
