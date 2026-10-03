# Phase 17F-C1 — Professional Syntax-Highlighted Code Editor

> **SMARTASSESS CODE EDITOR IMPROVES CODE LEGIBILITY AND EDITING MECHANICS; IT MUST NOT HELP THE STUDENT SOLVE THE
> PROGRAMMING QUESTION.**
>
> No autocomplete, no IntelliSense, no word / snippet / inline / AI completion, no parameter hints, no code generation —
> enforced in the editor configuration, in the set of editor features that are bundled at all, in the unit tests, in the
> production bundle guard and in the real-browser check.

Phase 17F-C1 replaces the plain `<textarea>` writing experience of Phases 17A–17E with a professional editor built on the
Monaco engine (the editor core of VS Code, MIT): syntax highlighting for exactly Python, Java and C#, line numbers,
current-line highlight, bracket matching and bracket-pair colouring, auto-closing pairs, indentation, find / replace,
folding — behind the existing lazy coding path, with SmartAssess still the only authority for the student's source.

It changes **no** backend, runner, grading, autosave, submission or evidence code. 17F-B1 (observability / pending grade
results, developed in parallel) is untouched.

---

## 1. Pre-implementation audit (baseline `eb61b5d3ce73ee54f734c3c188e167b0afa8d7c8`)

| Seam | Finding at baseline |
|---|---|
| `src/coding/CodingEditor.tsx` | ONE dependency-free `<textarea>` editor for the student answer, teacher starter code and reference solutions: LTR + monospace inside the RTL page, a one-text-node line-number gutter, Tab / Shift+Tab indentation by the registry indent unit, indentation kept on Enter (+ one unit after `: { ( [`), `execCommand("insertText")` so native undo survives, **Esc then Tab** leaves the editor, UTF-8 `maxBytes` refusal with an Arabic alert + a size indicator near the limit, `readOnly`, `minRows` |
| Callers | `CodingResponse.tsx` (student + teacher preview, `maxBytes` = min(question `sourceBytes`, `CODE_SOURCE_MAX_BYTES`)) and `CodingQuestionEditor.tsx` (starter code per language, reference solutions). Both pass `value / onChange / language / label / readOnly / maxBytes (/ minRows)` and know nothing about the editor's internals |
| Lazy loading | `studentRegistry.tsx` / `authoringRegistry.tsx` register `coding@1` through `lazy(() => import(...))`; `CodingEditor` ships only inside those chunks. `scripts/check-bundle-budget.mjs` fails the build if any coding class-name signature reaches the initial graph; initial-JS budget 125 KB gzip, measured **124.3 KB** (15 files) at baseline — 0.7 KB headroom |
| Languages | `CODING_LANGUAGES` (`codingQuestion.ts`): python / java / csharp, each with `editorLanguage` (already present, unused until now) and `indentUnit` |
| Answer / autosave | `{ kind:"code", language, languageVersion, source }` emitted through `onAnswer`; the existing autosave / restore / submit pipeline persists it; per-language in-memory drafts in `codingDrafts.ts` (session-scoped `WeakMap`, no storage) |
| Review | `CodeSourceView.tsx`: read-only `<pre>` text view with a gutter (no highlighting), used by AssignmentReview / key summary |
| Tests | `coding.17a` (C5 editor contract), `coding.17e-a/b`, `codingAutosave.17a`, `codingRun.17b`, `codingGrading.17c/17e-c`, `codingEvidence.17e-d` all drive the editor through the `textbox` role and `fireEvent.change` under happy-dom |
| Build | Vite 8 (rolldown), React 19, TypeScript 6, oxlint, vitest 4 + happy-dom; no browser harness, no Playwright in the repo; Chromium available in the CI container |
| Theme | `src/design-tokens.css` light `--eb-*` tokens; **no dark-mode authority exists** (`prefers-color-scheme` / `data-theme` unused) |

---

## 2. Editor engine choice — Monaco (`monaco-editor` 0.57.0, exact pin)

Audited against the gate in the phase prompt before any code was written:

| Requirement | Evidence |
|---|---|
| Python / Java / C# highlighting | `monaco-editor/languages/definitions/{python,java,csharp}/register` — Monarch grammars with keywords, strings (incl. escapes / verbatim / interpolated), numbers, comments; each grammar is itself a lazy chunk loaded the first time the language is encountered |
| Stays lazy / out of the initial graph | 0.57 reorganised the ESM build into tree-shakeable entry points; the engine is reached ONLY through `import("./monacoEngine")` in `editorEngine.ts` (§4) — initial graph 124.3 → 124.5 KB, unchanged in substance (§5) |
| Completion reliably disabled | the suggest / parameter-hint / inline-completion / snippet contributions are **not imported at all** (no such code in the bundle: `suggest-widget`, `parameter-hints-widget`, `editor.action.triggerSuggest`… occur 0 times in any chunk) AND every option is set off (§6) |
| Works with the Vite 8 build | `vite build` emits `monacoEngine-*.js`, `monacoEngine-*.css`, `python-/java-/csharp-*.js`, `editor.worker-*.js`, `codicon-*.ttf`; the worker is a `?worker` Vite module worker |
| Production-safe workers | `globalThis.MonacoEnvironment.getWorker` returns the bundled same-origin worker. With every worker-backed feature off (word suggestions, links, diff) Monaco never even instantiates it in the exam editor (browser check B2) |
| Bundle impact understood | §5 |
| No external service | Monaco standalone has no telemetry and no network I/O; every request in the real-browser run was same-origin (E2) |

Why not a wrapper library (`@monaco-editor/react`): it loads Monaco from a CDN by default (prohibited), adds a dependency with
its own lifecycle assumptions and would still need the same disposal / controlled-value work. A ~120-line adapter
(`monacoAdapter.ts`) over the structural `MonacoLike` type is smaller, testable against a fake API, and keeps every callers'
contract unchanged.

Why not CodeMirror 6 (the 17A follow-up note): it would also satisfy the requirements, but the phase asked for a VS Code-like
experience and Monaco met every gate; no silent substitution was needed.

**Dependency delta** (`package-lock.json`, +40 lines, 4 packages): `monaco-editor` 0.57.0 (MIT), its two runtime
dependencies `marked` 14.0.0 (MIT) and `dompurify` 3.4.15 (MPL-2.0 OR Apache-2.0) — Monaco's markdown renderer, used here only
for the read-only message — and `@types/trusted-types` 2.0.7 (types only). No other transitive dependency.

---

## 3. Architecture

```
CodingResponse / CodingQuestionEditor            (unchanged callers: value / onChange / language / label / readOnly / maxBytes / minRows)
        │
        ▼
src/coding/CodingEditor.tsx                       ONE component, two surfaces
   ├─ NativeCodingEditor   — the Phase 17A <textarea> editor (paints first; stays on phones / touch / no-layout DOMs / engine failure)
   └─ RichCodingEditor     — React owns the value; an EditorEngineHandle owns the DOM
        │  getEditorEngineLoader()  → null (native) | () => import("./monacoEngine")
        ▼
src/coding/editor/editorEngine.ts                 the engine SEAM (types, capability check, loader; test override)
src/coding/editor/editorOptions.ts                the PURE contract: language → mode, options ON / OFF, light theme (no Monaco import)
src/coding/editor/monacoAdapter.ts                createMonacoEngine(monaco): EditorEngine — testable against a fake Monaco
src/coding/editor/monacoEngine.ts                 the ONLY module importing monaco-editor: curated contributions + 3 languages + worker
```

- **Native first, rich on arrival.** The textarea renders synchronously, so a coding question is usable before the 742 KB
  engine chunk arrives (or when it never does). When the loader resolves, `RichCodingEditor` mounts with the SAME source;
  a keyboard user who was already typing keeps focus and caret (`handover`). The root carries `data-editor-engine="native" |
  "monaco"` for tests and support.
- **Capability check** (`richEditorAvailable`): `matchMedia` + `ResizeObserver` present, viewport wider than 600 px, not a
  touch-primary device (`(hover: none) and (pointer: coarse)`), and a real layout engine (a 10 px probe element measures
  10 px). happy-dom fails the layout probe, so **no unit suite ever loads Monaco** and every existing coding suite keeps
  driving the textarea unchanged. Tests inject a fake engine through `setEditorEngineLoader()`.
- **Handle** (`EditorEngineHandle`): `getValue / setValue / setLanguage / setReadOnly / setLabel / setInvalid / focus /
  hasFocus / setCursorOffset / getCursorOffset / layout / dispose`. Nothing Monaco-specific leaks to callers.

### 3.1 Controlled value / autosave invariant

- Every user edit reaches SmartAssess through `accept(fullText)`: the component checks the UTF-8 byte limit, then calls the
  existing `onChange` → `onAnswer` → Answer `{kind:"code", language, languageVersion, source}` → existing autosave / restore /
  submit. `synced` remembers the last text both sides agree on.
- A controlled update (per-language draft restore, «استعادة الكود الابتدائي», a refreshed attempt) is pushed with
  `setValue` **once** and never echoed back through `accept` (the adapter guards its own content event). Equal re-renders do
  not touch the engine (undo stack intact).
- The model is forced to **LF**, exactly like the textarea's DOM normalisation; no edit is emitted on mount, so a restored
  canonical source stays byte-identical until the student types.
- No `localStorage`, no Monaco model kept outside the component lifecycle, no second persistence system, no language guessing:
  `editorLanguageMode()` maps the registry key only; anything else is `plaintext` (fail closed).

### 3.2 Byte limit

`maxBytes` is enforced in `accept`: an over-limit edit returns `false`, the adapter reverts the model to the last accepted
text (deferred one microtask — a model is never edited inside its own change event) and puts the caret back at the edit
point; the component shows the same Arabic alert as before (`role="alert"`) and flags the input `aria-invalid`. Multibyte
text is counted in UTF-8 (unit test: 🎉 / é; browser check D5 with an 8-byte limit).

### 3.3 Lifecycle / disposal

`RichCodingEditor` creates the engine handle once per engine in a layout effect and disposes it on unmount: listeners,
the `MutationObserver`, the editor, the model, and the host's children. A loader that resolves after unmount creates
nothing. Switching question, language, exam or Builder question therefore leaks nothing (browser check E1: after 12 rapid
language switches exactly three editor instances exist for three editors).

### 3.4 Language switching

`language` → `useSync` → `handle.setLanguage(mode)` → `monaco.editor.setModelLanguage` on the **same** model: the source
is untouched, re-tokenised for the new grammar immediately (browser check B6: a Python source in Java mode loses its `def`
keyword colour). The per-language draft rules of 17E-B are unchanged — they live in `CodingResponse` / `codingDrafts.ts`,
which this phase does not modify; the draft restore reaches the editor as a controlled `value` change.

---

## 4. Lazy loading design and the bundle guard

Edges in the production build (`vite build`):

```
index.html ──static──▶ index-*.js (initial graph: 16 files, 124.5 KB gzip)
   └─ import() ──▶ CodingResponse-*.js / CodingQuestionEditor-*.js ──static──▶ codingContract-*.js (CodingEditor, editorEngine, editorOptions)
                                                                                    └─ import() ──▶ monacoEngine-*.js (+ monacoEngine-*.css)
                                                                                                      ├─ import() ──▶ python-*.js | java-*.js | csharp-*.js (grammar on first use)
                                                                                                      └─ new Worker() ──▶ editor.worker-*.js (only if a worker-backed feature asks)
```

`scripts/check-bundle-budget.mjs` (run by `npm run build` / `npm run check:bundle`) now also fails when:

1. no Monaco chunk is emitted (`MONACO_SIGNATURES`, two of three content signatures);
2. a Monaco chunk is in the initial graph;
3. a Monaco chunk is in the **static closure** of the coding question chunks, or not behind one of their dynamic edges;
4. no `editor.worker-*.js` file is emitted, or it is part of a static graph;
5. **any** chunk carries completion machinery (`COMPLETION_SIGNATURES`: `suggest-widget`, `parameter-hints-widget`,
   `editor.action.triggerSuggest`, `editor.action.triggerParameterHints`, `editor.action.inlineSuggest.trigger`);
6. any chunk references a public CDN host (`cdn.jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com`).

The 125 KB initial-JS budget is unchanged.

---

## 5. Bundle impact (gzip level 9, `check:bundle` figures; before = baseline build in a clean worktree)

| Graph / chunk | Before | After |
|---|---|---|
| Initial JS graph | 15 files, **124.3 KB** | 16 files, **124.5 KB** (budget 125) — the +0.2 KB is rolldown's shared runtime helper (194 B) now emitted as its own file plus 34 B in `index-*.js`; no editor code |
| `CodingResponse-*.js` | 5.34 KB | 5.39 KB |
| `CodingQuestionEditor-*.js` | 5.06 KB | 5.09 KB |
| `codingContract-*.js` (shared coding chunk; now also CodingEditor + engine seam) | 2.18 KB | 5.34 KB |
| Coding question static closure beyond the initial graph | — | 5 files, 19.5 KB — no Monaco, no worker |
| `monacoEngine-*.js` (engine, lazy, behind the editor's own `import()`) | — | 3,019.6 kB raw / **742.4 KB** gzip |
| `monacoEngine-*.css` | — | 125.5 kB raw / 18.2 KB gzip |
| `python-*.js` / `java-*.js` / `csharp-*.js` (grammars, lazy per language) | — | 1.4 / 1.3 / 1.6 KB gzip |
| `editor.worker-*.js` (separate; never fetched by the exam editor — see B2) | — | 303.2 kB raw / 90.4 KB gzip |
| `codicon-*.ttf` (icon font, fetched only when a Find / folding glyph renders) | — | 153 kB |

The engine chunk is large because Monaco's standalone core (`editor.api`) carries the diff editors and the standalone
services whatever subset of contributions is imported; it is downloaded once per deployment version (hashed, cacheable), only
when a coding editor is on screen, and never before the question is usable. Login, dashboards, non-coding exams and the
teacher platform do not request it (browser check A1 on the real `dist/index.html`: 26 requests, none Monaco).

---

## 6. Completion / autocomplete prohibition — exact mechanisms

**Not bundled** (never imported by `monacoEngine.ts`; source guard + `COMPLETION_SIGNATURES` bundle guard):
`contrib/suggest`, `contrib/parameterHints`, `contrib/inlineCompletions`, `contrib/snippet`, `contrib/codeAction`,
`contrib/codelens`, `contrib/rename`, `contrib/gotoSymbol`, `contrib/inlayHints`, `contrib/hover`, `contrib/links`,
`contrib/format`, `contrib/dropOrPasteInto`, the quick-access / command palette, `editor.main`, every other language
definition, every language *feature* (JSON / CSS / HTML / TypeScript services + workers), the LSP client.

**Options set off** (`EDITOR_ASSISTANCE_OFF`, frozen, part of every `create()`; unit tests ED11–ED18, mutations M1–M6):

| Option | Value |
|---|---|
| `quickSuggestions` | `false` (+ `quickSuggestionsDelay` 1 000 000) |
| `suggestOnTriggerCharacters` | `false` |
| `wordBasedSuggestions` | `"off"` |
| `parameterHints.enabled` | `false` |
| `inlineSuggest.enabled` | `false` |
| `snippetSuggestions` | `"none"` |
| `tabCompletion` | `"off"` |
| `acceptSuggestionOnEnter` / `acceptSuggestionOnCommitCharacter` | `"off"` / `false` |
| `suggest.*` | every `show*` false, `preview` false, `showInlineDetails` false, `showIcons` false, `showStatusBar` false, `shareSuggestSelections` false |
| `hover.enabled`, `codeLens`, `lightbulb.enabled`, `links`, `inlayHints.enabled` | `false`, `false`, `"off"`, `false`, `"off"` |
| `formatOnType`, `formatOnPaste`, `dropIntoEditor.enabled`, `pasteAs.enabled` | `false` (the source is never rewritten) |
| `colorDecorators`, `occurrencesHighlight`, `semanticHighlighting.enabled`, `showUnused`, `renderValidationDecorations` | `false`, `"off"`, `false`, `false`, `"off"` |

**Announced to assistive technology**: the input carries `aria-autocomplete="none"` (Monaco would say `both`; the adapter
re-applies ours after every option change and through a `MutationObserver`).

**Proved in a real browser** (C1–C3): typing `pri`, `Ctrl+Space`, `(`, `Sys.` never shows a suggest widget, parameter hints
or ghost text; the DOM contains no `.suggest-widget` / `.parameter-hints-widget` at all; `(` auto-closes and Tab indents.

---

## 7. Allowed smart-editing features (`EDITOR_EDITING_FEATURES`)

line numbers (`lineNumbers: "on"`), current-line highlight (`renderLineHighlight: "line"`), bracket matching
(`matchBrackets: "always"`), bracket-pair colorization, indentation guides, auto-closing `()[]{}""''` and surrounding pairs
(`"languageDefined"`), auto-indent after newline (`autoIndent: "full"`, language `onEnter` rules), Tab / Shift+Tab indentation
(`tabSize` = registry indent unit, `insertSpaces`, `detectIndentation: false`), undo / redo (+ cursor undo), selection /
multi-cursor (Alt), copy / paste (+ context menu with editing commands only), Find / Replace (`Ctrl+F` / `Ctrl+H`,
`seedSearchStringFromSelection: "selection"`), folding, line operations (move / copy / delete line), toggle comment
(`Ctrl+/`), horizontal + vertical scrolling inside the editor (`wordWrap: "off"`), whitespace-preserving source, monospace
font, LTR editing inside the RTL shell, read-only message in Arabic, `Ctrl+M` tab-focus toggle.

Not enabled: minimap, sticky scroll, word wrap, unicode ambiguity highlighting (Arabic in strings must not be flagged),
reindent / format actions, EditContext input (`editContext: false` — the proven textarea input path on every browser).

---

## 8. Theme

`smartassess-light` (`SMARTASSESS_EDITOR_THEME`): `vs` base with SmartAssess ink / blue / purple / green / amber colours
(keyword `#7c3aed` bold, string `#15803d`, number `#b45309`, comment `#64748b` italic, type `#0369a1`, text `#1e293b`;
gutter `#f7f9fc`, current line `#f7f9fc`, selection `#dbe7fb`, bracket match border `#2563eb`). No VS Code branding, no dark
theme hard-coded into the light page. Dark mode: the application has no theme authority to integrate with, so none was
added (§13).

---

## 9. Privacy / exam-integrity boundary

The editor is a text-editing surface. It does not execute or compile, contacts no IDE / language server / cloud service,
sends source nowhere (every request same-origin — browser check E2; Monaco standalone has no telemetry), exposes no hidden
test or reference solution (the student projection is unchanged; 17E suites re-run green), infers no score, and changes no
Runner protocol or grading authority. Execution remains only `/api/coding/run`; official grading is unchanged (17C / 17E-C /
17E-D suites re-run green). Editor assets are part of the SmartAssess deployment (`dist/assets`); no CDN.

---

## 10. Accessibility

- The engine input is a labelled multiline `textbox` (`ariaLabel` = the same label as before), described by the on-screen
  hint (`aria-describedby`), `aria-autocomplete="none"`, `aria-invalid` on a refused edit, the alert in `role="alert"`.
- **Keyboard escape**: Esc arms Monaco's tab-focus mode so the next Tab moves browser focus (the same gesture as the
  native editor); any other key or leaving the editor re-arms indentation. `Ctrl+M` (Monaco's own toggle) is also
  available and documented in the hint. Browser checks D1 / D2.
- Read-only: `readOnly` + `domReadOnly`, the hint reads «للقراءة فقط», typing is impossible (D6).
- Focus: the frame shows the SmartAssess focus ring (`:focus-within`); focus and caret are handed over when the engine
  replaces the native editor under a typing user.
- Colour is never the only carrier of state: refusal has text, read-only has text, keywords are also bold; contrast of
  every syntax colour on white ≥ 4.5:1 (purple 6.9, green 5.4, amber 5.0, grey 4.6, blue 6.3).
- Screen-reader mode: Monaco's `accessibilitySupport: "auto"` is kept, so a screen reader gets the accessible view.

---

## 11. Mobile / small screens

Monaco does not support mobile browsers (its own FAQ). Below 600 px (the existing coding CSS breakpoint) and on
touch-primary devices the **native editor is the deliberate choice** (`NATIVE_FALLBACK_MEDIA`): the same source, same
contract, no engine download (browser check F1: a 375 px touch context stays native and requests nothing from the engine).
On wide touch devices with a hover-capable pointer (laptops with touch screens) the rich editor is used. The page never
overflows horizontally on either surface (D4 / F2).

---

## 12. Tests and evidence

### 12.1 Fail-first (recorded on the unchanged baseline)

The three new suites were written first and run on the untouched tree: all three failed at import
(`Failed to resolve import "./editor/editorEngine"`, `Cannot find module './editorOptions'`) — 3 files failed, 0 tests ran.

### 12.2 Unit suites (happy-dom, no Monaco loaded) — 47 tests

| File | Covers |
|---|---|
| `src/coding/editor/editorOptions.17f-c1.test.ts` | ED1–ED4 mapping (+ fail-closed, M7 / M8), ED6–ED10 features, ED11–ED18 assistance off, create() input, theme |
| `src/coding/editor/monacoEngine.17f-c1.test.ts` | the adapter against a fake Monaco: create options, aria, ED20 exact edits, ED21 / M12 no echo + no churn, ED22 / M10 revert, ED4 / M13 language switch, ED24 read-only, ED31 Esc-then-Tab, focus / caret, ED27 / M11 disposal |
| `src/coding/codingEditor.17f-c1.test.tsx` | engine selection (capability checks, native fallback, hand-over, loader failure), ED20–ED22 through React, size / read-only hints, ED4 / ED23 / M13, ED31 focus hand-over, ED33 bounded height, ED27 / M11 unmount + late loader, source guards ED25 / ED26 / ED34 / M9 / M14 (only `monacoEngine.ts` imports Monaco; the loader uses `import()`; no forbidden contribution; no http(s) / CDN; the bundle guard carries the signatures) |

### 12.3 Real browser (`scripts/check-code-editor-browser.mjs`, Chromium, production-mode build of `browser-harness/code-editor.html`) — 27 / 27

A1 real app entry requests no engine chunk · B1 native-first hand-over · B2 worker never fetched / same-origin · B3 Python
(`def` keyword, `5` number, identifiers plain), Java and C# (`public class static void int` keyword, `5` number) · B4 three
distinct colourings · B5 typed strings and comments coloured per language · B6 language switch keeps the source and
re-highlights (`def` loses its keyword colour in Java) · C1–C5 no suggestion UI, auto-close + Tab, exact onChange, aria ·
D1–D6 Esc-Tab escape, Tab indents again, Find, long line stays inside, 8-byte limit with 🎉 / é, read-only · E1–E3 no leak,
same-origin only, no console / page error · F1–F2 phone context native + no overflow. Screenshots are written next to the
report (`HARNESS_OUT/screens`).

### 12.4 Regression

`src/coding` + `src/questionTypes` (18 files, 341 tests) green; the full suite, lint, `tsc -b`, `vite build` and the bundle
guard are reported in the PR.

### 12.5 Mutation testing

See the PR body for the table (M1–M14, every mutation killed by a unit test or the bundle guard; tree restored byte-for-byte).

---

## 13. Known limitations / deferred

- **Engine payload** 742 KB gzip on the first coding question of a deployment version (then cached). The native editor
  makes the question usable immediately; a slow network only delays highlighting.
- **Phones / touch-primary devices** get the native editor (no highlighting) by design.
- **Dark mode**: none in the application; the editor ships one light theme.
- **Mixed line endings** in a legacy source are normalised to LF on the first edit (the textarea behaved the same);
  a source that is never edited is never re-emitted.
- **`CodeSourceView` (teacher review) keeps its plain text rendering** — deferred to 17F-C2: a read-only engine on the
  review screens would pull the 742 KB chunk into AssignmentReview and needs its own measurement and regression pass;
  editing correctness had priority in C1.
- **Find widget strings** are Monaco's (English); the hint and every SmartAssess message are Arabic.
- Deep contribution imports (`monaco-editor/editor/contrib/...`) are stable in the 0.57 ESM build but not an advertised
  API: the version is pinned exactly and the source guard names every import, so an upgrade is a reviewed change.

---

## 14. Rollback

Revert the PR commit(s): callers never changed their contract, `CodingEditor` returns to the native editor, the guard
loses its Monaco rows, `package.json` drops `monaco-editor`. No data, schema, API or storage changed.

---

## 15. Independent Review Fix 1 — engine-creation fallback and browser-level anti-assist hardening

**RF1 — `engine.create` failure falls back to the native editor.** Before the fix, a loader rejection kept the native editor,
but an exception thrown by `engine.create()` inside `RichCodingEditor`'s layout effect escaped into React. Now:

- `CodingEditor` holds one explicit engine state per mount: `native` → `rich` → or **`failed`** (`{ status: "failed", restore }`),
  which is permanent for that mount — a failing engine is never retried on later renders, prop changes or a late loader (the
  loader's resolve keeps a `failed` state as is).
- `RichCodingEditor` wraps `engine.create()` in a local try / catch (no global error swallow). On failure it calls
  `onCreateFailure(error, handover)`: the failure is reported once (`console.error`) and the native editor is restored **before
  the frame paints** (the state update happens in the layout effect) with the same canonical source, no `onChange`, the root
  marked `data-engine-fallback="create-failed"`, and — if the user was typing in the native editor when the hand-over happened —
  focus and caret restored to the native textarea (`restore`).
- `createMonacoEngine().create()` tracks every allocation after `createModel()` (editor, listeners, `MutationObserver`); a
  failure anywhere before the handle is returned runs `release()` — listeners, observer, editor (if created), the model, the
  host's children — and **rethrows**. Nothing is hidden, nothing leaks; `dispose()` reuses the same `release()`.

**RF2 — browser-level anti-assist attributes.** The exam-integrity contract no longer depends on Monaco's own input defaults:
`INPUT_ANTI_ASSIST_ATTRIBUTES` (`aria-autocomplete="none"`, `autocomplete="off"`, `autocorrect="off"`, `autocapitalize="off"`,
`spellcheck="false"`) are set on Monaco's real input at creation, re-applied after every option update (`setReadOnly`,
`setLabel`, `setInvalid`, tab-focus toggling) and restored by the `MutationObserver` whenever Monaco rewrites or removes one.
IME / composition, keyboard entry, copy and paste are untouched. The native textarea keeps its existing attributes.

**Tests (fail-first: 9 failed on the reviewed head `6496f77`, then green).** Component: RF1-A loader reject → native;
RF1-B/C/D create throws → native restored, usable, no `onChange`, source byte-identical (Arabic + emoji); RF1-E a first-call-only
failing engine gets exactly one create attempt across value / language / readOnly re-renders; RF1-F focus + caret back on the
native textarea, and unmount after failure has nothing to dispose and raises nothing; RF2-D native attributes. Adapter: RF1-G
`editor.create` throws → model disposed, host emptied, rethrown; RF1-H a later setup step throws → editor and model disposed,
listeners released, rethrown; RF2-A/B/C attributes present, restored after a runtime rewrite / removal, kept across option
updates. Real browser: C6 (attributes on the real Monaco textarea) and C7 (restored after a runtime rewrite).

**Mutations** RM1 (fallback removed) · RM2 / RM2b (failed engine retried) · RM3 (model leaked on `editor.create` throw) · RM4
(`autocomplete=off` removed) · RM5 (`spellcheck=false` removed) · RM6 (no observer: rewrites not restored) — each killed; see
the PR for the run.

---

## 16. Independent Review Fix 2 — subscription tracking order and best-effort release

**Defect.** `create()` registered its three Monaco listeners through ONE multi-argument `subscriptions.push(a(), b(), c())`.
JavaScript evaluates every argument before `push` runs, so if the second registration threw, the first listener was alive
but never stored, and `release()` could not dispose it. `release()` could also stop early if one cleanup step itself threw.

**Fix.**
- Each registration is tracked **immediately** after it succeeds — three separate `subscriptions.push(...)` calls — so a
  failure in the N-th registration leaves exactly the N−1 previous listeners tracked and disposable.
- `release()` is **best-effort and complete**: every step (each listener's `dispose()`, `observer.disconnect()`,
  `editor.dispose()`, `model.dispose()`, `host.replaceChildren()`) runs inside its own `attempt()`; a throwing step is recorded
  and the remaining steps still run; the collected cleanup errors are reported once with `console.error`, locally to the
  editor. During a `create()` failure the **original setup error** is the one rethrown (a cleanup error never masks it); on
  React unmount a misbehaving Monaco `dispose()` can no longer throw into the exam page. `release()` is idempotent
  (`released` flag; `dispose()` keeps its own `disposed` flag).

**Tests (fail-first: 6 failed on head `9f137ee`, then green).** Adapter suite with extended fault injection
(`failSubscription`, `listenerDisposeThrows`, `editorDisposeThrows`): Fix2 RF2-A second registration throws → first listener,
editor and model disposed, host empty, original error rethrown; RF2-B third registration throws → both prior listeners,
editor and model disposed; RF2-C one listener's `dispose()` throws → remaining listeners disposed, observer disconnected,
editor and model disposed, host emptied, `dispose()` does not throw, reported once; RF2-D `editor.dispose()` throws → model
disposal and host cleanup still occur; RF2-D′ a cleanup error during a create failure never masks the original error; RF2-E
idempotent with and without faults; RF2-F the normal lifecycle is unchanged (three listeners registered immediately, all
released once, nothing reported).

**Mutations** RM7 (first listener tracked only after the others register — the batched evaluation order) · RM8 (a throwing
listener `dispose()` stops cleanup) · RM9 (a throwing `editor.dispose()` skips model cleanup) — each killed.
