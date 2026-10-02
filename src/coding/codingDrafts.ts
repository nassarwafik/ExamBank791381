// Phase 17E-B — per-language working drafts of ONE coding question, kept in MEMORY for the current exam-page session only.
// The canonical Answer stays { kind:"code", language, languageVersion, source } — exactly one language is saved and submitted.
// When the student switches language, the source of the language they leave is remembered here so switching back restores
// it instead of silently losing it. Nothing is written to localStorage / sessionStorage / the server; the store is keyed by the
// exam page's attempt seam object (a new page session — another student, a new token — gets a fresh store and never sees
// another session's drafts) and dies with it. Without a seam (teacher preview, tests) the caller passes its own local record.
export type LanguageDrafts = Record<string, string>;
export type DraftScope = { owner: object | undefined; questionId: string; local: LanguageDrafts };

const sessions = new WeakMap<object, Map<string, LanguageDrafts>>();

function draftsOf(scope: DraftScope): LanguageDrafts {
  if (!scope.owner) return scope.local;
  let byQuestion = sessions.get(scope.owner);
  if (!byQuestion) { byQuestion = new Map(); sessions.set(scope.owner, byQuestion); }
  let drafts = byQuestion.get(scope.questionId);
  if (!drafts) { drafts = {}; byQuestion.set(scope.questionId, drafts); }
  return drafts;
}
/** The remembered source of `language` (undefined when the student never left that language in this session). */
export const readLanguageDraft = (scope: DraftScope, language: string): string | undefined => draftsOf(scope)[language];
/** Remembers the source the student leaves behind when switching away from `language`. */
export function rememberLanguageDraft(scope: DraftScope, language: string, source: string): void { draftsOf(scope)[language] = source; }
/** Languages (other than `except`) with a remembered draft that satisfies `meaningful`. */
export const otherLanguageDrafts = (scope: DraftScope, except: string, meaningful: (language: string, source: string) => boolean): string[] =>
  Object.entries(draftsOf(scope)).filter(([l, s]) => l !== except && meaningful(l, s)).map(([l]) => l);
