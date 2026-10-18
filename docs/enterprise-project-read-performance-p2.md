# Phase P-2 — Project Tracker read performance

## Problem (measured)

Every class view of the project workspace — «لوحة المشروع» (`summary`), «تقدّم الطلاب» (`students`), «التقييم الجماعي»
(`board`), «الإحصائيات» (`analytics`) — downloaded **every user document of the platform** (`platform/users/`) to find one
class's members (the canonical membership rule reads user documents; `classroom.studentIds` is a display-only cache and
may not decide membership — `lib/class-roster-index.js`). The sidebar badge (`projects-summary`) did the same and then
read every active class's snapshot and progress folder **one class after another**.

Measured with the real handler over an instrumented in-memory store (12 ms per blob read, 25 ms per listing; 40 classes,
1,200 students, 15 teachers; class of 30 on project 794589):

| Request | Before | After (cache on) | After (`PROJECT_USER_CACHE_TTL_MS=0`) |
|---|---|---|---|
| first class view (`summary`) | 2.0 s · 1,247 reads | 2.0 s · 1,247 reads | 2.0 s · 1,247 reads |
| next views within 20 s (`students`, `board`, `analytics`) | 2.0 s · 1,247 reads each | **~0.1 s · 32 reads** each | 2.0 s each |
| sidebar badge (`projects-summary`) | 4.7 s · 2,185 reads | **0.4 s** · 970 reads | 2.2 s (parallel only) |
| student profile (`student`) | 70.7 KB | 62.3 KB | 62.3 KB |

The badge is read at teacher boot, so it usually warms the cache for the first class view too.

## Owner decision (2026-10-18)

Short in-memory cache (option chosen over a persisted class-membership index and over no cache).

## What ships

1. **`lib/project-tracker/user-directory-cache.js`** — per-instance cache of the user-document scan for the generic
   route's READ views only.
   - TTL 20 s (env `PROJECT_USER_CACHE_TTL_MS`; `0` disables; junk → default).
   - Concurrent callers share one in-flight scan; a failed scan is never cached.
   - Keyed by the container's storage URL (production clients are rebuilt per request). A container without a URL
     (in-memory test containers) is never cached, so every existing test still reads directly.
   - **Writes and membership gates never use it**: `requireStudentInClass` / `updateStudentProgress` /
     `selfReportStages` / `progress.bulk` still read the user document directly (tested: a student moved away is refused
     by a write at once while a read view may still list them for ≤ 20 s).
2. `service.listClassStudentsForReadViews` — the same roster rule over the cached scan; used by the generic route's
   `summary` / `students` / `board` / `analytics`. `listClassStudents` (legacy route, reports) is unchanged.
3. `projects-summary` — the class list and the user directory are read together; active class × project pairs are counted
   with bounded concurrency (`getReadConcurrency()`); identical counting rule.
4. `student` — returns the newest 50 history events (the profile shows 20). Evaluation and performance are still computed
   server-side from the whole document.

## Consequence accepted by the owner

A student added, moved or archived elsewhere appears in (or leaves) the project read views within at most 20 s on a
given instance. Grading, approvals, scores and self-reports are unaffected (direct membership reads).

## Rollback

Set `PROJECT_USER_CACHE_TTL_MS=0` in the Function App settings (owner action): every read view scans again, with the
parallel badge and the trimmed history kept.

## Tests

`api/tests/project-user-directory-cache-p2perf.test.js` — unit (TTL reuse / expiry, shared in-flight scan, failures not
cached, TTL 0, no-URL containers, URL isolation, invalidate, env parsing) and a contract over the real handler (four tabs
→ one scan; a moved student: read view stale ≤ TTL, write refused at once, exact after the TTL; TTL 0 → a scan per
request; history trimmed to 50 while evaluation still uses the whole history).

## Mutation proof

Each mutant planted alone; the P-2 suite plus the existing ready-summary suites (`project-review-21h1`, `phase8d-integration`,
`multi-project-enrollment-hardening`, `project-evaluation-9b`) run; the file restored byte-for-byte (sha256-checked).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| P1 | cache entries never expire | KILLED | TTL reuse / expiry; env TTL |
| P2 | a failed scan is cached | KILLED | never caches a failed scan |
| P3 | entries never stored (no sharing) | KILLED | TTL reuse; shared in-flight scan |
| P4 | URL-less (test) containers cached | KILLED | TTL 0 / no-URL containers |
| P5 | read views bypass the cache | KILLED | four tabs → one scan |
| P6 | **a write's membership gate reads the cached list** | KILLED | moved student: write refused at once |
| P7 | profile history not trimmed | KILLED | newest 50 events |
| P8 | badge counts mis-attributed after the parallel rewrite | KILLED | existing projects-summary suites |
