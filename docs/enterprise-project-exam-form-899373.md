# Phase F1c — Project exam form for 899373 («استمارة امتحان المشروع»)

## Problem

F1 shipped the exam form for 794589 and F1b for 883589 (`docs/enterprise-project-exam-form-f1.md`,
`docs/enterprise-project-exam-form-883589.md`). 899373 was the one bundled project without a form. It is a different
project: a database built in Access (tables, relationships, queries, forms, reports), documented in a book that also
carries the validation rules, the `CREATE TABLE` code, the classes and three diagrams.

The tracker shows which 899373 stages a student finished. It does not show whether the student understands the work, or
whether the book describes the Access file that actually exists. A finished 899373 book reviewed for this phase showed the
gap, in general terms:

- a rule listed in the validation tables (a value that must not repeat, a pattern) that no constraint in the
  `CREATE TABLE` code enforces;
- pasted code with a `CREATE TABLE` that is never closed;
- a table of contents that stops before the last chapters and whose page numbers no longer match the chapters; a chapter
  that appears twice;
- the Access part as screenshots with titles and no word about what each query, form or report is for;
- a paragraph that still reads as a reply addressed to the student, and sources that name AI tools with no statement of
  what they produced.

## Owner request (2026-11-15)

The owner chose the 899373 question bank as the next phase and uploaded that book as the example to build on. The
decisions recorded in F1 apply unchanged (one form for the whole class, no time limit, one submit, results after the
teacher approves, the form's mark not merged into the project score, images as in F4 / F4-UI). On the same day the owner
decided that **files are not uploaded to the site**; this form is the first one written after that decision.

The book is a student's work: it is not in the repository, and nothing from it is (no name, school, number, topic, table
name or sentence). A test pins that.

## Scope

| In this phase | Not in this phase |
|---|---|
| The bundled 899373 template (`api/src/data/project-899373/exam-form-template.json`) and the registry flag | Any change to the validation, the projection, the routes or the pages (none) |
| The «project without a form» branch kept under test through a fixture, now that no bundled project is without one | PDF export |
| | Removing the file questions of the two older forms (they stay as a reminder to hand the file to the teacher) |

No API, storage, route, capability, dependency or workflow change. The form reaches a class only when its teacher opens
it from the control every project already has.

## The 899373 form (version 1)

15 sections, 84 questions, worth 100. 62 questions are reviewed by the teacher (answered from the student's own project),
17 are auto-marked (one right answer for everybody), 5 are never marked (a checklist of what was verified, a
self-assessment, what was handed to the teacher, two declarations). 13 image questions; **no file question**.

| # | Section | Questions | Weight | Book |
|---|---|---|---|---|
| 1 | بطاقة المشروع | 3 | 3 | cover |
| 2 | المقدمة وموضوع المشروع | 4 | 4 | contents, introduction |
| 3 | الجداول وحقولها | 7 | 9 | the tables and their fields |
| 4 | المفاتيح والعلاقات بين الجداول | 6 | 9 | keys; relationships in Access |
| 5 | معطيات الجداول | 4 | 6 | data entered in the tables |
| 6 | التحقق من صحة المعلومات وقواعد التحقق | 6 | 9 | validation rules |
| 7 | SQL Server Code | 5 | 7 | `CREATE TABLE` |
| 8 | الفئات البرمجية (Classes) | 5 | 7 | classes |
| 9 | المخططات: ERD و DSD و DFD | 6 | 8 | the three diagrams |
| 10 | استعلامات الإضافة والحذف والتعديل | 6 | 8 | insert, update, delete |
| 11 | استعلامات البحث والحساب والبارامتر | 9 | 10 | select, calculated, parameter; queries in Access |
| 12 | النماذج والتقارير في Access | 7 | 8 | forms, reports |
| 13 | تدقيق الكتاب مقابل ملف Access | 5 | 5 | the whole book against the file |
| 14 | المردود والمصادر والأمانة الأكاديمية | 7 | 4 | reflection, sources |
| 15 | التسليم | 4 | 3 | the final book and file |

Weights by axis: card and introduction 7 · database design and data 24 · validation and SQL code 16 · classes and
diagrams 15 · queries 18 · Access forms and reports 8 · audit, reflection and submission 12.

The sections follow the book, and the Access stages of the tracker (tables, relationships and data, queries, reports) are
each asked for with a screenshot from the student's own file. The rubric is the five levels the other forms use, with the
evidence named for this project (the Access file: tables, relationships, queries, reports).

### What the questions probe

| Gap seen in the book | Questions that ask for it |
|---|---|
| Names differ between book, Access file, SQL code and classes | 3.5, 13.1, 13.2 |
| A rule in the validation table that nothing enforces | 6.1, 6.5, 13.1 |
| Code that does not run as pasted | 7.1, 7.3, 13.1 |
| A class that does not hold its table's fields | 8.1, 8.3 |
| Diagrams that do not match the relationships built in Access | 9.5, 13.1 |
| Screenshots with no explanation | 10.2–10.3, 11.1–11.3, 11.8, 12.1, 12.3, 12.5 |
| A table of contents that no longer matches | 13.1 |
| Text taken from a source or a tool, unexplained | 2.1, 14.5, 14.6 |

Auto-marked questions cover what has one right answer for every project: Access data types, referential integrity, the
constraints, `IDENTITY`, SQL to C# types, what each diagram shows, the SQL command behind each Access query type, `WHERE`
on an update or delete, a parameter criterion, `GROUP BY`, aggregate functions, the order of a query's clauses, the source
of a report.

### Files

Owner decision of 2026-11-15: files are not uploaded to the site. So this form has no `file` question. In its last
section the student ticks what was handed to the teacher directly (the final Access file, the final book) — a checklist
that is never marked — and attaches a screenshot of the open file instead. With no file question nothing in this form is
ever «deferred»: where a class has image answers on, every required question counts for the submit.

Technical text inside a question (a criterion, a query) is written so that it reads left to right without invisible
direction marks; a test refuses such characters in the file.

## A project without a form

Until this phase 899373 was the tests' example of «a project that ships no form» (the control is not shown, the open is
refused with `NO_FORM`, the student gets no form). Every bundled project ships one now, so that branch has no real
example. It stays in the code — a project added later may ship none — and it stays tested: the fixture
`api/tests/fixtures/formless-project.js` loads fresh copies of the routes over a registry that answers «no form» for one
project, then restores the module cache. Nothing under `src/` knows about it.

Five existing tests named 899373 as the formless project. Their expectations were moved, not loosened:

| Test | Before | Now |
|---|---|---|
| `project-exam-form-template-f1.test.js` — the registry | forms for 794589, 883589; 899373 → none | forms for all three, each its own |
| same — the loader | `899373` → «not found» | `000000` (a well-formed code with no data file) → «not found» |
| `project-exam-form-883589-f1b.test.js` — the registry | 899373 → none | all three |
| `project-exam-form-student-f2.test.js` — refusals | open on 899373 → `400 NO_FORM` | the same request on the fixture's route → `400 NO_FORM` |
| `ProjectExamFormControl.f2ui.test.tsx` — not shown | control for 899373 not shown | the same page served by the fixture's route: not shown |

## Safety

- **No answer key leaves the server.** The template is read through the same allow-list projection; a test checks the
  student's view of this form for every key field.
- **No personal data.** The template names no person, school, number, address, link or project topic; a test pins it.
- **No file upload.** The form asks for none; nothing in this phase touches the file routes.
- **Grading safety.** The form produces no mark by itself; auto-marking and the teacher's review are F3's, unchanged. A
  class with image answers off submits without its image questions, as before.
- **Immutable once opened.** A class's questions are frozen at its first open (F2); a later edit of this file is a new
  `formVersion` for classes opened afterwards.

## Tests and mutation proof

- `api/tests/project-exam-form-899373-f1c.test.js` (14): the template's size, sections, weights and rubric; the key of
  every auto-marked question pinned by its text; keys not in listing order and spread over the option positions; images
  and the hand-in checklist; frozen and its own file; no personal data and no invisible character; the student's view with
  no key; the registry; open and read under the 899373 prefix; a complete form submitted once its required images are
  there; a class with image answers off; the «no form» branch through the fixture.
- `src/projects/examForm/StudentExamForm.899373.f1c.test.tsx` (4): the teacher's control shows the size and opens the
  form; the card on the student's project; every section and question drawn with an input and nothing asking for a file;
  an answer saved under the 899373 prefix.
- The other session's suite that runs the review path for every bundled form picks this form up with no edit.

Fail-first is not applicable: new content, no defect fixed.

Mutation campaign: 14 mutants, each one exact replacement in the template, the registry or the fixture; the exam-form
API suites, this form's page tests and the teacher-control suites run per mutant; files restored byte-for-byte (SHA-256);
run alone; `git status` unchanged afterwards. **14 KILLED, 0 survived, 0 timeouts.**

| Group | Mutants |
|---|---|
| Registry (899373 ships no form again) | 1 |
| Answer keys (a choice key moved; the ordering key in listing order; a multi-choice key missing an answer; two matching pairs swapped) | 4 |
| Template content (a section's weight; a phone number, a direction mark and a student's topic written into a question; the hand-in checklist without «no upload»; a required image question with a minimum of 0) | 6 |
| The «no form» fixture (registry left patched; fresh routes left in the module cache; the real form returned) | 3 |

The first two runs of the campaign reported mutants as «not applied» because their search patterns assumed the wrong
indentation of the data file; the patterns were corrected (no test changed) and the campaign run again in full.

## Known limits

- The bank is built on one finished book and the project's stage list. A class whose books are organised differently may
  want questions hidden (the teacher can hide questions before the first open — F3-UI).
- The teacher rates each section on the rubric; the auto-marked questions are evidence shown beside the answers, as in the
  other forms.
- The two older forms keep their file questions (a reminder to hand the file to the teacher); this one replaces them with
  a checklist. The three are not uniform on that point.
