# FEATURE-004 — Student notification after a grade change (design record)

Source: `Problems.pdf` page 3 (tracker: `docs/tadris-enterprise-problems-tracker.md`, FEATURE-004).

## Architecture (existing pattern reused, nothing invented)

The platform already has an idempotent, append-only **notification event** store (`api/src/lib/notification-events.js`:
`platform/notifications/student/<studentId>/<eventId>.json`, create-only, deterministic `dedupeKey`, secondary — a failure never
fails the educational action) and a student **notification center** (`student-notifications` route → bell in `StudentShell`).
The teacher review handler (`api/src/functions/assignment-review.js`, `requireBuilderAuth` + class / historical-ownership checks)
already records ONE `assignment_reviewed` event per *meaningful* committed save (`reviewChange`: became final / score changed /
new feedback), after the CAS write and the canonical `rebuildAttemptGrades`; an identical re-save or a retried POST changes
nothing and records nothing. The automatic coding grader (`lib/coding/official-grading.js`) records the same event once per
finalised attempt with `automatic: true`.

This phase makes that event carry the **updated grade** and gives it the owner's wording.

## Changes

| Layer | File | Change |
|---|---|---|
| Event whitelist | `api/src/lib/notification-events.js` | `assignment_reviewed` gains sanitised `score` (only when the grade changed or became final; `null` for feedback-only) and `totalMarks`. Additive; old events read as `null`. |
| Producers | `api/src/functions/assignment-review.js`, `api/src/lib/coding/official-grading.js` | pass `score` / `totalMarks` from the rebuilt attempt (the same numbers the student reads from `student-submission`). |
| Student projection | `api/src/lib/notification-center.js` | passes `score`, `totalMarks` and the existing `automatic` flag through to the bell (the flag was stored but not projected before). |
| Client | `src/notifications/notificationsClient.ts`, `src/notifications/notificationPresentation.ts` | validator admits the two numbers (junk dropped); wording for a grade change: **«تم تحديث علامتك في امتحان «…»، وأصبحت علامتك 89/100.»**, with «(التصحيح لم يكتمل بعد)» while marks are still pending and «مع ملاحظة جديدة من المعلم.» when feedback changed; title «تم تحديث علامتك» («اكتمل تصحيح امتحانك» for the automatic grader). Events without a grade keep the 6D wording. The item keeps `createdAt` (shown as time in the bell) and `assignmentId` (the bell's existing safe route to the student's own result). |

## Acceptance (certified through the REAL handlers on one in-memory store — `api/tests/grade-change-notification-f004.test.js`)

| Requirement | Test |
|---|---|
| Grade changed successfully → correct notification (own student only, updated grade = the grade the student reads) | ✓ `grade changed successfully → exactly one notification …` |
| Opening the review screen → no notification | ✓ (GET before the save) |
| Same grade saved twice / retry → no duplicate | ✓ `same grade saved twice → no second notification; a retried identical POST → still one …` |
| A later real change → a new notification with the new grade | ✓ (same test) |
| Feedback-only review → no grade claimed | ✓ `a feedback-only review notifies without claiming a grade` |
| Pending manual grading completed → final grade under the publication policy (see **Release state of a mark** below: a provisional manual-review mark is released on the results page and is worded as provisional; a withheld coding mark is never carried) | ✓ `a partial manual review … notifies the current grade as NOT final; completing it notifies the final grade` · RF1 suite |
| Save failed (unknown attempt, invalid id, other class, CAS failure) / unauthorized → no notification, grade untouched | ✓ `failed, refused or unauthorized saves notify nothing` |
| Notification channel failure never rolls back the saved grade; logs carry no student data | ✓ `a notification storage failure never rolls back …` |
| Student opens / acknowledges the notification → permitted result; a classmate can neither see nor acknowledge it | ✓ `the student can acknowledge …` |
| Wording | ✓ `src/notifications/notificationCenter.6d.test.tsx` › FEATURE-004 |

No forged client-side notification is possible: the event is written only by the authenticated server handlers after a
committed write; the student API has no endpoint that creates events.

## Review Fix 1 — independent review of `7467afe`

### Finding 1 — notification deduplication (confirmed, fixed)

The review event's dedupe key was `review:<assignmentId>:<attempt>:<reviewedAt>` — the save's server timestamp at millisecond
precision and nothing else. Two **distinct** committed grade changes inside one millisecond (a CI runner; two quick saves through
a fast proxy) shared the key, and `recordEvent`'s idempotency window silently dropped the second notification. The first version
of the certification worked around it with 5 ms sleeps between saves — a symptom, not a fix.

**Fix (`assignment-review.js`):** the key now binds the committed transition itself —
`review:<assignmentId>:<attempt>:<reviewedAt>:<sha256(JSON([factsBefore, factsAfter])).slice(0,16)>` where the facts are the
student-facing `reviewFacts` (finalized, score, feedback, per-question comments) of the attempt version the CAS write committed
over and of the committed result. Every real change is therefore its own key even in the same millisecond, while a retried
identical POST still records nothing: its facts before and after are equal, `reviewChange` is not meaningful, and the store is
never reached (and a retried *write* of the same committed transition still deduplicates on the identical key). The stored event
document, the event whitelist, the read side and the client are unchanged. The sleeps are gone.

**Fail-first (`api/tests/grade-change-notification-f004-rf1.test.js`, fake `Date` only — no timers, no sleeps):** on `7467afe`
`frozen clock: three different marks saved in one millisecond → three notifications (7, 9, 4)` failed with
`expected [ 7 ] to deeply equal ArrayContaining [7, 9, 4]`; `A → B → A in one millisecond` failed with
`expected [ 7 ] to deeply equal [ 7, 7, 9 ]`; `a score change and a feedback-only change in one millisecond` failed with
`expected … to have a length of 2 but got 1`. All pass on the head; identical re-saves and retried POSTs inside that millisecond
still add nothing.

### Finding 2 — grade visibility: the release state of a mark (audited, one disclosure fixed, one sanitiser defect fixed)

The platform has **no delayed-publication setting**: what the student may see is decided per attempt by the student projection
(`student-submission` `pub()`, `student-dashboard`) and the results page (`StudentExamPage`, `StudentAssignmentCard`):

| Attempt state | Results page | Notification (RF1) |
|---|---|---|
| Final (`finalized: true`, no coding hold) | «العلامة النهائية» score / total (percentage) | «تم تحديث علامتك … وأصبحت علامتك S/T.» |
| Pending **manual** review (`manualReviewMarks > 0`) | «علامة مؤقتة» score / total + «بانتظار مراجعة N علامة» — the provisional mark **is released** | «تم تحديث علامتك المؤقتة … وهي الآن S/T بانتظار اكتمال التصحيح.» — the same mark, worded as provisional (title «تم تحديث علامتك المؤقتة») |
| Official coding grading still **open** (`autoGradingPending` / `autoGradingStatus` queued · processing · retrying · delayed) | headline **withheld** («—», `scoreWithheld`) | **no mark on the event** (`score: null`, `percentage: null`) → 6D wording «تم تصحيح واجبك» without a number |
| Compile error awaiting the teacher (`reviewRequired`, 17F-C2) | headline **withheld** | **no mark on the event**; the teacher's override lifts the hold and the next event carries the final mark |
| Feedback-only save | unchanged mark | no mark claimed (`score: null`) |
| Assignment archived / student moved class / other student | result not served | event not served (`notification-center` re-validation: published + current class) |

Before RF1 a teacher's save on a *non-coding* question of an attempt whose coding mark was withheld put the attempt's current
`score` on the event — a disclosure ahead of the release state. **Fix:** the review handler decides `legacyAutoGradingWithhold(attempt)`
on the committed attempt version (the same rule the student projection uses) and nulls `score` / `percentage` on the event while the
hold is on; `totalMarks` (the assignment's total, always visible) stays. The automatic grader's own final event is unchanged (it only
fires when every target is complete — PED20 pins that no event fires while review is required).

While fixing it the sanitiser turned out to be unsafe: `cleanScore(null)` returned `0` (`Number(null) === 0`), so a withheld or
absent mark would have been stored — and worded — as «0». **Fix (`notification-events.js`):** `null` / `undefined` / `""` stay `null`;
a real `0` is still `0`. Pinned directly (`event sanitiser: an absent mark stays null — never «0»`).

**Fail-first on `7467afe`:** `official coding grading still OPEN …` and `compile error awaiting the teacher (reviewRequired) …`
both failed with `- "score": null / + "score": 1` (the withheld mark was on the event). Isolation (classmate sees nothing) and
re-validation (archiving hides the notification) are pinned in the same suite.

**Not changed (observations for the owner):** `student-dashboard` also projects `latestScore` / `latestPercentage` next to the
withheld `latestResult` (pre-existing; the cards read `latestResult` and withhold correctly); the provisional manual-review mark is
released by the product today, so the notification states it as provisional rather than hiding it — a delayed-publication policy
would be a product decision, not part of this fix.
