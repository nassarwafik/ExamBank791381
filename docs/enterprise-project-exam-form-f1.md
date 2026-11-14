# Phase F1 — Project exam form («استمارة امتحان المشروع»): template, validation, student projection

## Problem

The project tracker records **which stages** a student finished (book and tool track), and the teacher approves them. It
does not show whether the student **understands** the project: a book can list VLANs, addresses and commands the student
cannot explain, and its tables can disagree with the Packet Tracer file without anyone noticing. A work-in-progress 794589
book reviewed for this phase had exactly that: a device table whose VLAN column did not match its addresses, a duplicate IP
address, a port table using other VLAN numbers than the plan, and empty security and reflection sections.

The owner asked for an exam inside the project: one form for the whole class, of mixed question kinds, covering the project
from its name to the reflection, sources and attachments, with no time limit, saved as the student goes, and submitted once.

## Owner decisions (2026-11-14)

| Question | Decision |
|---|---|
| How many questions? | All **92** (16 sections); the teacher can hide a question before opening the form (F3). |
| Does the form's mark enter the project score? | **No, not yet.** It is shown beside the project score; merging is decided after one class has used it. |
| The P2 decision was "no attachment". Are student images allowed here? | **Yes, images** (F4). Files (`.pkt`, the book) wait for F5. |
| When does the student see the auto-marked results and the teacher's notes? | **After the teacher approves**, not on submit. |
| May the student edit after submitting? | **Only when the teacher returns the form.** |
| Which project first? | **794589 only.** 883589 and 899373 get their own question banks in F5. |

## Scope

F1 is data and pure code. It adds **no route, no storage document, no UI and no student input**.

| Added | Path |
|---|---|
| The 794589 form | `api/src/data/project-794589/exam-form-template.json` |
| Validation, student projection, summary, loader | `api/src/lib/project-tracker/exam-form.js` |
| Registry entry (`examForm: true`) and `getExamFormTemplate(projectCode)` | `api/src/lib/project-tracker/registry.js` |
| Tests | `api/tests/project-exam-form-template-f1.test.js` |

`getExamFormTemplate` returns the validated, frozen template, `null` for a project that ships no form, and throws for an
unknown project code or for a declared form whose file is missing or invalid (a broken form is never "no form").

## Template model

One template per project: `{ projectCode, formVersion, title, rubric: { levels[] }, sections[] }`.

| Level | Fields | Rules |
|---|---|---|
| Section | `sectionId` (`S01`…), `title`, `order`, `weight`, `bookRef?`, `questions[]` | ids and orders unique; 1–40 sections; the weights sum to exactly 100 |
| Question | `questionId` (`S04Q07`), `prompt`, `kind`, `grading`, `required`, `help?` + the kind's fields | the id starts with its section's id and is unique in the form; 1–40 per section, 300 in total |
| Rubric | `levels[] = { value, label }` | values run 0, 1, 2… with no gap; at least two levels |

Question kinds and how each may be marked:

| Kind | Fields | `grading` |
|---|---|---|
| `shortText`, `paragraph`, `cli` | `maxLength` (≤ 500 / 4000 / 20000), `images?` | `teacher` |
| `table` | `columns[] = { id, title }` (1–8), `minRows`–`maxRows` (≤ 40), `images?` | `teacher` |
| `image` | `images = { min, max }` (max ≤ 6) | `teacher` |
| `file` | `accept[]` from `.pkt`, `.docx`, `.pdf` | `teacher` |
| `choice` | `options[]` (2–8), `justification?`, key `answer.correctOptionId` | `auto` or `teacher` |
| `multiChoice` | `options[]` (2–10), key `answer.correctOptionIds[]` | `auto` or `teacher` |
| `matching` | `left[]`, `right[]` (2–8 each), key `answer.pairs` (every left item → a right item) | `auto` |
| `ordering` | `items[]` (2–8), key `answer.order` (a permutation of the items) | `auto` |
| `scale` | `items[]`, `min` < `max` | `none` |
| `checklist` | `items[]` | `none` |
| `declaration` | — | `none` |

A key is required on an `auto` question and refused on any other. The form keeps its own small set of kinds instead of
the exam bank's versioned question families: a form question is answered about the student's own project and is mostly
reviewed by the teacher, and the exam families carry semantics (versions, generation, placement) the form does not need.

## Marking model

- The **teacher rates each section** on the rubric (0–4 in the 794589 form); a section's mark is `rating / top level × weight`.
  A class of 16 students is 16 ratings per student, not 92.
- The 13 `auto` questions are evidence for the teacher inside their section. They carry no points of their own.
- `none` questions (self-rating, checklist, declarations) are never marked.
- Grading safety (`AGENTS.md` §10) for the later phases: a form that was not submitted is «لم تُسلَّم», never a zero; a
  technical failure never lowers a mark; a mark is final only on the teacher's approval, applied idempotently.

## Safety: the answer keys

`answer` is an answer key. It exists only in the server-side data file. `toStudentView(template)` is an **allow-list**
projection: it builds each section, question and option field by field from the fields it knows, so a key, the rubric, the
weights, or any field added to the template later is absent unless this function is changed to include it. The loaded
template is deep-frozen; a caller that needs its own copy clones it. The loader accepts a six-digit project code only.

## The 794589 form (version 1)

| # | Section | Questions | Auto | With images | Weight |
|---|---|---|---|---|---|
| 1 | بطاقة المشروع | 4 | 0 | 1 | 3 |
| 2 | المقترح والخلفية | 5 | 0 | 0 | 4 |
| 3 | المؤسسة والفروع | 4 | 0 | 1 | 3 |
| 4 | تخطيط العناوين و VLAN | 9 | 3 | 1 | 11 |
| 5 | التسمية والاختصارات | 3 | 0 | 0 | 4 |
| 6 | الطوبولوجيا في Packet Tracer | 8 | 2 | 1 | 8 |
| 7 | السويتشات: VLAN و Trunk | 8 | 1 | 0 | 8 |
| 8 | الراوتر والتوجيه بين VLAN | 7 | 1 | 1 | 8 |
| 9 | ربط الفروع: WAN و OSPF | 7 | 1 | 2 | 8 |
| 10 | الخوادم والخدمات | 7 | 1 | 3 | 8 |
| 11 | أمن الشبكة | 7 | 2 | 1 | 8 |
| 12 | الفحص وتشخيص الأعطال | 6 | 2 | 1 | 7 |
| 13 | تدقيق الكتاب مقابل الملف | 4 | 0 | 1 | 6 |
| 14 | المردود والتأمل | 5 | 0 | 0 | 5 |
| 15 | المصادر والأمانة الأكاديمية | 4 | 0 | 0 | 4 |
| 16 | المرفقات والتسليم | 4 | 0 | 1 | 5 |
| | **Total** | **92** | **13** | **14** | **100** |

75 questions are teacher-reviewed, 13 auto-marked, 4 unmarked; 2 are file questions. Weights by axis: project and
organisation (1–3) 10, planning and addressing (4–5) 15, implementation in Packet Tracer (6–10) 40, security and testing
(11–12) 15, audit, reflection and sources (13–15) 15, attachments and submission (16) 5.

Every question is asked to the whole class. Questions phrased «في مشروعك» are answered from the student's own project, so
two students' answers differ and the teacher checks them against that student's book and file. Section 13 asks the student
to compare the book with the Packet Tracer file and correct what differs.

## Roadmap

| Phase | Content |
|---|---|
| **F1** (this) | Template, validation, student projection. |
| F2 | The student's form, server side: the class's form, text, table and closed questions, draft save with a revision guard and resume, submit. No images. (`docs/enterprise-project-exam-form-f2.md`) |
| F2-UI | The student's page for the form, and the teacher's control that opens it. Split out of F2 so the write path is reviewed on its own. |
| F3 | Teacher tools: open the form for a class (the questions are frozen into the class at that moment), follow progress, rate sections, return for correction, approve. |
| F4 | Student images through the existing image sanitizer; served by the API only, to the student who owns them and the teacher. |
| F5 | Files (`.pkt`, the book), PDF export, the 883589 and 899373 question banks. |

Sequencing the later phases must handle: image and file questions are `required` in the template, so until F4 / F5 enable
those inputs the completeness check must not block a submit on them.

## Tests and mutation proof

`api/tests/project-exam-form-template-f1.test.js` (82 tests): the bundled form's size, order, weights and rubric; the keys
of the 13 auto questions pinned, and no matching or ordering question listed in the order of its key; the frozen template; the registry (form only for 794589, unknown code refused, loader takes
no path); a template file validated when read; the student view (no key at any depth, allow-list against planted fields,
no mutation of its input); 61 malformed templates refused with `httpStatus` 400; the 300-question cap; the kinds table.

Fail-first is not applicable: this phase adds behaviour and fixes no defect.

Mutation campaign (27 mutants in `exam-form.js` and `registry.js`, run in isolation, each file restored byte-for-byte by
SHA-256): **27 KILLED, 0 survived, 0 timeouts.** First run: 26 killed, 1 survivor — «duplicate section ids accepted» — because
the test's duplicate section was still refused by the question-id prefix rule; the test now renames that section's
questions too, and the mutant is killed by «a duplicate section id».

| Group | Mutants | Killed by |
|---|---|---|
| Student view leaks (whole question copied; option fields kept; section spread) | 3 | «has every question and no key», «is an allow-list» |
| Keys (key on a non-auto question; auto without key; choice / multi-choice / matching / ordering key not checked) | 9 | the matching «malformed template» cases, «a file with a broken key is refused» |
| Structure (weights ≠ 100; duplicate section / question ids; foreign question id; grading vs kind; images on any kind; rubric gaps; file types; 300 cap) | 9 | the matching «malformed template» cases |
| Loading (file returned without validation; another project's template; not frozen; any code string) | 4 | «a template file is validated when it is read», «is frozen», «the loader takes a six-digit code only» |
| Registry (unknown project → «no form»; every project gets the 794589 form) | 2 | «refuses an unknown project», «returns a form only for the project that ships one» |
