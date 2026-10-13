import { createContext } from "react";

/**
 * Phase 21E.3 — what the surface around a recovery card tells it.
 *  - scope: "exam" inside the running student exam (StudentExamPage provides it); "general" everywhere else (teacher previews,
 *    live sessions, the learning reader, presentations — the default), where the card uses neutral wording.
 *  - reloadAllowed (exam): a manual page reload is SAFE right now — online, every answer server-confirmed, nothing being
 *    submitted or paused, and the attempt not strict (in a strict attempt leaving the page ends it). The card never reloads by
 *    itself; outside the exam a reload is offered only after a failed retry.
 *  - strict (exam): the attempt is strict, so the card tells the student not to leave the page.
 *  - focusAnchor: focuses the page's stable heading (the question heading, or the review heading on the review screen) and says
 *    whether it could — used after a page-, exam- or review-level card recovered. Any other card lands focus on its own
 *    «تم تحميل هذا الجزء.» line (review fix 2: never on an answer control). Both focus with preventScroll (review fix 3).
 *  - reveal: brings a programmatically focused element clear of the page's sticky bars (keyboard-reveal geometry). Review fix 3:
 *    called only after a retry activated with the keyboard, during which the page did not scroll and nothing was pressed.
 *  - announce: the page's single polite announcer (a card inserted with its text already inside is not reliably announced).
 */
export type QuestionRecovery = {
  scope: "exam" | "general";
  reloadAllowed: boolean;
  strict: boolean;
  focusAnchor?: () => boolean;
  reveal?: (el: HTMLElement) => void;
  announce?: (text: string) => void;
};

/** Marks the «تم تحميل هذا الجزء.» line a recovery card leaves behind (review fix 3: the page's keyboard reveal skips it). */
export const RECOVERY_LINE_ATTRIBUTE = "data-recovery-line";

export const QuestionRecoveryContext = createContext<QuestionRecovery>({ scope: "general", reloadAllowed: false, strict: false });
