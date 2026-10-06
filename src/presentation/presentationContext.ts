// Phase 20D.1 — the ONLY presentation module the initial graph may import (StudentQuestionCard reads it). It carries no logic: the
// provider (PresentationRoot / SectionPresentationScope, lazy chunks) supplies the resolved, validated runtime. Absent provider ⇒ null ⇒
// the legacy rendering path, byte-for-byte.
import { createContext } from "react";

export type PresentationRuntime = {
  /** Code-owned data-xp-* attributes for one question article (type variant, card, answer area, width) — vocabulary values only. */
  questionAttributes: (q: { presentationType?: unknown; type?: unknown; presentation?: unknown }) => Record<string, string>;
};
export const ExamPresentationContext = createContext<PresentationRuntime | null>(null);
