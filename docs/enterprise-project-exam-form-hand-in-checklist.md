# Project exam form — form version 2: a hand-in checklist replaces the file questions (794589, 883589)

## Problem

Files are not uploaded to the site (owner decision, 2026-11-15, `docs/enterprise-project-exam-form-no-file-uploads.md`). The
two older forms still ended with file questions — 794589 asked for the Packet Tracer file and the book, 883589 for the
book — which the page showed as a reminder with no input. They never blocked a submit and recorded nothing. The 899373
form, written after the decision, asks instead for a tick on what was handed to the teacher. The three forms were not
uniform, and the record of the no-uploads change left the alignment «the owner's to ask for as a phase of its own». The
owner asked for it on 2026-11-15.

## Decision

| Question | Decision |
|---|---|
| What replaces the file questions? | One required checklist, `S16Q05`: «أشّر ما سلّمته لمعلمك مباشرة. الملفات لا تُرفع إلى الموقع.» — the prompt of the 899373 form, word for word. |
| Its items | 794589: «ملف Packet Tracer النهائي», «كتاب المشروع النهائي». 883589: «مشروع Visual Studio النهائي», «كتاب المشروع النهائي». |
| Is it marked? | No (`grading: "none"`), like the same question of 899373. The teacher rates the section on the rubric as before. |
| Its id | A **new** id. `S16Q02` / `S16Q03` are not reused, so no question id ever changes its meaning between versions. |
| Which classes get it? | Classes that open their form **after** this change. `formVersion` is 2 in both files. |
| Classes already opened | Nothing changes. A class form freezes the whole template at its first open (F2); such a class keeps version 1, file questions included, for good. No migration, no rewrite. |
| The `file` question kind | Stays valid in the template validation and in the pages: version 1 classes still have it. No bundled form uses it any more. |

The 883589 form's second item is this phase's wording: version 1 asked for the book only, because a Visual Studio project
is not one file. With nothing uploaded, the student now ticks the project as well as the book. The wording is the owner's
to change; changing it later is a new `formVersion`.

## What changed

| | 794589 | 883589 |
|---|---|---|
| `formVersion` | 1 → 2 | 1 → 2 |
| Questions | 92 → 91 | 95 → 95 |
| Last section | image · ~~file `.pkt`~~ · ~~file book~~ · declaration → image · **checklist** · declaration | image · image · ~~file book~~ · declaration → image · image · **checklist** · declaration |
| Teacher-marked / unmarked | 75 / 4 → 73 / 5 | 75 / 4 → 74 / 5 |
| File questions | 2 → 0 | 1 → 0 |
| Answerable without images | 77 → 78 | 80 → 81 |

Everything else in the two files is byte for byte what it was — the other questions, every answer key, the sections, their
weights, the rubric — and a test compares the two versions to prove it.

No code changed. The checklist is an existing kind (the 899373 form uses the same question); the student's page already
tells a class with no file question nothing about files (#641); the PDF prints a checklist as its ticked items (F5 PDF).

## What a version 1 class still sees

A file question is still the reminder «سلّم الملف لمعلمك مباشرة: الملفات لا تُرفع إلى الموقع، وهذا السؤال لا يمنع التسليم», it
still takes no input and never blocks a submit, and the PDF still prints «يُسلَّم الملف للمعلم مباشرة». The version 2
checklist is not one of its questions: an answer to `S16Q05` is refused.

## Safety

- **Immutable once opened.** The rule of F2 is what makes this change safe, and it is now tested from both sides: a class
  opened under version 1 reads, saves, submits and is reviewed on version 1; closing and reopening it never swaps its
  questions.
- **Grading safety.** No mark is produced or changed. For a new class the checklist is one more required answer: a form
  without it is refused at submit with the question named, never submitted silently, never marked. Nothing is ticked on the
  student's behalf.
- **No stored data touched.** No class form and no answers document is read or rewritten by this change.
- **Answer keys.** The new question has none; the keys of the 13 and 16 auto-marked questions are unchanged (the pins of
  F1 and F1b pass as they were).
- **No upload.** Nothing in this phase touches a file route.

## Tests

`api/tests/project-exam-form-hand-in-checklist-v2.test.js` (10 tests, the real routes on the in-memory container, both
forms):

- a first open freezes version 2 and is audited with it; the student reads the checklist with its two items and no file
  question;
- the checklist is required: a submit without it is refused (`FORM_INCOMPLETE`), an unknown item is refused, a tick is
  stored in the form's order and the form is then submitted;
- a class opened under version 1: teacher and student read version 1 with its file questions and no checklist, and a read
  rewrites nothing; its students save and submit (`formVersion` 1, never `FORM_VERSION_CHANGED`), an answer to `S16Q05` is
  refused, the teacher's list and review are on version 1; closing and reopening keeps the template byte for byte.

`src/projects/examForm/StudentExamForm.fileNotice.f5.test.tsx`: the page of a class opened today shows the checklist as
two checkboxes, none ticked, no file input and no file notice, and a tick is saved (2 tests); the notice tests now run on
a version 1 class.

`api/tests/fixtures/exam-form-v1/` holds byte copies of the two version 1 files (from `6b3282f5`), and
`api/tests/fixtures/exam-form-v1.js` writes the class form a first open stored under version 1. The file-question rules
(validation of the accepted types, the student view, the notice, the «old switch» class, the PDF line) are tested on them:
those tests kept every assertion and changed only which class they run on.

**Expectations that changed, and why.** 12 existing test files pinned the two templates' counts or used their file
questions. Each edit follows from the new data, none hides a defect: 92 → 91 questions, 77 → 78 answerable, 15 → 13
deferred, `formVersion` 1 → 2, the summaries, the section's question count, «uses every kind» (now every kind but `file`;
version 1 used them all), and the test «a form of another version is refused», which now takes the bundled version plus
one. The keys pinned by F1 and F1b did not change.

Fail-first is not applicable: an owner's product change, no defect fixed.

Mutation campaign: 13 mutants, one exact replacement each, run alone against the phase test file and the F1, F1b, F2 and
file-notice suites; each file restored byte-for-byte by SHA-256, `git status` unchanged afterwards. **13 KILLED, 0
survived, 0 timeouts.**

| Group | Mutants |
|---|---|
| The data (794589's checklist not required; 883589's not required; 794589's first item changed; 883589's prompt without «not uploaded»; 883589 left at version 1; 794589's checklist marked by the teacher) | 6 |
| The frozen form (a reopen swaps an opened class's questions for the bundled form; the student reads the bundled form; a student write is checked against the bundled form; the teacher's state reports the bundled form, or the bundled version; the teacher's list and review use the bundled form; a write no longer checks the document's version) | 7 |

The seven code mutants are the guarantees this phase relies on without changing them: before this phase only C7 had a
test that named a version mismatch, and no test opened a class on an older version than the bundled one.

**Reconciliation.** `main` moved twice during the phase: #641 (the image notice, before the work started) and #644 (the
student sees what is left to answer, `5c0565ea`). The branch took both with normal merge commits, no conflict; the project
and exam-form suites passed on the merged tree (70 files, 891 tests) and the full validation below ran on it. The mutation
campaign ran before #644, which touches none of the mutated files or their tests.

**Full validation** on the reconciled head: `npm test` 1555 files, 18729 tests passed; lint exit 0 (145 warnings, as
`main`); typecheck clean; build and bundle guard passed; `git diff --check` clean.

**Real browser (local, not a committed gate).** The production build next to the real API in process, Chromium, a whole
794589 class opened under version 2 — answered, 14 images, rated and approved — printed from the teacher's review and the
student's page (the F5 PDF harness): 21 checks passed. The student's copy has 16 sections and 91 questions and prints the
hand-in checklist with no «file» line; teacher copy 19 A4 pages, student copy 18; no answer key, no login code. The
harness's first run on this head reported one failure: it still expected 92 questions, written into the harness itself.
It now reads the count from the form and checks the hand-in checklist; nothing in the product changed between the two runs.

## Known limits

- Classes already opened keep the file reminder; only classes opened afterwards get the checklist. Moving an opened class
  to version 2 would rewrite a frozen form and its students' documents, and is not offered.
- A tick is the student's statement, not a proof: the site never sees the file. The teacher still confirms the hand-in in
  person and rates the section.
- One tick satisfies the question (the rule of every checklist, and of the same question in 899373), not both.
- The 883589 wording «مشروع Visual Studio النهائي» is this phase's choice (above).
