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
| 2 | Safe «تراجع» for deleting one question / one section | The deletion is captured as an IMMUTABLE snapshot (the very same object + where it was) inside the history updater; «تراجع» puts it back as ONE new history entry, re-validated against the exam as it is then — never a history pop, so later edits are never undone by mistake (§3). Focus goes to the next card (else the previous one, else «+ إضافة سؤال»; for a section: the next section, else the previous one, else «+ إضافة قسم»), back to the restored card after «تراجع», and to the neighbour again when Escape / close leaves the toast with focus inside. Screen readers hear the routes back («… للتراجع اضغط Ctrl+Z (أو ⌘Z) أو استخدم زر «تراجع».» since Review Fix 2). The action is named «تراجع عن حذف السؤال / القسم» (the visible word «تراجع» stays; the toolbar's «تراجع» keeps its unique name) and is disabled while saving. Ctrl+Z / the toolbar undo / opening another exam make the toast leave. | `src/structuredDeletionUndo.ts`, `src/StructuredExamBuilder.tsx`, `src/ExamSectionEditor.tsx` (`data-section-id`, focusable section, `data-add-question`) |
| 3 | First confirmation opens at once, within the bundle budget | After a TEACHER session is validated, the shared confirmation chunk is warmed on idle (`requestIdleCallback`, else a ≤ 1.2 s timer) with a PLAIN `import()` (never the chunk-reload recovery; a failed prefetch is silent and is NOT retried in the session — browsers keep the failed module — so the first confirmation then takes the existing one-shot reload, exactly as a failed first-use fetch did before; skipped offline). Cost: ≈ +0.35 KB gzip in the initial graph, inside the 21E.1 stage line. Never for a visitor or a student. | `src/ui/confirmPrefetch.ts`, `src/App.tsx` |
| 4 | Template dialogs default to keeping the teacher's content | `ConfirmDialog` gains an opt-in `initialFocus: "confirm" \| "cancel"`; the four template-replacement confirmations open on «إبقاء …». Every other confirmation keeps its focus exactly as before. | `src/ui/ConfirmDialog.tsx`, `src/ExamSectionEditor.tsx`, `src/ExamCoverEditor.tsx` (×2), `src/App.tsx` |
| 5a | Audit F3 — the exam details panel cannot collapse | `.iex-details-panel[hidden]{display:none}` + a design-system guard for the bug class (any class on a `hidden` element with a non-`none` display rule needs a `[hidden]` override). | `src/studentexam-pro.css`, `src/designSystem/hiddenAttribute.guard.test.ts` |
| 5b | Audit F6 — secondary text fails AA on tints | `--eb-muted` `#64748b` → `#475569` (≥ 4.5:1 on every surface and tint token, still lighter than body text). Input placeholders get their own token `--eb-placeholder: #64748b` (the only placeholder that used the muted token is the sign-in form): AA on white (4.76:1) and still clearly lighter than typed text (2.2:1 apart) — with the darker muted value an empty field would look filled (1.35:1 apart). | `src/design-tokens.css`, `src/login-pro.css`, `api/tests/ux2-shell-foundation.test.js` (the old "< 4.5 on the page background" expectation is now "≥ 4.5"; the placeholder pin names the new token and gains two contrast assertions — stricter, not looser) |
| 5c | Audit F16 — phone menu loses focus after Escape | Escape, the backdrop and «إغلاق القائمة» return focus to «القائمة» even when the opening tap never focused it. Navigating to a page and the desktop-resize close keep their behaviour. | `src/shell/TeacherAppShell.tsx`, `src/ui/IconButton.tsx` (React 19 ref-as-prop) |
| 2b | Review fixes (independent adversarial pass on the first commit) | Focus never falls to `<body>` when ANY toast about a deletion leaves with focus inside it (Ctrl+Z pressed inside the toast, a refused «تراجع» from the keyboard, closing the success / warn toast): the restored item, else the neighbour, else «+ إضافة قسم». A restore never splits another scenario's block (first of after-previous / before-next / original index / end that keeps every block whole). Restored cards and sections are revealed just below the sticky toolbar (its measured bottom edge since Review Fix 1, §11; a card taller than the space below it is aligned by its top instead of centred). Restore scrolls honour reduced motion (OS or the app's motion setting). The builder scroller reserves room below its last control for the toast while a toast is shown, and from a deletion's / restore's reveal until its toasts leave (Review Fix 3, §13; Review Fix 2 had made it permanent, which hid «+ إضافة قسم» under the sticky toolbar at the end of the builder). Review Fix 2 (§12): a POINTER closing a toast returns focus without moving the page, a keyboard close reveals a hidden target only; a focus candidate disabled while saving is skipped (section, then the never-disabled toolbar as the last resort). | `src/StructuredExamBuilder.tsx`, `src/structuredDeletionUndo.ts`, `src/structured-builder.css` |
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
| M38 | Review Fix 1 (R1): the deletion neighbour is focused without `preventScroll` | KILLED |
| M39 / M40 | R1: a hidden heading is never revealed / the page always moves, even when the heading is on screen | KILLED ×2 |
| M41 / M52 | R1: the band the toast is about to cover is ignored after a deletion / after a refused keyboard «تراجع» | KILLED ×2 |
| M42 / M50 / M51 | R1: no-usable-strip rule removed / with no strip every heading counts as visible / threshold off by one (`<=` 96) | KILLED ×3 |
| M43 | R1: clearance from the toolbar's height instead of its bottom edge | KILLED |
| M44 | R1: a hidden «+ إضافة سؤال» is focused but not revealed | KILLED |
| M49 | R1: a card is centred into the full viewport while the toast's band shrinks it | KILLED |
| M45 / M46 | V1: the toast message back to the default size / the tight line height | KILLED ×2 |
| M54 / M55 | V1: long section titles not shortened in the toast / screen readers get the shortened title too | KILLED ×2 |
| M47 / M48 / M53 | F3: assignment instructions no longer open the details / whitespace-only instructions open them / general instructions no longer open them | KILLED ×3 |
| M56 / M57 / M58 | Review Fix 2: a pointer closing the toast reveals the target anyway / a candidate that did not take focus counts as focused / no last-resort toolbar focus | KILLED ×2; **M57 equivalent** (the `disabled` guard runs first for every button candidate, and the `tabIndex="-1"` containers always take focus — the `activeElement` check is defence in depth) |
| M59 | RF2: the clearance ignores the toolbar's resting position | KILLED |
| M60 / M61 / M62 | RF2: titles cut by code point / a word cut anywhere / a trailing format character left before «…» | KILLED ×3 |
| M63 / M64 / M65 / M66 | RF2: counts for 100+ questions use the whole number / whitespace-only title not trimmed / no `<bdi>` / a long display number shown in full | KILLED ×4 |
| M67 | RF2: two deletions in one commit settle the committed seq only | KILLED |
| M68 / M69 / M70 / M71 / M72 / M73 | RF2 toast: action always «keyboard» / close always «keyboard» / the action runs after the toast left / a toast shown from onDismiss dropped / no `aria-describedby` / the pause not keyed by id | KILLED ×6 |
| M74 | RF2: a restored scenario member re-linked at its stale captured position | KILLED |
| M75 | RF2: the room below the builder reserved only while a toast shows | KILLED |
| M76 | RF2: the hidden-attribute guard trusts a specificity tie regardless of source order (mutant in the guard) | KILLED |
| M77 / M78 | RF2: the success toast not capped at 4 s / the 24 px margin of the "fits" rule removed | KILLED ×2 |
| M79–M89 | RF2: the self-review's 16 mutation survivors re-planted (title limit 41, «2 أسئلة», «11 أسئلة», a plain focus() before the preventScroll one, a restored card / section focused without preventScroll, the restored card aligned before the success toast exists, a blur resuming the countdown, Escape propagating, a pause carrying over, the scroller's top ignored) | KILLED ×10; **M86 survives with negligible effect — NOT equivalent** (corrected in Review Fix 3, §13): it is equivalent for the tests (636/636 pass with it), but in real Chromium React flushes the blur's update between `focusout` and `focusin`, so with the mutant every focus move inside the card re-arms the countdown for a few ms (≈ 3–5 ms per move; ≈ 160 ms over 40 moves of a 10 s toast); the toast still never closes while focus is inside |
| M90 / M91 | RF2: the history recovery after «تراجع» removed / reacting to every exam change | KILLED ×2 (on `0c5536b`) |

M1–M37 (slice 2): all KILLED, no timeouts; M1–M35 ran on `5b72855`, and after the last builder change every mutant in
`StructuredExamBuilder.tsx` (M6–M10, M25–M27, M32–M34, M36, M37) was run again on the final code. Review Fix 1: the whole
campaign, M1–M55, was run again on `9794b26` (§11). Review Fix 2: the whole campaign, M1–M78, ran on `34b8258` — 77 of 78 KILLED, no timeouts, M57 equivalent (above); then M79–M89, the self-review's own survivors re-planted, on the same code with two tests added: 10 of 11 KILLED, M86 equivalent
(§12; the self-review's own 34 mutants and what became of their 16 survivors are tabled there). M90 / M91 ran on `0c5536b`.
Review Fix 3 (§13): M92–M96 for its own changes, all KILLED.
**Total: 96 mutants, 94 KILLED, 1 equivalent (M57), 1 survivor with negligible effect (M86, not equivalent — see its row), no
timeouts.** Every mutated file was
restored byte-for-byte and sha256-verified; `src/`, `scripts/`, `api/` were identical to the commit after each run.

## 7. Real-Chromium certification (production builds, before = `b8a65f1`, after = `7733703`; every after-claim re-verified on `dd795f3` in §12)

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
| F3 details panel collapsed (390 / 1280 / 200 %) | `display:flex`, 209 / 141 / 182 px painted while `aria-expanded="false"` — **4/16 checks** | `display:none`, height 0; open / close by click; collapsed card one 44 px row with «22 أسئلة · 100 علامة»; the first question moves up by 209 px on the phone — **16/16** | *(Collapsed case = no instructions. Since Review Fix 1 the panel opens by default when the assignment has instructions — owner decision, §11.)*
| F6 axe-core 4.10.2 colour-contrast (builder landing + structured builder, 4 viewports) | 0 nodes on these two teacher pages | 0 nodes; every element painted in the muted colour ≥ 7.18:1 |
| First confirmation on a throttled network (400 ms RTT, 50 KB/s), measured in the page from the click to the dialog in the DOM | **520 ms**, `ConfirmDialog` + `Dialog` chunks fetched on the click | **7 ms**, both chunks fetched on idle before the click, nothing requested on the click (prefetch alone, before the closed dialog was pre-mounted: about 300 ms — observed during development, not archived) |
| Sticky builder toolbar height (pre-existing, unchanged) | 300 / 350 / 400 / 700 px of 900 / 600 / 450 / 844 | identical. At 200 % and on the phone it covers a restored card's tools; the harness then operates «حذف» by keyboard and records it (21E.2 toolbar work) |
| Page overflow | none | none (scrollWidth = clientWidth at every viewport) |
| Page errors | 0 | 0 |

## 8. Visual Quality Gate (owner's Design Excellence Standard)

- **A / B — before / after screenshots** of the actual pages at desktop, 150 %, 200 % and phone: published with the PR
  evidence (the run writes `HARNESS_OUT/<before|after>/`).
- **C — visual review.** The toast uses the shell's own navigation navy, white text, one quiet bordered action and a close
  glyph; it sits centred above the bottom edge (full width on phones, safe-area aware) and animates
  only without reduced motion. It never covers the toolbar at 1280×900, 150 % or on a 390 px phone; at 200 % (640×450) it overlaps
  the toolbar's last row («معاينة الامتحان», «حفظ مسودة», «اعتماد نهائي») for the 10 s it shows (paused while the pointer rests
  on it) — the pre-existing audit F1 toolbar, 21E.2 (`docs/enterprise-ux-premium-21e.md` §3.5). Approved Tadris+ identity untouched (no logo, colour or typeface change other than the darker
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

- **The 21E acceptance audit's findings F1–F20** are kept, with status and target phase, in `docs/enterprise-ux-premium-21e.md`
  §3.5 (F1 — the oversized phone / 200 % builder toolbar and its overlap with this slice's undo toast — with the measured numbers).
- **Bulk delete (pre-existing):** after the confirmation the bulk bar unmounts with the dialog's opener, so focus lands on `<body>`
  (identical on `main`; measured in §12). 21E.2 (bulk-action bar).
- **A modal over the toast:** the bulk-delete confirm or the bank picker does not pause the toast's countdown, and its «تراجع» is
  unreachable behind the modal; the toolbar «تراجع» and Ctrl+Z remain after the modal closes (measured in §12).
- **One toast at a time.** Deleting a second item replaces the first toast; the first deletion is then undone with Ctrl+Z /
  the toolbar «تراجع» (history), as before this slice. Deliberate: a stack of undo toasts competes for attention and focus.
- **Keyboard reach.** The toast sits at the end of the builder overlay, so its «تراجع» is the builder's LAST Tab stop (not "one
  Tab stop away", as an RF2 code comment said — corrected in Review Fix 3). Keyboard and screen-reader users are told the routes
  instead («… للتراجع اضغط Ctrl+Z (أو ⌘Z) أو استخدم زر «تراجع».»): Ctrl+Z works right after the deletion because focus is on a card
  or a button, never a text field, and the toolbar «تراجع» is near the builder's start. Escape closes the toast only while focus is
  inside it.
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
- **F3 — owner decision taken in Review Fix 1 (§11).** The details panel opens by default when the assignment has instructions
  (as students effectively saw them before the CSS fix) or the exam has general instructions; it starts collapsed otherwise.
- **The room below the builder for the toast (Review Fix 3).** The scroller reserves 128 px below «+ إضافة قسم» only while a toast
  is shown, or from the moment a deletion / restore reveals its target until its toasts have left — never permanently (Review
  Fix 2 had made it permanent, which pushed the sticky toolbar over «+ إضافة قسم» at the end of the scroll range with no toast at
  all: a WCAG 2.4.11 regression vs `main`, found by the independent review, §13). Consequences, measured in §13:
  - with no toast, the end of the builder is identical to `main` at 853×480, 731×514, 640×450 and 390×844 (toolbar at rest,
    «+ إضافة قسم» as visible and hit-testable as on `main`, Tab reaches it without hiding it);
  - **while a toast is shown at the end of the builder** at 150 % on a 720p screen, 175 %, 200 % and on phones, the reserve pushes
    the stuck toolbar up and «+ إضافة قسم» sits under it (F1, transient: 10 s, paused on hover / focus, closable by × or by Escape
    with focus inside; at 200 % the toast also covers the toolbar's last row by 44 px, and the same overlap occurs at 731×514 and
    320×640);
  - when that toast leaves with the builder scrolled to its very end, the content shifts by up to 112 px as the reserve is
    released (the Review Fix 2 "no jump" behaviour is traded for controls that are never hidden without a toast).
  The pre-existing sticky toolbar is the bigger problem there (400 of 450 px at 200 %, 700 of 844 px on a phone): 21E.2 (toolbar
  ≤ 8 actions with an overflow menu, not sticky on short viewports; acceptance in `docs/enterprise-ux-premium-21e.md` §3.5 / §8).
- **Ctrl+Z / Ctrl+Y around a restored item (Review Fix 3).** When the history removes an item that came back («تراجع», or Ctrl+Z /
  the toolbar while its toast was up) and focus is lost, its neighbour gets focus in place; a later Ctrl+Y follows the item back
  only while focus still sits on that neighbour. Focus the teacher has put anywhere else (another card, a dialog, a toolbar button)
  is never taken and the page does not move (Chromium keeps the focused card still: scroll anchoring). The «تمت استعادة …» toast
  leaves when its item is removed again.
- **Pre-existing on `main`, not changed here:** «حفظ مسودة» and the toolbar «تراجع» / «إعادة» disable themselves while they act,
  which drops keyboard focus to `<body>` (21E.2, toolbar rework).
- **Pre-existing timing flake seen in the full local run (not touched here):** `api/tests/coding-17d-b1-replay-protection.test.js`
  RP5 signs with `Math.floor(Date.now() / 1000) + 301` while the verifier compares fractional seconds, so when the sub-second
  part plus the handler delay reaches 1 s the +301 case falls inside the 300 s window and is accepted (failed once under full
  load; passes in isolation; no API source or that test changed in this PR). Suggested fix for a separate PR: sign with a skew
  of ±302 s or inject `nowMs`.

## 11. Review Fix 1 — independent review of `77337030` (Window 1)

| Finding | Severity | What changed | Files |
|---|---|---|---|
| **R1** — after deleting a question, the next question's heading and controls could end up under the sticky toolbar | P2 | `focusAfterDeletion` (and every path that hands focus on after a deletion, a refused «تراجع» or a toast leaving) now uses `focus({ preventScroll: true })`. The page does **not** move when the target's heading is on screen — below the toolbar's bottom edge and clear of the band the toast is about to cover (`TOAST_BAND`, 128 px, the same room `structured-builder.css` reserves). Otherwise the target is revealed just below the toolbar with the existing alignment, extracted as `alignCard` (from `focusCard`) and `alignSection` (from `revealSection`); «+ إضافة سؤال / قسم» align like a section (top edge just below the toolbar — an independent review of the first version showed that `nearest` with large margins could end-align them under the toolbar at 200 %). A card is centred only when it fits the area left after the toast band while a toast is shown (the band's scroll padding shrinks the area it is centred in); otherwise it is aligned by its top. Found while certifying: the clearance was the toolbar's *height* + 12 px, but the scroller's 16 px padding puts the stuck toolbar lower, so revealed headings sat 4 px under it (restore paths included) — now the toolbar's bottom edge relative to the scroller + 12 px. When the tall toolbar and the toast band leave no usable strip (phones, 200 %), the transient band is ignored instead of making pointless moves. | `src/StructuredExamBuilder.tsx` |
| **V1** — Arabic toast readability | P3 | `.eb-toast-message`: `font-size: var(--eb-fs-16)`, `line-height: var(--eb-lh-body)`; nothing clips it (no overflow / clamp). Found by the independent re-check: at 16 px a long section title could make the toast 3–5 lines tall, so the title *shown* in a toast is cut to 40 characters (at a word when possible) + «…»; the live region still announces the full title. | `src/ui/toast.css`, `src/StructuredExamBuilder.tsx` |
| **F3** — product decision | — | The details panel opens by default when `assignment.instructions` has text (whitespace-only counts as none) or the exam has general instructions; collapsed otherwise. The UX-7b-1 pin is updated: its toggle test now uses an assignment without instructions, and a new case pins "instructions → open". Consequence handed to 21E.3 (audit F4): with instructions the open panel pushes question 1 down again (by the panel's height, 209 px on a 390 px phone for the harness content); the collapsed-by-default gain now applies to assignments without instructions. | `src/StudentExamPage.tsx`, `src/StudentExamPage.ux7b1.test.tsx` |

**Fail-first** (the final versions of the four test files copied into detached worktrees; 72 tests):

| Run against | Failed | Passed | What fails |
|---|---|---|---|
| `77337030` (reviewed head) | 23 | 49 | `focusReveal.21e1s2rf1` (plain `focus()` without `preventScroll`; a hidden heading or add button never revealed; a visible next section scrolled anyway; clearance 132 px instead of 148 px), the V1 CSS assertion, the two long-title toast cases, the F3 case, and the two slice-2 assertions R1 deliberately changes (a visible next section is no longer scrolled) |
| `02564c1` (first Review Fix 1 commit) | 6 | 66 | the independent re-check's findings: «+ إضافة سؤال» end-aligned under the toolbar (desktop and 200 % geometry), a card centred under the toolbar during a second deletion while the toast is shown, a refused «تراجع» revealing «+ إضافة قسم», and the two long-title toast cases |
| `9794b26` | 0 | 72 | — |

The two Chromium-found cases (bottom-edge clearance, no usable strip) were found while certifying the first version of the fix
(observed during development; the archived fail-first run is the one against `77337030`).

**Real Chromium** (`scripts/check-review-fix1-browser-21e1s2.mjs`, production builds of `77337030` and `9794b26`, reduced
motion; question 2's heading placed 8 px below the toolbar, then deleted with the mouse and — after Ctrl+Z — from the keyboard):

| Viewport (toolbar bottom) | Before `77337030` | After |
|---|---|---|
| 1280×900 (316 px) | page jumped 332 / 324 px, next heading at y = 0 under the toolbar, its «حذف» not clickable | 0 px moved (mouse and keyboard), heading at 332 / 324, «حذف» clickable |
| 853×600 @1.5 (366 px) | jumped 382 / 374 px, heading under the toolbar, not clickable | 0 px, heading at 382 / 374, clickable |
| 640×450 @2 (416 px) | jumped 432 / 411 px, heading under the toolbar | heading at 428, just below the toolbar (the best position left); the transient toast covers the remaining strip (21E.2 toolbar) |
| 390×844 phone (716 px) | jumped 732 / 724 px, heading under the toolbar | 0 px, heading at 732 / 724, clickable |

The section's last question deleted from the keyboard while the previous toast is still shown, its «حذف» under the toolbar
(focus falls back to «+ إضافة سؤال»):

| Viewport | Before `77337030` | After |
|---|---|---|
| 1280×900 | button at 639, below the toolbar, clickable | same (639, clickable) |
| 853×600 @1.5 | button at 339, **under** the 366 px toolbar | button at 378, below it, clickable |
| 640×450 @2 | button at 189, under the toolbar | button at 428, just below the 416 px toolbar (the best position left); the transient toast covers that strip (21E.2 toolbar) |
| 390×844 phone | button at 672–716, under the 716 px toolbar | button at 728, just below it; the transient toast covers that strip (21E.2 toolbar) |

Toast (V1), measured on `9794b26`: 16 px / 26.4 px everywhere (before: 14 px / 18.2 px); always inside the viewport; no hidden
overflow.

| Viewport | Fixture title (height, lines) | 120-character section title (height, lines) |
|---|---|---|
| 1280×900 | 58 px, 1 | 71 px, 2 |
| 853×600 @1.5 | 58 px, 1 | 71 px, 2 |
| 640×450 @2 | **62 px, 1** | **62 px, 1** (≤ 90 px target) |
| 390×844 phone | 71 px, 2 | 97 px, 3 (before the title shortening: 150 px, 5 lines) |

axe-core 4.10.2 on the toast region (WCAG 2.0 / 2.1 / 2.2 A + AA): 0 violations at every viewport, before and after.
«تراجع» after each deletion restored `q1 q2 q3 q4` in order. No page errors.

**Mutation proof:** the whole campaign (§6, M1–M55, including M38–M55 for R1 / V1 / F3) ran on `9794b26`, one mutant at a
time with nothing else running: **55 / 55 KILLED**, no timeouts, every mutated file restored byte-for-byte and
sha256-verified, `git status` identical before and after.

**Independent re-check of `02564c1`** (adversarial review: R1 correctness, accessibility / visual, regression, tests; every
finding verified by a skeptic). Confirmed and fixed in `9794b26`: «+ إضافة سؤال / قسم» end-aligned under the toolbar by
`nearest` (phones, 200 %, 150 % during a second deletion); a card centred into the full viewport while the toast's scroll
padding shrinks it; long section titles making the toast tall; the F3 general-instructions test passing for the wrong reason;
missing boundary pins (the 96 px strip, refused «تراجع», «+ إضافة قسم»). One verifier judged the long-title height inherent to
unbounded text rather than a defect; it is handled anyway by the title shortening above.

## 12. Review Fix 2 — single-window self-review of `dd795f3` (NOT an independent approval)

The owner moved to one development window, so the review of the final commits (`02564c1`, `9794b26`, `dd795f3`) that the
independent reviewer had not completed was done **by the implementing window itself**. It is a self-review: it was run as an
adversarial, multi-agent process with no shared state with the implementation, but it carries no independent approval, and
the owner's merge decision should weigh it as such.

**Method (exact head `dd795f3`, production build `dist-dd795f3`, read-only on the main tree):**

| Stage | What ran |
|---|---|
| Code-diff audit, four dimensions | R1 / undo correctness (every call site of the focus and reveal functions traced; 4,000-case property test of `restoreDeletion`); toast accessibility and visual / RTL (WCAG 2.2 AA checks in real Chromium at 1280×900, 640×450 @2, 320×640 and 390×844, forced colours, 1.4.12 text spacing, reduced motion, bidi); regression / scope / governance (every non-builder change, the record's claims against the evidence files, `AGENTS.md` rules); test quality (13 files replayed fail-first, 34 extra mutants, shuffled runs, Chromium cross-checks) |
| Adversarial tests | two isolated worktrees wrote 71 attack tests against the real builder, the toast and the student page (focus never to `<body>`, undo never duplicates, StrictMode, unmount races, graphemes, F3 variants) |
| Real-Chromium probes | the builder at 1280×900, 853×600 @1.5, 640×450 @2, 390×844 and 320×640, reduced and normal motion, pointer and keyboard, forced colours, text spacing; the real pages before (`main` `b8a65f1`) vs after; the F3 harness; the student exam page with and without instructions |
| Verification | every finding judged by two independent skeptics (reproduce; impact and attribution vs `main`), then a completeness critic |

101 agents, 1,979 tool calls, 3 h 51 min. Result: **44 findings survived verification (0 blockers, 3 major, 21 minor, 20 nits
or record inaccuracies), 2 refuted.** The majors, every minor the fix of which is contained, and the record inaccuracies are
fixed in `34b8258`; the rest are deferred with a reason. The accepted F1 toolbar limitation was measured again and is
recorded with its numbers in `docs/enterprise-ux-premium-21e.md` §3.5 together with the whole F1–F20 audit.

**Findings and what was done**

| # | Finding (severity after verification) | Done |
|---|---|---|
| 1 | Closing the toast while a save is running sent focus to `<body>`: the fallback «+ إضافة سؤال / قسم» is disabled while saving and `focus()` on it does nothing (major; breaks the record's own "never `<body>`" claim, not a regression vs `main`) | fixed: a candidate that cannot take focus is skipped; the section, then the toolbar (never disabled) are the fallbacks |
| 2 | A POINTER closing the toast (Chromium focuses × on mousedown, so the toast reported focus inside) scrolled the page back to the deleted item's neighbour, however far the teacher had scrolled (≈ 1,500–8,900 px in the probes) (major) | fixed: the toast reports how it was dismissed; a pointer close returns focus with `preventScroll` only; a keyboard close reveals a hidden target only |
| 3 | A restore or a reveal while the builder is scrolled to its end landed 51–100 px under the toolbar at 175 % / 200 %: the end of the range pushed the stuck toolbar up and the clearance was measured from that displaced edge (major) | fixed: the clearance is never less than the toolbar's resting stuck position (scroller padding + height + 12) |
| 4 | Closing the success toast after «تراجع» re-scrolled a card already on screen (minor) | fixed: the "item is back" path uses the in-place rule |
| 5 | The reveal right after a deletion ran before the toast and its scroll padding existed, so «+ إضافة قسم» could end under the toast at 125–150 % (minor; 2.4.11) | fixed: the room below the builder is reserved at all times; only the scroll padding stays conditional. **Superseded by Review Fix 3 (§13):** the reserve is set before the reveal and kept until the toasts leave, never permanently |
| 6 | The content jumped 112 px when the toast left while the builder was scrolled to its end (minor, ×2) | fixed by the same permanent reserve. **Given up in Review Fix 3 (§13):** the permanent reserve hid «+ إضافة قسم»; a shift of up to 112 px when a toast leaves at the very end is the accepted trade-off |
| 7 | `toastTitle` cut by code point: vocalised titles lost half their letters or a shadda, emoji / flags were split, a format character could precede «…» (minor, ×4) | fixed: grapheme segmentation, a word cut only in the second half (any whitespace), trailing format characters stripped |
| 8 | A Latin title's «…» and punctuation were drawn at the wrong end in the RTL toast (minor) | fixed: the shown title is rendered in `<bdi>` |
| 9 | Whitespace-only titles produced «», the refused-restore message printed «» for an empty title (minor, ×3) | fixed: trimmed titles with the «القسم N» fallback; the refused message says «قسمه» |
| 10 | «تراجع» could store scenario members out of section order when the previous member left the scenario (minor) | fixed in `structuredDeletionUndo.ts`; unit test |
| 11 | Arabic counts for 100+ questions («100 سؤالًا») (nit) | fixed: counts agree with the last two digits |
| 12 | A long display number was shown in full in the toast (nit) | fixed: shortened to 24 graphemes in the visible text only |
| 13 | Toast: the action could run after the toast had already left; a toast shown from a replaced toast's `onDismiss` was dropped; the card had no description for a late visitor (nits) | fixed |
| 14 | Two deletions settled by one commit (not reachable by real input) left the first without a toast (nit) | fixed: the newest record is settled |
| 15 | The announcement said only «اضغط Ctrl+Z» (no Cmd, no route for touch screen-reader users) (nit) | fixed: «Ctrl+Z (أو ⌘Z) أو استخدم زر «تراجع»» |
| 16 | Test gaps: no test that every focus carries `preventScroll`; the restore path's alignment untested; the toast's pause-by-id untested; `toastTitle` and the count phrase branches untested; one order-dependent test; the muted-token test accepting any gap; test titles overclaiming (minor / nits) | fixed: `StructuredExamBuilder.reviewFix2.21e1s2rf2.test.tsx` and the five adopted attack files; `deferredConfirmPrefetched` imports a fresh module per test; `mutedContrast` pins ≥ 1.3:1; the mutation campaign gains M56–M78 |
| 17 | The hidden-attribute guard accepted an override of EQUAL specificity that a later show rule beats in the browser; `:where()` counted as one (minor) | fixed: ties are decided by source order within a sheet; `:where()` counts 0 |
| 18 | Record inaccuracies: "never covers the toolbar" (false at 200 %); "a failed prefetch is retried later" and "no bundle growth"; two claims without an archived evidence file; §7's "after" build was `7733703` (minor / nits) | corrected in §2, §7, §8, §11 |
| 19 | The 21E plan's "additive tokens only" rule was relaxed by this PR for its own `--eb-muted` change (nit, governance) | not a code defect; raised as an **owner decision** in the merge report and marked in the plan |
| 20 | `--eb-muted` darkening narrows the step to body text from 2.18:1 to 1.37:1; disabled / archived roster names differ less from normal ones (nit) | recorded; the hierarchy rests on size and weight; a non-colour cue for disabled roster entries is a 21E.6 item |
| 21 | The focused `<section>` / card has no concise accessible name: a screen reader may read the whole section's control labels (≈ 2.5 k characters) when focus lands there (minor, split verdict) | **deferred to 21E.2** (builder structure; naming every section a landmark needs the toolbar / card rework) |
| 22 | The toast reserve (96 px card, 128 px band) is smaller than the real card at 320 px (124 px) and under 1.4.12 text spacing (122–170 px); «+ إضافة قسم» can end 4 px under the toast there (nit; masked today by the F1 toolbar, which is taller than those viewports) | **deferred to 21E.2 with F1**: size the band from the rendered card |
| 23 | Toast group named only «إشعار» (nit) | fixed by the description (13) |

Refuted: the toast ignoring the explicit motion «on» override (it follows the existing dialog pattern; 21E plan item A-2),
and the prefetch tests' fixed 300 ms wait.

**Fail-first** (the final test files copied into a detached worktree of `dd795f3`): **36 of 129 fail** on `dd795f3` (the
pointer / keyboard, resting-clearance, disabled-fallback, success-toast, grapheme, empty-«», count, scenario-order,
guard-tie and toast-via cases) and the 71 attack tests as handed over fail 33 of 159 there; all pass on `34b8258`.

**Mutation proof:** the whole campaign M1–M78 ran on `34b8258` one mutant at a time with nothing else running: **77 KILLED, 1 equivalent (M57, §6), no timeouts**; every mutated file restored byte-for-byte and sha256-verified, `git status` of `src/`, `api/` and `scripts/` identical before and after. The self-review's 16 survivors were re-planted as M79–M89 (below): 8 killed at once, M84 / M88 after two tests were added in the follow-up commit `c1f69fd` (see the table below), M86 equivalent.

The self-review's own 34 mutants (its test-quality dimension) had 16 survivors; each is accounted for:

| Survivor | What was planted | Now |
|---|---|---|
| B3 | the clearance ignores the scroller's top | killed (M89) by the new scroller-offset test |
| B10 | a «replaced» toast relocates focus | equivalent today: the deletion effect places focus BEFORE the new toast replaces the old one, so `hadFocus` is always false for «replaced» |
| B11 / B12 | the title cut at any space / limit 41 | killed by the Review Fix 2 title tests (M61; the exact-40 / 41 pin) |
| B13 / B14 | «2 أسئلة», «11 أسئلة» | killed by the count test (M80 / M81) |
| B15 | success toast not capped at 4 s | killed (M77) |
| B16 | the 24 px "fits" margin removed | killed (M78) |
| C1 | a plain `focus()` before the `preventScroll` one | killed by the every-focus-carries-preventScroll test (M82) |
| C2 / C3 | a restored card / section focused without `preventScroll` | killed by the restore-path test (M83 / M84; M84 needed the restored-section assertion added in the follow-up commit) |
| C4 | the restored card aligned before the success toast exists (band ignored) | killed by the band test (M85) |
| T1 | blur always resumes the countdown | **survivor with negligible effect** (M86; first recorded here as equivalent — wrong, corrected in Review Fix 3): unit tests cannot see it, but in real Chromium the countdown effect runs between the in-card `focusout` and `focusin`, losing ≈ 3–5 ms per focus move inside the card; the toast never closes while focus is inside |
| T4 | Escape propagates out of the card | killed by «Escape inside the card does not reach a document-level handler» (M87) |
| T5 | a hover carries over to the next toast | killed by «a hover on the previous toast does not pause the replacement» (M88, after the carry-over test was added in the follow-up commit) |
| T6 | the pause not keyed by toast id | killed (M73) |

**Real Chromium after Review Fix 2** (production build of `c1f69fd`; the final code differs from it only by the history
recovery of `0c5536b`, whose probe was re-run on that build — see below; six probe agents + skeptics,
every number reproduced in two passes; 0 page / console errors in every run; `dist-dd795f3` and `main` as references):

| Probe | Viewports | Result |
|---|---|---|
| A — a pointer closing the deletion / success toast after scrolling to the end of the builder | 1280×900, 640×450 @2 | **scrollTop delta 0**, focus on the neighbour / restored card (before Review Fix 2: the page jumped back ≈ 1,500–8,900 px) |
| A — a keyboard close with the neighbour hidden | same | revealed at the toolbar's bottom + 12 (328.1 vs 316; 428.1 vs 416) |
| B — «تراجع» with the builder scrolled to its end (the stuck toolbar pushed up to 303 / 314 / 254 px) | 780×439 @1.75, 640×450 @2, 844×390, reduced and normal motion | restored card at the resting bottom + 12.1 (378.1 / 428.1 / 378.1) and unchanged after the success toast left; on `dd795f3`: 315 / 326 / 266 (51–100 px under) |
| C — deleting the only section | 1024×640 @1.25, 853×600 @1.5 | «+ إضافة قسم» focused, 62 px above the toast, hit-testable |
| D — the toast times out with the builder at its end | 1280×900, 390×844 | scrollTop, scrollHeight, padding (128 → 128) and the elements under three fixed points unchanged (on `dd795f3`: −112 px) |
| E — toast closed (× keyboard / × mouse / Escape) while a 4 s save is running | 1280×900, 390×844 | focus on the `<section>` after the only-question deletion, on the toolbar after the last-section deletion, never `<body>` (8/8) |
| F — copy | 1280×900, 640×450 @2 | a 120-code-unit vocalised title (69 graphemes) shown as 36 whole graphemes + «…» at a word, every mark kept; 40 shown whole, 41 cut; the Latin title's «…» drawn right after «Motion:» inside the `<bdi>`; `aria-describedby` resolves to the message and the accessibility tree carries it as the group's description; whitespace titles → no «» |
| G — R1 under normal (smooth) motion | 1280×900, 853×600 @1.5, 640×450 @2 | page unmoved when the heading is visible; reveals land at the toolbar + 12 after `scrollend` |
| K — forced colours (dark and light) | 1280×900, 640×450 @2 | card, section and both add buttons focused by keyboard show a solid 2 px UA outline; axe 0 violations (one light-scheme colour-contrast hit is an axe artefact: the computed colours are black on white) |
| N — axe on the toast layer, errors | 8 viewports down to 320×640 | 0 violations for the deletion, success, long-title and section toasts; toast heights 58 / 62 / 71–97 / 97–124 px (desktop / 200 % / phone / 320); 0 errors in 35 runs |
| J — persistence | 1280×900 | the `save-exam-artifact` body after delete → «تراجع» → save is byte-identical (apart from `updatedAt`) for a question, a scenario member, a whole section and a sole scenario member |
| L — F1 measured | 640×450 @2, 390×844, 320×640 | see `docs/enterprise-ux-premium-21e.md` §3.5 (44 px toolbar overlap at 200 %; the 41 px strip on the phone; an 800 px toolbar at 320) |
| M — F3 on the real student page | 853×600 @1.5, 640×450 @2 | with instructions: open, panel 153 / 200 px, first heading at y 465 / 509 (below the 450 px fold at 200 % — audit F4, 21E.3); without: collapsed, heading at 312 / 308; on `main` the panel is painted while «collapsed» |
| Real pages before (`main` `b8a65f1`) vs after | 4 viewports, 23 screenshot pairs | 98 identical fields, 65 intended differences (focus targets, kept template text, muted colour, F3, first confirmation 530 → 5 ms); untouched screens pixel-identical apart from the muted colour |

Two further findings came out of the undo / history probes (both outside Review Fix 2's own scope, both minor after verification):

| Finding | Done |
|---|---|
| «تراجع» then Ctrl+Z / ⌘Z re-deletes the restored card that holds focus and leaves focus on `<body>`; Ctrl+Y / ⌘⇧Z brings it back unfocused (8/8). Not a regression — on `main` a Ctrl+Z that removes the focused card behaves the same — but this PR adds the route (focus on the restored card). | **fixed in `0c5536b`:** the builder remembers the item «تراجع» brought back; when the history removes it while focus is lost, its neighbour is focused in place, and when the history brings it back, focus follows it (never on an unrelated exam change). Re-measured on the build of `0c5536b`: after Ctrl+Z / ⌘Z focus on card q3, after Ctrl+Y / ⌘⇧Z on card q2, scroll delta 0, 8/8 runs at 1280×900, 853×600 @1.5 (normal motion), 640×450 @2 and a mac UA |
| A confirmed bulk delete returns focus to its opener, which unmounts with the bulk bar, so focus lands on `<body>` (pre-existing: identical on `main`; the single-deletion toast is not involved) | **deferred to 21E.2** (bulk-action bar rework); recorded in §10 |

Also measured, by design and recorded as limitations: a modal dialog (bulk-delete confirm, bank picker) does not pause the
toast's countdown and the toast's «تراجع» is unreachable behind it (the toolbar «تراجع» / Ctrl+Z remain); an image generated
for a question deleted while its request was pending is discarded, and «تراجع» brings the question back without it (as §10
already says); a «تراجع» while the request is still pending restores the card with its pending state and the image lands.

**Still not run — stated as limitations:** no real assistive technology (NVDA, JAWS, VoiceOver, TalkBack: only the Chromium
accessibility tree and the live region's DOM were checked); no Firefox or WebKit (`:has()`, `scroll-padding` with
`scrollIntoView`, `preventScroll` are all baseline features there, but unmeasured); no real devices.

## 13. Review Fix 3 — independent review of `9aa0b83` (owner-directed, targeted)

An independent, read-only review of `9aa0b83` (five code / test audits, three real-Chromium probes, two skeptics per finding where
completed; stopped early by the owner for resource reasons, all completed results preserved) returned **DO NOT MERGE** for one
confirmed regression vs `main`, plus smaller defects with the same root cause. Fixed here, nothing else changed:

| Finding (confirmed by two skeptics) | Fix |
|---|---|
| **The permanent toast reserve (RF2 `34b8258`) pushed the sticky toolbar over «+ إضافة قسم» at the end of the builder with no toast** — 0 px visible / not hit-testable at 853×480 (150 % on 720p), 731×514 (175 %), 640×450 (200 %) and 390×844, Tab focus landing on a fully hidden control (WCAG 2.4.11); `main` shows it | the reserve exists only while a toast is shown or a deletion / restore has reserved it for its reveal (`[data-toast-reserve]` on the scroller, set before the reveal, released when the toasts leave or the builder unmounts) |
| **A later Ctrl+Y stole focus and scrolled ≈ 4,100–5,400 px**: after «تراجع» → Ctrl+Z, the teacher moved on; Ctrl+Y pulled focus back to the restored item | the recovery moves focus only when it was lost, or while focus still sits on the neighbour the recovery itself chose |
| Ctrl+Z pressed INSIDE the deletion toast brought the item back but did not arm the recovery: the next Ctrl+Y dropped focus to `<body>` | every route that brings the deleted item back (Ctrl+Z inside / outside the toast, the toolbar) arms it |
| The «تمت استعادة …» toast stayed after Ctrl+Z removed the item again | it leaves with its item |
| Record: M86 called equivalent; §10 out of date; an RF2 comment ("one Tab stop away") wrong | corrected (§6, §10, §12 T1, the comment) |

Deliberate trade-off: Review Fix 2's "no content jump when a toast leaves at the very end of the builder" is given up — releasing the
reserve then shifts the content by up to 112 px — because keeping the reserve is exactly what hid «+ إضافة قسم».

**Fail-first:** `src/StructuredExamBuilder.reviewFix3.21e1s2rf3.test.tsx` (8 tests) — **8 of 8 fail on `9aa0b83`**, 8 pass after the
fix. `StructuredExamBuilder.undoToast.21e1s2` pinned the RF2 permanent rule; its CSS assertion now pins the scoped rule (owner-directed
behaviour change; the reserve's lifetime is pinned by the new file). Focused suites (builder, toast, deletion undo, F3 / student
page, design-system guards, shared confirm, prefetch, overlay layers): 44 files, 510 tests passed.

**Mutation (only the new invariants; the campaign was not repeated):** M92 permanent reserve back · M93 reveal before the reserve
exists · M94 the recovery takes focus from anywhere · M95 the Ctrl+Z route not remembered · M96 the success toast outlives its item —
**5 / 5 KILLED**, files sha256-restored.

**Real Chromium** (production builds; `main` `b8a65f1`, before `9aa0b83`, after = this fix; reduced motion; the fixture of the
review's clearance probe: 2 sections, 6 questions; probe `/tmp/claude-0/sp/probes/rf3/probe.mjs`; 0 page / console errors in every run):

| Viewport | End of the builder, no toast: «+ إضافة قسم» visible px / hit-testable / Tab reaches it with scroll Δ (main → before → after) | Ctrl+Y after «تراجع» → Ctrl+Z with focus moved to another card (before → after) | Ctrl+Z inside the toast → Ctrl+Y (before → after) |
|---|---|---|---|
| 853×480 @1.5 | 50 ✓ Δ0 → **0 ✗** Δ0 → 50 ✓ Δ0 (toolbar 16–366, as `main`) | focus stolen, page −4,128 px → focus kept, card unmoved | `<body>` → neighbour card |
| 731×514 @1.75 | 50 ✓ → 12.3 ✓ → 50 ✓ | stolen, −4,161 px → kept | `<body>` → neighbour |
| 640×450 @2 | 10.3 ✓ → **0 ✗** (toolbar −86…314, «رجوع / تراجع / إعادة» above the top) → 10.3 ✓ (toolbar 16–416) | stolen, card moved 5,454 px → kept, card top −273 → −273 | `<body>` → neighbour |
| 390×844 | 50 ✓ → **0 ✗** → 50 ✓ | stolen, card moved 6,588 px → kept, card top −178 → −178 | `<body>` → neighbour |

Unchanged on the fix (same probe): delete by keyboard → the next card; «تراجع» (keyboard) → the restored card; Ctrl+Z → its
neighbour; Ctrl+Y → the item again; the success toast is shown after «تراجع» and leaves after a Ctrl+Z that removes the item; a toast
at the end still reserves its room (padding 128 px while shown) and, after ×, the end is `main`'s again («+ إضافة قسم» 50 / 9.5 px,
hit-testable; content shift −112 px, the trade-off above).

Validation on the fix: lint 0 errors / 125 warnings (= baseline); `tsc -b` and the production build clean; bundle guard passed
(initial JS 110.5 KB of 125, CSS 35.0 KB); `git diff --check` clean. Exact-head CI: see the PR.
