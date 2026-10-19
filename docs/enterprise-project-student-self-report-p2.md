# Phase P2 — Student self-report of completed project stages

## Problem

After P1 the teacher could approve many stages at once, but every stage still had to be found and marked by the teacher
first. The students know which stages they finished; the platform gave them no way to say so (the student project view
was read-only).

## Owner decisions (recorded for this phase)

| Question | Decision |
|---|---|
| What happens when a student marks a stage done? | It **counts immediately** (status `approved`), flagged as the student's own until the teacher confirms or cancels it. |
| Attachment / evidence | **None.** |
| Score | The student never sets a score; approval needs no score (P1 decision). |

## Data model (additive, same progress document)

A self-reported stage entry: `{ status: "approved", approvedAt, approvedBy: <studentId>, selfReportedAt, selfReportedBy,
selfReportedFrom }` plus a history event `{ type: "status", source: "student", actor: <studentId> }`. Progress, grade,
Strength and evaluation read the same fields as before, so a self-reported stage counts exactly like an approved one.
No migration: older documents simply have no `selfReported*` fields.

| Who | Action | Result |
|---|---|---|
| Student | mark a stage that is not approved | `approved` + `selfReported*` (`selfReportedFrom` = previous status) |
| Student | mark an approved stage (any) | no change |
| Student | undo their own **unconfirmed** mark | back to `selfReportedFrom`; approval and self-report stamps removed; teacher score / note kept |
| Student | undo a teacher-approved / confirmed stage | refused per item (`teacher_approved`) |
| Teacher | approve a self-reported stage (single or bulk) | **confirmation**: stamps cleared, `approvedBy` = teacher, history `verified: true`, audit `project.stage.approve` with `verifiedSelfReport: true` |
| Teacher | any other status on it | cancels the self-report (stamps cleared) |
| Teacher | score / note only | the stage stays flagged as the student's own |

The engine change is confined to `applyProgressUpdate` (teacher writer): every status write clears `selfReported*`,
and re-approving a self-reported stage is a real change (`outcome.verified`) instead of NO_CHANGE.

## API

`POST /api/student-project-tracker` `{ projectCode, stageIds: [...], mark: true | false }` (the GET is unchanged).

- Student and class come only from `requireActiveStudentSession`; a body `studentId` / `classId` is ignored.
- The project must be one the class runs (400); the class must be active (403); 1–60 non-empty stage ids (400).
- Canonical class membership is re-checked; only stages active in the class snapshot are written (others →
  `stage_inactive`); all stages of one request are applied in **one** CAS write. Response: per-stage `results` + `changed`.
- One audit event per request that changed something (`project.stage.self_report` / `project.stage.self_report_undo`,
  actor = student) and the existing project-milestone hook.

Teacher side: the `board` cell carries `selfReported: true`; `progress.update` and `progress.bulk` audit confirmations.

## UI

- **Student** («مشاريعي» → project): «تحديد المراحل التي أنجزتها» opens a marking mode (checkboxes only on stages not yet
  approved), «حفظ كمنفّذة» saves them in one request. Marked stages show «منفّذة — بانتظار تأكيد المعلم» with «تراجع».
  *Superseded by P3* (`docs/enterprise-project-student-one-tap-p3.md`): the marking mode became one tap per stage
  («أنجزتها»); the request, the server rules and «تراجع» are unchanged.
  The default view has no inputs. The single write lives in `src/projects/studentSelfReport.ts`.
- **Teacher**: «التقييم الجماعي» gains «حدّدها الطلاب (n)» (opens by default when nothing is waiting for review) with
  «تأكيد المحدد» / «إرجاع إلى قيد التنفيذ», plus «تحديد ما حدّده الطلاب» in «حسب المرحلة». The student profile shows a
  «حدّدها الطالب» badge, a «تأكيد» button, and the timeline names student marks and teacher confirmations.

## Known consequences and limits

- Because marks count immediately, progress, the project rank, the global Strength and project milestones (which may
  be shared to the class feed per the student's privacy setting) move as soon as the student marks — as decided.
- The sidebar / hub ready-for-review badge still counts only `ready_for_review`; students' marks appear in
  «حدّدها الطلاب». Surfacing them in the hub is a possible follow-up.
- The legacy `project-794589` teacher route still works and clears self-reports on any status write, but does not
  record the `verifiedSelfReport` audit detail (the UI does not use that route).

## Tests

- `api/tests/project-self-report-p2.test.js` — marking, idempotency, undo restoring the previous status and keeping a
  teacher score, teacher-approved stages untouchable, session-only identity, inactive stages, five validation
  rejections, archived 403 / not-enrolled 400, teacher confirmation (single + bulk) and cancellation, score keeps the flag,
  pure-function edge cases.
- `src/projects/StudentSelfReport.p2.test.tsx` — the student flow and the teacher confirmation over the real handlers.
- `src/StudentPortal.ux7a.test.tsx` — new source guard: the only student project write lives in
  `studentSelfReport.ts` and sends just `{ projectCode, stageIds, mark }`.

## Mutation proof

Each mutant planted alone; the P1 + P2 focused suites run; the file restored byte-for-byte (sha256-checked).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| N1 | student may undo a teacher-approved stage | KILLED | never changes or undoes a stage the teacher approved |
| N2 | student mark overwrites an approved stage | KILLED | idempotent marking; teacher-approved untouched |
| N3 | archived-class 403 removed | KILLED | archived 403 (API) + refusal shown (UI) |
| N4 | body `studentId` honoured | KILLED | writes only the session student's own document |
| N5 | project-runs-in-class check removed | KILLED | rejects a project the class does not run |
| N6 | teacher re-approval not treated as confirmation | KILLED | re-approving confirms; bulk-confirm |
| N7 | teacher status write keeps the self-report stamps | KILLED | confirmation clears stamps; bulk-cancel |
| N8 | inactive / unknown stages written | KILLED | inactive stage reported, not written |
| N9 | checkbox offered on an approved stage | KILLED | never offers a teacher-approved stage |
| N10 | any approved stage shown as the student's own | KILLED | marking flow; undo flow |
| N11 | non-boolean `mark` accepted | KILLED | rejects a non-boolean mark |
