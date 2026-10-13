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
| Status | **Direction approved by the owner on 2026-10-13; decisions D1–D7 are recorded in §5.** This is a planning record: nothing below is implemented by this PR |

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
| L-7 | **No media.** No video / audio blocks; the original PDF page cannot be opened beside the interactive page even though every page cites it. | [C] I-2 | Medium (decided: D3, §5) |
| L-8 | **Teacher content management is a checklist.** There is no "preview as student", no release timeline, no counts of what students can see, and no link from the panel to the reader at that module. | [C] | Medium |
| L-9 | **Arrow-key paging works only in presentation mode;** in normal reading, keyboard users tab to «التالي». | [C] `LearningReader.tsx:244` | Low–Medium |
| L-10 | **The catalog scales poorly beyond one book.** Cards have no subject / grade grouping; `subject` / `grades` exist in `catalog.ts` but are not filterable. | [C] | Medium (future courses) |

### 2.3 Comparison with premium LMS reading experiences (proposed, not implemented)

| Expected capability | Today | Proposal | Phase |
|---|---|---|---|
| A library that feels like a product shelf | single card, duplicated title | hero with "continue reading", course cards with cover art, progress ring, module count, subject / grade chips; empty / coming-soon shelf | L1 |
| Course home | flat section list | hero, objectives, «ابدأ» / «تابع» CTA, section cards with lesson count, page range, progress, and (teacher) release status | L1 |
| Compact reading chrome | two rows + banner + select | one toolbar row (back · title · progress · TOC · settings · presentation); the banner becomes a dismissible note; page jump moves into the TOC sheet | L2 |
| Progress and orientation | «9 / 248» | a thin progress bar, "lesson x of y", TOC ticks for visited pages, "next: …" card at a lesson's end | L2 (visited = local) / L4 (server, D2) |
| Search | none | in-book search over titles + keywords (the existing index), results grouped by module; full-text later through the same interface (D4) | L3 |
| Comfort | none | text size (3 steps), line spacing, reading theme; remembered per device | L2 |
| Bookmarks / notes | none | bookmarks, server-backed with offline continuity (D2); notes later | L4 |
| Media | citations only | a «عرض صفحة الكتاب الأصلية» side panel (PDF page image) and a video block type with captions | L6a / L6b (D3: subject to rights and infrastructure) |
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

**Approved (D5):** explore-only blocks that reuse the #308 viewer (Scene3D) and the sandboxed SmartSim host, with no answers and
complete isolation from graded exam answers. Phase L7 in §4.3 has the isolation rules and acceptance criteria.

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
6. **Scope (D6): the entire platform, including educational content.** The reader, the library, the release board and every
   learning content block (activities, visuals, CLI, practice, training) use the same tokens, reading tokens and recipes as the
   teacher and exam surfaces. There is one premium Arabic-first RTL system, not a separate learning theme.

---

## 4. Roadmap

The owner decisions recorded in §5 (D1–D7) are binding on every phase below. The **preservation gate P-1…P-7** (§5, D7) is
part of every phase's acceptance, in addition to the phase's own criteria.

### 4.1 Sequencing and dependencies

```
other sessions: #303 ── (#304 → #305 → #306 → #307)       completed and merged separately, owner order; never edited here
this track (D1, starts now, no shared files with #303–#307):
        L1 library + course home ──┐
        L2 reader shell + comfort ─┴── L5 release board ── L3 search (D4) ── L4 progress (D2, API) ──┬── L6a original page (D3)
                                                                                                    └── L6b video (D3, future)
after #303 merges:   21E.9 student portal · 21E.5 interactive families · L4 student-portal UI · L7b SmartSim embed (D5)
after L2:            L7a Scene3D explore-only embed (D5; the #308 viewer is already on main)
after #304–#307:     21E.7 import / reviews / tools · 21E.8 legacy exam page + login
after #303 + #307:   21E.4 grading / results / analytics
last:                21E.6 legacy CSS retirement + final certification (ratchets per sheet)
```

- **D1: learning comes first and starts now.** L1 and L2 edit only `src/learning/**` (L1 also `ui/` primitives through new,
  scoped classes). No file is shared with #303–#307. This was verified in §1 and is re-verified at branch start and before review
  (gate P-7).
- **Waits on #303 only where files meet:** `StudentPortal.tsx` (L4's student-side UI, 21E.9), the SmartSim registry
  `trustedSim/smartSimUiRegistry.ts` (L7b) and the interactive families (21E.5).

### 4.2 Classification: visual redesign versus new functional / backend development

| Phase | Classification | Front-end | API / storage | Content / assets | Gate before start |
|---|---|---|---|---|---|
| L1 | **Visual redesign** | restyle + markup (hero, cards, course home) | none | none (reads the static catalog and the existing manifest) | none |
| L2 | **Visual redesign + front-end functional** (reading settings, keyboard paging, device-local visited ticks) | yes | none | none | none |
| L5 | **Visual redesign + front-end functional** («معاينة كطالب», counts) | yes | **none new**: existing publish / hide mutations; per-module reach arrives with L4 | none | L1 |
| L3 | **New front-end functional** (search) | yes | none | the existing title + keyword index; the full-text upgrade later adds a build-time body index | L2 |
| L4 | **New backend + front-end functional** (server progress, offline queue, bookmarks) | yes | **new API function + Blob document** | build-time word counts per page | design record approved by the owner; #303 merged for the portal UI |
| L6a | **New backend + asset pipeline + front-end** (original page view) | yes | **new access-checked asset route** | page images of the source PDF | **owner's written content-rights confirmation**; storage choice in the existing Azure Blob account |
| L6b | **New functional, future** (video) | yes | hosting to be decided | video files + captions | rights per video; hosting decision (D3) |
| L7a / L7b | **New front-end functional + content model** (explore-only blocks) | yes | none | new block types + validation | L2 (L7a); #303 merged (L7b) |
| 21E.4 | Visual redesign | yes | none | none | #303, #307 |
| 21E.5 | Visual redesign (behaviour pinned per family) | yes | none | none | #303 |
| 21E.7 | Visual redesign (+ stepper markup) | yes | none | none | #304–#307 |
| 21E.8 | Visual redesign + markup cleanup (login copy is an owner decision) | yes | none | none | #304–#307 |
| 21E.9 | Visual redesign | yes | none | none | #303 |
| 21E.6 | CSS refactor + certification (no visible behaviour change) | yes | none | none | all above |

**Rule for visual phases:** no change to `src/learning/content/**`, `api/**`, question JSON, version families or grading. A visual
phase that finds a functional defect records it and does not fix it in the same PR.

### 4.3 Phases

Each phase is one branch and one or more PRs. It follows `AGENTS.md` and ships a design record section, guard tests and a
Chromium before / after harness (§4.5). **"Viewports"** below means 1280×900, 853×600 @1.5, 640×450 @2, 390×844 touch, and for
learning phases also 834×1194 and 1024×768 tablet.

#### L1 — Learning library and course home (P0 · visual · M · ≈ 2 PRs)

- **Files:** `learning/LearningMaterialsPage.tsx`, `learning.css`, `catalog.ts` (read-only use), `ui/ProgressRing.tsx`,
  `ui/SectionHeader.tsx`.
- **Deficiencies:** L-1, L-2, L-10.
- **Scope:**
  - library hero with the one page title (the duplicated `h2` removed). A «تابع القراءة» entry only where a position exists today:
    the student's device marker (`readerPosition.ts`). Server-backed resume replaces it in L4;
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
- **Accessibility / mobile:** one `h1` / `h2` chain; cards as articles with labelled actions; 44 px; reduced motion.
- **PR boundaries:** PR-A library (cards + hero); PR-B course home.
- **Acceptance (measurable):**
  - **L1-1:** opening the library issues **0** network requests (Chromium request log, every viewport).
  - **L1-2:** exactly **one** element reads «المواد التعليمية» as a heading.
  - **L1-3:** **8 / 8** section cards open the reader at the manifest's first page of that section.
  - **L1-4:** lesson counts and page ranges on the course home equal the manifest's (unit test over all 8 sections; the page
    ranges sum to 248).
  - **L1-5:** at 390×844 the primary CTA's bottom edge is at **y ≤ 844** without scrolling, on the library and on the course home.
  - **L1-6:** no horizontal overflow (`scrollWidth ≤ clientWidth`) at every viewport, including 640×450 @2.
  - **L1-7:** every interactive element is **≥ 44×44 px** under touch; a keyboard-focused control shows the focus-ring token.
  - **L1-8:** the new sheet passes the token-only, logical-property, reduced-motion and forced-colours guards (D6).

#### L2 — Reader shell and reading comfort (P0 · visual + front-end functional · M–H · ≈ 3 PRs)

- **Files:** `learning/reader/LearningReader.tsx`, `LearningReaderToc.tsx`, `reader.css`, `learning/training/LearningReaderWithTraining.tsx`
  (host only); shared by teacher and student.
- **Deficiencies:** L-3, L-4 (orientation part), L-6, L-9, I-6.
- **Scope:**
  - one-row toolbar (back · book / lesson title · progress bar · TOC · «إعدادات القراءة» · presentation);
  - the release banner becomes a one-time dismissible note;
  - page jump moves into the TOC sheet;
  - "lesson x of y" + a thin book progress bar;
  - TOC: current-lesson auto-expand and visited ticks (device-local until L4);
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
- **Accessibility / mobile:** settings as a labelled dialog; keyboard paging announced; RTL arrows semantic.
- **PR boundaries:** PR-A toolbar + banner + pager clearance; PR-B progress / orientation + TOC ticks; PR-C reading settings.
- **Acceptance (measurable):**
  - **L2-1:** at 390×844 the first page heading's top edge is at **y ≤ 280 CSS px** (DOM-measured; today 374). At 1280×900 it is
    **≤ 300** (today 449).
  - **L2-2:** **0** focusable elements are hidden under the sticky pager. Tab through 3 long pages and assert that each focused
    element's rectangle does not intersect the pager's (WCAG 2.4.11).
  - **L2-3:** in normal mode, ArrowLeft / ArrowRight / PageUp / PageDown move by exactly one page (direction follows RTL), and
    **do nothing** while focus is in an input, select or textarea.
  - **L2-4:** the three text sizes give computed body font sizes of 17 / 19 / 21 px (`--eb-read-fs-1…3`). At 200 % zoom (640×450
    @2) no text is clipped and there is no horizontal overflow. Each setting survives a reload on the same device.
  - **L2-5:** T01–T04 return to the same `pageId` (4 / 4). Presentation mode round trip returns to the same page.
  - **L2-6:** a restricted student view loads **0** modules outside the published set (`RestrictedModuleError` on direct access).
    The TOC lists only published modules.
  - **L2-7:** the Study-Practice attempt request body is byte-identical before and after (harness capture of one attempt).
  - **L2-8:** every existing reader test file passes unchanged. Planted defects on the restricted API and on the training return
    are KILLED.

#### L5 — Teacher content management (release board) (P1 · visual + front-end functional · M · 1–2 PRs)

- **Files:** `students/ClassLearningMaterialsPanel.tsx`, `classLearningMaterials.ts` (presentation), entry links into
  `LearningMaterialsPage`.
- **Deficiencies:** L-8, the §2.4 gap.
- **Scope:**
  - modules as rows with lesson / page counts and «منشور / مخفي» switches (**the same mutations, no new API**);
  - a "what students see" summary;
  - «معاينة كطالب» opens the reader with the restricted API for that class's published set;
  - from the course home, a teacher sees per-class release status;
  - per-module reach (opened / completed) is added after L4 ships.
- **Risks:** mutations stay in `TeacherPlatform` (unchanged authority); the archived-class read-only rule; stale-class protection.
- **Acceptance (measurable):**
  - **L5-1:** toggling a module sends the same request as today (method, route, body shape; captured by the harness on BEFORE and
    AFTER).
  - **L5-2:** in «معاينة كطالب» with *k* published modules, the TOC shows exactly *k* modules. Opening a hidden module's page
    raises `RestrictedModuleError` (unit + Chromium).
  - **L5-3:** for an archived class, **0** enabled switches, and no mutation request is possible from the UI.
  - **L5-4:** the summary's page count equals the sum of published modules' pages from the manifest (unit test over 3 release
    sets).
  - **L5-5:** the existing panel tests pass unchanged; L1-6 / L1-7 / L1-8 hold for the panel.

#### L3 — Search and navigation (P1 · new front-end functional · M · 1–2 PRs)

- **Files:** `learning/content/search.ts` (existing index), a new search panel in the reader and the library, `navigation.ts`.
- **Deficiencies:** I-1, L-4.
- **Scope (D4):**
  - **now:** in-book search over page titles + keywords through the existing index, without loading page bodies;
  - Arabic normalisation of queries and index terms: tashkeel and tatweel removed; أ / إ / آ → ا; ى → ي; ة → ه;
  - results grouped by module → lesson, keyboard navigable, opening the reader at the page;
  - library filter by subject / grade (prepared for more courses);
  - **upgrade path to full-text:**
    - the UI talks to one `SearchProvider` interface (`query(text, scope) → results { pageId, moduleId, title, matchedField,
      snippet? }`);
    - the title + keyword provider is the first implementation;
    - a later full-text provider adds a body index built at build time, loaded as a separate chunk only when the search panel
      opens, behind the same interface and the same restriction filter;
    - switching providers changes no UI component.
- **Risks:** bundle size; the restricted student API must never surface titles of unreleased modules.
- **Accessibility:** `role="search"`, live result count, Escape / arrow handling, RTL highlighting.
- **Acceptance (measurable):**
  - **L3-1:** for a student, results contain **0** pages from unpublished modules. The unit test runs every title and keyword of
    every hidden module as a query against 3 release sets.
  - **L3-2:** normalisation: «الشبكة» / «الشبكه» / «الشَّبكة» / «الشـبكة» return the same result set (table test, ≥ 10 pairs).
  - **L3-3:** opening the search panel loads **no** page-body module chunk (Chromium request log).
  - **L3-4:** with 4× CPU throttling, the p95 query time over the 248-page index is **≤ 50 ms** (30 queries measured).
  - **L3-5:** the initial app chunk does not grow (bundle guard). The search UI is a lazy chunk, and its size is recorded in the PR.
  - **L3-6:** search → open → back returns focus to the search field with the query intact. The result count is announced
    through a live region.
  - **L3-7:** a contract test runs the UI against a stub second provider: no UI file changes when providers are swapped (the
    upgrade path is proven).

#### L4 — Reading progress, resume and bookmarks (P1 · new backend + front-end functional · H · 2–3 PRs)

**Decided (D2):**
- progress is server-backed, per student, across devices;
- the device keeps an offline queue for continuity;
- completion follows the reading / activity criteria below, never page opening alone.

- **Files:**
  - API: a new API function (Azure Functions v4, one module) and a per-student progress document in Blob storage. It is modelled
    on `learning-study.js`:
    - `requireActiveStudentSession` for students;
    - the class gate `classCanSeeLearningModule`;
    - `mutateJsonWithRetry` for writes.
  - UI: `student/StudentLearningMaterials.tsx`, `StudentPortal.tsx` (after #303), reader host seams, the L5 board (read-only
    counts).
- **Deficiencies:** I-3, L-5, L-6 (bookmarks).
- **Progress model (proposed in the L4 design record, owner approval before code):**

  | State | Rule |
  |---|---|
  | *opened* | the page became the active reader page. Recorded, **never counts as read** |
  | *read* (page) | **both:** (a) the page end was reached (an end sentinel intersected the viewport, or the whole page fits in one screen); (b) the page was the active, visible page (document visible) for at least the minimum dwell **max(10 s, words ÷ 5 per s), capped at 90 s**. Word counts are generated at build time. The thresholds are policy values advertised by the API, like the study policy today, not hardcoded in the UI |
  | *completed* (lesson) | every page of the lesson is *read*, **and** every study-eligible activity of the lesson is completed in the existing server-judged learning-study record |
  | *completed* (module / course) | every lesson completed. Percentage = read pages ÷ pages **released to that student's class** |
  | resume | the most recent *opened* page, per course |
  | bookmark | add / remove per page; a maximum per course (proposed 200) |

  All states are **monotonic and idempotent**: a page never becomes unread, and a repeated event changes nothing.

- **Offline continuity:**
  - the device queues events in `localStorage` under a key that carries the student's server-issued id, as `readerPosition.ts`
    does today;
  - the queue is bounded (proposed 500 events) and flushed on reconnect and on page change;
  - merge rule: completions are a union; resume takes the most recent event; bookmarks are applied as last-write-wins per page;
  - the existing device marker remains the fallback when the server is unreachable.
- **Teacher:** teachers' reading is not persisted (the same rule as learning-study for builder tokens). The board shows per-module
  reach for their own classes only.
- **Integrity boundary:**
  - reading progress is **self-reported engagement, not assessment**;
  - it never feeds Study Strength points, the gradebook, assignments or any grade;
  - the server validates structure only: the page exists in the course index, the module is released to the student's class,
    the dwell is plausible, and the request is rate-limited.
- **Risks:** a new API surface (authority checks, isolation between students), Blob document growth, contention with the study
  document (a separate document is proposed), offline duplicates.
- **Acceptance (measurable):**
  - **L4-1, authority:** without a student session → 401 / 403. Recording a page of an unreleased module → 403. Student A can never
    read or write student B's document (API tests).
  - **L4-2, idempotency:** sending the same event 5 times leaves the document byte-identical to sending it once. A concurrent
    write retried after a storage conflict loses no event (test with an injected storage conflict).
  - **L4-3, completion rule:**
    - opening a page with 0 s dwell → *opened* only;
    - dwell ≥ threshold without reaching the page end → not *read*;
    - both conditions met → *read*;
    - a lesson with an incomplete study-eligible activity is not *completed*.
    Table tests cover each branch, plus a planted defect "opened = read" that is KILLED.
  - **L4-4, cross-device:** two Chromium contexts share one student. A page read in context 1 shows as *read* and as the resume
    target in context 2 after a reload.
  - **L4-5, offline:** with the network offline, read 3 pages, reload, go online. The server shows exactly those 3 pages *read*,
    with no duplicates. With storage blocked, the reader still works (no exception).
  - **L4-6, shared device:** after logging out and in as student B, B's queue and resume never contain A's pages.
  - **L4-7, isolation from grading:** after a full read of a module, the learning-study points, gradebook and assignment
    documents are byte-identical (test).
  - **L4-8, size:** the progress document for a fully read course with 200 bookmarks is **≤ 64 KB** (measured and recorded).
  - **L4-9, existing behaviour:** the learning-study API tests and the reader tests pass unchanged.

#### L6 — Media: original PDF page view (L6a) and video (L6b) (P2 · new backend + assets · H)

**Decided (D3):** original PDF viewing is in scope, and video is planned as a future capability. Both are **subject to content
rights and the existing infrastructure**.

- **L6a — original page view.**
  - **Prerequisite:** the owner's written confirmation that page images of the 791381 source may be served to the class users,
    recorded in the design record. An agent never decides rights.
  - **Proposed technique:** page images (for example WebP, generated once by a build-time script from the owner-supplied PDF) in
    the existing Azure Blob account.
    - They are served through an access-checked API route that applies the same class gate as the reader. Static Web App
      static assets are public, so they must **not** be used for these images.
    - The reader opens them in a side panel («عرض صفحة الكتاب الأصلية») from the existing citation, lazily.
    - No PDF.js bundle is needed. A PDF.js viewer is the alternative if the owner prefers selectable text: a larger lazy chunk,
      and the same access rule.
  - **Acceptance (measurable):**
    - **L6a-1:** a student requesting the page image of an unreleased module gets 403; without a session, 401 (API tests).
    - **L6a-2:** **0** image requests until the panel opens (Chromium request log). The initial app chunk is unchanged (bundle
      guard).
    - **L6a-3:** every one of the 248 citations maps to an existing image (build-time check).
    - **L6a-4:** the panel is a labelled dialog: Escape closes it and returns focus to the citation, and the image has an
      Arabic text alternative naming the PDF page.
    - **L6a-5:** the CSP allows the image route only, with no new third-party origin.
- **L6b — video (future).**
  - **Defined now, built later:**
    - a `video` block schema in `content/types.ts` + `validation.ts`, added only when the first video is approved;
    - hosting is decided by the owner (Blob with range requests, or an approved provider);
    - rights are confirmed per video.
  - **Acceptance when built (measurable):**
    - **L6b-1:** validation rejects a video block without Arabic captions (WebVTT) or a transcript.
    - **L6b-2:** **no autoplay**. Under reduced motion, no animated poster.
    - **L6b-3:** play, pause, seek, captions and fullscreen are reachable by keyboard with Arabic labels.
    - **L6b-4:** **0** video bytes are loaded before the student presses play.
    - **L6b-5:** the access rule of L6a-1 applies to the video route.
    - **L6b-6:** there is no third-party tracking without owner approval.

#### L7 — Explore-only 3D and SmartSim blocks in learning pages (P1–P2 · new front-end functional + content model · M · 2 PRs)

**Decided (D5):** Scene3D and SmartSim may be embedded in educational pages in **explore-only mode**, completely isolated from
graded exam answers.

- **L7a — Scene3D**, after L2:
  - a new `interactive3d-explore` block that renders the #308 viewer (`Interactive3DView`) with selection disabled: rotate, zoom,
    fit, reset and auto-rotate only;
  - the scene is authored in the learning content, never referenced from an exam.
- **L7b — SmartSim**, after #303 merges:
  - a new `smartsim-explore` block that renders the sandboxed host with the same iframe sandbox flags;
  - the learning host ignores answer / submit messages from the simulator.
- **Isolation rules:**
  - the block components accept no `onChange` / answer props and import no exam answer type;
  - they are not registered in the student question registries;
  - they make no request to any exam, attempt, submission or learning-study route;
  - they award no Study Strength point;
  - question JSON and version families are untouched.
- **Acceptance (measurable):**
  - **L7-1:** content validation rejects an explore block that carries any of `answer`, `targets`, `expected`, `correct`,
    `points`, `weight` (table test).
  - **L7-2:** a static test asserts that the explore components import no type or module from the question-type registries and
    no answer type.
  - **L7-3:** 60 s of scripted interaction (rotate, zoom, reset, simulator controls) issues **0** requests to `/api/student-submission`,
    `/api/student-assignment`, `/api/learning-study/*` or any coding-run route (Chromium request log).
  - **L7-4:** in the Chromium harness, an exam containing the same Scene3D / SmartSim question still emits exactly its answer
    payload (#308's A-1 check), unchanged by the presence of the learning block code.
  - **L7-5:** the viewer controls keep their exact accessible names. Touch targets are ≥ 44 px, and reduced motion disables
    auto-rotate.
  - **L7-6:** the existing Interactive 3D (21D, 42 checks) and SmartSim certification workflows stay green.

#### 21E.4 — Grading, results and analytics (P1 · visual · M · existing plan, refined)

- **Files:** `TeacherDashboard.tsx`, `AssignmentsPanel.tsx`, `AssignmentReview.tsx`, `bank/ExamBankPage.tsx`, `reports/*`,
  `review-workspace.css`, `dashboard-pro.css`.
- **Deficiencies:** F17, F18, DS-4, DS-6; results-screen F8 (verify after #303).
- **Scope:** as in the 21E plan (`DataTable` frame, grading phone layout, LTR answers, empty states), plus the catalog / data-page
  templates of §3.2.
- **Acceptance (measurable):**
  - **21E.4-1:** grading actions send byte-identical requests (BEFORE / AFTER capture of score, comment and review decision).
  - **21E.4-2:** the grading view at 390×844 has no horizontal page overflow. Tables scroll inside their frame only.
  - **21E.4-3:** student code / LTR answers render with `dir="ltr"` inside RTL pages (DOM assertion).
  - **21E.4-4:** every empty list shows an `EmptyState` with a heading and an action.
  - **21E.4-5:** L1-7 / L1-8 hold, and the 21E plan §8 gates pass.

#### 21E.5 — Interactive families (P1 · visual · M–H · ≈ 4 PRs, one per family group)

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
- **Acceptance (measurable), per family:**
  - **21E.5-1:** every control is found by its exact accessible name on both trees.
  - **21E.5-2:** the answer payload is byte-identical after camera / tool actions on both trees.
  - **21E.5-3:** touch targets are ≥ 44 px, with no overflow at 200 %.
  - **21E.5-4:** the family's existing certification workflow passes on the exact head.

#### 21E.7 — Import, publishing reviews and builder tools (P2 · visual · M · 2–3 PRs)

- **Files:** `SmartStructuredExamImportWizard.tsx`, `ImportQuestionsPanel.tsx` (1,059 lines), `smart-import.css`,
  `governance/ReviewInboxPage.tsx`, `GovernancePanel.tsx`, `reviewInbox.css`, `BlueprintPanel.tsx`, `presets/*`.
- **Deficiencies:** legacy sheets with 0 tokens (`smart-import.css` 46 / 0, `reviewInbox.css` 35 / 0); wizard steps without a
  stepper.
- **Scope:** dialog / wizard template, stepper, file drop zone, result summary cards; review inbox as a data page with status
  pills.
- **Risks:** import parsing untouched; governance authority rules (409 conflict alert, documented flaky test in AGENTS.md §12).
- **Order:** after #304–#307 (the builder menus open these tools).
- **Acceptance (measurable):**
  - **21E.7-1:** the same fixture files import to byte-identical exam JSON on both trees.
  - **21E.7-2:** the stepper exposes `aria-current="step"`.
  - **21E.7-3:** the literal colours in `smart-import.css` and `reviewInbox.css` reach **0**.
  - **21E.7-4:** the governance tests pass, under the AGENTS.md flaky-test rule.

#### 21E.8 — Legacy exam page and login (P2 · visual + markup cleanup · M–H)

- **Files:** `App.tsx` builder view (prompt card, AI generation, plan / analysis cards), `App.css`, `builder-pro.css`,
  `login-pro.css`.
- **Scope:** workspace template for the exam page; remove emoji labels and English eyebrows («Azure Storage», «Exam Templates»)
  through markup in `App.tsx` (after #304–#307 merge, since #304 edits `App.tsx`); login hero copy (A-7, owner decision).
- **Risks:** `App.tsx` is the routing root; every edit needs focused tests.
- **Acceptance (measurable):**
  - **21E.8-1:** **0** emoji in visible labels, and **0** English eyebrow strings on the exam page (DOM text scan).
  - **21E.8-2:** login, logout and route switches pass the existing tests.
  - **21E.8-3:** the literal-colour count of `App.css` goes down (ratchet).

#### 21E.9 — Student portal sections (P1 · visual · M · 2 PRs, after #303)

- **Files:** `StudentPortal.tsx`, `student/*`, `studentportal-pro.css`, `projects/StudentProjectPanel.tsx`, games, messages.
- **Deficiencies:** F12 (if not closed by #303), F9 (type scale on the student home), DS-6 empty states.
- **Scope:** today / tasks / progress / projects with the catalog and detail templates; the learning card from L1 / L4 shown in
  «اليوم».
- **Acceptance (measurable):**
  - **21E.9-1:** every portal section renders at every viewport with no overflow.
  - **21E.9-2:** the student's data requests are unchanged (request log on both trees).
  - **21E.9-3:** the type scale uses only `--eb-fs-*` tokens (guard).
  - **21E.9-4:** empty states as in 21E.4-4.

#### 21E.6 — Legacy CSS retirement and final certification (P2 · CSS refactor · M–H · split per sheet)

As in the 21E plan, with a ratchet:
- the literal-colour count per legacy sheet (`App.css` 275, `platform.css` 314, `structured-builder.css` 249, interactive
  families, and the learning sheets `activities.css`, `visuals.css`, `cli.css`, `reader.css`) may only go down;
- breakpoints are consolidated;
- 200 % text-scaling and browser-side accessibility sweeps across every template.

**Acceptance (measurable):**
- **21E.6-1:** a ratchet test fails if any listed sheet's literal-colour count rises above its recorded value.
- **21E.6-2:** each retired block shows a pixel-equivalent BEFORE / AFTER at 4 viewports, or a documented intended difference.
- **21E.6-3:** a final sweep at 200 % over every §1 route finds **0** overflow and **0** focus-ring failures.

### 4.4 Priority summary

| Order | Phase | Priority | Classification | Complexity | Blocked by |
|---|---|---|---|---|---|
| 1 | L1 library + course home | P0 | visual | M | none (D1: starts now) |
| 2 | L2 reader shell + comfort | P0 | visual + FE functional | M–H | none (D1: starts now, in parallel with L1 or after it) |
| 3 | L5 release board | P1 | visual + FE functional | M | L1 |
| 4 | L3 search | P1 | FE functional | M | L2 |
| 5 | 21E.4 grading / results / analytics | P1 | visual | M | #303 (results), #307 (lists) |
| 6 | 21E.5 interactive families | P1 | visual | M–H | #303 |
| 7 | 21E.9 student portal sections | P1 | visual | M | #303 |
| 8 | L4 progress / bookmarks | P1 | **backend** + FE functional | H | L2; design record approved; #303 for the portal UI |
| 9 | L7a / L7b explore-only embeds | P1–P2 | FE functional + content model | M | L2 (L7a); #303 (L7b) |
| 10 | 21E.7 import / reviews / tools | P2 | visual | M | #304–#307 |
| 11 | 21E.8 legacy exam page + login | P2 | visual + markup | M–H | #304–#307 |
| 12 | L6a original page view | P2 | **backend** + assets | H | owner's written rights confirmation |
| — | L6b video | future | **backend / hosting** + FE | H | rights per video; hosting decision |
| 13 | 21E.6 retirement + certification | P2 | CSS refactor | M–H | all of the above |

### 4.5 Evidence standard for every phase

As practised in #305–#308:
1. a Chromium harness that runs the same checks on the BEFORE tree and the AFTER tree at the viewports defined in §4.3;
2. behavioural checks first (answers, navigation, restrictions, data), then visual and accessibility checks (names, focus
   ring, ≥ 44 px, overflow, reduced motion);
3. guard tests on each new sheet, including pins that pass on `main`;
4. a few planted defects per slice instead of broad mutation campaigns. Backend phases (L4, L6a) also get mutation proof for
   their authority and idempotency checks (`AGENTS.md` §9);
5. **the preservation gate P-1…P-7 (§5, D7)**;
6. exact-head CI recorded in the PR body; no merge by agents.

## 5. Owner decisions (recorded 2026-10-13)

The owner approved the direction of this audit with the following decisions. They replace the open questions of the earlier
draft.

| # | Decision | Effect on the roadmap | Verified by |
|---|---|---|---|
| **D1** | **Begin with L1 (Learning Library) and L2 (Reader UX)** while #303–#307 are completed separately by their own sessions. | L1 and L2 are orders 1–2 and start without waiting for #303–#307. No file of #303–#307 is edited. | P-7 |
| **D2** | **Server-backed reading progress across devices, with safe local offline continuity.** Completion is defined by meaningful reading / activity criteria, not page opening alone. | L4 is a backend + UI phase with the progress model, offline queue and integrity boundary in §4.3. Progress never feeds grades or Study Strength. | L4-1…L4-9 |
| **D3** | **Original PDF viewing, and video as a future capability**, subject to content rights and existing infrastructure. | L6a (page view through an access-checked route in the existing Blob account) after the owner's written rights confirmation. L6b is defined now and built when hosting and rights are settled. | L6a-1…5, L6b-1…6 |
| **D4** | **Title / keyword search first, with a clean upgrade path to full-text.** | L3 builds the `SearchProvider` interface. Full-text is a later provider, with no UI change. | L3-1…L3-7 |
| **D5** | **3D and SmartSim may be embedded in educational pages in explore-only mode**, completely isolated from graded exam answers. | New phase L7 (L7a Scene3D, L7b SmartSim), with the isolation rules in §4.3. | L7-1…L7-6 |
| **D6** | **One premium Arabic-first RTL design system across the entire platform, including educational content.** | §3.2 applies to the reader, the library, the release board and every learning content block (`activities.css`, `visuals.css`, `cli.css`, `reader.css`), not only to the teacher and exam surfaces. 21E.6's ratchet includes the learning sheets. | D6-1…D6-5 |
| **D7** | **Preserve all existing 28 modules, 248 pages, exercises, publishing permissions and student access restrictions.** | The preservation gate below is part of every phase's acceptance. | P-1…P-7 |

**D6 acceptance (every phase that adds or changes a sheet):**
- **D6-1:** colours, spacing, radii, shadows, type sizes and z-index come from `--eb-*` tokens only (guard test per sheet).
- **D6-2:** layout uses logical properties only, so RTL is the default and LTR islands (code, numbers, CLI) are explicit
  `dir="ltr"`.
- **D6-3:** one Arabic font stack and the reading tokens (`--eb-measure`, `--eb-read-fs-1…3`, `--eb-read-lh`) are defined once in
  `design-tokens.css` and used by every learning sheet.
- **D6-4:** the shared recipes of §3.2 (card, toolbar, stage, status pill, empty state, progress) are reused, not re-implemented
  per surface. A reviewer checks this against the recipe list.
- **D6-5:** the literal-colour ratchet (21E.6-1) never rises.

**Preservation gate (D7), required in every phase:**
- **P-1, modules and pages:** the manifest still has **28 modules and 248 pages**. The ordered list of page ids is byte-identical
  to `main` (hash recorded in the PR). The existing 248-page ordinal tests (`learningPractice.t05-f06`) pass.
- **P-2, reachability:** every page 1…248 opens through the reader's page navigation, and every module through the TOC (unit
  test over the whole manifest; Chromium spot check of the first, middle and last page of each section).
- **P-3, content untouched:** visual phases change **0** files under `src/learning/content/**`. Functional phases change only the
  files their scope names (new block types, validation), and every existing content validation test passes.
- **P-4, exercises:**
  - every practice, activity, guided, CLI and library-training block renders;
  - the learning-study key index (eligible activities per module) is byte-identical;
  - Study Strength stays 28 modules × 20 = 560;
  - T01–T04 open and return.
- **P-5, publishing permissions:**
  - only a teacher session can publish / hide modules;
  - an archived class stays read-only;
  - the class-learning-materials API tests pass unchanged.
- **P-6, student restrictions:**
  - a student sees only published modules in the library, TOC, reader, search (L3), progress (L4), page view (L6a) and embeds
    (L7);
  - every new route applies `classCanSeeLearningModule`;
  - `restrictedContentApi` and `LearningReader.restricted` tests pass;
  - a planted defect that removes the restriction filter is KILLED in each phase that touches a listing.
- **P-7, coordination (D1):** at branch start and before review, a merge-base diff shows **0** files shared with the open heads of
  #303–#307. The PR records the heads checked.
