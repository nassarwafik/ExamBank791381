// Phase 21F.1 — render isolation for the structured builder. The builder hands its section editors and question cards ONE stable
// `actions` object (created once; every call runs the builder's LATEST implementation, refreshed in the commit phase before any
// event can call it). Cards and sections therefore receive no new function on each keystroke and React.memo can skip every card
// whose data did not change. Each action names the exam it was created for (`scope`): an action of an exam that is no longer the
// open one — a late AI image or upload started before another exam was opened — is dropped (Phase 5B / 13A invariant).
import type { BuilderQuestion, BuilderSection } from "../examTypes";

export type BuilderActions = {
  patchSection: (scope: string, sectionId: string, patch: Partial<BuilderSection>) => void;
  deleteSection: (scope: string, sectionId: string) => void;
  moveSection: (scope: string, sectionId: string, delta: number) => void;
  addQuestion: (scope: string, sectionId: string, question: BuilderQuestion) => void;
  changeQuestion: (scope: string, sectionId: string, questionId: string, patch: Partial<BuilderQuestion>) => void;
  deleteQuestion: (scope: string, sectionId: string, questionId: string) => void;
  moveQuestion: (scope: string, sectionId: string, questionId: string, delta: number) => void;
  duplicateQuestion: (scope: string, sectionId: string, questionId: string) => void;
  moveQuestionToSection: (scope: string, sectionId: string, questionId: string, toSectionId: string) => void;
  previewQuestion: (scope: string, sectionId: string, questionId: string) => void;
  /** Phase 21F.5 — insert a new question at a position (the Studio's insert bar). */
  insertQuestion: (scope: string, sectionId: string, index: number, question: BuilderQuestion) => void;
  /** Phase 21F.5 — move a question to an exact position, in its section or another one (drag-and-drop). */
  placeQuestion: (scope: string, fromSectionId: string, questionId: string, toSectionId: string, toIndex: number) => void;
  toggleSelect: (scope: string, questionId: string) => void;
  /** Pending media bookkeeping is per question id and must also settle after another exam opened (never scoped). */
  mediaBusy: (questionId: string, busy: boolean) => void;
  /** DOM anchors by examQuestionId (the navigator / issue focus); attached during the commit, never scoped. */
  registerNode: (questionId: string, el: HTMLDivElement | null) => void;
};
