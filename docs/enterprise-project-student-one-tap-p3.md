# Phase P3 — Student one-tap stage marking («أنجزتها»)

## Problem

P2 let the student mark the stages they completed, but through a separate marking mode:
- «تحديد المراحل التي أنجزتها» opened checkboxes;
- the student ticked stages, then pressed «حفظ كمنفّذة».

That is three steps for the most common action (one stage just finished). On a phone, the stage list of a long track is
also one long page with nothing to say what is left to do.

## Owner decisions (recorded for this phase)

| Question | Decision |
|---|---|
| Order of work | P4 (teacher score grid) first, then P3. |
| Scope | One tap per stage with «تراجع», filters with counts, collapsible groups, «أنجزتها» on the next step, «أنجزت المجموعة كلها» after a confirmation. |
| Server | **Unchanged.** Every write is the P2 request; the P2 rules (never a teacher-approved stage, undo only the student's own unconfirmed mark, archived classes read-only) hold as they are. |
| Student comment on a mark | **Not in P3.** It waits for an owner decision. |

## What ships (`src/projects/StudentProjectPanel.tsx`, student portal «مشاريعي»)

### One tap

- Every stage not yet approved carries **«أنجزتها»**. The tap is the P2 request `{ projectCode, stageIds: [id], mark: true }`.
  The stage counts at once and shows «منفّذة — بانتظار تأكيد المعلم».
- Every own unconfirmed mark carries **«تراجع»** (`mark: false`), so a mistaken tap is undone with one more tap.
- A teacher-approved or confirmed stage has no action.
- While a write is in flight, its buttons are disabled, so a double tap sends once.
- Each button names its stage for assistive technology («أنجزت B01 — صفحة الغلاف», «تراجع عن تحديد B01 — صفحة الغلاف»).

### The next step

The «الخطوة التالية» card carries its own «أنجزتها» (primary). After the tap it shows the following step, as the server
reports it.

### Filters

- **Views:** «المتبقية (n)», «بانتظار تأكيد المعلم (n)», «المعتمدة (n)», «الكل (n)», counted per track.
- **Opening view:** a track opens on **«المتبقية»** when anything is left, otherwise on «الكل». The view is chosen when the
  track is shown and **never switches on its own**: marking the last remaining stage shows «أحسنت! لا توجد مراحل متبقية في
  هذا المسار.» instead of jumping to another view.
- **Empty views** say so: «لا توجد مراحل بانتظار تأكيد المعلم.» or «لا توجد مراحل في هذا العرض.».

### Groups

- Each group head is a toggle button (`aria-expanded`) with the group title and «done / total منجزة». A finished group's
  count is tinted as done.
- **Folding:** in «الكل», a group already fully done **when the project opened** starts folded, but only while its track
  still has work left (the student's attention goes to what is left). A finished track opens every group, so its scores and
  the teacher's notes are in view. A group the student completes now stays open: it never collapses under the student's
  finger.
- **«أنجزت المجموعة كلها (n)»** appears on an open group with more than one remaining stage. It asks first («تحديد
  المجموعة كمنفّذة»), then sends **one** request with only the group's remaining stages (never an approved or already
  marked one). A group stays far below the server's 60-stage limit.

### Layout

- **Touch targets:** «أنجزتها», «تراجع», «أنجزت المجموعة كلها» and the group heads are 44 px on phones and 36 px from
  768 px. The 36 px rule lives in the sheet's existing «Tablet and up» block, which the UX-8a guard reads.
- **Filter chips:** 40 px, and 44 px on phones through the shared rule.
- The P2 marking-mode styles (`.eb-sp-mark-bar`, the checkbox and `.is-picked` rules) were removed from
  `src/projects-pro.css`.

## Tests

- **`src/projects/StudentProjectOneTap.p3.test.tsx`** (10, over the real student handler):
  - the opening view and the counts;
  - a tap moves the stage to «بانتظار» without changing the view;
  - «أحسنت» after the last stage;
  - a finished track opens on «الكل» with every group open, and each track opens on its own view;
  - folding: a group done at open is folded, a group with work left is open, and the head toggles;
  - a group completed now stays open;
  - the next-step «أنجزتها»;
  - the group action: confirm and cancel, one request, only the remaining stages, the teacher's approval untouched;
  - the group action shown only while more than one stage is left;
  - a double tap sends one request.
- **Deliberately updated** to the one-tap interaction (they still pin the P2 semantics):
  - `src/projects/StudentSelfReport.p2.test.tsx`: the minimal request body, never an approved stage, undo, and the archived refusal;
  - `src/projects/projectEvaluation.9b.test.tsx` H1 and `src/StudentPortal.ux7a.test.tsx` (projects): they open «الكل» before
    reading the approved stage rows, because the list now opens on «المتبقية».
- **Fail-first on `2ae2be7c`:** 10 of 10 failed («عرض المراحل» does not exist: the P2 marking mode).
- **Real Chromium** (`scripts/check-project-student-one-tap-browser-p3.mjs`, run locally): the production build and the
  real API in process, at 390 (touch), 1024 and 1440 px. All checks pass:
  - it opens on «المتبقية (19)», and the approved stage is not listed;
  - buttons are 44 / 36 px, and the page has no horizontal overflow;
  - one tap sends one minimal request, stored as the student's own mark, and is counted in «بانتظار (1)»;
  - «تراجع» restores the stage in storage;
  - the whole group asks first, then sends one request with its 4 stages, stored;
  - axe finds no serious or critical violation.
- **Browser findings, fixed before commit:**
  - the 36 px desktop size lost to the more specific shared `.eb-button.is-small` (34 px), so the rules now carry `.eb-button`;
  - axe's first contrast report on «الكل» was measured during the chip's colour transition. The settled colours are white on #2563eb (≈ 5.2 : 1), recorded by the gate, which now measures after the transition.

## Mutation proof

Hash-verified script. Each mutant was planted alone and the file was restored byte-for-byte. **15 / 15 KILLED.**

| Id | Planted defect | Result |
|---|---|---|
| T01 | opens on «الكل» instead of «المتبقية» | KILLED |
| T02 | filters show every stage | KILLED |
| T03 | own marks counted as teacher-approved | KILLED |
| T04 | a group completed now folds under the finger | KILLED |
| T05 | a done group never starts folded | KILLED |
| T06 | the group mark also sends approved / pending stages | KILLED |
| T07 | the group mark without a confirmation | KILLED |
| T08 | both in-flight guards removed (button enabled, no pending filter) | KILLED |
| T09 | a teacher-approved stage offers «أنجزتها» | KILLED |
| T10 | no «أنجزتها» on the next step | KILLED |
| T11 | «تراجع» sends `mark: true` | KILLED |
| T12 | the group action for one stage / while folded | KILLED |
| T13 | a track keeps the previous track's view | KILLED |
| T14 | the group mark sends duplicated ids | KILLED |
| T15 | a finished track starts with its groups folded | KILLED |

**T08 history:**
- A first version also kept a synchronous ref guard. Removing that ref **SURVIVED**: React applies `disabled` before the
  next tap, so the ref was redundant (an equivalent mutant), and it was removed from the code.
- Each remaining guard alone (`disabled`, or the pending filter in `send`) also survives, because the other one covers it.
- Removing both is KILLED by «a double tap sends ONE request».

## Known limits

- **Not in P3:**
  - a student comment on a mark;
  - «حفظ واعتماد» (an owner decision);
  - P5 (stage settings).
- **Fold state** lives in the open project only. Reopening the project applies the opening rules again.
- **No CI workflow:** the real-browser gate is a local certification script, as in P4. Adding it to CI is a workflow
  (governance) change and was not made here.
