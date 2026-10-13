import { createContext } from "react";

/**
 * Phase 21E.3 — what the surface around a recovery card tells it.
 *  - scope: "exam" inside the running student exam (StudentExamPage provides it); "general" everywhere else (teacher previews,
 *    live sessions, the learning reader, presentations — the default), where the card uses neutral wording.
 *  - reloadAllowed (exam): a manual page reload is SAFE right now — online, every answer server-confirmed, nothing being
 *    submitted or paused, and the attempt not strict (in a strict attempt leaving the page ends it). The card never reloads by
 *    itself; outside the exam a reload is offered only after a failed retry.
 *  - strict (exam): the attempt is strict, so the card tells the student not to leave the page.
 *  - focusAnchor: focuses a stable heading (the question heading) — used after a page- or exam-level card recovered, and as the
 *    last resort when a recovered part has nothing focusable.
 *  - reveal: brings a programmatically focused element clear of the page's sticky bars (keyboard-reveal geometry).
 *  - announce: the page's single polite announcer (a card inserted with its text already inside is not reliably announced).
 */
export type QuestionRecovery = {
  scope: "exam" | "general";
  reloadAllowed: boolean;
  strict: boolean;
  focusAnchor?: () => void;
  reveal?: (el: HTMLElement) => void;
  announce?: (text: string) => void;
};

export const QuestionRecoveryContext = createContext<QuestionRecovery>({ scope: "general", reloadAllowed: false, strict: false });
