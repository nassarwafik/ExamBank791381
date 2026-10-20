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

Exactly ten entries were refreshed. Only these body fields changed: `stale` went from true to false and
`notStarted: true` was added on the never-started students' summaries, and `staleCount` went from 2 to 1 in
`G794589.summary.c1`. Status, storage and audits are unchanged.

The ten entries are `G794589.student.c1.s2.disabled`, `G794589.summary.c1`, `G794589.students.c1`, `SG.s2`, `SG.s5`,
`SG.s6`, `SG.s9` and `SG.s10`, plus `G794589.student.c4.s7.v1` and `SG.s7`.

The last two came with the reconciliation onto P7 (#374). P7's V1 restart leaves the V1 class's student s7 not started, so
only `notStarted: true` was added there; its `stale` was already false.

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

## Phase P-5c — the class summary counts «لم يبدأوا»

The class summary now reports how many students have not started, by the rule above: `notStartedCount`. Like P6's figures,
it is present only when it is above zero, so a class where everyone started keeps a byte-identical summary. The project
dashboard shows it as its own card, «لم يبدأوا» (hint «لم يبدأ أي مرحلة بعد», attention tone), only when the server reports
one or more. The «بلا تحديث N+ أيام: N» hint is unchanged.

- **Golden.** Exactly one R33 entry was refreshed: `G794589.summary.c1` gained `notStartedCount: 1`, and nothing else changed. The new invariant B9 checks that the summary's count equals the number of `notStarted` cards of the same class.
- **Tests.** `api/tests/project-not-started-count-p5c.test.js` (3) and `src/projects/ProjectDashboard.p5c.test.tsx` (2).
- **Fail-first.** On `1012b131`, 3 of 5 fail; the other 2 are pins that check nothing changes when everyone started.
- **Mutation campaign.** 6 mutants, all KILLED:
  - N1: every student counted;
  - N2: the stale students counted instead;
  - N3: the count always emitted;
  - N4: the count dropped;
  - N5: the card shown at 0;
  - N6: the dashboard reads the stale count.

## Phase P-5d — «لم يبدأوا» in the Reports Center

The same count (`notStartedCount`, present only when above zero) now appears where the reports show a project's other counts:

- **Project report** (`type=project`, whose summary already carried it): its own StatCard «لم يبدأوا» (attention tone, hint «لم يبدأ أي مرحلة بعد») after «بلا تحديث», and a CSV row `لم يبدأوا` appended after the frozen KPI rows.
- **Class report** (`type=class`): each project section now carries `notStartedCount` when it is above zero. The project card shows a «لم يبدأوا N» badge next to «مكتملون N», and the class CSV gets a `لم يبدأوا` row for that project.

A class where everyone started reads and exports exactly as before. The UX-6b CSV-parity rows are unchanged.

- **Tests.** `api/tests/reports-not-started-p5d.test.js` (3) and `src/reports/ReportsNotStarted.p5d.test.tsx` (4).
- **Fail-first.** On `4e3683bb`, 4 of 7 fail; the other 3 are pins.
- **Mutation campaign.** 7 mutants, all KILLED:
  - D1 / D2: the class report drops or always emits the count;
  - D3 / D4: the project card is never shown, or shown at 0;
  - D5: the project CSV row is always appended;
  - D6: the class badge is never shown;
  - D7: the class CSV row is never written.
