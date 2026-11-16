# Project exam form — class statistics, live follow-up and full screen

Design record of the owner's request: in a project's «الإحصائيات» view, show how far the students of a class filled the
project exam form, follow it live during a lesson, and show the view on the whole screen. It applies to every project that
ships a form (794589, 883589, 899373): nothing here is specific to one project.

## What the teacher sees

- **«تعبئة استمارة الامتحان»**, above the stage charts, only once the class's form was opened (open or closed):
  five figures (average filling, writing now, not started, filling, handed in) and four charts — the forms' states, the
  students by filling range, each student's filling (fullest first, coloured by state) and the average filling of each
  section. Every chart keeps its «عرض البيانات كجدول» table.
- **«Live»**: while on, the form's statistics are re-read every 10 seconds and the stage charts every 30 seconds, and a
  timeline of the class average grows by one point per refresh. A refresh never blanks the page: when one fails, the data
  on screen stays, the bar says so, and the next refresh tries again. Polling stops while the tab is hidden and resumes
  when it is shown again; Live switches itself off after an hour.
- **«ملء الشاشة»**: the view covers the screen (for a projector), the way the learning Reader presents a book: an
  app-level overlay, with native browser fullscreen requested best-effort. Escape or the button leaves it.

## Server

`GET /api/project-tracker?resource=exam-form-stats&projectCode=…&classId=…` — a read behind the route's existing
capability (`projects.tracker.view`), tenancy check and project-enrolment check. It reads the class form and lists the
class's answers documents once; it writes nothing.

- `stats` is `null` for a project without a form and for a class whose form was never opened.
- The body is **numbers only**: states, counts, percentages and times. No answer, prompt, answer key, rubric, rating or
  mark — those stay in the review reads (`exam-form-students`, `exam-form-student`).
- Counting follows `formProgress`: questions of a deferred kind are not counted; image questions count only where the
  class switched image answers on. A document of a student who is no longer in the class is ignored.
- «Writing now» = the student's own writable form (draft or returned) was saved within the last two minutes.
- An unreadable or untrusted stored template fails closed (503), exactly as the other form reads do.

## Why polling

The API is Azure Functions behind Static Web Apps: a pushed connection would need a new service. One light read every
10 seconds for the one teacher who is watching is enough, and it reuses `useAutoRefresh` (visible tab only, single
flight), which the messages and the teacher's home already use. The heavier stage analytics are refreshed three times
less often.

## Not changed

Grading, the review and approval of a form, what a student sees, and the stage analytics' datasets and formulas.

## Evidence

`api/tests/project-exam-form-stats.test.js` (every bundled form; tenancy; fail-closed; no secret in the body) and
`src/projects/ProjectAnalyticsLive.test.tsx` (the charts over the real handlers, the live timings, a failed refresh, the
automatic stop, full screen).
