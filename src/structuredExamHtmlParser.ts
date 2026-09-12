// HTML import for structured exams (Phase 3). Two modes:
//   A. Embedded canonical JSON — a <script type="application/json" id="exambank-structured-exam"> whose
//      textContent is the StructuredExam JSON (highest reliability).
//   B. Annotated DOM — a data-* schema describing sections/questions/parts/fields/etc.
//
// SECURITY — network-incapable by construction. HTML is parsed with parse5 (a pure, spec-compliant
// tokenizer/tree-builder), NOT the browser's DOMParser. parse5 produces a tree of PLAIN JS objects: it
// never constructs a live HTMLImageElement / <iframe> / <link> / <script>, so parsing itself cannot
// fetch any src/href/srcset/style resource, cannot run scripts or inline handlers, and nothing is ever
// mounted or passed to innerHTML/dangerouslySetInnerHTML. (DOMParser("text/html") builds an inert
// document, but an inert document can still trigger resource downloads for <img>/<iframe> during
// parsing — which is exactly what we must avoid. parse5 has no such element behaviour.) Image sources
// are still validated during normalization (structuredExamImport), and only safe embedded raster data:
// URLs survive as a renderable image; external URLs are never fetched.

import { parse } from "parse5";
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

// ── parse5 AST — a minimal, purely-data node shape + tiny traversal helpers (no browser DOM) ─────────
type P5Attr = { name: string; value: string };
type P5Node = {
  nodeName: string;
  tagName?: string;
  value?: string; // #text nodes
  attrs?: P5Attr[];
  childNodes?: P5Node[];
  parentNode?: P5Node | null;
};

const isElement = (n: P5Node): boolean => typeof n.tagName === "string";
const kids = (n: P5Node): P5Node[] => n.childNodes || [];
const elementChildren = (n: P5Node): P5Node[] => kids(n).filter(isElement);
const getAttr = (n: P5Node, name: string): string | null => {
  const a = (n.attrs || []).find(x => x.name === name);
  return a ? a.value : null;
};
const hasAttr = (n: P5Node, name: string): boolean => (n.attrs || []).some(x => x.name === name);
const attr = (n: P5Node, name: string): string => (getAttr(n, name) ?? "").trim();
const numAttr = (n: P5Node, name: string): number | undefined => {
  const v = getAttr(n, name);
  if (v == null || v.trim() === "") return undefined;
  const num = Number(v);
  return Number.isFinite(num) ? num : undefined;
};

// Recursive text content (untrimmed) and its trimmed convenience form.
function rawText(n: P5Node | null | undefined): string {
  if (!n) return "";
  if (n.nodeName === "#text") return n.value || "";
  let s = "";
  for (const c of kids(n)) s += rawText(c);
  return s;
}
const text = (n: P5Node | null | undefined): string => rawText(n).trim();

type Pred = (n: P5Node) => boolean;
const attrPred = (name: string): Pred => n => hasAttr(n, name);
const tagPred = (tag: string): Pred => n => n.tagName === tag;

// Depth-first descendant search (document order, excludes the root — like querySelectorAll's scoping).
function findAll(root: P5Node, pred: Pred): P5Node[] {
  const out: P5Node[] = [];
  const rec = (n: P5Node) => {
    for (const c of kids(n)) { if (isElement(c) && pred(c)) out.push(c); rec(c); }
  };
  rec(root);
  return out;
}
function findFirst(root: P5Node, pred: Pred): P5Node | null {
  let found: P5Node | null = null;
  const rec = (n: P5Node): boolean => {
    for (const c of kids(n)) { if (isElement(c) && pred(c)) { found = c; return true; } if (rec(c)) return true; }
    return false;
  };
  rec(root);
  return found;
}
// Nearest ancestor-or-self element matching pred (parse5 sets parentNode on every node).
function closest(n: P5Node, pred: Pred): P5Node | null {
  let cur: P5Node | null | undefined = n;
  while (cur) { if (isElement(cur) && pred(cur)) return cur; cur = cur.parentNode; }
  return null;
}
// Text of the first DIRECT child element carrying the given data-* attribute (scoped like ":scope > …",
// so a section's own instructions aren't taken from a nested question, etc.).
const childText = (el: P5Node, dataName: string): string => text(elementChildren(el).find(x => hasAttr(x, dataName)) || null);

// ── question/part body parsing ───────────────────────────────────────────────
function parseOption(el: P5Node): { text: string } { return { text: text(el) }; }

function splitOptions(raw: string): { text: string }[] {
  return raw.split("|").map(s => s.trim()).filter(Boolean).map(t => ({ text: t }));
}

// Shared body parser for BOTH a question element and a part element. `type` is the already-canonicalized
// type (resolveType runs BEFORE this, so an alias like data-type="mcq" is parsed as multipleChoice and
// its options/answer are not lost to an empty body).
function parseBody(el: P5Node, type: string, ctx: Ctx, path: string): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  switch (type) {
    case "multipleChoice": {
      const optEls = findAll(el, attrPred("data-option"));
      const options = optEls.map(parseOption);
      const correctIdx = optEls.findIndex(o => coerceBool(getAttr(o, "data-correct")) === true);
      const correctCount = optEls.filter(o => coerceBool(getAttr(o, "data-correct")) === true).length;
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
      const b = coerceBool(getAttr(el, "data-correct"));
      body.answer = b === undefined ? {} : { correct: b };
      break;
    }
    case "multiTrueFalse": {
      const fieldEls = findAll(el, attrPred("data-field"));
      body.fields = fieldEls.map(f => ({ id: attr(f, "data-id") || undefined, statement: text(f), kind: "boolean", correct: coerceBool(getAttr(f, "data-correct")) }));
      break;
    }
    case "fillBlank":
    case "wordBank":
    case "ordering": {
      const fieldEls = findAll(el, attrPred("data-field"));
      const fields = fieldEls.map(f => {
        const kind = attr(f, "data-kind") || "text";
        const options = attr(f, "data-options") ? splitOptions(attr(f, "data-options")) : findAll(f, attrPred("data-option")).map(parseOption);
        return { id: attr(f, "data-id") || undefined, label: attr(f, "data-label") || undefined, kind, correct: attr(f, "data-correct"), ...(options.length ? { options } : {}) };
      });
      const wordBank = findAll(el, attrPred("data-word")).map(text).filter(Boolean);
      body.fields = fields;
      if (wordBank.length) body.wordBank = wordBank;
      body.answer = syncSequenceAnswer(fields as unknown as BuilderField[]);
      break;
    }
    case "matching": {
      const pairs: MatchPair[] = findAll(el, attrPred("data-pair")).map(p => ({ left: attr(p, "data-left"), right: attr(p, "data-right") }));
      Object.assign(body, buildMatchingPatch(pairs));
      break;
    }
    case "tableFill": {
      const table = findFirst(el, n => n.tagName === "table" && hasAttr(n, "data-table-fill")) || findFirst(el, tagPred("table"));
      const thead = table ? findFirst(table, tagPred("thead")) : null;
      const headers = thead ? findAll(thead, tagPred("th")).map(text) : [];
      const tbody = table ? findFirst(table, tagPred("tbody")) : null;
      const bodyRows = tbody ? elementChildren(tbody).filter(tagPred("tr")) : [];
      const tableRows: string[][] = [];
      const fields: Record<string, unknown>[] = [];
      bodyRows.forEach((tr, r) => {
        const cells = elementChildren(tr);
        const rowText: string[] = [];
        cells.forEach((td, c) => {
          if (hasAttr(td, "data-answer-cell")) {
            rowText.push("");
            const kind = attr(td, "data-kind") || "text";
            const options = attr(td, "data-options") ? splitOptions(attr(td, "data-options")) : findAll(td, n => hasAttr(n, "data-option") || n.tagName === "option").map(parseOption);
            fields.push({ id: attr(td, "data-field-id") || attr(td, "data-id") || undefined, row: r, column: c, kind, correct: kind === "boolean" ? coerceBool(getAttr(td, "data-correct")) : attr(td, "data-correct"), ...(kind === "select" && options.length ? { options } : {}) });
          } else {
            rowText.push(text(td));
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
      const cliEl = findFirst(el, attrPred("data-cli"));
      // preserve internal newlines/spacing; only trim a single leading/trailing blank line
      body.cli = rawText(cliEl).replace(/^\n/, "").replace(/\s+$/, "");
      const cliFieldsEl = findFirst(el, attrPred("data-cli-fields"));
      const fieldEls = cliFieldsEl ? findAll(cliFieldsEl, n => hasAttr(n, "data-field") || hasAttr(n, "data-cli-field")) : [];
      body.fields = fieldEls.map(f => ({ id: attr(f, "data-id") || undefined, label: attr(f, "data-label") || undefined, correct: attr(f, "data-correct") }));
      break;
    }
    case "shortAnswer": {
      const model = childText(el, "data-model-answer") || attr(el, "data-correct");
      body.answer = model ? { text: model } : {};
      break;
    }
    case "compound": {
      const partEls = findAll(el, attrPred("data-part")).filter(p => closest(p, attrPred("data-question")) === el);
      body.parts = partEls.map((p, i) => parsePartEl(p, ctx, path + ".part[" + i + "]"));
      break;
    }
    default:
      break;
  }
  return body;
}

function questionText(el: P5Node): string { return childText(el, "data-question-text") || childText(el, "data-text"); }

// Resolve the CANONICAL type from a possibly-aliased data-type BEFORE the body is parsed, so an alias
// like data-type="mcq" is parsed as multipleChoice (options + answer) instead of falling through to an
// empty body. The alias warning is emitted here exactly once; the canonical type is what gets stored,
// so downstream normalizeImportedExam sees a canonical type and does not warn again. An unsupported type
// is returned verbatim (no warning here) and reported once as a fatal error during normalization.
function resolveType(el: P5Node, ctx: Ctx, path: string): string {
  const rawType = attr(el, "data-type");
  const { type, isAlias } = canonicalizeType(rawType);
  if (isAlias) ctx.warnings.push({ code: "TYPE_ALIAS_NORMALIZED", message: typeAliasMessage(rawType, type), path });
  return type;
}

function parseQuestionEl(el: P5Node, ctx: Ctx, path: string): Record<string, unknown> {
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

function parsePartEl(el: P5Node, ctx: Ctx, path: string): Record<string, unknown> {
  const type = resolveType(el, ctx, path);
  const p: Record<string, unknown> = {
    id: attr(el, "data-id") || undefined,
    label: attr(el, "data-label") || undefined,
    type,
    text: childText(el, "data-part-text") || childText(el, "data-question-text") || childText(el, "data-text"),
    marks: numAttr(el, "data-marks")
  };
  Object.assign(p, parseBody(el, type, ctx, path));
  return p;
}

function parseStimulus(el: P5Node): { groupId: string; stimulus: Record<string, unknown> } {
  const groupId = attr(el, "data-group-id") || attr(el, "data-id");
  const imgEl = findFirst(el, n => hasAttr(n, "data-stimulus-image") || n.tagName === "img");
  const src = imgEl ? (getAttr(imgEl, "src") || "") : "";
  const stimulus: Record<string, unknown> = { title: attr(el, "data-title") || undefined, text: childText(el, "data-stimulus-text") || undefined };
  // Store the raw src; normalizeSection → sanitizeStimulusImage keeps it only if it is a safe embedded
  // image and otherwise strips it entirely (external/SVG/data:text-html are never rendered or fetched).
  if (src) stimulus.image = { dataUrl: src };
  return { groupId, stimulus };
}

function parseSectionEl(el: P5Node, ctx: Ctx, path: string): Record<string, unknown> {
  const stimuli: Record<string, unknown> = {};
  findAll(el, attrPred("data-stimulus")).filter(s => closest(s, attrPred("data-section")) === el).forEach(s => {
    const { groupId, stimulus } = parseStimulus(s);
    if (groupId) stimuli[groupId] = stimulus;
  });
  const questionEls = findAll(el, attrPred("data-question")).filter(q => closest(q, attrPred("data-section")) === el);
  return {
    id: attr(el, "data-section-id") || attr(el, "data-id") || undefined,
    title: attr(el, "data-title"),
    instructions: childText(el, "data-section-instructions"),
    gradingPolicy: attr(el, "data-grading-policy") || undefined,
    maxMarks: numAttr(el, "data-max-marks"),
    requiredAnswers: numAttr(el, "data-required-answers"),
    answerUnit: attr(el, "data-answer-unit") || undefined,
    stimuli,
    questions: questionEls.map((q, i) => parseQuestionEl(q, ctx, path + ".q[" + i + "]"))
  };
}

// Build the raw structured-exam object from an annotated document.
function parseAnnotatedDom(doc: P5Node, ctx: Ctx): Record<string, unknown> | null {
  const root = findFirst(doc, n => getAttr(n, "data-exambank") === "structured-exam") || findFirst(doc, tagPred("body"));
  if (!root) { ctx.errors.push({ code: "NO_STRUCTURE", message: "لم يُعثر على بنية امتحان منظّم في ملف HTML." }); return null; }
  const sectionEls = findAll(root, attrPred("data-section"));
  if (!sectionEls.length) { ctx.errors.push({ code: "NO_SECTIONS", message: "لا يحتوي ملف HTML على أي قسم (data-section)." }); return null; }
  return {
    title: attr(root, "data-title") || text(findFirst(doc, tagPred("title"))),
    presentationTheme: attr(root, "data-theme") || undefined,
    sections: sectionEls.map((s, i) => parseSectionEl(s, ctx, "section[" + i + "]"))
  };
}

// ── Public HTML entry point ────────────────────────────────────────────────
export function parseStructuredExamHtml(text: string, fileName = "exam.html"): StructuredImportResult {
  const ctx: Ctx = { errors: [], warnings: [], generated: 0 };
  let doc: P5Node;
  try {
    doc = parse(text) as unknown as P5Node; // pure data tree — never fetches, never executes
  } catch {
    ctx.errors.push({ code: "HTML_PARSE_FAILED", message: "تعذّر تحليل ملف HTML." });
    return finalizeResult(null, "html", null, fileName, ctx);
  }

  // Mode A — embedded canonical JSON (preferred). Read ONLY this script's text content.
  const embedded = findFirst(doc, n => getAttr(n, "id") === EMBEDDED_ID);
  if (embedded && (getAttr(embedded, "type") || "").toLowerCase() === "application/json") {
    let raw: unknown;
    try {
      raw = JSON.parse(rawText(embedded) || "");
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
