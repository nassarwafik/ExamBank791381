# Phase P8 — «اعتماد المرحلة عند حفظ العلامة» (approve on save) in the student profile

## Problem

In a student's project profile («تقدّم الطلاب» → «فتح ملف الطالب») every stage needed two actions: type the score and
press «حفظ», then press «اعتماد». For a teacher grading a whole class this doubles the clicks and is easy to forget, so
stages stayed scored but not approved (not counted in the grade).

## Owner decision (recorded for this phase)

| Question | Decision |
|---|---|
| How should saving a score relate to approving? | **(b) a visible switch «اعتماد المرحلة عند حفظ العلامة», ON by default.** (Not (a) always approve, not (c) keep them separate.) |

## What ships (`src/projects/ProjectStudentDetail.tsx`, client only)

- **The switch** sits above the stage rows (a checkbox with `role="switch"`, a 44 px target), labelled
  «اعتماد المرحلة عند حفظ العلامة».
  - It is ON on a fresh device.
  - The teacher's choice is remembered on that device (`localStorage` key `eb.projects.approveOnSave`, `"0"` / `"1"`).
  - When storage is unavailable (a private window, blocked site data), it falls back to ON and still works for the session.
  - The hint under it says what a save does in each position.
- **With the switch ON:**
  - A stage that is **not yet approved** shows «حفظ واعتماد» (accessible name «حفظ واعتماد علامة المرحلة BKxx»). So does a
    stage the student marked themselves and the teacher has not confirmed yet (P2 / P3).
  - The save, by the button or by Enter, sends **one** `progress.update { score, status: "approved" }`.
  - The server applies both in one CAS write through the existing pipeline. It records the existing audits
    (`project.stage.approve`, with `verifiedSelfReport` for a student mark, and `project.stage.score`), and returns the
    recomputed summary / performance / evaluation.
  - The notice reads «تم حفظ العلامة واعتماد المرحلة.».
  - While it is in flight, the row's save **and** approve controls are busy, so a double click sends once.
- **Unchanged (the 8C / 9B rule):**
  - With the switch OFF, a save is `score.set` only and never changes the status.
  - A stage already approved by the teacher gets `score.set` only.
  - Clearing a score (`score.clear`) never approves.
  - «اعتماد» alone never sends a score.
  - The score grid («جدول العلامات», P4) keeps its own rule: a score never changes a status.
- **Archived classes:** no switch and no write controls, as before.

No server change: `progress.update` already accepted a score and a status together.

## Tests

| File | What |
|---|---|
| `src/projects/ProjectApproveOnSave.p8.test.tsx` (8, real handler, in-memory storage) | default ON + «حفظ واعتماد» → ONE `progress.update` with score + approval, stored approved, both audits, ready callback; Enter does the same; a student mark is confirmed (self-report cleared), a teacher-approved stage gets `score.set` only; clearing never approves; in-flight: save and approve busy, double click sends once; switch OFF → `score.set` only, status unchanged, remembered in a new profile and switched back on; blocked storage → ON by default and still toggles; archived class → no switch |
| `scripts/check-project-approve-on-save-browser-p8.mjs` | real Chromium on the production build at 390 / 1024 / 1440 px: the switch visible and ON, 44 px on touch; «حفظ واعتماد» stores score + approval in one request (checked in storage); OFF remembered when the profile reopens, then `score.set` only with the status unchanged; no horizontal overflow; axe (WCAG 2.1 A/AA) without a serious or critical violation. **Passed.** Output: `.harness-p8/` (ignored) |

**Fail-first** on `b253a3df`: 6 of 8 fail (no switch: `Unable to find an accessible element with the role "switch"`; the
Enter save leaves `{ status: 'ready_for_review' }`, not approved). The «clearing never approves» and «archived class: no
switch» tests pass there: they are **pins**.

**Tests updated deliberately.** These tests encode the switch-OFF contract (a save is `score.set` only), which is now the
non-default position, so each file sets the switch off in a `beforeEach`, with a comment pointing here:

- `ProjectStudentDetail.8c`, `.focus.9e`, `.queue.9f`, `.finish.9g`;
- `projectEvaluation.9b`, `ProjectWorkspace.ux6`;
- `AppProjectsReady.8e`, `AppEvaluationQueue.9f`, `AppEvaluationFinish.9g`.

Their assertions are unchanged.

## Mutation proof

Hash-verified apply / restore per mutant; tree clean afterwards. 9 mutants, **9 KILLED** (M02 survived the first round: the
storage-blocked test spied on `Storage.prototype`, which happy-dom's `localStorage` does not use; the test now replaces
`window.localStorage` with a throwing getter, and M02 is KILLED).

| Id | Planted defect | Killed by |
|---|---|---|
| M01 | the switch is OFF by default | default-ON test; Enter test |
| M02 | blocked storage turns the switch off | blocked-storage test |
| M03 | the choice is not remembered | switch-OFF test (new profile) |
| M04 | an approved stage is re-approved by every save | default-ON test; student-mark / teacher-approved test |
| M05 | a student mark is not confirmed by the save | student-mark test |
| M06 | the switch is ignored | switch-OFF test; blocked-storage test |
| M07 | a combined save leaves «اعتماد» clickable | in-flight test |
| M08 | clearing a score approves | clear test |
| M09 | two requests instead of one | default-ON test; Enter test |

## Known limits

- The choice is per device (browser storage), not per teacher account: a teacher on a second device starts with the
  default ON.
- The bulk review and the score grid are unchanged (they have their own explicit approve actions).
