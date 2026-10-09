// Phase 20D — the STRICT composite@1 authority (pure; compiled into the shared server build). ONE structure validator used by finalization,
// the student projection, the nested answer binding and the official grader, so they can never disagree: a composite the projection withholds
// is also one the grader fails closed and finalization blocks. It reuses the existing authorities and never forks them:
//   • shared static sources → the Phase 19G SourceStimulusV1 validator (validateSourceStimulus: text / image / table / code, strict),
//   • shared SmartSim contexts → the Phase 20A envelope authority (validateSmartSimEnvelope, exact plugin identity),
//   • a linked SmartSim part's private checks → validateSmartSimAnswerKey against the CONTEXT's plugin and canonical config,
//   • every other child body → the SAME validator a standalone question of that type runs (examQuality.validateBody, by the caller).
// Light identities / marks / first-N live in ./compositeModel (re-exported here). Data only: no module, component, path, script, grader or
// renderer can be named; the child vocabulary below is code-owned; versions are exact (no latest, no fallback, no repair).
import { effectiveQuestionTypeVersion, isKnownQuestionType, questionTypeDefinition } from "./questionTypeCatalog";
import { validateSourceStimulus, type SourceStimulusV1 } from "./scenarioSource";
import { validateSmartSimEnvelope, validateSmartSimAnswerKey, type SmartSimEnvelopeV1 } from "./trustedSimPlugins";
import { COMPOSITE_LIMITS, compositeShape, isCompositeQuestionNode, isCompositeQuestionId, compositeQuestionVersion, type CompositeShape } from "./compositeModel";

export * from "./compositeModel";

/** The code-owned child vocabulary of composite@1 (EXACT identities). compound / composite never nest. */
export const COMPOSITE_CHILD_IDENTITIES: readonly string[] = Object.freeze([
  "multipleChoice@1", "trueFalse@1", "multiTrueFalse@1", "shortAnswer@1", "fillBlank@1", "wordBank@1", "matching@1", "ordering@1", "tableFill@1", "cliFill@1",
  "multipleSelect@1", "numericResponse@1", "matrix@1", "categorization@1", "simulation@1", "coding@1", "coding@2", "coding@3", "networkCli@1", "inlineCloze@1",
  "parametricNumeric@1", "hotspot@1", "labelDiagram@1", "openResponse@1", "smartSim@1",
  // Phase 21A.1 — a chart-selection part (its chart is self-contained; a shared chart stimulus lives in a rich SOURCE context)
  "chartSelection@1"]);
const CHILD_IDENTITY_SET: ReadonlySet<string> = new Set(COMPOSITE_CHILD_IDENTITIES);
export const REFUSED_COMPOSITE_CHILD_TYPES: readonly string[] = Object.freeze(["compound", "composite"]);
/** EXACT key (no case folding, no alias) + the catalog's effective version (absent ⇒ 1); anything else is unsupported. */
export function isSupportedCompositeChild(type: unknown, version: unknown): boolean {
  if (typeof type !== "string" || REFUSED_COMPOSITE_CHILD_TYPES.includes(type) || !isKnownQuestionType(type) || questionTypeDefinition(type)?.key !== type) return false;
  const v = effectiveQuestionTypeVersion(type, version);
  return v !== undefined && CHILD_IDENTITY_SET.has(type + "@" + v);
}

// ── exact keys ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ROOT_KEYS: ReadonlySet<string> = new Set(["v", "contexts", "groups"]);
const SOURCE_CONTEXT_KEYS: ReadonlySet<string> = new Set(["id", "version", "kind", "title", "instructions", "sources"]);
const SMARTSIM_CONTEXT_KEYS: ReadonlySet<string> = new Set(["id", "version", "kind", "title", "instructions", "smartSim"]);
const GROUP_KEYS: ReadonlySet<string> = new Set(["id", "title", "instructions", "gradingPolicy", "requiredAnswers", "maxMarks", "parts"]);
/** Question-level keys a composite may carry (its children live ONLY under `composite`; `parts` would make it a legacy compound). */
const QUESTION_KEYS: ReadonlySet<string> = new Set(["examQuestionId", "id", "number", "displayNumber", "presentationType", "type", "questionTypeVersion", "text", "marks", "composite", "answer", "assessmentMeta", "groupId", "activity", "codeStimulus", "image", "images", "richContent", "presentation"]);
/** Phase 20G (D2) — the ONE canonical exam content form (api exam-canonical.js: every saved working copy and every immutable governance
 *  revision) stamps per-question edit bookkeeping `history: []` / `redoStack: []`. Exactly that form — both keys as EMPTY arrays — is
 *  academically inert and tolerated; any other value of them stays an unknown key (refused). */
const canonicalBookkeeping = (k: string, v: unknown): boolean => (k === "history" || k === "redoStack") && Array.isArray(v) && v.length === 0;
// Phase 20D.1 — `richContent` (a RichContentV1 prompt, presentation only; validated by examQuality, strictly projected by the sanitizer).
const PART_COMMON_KEYS: readonly string[] = ["id", "label", "type", "questionTypeVersion", "text", "marks", "contextId", "answer", "image", "images", "assessmentMeta", "richContent"];
/** Type-owned configuration keys a child of that type may carry (every other config key is FOREIGN to it). */
const PART_TYPE_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  multipleChoice: ["options"], trueFalse: ["options"], multiTrueFalse: ["fields"], shortAnswer: [], fillBlank: ["fields", "wordBank"], wordBank: ["fields", "wordBank"],
  matching: ["fields", "tableHeaders"], ordering: ["fields", "wordBank"], tableFill: ["fields", "tableHeaders", "tableRows"], cliFill: ["fields", "cli"],
  multipleSelect: ["options"], numericResponse: ["numeric"], matrix: ["matrix"], categorization: ["categorization"], simulation: ["simulation"], coding: ["coding"],
  networkCli: ["networkCli"], inlineCloze: ["inlineCloze"], parametricNumeric: ["parametric"], hotspot: ["hotspot"], labelDiagram: ["labelDiagram"],
  openResponse: ["openResponse"], smartSim: ["smartSim"], chartSelection: ["chartSelection"]
});
const ALL_CONFIG_KEYS: ReadonlySet<string> = new Set(Object.values(PART_TYPE_KEYS).flat());

export type CompositeIssue = { code: string; message: string; severity: "error"; path?: string };
export type CompositeContextModel =
  | { id: string; kind: "source"; title?: string; instructions?: string; sources: SourceStimulusV1[] }
  | { id: string; kind: "smartSim"; title?: string; instructions?: string; envelope: SmartSimEnvelopeV1 };
export type CompositePartModel = { id: string; groupId: string; index: number; label: string; type: string; marks: number; contextId?: string; linkedSmartSim: boolean; raw: Record<string, unknown> };
export type CompositeGroupModel = { id: string; title?: string; instructions?: string; gradingPolicy: "all" | "firstNAnswered"; requiredAnswers: number | null; maxMarks: number | null; officialMax: number; parts: CompositePartModel[] };
export type CompositeModel = { officialMax: number; shape: CompositeShape; contexts: CompositeContextModel[]; groups: CompositeGroupModel[]; partById: Map<string, CompositePartModel>; contextById: Map<string, CompositeContextModel> };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const err = (code: string, message: string, path?: string): CompositeIssue => (path === undefined ? { code, message, severity: "error" } : { code, message, severity: "error", path });
const ORDINALS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي", "ك", "ل", "م", "ن", "س", "ع", "ف", "ص", "ق", "ر", "ش", "ت", "ث", "خ", "ذ", "ض", "ظ", "غ"];
/** Serialized size of the composite root with embedded image data URLs excluded (images keep their own canonical media bounds). */
function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? (i++, 4) : 3; }
  return n;
}
function configBytes(root: unknown): number {
  // 20D RF1 (review note N1) — only an IMAGE payload (a `dataUrl` field holding a data: image, bounded by its own media validator) is
  // excluded from the 1 MB authoring bound; any other string counts, whatever it starts with.
  try { return utf8Bytes(JSON.stringify(root, (k, v) => (k === "dataUrl" && typeof v === "string" && v.startsWith("data:image/") ? "" : v)) ?? ""); } catch { return Infinity; }
}
const optText = (v: unknown, max: number): boolean => v === undefined || (typeof v === "string" && v.length <= max);

/**
 * THE strict structure authority (no child-body validation — that is the type's own validator). → the canonical model or the issues.
 * Fails closed on: unknown keys at every composite level, nested compound / composite children, a child carrying another type's config,
 * malformed / future contexts, invalid sources, an invalid shared envelope, a linked SmartSim part carrying its own envelope or no context,
 * an independent SmartSim part without an envelope, bounds, and every light-shape rule (ids, policies, first-N, mark invariants, references).
 * Unknown or unsupported child type VERSIONS are reported by validateCompositeQuestion (finalization) and fail closed per PART at grading.
 */
export function compositeStructure(node: unknown): { ok: true; model: CompositeModel } | { ok: false; issues: CompositeIssue[] } {
  const shaped = compositeShape(node);
  const issues: CompositeIssue[] = shaped.ok ? [] : shaped.issues.map(i => err(i.code, i.message, i.path));
  if (!isCompositeQuestionNode(node) || !isObj(node.composite)) return { ok: false, issues: issues.length ? issues : [err("COMPOSITE_MISSING", "بنية السؤال المركّب المتقدّم مفقودة.", "composite")] };
  const root = node.composite;
  if ("parts" in node) issues.push(err("COMPOSITE_UNKNOWN_KEY", "السؤال المركّب المتقدّم لا يحمل بنودًا قديمة (parts)؛ البنود داخل المجموعات فقط.", "parts"));
  for (const k of Object.keys(root)) if (!ROOT_KEYS.has(k)) issues.push(err("COMPOSITE_UNKNOWN_KEY", "حقل غير مسموح في السؤال المركّب: " + k, "composite." + k));
  if (configBytes(root) > COMPOSITE_LIMITS.configBytes) issues.push(err("COMPOSITE_LIMIT", "حجم بيانات السؤال المركّب يتجاوز الحد المسموح.", "composite"));
  const contexts: CompositeContextModel[] = [];
  const sourceIds = new Set<string>();
  (Array.isArray(root.contexts) ? root.contexts : []).forEach((c, i) => {
    const path = "composite.contexts[" + i + "]";
    if (!isObj(c)) return;                                                                         // reported by the shape
    const allowed = c.kind === "source" ? SOURCE_CONTEXT_KEYS : c.kind === "smartSim" ? SMARTSIM_CONTEXT_KEYS : null;
    if (!allowed) return;                                                                           // COMPOSITE_CONTEXT_INVALID (shape)
    for (const k of Object.keys(c)) if (!allowed.has(k)) issues.push(err("COMPOSITE_UNKNOWN_KEY", "حقل غير مسموح في السياق المشترك: " + k, path + "." + k));
    if (!optText(c.title, COMPOSITE_LIMITS.titleChars) || !optText(c.instructions, COMPOSITE_LIMITS.instructionsChars)) issues.push(err("COMPOSITE_LIMIT", "عنوان السياق أو تعليماته طويلة جدًا أو غير نصية.", path));
    const head = { id: String(c.id), ...(typeof c.title === "string" ? { title: c.title } : {}), ...(typeof c.instructions === "string" ? { instructions: c.instructions } : {}) };
    if (c.kind === "source") {
      const list = c.sources;
      if (!Array.isArray(list) || list.length === 0 || list.length > COMPOSITE_LIMITS.sourcesPerContext) { issues.push(err("COMPOSITE_SOURCE_INVALID", "مصدر مشترك بلا محتوى أو بعدد يتجاوز الحد (" + COMPOSITE_LIMITS.sourcesPerContext + ").", path + ".sources")); return; }
      const sources: SourceStimulusV1[] = [];
      list.forEach((s, si) => {
        const r = validateSourceStimulus(s, path + ".sources[" + si + "]");
        if (!r.ok) { issues.push(err("COMPOSITE_SOURCE_INVALID", r.issues.map(x => x.message).join(" — ") || "مصدر غير صالح.", path + ".sources[" + si + "]")); return; }
        if (sourceIds.has(r.source.id)) { issues.push(err("COMPOSITE_ID_DUPLICATE", "معرّف مصدر مكرّر: " + r.source.id, path + ".sources[" + si + "].id")); return; }
        sourceIds.add(r.source.id); sources.push(r.source);
      });
      contexts.push({ ...head, kind: "source", sources });
    } else {
      const env = validateSmartSimEnvelope(c.smartSim);
      if (!env.ok) { issues.push(err("COMPOSITE_SMARTSIM_CONTEXT_INVALID", "إعداد المحاكاة المشتركة غير صالح: " + env.issues.map(x => x.message).join(" — "), path + ".smartSim")); return; }
      contexts.push({ ...head, kind: "smartSim", envelope: env.envelope });
    }
  });
  const contextById = new Map(contexts.map(c => [c.id, c]));
  const groups: CompositeGroupModel[] = [];
  const partById = new Map<string, CompositePartModel>();
  let ordinal = 0;
  (Array.isArray(root.groups) ? root.groups : []).forEach((g, gi) => {
    const path = "composite.groups[" + gi + "]";
    if (!isObj(g)) return;
    for (const k of Object.keys(g)) if (!GROUP_KEYS.has(k)) issues.push(err("COMPOSITE_UNKNOWN_KEY", "حقل غير مسموح في المجموعة: " + k, path + "." + k));
    if (!optText(g.title, COMPOSITE_LIMITS.titleChars) || !optText(g.instructions, COMPOSITE_LIMITS.instructionsChars)) issues.push(err("COMPOSITE_LIMIT", "عنوان المجموعة أو تعليماتها طويلة جدًا أو غير نصية.", path));
    const parts: CompositePartModel[] = [];
    (Array.isArray(g.parts) ? g.parts : []).forEach((p, pi) => {
      const pp = path + ".parts[" + pi + "]";
      const index = ordinal++;
      if (!isObj(p)) return;
      const type = typeof p.type === "string" ? p.type : "";
      if (REFUSED_COMPOSITE_CHILD_TYPES.includes(type)) { issues.push(err("COMPOSITE_CHILD_TYPE_REFUSED", "لا يمكن تضمين سؤال مركّب داخل سؤال مركّب.", pp + ".type")); return; }
      // an unknown / case-variant type key is a broken AUTHORITY (the whole composite fails closed); an unsupported VERSION of a known child
      // family fails closed for that part only (validateCompositeQuestion blocks it at finalization)
      if (!Object.prototype.hasOwnProperty.call(PART_TYPE_KEYS, type)) { issues.push(err("COMPOSITE_CHILD_TYPE_UNSUPPORTED", "نوع البند غير مدعوم داخل السؤال المركّب: " + type.slice(0, 40), pp + ".type")); return; }
      const own = new Set(PART_TYPE_KEYS[type]);
      for (const k of Object.keys(p)) {
        if (PART_COMMON_KEYS.includes(k) || own.has(k)) continue;
        issues.push(ALL_CONFIG_KEYS.has(k) ? err("COMPOSITE_CHILD_CONFIG_FOREIGN", "إعداد «" + k + "» لا ينتمي إلى نوع البند «" + type + "».", pp + "." + k) : err("COMPOSITE_UNKNOWN_KEY", "حقل غير مسموح في البند: " + k, pp + "." + k));
      }
      if (!optText(p.label, COMPOSITE_LIMITS.labelChars) || !optText(p.text, 20000)) issues.push(err("COMPOSITE_LIMIT", "تسمية البند أو نصه طويلة جدًا أو غير نصية.", pp));
      const linked = type === "smartSim" && p.contextId !== undefined;
      if (type === "smartSim") {
        if (linked && "smartSim" in p) issues.push(err("COMPOSITE_SMARTSIM_LINKED_ENVELOPE", "بند المحاكاة المرتبط بسياق مشترك يقرأ إعداد السياق فقط؛ لا يحمل إعداد محاكاة خاصًا به.", pp + ".smartSim"));
        if (!linked && !("smartSim" in p)) issues.push(err("COMPOSITE_SMARTSIM_CONTEXT_REQUIRED", "بند المحاكاة يحتاج سياق محاكاة مشتركًا أو إعداد محاكاة مستقلًا.", pp));
      }
      if (typeof p.id !== "string" || typeof p.marks !== "number") return;                          // reported by the shape
      const label = typeof p.label === "string" && p.label.trim() ? p.label : ORDINALS[index] || String(index + 1);
      const part: CompositePartModel = { id: p.id, groupId: String(g.id), index, label, type, marks: p.marks, ...(typeof p.contextId === "string" ? { contextId: p.contextId } : {}), linkedSmartSim: linked, raw: p };
      parts.push(part); partById.set(part.id, part);
    });
    const sg = shaped.ok ? shaped.shape.groups.find(x => x.id === g.id) : undefined;
    groups.push({ id: String(g.id), ...(typeof g.title === "string" ? { title: g.title } : {}), ...(typeof g.instructions === "string" ? { instructions: g.instructions } : {}), gradingPolicy: g.gradingPolicy === "firstNAnswered" ? "firstNAnswered" : "all", requiredAnswers: sg ? sg.requiredAnswers : null, maxMarks: sg ? sg.maxMarks : null, officialMax: sg ? sg.officialMax : 0, parts });
  });
  if (issues.length || !shaped.ok) return { ok: false, issues };
  return { ok: true, model: { officialMax: shaped.shape.officialMax, shape: shaped.shape, contexts, groups, partById, contextById } };
}

/** The question-like node of ONE child, exactly as its own type's validator / grader / projection / binder reads a standalone question. */
export function compositeChildNode(part: Record<string, unknown>): Record<string, unknown> {
  const { contextId: _ignored, ...rest } = part;
  void _ignored;
  return { ...rest, presentationType: part.type };
}

/**
 * composite@1 FINALIZATION rules (every problem BLOCKS; nothing is repaired): the strict structure, the question-level contract (exact keys,
 * a storage / target-safe id, no question-level answer key), exact child identities (unknown type / unsupported version) and every linked
 * SmartSim part's private checks validated against its CONTEXT's plugin and canonical config. Child bodies are validated by the caller with
 * the SAME validator a standalone question of that type uses.
 */
export function validateCompositeQuestion(node: Record<string, unknown>): CompositeIssue[] {
  const out: CompositeIssue[] = [];
  if (compositeQuestionVersion(node) === undefined) out.push(err("UNSUPPORTED_QUESTION_TYPE_VERSION", "إصدار السؤال المركّب المتقدّم غير مدعوم في هذا الإصدار من التطبيق.", "questionTypeVersion"));
  for (const k of Object.keys(node)) if (!QUESTION_KEYS.has(k) && k !== "parts" && !canonicalBookkeeping(k, node[k])) out.push(err("COMPOSITE_UNKNOWN_KEY", "حقل غير مسموح في السؤال المركّب: " + k, k));
  // RF2 — an empty / null examQuestionId is ABSENT (sectionQuestionId falls back to `id`); the effective id is then checked by examQuality.
  if (node.examQuestionId !== undefined && node.examQuestionId !== null && node.examQuestionId !== "" && !isCompositeQuestionId(node.examQuestionId)) out.push(err("COMPOSITE_QUESTION_ID_INVALID", "معرّف السؤال المركّب يجب أن يكون من حروف لاتينية وأرقام و . _ : - (حتى 80) دون الفاصل ::part::.", "examQuestionId"));
  if (node.answer !== undefined && !(isObj(node.answer) && Object.keys(node.answer).length === 0)) out.push(err("COMPOSITE_ANSWER_KEY_FORBIDDEN", "مفاتيح الإجابة تُحفظ في البنود فقط، لا على السؤال المركّب.", "answer"));
  const st = compositeStructure(node);
  if (!st.ok) return [...out, ...st.issues.filter(i => !(i.code === "UNSUPPORTED_QUESTION_TYPE_VERSION" && out.some(o => o.code === i.code)))];
  for (const g of st.model.groups) for (const p of g.parts) {
    if (!isSupportedCompositeChild(p.type, p.raw.questionTypeVersion)) { out.push(err("COMPOSITE_CHILD_TYPE_UNSUPPORTED", "نوع البند «" + p.label + "» أو إصداره غير مدعوم داخل السؤال المركّب: " + p.type + (p.raw.questionTypeVersion !== undefined ? "@" + String(p.raw.questionTypeVersion) : ""), "composite.parts." + p.id)); continue; }
    if (!p.linkedSmartSim) continue;
    const ctx = p.contextId ? st.model.contextById.get(p.contextId) : undefined;
    if (!ctx || ctx.kind !== "smartSim") continue;                                                    // reported by the structure
    const env = validateSmartSimEnvelope(ctx.envelope);
    if (!env.ok) continue;
    const key = validateSmartSimAnswerKey(p.raw.answer, env.plugin, env.envelope.config);
    if (!key.ok) out.push(err("COMPOSITE_SMARTSIM_KEY_INVALID", "فحوص البند «" + p.label + "» غير صالحة على المحاكاة المشتركة: " + key.issues.map(i => i.message).join(" — "), "composite.parts." + p.id + ".answer"));
  }
  return out;
}

/** The canonical PUBLIC projection of one validated context (sources / envelope only; a context has no private field by contract). */
export function projectCompositeContextForStudent(ctx: CompositeContextModel): Record<string, unknown> {
  const head = { id: ctx.id, version: 1, kind: ctx.kind, ...(ctx.title !== undefined ? { title: ctx.title } : {}), ...(ctx.instructions !== undefined ? { instructions: ctx.instructions } : {}) };
  return ctx.kind === "source" ? { ...head, sources: ctx.sources.map(s => ({ ...s })) } : { ...head, smartSim: ctx.envelope };
}
