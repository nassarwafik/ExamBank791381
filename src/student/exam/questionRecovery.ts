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
 *    «تم تحميل هذا الجزء.» line (review fix 2: never on an answer control).
 *  - reveal: brings a programmatically focused element clear of the page's sticky bars (keyboard-reveal geometry).
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

export const QuestionRecoveryContext = createContext<QuestionRecovery>({ scope: "general", reloadAllowed: false, strict: false });
