# Phase 21H — Enterprise teacher dashboard («لوحة المتابعة»)

**Status:** 21H.0 implemented on branch `claude/nifty-clarke-k0wlid`; 21H.1–21H.5 planned. Each phase: exact-head CI,
independent review and the owner's manual merge (`AGENTS.md` §3, §13).

## 1. Why

An audit of the dashboard (teacher sidebar → «لوحة المتابعة»: `src/teacher/TeacherTodayHub.tsx` over `GET /api/teacher-today`,
then `src/TeacherDashboard.tsx` over the analytics read) found four groups of problems:

1. **Figures that are not true.**
   - «محاولات نشطة الآن» listed every open attempt, including ones left a week ago.
   - Counts did not say what they counted: «9» meant submissions while its rows were assignments, and «40» meant students while its rows were student × project pairs.
   - «تقييم المشاريع» counted stages nobody had worked on, so 40 students showed «0/105» each.
   - Zeros wore alarm colours.
2. **Two attention sections from two sources.**
   - «ما الذي يحتاج انتباهي الآن؟» is live and has no filter.
   - «يحتاج إلى انتباهك» is filtered by class and period.
   - «بانتظار التصحيح» appears in both, and the class filter sits between them and applies to the lower one only.
3. **A long page.** About ten sections, the quick actions repeat the sidebar, and the scope figures the server sends are never shown.
4. **Read cost.** Every 60-second refresh reads every submission of every published assignment, and every user document of the platform.

## 2. Decisions

The owner delegated the plan's decisions to the implementation (2026-10-16): «take charge, finish every phase; I only merge».
Each decision is recorded here so the owner can reverse it at review.

| # | Decision | Why |
|---|---|---|
| D1 | «نشطة الآن» = an open attempt whose last activity (its last autosave, else its start) is at most **15 minutes** old and that is not paused. Older or paused open attempts form a separate «محاولات مفتوحة بلا نشاط» list with their age. | The editor autosaves while a student works, so 15 minutes without a save means nobody is at the keyboard. Nothing is closed, ended or graded by this classification; it is display only. |
| D2 | «تقييم المشاريع» counts the stages a student **submitted for review** (`ready_for_review`) — the same figure as the sidebar badge — instead of every ungraded stage. | A stage the student never worked on is not the teacher's work. One definition removes the badge / card mismatch. |
| D3 | One page model: a single scope bar (class, period, last update, one refresh) at the top, a KPI row, one prioritised task inbox, then the analytics. | One number per fact; one filter that applies to everything. |
| D4 | Order: accuracy first (21H.0, 21H.1), then the page model (21H.2), actions (21H.3), read cost (21H.4) and the gate (21H.5). | The cheapest fixes to figures the teacher sees as wrong today come first. |

## 3. Phases

| Phase | Content | State |
|---|---|---|
| 21H.0 | True figures: active-now vs stale attempts; units with Arabic agreement; neutral zero; relative times | implemented |
| 21H.1 | Project attention = submitted stages awaiting review (D2) | planned |
| 21H.2 | One scope, KPI row, one task inbox (D3) | planned |
| 21H.3 | Direct actions from the cards (start grading, remind, end an idle attempt); due today / results not released / opening today; «عرض الكل» | planned |
| 21H.4 | Read cost of `teacher-today`: only the teacher's students, a short cache, measured before / after | planned |
| 21H.5 | Visual and accessibility gate on the dashboard (axe, overflow, touch targets at 390 / 834 / 1180 / 1440) | planned |

## 4. Implementation record and evidence (21H.0)

### What shipped

- **Active now vs idle** (`api/src/functions/teacher-today.js`).
  - An open attempt is «active now» when it is not paused and its last activity is within `LIVE_WINDOW_MS` (15 minutes, inclusive). Last activity is the later of `lastSavedAt` and `startedAt`.
  - Every other open attempt goes to the additive block `attention.staleAttempts {count, items}`. This covers attempts left idle, attempts the teacher paused, and attempts with an unreadable start.
  - Each item now carries `lastActivityAt`.
  - Nothing is closed or graded. Not-started and pending-review figures are unchanged.
- **The hub** (`src/teacher/TeacherTodayHub.tsx`, `src/teacher/todayFormat.ts`):
  - «محاولات نشطة الآن» lists only the students working now, and its line names them: «طالب واحد يعمل الآن».
  - A new card, «محاولات مفتوحة بلا نشاط», shows each idle attempt's age («آخر نشاط منذ 6 أيام») or «متوقفة مؤقتًا». It is rendered only when the payload carries the block, so an older payload or a malformed block shows no card.
  - Counts name their unit with Arabic agreement (`Intl.PluralRules("ar")` via `learning/arabicCount`): «9 تسليمات في واجبين», «8 تسليمات», «تسليم واحد», «لم يبدأ 4 من 5».
  - Recent activity reads «منذ ساعتين», measured from the summary's own `generatedAt`. The exact time stays in `<time dateTime>` and the tooltip.
- **Neutral zero.** An attention card with a zero count, in the hub and in the dashboard's own cards, uses the new `tone-neutral` (grey accent and count). Its colour is kept for a non-zero count.

### Evidence

| Check | Result |
|---|---|
| Fail-first on `573321f8` | `api/tests/today-live-21h0.test.js` «a paused attempt is stale … an unreadable start is stale, never «now»» fails with `expected 2 to be +0` (the paused and the unreadable attempts were counted as active now); all 3 tests fail on the baseline, all pass on the head |
| `today-live-21h0` (API) | 3 / 3: the split by last activity (autosave beats an old start), the inclusive 15-minute boundary, paused and unreadable → stale, no effect on not-started / pending |
| `today-hub-9a` (API) | the scope test now checks active + stale together; the empty platform returns an empty `staleAttempts` |
| `teacher-project-evaluation-9c` H14 (shape pin) | lists the additive `attention.staleAttempts` key; the first full run on `0766cf4e` caught the pin (1 failure of 13,210), fixed in the next commit |
| `todayFormat.21h0`, `TeacherTodayHub.21h0` | 2 / 2, 5 / 5: Arabic agreement (1 / 2 / 3–10 / 11+), relative ages and skew, the two attempt cards, units, neutral zero, relative recent time with the exact title, older and malformed payloads |
| Mutation `node scripts/mutate-21h.mjs h0` | 10 mutants, **10 KILLED**. H0-M5 (bad replacement: suite did not run) and H0-M8 (equivalent: a negative age already read «الآن») were corrected and KILLED in the isolated re-run |
| tsc / lint | clean / 124 |
