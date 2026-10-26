# D1 — data protection: blob backup / restore and unsent exam answers on the device

Two gaps found by the project survey, closed together because both are about not losing student work.

| # | Gap | Change |
|---|---|---|
| 1 | Blob Storage had no soft delete, no versioning and no restore procedure: an overwrite or a delete was final. | Runbook `docs/operations-backup-restore.md`: the settings the **owner** turns on, restore procedures, a drill. No code; agents never touch Azure. |
| 2 | Answers the server has not confirmed lived only in the page's memory. Connection drops → the student closes the page (or the battery dies) → those answers were lost; the `beforeunload` warning was the only guard. | The exam page keeps a device copy of unsent answers and sends it on the next open of the same live attempt. |

## 1. Device copy of unsent answers

Module `src/student/exam/answerJournal.ts`, wired in `src/StudentExamPage.tsx`.

- **Key:** `examBankAnswerJournal:v1:<studentId>:<assignmentId>` in `localStorage`. The student id is the `sub` of the
  session token, decoded on the device **only** to separate students on a shared device; the server still verifies the
  token on every request. A token whose id cannot be read keeps no copy.
- **Record:** `{ v, studentId, assignmentId, attempt (identity or null), generation (legacy attemptsUsed), base (the server
  draft the answers were composed from), answers, at }`. Validated on read; a malformed record is removed. Expiry:
  3 days (device clock, housekeeping only); expired copies of any student are pruned when an exam page opens.
- **Lifetime — it exists only while something is unsent:**
  - written on every edit (the autosave effect, before the debounce);
  - after a confirmed save: removed when nothing is unsent, otherwise rebased on the confirmed draft;
  - rebased after a QA-8 stale-draft merge;
  - removed whenever the page adopts the server draft (`applyServerAttemptState`: a new attempt, adoption of another
    attempt, pause, resume, finalize, reconcile), on a successful submit and when a legacy next attempt starts;
  - removed for **every** student by the explicit «تسجيل الخروج» button (`StudentShell`). A 401 does not remove it: the
    session expired, the student signs in again and the copy is sent.
- **Restore — only on the initial load, only for the live writable attempt** (the same rule as `recoverAndSave`):
  - modern / start-gated: `canWrite`, the attempt is not expired, no pending strict exit, and the **same attempt identity**
    (attemptNumber + startedAt + attemptEpoch);
  - legacy untimed: `canWrite` and the **same generation** (`attemptsUsed`).
  The copy is merged per question onto the server draft with the QA-8 rule (`mergeStaleDraft(base, answers, server)`:
  questions changed on the device since its base win, everything else is the server's — another device's later work
  is kept), shown, and saved through the ordinary `saveDraft` path (attempt identity + `expectedDraftRevision`; the
  server's guards still decide). If the merge equals the server draft nothing is sent. A polite status notice tells the
  student: «أعدنا إجابات محفوظة على هذا الجهاز لم تكن قد وصلت إلى الخادم بسبب انقطاع الاتصال، ونحفظها الآن. راجع إجاباتك قبل التسليم.»
- **Timed exam reopened at the «متابعة المحاولة» gate** (the questions were not loaded yet): the continue hydration adopts the
  server draft, so the copy is read just before it and merged again onto the continued attempt under the same rule; a restore
  whose first save failed is therefore not lost when the student continues.
- **Never restored:** another attempt, a closed / expired / not-writable attempt, an attempt submitted elsewhere
  (legacy generation advanced), another student's copy (and it is not erased by them).

### Grading-safety review (AGENTS.md §10)

The copy is never authority. It cannot extend a deadline, reopen an attempt or reach another attempt: restore requires
the server to report the same live writable attempt, and the write goes through the unchanged server guards. It never
produces a zero or a "no answer": when it cannot be restored the server draft stands exactly as before this change.

### Limitations

- Answers typed **after the attempt's deadline passed while offline** cannot be accepted (the deadline is server
  authority); the copy is discarded when the server reports the attempt closed. Answers typed offline before the deadline
  are only saved if the page is reopened before the deadline.
- Only the device that typed them holds them; another device does not see them until they are sent.
- Blocked or full storage (private mode, quota) silently falls back to the previous behaviour.
- On a shared device the copy is readable in the browser storage until it is sent, expires or someone logs out explicitly.

## 2. Evidence

- Baseline `3a728fdc`. Fail-first: `src/StudentExamPage.answerJournal.d1.test.tsx` run on a detached baseline worktree
  with only the new helper module copied in (no wiring): **9 of 13 fail** (restore after close, merge with another device,
  another student's copy, copy written on edit / removed on confirm, kept after a failed save, removed on submit, rebased
  after a stale-draft merge, re-merged at the timed continue gate, removed on logout). The 4 "never restored" guards
  (another attempt, not writable, legacy generation advanced, server already has everything) pass on the baseline because
  nothing is restored there: they are **pins**.
- Unit tests: `src/student/exam/answerJournal.d1.test.ts` (token decoding, key isolation, validation, expiry, blocked
  storage, logout / prune scope).
- Mutation campaign, 16 mutants, all **KILLED** (files hash-restored after each): restore ignores the attempt identity /
  `canWrite` / the legacy generation; a clean state keeps the copy; a confirmed save does not sync it; a server hydration
  keeps a foreign copy; a submit keeps it; the key ignores the student; logout keeps copies; the nothing-unsent check removed;
  restore overwrites instead of merging; edits not journaled; expiry not enforced; a stale-draft merge does not rebase the
  copy; the continue hydration does not re-merge it; the student id accepted with a key separator.
