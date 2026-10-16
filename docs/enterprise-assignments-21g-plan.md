# Phase 21G — Assignments: enterprise workflow and teacher tenancy

**Status:** 21G.0 and 21G.1 implemented on branch `claude/nifty-clarke-k0wlid`; 21G.2–21G.7 planned. Awaiting exact-head CI, independent
review and the owner's manual merge (`AGENTS.md` §3, §13).

**Baseline:** `origin/main` `080c4df4` (merge of PR #326, the Exam Studio).

**Owner direction:** make the assignments workspace enterprise-grade, with enterprise UX. Report first, then implement the
approved plan.

---

## 1. Owner decisions

| # | Decision | Applied as |
|---|---|---|
| D1 | Start with the teacher page | 21G.2–21G.6 rebuild the teacher workspace first; the student side follows the same rules later |
| D2 | Grade release is a per-assignment setting | 21G.5 |
| D3 | After students start, only the title and instructions can be edited | 21G.0 `updateDetails` |
| D4 | One copy per class when an assignment goes to several classes | 21G.6 |
| D5 | **Each teacher has their own classes, materials and students** (full tenancy across the platform) | 21G.0, §3 |

## 2. Roadmap

| Phase | Scope |
|---|---|
| **21G.0** | Safety: teacher tenancy across the platform, edit title / instructions, draft by default, window validation |
| 21G.1 | Extract the assignments controller from `AssignmentsPanel.tsx` (no behaviour change) |
| 21G.2 | Assignments home: KPIs, progress cards, time status, all classes, **light list** (moved here from 21G.0, see §5) |
| 21G.3 | Full-width assignment page with tabs and distribution |
| 21G.4 | Professional gradebook: one status per student, bulk actions, mobile cards |
| 21G.5 | Grading flow: next student, grade release setting (D2) |
| 21G.6 | Creation wizard; one copy per class (D4) |
| 21G.7 | Reports, reminders, visual and accessibility gate |

## 3. Teacher tenancy (21G.0)

### Model

One authority, `api/src/lib/teacher-tenancy.js`, decides "may this teacher see or change this document":

- **Tenant.** In multi-user mode (`BUILDER_USERS`; a session whose signed `am` claim is `multi-user`) the tenant is the token
  subject. Legacy single-password mode has one shared identity: no tenant, nothing stamped or filtered, behaviour unchanged.
- **Owner stamp.** A document created by a tenant carries `ownerId`. Class-bound data (students, assignments, submissions,
  messages, projects, reports, analytics, photos) is accessible exactly when its **class** is; a student created in a class also
  carries the class's `ownerId`. `ownerId` never changes after creation, so one pre-check per request is enough.
- **Not found, not forbidden.** Another teacher's resource is answered exactly like a missing one (same status, same body).
- **Pre-tenancy data.** A document without `ownerId` belongs to `LEGACY_DATA_OWNER` when that server setting names a teacher
  subject. While it is unset, unowned documents stay **shared** (visible to every teacher, as before). Nothing is ever claimed
  silently; saved exams keep the 21F.0 claim-on-save rule (D2 of 21F) only while `LEGACY_DATA_OWNER` is unset.
- **Question bank.** The official generated bank (sources `791381-20xx` / `791367-20xx`, exam codes 791381 / 791367) is the shared
  library every teacher reads. Every other question (entered by hand, imported from a file) belongs to the teacher who added it:
  `ownerId` on the question and on its index entry (`api/src/lib/bank-tenancy.js`).

### Operator note: `LEGACY_DATA_OWNER`

Classes, students, assignments, saved exams, templates and bank questions created before 21G.0 have no owner. Once more than one
teacher signs in with `BUILDER_USERS`, the owner (the operator) decides who owns that data by setting the API application setting
`LEGACY_DATA_OWNER` to that teacher's `BUILDER_USERS` key (for example `teacher-author`). Agents never change Azure settings
(`AGENTS.md` §2, §11); this is an operator step. Until it is set, the old data stays visible to every teacher.

### Endpoint registry

`api/tests/tenancy-registry-21g0.test.js` classifies **every** module that calls `requireBuilderAuth` exactly once, and requires
the guard's evidence in every class-scoped and teacher-owned one. A new endpoint without a decision fails the root suite.

| Class | Endpoints | Rule |
|---|---|---|
| Class-scoped | classes, students, assignments, results, review, item analysis, coding regrade / bulk retry, reports, Today hub, achievement feed, messages, project tracker, legacy 794589 route, live game sessions, analytics (and AI analytics), student photos | the class decides |
| Teacher-owned | saved exams, save artifact, templates, assessment presets, simulators, mesh assets, teacher profile, live challenges, audit history, bank questions / select / replace / summary / generate-exam / question availability, bank import, import upload / fetch-url / analyze | the owner decides |
| Shared by design | exam library (official), exam governance and its inbox (a review workflow across teachers), learning materials catalog, learning study / training (course content) | everyone |
| Operator | assignment-index control, build-bank-2025, classify-bank-batch, classify-question-preview, import-html-exam, inspect-html, storage-status | **need an admin role** (open item, §6) |
| Stateless | AI composer / author / scenario / instruction analysis / quality fix / structured fix / question action / image, number-conversion preview, exam-request interpretation | no stored teacher data |

Student-facing endpoints (`student-*`, `platform-session`, `coding-run`) are untouched: a student only ever reaches their own class.

## 4. Other 21G.0 changes

- **Edit title and instructions** (D3): API action `updateDetails`; only those two fields change; archived assignments are
  read-only; menu item «تعديل العنوان والتعليمات» with a dialog.
- **Draft by default:** «نشر مباشرة» is off in the composer; the hint says what the choice means for students.
- **Window validation:** a deadline at or before the opening time, or an unreadable date, blocks «إنشاء الواجب» at its field
  (`role=alert`, `aria-invalid`, `aria-describedby`); a deadline in the past is a non-blocking warning.
- **Defects found and fixed on the way:**
  - the saved-exam list (100) and template list (150) capped the number of **examined** blobs across all teachers, so a teacher
    whose documents sorted late saw nothing; the page now counts the teacher's own documents within a 2,000 scan bound;
  - two templates saved in the same millisecond with titles the slug reduces alike got the same blob name (the second overwrote
    the first, across teachers too); the name now carries a random part;
  - a template load of a missing blob answered 500; it now answers 404 «القالب غير موجود.».

## 5. Deviation from the plan

The **light assignment list** (a summary index instead of downloading every assignment document) moved from 21G.0 to 21G.2.
Doing it safely needs a per-class summary that every write path (create, status, attempts, timing, details, archive, restore,
purge) keeps in step, with a self-healing read; the 21G.2 home rebuilds the list and its data needs anyway. Tenancy already limits
what a teacher receives; the remaining cost is server-side reads.

## 6. Known limitations and open items

- **Operator tools need an admin role.** They rewrite platform-wide state (the bank index, the assignment-index switch), so
  filtering them per teacher would drop other teachers' data. Until a role exists, any signed-in teacher can call them.
- **Identity numbers stay globally unique** across teachers (a student identity is a platform identity); only the duplicate
  message is generic, so it never reveals another teacher's student or class.
- **Saved-exam ids** are client-generated; a collision with another teacher's exam id is refused with 403 (21F.0 behaviour), which
  tells the caller the id exists.
- **Audit history** is filtered to the teacher's own actions within the existing read window (`HARD_MAX`).
- `generate-exam`, `bank-summary`, `exam-question-availability` and the import handlers have no dependency seam; their filters
  are covered by the registry guard and by code review, not by handler tests. The shared helpers they call are tested.
- Governance stays shared by design (reviewers act on other teachers' exams).

## 7. Implementation record and evidence (21G.0)

Commits (normal commits on `claude/nifty-clarke-k0wlid`): `1a53d9da` core, `151d433d` derived data, `b56e2143` lint fix,
`23e23548` question bank, `1033b470` content / imports / 794589 / registry, `1f85b249` + `87e255d3` mutation campaign and test
fix, `5454c33d` draft default and window validation, `b6b51ed8` edit title and instructions, `bb728fb4` this record, `aeccd920` the
row-menu test update the full suite found.

### Fail-first (tests copied into a detached worktree of `080c4df4`)

| Test file | Head | Baseline `080c4df4` |
|---|---|---|
| `api/tests/teacher-tenancy-21g0.test.js` | 19 / 19 | 18 fail; the legacy-mode case passes (a **pin**) |
| `api/tests/bank-tenancy-21g0.test.js` | 8 / 8 | 8 fail (7 assertions; the import case fails on the then-missing export) |
| `api/tests/content-tenancy-21g0.test.js` | 5 / 5 | 5 fail |
| `api/tests/assignment-details-21g0.test.js` | 4 / 4 | 3 fail (400 unknown action); the validation case passes (a **pin**) |
| `src/AssignmentsPanel.ux5.test.tsx` (composer, edit) | 24 / 24 | composer case fails (no window alert); edit case fails (no menu item) |
| `src/assignments/assignmentWindow.21g0.test.tsx` | 7 / 7 | new module (not applicable) |
| `api/tests/tenancy-registry-21g0.test.js` | 3 / 3 | guard (not applicable) |

### Mutation (`node scripts/mutate-21g.mjs g0`)

32 mutants, **32 KILLED**, every file restored byte-for-byte (sha256), `git status` clean. G0-M11 (review gate removed) first
**SURVIVED**: the test asked for a paper that did not exist, so every teacher got 404. The test now seeds a real submission; the
isolated re-run is KILLED. The 21F campaign's F0-M4 now targets the owner check where it lives after 21G.0.

| Id | Planted defect | Result |
|---|---|---|
| G0-M1–M5 | no tenant; owner comparison removed; `LEGACY_DATA_OWNER` ignored; no owner stamp; student stamp ignored | KILLED |
| G0-M6–M14 | class list / class actions / students / assignment actions / create in another class / paper review / messages / reports / 794589 unguarded | KILLED (M11 after the test fix) |
| G0-M15–M23 | bank list / change / dangling heal / re-used key / index owner / official sharing / insert / replace / duplicate check | KILLED |
| G0-M24–M29 | template list / load / delete; saved-exam page counting; saved exams ignore legacy owner; template name collision | KILLED |
| G0-M30–M32 | archived assignment editable; empty title accepted; title edit rewrites instructions | KILLED |

### Validation

Recorded per head in the PR; the exact-head rule (`AGENTS.md` §6) applies to the final head only.

### Deployment tier

Tier 1 (local tests) only. Nothing deployed; no Azure setting changed; `LEGACY_DATA_OWNER` is not set by any agent.

## 8. Implementation record and evidence (21G.1)

**Scope:** no behaviour change. `src/AssignmentsPanel.tsx` held the whole workspace in one 497-line component (state, requests,
rules and layout). It is now the 81-line view; the logic moved unchanged into:

| File | Holds |
|---|---|
| `src/assignments/useAssignmentsController.ts` | list and master scope, create, every assignment action, the sequenced results read, gradebook and row actions, item analysis, coding bulk retry, the 12B drill-in, the focus discipline of the non-modal areas |
| `src/assignments/useAssignmentComposer.ts` | content source (open exam / saved exam / 791381 library), library browser, composer fields |
| `src/assignments/assignmentsView.ts` | pure rules: master scope, `rowGrading` (shared resolver), gradebook rows, item-analysis order and summary, the drill view (`drillViewFor`) |
| `src/assignments/assignmentsApi.ts` | the one request helper and date formatting |

The view owns the three focus anchors (refs) and passes them in, so the controller's result holds no refs (the React Compiler lint
otherwise flags every read of it). These are the pieces 21G.2–21G.6 build on.

**Source guards follow the code.** Two guards read the panel's source text. They now read the files the code moved to, with the
same assertions: the ux5 accessibility guard (rowGrading through the shared resolver, `useConfirm`, the purge typed-title body, the
impact-first archive), and the single-grading-resolver guard (the view file must delegate; the panel and the controller join the
no-local-rule surfaces). `scripts/mutate-21e2.mjs` G1-filtered-rows targets the new export line.

| Evidence | Result on `23d91d20` |
|---|---|
| Existing AssignmentsPanel / drill / lifecycle / export / timing / review / coding suites | pass with no change to their test files (245 tests in 20 files, guards included) |
| New: `assignmentsView.21g1`, `assignmentsApi.21g1`, `useAssignmentsController.21g1` | 11, 3 and 2 tests |
| Full root suite + build | 1,045 files / 13,096 tests; initial JS 114.1 KB gzip (budget 125 KB) |
| tsc / lint | clean / 125 (the panel's four effect warnings now sit in the hooks) |
| Real Chromium, list / detail / composer at 1440 and 390 px against the 21G.0 head | identical except the clock-dependent date text, which differs the same way between two runs of one build |
| Mutation `node scripts/mutate-21g.mjs g1` | 14 mutants, **14 KILLED** (G1-M13 first SURVIVED: the create() window guard sits behind a disabled button, so no view test reached it; the hook test now does, isolated re-run KILLED); 21E2 G1-filtered-rows re-run: KILLED |

Fail-first does not apply (no defect fixed; a refactor is proven by the unchanged suites). Deployment tier: 1 (local) only.
