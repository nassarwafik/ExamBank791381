# Phase 18B — Enterprise Coding Workspace UX

Window 2 of three parallel windows. Frontend coding-UX phase on top of the 17F coding stack. Baseline
`86f334b8d72b9896de9a30c0d9b505021e5343c1` (`origin/main`, PRs #249 / #250 / #251 contained). Branch
`feature/18b-enterprise-coding-workspace`.

Not a grading-model redesign, not a third-party IDE, no Runner change. Everything in this phase is presentation around the
existing `CodingEditor` / `CodingResponse` / `CodingQuestionEditor`; the canonical Answer `{kind:"code", language,
languageVersion, source}`, the student projection, the hidden-test contract, coding@1 / coding@2, `compileErrorPolicy`,
`reviewRequired`, fingerprints, grading keys, target revisions, the callback / Runner protocols and HMAC are untouched
(`runner/**` and `api/src/**` have no diff).

---

## 1. Architecture audit (baseline, before coding)

| Seam | Where | Finding |
|---|---|---|
| Monaco lazy boundary | `src/coding/editor/editorEngine.ts` → `import("./monacoEngine")` | The only dynamic edge to the engine; `monacoEngine.ts` is the only `monaco-editor` importer. Proven by `codingEditor.17f-c1.test.tsx` (source) and `scripts/check-bundle-budget.mjs` (dist). |
| Editor engine contract | `editorEngine.ts` (`EditorEngineHandle`), `monacoAdapter.ts`, `editorOptions.ts` | Small handle (value / language / readOnly / label / invalid / focus / layout / dispose). Options are pure data; every assistance surface is off. |
| Code editor | `src/coding/CodingEditor.tsx` | Native `<textarea>` first paint → rich engine takes the same source over; create-failure fallback (RF1). **No guard for a failure after creation** (see D2). Escape arms "Esc then Tab" and **bubbles to the document** (see D1). |
| Student renderer | `src/questionTypes/student/CodingResponse.tsx` (lazy, coding@1 and coding@2) | Language `<select>`, starter code, per-language in-memory drafts (`codingDrafts.ts`), **reset-to-starter already exists** behind the shared `ConfirmDialog`, practice run panels, public samples. Emits the canonical Answer only. |
| Authoring editor | `src/questionTypes/editors/CodingQuestionEditor.tsx` (lazy) | Uses `CodingEditor` for starter code and reference solutions (`minRows={4}`). |
| Answer model | `src/codingQuestion.ts` (`CodeAnswer`, `normalizeCodeAnswer`, `bindCodeAnswerToQuestion`, `projectCodingConfigForStudent`) | Pure, shared with the server build. `starterCode` **is part of the canonical public config** (`coding.starterCode[lang]`, validated by `validateCodingQuestion`). |
| Language / version | `CODING_LANGUAGES` (key, contract `version`, label, `editorLanguage`, indent unit) | The runtime (toolchain) version is **not** in any client contract (`CodingCapabilities` = `{available, languages:[{key, languageVersion}]}`); only the language contract version exists on the client. |
| Toolbar / state flow | `CodingResponse` toolbar div; answer state is the exam page's (`onAnswer` seam → autosave / submit) | No coding-local persistence. |
| Read-only / review | `disabled` → `readOnly` on the editor; teacher review uses `CodeSourceView` (plain text) | Unchanged. |
| Mobile | `NATIVE_FALLBACK_MEDIA` (≤ 600 px or coarse pointer → native editor); CSS breakpoints 600 / 640 px | Unchanged choice. |
| Bundle guard | `scripts/check-bundle-budget.mjs` (initial-graph gzip budget 125 KB, Monaco rows, coding signatures) | Extended with one workspace signature (§8). |
| Dialog / focus infrastructure | `src/ui/Dialog.tsx` (stack, `inert` for covered layers, z-index `--eb-z-modal`), `useFocusTrap`, `useBodyScrollLock`, `useConfirm` | Reused: `useBodyScrollLock` and `useConfirm`. `useFocusTrap` is **not** reused (document-level Escape handling conflicts with the editor; it is what closes the preview in D1). |
| Fullscreen / focus mode / editor preferences | — | **None existed.** The only device-level preference store is the Phase 12A motion override (`src/ui/motionPreference.ts`): fixed key, literal value, try/catch, memory fallback — its discipline is copied. |
| Appearance | single light theme (`design-tokens.css`); 17F-C1 doc §13: "Dark mode: none" | No theme switch exists to align with. |

### Defects found (both pinned fail-first, both failing on the untouched baseline)

- **D1 — Escape in the editor closed the teacher preview.** `ExamPreview` keeps a document-level `useFocusTrap` whose Escape
  closes the overlay. The editor's own escape hatch ("Esc then Tab"; Monaco's Escape / find-widget close) therefore closed the
  whole preview mid-typing. Evidence: `coding.18b.test.tsx › D1` — `onClose` called once on the baseline; `codingEditor.18b.test.tsx
  › D1` — `["Escape","a"]` reached `document` instead of `["a"]`.
- **D2 — an engine failure after creation lost the editor subtree.** A rich-engine method throwing during a controlled update
  (model disposed, option update failure) propagated into React's commit; with the app-level ErrorBoundary that unmounts the exam
  page UI. Evidence: `codingEditor.18b.test.tsx › D2` — `rerender` threw `fault: model disposed` on the baseline.

### Pre-existing, out of scope (documented, not fixed — shared files)

- In the **builder preview** the shared `Dialog` root (`--eb-z-modal: 70`) sits below `.sb-preview-overlay` (`z-index: 1000`),
  so any ConfirmDialog opened from inside the preview — including the reset-to-starter confirmation — renders underneath the
  overlay. The confirmation still owns focus and Escape cancels it. Fix belongs to `structured-builder.css` / `ui.css` (Window 1
  / shared), not to coding CSS.

---

## 2. Design

### 2.1 Workspace (`src/coding/workspace/CodingWorkspace.tsx`)

One frame around the one `CodingEditor`, used by the student renderer (exam + teacher preview) and by the authoring editor
(starter code, reference solutions). It forwards `value` / `onChange` untouched and renders:

```
[toolbarStart: language <select>] [Python · v1] [إعدادات المحرر ▾] [وضع التركيز] [toolbarEnd: استعادة الكود الابتدائي]
[CodingEditor (preferences, layout auto|fill)] [editorFooter: limits]
[children: drafts note, stdin, run controls, output, samples, confirm dialog]
[sr-only role=status announcement]
```

`role="group"` named «مساحة العمل البرمجية — السؤال N». The badge is the registry label plus the **language contract version**
(`languageVersion`, the value stored in the Answer). A runtime/toolchain version is not shown because no client contract carries
one (adding it is an API/Runner capability change — reported in §10, not done).

### 2.2 Focus mode

Application-level, **not** the browser Fullscreen API. `is-focus` is a CSS class on the **same** root element
(`workspace.css`): `position: fixed; inset: 0; z-index: var(--eb-z-drawer, 40)` (above the sticky exam bars and the mobile
nav, below toasts and the modal dialog stack), `100dvh` with `100vh` fallback, safe-area padding, internal scrolling, sticky
toolbar. Nothing remounts: the textarea element identity and the Monaco handle are the same before, during and after
(`codingWorkspace.18b.test.tsx`), so the Answer cannot change by entering or leaving (`coding.18b.test.tsx` compares the
serialized Answer before/after). The editor switches to `layout="fill"` (no inline row height; CSS owns the size; Monaco
follows through `automaticLayout`).

Keyboard contract while expanded:

- **Escape** exits only when pressed **outside the editor surface** (toolbar, panels). Inside the editor, Escape keeps its
  editor meaning (Esc-then-Tab, find-widget close) and is consumed at the editor boundary (D1 fix) — so a keyboard user leaves
  the editor with Esc-then-Tab and then presses Escape or activates the exit button. Escape handled by the workspace never
  bubbles to the document (a surrounding overlay cannot close by accident). Events whose DOM target is outside the root (a
  portaled ConfirmDialog bubbles through the React tree) are ignored.
- **Tab / Shift+Tab** cycle inside the workspace (first ↔ last). Mid-list Tab is left to the browser / editor.
- The rest of the page is **`inert`** (siblings of every ancestor up to `<body>`, restored exactly on exit; elements already
  inert stay inert; elements added later, e.g. the confirmation dialog portal, are untouched) — the same mechanism the shared
  `Dialog` uses for covered layers. Hidden page controls (submit, navigation) cannot be reached or activated.
- The exit button is always in the tab order and is the same element as the enter button (`aria-pressed`), so focus does not
  move on toggle. A polite status line announces entering / leaving.
- The expanded state **ends by itself when the workspace becomes read-only** (attempt submitted / expired / paused) so nothing
  the exam page needs to show is covered. Entering is never automatic. Read-only review may still expand (to read).
- No `<form>` interaction: every control is `type="button"` or a native input; Enter in the editor never submits
  (`codingWorkspace.18b.test.tsx › inside a <form>`).

### 2.3 Editor preferences (`src/coding/workspace/editorPreferences.ts`)

`{ fontSize ∈ {12,13,14,15,16,18,20}, wordWrap, minimap, lineNumbers }`, defaults = the 17F-C1 editor
(`14 / off / off / on`). One fixed localStorage key `smartassessCodeEditorPreferences`, literal JSON, re-validated field by
field on read (fail closed), memory fallback when storage throws, cross-tab `storage` event, `useSyncExternalStore` hook with a
stable snapshot. They reach the rich engine through a new optional `EditorEngineHandle.setPreferences()` → Monaco
`updateOptions({fontSize, lineHeight, wordWrap, minimap, lineNumbers})` (pure mapping `editorPreferenceOptions` in
`editorOptions.ts`; the defaults reproduce `EDITOR_BASE_OPTIONS` exactly) and the native editor through a CSS variable on the
frame, the textarea `wrap` attribute and the gutter (hidden with wrap on, where numbers could not be true). They are never
part of the Answer, never sent, never hashed, never alter the text: `coding.18b.test.tsx` pins the serialized Answer across every
preference change and that the stored JSON contains no answer-like field; `normalizeCodeAnswer` / `bindCodeAnswerToQuestion`
drop any such field on ingest (pinned).

**Theme:** the application has one light appearance and the editor ships the matching SmartAssess theme; no theme toggle was
added (an off-brand dark editor inside a light exam page is not "aligned with the application appearance"). A future
application-wide appearance switch adds a field to this store.

### 2.4 Starter code / reset

`coding.starterCode[lang]` is canonical (audit). The existing reset (`CodingResponse.reset`) is kept byte-for-byte — same label,
same `ConfirmDialog` text, same gating (`source !== starter && source.trim() !== ""`) — and moved into the workspace toolbar
end slot. New pins: cancel changes nothing (Answer, editor text, focus state); confirm restores exactly the configured starter
including the trailing newline; the dialog is a named modal with initial focus on «إلغاء»; no control when there is no
starter for the language. No new model field.

### 2.5 Monaco lifecycle (`CodingEditor.tsx`)

| State | Behaviour |
|---|---|
| Environment without the rich engine (phone, coarse pointer, no layout engine) | native editor, `data-engine-fallback="environment"`, no status noise |
| Chunk loading (slow network) | native editor usable at once; after 250 ms a polite `role="status"` row «جارٍ تحميل المحرر المتقدم… لن يضيع شيء» |
| Chunk fails to load | native stays, status «تعذّر تحميل المحرر المتقدم؛ المحرر الأساسي يعمل…», `load-failed` |
| `engine.create` throws (17F-C1 RF1) | native restored with focus/caret, `create-failed` |
| **Engine method throws after creation (new, D2)** | every post-creation call goes through a guard: the handle is released best-effort (every cleanup error collected), the caret is captured if the user was typing, one `console.error`, state → `runtime-failed`, the native editor renders the **canonical value** with focus/caret back. Nothing is re-emitted; no retry in this mount. |
| Read-only | `readOnly` + `domReadOnly` on Monaco, `readOnly` on the textarea; **defence in depth added**: a read-only editor never emits even if a change event reaches it |

### 2.6 Mobile / tablet

Phones / touch-primary keep the native editor (17F-C1 decision). Focus mode on small screens: toolbar sticky at the top
(never under browser chrome), editor ≥ 40 dvh, panels scroll inside the panel, safe-area padding, horizontal scrolling inside
the editor unless wrap is chosen, preferences panel becomes static (no off-screen popover). Orientation / resize changes are
plain re-renders of the same tree (pinned with `resize` / `orientationchange` events + rerender).

### 2.7 RTL

The workspace chrome inherits the page direction (RTL); the editor root, frame and input are `dir="ltr"` / left-aligned, in
both layouts (pinned at editor and workspace level).

---

## 3. Files changed

| File | Change |
|---|---|
| `src/coding/workspace/CodingWorkspace.tsx` **(new)** | the workspace frame, focus mode, keyboard contract, preferences UI |
| `src/coding/workspace/editorPreferences.ts` **(new)** | preference model + storage + hook |
| `src/coding/workspace/workspace.css` **(new)** | toolbar, preferences popover, focus-mode layout |
| `src/coding/CodingEditor.tsx` | `preferences` / `layout` props, lifecycle status row, D1 Escape boundary, D2 runtime degrade path, read-only guard |
| `src/coding/editor/editorEngine.ts` | optional `setPreferences` on the handle |
| `src/coding/editor/editorOptions.ts` | `editorPreferenceOptions()` pure mapping |
| `src/coding/editor/monacoAdapter.ts` | `setPreferences` → `updateOptions` + re-harden |
| `src/coding/coding.css` | native font-size variable, soft-wrap rule, status row, fill layout hook |
| `src/questionTypes/student/CodingResponse.tsx` | renders through `CodingWorkspace` (same test ids, same Answer emission, same reset) |
| `src/questionTypes/editors/CodingQuestionEditor.tsx` | starter / reference editors render through `CodingWorkspace` |
| `scripts/check-bundle-budget.mjs` | one added coding signature (`cx-ws-toolbar`) — the bundle guard the task names; no budget change |
| tests (new) | `src/coding/codingEditor.18b.test.tsx`, `src/coding/workspace/codingWorkspace.18b.test.tsx`, `src/coding/workspace/editorPreferences.18b.test.ts`, `src/coding/editor/monacoEngine.18b.test.ts`, `src/coding/monacoLazy.18b.test.ts`, `src/questionTypes/coding.18b.test.tsx` |
| `docs/enterprise-coding-workspace-18b.md` **(new)** | this document |

No file under `runner/`, `api/`, `src/governance/`, `src/smartsim/` or any network-simulator path is touched. No shared UI
primitive is modified.

---

## 4. Security / privacy review

- The student payload is still the allow-listed projection; `coding.18b.test.tsx` renders a **teacher-side** question directly
  into the renderer and asserts no `hiddenTests` / `expectedOutput` / `referenceSolutions` / `compileErrorPolicy` / `gradingMode`
  string in the DOM in normal and focus mode, with the preferences panel open.
- No source logging: the only new `console.error` calls carry the engine error object and the cleanup errors, never the text.
- No telemetry, no network: the workspace imports React, the coding modules, `useBodyScrollLock` and `codingLanguage` only
  (`monacoLazy.18b.test.ts` pins the static closure).
- No HTML rendering of source anywhere (unchanged `<textarea>` / Monaco model / `<pre>` text children).
- No CDN / external compiler / remote IDE; the bundle guard's CDN and completion-signature rows still apply to every chunk.
- Preferences store four UI values under one key; nothing identifies a student, an exam or an answer.

---

## 5. Lazy-loading proof

Source level (`monacoLazy.18b.test.ts`): a static import walker from `src/main.tsx` reaches no coding UI module and no
`monaco-editor`; from the coding chunks (`CodingResponse`, `CodingQuestionEditor`, `CodingWorkspace`) it never reaches
`monacoEngine.ts`; the loader's edge is `import("./monacoEngine")`; no workspace / editor module mentions Monaco in code.
Dist level: `npm run check:bundle` (§8) — the initial graph carries no coding signature, the Monaco chunk is behind the coding
editor's dynamic edge, the worker is separate.

---

## 6. Compatibility pins (already green on the baseline)

- coding@1 and coding@2 render through the same renderer and emit the same Answer (`coding.18b.test.tsx`).
- `codingCompileErrorPolicy`: coding@1 absent / "zero" ⇒ zero, "manualReview" ⇒ undefined; coding@2 explicit only; the student
  projection's keys are exactly the eight public keys.
- `reviewRequired`: not open, not polled, score withheld with the teacher-review label.
- `normalizeCodeAnswer` / `bindCodeAnswerToQuestion` drop UI fields and never alter the source.
- Every 17A–17F suite under `src/coding` and `src/questionTypes` runs unchanged (27 files, 459 tests green with the change).

---

## 7. Tests

| Suite | Tests | Fail-first on baseline |
|---|---|---|
| `src/coding/codingEditor.18b.test.tsx` | 15 | D1 ×2, D2 ×3 fail for the defect; the rest fail for the missing contract (`preferences`, `layout`, status row) |
| `src/questionTypes/coding.18b.test.tsx` | 15 | D1-preview fails for the defect (`onClose` called); focus / preference / badge / mobile assertions fail (no workspace); 6 pins green |
| `src/coding/workspace/codingWorkspace.18b.test.tsx` | 16 | import failure (module absent) |
| `src/coding/workspace/editorPreferences.18b.test.ts` | 7 | import failure (module absent) |
| `src/coding/editor/monacoEngine.18b.test.ts` | 3 | import failure (mapping absent) |
| `src/coding/monacoLazy.18b.test.ts` | 5 | 4 fail (workspace absent / guard signature absent); the entry-graph pin is green on the baseline |

Total new: 61 tests, 6 files. Required coverage mapping: Monaco lazy (lazy suite + guard) · source survives focus entry / exit
(workspace + integration) · survives resize / orientation (both) · preferences never alter the Answer (integration, adapter,
preferences) · language / version unchanged by focus / preferences (integration badge test) · reset confirmation / cancel /
exact restore (integration) · Monaco load failure preserves source (editor: load-failed, runtime-failed, create-failed) ·
read-only cannot edit (integration + workspace) · keyboard accessibility (workspace: names, Tab cycle, Escape, inert, status)
· LTR in RTL (editor + workspace) · no grading secrets (integration) · coding@1 / coding@2 / compileErrorPolicy /
reviewRequired (integration pins).

---

## 8. Validation (head `b4ede01`, `origin/main` = baseline, no reconciliation needed)

| Check | Result |
|---|---|
| `npm test` (root, API deps installed) | 626 files, 7773 tests, 0 failed, 0 skipped (baseline 620 / 7712 / 0) |
| coding-focused (`src/coding` + `src/questionTypes`) | 27 files, 459 tests green (all 17A–17F suites unchanged) |
| `npm run lint` (oxlint) | 99 warnings / 0 errors — identical to the baseline, none in the changed files |
| `npx tsc -b` | clean |
| `npm run build` + `check:bundle` | passed |
| `git diff --check` | clean |
| real browser (`scripts/check-code-editor-browser.mjs`, Chromium, production harness build) | 29 / 29 (regression only; the workspace UI is covered by the unit suites) |

Bundle (gzip, level 9; baseline → head):

| Item | Baseline | Head |
|---|---|---|
| initial JS graph | 16 files, 124.6 KB (budget 125) | 16 files, 124.6 KB |
| Monaco engine chunk | 742.6 KB, lazy | 742.6 KB, lazy behind the coding editor's dynamic edge |
| editor worker / grammars | 90.4 KB / 1.3–1.6 KB each | unchanged |
| `CodingResponse-*.js` | 5.39 KB | 5.39 KB |
| `CodingQuestionEditor-*.js` | 5.79 KB | 5.84 KB |
| shared coding chunk (`codingContract-*.js`, now carrying the workspace) | 5.55 KB | 8.39 KB |
| coding question chunks static closure beyond the initial graph | 5 files, 20.7 KB — no Monaco, no worker | 5 files, 23.5 KB — no Monaco, no worker |

The whole workspace UI (component + preferences + CSS) costs ≈ 2.8 KB gzip in the lazy coding chunks and nothing in the
initial graph.

---

## 9. Rollback

Revert the PR commits: the renderers go back to rendering `CodingEditor` directly, the handle loses an optional method, the guard
loses one signature. No data, schema, API, Runner or storage change; the preference key is simply ignored if left behind.

---

## 10. Known limitations / deferred

- **Runtime (toolchain) version** is not displayed: no client contract carries it (`CodingCapabilities` reports key + contract
  version only). Showing e.g. "Python 3.12" needs a capability-response field (API/Runner change) — out of this phase.
- **Builder preview + ConfirmDialog layering** (pre-existing, §1): the confirmation opened from inside the preview renders under
  the preview overlay. Shared CSS fix, not done here.
- **Escape inside the editor never closes a surrounding overlay** (by design after D1): leave the editor first (Esc then Tab)
  or use the overlay's own close control.
- **Inert page during focus mode** hides the exam page's live regions (timer announcements) from assistive technology while
  expanded — the same trade-off the shared modal Dialog makes; mitigated by the automatic exit when the attempt stops being
  writable.
- **Native editor + word wrap** hides the line-number gutter (numbers would be wrong across wrapped rows); the rich engine
  numbers wrapped lines itself.
- **Phones keep the native editor** (17F-C1); the minimap preference has no native equivalent (stored, applied when the rich
  engine is available).
- **No theme preference** (single application appearance, §2.3).
- The 17F-C1 real-browser harness is optional tooling (needs `playwright-core`); it was run locally for regression only and
  does not cover the workspace UI itself.
