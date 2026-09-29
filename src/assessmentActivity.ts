// Phase 13C-A — INTERACTIVE ASSESSMENT CONTEXT: descriptor validation, data-only normalization, the adapter to the
// existing trusted activity engine, and the CODE-OWNED assessment-safe registry.
//
// Trust policy: a Learning activity is NOT exam-safe by default (learning renderers may reveal hints, keys, scaffolding).
// Only an identity enumerated in ASSESSMENT_SAFE_ACTIVITIES (repo code) is ever rendered live inside an exam; a stored
// `assessmentSafe: true` (or any other claim) carries ZERO authority. Persisted content can never name a component,
// module path, function, script or markup: such fields are validation issues AND are dropped before anything renders.
// 13C-A semantics: an activity is CONTEXT — it never sets, submits, grades or alters a student's response or marks.
import { createActivityRegistry, type LearningActivityRegistry, type RegisteredActivity } from "./learning/activities/engine";
import type { ActivityBlock } from "./learning/content/types";
import { ACTIVITY_KIND_LABEL } from "./learning/activities/labels";
import { ASSESSMENT_ACTIVITY_KINDS, type AssessmentActivityDescriptor, type AssessmentActivityKind } from "./assessmentTypes";
import { isSecretConfigKey } from "./secretKeyPolicy";

export { ASSESSMENT_ACTIVITY_KINDS };
export const ACTIVITY_DESCRIPTOR_FIELDS = ["id", "kind", "key", "version", "title", "description", "config", "placement"] as const;
/** Field names content might use to smuggle an executable / module / markup path. Never data; always rejected. */
export const EXECUTABLE_DESCRIPTOR_FIELDS = ["component", "module", "load", "loader", "render", "renderer", "import", "src", "srcdoc", "html", "script", "code", "eval", "path", "url", "handler", "onLoad", "onRender"] as const;
/** Field names content might use to claim trust. Ignored: the registry owns trust. */
export const TRUST_CLAIM_FIELDS = ["assessmentSafe", "trusted", "approved", "allowed", "safe", "examSafe"] as const;
// Config keys that would put a secret in the STUDENT-VISIBLE config: judged by the canonical secret-key policy (case /
// separator / spelling variants of the answer, correct, solution, hint, teacher, scoring, grading, secret … families),
// mirrored by the server sanitizer (api/src/lib/secret-key-policy.js) and pinned by secretKeyPolicy.parity.test.ts.
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const MAX_DEPTH = 12;

export type ActivityIssueCode = "MALFORMED" | "MISSING_ID" | "INVALID_KIND" | "MISSING_KEY" | "INVALID_KEY" | "INVALID_VERSION" | "INVALID_TEXT" | "INVALID_PLACEMENT" | "INVALID_CONFIG" | "SECRET_IN_CONFIG" | "EXECUTABLE_FIELD" | "TRUST_CLAIM_IGNORED";
export type ActivityIssue = { code: ActivityIssueCode; message: string; path?: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/** JSON data only: finite numbers, strings, booleans, null, arrays and plain objects — no functions, dates, classes, undefined. */
export function isJsonData(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(v => isJsonData(v, depth + 1));
  if (isPlainObject(value)) return Object.values(value).every(v => isJsonData(v, depth + 1));
  return false;
}
function collectSecretPaths(value: unknown, path: string, out: string[], depth = 0): void {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(value)) { value.forEach((v, i) => collectSecretPaths(v, path + "[" + i + "]", out, depth + 1)); return; }
  if (!isPlainObject(value)) return;
  for (const [k, v] of Object.entries(value)) { const p = path ? path + "." + k : k; if (isSecretConfigKey(k)) out.push(p); collectSecretPaths(v, p, out, depth + 1); }
}

export function validateActivityDescriptor(input: unknown): ActivityIssue[] {
  const issues: ActivityIssue[] = [];
  const add = (code: ActivityIssueCode, message: string, path?: string) => issues.push({ code, message, path });
  if (!isPlainObject(input)) return [{ code: "MALFORMED", message: "وصف النشاط غير صالح." }];
  const d = input;
  if (typeof d.id !== "string" || !d.id.trim()) add("MISSING_ID", "معرّف النشاط مطلوب.", "id");
  if (!(ASSESSMENT_ACTIVITY_KINDS as readonly string[]).includes(d.kind as string)) add("INVALID_KIND", "نوع النشاط غير مدعوم في سياق الامتحان.", "kind");
  if (typeof d.key !== "string" || !d.key.trim()) add("MISSING_KEY", "مفتاح النشاط مطلوب.", "key");
  else if (!KEY_PATTERN.test(d.key)) add("INVALID_KEY", "مفتاح النشاط يحتوي رموزًا غير مسموحة.", "key");
  if (typeof d.version !== "number" || !Number.isInteger(d.version) || d.version < 1) add("INVALID_VERSION", "إصدار النشاط يجب أن يكون عددًا صحيحًا موجبًا.", "version");
  for (const f of ["title", "description"] as const) if (d[f] !== undefined && typeof d[f] !== "string") add("INVALID_TEXT", "نص غير صالح: " + f, f);
  if (d.placement !== undefined && d.placement !== "before" && d.placement !== "after") add("INVALID_PLACEMENT", "موضع النشاط غير صالح.", "placement");
  if (d.config !== undefined) {
    if (!isPlainObject(d.config) || !isJsonData(d.config)) add("INVALID_CONFIG", "إعدادات النشاط يجب أن تكون بيانات JSON فقط.", "config");
    else { const paths: string[] = []; collectSecretPaths(d.config, "config", paths); for (const p of paths) add("SECRET_IN_CONFIG", "إعدادات النشاط مرئية للطالب — لا تضع إجابة أو مفتاح تصحيح أو تلميحًا فيها: " + p, p); }
  }
  for (const f of EXECUTABLE_DESCRIPTOR_FIELDS) if (f in d) add("EXECUTABLE_FIELD", "لا يمكن لمحتوى الامتحان تحديد مكوّن أو وحدة أو شيفرة: " + f, f);
  for (const f of TRUST_CLAIM_FIELDS) if (f in d) add("TRUST_CLAIM_IGNORED", "الوثوق بالنشاط يحدده كود المنصة فقط؛ الحقل يُهمل: " + f, f);
  return issues;
}
const STRUCTURAL: ReadonlySet<ActivityIssueCode> = new Set(["MALFORMED", "MISSING_ID", "INVALID_KIND", "MISSING_KEY", "INVALID_KEY", "INVALID_VERSION", "INVALID_CONFIG", "INVALID_TEXT", "INVALID_PLACEMENT"]);

/** The data-only descriptor (allowlisted fields) or null when structurally unusable. Trust claims / executable fields are dropped. */
export function normalizeActivityDescriptor(input: unknown): AssessmentActivityDescriptor | null {
  if (validateActivityDescriptor(input).some(i => STRUCTURAL.has(i.code))) return null;
  const d = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of ACTIVITY_DESCRIPTOR_FIELDS) if (d[f] !== undefined) out[f] = d[f];
  return out as unknown as AssessmentActivityDescriptor;
}

/** Adapter to the learning engine's block shape (so the SAME registry / host / boundary / fallback code runs). */
export function toActivityBlock(descriptor: AssessmentActivityDescriptor | unknown): ActivityBlock {
  const d = normalizeActivityDescriptor(descriptor);
  if (!d) return { id: "invalid-activity", type: "simulation", origin: "teacher-enrichment", version: 0, title: "نشاط تفاعلي", simulationType: "" };
  const base = { id: d.id, origin: "teacher-enrichment" as const, version: d.version, title: d.title || ACTIVITY_KIND_LABEL[d.kind], ...(d.description ? { description: d.description } : {}), ...(d.config ? { config: d.config } : {}) };
  switch (d.kind) {
    case "animation": return { ...base, type: "animation", animationType: d.key };
    case "interactive-diagram": return { ...base, type: "interactive-diagram", interactionType: d.key };
    default: return { ...base, type: "simulation", simulationType: d.key };
  }
}

// ── the assessment-safe registry (REPO CODE is the only authority) ────────────────────────────────────────────────
/**
 * Renderers explicitly approved for EXAM context. 13C-A ships ZERO: no existing production learning renderer has been
 * proven free of hints / keys / scaffolding, and inventing a demo simulation for production is out of scope. Adding an
 * entry here (a literal `load: () => import("./…")`) is the ONLY way an identity becomes exam-safe.
 */
export const ASSESSMENT_SAFE_ACTIVITIES: readonly RegisteredActivity[] = [];
export const assessmentActivityRegistry: LearningActivityRegistry = createActivityRegistry(ASSESSMENT_SAFE_ACTIVITIES);
/** An empty registry: passed as `builtins` to the host so learning-only built-in presenters are never consulted in an exam. */
export const emptyActivityRegistry: LearningActivityRegistry = createActivityRegistry([]);

export function isAssessmentSafe(descriptor: AssessmentActivityDescriptor | unknown, registry: LearningActivityRegistry = assessmentActivityRegistry): boolean {
  const d = normalizeActivityDescriptor(descriptor);
  return !!d && !!registry.resolve(toActivityBlock(d));
}
export const activityKindLabel = (kind: AssessmentActivityKind): string => ACTIVITY_KIND_LABEL[kind];
