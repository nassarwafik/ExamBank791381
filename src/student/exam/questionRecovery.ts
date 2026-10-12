import { createContext } from "react";

/**
 * Phase 21E.3 — what the running exam tells a question recovery card. Provided by StudentExamPage; absent (the default) in the
 * teacher preview and anywhere else, where the card offers only «إعادة المحاولة».
 *  - reloadAllowed: a manual page reload is SAFE right now — every answer is server-confirmed, nothing is being submitted, and
 *    the attempt is not strict (in a strict attempt leaving the page ends it). The card never reloads by itself.
 *  - strict: the attempt is strict, so the card tells the student not to leave the page.
 *  - focusAnchor: moves focus to a stable place (the question heading) before the card disappears on a retry, so focus never
 *    falls back to <body>.
 *  - announce: the page's single polite announcer (a card inserted with its text already inside is not reliably announced).
 */
export type QuestionRecovery = { reloadAllowed: boolean; strict: boolean; focusAnchor?: () => void; announce?: (text: string) => void };

export const QuestionRecoveryContext = createContext<QuestionRecovery>({ reloadAllowed: false, strict: false });
