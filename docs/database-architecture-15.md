# Phase 15 — Relational database and multi-school tenancy

Baseline: `b9e45e8` (merge of PR #226 / Phase 14A, server publishing governance).
This document is the design for the whole of Phase 15. Phase 15A (this branch, `feature/15a-database-foundation`)
only lays the foundation: schema, database client, migration runner, and a read-only backfill with a dry-run report.
**No endpoint reads or writes the database in 15A. Production behaviour is unchanged.**

## 1. Decisions (Wafik, 2026-09-30)

| Question | Decision |
|---|---|
| Scope of growth | **Several schools.** Each school has its own administrators and teachers; one platform administrator above all schools. A teacher may work in more than one school. |
| Students and classes | **A student may be enrolled in several classes** of different teachers (e.g. networking and physics) with one account. |
| Question bank | **Shared + private.** An official bank per course, readable by every teacher; each teacher also owns private questions, and may share them with their school. |
| Engine | **Relational: Azure SQL Database** (serverless). Large payloads stay as JSON columns; binary files stay in Blob Storage. |

## 2. Why the current storage does not scale to many teachers

Everything is a JSON blob in the `bank` container (inventory in §7). That was a sound choice for one teacher, and the
code compensates carefully for what Blob Storage lacks — but each compensation is a cost we would multiply by every
new teacher:

- **Single-teacher assumptions are structural, not cosmetic.**
  - The teacher logs in with one environment password (`BUILDER_PASSWORD`); there are no teacher records.
  - Classes, assignments, submissions, saved exams, templates, the bank and projects carry **no owner field**, so every
    teacher-authenticated route sees everything (README, "Single-teacher model").
  - A student belongs to exactly one class (`user.classId` is the membership authority).
- **No queries.** Teacher Today, reports, analytics, the student list and the project tracker list and download every
  class, every user, and whole submission folders on each request (`docs/read-cost-baseline-12e.md`). With N teachers
  this becomes N× the data on every request of every teacher, unless every scan is also filtered by owner in code.
- **No transactions.** Multi-document invariants are held together by ETag compare-and-swap
  (`mutateJsonWithRetry`), blob leases (`assignment-lock.js`, `student-credential-lock.js`, `login-throttle.js`) and
  repairable denormalized indexes (`class-roster-index.js`, `class-assignment-index.js` with its migrating /
  authoritative control document). In a database these become a transaction and a foreign key.
- **Unbounded prefixes.** `audit-history.js` lists every audit blob; the teacher unread summary lists all of
  `platform/messages/direct/`.

## 3. Tenancy and access model

```
platform admin
  └─ school ──< school_memberships >── user (role: school_admin | teacher | student)
        └─ class ──< class_teachers >── teacher (owner | co_teacher)
              └──< enrollments >── student
              └──< assignments ──< submissions ──< attempts
```

| Actor | Sees / manages |
|---|---|
| Platform admin (`users.is_platform_admin`) | Everything; creates schools and school admins; curates the **official** bank. |
| School admin | All classes, teachers and students of **their** school(s); creates teacher accounts; school-level reports. |
| Teacher | Classes where they are in `class_teachers`, the students enrolled in those classes, and the assignments, submissions, messages, projects and games of those classes. The official bank, their school's shared questions, and their own private questions and exams. |
| Student | Their own record; the classes they are enrolled in (active enrollments) and everything published to those classes. |

**Enforcement.** Every data-access function takes an explicit `AccessContext { userId, schoolIds, role,
isPlatformAdmin }` built from the verified token — never from a body or query field, same rule as today's
`teacher-profile.js`. Scoping is part of the SQL (`JOIN class_teachers … WHERE teacher_user_id = @userId`), so an
unscoped read cannot be written by accident. Every phase adds cross-tenant tests: teacher A must get 404 for
teacher B's class, assignment, submission, student, message and exam. Azure SQL row-level security
(`SESSION_CONTEXT('school_id')`) is a later, optional defence in depth — not the primary control.

**Tokens.** Teacher tokens today carry `sub = BUILDER_USER_CODE`. From 15B the token carries `sub = user_id`, `role`,
and the school id(s). The existing teacher becomes an ordinary teacher user (and platform admin) whose `login_code`
is the current `BUILDER_USER_CODE`, so the old `sub` maps to exactly one user during the switch.

## 4. What stays where

| Stays in Blob Storage | Moves to Azure SQL |
|---|---|
| Question images (`assets`), raw imports and import-job state (`raw`), profile photos (`platform/*-profile-images/`) — the database stores only the blob key | All platform documents under `platform/`, the question bank (`index/`, `sources/`), saved exams (`exams/`) and templates (`templates/`) |

Read-only content bundled with the code stays in the code: `api/src/data/exam-library`, `learning-study`, and the
project default templates. They are versioned with the application, not data.

## 5. Schema

The schema lives in `api/db/migrations/` as ordered T-SQL files, applied by `api/scripts/db-migrate.js`, recorded
in `dbo.schema_migrations` with a SHA-256 checksum (an edited, already-applied file is refused — changes go in a new
file). All tables are created in 15A so the whole design can be reviewed as code; they stay empty until their phase.

| File | Tables |
|---|---|
| `0001_tenancy_identity.sql` | `schools`, `users`, `user_credentials`, `school_memberships`, `login_throttle` |
| `0002_courses_classes.sql` | `courses` (seeded with 791381, 794589, 883589, 899373), `classes`, `class_teachers`, `class_programs`, `class_learning_courses`, `enrollments` |
| `0003_assessment.sql` | `assignments`, `submissions`, `attempts` |
| `0004_bank_exams.sql` | `question_sources`, `questions`, `question_assets`, `exams` |
| `0005_communication.sql` | `messages`, `message_read_markers`, `notifications`, `notification_read_state`, `push_subscriptions`, `feed_posts` |
| `0006_activity_projects_audit.sql` | `project_configs`, `project_progress`, `student_activity`, `live_challenges`, `live_sessions`, `audit_log` |

Conventions (checked by `api/tests/db-schema-15a.test.js`):

- **Ids keep today's values verbatim** (UUIDs, `TPL-…`, source ids): `nvarchar(64)` for platform ids, `nvarchar(128)`
  for bank, exam and challenge ids, which embed a source id. The backfill checks every value against its column
  length before writing. No id is rewritten during
  migration, so URLs, notification payloads and audit targets stay valid. Stream tables (messages, notifications,
  audit) use `bigint IDENTITY` and keep the legacy id in a `legacy_*_id` column.
- **Times are `datetime2(3)` UTC.** Empty strings in legacy documents become `NULL`.
- **Text is `nvarchar`** (Arabic and Hebrew).
- **JSON columns end in `_json`**, are `nvarchar(max)`, and each has a `CHECK (ISJSON(...) = 1)` constraint. They hold
  payloads that are always read and written whole: exam snapshots, attempt answers and grades, question content,
  project configuration and progress.
- **`extra_json` makes the migration lossless.** Every field of a legacy document that has no column of its own is kept
  in `extra_json`, so nothing is lost if a field was missed. Phases may promote a field to a column later.
- **`row_version rowversion`** on every mutable table replaces blob ETags for optimistic concurrency
  (`UPDATE … WHERE row_version = @expected`). Transactions with `UPDLOCK` replace blob leases.
- **Scores and marks are `float`** — the exact IEEE double JavaScript already stores, so no rounding is introduced.
- **Foreign keys everywhere, no cascading deletes** — deleting is always an explicit, audited action, as today.
- **Collation: the database default** (`SQL_Latin1_General_CP1_CI_AS` on Azure SQL), so keys compare
  case-insensitively and ignore trailing spaces. Legacy ids are lower-case UUIDs and upper-cased student codes, so
  this matches today's behaviour; the backfill's uniqueness check compares keys the same way, so any collision it would
  cause shows up in the dry-run report rather than as a failed load.
- **`varchar` only for ASCII codes** (enums, identity numbers, avatar ids); every human text is `nvarchar`. The backfill
  blocks non-Latin-1 text in a `varchar` column instead of letting SQL Server turn it into `?`.

### Consistency machinery that disappears

| Today | In SQL |
|---|---|
| `user.classId` + `classroom.studentIds` roster index + `reconcileRosterIndex` | `enrollments` (single authority, any number of classes) |
| `platform/assignment-index/*` + control document + epoch | `SELECT … FROM assignments WHERE class_id IN (…) AND status = 'published'` |
| Auth document keyed by `sha256(code)` + `authVersion` kept equal in two documents | `users.login_code` (unique) + `user_credentials` updated in one transaction |
| `assignment-lock.js` lease across assignment + submission blobs | one transaction |
| Bank index blob + per-source blobs written without a transaction | `questions` rows with indexed metadata columns |
| Listing `platform/audit/` | `audit_log` indexed by `(school_id, created_at)` |

## 6. Rollout: one domain at a time, one cutover per domain

Dual-writing blobs and SQL is deliberately **not** used — two authorities that can disagree is the class of bug the
current code already works hard to avoid. Instead each phase moves one domain with a short, announced write freeze:

1. Merge the phase with its data-access code behind a per-domain backend switch (default: blob).
2. Evening window: put the platform in read-only mode for that domain, run `db-backfill --dry-run` (report only), then
   `--apply`, then the verification step. In 15A verification is row counts per table, checked inside the load
   transaction; each later phase adds a per-document comparison (blob vs. rows) for its own domain before its switch.
3. Flip the switch to `sql`. Smoke-check production.
4. Blobs of that domain are never modified again and are kept for 60 days as the rollback source. Rollback = flip the
   switch back; writes made in SQL after the cutover would have to be exported back, so the rollback window is the
   first days, and the verification step is what makes it unlikely to be needed.

**Multi-teacher opens only after the last phase.** Until every domain is scoped, a second teacher could reach data
through a route that still reads blobs. Phases 15B–15E are therefore invisible to users except for speed; new
teachers and the second school are onboarded in 15F.

| Phase | Scope | Exit criteria |
|---|---|---|
| **15A** (this branch) | Schema, client, migration runner, read-only backfill with dry-run report, CI job against a real SQL Server | Schema applies cleanly in CI; dry-run on production data reports zero blocking anomalies (or a list to fix first) |
| **15B** | Identity: schools, users, credentials, memberships, teacher accounts with hashed passwords, new token claims, login throttle | Both roles log in through SQL; the env-password teacher login is removed after a transition |
| **15C** | Classes, class teachers, programs, learning courses, enrollments; student can be in several classes | Roster index code deleted; student dashboard lists all enrolled classes |
| **15D** | Assignments, submissions, attempts, grading, reports, analytics, Teacher Today | Assignment index and assignment lock deleted; Teacher Today reads are bounded queries |
| **15E** | Bank (official / school / private), saved exams, templates | AI features untouched in behaviour (minimal-fix rules still apply) |
| **15F** | Messages, notifications, push, feed, projects, games, learning progress, audit; admin screens for schools and teachers; cross-tenant test suite over every route | Every teacher route is scoped; second school and teachers onboarded |

## 7. Blob → table mapping

| Blob path | Table(s) | Phase |
|---|---|---|
| `platform/users/<id>.json` | `users` (+ `school_memberships` role `student`, + `enrollments` from `classId`) | 15B/15C |
| `platform/auth/<sha256(code)>.json` | `user_credentials` | 15B |
| `platform/teacher-profiles/<sub>.json` + `BUILDER_USER_CODE` | `users` (teacher, platform admin) | 15B |
| `platform/throttle/*`, `platform/locks/*` | `login_throttle`; locks are not migrated | 15B |
| `platform/classes/<id>.json` | `classes`, `class_teachers` (owner = the existing teacher), `class_programs`, `class_learning_courses` | 15C |
| `platform/assignments/<id>.json` | `assignments` | 15D |
| `platform/submissions/<a>/<s>.json` | `submissions`, `attempts` | 15D |
| `platform/assignment-index/*` | not migrated (replaced by a query) | 15D |
| `index/questions-index.json`, `sources/<id>.json` | `question_sources`, `questions`, `question_assets` (`791381-*` sources → official; `manual` → the teacher's private source) | 15E |
| `exams/<id>.json`, `templates/<date>/<…>.json` | `exams` (`kind` = `saved` / `template`) | 15E |
| `exam-governance/<examId>/**` (Phase 14A manifest, revisions, events) | new tables designed in 15E (revisions and events are append-only, so they map naturally to rows); not in the 15A schema | 15E |
| `platform/messages/**`, `platform/notifications/**` | `messages`, `message_read_markers`, `notifications`, `notification_read_state` | 15F |
| `platform/push/**`, `platform/feed/**`, `platform/recognition/*` | `push_subscriptions`, `feed_posts`, `student_activity` | 15F |
| `platform/project-trackers/**`, `platform/project-progress/**` | `project_configs`, `project_progress` | 15F |
| `platform/games/**`, `platform/learning-practice/*`, `platform/learning-study/*` | `live_challenges`, `live_sessions`, `student_activity` | 15F |
| `platform/audit/*` | `audit_log` | 15F |

The 15A backfill covers the domains of 15B–15D (identity, classes, enrollments, assignments, submissions, attempts),
because those need the most careful mapping and the dry-run report is most useful for them first. The later domains
get their transforms in their own phases.

## 8. Operations

- **Service.** Azure SQL Database, General Purpose serverless, using the free offer (100,000 vCore-seconds and 32 GB per
  month per database). **Set "continue using the database for additional charges"** when creating it: with the
  default "auto-pause until next month", an exhausted allowance would take the platform offline until the 1st —
  possibly on an exam day. Expected overage for this load is small; watch the "free amount remaining" metric in the
  first month.
- **Cold start.** Serverless auto-pauses after the configured idle delay; the first connection after a pause waits
  while the database resumes (typically under a minute). While it resumes, logins fail with error 40613. The client
  (used by the operator scripts in 15A) waits up to 60 s per connection attempt, lets the driver retry a transient
  login 6 times 10 s apart, and retries the whole connect once more. **That is too long for an HTTP request**: Static
  Web Apps' managed functions give a request well under a minute. So 15B must choose, before any endpoint uses the
  database, between (a) turning auto-pause off (always-on minimum capacity; a small fixed monthly cost) and (b) keeping
  auto-pause with a short, bounded wait in the API plus an automatic retry in the app ("the server is waking up").
  Recommendation: (a) during the school year — a paused database on an exam morning is not an acceptable failure.
- **Configuration.** One new application setting, `AZURE_SQL_CONNECTION_STRING`. When it is absent the database layer
  reports `not-configured` and nothing else changes — this is the state of production after 15A.
- **Connections.** One pool per Functions worker process (lazy, reused across invocations, small maximum).
- **Backups.** Point-in-time restore (7 days on the free offer) plus the retained blobs during each rollout window.
- **Personal data.** `users.identity_number` is a national id: it is never returned by list endpoints, never
  written to logs (the redaction list in `audit-redact.js` applies to audit details), and only platform and school
  admins can read it.

## 9. Testing

- **Everywhere (`npm test`):** schema conventions (§5) checked statically over the SQL files; migration runner
  planning, batch splitting and checksum drift; the transform over documents written by the **real handlers**
  (create class, create students, create and publish an assignment, start and submit an attempt) plus hand-made
  legacy shapes (lossless `extra_json`, anomalies, key collisions); the backfill reader against the in-memory blob
  container; the report's privacy (no names, identity numbers, password material or reversible credential blob names).
- **CI only (`.github/workflows/db-integration.yml`):** a SQL Server 2022 service container; applies every migration
  to an empty database twice (second run must be a no-op), loads the fixture backfill, and checks row counts and
  foreign keys. These tests are skipped when `TEST_SQL_CONNECTION_STRING` is not set, so local runs need no database.

## 10. Risks

| Risk | Mitigation |
|---|---|
| A legacy field is missed by a transform | `extra_json` keeps every unmapped field; verification compares blob and rows per document |
| Data that the blob model tolerated violates a constraint (orphans, duplicate codes, dangling class ids) | The dry-run report lists every such case before any write; each is fixed in the data or given an explicit rule |
| Serverless pause during use | Scripts wait and retry; for the API, 15B decides between auto-pause off and a bounded wait + app retry (§8); "continue with charges" instead of monthly auto-pause |
| A route stays unscoped after multi-teacher opens | Onboarding waits for 15F; 15F adds an inventory test (like `route-auth-inventory-11a`) that fails CI for any teacher route without a scope test |
| Big-bang regression | One domain per phase, one PR per phase, independent review, per-domain switch |
