import { createContext } from "react";
import { resolveQuestionTypeKey } from "../questionTypeCatalog";
import { resolveQuestionPresentation, type ResolvedPresentation } from "./presentationModel";
import type { PresentationRuntime } from "./presentationContext";

// Phase 20D.1 — the runtime half of the presentation engine (lazy chunks only). PresentationRoot resolves the exam presentation ONCE; a
// SectionPresentationScope re-resolves it for one section. Both expose (a) the resolved values to the shared section shell through
// ResolvedPresentationContext and (b) the tiny PresentationRuntime the initial-graph StudentQuestionCard reads (code-owned data-xp-*
// attributes with vocabulary values only). Student page and teacher preview use these same functions, so their DOM is identical.
export type ResolvedScope = { exam: ResolvedPresentation; section: ResolvedPresentation };
export const ResolvedPresentationContext = createContext<ResolvedScope | null>(null);

type QuestionLike = { presentationType?: unknown; type?: unknown; presentation?: unknown };
/** The question-article attributes for one (section-scoped) resolved presentation. */
export function makePresentationRuntime(section: ResolvedPresentation): PresentationRuntime {
  return {
    questionAttributes(q: QuestionLike) {
      const key = resolveQuestionTypeKey(q.presentationType ?? q.type);
      const r = resolveQuestionPresentation(section, key ? { presentationType: key, presentation: q.presentation } : q);
      const out: Record<string, string> = { "data-xp-variant": r.variant };
      if (key) out["data-xp-type"] = key;
      out["data-xp-card"] = r.card;
      out["data-xp-answer"] = r.answerArea;
      out["data-xp-width"] = r.width;
      out["data-xp-question-number"] = section.components.questionNumber;
      out["data-xp-marks-badge"] = section.components.marksBadge;
      return out;
    }
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export type SectionShell = { id?: string; title?: string; instructions?: string; instructionsRichContent?: unknown; presentation?: unknown };
/** The section-shell input: display text from the normalized section, the additive presentation fields from the raw stored section. */
export function sectionShellOf(section: { id?: string; title?: string; instructions?: string }, raw: unknown): SectionShell {
  const r = isObj(raw) ? raw : {};
  return { id: section.id, title: section.title, instructions: section.instructions, instructionsRichContent: r.instructionsRichContent, presentation: r.presentation };
}
export const sectionMarksLabel = (section: { maxMarks?: number | null }): string | undefined => (section.maxMarks != null ? "العلامة: " + section.maxMarks : undefined);
