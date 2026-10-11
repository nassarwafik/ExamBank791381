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

## Not in scope / follow-ups

- Specialised review views (coding evidence, SmartSim, 3D, mesh, network, charts) keep their existing teacher renderers; they
  gain the state badge, mark line, filter and navigation but no new visualisation.
- A one-question-at-a-time "focus" mode was not added: the filter + navigator + next-pending already avoid scrolling the
  whole paper, and the list keeps every specialised review test valid.
- Student-side display of manual marks (`FEATURE-004`) is PR C.
