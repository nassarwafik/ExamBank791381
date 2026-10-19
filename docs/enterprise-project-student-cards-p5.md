# Projects P-5 — the student list: «لم يبدأ» apart from «بلا تحديث», an order, a table view

Phase P-5 of the projects roadmap («بطاقات الطلاب»). It changes the project workspace's student list (`ProjectStudentCards`)
only: one `students` read per class and project, as before. Filters, order and view work on the cards already loaded. No API,
stored document or grading change.

## Decisions

| # | Decision | Why |
|---|---|---|
| P5-a | **«لم يبدأ» is not «بلا تحديث».** A student is *not started* when no stage has left «لم يبدأ»: nothing in progress, nothing waiting for review, nothing approved (`studentCardsView.isNotStarted`). *Stalled* («بلا تحديث») is a started, unfinished student the server marks stale (`isStalled`). The card badge shows one state: «مكتمل», «بلا تحديث», «لم يبدأ», or none while in progress. The «لم يبدأوا» and «بلا تحديث» filters never overlap. | The server's `stale` is true for a student who never started: an empty `updatedAt` reads as infinitely old (`daysSince("") = Infinity`). So every never-started student carried the «بلا تحديث» badge, and the «بلا تحديث» filter mixed them with students who started and stopped. |
| P5-b | **«لم يبدأوا» counts every kind of progress.** The old rule was `overallProgress = 0` and nothing in progress or waiting. A student whose only approved stage is optional (zero weight) has 0 % overall but HAS started. | Measured on the baseline: such a student was listed under «لم يبدأوا». A first stage waiting for review also leaves overall progress at 0, because only approved stages count toward it. |
| P5-c | **An order** («الترتيب»): name (the default, numeric, so «طالب2» comes before «طالب10»), progress lowest or highest first, most «جاهز للفحص» first, oldest update first (a student with no update counts as the oldest). Equal keys fall back to the name, then the code. The order also drives the student profile's «السابق / التالي», which follows the list as shown. | Teachers looked for the students to chase (least progress, oldest update) by scrolling. The P4 note recorded that names with numbers sorted as text. |
| P5-d | **A table view** («طريقة العرض»: «بطاقات» / «جدول», `aria-pressed`). It shows the same filtered, ordered list with one row per student. Columns: name and code (row header), overall and per-track progress, ready / in progress / approved counts, the state, last update, and the same «فتح ملف الطالب» action. The table sits in a named, focusable scroll region («جدول تقدّم الطلاب»). Cards remain the default. | A class of 30 is 30 tall cards; the table shows the whole class on one screen for comparison. |

## Not in P-5 (deliberately)

- **The server's `stale` flag is unchanged.** The projects dashboard hint («بلا تحديث N+ أيام»), the reports page's «بلا تحديث» figure and the delayed report's reasons therefore still count never-started students as «بلا تحديث».
  - Fixing it on the server changes the project API payloads, which `legacy-794589-convergence-r33` pins byte for byte against a golden capture. A first attempt failed 35 of those goldens.
  - The open #371 (Projects P6, another window) also edits `project-tracker/core.js` and `analytics.js`.
  - It is proposed as its own follow-up (the server rule `stale = started && no update ≥ staleDays`, a `notStarted` field, «لم يبدأ بعد» as a delayed-report reason, and a reviewed golden refresh), best after P-9 removes the legacy routes.
- **The «فتح ملف الطالب» name is unchanged.** It still does not name the student. Many tests, including those of other project phases and the P4 browser script, find the button by that exact name.

## Evidence

- **Tests.** `src/projects/ProjectStudentCards.p5.test.tsx` has 8 tests: the view model, the badge, the two filters, a started student at 0 %, every order (and «السابق / التالي»), non-mutation, and the table (columns, values, states, filter, action, one read).
- **Fail-first.** On the baseline `69a6705b`, the 5 UI tests (without the new module's pure tests) all fail:
  - the never-started card read «…بلا تحديث…»;
  - «بلا تحديث» listed `["طالب10", "طالب2"]`;
  - the order was the server's `["طالب10", "طالب2", "أمل", "بشير"]`;
  - there was no «طريقة العرض» group;
  - the optional-only student was listed under «لم يبدأوا».
- **Updated test.** `src/projects/helpers.test.ts`: its «بلا تحديث» fixture was a student with no activity at all. It is now a started student (one stage in progress), which is what the fixture meant.
- **Mutation campaign.** 11 mutants, all KILLED.
  - Q1: approved stages ignored.
  - Q2: stalled is the raw flag.
  - Q3: no «لم يبدأ» state.
  - Q4: «بلا تحديث» filter on the raw flag.
  - Q5 / Q5b: the old «لم يبدأوا» rule. Q5 first SURVIVED; the 0 %-but-started test now kills it, and Q5b, the exact baseline rule, too.
  - Q6: name order not numeric.
  - Q7: order not applied.
  - Q8: oldest-update order reversed.
  - Q9: the table ignores the filter.
  - Q10: the table drops the state.
