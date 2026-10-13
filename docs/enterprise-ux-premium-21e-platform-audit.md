# Phase 21E — Full-platform Enterprise UX audit and implementation roadmap

**This is a planning record. It contains no runtime or application-code change.** It inventories every page, major dialog, viewer
and workflow of ExamBank791381 (Tadris+), audits the Educational Content Browser in depth, and proposes:
- a unified premium visual system;
- a dependency-aware roadmap that brings every remaining surface to the standard set by the Teacher Workspace (21E.2 / #302), the
  structured builder (#304–#307), the Student Exam (21E.3 / #303) and the 3D viewer (#308).

| Item | Value |
|---|---|
| Audited head | `main` `8a1dd871` (merge of #308) |
| Pending work accounted for, not modified | #303 `593fd47f` (21E.3 student exam); #304 `8bd4cc2c` (builder integration + premium slice 1); #305 `7e853a76`, #306 `0caf0357`, #307 `6c603cb0` (premium slices 2–4) |
| Builds on | `docs/enterprise-ux-premium-21e.md` (21E.0 audit, findings F1–F20, roadmap 21E.0–21E.6, risk matrix §6, gates §8) |
| Status | **Proposal for owner approval.** Nothing below is implemented by this PR |

**Evidence levels used in every table:**
- **[C]** code inspection on `8a1dd871`, with file references;
- **[B]** real Chromium on a production build of `8a1dd871` (1280×900, 640×450 @2 and 390×844 touch, against a local mock of the
  teacher API);
- **[R]** an existing design record or PR body.

A capability is listed as *implemented* only with [C] or [B] evidence. Everything else is marked *proposed*.

---

## 1. Page and component inventory

**Status legend:**
- **R — Redesigned** to the 21E premium standard (merged);
- **P — Pending**: redesign done in an open PR;
- **Pa — Partially redesigned**: tokens / an earlier "pro" layer, not the 21E standard;
- **N — Not redesigned**: legacy styling;
- **I — Functionally incomplete or needs investigation**.

The token-adoption column is measured per sheet as `literal colours / --eb-* references`. It is the strongest objective signal
of legacy styling.

### 1.1 Teacher application (`TeacherAppShell`, `src/shell/teacherNav.ts`: 10 views, 13 nav ids)

| Surface | Entry | Main files | Styling (hex / tokens) | Status | Evidence and open findings |
|---|---|---|---|---|---|
| App shell, sidebar, breadcrumb, page header | always | `shell/TeacherAppShell.tsx`, `shell.css`, `ui/PageHeader.tsx`, `ui/Breadcrumb.tsx` | `shell.css` 0 / 119 | **R** | [R] 21E.1, 21E.2 (#302) |
| Dashboard «لوحة المتابعة» | platform → dashboard | `TeacherDashboard.tsx` (606), `dashboard-pro.css`, `platform.css` | 4 / 336 + `platform.css` 314 / 41 | **Pa** | [R] #302: KPI tiles, chart data tables. Still on `platform.css` classes (`analytics-card`). F17 (11.4 phone screens) open → 21E.4 |
| Today hub | platform → dashboard | `teacher/TeacherTodayHub.tsx`, `teacherToday.css` | 0 / 45 | **R** | [R] #302 |
| Classes and students «الصفوف والطلاب» | platform → students | `students/ClassesPane.tsx`, `RosterPane.tsx`, `StudentDialog.tsx`, `StudentForms.tsx`, `page-parts.css` | 13 / 398 | **Pa** | [C] tokenized UX-era layer; credentials batch UI, bulk import dialogs not reviewed against 21E |
| Class learning materials (progressive release) | students → class | `students/ClassLearningMaterialsPanel.tsx` (200) | shared sheets | **Pa / I** | [C] functional checklist (publish / hide per module); see §2.4 |
| Assignments «الواجبات», gradebook, grading | platform → assignments | `AssignmentsPanel.tsx` (484), `AssignmentReview.tsx`, `review-workspace.css`, `assignments-pro.css` | 34 / 106; 0 / 219 | **Pa** | [R] #302: CSV export. F18 gradebook overflow and grading phone layout open → 21E.4 |
| Activity log «سجل النشاط» | footer → audit | `AuditHistoryPanel.tsx` (137) on `platform.css` | 314 / 41 | **N** | [C] plain table on legacy classes |
| Messages «الرسائل» | messages | `messages/TeacherMessagesPage.tsx` (408), `messages.css` | 3 / 245 | **Pa** | [C] tokenized; not in any 21E stage |
| Projects «المشاريع» | project | `projects/ProjectTracker.tsx`, `ProjectHub.tsx`, `projects-pro.css`, `performance.css` | 0 / 301 | **Pa** | [C] tokenized UX-era layer |
| Reports «التقارير» | reports | `reports/ReportsCenter.tsx`, `reports-pro.css` | 0 / 91 | **Pa** | [C] |
| Games «الألعاب التعليمية» (+ live challenge) | games | `games/TeacherGamesPage.tsx`, `games/liveChallenge/*`, `games.css` | 4 / 471 | **Pa** | [C] |
| Exam bank «بنك الامتحانات» | bank | `bank/ExamBankPage.tsx` (462), `bank-pro.css` | 0 / 84 | **Pa** | [C] `DataTable` planned in 21E.4 |
| Exam page (legacy builder view: prompt / AI generation / plan cards) | builder | `App.tsx` (7,921 lines), `App.css`, `builder-pro.css` | `App.css` 275 / 64; 33 / 19 | **N** | [C] the largest legacy surface |
| Exam lists (saved exams, templates, access bar) | builder | `App.tsx` markup; `teacher/exam-lists-premium.css` (in #307) | 0 / n | **P** | [R] #307 |
| Structured exam builder | builder → open | `StructuredExamBuilder.tsx`, `structured-builder.css`, `builder/*` | `structured-builder.css` 249 / 4 (legacy, overridden by premium sheets) | **P** | [R] #304 (integration + slice 1), #305 editors, #306 navigator / bulk / readiness. Observations handed over: empty «» names in inline issues, raw table markdown in the navigator for matching, focus on `<body>` after Escape at 200 % |
| Blueprint, coverage, quality policy, governance, presets, studio, surface lab (builder «المزيد» tools) | builder menu | `BlueprintPanel.tsx`, `GovernancePanel.tsx`, `presets/*`, `presentation/PresentationStudio.tsx`, `functionSurfaces/Surface3DLab.tsx` | `reviewInbox.css` 35 / 0; `presentation-studio.css` 38 / 120 | **N / Pa** | [C] only readiness is in #306 |
| Import «استيراد من ملف» | import | `SmartStructuredExamImportWizard.tsx` (437), `ImportQuestionsPanel.tsx` (1,059), `smart-import.css` | 46 / 0 | **N** | [C] |
| Publishing reviews «مراجعات النشر» | reviews | `governance/ReviewInboxPage.tsx`, `reviewInbox.css` | 35 / 0 | **N** | [C] |
| AI exam composer, AI question / scenario authoring | builder «إضافة أسئلة» | `aiComposer/AiExamComposerDialog.tsx`, `ai-composer.css` | 34 / 47 | **Pa** | [C] |
| Exam preview / theme preview | builder | `ExamPreview.tsx`, `presentation/*` | 0 / 36 | **Pa** | [C] |
| Login | before session | `login-pro.css` | 19 / 19 | **Pa** | [R] 21E.1 slice 2 (placeholder token) |

### 1.2 Student application (`StudentPortal.tsx`, `shell/StudentShell.tsx`, quick nav: today · learning · tasks · progress · projects)

| Surface | Main files | Styling | Status | Evidence and open findings |
|---|---|---|---|---|
| Student shell, mobile nav, skip link | `shell/StudentShell.tsx`, `StudentMobileNav.tsx`, `studentMobileNav.css` | 0 / 21 | **Pa** | [R] UX-12c, 21E.1 |
| Today hub, «أكمل من حيث توقفت» | `student/today/StudentTodayHub.tsx`, `today.css`, `readerPosition.ts` | 0 / 45 | **Pa** | [C] |
| Learning materials section and reader | `student/StudentLearningMaterials.tsx`, `student/StudentReader.tsx`, `learning/reader/*` | `studentportal-pro.css` 0 / 307; `reader.css` 1 / 538 | **Pa / I** | §2 |
| Assignments / tasks list and cards | `student/StudentAssignmentCard.tsx`, `StudentPortal.tsx` | `studentportal-pro.css` | **Pa** | [R] F12 (every assignment listed twice; 16 buttons named «ابدأ الحل»), assigned to 21E.3. Verify against #303 at its merge |
| Progress, strength, recognition, achievement feed | `student/StudentProgressSection.tsx`, `AchievementFeed.tsx` | `studentportal-pro.css` | **Pa** | [C] |
| Projects | `projects/StudentProjectPanel.tsx` | `projects-pro.css` | **Pa** | [C] |
| Games, messages | `games/StudentGamesPage.tsx`, `messages/StudentMessagesPage.tsx` | tokenized | **Pa** | [C] |
| Exam taking (cover, questions, navigator, save status, submit) | `StudentExamPage.tsx` (814), `StudentQuestionCard.tsx`, `student/exam/*`, `studentexam-pro.css` | 1 / 593 | **P** | [R] #303 (21E.3, Review Fixes 1–2) |
| Results / attempt review | `StudentExamPage.tsx`, `review-pro.css` | 22 / 22 | **Pa / I** | [R] F8 (new attempt made the primary action; a provisional 0 % headline) in 21E.3. Verify against #303 |
| Notifications, PWA install, push | `notifications/*`, `pwa/*` | 0 / 91 | **P** | [R] #303 touches both |

### 1.3 Viewers and interactive families (shared by exams, rich content and learning)

| Surface | Files | Styling | Status | Notes |
|---|---|---|---|---|
| Scene3D viewer (part / face / edge / vertex selection) | `interactive3d/Interactive3DView.tsx` | 23 / 134 (scene drawing hex kept) | **R** | [R] #308 |
| SmartSim sandbox host | `smartsim/SimulationSandboxHost.tsx`, `smartsim.css` | 23 / 37 | **R (chrome)** | [R] #308. The simulator interior belongs to its package |
| Mesh-model viewer (anatomy) | `meshModels/MeshModel3DView.tsx`, `mesh-model.css` | 82 / 0 | **N** | [C] same toolbar pattern as Scene3D |
| Surface-plot and 3D-surface viewers | `functionSurfaces/*`, `surface-plot.css`, `surface-3d.css` | 37 / 0; 35 / 0 | **N** | [C] |
| Molecule viewer, chemistry lab, reactions | `chemistryStructure/*`, `chemistryLab/*`, `chemistryReactions/*` | 57 / 0; 52 / 0; 53 / 0 | **N** | [C] own CI workflows (`chemistry-smartsim-21dd.yml`) |
| Physics labs (motion, free fall, lab) | `physicsMotion/*`, `physicsFreeFall/*`, `physicsLab/*` | 64 / 0; 49 / 0; 37 / 0 | **N** | [C] `physicsLab/LabScene.tsx` is in #303 |
| Dynamic SmartSim, network topology (trusted SmartSim) | `smartsim/dynamic/*`, `networkTopology*/*` | 28 / 0; 55 / 0; 41 / 0 | **N** | [C] `trustedSim/smartSimUiRegistry.ts` is in #303 |
| Function graphs and study, coding workspace, open response, network CLI, inline cloze, visual questions | respective folders | 35–56 hex each | **N / Pa** | [R] F5, F11, S-8 assigned to 21E.3 / 21E.5 |
| Rich content renderer / editor | `richContent/*` | 0 / 52; 41 / 1 | **Pa** | [C] |
| Charts | `charts/*`, `ui/ChartCard.tsx` | 12 / 14 | **Pa** | [R] #302 data tables |

### 1.4 Functionally incomplete or requiring investigation (not cosmetic)

| # | Item | Evidence |
|---|---|---|
| I-1 | **No search anywhere in the learning content.** `learning/content/search.ts` builds a per-page title + keyword index, but nothing imports it, and no search field exists in the library, overview or reader. | [C] grep; [B] 0 search inputs |
| I-2 | **No video, audio or original-PDF viewer.** The source PDF appears only as a citation («المصدر: كتاب 791381 · صفحة PDF 15»). | [C] `LearningPageRenderer.tsx:106`; content types §2.2 |
| I-3 | **Reading progress is not tracked:** no per-page or per-module completion and no percentage. The student's last page is a device-local marker (`student/today/readerPosition.ts`, `localStorage`); the server's study record is the cross-device authority for activity, not for reading position. | [C] |
| I-4 | **The 3D viewer and SmartSim packages cannot be embedded in learning pages.** Learning uses its own trusted registry blocks (`simulation` / `animation` / `visual`, resolved to repo components by key). | [C] `learning/content/types.ts:264` |
| I-5 | **Teacher training preview in the reader.** With a token the teacher should be able to preview T01–T04. Under the audit's empty mock, the cards read «سيصبح متاحًا عند نشر الجزء المرتبط به». | [B]. Re-check against the real API before any reader work |
| I-6 | **The reader's sticky page bar may sit over the end of a page** (the class of F2). Verify `scroll-padding` for keyboard focus in long pages. | [B] desktop capture; needs a focused probe |
| I-7 | The navigator shows a matching question's stored table markdown; inline issues print an empty name «»; focus lands on `<body>` after Escape at 200 % in the builder. | [R] #305 / #306. Owned by the builder-integration branch |

---

## 2. Educational Content Browser — detailed audit (highest priority)

### 2.1 What exists today (implemented)

| Capability | Where | Evidence |
|---|---|---|
| **Library** «المواد التعليمية»: catalog of course cards (identity, subject, grades, author, year, «متاح / قريبًا»). Local state, no router. **The catalog contains one course** (791381, networking). | `learning/LearningMaterialsPage.tsx`, `catalog.ts`, `learning.css` | [C] [B] 1 card |
| **Course overview:** identity, description, «بدء القراءة», 8 high-level sections; each opens the reader at the section's first page (manifest lookup). | same | [C] [B] 8 sections |
| **Content model:** a course has modules, lessons and pages. 791381 has **28 code-split modules and 248 pages**. | `learning/content/791381/manifest.ts`, `modules/m01–m28.ts`, `types.ts`, `validation.ts` | [C] [B] «1 / 248» |
| **Block types:** text, heading, image, callout, example, table, code, diagram, list, visual (interactive per-batch visuals), simulation, animation, guided, practice (multiple choice / true-false / short input / fill-blank, self-check and not stored), library training (T01–T04). | `content/types.ts`, `reader/LearningPageRenderer.tsx`, `visuals/*`, `activities/*` (25 files), `cli/*` | [C] |
| **Reader:** desktop TOC sidebar and phone TOC drawer (module → lesson → page); «انتقل إلى صفحة» select; previous / next; ordinal «n / 248»; presentation mode (fullscreen, page-number field, F toggles, arrows / PageUp / PageDown **in presentation mode only**); animation toggle «تشغيل حركة الرسوم»; source citation (PDF and printed page). | `reader/LearningReader.tsx` (452), `LearningReaderToc.tsx`, `reader.css` (1 / 538) | [C] [B] |
| **Practice:** in-page self-check exercises; Study-Practice points reported to the server for students; trainings T01–T04 open a shared runner and return to the same page. | `reader/PracticeBlockView.tsx`, `study/*`, `training/*` | [C] |
| **Teacher publishing:** per class, assign a course and publish / hide each module (progressive release). Visibility only; order is canonical; an archived class is read-only. | `students/ClassLearningMaterialsPanel.tsx`, `classLearningMaterials.ts` | [C] |
| **Student access:** a portal section lists the released courses / modules. The reader uses a restricted content API (only published modules). «أكمل من حيث توقفت» opens the last page (device-local marker). | `student/StudentLearningMaterials.tsx`, `StudentReader.tsx`, `reader/restrictedContentApi.ts`, `today/readerPosition.ts` | [C] |
| **Accessibility already present:** RTL; reduced motion and a motion toggle; TOC as navigation; tested semantics (`LearningReader.semantics.test`, `reader.*.guards.test`); `embedded` mode to avoid nested `<main>`. | reader tests | [C] |

### 2.2 Measured experience problems

All measured in [B] on `8a1dd871`.

| # | Problem | Measurement | Severity |
|---|---|---|---|
| L-1 | **The library looks unfinished.** One card sits at the start of a wide, empty grid. The page title «المواد التعليمية» is repeated (page header and section header). There is no hero, no "continue reading", no search or filter. | desktop: the card is 321 of 996 px; `h1` and `h2` both read «المواد التعليمية» (DOM-measured) | High (first impression) |
| L-2 | **The course overview says little.** It lists 8 sections with no page / lesson counts, objectives, estimated time, progress, or (for the teacher) release status per class. There is no cover or hero. | [B] | High |
| L-3 | **The phone reader spends almost half of the first screen on chrome.** In order: page title, a two-row reader toolbar, the permanent banner «يجري تجهيز محتوى الكتاب التفاعلي تدريجيًا.», and the «انتقل إلى صفحة» select. | first page heading at **y = 374 of 844 CSS px** (390×844, DOM-measured); desktop 449 of 900 | High |
| L-4 | **Navigation of 248 pages relies on a long TOC and a select.** There is no in-book search, no TOC completion marks, no "next lesson" summary, and no position indicator beyond «9 / 248». | [B] [C] | High |
| L-5 | **No reading progress.** Neither student nor teacher sees how much has been read; the overview cannot show "you are here". | [C] I-3 | High |
| L-6 | **No reader comfort settings:** text size, line spacing, a reading theme (light / sepia / dark), bookmarks, notes or highlights. | [C] grep: none | Medium |
| L-7 | **No media.** No video / audio blocks; the original PDF page cannot be opened beside the interactive page even though every page cites it. | [C] I-2 | Medium (owner decision) |
| L-8 | **Teacher content management is a checklist.** There is no "preview as student", no release timeline, no counts of what students can see, and no link from the panel to the reader at that module. | [C] | Medium |
| L-9 | **Arrow-key paging works only in presentation mode;** in normal reading, keyboard users tab to «التالي». | [C] `LearningReader.tsx:244` | Low–Medium |
| L-10 | **The catalog scales poorly beyond one book.** Cards have no subject / grade grouping; `subject` / `grades` exist in `catalog.ts` but are not filterable. | [C] | Medium (future courses) |

### 2.3 Comparison with premium LMS reading experiences (proposed, not implemented)

| Expected capability | Today | Proposal | Phase |
|---|---|---|---|
| A library that feels like a product shelf | single card, duplicated title | hero with "continue reading", course cards with cover art, progress ring, module count, subject / grade chips; empty / coming-soon shelf | L1 |
| Course home | flat section list | hero, objectives, «ابدأ» / «تابع» CTA, section cards with lesson count, page range, progress, and (teacher) release status | L1 |
| Compact reading chrome | two rows + banner + select | one toolbar row (back · title · progress · TOC · settings · presentation); the banner becomes a dismissible note; page jump moves into the TOC sheet | L2 |
| Progress and orientation | «9 / 248» | a thin progress bar, "lesson x of y", TOC ticks for visited pages, "next: …" card at a lesson's end | L2 (visited = local) / L4 (server) |
| Search | none | in-book search over titles + keywords (the existing index), results grouped by module; later full-text | L3 |
| Comfort | none | text size (3 steps), line spacing, reading theme; remembered per device | L2 |
| Bookmarks / notes | none | bookmarks first (device-local, then server); notes later | L4 |
| Media | citations only | a «عرض صفحة الكتاب الأصلية» side panel (PDF page image) and a video block type with captions | L6 (owner decision) |
| Teacher authoring / release | checklist | release board per class: modules as rows, «منشور / مخفي» toggles, counts, «معاينة كطالب» | L5 |
| Analytics | none in reader | per-module reach (students who opened / completed) | L4 / 21E.4 |

### 2.4 Teacher and student flows

**Teacher flow** (fully implemented, [C] [B]):

> المواد التعليمية → فتح الكتاب → نظرة الكتاب → بدء القراءة / فتح القسم → القارئ

It ends at «العودة إلى نظرة الكتاب». Publishing lives elsewhere (الصفوف والطلاب → class → المواد التعليمية لهذا الصف), so the
teacher cannot see from the reader what students can see.

**Student flow** (implemented, [C]):

> portal «المواد» section → released course → reader (restricted to published modules) → back to the portal

The resume marker is per device.

**Gap:** the two flows never meet. The teacher has no "student view" of a module; the student has no progress, and nothing tells
them which new modules were released.

### 2.5 Embedded interactive content in learning

**Implemented:** trusted registry blocks (`simulation`, `animation`, `visual`, `guided`, CLI activities), rendered by repo
components per course batch (`learning/visuals/791381/batch*`, `learning/activities/*`, `learning/cli/*`). They are tokenized
(`activities.css` 8 / 889, `visuals.css` 5 / 118, `cli.css` 16 / 71).

**Not implemented:** Scene3D (`Interactive3DView`) and SmartSim packages inside learning pages (I-4).

**Proposal:** an `interactive3d` content block that reuses the #308 viewer in read-only exploration mode (no answers). It needs
an owner decision and a content-validation rule.

### 2.6 RTL, accessibility, mobile and tablet

- **RTL:** correct throughout [B]; the source citation mixes LTR numbers safely.
- **200 % zoom (640×450):** no horizontal overflow on library / overview / reader [B].
- **Phone:** functional, but L-3 (chrome before content) is the main defect.
- **Tablet (768–1024 px):** the reader switches between sidebar and drawer. **Not yet measured**; add 834×1194 and 1024×768 to the
  L2 harness.
- **Keyboard:** TOC and paging buttons are reachable; L-9 (arrow keys only in presentation).
- **Focus visibility under the sticky page bar:** I-6.

---

## 3. Design system — inventory and unified proposal

### 3.1 What exists

- **Tokens** (`src/design-tokens.css`, 112 lines):
  - colour roles: bg, surface, ink / text / muted / placeholder / faint, line, primary 050–strong, success / warn / danger / info
    with bg and tx pairs, nav;
  - type scale `--eb-fs-12…28`, weights, line heights;
  - spacing `--eb-space-1…7` (4–48 px); radii `--eb-r-xs…xl` (6–20 px); shadows `--eb-sh-xs…lg`;
  - motion `--eb-dur` / `--eb-ease`; focus `--eb-focus`, `--eb-focus-ring`, `--eb-focus-offset`;
  - z-scale sticky 10 · dropdown 20 · nav 30 · drawer 40 · toast 50 · overlay 60 · modal 70;
  - containers 720 / 960 / 1280 / 1440 px.
- **Primitives** (`src/ui/`): `ActionMenu`, `Breadcrumb`, `ChartCard`, `ConfirmDialog` / `useConfirm`, `Dialog`, `EmptyState`,
  `Field` / `FieldGroup`, `IconButton`, `PageHeader`, `ProfileAvatar`, `ProgressBar`, `ProgressRing`, `SectionHeader`, `StatCard`,
  `StatusBadge`, `Toast`, `VisuallyHidden`; hooks `useModalSurface`, `useFocusTrap`, `useMediaQuery`, `usePrefersReducedMotion`,
  `useBodyScrollLock`.
- **Guards:** focus-ring tokens, `[hidden]` override, `--eb-muted` contrast, native dialogs, and per-slice premium guards
  (21E.2 / #308).
- **Debt** (literal colours):
  - `App.css` 275 (3,301 lines) and `platform.css` 314 (1,115 lines);
  - `structured-builder.css` 249 (overridden by the premium sheets);
  - about 950 across the ~20 interactive-family sheets (mesh 82, physics motion 64, chemistry 57 / 53 / 52, coding 56,
    topology 55 / 41, …).

### 3.2 Proposed "Tadris+ Premium" system

It extends what #302 / #304–#308 established and replaces nothing that works.

1. **Keep the tokens; add four groups, additively** (the 21E.1 token rule):
   - *Reading*: `--eb-measure` (66ch), `--eb-read-fs-1…3` (17 / 19 / 21 px), `--eb-read-lh` (1.9). They fix DS-8's undefined
     `--eb-measure`.
   - *Elevation roles*: `--eb-elev-card`, `--eb-elev-floating`, `--eb-elev-overlay`, mapped to the existing shadows.
   - *Semantic surfaces*: `--eb-surface-sunken` (tinted stages / canvases), `--eb-surface-raised`.
   - *Density*: `--eb-control-h` 40 px, `--eb-control-h-touch` 44 px.
2. **Component recipes:** the visual grammar already proven in the slices, written down once in `docs/` and in one shared sheet:
   - *Card*: surface, line-2, radius-lg / xl, shadow sm;
   - *Toolbar*: labelled groups on a sunken band (#308, builder slice 1);
   - *Segmented control / chip*;
   - *Answer / row card* with index badge (slice 2);
   - *Stage*: the framed canvas for 3D / SmartSim / visuals (#308);
   - *Status pill*: tone edge plus a labelled pill, never colour alone (slices 3 / 4);
   - *Page tile*: the document glyph (slice 4);
   - *Data table frame* (21E.4); *Empty state*; *Progress* (bar / ring).
3. **Page templates**, mapped to every route in §1:
   - *Catalog* (library, exam lists, bank, games);
   - *Detail / overview* (course home, project, assignment);
   - *Workspace + side panel* (builder, grading, reader);
   - *Reader* (learning);
   - *Dialog / wizard* (import, AI composer, governance);
   - *Data page* (dashboard, reports, gradebook, audit log).
4. **Rules carried over from the slices:**
   - token-only colours in new sheets; logical properties only;
   - ≥ 44 px under `pointer: coarse`; hover tints only under `hover: hover`;
   - focus rings from the focus tokens; `prefers-reduced-motion` and `forced-colors` blocks;
   - a guard test per sheet;
   - rules more specific than the legacy rule they restyle (§ slice 3 cascade finding);
   - no `display:none` on controls.
5. **Adoption strategy — restyle in place, don't rewrite:**
   - a scoped premium sheet per surface (pulled in by `@import`, as #305–#307 did) plus markup changes only where grouping or
     semantics require it (as #308 did);
   - legacy `App.css` / `platform.css` blocks are retired surface by surface in 21E.6, with a ratchet (hex count may only go down).

---

## 4. Roadmap

### 4.1 Sequencing and dependencies

```
merge #303 → (#304 → #305 → #306 → #307)          [independent of each other; owner order]
        │
        ├── L1 library + course home  ──┐
        ├── L5 teacher release board    │ (after L1: shares the course-home card)
        └── L2 reader shell  ───────────┴── L3 search ── L4 progress / bookmarks (API) ── L6 media (decision)
21E.4 grading / results / analytics   (after #303: results screen; after #307: lists)
21E.5 interactive families            (after #303: registries; reuses #308's stage / toolbar)
21E.7 import, reviews, governance tools (after #304–#307: builder menus)
21E.8 legacy exam page + login        (after #307)
21E.9 student portal sections         (after #303)
21E.6 legacy CSS retirement + final certification (last; ratchets per sheet)
```

- **Learning comes first by owner priority.** L1, L2 and L5 share no file with #303–#307 (verified in §1: `learning/*`,
  `students/ClassLearningMaterialsPanel.tsx`, `student/StudentLearningMaterials.tsx` are untouched by the open PRs).
- **Only one constraint:** `StudentPortal.tsx` is not in #303, but L4's student-side progress UI should wait for #303's merge, so
  the student portal is reconciled once.

### 4.2 Phases

Each phase is one branch and one or more PRs, follows `AGENTS.md`, and ships a design record section, guard tests and a Chromium
before / after harness.

#### L1 — Learning library and course home (P0 · complexity M · ≈ 2 PRs)

- **Files:** `learning/LearningMaterialsPage.tsx`, `learning.css`, `catalog.ts` (read-only use), `ui/ProgressRing.tsx`,
  `ui/SectionHeader.tsx`.
- **Deficiencies:** L-1, L-2, L-10.
- **Scope:**
  - library hero with the one page title (the duplicated `h2` removed). A «تابع القراءة» entry only where a position exists today:
    the student's device marker (`readerPosition.ts`). The teacher has no stored position; adding one is L4;
  - course cards with cover art (token-drawn, no assets), subject / grade chips and status, **from the static catalog only**. The
    library's stated contract is zero network requests on open, so manifest-derived counts belong to the course home, where the
    manifest chunk is already loaded on demand;
  - a "coming soon" shelf;
  - course home: hero, the existing description, «ابدأ القراءة», and section cards with lesson count and page range, read from the
    manifest when the home opens (the same chunk the reader loads).
- **Out of scope:** search, server progress.
- **Regression risks:**
  - opening the library must still issue **zero** network requests (stated contract);
  - section → first-page mapping;
  - `LearningMaterialsPage.*.test` semantics.
- **Accessibility / mobile:** one `h1` / `h2` chain (remove the duplicate title); cards as articles with labelled actions;
  44 px; 390 / 640×450 / 834 tablet / 1280 layouts; reduced motion.
- **PR boundaries:** PR-A library (cards + hero); PR-B course home.
- **Acceptance:**
  - Chromium: library and course home at 4 viewports + tablet; zero network on library open;
  - each section opens the right page (8 / 8);
  - no overflow; first CTA above the fold on phones;
  - guard tests (tokens, focus, touch).

#### L2 — Reader shell and reading comfort (P0 · M–H · ≈ 3 PRs)

- **Files:** `learning/reader/LearningReader.tsx`, `LearningReaderToc.tsx`, `reader.css`, `learning/training/LearningReaderWithTraining.tsx`
  (host only); shared by teacher and student.
- **Deficiencies:** L-3, L-4 (orientation part), L-6, L-9, I-6.
- **Scope:**
  - one-row toolbar (back · book / lesson title · progress bar · TOC · «إعدادات القراءة» · presentation);
  - the release banner becomes a one-time dismissible note;
  - page jump moves into the TOC sheet;
  - "lesson x of y" + a thin book progress bar;
  - TOC: current-lesson auto-expand and visited ticks (device-local);
  - reading settings: text size 3 steps, line spacing, light / sepia, stored per device;
  - arrow / PageUp / PageDown paging in normal mode when focus is not in a field;
  - `scroll-padding` for the sticky pager.
- **Regression risks (high: shared reader):**
  - restricted content API and progressive release;
  - presentation mode and fullscreen;
  - practice / training seams (T01–T04 return to the same page);
  - Study-Practice point reporting;
  - motion toggle; `embedded` landmark;
  - the existing reader test families (layout, semantics, readability 12a, presentation, restricted, lazy visuals).
- **Accessibility / mobile:**
  - the first page heading in the top third of the phone screen (target y ≤ 280 px at 390×844; today 374);
  - focus never under the sticky pager (WCAG 2.4.11);
  - settings as a labelled dialog;
  - keyboard paging announced; RTL arrows semantic;
  - 200 % text scaling without clipping.
- **PR boundaries:** PR-A toolbar + banner + pager clearance; PR-B progress / orientation + TOC ticks; PR-C reading settings.
- **Acceptance:**
  - Chromium: content offset, focus clearance probe, keyboard paging, TOC and presentation round trip, the training return path,
    restricted student view; 4 viewports + tablet;
  - every existing reader test green;
  - planted defects on the restricted API and the training return.

#### L3 — Search and navigation (P1 · M · 1–2 PRs)

- **Files:** `learning/content/search.ts` (existing index), a new search panel in the reader and the library, `navigation.ts`.
- **Deficiencies:** I-1, L-4.
- **Scope:**
  - in-book search over page titles + keywords, without loading page bodies (the index's design contract);
  - results grouped by module → lesson, keyboard navigable, opening the reader at the page;
  - library filter by subject / grade (prepared for more courses).
  - Full-text search is a later decision; it needs a body index built at build time.
- **Risks:** bundle size (the index must stay in the manifest chunk); the restricted student API must never surface titles of
  unreleased modules.
- **Accessibility:** `role="search"`, live result count, Escape / arrow handling, RTL highlighting.
- **Acceptance:**
  - search unit tests incl. the restriction rule (a student never sees hidden modules);
  - Chromium search → open → back;
  - bundle guard.

#### L4 — Reading progress, resume and bookmarks (P1 · H · API + UI, 2–3 PRs)

**Owner decisions required:** progress is server-side per student (cross-device) or device-local; what counts as "read".

- **Files:** a new API function (Azure Functions) + storage document per student / course; `student/StudentLearningMaterials.tsx`,
  `StudentPortal.tsx` (after #303), reader host seams, teacher class panel (read-only counts).
- **Deficiencies:** I-3, L-5, L-6 (bookmarks).
- **Scope:**
  - per-page "visited" and per-lesson "completed" (explicit or at the last page);
  - progress ring on course cards and section cards;
  - student «تابع» from the server across devices;
  - bookmarks list;
  - teacher: per-module reach in the release board (L5).
- **Risks:** a new API surface (authority checks, identity masking), Blob document growth, offline behaviour; no grading
  impact.
- **Acceptance:**
  - API tests (authority, isolation, idempotency);
  - UI tests;
  - Chromium cross-device simulation (two contexts);
  - load cost recorded.

#### L5 — Teacher content management (release board) (P1 · M · 1–2 PRs)

- **Files:** `students/ClassLearningMaterialsPanel.tsx`, `classLearningMaterials.ts` (presentation), entry links into
  `LearningMaterialsPage`.
- **Deficiencies:** L-8, the §2.4 gap.
- **Scope:**
  - modules as rows with lesson / page counts and «منشور / مخفي» switches (the same mutations);
  - a "what students see" summary;
  - «معاينة كطالب» opens the reader with the restricted API for that class's published set;
  - from the course home, a teacher sees per-class release status.
- **Risks:** mutations stay in `TeacherPlatform` (unchanged authority); the archived-class read-only rule; stale-class protection.
- **Acceptance:**
  - existing panel tests;
  - preview-as-student restriction test (no hidden module visible);
  - Chromium release → preview round trip.

#### L6 — Media: original-page view and video (P2 · H · decision first)

**Owner decisions required:** whether page images of the source PDF may be shipped / served, and hosting for video.

- **Files:** `content/types.ts` + `validation.ts` (new block types), `LearningPageRenderer.tsx`, asset pipeline.
- **Scope:** «عرض صفحة الكتاب الأصلية» side panel (image of the cited PDF page, lazy); a `video` block with captions / transcript,
  no autoplay, reduced-motion respect.
- **Risks:** bundle and storage size, copyright, CSP.
- **Acceptance:** validation tests, lazy loading measured, Chromium playback controls by keyboard, captions present.

#### 21E.4 — Grading, results and analytics (P1 · M · existing plan, refined)

- **Files:** `TeacherDashboard.tsx`, `AssignmentsPanel.tsx`, `AssignmentReview.tsx`, `bank/ExamBankPage.tsx`, `reports/*`,
  `review-workspace.css`, `dashboard-pro.css`.
- **Deficiencies:** F17, F18, DS-4, DS-6; results-screen F8 (verify after #303).
- **Scope:** as in the 21E plan (`DataTable` frame, grading phone layout, LTR answers, empty states), plus the catalog / data-page
  templates of §3.2.
- **Acceptance:** per the 21E plan §8.

#### 21E.5 — Interactive families (P1 · M–H · ≈ 4 PRs, one per family group)

- **Files:**
  - mesh-model, surface-plot / 3D-surface, molecule viewers (same toolbar pattern as #308);
  - dynamic SmartSim and network topology;
  - physics labs; chemistry lab / reactions;
  - coding workspace, network CLI, open response, visual questions.
- **Scope:**
  - apply #308's stage + labelled toolbar groups + SVG icons + instruction card;
  - the 21E plan's `InteractiveFrame` loading / fallback / reduced-motion contract;
  - theme-aware focus rings (F11);
  - fixed heights → `min()` (S-8).
- **Risks:**
  - each family has its own certification workflow (`chemistry-smartsim-21dd.yml`, function-graphs 21A2, Interactive 3D);
  - answer semantics per question type;
  - `trustedSim/smartSimUiRegistry.ts` and `physicsLab/LabScene.tsx` are in #303, so this phase starts after #303 merges.
- **Acceptance:** per-family Chromium harness (controls by name, answer integrity under camera actions, touch, 200 %), plus the
  existing family workflows green.

#### 21E.7 — Import, publishing reviews and builder tools (P2 · M · 2–3 PRs)

- **Files:** `SmartStructuredExamImportWizard.tsx`, `ImportQuestionsPanel.tsx` (1,059 lines), `smart-import.css`,
  `governance/ReviewInboxPage.tsx`, `GovernancePanel.tsx`, `reviewInbox.css`, `BlueprintPanel.tsx`, `presets/*`.
- **Deficiencies:** legacy sheets with 0 tokens (`smart-import.css` 46 / 0, `reviewInbox.css` 35 / 0); wizard steps without a
  stepper.
- **Scope:** dialog / wizard template, stepper, file drop zone, result summary cards; review inbox as a data page with status
  pills.
- **Risks:** import parsing untouched; governance authority rules (409 conflict alert, documented flaky test in AGENTS.md §12).
- **Order:** after #304–#307 (the builder menus open these tools).

#### 21E.8 — Legacy exam page and login (P2 · M–H)

- **Files:** `App.tsx` builder view (prompt card, AI generation, plan / analysis cards), `App.css`, `builder-pro.css`,
  `login-pro.css`.
- **Scope:** workspace template for the exam page; remove emoji labels and English eyebrows («Azure Storage», «Exam Templates»)
  through markup in `App.tsx` (after #304–#307 merge, since #304 edits `App.tsx`); login hero copy (A-7, owner decision).
- **Risks:** `App.tsx` is the routing root; every edit needs focused tests.

#### 21E.9 — Student portal sections (P1 · M · 2 PRs, after #303)

- **Files:** `StudentPortal.tsx`, `student/*`, `studentportal-pro.css`, `projects/StudentProjectPanel.tsx`, games, messages.
- **Deficiencies:** F12 (if not closed by #303), F9 (type scale on the student home), DS-6 empty states.
- **Scope:** today / tasks / progress / projects with the catalog and detail templates; the learning card from L1 / L4 shown in
  «اليوم».

#### 21E.6 — Legacy CSS retirement and final certification (P2 · M–H · split per sheet)

As in the 21E plan, with a ratchet:
- the literal-colour count per legacy sheet (`App.css` 275, `platform.css` 314, `structured-builder.css` 249, interactive
  families) may only go down;
- breakpoints are consolidated;
- 200 % text-scaling and browser-side accessibility sweeps across every template.

### 4.3 Priority summary

| Order | Phase | Priority | Complexity | Blocked by |
|---|---|---|---|---|
| 1 | L1 library + course home | P0 | M | none |
| 2 | L2 reader shell + comfort | P0 | M–H | none (L1 recommended first for shared visual language) |
| 3 | L5 release board | P1 | M | L1 |
| 4 | L3 search | P1 | M | L2 |
| 5 | 21E.4 grading / results / analytics | P1 | M | #303 (results), #307 (lists) |
| 6 | 21E.5 interactive families | P1 | M–H | #303 |
| 7 | 21E.9 student portal sections | P1 | M | #303 |
| 8 | L4 progress / bookmarks | P1 | H | owner decision, #303 |
| 9 | 21E.7 import / reviews / tools | P2 | M | #304–#307 |
| 10 | 21E.8 legacy exam page + login | P2 | M–H | #304–#307 |
| 11 | L6 media | P2 | H | owner decision |
| 12 | 21E.6 retirement + certification | P2 | M–H | all of the above |

### 4.4 Evidence standard for every phase

As practised in #305–#308:
1. a Chromium harness that runs the same checks on the BEFORE tree and the AFTER tree (desktop 1280×900, 853×600 @1.5,
   640×450 @2, 390×844 touch; plus 834×1194 tablet for learning);
2. behavioural checks first (answers, navigation, restrictions, data), then visual and accessibility checks (names, focus
   ring, ≥ 44 px, overflow, reduced motion);
3. guard tests on each new sheet, including pins that pass on `main`;
4. a few planted defects per slice instead of broad mutation campaigns;
5. exact-head CI recorded in the PR body; no merge by agents.

## 5. Decisions needed from the owner before implementation

1. **Approval of the order in §4.3,** in particular L1 + L2 before 21E.4.
2. **L4:** server-side reading progress (cross-device; a new API and storage document) or device-local only; and the definition
   of "completed".
3. **L6:** whether original PDF page images may be served next to the interactive pages, and whether video is in scope for
   791381.
4. **L3:** titles + keywords search first (no body loading), with full-text later — or full-text from the start (build-time
   index, larger chunk).
5. **Learning embeds:** whether Scene3D / SmartSim packages may be embedded in learning pages (I-4) as exploration-only blocks.
