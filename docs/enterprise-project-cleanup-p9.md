# Projects P-9 — clean-up: the two legacy routes removed, a read never writes

Phase P-9 of the projects roadmap («التنظيف»). It removes the two legacy Project-794589 routes. It also makes every project
read side-effect free: the teacher's project GETs and the reports. Teacher and student screens are unchanged: they already
used the generic routes. Grading and the stored document shapes are unchanged.

## Decisions

| # | Decision | Why |
|---|---|---|
| P9-a | **`/api/project-794589` (teacher) and `/api/student-project` (student) are removed.** The handler files and their route registrations are deleted. Project 794589 is served by `/api/project-tracker?projectCode=794589` and `/api/student-project-tracker`, over the same historical storage paths. | No source file of the web app calls either route (pinned by a test that scans `src/`). They were kept only for compatibility since Roadmap #33, and they duplicated the generic contract with known legacy limitations: 403 instead of 400, and a blank student with 200 for a non-member id. |
| P9-b | **A read never writes.** Every `GET /api/project-tracker` resource and every project section of `GET /api/reports` now use `readClassConfig`. That function returns the snapshot as the next write will see it: the in-memory first-create document for a class without a snapshot, or the in-memory upgraded document for a V1 794589 class that qualifies for the upgrade. Nothing is persisted and nothing is audited by a read. | Before P-9, opening a class's project page, or a report, created the class snapshot and could upgrade a V1 class, writing a `project.template.upgrade` audit as the side effect of a GET. A read could therefore change stored data and the audit trail. |
| P9-c | **The first write persists exactly what the read showed.** `ensureClassConfig` (writes only) and `readClassConfig` (reads) share one decision, `resolveClassConfig`. The first write is `program.activate`, `progress.update`, the bulk actions, a student's self-report or `template.update`. It persists the same document and audits the upgrade once. | One decision means the two cannot drift apart. The test checks that the template shown by a read equals the stored document after the first write. |
| P9-d | **`template.update` applies a pending upgrade before the teacher's patch.** | The patch used to rely on an earlier GET having persisted the upgrade. Without that GET, the patch landed on the V1 snapshot, and the next write upgraded over it and lost the teacher's change (measured on the baseline: `staleDays` reverted). |
| P9-e | **The `createSnapshot` option of the service is removed.** | Its only user was the legacy teacher route. |

## The reviewed golden change (R33)

`api/tests/fixtures/r33-golden.json` pins the project API byte for byte against the capture from unpatched main `656fa4e6`.

- **Removed:** the 59 entries of the removed routes (`L.*` teacher, `SL.*` student).
- **Refreshed:** exactly four GET entries. Only their storage delta changed, and for one of them also the system audit. Status, body and route audits are unchanged.

| Scenario | Before | After |
|---|---|---|
| `G794589.template.c2.lazyCreate` | snapshot `c2.json` added | nothing written |
| `G794589.template.c3.v1NoProgress` | `c3.json` upgraded + `project.template.upgrade` audit | nothing written, nothing audited (the body still shows the upgraded template) |
| `G794589.template.cL.legacyScalar` | snapshot `cL.json` added | nothing written |
| `G899373.template.cN.enrolled` | snapshot `cN.json` added | nothing written |

Every other entry (75 of 79) is byte-identical to the capture, including every write scenario.

## Tests adapted because their subject was removed

| File | Change |
|---|---|
| `legacy-794589-convergence-r33.test.js` + `fixtures/r33-fixtures.js` | Legacy scenarios and legacy-vs-generic comparisons removed. Every generic invariant is kept. New: every GET scenario leaves storage and the system audit untouched; the legacy route files do not exist. |
| `legacy-project-routes-multiproject.test.js` | Its source guard now checks the generic route and the service; the gate predicate tests are unchanged. |
| `teacher-tenancy-21g0.test.js` | The legacy-route tenancy test is the same test on `project-tracker?projectCode=794589`: classes, summary, students, template and `project.reset`. |
| `multi-project-enrollment-hardening.test.js`, `project-performance.test.js` | The 794589 cases go through the generic route. A non-member is now 404, not the legacy blank 200. |
| `observability-parity-r31.test.js` | The two legacy routes leave the wrapped inventory. |
| `tenancy-registry-21g0.test.js` | `project-794589.js` is no longer an endpoint to classify. |
| `scripts/mutate-21g.mjs` | Mutant G0-M14 targets the same tenancy line in `project-tracker.js`, which now serves 794589. |

## Not in P-9

- **The legacy formatter modules stay** (`project-794589-analytics.js`, `project-794589-legacy-shape.js`). They are now used by tests only (the engine parity tests). Removing them is a separate clean-up, done in P-9b (below).
- **The server's `stale` rule is unchanged.** The P-5 follow-up (a never-started student is not «بلا تحديث») is now unblocked: the legacy goldens are gone.
- **Production traffic was not inspected.** An agent does not read Application Insights. See the owner check in the pull request.

## Phase P-9b — the test-only legacy formatters are removed

After P-9 the two legacy formatter modules served no route. They were only read by tests:

- `project-794589-analytics.js` re-shaped the generic engine's class summary and analytics into the old 794589 fields (`avgBook`, `avgPacketTracer`, `perStudent[].book`). It had been a formatter over `project-tracker/analytics.js` since R33.
- `project-794589-legacy-shape.js` held those shape functions.

Both are deleted. Nothing in production imported them, so no route, payload or stored document changes. The legacy modules
that production code still uses stay: `project-794589-core.js`, `project-794589-progress.js`, `project-794589-migration.js` and
`project-794589-template.js`.

| Test | What changed |
|---|---|
| `api/src/lib/project-794589-analytics.test.js` → `api/src/lib/project-tracker/analytics-two-track.test.js` | Same class, same students, same numbers, run on the engine directly. The figures are read from the generic fields: `trackAverages.book` instead of `avgBook`, `trackProgress` instead of `book` / `packetTracer`. |
| `api/src/lib/project-tracker/engine.test.js` | Two tests compared the engine with the formatter, that is with itself. They now compare the class figures with the **legacy core** (`project-794589-core.js`), the independent implementation, per student: each student's overall, the class averages per track, and the completed, ready and stale totals. They also pin stage completion (50 % and 0 % stages). The weekly-trend equality is dropped: both sides were the same function. |
| `api/src/lib/project-794589-v2-integration.test.js` | The V2 heatmap and stage-completion checks run on the engine. The two tracks the formatter used to add are passed explicitly. |
| `api/tests/legacy-794589-convergence-r33.test.js` | C5 checked that the formatter only wrapped the engine. It now checks that both modules are gone. |


- **Fail-first.** Not applicable: no defect is fixed, and no route or payload changes. The new C5 guard fails on `cf192b7e`
  (`expected true to be false`: the modules still exist) and passes on the head.
- **Mutation campaign** on `project-tracker/analytics.js`, against the three moved / rewritten test files only. The first run
  left 3 of 7 mutants alive (L1, L3, L7): the formatter tests had never pinned these figures. Three tests were added to
  `analytics-two-track.test.js`:
  - an average of 37.5 rounds to 38;
  - two stages waiting for review on one student count 2;
  - a retired stage stays out of stage completion and the heatmap.

  Re-run, all 7 are KILLED:
  - L1: class averages floored;
  - L2: everyone complete;
  - L3: ready stages counted per student;
  - L4: per-student rows sorted highest first;
  - L5: «waiting for review» counted as approved;
  - L6: the track average reads the overall;
  - L7: inactive stages charted.

  The file was restored byte-for-byte (SHA-256 verified).
