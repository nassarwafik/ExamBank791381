# Phase L — Enterprise learning materials («المواد التعليمية») and reader

**Status:** L.0 implemented on branch `claude/nifty-clarke-k0wlid`; L.1–L.8 planned. Each phase: exact-head CI, independent
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
   - With the page title, the toolbar, the note and the page bar around it, the text gets about **38 % of a 1024×768
     screen and 41 % of 1440×900**.
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
| L.1 | Professional reader. Collapsible table of contents on every width (overlay under 1280 px, remembered choice). Focus mode that hides the app chrome. One compact 48 px toolbar with icon buttons + «المزيد». Progress line. Pager with lesson position and the next lesson's title. Internal metadata behind «معلومات». Designed unit openers. A cleaner two-level TOC with read ticks and a filter. Reading typography (60–75 characters, 17–18 px, 1.8 line height). Dark theme. Swipe on phones. **Target: the text gets ≥ 70 % of the screen at ≥ 1024 px in focus mode.** | planned |
| L.2 | Navigation: a URL for library / book / section / page, a working browser back button, reload keeps the place. Clickable module list for students. Teacher preview identical to the student view. | planned |
| L.3 | Server-side reading progress and resume (cross-device); a real activity sink; localStorage stays the fallback | planned |
| L.4 | Teacher reading analytics per class (read %, stuck students, last activity); publication status and publishing from the book page | planned |
| L.5 | Reader features: bookmarks, private notes and highlights (D3), print styles | planned |
| L.6 | Restricted content and answer keys served by the API after the publication check (D2) | planned |
| L.7 | Operations: `exam-library` observability + cache, in-memory `learning-training`, content-chunk bundle budget, measured before / after | planned |
| L.8 | Gate: real-browser reader journey (open, navigate, resume, back), axe and 44 px touch targets at 390 / 834 / 1024 / 1440 | planned |

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

## 5. What the plan leaves to the owner

- **The introduction's content.** When it is authored as a module, adding its id to the manifest's `intro` batch and to
  the server registry turns the «قريبًا» row into a live section. The Strength study module count
  (`STUDY_MODULE_COUNT`, 28) is pinned to the registry, so that addition is also a decision on the Strength scale.
- **Reversing a decision.** D1–D5 can each be reversed at review.
