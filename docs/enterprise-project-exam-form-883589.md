# Phase F1b — Project exam form for 883589 («استمارة امتحان المشروع»)

## Problem

F1 (`docs/enterprise-project-exam-form-f1.md`) shipped the exam form for project 794589 only and left the 883589 question
bank for a later phase. 883589 is a different project: a database, C# classes, web services and a web site built in Visual
Studio, documented in a book. The 794589 questions (VLANs, addressing, Packet Tracer) do not apply to it.

The tracker shows which 883589 stages a student finished. It does not show whether the student understands the work, or
whether the book describes the project that actually runs. A work-in-progress 883589 book reviewed for this phase showed the
gap, in general terms:

- table and field names written one way in the `CREATE TABLE` code and another way in the queries taken from the project;
- rules listed in the validation tables (a length, a prefix, "not in the past") that no `CREATE TABLE` constraint enforces,
  and allowed values (a status, a payment method) that differ between two sections of the same book;
- sample rows that contradict the stated rules (a payment recorded for a cancelled record, a payment dated before the
  record it pays for);
- user-name and password-hash fields used by the queries but absent from the documented tables and classes;
- web-method signatures that differ between two tables of the book;
- pasted code with an unclosed parenthesis or brace, a table of contents that no longer matches the chapters, and site
  sections that are titles with no content;
- sources that name an AI tool with no statement of what it produced.

## Owner request (2026-11-14)

The owner uploaded that book and asked for the same thing that was done for 794589: an exam / form built on the book, for
project 883589. The decisions recorded in F1 apply unchanged (one form for the whole class, no time limit, one submit,
results after the teacher approves, the form's mark not merged into the project score, images in F4, files in F5). This
replaces F1's "794589 only; 883589 and 899373 in F5" for 883589. 899373 still ships no form.

**Status: draft.** The question bank is on the working branch for the owner's review of the proposal (sections, question
counts, weights, wording). Nothing is merged, and no user can reach the form.

## Scope

Data and a registry flag. **No route, no storage document, no UI, no change to the validation or to the student projection.**

| Added / changed | Path |
|---|---|
| The 883589 form | `api/src/data/project-883589/exam-form-template.json` |
| Registry entry `examForm: true` on 883589 | `api/src/lib/project-tracker/registry.js` |
| Tests | `api/tests/project-exam-form-883589-f1b.test.js` |
| «Project with no form» example moved from 883589 to 899373 | `api/tests/project-exam-form-template-f1.test.js`, `api/tests/project-exam-form-student-f2.test.js` |

The form uses only the kinds, fields and limits `exam-form.js` already validates. The project's Visual Studio solution is not
a file question: the allowed file types are `.pkt`, `.docx` and `.pdf`, and widening them belongs to F5 with the file upload.
The form asks for screenshots of the project instead, and for the book as the one file.

## The 883589 form (version 1)

| # | Section | Questions | Auto | With images | Weight |
|---|---|---|---|---|---|
| 1 | بطاقة المشروع | 3 | 0 | 1 | 3 |
| 2 | المقدمة وموضوع المشروع | 4 | 0 | 0 | 3 |
| 3 | الجداول وحقولها | 7 | 1 | 1 | 8 |
| 4 | المفاتيح والعلاقات بين الجداول | 6 | 1 | 1 | 8 |
| 5 | معطيات الجداول | 4 | 1 | 1 | 5 |
| 6 | التحقق من صحة المعلومات و Regex | 8 | 3 | 1 | 8 |
| 7 | SQL Server Code | 5 | 1 | 1 | 7 |
| 8 | الاستعلامات | 8 | 2 | 1 | 8 |
| 9 | لغات البرمجة والفئات | 5 | 1 | 0 | 6 |
| 10 | خدمات الويب وفحصها | 8 | 2 | 1 | 9 |
| 11 | XML والمخططات | 7 | 2 | 1 | 8 |
| 12 | الموقع: المبنى والصفحات | 7 | 0 | 1 | 8 |
| 13 | الدخول والصلاحيات والأمان | 7 | 2 | 1 | 6 |
| 14 | تدقيق الكتاب مقابل المشروع | 5 | 0 | 1 | 5 |
| 15 | المردود والمصادر والأمانة الأكاديمية | 7 | 0 | 0 | 5 |
| 16 | المرفقات والتسليم | 4 | 0 | 2 | 3 |
| | **Total** | **95** | **16** | **14** | **100** |

75 questions are teacher-reviewed, 16 auto-marked, 4 unmarked (one checklist, one self-rating scale, two declarations); one
is a file question (the book). Weights by axis: project card and introduction (1–2) 6, database design and data (3–5) 21,
validation, SQL and queries (6–8) 23, classes and web services (9–10) 15, diagrams, site and access (11–13) 22, audit,
reflection and submission (14–16) 13. Each section's `bookRef` names the 883589 tracker stages it covers.

The rubric is the 0–4 scale of F1, worded for this project: level 3 is "correct and proven by screenshots or output from the
project (Visual Studio, the database, the web-service test)", level 4 adds a clear explanation of the reason and of what
happens if the code or the constraint changes. The marking model is F1's: the teacher rates each **section**; the auto
questions are evidence inside their section and carry no points of their own.

### What the questions probe

Every question is asked to the whole class, and each student has a different topic, so no question names a topic. Questions
phrased «في مشروعك» / «في كتابك» are answered from the student's own work. Each weakness listed under *Problem* has a question
that makes the student check it in their own project:

| Weakness | Where the form asks |
|---|---|
| Names differ between the tables, the queries and the classes | S03Q05, S09Q04, S14Q01–Q02 |
| A rule in the book that nothing enforces | S06Q01, S06Q05, S06Q07 |
| Allowed values that differ between sections | S14Q03 |
| Sample rows that contradict the rules | S05Q02 |
| Login fields missing from the tables and classes | S09Q04, S13Q04 |
| Web-method signatures that differ | S10Q06 |
| Pasted code that does not run | S07Q03, S09Q03 |
| 1:1 against 1:N, and what enforces it | S04Q03–Q04 |
| Who may call each operation | S10Q05, S13Q01, S13Q05–Q06 |
| SQL built from user input; stored passwords | S13Q02–Q04 |
| Empty sections, stale table of contents | S14Q01, S14Q04–Q05 |
| Undeclared AI use, copied definitions | S15Q05–Q06 |

The 16 auto questions are general knowledge with one defensible key: data types, the 1:N relation, insert order with a
foreign key, the constraints, two regular expressions (exactly 9 digits; a 10-digit phone starting with 05), `IDENTITY`,
the four SQL verbs, `UPDATE` / `DELETE` without `WHERE`, the role of each language, the order of a web-service call, the
SOAP data format, XML against HTML, the diagrams, query parameters, and password hashing. A test compiles the options of the
two regular-expression questions and proves the keyed option is the only one that accepts the good samples and refuses the
bad ones.

## Safety

- **Answer keys.** The keys exist only in the server-side data file. The student receives `toStudentView(template)`, F1's
  allow-list projection, unchanged: no key, rubric, weight or book reference. The new tests check this for the 883589 form
  directly and through the student route.
- **Reachability.** The form is reachable only through the F2 routes: a teacher with `projects.tracker.manage` must open it
  for a class that runs 883589. No screen calls those routes yet, so the form stays unreachable for users until F2-UI.
- **Isolation.** The class form and the answers live under `platform/project-exam-forms/883589/…`. A class that does not run
  883589 is refused the form; a class that runs 794589 keeps getting the 794589 file.
- **Deferred kinds.** The 14 image questions and the one file question are shown, refuse an answer and never block a submit
  (F2's rule), until F4 / F5.
- **Grading safety.** Nothing here produces a mark. A form that was not submitted is «لم تُسلَّم», never a zero.
- **Personal data.** The reviewed book is not stored in the repository, and the form contains no name, school, identity
  number, phone number or link from it. A test refuses a 9-digit number, a phone number, an e-mail address or a URL in the
  data file.

## Tests and mutation proof

`api/tests/project-exam-form-883589-f1b.test.js` (14 tests): the summary, the section ids, order, titles, question counts
and weights; the rubric; the key of every auto question pinned by its text; the two regular-expression keys executed; no
matching or ordering question listed in the order of its key; the frozen template, equal to its file and distinct from the
794589 form; no personal data; the registry (forms for exactly 794589 and 883589); the student view; and three route tests
(first open freezes the 883589 questions under the 883589 prefix and is audited; the student reads 95 questions with no key
and 15 deferred; a class of another project is refused).

The F1 and F2 tests used 883589 as their «project with no form». They now use 899373, which still has none; no other
expectation changed.

Fail-first is not applicable: this phase adds behaviour and fixes no defect.

Mutation campaign (10 mutants: 3 in `registry.js`, 7 in the data file; each run alone against the three exam-form test
files, 151 tests green before the first mutant; each file restored byte-for-byte and verified by SHA-256, `git status`
unchanged afterwards): **10 KILLED, 0 survived, 0 timeouts**, on the first run.

| # | Mutant | Tests failed | Killed by (first) |
|---|---|---|---|
| M1 | `examForm: true` removed from 883589 | 14 | «is a valid template of 16 sections and 95 questions worth 100» |
| M2 | 883589 served the 794589 file | 13 | «is a valid template of 16 sections and 95 questions worth 100» |
| M3 | 899373 given a form flag | 3 | «returns a form for 794589 and 883589 and for no other project» |
| M4 | A choice key changed (S06Q03 → another option) | 2 | «pins the key of every auto-marked question», «the two regular-expression keys accept exactly what their question asks for» |
| M5 | A matching key changed (S08Q01, two pairs swapped) | 1 | «pins the key of every auto-marked question» |
| M6 | A section weight changed (S10 9 → 10, sum 101) | 14 | «is a valid template of 16 sections and 95 questions worth 100» (the file is refused when read) |
| M7 | `projectCode` changed in the data file | 14 | «is a valid template of 16 sections and 95 questions worth 100» (the file is refused when read) |
| M8 | The keyed option's text changed (S06Q04 `^05\d{8}$` → `^05\d{9}$`) | 2 | «pins the key of every auto-marked question», «the two regular-expression keys …» |
| M9 | Weight moved between two sections, sum still 100 (S10 9 → 10, S16 3 → 2) | 1 | «keeps the sections in book order with the agreed weight of each section and axis» |
| M10 | The ordering key changed (S10Q02, first two steps swapped) | 1 | «pins the key of every auto-marked question» |
