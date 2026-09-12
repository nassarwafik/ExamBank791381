// Structured-exam import (Phase 3) — JSON + HTML, client-side, pure.
//
// The result of every import is the SAME StructuredExam object the rest of the app already uses
// (builder / save-exam-artifact / assignments / grading / validation / sanitizer). There is no second
// exam model and no post-import transform. Parsing/schema problems are reported separately from
// semantic exam problems: this module owns the former; examQuality.validateStructuredExam owns the
// latter (reused here, never re-implemented).
//
// Security: imported files are DATA. This module never executes anything and never touches the DOM;
// the HTML entry points live in structuredExamHtmlParser.ts and use DOMParser only.

import type { StructuredExam } from "./examTypes";
import { genId } from "./examBuilderState";
import { validateStructuredExam, type StructuredIssue } from "./examQuality";

export type ImportFormat = "json" | "html";
export type ImportSourceKind = "json" | "html-embedded-json" | "html-annotated";
export type ImportMessage = { code: string; message: string; path?: string };

export type ImportStats = {
  sections: number;
  questions: number;
  parts: number;
  stimuli: number;
  images: number;
  byType: Record<string, number>;
};

export type StructuredImportResult = {
  exam: StructuredExam | null;
  format: ImportFormat;
  sourceKind: ImportSourceKind | null;
  sourceLabel: string; // human reliability label — NOT an AI confidence score
  fileName: string;
  parseErrors: ImportMessage[]; // syntax / schema / unsupported — the parser's responsibility
  parseWarnings: ImportMessage[]; // aliases normalized, generated ids, external images, etc.
  validationErrors: StructuredIssue[]; // from examQuality (semantic) — do NOT block opening
  validationWarnings: StructuredIssue[];
  stats: ImportStats;
  generatedIds: number;
  // canOpen === (exam built AND no fatal parse errors). Fatal parse errors (unreadable JSON, no object,
  // no sections, unsupported type, compound-in-a-part) block opening; semantic validation errors and
  // repairable parse warnings do NOT — the teacher opens the exam as a DRAFT and fixes them in the builder.
  canOpen: boolean;
};

// ~10 MB guardrail (large enough for exams with a few embedded base64 images; small enough to not
// freeze the browser on an accidental huge file).
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const toStr = (v: unknown): string => (v == null ? "" : String(v));
const toNumOrUndef = (v: unknown): number | undefined => {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// Canonical question/part types + harmless aliases (normalized explicitly, with a warning — never a
// silent guess). An unknown type is reported as an error and kept verbatim so the builder shows it.
const CANONICAL_TYPES = ["multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill", "compound"] as const;
const TYPE_ALIASES: Record<string, string> = {
  mcq: "multipleChoice", multiplechoice: "multipleChoice",
  tf: "trueFalse", truefalse: "trueFalse",
  multitruefalse: "multiTrueFalse", multitf: "multiTrueFalse",
  open: "shortAnswer", short: "shortAnswer", shortanswer: "shortAnswer", essay: "shortAnswer",
  fillblank: "fillBlank", fill: "fillBlank",
  wordbank: "wordBank",
  matching: "matching", match: "matching",
  ordering: "ordering", order: "ordering",
  tablefill: "tableFill", table: "tableFill",
  clifill: "cliFill", cli: "cliFill",
  compound: "compound"
};

type Ctx = { errors: ImportMessage[]; warnings: ImportMessage[]; generated: number };

// Canonicalizes a raw type string to a supported type. PURE — no ctx side effects. Exported so the HTML
// annotated parser can resolve the canonical type BEFORE parsing the (type-specific) body: parsing a
// body against a raw alias (e.g. data-type="mcq") would silently drop its options/answer.
export function canonicalizeType(raw: unknown): { type: string; isAlias: boolean; known: boolean } {
  const s = toStr(raw).trim();
  if ((CANONICAL_TYPES as readonly string[]).includes(s)) return { type: s, isAlias: false, known: true };
  const alias = TYPE_ALIASES[s.toLowerCase()];
  if (alias) return { type: alias, isAlias: true, known: true };
  return { type: s, isAlias: false, known: false };
}

// Single-sourced alias-normalization message so JSON and HTML report it identically.
export function typeAliasMessage(raw: unknown, canonical: string): string {
  return "نوع «" + toStr(raw).trim() + "» طُبِّع إلى «" + canonical + "».";
}

function normalizeType(raw: unknown, ctx: Ctx, path: string, allowCompound: boolean): { type: string; ok: boolean } {
  const { type, isAlias, known } = canonicalizeType(raw);
  if (!known) {
    ctx.errors.push({ code: "UNSUPPORTED_QUESTION_TYPE", message: "نوع غير مدعوم: «" + toStr(raw).trim() + "» في " + path + ".", path });
    return { type, ok: false };
  }
  if (type === "compound" && !allowCompound) {
    ctx.errors.push({ code: "PART_CANNOT_BE_COMPOUND", message: "لا يمكن أن يكون البند سؤالًا مركّبًا.", path });
    return { type, ok: false };
  }
  // Alias warnings are emitted where the type is first resolved: JSON here; HTML in resolveType() (which
  // stores the canonical type, so this call sees a canonical type and stays silent — one warning total).
  if (isAlias) ctx.warnings.push({ code: "TYPE_ALIAS_NORMALIZED", message: typeAliasMessage(raw, type), path });
  return { type, ok: true };
}

// ── boolean coercion for imported correct values (true/false, "true"/"false", صحيح/غير صحيح) ──
export function coerceBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  const s = toStr(v).trim().toLowerCase();
  if (s === "true" || s === "صحيح" || s === "1") return true;
  if (s === "false" || s === "غير صحيح" || s === "0") return false;
  return undefined;
}

function normalizeField(raw: unknown, ctx: Ctx): Record<string, unknown> {
  const f = isObj(raw) ? { ...raw } : {};
  if (!toStr(f.id).trim()) { f.id = genId("f"); ctx.generated++; }
  // boolean fields (multiTrueFalse / tableFill boolean cells) coerce their correct value
  if (toStr(f.kind).toLowerCase() === "boolean" && f.correct !== undefined) {
    const b = coerceBool(f.correct);
    f.correct = b; // may be undefined → validation flags it
  }
  return f;
}

// ── Image-source safety ─────────────────────────────────────────────────────
// A renderable image source (stimulus.image.dataUrl, question image.assets[].dataUrl, images[].dataUrl)
// is rendered verbatim by StructuredExamSection / StudentQuestionCard / CompoundQuestion as
// <img src={dataUrl}>. So ONLY a safe embedded raster data: URL may be kept there. Anything else — an
// external http(s) URL (a network request / SSRF on preview or for a student), blob:/file:/javascript:,
// an SVG (which can carry script), or another data: MIME such as data:text/html — is stripped from the
// renderable field and moved to a NON-rendered `externalUrl` for the teacher's reference only.
const SAFE_IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif)\b/i;

function classifyImageSrc(url: string): "safe" | "external" | "unsafe" {
  if (SAFE_IMAGE_DATA_URL.test(url)) return "safe";
  if (/^https?:\/\//i.test(url)) return "external";
  return "unsafe";
}

// Returns true when `url` is a safe embedded image to keep as a renderable source; otherwise pushes the
// appropriate warning (external vs unsafe) and returns false.
function imageSourceIsSafe(url: string, ctx: Ctx | null, path: string): boolean {
  const verdict = classifyImageSrc(url);
  if (verdict === "safe") return true;
  if (ctx) {
    if (verdict === "external") ctx.warnings.push({ code: "EXTERNAL_IMAGE_NOT_EMBEDDED", message: "صورة خارجية لم تُضمَّن ولن تُطلَب من الشبكة (احتُفِظ برابطها للمراجعة فقط) عند " + path + ".", path });
    else ctx.warnings.push({ code: "UNSAFE_IMAGE_SOURCE", message: "مصدر صورة غير آمن أُزيل (SVG أو data: غير مدعوم) عند " + path + ".", path });
  }
  return false;
}

// Strips an unsafe/external renderable source from a {dataUrl|src|url} asset, keeping the original only
// under `externalUrl` (never rendered, never fetched). Returns the (possibly replaced) asset.
function sanitizeAsset(asset: Record<string, unknown>, ctx: Ctx | null, path: string): Record<string, unknown> {
  const url = toStr(asset.dataUrl || asset.src || asset.url);
  if (!url || imageSourceIsSafe(url, ctx, path)) return asset;
  const cleaned: Record<string, unknown> = { ...asset };
  delete cleaned.dataUrl; delete cleaned.src; delete cleaned.url;
  cleaned.externalUrl = url;
  return cleaned;
}

// Sanitizes every renderable image asset on a question/part node (image.assets[] and images[]).
function sanitizeNodeImages(node: Record<string, unknown>, ctx: Ctx, path: string): void {
  const img = node.image as Record<string, unknown> | undefined;
  if (isObj(img) && Array.isArray(img.assets)) {
    img.assets = img.assets.map((a, i) => (isObj(a) ? sanitizeAsset({ ...a }, ctx, path + ".image[" + i + "]") : a));
  }
  if (Array.isArray(node.images)) {
    node.images = (node.images as unknown[]).map((a, i) => (isObj(a) ? sanitizeAsset({ ...a }, ctx, path + ".images[" + i + "]") : a));
  }
}

// Sanitizes a section stimulus's single image ({ dataUrl } shape).
function sanitizeStimulusImage(stimulus: Record<string, unknown>, ctx: Ctx, path: string): void {
  const img = stimulus.image;
  if (!isObj(img)) return;
  const url = toStr(img.dataUrl || img.src || img.url);
  if (!url || imageSourceIsSafe(url, ctx, path)) return;
  const cleaned: Record<string, unknown> = { ...img };
  delete cleaned.dataUrl; delete cleaned.src; delete cleaned.url;
  cleaned.externalUrl = url;
  stimulus.image = cleaned;
}

// Counts renderable (safe, still-present dataUrl) images for the import stats — after sanitization only
// safe embedded images retain a dataUrl.
function countSafeAssets(node: Record<string, unknown>): number {
  let n = 0;
  const img = node.image as Record<string, unknown> | undefined;
  if (isObj(img) && Array.isArray(img.assets)) for (const a of img.assets) if (isObj(a) && toStr(a.dataUrl)) n++;
  if (Array.isArray(node.images)) for (const a of node.images as unknown[]) if (isObj(a) && toStr((a as Record<string, unknown>).dataUrl)) n++;
  return n;
}

function normalizeQuestionOrPart(raw: unknown, ctx: Ctx, path: string, isPart: boolean): Record<string, unknown> {
  const q = isObj(raw) ? { ...raw } : {};
  // identity: prefer examQuestionId / id; generate if missing. displayNumber is NEVER identity.
  if (isPart) {
    if (!toStr(q.id).trim()) { q.id = genId("p"); ctx.generated++; }
  } else {
    const id = toStr(q.examQuestionId).trim() || toStr(q.id).trim();
    q.examQuestionId = id || (() => { ctx.generated++; return genId("q"); })();
  }
  const typeKey = isPart ? "type" : "presentationType";
  const rawType = q[typeKey] ?? (isPart ? undefined : q.type);
  const { type } = normalizeType(rawType, ctx, path, !isPart);
  q[typeKey] = type;
  // marks: preserve when numeric; never invented.
  const marks = toNumOrUndef(q.marks ?? q.points);
  if (marks !== undefined) q.marks = marks;
  // fields
  if (Array.isArray(q.fields)) q.fields = q.fields.map(f => normalizeField(f, ctx));
  // compound parts (questions only)
  if (!isPart && type === "compound" && Array.isArray(q.parts)) {
    q.parts = q.parts.map((p, i) => normalizeQuestionOrPart(p, ctx, path + ".parts[" + i + "]", true));
  }
  sanitizeNodeImages(q, ctx, path);
  return q;
}

function normalizeSection(raw: unknown, ctx: Ctx, index: number): Record<string, unknown> {
  const s = isObj(raw) ? { ...raw } : {};
  if (!toStr(s.id).trim()) { s.id = genId("sec"); ctx.generated++; }
  s.title = toStr(s.title);
  s.instructions = toStr(s.instructions ?? "");
  // Grading policy and answer unit are NEVER guessed on import — a wrong guess would silently change the
  // exam's academic meaning (e.g. turning a capped section into "grade everything"). Present values are
  // normalized to a string and preserved as-is (valid or not); missing values are left unset. Missing or
  // invalid values are reported by validateStructuredExam (GRADING_POLICY_REQUIRED /
  // GRADING_POLICY_INVALID / ANSWER_UNIT_INVALID), so the teacher chooses explicitly before finalizing.
  if (s.gradingPolicy != null && s.gradingPolicy !== "") s.gradingPolicy = toStr(s.gradingPolicy);
  else delete s.gradingPolicy;
  if (s.answerUnit != null && s.answerUnit !== "") s.answerUnit = toStr(s.answerUnit);
  else delete s.answerUnit;
  const max = toNumOrUndef(s.maxMarks);
  s.maxMarks = max !== undefined ? max : (s.maxMarks == null ? null : s.maxMarks);
  const req = toNumOrUndef(s.requiredAnswers);
  s.requiredAnswers = req !== undefined ? req : (s.requiredAnswers == null ? null : s.requiredAnswers);
  s.stimuli = isObj(s.stimuli) ? s.stimuli : {};
  for (const [gid, st] of Object.entries(s.stimuli as Record<string, unknown>)) {
    if (isObj(st)) sanitizeStimulusImage(st, ctx, "section[" + index + "].stimulus:" + gid);
  }
  s.questions = Array.isArray(s.questions) ? s.questions.map((q, i) => normalizeQuestionOrPart(q, ctx, "section[" + index + "].q[" + i + "]", false)) : [];
  return s;
}

// Turns a raw parsed object (from JSON, embedded JSON, or annotated HTML) into a normalized
// StructuredExam. Generates missing ids, forces status=draft, drops any top-level questions[], mints a
// fresh examId (foreign/storage ids are never reused), and records the original in metadata.import.
export function normalizeImportedExam(
  raw: unknown,
  opts: { fileName: string; sourceFormat: ImportSourceKind },
  ctx: Ctx
): StructuredExam | null {
  if (!isObj(raw)) { ctx.errors.push({ code: "NOT_AN_OBJECT", message: "المحتوى ليس كائن امتحان صالحًا." }); return null; }
  if (!Array.isArray(raw.sections)) { ctx.errors.push({ code: "NO_SECTIONS", message: "لا يحتوي الملف على مصفوفة أقسام (sections)." }); return null; }

  const out: Record<string, unknown> = { ...raw };
  const originalExamId = toStr(raw.examId).trim();
  out.examId = "EXAM-import-" + Date.now().toString(36) + "-" + genId("x").slice(-6);
  out.title = toStr(raw.title);
  out.status = "draft"; // never trust an imported "final"
  const meta = isObj(raw.metadata) ? { ...raw.metadata } : {};
  meta.import = { sourceFileName: opts.fileName, sourceFormat: opts.sourceFormat, importedAt: new Date().toISOString(), originalExamId: originalExamId || null };
  out.metadata = meta;
  out.sections = raw.sections.map((s, i) => normalizeSection(s, ctx, i));
  // canonical: no top-level questions[] on a structured exam
  delete out.questions;

  return out as unknown as StructuredExam;
}

export function computeStats(exam: StructuredExam | null): ImportStats {
  const stats: ImportStats = { sections: 0, questions: 0, parts: 0, stimuli: 0, images: 0, byType: {} };
  if (!exam || !Array.isArray(exam.sections)) return stats;
  stats.sections = exam.sections.length;
  for (const s of exam.sections) {
    stats.stimuli += s.stimuli ? Object.keys(s.stimuli).length : 0;
    for (const st of Object.values(s.stimuli || {})) stats.images += (st as { image?: { dataUrl?: string } }).image?.dataUrl ? 1 : 0;
    for (const q of s.questions || []) {
      stats.questions++;
      const t = String((q as { presentationType?: string }).presentationType || "unknown");
      stats.byType[t] = (stats.byType[t] || 0) + 1;
      stats.images += countSafeAssets(q as unknown as Record<string, unknown>);
      const parts = (q as { parts?: unknown[] }).parts;
      if (Array.isArray(parts)) { stats.parts += parts.length; for (const p of parts) stats.images += countSafeAssets(p as Record<string, unknown>); }
    }
  }
  return stats;
}

const SOURCE_LABELS: Record<ImportSourceKind, string> = {
  "json": "JSON قياسي",
  "html-embedded-json": "HTML + JSON قياسي",
  "html-annotated": "HTML منظّم"
};

// Assembles the final result from a normalized (or failed) exam: runs examQuality validation and
// splits its issues by severity. canOpen is true whenever an exam object was built (semantic errors
// are fixable in the builder); only fatal parse errors (exam === null) block opening.
export function finalizeResult(
  exam: StructuredExam | null,
  format: ImportFormat,
  sourceKind: ImportSourceKind | null,
  fileName: string,
  ctx: Ctx
): StructuredImportResult {
  const issues = exam ? validateStructuredExam(exam) : [];
  return {
    exam,
    format,
    sourceKind,
    sourceLabel: sourceKind ? SOURCE_LABELS[sourceKind] : "",
    fileName,
    parseErrors: ctx.errors,
    parseWarnings: ctx.warnings,
    validationErrors: issues.filter(i => i.severity === "error"),
    validationWarnings: issues.filter(i => i.severity === "warning"),
    stats: computeStats(exam),
    generatedIds: ctx.generated,
    // Fatal parse errors block opening. After parsing, ctx.errors holds ONLY fatal (cannot-interpret)
    // problems — invalid/embedded JSON, no object, no sections, unsupported type, compound-in-a-part.
    // Repairable content problems (a missing MCQ key, a missing/invalid grading policy) are surfaced as
    // parse WARNINGS or examQuality validation errors, so the teacher opens as a DRAFT and fixes them.
    canOpen: exam !== null && ctx.errors.length === 0
  };
}

// ── Public JSON entry point ────────────────────────────────────────────────
export function parseStructuredExamJson(text: string, fileName = "exam.json"): StructuredImportResult {
  const ctx: Ctx = { errors: [], warnings: [], generated: 0 };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    ctx.errors.push({ code: "INVALID_JSON", message: "تعذّر قراءة ملف JSON: " + (e instanceof Error ? e.message : "صيغة غير صالحة") + "." });
    return finalizeResult(null, "json", null, fileName, ctx);
  }
  const exam = normalizeImportedExam(raw, { fileName, sourceFormat: "json" }, ctx);
  return finalizeResult(exam, "json", exam ? "json" : null, fileName, ctx);
}
