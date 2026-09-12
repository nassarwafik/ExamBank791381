// HTML import for structured exams (Phase 3). Two modes:
//   A. Embedded canonical JSON — a <script type="application/json" id="exambank-structured-exam"> whose
//      textContent is the StructuredExam JSON (highest reliability).
//   B. Annotated DOM — a data-* schema describing sections/questions/parts/fields/etc.
//
// SECURITY: HTML is DATA. We parse with DOMParser("text/html"), which builds an inert tree and NEVER
// runs scripts, inline handlers, or network/resource loads. We only ever read attributes/textContent.
// Nothing here is mounted, and no imported HTML is passed to innerHTML/dangerouslySetInnerHTML. For
// embedded JSON we read ONLY the textContent of the one application/json script (all other scripts are
// ignored). External image URLs are preserved as metadata but never fetched.

import { buildMatchingPatch, syncSequenceAnswer, type MatchPair } from "./examBuilderState";
import type { BuilderField } from "./examTypes";
import {
  normalizeImportedExam,
  finalizeResult,
  coerceBool,
  canonicalizeType,
  typeAliasMessage,
  parseStructuredExamJson,
  MAX_IMPORT_BYTES,
  type StructuredImportResult,
  type ImportMessage
} from "./structuredExamImport";

type Ctx = { errors: ImportMessage[]; warnings: ImportMessage[]; generated: number };

const EMBEDDED_ID = "exambank-structured-exam";

const attr = (el: Element, name: string): string => (el.getAttribute(name) ?? "").trim();
const numAttr = (el: Element, name: string): number | undefined => {
  const v = el.getAttribute(name);
  if (v == null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const textOf = (el: Element | null): string => (el?.textContent ?? "").trim();
// Direct-child match only, so a section's own instructions/stimuli aren't confused with a nested
// question's, and a compound question's own text isn't taken from a part.
const childText = (el: Element, selector: string): string => textOf(el.querySelector(":scope > " + selector));

function parseOption(el: Element): { text: string } { return { text: textOf(el) }; }

function splitOptions(raw: string): { text: string }[] {
  return raw.split("|").map(s => s.trim()).filter(Boolean).map(text => ({ text }));
}

// Shared body parser for BOTH a question element and a part element. `type` is the already-read type.
function parseBody(el: Element, type: string, ctx: Ctx, path: string): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  switch (type) {
    case "multipleChoice": {
      const optEls = Array.from(el.querySelectorAll("[data-options] [data-option], [data-option]"));
      const options = optEls.map(parseOption);
      const correctIdx = optEls.findIndex(o => coerceBool(o.getAttribute("data-correct")) === true);
      const correctCount = optEls.filter(o => coerceBool(o.getAttribute("data-correct")) === true).length;
      body.options = options;
      // Zero / multiple data-correct is a READABLE structure, not a parse failure: keep the options, do
      // NOT guess an answer (leave it unset), and warn. validateStructuredExam then emits its normal
      // blocking MISSING_ANSWER validation error, so the teacher opens as a draft and picks the answer.
      if (correctCount === 0) ctx.warnings.push({ code: "MCQ_NO_CORRECT", message: "سؤال اختيار من متعدد بلا خيار صحيح — تُترك الإجابة ليحددها المعلّم في " + path + ".", path });
      else if (correctCount > 1) ctx.warnings.push({ code: "MCQ_MULTIPLE_CORRECT", message: "سؤال اختيار من متعدد بأكثر من خيار صحيح — لم تُحدَّد إجابة في " + path + ".", path });
      else body.answer = { correctOptionIndex: correctIdx };
      break;
    }
    case "trueFalse": {
      const b = coerceBool(el.getAttribute("data-correct"));
      body.answer = b === undefined ? {} : { correct: b };
      break;
    }
    case "multiTrueFalse": {
      const fieldEls = Array.from(el.querySelectorAll("[data-fields] [data-field], [data-field]"));
      body.fields = fieldEls.map(f => ({ id: attr(f, "data-id") || undefined, statement: textOf(f), kind: "boolean", correct: coerceBool(f.getAttribute("data-correct")) }));
      break;
    }
    case "fillBlank":
    case "wordBank":
    case "ordering": {
      const fieldEls = Array.from(el.querySelectorAll("[data-fields] [data-field], [data-field]"));
      const fields = fieldEls.map(f => {
        const kind = attr(f, "data-kind") || "text";
        const options = attr(f, "data-options") ? splitOptions(attr(f, "data-options")) : Array.from(f.querySelectorAll("[data-option]")).map(parseOption);
        return { id: attr(f, "data-id") || undefined, label: attr(f, "data-label") || undefined, kind, correct: attr(f, "data-correct"), ...(options.length ? { options } : {}) };
      });
      const bankEls = Array.from(el.querySelectorAll("[data-word-bank] [data-word], [data-word]"));
      const wordBank = bankEls.map(textOf).filter(Boolean);
      body.fields = fields;
      if (wordBank.length) body.wordBank = wordBank;
      body.answer = syncSequenceAnswer(fields as unknown as BuilderField[]);
      break;
    }
    case "matching": {
      const pairs: MatchPair[] = Array.from(el.querySelectorAll("[data-matching] [data-pair], [data-pair]")).map(p => ({ left: attr(p, "data-left"), right: attr(p, "data-right") }));
      Object.assign(body, buildMatchingPatch(pairs));
      break;
    }
    case "tableFill": {
      const table = el.querySelector("table[data-table-fill], [data-table-fill] table, table");
      const headers = table ? Array.from(table.querySelectorAll("thead th")).map(textOf) : [];
      const bodyRows = table ? Array.from(table.querySelectorAll("tbody tr")) : [];
      const tableRows: string[][] = [];
      const fields: Record<string, unknown>[] = [];
      bodyRows.forEach((tr, r) => {
        const cells = Array.from(tr.children);
        const rowText: string[] = [];
        cells.forEach((td, c) => {
          if (td.hasAttribute("data-answer-cell")) {
            rowText.push("");
            const kind = attr(td, "data-kind") || "text";
            const options = attr(td, "data-options") ? splitOptions(attr(td, "data-options")) : Array.from(td.querySelectorAll("[data-option], option")).map(parseOption);
            fields.push({ id: attr(td, "data-field-id") || attr(td, "data-id") || undefined, row: r, column: c, kind, correct: kind === "boolean" ? coerceBool(td.getAttribute("data-correct")) : attr(td, "data-correct"), ...(kind === "select" && options.length ? { options } : {}) });
          } else {
            rowText.push(textOf(td));
          }
        });
        tableRows.push(rowText);
      });
      body.tableHeaders = headers;
      body.tableRows = tableRows;
      body.fields = fields;
      break;
    }
    case "cliFill": {
      const cliEl = el.querySelector("[data-cli]");
      // preserve internal newlines/spacing; only trim a single leading/trailing blank line
      body.cli = (cliEl?.textContent ?? "").replace(/^\n/, "").replace(/\s+$/, "");
      const fieldEls = Array.from(el.querySelectorAll("[data-cli-fields] [data-field], [data-cli-fields] [data-cli-field]"));
      body.fields = fieldEls.map(f => ({ id: attr(f, "data-id") || undefined, label: attr(f, "data-label") || undefined, correct: attr(f, "data-correct") }));
      break;
    }
    case "shortAnswer": {
      const model = childText(el, "[data-model-answer]") || attr(el, "data-correct");
      body.answer = model ? { text: model } : {};
      break;
    }
    case "compound": {
      const partEls = Array.from(el.querySelectorAll(":scope [data-part]")).filter(p => p.closest("[data-question]") === el);
      body.parts = partEls.map((p, i) => parsePartEl(p, ctx, path + ".part[" + i + "]"));
      break;
    }
    default:
      break;
  }
  return body;
}

function readType(el: Element): string { return attr(el, "data-type"); }
function questionText(el: Element): string { return childText(el, "[data-question-text]") || childText(el, "[data-text]"); }

// Resolve the CANONICAL type from a possibly-aliased data-type BEFORE the body is parsed, so an alias
// like data-type="mcq" is parsed as multipleChoice (options + answer) instead of falling through to an
// empty body. The alias warning is emitted here exactly once; the canonical type is what gets stored,
// so downstream normalizeImportedExam sees a canonical type and does not warn again. An unsupported type
// is returned verbatim (no warning here) and reported once as a fatal error during normalization.
function resolveType(el: Element, ctx: Ctx, path: string): string {
  const rawType = readType(el);
  const { type, isAlias } = canonicalizeType(rawType);
  if (isAlias) ctx.warnings.push({ code: "TYPE_ALIAS_NORMALIZED", message: typeAliasMessage(rawType, type), path });
  return type;
}

function parseQuestionEl(el: Element, ctx: Ctx, path: string): Record<string, unknown> {
  const type = resolveType(el, ctx, path);
  const q: Record<string, unknown> = {
    examQuestionId: attr(el, "data-id") || undefined,
    presentationType: type,
    text: questionText(el),
    marks: numAttr(el, "data-marks")
  };
  const disp = attr(el, "data-display-number");
  if (disp) q.displayNumber = disp;
  const group = attr(el, "data-group-id");
  if (group) q.groupId = group;
  Object.assign(q, parseBody(el, type, ctx, path));
  return q;
}

function parsePartEl(el: Element, ctx: Ctx, path: string): Record<string, unknown> {
  const type = resolveType(el, ctx, path);
  const p: Record<string, unknown> = {
    id: attr(el, "data-id") || undefined,
    label: attr(el, "data-label") || undefined,
    type,
    text: childText(el, "[data-part-text]") || childText(el, "[data-question-text]") || childText(el, "[data-text]"),
    marks: numAttr(el, "data-marks")
  };
  Object.assign(p, parseBody(el, type, ctx, path));
  return p;
}

function parseStimulus(el: Element): { groupId: string; stimulus: Record<string, unknown> } {
  const groupId = attr(el, "data-group-id") || attr(el, "data-id");
  const imgEl = el.querySelector("[data-stimulus-image], img");
  const src = imgEl ? (imgEl.getAttribute("src") || "") : "";
  const stimulus: Record<string, unknown> = { title: attr(el, "data-title") || undefined, text: childText(el, "[data-stimulus-text]") || undefined };
  // Store the raw src; normalizeSection → sanitizeStimulusImage keeps it only if it is a safe embedded
  // image and otherwise strips it to a non-rendered externalUrl (external/SVG/data:text-html are unsafe).
  if (src) stimulus.image = { dataUrl: src };
  return { groupId, stimulus };
}

function parseSectionEl(el: Element, ctx: Ctx, path: string): Record<string, unknown> {
  const stimuli: Record<string, unknown> = {};
  Array.from(el.querySelectorAll(":scope [data-stimulus]")).filter(s => s.closest("[data-section]") === el).forEach(s => {
    const { groupId, stimulus } = parseStimulus(s);
    if (groupId) stimuli[groupId] = stimulus;
  });
  const questionEls = Array.from(el.querySelectorAll("[data-question]")).filter(q => q.closest("[data-section]") === el);
  return {
    id: attr(el, "data-section-id") || attr(el, "data-id") || undefined,
    title: attr(el, "data-title"),
    instructions: childText(el, "[data-section-instructions]"),
    gradingPolicy: attr(el, "data-grading-policy") || undefined,
    maxMarks: numAttr(el, "data-max-marks"),
    requiredAnswers: numAttr(el, "data-required-answers"),
    answerUnit: attr(el, "data-answer-unit") || undefined,
    stimuli,
    questions: questionEls.map((q, i) => parseQuestionEl(q, ctx, path + ".q[" + i + "]"))
  };
}

// Build the raw structured-exam object from an annotated document.
function parseAnnotatedDom(doc: Document, ctx: Ctx): Record<string, unknown> | null {
  const root = doc.querySelector('[data-exambank="structured-exam"]') || doc.body;
  if (!root) { ctx.errors.push({ code: "NO_STRUCTURE", message: "لم يُعثر على بنية امتحان منظّم في ملف HTML." }); return null; }
  const sectionEls = Array.from(root.querySelectorAll("[data-section]"));
  if (!sectionEls.length) { ctx.errors.push({ code: "NO_SECTIONS", message: "لا يحتوي ملف HTML على أي قسم (data-section)." }); return null; }
  return {
    title: attr(root as Element, "data-title") || textOf(doc.querySelector("title")),
    presentationTheme: attr(root as Element, "data-theme") || undefined,
    sections: sectionEls.map((s, i) => parseSectionEl(s, ctx, "section[" + i + "]"))
  };
}

// ── Public HTML entry point ────────────────────────────────────────────────
export function parseStructuredExamHtml(text: string, fileName = "exam.html"): StructuredImportResult {
  const ctx: Ctx = { errors: [], warnings: [], generated: 0 };
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, "text/html");
  } catch {
    ctx.errors.push({ code: "HTML_PARSE_FAILED", message: "تعذّر تحليل ملف HTML." });
    return finalizeResult(null, "html", null, fileName, ctx);
  }

  // Mode A — embedded canonical JSON (preferred). Read ONLY this script's textContent.
  const embedded = doc.getElementById(EMBEDDED_ID);
  if (embedded && (embedded.getAttribute("type") || "").toLowerCase() === "application/json") {
    let raw: unknown;
    try {
      raw = JSON.parse(embedded.textContent || "");
    } catch (e) {
      ctx.errors.push({ code: "INVALID_EMBEDDED_JSON", message: "JSON المضمّن داخل HTML غير صالح: " + (e instanceof Error ? e.message : "صيغة غير صالحة") + "." });
      return finalizeResult(null, "html", "html-embedded-json", fileName, ctx);
    }
    const exam = normalizeImportedExam(raw, { fileName, sourceFormat: "html-embedded-json" }, ctx);
    return finalizeResult(exam, "html", "html-embedded-json", fileName, ctx);
  }

  // Mode B — annotated DOM.
  const raw = parseAnnotatedDom(doc, ctx);
  const exam = raw ? normalizeImportedExam(raw, { fileName, sourceFormat: "html-annotated" }, ctx) : null;
  return finalizeResult(exam, "html", exam ? "html-annotated" : null, fileName, ctx);
}

// ── Format dispatcher ──────────────────────────────────────────────────────
// Picks JSON vs HTML by extension, falling back to a light content sniff. Enforces the size guard on the
// real UTF-8 BYTE length (String.length counts UTF-16 code units, which under-counts Arabic/non-ASCII
// content and would let an oversized file slip through — matches the dialog's File.size byte check).
export function importStructuredExam(fileName: string, text: string): StructuredImportResult {
  const lower = (fileName || "").toLowerCase();
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
    return finalizeResult(null, /\.html?$/.test(lower) ? "html" : "json", null, fileName, {
      errors: [{ code: "FILE_TOO_LARGE", message: "الملف كبير جدًّا (الحد الأقصى ~10 ميغابايت)." }],
      warnings: [],
      generated: 0
    });
  }
  if (/\.json$/.test(lower)) return parseStructuredExamJson(text, fileName);
  if (/\.html?$/.test(lower)) return parseStructuredExamHtml(text, fileName);
  // Unknown extension — sniff: a leading "{" looks like JSON, otherwise treat as HTML.
  return text.trimStart().startsWith("{") ? parseStructuredExamJson(text, fileName) : parseStructuredExamHtml(text, fileName);
}
