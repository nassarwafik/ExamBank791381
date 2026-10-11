# Phase 21E.1 — slice 2: premium toast, safe «تراجع», interaction polish (+ audit F3 / F6 / F16)

Design record for the second 21E.1 slice (Tadris+ — التعليم المتكامل). It builds on the 21E.0 audit and quality gates in
`docs/enterprise-ux-premium-21e.md` and on slice 1 (`docs/enterprise-ux-premium-21e1.md`, PR #299), and follows the owner's
Design Excellence Standard and Visual Quality Gate (§8 of the 21E record). Independent review required. Owner merge only.

## 1. Baseline and dependencies

| Item | Value |
|---|---|
| Baseline (`origin/main`) | `b8a65f16a2877a99a4adf4f24c74cb7687f7ae41` — merge of PR #299 (21E.1 slice 1) |
| Post-merge state of the baseline | Quality Gate, production Build and Deploy and Runner workflows green on `b8a65f1` (verified before branching) |
| Dependencies | none open; this PR targets `main` directly |
| Branch | `claude/elegant-albattani-1im7iq-21e1s2` |

## 2. What changed and why

| # | Objective (owner instruction) | Change | Files |
|---|---|---|---|
| 1 | Reusable, accessible toast with Arabic RTL | `useToast()` — one calm dark-navy card (the shell's navigation surface), at most one action, a close button, tones with icons; an ALWAYS-mounted polite live region (`role="status"`) receives the text after the card is painted; never takes focus; the countdown pauses on hover and on focus inside; Escape inside closes; one toast at a time; the owner learns how it left and whether focus was inside. Token-only CSS on `--eb-z-toast`, 44 px action on phones / coarse pointers, motion only without reduced-motion. Ships only with its first consumer (the lazy structured builder) — bundle guard. | `src/ui/Toast.tsx`, `src/ui/toast.css`, `scripts/check-bundle-budget.mjs` |
| 2 | Safe «تراجع» for deleting one question / one section | The deletion is captured as an IMMUTABLE snapshot (the very same object + where it was) inside the history updater; «تراجع» puts it back as ONE new history entry, re-validated against the exam as it is then — never a history pop, so later edits are never undone by mistake (§3). Focus goes to the next card (else the previous one, else «+ إضافة سؤال»; for a section: the next section, else the previous one, else «+ إضافة قسم»), back to the restored card after «تراجع», and to the neighbour again when Escape / close leaves the toast with focus inside. Screen readers hear «… للتراجع اضغط Ctrl+Z.». The action is named «تراجع عن حذف السؤال / القسم» (the visible word «تراجع» stays; the toolbar's «تراجع» keeps its unique name) and is disabled while saving. Ctrl+Z / the toolbar undo / opening another exam make the toast leave. | `src/structuredDeletionUndo.ts`, `src/StructuredExamBuilder.tsx`, `src/ExamSectionEditor.tsx` (`data-section-id`, focusable section, `data-add-question`) |
| 3 | First confirmation opens at once, no bundle growth | After a TEACHER session is validated, the shared confirmation chunk is warmed on idle (`requestIdleCallback`, else a ≤ 1.2 s timer) with a PLAIN `import()` (never the chunk-reload recovery; a failed prefetch is silent and retried later; skipped offline). Never for a visitor or a student. | `src/ui/confirmPrefetch.ts`, `src/App.tsx` |
| 4 | Template dialogs default to keeping the teacher's content | `ConfirmDialog` gains an opt-in `initialFocus: "confirm" \| "cancel"`; the four template-replacement confirmations open on «إبقاء …». Every other confirmation keeps its focus exactly as before. | `src/ui/ConfirmDialog.tsx`, `src/ExamSectionEditor.tsx`, `src/ExamCoverEditor.tsx` (×2), `src/App.tsx` |
| 5a | Audit F3 — the exam details panel cannot collapse | `.iex-details-panel[hidden]{display:none}` + a design-system guard for the bug class (any class on a `hidden` element with a non-`none` display rule needs a `[hidden]` override). | `src/studentexam-pro.css`, `src/designSystem/hiddenAttribute.guard.test.ts` |
| 5b | Audit F6 — secondary text fails AA on tints | `--eb-muted` `#64748b` → `#475569` (≥ 4.5:1 on every surface and tint token, still lighter than body text). Input placeholders get their own token `--eb-placeholder: #64748b` (the only placeholder that used the muted token is the sign-in form): AA on white (4.76:1) and still clearly lighter than typed text (2.2:1 apart) — with the darker muted value an empty field would look filled (1.35:1 apart). | `src/design-tokens.css`, `src/login-pro.css`, `api/tests/ux2-shell-foundation.test.js` (the old "< 4.5 on the page background" expectation is now "≥ 4.5"; the placeholder pin names the new token and gains two contrast assertions — stricter, not looser) |
| 5c | Audit F16 — phone menu loses focus after Escape | Escape, the backdrop and «إغلاق القائمة» return focus to «القائمة» even when the opening tap never focused it. Navigating to a page and the desktop-resize close keep their behaviour. | `src/shell/TeacherAppShell.tsx`, `src/ui/IconButton.tsx` (React 19 ref-as-prop) |
| 2b | Review fixes (independent adversarial pass on the first commit) | Focus never falls to `<body>` when ANY toast about a deletion leaves with focus inside it (Ctrl+Z pressed inside the toast, a refused «تراجع» from the keyboard, closing the success / warn toast): the restored item, else the neighbour, else «+ إضافة قسم». A restore never splits another scenario's block (first of after-previous / before-next / original index / end that keeps every block whole). Restored cards and sections are revealed just below the sticky toolbar (measured height; a card taller than the space below it is aligned by its top instead of centred). Restore scrolls honour reduced motion (OS or the app's motion setting). While a toast is shown the builder scroller reserves room below its last control. | `src/StructuredExamBuilder.tsx`, `src/structuredDeletionUndo.ts`, `src/structured-builder.css` |
| 3b | Same-commit first confirmation | After the prefetch, the closed lazy dialog is mounted ahead of time (renders nothing), so the first confirmation does not suspend: a lazy component first rendered on demand suspends once even with its module loaded, and React holds the reveal for its fallback throttle (~300 ms measured in Chromium). | `src/ui/confirmPrefetch.ts` (readiness subscription), `src/ui/useDeferredConfirm.tsx` |
| — | Correction | The slice-1 record claimed the teacher landing page loads the confirmation chunk; it does not (the landing is App.tsx's own view). Corrected with an erratum. | `docs/enterprise-ux-premium-21e1.md` |

**Product behaviour change:** deleting a question or a section in the structured builder is still immediate (no new
confirmation, the owner's earlier decision), and is now announced with a toast offering «تراجع»; template-replacement
dialogs now open on «إبقاء …»; the phone menu returns focus to its button; the student exam's details panel collapses as its
button says; secondary text is darker. No data format, API, grading, schema, storage, authentication or routing change.

## 3. Why «تراجع» restores a snapshot instead of popping the history stack

The builder only receives `onUndo / onRedo / canUndo / canRedo`; it cannot tell atomically that the deletion is still the newest
history entry (any later keystroke is newer, a save replaces the present object, history keeps 100 entries). Undoing blindly would
undo the wrong edit. So `src/structuredDeletionUndo.ts` (pure, lazy, never in the initial graph):

1. **Capture** inside the updater from the exact `prev` it deletes from (StrictMode-safe): the unchanged question / section
   object, its index, the number the teacher saw, its previous / next neighbour ids, and its scenario membership + position.
2. **Delete** with exactly the existing transitions (`deleteQuestion` / `deleteSection`, same scenario clean-up as before).
3. **Restore** as one new history entry, re-validated against the exam as it is NOW:
   - already back (Ctrl+Z / the toolbar) → nothing; another exam → nothing (`stale`);
   - question whose section no longer exists → refused, warn toast «تعذّرت استعادة السؤال: القسم «…» لم يعد موجودًا.»;
   - a bank question that was inserted again meanwhile → refused (no duplicate bank question);
   - a section whose question ids now exist elsewhere → refused (no duplicate ids);
   - position: after its previous neighbour wherever it moved, else before its next one, else its original index (clamped);
   - a scenario member re-joins its scenario at its place only when the members stay contiguous (the scenario validator's
     rule 5), otherwise it returns unlinked — never an invalid scenario.

Selection is not restored (pinned by `StructuredExamBuilder.productivity.test.tsx` R6, unchanged).

## 4. Acceptance criteria (measurable)

1. Toast: live region present before any toast and filled after the card is painted; focus never moves on show; action named
   unambiguously; hover / focus pause; Escape / close / replace / stale-id semantics; token-only CSS; 44 px action on phones;
   not in the initial graph (unit tests + bundle guard + Chromium).
2. Undo: same object back at its place as ONE history entry; later edits survive; refusals with a reason; focus after delete,
   after «تراجع» and after Escape never on `<body>`; Ctrl+Z / toolbar / other exam dismiss the toast; disabled while saving
   (pure + real-builder tests + Chromium on the production build).
3. Keep-default: the four template dialogs open on «إبقاء …»; a reflexive Enter keeps the teacher's text (tests + Chromium);
   every other dialog's initial focus unchanged (tests).
4. Prefetch: only after a validated teacher session, plain import, skipped offline (tests); first confirmation on a throttled
   network painted without a chunk fetch on the click (Chromium, before / after).
5. F3: guard + Chromium (collapsed = `display:none`, height 0, `aria-expanded="false"`; open / close by click; collapsed card is
   one ≥ 44 px row with the summary). F6: unit contrast test on every surface / tint token + axe colour-contrast on the visited
   pages. F16: focus returns to «القائمة» after Escape / backdrop / close (tests + Chromium).
6. Initial JS ≤ the 21E.1 stage line (+1 KB over 109.9 KB); lint 0 errors and no new warning; `tsc -b`; full root suite; build +
   bundle guard; `git diff --check`; exact-head CI green and PR preview created.

## 5. Fail-first evidence

The new and strengthened tests were copied into a detached worktree of the baseline `b8a65f1` and run there (implementation
files untouched): **31 targeted tests fail, the pins pass**; on the head every one passes.

| Test file | On `b8a65f1` (failing assertion) |
|---|---|
| `src/StructuredExamBuilder.undoToast.21e1s2.test.tsx` (real builder + real history hook) | 10/10 fail — no toast; after deleting question 2 `document.activeElement` is `<body>`, not the next card |
| `src/designSystem/hiddenAttribute.guard.test.ts` | `student/exam/ExamDetailsDisclosure.tsx: .iex-details-panel is shown by studentexam-pro.css «.iex-details-panel{display:flex}» but has no .iex-details-panel[hidden]{display:none}` |
| `src/designSystem/mutedContrast.21e1s2.test.ts` | `--eb-muted` on bg 4.04, primary-050 4.31, primary-100 4.15, warn-bg 4.43, danger-bg 4.35, info-bg 4.48 (< 4.5) |
| `api/tests/ux2-shell-foundation.test.js` (made stricter) | `ratio(muted, bg)` 4.04 < 4.5 |
| `src/shell/TeacherAppShell.focusReturn.21e1s2.test.tsx` | Escape / backdrop / «إغلاق القائمة»: focus on `<body>`, not «القائمة» (the unchanged navigate / resize case passes) |
| `src/keepContentDefault.21e1s2.test.tsx`, `src/App.sharedConfirm.21e1.test.tsx` (one assertion added) | focus on «استبدال التعليمات» / «استبدال حقول الغلاف», not «إبقاء …» (the unchanged default / danger cases pass) |
| `src/App.confirmPrefetch.21e1s2.test.tsx` | the validated teacher session never prefetches (`prefetch` called 0 times); visitor and student cases pass |
| `src/ui/toast.21e1s2.test.tsx`, `src/ui/confirmPrefetch.21e1s2.test.ts`, `src/structuredDeletionUndo.21e1s2.test.ts` | new modules: cannot resolve `./Toast` / `prefetchConfirmDialog` / `./structuredDeletionUndo` (new features, not defects) |
| `src/ui/deferredConfirmPrefetched.21e1s2.test.tsx` (added after the Chromium measurement, run against the slice's own first commit `998e955`) | the first click after the prefetch shows no dialog in the same commit (React suspends the lazy dialog once) |

## 6. Mutation proof

Each mutant: exact single-occurrence replacement, the targeted suites run, file restored byte-for-byte and sha256-verified in
`finally`, `git status --porcelain` identical before and after the campaign. **KILLED = a test failed on an assertion.**

| Id | Planted defect | Result |
|---|---|---|
| M1 | restore position ignores the previous neighbour | KILLED |
| M2 / M3 / M5 | restore skips the bank-duplicate / section-missing / id-conflict refusal | KILLED ×3 |
| M4 | scenario re-link ignores contiguity | KILLED |
| M24 | restore may split another scenario's block | KILLED |
| M6 | «تراجع» pops the history stack instead of restoring the snapshot | KILLED |
| M7 / M10 / M25 / M26 / M27 | no focus move after a deletion / after Escape / after Ctrl+Z inside the toast / after a refused keyboard «تراجع» / after closing the success toast | KILLED ×5 |
| M8 | the toast stays when Ctrl+Z / another exam brings the item back | KILLED |
| M9 | the action stays enabled while saving | KILLED |
| M11 / M12 / M13 | toast: focus no longer pauses / text written into the live region at once / stale id closes a newer toast | KILLED ×3 |
| M23 | the toast is imported by a startup module | KILLED |
| M14 / M15 | ConfirmDialog ignores `initialFocus` / the section template drops it | KILLED ×2 |
| M16 / M17 / M18 / M28 | no prefetch / prefetch before validation / prefetch while offline / closed dialog not mounted after the prefetch | KILLED ×4 |
| M19 | F3 `[hidden]` override removed | KILLED |
| M20 | F6 `--eb-muted` back to `#64748b` | KILLED |
| M21 / M22 | F16 Escape / backdrop without focus return | KILLED ×2 |
| M29 | the sign-in placeholder uses the darkened muted colour again | KILLED |
| M30 / M31 | `whenIdle` hands the IdleDeadline to the task / the prefetch loads again while loading or after done | KILLED ×2 |
| M32 / M33 / M34 | no offset below the sticky toolbar / restore scrolls ignore reduced motion / no room reserved below the builder while a toast is shown | KILLED ×3 |
| M35 | the F3 guard skips className expressions again (mutant in the guard itself) | KILLED |

| M36 / M37 | a tall restored card is centred under the toolbar again / gets no offset below it | KILLED ×2 |

37 mutants, all KILLED, no timeouts. M1–M35 ran on `5b72855`; after the last builder change every mutant in
`StructuredExamBuilder.tsx` (M6–M10, M25–M27, M32–M34, M36, M37) was run again on the final code. Every mutated file was
restored byte-for-byte and sha256-verified; `src/`, `scripts/`, `api/` were identical to the commit after each run.

## 7. Real-Chromium certification (production builds, before = `b8a65f1`, after = head)

`scripts/capture-visual-gate-21e1s2.mjs` drives the production build through a real teacher session against a local mock of the
teacher API (service workers blocked, nothing deployed) at desktop 1280×900, desktop 150 % (853×600 at 1.5×), desktop 200 %
(640×450 at 2×) and phone 390×844 (touch). `scripts/check-exam-details-browser-21e1s2.mjs` mounts the real
`ExamDetailsDisclosure` with the shipped stylesheets.

| Check | Before (`b8a65f1`) | After (head) |
|---|---|---|
| Delete question 2 | question gone, no message, **focus on `<body>`** | toast «تم حذف السؤال 2 من «القسم الأول: العناوين».», live region adds «للتراجع اضغط Ctrl+Z.», focus on the next card (all 4 viewports) |
| Toast geometry | — | inside the visible area and on top (real hit test) at all 4 viewports; action 64×36 / close 40×40 with a mouse, 64×44 / 44×44 on the phone and at 200 %; message 15.1:1, action 14.4:1 on the navy card; keyboard focus ring 2 px solid white |
| «تراجع» | only the toolbar / Ctrl+Z (history) | same object back at its place, success toast, focus on the restored card |
| Escape inside the toast / Ctrl+Z | — | toast closes, focus back on the neighbour card / item restored and the toast leaves |
| Delete a section | no message, focus on `<body>` | «تم حذف «…» مع سؤالين.», focus on the next section, «تراجع» restores it |
| Template over typed text, then a reflexive Enter | focus on «استبدال التعليمات» → **teacher text REPLACED** | focus on «إبقاء التعليمات» → teacher text KEPT |
| Phone menu (≤ 1024 px) opened without focusing its button, then Escape / backdrop | focus on `<body>` | focus on «القائمة» |
| F3 details panel collapsed (390 / 1280 / 200 %) | `display:flex`, 209 / 141 / 182 px painted while `aria-expanded="false"` — **4/16 checks** | `display:none`, height 0; open / close by click; collapsed card one 44 px row with «22 أسئلة · 100 علامة»; the first question moves up by 209 px on the phone — **16/16** |
| F6 axe-core 4.10.2 colour-contrast (builder landing + structured builder, 4 viewports) | 0 nodes on these two teacher pages | 0 nodes; every element painted in the muted colour ≥ 7.18:1 |
| First confirmation on a throttled network (400 ms RTT, 50 KB/s), measured in the page from the click to the dialog in the DOM | **520 ms**, `ConfirmDialog` + `Dialog` chunks fetched on the click | **7 ms**, both chunks fetched on idle before the click, nothing requested on the click (prefetch alone, before the closed dialog was pre-mounted: 304 ms) |
| Sticky builder toolbar height (pre-existing, unchanged) | 300 / 350 / 400 / 700 px of 900 / 600 / 450 / 844 | identical. At 200 % and on the phone it covers a restored card's tools; the harness then operates «حذف» by keyboard and records it (21E.2 toolbar work) |
| Page overflow | none | none (scrollWidth = clientWidth at every viewport) |
| Page errors | 0 | 0 |

## 8. Visual Quality Gate (owner's Design Excellence Standard)

- **A / B — before / after screenshots** of the actual pages at desktop, 150 %, 200 % and phone: published with the PR
  evidence (the run writes `HARNESS_OUT/<before|after>/`).
- **C — visual review.** The toast uses the shell's own navigation navy, white text, one quiet bordered action and a close
  glyph; it sits centred above the bottom edge (full width on phones, safe-area aware), never covers the toolbar, and animates
  only without reduced motion. Approved Tadris+ identity untouched (no logo, colour or typeface change other than the darker
  secondary text token). Secondary text stays visibly lighter than body text (`#475569` vs `#334155`).
- **D — real teacher workflow:** open a saved structured exam → delete a question → «تراجع» → delete a section → «تراجع» →
  template over typed text with a reflexive Enter; phone menu by keyboard; first confirmation on a slow network.
- **E — improvements and shortcomings:** §2, §7 and §10.
- **F — independent review:** requested from Window 1 (FUNCTIONAL / ACCESSIBILITY / VISUAL QUALITY / REGRESSION).

## 9. Deferred — documented, not in this slice

| Item | Why deferred | Where |
|---|---|---|
| F3 follow-up (audit F4): merge the progress card, section box and «السؤال 1 من 22» heading into one position line on phones | layout change of the running exam, larger than a fix; F3 alone moves the first question up but not above the bottom bar | 21E.3 |
| F6 follow-up: 103 hard-coded `#64748b` copies in older sheets, and the presentation preset that defines its own muted colour | sheet-by-sheet migration under the token guard ratchet | 21E.6 |
| F16-like weakness in the Learning Reader drawer (focus return after close) | a different component with its own trap; needs its own test | 21E.2 |
| F11 (guard part): SmartSim focus ring ignores the exam theme | touches the SmartSim frame; not a design-system one-liner | 21E.3 / 21E.5 |
| AI general-instructions «تطبيق» confirmation and the TeacherPlatform password list | not template replacements of teacher-written text (the first applies an explicit AI request, the second is not a confirmation) — left on their existing focus | — |
| Section presets that overwrite section settings without a dialog | owner decision (no new confirmations in the builder) | owner |
| Undo for bulk deletion | bulk delete is one history step already (Ctrl+Z restores it); a bulk toast needs its own design | 21E.2 |

## 10. Known limitations

- **One toast at a time.** Deleting a second item replaces the first toast; the first deletion is then undone with Ctrl+Z /
  the toolbar «تراجع» (history), as before this slice. Deliberate: a stack of undo toasts competes for attention and focus.
- **Keyboard reach.** The toast sits at the end of the builder overlay, so Tab reaches it only after the builder's controls.
  Keyboard and screen-reader users are told the shortcut instead («… للتراجع اضغط Ctrl+Z.»), which works right after the
  deletion because focus is on a card or a button, never a text field.
- **Media in flight.** Deleting a question whose image upload / AI generation is still running is not blocked (unchanged); the
  late result is dropped as before, so «تراجع» brings the question back without that pending image.
- **Selection** is not restored with the question (pinned behaviour R6).
- **The muted token** is now `#475569`; older sheets still carry about 103 literal `#64748b` copies (21E.6).
- **F6 in Chromium covered two teacher pages only.** The audit's failing screens (student home 18 nodes, student results 10,
  classes, grading, dashboard, lab exam) need a seeded student / class store this harness does not have; they were not re-run
  here. The token-level test covers every surface and tint token, and the audit's own measurement with the same value
  (`:root{--eb-muted:#475569}`) cleared every colour-contrast node on all 7 screens it tested. The 16-screen axe matrix stays
  with 21E.6 (browser-side a11y checks in the harness runner).
- **Prefetch failure.** Browsers may keep a failed module fetch in the module map for the page's lifetime; if the idle prefetch
  fails, the first confirmation takes the existing one-shot recovery (`lazyWithRetry`) — the same outcome as a failed first-use
  fetch before this slice (one fetch attempt either way). The prefetch is skipped while offline.
- **F3 makes the approved UX-7b-1 design real — owner decision requested.** The details panel now really starts collapsed unless
  the exam has general instructions (pinned by `StudentExamPage.ux7b1.test.tsx`). Before, the CSS bug kept it always painted,
  so students always saw the ASSIGNMENT instructions inside it. If the owner prefers those to stay visible by default, the
  one-line option is `defaultOpen={hasGeneralInstructions || !!String(assignment.instructions || "").trim()}` in
  `src/StudentExamPage.tsx` (and the UX-7b-1 pin updated with the owner's sign-off). Not changed here: it is a product decision.
- **At 200 % (640×450) and on phones** the toast overlays the bottom ~100 px of the builder while it is shown (10 s, paused on
  hover / focus, closable). The builder scroller reserves that much room below its last control while a toast is up, so
  nothing becomes unreachable. The pre-existing sticky builder toolbar is the bigger problem there: 400 of 450 px at 200 % and
  700 of 844 px on a phone (measured, identical before and after), so little content is visible under it with or without a
  toast. Restored cards and sections are aligned just below it (measured height), but at those sizes their tools can still sit
  under it. Recommended for 21E.2 (toolbar ≤ 8 actions with an overflow menu, not sticky on short viewports).
- **Pre-existing timing flake seen in the full local run (not touched here):** `api/tests/coding-17d-b1-replay-protection.test.js`
  RP5 signs with `Math.floor(Date.now() / 1000) + 301` while the verifier compares fractional seconds, so when the sub-second
  part plus the handler delay reaches 1 s the +301 case falls inside the 300 s window and is accepted (failed once under full
  load; passes in isolation; no API source or that test changed in this PR). Suggested fix for a separate PR: sign with a skew
  of ±302 s or inject `nowMs`.
