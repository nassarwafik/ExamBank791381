# Project exam form — no file uploads (owner decision, 2026-11-15)

## Problem

Two of the three exam forms end by asking for the project itself: 794589 asks for the Packet Tracer file and the book,
883589 for the book. F1 planned a later phase that would let the student upload those files. That phase was built and
merged in two parts by another window — the server side (#638, `b466aa41`) and the screens (#639, `e90b3b60`): a
per-class switch for the teacher, an upload of up to 10 MB per question for the student, a download for the teacher.

The owner then decided **files are not uploaded to the site**: the student hands the project file and the book to the
teacher directly. The decision was given on 2026-11-15, and confirmed the same day when it turned out that #639 had been
merged in the meantime («cancel file uploads»).

## Decision and what follows from it

| Question | Decision |
|---|---|
| May a student upload a file to the exam form? | **No.** |
| What happens to the file questions of the two forms? | They stay on the student's page as a reminder: «سلّم الملف لمعلمك مباشرة: الملفات لا تُرفع إلى الموقع، وهذا السؤال لا يمنع التسليم». They never block a submit. |
| What happens to the merged upload feature? | Removed, both parts, by reverting the two merges. |
| A request to switch file answers on? | Refused by the server (`409 FILES_NOT_OFFERED`); it writes nothing. |
| What was already stored? | Left as it is. Nothing is deleted or migrated. |
| The 899373 form, written after the decision? | It has no file question; the student ticks what was handed to the teacher (`docs/enterprise-project-exam-form-899373.md`). |

Student **images** are not affected: they stay as F4 / F4-UI built them (a sanitized, re-encoded picture is a different
risk from an opaque file).

## What was removed

| Merge | What it had added | How it was removed |
|---|---|---|
| #639 `e90b3b60` (F5-UI) | the student's file input, the teacher's «تفعيل أسئلة الملفات» switch, the download in the review, their tests and record | `git revert -m 1 e90b3b60` — a normal commit. Afterwards every file under `src/` is what it was on this branch before #639 arrived. |
| #638 `b466aa41` (F5 files, server) | the `fileAnswers` switch, attach / replace / remove, the two download reads, the file blob names, their tests and record | `git revert -m 1 b466aa41` — a normal commit. Afterwards `api/src` differs from `main` before #638 only by the 899373 form. |

Both reverts are relative to the merge's first parent, so only that window's own changes are undone: the work that
reached its branch through `main` (F4, F4-UI, the image screens) is untouched. The two design records of the removed work
(`enterprise-project-exam-form-f5-files.md`, `enterprise-project-exam-form-f5-ui.md`) left with it; they remain in the
history of those merges.

## What the server does now

| Request | Result |
|---|---|
| `examForm.open` carrying `fileAnswers` (any value) | `409 FILES_NOT_OFFERED`, before anything is read or written: no class form, no audit record, and no other switch in the same request moves. |
| `examForm.open` without it | as before (F2, F3, F4). |
| student `addFile` / `removeFile` | `400` — the route has no such action. |
| a draft that names a file question | `400 KIND_NOT_AVAILABLE`, as before the removed phases: a file question is deferred. |
| `GET …&file=<id>` | the form's JSON view; never bytes. |

The explicit refusal exists because a teacher's page cached while #639 was deployed still shows the switch: pressing it
must fail visibly, not answer «done» while doing nothing.

## What may be left in storage

The upload may have been live between the deployment of #639 and the deployment of this change. A teacher who switched file answers
on in that window, and a student who attached a file, left data behind:

| Left behind | Now |
|---|---|
| `fileAnswers: true` (and `fileAnswersAt` / `fileAnswersBy`) on a class form | not read: the class's file questions are deferred again and never block a submit; a form already submitted stays submitted |
| a `file` reference inside a student's answer | kept in the answers document; no page shows it |
| a file blob under `platform/project-exam-forms/<code>/files/…` | kept; no route serves it |

Nothing is deleted without the owner's plan (AGENTS.md §10). Whether any such data exists, and what to do with it, is the
owner's to check and decide; this change neither lists nor touches it.

## Safety

- **The server decides.** The switch is refused on the server; hiding it from the page is not the protection.
- **Fail closed.** The refusal comes before any read or write, so a request that also carries a valid change (the image
  switch, the hidden list) changes nothing.
- **Grading safety.** A class that had file answers on loses a *requirement*, never an answer: its students are no longer
  blocked by a file question, no stored answer changes, no submitted form is reopened, nothing produces a mark.
- **No deletion, no migration.** See above.
- **Smaller surface.** The site no longer accepts or serves opaque files for the exam form.

## Tests and mutation proof

- `api/tests/project-exam-form-no-files-f5.test.js` (4): the switch refused at a first open and on an open form, with
  nothing written and no other switch moved; no file action on the student route and no bytes from a file read; a class
  left with the old switch, a file reference and a blob reads as any other class, submits, and keeps what was stored.
- `src/projects/examForm/StudentExamForm.fileNotice.f5.test.tsx` (3): both forms' file questions say to hand the file to
  the teacher, take no input and promise no upload, with image answers on and off.
- The tests of the removed feature left with it (`project-exam-form-files-f5.test.js`, `ExamForm.files.f5ui.test.tsx`):
  they tested behaviour that no longer exists. No other test was edited for the removal.

Fail-first is not applicable: an owner's product decision, no defect fixed.

Mutation campaign, on the final tree, each mutant one exact replacement, files restored byte-for-byte (SHA-256), run
alone, `git status` unchanged afterwards:

| Mutants | Result |
|---|---|
| The refusal (removed; only `true` refused; no code; applied after the open) — 4 | 4 KILLED |
| The notice (the question and both notes still promising an upload; a file question given the image input) — 4 | 4 KILLED |

0 survived, 0 timeouts.

## Known limits

- A page cached from the #639 deployment still shows the file switch and the file input until it reloads; both now fail
  with the server's message.
- Data left in storage by the short-lived feature is not surfaced anywhere (see above).
- The file questions of 794589 and 883589 were still `required` in their templates and still of kind `file` when this
  change merged; they are deferred for every class, so they never block. Replacing them with a hand-in checklist, as in
  the 899373 form, was tried inside this change on 2026-11-15 and put back: 37 tests in 11 files pinned those two
  templates' questions and counts. The owner then asked for it as a phase of its own: **form version 2**
  (`docs/enterprise-project-exam-form-hand-in-checklist.md`). Classes opened before it keep their file questions and
  everything this document says about them.
