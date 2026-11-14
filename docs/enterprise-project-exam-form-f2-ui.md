# Phase F2-UI — Project exam form: the student's page and the teacher's control

## Problem

F2 (`docs/enterprise-project-exam-form-f2.md`) shipped the server side of the student's answers. No screen used it: a
teacher could not open the form for a class and a student could not see or fill it. This phase adds both screens.

## Scope

| In this phase | Not in this phase |
|---|---|
| The form's card on the student's project page, and the form page: sections, inputs per question kind, autosave, resume, submit | Following students' answers, marking, returning a form, approval — F3 |
| The teacher's control on the project dashboard: open / close the form for the class | Student images — F4; files — F5 |
| One additive field in the student tracker response (`examForm`) | |

## Student

**The card.** `GET /api/student-project-tracker` now carries, per project, `examForm: { title, state, status, started,
answered, total }` — only where the teacher opened the form for the class that serves the project
(`exam-form-service.studentFormSummary`). No question, answer or key. A stored form that cannot be read hides the card and
never breaks the project page. The card (`StudentExamFormCard`) sits under the evaluation card, makes no request of its
own, and offers «ابدأ الاستمارة» / «أكمل من حيث توقفت» / «عرض الاستمارة».

**The form page** (`StudentExamForm`) replaces the project view while it is open and returns to it with fresh counts.

- One section at a time; the 16 sections are a navigation row, each marked «مكتمل» when none of its required questions
  is missing. The page opens on the first section that still has a required question (resume).
- Inputs are native controls (`QuestionInput`): text, paragraph, a left-to-right monospace box for commands, a table
  with add / remove row, radio and checkbox groups, a select per matching item, «أعلى» / «أسفل» buttons for ordering, a
  1–5 radio row per scale item. Image and file questions show a notice and no input; a `cli` question with an image part
  takes its text now.
- Progress and the missing list are the **server's** (`progress`), returned by every save.
- A submit that cannot succeed (required questions missing, nothing pending) lists the sections to complete without a
  confirmation; otherwise one confirmation, then the form is a read-only record.

**Autosave** (`useExamFormDraft`). The existing save-state model (`studentSaveState.ts`) and its indicator
(`SaveStatus`) are reused unchanged.

| Event | Behaviour |
|---|---|
| The student edits | The answer shows at once; after 800 ms without another edit one save sends the changed questions with the page's revision. One save at a time; an edit made meanwhile goes out with the next. |
| Network failure or 5xx | The edits stay pending; three retries (1 s, 2 s, 4 s), then «تعذر حفظ التغييرات» with a manual retry. Back online triggers a save. |
| `409 DRAFT_STALE` (another device or tab saved) | The form is read again; the edits still pending here are kept on top (one question = one answer) and sent on the new revision. Both devices' answers survive. |
| `409` submitted / closed, `403` archived | The form becomes read-only; pending edits are dropped; the reason is shown. Saved answers stay. |
| `400` | Shown; never retried. |
| Submit | Pending edits are saved first; the submit goes out only when nothing is pending. |
| Leaving the page with an unsent edit | One last save is sent; the browser's leave warning is armed while edits are unsaved. |

## Teacher

`ProjectExamFormControl` on the project dashboard («لوحة المشروع»), for a project that ships a form: the state badge
(«لم تُفتح بعد» / «مفتوحة للطلاب» / «مغلقة»), the form's size, and one action — «فتح الاستمارة للصف» or «إغلاق الاستمارة»
— behind a confirmation that says what happens (the questions are fixed for the class at the first open; a close keeps
every saved answer). The action is hidden on an archived class and for a teacher without `projects.tracker.manage`
(the dashboard's existing `readOnly`); the server enforces both regardless. When the state cannot be read the control is
not shown.

## Files

| Added | |
|---|---|
| `src/projects/examForm/types.ts`, `api.ts`, `useExamFormDraft.ts`, `QuestionInput.tsx`, `StudentExamForm.tsx`, `StudentExamFormCard.tsx` | the student's form |
| `src/projects/ProjectExamFormControl.tsx` | the teacher's control |
| `src/projects/examForm/StudentExamForm.f2ui.test.tsx`, `src/projects/ProjectExamFormControl.f2ui.test.tsx`, `api/tests/project-exam-form-summary-f2ui.test.js` | tests |

| Changed | |
|---|---|
| `src/projects/StudentProjectPanel.tsx` | renders the card and, while open, the form (still exactly one request of its own) |
| `src/projects/ProjectDashboard.tsx` | renders the control |
| `src/studentportal-pro.css`, `src/projects-pro.css` | token-only styles (`.eb-sp-form*`, `.eb-project-exam-form*`) |
| `api/src/functions/student-project-tracker.js`, `api/src/lib/project-tracker/exam-form-service.js` | the additive `examForm` summary |

No new lazy chunk (the form lives in the already-lazy student portal chunk), no new dependency, no workflow change.

## Gates

- **Visual regression (C15).** No captured page changes: the student project view is not among the captured pages, and
  the capture harness answers an unknown tracker resource without `examForm`, so the dashboard renders no control there.
  `docs/ux-r/visual-changes.json` is unchanged.
- **Projects in Chromium (C16).** No new browser check script; the existing ones run unchanged in CI.
- **Source guards.** `StudentProjectPanel.tsx` keeps one `fetch(` and no POST; both stylesheets stay token-only with their
  breakpoint and logical-property rules; no emoji, native dialog or tab roles added.

## Tests and mutation proof

All three test files drive the **real** API handlers against the in-memory container.

- `StudentExamForm.f2ui.test.tsx` (18): the card hidden until the form is opened, its counts and labels; the form in place
  of the project and back; autosave of a typed answer and the exact request body; resume of the saved value and of the
  section; batching of quick edits; closed kinds stored as chosen; another device's save and this page's edit both kept;
  retry after failures; leaving right after typing; incomplete submit without a confirmation; complete submit with one;
  an edit made just before submitting saved first; cancel; a closed form; a form closed while typing; a form never opened.
- `ProjectExamFormControl.f2ui.test.tsx` (6): state, open after confirmation, close, cancel, read-only, no form / unreadable
  state, a refused action.
- `project-exam-form-summary-f2ui.test.js` (4): the summary absent until opened, per student, without questions or
  answers, and an untrusted stored form never breaking the project page.

Fail-first is not applicable: new behaviour, no defect fixed.

Mutation campaign (23 mutants across the draft hook, the API client, the form page, the card, the teacher control, the
summary service and the tracker route; run alone; files restored byte-for-byte by SHA-256): **23 KILLED, 0 survived,
0 timeouts.** First run: 22 killed and 1 survivor — «the form does not resume where the student stopped» — no test opened a
partly filled form; the resume test was added and the campaign re-run in full.

| Group | Mutants |
|---|---|
| Draft durability (stale save not reconciled, failed request loses edits, old revision kept, submit without saving first ×2, leaving drops the edit, no retry, no scheduling, revision missing from the request) | 9 |
| Locks and flow (submitted / closed form editable, confirmation skipped, incomplete form asks anyway, no resume, card offers editing after submit) | 6 |
| Teacher control (no confirmation, action on a read-only class, shown without a form, close sent as open) | 4 |
| Summary (unreadable form breaks the page, another student's answers counted, answers carried, sent for a never-opened form) | 4 |
