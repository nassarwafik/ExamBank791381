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
| Faint (`--eb-faint`) | `#a9a5b4` | `#a9a5b4` | 2.4 : 1 | **decorative only** (drag grip, dividers); never text or a meaningful icon. Owner decision 2026-10-20, in R1: it takes the lavender value. It is lighter than the UX-8b `#94a3b8`, so the UX-8b rule «never darkened» still holds and is now checked as an invariant |
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
| R16a | Content colours: science simulators | `physicsMotion/`, `physicsFreeFall/`, `physicsLab/`, `chemistryStructure/`, `chemistryReactions/`, `chemistryLab/`, `meshModels/`, `functionSurfaces/`, `interactive3d/` | the sheets' literals (≈ 495, mostly slate neutrals) → a content-token family on the purple-neutral palette; before / after captures of every simulator; legibility checked (text AA, strokes and grids ≥ 3 : 1 on their ground); **no change to what a simulator computes, grades or stores** | L | R3 |
| R16b | Content colours: network, coding and rich-content editors | `networkTopology/`, `networkTopology2/`, `networkCli/`, `coding/` (incl. `workspace/`, `codingTemplate.css`), `visual/`, `richContent/`, `openResponse/`, `inlineCloze/`, `composite/`, `scenario/`, `parametric/`, `charts/` editors | the same content tokens (≈ 440 literals); a CLI and code keep their dark, LTR, monospace surfaces; status tones (✓ / ✗ / pending) stay; **no grading, key or stored-data change** | L | R16a |
| R16c | Function-graph and chart series colours | `functionGraphs/function-graph.css`, `functionGraphs/graph-editor.css`, the chart / graph selection reviews | the six stored series indices (`style.color` 1–6 in question data) keep their meaning; only the palette behind them moves to the theme's series order (purple first). Each pair of series must stay distinguishable (also for colour-blind readers), every series ≥ 3 : 1 on the plot, labels AA. **Stored question data is untouched** | S–M | R3 |
| R16d | Exam presentation presets | `presentation/presentationModel.ts` (`PRESENTATION_PRESETS`), `presentation/presentation-studio.css`, `presentation/presentation.css` | **owner decision first** (§4.1): a preset's colours reach every exam that already uses it, published ones included. Every preset keeps passing the existing WCAG policy (it blocks finalization); stored exams keep resolving (an unknown id still falls back to the safe default); no schema change | S–M | R15, owner decision |
| R17 | Clean-up and final audit | all stylesheets | remaining literals → tokens (ratchet towards zero), dead CSS removed, consistency, accessibility (keyboard, focus, contrast), RTL / phone / print, final "after" captures | M | all above (incl. R16a–R16d) |
| R18 | Optional features (each only on an owner decision) | new behaviour | real global search; drag reorder where it is persisted server-side; dark mode | per feature | R17 |

```
R0 → R1 → R2 → R3 ─┬─ R4 → R5 → R6a → R6b → R12
                    ├─ R7 → R8 → R13
                    ├─ R9a → R9b → R10 → R11a → R11b
                    ├─ R14 → R15 → R16
                    │           └──────── R16d (owner decision)
                    └─ R16a → R16b    R16c
                                      ↓
                                    R17 → (R18)
```

### 4.1 Content colours (owner direction, 2026-10-21)

The owner asked to bring into the plan the three areas §R1 had left out: the simulators' and diagrams' own colours, the function-
graph series colours, and the exam presentation presets. Measured on `main` `6da77067` with `scripts/ux-color-inventory.mjs`, the
content sheets of R16a–R16b hold **≈ 935 of the 2 266 remaining literals**; R16c's two sheets hold 55 and the presentation studio 39
(the presets themselves are hex values in `presentationModel.ts`, outside the stylesheet count). Rules shared by the four phases:
- **Presentation only.** No simulator, grader, answer key, stored question, stored exam or API changes; a colour that carries a
  state (correct / wrong / pending, a selected target, a fault) keeps its meaning and stays distinguishable.
- **Legibility is measured, not assumed:** text AA (4.5 : 1, 3 : 1 for large text), strokes, grids and series ≥ 3 : 1 on their
  ground, focus rings unchanged; every changed simulator is captured before / after at 1440 / 1024 / 390 px.
- **Each phase lowers the colour ratchet** for the sheets it converts, as every page phase does.

**R16d needs an owner decision before it starts**, because presets are teacher-chosen themes that published exams already use:
- **Option A (recommended):** add one new code-owned preset in the reference palette and make it the default for **new** exams
  only. Existing presets keep their ids and colours, so every existing exam keeps its look.
- **Option B:** retune `default` (and the blue presets `modernAcademic`, `compact`) to the purple palette. Every exam that uses them
  changes look, published ones included.
- Either way the WCAG policy, the fallback rule and the schema stay as they are.

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

---

# Phase UX-R1 — Tokens v2 (the purple palette)

**Owner direction (2026-10-20):** start R1 now, on a new branch stacked on R0 (`feature/ux-r1-tokens` from `70059d5`), with a
separate pull request. Merge order: R0 (PR #390), then R1.

## R1.1 Scope

R1 changes the **look of every page**, and nothing else. No markup, component, data, API or grading change. Every edit is a
colour, radius or shadow value, or replaces a literal with a token.

## R1.2 Edit set

**Tokens:**
- `src/design-tokens.css`: §3.1 values under the existing names. New tokens: `--eb-primary-200`, `--eb-primary-300` and
  `--eb-nav-accent`.
- `--eb-primary-strong` is now the **hover / pressed** step: a lighter purple `#4a2380`. On a near-black primary, a darker step
  would be invisible.

**The rail:**
- `src/shell.css` and `src/shell/teacher-nav-21e.css`: the active pill of the dark rail is tinted with `--eb-nav-accent` instead
  of `--eb-primary`. The deep purple would vanish on the dark rail.
- The rail itself stays dark, re-tinted to the purple ink family, until R2 makes it light.

**Blue literals → tokens (179 replacements in 19 stylesheets):**
- Mapping:
  - `#2563eb` → `--eb-primary`
  - `#1d4ed8` / `#1e40af` / `#1e3a8a` / `#1f4fb0` → `--eb-primary-strong`
  - `#eef4ff` / `#eff6ff` → `--eb-primary-050`
  - `#e4edfc` / `#dbeafe` → `--eb-primary-100`
  - `#bfdbfe` / `#93c5fd` → `--eb-primary-200`
  - `#60a5fa` / `#3b82f6` → `--eb-primary-300`
  - `rgba(37,99,235,a)` → `color-mix(in srgb, var(--eb-primary) a%, transparent)`, and the same for the other two blues
- Also replaced: the fallback of a variable **nothing defines**, such as `var(--accent, #1d4ed8)` in the question-type tabs and
  the SmartSim drop zone. That fallback is what renders.
- Left as is: a fallback of a variable that is defined, such as `var(--eb-primary, #2563eb)`. It never renders.
- Stylesheets: `App.css` (60), `platform.css` (70), `login-pro.css` (10), `structured-builder.css` (6), `structured-cover.css`
  (6), and 14 others with 1–3 each.

**Copies of token values in code:**
- `src/projects/chartPalette.ts`: its fallback colours are equal to the tokens again.
- `src/avatars.tsx`, `src/ui/ProfileAvatar.tsx` and `src/ErrorBoundary.tsx`: the default avatar colour and the reload button read
  `var(--eb-primary, #2a0a4e)` instead of a blue literal.

**`--eb-faint`, an owner decision:** `--eb-faint` is pinned in `api/tests/ux2-shell-foundation.test.js` as a recorded owner
decision (UX-8b: «the token itself is NOT darkened»).
- The first R1 run set the mockup's `#a9a5b4`, and that pin failed. The value was put back to `#94a3b8`, and the choice was put to
  the owner.
- On 2026-10-20 the owner approved `#a9a5b4`, in a Review Fix-style commit on this PR. That commit:
  - sets the token;
  - updates the pin, with both decisions recorded in its comment;
  - turns the UX-8b rule into a checked invariant: the luminance must stay ≥ that of `#94a3b8`, so the token is never darkened;
  - renames the test from «unchanged» to «never darkened»;
  - updates the chart fallback copy and the R1 palette pin.
- A mutant that darkens the token to `#7c8799` is KILLED by both tests.

**Ratchet:** `scripts/ux-color-inventory.baseline.json` lowered from 2 477 to **2 298** literals.

**New tests:**
- `src/designSystem/tokensV2.ux-r1.test.ts` (27 tests): pins, AA contrast, no rendered old blue, no undefined token.
- `src/projects/chartPalette.tokenMirror.ux-r1.test.ts` (9 tests).

**Deliberately not in R1:**

| Item | Why | Phase |
|---|---|---|
| ≈ 540 slate neutral literals (`#64748b`, `#0f172a`, `rgba(15,23,42,…)` …) in 38 sheets | many draw simulator / diagram content. The difference from the new lavender-greys is subtle and needs per-page judgement | each page phase; the simulator and diagram sheets in R16a–R16b (§4.1); the rest in R17 |
| Chart.js palettes (`src/charts/chartTheme.ts`, dashboard chart colours in `TeacherDashboard.tsx`) | the charts still draw in blue | R3 (theme) and R4 |
| the login illustration SVG in `App.tsx` | page art | R16 |
| the studio top bar's own navy / teal palette (`--st-*`) | pinned by its own contrast tests; part of the builder redesign | R11b |
| the reader's light island inside its dark theme (`reader-enterprise-l1.css`) | literal copies of the old light tokens | R9b |
| the function-graph colours, the exam presentation presets | content and teacher-chosen themes | R16c and R16d (added to the plan by the owner, §4.1) |

## R1.3 Fail-first evidence

`src/projects/chartPalette.tokenMirror.ux-r1.test.ts` compares the project charts' fallback colours with `design-tokens.css`:
- **On the baseline `56ce097`:** 1 failed / 8 passed. `--eb-muted` expected `#475569` (the token since 21E.1 slice 2), received
  `#64748b`. This copy had already drifted before R1, with no test to catch it.
- **On the R1 head before the fix:** 5 failed. `--eb-primary`, `-strong`, `--eb-line-2`, `--eb-faint` and `--eb-muted` all still
  held the old values. `--eb-faint` was then put back to `#94a3b8`, and the owner later approved `#a9a5b4` (see R1.2); the copy follows the token.
- **After the fix:** 9 / 9.

## R1.4 Pre-existing defects found by the R1 guard (recorded, not fixed here)

Seven stylesheet reads use an `--eb-*` token that nothing defines, so the browser drops the declaration today. Defining them would
change those pages' look, so each is left to the phase that owns the page. The guard lists them by name, and the list may only
shrink.

| Stylesheet | Undefined token | Phase |
|---|---|---|
| `games/games.css` | `--eb-font-mono` | R13 |
| `learning/activities/activities.css` | `--eb-fs-18` | R9b |
| `learning/visuals/visuals.css` | `--eb-font-mono` | R9b |
| `projects/performance.css` | `--eb-fs-15` | R10 |
| `projects-pro.css` | `--eb-fs-15` | R10 |
| `studentexam-pro.css` | `--eb-text-muted` | R15 |
| `studentexam-pro.css` | `--eb-fs-sm` | R15 |

## R1.5 Mutation proof

Each mutant was run against:
- `src/designSystem/tokensV2.ux-r1.test.ts`;
- `src/projects/chartPalette.tokenMirror.ux-r1.test.ts`;
- `src/designSystem/mutedContrast.21e1s2.test.ts`;
- `scripts/ux-color-inventory.test.mjs`.

After each run the file was restored byte-for-byte (SHA-256-verified), and `git status` was clean afterwards.

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | `--eb-primary` back to `#2563eb` | KILLED | palette pin; "primary and primary-strong as link text…"; the chart mirror test |
| M2 | `--eb-nav-text-muted` darkened to `#6b6380` | KILLED | "the dark rail: labels ≥ 7:1, secondary labels and the accent ≥ AA…" |
| M3 | bare `#2563eb` re-added to `App.css` | KILLED | colour ratchet; "bare literals and fallbacks of undefined variables are gone" |
| M4 | `shell.css` reads a misspelt `--eb-nav-acent` | KILLED | "no stylesheet reads an undefined --eb-* token beyond the recorded…" |
| M5 | chart fallback primary left at `#2563eb` | KILLED | chart mirror test `--eb-primary` |
| M6 | hover step equal to the primary | KILLED | pin; "the hover step stays visibly distinct from the primary" |
| M7 | placeholder lightened to `#8a8696` | KILLED | pin; "placeholder text on white and on the hover fill" |
| M8 | `var(--accent,#1d4ed8)` re-added to `questionTypes.css` | KILLED | colour ratchet; "bare literals and fallbacks of undefined variables are gone" |

## R1.6 Visual evidence

`scripts/capture-visual-baseline-ux-r.mjs` was run on the R1 build: 14 pages × 3 viewports, plus the gallery. Result: 42 / 45
captures clean. The three that are not clean are the phone overflows already recorded in §7 (students 391, bank 458, import 405),
unchanged by R1. There is no new overflow and no page error.

**What changed:**
- every primary button, link, tab, active state, focus halo, stat-card accent, progress fill and badge tint moved from blue to the
  deep purple;
- the dark rail and the student top bar became purple ink;
- radii are flatter and shadows lighter.

**Still blue, as planned:** the Chart.js series (R3/R4) and the login illustration (R16).

## R1.7 Local validation (final R1 state, 4-core container)

| Check | Result |
|---|---|
| `npm test`, full root suite | **1 170 / 1 170 files, 13 968 / 13 968 tests**. The first run, before `--eb-faint` was put back, had 1 failure: the UX-8b pin (R1.2). The two R0 timing tests passed both times. |
| `npm run lint` | exit 0. The `avatars.tsx` warnings predate R1 |
| `npm run build` (tsc -b + bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| mutation campaign, re-run on the final state | 8 / 8 KILLED, files restored (R1.5) |
| visual capture | 42 / 45 clean; the 3 recorded overflows only (R1.6) |
| after the owner's `--eb-faint` decision (R1.2) | full suite 1 170 / 1 170 files, 13 968 / 13 968 tests; lint exit 0; build + bundle guard passed; mutant M9 (faint darkened to `#7c8799`) KILLED by the UX-8b invariant test and the R1 palette pin, restored byte-for-byte |

---

# Phase UX-R2 — The app shell: full-width top bar and white sidebar

**Owner direction (2026-10-20):** start R2. It is stacked on R1 like R1 was stacked on R0: branch `feature/ux-r2-shell` from
the R1 head `ef9fcf0e`, with its own pull request. Merge order: R1 (PR #391), then R2.

## R2.1 What changes for the user

The teacher shell takes the reference layout.

**The top bar** is a full-width white bar with a hairline and a soft shadow, sticky above everything. From the start edge (the
right in RTL) it holds:
- the menu control: «طيّ القائمة / توسيع القائمة» on desktop, «القائمة» below 1024 px;
- the brand: mark and «Tadris+»;
- a **«الرئيسية» pill** that leads to «لوحة المتابعة»;
- the **quick navigation field** «انتقل إلى صفحة…»;
- the teacher's **avatar**, which still opens the profile dialog.

**The sidebar** is white below the bar. It has ink text, small section names, hairlines between groups, a grey pill with a slim
purple bar for the current page, and «سجل النشاط» / «تسجيل الخروج» at the bottom. The compact rail (1024–1279 px, or by the
toggle) and the phone drawer work as before.

**The quick navigation field is honest.** It only jumps to a page of the platform: it does not search content (that is R18).
- It is a WAI-ARIA combobox: arrows move, Enter opens the highlighted page, Escape closes the list and then clears the text.
- Matching is Arabic-insensitive: diacritics, tatweel and alef / ya / ta-marbuta forms are ignored.

**The student top bar** is the same light chrome: white band, ink brand, quiet pill entries («الإشعارات», «الرسائل», «الألعاب
التعليمية», «تثبيت التطبيق», «تسجيل الخروج»).

**Reader focus mode** now also hides the top bar, as it already hid the sidebar and the page header.

## R2.2 Edit set

**Shell structure:**
- `src/shell/TeacherAppShell.tsx`:
  - adds the top bar;
  - moves the brand, the compact toggle, the drawer toggle (out of `PageHeader`'s `leading` slot) and `TeacherIdentity` into it;
  - the sidebar loses `eb-on-dark` and the `inverse` controls;
  - the drawer's own header row (title + «إغلاق القائمة») renders only while the drawer is open;
  - the «الحساب» section keeps logout.
- `src/ui/PageHeader.tsx`: a `<div>` instead of a `<header>`, so the top bar is the page's **one** banner landmark. Two banners
  are ambiguous for screen readers, and `PageHeader` is used only by this shell.

**Quick navigation (new):**
- `src/shell/QuickNavSearch.tsx`: the field.
- `src/shell/quickNav.ts`: the matching rules, kept apart so the component module exports only the component.

**Stylesheets:**
- `src/shell.css` and `src/shell/teacher-nav-21e.css`: the light chrome.
  - The shell is a grid of three areas (top / side / main).
  - The top bar is sticky at the top on `--eb-z-nav`. The sidebar sticks *below* it (`inset-block-start: var(--eb-topbar-h)`,
    `height: calc(100vh - var(--eb-topbar-h))`).
  - All colours come from the new `--eb-chrome-*` tokens; the shell no longer reads any dark `--eb-nav-*` token.
  - Focus rings on white use the primary.
  - The compact-rail rules that hid `.eb-brand-text` were scoped so they no longer hide the brand in the top bar.
  - On phones (≤ 639 px) the pill hides and the brand name leaves the screen (it stays in the accessibility tree).
  - The engine's own blue clear «×» in the search field is hidden; Escape clears.
- `src/design-tokens.css`: `--eb-topbar-h` (58 px) and the `--eb-chrome-*` set (bg, text, text-muted, hover, active, border,
  field, shadow). The `--eb-nav-*` set stays as the **dark-surface** tokens for toasts, the student exam's dark bands and the 3D
  viewer.
- `src/student/student-portal-v2.css`: the student top bar in light chrome. Token-only and scoped to `.eb-student-shell`, as its
  guard requires.
- `src/learning/reader/reader-enterprise-l1.css`: focus mode also hides `.eb-shell > .eb-topbar`. The line that
  `scripts/mutate-l.mjs` targets is unchanged.

**Tests:**
- New:
  - `src/shell/QuickNavSearch.ux-r2.test.tsx` (7 tests);
  - `src/shell/shellChrome.ux-r2.test.tsx` (12 tests).
- Updated on purpose for the move:
  - `src/shell/TeacherAppShell.nav21e.test.tsx` (4 placement tests);
  - `src/teacher/teacherIdentity.test.tsx` (scope: sidebar → top bar);
  - `src/learning/reader/reader.l1.guards.test.ts`.

**Not changed:**
- navigation state, destinations, order, names, badges and `aria-current`;
- the drawer's dialog, focus trap and focus return;
- layers and z-index tokens;
- data, API, grading.

## R2.3 Tests that pinned the old placement — updated explicitly, invariants kept

| Test | Old pin | Now | Invariant kept |
|---|---|---|---|
| nav21e «renders named groups…» | the avatar button inside the «الحساب» group | the avatar is in the banner, **once**; never also in the sidebar | groups, names and order of every destination; logout in «الحساب» |
| nav21e «the account controls sit together AFTER the navigation…» | the avatar after the activity log in the sidebar | the activity log after the last destination; logout last | the account section closes the sidebar |
| nav21e «keyboard order follows the visual order…» | sidebar only: toggle, 13 destinations, avatar, logout | whole chrome in DOM order: toggles, «الرئيسية», «انتقل إلى صفحة», avatar, then 13 destinations, logout | keyboard order = visual order |
| nav21e «without an identity…» | the name inside the account section | the name in the top bar; logout in the account section | the signed-in teacher is always named |
| teacherIdentity (3 tests) | `within(sidebar())` | `within(banner)` | every assertion unchanged: name authority, preset icon, brand, one photo read, the dialog flows |
| reader.l1.guards «focus mode hides exactly…» | `className="eb-sidebar eb-on-dark"`, `<header className="eb-page-header">`, the hidden-host list | `<header className="eb-topbar">`, `className="eb-sidebar"`, `<div className="eb-page-header">`, `.eb-topbar` added to the list | focus mode hides exactly the shell's chrome and nothing else |

Three regressions were caught by existing invariant tests while R2 was built, and fixed before any commit:
- **The page's single status element.** The search field's live region had `role="status"`. `AppShell.lazyTeacherPlatform.8e`
  requires exactly one status element (the platform's loading fallback). The region is now `aria-live` without the role.
- **The pill's name.** The pill first carried the name «لوحة المتابعة» and `aria-current`, which doubled the sidebar button. It
  is now «الرئيسية», without `aria-current`.
- **A label class in the top bar.** The no-identity name in the top bar used the sidebar's `.eb-nav-label`, which the rail rules
  hide. It now has its own class.

## R2.4 Fail-first evidence

Not applicable: R2 is a presentation feature, not a defect fix. The new behaviour (the quick navigation) and the new invariants
(one banner, light chrome, geometry, contrast, focus, phone bar) are covered by the two new test files and proven by the mutation
campaign below.

## R2.5 Mutation proof

Each mutant was run against `src/shell`, `AppShell.lazyTeacherPlatform.8e`, `phase8b`, `reader.l1.guards`,
`api/tests/ux2-shell-foundation` and `teacherIdentity`. Each file was restored byte-for-byte (SHA-256), and `git status` was
clean afterwards.

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | sidebar gets `eb-on-dark` back | KILLED | shellChrome «no dark-surface class…»; reader.l1 focus-mode guard |
| M2 | nav link text reads `--eb-nav-text-muted` again | KILLED | shellChrome «the shell stylesheets read no dark-surface --eb-nav-* colour token…» |
| M3 | home pill named «لوحة المتابعة» | KILLED | shellChrome «exactly one banner…» and «the home pill never doubles…»; nav21e keyboard order |
| M4 | quick-nav live region gets `role="status"` back | KILLED | AppShell.lazyTeacherPlatform E and F; QuickNavSearch live-region test |
| M5 | nav focus ring back to `--eb-primary-100` | KILLED | shellChrome «focus rings on the white chrome are the primary…» |
| M6 | sidebar sticks at `0` (under the bar) | KILLED | shellChrome «the sidebar sticks BELOW the top bar…» |
| M7 | `--eb-chrome-text-muted` → `#a9a5b4` | KILLED | shellChrome «chrome text ≥ 7:1 and secondary text ≥ AA…» |
| M8 | Enter navigates with no match | KILLED (2nd run) | QuickNavSearch «Escape closes… Enter with no match navigates nowhere» |

**M8 survived the first run.** The mutant throws on `undefined.id` before `onNavigate`, so «not called» still held, but it had
already wiped the typed text. The test now also asserts that the text stays, so the teacher can correct it.

## R2.6 Visual evidence

`scripts/capture-visual-baseline-ux-r.mjs` was run on the R2 build: 14 pages × 3 viewports, plus the gallery. Result: 42 / 45
captures clean. The three that are not clean are the phone overflows recorded in §7 (students 391, bank 458, import 405), unchanged
by R2. There is no new overflow and no page error.

Extra checks in Chromium:
- the phone drawer opens as the white sheet with «Tadris+» (LTR) and «إغلاق القائمة»;
- the quick navigation list opens below the field with the highlighted option.

## R2.7 Local validation (4-core container)

| Check | Result |
|---|---|
| `npm test`, full root suite | **1 172 / 1 172 files, 13 987 / 13 987 tests** |
| `npm run lint` | exit 0. The shell files are clean: the quick-nav helpers live in `quickNav.ts` |
| `npm run build` (tsc -b + bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | 2 298, unchanged. The new rules are token-only |

## R2.8 Known limitations

- **The help and notification icons of the reference bar are not added.** Teachers have no help centre or notification feed
  today, and an icon with nothing behind it would be a fake control. They can come with R18.
- **`--eb-nav-accent` (added in R1 for the dark rail's pill) is no longer read** by any stylesheet. It stays defined because the
  R1 guard pins it. It can be removed in R17 together with its pin.
- **Browser harness scripts that are not part of CI** select a menu button with a loose `/القائمة/` regex and `.first()`
  (`check-*-browser-p3/p4/p8/p10/u1.mjs`). On desktop viewports the first match is now the top bar's «طيّ القائمة». They should
  move to the exact name «القائمة» when they are next run.

## R2.9 CI fix: 44 px touch targets in the top bar

**What failed.** On the first R2 head (`a9b97f97`), the workflow «L.8 reader journey, axe and touch targets» failed with 6 checks
(run 39496179621). It measures every visible control at 390 and 834 px (touch), and three top-bar controls were under 44 px:

| Control | Size |
|---|---|
| quick navigation field | 40 px tall |
| avatar | 40 × 40 |
| «الرئيسية» pill, at 834 px | 34 px |

The avatar had never counted before, because it sat inside the closed drawer. No local suite measures rendered sizes, so the gap
only showed in CI.

**Fail-first.** `scripts/check-learning-reader-browser-l8.mjs` was run locally on that head with CI's own tools (playwright-core
1.55.0, axe-core 4.10.2). It reproduced the same 6 touch-target failures at 390 and 834 px.

**Fix:**
- `src/shell.css`: a `@media (pointer: coarse), (max-width: 1023px)` block gives the field and the pill `min-height: 44px`.
  - The pointer is listed first so that the drawer's own `@media (max-width: 1023px)` block stays the first of its kind; two
    `api/tests/ux2-shell-foundation.test.js` guards read that block. A first attempt with the widths first broke them, and they
    caught it before any push.
- `src/teacher/TeacherIdentity.tsx`: an optional `size` prop. The default stays 40; the top bar passes 44.
- `src/shell/shellChrome.ux-r2.test.tsx`: a new guard for both changes (13 tests in all).

**After the fix:**
- The L.8 gate passes locally with CI's tools.
- Full root suite: 1 172 / 1 172 files, 13 988 / 13 988 tests.
- `npm run lint` exit 0; build and bundle guard passed.
- Visual capture: 39 / 42 page captures clean (the three recorded overflows only).

**One timing failure, not R2's.** During the focused runs, `src/TeacherPlatform.createClass.d3.test.tsx` (the R0 §9.4 timing
test) failed once.
- That test renders `TeacherPlatform` alone, none of the shell.
- Measured afterwards: 0 / 8 failures in isolation on `main` `a70350c1` and 0 / 8 on the R2 head.
- It is recorded here and not patched (`AGENTS.md` §12).

---

# Phase UX-R3 — The component kit

**Owner direction (2026-10-20):** start R3. R2 had already merged (PR #392), so R3 branches from `main` `0ed8b9cb` as
`feature/ux-r3-kit`, with no stacking.

## R3.1 What changes for the user

**On every page now**, because these shared primitives are used everywhere:
- **Buttons** have a hairline border and a neutral grey hover; quiet buttons use ink text.
- **Stat cards** are flat: hairline border, 8 px radius, no shadow. Their thin accent bar stays.
- **Chart cards** take the same card look, with a card-sized title.
- **Dialogs and empty states** use the 8 px radius.
- **The «⋮» menu** is the reference popover: full-width rows, 14 px text, a soft lift, a hairline border.
- **Progress bars** are thinner, and their second series is the lavender step.
- **Every dashboard chart** draws in the redesign palette: deep purple, the lavender step, and the semantic danger / warn /
  success scale for topic averages. **No blue is left in the teacher charts.**

**New components, ready for the page phases (R4 onward)**, shown in the gallery:

| Component | What it is |
|---|---|
| `ui/Card.tsx` | hairline container; a titled card is a region named by its heading |
| `ui/ListRows.tsx` (`ListRows` / `ListRow` / `RowAction`) | the reference's ≥ 44 px rows split by hairlines: icon, title, muted context, meta, status, inline action. A real list; `RowAction` is a real button named by its text («تعديل» by default) |
| `ui/SubNav.tsx` | settings-style text navigation: a named `<nav>`, labelled groups, the current item a grey pill with `aria-current="page"`, counts kept in the name |
| `ui/KpiStrip.tsx` | one card split into cells by vertical hairlines. A description list, so each value is read with its label |
| `ui/Segmented.tsx` | a WAI-ARIA radio group: one Tab stop; arrows follow the reading direction (in RTL the left arrow goes to the next option); Home / End |
| `ui/Tooltip.tsx` | the dark hint. WCAG 1.4.13: hover **and** focus, it stays while the pointer is on it, Escape dismisses it without moving focus. It *describes* the control, never names it |

**Not included:**
- **No cascading submenu.** No page needs one yet, and the grouped menu (`.eb-menu-group` / `-label` / `-sep`) already covers the
  reference popover. It can come with the first page that needs it.
- **The exam-question chart palette (`src/charts/chartTheme.ts`, ECharts) is left unchanged on purpose.** It colours charts
  *inside questions*, where a question's text may name a series by its colour («الخط الأزرق»), and question version families are
  immutable. It is content, not chrome.

## R3.2 Edit set

**New components and their stylesheet:**
- `src/ui/Card.tsx`, `ListRows.tsx`, `SubNav.tsx`, `KpiStrip.tsx`, `Segmented.tsx`, `Tooltip.tsx`: new.
- `src/ui/kit.css`: new, imported by both shells after `ui.css`.
  - Token-only: zero colour literals, as the ratchet requires of a new sheet.
  - Logical properties only.
  - 44 px targets on touch and below 1024 px.
  - A canonical focus ring on every interactive part.
  - `[hidden]` honoured on the tooltip.

**Restyled primitives:**
- `src/ui/ui.css`: buttons, stat card (flat; the pinned accent bar kept), dialog, empty state, progress bar, chart card, chip.
- `src/page-parts.css`: the menu trigger and panel. `overflow:auto`, `overscroll-behavior:contain`, the
  `calc(var(--eb-z-modal) + 1)` layer and every 44 px rule are unchanged, and no transition was added, so the reduced-motion
  lists stay complete.

**Chart theme:**
- `src/projects/chartPalette.ts`:
  - the second series is `--eb-primary-300`, replacing the info blue;
  - a new `scale { low, mid, high }` comes from the danger / warn / success tokens;
  - `--eb-primary-300` is added to the fallback copy.
- `src/TeacherDashboard.tsx`: the five charts read `chartPalette()` instead of literals (`#2563eb`, `rgba(37,99,235,…)`, sky,
  red / green / amber, slate grid), with the palette added to each chart's memo dependencies.

**Gallery:** `browser-harness/ux-r-gallery.tsx` shows the new components (12 sections).

**Tests:**
- New:
  - `src/ui/kit.ux-r3.test.tsx` (18 tests: semantics, keyboard, WCAG 1.4.13, kit.css guards);
  - `src/projects/chartPalette.ux-r3.test.ts` (5 tests).
- Updated:
  - `src/projects/chartPalette.tokenMirror.ux-r1.test.ts`: adds `--eb-primary-300` to the mirror list.
  - `src/TeacherDashboard.test.tsx`: the topic-colour pin. It compared the old rgba literals; it now checks the same threshold
    mapping (< 60 → `scale.low`, ≥ 80 → `scale.high`, otherwise `scale.mid`). The mapping was the invariant; the literals were
    the look.

**Not changed:**
- any component's markup, class names or props;
- every pinned invariant listed in the constraint map: StatCard's DOM and accent bar, the menu's layer and scroll containment,
  the phone / coarse 44 px rules, the reduced-motion lists, the focus-ring tokens, the dialog's first fixed rule;
- ActionMenu's consumer list;
- the colour ratchet (2 298).

## R3.3 Fail-first evidence

Not applicable: R3 adds components and restyles; it fixes no defect. Its invariants are proven by the mutation campaign below.

## R3.4 Mutation proof

Each mutant was run against `src/ui`, both chart palette tests, `TeacherDashboard.test.tsx` and the colour ratchet. Each file was
restored byte-for-byte (SHA-256), and `git status` was clean afterwards.

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | `RowAction` loses `type="button"` | KILLED | kit «RowAction is a real button…» |
| M2 | SubNav marks every item current | KILLED | kit «exactly the current item carries aria-current=page…» |
| M3 | Segmented ignores RTL | KILLED | kit «in RTL the LEFT arrow goes to the next option…» |
| M4 | Tooltip: Escape no longer dismisses | KILLED | kit «… Escape dismisses it without moving focus» |
| M5 | SubNav loses its 44 px touch target | KILLED | kit «touch screens and the drawer layout get 44 px targets…» |
| M6 | a colour literal in kit.css | KILLED | colour ratchet (a new sheet must be 0); kit «is token-only…» |
| M7 | chart series[1] back to the info blue | KILLED | chartPalette.ux-r3 «series: the deep purple, then its lavender step…» |
| M8 | dashboard reintroduces a blue literal | KILLED | chartPalette.ux-r3 «no hard-coded chart colour remains…» |
| M9 | Tooltip names the control instead of describing it | KILLED | kit Tooltip tests |
| M10 | KpiStrip labels are not `<dt>` | KILLED | kit «a description list: each value paired with its label…» |

**A test-hygiene fix found by M3.** The RTL test restored its `getComputedStyle` mock only at the end of its body, so a failing
assertion leaked the mock into later tests: a Tooltip test failed under M3 too. The restore now runs in `afterEach`, and a re-run
of M3 is killed by the RTL test alone.

## R3.5 Browser gates (CI workflows, run locally with CI's tools: playwright-core 1.55.0, axe-core 4.10.2)

A change to `src/ui/**` triggers two CI workflows. Both were run on the R3 build:
- **L.8 reader journey, axe and touch targets:** «L.8 gate passed».
- **U.1 class bar, roster, student sheet and axe:** «U.1 gate passed».

## R3.6 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture (14 pages × 3 viewports + gallery) | 42 / 45 clean; the three recorded phone overflows only (§7) |
| `npm test`, full root suite | **1 174 / 1 174 files, 14 012 / 14 012 tests** |
| `npm run lint` | exit 0. The two `TeacherDashboard.tsx` warnings left (lines 276 / 301, about `loadDashboard` / `loadAchievements`) predate R3 |
| `npm run build` (tsc -b + bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | 2 298, unchanged (kit.css counts 0) |

---

# Phase UX-R4 — The dashboard

**Owner direction (2026-10-21):** start R4. R3 (PR #393) was still open, waiting for the owner's merge and an Azure preview slot.
R4 depends on it, so R4 branches from the R3 head `eab451aa` as `feature/ux-r4-dashboard`. This is the same stacking the owner
chose for R1 on top of R0.

**Reconciliation.** The owner merged R3 into `main` (`af7f9aab`) while R4 was being validated. R4 took `main` in with a normal
merge commit (`b3e7bfc4`, `git merge origin/main`); there were no conflicts.
- The merged tree is byte-identical to the validated R4 commit `fda35744`: same tree SHA `1ade5d7f`.
- The full validation was re-run on the merge commit anyway (§R4.5).
- The PR diff against `main` now shows R4 alone.
- Baselines: R3 head `eab451aa` → `main` `af7f9aab`.

## R4.1 What changes for the user

«لوحة المتابعة» takes the mockup's look. The page keeps its content, its order and every number. Presentation only:

- **The toolbar sits on the page, not in a card.**
  - The class and student selects have hairline borders.
  - The period control is the reference segmented group: one border, hairlines between the options, and the pressed option in
    grey and bold.
  - «تحديث», «تصدير CSV» and «طباعة» are quiet hairline buttons.
- **Each KPI row is one hairline strip, split into cells by hairlines**, like the mockup's headline numbers.
  - The headline values read in ink, and each label carries a plain ink icon.
  - Each cell keeps its thin tone accent bar (pinned since 21E.2).
- **Attention cards, in the live hub and in «يحتاج إلى انتباهك», are flat 8 px cards.**
  - Their rows run edge to edge and are split by hairlines; each row is at least 44 px tall.
  - Each row shows its title over its muted context, with a quiet chevron at the end.
  - The count is a small tag on the tone's tint.
  - The thin tone bar at the top stays.
- **The Today hub's quick actions are flat hairline tiles**, each with an ink icon on a grey chip. The recent-activity card is
  flat, with 44 px rows.
- **Single-card sections are the card itself, with the title inside**, like the mockup's «مقارنة الصفوف» card. These are
  «متابعة الواجبات», «مؤشرات ذكية للمعلم», «إنجازات الطلاب الأخيرة» and the AI section. Section titles outside a card are one step
  quieter (17 px).
- **Tables are quiet:** a white header of small muted labels, hairline rows and a grey hover. A card that holds only a table runs
  the rows edge to edge.
- **Insights are hairline rows.** The tone sits in the icon's tinted circle, not in a full-width fill.
- **The chart cards' side notes** («آخر 4 واجبات», «الأضعف أولًا») are muted text, not purple pills.
- **The drill panel** has a hairline border and the 8 px radius.

**Not changed, on purpose:**
- **No greeting heading and no «إنشاء واجب» button in the page head.** Both are new behaviour: a personalised title, and a
  shortcut into the assignment wizard. They are left to an owner decision; the shell's page title stays «لوحة المتابعة».
- **The section order is unchanged.** The mockup puts its trend chart beside the attention card. The dashboard's h2 order and
  the hub-before-analytics order are pinned (`TeacherDashboard.test.tsx`, `TeacherDashboard.scope.21h2.test.tsx`), and they
  carry the 21H.2 product decision.
- **The class comparison stays a bar chart with the class picker**, not the mockup's progress rows. It has a data-table
  equivalent and a picker, and both are pinned.
- **The accent bars on KPI tiles and attention cards stay.** They are pinned (21E.2), and they carry the tone.

## R4.2 Edit set

**`src/dashboard-pro.css`.** Every pinned rule is kept verbatim: the 21H.5 touch block and its anchor comment, the phone-block
strings, the reduced-motion list, the accent bars, the muted-text rules and the print block.
- New rules:
  - the toolbar without its card;
  - the segmented group;
  - `.eb-dash-panel`;
  - the KPI strip: a 1 px gap over the hairline colour, so the dividers follow 4 / 2 / 1 columns without per-breakpoint
    borders;
  - flat cards and the attention rows, with a chevron drawn by borders. Its `content` is empty, so it adds nothing to a row's
    accessible name;
  - `.analytics-card.is-flush`;
  - quiet tables;
  - insight rows, improver rows and the drill panel.
- **The shared `.analytics-view-tabs` block now uses tokens of the same value.**
  - `#fff` → `var(--eb-surface)`;
  - `#fff3` → `color-mix(in srgb, var(--eb-surface) 20%, transparent)`;
  - `#fef2f2` / `#b42318` → `var(--eb-danger-bg)` / `var(--eb-danger-tx)`.
  - The file holds 0 colour literals.
  - **Colour ratchet: 2 298 → 2 294.** The baseline was rewritten by the script.
- **A KPI tile in the strip keeps its uniform 1 px border, made transparent.** The 21E.2 Chromium gate
  (`scripts/capture-visual-gate-21e2-workspace.mjs`) reads it as «a straight accent bar, never a thicker inline-start border».
  A first attempt with `border:0` failed that gate locally, before any push.

**`src/teacher/teacherToday.css`:**
- plain rows: no grey box, 44 px high;
- quick-action tiles: flat, with the grey icon chip;
- the recent card: flat, with 44 px rows;
- the end padding beside a row's «تذكير».

**`src/TeacherDashboard.tsx`:** classes only.
- `eb-dash-panel` on the four single-card sections.
- `is-flush` on the two table-only cards (follow-up and assignments).

**`scripts/capture-visual-baseline-ux-r.mjs`:** a `/api/teacher-today` fixture, so the captures show the live hub with rows
instead of its error state.

**Tests:** a new file, `src/dashboard.ux-r4.test.tsx`, with 9 tests. Two are DOM tests: which sections are panels, and which
cards are flush. Seven guard the R4 rules in both stylesheets. No existing test changed.

## R4.3 Fail-first evidence

Not applicable: R4 restyles and fixes no defect. Its invariants are proven by the mutation campaign below.

## R4.4 Mutation proof

Each mutant was planted alone. The run covered the R4 suite plus the pinned dashboard suites:
- `dashboard.ux-r4`, `premiumWorkspace.21e2`, `TeacherDashboard`, `TeacherDashboard.attention`, `dashboardGate.21h5`,
  `ux2-shell-foundation`, and the colour ratchet.

Each file was restored byte-for-byte (SHA-256), and `git status` was clean afterwards.

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | KPI strip loses its hairline dividers (1 px gap → spaced tiles) | KILLED | ux-r4 «each KPI row is ONE hairline strip…» |
| M2 | KPI tile border set to 0 (the 21E.2 «uniform 1 px border» invariant) | KILLED | ux-r4 «each KPI row is ONE hairline strip…» |
| M3 | the attention chevron becomes generated text (it would be read into the row's name) | KILLED | ux-r4 «attention rows: … the chevron is decoration only» |
| M4 | attention row loses its 44 px height | KILLED | ux-r4 «attention rows: … ≥ 44 px…» |
| M5 | pressed period option back to the old white chip with a shadow | KILLED | ux-r4 «the period control is the reference segmented group…», «cards are flat…» |
| M6 | the attention card's shadow returns | KILLED | ux-r4 «cards are flat 8 px…» |
| M7 | a colour literal back in the shared view tabs | KILLED | colour ratchet; ux-r4 «the shared view tabs keep their look with tokens…» |
| M8 | insights keep their full tone fill (the tone reset removed) | KILLED | ux-r4 «… insights carry no full tint» |
| M9 | the attention card's accent bar removed | KILLED | premiumWorkspace.21e2 «attention cards: a ::before bar…» |
| M10 | «متابعة الواجبات» is no longer a panel (its title back outside the card) | KILLED | ux-r4 «the four single-card sections ARE the card…» (DOM) |
| M11 | the follow-up table card is no longer flush | KILLED | ux-r4 «the two table-only cards run flush…» (DOM) |
| M12 | Today quick-action icon back on the purple tint | KILLED | ux-r4 «Today hub: flat quick-action tiles…» |
| M13 | Today plain row back to the grey boxed chip | KILLED | ux-r4 «Today hub: … plain rows» |

13 / 13 KILLED, no TIMEOUT. Every file was SHA-256-verified as restored, and `git status` showed only the R4 edit set before and
after the campaign.

## R4.5 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture (14 pages × 3 viewports) | 39 / 42 clean; the three recorded phone overflows only (§7: students 391, bank 458, import 405). The dashboard is clean at all three viewports |
| 21E.2 Chromium gate on the dashboard (KPI and quick-action columns, accent bars, nav) | every CHECK passes at 1280, 150 %, 200 % and 390 px touch |
| `npm test`, full root suite | **1 175 / 1 175 files, 14 021 / 14 021 tests**: on `fda35744`, and again on the reconciled merge `b3e7bfc4` (lint, build and `git diff --check` re-run there too) |
| `npm run lint` | exit 0. The `TeacherDashboard.tsx` warnings at lines 276 / 301 predate R4 |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | 2 294 (was 2 298) |

---

# Phase UX-R5 — Classes and students

**Owner direction (2026-10-21):** start R5. R5 depends on R3, which is merged, so it branches from `main` `af7f9aab` as
`feature/ux-r5-students`. It ran in parallel with R4 (PR #394); the two share no source file, and no unmerged work was copied.

**Reconciliation.** R4 merged into `main` (`76df1cdf`) just after R5's first push (`97091881`). R5 took `main` in with a normal
merge commit (`git merge origin/main`).
- **Conflict:** one, in this record, where both phases had appended a section at the end. It was resolved by keeping both, R4
  first.
- **Re-validation:** the full suite, lint, typecheck, build and the U.1 gate were re-run on the reconciled head (§R5.5).
- **Baselines:** `af7f9aab` → `76df1cdf`.

**Owner decision on the layout (2026-10-21).** The mockup puts the classes in a narrow side column. The U.1 hardening phase chose
the opposite on purpose: a class bar ABOVE a full-width roster, because a 260–300 px side column squeezed the table. That
choice is pinned by the U.1 Chromium gate (classes above the roster, roster ≥ 90 % of the width) and by
`classesStudents.u1.test.tsx`. Offered both options, the owner chose **to keep the U.1 layout in the reference look**. No U.1
pin changes.

## R5.1 What changes for the user

- **The class bar reads as a sub-navigation.**
  - Class items have no card border of their own and turn grey on hover.
  - The selected class is a grey pill with a bold name.
  - Each item's «⋯» is quiet (no box) until hovered or opened.
  - The «الصفوف النشطة / الأرشيف» switch is the reference segmented group: one border, hairlines between the options, the
    pressed one grey and bold. This applies in this workspace only; the shared base is unchanged for other pages.
- **The five summary figures are one hairline strip.**
  - Each figure is a cell, and the pressed figure (the active filter) is a grey cell.
  - Each figure's tone is now a small dot before its label, replacing the 3 px coloured side stripe. The label names the figure;
    the dot is decoration.
  - The strip stays one row down to the phone; there it is 2 columns, and an odd last figure spans the row.
- **The roster is a flat 8 px card of hairline rows** with a quiet white header. The sticky header keeps an opaque white fill.
- **Search field and status select:** hairline borders.
- **Other cards in the workspace use the 8 px radius:** the classes pane, the bulk bar, the credential box, the loading
  skeleton, and the learning-materials panel (which also loses its shadow).

**Fix: the phone overflow recorded in R0 §7 (students, 391 > 390 px).**
- **Root cause:** the roster search `<input>` had no width. Its intrinsic size (the input's default size × the Arabic web font)
  widened the phone toolbar column 1 px past the screen.
- **Fix:** it now fills its field, like the class filter already did.

**Not changed:**
- **The U.1 layout** (owner decision above).
- **The «إضافة طالب» popover of the mockup.** The current button opens the existing dialog; a popover would be new behaviour.
- **Phone roster cards and the printed login cards.**
- **All markup and every pinned rule.**

## R5.2 Edit set

**`src/page-parts.css`.** Only this stylesheet changed, and only in its UX-4 (literal-free) part. Every pinned string is kept:
U.1 / U.2, the hardening rules, the touch-target blocks, the reduced-motion list and the menu layer.

**Tests:** a new file, `src/students/classesStudents.ux-r5.test.ts`, with 9 guards. No existing test changed.

**Colour ratchet:** R5 adds no literal. It is 2 294 after the merge, the count R4 set on `main`.

## R5.3 Fail-first evidence (the overflow)

The visual harness (`scripts/capture-visual-baseline-ux-r.mjs`) measures `scrollWidth` at 390 px.

| Build | Result at 390 px |
|---|---|
| Baseline `af7f9aab` | `CHECK FAIL phone/students — horizontal overflow 391>390` |
| R5 with only the one `inline-size:100%` line removed | `391>390` again |
| R5 head | `CHECK PASS phone/students` |

The isolation run proves that this line, and nothing else in R5, is the fix. `src/page-parts.css` was restored afterwards
(SHA-256 identical). The R5 guard pins the line, and mutant M1 shows the guard kills its removal.

## R5.4 Mutation proof

Each mutant was planted alone. The run covered `src/students` (including U.1, U.2, S.3, S.4 and R5), `ux2-shell-foundation`,
the hardening and UX-4 platform suites, and the colour ratchet. Each file was restored byte-for-byte (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the roster search box loses its width (the overflow returns) | KILLED | ux-r5 «the roster search box fills its field…» |
| M2 | class items get their card border back | KILLED | ux-r5 «class items have no box of their own…» |
| M3 | the selected class back to the purple tint with a shadow | KILLED | ux-r5 «… the selected class is a grey pill…» |
| M4 | the summary strip loses its hairline dividers | KILLED | ux-r5 «cells sit on a 1 px gap…» |
| M5 | the tone dot becomes generated text | KILLED | ux-r5 «the tone is a decorative dot…» |
| M6 | the 3-column wrap at ≤ 1279 px returns (an empty hairline cell) | KILLED | ux-r5 «no wrap that would leave an empty hairline cell…» |
| M7 | phone: the odd last figure no longer spans | KILLED | ux-r5 «no wrap…» |
| M8 | the workspace's pressed view-switch option back to a white chip | KILLED | ux-r5 «the view switch is the reference segmented group…» |
| M9 | the restyle leaks into the SHARED segmented base (other pages) | KILLED | ux-r5 «… the shared base is unchanged for other pages» |
| M10 | the roster header back to a grey band | KILLED | ux-r5 «the roster is a flat 8 px card…» |
| M11 | the roster card back to the large radius | KILLED | ux-r5 «the roster is a flat 8 px card…» |
| M12 | U.1 broken: a 260 px side column for the classes | KILLED | u1 «one column at every width…»; ux-r5 «the U.1 layout is untouched…» |
| M13 | the class «⋯» is boxed again | KILLED | ux-r5 «the «⋯» of a class item is quiet…» |

13 / 13 KILLED, no TIMEOUT. `git status` showed only the R5 edit set before and after the campaign.

## R5.5 Browser gate, visual evidence and local validation

| Check | Result |
|---|---|
| U.1 gate (CI workflow, run locally with CI's tools: playwright-core 1.55.0, axe-core 4.10.2) | «U.1 gate passed» at 390 / 834 / 1024 / 1440. Covers the bar above the roster, chips inside the cards, the phone strip, touch targets, axe, the student sheet and S.4 |
| Visual capture (14 pages × 3 viewports) | **40 / 42 clean** (was 39 / 42): the students overflow is fixed. Left: bank 458 and import 405, which go to R11a |
| `npm test`, full root suite | **1 175 / 1 175 files, 14 021 / 14 021 tests** on the second run on `97091881`. On the reconciled head (with R4): **1 176 / 1 176 files, 14 030 / 14 030 tests**; lint, build, `git diff --check` and the U.1 gate were re-run there and passed |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |

**One timing failure, not R5's.** The first full run failed one test: `src/App.credentialsLeave.s3.test.tsx`, «no leave confirm».
- The failure is a `waitFor` with the default 1 s timeout in a full-App DOM test, under suite load.
- It passed 3 / 3 in isolation, and the whole suite passed on the second run.
- R5 changes only CSS, which Vitest does not process (happy-dom never sees `page-parts.css`), so the change cannot affect that
  test.
- It is recorded here and not patched (`AGENTS.md` §12).

---

# Phase UX-R6a — Assignments: the home and the creation wizard

**Owner direction (2026-10-21):** start R6a. It depends on R3 (merged), so it branches from `main` `76df1cdf` as
`feature/ux-r6a-assignments`. It ran in parallel with R5 (PR #395); the two share no source file.

**Reconciliation.** R5 merged into `main` (`20c850f5`) while R6a waited for review. R6a took `main` in with a normal merge commit
(`git merge origin/main`).
- **Conflict:** one, in this record, where both phases had appended a section. It was resolved by keeping both, R5 first.
- **Re-validation:** the full suite, lint, typecheck, build and `git diff --check` were re-run on the merged head (§R6a.5).
- **Baselines:** `76df1cdf` → `20c850f5`.

## R6a.1 What changes for the user

On the «الواجبات» home:
- **The toolbar sits on the page, not in a card.**
- **The four headline figures are one hairline strip.**
  - The dividers are a 1 px gap over the hairline colour, so they follow 4 / 2 columns.
  - Each tile keeps its tone accent bar and a transparent 1 px border (the 21E.2 invariant). The values read in ink.
- **The two view switches are the reference segmented group:** «الواجبات الحالية / المؤرشفة», and the wizard's content source.
- **The time filters read as sub-navigation:** «الكل · مفتوحة · تُغلق قريبًا · مجدولة · مغلقة · مسودات».
  - They are quiet text items; the pressed one is a grey pill with bold text instead of a purple fill.
  - Counts are muted.
- **The list is one hairline card of rows, not one card per assignment.**
  - Each row is the title line, then the details on one wrapping line, then the time chip and the submission bar side by side.
  - The selected row is grey.
  - The rows are about a third shorter than before.

In the wizard:
- **The wizard is a flat 8 px panel.** Its primary inline-start bar stays.
- **The content source, the policy groups and the library items use the 8 px radius.**

**Not changed, on purpose:**
- **No «واجب جديد» popover, no status side column.** The mockup's popover would be new behaviour. The time filters already
  cover the mockup's sub-navigation (current / scheduled / ended / drafts), now in its look, and keep their place above the list.
- **The full-width assignment page, the gradebook and the overview.** They are R6b. Nothing in the R6a block targets
  `.eb-assign-detail`, the gradebook or the overview, and a guard pins that.
- **All markup, names, labels and logic files**: `assignmentWizard.ts`, `assignmentsHome.ts`, `assignmentsView.ts` and
  `useAssignmentComposer.ts` are untouched.

## R6a.2 Edit set

**`src/assignments-pro.css`:** one block appended at the end of the sheet. It comes after the 21G.7 coarse block, so it wins by
order at the same specificity. Every pinned rule above it is untouched.
- Stacking contexts: none. The 21E section forbids them to the end of the file.
- Transitions: none. Every transition selector must be in the first reduced-motion list.
- Coarse-pointer block: no new one. The 21G.7 guard reads the last coarse block.
- Colour literals: none. The sheet must stay at 0.

**Tests:** a new file, `src/assignments/assignmentsHome.ux-r6a.test.ts`, with 9 guards. They also pin that the block is last
and stays clear of R6b's selectors. No existing test changed.

## R6a.3 Fail-first evidence

Not applicable: R6a restyles and fixes no defect. Its invariants are proven by the mutation campaign below.

## R6a.4 Mutation proof

Each mutant was planted alone in `src/assignments-pro.css`. The run covered `src/assignments`, the home / page / gradebook
panel suites, `ux2-shell-foundation`, `premiumWorkspace.21e2` and the colour ratchet. Each file was restored byte-for-byte
(SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the toolbar card returns (shadow) | KILLED | ux-r6a «the toolbar sits on the page» |
| M2 | the KPI strip loses its hairline dividers | KILLED | ux-r6a «the headline figures are ONE hairline strip…» |
| M3 | the KPI tile border set to 0 (the 21E.2 uniform 1 px border) | KILLED | ux-r6a «… tiles keep a transparent 1 px border» |
| M4 | the pressed time filter back to the purple fill | KILLED | ux-r6a «time filters read as sub-navigation…» |
| M5 | a card per assignment again (row border and radius) | KILLED | ux-r6a «the list is ONE hairline card of rows…» |
| M6 | the selected row back to the purple tint | KILLED | ux-r6a «… the selected row grey» |
| M7 | a stacking context in the R6a block (`z-index`) | KILLED | 21E «does not introduce stacking…»; ux-r6a «adds no stacking context…» |
| M8 | a transition in the R6a block | KILLED | ux2-shell-foundation «UX-8b reduced motion…»; ux-r6a «… no transition» |
| M9 | the restyle reaches the detail page (R6b scope) | KILLED | ux-r6a «… never targets the detail page…» |
| M10 | a colour literal in the R6a block | KILLED | colour ratchet; ux2-shell-foundation «assignments-pro.css is token-only» |
| M11 | the wizard keeps its card shadow | KILLED | ux-r6a «is a flat 8 px panel…» |
| M12 | rows lose the compact layout (a column again) | KILLED | ux-r6a «a row is compact…» |

12 / 12 KILLED, no TIMEOUT. `git status` showed only the R6a edit set before and after the campaign.

## R6a.5 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture of «الواجبات» (1440 / 1024 / 390 px) | 3 / 3 clean, no horizontal overflow, no page error |
| `npm test`, full root suite | **1 176 / 1 176 files, 14 030 / 14 030 tests** |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | 2 294, unchanged (assignments-pro.css stays at 0) |
| Browser gates | none is triggered by `assignments-pro.css` (no workflow path filter covers it); the Quality Gate runs on every PR |

---

# Phase UX-R6b — Assignments: the assignment page, gradebook and question analysis

**Owner direction (2026-10-21):** start R6b. R6a (PR #396) was green and waiting for review, and both phases edit
`assignments-pro.css`. R6b is therefore stacked on the reconciled R6a head `51f1a764` as `feature/ux-r6b-gradebook`, the same
stacking used for R4 on R3.

**Reconciliation.** R6a merged into `main` (`fc40d203`, which also carried an unrelated change from another window,
`docs/development/secrecy-canaries.md`). R6b took `main` in with a normal merge commit (`58ea4c4a`).
- **Conflicts:** none.
- **Validation:** the full validation and the mutation campaign below ran on that reconciled head. The PR diff shows R6b
  alone.

## R6b.1 What changes for the user

The assignment page (opened with «فتح»):
- **The page is a flat 8 px hairline panel:** no card shadow, no purple side bar.
- **The four headline figures, and the question-analysis figures, are one hairline strip each.**
  - Before, a legacy rule from `platform.css` (`.gradebook-stats article` / `article span`) still reached these tiles and gave
    them a blue-grey tint, a tinted border and an 11 px label. The tiles are now white, with the 13 px muted label of every
    other figure.
- **The section switch «الطلاب · نظرة عامة · تحليل الأسئلة» has the reference segmented look.** That rule already comes from
  R6a (`.eb-assignments .eb-segmented`); R6b adds nothing for it.
- **The gradebook controls sit on the page**, no longer on a tinted band.
- **The status filters and the question sort read as sub-navigation:**
  - status filters: «الكل · بانتظار التصحيح · نهائي · لم يسلّم · قيد المحاولة»;
  - question sort: «ترتيب الأسئلة».
  - The pressed one is a grey pill with bold text instead of the navy fill.
- **The gradebook and analysis tables are quiet:**
  - a white header, still opaque because it is sticky;
  - hairline rows and a grey hover.
  - A selected student and the student a Today-hub row asked for keep their tint, because it carries state.
- **The overview's settings card uses the 8 px radius.**

**Not changed, on purpose:**
- **No grading, status, release or export logic.** No markup or label changes either.
- **The phone layout of one card per student (21G.4)**, the per-question colour grid (already token-only), the distribution and
  status bars, the row-editor dialogs, and the bulk bar (selection state).

## R6b.2 Edit set

**`src/assignments-pro.css`:** one block appended after the R6a block, the last block of the sheet.
- **Scoping:** every selector starts with `.eb-assign-detail`, so nothing reaches the home, the wizard or other pages (guarded).
- **Forbidden in the block:**
  - stacking contexts, transitions, a coarse block and colour literals;
  - `position: sticky`;
  - a repeat of the mutation anchors.
- **`src/assignments/assignmentPage.ux-r6b.test.ts`:** new, 9 guards.

**`src/assignments/assignmentsHome.ux-r6a.test.ts`: updated explicitly.**
- Its block slice ran to the end of the file, so its rule "the R6a block never targets `.eb-assign-detail`" would have applied
  to the R6b block appended after it.
- The slice now stops at the R6b block. The R6a invariants are unchanged: block position, no stacking context or transition, no
  coarse block, no detail-page selector inside the R6a block.
- Mutant M13 shows the bound is needed.

## R6b.3 Fail-first evidence

Not applicable: R6b restyles. The legacy tile tint is a look inherited from an older layer, not a functional defect. The
mutation campaign below proves the new invariants.

## R6b.4 Mutation proof

Each mutant was planted alone. The run covered `src/assignments`, the home / page / gradebook panel suites,
`ux2-shell-foundation`, `premiumWorkspace.21e2` and the colour ratchet. Each file was restored byte-for-byte (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the page card shadow returns | KILLED | ux-r6b «is a flat 8 px hairline panel…» |
| M2 | the figures strip loses its hairline dividers | KILLED | ux-r6b «… ONE hairline strip each…» |
| M3 | the legacy tinted tile leaks back (tile override removed) | KILLED | ux-r6b «… the tiles outrank the legacy tinted…» |
| M4 | the pressed status filter back to the navy fill | KILLED | ux-r6b «… sub-navigation with a grey pressed pill» |
| M5 | the gradebook controls band returns | KILLED | ux-r6b «gradebook controls sit on the page…» |
| M6 | the table header back to a grey band | KILLED | ux-r6b «quiet tables: white opaque header…» |
| M7 | the selected row loses its state tint (the hover rule wins) | KILLED | ux-r6b «… the selected and drill rows keep their state tint» |
| M8 | an unscoped rule reaches other pages | KILLED | ux-r6b «every rule is scoped to the assignment page…» |
| M9 | a stacking context in the R6b block | KILLED | ux-r6b «adds no stacking context…»; 21E stacking guard |
| M10 | a transition in the R6b block | KILLED | ux2-shell-foundation «UX-8b reduced motion…»; ux-r6b |
| M11 | a colour literal in the R6b block | KILLED | colour ratchet; ux2-shell-foundation «token-only» |
| M12 | phone: the per-student card wrapper gets a border again | KILLED | ux-r6b «phone: the per-student cards keep their borderless wrapper…» |
| M13 | the R6a guard's slice runs to the end of the file again | KILLED | ux-r6a «… never targets the detail page…» (the bound is needed) |

13 / 13 KILLED, no TIMEOUT. `git status` was clean before and after the campaign.

## R6b.5 Browser gate, visual evidence and local validation

| Check | Result |
|---|---|
| 21E.2 results / gradebook gate (`scripts/capture-visual-gate-21e2.mjs`) on the R6b build | **28 / 28 results and gradebook checks pass** at 1280, 150 %, 200 % and 390 px touch: chart tables, CSV exports, G-03 export target, and V-01 / V-02 no horizontal overflow |
| Same gate, builder part | 38 checks fail identically on the baseline build: the builder flow waits for a «الامتحانات المحفوظة» button that is no longer in the navigation. Stale harness, not R6b; the baseline build (`main` `76df1cdf`) gives the same 28 / 66 with the same 38 builder failures and 0 results / gradebook failures |
| `npm test`, full root suite | **1 178 / 1 178 files, 14 049 / 14 049 tests** on the reconciled head `58ea4c4a` |
| `npm run lint`, `npx tsc -b`, build (bundle guard), `git diff --check` | lint exit 0 (pre-existing warnings only); build (tsc -b + vite + bundle guard) exit 0, «bundle guard passed»; `git diff --check origin/main..HEAD` clean |
| colour ratchet | 2 294, unchanged |

---

# Phase UX-R8 — Messages

**Owner direction (2026-10-21):** start R8. It depends on R3 (merged), so it branches from `main` `59ffac32` as
`feature/ux-r8-messages`. It ran in parallel with R7 (PR #399); the two share no source file. The capture harness and this record
are shared, so whichever merges second takes a reconciliation merge.

**Reconciliation.** R6b (#398) merged into `main` (`f51bd90d`) during R8. R8 took `main` in with a normal merge commit
(`git merge origin/main`), without conflicts (R8 had not yet written this section), and the full root suite was re-run on the
merged head (§R8.5). Baselines: `59ffac32` → `f51bd90d`.

## R8.1 What changes for the user

No reference mockup shows the messages pages, so R8 applies the record's general patterns (§3.2: hairline card, 44 px rows,
sub-navigation, quiet surfaces) to the existing chat layout.

On the teacher's «الرسائل» page:
- **The workspace is a flat 8 px panel** without a card shadow (also the phone conversation card); the thread sits on white.
- **The student roster is 44 px rows split by hairlines** (52 px on a narrow screen), with 28 px avatars and medium-weight
  names; an unread student keeps a bold name and the «N جديدة» count.
- **The selected student is a grey row with bold text.** The primary tint and the inline-start accent bar are gone; the state is
  still carried by `aria-pressed` and the weight, never by colour alone.
- **The roster search is a plain 8 px field; «الكل / غير المقروءة» read as sub-navigation**: quiet items, the pressed one a grey
  pill with bold text instead of the navy fill.

In every conversation (teacher and student):
- **Quiet bubbles.** The other party's bubble is white on a hairline; the viewer's own is a soft primary tint with ink text
  (the solid primary gradient with white text is gone). The sender label, time, «مُعدّلة» mark and the edit / delete actions are
  re-inked for the tint. Bubbles have the 8 px radius and no shadow; the clipped first-message corner stays.
- **One composer look.** The teacher's and the student's composers share the same field (8 px, white, a `--eb-line-2` border) and
  send button (8 px). Their layouts stay as they were (the teacher's compact grid, the student's labelled field), since the
  labels and hints are pinned.

**Not changed, on purpose:** markup, roles, labels, unread texts, the announcements feed cards, the deleted-message look, the
day separators, the tabs, the class start state's layout, and all behaviour (polling, read markers, edit / delete, history).

## R8.2 Edit set

- **`src/messages/messages.css`:** one block appended at the end of the sheet. It wins by order at the same or a higher
  specificity than the rules it overrides; those rules stay as they are — notably the M.2 own-bubble rule, which
  `messagesPresentation.m2.test.tsx` pins verbatim. The block adds no stacking context, transition, colour literal or physical
  side (the M.2 slice to the end of the file forbids the last two). The sheet's colour count stays at 4.
- **`src/messages/messages.ux-r8.test.ts`:** new, 10 guards (the implementation commit message says 11; the count is 10).
- **`scripts/capture-visual-baseline-ux-r.mjs`:** messages fixtures in the shapes of the 5C / 5D / M.2 fixtures, and two scripted
  pages: `messages-thread` (class «العاشر – أ», the second roster row, so the unread student listed first keeps its count and the
  roster filters stay shown) and `student-messages` (the student's dedicated view). The roster unread summary is answered for
  class `c1` only, so the sidebar's «الرسائل» keeps its exact accessible name.

## R8.3 Fail-first evidence

Not applicable: R8 restyles and fixes no defect. Its invariants are proven by the mutation campaign below.

## R8.4 Mutation proof

Each mutant was planted alone in `src/messages/messages.css`. The run covered `src/messages`, `phase8b`, `src/designSystem`, the
colour ratchet and `ux2-shell-foundation`. The file was restored byte-for-byte after each (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the workspace card shadow returns | KILLED | ux-r8 «… flat 8 px panels…» |
| M2 | the student card back to the 16 px radius | KILLED | ux-r8 «… flat 8 px panels…» |
| M3 | the phone conversation card keeps the large radius | KILLED | ux-r8 «… (also the phone conversation card)…» |
| M4 | roster rows back to 56 px | KILLED | ux-r8 «the roster is 44 px hairline rows…» |
| M5 | the selected student back to the purple tint | KILLED | ux-r8 «the selected student is a grey row…» |
| M6 | the selected accent bar returns | KILLED | ux-r8 «… no accent bar…» |
| M7 | the pressed filter back to the navy fill | KILLED | ux-r8 «the roster filters read as sub-navigation…» |
| M8 | the own bubble back to the solid primary with white text | KILLED | ux-r8 «bubbles are quiet…» |
| M9 | the own time stays light (unreadable on the tint) | KILLED | ux-r8 «the own bubble's label, time, edited mark and actions are re-inked…» |
| M10 | the bubble shadow returns | KILLED | ux-r8 «bubbles are quiet…» |
| M11 | the student composer keeps its own look | KILLED | ux-r8 «one composer look…» |
| M12 | a colour literal in the R8 block | KILLED | colour ratchet; ux-r8 «… no colour literal…» |
| M13 | a physical side in the R8 block | KILLED | ux-r8 «… no physical side»; messagesPresentation.m2 «M.2 styles…» |
| M14 | a transition in the R8 block | KILLED | ux-r8 «adds no stacking context, no transition…» |
| M15 | editing the pinned M.2 own-bubble rule instead of overriding it | KILLED | ux-r8 «overrides instead of editing…»; messagesPresentation.m2 «M.2 styles…» |

15 / 15 KILLED, no TIMEOUT. `git status` showed only the R8 edit set before and after the campaign.

## R8.5 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture `messages`, `messages-thread`, `student-messages` (1440 / 1024 / 390 px), before and after | 9 / 9 clean each, no horizontal overflow, no page error. "Before" is the R7 build, whose messages CSS is identical to `main` |
| `npm test`, full root suite (R8 head before the merge, `7d4b5928`) | **1 178 / 1 178 files, 14 054 / 14 054 tests** |
| `npm test`, full root suite (merged head `7b6bbd92`) | **1 179 / 1 179 files, 14 062 / 14 062 tests** |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | 2 294, unchanged (`messages.css` stays at 4) |
| Browser gates | none is triggered by `src/messages/**` (no workflow path filter covers it); the Quality Gate runs on every PR |

---

# Phase UX-R9b — Learning: the reader chrome and the training runner

**Owner direction (2026-10-21):** start R9b. The plan has it follow R9a (#402), but the two share no stylesheet, so R9b branches
from `main` `f51bd90d` as `feature/ux-r9b-learning-reader` and keeps its own PR; they share only the capture harness and this
record, so whichever merges second takes a reconciliation merge.


**Reconciliation.** The create-class hotfix (#400) and R8 (#401) merged into `main` (`f746c51a`) while R9b waited for review. R9b
took `main` in with a normal merge commit (`git merge origin/main`). Conflicts: this record (kept both sections, R8 first) and the
capture harness (kept both: R8's messages fixtures and pages with R9b's, in one `SCRIPTED` list). The hotfix R9b had ported is
identical to `main`'s and merged without a change. The full root suite was re-run on the merged head. Baselines: `f51bd90d` →
`f746c51a`.

## R9b.1 What changes for the user

Chrome only, in normal reading (teacher and student): the lesson content, the diagrams and the interactive activities are
untouched, and presentation mode keeps its own look.
- **The top bar, the docked index, the page, the page bar, the unit contents and the training card are flat 8 px panels** without
  a resting shadow (each keeps its hairline border; the page bar stays sticky).
- **A pressed tool, the docked index toggle, the current index page and a chosen reading setting are a grey pill** with
  heading-coloured (bold) text, instead of the primary tint. The current index page keeps its guide mark, now heading-coloured.
- **Unit-contents rows hover grey**, not purple.
- **The training runner's panels are flat 8 px and its sticky submit bar has no shadow.**
- **Dark-theme safe.** The pill colour is a reader-scoped token (`--learning-reader-pressed`) that «داكن» re-maps to its own
  surface, so a light pill never sits under light text; the row hover uses `--eb-surface-2` (re-mapped) and never
  `--eb-chrome-hover`, which resolves on `:root` and would stay light inside the dark reader.

**Not changed, on purpose:** every content block (text, headings, callouts, examples, lists, tables, code, figures, practice
questions, activities), the search and notes sheets, the «المزيد» menu (a popover keeps its shadow), presentation mode, focus mode,
and the TOC's fine-pointer row heights (an L.1 decision).

## R9b.2 Edit set

- **`src/learning/reader/reader-enterprise-l1.css`:** one block appended at the end. `reader.css` is untouched: its 1024 px block
  must stay the last rule set. Every rule is scoped to normal reading (`:not(.is-presentation)`), except the portalled settings
  dialog's `.learning-reader-settings-option`. No stacking context, transition, colour literal, physical side, `!important` or
  `html[data-eb-reading-focus]` selector; a forced-colors rule keeps the chosen setting's 2 px Highlight border.
- **`src/learning/training/training.css`:** one block appended at the end.
- **`src/learning/reader/readerChrome.ux-r9b.test.ts`:** new, 9 guards.
- **`scripts/capture-visual-baseline-ux-r.mjs`:** a `/api/learning-content` mock that serves the API's own module data
  (`api/src/data/learning-content/<course>/<module>.json`, in the `{ ok, courseId, module }` shape), and a scripted page
  `learning-reader`: the teacher reader on its first content page (after the unit opener).

## R9b.3 Fail-first evidence

Not applicable: R9b restyles and fixes no defect. Its invariants are proven by the mutation campaign below.

## R9b.4 Mutation proof

Each mutant was planted alone in its sheet. The run covered `src/learning`, `src/designSystem`, `src/shell` and the colour ratchet.
The file was restored byte-for-byte after each (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the top bar keeps its resting shadow | KILLED | ux-r9b «the top bar, index, page, page bar and unit contents are flat…» |
| M2 | a pressed tool back to the primary tint | KILLED | ux-r9b «a pressed tool and the docked index toggle are a grey pill…» |
| M3 | the pill uses the light token directly (no dark re-map) | KILLED | same |
| M4 | the dark theme no longer re-maps the pill | KILLED | ux-r9b «dark-theme safe…» |
| M5 | the docked index keeps its shadow | KILLED | ux-r9b «… flat 8 px panels…» |
| M6 | the page keeps its large radius and shadow | KILLED | same |
| M7 | the page bar keeps its shadow | KILLED | same |
| M8 | the current index page back to the primary tint | KILLED | ux-r9b «the current index page is the same grey pill…» |
| M9 | the unit-lesson hover uses `--eb-chrome-hover` (stays light in «داكن») | KILLED | ux-r9b «dark-theme safe…» |
| M10 | the chosen setting back to the primary tint | KILLED | ux-r9b «a chosen reading setting is a grey pill…» |
| M11 | forced colors lose the chosen setting's Highlight border | KILLED | same |
| M12 | a rule reaches presentation mode (unscoped) | KILLED | ux-r9b «restyles normal reading only…» |
| M13 | a focus-mode selector in the block | KILLED | reader.l1.guards «focus mode hides exactly…»; ux-r9b |
| M14 | a colour literal in the block | KILLED | colour ratchet; reader.l1.guards; ux-r9b |
| M15 | a stacking context in the block (on the page) | KILLED | ux-r9b «add no stacking context…» |
| M16 | the training submit bar keeps its shadow | KILLED | ux-r9b «the training runner…» |
| M17 | the training panels keep the large radius | KILLED | same |

17 / 17 KILLED, no TIMEOUT. `git status` showed only the R9b edit set before and after the campaign.

## R9b.5 Browser gate, visual evidence and local validation

| Check | Result |
|---|---|
| L.8 reader browser gate (`scripts/check-learning-reader-browser-l8.mjs`, the workflow's pinned playwright-core and axe-core), R9b build | **passed**: 24 audits (student portal, student reader and its unit opener, teacher library, book and reader at 390 / 834 touch, 1024, 1440 px) and both journeys; 0 failures |
| Visual capture `learning-reader` (1440 / 1024 / 390 px), before and after | 3 / 3 clean each, no horizontal overflow, no page error. "Before" is the R7 build, whose reader CSS is identical to `main` |
| `npm test`, full root suite (`8e7f2af1`) | **1 179 / 1 179 files, 14 061 / 14 061 tests** |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | 2 294, unchanged (`reader-enterprise-l1.css` stays at 52, `training.css` at 0) |

---

# Phase UX-R9a — Learning: the library, the course home and the library search

**Owner direction (2026-10-21):** start R9 (the plan splits it into R9a and R9b; R9b depends on R9a). R9a depends on R3 (merged),
so it branches from `main` `f51bd90d` as `feature/ux-r9a-learning-library`. It ran in parallel with R7 (#399) and R8 (#401); they
share no source file, only the capture harness and this record.


**Reconciliation.** The create-class hotfix (#400) and R8 (#401) merged into `main` (`f746c51a`) while R9a waited for review. R9a
took `main` in with a normal merge commit (`git merge origin/main`). Conflicts: this record (kept both sections, R8 first) and the
capture harness (kept both: R8's messages fixtures and pages with R9a's, in one `SCRIPTED` list). The hotfix R9a had ported is
identical to `main`'s and merged without a change. The full root suite was re-run on the merged head. Baselines: `f51bd90d` →
`f746c51a`.

## R9a.1 What changes for the user

No reference mockup shows the learning pages, so R9a applies the record's general patterns (§3.2) to the teacher's
«المواد التعليمية».

The library:
- **The page header sits on the page**, not in a hero card; the book count is a quiet grey tag instead of a purple pill.
- **The course card is a flat 8 px hairline card** without a shadow, also on hover (the hover only darkens the hairline).
- **The filters are quiet 6 px selects; the library search block is a flat 8 px panel**, its field without a resting shadow.
  The field's focus ring is untouched.

The course home:
- **The book's sections are one hairline card of 48 px rows**, not a stack of eight cards. A row hovers grey (no purple) and its
  focus ring is drawn inside the card, which clips its rows.
- **«قراءة صفوفي»: the three figures are one hairline strip** whose cells draw their own hairlines (no grey empty cell when they
  wrap); the table headers are a quiet white band.

**Not changed, on purpose:** markup, roles, names, behaviour, the filters (still two `<select>`s, pinned as comboboxes), the
reader (R9b), and the shared Reader search sheet `learning-search.css` (R9a scopes its search-field rules to `.eb-lm-search`).

## R9a.2 Edit set

- **`learning-library-premium.css`, `search/learning-library-search.css`, `classReading/class-reading.css`:** one block appended at
  the end of each. Each wins by order (or by a higher specificity); no stacking context, transition, colour literal or physical
  side; every sheet stays at 0 colour literals. **`learning.css` is untouched** (its layout guards pin exact rule bodies).
- **`src/learning/learningLibrary.ux-r9a.test.ts`:** new, 9 guards (also: the blocks are last and appear once; learning.css and
  learning-search.css carry no R9a rule; every search-sheet rule is scoped to `.eb-lm-`).
- **`scripts/capture-visual-baseline-ux-r.mjs`:** a `learning` scene (class `c1` carries the book; the catalog and the class
  reading are served only while that scene is captured, so every other page's capture is unchanged) and two scripted pages:
  `learning-book` (the course home with «قراءة صفوفي» opened) and `learning-search` (the library search with results for
  «VLAN»).

## R9a.3 Fail-first evidence

Not applicable: R9a restyles and fixes no defect. Its invariants are proven by the mutation campaign below.

## R9a.4 Mutation proof

Each mutant was planted alone in its sheet. The run covered `src/learning`, `src/designSystem` and the colour ratchet. The file
was restored byte-for-byte after each (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the hero card returns (shadow) | KILLED | ux-r9a «the page header sits on the page…» |
| M2 | the count pill back to the purple tint | KILLED | ux-r9a «… the count is a quiet grey tag» |
| M3 | the course card keeps its shadow | KILLED | ux-r9a «the course card is a flat 8 px hairline card…» |
| M4 | the hover shadow returns | KILLED | ux-r9a «… also on hover» |
| M5 | the sections back to a stack of cards (gap) | KILLED | ux-r9a «the sections are ONE hairline card of rows…» |
| M6 | a section row loses its hairline | KILLED | ux-r9a «… split by hairlines…» |
| M7 | section rows below 44 px | KILLED | ux-r9a «… (≥ 44 px…)» |
| M8 | the row hover back to the purple tint | KILLED | ux-r9a «a row hovers grey…» |
| M9 | the focus ring drawn outside the clipping card | KILLED | ux-r9a «… its focus ring is drawn inside the clipping card» |
| M10 | the search block keeps its shadow | KILLED | ux-r9a «… the search block a flat 8 px panel…» |
| M11 | the shadowless field also drops the focus ring | KILLED | ux-r9a «… (focus ring kept)» |
| M12 | an unscoped search rule (reaches the shared Reader search) | KILLED | ux-r9a «… the shared Reader search sheet untouched» |
| M13 | class-reading figures back to boxed cells | KILLED | ux-r9a ««قراءة صفوفي»: the figures are ONE hairline strip…» |
| M14 | class-reading cells lose their own hairlines | KILLED | ux-r9a «… whose cells draw their own hairlines…» |
| M15 | a colour literal in the block | KILLED | colour ratchet; ux-r9a |
| M16 | a physical side in the block | KILLED | ux-r9a «add no stacking context, no transition, no colour literal and no physical side» |
| M17 | a transition in the block | KILLED | ux-r9a (same guard) |

17 / 17 KILLED, no TIMEOUT. `git status` showed only the R9a edit set before and after the campaign.

## R9a.5 Browser gate, visual evidence and local validation

| Check | Result |
|---|---|
| L.8 reader browser gate (`scripts/check-learning-reader-browser-l8.mjs`, CI's tools: playwright-core and axe-core from the workflow's pinned install), R9a build | **passed**: 24 audits (student portal, student reader and its unit opener, teacher library, teacher book, teacher reader at 390 / 834 touch, 1024, 1440 px: axe without serious / critical violations, no horizontal overflow, 44 px touch targets) and both journeys; 0 failures |
| Visual capture `learning`, `learning-book`, `learning-search` (1440 / 1024 / 390 px), before and after | 9 / 9 clean each, no horizontal overflow, no page error. "Before" is the R7 build, whose learning CSS is identical to `main` |
| `npm test`, full root suite (`9f2bf142`) | **1 179 / 1 179 files, 14 061 / 14 061 tests** |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | 2 294, unchanged (all three sheets stay at 0) |

---

# Phase UX-R7 — the Reports Center

**Owner direction (2026-10-21):** start R7. It depends on R3 (merged), so it branches from `main` `fc40d203` as
`feature/ux-r7-reports`. It ran in parallel with R6b (PR #398); the two share no source file, only this record.

**Reconciliation.** Two normal merge commits (`git merge origin/main`), each followed by a full root-suite run (§R7.5):
- P-9b (#397, API and docs only) merged into `main` (`59ffac32`) while R7 was validated; taken in without conflicts.
- R6b (#398) merged into `main` (`f51bd90d`) while R7 waited for review. Conflict: one, in this record, where both phases had
  appended a section; resolved by keeping both, R6b first. The two phases share no source file.
- The create-class hotfix (#400) and R8 (#401) merged into `main` (`f746c51a`) while R7 waited for its CI. Conflicts: this
  record (kept both sections, R8 first) and the capture harness (kept both: the reports mock and the messages fixtures, one
  `SCRIPTED` list with R7's report page and R8's two pages, and both the `open` and the `run` steps). The hotfix R7 had ported
  (`a06ce9ae`) is identical to `main`'s and merged without a change.
- Baselines: `fc40d203` → `59ffac32` → `f51bd90d` → `f746c51a`.

## R7.1 What changes for the user

On the «التقارير» hub:
- **The category filter reads as sub-navigation.** Quiet text items; the pressed one is a grey pill with bold text instead
  of the primary fill.
- **Each category is one hairline card of report rows**, not a grid of cards. A row is at least 44 px: the report's icon,
  name and description, then its «فتح التقرير» action. The action is quiet (one dark primary button per row would put eight
  on the page).

In an opened report:
- **The KPI figures are one hairline strip.** The cells draw their own hairlines (an inline-end and a block-end 1 px
  shadow) inside one bordered strip, so a report with 5 figures on a 3- or 4-column row paints no grey empty cell — the
  1 px-gap technique of R4–R6 would. Values read in ink; the tone accent bars stay.
- **Filters, project cards and tables are flat 8 px panels** without a card shadow; the sticky table header is a quiet white
  band and stays opaque.
- **Fix — the report charts have a height of their own** (§R7.3).

**Not changed, on purpose:** markup, names, labels, the catalogue, the filters' behaviour, CSV export and print. The
sidebar-spacing gutter, the workspace and the print rules of `reports-pro.css` are kept verbatim (pinned by the ux6b, p5d, r1
and r2 suites and the sidebar-spacing guard).

## R7.2 Edit set

- **`src/reports-pro.css`:** the hub, KPI, panel and table rules restyled in place; the chart heights added to the report
  result; phone rules (220 / 280 px charts, wrapping rows). No physical side, no colour literal (the sheet stays outside the
  colour baseline at 0), no `--eb-r-lg`, no `--eb-sh-xs/sm` card shadow.
- **`src/reports/reportsCenter.ux-r7.test.ts`:** new, 9 guards, including the chart-height fix and the untouched print rules.
- **`scripts/capture-visual-baseline-ux-r.mjs`:** a `/api/reports` mock (filters, a class's students, the assessments report,
  in the shapes of the ReportsCenter.ux6b fixtures) and a scripted page `report-assignments` that opens «التقييمات
  والواجبات», selects the class and **fails when the chart box or canvas is under 160 px**.

## R7.3 Fail-first evidence (the chart height)

**Defect.** The report charts draw with `maintainAspectRatio:false`, which takes the height of the parent box. That box,
`.eb-chart-canvas`, was sized only in `projects-pro.css`, a sheet loaded with the Projects pages. A visit that starts in the
Reports Center therefore rendered the distribution chart at Chart.js's 150 px fallback — a squashed chart — until the user
happened to open a Projects page first.

**Proof.** The scripted capture `report-assignments`, run against a build of each SHA:

| Build | 1440 px | 1024 px | 390 px | Check |
|---|---|---|---|---|
| baseline `fc40d203` | 150 px | 150 px | 150 px | **FAIL** (under 160 px) |
| R7 head | 260 px | 260 px | 220 px | PASS |

The R7 guard «the report result owns the chart box heights…» pins the rule (mutants M1 and M2 below).

## R7.4 Mutation proof

Each mutant was planted alone in `src/reports-pro.css`. The run covered `src/reports`, the Reports Center suites, the
sidebar-spacing guard, `ux2-shell-foundation` and the colour ratchet. The file was restored byte-for-byte after each
(SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the report chart height rule removed (the 150 px fallback returns on a cold visit) | KILLED | ux-r7 «the report result owns the chart box heights…» |
| M2 | the phone chart height removed | KILLED | ux-r7 «the report result owns the chart box heights…» |
| M3 | the pressed category filter back to the primary fill | KILLED | ux-r7 «the catalogue filter reads as sub-navigation…» |
| M4 | the catalogue back to a grid of cards | KILLED | ux-r7 «each group is ONE hairline card of report rows…» |
| M5 | report rows lose their 44 px height | KILLED | ux-r7 «each group is ONE hairline card of report rows (≥ 44 px…)» |
| M6 | one primary button per row again | KILLED | ux-r7 «the row action is quiet…» |
| M7 | the KPI strip uses the 1 px-gap technique (paints the empty cells of a wrapped row) | KILLED | ux-r7 «the KPI figures are ONE hairline strip…» |
| M8 | the KPI cells lose their own hairlines | KILLED | ux-r7 «the KPI figures are ONE hairline strip…» |
| M9 | the filters card shadow returns | KILLED | ux-r7 «cards and tables are flat 8 px…» |
| M10 | the table header back to the grey band | KILLED | ux-r7 «cards and tables are flat 8 px; the table header is quiet…» |
| M11 | a physical side property | KILLED | ux-r7 «each group is ONE hairline card…» (the rule no longer matches) |
| M12 | a colour literal | KILLED | colour ratchet «a stylesheet outside the baseline…»; ux2-shell-foundation |
| M13 | print shows the report controls again | KILLED | ux-r7 «the print rules are untouched…» |

13 / 13 KILLED, no TIMEOUT. `git status` showed only the R7 edit set before and after the campaign.

## R7.5 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture of «التقارير» and `report-assignments` (1440 / 1024 / 390 px) | clean, no horizontal overflow, no page error; chart 260 / 260 / 220 px |
| `npm test`, full root suite (R7 head before the merge) | 1 177 / 1 178 files, 14 047 / 14 048 tests. The one failure, `LearningReader.l2b.21e` «never renders a stored id outside the current published-only manifest», is in the learning reader (no file R7 touches); re-run alone: 13 / 13 pass |
| `npm test`, full root suite (merged head, after the reconciliation) | **1 178 / 1 178 files, 14 051 / 14 051 tests** |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | 2 294, unchanged (`reports-pro.css` stays at 0) |
| Browser gates | none is triggered by `reports-pro.css` (no workflow path filter covers it); the Quality Gate runs on every PR |

---

# Phase UX-R10 — Projects

**Owner direction (2026-10-21):** start R10. It depends on R3 (merged), so it branches from `main` `f746c51a` as
`feature/ux-r10-projects`. It ran in parallel with R7 (#399), R9a (#402), R9b (#403) and R11a; it shares no stylesheet with them,
only the capture harness and this record.

## R10.1 What changes for the user

No reference mockup shows the projects pages, so R10 applies the record's general patterns (§3.2).

The hub («المشاريع»):
- **Project cards are flat 8 px hairline cards** without a shadow, also on hover (the hover only darkens the hairline).
- **«فتح المشروع» is a quiet button** (one dark button per card otherwise).

The project tracker:
- **The toolbar and every panel are flat 8 px panels** without a resting shadow: the progress card, the student cards, the
  profile summary, the stage groups, the timeline, the heatmap card and the stage settings.
- **The section switch (and every segmented group of the workspace) is the reference segmented group** — one border, hairline
  dividers, the pressed option grey with bold text.
- **The student filters read as sub-navigation**: quiet items, the pressed one a grey pill with bold text (instead of the solid
  primary).
- **The headline figures are one hairline strip** whose cells draw their own hairlines, so 4 to 6 figures never paint a grey empty
  cell when a row wraps. Values read in ink; the tone accent bars stay.
- **«فتح ملف الطالب» on the student cards is a quiet button.**
- **The students table is an 8 px hairline frame with a quiet white header** (the sticky header keeps its opaque band).
- **Fix: on a phone the section switch's buttons are 44 px tall** (§R10.3).

**Not changed, on purpose:** every status colour — the heatmap cells and swatches, the stage-row status borders, the score-grid
cells and legend, the evaluation focus and finish panels, `.is-evaluation-pending`, the complete / stale card borders, the warn
count pills and the danger zone; the chart colours; the print rules; `performance.css` (shared with the student portal); the
markup and behaviour.

## R10.2 Edit set

- **`src/projects-pro.css`:** one block appended at the end. Every rule is scoped to `.eb-projects-hub` or
  `.eb-project-workspace`, because the chips, segmented groups, stat grids, tables and charts are shared with the student portal,
  the dashboard and the reports. Token-only, no physical side and no `padding-inline-start/end` (the 8B / sidebar-spacing guards),
  only the 767 px breakpoint, no transition, no stacking context; the 8C block slice and the 8B gutter rules are untouched.
- **`src/projects/projects.ux-r10.test.ts`:** new, 11 guards.
- **`scripts/capture-visual-baseline-ux-r.mjs`:** project fixtures (the ProjectWorkspace.ux6 shapes: two projects, project
  794589 for class `c1` with six students, a profile, analytics and the stage template; the sidebar totals stay 0 so «المشاريع»
  keeps its exact accessible name) and five scripted pages: `project-dashboard`, `project-students`, `project-profile`,
  `project-analytics` (the first chart box and canvas must be at least 160 px tall) and `project-settings`.

## R10.3 Fail-first evidence (the phone section switch)

**Defect.** `projects-pro.css` gave `.eb-project-views > button` `min-height:40px` inside `@media (max-width:767px)`, a later and
more specific rule than the shell's 44 px phone floor for segmented buttons, so the five section buttons were 40 px touch targets
on a phone.

**Proof.** The guard «the last min-height a phone gives the view-switch buttons is at least 44 px», run against `f746c51a` (the
test file copied into a detached worktree of the baseline):

| SHA | Result |
|---|---|
| `f746c51a` (baseline) | **FAIL** — `expected 40 to be greater than or equal to 44` |
| `68b0571d` (R10) | pass |

Mutant M1 below plants the defect back.

## R10.4 Mutation proof

Each mutant was planted alone in `src/projects-pro.css`. The run covered `src/projects`, `ux2-shell-foundation`, `phase8b`, the
sidebar-spacing guard, `src/designSystem` and the colour ratchet. The file was restored byte-for-byte after each (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the phone section switch back to 40 px (the fixed defect) | KILLED | ux-r10 «the last min-height a phone gives…» |
| M2 | the hub card keeps its shadow | KILLED | ux-r10 «the hub card is a flat 8 px hairline card…» |
| M3 | the hub card hover shadow returns | KILLED | same |
| M4 | one dark «فتح المشروع» per card again | KILLED | same |
| M5 | one dark «فتح ملف الطالب» per card again | KILLED | ux-r10 «the student card's «فتح ملف الطالب» is quiet too…» |
| M6 | the workspace panels keep their shadow | KILLED | ux-r10 «the toolbar and the workspace panels are flat…» |
| M7 | the pressed segment back to white with a shadow | KILLED | ux-r10 «the switches are the reference segmented group…» |
| M8 | the pressed filter back to the solid primary | KILLED | same |
| M9 | the figures back to separate cards (gap) | KILLED | ux-r10 «the headline figures are ONE hairline strip…» |
| M10 | the figure cells lose their own hairlines | KILLED | same |
| M11 | the students table header back to the grey band | KILLED | ux-r10 «the students table is an 8 px hairline frame…» |
| M12 | an unscoped chip rule (reaches the student portal filters) | KILLED | ux-r10 «scopes every rule to the projects pages…» |
| M13 | the restyle reaches a status colour (heatmap cell) | KILLED | same |
| M14 | a colour literal in the block | KILLED | colour ratchet; ux2-shell-foundation «UX-6a projects-pro.css is token-only…» |
| M15 | a physical padding side in the block | KILLED | phase8b «8B-E projects never sit flush…»; sidebar-spacing guard; ux-r10 |
| M16 | a stacking context in the block | KILLED | ux-r10 «adds no stacking context…» |

16 / 16 KILLED, no TIMEOUT. `git status` showed only the R10 edit set before and after the campaign.

## R10.5 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture `projects`, `project-dashboard`, `-students`, `-profile`, `-analytics`, `-settings` (1440 / 1024 / 390 px), before and after | 18 / 18 clean each, no horizontal overflow, no page error; the analytics chart box and canvas 260 / 260 / 220 px. "Before" is the R7 build, whose projects CSS is identical to `main` |
| `npm test`, full root suite (`68b0571d`) | **1 181 / 1 181 files, 14 074 / 14 074 tests** |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | 2 294, unchanged (`projects-pro.css` stays at 0) |
| Browser gates | none is triggered by `projects-pro.css` (no workflow path filter covers it); the Quality Gate runs on every PR. The manual `check-project-*-p*` gates were not run (their checks — sticky score-grid headers, hero geometry, ≥ 44 px review buttons and approve toggle — concern rules R10 does not touch) |

---

# Phase UX-R11a — The exam bank and its surroundings

**Owner direction (2026-10-21):** start R11a. It depends on R3 (merged), so it branches from `main` `f746c51a` as
`feature/ux-r11a-bank`. It ran in parallel with R10 (#404) and the open R7 / R9a / R9b PRs; it shares no stylesheet with them, only
the capture harness and this record.

## R11a.1 What changes for the user

No reference mockup shows these pages, so R11a applies the record's general patterns (§3.2) to «بنك الامتحانات», «استيراد من
ملف», «مراجعات النشر» and «سجل النشاط».

The bank:
- **The view switch is the reference segmented group** (one border, hairline dividers, the pressed option grey with bold text).
- **The five figures are one hairline strip** whose cells draw their own hairlines (no grey empty cell when a row wraps).
- **The distribution cards and the questions table are flat 8 px panels**; the table header is a quiet white band.
- **The saved exams and the official library are one hairline card of 44 px rows**, not a stack of cards.
- **Fix: on a phone the page fits the screen** (§R11a.3).

«استيراد من ملف»:
- **The URL forms and the drop zone take the 8 px radius.**
- **Fix: on a phone the page fits the screen** (§R11a.3).

«مراجعات النشر»:
- **The stage tabs read as sub-navigation**: the selected tab is a grey pill with bold text. Before, it was an indigo pill drawn
  from the fallbacks of undefined `--accent*` variables.
- **The tasks are one hairline card of 44 px rows**, each with a quiet «فتح المهمة» (one dark button per row otherwise).
- **The page has the symmetric logical gutter** (16 px, 24 px from 768 px); it sat flush against the sidebar.
- **Fix: the page is styled on a first visit** (§R11a.3).

«سجل النشاط»:
- **The navy hero banner becomes a plain page header** (heading-coloured text, a quiet 44 px «تحديث» instead of a native button).
- **The records card is a flat 8 px hairline panel; the table header is a quiet white band.**

**Not changed, on purpose:**
- **Status colours:** the bank's source badges, «يحتاج مراجعة», the correct option, the inbox stage pills, the decision notes and
  the workflow's current step.
- **Shared pieces:** the builder's governance panel and the bank picker (both inside the builder, R11b), the smart import wizard
  (opened from the builder), and the classic builder's shared `.builder-card`.
- **Markup and behaviour.**

## R11a.2 Edit set

- **`src/bank-pro.css`:** one block appended at the end, every rule scoped to `.eb-bank`. Token-only. It has no `.eb-nav` or
  `.eb-shell-content` substring and no 1024 px bank media (the sidebar-spacing guard), and no physical side.
- **`src/builder-pro.css`:** one block appended at the end, scoped to the import panel's own `import-*` classes.
- **`src/governance/reviewInbox.css`:** one block appended at the end, every rule scoped to `.gov-inbox` (the builder's
  governance panel shares this sheet). It uses tokens only; the sheet's 32 legacy literals are untouched.
- **`src/page-parts.css`:** one block appended at the end, scoped to the audit page (`.teacher-platform-inner > .platform-hero` —
  the only `.platform-hero` user — `.platform-card:has(.audit-history-table)` and `.audit-history-table`). It is token-only, as
  the UX-4 section to the end of the file requires; it adds no transition and no phone `min-height` below 44 px.
- **`src/governance/ReviewInboxPage.tsx`:** one import line, `import "../structured-builder.css";`, before its own sheet (the
  fix below). No markup or logic change.
- **`src/bank/bankSurroundings.ux-r11a.test.ts`:** new, 12 guards.
- **`scripts/capture-visual-baseline-ux-r.mjs`:** bank questions and saved exams, review-inbox tasks and audit events (the
  ExamBankPage.ux6c, ReviewInboxPage.14b and AuditHistoryPanel fixture shapes), and two scripted pages, `bank-questions` and
  `bank-exams`.

## R11a.3 Fail-first evidence (the three fixes)

**Two phone overflows** (both assigned to R11a in §7). Measured by the capture harness: `document.documentElement.scrollWidth`
against a 390 px viewport. "Before" is the R7 build, whose CSS for these pages is identical to `main` `f746c51a`.

| Page | Cause | Before | After |
|---|---|---|---|
| «بنك الامتحانات» | the overview's three actions («إنشاء امتحان جديد · إضافة سؤال · استيراد أسئلة», 430 px on one line) sat in a section-actions group that never shrinks (`flex: 0 0 auto`) | **458 px** (FAIL) | 390 px |
| «استيراد من ملف» | the URL forms' grid track was at least 260 px and the address field kept its intrinsic width, so the two «استيراد» buttons ran 15 px past the screen edge | **405 px** (FAIL) | 390 px |

The bank's fix also lets its section header wrap (the title block keeps at least 14rem), so the actions move under the title
instead of squeezing it into a one-word-wide column.

**Unstyled first visit of «مراجعات النشر».**
- **Cause:** the page renders the builder's base classes (`sb-btn`, `sb-btn-primary`, `sb-hint`, `sb-banner`, `sb-bp-h`,
  `sb-gov-*`). Their sheet, `structured-builder.css`, was imported only by the builder, the import wizard and the structured
  import dialog.
- **Effect:** a session that opened the inbox first showed native buttons and an unstyled heading (the "before" capture shows it).
- **Baseline:** `f746c51a`'s `ReviewInboxPage.tsx` has no import of that sheet.
- **Fix:** the page imports it before its own sheet, so its own rules still win ties.
- **Guard:** the R11a suite pins that import, and checks that each base class the page and its viewer render is defined in that
  sheet.

## R11a.4 Mutation proof

Each mutant was planted alone in its file. The run covered `src/bank`, `src/governance`, `ux2-shell-foundation`, the 14B
governance guards, the sidebar-spacing guard, `src/designSystem`, the colour ratchet, `src/students` and `phase8b`. The file was
restored byte-for-byte after each (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | bank: the actions group unbounded (the overflow returns) | KILLED | ux-r11a «bank: the overview's actions wrap inside the page…» |
| M2 | bank: the header no longer wraps | KILLED | same |
| M3 | import: the 260 px grid track returns | KILLED | ux-r11a «import: the URL forms' grid track never exceeds the panel…» |
| M4 | import: the address field keeps its intrinsic width | KILLED | same |
| M5 | inbox: the builder base sheet import removed | KILLED | ux-r11a «review inbox: the page loads the sheet…» |
| M6 | bank: the pressed segment back to white with a shadow | KILLED | ux-r11a «the view switch is the reference segmented group…» |
| M7 | bank: the figures back to separate cards | KILLED | same |
| M8 | bank: the figure cells lose their own hairlines | KILLED | same |
| M9 | bank: the table header back to the grey band | KILLED | ux-r11a «flat 8 px panels, a quiet white table header…» |
| M10 | bank: the exam list back to separate cards | KILLED | same |
| M11 | inbox: the selected tab back to the indigo fallback | KILLED | colour ratchet; ux-r11a |
| M12 | inbox: the tasks back to separate cards | KILLED | ux-r11a «inbox: the stage tabs read as sub-navigation…» |
| M13 | inbox: the page gutter removed | KILLED | ux-r11a «inbox: the page has the symmetric logical gutter…» |
| M14 | inbox: an unscoped rule (reaches the governance panel) | KILLED | ux-r11a «scope every rule to its page…» |
| M15 | log: the navy hero banner returns | KILLED | ux-r11a «log: the navy banner is a plain page header…» |
| M16 | log: «تحديث» below the 44 px touch target | KILLED | same |
| M17 | log: an unscoped platform-card rule (reaches the roster and the dashboard) | KILLED | ux-r11a «scope every rule to its page…» |
| M18 | a colour literal in the audit block | KILLED | colour ratchet; ux-r11a |
| M19 | a physical side in the bank block | KILLED | ux-r11a «add no stacking context, no transition, no colour literal, no physical side» |

19 / 19 KILLED, no TIMEOUT. `git status` showed only the R11a edit set before and after the campaign.

## R11a.5 Browser gate, visual evidence and local validation

| Check | Result |
|---|---|
| U.1 Classes & Students browser gate (`scripts/check-classes-students-browser-u1.mjs`, CI's pinned playwright-core and axe-core; triggered by `page-parts.css`), R11a build | **passed**: 85 checks, 0 failures |
| Visual capture `bank`, `bank-questions`, `bank-exams`, `import`, `reviews`, `audit` (1440 / 1024 / 390 px) | before: 16 / 18 clean (bank 458 px, import 405 px on the phone); after: **18 / 18 clean** |
| `npm test`, full root suite (`299ff626`) | **1 181 / 1 181 files, 14 076 / 14 076 tests** |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | 2 294, unchanged (`bank-pro.css` stays at 0; the other sheets gain no literal) |

---

# Phase UX-R11b — The exam builder

**Owner direction (2026-10-21):** close every open phase first, then start R11b. R11a (#405) merged, so R11b branches from
`main` `2d19b070` as `feature/ux-r11b-builder`. No other R phase is open.

## R11b.1 What changes for the user

The builder destination «باني الامتحان» opens «امتحاناتي» (the Exam Studio's home) under the setup zone, and an exam opens in the
**Exam Studio**: the default layout since 21F.9. No reference mockup shows the builder, so R11b applies the record's general
patterns (§3.2).

The Exam Studio:
- **The top bar is white on a hairline** (it was navy). Text, crumbs and tools take the heading and muted colours; «حفظ مسودة»
  and the tools are quiet bordered buttons; the next-step action stays the one primary button.
- **The four steps are a bordered group, and the current step is a grey pill with bold text** (it was a white pill on the navy
  bar); its number sits on a heading-coloured disc; completed steps show a purple disc with a check.
- **One accent:** the purple primary family replaces the turquoise (completed steps, the save dot, the section badge, the meters,
  the readiness ring, the AI insert action).
- **The canvas is the page background, and the section and question cards and the review panels are flat 8 px hairline cards**
  (they had a resting shadow and 12 px corners). The active question keeps its 3 px primary ring.

«امتحاناتي»:
- **It sits on the page** (no grey box inside the white card).
- **The create tiles and the exam cards are flat 8 px hairline cards**; an exam card loses its 4 px coloured top rule, and its
  «فتح» is quiet (one dark button per card otherwise).
- **The pressed status filter is a grey pill with bold text** (it was a navy pill); the continue banner is a hairline panel.
- **Fix: on a phone the create tiles stay inside «امتحاناتي»** (§R11b.3).

The setup zone above it («إعداد الامتحان — الذكاء الاصطناعي، الامتحانات المحفوظة، القوالب»):
- **The zone and the «ماذا تريد في الامتحان؟» card are flat 8 px hairline panels.** The card loses its 3 px primary rule and the
  decorative tinted square that sat over its model picker; the «AI» badge is a plain primary tile.

**Not changed, on purpose:**
- **Status colours:** the validation tones (an error card, «خطأ يمنع الاعتماد», warnings), the readiness verdict, the publish
  timeline's states.
- **The classic builder** (`structured-builder.css`, the `.builder-card` / `.question-card` shell): the teacher's opt-out layout
  («الواجهة الكلاسيكية»), unchanged. The exam cover (`structured-cover.css`) and the student preview (`ExamPreview`) draw the exam
  paper the student sees; they belong to R15.
- **Markup and behaviour**, focus mode, the studio's touch targets, focus ring and reduced-motion rules.

## R11b.2 Edit set

- **`src/studio/studio.css`:**
  - **Token block:** the eleven brand tokens (`--st-top*`, `--st-teal*`, `--st-canvas`) now name canonical `--eb-*` tokens, and
    the card shadows are `none` (the active card keeps a 3 px `--eb-primary-050` ring). The names are kept, so every studio rule
    follows. No literal colour is left in the sheet: it leaves the colour baseline (12 → 0).
  - **One block appended at the end**, every rule scoped to `.st-studio` or `.st-home`: the bar's hairline, the step group, the
    current step's pill and disc, 8 px cards, the home's flat layout and the phone fix. Tokens only, logical sides only.
- **`src/builder-pro.css`:** one block appended after the R11a block, scoped to `.builder-setup-zone` / `.builder-setup-body`.
- **`src/studio/studioDesign.21f2.test.tsx`** (updated explicitly, §5): its brand-pair contrast check read literal hex values from
  the token block. It now resolves a token through `design-tokens.css`, and checks the pairs R11b draws: text and muted text on the
  white bar (≥ 7 and ≥ 4.5), the accent text on its tint, a completed step's number on the accent disc, the current step's number
  on its heading disc and the current step's label on its grey pill. The invariant (AA on every brand pair) is kept.
- **`src/bank/bankSurroundings.ux-r11a.test.ts`** (updated explicitly): a block now runs to the next `/* UX-R` phase block, so R11b
  can append to `builder-pro.css`; the R11a rules are pinned exactly as before.
- **`scripts/ux-color-inventory.baseline.json`:** lowered to **2 282** (`studio.css` 12 → 0).
- **`src/studio/studio.ux-r11b.test.ts`:** new, 13 guards.
- **`scripts/capture-visual-baseline-ux-r.mjs`:** five scripted pages, `studio-home` (it fails when a create tile spills out of
  «امتحاناتي») and a blank exam on each step: `studio-setup`, `studio-content`, `studio-review`, `studio-publish`.

## R11b.3 Fail-first evidence

**The phone create tiles spilled out of «امتحاناتي».**
- **Cause:** `.st-home` is a grid with one implicit `auto` track, which never shrinks below its content. On a 390 px phone the
  create grid kept its 334 px min-content width inside a 300 px content box.
- **Effect:** the two tiles of each row ran 20 px past the inline-end edge of «امتحاناتي» (and past its grey box).
- **Measured by the capture harness** (the `studio-home` check), on a build of each SHA:

| Build | 390 px | 1024 px | 1440 px |
|---|---|---|---|
| `main` `2d19b070` (baseline) | **FAIL**: «a create tile spills 20 px out of «امتحاناتي»» | clean | clean |
| R11b | clean | clean | clean |

- **Fix:** `.st-home { grid-template-columns: minmax(0, 1fr) }`. **Guard:** the R11b suite «the home's single grid track may
  shrink below its content…» (mutant M1).

## R11b.4 Mutation proof

Each mutant was planted alone in its file. The run covered `src/studio`, `src/bank`, the 21E.2 exam-list guards,
`src/designSystem`, the colour ratchet and `ux2-shell-foundation`. The file was restored byte-for-byte after each (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | home: the grid track no longer shrinks (the phone tiles spill again) | KILLED | ux-r11b «the home's single grid track may shrink…» |
| M2 | palette: the navy bar returns | KILLED | colour ratchet; ux-r11b «the bar is white with heading text…» |
| M3 | palette: the turquoise accent returns | KILLED | same |
| M4 | palette: the bar's muted text too light on the white bar | KILLED | 21F.2 «the brand pairs meet WCAG AA…»; ux-r11b |
| M5 | cards: the resting card shadow returns | KILLED | ux-r11b «cards rest flat…» |
| M6 | chrome: the bar loses its hairline | KILLED | ux-r11b «the bar sits on a hairline…» |
| M7 | chrome: the current step back to a white pill (invisible on the white bar) | KILLED | ux-r11b «the current step is a grey pill…» |
| M8 | chrome: the current step's number back to a white disc | KILLED | same |
| M9 | cards: the 12 px radius returns | KILLED | ux-r11b «the section cards, question cards and review panels…» |
| M10 | home: the exam card's 4 px coloured top rule returns | KILLED | ux-r11b «sits on the page…» |
| M11 | home: one dark «فتح» per card again | KILLED | ux-r11b «each card's «فتح» is quiet…» |
| M12 | home: the pressed filter back to a white pill | KILLED | same |
| M13 | a literal colour outside the token block | KILLED | colour ratchet; 21F.2; ux-r11b |
| M14 | an unscoped rule (reaches the classic builder) | KILLED | 21F.2 «every rule is scoped…»; ux-r11b |
| M15 | a physical side in the studio block | KILLED | 21F.2 «uses logical properties only»; ux-r11b |
| M16 | setup: the decorative square returns over the model picker | KILLED | ux-r11b «the zone and its «ماذا تريد في الامتحان؟» card…» |
| M17 | setup: the 3 px primary rule returns | KILLED | same |
| M18 | setup: the zone keeps its card shadow | KILLED | same |
| M19 | setup: an unscoped prompt-card rule | KILLED | ux-r11b «scope every rule…» |

19 / 19 KILLED, no TIMEOUT. `git status` showed only the R11b edit set before and after the campaign. Under the campaign's load,
`studioSetupPublish.21f7` also failed in a few runs (a timing case; vitest does not process CSS, so no mutant can reach it); run
alone it passes 9 / 9 twice. No mutant relies on it.

## R11b.5 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture `studio-home`, `studio-setup`, `studio-content`, `studio-review`, `studio-publish`, `bank`, `import` (1440 / 1024 / 390 px) | before: 20 / 21 clean (the phone tile spill); after: **21 / 21 clean** |
| `npm test`, full root suite (`6c1b0273`) | 1 186 files, 14 123 / 14 124 tests. The one failure, `AppEvaluationFinish.9g` «G3/G5 the last student…», is outside R11b (no CSS is processed under vitest) and timing-sensitive in this container: run alone it failed once and passed once (8 / 8), and the same case failed on `main` `5c207529` here earlier the same day |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | **2 282** (was 2 294; `studio.css` 12 → 0) |
| Browser gates | none is triggered by `src/studio/**` or `builder-pro.css` (U.1 covers `page-parts.css`, `platform.css`, `src/ui/**`); the Quality Gate runs on every PR |

---

# Phase UX-R12 — The grading workspace

**Owner direction (2026-10-21):** start R12 once R11b (#406) merged. It depends on R6b (merged), so it branches from `main`
`6da77067` as `feature/ux-r12-review`. No other R phase is open.

## R12.1 What changes for the user

The grading workspace («تصحيح الآن» / «عرض التصحيح» in the gradebook) opens a student's attempt with its summary, filters, a
question navigator and the question cards with the grade rows. No reference mockup shows it, so R12 applies the record's general
patterns (§3.2). **Presentation only:** every grade, answer key, status, the `reviewRequired` route, the save body and the unsaved-
change guard are unchanged.

- **The attempt summary is one hairline strip** (twelve grey boxes before); its cells draw their own hairlines.
- **The selected attempt and the selected filter read as a grey pill** (a raised white tab and a navy fill before). The
  «يحتاج إلى تصحيح يدوي» filter keeps its warn tone: it is a status, and the most important filter of the page.
- **The navigator is a white 8 px panel; the question cards are flat 8 px cards** without a resting shadow. The current question
  keeps its 2 px primary ring, and every status edge (correct, wrong, partial, pending) is unchanged.
- **The decorative gradient bar before each question number is gone;** the save button loses its glow.
- **The internal eyebrow «Manual Review · Phase 2.0D» is no longer shown** (an English development label above the exam title;
  the markup keeps it, so this is reversible by deleting one rule if the owner wants it back).
- **Fix: on a phone the exam title keeps the header's row** (§R12.3).

**Not changed, on purpose:** the status tones (`rv-status`, `rv-mode`, the choice ✓ / ✗, the technical-hold banner, the
needs-review edge), the answer and key panels' colours, markup and behaviour, the 21G.7 touch targets, the UX-8 dvh rules.

## R12.2 Edit set

- **`src/review-workspace.css`:** one block appended at the end (after the 21G.7 coarse block, which the a11y gate reads as the
  sheet's last coarse block), every rule scoped to `.rv-workspace`. Tokens only, logical sides only, no stacking context, no
  transition; its phone rules are in a `max-width: 767px` block. Its two `#fff` became `var(--eb-surface)`.
- **`src/review-pro.css`:** exact-value literals name their tokens (no colour changes): `#fff` → `--eb-surface` (7),
  `#15803d` → `--eb-success-tx`, `#b45309` → `--eb-warn-tx`, `#b42318` → `--eb-danger-tx`, `#fef2f2` → `--eb-danger-bg`.
- **`scripts/ux-color-inventory.baseline.json`:** lowered to **2 266** (`review-pro.css` 25 → 11, `review-workspace.css` 33 → 31).
- **`src/review/reviewWorkspace.ux-r12.test.ts`:** new, 11 guards.
- **`scripts/capture-visual-baseline-ux-r.mjs`:** a `GET /api/assignment-review` mock (the reviewWorkspace.ux003 fixture shapes: a
  correct and a wrong choice, two open answers pending a manual mark, a partial and an unanswered question) and two scripted pages,
  `review-workspace` and `review-pending` (the pending filter), opened from the gradebook's «تصحيح الآن». Each fails when the exam
  title wraps while narrower than half the header.

## R12.3 Fail-first evidence

**The exam title was squeezed on a phone.**
- **Cause:** the header (`.review-top`) is a non-wrapping flex row of the title block, the student navigation (21G.5) and
  «إغلاق». Below 768 px the navigation asks for the full width (`inline-size: 100%`), but the row never wraps, so all three shrink
  together and the title block is left a sliver.
- **Measured by the capture harness** (the `review-*` check), on a build of each SHA:

| Build | 390 px | 1024 px | 1440 px |
|---|---|---|---|
| `main` `6da77067` (baseline) | **FAIL**: «the review title is squeezed to 72 of 332 px (3 lines)» | clean | clean |
| R12 | clean | clean | clean |

- **Fix:** below 768 px the header wraps; the title block takes the width beside «إغلاق» and the student navigation moves to its
  own row (`order: 2`). **Guard:** the R12 suite «the header wraps below 768 px…» (mutants M1–M3).

## R12.4 Mutation proof

Each mutant was planted alone in its file. The run covered `src/review`, the three AssignmentReview suites (R14 grading, 21G.5
navigation, 21E.3 technical hold), the 21G.7 a11y gate, `ux2-shell-foundation`, the colour ratchet and `src/designSystem`. The
file was restored byte-for-byte after each (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | phone: the header no longer wraps (the title is squeezed again) | KILLED | ux-r12 «the header wraps below 768 px…» |
| M2 | phone: the title block no longer takes the remaining width | KILLED | same |
| M3 | phone: the student navigation stays between the title and «إغلاق» | KILLED | same |
| M4 | summary: back to separate grey boxes | KILLED | ux-r12 «the attempt summary is ONE hairline strip…» |
| M5 | summary: the cells lose their own hairlines | KILLED | same |
| M6 | attempt tabs: the selected attempt back to a raised white tab | KILLED | ux-r12 «the selected attempt is a grey pill…» |
| M7 | filters: the selected filter back to the navy fill | KILLED | ux-r12 «scopes every rule… never restyles a status tone» |
| M8 | filters: the restyle reaches the pending (warn) filter | KILLED | same |
| M9 | navigator: back to the grey panel | KILLED | ux-r12 «… the navigator a white 8 px panel» |
| M10 | questions: the card shadow returns | KILLED | ux-r12 «question cards are flat 8 px cards…» |
| M11 | questions: the current question loses its ring | KILLED | same |
| M12 | status: a correct question's edge restyled | KILLED | ux-r12 «… never restyles a status tone» |
| M13 | the internal eyebrow shows again | KILLED | ux-r12 «the internal «Manual Review · Phase 2.0D» eyebrow is not shown…» |
| M14 | a colour literal in the block | KILLED | colour ratchet; ux-r12 |
| M15 | an unscoped rule (reaches every `.platform-primary`) | KILLED | ux-r12 «scopes every rule to the workspace…» |
| M16 | a stacking context in the block | KILLED | ux-r12 «adds no stacking context…» |
| M17 | review-pro: a converted literal returns | KILLED | colour ratchet; ux-r12 «exact-value literals become tokens» |
| M18 | the block gains a coarse-pointer media (it would become the sheet's last coarse block) | KILLED | 21G.7 a11y gate; ux-r12 |

18 / 18 KILLED, no TIMEOUT. `git status` showed only the R12 edit set before and after the campaign.

## R12.5 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture `review-workspace`, `review-pending` (1440 / 1024 / 390 px) | before: 4 / 6 clean (the squeezed title on the phone); after: **6 / 6 clean** |
| `npm test`, full root suite (`8d47dbd9`) | **1 187 / 1 187 files, 14 133 / 14 133 tests** |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | **2 266** (was 2 282) |
| Browser gates | none is triggered by the review sheets (no workflow path filter covers them); the Quality Gate runs on every PR |

---

# Phase UX-R13 — Learning games

**Owner direction (2026-10-21):** start R13, and carry on through every remaining phase in sequence without asking. It depends
on R3 (merged), so it branches from `main` `ea357456` (after R12, #407) as `feature/ux-r13-games`.

## R13.1 What changes for the user

The teacher's «الألعاب التعليمية» (the games hub, the number-conversion preview and the live-challenge authoring) and the
student's games page (and its «انضم إلى غرفة» form). No reference mockup shows them, so R13 applies the record's general patterns
(§3.2). **Presentation only:** no game rule, score, timer, session, room code or stored value changes.

- **Game cards and the game panels are flat 8 px hairline cards;** each game card's action is a quiet button (one dark button
  per card otherwise). The mode tags and the restrained mode edge stay: they name the mode.
- **The selected path, the selected assistance level and the selected question source read as the grey pill** (a dark pill and
  a raised white tab before). The live-challenge cards lose their resting shadow and their 3 px primary rule.
- **Fix 1: the teacher's game views no longer paint the student portal's background** (§R13.3).
- **Fix 2: the room code is typed in a monospace face again** (§R13.3).

## R13.2 Edit set

- **`src/design-tokens.css`:** `--eb-font-mono` defined (`ui-monospace, "SFMono-Regular", "Cascadia Mono", Consolas, "Liberation
  Mono", monospace`). Two sheets read it without a fallback: `games/games.css` (the room code, its input) and
  `learning/visuals/visuals.css` (the learning diagrams' token labels).
- **`src/designSystem/tokensV2.ux-r1.test.ts`:** the two `--eb-font-mono` entries leave `KNOWN_UNDEFINED`, as the test asks once
  a token is defined (its list may only shrink).
- **`src/games/games.css`:** one block appended at the end, scoped to the games classes; three exact `color:#fff` became
  `var(--eb-surface)`.
- **`src/games/liveChallenge/LiveChallengeAuthoring.test.tsx`** (updated explicitly): its scope guard reads the Live Challenge
  section up to the next `/* UX-R` phase block, so R13 can append after it; the section is pinned exactly as before.
- **`scripts/ux-color-inventory.baseline.json`:** lowered to **2 263** (`games.css` 4 → 1).
- **`src/games/games.ux-r13.test.ts`:** new, 11 guards.
- **`scripts/capture-visual-baseline-ux-r.mjs`:** four scripted pages: `games-conversion` and `games-live` (each fails when the
  teacher view paints a background image), `student-games`, and `student-games-join` (fails when the room code field is not
  monospace).

## R13.3 Fail-first evidence

**1. The student band in the teacher page.**
- **Cause:** `NumberConversionGame` and `LiveChallengeGenerator` render their root with the student surface's classes
  (`student-portal eb-student-shell eb-games-surface`) in both portals. Inside the teacher shell this painted the student
  portal's gradient band (`platform.css` `.student-portal`, `student-portal-v2.css` `.eb-student-shell`) and stretched the view
  to a full screen height.
- **Fix:** `.eb-shell-content .eb-games-surface { background: transparent; min-height: 0 }`; the student destination is not inside
  `.eb-shell-content`, so it keeps its surface (guarded).

**2. The room code in the body font.**
- **Cause:** `--eb-font-mono` was never defined, so `font-family: var(--eb-font-mono)` was invalid at computed-value time and the
  field inherited the Arabic body face.
- **Fix:** the token is defined in `design-tokens.css`.

Both measured by the capture harness on a build of each SHA:

| Build | `games-conversion`, `games-live` (1440 / 1024 / 390 px) | `student-games-join` (1440 / 1024 / 390 px) |
|---|---|---|
| `main` `ea357456` (baseline) | **FAIL**: «the teacher game view paints the student background: linear-gradient(rgb(243, 239, 250) 0px, …» | **FAIL**: «the room code field is not monospace: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif» |
| R13 | clean | clean |

**Guards:** the R13 suite «--eb-font-mono is defined once…» (mutants M1, M2) and «inside the teacher shell a game view drops
the student portal's background…» (M3–M5); the UX-R1 undefined-token test also fails if the token disappears (M1).

## R13.4 Mutation proof

Each mutant was planted alone in its file. The run covered `src/games`, `src/designSystem`, the sidebar-spacing guard, the colour
ratchet and `ux2-shell-foundation`. The file was restored byte-for-byte after each (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the monospace token removed | KILLED | UX-R1 «every --eb-* token read without a fallback is defined»; ux-r13 |
| M2 | the monospace token without a generic family | KILLED | ux-r13 «--eb-font-mono is defined once…» |
| M3 | the teacher game view paints the student gradient again | KILLED | ux-r13 «inside the teacher shell a game view drops…» |
| M4 | the teacher game view keeps the full-screen height | KILLED | same |
| M5 | the background fix unscoped (the student destination loses its surface) | KILLED | same |
| M6 | game cards back to the 10 px radius | KILLED | ux-r13 «game cards are flat 8 px cards…» |
| M7 | one dark action per game card again | KILLED | same |
| M8 | the live-challenge card shadow returns | KILLED | ux-r13 «the game panels take the 8 px radius…» |
| M9 | the 3 px primary rule on the header card returns | KILLED | same |
| M10 | the selected path keeps a white fill | KILLED | ux-r13 «the selected path, assistance level and question source…» |
| M11 | the selected assistance level back to the dark pill | KILLED | same |
| M12 | the selected source back to a raised white tab | KILLED | same |
| M13 | the restyle reaches the mode edge | KILLED | ux-r13 «… keeps the mode tags and the restrained mode edge» |
| M14 | a colour literal in the block | KILLED | colour ratchet; ux-r13 |
| M15 | an unscoped chip rule (reaches every chip group) | KILLED | ux-r13 «scopes every rule…» |
| M16 | a converted literal returns | KILLED | colour ratchet; ux-r13 |
| M17 | a physical side in the block | KILLED | ux-r13 «adds no stacking context…» |

17 / 17 KILLED, no TIMEOUT. `git status` showed only the R13 edit set before and after the campaign.

## R13.5 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture `games`, `games-conversion`, `games-live`, `student-games`, `student-games-join` (1440 / 1024 / 390 px) | before: 6 / 15 clean (the band and the room-code font); after: **15 / 15 clean** |
| `npm test`, full root suite (`21b1152a`) | 1 188 files, 14 141 / 14 142 tests. The one failure, `AppEvaluationFinish.9g` «G3/G5…», is the timing-sensitive case outside R13 seen on `main` in this container the same day (R11b, R12 records) |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | **2 263** (was 2 266) |
| Browser gates | the L.8 reader gate is triggered by `src/learning/**` only and R13 touches no file there (the token it now resolves lives in `design-tokens.css`); the Quality Gate runs on every PR |

---

# Phase UX-R15 — The student exam

**Owner direction (2026-10-21):** carry on through every remaining phase in sequence. R15 depends on R14 only for order (it
shares no file with it), so it branches from `main` `ea357456` as `feature/ux-r15-student-exam`, in parallel with R13 (#409)
and R14 (#410); the three share only this record and the capture harness.

## R15.1 What changes for the student

The exam runtime (`StudentExamPage`): the top bar, the position / progress / save row, «تفاصيل الامتحان والتعليمات», the paged
question, the section context, the bottom navigation, «قائمة الأسئلة», the review screen, the start gate and the result. No
reference mockup shows it, so R15 applies the record's general patterns (§3.2). **Presentation only:** no answer, autosave,
timer, attempt policy, paging order, navigation or grading change.

- **The exam frame is flat 8 px hairline panels** on every exam: the position and save row, the details disclosure, the review
  screen, the start gate and the result lose their resting shadow and their 10 px radius.
- **The review counts (answered / unanswered / unavailable) are one hairline strip;** the warn and unavailable cells keep their
  tint.
- **The section context drops its 4 px decorative edge;** the first question of a section keeps its tint.
- **On the legacy `default` theme only, the question card is a flat 8 px card and the sticky bars sit on their hairline** (no
  shadow; 8 px from 768 px). The other legacy themes (`cards`, `classic`, `compact`, `modern`) and every presentation preset keep
  their own look: changing a preset is R16d's decision (§4.1, option A).
- **Fix: the assessment-activity status line reads defined tokens** (§R15.3).

**Not changed, on purpose:** markup and behaviour; every status tone (saved / saving / offline / error, answered / unanswered /
unavailable, the warn and danger clock, the strict-policy notices, the recovery cards); the selected answer option (primary);
the current question in the navigator (2 px primary ring); the distinct final submit; the 44 px touch rules; the scroll
clearance; the code and CLI stimuli; the simulators and activities inside a question (R16a / R16b).

## R15.2 Edit set

- **`src/studentexam-pro.css`:** the activity status / fallback line reads `--eb-muted` and `--eb-fs-13`; one block appended at
  the end (every selector starts with `.interactive-exam-page`; the card and bar rules with
  `.interactive-exam-page.exam-theme-default`; tokens only; no coarse-pointer block, the 21E.3 guards read the last one).
- **`src/designSystem/tokensV2.ux-r1.test.ts`:** the two `studentexam-pro.css` entries leave `KNOWN_UNDEFINED`, as the test asks
  once a token is fixed.
- **`src/student/exam/studentExam.ux-r15.test.ts`:** new, 9 guards.
- **`scripts/capture-visual-baseline-ux-r.mjs`:** a structured five-question assignment (multiple choice, open, table fill,
  multiple true / false, CLI fill), the student assignment and submission routes, and two scripted pages opened from the
  portal's «ابدأ الحل»: `student-exam` and `student-exam-navigator` (the dialog open). Both fail when the activity status line
  does not resolve the muted colour and 13 px.

## R15.3 Fail-first evidence

**The activity status line read two undefined tokens.**
- **Cause:** `.iex-activity-status, .iex-activity-fallback` (the status and the static fallback of an interactive assessment
  context, Phase 13C-A) read `--eb-text-muted` and `--eb-fs-sm`. Neither token exists (they were recorded as pre-existing in
  `KNOWN_UNDEFINED`, owned by R15), so both declarations were dropped: the line took the body text colour and 16 px instead of
  a quiet note.
- **Fix:** `--eb-muted` and `--eb-fs-13`.

| Run | `main` `ea357456` | R15 |
|---|---|---|
| Capture harness, `student-exam` and `student-exam-navigator` at 1440 / 1024 / 390 px | **FAIL** 6 / 6: «the activity status line reads {"color":"rgb(45, 39, 64)","muted":"rgb(95, 90, 110)","fontSize":"16px"}» | clean |
| `tokensV2.ux-r1` «every --eb-* token … is defined» with the two entries removed | **FAIL**: «define the token in design-tokens.css: expected [ …(2) ] to deeply equal []» | pass |
| `studentExam.ux-r15` «the status and fallback lines are muted 13 px text…» | **FAIL** | pass |

## R15.4 Mutation proof

Each mutant was planted alone. The run covered `src/student/exam`, the UX-7b-1 and 7b-2 suites, the overlay layer guard, the
colour ratchet, `ux2-shell-foundation` and `src/designSystem`. The file was restored byte-for-byte after each (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the status line reads the undefined muted token again | KILLED | UX-R1 undefined-token test; ux-r15 «the status and fallback lines…» |
| M2 | the status line reads the undefined size token again | KILLED | same |
| M3 | the frame panels keep their shadow | KILLED | ux-r15 «the frame panels…» |
| M4 | the frame panels keep the 10 px radius | KILLED | same |
| M5 | the review counts back to separate tiles | KILLED | ux-r15 «the review counts are ONE hairline strip…» |
| M6 | the review cells lose their hairlines | KILLED | same |
| M7 | the strip blanks the warn / unavailable tints | KILLED | same |
| M8 | the 4 px section edge returns | KILLED | ux-r15 «the section context…» |
| M9 | the card rule reaches every theme and preset | KILLED | ux-r15 «scopes every rule…»; «on the default theme…» |
| M10 | the restyle overrides a legacy theme (`modern`) | KILLED | ux-r15 «scopes every rule…» |
| M11 | the question card keeps its shadow | KILLED | ux-r15 «on the default theme…» |
| M12 | the sticky bars keep their shadow | KILLED | same |
| M13 | the bars keep the 10 px radius from 768 px | KILLED | same |
| M14 | the restyle reaches a status tone (answered) | KILLED | ux-r15 «never restyles a status tone…» |
| M15 | the restyle quiets the final submit | KILLED | same |
| M16 | a colour literal in the block | KILLED | colour ratchet; UX-7b-1 foundation guard; ux-r15 |
| M17 | an unscoped rule | KILLED | ux-r15 «scopes every rule…» |
| M18 | a physical side in the block | KILLED | ux-r15 «adds no stacking context…» |
| M19 | the block gains a coarse-pointer block | KILLED | ux-r15 «is the last thing in the sheet…» |

19 / 19 KILLED, no TIMEOUT. `git status` showed only the committed R15 edit set before and after the campaign.

## R15.5 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture `student-portal`, `student-exam`, `student-exam-navigator` (1440 / 1024 / 390 px) | before: 3 / 9 clean (the six exam captures fail on the status line, §R15.3); after: **9 / 9 clean** |
| `npm test`, full root suite (`4644f547`) | 1 188 files, **14 142 / 14 142** tests |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | 2 266, unchanged (the fix and the block add no literal) |
| Browser gates | L.8 runs, because the new guard file lives under `src/student/**` (its path filter); `studentexam-pro.css` itself triggers no browser gate. The Quality Gate runs on every PR |

---

# Phase UX-R16a — The science simulators' colours

**Owner direction (2026-10-21):** carry on through every remaining phase in sequence. The owner added R16a–R16d to the plan
(§4.1, #408). R16a depends on R3 (merged), so it branches from `main` `ea357456` as `feature/ux-r16a-science-colours`, in
parallel with R13–R16. They share only this record, the colour baseline and the capture harness.

## R16a.1 What changes for the user

The six science simulators (free fall, motion, the physics lab, chemistry structure, reactions and the chemistry lab), the mesh
models, the function surfaces and the interactive 3D viewer's interface. This covers the student workspaces, the teacher editors
and the reviews, because the three share each sheet. No reference mockup shows them, so R16a moves their own colours onto the
palette, as §4.1 asks. **Presentation only:** nothing a simulator computes, grades or stores changes, and no question, key or
API changes.

- **A content-token family** (`--eb-content-*` in `design-tokens.css`) holds the neutrals that simulators and diagrams draw
  with: ink, text, muted, axis, faint, grid, line, two grounds, and the simulators' own control colour. The slate and
  blue-grey literals they replace map by luminance:
  - a foreground is never lighter than before;
  - a ground or line is never darker;
  - so no contrast drops.
- **The simulators' control blue becomes the content accent** (`--eb-primary-strong`). This covers buttons, pressed toggles,
  focus rings, progress, tabs and the current item. White text on it is 11.4:1; the blue gave 4.9:1.
- **The hues that carry meaning stay exactly as they were:**
  - forces: applied, weight / normal, friction, gravity components;
  - quantities: velocity and acceleration;
  - kinetic energy, electrons and their cloud;
  - a lab series, the free-fall curve;
  - reaction states;
  - the mesh and surface tints;
  - correct / wrong marks.
  The status hues that equal a token (`#b42318`, `#15803d`, `#d97706`, `#b45309`) now name it, at the same value.
- **Presentation presets still win:** every `var(--xp-*, …)` keeps its preset variable. Only the fallback, which an exam
  without a preset and the teacher editors render, moves to the content tokens. The presets themselves are R16d.
- **Fix 1: a measurement box never spills** (§R16a.3).
- **Fix 2: the chemistry column fits a phone** (§R16a.3).

**Not changed, on purpose:**
- the dark-scheme and more-contrast blocks, which are tuned for their own grounds;
- the 3D viewer's scene drawing (lines, edges, vertices, the selected and review tints), which the 21E viewer guards pin as
  drawn; only its interface is converted;
- every meaning-carrying hue listed above.

## R16a.2 Edit set

- **`src/design-tokens.css`:** the `--eb-content-*` family. Every token is an alias of a palette token except
  `--eb-content-axis` (`#7c7690`, ≥ 3 : 1 on every ground for strokes, axes and guides).
- **The eleven sheets:**
  - `physicsMotion/motion.css`, `physicsFreeFall/freefall.css`, `physicsLab/lab.css`;
  - `chemistryStructure/chem.css`, `chemistryReactions/rxn.css`, `chemistryLab/chemLab.css`;
  - `meshModels/mesh-model.css`, `functionSurfaces/surface-plot.css`, `functionSurfaces/surface-3d.css`;
  - `interactive3d/interactive3d.css`;
  - the simulators' shared dynamic layer `smartsim/dynamic/dynamic.css`. It is not named in the plan's R16a row, but it draws every
    physics simulator's controls and plots, and its single column caused the last 3 px phone overflow.
  - **404 literals converted**, 116 kept. The kept literals are:
    - the meaning-carrying hues;
    - the dark-scheme and more-contrast blocks;
    - the 20 literals of the pinned 3D scene drawing.
  - The layout fixes:
    - `motion.css` (the shared widgets: boxes, point fields, the time field, the root);
    - `freefall.css` (its own boxes, time field and root);
    - `dynamic.css` (its column);
    - `chem.css` (its column).
  - The sliders take the control colour (`accent-color`) in `motion.css`, `freefall.css` and `chemLab.css`.
- **`scripts/ux-color-inventory.baseline.json`:** lowered to **1 874** (was 2 266).
- **`src/scienceColours.ux-r16a.test.ts`:** new, 12 guards:
  - the family and its legibility, computed from the token values;
  - no neutral or control-blue literal left;
  - the meaningful hues unchanged;
  - the fixes;
  - the fixture pinned to the starters.
- **`scripts/ux-r16a-sim-starters.json`:** the six plugins' code-owned starter configs. The guard pins it to
  `smartSimStarterConfig`, so it cannot drift.
- **`scripts/capture-visual-baseline-ux-r.mjs`:**
  - a `sims` scene: one student exam with the six simulators, sanitized by the API's own student sanitizer;
  - six scripted pages (`sim-physicsFreeFall` … `sim-chemistryLab`);
  - a check that fails when a control spills out of its box.

## R16a.3 Fail-first evidence

**1. The measurement boxes spilled in every physics simulator.**
- **Cause:** the shared widgets (`physicsShared/labWidgets.tsx`, styled by `motion.css`) put the text field in a one-column grid
  box whose track was sized to the field's intrinsic width.
- **Effect:** the field ran 64–69 px past the box's edge, over the next box. On a tablet and a phone it scrolled the whole exam
  page sideways (1036 > 1024, 421 > 390).
- **Fix:** the tracks may shrink (`grid-template-columns: minmax(0, 1fr)`) for the box, a point task's labelled field, the
  simulator root and the shared dynamic layer. The text field takes the free width of its row, and the time field keeps a field's
  width (7em). The free-fall simulator has its own boxes and gets the same rules in `freefall.css`.

**2. The chemistry column was wider than a phone.**
- **Cause:** `.chem` is a one-column grid sized to its widest child, so the reaction workspace's column was 329 px inside a
  narrower card.
- **Effect:** the exam page scrolled sideways (402 > 390).
- **Fix:** `minmax(0, 1fr)`. The formula rows wrap and the table scrolls inside its own box.

| Capture (1440 / 1024 / 390 px) | `main` `ea357456` | R16a |
|---|---|---|
| `sim-physicsFreeFall`, `sim-physicsMotion`, `sim-physicsLab` | **FAIL** 9 / 9: «a control spills out of its box: [{"box":"زمن الوصول إلى الأرض (ث)","by":69}, …]»; tablet and phone also «horizontal overflow 1036>1024», «421>390» | clean 9 / 9 |
| `sim-chemistryReactions` (phone) | **FAIL**: «horizontal overflow 402>390» | clean |
| `sim-chemistryStructure`, `sim-chemistryLab` | clean | clean |

## R16a.4 Mutation proof

Each mutant was planted alone. The run covered the R16a guards, every converted simulator's own suites, the colour ratchet and
`src/designSystem`. Each file was restored byte-for-byte after its mutant (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the axis token too light for strokes (< 3:1) | KILLED | ux-r16a «text tokens are AA … the axis token is ≥ 3:1» |
| M2 | the muted text token below AA | KILLED | same |
| M3 | the control colour back to a mid purple (white text < 7:1) | KILLED | ux-r16a «the control colour carries white text at AAA…» |
| M4 | a slate literal returns in a simulator sheet | KILLED | colour ratchet; ux-r16a «hold no neutral … literal» |
| M5 | the control blue returns in the mesh viewer | KILLED | colour ratchet; ux-r16a |
| M6 | the applied-force vector loses its own hue (purple, like weight) | KILLED | ux-r16a «the hues that carry meaning did not move…» |
| M7 | the electrons take the control colour | KILLED | same |
| M8 | the velocity vector loses its success hue | KILLED | ux-r16a «status hues name their tokens…» |
| M9 | the trail ignores the presentation variable | KILLED | same |
| M10 | the measurement box track sized to the field again (spill) | KILLED | ux-r16a «a measurement or point box's track may shrink…» |
| M11 | the point task's labelled field cannot shrink | KILLED | same |
| M12 | the free-fall boxes spill again | KILLED | same |
| M13 | the dynamic layer sized to its widest child again | KILLED | ux-r16a «the time field keeps a field's width; the dynamic layer…» |
| M14 | the chemistry column sized to its widest child again | KILLED | same |
| M15 | the time field stretches again | KILLED | same |
| M16 | the bench sliders back to the browser's blue | KILLED | ux-r16a «the sliders take the control colour…» |
| M17 | the pinned 3D scene drawing converted | KILLED | 21E viewer «the scene drawing rules … are unchanged» |
| M18 | the kinetic-energy series loses its hue | **SURVIVED** on the first run; the guard now pins the series rule too (`fce5be7f`): **KILLED** on the re-run | ux-r16a «the hues that carry meaning…» |

18 / 18 KILLED (one after the guard was strengthened), no TIMEOUT. `git status` showed only the committed R16a edit set before and
after.

## R16a.5 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture: the six simulators (1440 / 1024 / 390 px) | before **8 / 18** clean (the spills and the sideways scroll, §R16a.3); after **18 / 18** clean |
| `npm test`, full root suite (`fce5be7f`) | 1 188 files, **14 145 / 14 145** tests |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | **1 874** (was 2 266) |
| Browser gates | none is triggered by these sheets (U.1 and L.8 path filters); the Quality Gate and the Runner CI run on every PR |

**CI follow-up (`470f4035`).** The first CI run (`d610a920`) failed 1 / 47 checks of the 21D-D.3 virtual-lab browser exam: «a1: a
keyboard-focused bench button shows a visible focus ring» read `none`. The cause was the browser harness: it mounts the lab without
`design-tokens.css`, which `main.tsx` loads in the app. The ring's `--eb-content-accent` was therefore undefined, and the whole
`outline` declaration was dropped.

The fix: the twelve simulator harnesses (`browser-harness/*.tsx`) now load the tokens, as the app does. Every check stays as strict.

Local real-Chromium results:

| Check | Result |
|---|---|
| 21D-D.3 on `d610a920` (reproduced) | «FAILED 1 / 47» |
| 21D-D.3 with the fix | 47 / 47 |
| physics motion | 45 / 45 |
| physics lab | 43 / 43 |
| chemistry 21dd1 | 36 / 36 |
| chemistry 21dd2 | 41 / 41 |
| function surfaces | 14 / 14 |
| mesh | 37 / 37, 32 / 32 and 37 / 37 |
| 3D 21c | 18 / 18 |
| 3D 21d | 41 / 42 |

The 3D 21d frame-pacing check also fails on `d610a920` in this container; it passes in CI. On the fixed head, CI runs every
simulator browser check, and all are green.
