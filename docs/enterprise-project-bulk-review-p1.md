# Phase P1 — Project bulk review (التقييم الجماعي)

## Problem

Recording project progress was the teacher's heaviest manual task. The only write path was the student profile:
one student at a time, one stage at a time, three actions per stage (score, save, approve). For a class of 24 students
and project 794589 (105 stages) that is about 2,520 stage decisions, each found by scrolling a 105-row list.

## Owner decisions (recorded for this phase)

| Question | Decision |
|---|---|
| Does approval need a score? | **No.** Approving is a workflow decision; a common score is optional. |
| Order of work | P1 bulk review for the teacher first, then student self-reporting (P2) in its own PR. |
| Student self-report semantics (P2, not in this PR) | A stage the student marks as done counts immediately; the teacher can revert it. No attachment. |

## What ships

A fifth workspace view, «التقييم الجماعي», between «تقدّم الطلاب» and «الإحصائيات».

- **«بانتظار الاعتماد (n)»** — every (student, stage) pair of the class whose status is `ready_for_review`, in one list.
  Opens by default when anything waits.
- **«حسب المرحلة»** — track + stage picker (each option shows how many students wait on it), then every student of the
  class for that stage. Quick selections: all, the ready ones, the not-yet-approved ones.
- **Action bar** (sticky): «اعتماد المحدد» with an optional «علامة موحّدة», and «إرجاع إلى قيد التنفيذ» (confirmed first,
  because it removes approvals). One request per decision.
- Failed pairs stay selected with their reason; the board re-reads after every write. Archived classes show no controls.

## API (additive, `/api/project-tracker`)

| Call | Contract |
|---|---|
| `GET ?resource=board&classId=` | `{ stages (active, snapshot order), groups, students: [{ studentId, displayName, code, cells }] }`. `cells` holds only non-default entries `{ status, score }`. Same membership, tenancy and class-enrolment gates as `students`. |
| `POST { action: "progress.bulk", classId, items: [{ studentId, stageId }], status?, score? }` | One decision for ≤ 300 distinct pairs. Validation happens up front (status in the four statuses, score 0–100 or `null`, no note, at least one of status/score); a rejected body writes nothing (400). Archived class → 403. |

Each pair runs through `service.updateStudentProgress` — the same pipeline as `progress.update` (canonical membership,
active stage in the class snapshot, CAS merge of one stage entry, history event). Pairs of one student run in order
(one writer per blob); different students run with concurrency 4. Every changed pair records the same audit actions as
the single-stage path (`project.stage.approve` / `project.stage.status_change` / `project.stage.score`, with
`details.via = "progress.bulk"`) and calls the project-milestone hook. Response: per-item `results` in request order,
`totals { requested, changed, unchanged, failed }` and `readyChanged` (drives App's global ready-count refresh).

## Safety

- No grading semantics change: progress, `performance.grade`, Strength and `evaluation` are computed exactly as before
  from the same documents.
- Idempotent: repeating a decision is `changed: false` with no audit and no history.
- A foreign or departed student (`not_member`), an inactive/unknown stage (`stage_inactive`), a storage conflict or an
  invalid value fails only that pair.
- The board read is guarded by a request sequence: a slower response for a previously selected class never renders.

## Tests

- `api/tests/project-bulk-review-p1.test.js` — board projection, bulk approve, same-student multi-stage, idempotency,
  score with status, per-item failures, duplicate collapse, seven validation rejections (nothing written), archived 403.
- `src/projects/ProjectBulkReview.p1.test.tsx` — the view over the real handler: ready list, one request without a
  score, optional score + range guard, by-stage approval, confirm-before-return, failed pair kept selected (departed student and storage conflict), stale class
  response dropped, archived read-only.
- `src/projects/ProjectWorkspace.ux6.test.tsx` — the toolbar view list now includes «التقييم الجماعي».

## Mutation proof

Each mutant was planted alone, the two focused suites were run, and the file was restored byte-for-byte (sha256-checked).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | server accepts an unknown status | KILLED | rejects an unknown status with 400 |
| M2 | duplicate pairs are not collapsed | KILLED | collapses duplicate pairs to one write |
| M3 | server accepts a note | KILLED | rejects a note with 400 |
| M4 | a no-op is reported as changed | KILLED | idempotent: changes nothing, no audit |
| M5 | body with neither status nor score accepted | KILLED | rejects neither status nor score |
| M6 | board request-sequence guard removed | KILLED | never shows a slower board of the previous class |
| M7 | failed pairs are deselected | KILLED | keeps a pair the server could not save selected |
| M8 | approval always sends a score | KILLED | approves in ONE request without a score |
| M9 | «إرجاع» skips the confirmation | KILLED | asks before returning stages to in-progress |
