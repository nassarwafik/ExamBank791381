// Phase T3 — ADVISORY answer-risk detection: which questions an enabled student tool could answer outright.
//
// Shown to the teacher in the «أدوات الطالب» panel, never blocking and never sent to the student. It is a heuristic over the
// question's visible text (and its type), deliberately conservative: it names a question only on a clear signal (an IPv4 address or
// a networking term for the IPv4 calculator; a number-base name or base notation for the converter; a graph-reading question type for
// the plotter). Answer keys, hints and teacher notes are never read: only display text is scanned. Sections where the tool is
// switched off are skipped, so the warning follows the teacher's own overrides.

import { enabledToolsForSection, type StudentToolId, type StudentToolsSpecV1 } from "./studentToolsSpec";

export type ToolRiskHit = { sectionId: string; questionId: string; label: string };
export type ToolRisk = { tool: StudentToolId; hits: ToolRiskHit[] };

type SectionLike = { id?: unknown; title?: string; questions?: unknown[] };
type ExamLike = { sections?: SectionLike[] };

// Keys that hold teacher-side / answer data: never scanned.
const SKIP_KEYS = new Set(["answer", "answers", "hint", "teacherNote", "aiInstruction", "explanation", "rationale", "history", "redoStack", "rubric", "modelAnswer", "assessmentMeta", "correct", "solution"]);
const TEXT_KEYS = new Set(["text", "title", "stem", "prompt", "label", "instructions", "caption", "content", "value"]);

/** The display text of a question (stem, parts, options, rich content), bounded. */
export function questionDisplayText(node: unknown, depth = 0, out: string[] = []): string {
  if (depth > 8 || out.length > 400) return out.join(" ");
  if (Array.isArray(node)) { for (const v of node) questionDisplayText(v, depth + 1, out); return out.join(" "); }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (SKIP_KEYS.has(k)) continue;
      if (typeof v === "string") { if (TEXT_KEYS.has(k)) out.push(v); }
      else if (v && typeof v === "object") questionDisplayText(v, depth + 1, out);
    }
  }
  return out.join(" ");
}

const IPV4_LITERAL = /(^|[^\d.])(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])/;
const IPV4_TERMS = /عنوان\s*(?:ال)?شبكة|عنوان\s*(?:ال)?بث|قناع\s*(?:ال)?شبكة|القناع|(?:ال)?شبكات?\s*(?:ال)?فرعية|تقسيم\s*(?:ال)?شبك|عدد\s*(?:ال)?(?:أجهزة|اجهزة|مضيفين)|subnet|cidr|broadcast|network\s*address|wildcard/i;
const BASE_TERMS = /الثنائي|الثماني|الست\s*عشري|السادس\s*عشر|السداسي\s*عشر|النظام\s*العشري|أنظمة\s*العد|binary|octal|hexadecimal|\bhex\b/i;
const BASE_NOTATION = /\b[01]+\s*[)\]]?\s*[₂]|\(\s*[0-9A-F]+\s*\)\s*(?:₂|₈|₁₆|_?(?:2|8|16)\b)|\b0x[0-9a-f]+\b|\b0b[01]+\b/i;
const GRAPH_TYPES = new Set(["functionGraphSelection", "functionStudy2d"]);
// Phase T6 — subject tools.
const ASCII_TERMS = /\bascii\b|آسكي|أسكي|اسكي/i;
const BITWISE_TERMS = /bitwise|إزاحة|على مستوى البت|عمليات? (?:منطقية )?على البتات|\b[01]{4,}\s*(?:AND|OR|XOR|NAND|NOR)\s*[01]{4,}\b/i;
const TRUTH_TERMS = /جدول\s*(?:ال)?حقيقة|truth\s*table|بوابات?\s*(?:ال)?منطقية|(?:ال)?دارة\s*(?:ال)?منطقية|logic\s*gates?/i;
// Phase T13 — the hex ↔ binary list answers a question about hexadecimal digits outright.
const HEX_TERMS = /الست\s*عشري|السادس\s*عشر|السداسي\s*عشر|hexadecimal|\bhex\b|\b0x[0-9a-f]+\b|\(\s*[0-9A-F]+\s*\)\s*(?:₁₆|_?16\b)/i;
// AUTO-A4 — the automata lab runs a machine the student copies from the question: any automata question is named.
const AUTOMATA_TERMS = /أوتومات|اوتومات|آلة\s*تورنغ|آلة\s*تورينغ|حالة\s*(?:ال)?قبول|دالة\s*(?:ال)?انتقالات?|مكدّس|مكدس|\b(?:DFA|NFA|PDA)\b|automat|turing\s*machine/i;
const PERIODIC_TERMS = /العدد\s*الذري|الكتلة\s*الذرية|التوزيع\s*الإلكتروني|الجدول\s*الدوري|atomic\s*(?:number|mass)|electron\s*configuration/i;

function questionType(q: Record<string, unknown>): string {
  return String(q.type ?? q.presentationType ?? "");
}

export function questionRiskFor(tool: StudentToolId, q: unknown): boolean {
  if (!q || typeof q !== "object") return false;
  const text = questionDisplayText(q);
  switch (tool) {
    case "ipv4Calculator": return IPV4_LITERAL.test(text) || IPV4_TERMS.test(text);
    case "baseConverter": return BASE_TERMS.test(text) || BASE_NOTATION.test(text);
    case "graphPlotter": return GRAPH_TYPES.has(questionType(q as Record<string, unknown>));
    case "calculator": return false;      // too broad to be useful: every numeric question would be named
    case "formulaSheet": return false;    // the teacher's own text: its risk is stated in the catalog, not guessed
    case "scratchPad": return false;      // answers nothing
    case "asciiTable": return ASCII_TERMS.test(text);
    case "bitwiseCalculator": return BITWISE_TERMS.test(text);
    case "truthTable": return TRUTH_TERMS.test(text);
    case "unitConverter": return false;   // unit changes appear in most physics questions: too broad to name
    case "periodicTable": return PERIODIC_TERMS.test(text);
    case "placeValueBoxes": return false; // computes nothing: the student does the arithmetic
    case "hexBinaryTable": return HEX_TERMS.test(text);
    case "csharpEditor": return false;    // T14: in an exam it never runs code — a writing aid answers nothing
    case "automataLab": return AUTOMATA_TERMS.test(text);
  }
}

/** Per enabled tool (spec order), the questions it may answer, in exam order. Tools with no hit are omitted. */
export function studentToolAnswerRisks(exam: ExamLike, spec: StudentToolsSpecV1 | undefined): ToolRisk[] {
  if (!spec) return [];
  const sections = Array.isArray(exam.sections) ? exam.sections : [];
  const risks: ToolRisk[] = [];
  for (const tool of spec.tools) {
    const hits: ToolRiskHit[] = [];
    sections.forEach((s, si) => {
      const sid = String(s?.id ?? "");
      if (!enabledToolsForSection(spec, sid).some(t => t.id === tool.id)) return;
      (Array.isArray(s?.questions) ? s.questions : []).forEach((q, qi) => {
        if (!questionRiskFor(tool.id, q)) return;
        const qid = String((q as { examQuestionId?: unknown })?.examQuestionId ?? qi);
        hits.push({ sectionId: sid, questionId: qid, label: (s?.title || "القسم " + (si + 1)) + " · السؤال " + (qi + 1) });
      });
    });
    if (hits.length) risks.push({ tool: tool.id, hits });
  }
  return risks;
}
