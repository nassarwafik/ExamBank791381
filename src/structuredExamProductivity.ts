// Phase 13B — Enterprise authoring productivity: the PURE model behind the Question Navigator, multi-selection and the
// bulk / bank-insertion operations of the Structured Exam Builder. No React, no DOM.
//
// Identity: a section is `section.id`, a question is `examQuestionId`. Display numbers and array indexes are never
// identity. Every mutation here is ONE pure sections → sections transformation, so the owner applies it as ONE functional
// updater through the Phase 13A history authority (= one undo step). A transformation that changes nothing returns the
// SAME sections reference, so `updateExamHistory` records no entry.
import type { BuilderQuestion, BuilderSection, StructuredExam } from "./examTypes";
import { QUESTION_TYPE_LABELS } from "./examTypes";
import { cloneQuestionWithNewIds, genId } from "./examBuilderState";

/** The bank-sourced metadata a converted bank question carries next to the engine-native fields (see bank-question-exam.js). */
export type BankSourcedFields = {
  origin?: string; bankQuestionId?: string; sourceId?: string; sourceQuestionId?: string; questionNumber?: string;
  section?: string; topic?: string; secondaryTopics?: string[]; difficulty?: number; difficultyLabel?: string; familyKey?: string;
  hasCLI?: boolean; requiresCalculation?: boolean; bankType?: string; textHtml?: string; hint?: string;
};
export type BankExamQuestion = Record<string, unknown> & BankSourcedFields & { presentationType?: string; text?: string };
type MetaQuestion = BuilderQuestion & BankSourcedFields;

// ── A1 · navigator index ──────────────────────────────────────────────────────────────────────────────────────────
export type NavigatorEntry = {
  examQuestionId: string; sectionId: string; sectionTitle: string; sectionIndex: number; questionIndex: number;
  /** The printed number: the display number when set, else the 1-based position in its section. */
  number: string; displayNumber: string; presentationType: string; text: string; marks: number | null;
  origin: "bank" | "manual"; bankQuestionId: string; sourceQuestionNumber: string; topic: string; difficulty: number | null;
};
const PREVIEW_MAX = 120;
const preview = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, PREVIEW_MAX);

export function indexExamQuestions(exam: StructuredExam | null | undefined): NavigatorEntry[] {
  const out: NavigatorEntry[] = [];
  (exam?.sections || []).forEach((s, si) => {
    (s.questions || []).forEach((raw, qi) => {
      const q = raw as MetaQuestion;
      const display = String(q.displayNumber ?? "").trim();
      const d = Number(q.difficulty);
      out.push({
        examQuestionId: String(q.examQuestionId), sectionId: s.id, sectionTitle: String(s.title ?? ""), sectionIndex: si, questionIndex: qi,
        number: display || String(qi + 1), displayNumber: display, presentationType: String(q.presentationType ?? ""), text: preview(q.text),
        marks: Number.isFinite(Number(q.marks)) && q.marks !== undefined && q.marks !== null ? Number(q.marks) : null,
        origin: q.origin === "bank" || (typeof q.bankQuestionId === "string" && q.bankQuestionId) ? "bank" : "manual",
        bankQuestionId: String(q.bankQuestionId ?? ""), sourceQuestionNumber: String(q.questionNumber ?? ""), topic: String(q.topic ?? ""),
        difficulty: Number.isInteger(d) && d > 0 ? d : null
      });
    });
  });
  return out;
}

// ── A2 / A3 · search + filters (over the lightweight index only) ─────────────────────────────────────────────────
export type NavigatorFilters = { q: string; sectionId: string; type: string; origin: "" | "bank" | "manual"; difficulty: string };
export const EMPTY_NAVIGATOR_FILTERS: NavigatorFilters = Object.freeze({ q: "", sectionId: "", type: "", origin: "", difficulty: "" }) as NavigatorFilters;
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
export function navigatorFiltersActive(f: NavigatorFilters): boolean { return !!(norm(f.q) || f.sectionId || f.type || f.origin || f.difficulty); }
export function filterNavigatorEntries(entries: NavigatorEntry[], f: NavigatorFilters): NavigatorEntry[] {
  if (!navigatorFiltersActive(f)) return entries;
  const q = norm(f.q);
  return entries.filter(e =>
    (!f.sectionId || e.sectionId === f.sectionId) &&
    (!f.type || e.presentationType === f.type) &&
    (!f.origin || e.origin === f.origin) &&
    (!f.difficulty || String(e.difficulty ?? "") === f.difficulty) &&
    (!q || [e.text, e.number, e.displayNumber, e.topic, e.sourceQuestionNumber, e.sectionTitle, QUESTION_TYPE_LABELS[e.presentationType as keyof typeof QUESTION_TYPE_LABELS] || ""].some(v => norm(String(v || "")).includes(q)))
  );
}

// ── shared helpers ────────────────────────────────────────────────────────────────────────────────────────────────
const idSet = (ids: Iterable<string>) => new Set(Array.from(ids, v => String(v)));
const sameIds = (a: BuilderQuestion[], b: BuilderQuestion[]) => a.length === b.length && a.every((q, i) => q === b[i]);
/** Keep the original section object whenever its question list is unchanged (reference stability for history). */
function rebuild(sections: BuilderSection[], next: (s: BuilderSection) => BuilderQuestion[]): BuilderSection[] {
  let changed = false;
  const out = sections.map(s => { const qs = next(s); if (sameIds(qs, s.questions || [])) return s; changed = true; return { ...s, questions: qs }; });
  return changed ? out : sections;
}
const existing = (sections: BuilderSection[], ids: Set<string>) => { const found = new Set<string>(); for (const s of sections) for (const q of s.questions || []) if (ids.has(q.examQuestionId)) found.add(q.examQuestionId); return found; };

// ── A4 · bulk delete ──────────────────────────────────────────────────────────────────────────────────────────────
export function bulkDeleteQuestions(sections: BuilderSection[], ids: Iterable<string>): BuilderSection[] {
  const want = existing(sections, idSet(ids));
  if (!want.size) return sections;
  return rebuild(sections, s => (s.questions || []).filter(q => !want.has(q.examQuestionId)));
}

// ── A5 · bulk move (global order: section order, then question order; appended to the target) ───────────────────
export function bulkMoveQuestions(sections: BuilderSection[], ids: Iterable<string>, targetSectionId: string): BuilderSection[] {
  const target = sections.find(s => s.id === targetSectionId);
  if (!target) return sections;
  const want = existing(sections, idSet(ids));
  if (!want.size) return sections;
  const moving: BuilderQuestion[] = [];
  for (const s of sections) for (const q of s.questions || []) if (want.has(q.examQuestionId)) moving.push(q);
  return rebuild(sections, s => {
    const kept = (s.questions || []).filter(q => !want.has(q.examQuestionId));
    return s.id === targetSectionId ? [...kept, ...moving] : kept;
  });
}

// ── A6 · bulk duplicate (each copy right after its original; deep identity clone) ────────────────────────────────
export function bulkDuplicateQuestions(sections: BuilderSection[], ids: Iterable<string>): BuilderSection[] {
  const want = existing(sections, idSet(ids));
  if (!want.size) return sections;
  return rebuild(sections, s => (s.questions || []).flatMap(q => (want.has(q.examQuestionId) ? [q, cloneQuestionWithNewIds(q)] : [q])));
}

// ── A7 · bulk marks (the Builder's rule: finite and > 0 — examQuality MARKS_PROBLEM) ───────────────────────────────
export function isValidQuestionMarks(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v) && v > 0; }
export function bulkSetMarks(sections: BuilderSection[], ids: Iterable<string>, marks: number): BuilderSection[] {
  if (!isValidQuestionMarks(marks)) return sections;
  const want = existing(sections, idSet(ids));
  if (!want.size) return sections;
  return rebuild(sections, s => (s.questions || []).map(q => (want.has(q.examQuestionId) && q.marks !== marks ? { ...q, marks } : q)));
}

// ── insertion (a batch, appended to an EXISTING target section; a missing target is never silently redirected) ──
export function insertQuestionsIntoSection(sections: BuilderSection[], targetSectionId: string, questions: BuilderQuestion[]): BuilderSection[] {
  if (!questions.length || !sections.some(s => s.id === targetSectionId)) return sections;
  return rebuild(sections, s => (s.id === targetSectionId ? [...(s.questions || []), ...questions] : s.questions || []));
}

// ── selection (UI state: ids only) ───────────────────────────────────────────────────────────────────────────────
/** Drop ids that no longer exist in the exam. Returns the SAME Set when nothing changed. */
export function pruneSelection(selected: ReadonlySet<string>, exam: StructuredExam | null | undefined): Set<string> {
  if (!selected.size) return selected as Set<string>;
  const live = new Set<string>();
  for (const s of exam?.sections || []) for (const q of s.questions || []) live.add(q.examQuestionId);
  let changed = false;
  const out = new Set<string>();
  for (const id of selected) { if (live.has(id)) out.add(id); else changed = true; }
  return changed ? out : (selected as Set<string>);
}

/** The exact bank question ids already present in the exam (duplicate prevention in the picker). */
export function usedBankQuestionIds(exam: StructuredExam | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const s of exam?.sections || []) for (const q of s.questions || []) { const id = (q as MetaQuestion).bankQuestionId; if (typeof id === "string" && id) out.add(id); }
  return out;
}

// ── bank → structured bridge ──────────────────────────────────────────────────────────────────────────────────────
export const MAX_BANK_SELECT = 50;
/** The canonical converter names an open-answer question `open` (legacy); the structured Builder authors it as `shortAnswer`. */
const PRESENTATION_BRIDGE: Record<string, string> = { open: "shortAnswer" };
/**
 * From the canonical server conversion (bank-question-exam.js buildExamQuestion — content, answer keys, metadata and
 * SIGNED assets are taken as-is) to a structured BuilderQuestion: a FRESH examQuestionId and fresh nested field / part
 * ids, the requested marks, and only the presentation-type NAME bridged. Nothing else is reinterpreted.
 */
export function bankExamQuestionToBuilderQuestion(canonical: BankExamQuestion, marks: number): BuilderQuestion {
  const presentationType = PRESENTATION_BRIDGE[String(canonical.presentationType || "")] || String(canonical.presentationType || "shortAnswer");
  const base = { ...canonical, examQuestionId: "pending", presentationType, marks, text: String(canonical.text ?? "") } as unknown as BuilderQuestion;
  const fresh = cloneQuestionWithNewIds(base);       // deep copy + fresh question / field / part ids (bank ids never become exam identity)
  if (!fresh.examQuestionId.startsWith("q-")) fresh.examQuestionId = genId("q");
  return fresh;
}
