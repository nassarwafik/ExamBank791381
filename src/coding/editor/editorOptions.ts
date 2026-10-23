import { CODING_LANGUAGES, codingLanguage } from "../../codingQuestion";
import { lineHeightFor, type EditorPreferences } from "../workspace/editorPreferences";

// Phase 17F-C1 — the PURE editor contract of the professional code editor. No Monaco import, no DOM, no React: this module is
// what the Monaco adapter hands to `editor.create` and what the unit tests pin, so every product decision about the editor is
// data in ONE place:
//   • which Monaco syntax mode a SmartAssess language key gets (registry data, never guessed from the source);
//   • the editing mechanics that are ON (line numbers, bracket matching, auto-closing pairs, indentation, find, folding);
//   • every solution-assistance surface that is OFF — the exam invariant:
//
//     SMARTASSESS CODE EDITOR IMPROVES CODE LEGIBILITY AND EDITING MECHANICS; IT MUST NOT HELP THE STUDENT SOLVE THE
//     PROGRAMMING QUESTION.
//
//   The engine module (monacoEngine.ts) additionally never loads the suggest / parameter-hint / inline-completion / snippet
//   contributions at all, so these options are defence in depth, not the only line.

/** SmartAssess language key → Monaco language id. Exactly the registry languages; anything else is plaintext (fail closed). */
export const EDITOR_LANGUAGE_MODES: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(CODING_LANGUAGES.map(l => [l.key, l.editorLanguage])));
export const PLAINTEXT_MODE = "plaintext";
export const editorLanguageMode = (languageKey: unknown): string => { const def = codingLanguage(languageKey); return def ? EDITOR_LANGUAGE_MODES[def.key] ?? PLAINTEXT_MODE : PLAINTEXT_MODE; };

const deepFreeze = <T extends object>(o: T): Readonly<T> => { for (const v of Object.values(o)) if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v as object); return Object.freeze(o); };

/** Everything that could suggest, complete, hint, generate or rewrite code: OFF. (Monaco option names; see the doc §6.) */
export const EDITOR_ASSISTANCE_OFF = deepFreeze({
  quickSuggestions: false,                 // M1 — no suggestions while typing
  quickSuggestionsDelay: 1_000_000,
  suggestOnTriggerCharacters: false,       // M3 — "." "(" never open a list
  wordBasedSuggestions: "off",             // M2 — no words harvested from the document
  parameterHints: { enabled: false },      // M5 — no signature help
  inlineSuggest: { enabled: false },       // M4 — no ghost text
  snippetSuggestions: "none",              // no snippet templates
  tabCompletion: "off",                    // M6 — Tab indents, never completes
  acceptSuggestionOnEnter: "off",
  acceptSuggestionOnCommitCharacter: false,
  suggest: { showWords: false, showSnippets: false, preview: false, showInlineDetails: false, showIcons: false, filterGraceful: false, showStatusBar: false, shareSuggestSelections: false, showMethods: false, showFunctions: false, showClasses: false, showVariables: false, showKeywords: false, showFields: false, showModules: false, showProperties: false, showConstructors: false, showInterfaces: false, showEnums: false, showTypeParameters: false, showValues: false, showConstants: false, showColors: false, showFiles: false, showFolders: false, showEvents: false, showOperators: false, showUnits: false, showStructs: false, showReferences: false, showUsers: false, showIssues: false, showDeprecated: false },
  hover: { enabled: false },
  codeLens: false,
  lightbulb: { enabled: "off" },
  links: false,                            // no clickable URLs out of the exam
  inlayHints: { enabled: "off" },
  formatOnType: false,                     // the source is never rewritten
  formatOnPaste: false,
  dropIntoEditor: { enabled: false },
  pasteAs: { enabled: false },
  colorDecorators: false,
  definitionLinkOpensInPeek: false,
  occurrencesHighlight: "off",
  semanticHighlighting: { enabled: false },
  showUnused: false,
  renderValidationDecorations: "off"
});

/** Editing mechanics that help legibility and typing, never the solution. */
export const EDITOR_EDITING_FEATURES = deepFreeze({
  lineNumbers: "on",                       // ED6
  matchBrackets: "always",                 // ED7
  bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false },
  guides: { bracketPairs: false, indentation: true, highlightActiveIndentation: true },
  autoClosingBrackets: "languageDefined",  // ED8 — ( [ { per language configuration
  autoClosingQuotes: "languageDefined",    //       " ' per language configuration
  autoClosingDelete: "auto",
  autoClosingOvertype: "auto",
  autoSurround: "languageDefined",
  autoIndent: "full",                      // ED9 — keep / add indentation after Enter (language onEnter rules)
  insertSpaces: true,
  detectIndentation: false,                // the registry indent unit is authoritative, never the source
  trimAutoWhitespace: true,
  find: { addExtraSpaceOnTop: false, autoFindInSelection: "never", seedSearchStringFromSelection: "selection", loop: true },   // ED10
  folding: true,
  foldingHighlight: false,
  showFoldingControls: "mouseover",
  renderLineHighlight: "line",
  selectionHighlight: true,
  cursorBlinking: "blink",
  cursorSmoothCaretAnimation: "off",
  multiCursorModifier: "alt",
  dragAndDrop: true,
  emptySelectionClipboard: true,
  copyWithSyntaxHighlighting: false
});

/** Presentation + layout: a light SmartAssess surface, source as authoritative text, bounded inside the question. */
export const EDITOR_BASE_OPTIONS = deepFreeze({
  ...EDITOR_ASSISTANCE_OFF,
  ...EDITOR_EDITING_FEATURES,
  theme: "smartassess-light",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace",
  fontSize: 14,
  lineHeight: 22,
  letterSpacing: 0,
  fontLigatures: false,
  padding: { top: 10, bottom: 10 },
  lineNumbersMinChars: 3,
  lineDecorationsWidth: 10,
  glyphMargin: false,
  minimap: { enabled: false },
  wordWrap: "off",                         // horizontal scrolling stays INSIDE the editor (ED33)
  scrollBeyondLastLine: false,
  scrollBeyondLastColumn: 2,
  scrollbar: { vertical: "auto", horizontal: "auto", verticalScrollbarSize: 10, horizontalScrollbarSize: 10, alwaysConsumeMouseWheel: false, useShadows: false },
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  renderWhitespace: "none",
  renderControlCharacters: true,
  unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: true, nonBasicASCII: false },
  automaticLayout: true,                   // follows the question width (ResizeObserver)
  fixedOverflowWidgets: true,              // the find widget never widens the page
  stickyScroll: { enabled: false },
  contextmenu: true,                       // cut / copy / paste / undo / redo menu — editing commands only
  editContext: false,                      // the proven <textarea> input path on every browser (IME, screen readers)
  accessibilitySupport: "auto",
  ariaRequired: false,
  tabFocusMode: false,
  mouseWheelZoom: false,
  roundedSelection: true,
  smoothScrolling: false,
  readOnlyMessage: { value: "المحرر للقراءة فقط." }
});

/** The SmartAssess light syntax theme: `vs` base, the application's own ink / blue / green palette, no VS Code branding. */
export const SMARTASSESS_EDITOR_THEME = deepFreeze({
  name: "smartassess-light",
  data: {
    base: "vs" as const,
    inherit: true,
    rules: [
      { token: "", foreground: "1e293b" },
      { token: "keyword", foreground: "7c3aed", fontStyle: "bold" },
      { token: "keyword.python", foreground: "7c3aed", fontStyle: "bold" },
      { token: "keyword.java", foreground: "7c3aed", fontStyle: "bold" },
      { token: "keyword.cs", foreground: "7c3aed", fontStyle: "bold" },
      { token: "string", foreground: "15803d" },
      { token: "string.escape", foreground: "0f766e" },
      { token: "number", foreground: "b45309" },
      { token: "comment", foreground: "64748b", fontStyle: "italic" },
      { token: "type", foreground: "0369a1" },
      { token: "type.identifier", foreground: "0369a1" },
      { token: "identifier", foreground: "1e293b" },
      { token: "delimiter", foreground: "475569" },
      { token: "delimiter.bracket", foreground: "475569" },
      { token: "operator", foreground: "475569" },
      { token: "tag", foreground: "0369a1" },
      { token: "annotation", foreground: "0369a1" },
      { token: "namespace", foreground: "0369a1" },
      { token: "attribute.name", foreground: "0369a1" },
      { token: "invalid", foreground: "b42318" }
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1e293b",
      "editor.lineHighlightBackground": "#f7f9fc",
      "editor.lineHighlightBorder": "#eef2f7",
      "editorLineNumber.foreground": "#94a3b8",
      "editorLineNumber.activeForeground": "#334155",
      "editorGutter.background": "#f7f9fc",
      "editor.selectionBackground": "#dbe7fb",
      "editor.inactiveSelectionBackground": "#e9eef7",
      "editor.selectionHighlightBackground": "#e4edfc",
      "editorCursor.foreground": "#1e293b",
      "editorBracketMatch.background": "#e4edfc",
      "editorBracketMatch.border": "#2563eb",
      "editorBracketHighlight.foreground1": "#2563eb",
      "editorBracketHighlight.foreground2": "#b45309",
      "editorBracketHighlight.foreground3": "#7c3aed",
      "editorIndentGuide.background1": "#e9edf4",
      "editorIndentGuide.activeBackground1": "#cbd5e1",
      "editorWidget.background": "#ffffff",
      "editorWidget.border": "#dce2ec",
      "editorWhitespace.foreground": "#cbd5e1",
      "scrollbarSlider.background": "#cbd5e180",
      "scrollbarSlider.hoverBackground": "#94a3b8a0",
      "scrollbarSlider.activeBackground": "#64748bb0",
      "focusBorder": "#2563eb"
    }
  }
});

/** UX-R18c — the SmartAssess DARK syntax theme, used only when the editor sits on a dark ground (the dark theme, outside the exam
 *  paper's light island): `vs-dark` base, the dark palette of design-tokens-dark.css, the same token roles as the light theme. */
export const SMARTASSESS_EDITOR_THEME_DARK = deepFreeze({
  name: "smartassess-dark",
  data: {
    base: "vs-dark" as const,
    inherit: true,
    rules: [
      { token: "", foreground: "dcd7e8" },
      { token: "keyword", foreground: "b59cee", fontStyle: "bold" },
      { token: "keyword.python", foreground: "b59cee", fontStyle: "bold" },
      { token: "keyword.java", foreground: "b59cee", fontStyle: "bold" },
      { token: "keyword.cs", foreground: "b59cee", fontStyle: "bold" },
      { token: "string", foreground: "7fe2a6" },
      { token: "string.escape", foreground: "5fd4c4" },
      { token: "number", foreground: "f6c37f" },
      { token: "comment", foreground: "a7a1b8", fontStyle: "italic" },
      { token: "type", foreground: "8fd4f6" },
      { token: "type.identifier", foreground: "8fd4f6" },
      { token: "identifier", foreground: "dcd7e8" },
      { token: "delimiter", foreground: "a7a1b8" },
      { token: "delimiter.bracket", foreground: "a7a1b8" },
      { token: "operator", foreground: "a7a1b8" },
      { token: "tag", foreground: "8fd4f6" },
      { token: "annotation", foreground: "8fd4f6" },
      { token: "namespace", foreground: "8fd4f6" },
      { token: "attribute.name", foreground: "8fd4f6" },
      { token: "invalid", foreground: "f8a9a9" }
    ],
    colors: {
      "editor.background": "#1b1825",
      "editor.foreground": "#dcd7e8",
      "editor.lineHighlightBackground": "#231f2e",
      "editor.lineHighlightBorder": "#2e2a3a",
      "editorLineNumber.foreground": "#5e5870",
      "editorLineNumber.activeForeground": "#a7a1b8",
      "editorGutter.background": "#231f2e",
      "editor.selectionBackground": "#3d3360",
      "editor.inactiveSelectionBackground": "#2e2a3a",
      "editor.selectionHighlightBackground": "#332b4d",
      "editorCursor.foreground": "#dcd7e8",
      "editorBracketMatch.background": "#332b4d",
      "editorBracketMatch.border": "#b59cee",
      "editorBracketHighlight.foreground1": "#b59cee",
      "editorBracketHighlight.foreground2": "#f6c37f",
      "editorBracketHighlight.foreground3": "#8fd4f6",
      "editorIndentGuide.background1": "#2e2a3a",
      "editorIndentGuide.activeBackground1": "#3a3549",
      "editorWidget.background": "#231f2e",
      "editorWidget.border": "#3a3549",
      "editorWhitespace.foreground": "#3a3549",
      "scrollbarSlider.background": "#5e587080",
      "scrollbarSlider.hoverBackground": "#7c7690a0",
      "scrollbarSlider.activeBackground": "#a7a1b8b0",
      "focusBorder": "#b59cee"
    }
  }
});

export type EditorCreateInput = { value: string; languageMode: string; label: string; readOnly: boolean; indentUnit: string };
/** The complete `editor.create` option object of ONE instance (the model — value + mode — is created separately by the adapter). */
export function editorCreateOptions(input: EditorCreateInput): Record<string, unknown> {
  return {
    ...EDITOR_BASE_OPTIONS,
    tabSize: Math.max(1, input.indentUnit.length),
    ariaLabel: input.label,
    readOnly: input.readOnly,
    domReadOnly: input.readOnly
  };
}

/** Phase 18B — the ONE mapping from the device-level UI preferences to Monaco PRESENTATION options (applied with updateOptions on a
 *  live editor; the defaults reproduce EDITOR_BASE_OPTIONS exactly). Nothing here can touch the text, the language or assistance. */
export function editorPreferenceOptions(p: EditorPreferences): { fontSize: number; lineHeight: number; wordWrap: "on" | "off"; minimap: { enabled: boolean }; lineNumbers: "on" | "off" } {
  return { fontSize: p.fontSize, lineHeight: lineHeightFor(p.fontSize), wordWrap: p.wordWrap ? "on" : "off", minimap: { enabled: p.minimap }, lineNumbers: p.lineNumbers ? "on" : "off" };
}
