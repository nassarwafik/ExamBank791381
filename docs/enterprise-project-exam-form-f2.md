# Phase F2 — Project exam form: the student's answers (server side)

## Problem

F1 (`docs/enterprise-project-exam-form-f1.md`) added the 794589 form as data. Nothing could be answered: there was no
place to store a class's form or a student's answers, and no route. This phase adds the server side of the student's form:
the teacher opens the form for a class, each student saves a draft as they go, resumes it later, and submits once.

## Scope

| In this phase | Not in this phase |
|---|---|
| The class's form (open / closed, questions frozen at the first open) | The student's page and the teacher's control — **F2-UI**, the next phase |
| One answers document per student: draft save, resume, submit | Marking, returning a form, approval, results — F3 |
| The student route and two teacher actions on the existing teacher route | Student images — F4; files — F5 |

F1's roadmap listed the student's page inside F2. It is split out: this phase carries every write rule and its proofs and
changes no screen, so the review of the write path is not mixed with interface work. The form stays unreachable for users
until F2-UI ships a control that opens it.

## Owner decisions applied here

| Decision (2026-11-14) | How this phase implements it |
|---|---|
| No time limit; the student continues in a later lesson | No timer and no automatic close. A draft is saved per question as the student goes; a read returns the saved answers and the revision to continue from. |
| One explicit submit | `submit` needs every required, answerable question answered and locks the document for the student. |
| Edits after submit only when the teacher returns the form | A submitted document refuses every student write (`409 FORM_SUBMITTED`). Returning it is F3. |
| Results after the teacher approves | Nothing is marked and no result is computed or returned here. |
| Images in F4, files in F5 | Questions of kind `image` and `file` are shown, refuse an answer (`KIND_NOT_AVAILABLE`), are counted apart (`deferred`) and never block a submit. A `cli` question's image part waits for F4; its text is answerable now. |

## Storage (new documents, every project under its own prefix)

| Document | Blob | Shape |
|---|---|---|
| Class form | `platform/project-exam-forms/<code>/classes/<classId>.json` | `{ schemaVersion, projectCode, classId, state: "open" \| "closed", formVersion, template, openedAt, openedBy, closedAt?, reopenedAt?, updatedAt }` |
| Student answers | `platform/project-exam-forms/<code>/answers/<classId>/<studentId>.json` | `{ schemaVersion, projectCode, classId, studentId, formVersion, status: "draft" \| "submitted", answers, revision, startedAt, updatedAt, submittedAt }` |

- `template` is the whole F1 template, **answer keys included**, copied at the first open. It is server-side only. A later
  open after a close keeps it, so saved answers always match the questions the student saw.
- 794589's tracker documents keep their legacy un-namespaced paths; these documents are new, so 794589 uses the
  project-scoped prefix like every other project. No existing document is read differently, moved or deleted.
- `project.reset` does not touch these documents (no deletion without the owner's decision). What a reset means for a
  class's form is an F3 question.

Stored answers, one per question id, rebuilt from the fields the question allows:

| Kind | Stored answer | Counts as answered when |
|---|---|---|
| `shortText`, `paragraph`, `cli` | `{ text }` (≤ the question's `maxLength`) | the text is not blank |
| `table` | `{ rows: [{ <columnId>: text }] }` — filled rows only, every column present, cell ≤ 300 | rows ≥ `minRows` |
| `choice` | `{ optionId, justification? }` (justification ≤ 1000, only where the question asks) | an option is chosen, and the justification is written where asked |
| `multiChoice` | `{ optionIds }` in the question's order | at least one |
| `matching` | `{ pairs: { leftId: rightId } }` | every left item is paired |
| `ordering` | `{ order }` — a full permutation | present |
| `scale` | `{ values: { itemId: n } }` within `min`–`max` | every item is rated |
| `checklist` | `{ checked }` in the question's order | at least one |
| `declaration` | `{ accepted: true }` | accepted |

An empty answer is stored as nothing (the key is removed), never as an empty shell.

## API

**Student** — `api/src/functions/student-project-exam-form.js`, route `student-project-exam-form`:

| Call | Result |
|---|---|
| `GET ?projectCode=` | `{ available: false }` until the class's form was opened; otherwise `{ available, state, form, answers, revision, status, submittedAt, updatedAt, progress: { total, answered, deferred, missing[] }, deferredKinds }` (+ `readOnly` for an archived class) |
| `POST { projectCode, action: "saveDraft", baseRevision, answers: { questionId: answer \| null } }` | merges the listed questions (null clears one), `revision + 1`; the same body as the GET plus `changed` |
| `POST { projectCode, action: "submit", baseRevision }` | `status: "submitted"`, audited `project.exam_form.submit` |

- The student and the class come only from `requireActiveStudentSession`: the class is the one that serves the project for
  that student (`lib/project-tracker/student-project-classes.js`, the resolution the tracker route already used, now shared).
  A body `classId` / `studentId` is never read.
- `form` is `toStudentView(template)`: no answer key, rubric or weight.
- Refusals, each writing nothing: project not run by the class `400`; archived class `403` (reads stay); form never opened
  `404 FORM_NOT_OPENED`; closed `409 FORM_CLOSED`; submitted `409 FORM_SUBMITTED`; an older `baseRevision` `409 DRAFT_STALE`;
  another form version `409 FORM_VERSION_CHANGED`; an answer the question does not allow `400`; incomplete submit
  `400 FORM_INCOMPLETE` with `missing[]`; a storage conflict `503` (retryable); a stored class form that fails validation
  `503 FORM_UNREADABLE`.

**Teacher** — `api/src/functions/project-tracker.js` (existing capabilities: `GET` → `projects.tracker.view`, every action
→ `projects.tracker.manage`; tenancy and the archived-class refusal are the route's existing checks):

| Call | Result |
|---|---|
| `GET resource=exam-form` | `{ examForm: { hasForm, state: "none" \| "open" \| "closed", formVersion, openedAt, closedAt, summary } }` |
| `POST action=examForm.open` | first open freezes the bundled form into the class; audited `project.exam_form.open` (`firstOpen`) only when the state changed |
| `POST action=examForm.close` | students keep reading and can no longer write; nothing is deleted; audited `project.exam_form.close` |

## Safety

- **Durability.** Every write is one CAS round (`mutateJsonWithRetry`). A patch is all-or-nothing: one refused answer
  refuses the whole request. `baseRevision` must equal the stored revision, so a page that missed a newer save (another
  device or tab) cannot overwrite it; a save that lands inside another save's write window is refused on the retry.
- **Fail closed.** The class form is validated on every use; one this code cannot trust is a `503`, never shown and never
  written against. The class form is read again inside the write's CAS round, so a form closed meanwhile refuses the write.
- **Keys.** The stored class form never leaves the server; the student body is built from `toStudentView` and the
  student's own answers.
- **Allow-list answers.** An answer is rebuilt from known fields; an unknown key is dropped, an unknown option, column or
  question is refused.
- **Grading safety.** Nothing here produces a mark, a zero or a "no answer": a form that was never submitted is simply a
  draft, and a technical failure is a retryable `503` that loses nothing saved before it.
- **Access.** No new teacher route file: the two actions sit behind the existing capability check. The student route needs
  a valid student session (the route-inventory guard rejects it anonymously like every student route).

## Tests and mutation proof

`api/tests/project-exam-form-student-f2.test.js` — 55 tests: open / close and their audits; the frozen questions surviving
a close and reopen; the student read (no key at any depth); draft save, merge, clear, resume; the stale-revision guard and
the in-window race; identity from the session only; 24 answers a question does not allow; closed, archived and untrusted
forms; incomplete, complete and repeated submits; isolation between students; the pure answer rules.

Fail-first is not applicable: new behaviour, no defect fixed.

Mutation campaign (33 mutants across `exam-form-answers.js`, `exam-form-service.js`, the student route and the teacher
route; run alone; files restored byte-for-byte by SHA-256): **33 KILLED, 0 survived, 0 timeouts**, on the first run.

| Group | Mutants |
|---|---|
| Answer rules (length, option / column / question membership, scale, ordering, justification, allow-list, minimum rows) | 13 |
| Write guards (stale revision ×2, submitted lock ×2, form version, revision advance, missing required questions, deferred kinds) | 7 |
| Service (closed form writable, untrusted form accepted, membership dropped, reopen replaces the frozen questions, keys sent to the student, close does not close, project with no form, class form not re-read) | 8 |
| Routes (archived class writable, submit audit, read-only flag, repeated-open audit, close audited as open) | 5 |

Not mutated: the 120-question cap of one patch is defence in depth — a patch can only exceed it with ids that are not in the
form, which the unknown-question rule already refuses.
