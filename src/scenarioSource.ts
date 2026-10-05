// Phase 19G — the Scenario & Source Assessment Engine DOMAIN contract. Pure (no React, no DOM, one import from the 19F code-stimulus
// contract): compiled into the shared server build, so the Builder's finalization gate, the import parser, the student sanitizer, the
// teacher review and the renderers apply the SAME strict rules.
//
// A SCENARIO is a COMPOSITION / PRESENTATION layer: one or more shared SOURCES (text / image / table / code) read by several ordinary
// canonical questions of the SAME section. It is not a question type (the catalog stays at 23), it has no grader, no marks and no
// answer; the canonical questions keep their own grading untouched. ONE authority each:
//   • storage      — `section.scenarios?: ScenarioV1[]` (section-owned; nothing on the exam root, nothing on a question);
//   • identity     — `{ id, version: 1 }`, exact keys, version literally 1 (a future version is never read as 1);
//   • membership   — ONLY `scenario.questionIds` (examQuestionId values); a question belongs to at most one scenario of its section;
//                    cross-section references are invalid; the canonical order of `questionIds` is the SECTION order and the members
//                    must be contiguous in `section.questions` (presentation only — grading never reads membership);
//   • validation / projection — this module: a scenario that fails ANY rule is withheld whole (fail closed); the student copy is the
//                    canonical rebuilt copy, never a spread of the stored object.
import { validateCodeStimulus } from "./codeStimulus";

export type SourceStimulusKind = "text" | "image" | "table" | "code";
/** The canonical ExamBank image asset shape (examTypes.BuilderImageAsset), reused — never a second image system. */
export type ScenarioImageAsset = { dataUrl?: string; id?: string; origin?: "uploaded" | "ai-generated" | "bank"; contentType?: string; blobName?: string };
export type TextSourceV1 = { id: string; version: 1; kind: "text"; title?: string; text: string };
export type ImageSourceV1 = { id: string; version: 1; kind: "image"; title?: string; alt: string; image: ScenarioImageAsset };
export type TableSourceV1 = { id: string; version: 1; kind: "table"; title?: string; columnHeaders: string[]; rowHeaders?: string[]; rows: string[][] };
export type CodeSourceV1 = { id: string; version: 1; kind: "code"; title?: string; language: string; source: string };
export type SourceStimulusV1 = TextSourceV1 | ImageSourceV1 | TableSourceV1 | CodeSourceV1;
export type ScenarioV1 = { id: string; version: 1; title?: string; instructions?: string; sources: SourceStimulusV1[]; questionIds: string[] };
export type ScenarioIssue = { code: string; message: string; severity: "error"; path: string; questionId?: string };

export const SCENARIO_SOURCE_KINDS: readonly SourceStimulusKind[] = Object.freeze(["text", "image", "table", "code"]);
export const SCENARIO_LIMITS = Object.freeze({
  sources: 8, questions: 30, title: 200, instructions: 4000, sourceTitle: 200,
  textChars: 20000, textBytes: 65536, alt: 300,
  tableColumns: 12, tableRows: 50, headerChars: 200, cellChars: 500,
  imageDataUrlChars: 4200000,            // ≈ 3 MB of base64 raster data (the question-media upload limit) plus its header
  payloadBytes: 131072                   // every text of one scenario together (titles, instructions, text, cells, code), image bytes excluded
});
export const SCENARIO_SOURCE_KIND_LABELS: Readonly<Record<SourceStimulusKind, string>> = Object.freeze({ text: "نص", image: "صورة", table: "جدول", code: "كود" });

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SAFE_RASTER_DATA_URL = /^data:image\/(png|jpe?g|webp)[;,]/i;
const DELIVERY_URL = /^\/api\/question-image\?/;
const SAFE_BLOB_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const ORIGINS = new Set(["uploaded", "ai-generated", "bank"]);
const ASSET_KEYS = new Set(["dataUrl", "id", "origin", "contentType", "blobName"]);
const BASE_KEYS = ["id", "version", "kind", "title"];
const KIND_KEYS: Readonly<Record<SourceStimulusKind, readonly string[]>> = Object.freeze({ text: ["text"], image: ["alt", "image"], table: ["columnHeaders", "rowHeaders", "rows"], code: ["language", "source"] });
const SCENARIO_KEYS = new Set(["id", "version", "title", "instructions", "sources", "questionIds"]);

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isId = (v: unknown): v is string => typeof v === "string" && ID_PATTERN.test(v) && !FORBIDDEN_KEYS.has(v);
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const blank = (v: string) => v.trim() === "";
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
const issue = (code: string, message: string, path: string, questionId?: string): ScenarioIssue => (questionId === undefined ? { code, message, severity: "error", path } : { code, message, severity: "error", path, questionId });

export type SourceStimulusResult = { ok: true; source: SourceStimulusV1 } | { ok: false; issues: ScenarioIssue[] };
export type ScenarioResult = { ok: true; scenario: ScenarioV1 } | { ok: false; issues: ScenarioIssue[] };

/** The image asset of an image source: the canonical asset shape, exact keys, a safe inline raster data URL for an uploaded / AI image
 *  or the DURABLE bank identity (whose `dataUrl`, when present, is the server-minted delivery URL — never an external address). */
function validateImageAsset(raw: unknown): ScenarioImageAsset | null {
  if (!isPlain(raw)) return null;
  for (const k of Object.keys(raw)) if (!ASSET_KEYS.has(k)) return null;
  const out: ScenarioImageAsset = {};
  if (own(raw, "id")) { if (!isText(raw.id, 200) || blank(raw.id)) return null; out.id = raw.id; }
  if (own(raw, "origin")) { if (typeof raw.origin !== "string" || !ORIGINS.has(raw.origin)) return null; out.origin = raw.origin as ScenarioImageAsset["origin"]; }
  if (own(raw, "contentType")) { if (!isText(raw.contentType, 100) || !/^image\//.test(raw.contentType)) return null; out.contentType = raw.contentType; }
  if (out.origin === "bank") {
    if (!isText(raw.blobName, 256) || !SAFE_BLOB_NAME.test(raw.blobName) || raw.blobName.includes("..")) return null;
    out.blobName = raw.blobName;
    if (own(raw, "dataUrl")) { if (typeof raw.dataUrl !== "string" || !DELIVERY_URL.test(raw.dataUrl) || raw.dataUrl.length > 2048) return null; out.dataUrl = raw.dataUrl; }
    return out;
  }
  if (own(raw, "blobName")) return null;
  if (typeof raw.dataUrl !== "string" || !SAFE_RASTER_DATA_URL.test(raw.dataUrl) || raw.dataUrl.length > SCENARIO_LIMITS.imageDataUrlChars) return null;
  out.dataUrl = raw.dataUrl;
  return out;
}

/** Strict validation of ONE source; returns the canonical copy (exact keys, nothing repaired, nothing trimmed) or every issue found. */
export function validateSourceStimulus(raw: unknown, path = "source"): SourceStimulusResult {
  const fail = (code: string, message: string, p = path): SourceStimulusResult => ({ ok: false, issues: [issue(code, message, p)] });
  if (!isPlain(raw)) return fail("SOURCE_INVALID", "المصدر المشترك غير صالح.");
  const kind = raw.kind;
  if (typeof kind !== "string" || !(SCENARIO_SOURCE_KINDS as readonly string[]).includes(kind)) return fail("SOURCE_KIND_UNSUPPORTED", "نوع المصدر المشترك غير مدعوم (نص أو صورة أو جدول أو كود فقط).", path + ".kind");
  const k = kind as SourceStimulusKind;
  const allowed = new Set([...BASE_KEYS, ...KIND_KEYS[k]]);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) return fail("SOURCE_INVALID", "المصدر المشترك يحتوي حقولًا غير معروفة.", path + "." + key);
  const issues: ScenarioIssue[] = [];
  if (!isId(raw.id)) issues.push(issue("SOURCE_ID_INVALID", "معرّف المصدر المشترك غير صالح.", path + ".id"));
  if (raw.version !== 1) issues.push(issue("SOURCE_VERSION_UNSUPPORTED", "إصدار المصدر المشترك غير مدعوم (الإصدار 1 فقط).", path + ".version"));
  let title: string | undefined;
  if (own(raw, "title")) { if (!isText(raw.title, SCENARIO_LIMITS.sourceTitle)) issues.push(issue("SOURCE_TITLE_INVALID", "عنوان المصدر يجب أن يكون نصًا حتى 200 حرف.", path + ".title")); else if (!blank(raw.title)) title = raw.title; }
  const base = (): { id: string; version: 1; kind: SourceStimulusKind; title?: string } => (title === undefined ? { id: raw.id as string, version: 1, kind: k } : { id: raw.id as string, version: 1, kind: k, title });
  let source: SourceStimulusV1 | null = null;
  if (k === "text") {
    if (typeof raw.text !== "string" || blank(raw.text) || raw.text.length > SCENARIO_LIMITS.textChars || utf8Bytes(raw.text) > SCENARIO_LIMITS.textBytes) issues.push(issue("SOURCE_TEXT_INVALID", "نص المصدر مطلوب ولا يتجاوز 20000 حرف.", path + ".text"));
    else source = { ...base(), kind: "text", text: raw.text };
  } else if (k === "image") {
    if (!isText(raw.alt, SCENARIO_LIMITS.alt) || blank(raw.alt)) issues.push(issue("SOURCE_ALT_REQUIRED", "الوصف النصي البديل للصورة مطلوب (حتى 300 حرف).", path + ".alt"));
    const asset = validateImageAsset(raw.image);
    if (!asset) issues.push(issue("SOURCE_IMAGE_INVALID", "صورة المصدر غير صالحة: صورة مرفوعة (PNG أو JPG أو WEBP) أو صورة من البنك فقط.", path + ".image"));
    if (!issues.some(i => i.path === path + ".alt" || i.path === path + ".image")) source = { ...base(), kind: "image", alt: raw.alt as string, image: asset as ScenarioImageAsset };
  } else if (k === "table") {
    const cols = raw.columnHeaders, rows = raw.rows;
    const colsOk = Array.isArray(cols) && cols.length >= 1 && cols.length <= SCENARIO_LIMITS.tableColumns && cols.every(c => isText(c, SCENARIO_LIMITS.headerChars));
    const rowsOk = colsOk && Array.isArray(rows) && rows.length >= 1 && rows.length <= SCENARIO_LIMITS.tableRows && rows.every(r => Array.isArray(r) && r.length === (cols as unknown[]).length && r.every(c => isText(c, SCENARIO_LIMITS.cellChars)));
    const headersOk = !own(raw, "rowHeaders") || raw.rowHeaders === undefined || (Array.isArray(raw.rowHeaders) && Array.isArray(rows) && raw.rowHeaders.length === rows.length && raw.rowHeaders.every(h => isText(h, SCENARIO_LIMITS.headerChars)));
    if (!colsOk || !rowsOk || !headersOk) issues.push(issue("SOURCE_TABLE_INVALID", "جدول المصدر غير صالح: 1–12 عمودًا و1–50 صفًا، كل خلية نص حتى 500 حرف، وعدد عناوين الصفوف يساوي عدد الصفوف.", path + ".rows"));
    else {
      const t: TableSourceV1 = { ...base(), kind: "table", columnHeaders: [...(cols as string[])], rows: (rows as string[][]).map(r => [...r]) };
      if (Array.isArray(raw.rowHeaders)) t.rowHeaders = [...(raw.rowHeaders as string[])];
      source = t;
    }
  } else {
    const r = validateCodeStimulus({ language: raw.language, source: raw.source });
    if (!r.ok) issues.push(...r.issues.map(i => issue(i.code, i.message, path + i.path.replace(/^codeStimulus/, ""))));
    else source = { ...base(), kind: "code", language: r.stimulus.language, source: r.stimulus.source };
  }
  if (issues.length || !source) return { ok: false, issues: issues.length ? issues : [issue("SOURCE_INVALID", "المصدر المشترك غير صالح.", path)] };
  return { ok: true, source };
}

/** The text payload of a canonical source (image bytes excluded) — the per-scenario bound counts every string a student will read. */
function sourcePayloadBytes(s: SourceStimulusV1): number {
  let n = utf8Bytes(s.title ?? "");
  if (s.kind === "text") n += utf8Bytes(s.text);
  else if (s.kind === "image") n += utf8Bytes(s.alt);
  else if (s.kind === "code") n += utf8Bytes(s.source);
  else { for (const h of s.columnHeaders) n += utf8Bytes(h); for (const h of s.rowHeaders ?? []) n += utf8Bytes(h); for (const r of s.rows) for (const c of r) n += utf8Bytes(c); }
  return n;
}

/** Strict STRUCTURAL validation of one scenario (ids, version, bounds, sources, references well-formed). Membership against the
 *  section is validateSectionScenarios' job. Returns the canonical copy or every issue found. */
export function validateScenario(raw: unknown, path = "scenario"): ScenarioResult {
  const fail = (code: string, message: string, p = path): ScenarioResult => ({ ok: false, issues: [issue(code, message, p)] });
  if (!isPlain(raw)) return fail("SCENARIO_INVALID", "السيناريو غير صالح.");
  for (const key of Object.keys(raw)) if (!SCENARIO_KEYS.has(key)) return fail("SCENARIO_INVALID", "السيناريو يحتوي حقولًا غير معروفة.", path + "." + key);
  const issues: ScenarioIssue[] = [];
  if (!isId(raw.id)) issues.push(issue("SCENARIO_ID_INVALID", "معرّف السيناريو غير صالح.", path + ".id"));
  if (raw.version !== 1) issues.push(issue("SCENARIO_VERSION_UNSUPPORTED", "إصدار السيناريو غير مدعوم (الإصدار 1 فقط).", path + ".version"));
  let title: string | undefined, instructions: string | undefined;
  if (own(raw, "title")) { if (!isText(raw.title, SCENARIO_LIMITS.title)) issues.push(issue("SCENARIO_TITLE_INVALID", "عنوان السيناريو يجب أن يكون نصًا حتى 200 حرف.", path + ".title")); else if (!blank(raw.title)) title = raw.title; }
  if (own(raw, "instructions")) { if (!isText(raw.instructions, SCENARIO_LIMITS.instructions)) issues.push(issue("SCENARIO_INSTRUCTIONS_INVALID", "تعليمات السيناريو يجب أن تكون نصًا حتى 4000 حرف.", path + ".instructions")); else if (!blank(raw.instructions)) instructions = raw.instructions; }
  const sources: SourceStimulusV1[] = [];
  if (!Array.isArray(raw.sources) || raw.sources.length < 1 || raw.sources.length > SCENARIO_LIMITS.sources) issues.push(issue("SCENARIO_SOURCES_COUNT", "السيناريو يحتاج مصدرًا مشتركًا واحدًا على الأقل وحتى 8 مصادر.", path + ".sources"));
  else {
    const seen = new Set<string>();
    raw.sources.forEach((s, i) => {
      const r = validateSourceStimulus(s, path + ".sources[" + i + "]");
      if (!r.ok) { issues.push(...r.issues); return; }
      if (seen.has(r.source.id)) issues.push(issue("SCENARIO_SOURCE_ID_DUPLICATE", "معرّف مصدر مكرّر داخل السيناريو: " + r.source.id, path + ".sources[" + i + "].id"));
      seen.add(r.source.id);
      sources.push(r.source);
    });
  }
  const questionIds: string[] = [];
  if (!Array.isArray(raw.questionIds) || raw.questionIds.length < 1 || raw.questionIds.length > SCENARIO_LIMITS.questions) issues.push(issue("SCENARIO_QUESTIONS_COUNT", "السيناريو يحتاج سؤالًا مرتبطًا واحدًا على الأقل وحتى 30 سؤالًا.", path + ".questionIds"));
  else {
    const seen = new Set<string>();
    raw.questionIds.forEach((q, i) => {
      if (typeof q !== "string" || blank(q) || q.length > 200 || FORBIDDEN_KEYS.has(q)) { issues.push(issue("SCENARIO_QUESTION_REF_INVALID", "مرجع سؤال غير صالح داخل السيناريو.", path + ".questionIds[" + i + "]")); return; }
      if (seen.has(q)) issues.push(issue("SCENARIO_QUESTION_DUPLICATE", "السؤال مكرّر داخل السيناريو: " + q, path + ".questionIds[" + i + "]", q));
      seen.add(q);
      questionIds.push(q);
    });
  }
  const payload = utf8Bytes(title ?? "") + utf8Bytes(instructions ?? "") + sources.reduce((n, s) => n + sourcePayloadBytes(s), 0);
  if (payload > SCENARIO_LIMITS.payloadBytes) issues.push(issue("SCENARIO_PAYLOAD_TOO_LARGE", "حجم نصوص السيناريو يتجاوز الحد المسموح (128 كيلوبايت).", path));
  if (issues.length) return { ok: false, issues };
  const scenario: ScenarioV1 = { id: raw.id as string, version: 1, ...(title !== undefined ? { title } : {}), ...(instructions !== undefined ? { instructions } : {}), sources, questionIds };
  return { ok: true, scenario };
}

export type SectionScenariosResult = { ok: boolean; scenarios: ScenarioV1[]; issues: ScenarioIssue[] };
type SectionLike = { questions?: unknown; scenarios?: unknown };
const questionIdOf = (q: unknown): string | null => {
  if (!q || typeof q !== "object") return null;
  const x = q as { examQuestionId?: unknown; id?: unknown };
  if (x.examQuestionId != null && x.examQuestionId !== "") return String(x.examQuestionId);
  if (x.id != null && x.id !== "") return String(x.id);
  return null;
};

/** Structure + MEMBERSHIP of every scenario of ONE section: every referenced question exists in THIS section (an id known elsewhere in the
 *  exam is a cross-section reference, otherwise missing), a question belongs to at most one scenario, the members are contiguous in
 *  `section.questions`, scenario ids are unique. `scenarios` holds the canonical copies of the scenarios that pass EVERY rule (their
 *  `questionIds` in section order); a scenario that fails any rule is reported and left out (the student projection withholds it). */
export function validateSectionScenarios(section: SectionLike, options: { knownQuestionIds?: ReadonlySet<string>; path?: string } = {}): SectionScenariosResult {
  const path = options.path ?? "scenarios";
  const raw = section ? section.scenarios : undefined;
  if (raw === undefined) return { ok: true, scenarios: [], issues: [] };
  if (!Array.isArray(raw)) return { ok: false, scenarios: [], issues: [issue("SCENARIOS_INVALID", "قائمة السيناريوهات في القسم غير صالحة.", path)] };
  const issues: ScenarioIssue[] = [];
  const index = new Map<string, number>();
  const questions = Array.isArray(section.questions) ? section.questions : [];
  questions.forEach((q, i) => { const id = questionIdOf(q); if (id !== null && !index.has(id)) index.set(id, i); });
  // 1. structure
  const candidates: { scenario: ScenarioV1; path: string; valid: boolean }[] = [];
  raw.forEach((s, i) => {
    const r = validateScenario(s, path + "[" + i + "]");
    if (r.ok) candidates.push({ scenario: r.scenario, path: path + "[" + i + "]", valid: true }); else issues.push(...r.issues);
  });
  // 2. unique ids
  const byId = new Map<string, number>();
  for (const c of candidates) byId.set(c.scenario.id, (byId.get(c.scenario.id) ?? 0) + 1);
  for (const c of candidates) if ((byId.get(c.scenario.id) ?? 0) > 1) { c.valid = false; issues.push(issue("SCENARIO_ID_DUPLICATE", "معرّف سيناريو مكرّر في القسم: " + c.scenario.id, c.path + ".id")); }
  // 3. references resolve inside THIS section
  for (const c of candidates) {
    if (!c.valid) continue;
    for (const qid of c.scenario.questionIds) {
      if (index.has(qid)) continue;
      c.valid = false;
      if (options.knownQuestionIds && options.knownQuestionIds.has(qid)) issues.push(issue("SCENARIO_QUESTION_CROSS_SECTION", "السيناريو يشير إلى سؤال من قسم آخر: " + qid + " (السيناريو يربط أسئلة القسم نفسه فقط).", c.path + ".questionIds", qid));
      else issues.push(issue("SCENARIO_QUESTION_MISSING", "السيناريو يشير إلى سؤال غير موجود: " + qid, c.path + ".questionIds", qid));
    }
  }
  // 4. at most one scenario per question
  const owners = new Map<string, number>();
  for (const c of candidates) if (c.valid) for (const qid of c.scenario.questionIds) owners.set(qid, (owners.get(qid) ?? 0) + 1);
  for (const c of candidates) {
    if (!c.valid) continue;
    for (const qid of c.scenario.questionIds) if ((owners.get(qid) ?? 0) > 1) { c.valid = false; issues.push(issue("SCENARIO_QUESTION_SHARED", "السؤال " + qid + " مرتبط بأكثر من سيناريو.", c.path + ".questionIds", qid)); }
  }
  // 5. contiguity + canonical (section) order
  const scenarios: ScenarioV1[] = [];
  for (const c of candidates) {
    if (!c.valid) continue;
    const positions = c.scenario.questionIds.map(q => index.get(q) as number).sort((a, b) => a - b);
    if (positions[positions.length - 1] - positions[0] + 1 !== positions.length) { issues.push(issue("SCENARIO_NOT_CONTIGUOUS", "أسئلة السيناريو «" + (c.scenario.title || c.scenario.id) + "» غير متتالية في القسم؛ استخدم «تجميع أسئلة السيناريو».", c.path + ".questionIds")); continue; }
    scenarios.push({ ...c.scenario, sources: c.scenario.sources.map(s => ({ ...s })), questionIds: positions.map(p => questionIdOf(questions[p]) as string) });
  }
  return { ok: issues.length === 0, scenarios, issues };
}

/** The finalization gate's view: every issue of a section (empty when the section carries no scenarios). */
export const scenarioSectionIssues = (section: SectionLike, knownQuestionIds?: ReadonlySet<string>): ScenarioIssue[] => validateSectionScenarios(section, { knownQuestionIds }).issues;

/** The ONLY student (and teacher) projection of a section's scenarios: canonical copies of the scenarios that pass EVERY rule, or
 *  `undefined` when the section carries no `scenarios` key (nothing is invented). Anything wrong is withheld, never forwarded. */
export function projectSectionScenariosForStudent(section: SectionLike): ScenarioV1[] | undefined {
  if (!section || section.scenarios === undefined) return undefined;
  return validateSectionScenarios(section).scenarios;
}

/** Membership lookup over CANONICAL scenarios (the output of validateSectionScenarios / the projection). */
export function scenarioForQuestion(scenarios: readonly ScenarioV1[] | undefined | null, questionId: string): ScenarioV1 | undefined {
  if (!Array.isArray(scenarios)) return undefined;
  return scenarios.find(s => Array.isArray(s.questionIds) && s.questionIds.includes(questionId));
}
/** True for the first linked question of its scenario (where the long-form presentation renders the sources once). */
export const isFirstScenarioMember = (scenario: ScenarioV1 | undefined, questionId: string): boolean => !!scenario && scenario.questionIds[0] === questionId;

export const sourceKindLabel = (kind: string): string => (Object.prototype.hasOwnProperty.call(SCENARIO_SOURCE_KIND_LABELS, kind) ? SCENARIO_SOURCE_KIND_LABELS[kind as SourceStimulusKind] : kind);
