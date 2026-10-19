# Phase P6 — The teacher sees and confirms the students' own marks

## Problem

Since P2/P3 a student marks a finished stage in one tap: it counts at once and waits for the teacher's confirmation.
The teacher could find those marks only inside «التقييم الجماعي» → «حدّدها الطلاب»:

- the sidebar badge, the hub card and the student cards counted only stages «جاهزة للفحص»;
- a class could hold dozens of student marks with no sign anywhere;
- the waiting lists were flat (one row per student × stage), so confirming one student or one stage meant ticking rows
  by hand.

## Owner decisions (recorded for this phase)

| Question | Decision |
|---|---|
| Scope | Items 1 and 2 of the projects review: surface the marks, then group the waiting lists with one-tap decisions. |
| Status grid («جدول الاعتماد»), student notifications, «حفظ واعتماد», a student comment | **Not in P6.** |

## What ships

### 1. The marks are visible wherever the teacher looks

- **Sidebar «المشاريع» badge:** stages ready for review **plus** the students' marks. Its accessible text reads «… مراحل
  بانتظار الفحص أو التأكيد» when marks are counted.
- **Hub card:** a second badge, «n حدّدها الطلاب بانتظار تأكيدك».
- **Workspace class selector:** each active class shows its figures, «(1 بانتظار الفحص · 4 حدّدها الطلاب)».
- **«التقييم الجماعي» tab:** carries the selected class's total.
- **«لوحة المشروع»:**
  - a «حدّدها الطلاب» card (shown only when there are marks), with the number of students;
  - two shortcuts, «فحص المراحل الجاهزة (n)» and «تأكيد ما حدّده الطلاب (n)», that open «التقييم الجماعي» on that list.
- **Student cards:** «حدّدها الطالب n», and a «حدّدوا مراحل» filter.

### 2. Confirming in a few taps

The «بانتظار الاعتماد» and «حدّدها الطلاب» lists:

- **Grouping:** «بالطلاب» (the default) or «بالمراحل».
  - Stages are ordered track by track, then by their order inside the track.
  - Each group shows its count and carries one button: «تأكيد مراحل أحمد (3)» or «تأكيد B01 للجميع (5)» («اعتماد …» on
    the ready list).
- **Track filter:** «كل المسارات (n) / الكتاب (n) / Access (n)» narrows the list, the selection and the counts.
- **«تأكيد الكل (n)» / «اعتماد الكل (n)»:** asks first, naming the number of stages and students and the optional
  common score. It confirms only what is shown, so the track filter applies.
- **Unchanged:** the row checkboxes and «تأكيد المحدد» / «إرجاع إلى قيد التنفيذ» work as before.
- **One request per decision:** every decision is ONE `progress.bulk` request through the canonical per-pair pipeline
  (P1).

## API (additive, `/api/project-tracker`)

**`GET resource=projects-summary&include=attention`** adds:
- `totalSelfReported`;
- `selfReportedByProject`;
- `byClass: { [projectCode]: { [classId]: { ready, selfReported } } }`, listing only active classes with something waiting.

Without `include=attention` the body is byte-for-byte the previous one, as pinned by the R33 golden parity suite.

**Counting rules** (the same as the ready badge): a mark is an `approved` entry with a non-empty `selfReportedAt`,
counted only when all of these hold:
- the student is a current member of the class;
- the stage is active in the class snapshot;
- the class is active.

**Other additions:**
- **`resource=summary`:** gains `studentsSelfReported` and `totalSelfReportedStages`, only when there are marks.
- **`resource=students`:** each card gains `selfReportedCount`, only when the student has marks.
- **`progress.bulk`:** `readyChanged` is also `true` when a student's mark was confirmed (`outcome.verified`), so App
  re-reads the summary and the badges follow the server.

## Safety

- **Nothing is written by the new reads.** The counts are server-derived; the client never recomputes them.
- **Confirming is unchanged.** It is the P2 teacher approval (stamps cleared, audit `project.stage.approve` with
  `verifiedSelfReport: true`).
- **The summary is still read on its 8E-1 triggers only.** These are the session start, entering Projects, and a
  status-changing mutation, which now includes a confirmation.
- **Archived classes:** no shortcuts and no tab count.

## Tests

- **`api/tests/project-attention-p6.test.js` (5):**
  - totals per project and per class (members only, active stages only, a stage deactivated in the class settings ignored, archived class excluded);
  - the default body unchanged (pin);
  - a confirmation and a return reduce the count and report `readyChanged`;
  - the class summary;
  - cards carry the figure only when non-zero.
- **`src/projects/ProjectAttention.p6.test.tsx` (8, over the real handler):**
  - the summary parser;
  - the sidebar badge and the hub card;
  - the class selector, the tab count and the dashboard shortcut;
  - the student cards and their filter;
  - grouping by student with a one-group confirmation (one request, only that student, badges refresh);
  - grouping by stage;
  - the track filter and «تأكيد الكل» (cancel sends nothing; confirm sends only what is shown);
  - the grouped ready list.
- **Updated deliberately:**
  - `ProjectBulkReview.p1.test.tsx` counts the rows of the grouped ready list by their checkboxes (same three stages).
  - `AppShell.test.tsx`, `AppProjectsReady.ux6.test.tsx` and `AppProjectsReady.8e.test.tsx` pin the summary URL, which now
    carries `&include=attention`. They still require exactly one read per trigger.
- **Fail-first on `ff61e730`:**
  - API: 4 of 5 failed; the default-body case is a pin.
  - UI: the file could not load (no `projectAttention` module). Without the parser case and its import, 7 of 7 failed:
    no badge sum, no class figures, no card figure, no grouped list.
- **Real Chromium** (`scripts/check-project-attention-browser-p6.mjs`, run locally): the production build and the real
  API in process, with a class of 24 students. Before each viewport, 6 students mark stages through their own
  `/api/student-project-tracker` session. At 390 (touch), 1024 and 1440 px, all checks pass:
  - the badge and the hub card show the server's count;
  - the class option and the tab carry the class figures;
  - the shortcut opens «حدّدها الطلاب», grouped by student (as many groups as students with marks);
  - no page overflow, and group buttons are 44 px on touch;
  - one group confirmation sends ONE `progress.bulk` with that student's stages, confirmed in storage, and the badge follows;
  - axe finds no serious or critical violation on the dashboard or the grouped list.

## Mutation proof

Hash-verified script; each mutant was planted alone and every file was restored byte-for-byte. **17 / 17 KILLED.**

| Id | Planted defect | Result |
|---|---|---|
| N01 | summary counts marks of non-members | KILLED |
| N02 | summary counts inactive stages | KILLED |
| N03 | attention figures never returned | KILLED |
| N04 | a card counts inactive stages | KILLED after strengthening: SURVIVED first because the test's inactive stage was not in the definition; the fixture now deactivates a real stage in the class settings |
| N05 | a confirmation does not refresh the badges | KILLED |
| N06 | sidebar badge ignores the marks | KILLED |
| N07 | hub card hides the marks | KILLED |
| N08 | class selector without figures | KILLED |
| N09 | dashboard shortcut opens the wrong list | KILLED |
| N10 | a group button confirms every visible stage | KILLED |
| N11 | «تأكيد الكل» without confirmation | KILLED |
| N12 | track filter ignored | KILLED |
| N13 | «حدّدوا مراحل» lists everyone | KILLED |
| N14 | stage grouping groups by student | KILLED |
| N15 | «تأكيد الكل» ignores the track filter | KILLED |
| N16 | App does not ask for the attention figures | KILLED |
| N17 | the student card hides its marks | KILLED |

## Known limits

- **Freshness:** the figures are as fresh as App's summary read (8E-1 triggers). A mark a student makes while the
  teacher stays inside Projects shows after re-entering Projects or after the teacher's next status change.
- **Ready-stage figures per class:** `byClass` is only requested with `include=attention`. Older callers keep the
  project totals.
- **Not in P6:**
  - the status grid «جدول الاعتماد»;
  - student notifications when the teacher confirms or returns a mark;
  - «حفظ واعتماد»;
  - a student comment on a mark.
- **No CI workflow:** the real-browser gate is a local certification script, as in P3/P4.
