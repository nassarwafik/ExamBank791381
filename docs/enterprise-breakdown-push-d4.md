# D4 — per-question mark breakdown (item 7) and assignment push notifications with an automatic reminder (item 8)

Two gaps found by the project survey. The owner made these decisions before implementation:

- **Item 7:** marks and the teacher's comment only, never the correct answer.
- **Item 8:** push for the existing assignment events, plus an automatic reminder 24 hours before the deadline.

| # | Gap | Change |
|---|---|---|
| 7 | A student saw only the total and the general feedback. Which questions lost marks, which await the teacher and what the teacher wrote on a question never reached them, although every attempt stores it (`questionGrades`). | A per-question breakdown inside a **released** result, from an explicit allowlist of fields. |
| 8 | Only a teacher's direct message reached the student's device. A new assignment, an extension, the teacher's «تذكير» or a released result waited until the student opened the app, and there was no automatic reminder before a deadline. | A Web Push for the assignment events, a push when results are released by hand, and an automatic, exactly-once reminder 24 h before each student's deadline. |

## 1. Per-question breakdown (item 7)

**Server:** `api/src/lib/student-question-breakdown.js`, added to the student projection in `student-submission.js` `pub()`.

- **Only inside a released result.** Before release the whole result is withheld (Phase 21G.5), the breakdown included.
- **Never while official coding grading can still change a mark** (`legacyAutoGradingWithhold`). The score itself is withheld then.
- **An allowlist built field by field.** Each question carries:
  - its display number;
  - its section;
  - a status;
  - its maximum;
  - its score (not while it is still pending);
  - the teacher's comment.

  Nothing is spread from the stored grade. The correct answer, the student's answer, a model answer, a rubric, expected outputs, hidden-test details and the part structure can never leave the server, including any field added to a grade later.
- **Statuses:**
  - `full`, `partial`, `zero`, by the mark against the maximum;
  - `pending`: manual review, an unreviewed render-failure hold, or a compile error awaiting review;
  - `notCounted`: outside the counted answers of an "answer N of M" section.
- **Sections** carry their title and whether they are capped. A stored section score is not recomputed after a review, so it is not shown; the attempt total stays the one authority.

**Screen:** `src/student/exam/ResultBreakdown.tsx`, on the result card under the teacher's general feedback.

- Collapsed by default: «تفصيل العلامات حسب السؤال», with a count of the teacher's comments.
- Grouped by section when there are several. Each row shows the mark, «قيد التصحيح» or «غير محتسب».
- Shown only when the result is released and the score is not withheld.

## 2. Assignment push notifications (item 8)

**What is pushed** (`api/src/lib/event-push.js`): the assignment events of the notification center.

- **Class events:** new assignment, deadline extended, reopened.
- **Personal events:** an extra attempt granted, the teacher's «تذكير» (manual or automatic), a result.
- **Not pushed:** reactions, notes and learning modules stay bell-only.
- **The trigger:** every NEWLY recorded event of those types is pushed from `recordEventSafely`, after it is recorded. A duplicate never pushes twice.
- **Manual results release:** the release that makes results visible pushes «نتيجة جديدة» to each class member who submitted (`manage-assignments.js`).

**Rules** (the Phase 6B message rules, extended):

- **Fixed, generic text** per type (`push-notify` `ASSIGNMENT_NOTIFICATIONS`). It never carries a title, a mark, a note or a name, because a lock screen is shared or visible.
- **Visibility re-checked at send time:**
  - the assignment is published;
  - the recipient is still a member of its class and not login-disabled;
  - a review is pushed only when it made the mark final AND the results are released.
- **Best effort and bounded** (`notifyWithTimeout`, 8 s). It never fails the teacher's action.
- **Push not configured** (no VAPID keys): nothing is read at all.

## 3. Automatic reminder (item 8)

**When and to whom** (`api/src/lib/assignment-reminder-sweep.js`): 24 hours before each student's **effective** deadline, a per-student extension included. The rule is the teacher's own «تذكير» rule:

- a class member, not archived, not login-disabled;
- no attempt yet;
- open by the same `timerState` as their own page.

The reminder is the ordinary personal «assignment_reminder» event: it appears in the bell and is pushed to the device.

**Exactly once per deadline:**

- A create-only marker (`If-None-Match: *`), named by a SHA-256 of assignment, student and deadline, reserves the reminder before it is sent. A retried or replayed sweep sends nothing new.
- An extended deadline is a new deadline and gets its own reminder.

**Bounds:**

- assignments whose base deadline is more than 14 days past are never read;
- at most 500 reminders per run (the next hourly run continues);
- an unreadable submission is skipped and never guessed.

**Trigger:**

- `.github/workflows/assignment-reminders.yml` runs hourly. It sends one signed POST `{"version":1}` to `/api/assignment-reminder-sweep`.
- The protocol is SA-REMINDER-SWEEP-1 (`api/src/lib/reminder-sweep-protocol.js`), modelled on SA-CODING-SWEEP-1 with its own label, path, headers and key.
- The key is `ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY`, a **fourth** key. It is refused when it equals the runner, callback or recovery-sweep key.
- Every check runs before any storage access: unsigned, unconfigured, bad signature, stale, wrong body.
- The answer carries aggregate counts only.
- Until the owner configures it, the workflow succeeds with a notice and reminders stay inactive.

## 4. Owner steps (nothing here is applied by an agent)

1. **Push must already be configured** for messages: the `WEB_PUSH_VAPID_*` settings. The assignment pushes use the same keys.
2. **Generate a new key** of at least 32 characters, for example `openssl rand -base64 48 | tr -d '=+/'`. It must not be one of the coding keys.
3. **Store it in two places:**
   - **Azure:** the Static Web App → Settings → Environment variables (application settings) → `ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY`;
   - **GitHub:** repository → Settings → Secrets and variables → Actions → secret `ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY` (the same value), plus the variable `ASSIGNMENT_REMINDER_SWEEP_URL` = `https://<your site>/api/assignment-reminder-sweep`.
4. **Check it once:** Actions → *Assignment Reminders* → **Run workflow**. The log line is `assignment-reminders: ok assignments=… reminded=…`.

## 5. Limitations

- **One reminder per deadline**, 24 hours before. A student who opens the assignment but never submits is reminded only once per deadline; the teacher's button still works.
- **Push needs the student's consent** on their device (the existing «تفعيل الإشعارات»). Without it the reminder is only in the bell.
- **Long extensions:** a per-student extension longer than 14 days past the base deadline is not reminded automatically.
- **Mode change not pushed:** switching an assignment's release mode to "immediate" after grading does not push; only a manual release does.

## 6. Evidence

See the PR: fail-first on the baseline, the D4 tests, the mutation campaign and exact-head CI.
