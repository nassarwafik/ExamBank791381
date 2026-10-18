# Phase L — Enterprise learning materials («المواد التعليمية») and reader

**Status:** L.0–L.7 merged into `main`; L.8, the closing gate, implemented and in review. Each phase: exact-head CI, independent
review and the owner's manual merge (`AGENTS.md` §3, §13).

## 1. Why

An audit of the learning-materials area found these problem groups. It covered the library, the book overview, the
teacher and student readers, publication, Study / Training, the API and the tests, and included real-browser
measurements at 390, 834, 1024 and 1440 px.

1. **What the screen says is not true.**
   - The «المقدمة» section has no module, but it opened the Reader at the same page as section 2.
   - The reader showed «يجري تجهيز محتوى الكتاب التفاعلي تدريجيًا» although all 28 modules are converted.
   - The book was named «كتاب 791381» instead of «شبكات الاتصال».
   - The overview swallowed a failed manifest load silently.
   - The publication panel printed «1 وحدات», «2 وحدات» and «11 وحدات».
2. **The reader is not a professional reader.**
   - From 1024 px up the table of contents is a fixed 300 px column with no way to hide it: it takes 33 % of the reader
     at 1024 px.
   - With the page title, the toolbar, the note and the page bar around it, the text gets **41.7 % of a 1024×768
     screen and 44.7 % of 1440×900** (measured on the L.0 build by the L.1 method, §5; the report's first estimate,
     38 % / 41 %, was read off screenshots).
   - The page shows internal metadata («المصدر: كتاب 791381 · PDF صفحة 13»).
   - Unit-opener pages are mostly white.
   - There is no focus mode, no dark theme and no swipe navigation.
3. **No navigation state.** There is no URL per book / section / page, and the browser back button leaves the area.
4. **Progress lives on one device.** Reading progress and resume use localStorage only, and the teacher has no
   reading analytics.
5. **Soft gating.** Answer keys and unpublished modules ship in client chunks.
6. **Operations.**
   - `exam-library` has no observability and no cache.
   - `learning-training` reads its file synchronously on every request.
   - Content chunks have no bundle budget.

Correction to the audit: the three definitions of the book (catalog, manifest, server registry) and the Strength
module count (28) **are already pinned** to each other:

- `courseHomePremium.21el1b.test.ts` pins the catalog against the manifest batches.
- `summary.m28.test.ts` pins the manifest against the server registry.
- `api/tests/student-strength.test.js` pins `STUDY_MODULE_COUNT` against the registry.

No new pin is needed.

## 2. Decisions

The owner delegated the plan's decisions to the implementation (2026-10-17: «هيا نبدا العمل» after the report proposed
D1–D4 with recommendations). Each decision is recorded here so the owner can reverse it at review.

| # | Decision | Why |
|---|---|---|
| D1 | A section with no pages (today «المقدمة») is shown as **«قريبًا»** without an open control, until its content is authored. The overview still lists eight sections. | Opening another section's page was wrong. Hiding the section would remove a real part of the book from its structure. |
| D2 | **L.5 moves restricted content (unpublished modules, answer keys) behind the API.** Offline reading of those parts will then need a connection. | Security first: a student with developer tools must not read unpublished content or answers. |
| D3 | Notes and highlights (L.4) are **private to the student**. | Privacy by default. Sharing with the teacher can be a later, explicit feature. |
| D4 | Offline reading (service worker) is **deferred** until after L.8. | It interacts with D2 and with cache invalidation; it is not needed for an enterprise reader. |
| D5 | The reader redesign (L.1) comes right after L.0, before routing. | The owner flagged the reader («القاريء نفسه ليس احترافي والفهرست ياخذ مساحة على حساب القاريء»), and it is what students see most. |

## 3. Phases

| Phase | Content | State |
|---|---|---|
| L.0 | Accuracy and trust: «المقدمة» = «قريبًا»; overview load status + error with retry; no stale release note; the book by its title in the reader; agreed Arabic counts in the publication panel; stale comments | implemented |
| L.1 | Professional reader. Collapsible table of contents on every width (overlay under 1280 px, remembered choice). Focus mode that hides the app chrome. One compact 48 px toolbar with icon buttons + «المزيد». Progress line. Pager with lesson position and the next lesson's title. Internal metadata behind «معلومات». Designed unit openers. A cleaner two-level TOC with read ticks and a filter. Reading typography (60–75 characters, 17–18 px, 1.8 line height). Dark theme. Swipe on phones. **Target: the text gets ≥ 70 % of the screen at ≥ 1024 px in focus mode.** | implemented |
| L.2 | Navigation: a URL for library / book / section / page, a working browser back button, reload keeps the place. Clickable module list for students. (Teacher preview parity moved to L.3, which brings the server-side progress it needs.) | implemented |
| L.3 | Server-side reading progress and resume (cross-device); localStorage stays the fallback; teacher preview parity (study client). The activity-event sink moves to L.4 with the analytics that will read it | implemented |
| L.4 | Teacher reading analytics per class (read %, stuck students, last activity); publication status and publishing from the book page | implemented |
| L.5 | Reader features: bookmarks, private notes and highlights (D3), print styles | implemented |
| L.6a | Restricted content: module bodies served by the API after the publication check; none ships as a public asset (D2, part 1) | implemented |
| L.6b | Answer keys, hints and explanations stay on the server; verdict and feedback come from the server for every answer (D2, part 2) | implemented |
| L.7 | Operations: `exam-library` observability + cache, in-memory `learning-training`, content-chunk bundle budget, measured before / after | implemented |
| L.8 | Gate: real-browser reader journey (open, navigate, resume, back), axe and 44 px touch targets at 390 / 834 / 1024 / 1440 | implemented |

## 4. Implementation record and evidence (L.0)

### What shipped

- **Course overview** (`src/learning/LearningMaterialsPage.tsx`, `learning.css`):
  - A section whose modules have no pages is a static row with «قريبًا» **once the manifest proves it empty** (D1).
  - While the manifest loads, every row stays a live control, and a status line «جارٍ تحميل تفاصيل الأقسام…» shows.
  - A failed load is an alert («تعذّر تحميل تفاصيل أقسام الكتاب. ما زال بإمكانك فتح القارئ.») with «إعادة المحاولة».
    The rows stay usable, and the existing fallback opens the book's beginning.
  - The overview is keyed by course, so a retry state never leaks between books.
- **Reader** (`src/learning/reader/LearningReader.tsx` and the L2-A / L2-C stylesheets):
  - The release note, its per-course localStorage key and its styles are removed.
  - The toolbar, the presentation-mode label and the in-book search source use the manifest title. «كتاب <number>» is
    only the stand-in while the manifest loads.
- **Publication panel** (`src/students/ClassLearningMaterialsPanel.tsx`): «مادة تعليمية مضافة», «وحدة منشورة للطلاب»
  and «وحدة غير منشورة» agree with their count. `arabicCountParts` keeps the digits in `<strong>`.
- **Comments:** the manifest and catalog headers describe the current state (28 modules converted; the introduction
  pending) instead of «SKELETON ONLY / PARTIAL / Phase 1».

### Evidence

- **Fail-first on the baseline 8697af6d:** 12 of the new / changed tests fail on a detached worktree of the baseline.
  - `LearningMaterialsPage.l0.test.tsx` 3/3.
  - `ClassLearningMaterialsPanel.counts.l0.test.tsx` 6/6. «1 مواد تعليمية مضافة» and the missing `arabicCountParts`.
  - The L.0 cases in `LearningReader.l2a.21e.test.tsx` 2. The note is present; «كتاب 791381» instead of the manifest title.
  - `readerEnterpriseL2a.21e.test.ts` 1.

  All 12 pass on the head.
- **Changed expectations:**
  - `LearningMaterialsPage.test.tsx` and `courseHomePremium.21el1b.review.test.tsx` now wait for the manifest and expect
    seven controls plus the «قريبًا» intro (D1). The old tests passed only by clicking before the manifest had loaded.
  - `LearningReader.presentation.test.tsx` expects the manifest title.
  - The L2-A release-note tests are replaced by «no note».
- **Mutation:** `node scripts/mutate-l.mjs l0` → **9/9 KILLED**, every mutated file restored byte-for-byte, git status
  clean.

  | Id | Planted defect | Verdict |
  |---|---|---|
  | L0-M1 | the intro is a control again | KILLED |
  | L0-M2 | rows disabled while loading / after a failure | KILLED |
  | L0-M3 | a failed load is silent | KILLED |
  | L0-M4 | the retry does not reload | KILLED |
  | L0-M5 | no loading status | KILLED |
  | L0-M6 | the toolbar names the book by its number | KILLED |
  | L0-M7 | presentation labelled by the number | KILLED |
  | L0-M8 | every count plural | KILLED |
  | L0-M9 | the digits lose their emphasis | KILLED |

- **Full validation on the head:**
  - `npm test`: 1080 files / 13252 tests passed.
  - `npm run lint`: 0 errors, 124 warnings, the same count as `main`.
  - `npx tsc -b`, `npm run build` (bundle guard passed) and `git diff --check` are clean.
- **Real browser** (production build, local mock API): the overview at 1440 px shows «المقدمة» as «قريبًا» and the
  seven sections with their details; the reader at 390–1440 px shows no note and the title «شبكات الاتصال».

## 5. Implementation record and evidence (L.1)

### Decisions taken inside L.1

| # | Decision | Why |
|---|---|---|
| L1-a | The index **docks only from 1280 px**. Below that, in focus mode and in presentation, it is the overlay drawer. | At 1024 px the docked index took 33 % of the reader. From 1280 px a 280 px column still leaves the page more than 860 px. |
| L1-b | The docked / folded choice is **remembered on this device** (`eb.learning.reader.tocDocked.v1`). Focus mode is **not** remembered. | Same rule as the reading settings: the index is a reading-comfort preference. Focus mode changes the whole app, so it must never surprise the next session. |
| L1-c | Focus mode hides the host's chrome through a **document flag** (`<html data-eb-reading-focus>`) that the Reader's stylesheet reads. It is not a modal overlay. | The shell stays a normal page: no second focus trap and no hidden-but-focusable navigation, because `display: none` removes it. Unmounting the Reader always clears the flag. The student portal already opens the Reader full-screen, so the flag hides nothing there. |
| L1-d | Toolbar controls are icons with their names **kept in the DOM** (visually hidden) and shown as a tooltip. On phones, focus, motion and presentation sit behind «المزيد». | Accessible names stay exactly the same (every earlier test that finds a control by name still passes), and the book title keeps its room on a 390 px phone. |
| L1-e | In the «داكن» theme, **figures and activities keep a light plate**. | Their drawings were authored on light tokens; white labels on the dark-theme blue would drop to 2.7:1. |

### What shipped

- **`LearningReader.tsx`:**
  - `data-toc` set to `docked` or `drawer`, and `data-focus`;
  - the «الفهرس» toggle docks or folds the index (≥ 1280 px) or opens the drawer;
  - focus mode, with Escape to leave it;
  - the compact toolbar with the title block («الكتاب» + «الوحدة › الدرس») and «المزيد»;
  - «التالي» described by the next page's title;
  - swipe handlers;
  - unit contents on unit-opener pages.
- **New modules:**
  - `readerLayout.ts` (the docking preference);
  - `useReaderSwipe.ts` (RTL swipe that never starts on a control, an activity, a horizontal scroller or a mostly vertical gesture);
  - `UnitContents.tsx` (the unit's lessons with page counts and read marks).
- **`LearningPageRenderer.tsx`:** the kicker names the unit and the context line the lesson. The PDF / printed-page source moves behind «مصدر الصفحة» (`<details>`).
- **`readingSettings.ts` / `ReadingSettingsDialog.tsx`:** the «داكن» theme.
- **`reader-enterprise-l1.css`:**
  - index docking;
  - sticky compact toolbar;
  - focus-mode chrome rules;
  - page head disclosure;
  - unit contents;
  - next-page title;
  - a calmer two-level index;
  - the contrast-checked dark palette with the light figure plate;
  - 44 px controls on touch screens (tablets too).

### Measured (production build, real Chromium, teacher route, page 7 of 248)

| Viewport | Before (L.0 build) | L.1 normal | L.1 focus mode |
|---|---|---|---|
| 1024×768 | 41.7 % (text column 580 px; index 300 px) | 64.7 % (904 px, index as drawer) | **80.6 %** (1000 px) |
| 1440×900 | 44.7 % (832 px; index 300 px) | 46.1 % docked (index 280 px), 62.0 % folded | **73.3 %** (1240 px, centred) |
| 834×1112 | 82.0 % | 81.8 % | 85.4 % |
| 390×844 | 77.3 % | 77.0 % | 78.9 % |

"Text share" is the visible area of the reading column (`.learning-reader-main`) between the sticky toolbar and the
page bar, divided by the viewport area. The 834 and 390 baselines already had no docked index, so they barely move.
The gain there is the toolbar: at 390 px the title went from «ش…» to «شبكات الاتصال».

**axe** (wcag2a/aa, 2.1, 2.2 aa) on the Reader at 390 / 834 / 1024 / 1440, in the normal, «المزيد» open, focus, dark and
drawer states: **0 violations**.

**Touch targets** (coarse pointer, 390 and 834): no Reader control under 44 px. Two existing 34 px controls on tablets
were found and fixed: an exercise's «تحقّق» and the drawer's «إغلاق».

### Evidence

- **Fail-first on the L.0 head 6920be26:** `LearningReader.l1.test.tsx` fails 13/13 and `reader.l1.guards.test.ts`
  fails to load (`useReaderSwipe` does not exist). All pass on the head.
- **Changed expectations:**
  - `LearningReader.l2a.21e.test.tsx`: seven toolbar labels, adding «وضع التركيز» and «المزيد».
  - `LearningReader.l2c.21e.test.tsx`: nine radios. The malformed-theme case now stores «neon», because «dark» is valid.
  - `LearningPageRenderer.test.tsx`: the unit and lesson names are looked up inside the «قيد الإعداد» state, since the
    page head now names them too.
- **Mutation:** `node scripts/mutate-l.mjs l1` → **16/16 KILLED**, each by the test that owns the invariant. Every file
  was restored byte-for-byte and git status was clean.
  - The first run reported two kills by the wrong test: the swipe test failed on its own when run alone (its control
    was a lazily rendered exercise button).
  - The test now starts its control gesture on the always-rendered «مصدر الصفحة» summary, which the swipe guard now
    also leaves alone. The re-run attributes every kill correctly.

  | Id | Planted defect | Killed by |
  |---|---|---|
  | L1-M1 | the index docks below 1280 px | l1 › below 1280px «الفهرس» opens the overlay drawer |
  | L1-M2 | focus mode keeps the docked index | l1 › focus mode |
  | L1-M3 | the docked / folded choice is not remembered | l1 › from 1280px … survives a remount |
  | L1-M4 | the focus flag outlives focus mode and the Reader | l1 › focus mode |
  | L1-M5 | Escape no longer leaves focus mode | l1 › focus mode |
  | L1-M6 | «التالي» loses its description | l1 › «التالي» keeps its name … |
  | L1-M7 | «المزيد» stays open after an action | l1 › «المزيد» |
  | L1-M8 | the kicker names the book number | l1 › the page head names the unit and the lesson |
  | L1-M9 | the source is a bare line again | l1 › the page head … |
  | L1-M10 | the swipe direction is inverted | l1 › swipe |
  | L1-M11 | a swipe from a control turns the page | l1 › swipe |
  | L1-M12 | a vertical scroll counts as a swipe | l1 › swipe |
  | L1-M13 | «داكن» is forgotten on reload | l1 › «داكن» reading theme |
  | L1-M14 | the unit contents list the opener lesson | l1 › unit contents (real book content) |
  | L1-M15 | focus mode hides the whole page column | guards › focus mode hides exactly … |
  | L1-M16 | the folded index still shows its column | guards › docks the index only for data-toc=docked |

- **Full validation on the head:**
  - `npm test`: 1082 files / 13273 tests passed. The first run had three load-timing failures in unrelated files
    (`App.saveConflict.21f0`, `visuals.guards`). Both pass alone (12/12), and the second full run was clean.
  - `npm run lint`: 0 errors, 124 warnings, the same count as `main`.
  - `npx tsc -b`, `npm run build` (bundle guard passed) and `git diff --check` are clean.

## 6. Implementation record and evidence (L.2)

### Decisions taken inside L.2

| # | Decision | Why |
|---|---|---|
| L2-a | The location is a **URL fragment** owned by Learning Materials: `#/learning`, `#/learning/<course>`, `#/learning/<course>/read[/<page>]`. | The app has no router, and the teacher shell keeps its navigation in state. A fragment needs no Static Web Apps rewrite and changes no other page. Ids are validated; anything malformed is "no route" and normalises to the library. |
| L2-b | A view change is a history entry. A Reader page turn **replaces** the entry. | Back goes from the reader to the book and from the book to the library, as a reader expects, and 248 page turns never flood the history. |
| L2-c | The fragment is removed when the teacher leaves Learning Materials. A link that brought the teacher to the sign-in page is honoured after it. | The sign-in used to reset every teacher to the builder, so a shared link was lost. That gap was found by the App-level test. |
| L2-d | A student's unit link opens the Reader at that unit only after the **same open-time re-validation** as «فتح المادة». A unit hidden since the panel loaded says so and does not open. | Release authority is unchanged: the restricted manifest still decides, and a valid page id (e.g. after a training) still wins over the unit. |
| L2-e | Teacher-preview parity with the student view (the study client) moves to **L.3**. | The parity needs the server-side progress L.3 introduces; a fake study state in the preview would mislead. |

### What shipped

- **`src/learning/learningRoute.ts` (new):** parse, format, write (push / replace) and clear the fragment; `isLearningLocation()`.
- **`LearningMaterialsPage.tsx`:**
  - the initial view comes from the URL;
  - `setView` pushes an entry, `popstate` replays it, a Reader page change replaces it;
  - leaving the page clears the fragment;
  - an unknown or unavailable book resolves to the library.
- **`App.tsx`:** a Learning Materials link opens the teacher app on that page, both on load and after sign-in.
- **`LearningReader` / `LearningReaderWithTraining` / `StudentReader`:** `initialModuleId`, which opens at that module's first page in reading order. An unknown module opens the beginning, and a valid `initialPageId` wins.
- **`StudentLearningMaterials.tsx` / `StudentPortal.tsx`:** each released unit is a 44 px link-like control that re-validates the release and then opens the Reader at the unit.

### Evidence

- **Fail-first on the L.1 head d87f71a8:**
  - `LearningMaterialsPage.l2.test.tsx` cannot load (`learningRoute` does not exist).
  - `StudentLearningMaterials.l2.test.tsx`: 3/3 fail.
  - `App.learningRoute.l2.test.tsx`: the link case fails. The no-link case passes, because it pins the unchanged default start.
  - All pass on the head. The new portal case in `StudentPortal.learningMaterials.test.tsx` also passes on the head.
- **Mutation:** `node scripts/mutate-l.mjs l2` → **13/13 KILLED**, every file restored byte-for-byte, git status clean.
  - **History** (L2-M1…M4):
    - no push;
    - a page turn pushes;
    - popstate ignored;
    - the fragment outlives the page.
  - **Unknown book in a link** (L2-M5).
  - **Parser leniency** (L2-M6…M8):
    - trailing segments;
    - any verb;
    - a malformed page id.
  - **Sign-in ignores the link** (L2-M9).
  - **The Reader and the unit** (L2-M10, M11):
    - the unit is ignored;
    - the unit beats a valid page.
  - **A hidden unit still opens** (L2-M12).
  - **The portal drops the unit** (L2-M13).
- **Full validation on the head:**
  - `npm test`: 1085 files / 13285 tests passed.
  - `npm run lint`: 0 errors, 124 warnings, the same count as `main`.
  - `npx tsc -b`, `npm run build` (bundle guard passed; the initial JS graph went from 114.1 to 114.5 KB gzip against the 125 KB budget) and `git diff --check` are clean.

## 7. Implementation record and evidence (L.3)

### Decisions taken inside L.3

| # | Decision | Why |
|---|---|---|
| L3-a | Opening a book **without a chosen page or unit resumes at the student's last page** from any device. A chosen page (the Today hub's «أكمل من حيث توقفت», a search result) or unit still wins. | That is what readers expect, and the index is one tap away for the beginning. The wait for the server is bounded (`RESUME_WAIT_MS` = 2.5 s); after it, or on any failure, the book opens at its beginning. |
| L3-b | A page counts as **read after 1.5 s on it** (`READ_DWELL_MS`). Pages skipped through faster are not recorded. | A record of reading, not of clicking; it also bounds the writes to one per page the student actually stayed on. |
| L3-c | The server accepts a page **only from a generated page index** (`api/src/data/learning-pages/<course>.json`, pinned to the manifest), and only when the page's own module is published to the **persisted** class. | The document is bounded by the book's size and can never hold an invented id. Release authority stays where it is (the class record), never in the token or the body. |
| L3-d | The view is filtered to the units visible **now**. Hiding a unit removes it from the view without deleting the stored pages, so re-publishing restores them. | Unpublishing a unit is reversible, so its stored reading must survive. |
| L3-e | Progress is **student-only**: a teacher preview neither reads nor writes it. It is **never a grade**: no Strength, study, assignment or gradebook document is read or written. | Teacher reading analytics (L.4) will be a separate, class-scoped, tenancy-guarded endpoint. |
| L3-f | The teacher preview gets the **same study client** as a student, authenticated as the teacher. The server judges the teacher's answers and stores nothing. | This is the preview parity moved from L.2. The page shows the student's study line instead of a different, local-only behaviour. |

### What shipped

- **Page index:**
  - `src/learning/progress/buildPageIndex.ts`;
  - `scripts/build-learning-page-index.mjs` (`npm run build:learning-page-index`);
  - `api/src/data/learning-pages/791381.json` (28 modules, 248 pages);
  - `pageIndex.sync.test.ts`, which pins it equal to the manifest, with every module publishable on the server.
- **API:**
  - `api/src/lib/learning-progress.js`: the document, `applyVisit`, `visitIsNoop` and `progressView`.
  - `api/src/functions/learning-progress.js`:
    - `GET /api/learning-progress/{course}`;
    - `POST /api/learning-progress/{course}/visit`;
    - storage at `platform/learning-progress/<studentId>.json`;
    - CAS writes; a persistent conflict returns a retryable 503.
- **Client:**
  - `src/learning/progress/progressClient.ts`, whose failures resolve quietly.
  - `StudentReader.tsx`: resume, the server's read pages merged into the device's marks (`visitedPages.mergeVisited`, union, one write), and the dwell report.
- **Teacher:** `LearningMaterialsPage.tsx` passes a teacher-authenticated study client.

### Read / write cost

- Opening a book adds **one** progress read: one class read plus one progress-document read.
- Each page a student stays on adds **one** write: one class read, one document read, and one conditional write. A repeat of the current page is read-only.
- The teacher preview adds **one** study-state read per Reader mount, which the trainings test now pins.

### Evidence

- **Fail-first on the L.2 head 46cf108c:**
  - the API suite and the page-index sync suite cannot load (the modules do not exist);
  - the Reader-progress and teacher-parity suites fail 6/6.
- **Mutation:** `node scripts/mutate-l.mjs l3` → **14/14 KILLED**, every file restored byte-for-byte, git status clean.
  - **API gates** (L3-M1…M4):
    - an invented page;
    - an unpublished unit;
    - an archived class;
    - the token's class claim instead of the persisted class.
  - **The view** (L3-M5, M6):
    - shows hidden units;
    - leaks the last page of a hidden unit.
  - **The writes** (L3-M7, M8):
    - the first-read time moves;
    - a repeat writes again.
  - **The Reader** (L3-M9…M12):
    - no resume;
    - no merge;
    - a slow read blocks the book;
    - no dwell.
  - **Teacher parity lost** (L3-M13).
  - **The committed index drifts** (L3-M14).
- **Full validation on the head:**
  - `npm test`: 1089 files / 13305 tests passed.
  - `npm run lint`: 0 errors, 124 warnings, the same count as `main`.
  - `npx tsc -b`, `npm run build` (bundle guard passed; initial JS graph 114.4 KB gzip against 125 KB) and `git diff --check` are clean.

## 8. Implementation record and evidence (L.4)

### Decisions taken inside L.4

| # | Decision | Why |
|---|---|---|
| L4-a | A teacher sees **per-unit counts and the last reading time**, never the exact pages a student read. | Enough to act on («who has not started», «who stopped»), and private by default. The response is pinned to contain no page id. |
| L4-b | The panel issues **no request until the teacher opens it** («عرض قراءة الصفوف»). | The book page stays request-free for a teacher who only wants to read, and a class report costs one read per student. |
| L4-c | Only units **published to the class now** are counted, as in L3-d. Hiding a unit removes it from the report without deleting what was read. | A teacher's report and a student's view agree on what the book is for that class. |
| L4-d | «توقّف عن القراءة» means the last reading is at least `INACTIVE_DAYS` (7) days before the server's `generatedAt`. | Measured against the server's clock, so a teacher's device clock never changes the list. |
| L4-e | Publishing and hiding from the book page reuse `POST /api/classrooms` `setLearningCourseModules`, with the same hide confirmation as the class panel. The list is sent in content order. Only **active** classes are offered. | One publication authority, one set of rules. No new write path was added. |
| L4-f | The activity-event sink that L.3 moved here is **not built**. The progress document's `lastReadAt` and per-page first-read times already answer «last activity» and «how far». | A second store would add writes per page and a retention question without answering anything new. It can be added when an analytic needs events. |

### What shipped

- **API:**
  - `api/src/lib/learning-progress.js` `classProgressSummary(index, modules, students)`:
    - pure;
    - per unit: total, started, completed and average share read;
    - per student: pages per unit, total and last reading.
  - `api/src/functions/learning-class-progress.js`, `GET /api/learning-class-progress/{classId}/{courseId}`:
    - teacher only;
    - tenancy-guarded (21G.0): another teacher's class answers exactly like a missing one, while a legacy unowned class stays shared;
    - the course must be attached to the class;
    - members come from the class's `studentIds` and are re-checked against their user documents (moved, archived and inactive students are not counted);
    - read-only;
    - `Cache-Control: no-store`.
  - Registered in `api/tests/tenancy-registry-21g0.test.js` as class-scoped.
- **Client:** `src/learning/classReading/classReadingClient.ts`.
- **UI:** `ClassReadingPanel.tsx` + `class-reading.css`, on the book page (`LearningMaterialsPage.tsx`, teacher session only):
  - the class picker;
  - published units out of the book's total;
  - «إدارة النشر» checkboxes;
  - KPIs;
  - the per-unit table with progress bars;
  - «لم يبدأوا القراءة بعد» and «توقّفوا عن القراءة»;
  - the per-student table;
  - «إضافة الكتاب إلى صف آخر»;
  - an alert with a retry on every failure;
  - a stale answer for a class the teacher has left is dropped.
- `arabicCount.ts` `STUDENTS`.

### Read cost

Opening the panel reads the class list and the catalog. The catalog comes from the registry, with no storage read.

Each class report costs:
- one class read;
- one user read per `studentIds` entry;
- one progress read per member.

This is logged as `learning.class_progress.read_cost`. Nothing is written.

### Evidence

- **Fail-first on the L.3 head 432c72d8** (a new feature, so this is absence proof, not a defect reproduction):
  - the API, panel and page suites cannot load (the modules do not exist);
  - the tenancy registry fails 2/2 (an unclassified endpoint).
- **Mutation:** `node scripts/mutate-l.mjs l4` → **19/19 KILLED**, every file restored byte-for-byte, git status unchanged.
  - **API gates** (L4-M1…M6):
    - tenancy;
    - course attachment;
    - authentication;
    - inactive members;
    - the membership re-check;
    - hidden units.
  - **The summary** (L4-M7…M10):
    - completed;
    - average denominator;
    - empty class NaN;
    - a hidden unit's last reading.
  - **The panel** (L4-M11…M18):
    - archived classes;
    - the hide confirmation;
    - content order (two mutants);
    - the stale answer;
    - eager loading;
    - the inactivity boundary;
    - an optimistic failed publish.
  - **The page** (L4-M19): the panel without a session.
- **Real browser** (production build, Chromium, mocked API, panel open with «إدارة النشر» open, 28 units, 6 students):
  - axe (WCAG 2.0/2.1/2.2 A + AA): **0 violations** at 390, 834, 1024 and 1440;
  - no horizontal page overflow at any width;
  - every control ≥ 44 px on coarse pointers (390, 834);
  - the tables scroll inside their own focusable region on phones.
- **Full validation on the head:**
  - `npm test`: 1092 files / 13323 tests passed.
  - `npm run lint`: 0 errors, 124 warnings, the same count as `main`.
  - `npx tsc -b`, `npm run build` (bundle guard passed; initial JS graph 114.5 KB gzip against 125 KB) and `git diff --check` are clean.

## 9. Implementation record and evidence (L.5)

### Decisions taken inside L.5

| # | Decision | Why |
|---|---|---|
| L5-a | Bookmarks, notes and highlights are kept **on the server, one document per student**, read and written **only by that student's own session**. No teacher endpoint, report or export reads them. | D3: private to the student, and they follow the student across devices as reading progress does (L.3). The privacy is pinned by a test that scans every API module: only the annotations route and its library mention the store, and that route accepts only a student session. |
| L5-b | **Bounded:** one note per page (≤ 1000 characters), ≤ 10 highlights per page and ≤ 200 per book, a highlight of 2–300 characters, and only pages of the generated page index. | The document can never grow without limit or hold an invented page. A bound is answered with 413 and a message the student can act on. |
| L5-c | A highlight is stored as **its quoted text**, never as DOM offsets. It is painted with the **CSS Custom Highlight API**, so the page's DOM is never changed. | React keeps sole ownership of the page tree. A quote survives theme, size and layout changes. Where the API is missing, or the text is no longer on the page, nothing is painted, and «ملاحظاتي» still lists the highlight. |
| L5-d | The annotation controls exist **only for a student session**. A teacher preview has none and makes no annotations request. «طباعة الصفحة» is available to everyone. | This matches L3-e (progress is student-only). Printing a page is not personal data. |
| L5-e | A unit hidden after annotating **disappears from the view**; its annotations stay stored and come back when it is published again. | This matches L3-d: unpublishing is reversible. |
| L5-f | Printing is the browser's own print of **the current page only**. The app's chrome, the Reader's toolbar, index, page bar, dialogs and the highlight chip are hidden; the scroll containers are released, so a long page runs across sheets. | No server-side PDF and no new dependency. |

### What shipped

- **API:**
  - `api/src/lib/learning-annotations.js`: `normalizeAnnotationsDoc`, `applyAnnotation` (pure; it reports `changed` / `error: limit | invalid`) and `annotationsView` (reading order, visible units only).
  - `api/src/functions/learning-annotations.js`:
    - `GET /api/learning-annotations/{course}`;
    - `POST …/{bookmark | note | highlight | unhighlight}`.
  - Storage: `platform/learning-annotations/<studentId>.json`.
  - Writes:
    - a change that alters nothing writes nothing;
    - writes go through CAS;
    - a bound reached by another device between the check and the write keeps the document as it is (413);
    - a persistent conflict returns a retryable 503.
- **Client:** `src/learning/annotations/annotationsClient.ts`. A read failure resolves to null; a write failure rejects with the server's message.
- **Reader:**
  - `useReaderAnnotations.ts`: the state and the highlight painter.
  - `ReaderAnnotations.tsx`:
    - the «ملاحظاتي» panel: privacy line, this page's note and highlights, and every bookmark / note / highlight in the book, each opening its page;
    - the «تظليل» chip under a selected passage.
  - `highlightRanges.ts`: locating a quote across inline elements and block boundaries, and painting it.
  - `annotations.css`.
  - `reader-print-l5.css`.
  - `LearningReader.tsx`: «علامة مرجعية», «ملاحظاتي» and «طباعة الصفحة» in the toolbar group, which sits in «المزيد» on phones; focus returns to the toggle, or to «المزيد» on a phone.
  - `LearningReaderWithTraining.tsx`: forwards the client for students only.
  - `StudentReader.tsx`: creates the student's client.

### Read / write cost

- Opening a book adds **one** annotations read: one class read plus one annotations-document read.
- Each change is **one** write: one class read, one document read and one conditional write. A change that alters nothing is read-only.
- A teacher preview makes no annotations request.

### Evidence

- **Fail-first on `main` 364e6102** (a new feature, so this is absence proof):
  - **Cannot load:** the API suite and the two annotations suites, because their modules do not exist on that base.
  - **Fails 1/1:** the StudentReader wiring test (no «ملاحظاتي»).
  - **Fails:** the toolbar-names test (no «طباعة الصفحة»).
- **Mutation:** `node scripts/mutate-l.mjs l5` → **23/23 KILLED**, every file restored byte-for-byte.
  - **API gates** (L5-M1…M7):
    - an invented page;
    - an unpublished unit;
    - an archived class;
    - the token's class claim;
    - a no-op write;
    - a limit reported as invalid;
    - a concurrent bound overwritten.
  - **The document** (L5-M8…M14):
    - the bookmark time moves;
    - NOTE_MAX;
    - the per-page and per-course highlight bounds;
    - a duplicate quote;
    - the visibility filter;
    - normalisation of an oversize note.
  - **The hosts** (L5-M15, M16):
    - a teacher gets annotations;
    - a student does not.
  - **The UI** (L5-M17…M20):
    - a selection outside the page;
    - QUOTE_MAX;
    - NOTE_MAX in the editor;
    - a silent refused write.
  - **Painting** (L5-M21…M23):
    - never painted;
    - block boundary;
    - text inside controls.
- **Real browser** (production build, Chromium, the student portal over a mocked API):
  - bookmark → `aria-pressed=true`; a selected passage → «تظليل» → painted through `CSS.highlights`; a note saved;
  - axe (WCAG 2.0/2.1/2.2 A + AA) on «ملاحظاتي»: **0 violations** at 390, 834, 1024 and 1440;
  - no horizontal overflow;
  - every panel control ≥ 44 px on coarse pointers;
  - print emulation:
    - the toolbar, page bar and index are not displayed;
    - the content column is not clipped;
    - a 1853 px page prints on 2 A4 sheets.
  - A pre-existing axe colour-contrast finding on the unit opener's decorative, `aria-hidden` «01» numeral is present on `main` as well. It is left for the L.8 accessibility gate.
- **One intended expectation change:** `LearningReader.l2a.21e.test.tsx` now counts 8 toolbar labels, because «طباعة الصفحة» was added.
- **Full validation on the head:**
  - `npm test`: 1096 files / 13351 tests passed.
  - `npm run lint`: 0 errors, 124 warnings, the same count as `main`.
  - `npx tsc -b`, `npm run build` (bundle guard passed; initial JS graph 114.5 KB gzip against 125 KB; the Reader's first-load graph is 32.7 KB gzip) and `git diff --check` are clean.

## 10. Implementation record and evidence (L.6a)

### Decisions taken inside L.6a

| # | Decision | Why |
|---|---|---|
| L6-a | **L.6 ships in two PRs.** L.6a moves the module bodies behind the API; L.6b removes the answer material from what the browser receives. | The browser still judges every answer from the key in the content: the server only confirms a right one, and hints / feedback / explanations exist only on the client. Stripping keys first would break every exercise. Each half is reviewable and safe on its own. |
| L6-b | A module body is served by `GET /api/learning-content/{course}/{module}` only:<br>• to a **student** while it is published to the student's **persisted** class (an archived class, a course that is not attached or a hidden module is refused);<br>• to a **teacher**, any module.<br>The production bundle carries **no module body**, and the build guard enforces it. | Before L.6a every module was a public code-split asset that anyone could download, the unpublished ones included. The client-side restriction (L.2) stays as the default-deny layer on top. |
| L6-c | The served bodies are generated data (`api/src/data/learning-content/<course>/<module>.json`, `npm run build:learning-content`), pinned to the authored content by a sync test. The authored TypeScript stays the single source; `bundledModules.ts` loads it for the build scripts and the tests. | The same pattern as the page index (L.3) and the study index. One source, and the server can never serve a stale page. |
| L6-d | `private, no-cache` with a strong ETag. A browser may keep the body, but revalidates on every open, and a 304 is answered **only after the gate passed**. | No stale access after a teacher hides a unit, at the cost of one small request per open (no body re-download when unchanged). |
| L6-e | Under Vitest only, `moduleBodySource.ts` resolves to the authored-content loader (`vite.config.ts`, `VITEST`). The API transport and the hosts' sessions have their own suites, plus an end-to-end suite over the **real** handler. | 45+ suites read the real book; they keep doing so without a server, and nothing in the production path is replaced. |
| L6-f | The manifest (unit, lesson and page titles) still ships. | It holds the table of contents only, no body and no key, and the student's Reader already filters it to the released modules. |

### What shipped

- **Data and generator:**
  - `scripts/build-learning-content.mjs` (`npm run build:learning-content`);
  - `api/src/data/learning-content/791381/*.json` (28 modules, 830 KB);
  - `contentData.sync.test.ts`.
- **API:**
  - `api/src/lib/learning-content.js`: per-process cache and strong ETag;
  - `api/src/functions/learning-content.js`: the gate and 304;
  - registered as shared-by-design in the 21G.0 tenancy registry.
- **App:**
  - `registry.ts` keeps the manifests and the list of modules that have a body (`COURSE_CONTENT_MODULE_IDS`).
  - `bundledModules.ts` holds the authored loaders (tests and scripts only).
  - `moduleBodySource.server.ts` is the transport; it raises typed `ModuleBodyError`s and never hands a foreign or malformed body to the Reader.
  - `readerContentApi.createContentApi(headers)`.
  - `StudentReader` uses the student's session; `LearningMaterialsPage` uses the teacher's.
- **Guard:** `scripts/check-bundle-budget.mjs` has a new `findModuleBodyChunks` function and its own test, and fails a build that emits any block id of a book page.
- **Scripts:** `build-learning-study-index.mjs` reads the authored source through `bundledModules.ts`. Its output is unchanged (pinned by `studyIndex.sync.test.ts`).

### Read cost

- **Student:** one class read per module opened. The body itself comes from the process cache, not storage.
- **Teacher:** no storage read.
- **Page turns:** within an open module they make no request.

### Evidence

- **Fail-first on `main` 9aecbafa** (a new feature, so this is absence proof):
  - **Cannot load:** the API, transport, end-to-end and sync suites (their modules do not exist).
  - **Fails:** the hosts suite (2/2: no session headers, because no module is requested through a session) and the tenancy registry (an unclassified endpoint).
  - **Bundle guard:** on the L.5 build it lists all 28 module chunks as public assets; on this head it finds 0.
- **Mutation:** `node scripts/mutate-l.mjs l6a` → **14/14 KILLED**, every file restored byte-for-byte.
  - **Gate:**
    - a hidden or unattached module;
    - an archived class;
    - an unauthenticated caller;
    - the token's class claim;
    - a 304 before the gate;
    - public caching;
    - a teacher treated as a student.
  - **Hosts:** the student's / the teacher's session missing.
  - **Transport:**
    - a foreign body accepted;
    - headers dropped;
    - no revalidation.
  - **Build guard:** the signature narrowed.
  - **Data:** drift from the authored content.
  - **Equivalent mutant:** a first campaign planted "the course-attached check removed". It survived because a module is visible only within an attached course, so the check was redundant. It was removed from the code, leaving one condition.
- **Real browser** (production build, Chromium, the student portal over a mocked API serving the committed data):
  - the book opens at its first page;
  - the module is requested once, with the student's session;
  - turning the page makes no new request;
  - no module chunk is requested;
  - no error.
- **Pre-existing timing failure, not L.6a's:** `src/functionSurfaces/surfacePlotUi.21da4.test.tsx` («rotates, zooms and resets …») times out at the 5 s limit intermittently. It failed 3 of 5 runs alone on `main` 9aecbafa as well. It was not changed here, and its timeout was not widened.
- **Full validation on the head:**
  - `npm test`: 1103 files / 13369 tests in two full runs.
    - **Run 1:** 3 failures, all load timeouts: `App.saveConflict.21f0` (2; passes 3/3 alone; one of the L.1 load-sensitive files) and `surfacePlotUi.21da4` (1).
    - **Run 2:** 13368 passed and 1 failed, `surfacePlotUi.21da4` (the pre-existing failure above).
  - `npm run lint`: 0 errors, 124 warnings, the same count as `main`.
  - `npx tsc -b`, `npm run build` (bundle guard passed: 0 module bodies; initial JS graph 114.5 KB gzip against 125 KB; Reader first-load graph 32.7 KB) and `git diff --check` are clean.

## 11. Implementation record and evidence (L.6b)

### Decisions taken inside L.6b

| # | Decision | Why |
|---|---|---|
| L6-g | **The answer material of the checked exercises leaves the browser.** In every `practice` and `practice-table` block a served body carries:<br>• no option `correct` flag;<br>• no `answer` / `answers`;<br>• no `feedback` (hints, right / wrong messages, explanation);<br>• no select-cell `key`.<br>A block that can be checked carries `serverCheck: true` instead. | Before L.6b a student with developer tools could read every answer and explanation of an opened unit. These are the only blocks whose answers are judged and the only ones that earn Study Strength. |
| L6-h | A new **check index** (`api/src/data/learning-check/<course>.json`) holds every checkable block's key and feedback: 479 blocks, `study: true` on 475 of them. It is written with the bodies by `npm run build:learning-content` and pinned by the sync test. The **study index stays the only authority for points**. A test pins its 475 activities, with their keys, to the check index's `study: true` set. | Strength, its index and its tests are unchanged. The 4 self-check tables (`studyEligible: false`), which the study index never listed, can now be judged by the server too. |
| L6-i | **One endpoint answers every answer:** `POST /api/learning-study/{course}/attempt`, with the same gate as before. The reply carries the verdict and only what that answer earns:<br>• **right:** the right message and the explanation;<br>• **wrong:** the wrong message and the whole hint ladder (the Reader still reveals it one rung at a time);<br>• **a table:** a verdict per answered cell.<br>A self-check is judged and never recorded (`study: false`). | One request per answer. The hints were already one click away after a wrong answer; the explanation and the right message never reach a wrong answer. |
| L6-j | **A transport failure is never a wrong answer.** While the reply is on its way the exercise says «جارٍ التحقق من إجابتك…». When the server cannot be reached it says so and offers «أعد المحاولة». | The grading-safety rule (AGENTS.md §10) applied to learning practice: an unknown state is never shown as a mistake. |
| L6-k | Each distinct answer is asked **once per mount**, and the reply is reused when the same answer is picked again. A late reply to an older answer is kept for reuse but never shown for the answer on screen. | No duplicate requests, and no stale verdict. |
| L6-l | **The mode follows the content.** A served block (`serverCheck`) is judged by the server. A block that still carries its key (the authored content read by the tests and the build scripts) keeps the local checker. A guard test fails if a served body ever carries a key again. | The production bodies never carry a key, so production always asks the server. 45+ suites keep reading the authored book without a server. |
| L6-m | **Left in the browser, by design:** <br>• worked-example explanations (book text revealed on request);<br>• the CLI simulator's goals and hints (the simulator runs in the browser);<br>• the guided-activity explanation;<br>• the ipv6 / cable widgets' scenario answers.<br>Moving them would need a server simulation engine. | None of them is a judged answer and none earns a point. |

### What shipped

- **Generator and data:**
  - `src/learning/study/checkIndex.ts`: `servedModuleBody`, `servedBlock`, `checkActivityOf`, `buildCheckIndex`.
  - `scripts/build-learning-content.mjs` now writes stripped bodies (28 modules, 708 KB, down from 830 KB) and the check index (230 pages, 479 blocks, 173 KB).
  - `contentData.sync.test.ts` pins both.
- **API:**
  - `api/src/lib/learning-check.js`: `loadCheckIndex`, `findCheckActivity`, `checkResponse`.
  - `learning-study.js`: the attempt endpoint judges against the check index, records only study activities, and adds `study`, `feedback` and `cells` to the reply.
- **App:**
  - `PracticeBlockView` / `PracticeTableView` have a server mode (`serverCheck`): checking and unreachable states, a retry, per-answer reuse, and late replies dropped.
  - `StudyOutcome` stays silent for a self-check.
  - `studyActivityIds` names a page's study activities for authored and served bodies alike (the study bar).
  - The host updates the study state only for study activities.
  - The types allow a served select cell without a `key`.
- **Docs:** `docs/learning-content-architecture.md` (Study Practice: answer material on the server).

### Request and storage cost

- **Per answer:** every answer is now one request (before L.6b only a right answer to a study activity was sent).
- **Student:** each answer costs one class read and one study-document read. A write happens only on the first right answer to a study activity, as before.
- **Teacher:** no storage read.

### Evidence

- **Fail-first on `main` 67f3e3ca** (detached worktree, the new tests copied in):
  - `servedBodies.l6b.test.ts` fails: `expected 1111 to be +0`. 1111 answer-material fields were left in the served bodies, the first being `m01-l01-p01-q1.question.feedback` and `m01-l01-p01-q1.options[0].correct`.
  - `serverVerdict.l6b.test.ts` fails: `m01-l01-p01-q1: expected undefined to deeply equal { … }`. The reply carried no feedback.
  - A probe of the baseline handler answers the 4 self-check tables with **404**; the head answers them with 200 and `study: false`.
  - Both tests pass on the head. The hidden-module refusal test passes on both: it is a **pin**.
- **Mutation:** `node scripts/mutate-l.mjs l6b` → **22/22 KILLED**, every file restored byte-for-byte.
  - **Server feedback:**
    - an explanation told to a wrong answer;
    - hints sent to a right answer;
    - the right message given to a wrong answer;
    - a table reply speaking about unknown or unanswered cells.
  - **Server authority:**
    - the key travelling in the reply;
    - a self-check recorded as a study activity;
    - a hidden module's block judged;
    - the client's own verdict trusted.
  - **Served bodies:**
    - an option keeping `correct`;
    - a cell keeping its key;
    - a question keeping its answer and feedback;
    - `serverCheck` lost;
    - an authored `serverCheck` trusted;
    - a committed body carrying an answer again.
  - **Study bar:** a served page naming no exercise.
  - **Reader:**
    - a served question judged locally;
    - an unreachable server shown as a wrong answer, for a question and for a table cell;
    - a reply never reused;
    - a late reply shown for the answer on screen;
    - a self-check showing a study outcome;
    - a cell taking any verdict as right.
- **Baseline moved during the phase:** `main` 67f3e3ca → 7887285a (the #349 test hotfix and #340, neither touching learning code). The branch was fast-forwarded and full validation was re-run on the new base.
- **Full validation on the head (base 7887285a):**
  - `npm test`: 1111 files / 13482 tests passed, 0 failed.
  - `npm run lint`: 0 errors, 124 warnings, the same count as `main`.
  - `npx tsc -b`, `npm run build` (bundle guard passed: 0 module bodies; initial JS graph 114.5 KB gzip against 125 KB; Reader first-load graph 33.7 KB) and `git diff --check` are clean.
- **Not run:** a real-browser pass. The end-to-end suite runs the Reader over the **real** content and study handlers in happy-dom: the served body holds none of the block's feedback, a wrong answer shows the server's message and hints, and a right one shows its message, its explanation and the recorded study point.

## 12. Implementation record and evidence (L.7)

### Decisions taken inside L.7

| # | Decision | Why |
|---|---|---|
| L7-a | **The Exam Library is read from disk once per process.** The catalog is read on first use and each item on its first request. The item ids come from one directory listing, so an unknown id never touches the disk and the cache never holds more than the files the deployment ships. | The library is part of the deployment and never changes while a process runs. Before L.7 every request did a synchronous read and parse: about 0.14 ms for the catalog and 0.13 ms per item. |
| L7-b | **Cached values are deep-frozen and shared.** | One request can never change what the next one reads. Every caller already copies before changing anything: `hydrateBankAssets` copies the path it changes and `sanitizeExamForStudent` clones. A run over all 36 items confirmed the grading, hydration and sanitization paths leave them untouched. |
| L7-c | **`GET /api/exam-library` runs under the shared observability wrapper** (request id, duration, status, redacted error event). It answers with a **strong ETag, `private, no-cache` and `Vary`**, and a 304 is sent only after the builder check. | The endpoint had no observability at all. The library carries answer keys, so it must never be stored by a shared cache. A teacher's browser keeps it and revalidates instead of downloading the 31 KB catalog or a whole item again. |
| L7-d | **Learning Practice computes the student form of a training once.** It is kept in a `WeakMap` keyed by the shared snapshot and frozen. A snapshot with bank images is still hydrated and sanitized on every request. | The sanitized exam depends only on the snapshot, unless it has bank images: their URLs are short-lived signed credentials minted at delivery. Today no Learning-Practice item has bank images. |
| L7-e | **The build guard budgets the learning content** (gzip):<br>• the Reader's first-load graph: **40 KB** (measured 33.7);<br>• the course manifest chunk: **15 KB** (12.2);<br>• each visual group chunk: **9 KB** (6.5);<br>• all visuals together: **75 KB** (64.4).<br>A build with no manifest chunk fails. | Each budget leaves room for normal growth but not for a design change: a body bundled again, the visuals packed into one chunk, or the table of contents carrying page text. The manifest is found by the book's course-prefixed page ids, which only that chunk carries. |

### What shipped

- **`api/src/lib/exam-library-store.js`:**
  - the per-process cache (`libraryCatalogEntry`, `libraryItemEntry`, each `{ value, etag }`);
  - `deepFreeze`;
  - `resetLibraryCacheForTests`.
- **`api/src/functions/exam-library.js`:**
  - an exported `handler` and an `observed` wrapped handler;
  - ETag, `private, no-cache`, Vary and a 304 after the builder check;
  - a `exam.library.error` event on failure.
- **`api/src/functions/learning-training.js`:** `studentExam(snapshot)`, which caches the student form of each training once.
- **`scripts/check-bundle-budget.mjs`:** `LEARNING_BUDGETS_KB`, `findManifestChunks`, `learningContentFailures`, and a «Learning content (gzip)» line in the build report.
- **Tests:**
  - `api/tests/exam-library-l7.test.js` (11);
  - `scripts/check-bundle-budget.l7.test.mjs` (4).
- **Mutation:** the `l7` campaign in `scripts/mutate-l.mjs`.

### Measured before / after

- **In process:** the same script ran on main 5d308329 and on the head (300 calls after 20 warm-up calls, 3 runs; the range is across runs).
- **Network:** a revalidation answered with 304 carries no body.

| Call | Before | After |
|---|---|---|
| `readLibraryCatalog()` | 0.13–0.16 ms | ≈ 0.000 ms |
| `readLibraryItem()` (each of the 36) | 0.12–0.14 ms | 0.010 ms |
| `GET /api/learning-training/{id}` (teacher, item) | 0.42–0.45 ms | 0.010 ms |
| `GET /api/exam-library` revalidation | full 31 KB body | 304, no body |

### Evidence

- **Fail-first on `main` 5d308329** (detached worktree, the two new test files copied in): **13 of 15 fail**.
  - **The store:**
    - `expected [ Array(4) ] to have a length of 1 but got 4` (the catalog was re-read);
    - `expected [ 'T99.json', 'nope.json' ] to deeply equal []` (unknown ids read the disk);
    - `expected false to be true` (nothing was frozen).
  - **The endpoint:** `handler is not a function` and `observed is not a function`. Its handler was an inline closure with no observability.
  - **Learning Practice:** `expected {…} to be {…}`, because the exam was re-sanitized on every request.
  - **The guard:** `learningContentFailures is not a function`, `findManifestChunks is not a function`, and `expected undefined to deeply equal { readerFirstLoad: 40, … }`.
  - **Pins** (they pass on both): «the cached item is exactly the file» and «an item with a bank image is hydrated on every request».
- **Mutation:** `node scripts/mutate-l.mjs l7` → **17/17 KILLED**, every file restored byte-for-byte.
  - **Store:**
    - the catalog not cached;
    - an item not cached;
    - an unknown id reaching the disk;
    - the cache not frozen.
  - **Endpoint:**
    - a 304 before the builder check;
    - public caching;
    - any If-None-Match taken as a match;
    - no observability wrapper;
    - a failure not logged.
  - **Learning Practice:**
    - an exam with bank images cached;
    - the student form recomputed.
  - **Guard:**
    - each of the four budgets unchecked;
    - a missing manifest passing;
    - the manifest signature narrowed.
- **Full validation on the head:**
  - `npm test`: 1118 files / 13572 tests passed, 0 failed.
  - `npm run lint`: 0 errors, 123 warnings, the same set as `main`.
  - `npx tsc -b`, `npm run build` and `git diff --check` are clean. The bundle guard passed, printing «Learning content (gzip): Reader first load 33.7 KB (budget 40); manifest 12.2 KB (budget 15); visuals 64.4 KB in 27 chunks (budget 75), largest 6.5 KB (budget 9)»; the initial JS graph is 114.5 KB against 125.

## 13. Implementation record and evidence (L.8)

### Decisions taken inside L.8

| # | Decision | Why |
|---|---|---|
| L8-a | **The gate runs the production build against the REAL API, in process** (`browser-harness/learning-l8-api.cjs`):<br>• every Azure Functions handler of `api/src/functions`;<br>• the in-memory storage of the API tests;<br>• real signed sessions, with random signing values per run that exist only in that process. | Resume and the server's verdict are server behaviour. A hand-written mock would only prove the mock. Nothing touches Azure, and no secret is involved. |
| L8-b | **One script, its own workflow:** `scripts/check-learning-reader-browser-l8.mjs` and `.github/workflows/learning-reader-browser-l8.yml`, path-filtered to learning, portal, design-token and learning-API changes. `playwright-core` 1.55.0 and `axe-core` 4.10.2 are installed as measuring tools, not project dependencies. | The same pattern as the 21A–21D real-Chromium certifications. The workflow adds a gate; nothing existing is weakened. |
| L8-c | **The gate checks:**<br>• **student journey:** open, three pages, the server reading position, resume in the same browser and on a fresh profile (another device);<br>• a served exercise judged by the server;<br>• **teacher journey:** the URL; Back to the book and then the library, because a page turn replaces the entry (L2-b); Forward; reload;<br>• **six screens at 390 and 834 px (touch) and at 1024 and 1440 px:** axe-core WCAG 2.1 A/AA with no serious or critical violation, no horizontal overflow, and on the touch sizes every visible control at least 44 × 44 px (inline links inside running text are exempt, WCAG 2.5.8). | The plan's L.8 row, measured where it matters: the release build in a real engine. |
| L8-d | **The Today Hub's server continuation is the newer of the last study completion and the last page read.**<br>• The dashboard reads the student's reading-progress document as well (one more read, `K = 6` in the read-cost guard).<br>• The answer keeps its shape: `study.lastActivity = { courseId, moduleId, pageId, completedAt }`. | Found by the gate. On another device the Hub offered «ابدأ الآن» at the first unit, although the server had held the last page read since L.3; only the book card resumed. The portal needs no change. |
| L8-e | **The unit opener's numeral is painted `--eb-primary`.** | Found by the gate: axe `color-contrast` at 390 and 1024 px. The numeral is decorative (`aria-hidden`) but visible text, and the pale tint measured 1.2:1. `--eb-primary` measures 5.2:1 on white, 4.6:1 on sepia and 3.7:1 on the dark surface, which meets the 3:1 for large text. |
| L8-f | **A coarse pointer gets 44 px targets in the student portal, whatever the width.** | Found by the gate: 13 controls under 44 px at 834 px with touch (top-bar links 40 px, logout 42, card buttons 34, filter chips 40). The phone rules stop at 720 / 767 px. A mouse keeps the desktop density. |

### What shipped

- **Gate:**
  - `scripts/check-learning-reader-browser-l8.mjs` (writes a record and screenshots to `HARNESS_OUT`, ignored by git);
  - `browser-harness/learning-l8-api.cjs`;
  - `.github/workflows/learning-reader-browser-l8.yml`.
- **API:**
  - `api/src/lib/learning-progress.js`: `latestReadingPosition`;
  - `api/src/functions/student-dashboard.js`: the newer continuation.
- **CSS:**
  - `src/learning/reader/reader.css`: the numeral colour. Its pale override in `reader-enterprise-l1.css` is removed.
  - `src/student/student-portal-v2.css`: the coarse-pointer block.
- **Tests:**
  - `api/tests/student-dashboard-reading-l8.test.js` (4);
  - `src/learning/reader/reader.l8.guards.test.ts` (4);
  - `read-cost-student-dashboard-12e.test.js`: `FIXED` gains the progress document, deliberately;
  - `today-hub-9a.test.js`: one title no longer says «zero extra reads».
- **Docs:** `docs/read-cost-baseline-12e.md` (`K = 6`).
- **Mutation:** the `l8` campaign.

### Evidence

- **The gate on `main` c6b21e3b** (its own build and its own API, detached worktree): **4 failures.**
  - **Resume on another device:** the Hub offered «ابدأ الآن · أساسيات الشبكات · أول وحدة متاحة» instead of «تابع القراءة».
  - **Contrast:** axe `color-contrast` on `.learning-reader-opener-number` at 390 and at 1024 px.
  - **Touch targets:** 13 controls under 44 px on the student portal at 834 px: الإشعارات 103×40, الرسائل 91×40, الألعاب التعليمية 143×40, تثبيت التطبيق 129×40, تسجيل الخروج 130×42, افتح رسائل المعلم 118×34, تقدمك 62×34, ليس الآن 72×34, and five filter chips at 40.
- **The gate on the head: passed.**
  - **Student journey:**
    - the body comes from the API with the student's session;
    - three distinct pages;
    - the server holds `791381-m01-l01-p02`;
    - resume works in the same browser and on a fresh profile;
    - a served exercise has no key in its markup and is judged by the server in one request.
  - **Teacher journey:** the URL, Back ×2, Forward ×2 and reload all pass.
  - **Audits:** 24 (6 screens × 4 widths), with 0 axe violations of any impact, 0 controls under 44 px on the touch sizes and 0 horizontal overflow.
- **Fail-first of the unit tests on c6b21e3b:** 6 of 8 fail.
  - `expected null to deeply equal { courseId: '791381', … }`;
  - `latestReadingPosition is not a function`;
  - `expected [ 'var(--eb-surface-2)', … ] to deeply equal [ 'var(--eb-primary)' ]`;
  - the coarse-pointer block is missing (`expected -1 to be greater than 0`).
  - **Pins** (they pass on both): the tokens' contrast and «no document → null».
- **Mutation:** `node scripts/mutate-l.mjs l8` → **6/6 KILLED**, every file restored byte-for-byte.
  - **Dashboard:** the last page read ignored; the older continuation winning; a course without a page taken as the reading position.
  - **CSS:** the pale numeral back; tablet chips at 40 px; the 44 px rule by width again.
- **Full validation on the head:**
  - `npm test`: 1121 files / 13586 tests passed, 0 failed.
  - `npm run lint`: 0 errors, 123 warnings, the identical set to `main`.
  - `npx tsc -b`, `npm run build` (bundle guard passed) and `git diff --check` are clean.

## 14. What the plan leaves to the owner

- **The introduction's content.** When it is authored as a module, adding its id to the manifest's `intro` batch and to
  the server registry turns the «قريبًا» row into a live section. The Strength study module count
  (`STUDY_MODULE_COUNT`, 28) is pinned to the registry, so that addition is also a decision on the Strength scale.
- **Reversing a decision.** D1–D5 can each be reversed at review.
