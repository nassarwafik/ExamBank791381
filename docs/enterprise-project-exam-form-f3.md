# Phase F3 — Project exam form: the teacher's review, server side

## Problem

After F2 and F2-UI a student fills and submits the form, and nothing happens next: the teacher cannot see who submitted,
read an answer, rate a section, send a form back or approve it, and the student never gets a mark. The owner's first
decision (the teacher may hide a question before opening the form) was also still open.

This phase is the **server side** of the review, as F2 was for the answers. The teacher's screens and the student's result
page are the next phase (F3-UI); the student's page only learns the two new states here, so a returned form can be
edited and an approved one shows its mark.

## Scope

| In this phase | Not in this phase |
|---|---|
| Hide questions at the first open; the list the teacher chooses from | The teacher's screens: the class table, the review page — F3-UI |
| The class list: every student's state, progress, ratings done, mark | The student's result page (section levels, notes, right / wrong per question) — F3-UI |
| One student's form for the teacher: answers, answer keys, evidence of the auto-marked questions, the review | Student images — F4; files, PDF, the other projects — F5 |
| Rate sections, return for correction, approve, take an approval back | Merging the form's mark into the project score (owner decision 2: shown beside it, not merged) |
| What the student is sent after a return and after an approval | |
| The student's page and card tolerate «returned» and «approved» | |

## States

```
            saveDraft            submit                   approve
(none) ───────────────▶ draft ─────────▶ submitted ──────────────────▶ approved
                                          ▲   │  ▲                        │
                              submit      │   │  └────── unapprove ───────┘
                                          │   ▼ return
                                        returned   (the student edits, then submits again)
```

| State | Student may write | Teacher may |
|---|---|---|
| `draft` | yes | nothing (no rating, no return, no approval: `409 FORM_NOT_SUBMITTED`) |
| `submitted` | no (`409 FORM_SUBMITTED`) | rate, return, approve |
| `returned` | yes; a submit makes it `submitted` again | nothing until the student submits again |
| `approved` | no (`409 FORM_APPROVED`) | take the approval back (`409 FORM_APPROVED` for a rating or a return) |

## Hiding questions (owner decision 1)

`examForm.open` takes an optional `hiddenQuestionIds`. On the **first** open the class's frozen form is the bundled form
without those questions: the student never sees them, they never count in the progress or the evidence, and the answer
route refuses them like any unknown question. The list is stored on the class form and counted in the audit record.

- The sections and their weights do not change, so a section cannot lose every question (`400 SECTION_EMPTY`); an unknown
  id is `400 UNKNOWN_QUESTION`; the reduced form must still pass `validateExamFormTemplate`.
- The form is frozen at the first open: a later open with a non-empty list is `409 FORM_FROZEN`. Answers already saved
  always match the questions the student saw.
- `GET resource=exam-form-questions` lists the bundled questions to choose from (id, prompt, kind, grading, required —
  no key), with `frozen` and the stored `hiddenQuestionIds`. It never creates the class form.

## Teacher routes

All on the existing `api/src/functions/project-tracker.js`, behind its existing dispatch: `GET` asks
`projects.tracker.view`, every action asks `projects.tracker.manage`, the class must be the teacher's own and enrolled in
the project, and an archived class refuses every action (`403`). No new route, no new capability.

| Request | Result |
|---|---|
| `GET resource=exam-form-questions` | the questions the teacher can hide (above) |
| `GET resource=exam-form-students` | `{ state, formVersion, title, counts, students[] }` — per student: `status` (`not_started` / `draft` / `submitted` / `returned` / `approved`), `answered`, `total`, `submittedAt`, `rated`, `toRate`, `mark` (only when approved). No answers. A document of someone who left the class is not listed. |
| `GET resource=exam-form-student&studentId=` | the frozen form **with its answer keys and rubric**, the student's answers, `auto` (right / wrong / not answered per auto-marked question and the counts), `review`, `unrated`, `result` |
| `action=examForm.review` `{ studentId, expectedRevision, ratings, generalNote? }` | saves ratings: `ratings = { sectionId: { level, note? } \| null }` for the sections that changed (`null` clears one). All or nothing. Not audited: it is the teacher's working draft until the approval. |
| `action=examForm.return` `{ studentId, expectedRevision, note? }` | `submitted → returned`; the ratings stay. Audited `project.exam_form.return`. |
| `action=examForm.approve` `{ studentId, expectedRevision }` | `submitted → approved`; the mark is computed and stored. Audited `project.exam_form.approve` with the mark. |
| `action=examForm.unapprove` `{ studentId, expectedRevision }` | `approved → submitted`; the stored result is removed, the ratings stay. Audited `project.exam_form.unapprove`. |

Errors: `404 NOT_MEMBER` (the student is not in this class), `404 FORM_NOT_OPENED`, `409 REVIEW_STALE` (the document
changed since the teacher's page read it), `409 FORM_NOT_SUBMITTED`, `409 FORM_APPROVED`, `409 FORM_NOT_APPROVED`,
`400 REVIEW_INCOMPLETE` with `missing` (the unrated sections), `503 FORM_UNREADABLE`, `503` on a storage conflict.

Each write is one CAS round on the student's answers document (`mutateJsonWithRetry`), with the class form read and
validated again inside it. Reviewing a **closed** form is allowed: closing stops student writes only.

## The mark

- The teacher rates each weighted section on the form's rubric (0–4 in the 794589 form). A level is a whole number inside
  the rubric; a note is at most 1000 characters.
- `mark = Σ weight × level / top level`, out of 100, two decimals (`computeResult`). It is computed **inside the write that
  approves**, from the ratings stored in that same document, and stored as `result = { mark, outOf, topLevel, sections[] }`.
- The 13 auto-marked questions are **evidence**: the teacher sees which are right inside each section and decides the
  section's level. They carry no points of their own (F1 marking model). Exact rules: the one option; exactly the right set;
  every pair; the exact order. A question the student did not answer is «not answered», not «wrong».
- The form's mark is shown beside the project score. It is not merged into it (owner decision 2).

## What the student is sent

`studentReviewView` adds to the student's form response, and nothing else of the review ever leaves the API:

| State | Added |
|---|---|
| `draft`, `submitted` | nothing — ratings and notes saved by the teacher are invisible until the approval (owner decision 4) |
| `returned` | `returnNote`, `returnedAt` |
| `approved` | `result = { mark, outOf, approvedAt, generalNote, sections[] { sectionId, level, topLevel, weight, points, levelLabel, note }, auto { questionId: true / false / null } }` |

No answer key is sent, before or after the approval: the same form is still open for classmates, so the student learns
which auto-marked questions were right, not what the right answer is. The card's summary (`examForm` in the student
tracker response) carries `status` and, when approved, `mark` and `outOf`.

## Safety

**Grading safety (`AGENTS.md` §10).**

- Nothing is marked by default. A section without a rating **blocks** the approval (`400 REVIEW_INCOMPLETE`); it is never
  a zero. A level outside the rubric is not a rating.
- A form that was not submitted cannot be rated, returned or approved, so a student who never submitted has **no mark**,
  not a zero. The class list shows `mark: null` for every state but `approved`.
- The approval is idempotent: approving an approved form changes nothing, writes nothing and is not audited again,
  whatever revision the request carries.
- A stale teacher page cannot write (`409 REVIEW_STALE`), so a form the student changed after a return is not approved on
  ratings the teacher gave to the older answers without the teacher loading it again.
- A stored class form the code cannot trust is `503` for every read and write of the review; nothing is written against it.
- A mark is shown only for an `approved` document. A `result` left on a document in any other state is shown to no one
  (student response, card, class list, teacher view).

**Answer keys and access.** Keys leave the API only in `GET resource=exam-form-student`, a teacher read behind the route's
capability, tenancy and class-membership checks. The questions list, the class list and every student response carry none.
The server decides everything; the student page's handling of the two new states is presentation only.

**Identity and data.** A review write needs the student to be a member of the class (`requireStudentInClass`). No
document is deleted: taking an approval back removes only the computed `result`, which the next approval computes again.

## Student page (minimal, F2-UI components)

- `isLocked` lets the student write a `draft` and a `returned` form, nothing else.
- A returned form shows the teacher's note and «أُعيدت للتعديل»; the card offers «عدّل وأعد التسليم».
- An approved form is a read-only record that shows «علامة الاستمارة: mark / 100»; the card shows «اعتُمدت» and the mark.

The per-section levels, notes and right / wrong marks are already in the response; showing them is F3-UI.

## Files

| Added | |
|---|---|
| `api/src/lib/project-tracker/exam-form-review.js` | Pure: evidence, mark, `applyReview` / `applyReturn` / `applyApprove` / `applyUnapprove`, `studentReviewView` |
| `api/src/lib/project-tracker/exam-form-review-service.js` | Storage: class list, teacher view, the four writes |
| `api/tests/project-exam-form-review-f3.test.js` | API tests over the real handlers |
| `src/projects/examForm/StudentExamForm.f3.test.tsx` | The student's page with a returned / rated / approved form |

| Changed | |
|---|---|
| `api/src/functions/project-tracker.js` | three `GET` resources, four actions, `hiddenQuestionIds` on open |
| `api/src/lib/project-tracker/exam-form-service.js` | hiding at the first open, `classFormQuestions`, the review in the student body and summary |
| `api/src/lib/project-tracker/exam-form-answers.js` | a returned form is writable; an approved one refuses with `FORM_APPROVED`; `resubmittedAt` |
| `src/projects/examForm/{types.ts, useExamFormDraft.ts, StudentExamForm.tsx, StudentExamFormCard.tsx}` | the two new states |

## Tests and mutation proof

`api/tests/project-exam-form-review-f3.test.js` (43 tests): hiding (the list, a hidden question absent for the student and
the teacher, frozen after the first open, five refused lists); the evidence rules per kind and the counts; the mark
(100 / 0 / 50, one section lower, unrated blocks); the class list and the teacher view; ratings (partial update, clear,
no-change, eleven refused requests, a non-submitted form, an archived class, an untrusted class form); return and
resubmit; approval (incomplete refused, computed once, idempotent, audited, the student's result without a key, final for
the student); taking an approval back; a stray result shown to no one; another student untouched.
`src/projects/examForm/StudentExamForm.f3.test.tsx` (4 tests): the page and the card over the real handlers.

Fail-first is not applicable: this phase adds behaviour and fixes no defect.

Mutation campaign (56 mutants in `exam-form-review.js`, `exam-form-review-service.js`, `exam-form-service.js`,
`exam-form-answers.js`, `project-tracker.js`, `useExamFormDraft.ts` and `StudentExamFormCard.tsx`; run alone, one mutant
at a time, each file restored byte-for-byte by SHA-256): **56 KILLED, 0 survived, 0 timeouts.** Two tests were added
before the run because their mutants had no test: a stored result on a non-approved form, and a multi-choice answer with
the right count and one wrong option.

| Group | Mutants | Killed by |
|---|---|---|
| Approval (unrated sections approved; not idempotent; a draft approved; the mark not computed from the stored ratings) | 4 | «a section without a rating is unrated…», «a fully rated form is approved once…», «a form that was not submitted cannot be rated, returned or approved», «applyReview / applyApprove never change the document…» |
| State guards (a draft rated / returned; an approved form rated; a returned form not marked; taking back keeps the mark / the state) | 6 | «a form that was not submitted…», «an approved form cannot be rated or returned…», «the student sees the note, edits, submits again», «taking an approval back…» |
| Stale writes (rate / return / approve; take back) | 2 | «an older revision», «taking an approval back…» |
| Ratings (level above / below / fractional; unknown section; earlier ratings dropped; no-change writes; note length; a level outside the rubric counts as rated) | 8 | the matching «a rating that is not allowed» cases, «a later save changes only the sections it names…», «a section without a rating is unrated…» |
| The mark (wrong top level; weights ignored) | 2 | «is the weighted share of the rubric» |
| Evidence (subset right; right count right; partial pairs; any order; unanswered = wrong; a teacher-marked question auto-marked) | 6 | «each kind is right only when it is exactly right…» |
| What is shown (a result before the approval: student, card, class list, teacher view; the stored review sent to the student; answers in the class list; keys in the questions list) | 7 | «a mark is shown only for an APPROVED form…», «after the approval the student sees the mark…», «lists every student…», «lists the questions to choose from…» |
| Student writes (approved editable ×2; submitted editable; returned not editable) | 4 | «after the approval the student sees the mark…», F2 «a complete form is submitted once…», «the student sees the note, edits, submits again» |
| Hiding (after the freeze; a section emptied; unknown id; not removed; not recorded; not passed by the route) | 6 | the «hides questions before the first open» tests |
| Access and trust (another class's student read / written; an untrusted class form; a never-opened form) | 4 | «refuses: a class whose form was never opened, a student of another class…», «a stored class form this code cannot trust is a 503…» |
| Audit and refusals (not audited; audited twice; no mark in the record; the unrated sections not named) | 4 | «the student sees the note, edits, submits again», «a fully rated form is approved once…», «an approval with unrated sections is refused…» |
| Student page (a returned form locked; an approved form editable; the card offers editing on an approved form) | 3 | `StudentExamForm.f3.test.tsx` |

## Known limitations

- No teacher screen yet (F3-UI): until it ships, the routes are reachable only by a direct request.
- The audit record is written after the storage write. If recording fails, the write stands and the request fails; a
  retried approval is then a no-change and is not audited. Same order as the existing open / close actions.
- After a return, the ratings the teacher gave to the earlier answers stay. The teacher re-reads the form before approving;
  the server does not mark a rating as «given to an older answer».
- `project.reset` still does not touch the form's documents (F2 limitation, owner decision pending).
- Image and file questions remain unanswerable (F4 / F5) and are rated by the teacher inside their section from the
  student's book and file, as before.
