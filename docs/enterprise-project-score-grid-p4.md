# Phase P4 — Teacher score grid (جدول العلامات) and previous / next student

## Problem

After P1 and P2 the teacher can approve many stages at once and confirm students' own marks. Entering **scores** is still
slow:

- the only score entry is the student profile: one student at a time, one stage at a time, with «حفظ» per stage;
- for a class of 24 students and a group of 3 stages, that is 72 inputs spread over 24 profiles, each reached through the
  student list.

## Owner decisions (recorded for this phase)

| Question | Decision |
|---|---|
| Order of work | P4 (teacher entry) before P3 (student one-tap marking). |
| Scope when no other choice was given | The score grid and «الطالب السابق / التالي» first. |
| «حفظ واعتماد» (save and approve in one action) | **Not in P4.** It waits for an explicit owner decision, because P1 keeps a score and an approval separate. |

## What ships

### «جدول العلامات» — a fourth mode of «التقييم الجماعي»

**Layout**
- One group at a time: the class's students in rows, the group's active stages in columns.
- Each cell is a score input (0–100) tinted by the stage status:
  - «معتمدة»;
  - «بانتظار الاعتماد»;
  - «حدّدها الطالب», named in the cell's accessible label.
- The header row and the student column stay in view while the grid scrolls. The page itself never scrolls sideways.

**Keyboard**
- Enter / ↓ moves to the next student; Shift+Enter / ↑ to the previous one.
- ← moves to the next stage and → back (RTL).
- Focusing a cell selects its text, so typing replaces it.
- Escape restores the cell's saved score.

**Paste**
- A block copied from a spreadsheet (tab and new-line separated) fills the grid from the focused cell: rows are students, columns are this group's stages in order.
- Values beyond the grid are counted and reported, never wrapped.

**Values**
- 0–100, decimals allowed. Arabic-Indic digits (٠–٩, ۰–۹) and «٫» are accepted.
- An empty cell over a saved score clears it.
- An invalid cell is marked (dashed red border, `aria-invalid`) and blocks the save until it is corrected.

**Saving**
- «حفظ العلامات (n)» stores every changed cell in **one** `score.bulk` request; more than 300 cells go in chunks of 300.
- Saved cells drop their draft.
- Failed cells keep the teacher's value and are listed with their reason.
- A score never changes a status: approving stays its own decision.

**Unsaved scores** ask before they are lost:
- changing the track or group;
- leaving the grid for another mode;
- changing the workspace view or class, or refreshing;
- closing the browser tab (the browser's own warning).

**Archived classes** show the scores read-only, with no inputs and no save bar.

### «الطالب السابق / التالي» in the student profile

- Outside Evaluation Focus Mode, the profile shows «الطالب السابق», «n من N» and «الطالب التالي».
- They follow the student list **as the teacher sees it**, with its filter and search applied, in its order.
- Moving with an unsaved score or note in the profile asks first («البقاء هنا» / «تجاهل والانتقال»).
- A change made in the previous profile still refreshes the list on the way back.
- Focus Mode keeps its own queue navigation (9F) and does not show these buttons.

## API (additive, `/api/project-tracker`)

`POST { action: "score.bulk", classId, items: [{ studentId, stageId, score, expected? }] }`

- **`score`**: a number from 0 to 100, or `null` / `""` to clear.
- **`expected`** (optional): a number or `null`, meaning the score the grid showed. If the stored score differs when the pair is written, the pair is refused as `stale` (the response carries the current score), and nothing is written for it. A paste over an old grid can never silently overwrite a newer score. Without `expected`, the last write wins, exactly like `score.set`.
- **Refused with 400, writing nothing:**
  - an empty or oversized list (more than 300 items);
  - a duplicated (student, stage) pair;
  - an invalid score or `expected`;
  - a request that also carries `status`, `note` or a common `score`.
- **Execution:**
  - every pair runs through the canonical pipeline (`updateStudentProgress`: membership → snapshot → active stage → CAS);
  - one writer per student blob, students in parallel (4);
  - each change is audited (`project.stage.score`, `via: "score.bulk"`) and runs the milestone hook.
- **Response:** per-pair results (`ok`, `changed`, `score`, or `error`: `not_member` | `stage_inactive` | `stale` | `conflict` | `invalid` | `failed`) and totals.
- **Unchanged:** tenancy (another tenant's class → 404) and archived classes (403).

`updateStudentProgress` gains an optional `expectedScore`, checked against the stored score **inside the same CAS round**.
Every other caller is unchanged.

## Safety

- No status is ever written by `score.bulk`; the grid sends only scores.
- The stale guard is evaluated against the version being written. A concurrent change between the read and the CAS retries the round, and the guard is evaluated again.
- Drafts are keyed by (student, stage), so a group, track or class switch cannot apply one cell's value to another.

## Tests

- `api/tests/project-score-grid-p4.test.js` (11):
  - per-pair scores, with no status change, audit and milestones;
  - an approved stage stays approved;
  - clear and unchanged;
  - the board;
  - the stale guard (changed score, empty to filled, matching `expected`, last write wins without it);
  - validation refusals;
  - per-pair failures (another class, an inactive stage);
  - an archived class;
  - another tenant.
- `src/projects/ProjectScoreGrid.p4.test.tsx` (12, over the real handler):
  - digit and range parsing;
  - the grid layout;
  - typing, Enter, Shift+Enter, ↑ ↓ ← →, then one `score.bulk`;
  - clear;
  - invalid blocks the save;
  - paste, with overflow reported;
  - stale, then a deliberate retry with the fresh `expected`;
  - Escape;
  - the unsaved guards;
  - archived read-only;
  - previous / next through the list, with the unsaved-draft confirmation.
- **Fail-first on `a4061e6f`:**
  - API: 8 of 11 failed (`expected 400 to be 200`: no such action). The 3 that passed are pins, because the baseline refused those cases for another reason: an unknown action, an archived class, another tenant.
  - UI: 11 of 11 failed (no «جدول العلامات», no sibling navigation). The parsing case could not load there because its module did not exist.
- **Real Chromium** (`scripts/check-project-score-grid-browser-p4.mjs`, run locally): the production build and the real API in process, with a class of 24 students, at 390 (touch), 1024 and 1440 px. All checks pass:
  - 24 rows, sticky header and student column, cells ≥ 36 px;
  - no page overflow; at 390 px the student column stays in view while the grid scrolls;
  - Enter and ← (RTL) move as specified;
  - a real paste event fills a 3 × 2 block;
  - one `score.bulk` with the 8 changed scores, verified in storage;
  - axe: no serious or critical violation;
  - «1 من 24», and «الطالب التالي» opens the next student.

## Mutation proof

Hash-verified script; each mutant was planted alone and the files were restored byte-for-byte. **16 / 16 KILLED.**

| Id | Planted defect | Result |
|---|---|---|
| G01 | stale guard removed (service) | KILLED |
| G02 | a grid score also approves | KILLED |
| G03 | duplicated pairs accepted | KILLED |
| G04 | the grid sends no `expected` | KILLED |
| G05 | Arabic-Indic digits not normalized | KILLED (the first run was ERROR: the mutant itself was malformed; corrected and re-run) |
| G06 | 0–100 range check removed | KILLED |
| G07 | Enter does not move | KILLED |
| G08 | RTL arrows inverted | KILLED after strengthening: SURVIVED the first run because only the browser gate checked ←; the UI test now checks ← → Shift+Enter ↓ |
| G09 | paste ignores the focused row | KILLED |
| G10 | failed cells lose the teacher's value | KILLED |
| G11 | the grid leaves without asking | KILLED |
| G12 | the profile switches without asking | KILLED |
| G13 | «التالي» skips a student | KILLED |
| G14 | an invalid cell does not block | KILLED |
| G15 | grid scores not audited | KILLED |
| G16 | an archived class is editable | KILLED |

## Known limits

- **Row order:** the grid lists students in the board's order, the server's name order. Names with numbers sort as text («طالب10» before «طالب2»).
- **Notes:** the grid edits scores only; a note is still written in the student profile.
- **Not in P4:**
  - «حفظ واعتماد» (an owner decision);
  - a quick note in bulk review;
  - P3 (student one-tap marking);
  - P5 (stage settings).
- **No CI workflow:** the real-browser gate is a local certification script. Adding it to CI is a workflow (governance) change and was not made here.
