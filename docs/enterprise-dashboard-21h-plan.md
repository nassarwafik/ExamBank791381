# Phase 21H — Enterprise teacher dashboard («لوحة المتابعة»)

**Status:** 21H.0 in review as nassarwafik/ExamBank791381#333; 21H.1–21H.5 implemented on branch `claude/nifty-clarke-k0wlid` — the 21H plan is complete. Each phase: exact-head CI,
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
| 21H.1 | Project attention = submitted stages awaiting review (D2) | implemented |
| 21H.2 | One scope and one refresh for the page (D3, as revised in §6) | implemented |
| 21H.3 | Next actions: closing within 48 h, results to publish, opening within 24 h; «تذكير» on a row; priority order; «عرض الكل» | implemented |
| 21H.4 | Read cost of `teacher-today`: an ETag-verified document cache, measured before / after | implemented |
| 21H.5 | Visual and accessibility gate on the dashboard (axe, overflow, touch targets at 390 / 834 / 1180 / 1440) | implemented |

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

## 5. Implementation record and evidence (21H.1)

### What shipped

- **Server** (`api/src/lib/project-tracker/evaluation-attention.js`): `GET /api/teacher-today`'s `projectEvaluation` gains the additive block `review`, with `studentsAwaitingReview`, `totalReadyStages`, `attentionTotal`, `capped` and `attention`.
  - **What a row is:** one per current member of an active class with at least one active stage in `ready_for_review`, carrying `readyStages`. Rows are ordered by most submitted stages first, then by name.
  - **Badge parity:** the rule is the same as `ready-count.js` behind the sidebar badge, through the same `buildProjectEvaluation` stage statuses. The 9C counters are unchanged.
- **Hub** (`src/teacher/TeacherTodayHub.tsx`, `src/teacher/teacherTodayEvaluation.ts`): «مراحل مشاريع بانتظار مراجعتك».
  - The count is stages (the badge's figure), and the line «80 مرحلة من 23 طالبًا» says how many students they come from.
  - Each row reads «5 مراحل بانتظار المراجعة · 12/105 مراحل مقيّمة · الثاني عشر». Rows start the same 9F evaluation queue over the review rows, in the server's order.
  - With nothing submitted the card is neutral: «لا توجد مراحل سلّمها الطلاب بانتظار مراجعتك.»
  - An older payload (no `review`) or a malformed one keeps the 9C card. A row without a positive `readyStages` is skipped.

### Evidence

| Check | Result |
|---|---|
| `project-review-21h1` (API) | 3 / 3. Counted: submitted stages of current members on active stages only, so the untouched student, the archived student, the archived class and the unknown stage are left out. Order: most submitted first, not by name. **The total equals `projects-summary`'s `totalReadyForReview`.** The 9C counters are unchanged |
| `TeacherTodayHub.21h1` | 4 / 4: stages and students wording, rows, «و20 أخرى», no untouched or zero rows, the queue over review rows, the neutral empty card, older and malformed payloads |
| `teacher-project-evaluation-9c` H14 | the additivity pin lists `review`; the zero block includes an empty `review` |
| Mutation `node scripts/mutate-21h.mjs h1` | 8 mutants, **8 KILLED**. H1-M4 (ordering) survived first, because the fixture's names sorted the same way as the counts; the fixture now orders against the names, and the mutant is KILLED |

## 6. Implementation record and evidence (21H.2)

### D3 as implemented

The hub and the dashboard now share **one scope** and **one refresh**:
- the class filter and «تحديث» sit in the page's scope bar at the top;
- the live hub sits directly under it and follows the selected class.

UX-3's «يحتاج إلى انتباهك» stays: its four categories were locked by an earlier owner decision. They are not merged into the hub. Its description now says it reads «من نتائج الصف والفترة المحددين أعلاه», so it can be told apart from the live hub («مباشر الآن»).

### What shipped

- **Server** (`teacher-today.js`): `?classId=` narrows to one of the teacher's OWN classes.
  - It is applied after the tenancy filter, so it can only narrow. An unknown class, or another teacher's class, gets 404 «الصف غير موجود.»
  - The response names its `scopeClassId`.
  - `studentId` / `projectCode` in the URL are still ignored.
- **Page** (`TeacherPlatform.tsx`, `TeacherDashboard.tsx`, `src/teacher/todaySlot.ts`):
  - TeacherPlatform provides how to render the hub through a context slot, so the Dashboard's lazy boundary and its 8E source guards are unchanged.
  - The Dashboard renders the hub under its scope bar, in every state (loading, error, loaded). It uses the same parent and key, so the hub is mounted once and reads once.
  - The page's single «تحديث» re-reads both reads.
- **Hub** (`TeacherTodayHub.tsx`):
  - It takes `classId`, `refreshSignal` and `embedded`.
  - A summary belongs to the class it was read for: a later answer for an earlier class is dropped, and the previous class's figures are not shown while another class loads.
  - Embedded, it shows no refresh button or timestamp of its own («مباشر الآن · يتحدّث تلقائيًا كل دقيقة»).

### Evidence

| Check | Result |
|---|---|
| `today-scope-21h2` (API) | 3 / 3: no class → all classes; `classId=c1` → only c1 (and `scopeClassId`); unknown → 404; multi-user: another teacher's class → 404, the owner's → 200 |
| `TeacherDashboard.scope.21h2` | 3 / 3: the hub under the scope bar with no refresh of its own and one read; the class filter narrows the hub (`?classId=cA`) and the page's «تحديث» re-reads both; no stale figures while loading and a late answer for an older class never lands |
| `teacher-project-evaluation-9c` H-auth | studentId / projectCode are still ignored (equal bodies); classId of the archived class narrows to nothing (no `s21`) |
| Mutation `node scripts/mutate-21h.mjs h2` | 9 mutants, **9 KILLED**: classId ignored, scope widened past tenancy, unknown class answered, hub not sending the class, late answer landing, stale figures while loading, refresh not reaching the hub, the embedded refresh button, a remount on load |
| tsc / lint | clean / 124 |

## 7. Implementation record and evidence (21H.3)

### What shipped

- **Server** (`teacher-today.js`): three additive blocks, derived from the documents the hub already reads (no new read).
  - `dueSoon`: the assignment's deadline is within 48 hours, it is still open, and the block says how many members have not submitted. Nearest deadline first.
  - `resultsUnreleased`: release mode «manual», not yet released, with at least one submission. Both checks come from the 21G.5 authority `results-release.js`; nothing is released here.
  - `openingSoon`: the assignment opens within 24 hours.
- **Hub**:
  - **Priority order of the cards:** pending review → closing soon → not started → results to publish → messages → projects → active now → idle attempts → opening soon.
  - **«تذكير»:** a closing-soon or not-started row offers it next to the row, as its own button and never nested. It runs the confirmed 21G.7 `remindStudents`. Cancel sends nothing; the server decides eligibility and sends at most one reminder per student per day. The result is announced in a status line, and the hub re-reads.
  - **Where «تذكير» appears:** only on actionable rows, i.e. inside the app. Plain-text rows stay as 12B defined them.
  - **«عرض الكل في الواجبات»:** shown when a card has more rows than it displays.
  - **Arabic agreement:** messages now agree with their count («3 رسائل»).
  - **Older payloads:** an older or malformed block renders no card.
- **Kept on purpose:**
  - **Ending an idle attempt** stays in the gradebook. Ending an attempt grades it, so the idle-attempt card says to open the attempt to extend or end it there.
  - **The six quick actions** are unchanged. They are pinned by 9A / 21E.2 («same six buttons, same order, same names»).

### Evidence

| Check | Result |
|---|---|
| `today-categories-21h3` (API) | 4 / 4: the 48 h boundary (inclusive), past and later deadlines, the not-submitted count; manual / released / afterDue / immediate / without submissions; an unreadable mode is not «the teacher's step»; opening within 24 h only, with nobody «not started» before it opens |
| `TeacherTodayHub.21h3` | 5 / 5: wording with relative times and units, the priority order, «تذكير» (cancel sends nothing; confirm sends exactly `{action:"remindStudents", assignmentId}` and reports «✓ أُرسل التذكير إلى 3 طلاب … طالب واحد ذُكّر اليوم مسبقًا.»), «عرض الكل في الواجبات», older and malformed payloads |
| 12B / 9A | the row labels are unchanged (only their order follows the cards); «3 رسائل» replaces the ungrammatical «3 رسالة» |
| Mutation `node scripts/mutate-21h.mjs h3` | 12 mutants, **12 KILLED**. H3-M6 survived first (the closing-soon fixture now also pins `openingSoon` = 0); H3-M10 was a no-op rename, replaced by «the closing-soon card is dropped» |

## 8. Implementation record and evidence (21H.4)

### Why not «only the teacher's students»

Narrowing the user read to a class's `studentIds` was rejected. That roster is a denormalized, repairable index and never authoritative (Roadmap #25). Membership is the user document's own `classId`, through `class-membership.js`. Reading only the listed ids could silently drop a member from every figure.

### What shipped

- **`api/src/lib/etag-doc-cache.js`:** an in-memory, per-container, LRU-bounded cache (20,000 documents / 32 MB of text), keyed by blob name AND the ETag the listing reports.
  - **When a cached copy is used:** only if the current listing reports the same ETag. A changed, new or ETag-less document is downloaded, and a deleted one disappears.
  - **What a hit returns:** a freshly parsed object, so one request never sees another's mutation.
  - **Authority:** none. A cold or evicted cache only means more downloads.
- **`teacher-today.js`:** reads classes, users and every published assignment's submission folder through it.
  - The test seams (`deps.listJson`, `listBlobNames`, `downloadManyJson`) keep the plain path, and `deps.docCache = null` disables the cache.
  - The count-only read-cost event adds `docCacheHits` and `docsDownloaded`.

### Measured (real handler + real in-memory container)

| Fixture | Warm lists / downloads, 12E-B | Warm lists / downloads, 21H.4 (nothing changed) |
|---|---|---|
| T1 | 3 / 10 | 3 / 4 |
| T10 (10 × 3 submissions) | 12 / 47 | 12 / 13 |
| T-MANY-ARCHIVED | 3 / 10 | 3 / 4 |
| T-MANY-OTHER/INACTIVE | 3 / 14 | 3 / 4 |

The cold (first) request is unchanged. The full formula is in `docs/read-cost-baseline-12e.md` (21H.4 section).

### Evidence

| Check | Result |
|---|---|
| `etag-doc-cache-21h4` | 8 / 8: unchanged second load downloads nothing; changed / new / deleted documents are seen; no ETag → always downloaded; a downloaded or cached document mutated by a caller never changes the next result; entry and byte bounds; two containers never share; `null` → plain path; **teacher-today: a submission changed between two refreshes changes the figures on the second** |
| `read-cost-teacher-today-12e` / `read-cost-observability-12e` | updated deliberately: warm and migrating second requests download 0 unchanged class / user / submission documents; exact warm numbers above; two added count-only fields |
| Mutation `node scripts/mutate-21h.mjs h4` | 6 mutants, **6 KILLED** (ETag ignored, ETag-less served from cache, shared object on a hit, no entry bound, one cache for two containers, cache bypassed). H4-M3 survived first; the isolation test now also mutates a cache hit |

## 9. Implementation record and evidence (21H.5)

### Method

- **Tools:**
  - axe-core 4.10.2 (WCAG 2.1 A/AA), downloaded into a scratch directory as a measuring tool, not a project dependency;
  - a horizontal-overflow check;
  - a touch-target check on the touch sizes: 44 px for every control, 24 px for a selection box.
- **What was checked:** the production build of the head, with every `/api/**` answered in the browser by a realistic school. The dashboard was checked with all classes and with one class, at 390 and 834 (touch) and at 1180 and 1440 px.

### Found → fixed

| Finding | Fix |
|---|---|
| `role-img-alt` ×4–5 on every screen: Chart.js marks each canvas `role="img"` with no name | every canvas is `aria-hidden`; the ChartCard figure (`role="img"`, named by the chart's summary) is unchanged |
| 7–36 controls under 44 px on the touch sizes (toolbar 40, period 34, card buttons 34, table links 19, «عرض البيانات كجدول» 34) | `@media (pointer: coarse)` blocks in `dashboard-pro.css` and `teacher/teacherToday.css`: every dashboard and hub control is at least 44 px, and table links are 44 × 44 |
| Ragged, narrow hub cards (five columns of about 210 px at 1440, gaps under short cards) | auto-fill columns of at least 260 px with equal heights per row; «تذكير» wraps under a narrow row |

**After: 16 / 16 checks, 0 violations, no horizontal overflow, no target below its minimum.**

A full-page screenshot in Playwright's mobile emulation drops the touch media emulation for the checks that follow it. The gate's numbers therefore come from a run without screenshots; the screenshots are only for looking.

### Evidence

| Check | Result |
|---|---|
| `dashboardGate.21h5` | 3 / 3: the five canvases are `aria-hidden` and the figure keeps its name; the coarse-pointer selectors and sizes; the grid rule |
| Mutation `node scripts/mutate-21h.mjs h5` | 5 mutants, **5 KILLED** |
| Gate | 16 / 16 clean (before: role-img-alt on 8 / 8 screens and undersized targets on 4 / 4 touch screens) |

## 10. What the plan leaves to the owner

- **Ending an idle attempt** stays in the gradebook, because ending grades the attempt.
- **The six quick actions** stay as 9A / 21E.2 pinned them.
- **UX-3's four categories** stay. 21H.2 only gives the page one scope.
- **Automatic reminders** would need a scheduled job, which is a deployment change.
