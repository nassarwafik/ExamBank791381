# Phase 21F — Exam Studio: engineering plan for the structured exam builder

**Status:** implemented — phases 21F.0–21F.9 on branch `claude/nifty-clarke-k0wlid`; see §9 for the implementation record and the
evidence. Awaiting exact-head CI, independent review and the owner's manual merge (`AGENTS.md` §3, §13). The plan below is unchanged;
§9 records where the implementation follows or deviates from it.

**Baseline:** `origin/main` `613bda55` (merge of PR #323).

**Owner direction:** make the exam builder enterprise-grade. It should be easier to use and visibly more polished and attractive.

**Visual companion:** an interactive mockup of the target design, the before / after comparison and this roadmap in Arabic were
shared with the owner as a private page. This document is the canonical record for the agents that implement the phases.

---

## 1. Why: measured baseline

Measured in real Chromium against a production build of `613bda55`, with the same local API mock as
`scripts/capture-visual-gate-21e2p2.mjs`.

**Fixture:** a saved structured exam with 3 sections and 9 questions (4 multiple choice, 3 true / false, 2 short answer, one
of them with an empty prompt).

| Measure | Desktop 1440×900 | Phone 390×844 |
|---|---|---|
| Scroll height of `.structured-builder-overlay` | **11,756 px** (≈ 13 screens) | **17,671 px** |
| Height of one 4-option multiple-choice card (`#sb-q-q1`) | **1,139 px** | **1,813 px** |
| Top of the first question card | 990 px (below the fold) | 1,401 px |
| Focusable controls in that one card | **44** | 44 |
| Focusable controls in the whole builder | 357 | 357 |

### Findings from the code review (owner report, 2026-10-15)

**R1 — silent overwrite on save.**
- `api/src/functions/save-exam-artifact.js:230` writes `exams/<examId>.json` through `uploadJson`, which uploads with
  `overwrite:true` (`api/src/lib/platform-storage.js:10`).
- Two tabs or two teachers saving the same exam: the last write wins and the other edits are lost without notice.
- `uploadJsonConditional` (If-Match / If-None-Match) already exists in the same library and is used by `manage-students.js`.

**R2 — no ownership on saved exams.** In multi-user mode (`BUILDER_USERS`), `save-exam-artifact.js` and
`manage-saved-exams.js` never compare the caller with an owner. Any teacher can list, open and overwrite any exam.

**R3 — time-based exam ids.**
- `examId: "EXAM-" + Date.now()` (`src/App.tsx:357`, `:3982`).
- Two teachers creating an exam in the same millisecond get the same id. Combined with R1, one exam overwrites the other.

**R4 — local-only autosave.** `src/examAutosave.ts` keeps a `localStorage` backup on the same browser only.

**UX — one long page, everything expanded.**
- Every question card opens by default (`src/StructuredQuestionEditor.tsx:70`).
- A card shows, all at once:
  - metadata;
  - type metadata;
  - the composer;
  - attached code;
  - media;
  - classification;
  - the activity descriptor.
- The section header always shows:
  - presets;
  - instruction templates;
  - plain instructions;
  - rich instructions;
  - the grading policy;
  - shared stimuli.

**UX — tool overload.**
- The «المزيد» menu holds up to 9 tools.
- One of them is the experimental «مختبر الدوال 3D (تجريبي)» (`src/StructuredExamBuilder.tsx:1119`).

**UX — no clear workflow.** Nothing shows the teacher a setup → content → review → publish progression. Readiness, coverage and
governance sit behind the menu.

**UX — reordering.** Questions move only with ↑ / ↓ buttons, so moving question 30 to position 2 takes 28 clicks. There is no
drag and drop.

**Undo granularity.**
- `updateExamHistory` (`src/examHistory.ts:73`) pushes one snapshot per keystroke and keeps at most 100.
- So «تراجع» after typing a sentence removes one character, and real history is lost quickly.

**Performance.**
- There is no `React.memo` in `StructuredExamBuilder`, `ExamSectionEditor`, `StructuredQuestionEditor` or `QuestionComposer`.
- Each keystroke re-renders every section and every card, deep-compares the exam and stores a snapshot.

**Maintainability.**
- `src/App.tsx` is 7,930 lines and owns the builder state and save.
- `src/StructuredExamBuilder.tsx` is 1,322 lines with 27 `useState`, most of them dialog flags.
- `structured-builder.css` carries 249 literal colours that the premium sheets override.
- The builder mixes SVG icons (toolbar) with emoji and text glyphs (👁 ⧉ × ▾ ▸, and 🧱 📥 📚 🗂 in the access bar).

**Two editors.** The legacy flat editor (in `App.tsx`) and the structured builder coexist, with emoji entry buttons.

---

## 2. Target: the Exam Studio

One full-screen work surface with a top bar and three regions:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Top bar (Tadris navy): back · title · status │ Setup › Content › Review › Publish │ save state · undo/redo · preview · next │
├──────────────┬──────────────────────────────────────────┬─────────────────────┤
│ Outline      │ Canvas (exam "sheet")                    │ Inspector           │
│ sections,    │ section cards; question cards COLLAPSED  │ tabs for the active │
│ questions,   │ to a student-faithful summary; ONE       │ question: Question ·│
│ marks, state │ active card in edit mode; "+" insert bar │ Classification ·    │
│ (ok/warn/err)│ between cards                            │ Media · Advanced    │
│ drag handles │                                          │ or section settings │
└──────────────┴──────────────────────────────────────────┴─────────────────────┘
```

### Principles

1. **Overview first.** The outline shows every section and question with marks and state; no scrolling to find anything.
2. **One active card.**
   - Only the active card shows editing controls.
   - The other cards render as the student sees them, plus the correct answer.
3. **Progressive disclosure.**
   - Classification, media, attached code, activity and rich content move to the inspector.
   - Section settings move to a drawer.
4. **Never lose work.**
   - A conditional save refuses to overwrite a newer version.
   - Undo works by sentence or field, not by character.
   - The save state is always visible.
5. **Same engines.** These stay unchanged; the Studio is a new presentation over them:
   - the type editors;
   - `examQuality`;
   - `examFinalization`;
   - governance;
   - grading.
6. **Accessible by default.**
   - WCAG 2.2 AA.
   - Touch targets of 44 px or more under `pointer: coarse`.
   - Full keyboard operation, including keyboard drag and drop with live announcements.
   - RTL first; code remains an LTR island.

### Visual language

The Studio extends the existing `--eb-*` tokens (`src/design-tokens.css`). It does not introduce a second palette.

| Token (proposed, `src/studio/studio-tokens.css`) | Value | Use |
|---|---|---|
| `--st-top` | `#031c40` (Tadris navy, the PWA `theme-color`) | top bar |
| `--st-teal` | `#14b8a6` (the brand's turquoise plus) | completed steps, readiness, brand accents only |
| `--st-canvas` | `#eef2f8` with an 18 px dot grid | work area behind the sheet |
| `--st-sheet` | `var(--eb-surface)` | section and question cards |
| interactive | `var(--eb-primary)` | selection, primary actions, focus |
| state | `var(--eb-success / --eb-warn / --eb-danger)` | always paired with text or an icon, never colour alone |

- **Font:** IBM Plex Sans Arabic (unchanged). Tabular numerals for marks and counts.
- **Icons:** one SVG set (`src/icons.tsx` style). No emoji in the builder.
- **Card states:**
  - collapsed;
  - active (primary ring + elevated);
  - selected (bulk);
  - error (danger border + «يمنع الاعتماد» chip);
  - dragging.

---

## 3. Architecture

The new module `src/studio/` is lazy. It sits behind a teacher-level option until it reaches parity.

| Layer | New / changed | Unchanged (reused as is) |
|---|---|---|
| State and save | `useExamStudioController` (extracted from `App.tsx`); history coalescing in `examHistory`; `saveConflict` handling | `structuredSavePolicy`, `examAutosave`, the 13A saved-checkpoint semantics |
| Shell | `StudioShell`, `StudioTopBar`, `Stepper`, `SaveStatus`, `OutlineTree`, `InsertBar`, `InspectorPanel`, `SectionDrawer`, `CommandPalette` | `ui/Dialog`, `ui/useConfirm`, `ui/Toast`, `useModalSurface` |
| Cards and steps | `QuestionCard`, `QuestionSummary`, `ReviewStep`, `PublishStep`, `SetupStep`, `ExamsHome` | `ExamPreview`, `StudentQuestionCard` renderers used by the summary |
| Editors | — | `QuestionComposer`, `questionTypes/editors/*`, `CompoundQuestionEditor`, `QuestionMediaEditor`, `CodeStimulusEditor`, `QuestionClassificationEditor`, `ActivityDescriptorEditor`, `StimulusEditor`, `BlueprintPanel`, `BlueprintCoveragePanel`, `QualityPolicyPanel`, `GovernancePanel`, `PresetLibraryPanel`, AI dialogs, `BankQuestionPicker` |
| Engines | one new pure op `insertQuestionAt` | `examBuilderState`, `examQuality`, `examFinalization`, `questionTypeCatalog`, `structuredDeletionUndo`, `structuredExamProductivity`, API grading |

### DOM contract kept by the Studio

Tests and the issue-focus logic in `StructuredExamBuilder.tsx` rely on these hooks. The active card keeps them:
- `#sb-q-<examQuestionId>`, `.sb-question`, `data-question-id`, `data-section-id`;
- `.sb-compound-editor > .sb-part` (compound@1 is frozen);
- `.sb-part[data-part-id]`, `.sb-field-row`, `.rc-host`;
- `[aria-invalid="true"]` field frames, `data-issue-focus`, `data-issue-live`.

A collapsed card exposes `data-question-id` and opens to the full contract before the focus logic runs. This is the same pattern
as the existing `openRequest` / `revealIssues` signals.

---

## 4. Roadmap

Sizes:
- **S:** 1–2 days.
- **M:** 3–5 days.
- **L:** 1–2 weeks (may split into 2–3 PRs).

Branch names follow `feature/phase-21f<n>-<topic>`.

### 21F.0 — Save safety and ownership (P0, M)

**Scope:**
- **Conditional save.** `save-exam-artifact.js` writes through `uploadJsonConditional`:
  - the client sends `baseEtag` from its last load or save;
  - a mismatch returns `409 { ok:false, code:"EXAM_CONFLICT", savedAt }`;
  - a first save uses `ifNoneMatch:"*"`, so an id collision is a 409 instead of an overwrite.
- **ETag on load.** The `saved-exams` `load` action returns the blob ETag. The history keeps `serverEtag` beside
  `savedCheckpoint`.
- **Conflict dialog.** Three choices, each confirmed, never silent:
  - «فتح النسخة الأحدث» (open the newer version);
  - «حفظ نسختي كامتحان جديد» (save mine as a new exam with a fresh id);
  - «إلغاء» (cancel).
- **Ownership.** In multi-user mode the owner `userCode` is stamped on the saved document envelope (never inside `exam`).
  `list`, `load` and `save` enforce it. Legacy single-password mode is unchanged. Unowned existing exams follow decision D2.
- **Exam ids.** New ids are `"EXAM-" + crypto.randomUUID()`.

**Acceptance and evidence:**
- **Fail-first.** An API test on a detached worktree of `613bda55`: two saves from the same base, where the second silently
  replaces the first. On the head the second gets 409.
- **Fail-first.** A cross-owner `load` / `save` succeeds on the baseline and is refused on the head.
- **Mutation, each KILLED:**
  - drop the If-Match condition;
  - drop the owner comparison;
  - accept a missing `baseEtag` as unconditional.
- The route authorization inventory (C13) stays green. The exam JSON schema and grading are unchanged.

### 21F.1 — Editing engine: performance and undo (P1, M)

**Scope:**
- **History coalescing.**
  - `update(updater, { coalesceKey })`: consecutive edits with the same key within 1.5 s replace the top snapshot instead of
    pushing a new one.
  - A structural operation, a key change, blur or an explicit save closes the group.
  - `HISTORY_LIMIT` is unchanged.
- **Render isolation.**
  - `React.memo` on `ExamSectionEditor`, `StructuredQuestionEditor` and the Studio cards.
  - Stable id-keyed callbacks (one dispatcher by `examQuestionId` instead of inline closures), so typing re-renders only the
    edited card.
- **Extraction.** Builder state, save, recovery and service wiring move from `App.tsx` into
  `src/studio/useExamStudioController.ts`. `App.tsx` only passes services.

**Acceptance and evidence:**
- Typing a sentence and pressing undo restores the whole sentence (new test).
- The 13A history tests pass with unchanged expectations.
- `scripts/measure-builder-input-21f.mjs` measures, before and after, the React commit time of one keystroke on a 30-question and
  a 100-question exam. The target is p95 under 16 ms at 100 questions.
- **Mutation:** coalescing across a structural op is KILLED by the history tests.

### 21F.2 — Studio design system (P1, M)

**Scope:**
- `src/studio/studio-tokens.css`, which extends `--eb-*`.
- An SVG icon set for every builder glyph (replacing 👁 ⧉ × ▾ ▸ and the emoji entry buttons).
- Presentational, tested components:
  - `StudioTopBar`, `Stepper`, `SaveStatus`;
  - `OutlineRow`, `QuestionCard` shell (all states), `InsertBar`;
  - `InspectorPanel` + tabs, `SectionDrawer`;
  - `EmptyState`, `KeyHint`.

**Acceptance and evidence:**
- Visual-policy guards in the style of `src/builder/builderPremium.21e2p1.test.ts`:
  - tokens only, no literal colours;
  - 44 px coarse targets;
  - the focus-ring token;
  - `prefers-reduced-motion`;
  - each rule more specific than any legacy rule it can tie with (the 21E.2 slice 3 cascade finding).
- A component gallery captured in Chromium.

### 21F.3 — Studio shell and outline, behind the option (P1, L)

**Scope:**
- **`StudioShell` layout:**
  - three regions from 1280 px;
  - inspector as a drawer from 1024 to 1279;
  - outline as a collapsible rail from 768 to 1023;
  - one column below 768, with a bottom bar «المخطط · المحتوى · الخصائص · المراجعة».
- **Outline as an ARIA tree:**
  - roving tabindex, arrows, Home / End, type-ahead;
  - per-question state from `builder/issueIndex`;
  - section marks and exam totals;
  - selecting a question scrolls to it and activates it.
- **The option:** a teacher preference «الواجهة الجديدة (تجريبية)» plus `?studio=1`. The current builder stays the default.

**Acceptance and evidence:**
- `scripts/capture-visual-gate-21f3.mjs` passes at 1440×900, 1024×768, 853×600 @1.5 and 390×844 touch:
  - no horizontal overflow;
  - no off-screen control;
  - axe-core reports no serious or critical violations.
- Every existing builder test passes unchanged.

### 21F.4 — Question cards and inspector (P1, L)

**Scope:**
- **Collapsed card:** a read-only summary through the student renderers, plus the correct answer, type, marks, classification
  and issue chips.
- **Active card:** the unchanged `QuestionComposer` plus a card bar with:
  - type;
  - a marks stepper;
  - preview;
  - duplicate;
  - delete;
  - more.
- **Inspector tabs:**
  - «السؤال» (number, marks, section, shared material, type metadata);
  - «التصنيف»;
  - «الوسائط» (media + attached code);
  - «متقدم» (rich content, activity).
- **Section drawer:**
  - grading policy and its inputs;
  - instructions with templates and rich instructions;
  - shared stimuli;
  - presets.

**Acceptance and evidence:**
- A collapsed 4-option MCQ card is 180 px or less at 1440 px.
- The active MCQ card has 16 or fewer focusable controls.
- A parity checklist (every field of today's card reachable in the Studio) is signed off in the PR.
- An issue-summary click opens the card and the inspector tab that holds the field, then focuses it.

### 21F.5 — Insert, reorder, productivity (P2, M)

**Scope:**
- **Insert bar between cards:**
  - quick types (MCQ, true / false, short answer);
  - «كل الأنواع» (the existing palette);
  - the question bank;
  - AI.
  - Insertion uses the new pure `insertQuestionAt`.
- **Drag and drop** in the outline and on the canvas:
  - pointer and keyboard (Space to lift, arrows to move, Space to drop, Escape to cancel);
  - live-region announcements;
  - cross-section moves through the existing `moveQuestionToSection`;
  - multi-select drag.
- **Shortcuts:**
  - Ctrl/⌘+K command palette;
  - Ctrl/⌘+Enter for a new question after the active one;
  - Alt+↑/↓ to move;
  - Ctrl/⌘+D to duplicate;
  - «?» to list the shortcuts.
  - None of these fire inside a text field when they would clash with editing (the `isTextEditingTarget` rule).

**Acceptance and evidence:**
- The drag library, if any, sits in the lazy Studio chunk. The initial graph stays under 125 KB gzip (C5).
- A keyboard-only harness moves a question across sections and undoes it.

### 21F.6 — Review step (P2, M)

**Scope:** one screen with:
- the readiness score, derived from `examQuality` and `examFinalization` with their rules unchanged;
- blockers and warnings, each with «إصلاح» to jump to the field;
- blueprint coverage (the existing analysis);
- the marks distribution by section and by cognitive level;
- the entry to the student preview.

**Acceptance and evidence:**
- No new rule. Every number comes from the existing authorities.
- The finalize button still explains its refusal.

### 21F.7 — Setup, publish and «امتحاناتي» (P2, L)

**Scope:**
- **Setup step:**
  - title;
  - cover (templates);
  - general instructions;
  - blueprint and policies;
  - presentation studio.
- **Publish step:**
  - finalize through the existing gates;
  - revisions from the governance service;
  - hand-off to assignment.
- **«امتحاناتي» home** replaces the access bar:
  - cards with status and readiness;
  - search;
  - status filters;
  - creation from four sources (blank, academic preset, import, AI composer).

**Acceptance and evidence:**
- The saved-exams list gains `status` and `readiness` as additive fields; older clients ignore them.
- Governance and assignments are unchanged.

### 21F.8 — Server draft autosave (P2, M; only if D3 is accepted)

**Scope:**
- After 5 s idle, a draft save goes through the 21F.0 conditional save.
- It never finalizes.
- Offline, the local backup behaves as today.
- A conflict opens the 21F.0 dialog.

**Acceptance and evidence:**
- A two-tab conflict test loses nothing.
- The save state in the top bar matches the server.

### 21F.9 — Cutover and clean-up (P3, L)

**Scope:**
- After the owner signs the parity checklist, the Studio becomes the default.
- The old layout and the overridden legacy CSS are removed.
- Experimental tools (3D function lab) move behind an option.
- Decision D1 is implemented.

**Acceptance and evidence:**
- Legacy builder tests are migrated to Studio equivalents, never deleted without a replacement (`AGENTS.md` §12).
- Post-merge verification runs on `main`.

---

## 5. Quality gates for every phase

| Gate | Standard | Tool |
|---|---|---|
| Baseline | C1–C5 and C11 of `docs/development/validation-matrix.md` | `npm test`, `npm run lint`, `npx tsc -b`, `npm run build`, `git diff --check` |
| Visual | before / after captures at 4 viewports; no horizontal overflow; no off-screen control | `scripts/capture-visual-gate-21f*.mjs` |
| Accessibility | no serious or critical axe findings; 44 px coarse targets; visible focus; reduced motion; keyboard-only walkthrough | the same harness |
| Performance | keystroke commit under 16 ms (p95) at 100 questions; initial JS graph within budget | `measure-builder-input-21f.mjs`, C5 |
| Safety | fail-first on the baseline for every defect; mutation for save, ownership and history invariants | baseline worktree, `scripts/mutate-21f.mjs` |
| Compatibility | the current builder keeps working and its tests keep their expectations until 21F.9 | existing suite |

## 6. Risks

| Risk | Mitigation |
|---|---|
| Hundreds of tests pin the builder DOM | The §3 DOM contract, and the old builder stays mounted behind the option until 21F.9 |
| compound@1 and published version families are frozen | The editors are reused unchanged inside the active card. No type or version changes. |
| Parallel windows edit `App.tsx` | 21F.1 extracts the builder state first, so later phases edit `src/studio/` only |
| Bundle growth | Studio, drag and drop and the command palette are lazy chunks. C5 must stay green. |
| Teachers' habits | Opt-in option with a way back, a short «ما الجديد» tour, and default only after sign-off |

## 7. Owner decisions (recommendation applies unless the owner says otherwise)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Legacy flat editor | Keep opening legacy exams with a one-click «تحويل إلى منظّم»; hide creating new legacy exams after 21F.9 |
| D2 | Existing exams without an owner | Stay shared as today; the owner is stamped on the first save after 21F.0; explicit sharing is a later phase |
| D3 | Server autosave | Yes, drafts only, 5 s idle, never finalizes |
| D4 | Panel placement | Outline on the right (reading start), inspector on the left |
| D5 | Top bar | Tadris navy with the turquoise accent; alternative: white |
| D6 | Rollout | Opt-in during 21F.3–21F.8; default in 21F.9 after the parity checklist |

## 8. Not in scope

These are unchanged:
- grading semantics;
- the Runner;
- the coding authority;
- HMAC boundaries;
- question type definitions and their version families;
- the student exam page;
- the governance rules;
- the storage layout, except the additive envelope fields in 21F.0 and 21F.7.

No deployment beyond the automatic PR preview of tier 3 (`AGENTS.md` §11).

---

## 9. Implementation record (2026-10-16)

**Baseline:** `origin/main` `613bda55`; re-fetched before handover: unchanged, so no reconciliation merge was needed.
**Branch:** `claude/nifty-clarke-k0wlid` (one branch for all phases, as the session required, instead of one branch per phase; one
normal commit per step, no amend / rebase / force-push). **Owner decisions:** D1–D6 as recommended in §7.

| Phase | Commits | What shipped | Evidence |
|---|---|---|---|
| 21F.0 | `ab898d6d`, `e451c97d` | Conditional saves (`baseEtag`; 409 `EXAM_CONFLICT` with the server version), ownership in multi-user mode (`ownerId`; another teacher's exam reads as not found), random exam ids, «تعارض في الحفظ» (save mine as new · replace, confirmed · open the server copy, confirmed) | fail-first on `613bda55`: 7 of 9 API tests failed; full suite 1 020 files / 12 933 tests green; mutation f0 12/12 KILLED |
| 21F.1 | `76d52ed4`, `8cb190b5` | Typing-aware undo (one step per typing burst, ≤ 1.5 s, same field), render isolation (stable `actions`, memoized editors, stable issue arrays), `useExamStudioController` | fail-first: 9 tests failed on the baseline; mutation f1 14/14 KILLED (3 survivors closed in `8cb190b5`); typing at 100 questions, input handler p50 22 → 2 ms, p95 36 → 3 ms; full suite 1 022 / 12 948 green |
| 21F.2 | `9951c920` | Studio tokens (only literal colours: navy + turquoise), 13 icons, primitives (stepper, save status, status dot, key hint, ARIA tabs) | 9 tests |
| 21F.3 / 21F.4 | `dcaab048`, `42f538a1` | Opt-in Studio layout: top bar, four steps, outline (ARIA tree), canvas of collapsed student-view cards with ONE active editor, inspector tabs, section settings, drawers and phone bottom bar | 11 tests; canvas height 11 756 → 2 121 px and collapsed card 1 139 → 156 px (9-question fixture); full suite: the inventory failure fixed in `42f538a1`; `rf3b.units` failed once under load, 3/3 in isolation and green in every later full run |
| 21F.5 | `5c286de9` | Insert bar between cards, outline drag-and-drop and Alt + ↑ / ↓, shortcuts (Ctrl / ⌘ + K, Enter, D, «?»), command palette | 15 tests; full suite 1 026 / 12 983 green, initial JS 113.1 KB |
| 21F.6 | `ccf80b6c` | Review step: readiness ring and state from the ONE finalization decision, every blocker / warning with «إصلاح» (opens the issue in its card), official marks by section / type / cognitive level / difficulty | 9 tests; full suite 1 028 / 12 992 green |
| 21F.7 | `eb03a4ed`, `649480dd` | Setup step (title, cover and instructions, design tools), publish step (timeline, gated final save, governance, hand-off to assignments), «امتحاناتي» (cards with status and readiness, search, filters, four creation sources); additive list fields `kind`, `status`, `readiness` (counts only) | API fail-first: 3 of 4 failed before the change; 23 tests; mutation f7 4/4 KILLED; the full suite found a 15A source-guard regression, fixed in `649480dd` |
| 21F.8 | `7a540265` | Server draft autosave (D3): 5 s idle, quiet, conditional, never creates, never finalizes or demotes a final exam, never locks the editor; saves serialized; conflict → the 21F.0 dialog; offline → notice, nothing lost, no retry loop | 9 tests against the REAL save / load handlers (two-tab conflict loses nothing); mutation f8 10/10 KILLED; full suite 1 034 / 13 026 green, initial JS 113.9 KB |
| 21F.9 | `2a1db6b2` | Studio is the default (classic kept as the remembered opt-out); 3D function lab behind «إظهار الأدوات التجريبية»; D1 «تحويل إلى منظّم» (new id, create-only); typing in the default layout re-renders one outline row and one card | fail-first: 40 rows + 40 cards re-rendered per edit; mutation f9 6/6 KILLED; typing at 100 questions, input handler p95: Studio 15 → 6 ms (classic 8 ms); full suite 1 036 / 13 031 green, initial JS 114.1 KB of 125 KB |

**Tests changed by the cutover (expectations unchanged):** four App suites that exercise the classic access bar or the classic builder
now choose the classic layout in their setup (`App.builderFocus.reviewK2.21e2`, `App.saveConflict.21f0`, `App.sharedConfirm.21e1`,
`App.confirmPrefetch.21e1s2`). One expectation changed on purpose: `AppShell.test.tsx` — a teacher boot now also reads
`/api/saved-exams` exactly once, because the landing builder page is «امتحاناتي»; the shell itself still adds no request.

**Deviations from the plan and open items for the owner:**
- The classic layout and its CSS are **not removed** in 21F.9: removal needs the owner's parity sign-off, and the classic builder's
  tests stay as they are until then. Studio-equivalent tests exist for every Studio flow listed above.
- D1 «hide creating new legacy exams»: the home offers no legacy creation and «القوالب» (legacy templates) left it. The page's AI
  bank generator still produces a flat exam (it is a separate product feature; its result can be converted in one click). Retiring
  it is an owner decision.
- Mutation proof was not applied to 21F.2–21F.6 (presentation and productivity; every action they run is an existing, already
  mutation-tested builder handler); it was applied to every save, ownership, history, readiness and cutover invariant.
- Visual evidence: Chromium captures at 1440 × 900 and 390 × 844 for every step and the home, with no horizontal overflow; the plan's
  four-viewport axe harness (`capture-visual-gate-21f*.mjs`) was not built.

**Deployment tier exercised:** tier 1 (local tests, builds, Chromium harness) only. Nothing deployed; no Azure, Runner or production
change. A PR preview (tier 3) exists only if a pull request is opened and its `Build and Deploy Job` succeeds.
