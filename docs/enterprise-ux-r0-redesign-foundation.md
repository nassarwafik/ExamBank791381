# Phase UX-R0 — Platform redesign programme: foundation and guard rails

**Owner direction (2026-10-20):**
- the teacher and student pages take the look of the owner's reference screen (a light, quiet "settings" layout: white sidebar
  with grouped outline-icon links, a top bar with a wide rounded search, a text sub-navigation beside the content, hairline cards
  of 44 px rows — icon, name, muted type, inline action — grouped popover menus, a dark tooltip, a deep purple primary button);
- the deep purple primary is approved (replaces the blue `#2563eb`);
- the four mockups in [`docs/ux-r/mockups/`](ux-r/mockups/) are the approved reference;
- the phase plan below is approved; R0 starts now. Every later phase is its own branch, pull request and owner merge.

This document is the programme's design record. Each UX-R phase appends its own section (edit set, evidence, before / after
captures) here or, for a large phase, in a sibling `docs/enterprise-ux-r<N>-*.md` that links back to this one.

## 1. Baseline

| Item | Value |
|---|---|
| `origin/main` at start | `56ce0972172c3efc964230b57ca7feab2815cc8e` (merge of PR #388) |
| Working branch | `claude/magical-goodall-2c5ho2` (the branch assigned to this session) |
| Working tree | clean; no merge / rebase / cherry-pick in progress; no stash |

## 2. What R0 changes — and what it does not

R0 ships **no product code**. Nothing under `src/` changes; no page looks different after R0.

**Edit set:**
- `docs/enterprise-ux-r0-redesign-foundation.md`: this record (new).
- `docs/ux-r/mockups/`: the approved reference mockups. Static HTML/CSS with demo data, plus 1440 px renders (`*.png`). They use
  the platform's own font from `public/fonts/` and are never built or shipped (new).
- `scripts/capture-visual-baseline-ux-r.mjs`: before / after capture of every redesigned page in real Chromium (new).
- `browser-harness/ux-r-gallery.html` and `.tsx`: the component gallery: every `src/ui` primitive on the production stylesheets (new).
- `scripts/ux-color-inventory.mjs`, `scripts/ux-color-inventory.baseline.json`, `scripts/ux-color-inventory.test.mjs`: the
  colour inventory and its ratchet (new).
- `.gitignore`: `.harness-ux-r/` (the capture output).

**Unchanged:** components, stylesheets and tokens; exam JSON, question types and version families; grading, persistence, API and
Runner; every existing test.

## 3. The approved design language

### 3.1 Token proposal for R1

These values come from the mockups. R1 writes them into `src/design-tokens.css` under the existing `--eb-*` names, so every
stylesheet that already uses a token follows. The contrast figures below are WCAG 2.x ratios, computed for R0.

| Role | Mockup value | R1 value | Contrast (worst surface) | Notes |
|---|---|---|---|---|
| Heading ink (`--eb-navy`, `--eb-text-heading`) | `#1c1330` | `#1c1330` | 14.4 : 1 on primary tint | purple-tinted near-black |
| Body text (`--eb-text`, `--eb-ink`) | `#2d2740` | `#2d2740` | 11.6 : 1 | |
| Muted text (`--eb-muted`) | `#6c6879` | **`#5f5a6e`** | 5.37 : 1 on primary tint | mockup value is 4.38 : 1 on the tint (below AA); the existing guard `src/designSystem/mutedContrast.21e1s2.test.ts` requires ≥ 4.5 : 1 |
| Faint (`--eb-faint`) | `#a9a5b4` | `#a9a5b4` | 2.4 : 1 | **decorative only** (drag grip, dividers); never text or a meaningful icon |
| Hairline (`--eb-line`) | `#e9e8ee` | `#e9e8ee` | — | card border, row separators |
| Hover / active / field fill | `#f5f4f8` / `#eeedf3` / `#f3f3f6` | same | — | nav active pill, sub-nav active, search field |
| Primary (`--eb-primary`) | `#2a0a4e` | `#2a0a4e` | white on it 16.8 : 1 | buttons, active chart series, tooltip |
| Primary tint (`--eb-primary-050/-100`) | `#ebe5f4` | `#ebe5f4` | — | avatars, workspace icon, focus halo |
| Chart secondary / pale | `#8b74b8` / `#d9cfea` | same | 3.97 : 1 / — on white | non-text series (≥ 3 : 1 where meaning depends on it) |
| Success / warn / danger text on their tints | `#1d7a4b` / `#9a5a00` / `#b42318` | same | 4.76 / 4.98 / 5.75 : 1 | status tags |
| Radius | 6 px (controls, popovers), 8 px (cards) | `--eb-r-xs` 6, `--eb-r-sm` 6, `--eb-r` 8 | — | replaces the 10–20 px scale |
| Popover shadow | `0 10px 28px -6px rgba(28,19,48,.18), 0 2px 6px rgba(28,19,48,.06)` | `--eb-sh-md` | — | cards themselves are flat (border only) |

### 3.2 Pattern catalogue

R3 builds these patterns as `src/ui` components. Pages use them from R4 on.

| Pattern | Mockup reference | Rule |
|---|---|---|
| **Top bar** (58 px) | every mockup | menu button · brand · context pill · wide rounded search field · help · notifications · avatar |
| **Sidebar** (≈ 222 px, white) | every mockup | workspace header (school · term); link groups separated by 1 px hairlines; 14 px / 600 links, active = grey pill; footer group (activity log, settings) |
| **Sub-navigation** | students, assignments, reports | plain text list of 14 px / 500 links, active = grey pill and 600; optional small group labels; counts muted on the end side |
| **Card + list row** | all | 1 px hairline border, 8 px radius, no shadow; card title 15.5 px / 700; row ≥ 44 px, separated by hairlines: [grip] · icon · name (15 px / 500) + muted context · muted type (12 px) · status tag · inline action (pencil + «تعديل» / «فتح») |
| **KPI strip** | dashboard, reports | one card split into cells by vertical hairlines; label 12.5 px muted · value 26 px / 700 · delta line |
| **Segmented control** | dashboard, reports | bordered group, active segment = grey fill + 600 |
| **Cascading popover** | students, assignments | white, 6 px radius, soft shadow, item groups separated by hairlines, highlighted item = hover fill, end chevron for a sub-menu, inline name field with a soft purple focus halo, primary «إنشاء» |
| **Tooltip** | students, assignments | primary fill, white 12 px text, 6 px radius |
| **Tag** | all | 11.5 px / 600 pill on the semantic tint |

## 4. Phase plan

The work is done in this order. R0–R3 run in sequence. After R3, at most two pages run in parallel: `App.css` and
`platform.css` are shared, and every extra parallel phase adds reconciliation merges.

| # | Phase | Scope | Deliverables | Size | Depends on |
|---|---|---|---|---|---|
| R0 | Foundation and guard rails | `docs/`, `browser-harness/`, `scripts/` | this record, approved mockups, visual baseline harness, component gallery, colour ratchet | M | — |
| R1 | Tokens v2 | `src/design-tokens.css`, the `--bp-* / --pp-* / --lg-*` aliases | §3.1 values; light navigation tokens; AA verified by the existing guards | S | R0 |
| R2 | App shell | `shell/TeacherAppShell.tsx`, `shell.css`, `teacher-nav-21e.css`, `StudentShell`, `StudentMobileNav` | white sidebar with groups and workspace header; top bar; compact rail (1024–1279) and drawer (< 1024) kept; student top bar | L | R1 |
| R3 | Component kit | `src/ui/*` + new components | ListRow, SubNav, hairline Card, KpiStrip, Segmented, Tooltip, cascading popover (`ActionMenu`), buttons, tables, Chart.js theme | L | R2 |
| R4 | Dashboard | `TeacherDashboard.tsx`, `teacher/TeacherTodayHub`, `dashboard-pro.css`, `teacherToday.css`, `charts/` | mockup «لوحة المتابعة» | M–L | R3 |
| R5 | Classes and students | `students/*` | classes as sub-nav, roster as rows, «إضافة طالب» popover; printed login cards unchanged | M | R3 |
| R6a | Assignments: list and wizard | `AssignmentsPanel.tsx` (home, wizard, export), `assignments/*`, `assignments-pro.css` | sub-nav (current / scheduled / ended / drafts), assignment rows, «واجب جديد» popover | L | R3 |
| R6b | Assignments: gradebook and grading | gradebook / grading / reports sections | quiet tables, status tags, progress bars; **no grading logic change** | M | R6a |
| R7 | Reports and statistics | `reports/*`, `reports-pro.css` | report catalogue as sub-nav, KPI strip, themed charts; print / CSV / XLSX unchanged | M | R3 |
| R8 | Messages | `messages/*` (teacher and student) | thread list as rows, quiet bubbles, unified composer | M | R3 |
| R9a | Learning: library | `learning/LearningMaterialsPage`, library, course home | library, courses and search | L | R3 |
| R9b | Learning: reader and practice | `learning/reader`, `study`, `practice`, `training`, `activities` | reader chrome and tools; diagram content unchanged | L | R9a |
| R10 | Projects | `projects/*`, `projects-pro.css` | hub, tracker, student detail; heatmap and charts on the theme palette | L | R3 |
| R11a | Exam bank and surroundings | `bank-pro.css`, `BankQuestionPicker`, `ImportQuestionsPanel`, `smart-import.css`, `GovernancePanel`, `AuditHistoryPanel` | bank, import, review inbox, activity log | L | R3 |
| R11b | Exam builder | `studio/*`, `builder-pro.css`, `structured-builder.css`, `structured-cover.css`, `ExamPreview` | builder chrome, outline, inspector, publish; focus mode kept | L | R11a |
| R12 | Grading and review workspaces | `AssignmentReview.tsx`, `review-pro.css`, `review-workspace.css`, `review/` | presentation only; **grading logic and `reviewRequired` untouched** | M | R6b |
| R13 | Learning games | `games/*` | teacher and student game pages | S–M | R3 |
| R14 | Student portal | `StudentPortal.tsx`, `student/*`, `studentportal-pro.css` | today, tasks, progress, achievements, ranks, identity card; phone first | L | R2, R3 |
| R15 | Student exam experience | `StudentExamPage.tsx`, `student/exam`, `studentexam-pro.css`, `questionTypes/` frame | exam frame, navigator, question card, save state; simulators: frame only | L | R14 |
| R16 | Login and public pages | `login-pro.css`, student login, `pwa/`, `ErrorBoundary`, empty states | login screens, install card, error pages | S | R1 |
| R17 | Clean-up and final audit | all stylesheets | remaining literals → tokens (ratchet towards zero), dead CSS removed, consistency, accessibility (keyboard, focus, contrast), RTL / phone / print, final "after" captures | M | all above |
| R18 | Optional features (each only on an owner decision) | new behaviour | real global search; drag reorder where it is persisted server-side; dark mode | per feature | R17 |

```
R0 → R1 → R2 → R3 ─┬─ R4 → R5 → R6a → R6b → R12
                    ├─ R7 → R8 → R13
                    ├─ R9a → R9b → R10 → R11a → R11b
                    └─ R14 → R15 → R16
                                      ↓
                                    R17 → (R18)
```

## 5. Per-phase protocol and definition of done

Every phase follows the canonical loop in `AGENTS.md` §3:

1. Baseline gate.
2. Branch.
3. Implementation, presentation only.
4. Focused tests.
5. Full validation: `npm test`, `npm run lint`, `npx tsc -b`, `npm run build` with the bundle guard, `git diff --check`.
6. Before / after captures with `scripts/capture-visual-baseline-ux-r.mjs`, attached to the PR.
7. Exact-head CI.
8. Independent review.
9. Owner merge.

The `Build and Deploy Job` preview environment of each PR, when that job succeeds, lets the owner see the real result before merging.

**Tests that pin the old look.** Some guards pin the current look, for example sidebar spacing, shell layers and the learning
layout. When a phase changes such a look on purpose, it updates the guard **explicitly** and says so in its PR. The invariant a
guard protects stays protected: layer order, contrast, focus visibility, no horizontal overflow. No test is skipped or weakened.

**A page is done when:**
- [ ] it uses the §3.2 patterns: hairline cards, 44 px rows, sub-nav where the page has inner navigation, grouped popovers, dark
  tooltip, purple primary;
- [ ] it has no colour literal in its stylesheets: its ratchet count is lowered in the same commit;
- [ ] every text passes AA contrast, the focus ring is visible, and the page is fully usable by keyboard;
- [ ] RTL is correct, the phone (390) and tablet (1024) layouts work with no horizontal overflow, and print is unaffected;
- [ ] its "after" capture matches the approved mockup's language when set side by side with its "before" capture.

## 6. R0 tooling — how each phase uses it

### 6.1 Visual baseline capture

```bash
npm run build                                   # or DIST=<a build of the baseline> for "before"
PLAYWRIGHT_CORE_DIR=<dir with playwright-core> CHROMIUM_PATH=<chromium> \
  LABEL=before node scripts/capture-visual-baseline-ux-r.mjs        # PAGES=… VIEWPORTS=desktop,tablet,phone PART=pages|gallery|all
```

The script serves a production build against a local mock of the platform API (demo payloads in the shapes the components read;
no token, nothing deployed, service workers blocked, reduced motion).

**Pages captured:**
- every teacher sidebar destination: لوحة المتابعة, المواد التعليمية, الصفوف والطلاب, الواجبات, الرسائل, المشاريع, التقارير,
  الألعاب التعليمية, بنك الامتحانات, استيراد من ملف, مراجعات النشر, سجل النشاط;
- the student portal;
- the login screen.

**Viewports:** 1440 × 900, 1024 × 768 and 390 × 844 (touch).

**Output:** `.harness-ux-r/<label>/<viewport>/<page>.png` and `record.json`. The record holds, per capture, whether the page
was reached, its horizontal overflow and its page errors.

`PART=gallery` builds `browser-harness/ux-r-gallery.html` from the checked-out source with the repository's Vite config and
captures the component kit, closed and with the action menu open. For a "before" gallery, run it from a worktree of the baseline.

### 6.2 Colour ratchet

`node scripts/ux-color-inventory.mjs` lists the colour literals in the stylesheets: `#hex`, `rgb()`/`rgba()`, `hsl()`/`hsla()`.
It reads declaration values only. Comments, selectors such as `#add-button` and `url(#…)` are not colours.

`scripts/ux-color-inventory.test.mjs` is part of the root `npm test`. It enforces two rules:
- a stylesheet's count may only stay or go down;
- a stylesheet outside the baseline must have none.

A phase that converts literals lowers the baseline with `--write` in the same commit.

**Baseline at R0:** **2 477 literals in 62 of 99 stylesheets** (`src/design-tokens.css`, the token source, is not counted).

| Stylesheet | Literals |
|---|---|
| `src/platform.css` | 337 |
| `src/App.css` | 301 |
| `src/structured-builder.css` | 253 |
| `src/meshModels/mesh-model.css` | 86 |
| `src/physicsMotion/motion.css` | 64 |
| others (57 files) | 1 436 |

The simulator stylesheets (physics, chemistry, mesh models, network topology) draw scientific content. Their literals are
converted only where they style chrome, not the content itself.

The earlier estimate of "about 1 042" given in the planning conversation counted top-level `#hex` only. The figure above is the
measured one.

## 7. Baseline findings recorded by R0 (not fixed in R0)

The R0 capture of the baseline build (`56ce097`) found three pages that overflow horizontally on a 390 px phone:

| Page | `scrollWidth` > `clientWidth` | Assigned to |
|---|---|---|
| الصفوف والطلاب | 391 > 390 | R5 |
| بنك الامتحانات | 458 > 390 | R11a |
| استيراد من ملف | 405 > 390 | R11a |

The other 39 page captures were clean: reached, no overflow, no page error. These three are defects in the current pages. R0
ships no product code, so each one is fixed in the phase that redesigns its page, with this capture as its fail-first evidence.

## 8. Risks

| Risk | Handling |
|---|---|
| 2 477 colour literals | the ratchet stops growth from R0 on; each page phase converts its own; R17 sweeps the rest |
| guards that pin the current look | explicit, reasoned updates in the phase that changes the look; protected invariants kept (§5) |
| the documented timing-sensitive `src/GovernancePanel.14b.test.tsx` | not patched inside unrelated phases; one re-run, a second failure is real (`AGENTS.md` §12) |
| bundle budget | new components are small and dependency-free; the bundle guard runs on every phase |
| simulators and scientific diagrams | frame / chrome only; content colours unchanged |
| print outputs (login cards, reports) | print styles untouched; checked in the phases that own them |
| the muted-text mockup value fails AA on the tint | R1 uses `#5f5a6e` (§3.1) |

## 9. R0 evidence

### 9.1 Fail-first
Not applicable. R0 fixes no defect and changes no product behaviour. The three phone-overflow defects of §7 are recorded,
reproducibly, by the capture on the baseline build. Their fixes, and the fail-first runs for them, belong to R5 and R11a.

### 9.2 Mutation proof of the colour ratchet

Each mutant is applied, the ratchet suite is run, and the file is restored byte-for-byte. Restoration is verified by SHA-256 (a
created file is verified absent), and `git status` is clean afterwards.

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | a literal colour appended to `src/App.css` (an existing stylesheet grows) | KILLED | «no stylesheet gained hard-coded colours» |
| M2 | new stylesheet `src/ux-r-probe.css` with `rgba(…)` | KILLED | «a stylesheet outside the baseline … has no hard-coded colours» |
| M3 | counter stops skipping selector pieces | KILLED | «does not count id selectors, pseudo-classes or url fragments as colours» |
| M4 | counter stops stripping comments | KILLED | «ignores a comment written inside a declaration value» |

M3 and M4 **survived** the first run: the counter tests had no selector containing a hex-like id after a colon, and no comment
inside a value. Two cases were added. The second run killed all four.

### 9.3 Harness runs on the baseline build
- `PART=pages`: 42 captures (14 pages × 3 viewports); 39 clean, 3 overflow findings (§7).
- `PART=gallery`: 3 captures; 10 sections each, no page error; the action menu opens.
- The gallery source typechecks with the app's `tsconfig.app.json`. A temporary config was used for this run; the harness folder
  is not part of `tsc -b`, as with the other harness files.

### 9.4 Local validation on the head
All runs on a 4-core container.

| Check | Result |
|---|---|
| `npm run lint` | exit 0. The new files add only the `only-export-components` warnings that every `browser-harness/*.tsx` page already has; the mockup script is clean |
| `npx tsc -b` | exit 0 |
| `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| `npx vitest run scripts/ux-color-inventory.test.mjs` | 7 / 7 |
| `npm test`, full root suite | **1 failed / 13 931 passed** (1 168 files) on each of three head runs. A different timing test failed across the runs: run 1: `src/TeacherPlatform.createClass.d3.test.tsx` (a `findByRole` past its 1 000 ms default at 1 146 ms, while lint / tsc / Chromium also ran); run 2: the same test at 1 258 ms with the machine otherwise idle; run 3: `src/studio/idleSave.21f8.test.tsx`, with d3 passing |
| the two failing files in isolation | 3 / 3 green each |
| `npm test` on a worktree of the baseline `56ce097` | 1 167 / 1 167 files, 13 925 / 13 925 tests |

**Why these failures are not R0's.** R0 changes **no file under `src/`** (`git diff origin/main -- src` is empty), so both tests
run byte-identical code at baseline and head. Under full-suite load, each misses its own wall-clock window by about 150–250 ms,
and a different one misses in different runs. Neither is the documented flaky test. Per `AGENTS.md` §12, they are recorded here
and **not patched inside this phase**; the exact-head CI run is the arbiter. If either fails in CI, it goes to the owner as its own
hardening item. Changing a timeout here would be out of scope and is forbidden.

### 9.5 Deployment tier
- Tier 1: local tests and harness runs.
- Tier 2: CI on the PR head.
- Tier 3: the `Build and Deploy Job` creates a PR preview only if it succeeds. R0 changes no page, so a preview would look like
  `main`.
- No production or Runner deployment.
