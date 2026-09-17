// UX-6d — client model for the AI-PROPOSAL phase. The AI never mutates the exam: it produces proposals a
// teacher accepts/rejects. This module owns (1) which validator issues are eligible for an AI proposal at
// all, (2) the deterministic question fingerprint that makes a proposal valid ONLY for the exact question
// state it was generated from, (3) applying an accepted proposal by merging ONLY the allowed answer patch
// and preserving every protected field. It is pure and never calls the network (the request is one POST to
// /api/structured-exam-ai-fix, issued by the wizard, one unresolved question at a time).

import type { StructuredExam, BuilderQuestion, BuilderPart, BuilderField, QuestionBody } from "./examTypes";

export type ProposalStatus = "proposed" | "accepted" | "rejected" | "needsManualReview" | "failed" | "stale";

// The answer patch the server is allowed to return per type. It carries ONLY answer-shaped data — never
// examQuestionId, marks, section, text, options, ordering, images, groupId, displayNumber.
export type StructuredAiPatch = {
  // multipleChoice
  correctOptionIndex?: number;
  // trueFalse
  correct?: boolean;
  // multiTrueFalse — one boolean per existing field, keyed by field id
  fieldBooleans?: Record<string, boolean>;
  // fillBlank / wordBank / ordering / tableFill / cliFill / matching — one string per existing field id
  fieldValues?: Record<string, string>;
};

export type StructuredAiProposal = {
  proposalId: string;
  sectionId: string;
  questionId: string;    // examQuestionId
  partId?: string;       // set when the proposal targets a compound part
  presentationType: string;
  issueCodes: string[];
  fingerprint: string;   // the exact question/part state this proposal is valid for
  patch: StructuredAiPatch | null;
  status: ProposalStatus;
  explanation: string;   // short Arabic rationale (never a confidence score)
  statusReason: string;  // Arabic reason for needsManualReview/failed/stale
};

// Issue codes an AI proposal can resolve — a MISSING/UNREACHABLE ANSWER KEY on an auto-graded type. Every
// other code (structural, marks, grading policy, answer unit, duplicate id, empty text, missing options/
// fields, table cell geometry, cli placeholders) is NOT AI-eligible: it is either a teacher decision or a
// structural fix the AI must never make. Driven by CODE, never by parsing an Arabic message.
export const AI_ELIGIBLE_CODES = new Set<string>([
  "MISSING_ANSWER",
  "FIELD_NO_CORRECT",
  "CORRECT_NOT_IN_CHOICES",
  "ANSWER_SEQUENCE_MISMATCH",
  "MATCH_INCOMPLETE_PAIR"
]);

// Types whose answer key an AI proposal can supply. shortAnswer is deliberately excluded — a missing model
// answer is NOT blocking (manual grading is allowed), so we never spend an AI call on it automatically.
const AI_SUPPORTED_TYPES = new Set<string>([
  "multipleChoice", "trueFalse", "multiTrueFalse", "fillBlank", "wordBank", "ordering", "matching", "tableFill", "cliFill"
]);

export const PROTECTED_QUESTION_KEYS = [
  "examQuestionId", "displayNumber", "marks", "groupId", "presentationType", "text", "options", "image", "images", "parts"
] as const;

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();

// Stable per-question (or per-part) fingerprint over exactly the fields that determine what a correct
// answer would be. If the teacher edits any of these after a proposal was generated, the proposal is stale
// and can never be applied. Deterministic and order-preserving (JSON of a normalized projection).
type FingerprintNode = {
  examQuestionId?: string; id?: string; presentationType?: string; type?: string;
  text?: string; cli?: string;
  options?: { text?: string; label?: string; value?: string }[];
  wordBank?: string[];
  tableHeaders?: string[]; tableRows?: string[][];
  fields?: { id?: string; kind?: string; label?: string; statement?: string; row?: number; column?: number; options?: { text?: string; label?: string; value?: string }[] }[];
  [key: string]: unknown;
};
export function questionFingerprint(node: FingerprintNode): string {
  const type = str(node.presentationType || node.type);
  const projection: Record<string, unknown> = {
    id: str(node.examQuestionId || node.id),
    type,
    text: str(node.text),
    options: (Array.isArray(node.options) ? node.options : []).map(o => str(o?.text ?? o?.label ?? o?.value)),
    wordBank: (Array.isArray(node.wordBank) ? node.wordBank : []).map(str),
    cli: str(node.cli),
    tableHeaders: Array.isArray(node.tableHeaders) ? node.tableHeaders.map(str) : [],
    tableRows: Array.isArray(node.tableRows) ? node.tableRows.map(r => (Array.isArray(r) ? r.map(str) : [])) : [],
    fields: (Array.isArray(node.fields) ? node.fields : []).map(f => ({
      id: str(f.id),
      kind: str(f.kind),
      label: str(f.label),
      statement: str(f.statement),
      row: f.row,
      column: f.column,
      options: (Array.isArray(f.options) ? f.options : []).map(o => str(o?.text ?? o?.label ?? o?.value))
    }))
  };
  return JSON.stringify(projection);
}

// A compound question fingerprints per part; a plain question fingerprints as itself. Returns the target
// nodes (question or each part) with the codes/fingerprint an AI request should carry.
export type AiTarget = { sectionId: string; questionId: string; partId?: string; presentationType: string; fingerprint: string; issueCodes: string[]; node: QuestionBody };

// Given the current exam and the validator issues, returns one AI target per UNRESOLVED, AI-eligible
// auto-graded question/part. Structural/marks/policy issues are ignored here (teacher-decision phase).
export function collectAiTargets(
  exam: StructuredExam,
  issues: { code: string; sectionId?: string; questionId?: string; severity: string }[]
): AiTarget[] {
  const eligibleByQuestion = new Map<string, Set<string>>();
  for (const issue of issues) {
    if (issue.severity !== "error" || !issue.questionId || !AI_ELIGIBLE_CODES.has(issue.code)) continue;
    const set = eligibleByQuestion.get(issue.questionId) || new Set<string>();
    set.add(issue.code);
    eligibleByQuestion.set(issue.questionId, set);
  }
  const targets: AiTarget[] = [];
  for (const section of exam.sections || []) {
    for (const q of section.questions || []) {
      const codes = eligibleByQuestion.get(q.examQuestionId);
      if (!codes) continue;
      if (q.presentationType === "compound") {
        // A compound question's issues are reported at the question level; propose per part that is itself
        // an AI-supported type. Each part gets its own fingerprint/target (never replace the whole question).
        for (const p of q.parts || []) {
          if (!AI_SUPPORTED_TYPES.has(p.type)) continue;
          targets.push({
            sectionId: section.id, questionId: q.examQuestionId, partId: p.id, presentationType: p.type,
            fingerprint: questionFingerprint({ ...p, id: p.id }), issueCodes: [...codes], node: p
          });
        }
      } else if (AI_SUPPORTED_TYPES.has(q.presentationType)) {
        targets.push({
          sectionId: section.id, questionId: q.examQuestionId, presentationType: q.presentationType,
          fingerprint: questionFingerprint(q), issueCodes: [...codes], node: q
        });
      }
    }
  }
  return targets;
}

// Locates a question/part node in the exam.
function findNode(exam: StructuredExam, questionId: string, partId?: string): { question: BuilderQuestion; part?: BuilderPart } | null {
  for (const section of exam.sections || []) {
    for (const q of section.questions || []) {
      if (q.examQuestionId !== questionId) continue;
      if (partId) {
        const part = (q.parts || []).find(p => p.id === partId);
        return part ? { question: q, part } : null;
      }
      return { question: q };
    }
  }
  return null;
}

// True when a proposal is still valid for the CURRENT exam (the target exists and its fingerprint matches).
export function proposalIsFresh(exam: StructuredExam, proposal: StructuredAiProposal): boolean {
  const found = findNode(exam, proposal.questionId, proposal.partId);
  if (!found) return false;
  const node = proposal.partId ? found.part! : found.question;
  return questionFingerprint({ ...node, id: proposal.partId ? proposal.partId : proposal.questionId }) === proposal.fingerprint;
}

// Merges an AI patch onto ONE answer body, touching ONLY answer-shaped keys. Protected fields (text,
// options, marks, ids, ordering, images) are never read from the patch, so they cannot change. Returns the
// new body, or null if the patch cannot be applied to this body's type (defensive; the server already
// validated it).
function applyPatchToBody(node: QuestionBody, type: string, patch: StructuredAiPatch): QuestionBody | null {
  const out: QuestionBody = { ...node };
  if (type === "multipleChoice") {
    const opts = Array.isArray(node.options) ? node.options : [];
    const i = Number(patch.correctOptionIndex);
    if (!Number.isInteger(i) || i < 0 || i >= opts.length) return null;
    out.answer = { correctOptionIndex: i };
    return out;
  }
  if (type === "trueFalse") {
    if (typeof patch.correct !== "boolean") return null;
    out.answer = { correct: patch.correct };
    return out;
  }
  if (type === "multiTrueFalse") {
    const map = patch.fieldBooleans || {};
    const fields = Array.isArray(node.fields) ? node.fields : [];
    if (!fields.length || !fields.every(f => typeof map[str(f.id)] === "boolean")) return null;
    out.fields = fields.map(f => ({ ...f, correct: map[str(f.id)] }));
    return out;
  }
  // fillBlank / wordBank / ordering / tableFill / cliFill / matching — one value per existing field id.
  const map = patch.fieldValues || {};
  const fields = Array.isArray(node.fields) ? node.fields : [];
  if (!fields.length) return null;
  const nextFields: BuilderField[] = fields.map(f => (map[str(f.id)] !== undefined ? { ...f, correct: str(map[str(f.id)]) } : f));
  out.fields = nextFields;
  if (type === "fillBlank" || type === "wordBank" || type === "ordering") {
    out.answer = { mode: "exactSequence", values: nextFields.map(f => str(f.correct)) };
  } else if (type === "matching") {
    out.answer = { text: nextFields.map(f => str(f.label) + "=" + str(f.correct)).filter(p => !p.endsWith("=")).join(";") };
  }
  // tableFill / cliFill keep answer on the fields (grading reads field.correct) — no answer.* rewrite.
  return out;
}

// Applies an accepted proposal to the exam, preserving every protected field. Returns the new exam, or the
// original exam unchanged when the proposal is stale/unfresh or the patch does not fit (never throws).
export function applyProposal(exam: StructuredExam, proposal: StructuredAiProposal): { exam: StructuredExam; applied: boolean } {
  const patch = proposal.patch;
  if (!patch || !proposalIsFresh(exam, proposal)) return { exam, applied: false };
  let applied = false;
  const sections = (exam.sections || []).map(section => {
    if (section.id !== proposal.sectionId) return section;
    const questions = section.questions.map(q => {
      if (q.examQuestionId !== proposal.questionId) return q;
      if (proposal.partId) {
        const parts = (q.parts || []).map(p => {
          if (p.id !== proposal.partId) return p;
          const body = applyPatchToBody(p, p.type, patch);
          if (!body) return p;
          applied = true;
          return { ...p, ...body, id: p.id, type: p.type, marks: p.marks, label: p.label };
        });
        return { ...q, parts };
      }
      const body = applyPatchToBody(q, q.presentationType, patch);
      if (!body) return q;
      applied = true;
      // Reassert protected identity/structure so a malformed body spread can never drop them.
      return { ...q, ...body, examQuestionId: q.examQuestionId, presentationType: q.presentationType, marks: q.marks, text: q.text, options: q.options, displayNumber: q.displayNumber, groupId: q.groupId };
    });
    return { ...section, questions };
  });
  return { exam: applied ? { ...exam, sections } : exam, applied };
}

// Groups issue codes for the wizard summary — by CODE, never by message text.
export type IssueGroup = "missingAnswer" | "sequenceMismatch" | "structural" | "marksSection" | "manual";
export function groupOfCode(code: string): IssueGroup {
  if (code === "MISSING_ANSWER" || code === "FIELD_NO_CORRECT" || code === "CORRECT_NOT_IN_CHOICES") return "missingAnswer";
  if (code === "ANSWER_SEQUENCE_MISMATCH" || code === "MATCH_INCOMPLETE_PAIR") return "sequenceMismatch";
  if (code === "MARKS_PROBLEM" || code.startsWith("GRADING_POLICY") || code.startsWith("MAXMARKS") || code === "ALL_HAS_MAXMARKS" || code === "INVALID_MAXMARKS" || code.startsWith("ANSWER_UNIT") || code.startsWith("FIRSTN")) return "marksSection";
  if (code === "STIMULUS_MISSING" || code === "EMPTY_SECTION" || code === "CLI_FIELD_UNUSED" || code === "MARKS_MISMATCH") return "manual";
  return "structural";
}

export const ISSUE_GROUP_LABELS: Record<IssueGroup, string> = {
  missingAnswer: "مفتاح إجابة ناقص",
  sequenceMismatch: "عدم تطابق الحقول/التسلسل",
  structural: "مشكلة بنيوية",
  marksSection: "علامات/قسم — قرار المعلم",
  manual: "تحتاج مراجعة يدوية"
};
