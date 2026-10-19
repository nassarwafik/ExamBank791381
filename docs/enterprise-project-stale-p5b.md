# Projects P-5b — the server's «بلا تحديث»: a student who never started is not idle

Follow-up of P-5 (`docs/enterprise-project-student-cards-p5.md`, «Not in P-5»). P-5 separated «لم يبدأ» from «بلا تحديث» in the
student list only, because the server rule was pinned by the R33 goldens of the legacy routes. P-9 removed those routes, and
this phase moves the rule to the server. The rule is now right everywhere the server's `stale` figure appears: the project
dashboard hint («بلا تحديث N+ أيام: N»), the class summary's `staleCount`, the student cards and the delayed report.

## Decisions

| # | Decision | Why |
|---|---|---|
| P5b-a | **`stale` = started ∧ not complete ∧ no update for `staleDays` or more.** «Started» means at least one ACTIVE stage has left «لم يبدأ»: in progress, waiting for review, or approved (an optional zero-weight stage included). This is the P-5 client rule (`studentCardsView.isNotStarted`), now computed once in `core.buildStudentSummary`. | `daysSince("")` is `Infinity`, so every never-started student was counted «بلا تحديث». |
| P5b-b | **`notStarted: true` on a never-started student's summary**, present only then. | Additive, like P6's `selfReportedCount`: every started student's body is byte-identical. The client keeps its own counts-based rule, which agrees with it and also works on older payloads. |
| P5b-c | **The delayed report gives a never-started student one reason: «لم يبدأ بعد».** It no longer gives «بلا تحديث 7+ أيام». The «تقدّم أقل من N%» reason is dropped for that student, because 0 % is implied. Started students keep their reasons as before. | The teacher reading the report sees why a student is listed, in one word, instead of two reasons that both describe «never started». |

## The reviewed golden change (R33)

Exactly eight entries were refreshed. Only these body fields changed: `stale` went from true to false and
`notStarted: true` was added on the never-started students' summaries, and `staleCount` went from 2 to 1 in
`G794589.summary.c1`. Status, storage and audits are unchanged.

The eight entries are `G794589.student.c1.s2.disabled`, `G794589.summary.c1`, `G794589.students.c1`, `SG.s2`, `SG.s5`,
`SG.s6`, `SG.s9` and `SG.s10`.

The new invariant B8 checks two things on every summary any scenario returns: `notStarted` holds exactly when no active
stage has started, and a never-started summary is never stale.

## Evidence

- **Tests.** `api/tests/project-stale-p5b.test.js` has 5 tests. They check:
  - the summary for no document, an untouched document, activity on an inactive stage only, in progress / ready / approved long ago, and recent activity;
  - that a complete student is never stale (a pin);
  - `staleCount`;
  - the `students` and `summary` resources;
  - the delayed report's reasons.
- **Fail-first.** On `61cd4d3b`, 4 of 5 fail. For example, the summary of a student with no document was `[stale true, notStarted false]`, `staleCount` was 6 instead of 3, and the delayed reason was «بلا تحديث 7+ أيام».
- **Updated test.** `project-794589-analytics.test.js` pinned `staleCount 1` for a student with no progress at all («s3 never updated»), which is exactly the defect. It now expects 0, with the reason in a comment.
- **Mutation campaign.** 7 mutants, all KILLED:
  - S1 / S2: «started» ignores approved / waiting stages;
  - S3: the baseline rule;
  - S4: the flag emitted on every summary;
  - S5 / S6 / S7: the delayed-report reasons.
