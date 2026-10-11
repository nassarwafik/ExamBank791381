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
| Pending manual grading completed → final grade under the publication policy (grades are visible to the student as soon as they are saved — the platform has no delayed-publication policy; partial grades are flagged «لم يكتمل») | ✓ `a partial manual review … notifies the current grade as NOT final; completing it notifies the final grade` |
| Save failed (unknown attempt, invalid id, other class, CAS failure) / unauthorized → no notification, grade untouched | ✓ `failed, refused or unauthorized saves notify nothing` |
| Notification channel failure never rolls back the saved grade; logs carry no student data | ✓ `a notification storage failure never rolls back …` |
| Student opens / acknowledges the notification → permitted result; a classmate can neither see nor acknowledge it | ✓ `the student can acknowledge …` |
| Wording | ✓ `src/notifications/notificationCenter.6d.test.tsx` › FEATURE-004 |

No forged client-side notification is possible: the event is written only by the authenticated server handlers after a
committed write; the student API has no endpoint that creates events.
