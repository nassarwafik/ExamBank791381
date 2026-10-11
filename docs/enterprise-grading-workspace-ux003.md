# UX-003 — Enterprise teacher grading workspace (design record)

Source: `Problems.pdf` pages 2–4 (tracker: `docs/tadris-enterprise-problems-tracker.md`, UX-003). Scope: the teacher's
manual-review screen (`src/AssignmentReview.tsx`), presentation only. **No grading, authority, API contract or stored document
changed.**

## What the teacher gets

| Need (PDF) | Delivered |
|---|---|
| Hard to locate the questions awaiting manual grading | A prominent **«يحتاج إلى تصحيح يدوي (n)»** filter plus الكل / تم التصحيح / إجابة صحيحة / إجابة خاطئة / إجابة جزئية, each with a live count; **«⏳ التالي بانتظار التصحيح»** jumps (with wrap-around) to the next unresolved question; the summary shows pending / graded question counts. |
| Hard to review the answer | Each question card carries a **text + icon state** («إجابة صحيحة ✓», «إجابة خاطئة ✗», «إجابة جزئية ◐», «بانتظار التصحيح اليدوي ⏳», «لم يُجب الطالب —») and the computed mark `x / max`; choice questions (multiple choice, true/false) render **exam-style**: every option as the student saw it, the student's pick and the correct option marked in text (`✓ اختيار الطالب — صحيح`, `✗ اختيار الطالب — خطأ`, `✓ الإجابة الصحيحة`); the reference answer of a choice question reads «الخيار 3 — الراوتر» instead of raw JSON; free-text answers render as paragraphs. |
| Scrolling through the whole paper | A sticky **navigator rail** (desktop ≥ 1024 px) / a disclosure above the questions (tablet, phone): one button per question with its state icon, the current question highlighted, filtered-out questions dimmed; a jump scrolls the card into view and focuses it (switching back to «الكل» when the target is filtered out). Previous / next move through the visible questions; the position reads «السؤال k من n المعروضة (N إجمالًا)». |
| Losing work | Typed marks / rubric selections / comments / general feedback that differ from the server state show **«● تعديلات غير محفوظة»**; each such question reads «(غير محفوظ)»; closing (button, «إلغاء», Escape) asks first with the project ConfirmDialog («البقاء في التصحيح» / «الخروج دون حفظ»); the browser warns on refresh while dirty. Nothing is auto-saved. |

## Safety (unchanged, verified)

- States derive **only** from the server projection: `autoGrade` (the attempt's canonical questionGrade after the shared
  rebuild; `manualReview` is false once an override exists), `manualScore`, `studentAnswer`. A pending manual review is never
  shown as incorrect. A typed mark is reported as a *provisional* state; it never changes the counts the server owns.
- The reference answer comes from the teacher-only `expectedAnswer` of `GET /api/assignment-review` (`requireBuilderAuth`, class
  / historical-ownership checks). The student API (`student-submission`) is untouched and still exposes no per-question key.
- The save body of `POST /api/assignment-review` (`saveReview`, overrides keyed by question / composite child key, rubric awards,
  teacher feedback) is byte-identical; clamping, rubric binding, CAS write, `rebuildAttemptGrades`, audit, notification and
  achievement paths are untouched. All 21 pre-existing suites that render `AssignmentReview` (coding, rubric, composite,
  SmartSim, network CLI, visual, parametric, cloze, chart, scenario, overlays, panels) pass unchanged.
- Layering: the review modal uses `--eb-z-overlay` (PR A) so its confirmations paint on top (Chromium hit test).

## Code

- `src/review/reviewQuestionState.ts` — pure: `reviewQuestionInfo`, filters, counts, `nextMatching`, `correctOptionIndex`,
  `choiceKeyText`. Tests: `src/review/reviewQuestionState.test.ts`.
- `src/review/ReviewWorkspaceParts.tsx` — `ReviewStatusBadge`, `ReviewFilterBar`, `ReviewNavigator`, `ChoiceAnswerExamView`.
- `src/AssignmentReview.tsx` — workspace state (filter, current question, loaded baseline → dirty), the close guard, the
  toolbar, the layout grid and the navigator; the per-question review views are unchanged.
- `src/review-workspace.css` — token-only, RTL-first styles; ≥ 1024 px grid with a sticky rail, < 1024 px disclosure.
- Tests: `src/review/reviewWorkspace.ux003.test.tsx` (happy-dom, through the real component and a fake API).
- Real Chromium: `scripts/check-grading-workspace-browser.mjs` + `browser-harness/grading-workspace.*` (in-page review API
  with the real projection shape): 32/32 — desktop 1280, laptop 1366×768, tablet 820×1180, phone 390×844 touch.

## Review Fix 1 (independent review of head `0908235`)

**Finding 1 — unsaved edits on attempt switch / reload.** The attempt tabs called `load(n)` directly, and every same-attempt
reload (after a save, a coding regrade, the evidence block's refresh) rebuilt the inputs from the server and reset the baseline —
both discarded typed marks silently. Fail-first (`src/review/reviewWorkspace.ux003.test.tsx` › RF1): on `0908235` the switch
showed no confirmation (`Unable to find role="dialog" … تعديلات تصحيح غير محفوظة`). Fix:
- `requestAttempt(n)` — the tabs go through the same guard as closing: with unsaved edits the project `ConfirmDialog` asks
  («البقاء في هذه المحاولة» keeps the attempt *and* every edit; «الانتقال دون حفظ» loads the other attempt); without edits the
  switch is immediate. Nothing is auto-saved.
- `load()` of the **same** attempt merges instead of replacing: `mergeUnsavedEdits(prevBaseline, local, fresh)` (pure,
  `src/review/reviewQuestionState.ts`) keeps every key whose local value differs from the baseline it was loaded from and takes
  the server's value elsewhere; the baseline becomes the fresh server state, so `dirty` stays true exactly for the kept edits.
  A different attempt starts clean.
- A **successful save commits** the local state (baseline = saved snapshot) before the authoritative reload, so the dirty flag
  resets accurately and a later switch does not ask. A failed save changes nothing (the inputs stay dirty).
- The review API contract is untouched.

**Finding 2 — misleading «تم التصحيح».** "Graded" meant "not pending", lumping automatically evaluated questions with saved
teacher overrides. The state engine now reports a **review mode** on its own axis, separate from the answer outcome:

| `mode` | Meaning | Label |
|---|---|---|
| `pending` | awaiting manual review (`autoGrade.manualReview`) | بانتظار المعلم |
| `auto` | automatically evaluated, no override stored | تصحيح آلي |
| `manual` | a teacher override is **stored** on the server (`manualScore` / rubric) | تصحيح يدوي محفوظ |
| `draft` | the teacher typed a value that differs from what is stored — nothing saved yet | تعديل غير محفوظ |

Every card shows a mode chip (`rv-mode`) next to the outcome badge; the filters are الكل / يحتاج إلى تصحيح يدوي / تم تصحيحه
يدويًا / مُصحَّح آليًا / تعديلات غير محفوظة / إجابة صحيحة / إجابة خاطئة / إجابة جزئية; the summary cards and the navigator split
the counts by mode (they partition the questions); the navigator's accessible names carry the mode. Outcome statuses
(صحيحة / خاطئة / جزئية / لم يُجب / بانتظار) are unchanged. Tests: `reviewQuestionState.test.ts` › "review mode (RF1)" and
"mergeUnsavedEdits"; `reviewWorkspace.ux003.test.tsx` › RF1 (attempt switch guard, cancel keeps edits, confirm switches, save
resets the baseline; modes, counts, filters, draft transitions). Chromium: the harness now serves two attempts with per-attempt
overrides and certifies the guard dialog on top of the review, cancel / confirm, the clean switch, and the mode chips / counts.

## Not in scope / follow-ups

- Specialised review views (coding evidence, SmartSim, 3D, mesh, network, charts) keep their existing teacher renderers; they
  gain the state badge, mark line, filter and navigation but no new visualisation.
- A one-question-at-a-time "focus" mode was not added: the filter + navigator + next-pending already avoid scrolling the
  whole paper, and the list keeps every specialised review test valid.
- Student-side display of manual marks (`FEATURE-004`) is PR C.
