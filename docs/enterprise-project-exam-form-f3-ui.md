# Phase F3-UI — Project exam form: the teacher's screens and the student's result

## Problem

F3 (`docs/enterprise-project-exam-form-f3.md`) shipped the server side of the review. No screen used it: a teacher could
not hide a question, see who submitted, read an answer, rate a section, return a form or approve it, and a student with an
approved form saw only the mark. This phase adds the screens. It changes no route and no stored document.

## Scope

| In this phase | Not in this phase |
|---|---|
| Before the first open: choose the questions to hide for the class | Student images — F4 |
| The class's forms: every student's state, progress, ratings, mark | Files, PDF export, the 883589 and 899373 forms — F5 |
| One student's review: answers, evidence and keys of the auto-marked questions, section ratings and notes, save, return, approve, take an approval back | Merging the form's mark into the project score (owner decision 2) |
| The student's result: each section's level and note, the general note, right / wrong per auto-marked question | A filter or search in the class list |

## Teacher

Everything lives in the form's control on the project dashboard («لوحة المشروع», `ProjectExamFormControl`), in place — no new
page, tab or route.

**Hiding questions** (`ExamFormHidePicker`, only while the form was never opened and the class is not read-only).
«اختيار الأسئلة» lists the 16 sections as collapsible groups with one checkbox per question (ticked = asked). The last
shown question of a section cannot be unticked. The control and the confirmation of «فتح الاستمارة للصف» state how many
questions will be hidden and that this cannot change after the first open. The list is sent only with that first open;
afterwards the picker is gone and the control shows the stored count.

**The class's forms** (`TeacherExamFormList`, offered once the form was opened, also on a read-only class).
«متابعة الاستمارات» opens the list under the control: the counts per state, then one row per student — a submitted form
first, then returned, draft, not started, approved; by name inside a state. A row shows the state, «أجاب عن X من Y»,
«قُدّر R من N قسمًا» and the mark of an approved form. «تقدير» (submitted) or «عرض» opens the review; a student who never
opened the form has no button.

**One student's review** (`TeacherExamFormReview`).

- One section at a time, like the student's page. Each answer is shown with the student's own input, disabled; an image or
  file question says it is checked from the student's book and project file; an unanswered question says so.
- An auto-marked question shows «إجابة صحيحة» / «إجابة خاطئة» / «بلا إجابة» and its key in words. The header counts them.
- Under the section's questions: its weight, the rubric levels as radio buttons with their descriptions, «مسح التقدير»,
  and a note for the student. A chip in the section row shows each section's level or «بلا تقدير».
- «العلامة حسب تقديراتك» appears once every weighted section has a level. It is the page's own sum, for the teacher's eye;
  the stored mark is the server's, computed at the approval.
- Actions on a submitted form: «حفظ التقديرات» (sends only the sections that changed), «إعادة للتعديل» (a second step asks
  for the note the student will see), «اعتماد الاستمارة». On an approved form: «إلغاء الاعتماد».
- The approval saves pending ratings first. If a section is still unrated the approval is **not sent**: the sections are
  listed and each leads to its rating. Otherwise one confirmation shows the mark and what the student will see.
- A draft, a returned form, an approved form and a read-only class show the answers with every rating control disabled
  and the reason. Leaving with unsaved ratings asks first.

**A stale page.** When a write is refused with `409 REVIEW_STALE` (the student submitted again, or the form was rated from
another page), the form is read again. What the server stores now is shown, and only the sections changed on this page
keep what was typed here, so a rating saved elsewhere is never cleared by this page's older copy. The teacher checks and
saves again.

## Student

`StudentExamForm`, an approved form only (the server sends `result` for no other state):

- a result panel: the mark, the teacher's general note, and one row per section — its level in words and as `level / top`,
  its points out of its weight, and the teacher's note. A row's title opens that section;
- on a section's page: «تقدير هذا القسم» with the level and note, and «إجابة صحيحة» / «إجابة خاطئة» / «لم تُجب» on each
  auto-marked question.

No answer key is shown or received.

## Safety

- **The server decides.** Every control here is presentation. A hidden button never replaces a refusal: the route's
  capability, tenancy, membership, state and revision checks (F3) are unchanged and tested there.
- **Grading safety.** The page never sends an approval for a form with an unrated section, never rates a form that was
  not submitted, and never clears a rating it did not change. The mark shown before the approval is labelled as the
  page's own.
- **Answer keys** are rendered only in the teacher's review, from the teacher-only `exam-form-student` read. The picker
  (`exam-form-questions`) and the student's result carry none.
- **Styles.** Class selectors only, added inside the existing form blocks of `projects-pro.css` and `studentportal-pro.css`
  (before the guarded learning-materials block). No universal sibling selector (the F2-UI visual-gate finding).

## Files

| Added | |
|---|---|
| `src/projects/examForm/teacherTypes.ts` | The teacher's response types, the state badges |
| `src/projects/examForm/ExamFormHidePicker.tsx` | Choosing the hidden questions |
| `src/projects/examForm/TeacherExamFormList.tsx` | The class's forms |
| `src/projects/examForm/TeacherExamFormReview.tsx` | One student's review |
| `src/projects/ProjectExamFormReview.f3ui.test.tsx` | The teacher's screens over the real handlers |

| Changed | |
|---|---|
| `src/projects/ProjectExamFormControl.tsx` | the picker, the hidden count, «متابعة الاستمارات» and the panel |
| `src/projects/examForm/StudentExamForm.tsx` | the result panel, the section's level, the verdicts |
| `src/projects/examForm/QuestionInput.tsx` | the «image upload later» note of a `cli` question only on a writable form |
| `src/projects-pro.css`, `src/studentportal-pro.css` | the styles |
| `src/projects/examForm/StudentExamForm.f3.test.tsx` | the student's result |

## Tests and proof

`src/projects/ProjectExamFormReview.f3ui.test.tsx` (18 tests, the real `project-tracker` and student handlers on the
in-memory container): the picker (count, confirmation, frozen form, last question, read-only); the list (offered after the
first open, order, counts, buttons, mark); the review (read-only answers, right / wrong / unanswered and the key; a rating
saved for its section only and invisible to the student; clearing; an approval with unrated sections not sent; the last
rating saved with the approval, the confirmation's mark, lock and take-back; cancelling; return with a note; a stale
page; a draft; a read-only class; leaving with unsaved ratings). `StudentExamForm.f3.test.tsx` (+2, 6 in total): the result
panel, the section's level, the verdict, no key; no panel before the approval.

**A defect found by a test before the first commit.** The first version kept the page's whole copy of the ratings after a
stale write, so the next save sent `null` for a section rated from another page and cleared it. «the form changed since the
page read it…» failed on it; the page now keeps only its own changed sections (above). It was never pushed.

**A guard failure found by the first full run.** `src/teacher/saveLabels.guard.21e2.test.ts` refused the status text
«تغييرات غير محفوظة» written in `TeacherExamFormReview.tsx`: teacher save vocabulary lives in one table. The page now
renders `SAVE_STATE_LABELS.dirty`; the guard is unchanged. The focused runs had not included that guard.

Fail-first is not applicable: this phase adds behaviour and fixes no shipped defect.

Mutation campaign (31 mutants in `TeacherExamFormReview.tsx`, `ProjectExamFormControl.tsx`, `ExamFormHidePicker.tsx`,
`TeacherExamFormList.tsx` and `StudentExamForm.tsx`; run alone, one at a time, each file restored byte-for-byte by
SHA-256): **31 KILLED, 0 survived, 0 timeouts.** Three assertions were tightened before the run because their mutants
would have survived: the list's order (the test's names now differ from the order by state), the exact content of the
save after a stale write, and the student's verdict being «right».

| Group | Mutants | Killed by |
|---|---|---|
| Stale page (keeps the whole old copy and clears a rating saved elsewhere; drops the rating typed here) | 2 | «the form changed since the page read it…» |
| Approval (offered with unrated sections; no confirmation; the last rating not saved first; the previewed mark ignores the weights) | 4 | «an approval with unrated sections is not sent…», «cancelling the approval's confirmation…», «the last rating is saved with the approval…» |
| Saving (every section sent instead of the changed ones; a cleared rating not sent; no revision) | 3 | «the form changed since the page read it…», «a rating and its note are saved for that section only…» |
| Who may act (a read-only class gets the actions; a non-submitted form can be rated; the review not told it is read-only) | 3 | «a read-only class shows the submitted form without any action», «a form that was not submitted is shown without any rating or action» |
| Return and take-back (the note not sent; the return on the first click; take-back without asking; leaving without asking) | 4 | «returns the form with a note…», «cancelling the return sends nothing», «the last rating is saved with the approval…», «leaving with an unsaved rating asks first…» |
| Evidence (right shown as wrong; unanswered shown as wrong; the key not shown) | 3 | «shows the answers read-only…», «a wrong and an unanswered auto-marked question are told apart» |
| Hiding (the list not sent; the picker on a read-only class; the picker after the first open; the confirmation silent; the last question hideable; tick inverted) | 6 | the «hiding questions before the first open» tests |
| The list (offered before the form was opened; ordered by name only; a button for a student who never opened the form) | 3 | «is offered only once the form was opened, lists every student…» |
| Student result (right shown as wrong; another section's level; the general note dropped) | 3 | `StudentExamForm.f3.test.tsx` «the result of an approved form…» |

**Real browser (local, not a committed gate).** The production build next to the real API in process (the harness of the
browser gates), Chromium at 390 × 844 (touch) and 1440 × 900, both the teacher and the student: 41 checks passed — the picker
counts and the frozen form has 90 questions; the list's order; the review's evidence and key; no page scrolls sideways on
the picker, the list, the review's table and command sections, the approved review, the student's result and section
(seven pages per width); every button, field and group header of the control is at least 44 px tall on touch; the
previewed mark, the confirmation and storage agree on 94.5; the student's card and result show the mark, the notes and 16
sections, and no key. Two cosmetic defects seen in the screenshots were fixed before the commit («مسح التقدير» stretched
across the rating box; the wording of the hidden-questions count).

**Visual regression (local run of the UX-R19b gate).** Base `ff4117af` build against this branch's build, phone viewport,
light and dark: 79 captures compared in each theme, 0 changed, GATE PASS. Tablet and desktop run in CI.

## Reconciliation with F1b (the 883589 form)

`main` moved from `ff4117af` to `d9f7dbfc` during this phase: another window merged the 883589 exam form (F1b, data and a
registry flag). The branch took it by a normal merge commit with no conflict. The review path of F3 and these screens were
written and tested on the 794589 form only, so one test was added for the union of both sides:
`api/tests/project-exam-form-review-all-forms-f3ui.test.js` runs, for **every** project that ships a form, the whole path
over the real handlers — hide an auto-marked question, submit a complete form of right answers, the evidence, the ratings,
the approval (mark 100) and the student's result without a key. It passes for 794589 and 883589 with no code change.
The screens read the sections, kinds and rubric from the response and hold no project-specific text.

## Reconciliation with F4 (student images, server side)

`main` moved again, from `d9f7dbfc` to `7cef9488`: the other window merged F4 (a class may attach images to its answers,
once its teacher switches that on; no screen can switch it on before F4-UI). Merge commit `b22527d9`; one conflict, the
roadmap table of `docs/enterprise-project-exam-form-f1.md`, resolved as the union of both sides' rows. No code conflict:
F4 changed API files this phase does not touch.

One follow-up, because both sides meet on the review page: an answer may now carry `images` references. The review does not
display them (that is F4-UI's «the images in the teacher's review»), and it must not pass over them: a question whose
answer has images says «أرفق الطالب صورًا لهذا السؤال (العدد: N)» instead of «يُفحص من كتاب الطالب وملف مشروعه». Tested with
stored references («images a student attached (F4) are counted on the question…»).

## Known limitations

- The list has no filter or search; a class of 16–35 students is one screen or two.
- The review's ratings are saved by a button, not as the teacher types. Leaving with unsaved ratings asks first; closing
  the browser tab does not.
- After a return, the ratings given to the earlier answers stay (F3 limitation): the teacher re-reads the corrected
  sections before approving.
- Images a student attached (F4) are counted on their question and, since F4-UI, displayed under that count
  (`docs/enterprise-project-exam-form-f4-ui.md`). File answers
  are not in the form yet (F5): those questions are rated from the student's book and file.
