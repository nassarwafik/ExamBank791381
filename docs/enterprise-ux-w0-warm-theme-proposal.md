# Phase UX-W0 — Warm theme proposal (reference mockups only)

**Owner request (2026-10-31):** the owner shared a reference screen (a warm cream / orange finance-app concept: a yellow «balance»
hero card with a half-circle gauge, an «AI insights» row, quick-action chips, an avatar row, a numeric keypad, a segmented
control, a bar chart with one highlighted day, and a floating dark pill navigation at the bottom) and asked whether the platform's
pages could take this look precisely, on the phone and on the computer.

**Answer: yes.** Every page already reads its colours, radii and shadows from the `--eb-*` tokens (`src/design-tokens.css`,
`src/design-tokens-dark.css`), so the palette can be changed in one place; the layout patterns of the reference map onto pages and
components that already exist. This record proposes how. **UX-W0 ships no product code**: nothing under `src/` changes.

The reference is a third-party concept shot, used as **inspiration for a design language**, not copied: the mockups use the
platform's own content, font (IBM Plex Sans Arabic from `public/fonts/`), RTL layout and icons, and replace photographs with
initials.

## 1. Edit set

- `docs/enterprise-ux-w0-warm-theme-proposal.md`: this record (new).
- `docs/ux-w/mockups/`: `phone.html` (three student phone screens), `desktop.html` (the teacher dashboard at 1440 px),
  `style.css` (the candidate token values), `icons.js`, and their renders `phone.png`, `desktop.png`. Static demo data; never built
  or shipped.

## 2. Mapping: reference → platform

| Reference element | Platform page / component | Mockup |
|---|---|---|
| «Welcome» header + bell | student portal greeting; teacher top bar | phone 1, desktop |
| «AI Insights» row | student study assistant; teacher smart follow-up indicators (`TeacherDashboard` follow-up) | phone 1, desktop |
| «Today Balance» yellow hero + gauge | student: term average and assignments done / remaining; teacher: weekly submission rate and pending grading | phone 1, desktop |
| «Quick Actions» chips | student: continue reading, quick practice, message the teacher; teacher: new assignment, new exam, class announcement | phone 1, desktop |
| «Recent Transactions» rows | student upcoming tasks; teacher «يحتاج إلى انتباهك» | phone 1, desktop |
| «Money Transfer» amount + keypad | the student exam's **numeric answer** entry (presentation only) | phone 2 |
| «Transfer limits» bar | the exam's remaining-time bar | phone 2 |
| «Quick Send» avatars | phone: the exam question navigator (answered / current / flagged); desktop: students needing follow-up | phone 2, desktop |
| «Income / Expense» segmented | assignments / tests in «تقدّمي» | phone 3 |
| «Top 3 spending areas» chips | the three weakest topics | phone 3 |
| weekly bar chart, highlighted max | student weekly scores; teacher weekly submissions (Chart.js theme) | phone 3, desktop |
| floating dark pill bottom nav | `StudentMobileNav` (its five existing destinations); on the computer the same dark pill marks the active sidebar link | phone 1 & 3, desktop |

## 3. Candidate token values

Measured with the WCAG 2.x formula for this record.

| Role | Token | Value | Contrast |
|---|---|---|---|
| Page ground (cream) | `--eb-bg` | `#fdf6ec` | — |
| Heading ink / dark nav pill | `--eb-navy` | `#2b1d14` | 15.2 : 1 on cream |
| Body text | `--eb-text` | `#3b2a1e` | 12.7 : 1 on cream |
| Muted text | `--eb-muted` | `#6e5a4b` | 6.06 : 1 on cream; 4.20 : 1 on the hero yellow → bold / large text only there |
| Primary (buttons, active chip, tooltip; white text) | `--eb-primary` | `#c2410c` | white on it **5.18 : 1** (AA) |
| Accent fill (highlighted bar, progress) | new `--eb-accent` | `#e8571e` | non-text only (≥ 3 : 1) |
| Hero yellow | new `--eb-hero` | `#f8c96a` → `#fbd98f` | heading ink on it 10.5 : 1 |
| Card radius / hero radius | `--eb-r`, `--eb-r-lg` | 18 px / 24 px | — |

**Finding:** the reference's bright orange (≈ `#e8571e`) carries white text at only **3.61 : 1**, below the AA 4.5 : 1 that the
existing guard `src/designSystem/mutedContrast.21e1s2.test.ts` and the accessibility rules require. The proposal therefore splits it
into a darker primary for anything that carries text (`#c2410c`) and the bright orange for fills only. The dark theme
(`design-tokens-dark.css`) needs its own warm values; they are drafted in W1, not here.

## 4. Owner decisions needed before W1

1. **Replace or add.** The purple palette of UX-R is owner-approved and shipped. Options:
   - **A (recommended):** add the warm palette as a second theme (`<html data-palette="warm">`, next to the existing
     light / dark switch), default unchanged. Nothing changes for current users until the owner flips the default.
   - **B:** replace the purple palette. Every page, every capture of the visual gate and every printed artefact changes at once.
2. **Exam paper.** The student exam paper is a light island with teacher-chosen presentation presets (R16d). Recommended: it keeps
   its presets; only the exam chrome (timer, navigator, keypad) takes the warm look.
3. **Numeric keypad.** Recommended on phones only, as an additional input for numeric answers; the stored answer, its validation and
   grading are unchanged.

## 5. Phase plan (each phase: its own branch, pull request and owner merge)

| # | Phase | Scope | Size |
|---|---|---|---|
| W0 | This proposal and mockups | `docs/` | S |
| W1 | Warm tokens (light + dark), `data-palette` switch, contrast guards extended | `src/design-tokens*.css`, `src/ui/themePreference.ts` | S–M |
| W2 | Shell: floating dark pill bottom nav (student phone), sidebar active pill, rounded cards | `shell/*`, `shell.css`, `studentMobileNav.css` | M |
| W3 | Components: hero card + gauge, quick-action chips, avatar row, segmented, Chart.js warm theme | `src/ui/*`, `charts/` | M |
| W4 | Student portal «اليوم» and «تقدّمي» | `StudentPortal.tsx`, `student/*`, `studentportal-pro.css` | M–L |
| W5 | Student exam chrome (timer bar, navigator, numeric keypad) | `student/exam`, `studentexam-pro.css` | M |
| W6 | Teacher dashboard | `TeacherDashboard.tsx`, `dashboard-pro.css` | M |
| W7 | Remaining teacher pages and visual-gate captures at 1440 / 1024 / 390 px | page stylesheets | L |

**Unchanged in every W phase:** grading, `reviewRequired`, exam JSON and question versions, API, Runner, persistence, and every
existing test expectation.

## 6. Implementation readiness (W0.1, prepared while another window works on `main`)

Nothing under `src/` changes until the parallel window's work has merged to `main`. Work starts from that new `origin/main`
(AGENTS.md §4, §7). This section records what the existing guards demand of the new palette, so W1 does not discover it by failing CI.

### 6.1 Guards that constrain the palette (they stay; the new values must satisfy them)

| Guard | Rule | Consequence for the warm palette |
|---|---|---|
| `src/login.ux-r16.test.ts:39-40` | `primary-200`, `primary-050`, `surface` ≥ **7 : 1** on `navy`, `primary`, `primary-strong` (login hero gradient) | `--eb-primary` must be a **deep** rust (≈ `#852c0d`, white 8.9 : 1). The bright orange cannot be `--eb-primary` |
| `src/scienceColours.ux-r16a.test.ts:49-50` | `primary-strong` ≥ 7 : 1 with white | `--eb-primary-strong` ≈ `#521b07` (13.8 : 1) |
| `src/designSystem/tokensV2.ux-r1.test.ts:58-75` | white on primary / strong ≥ 4.5; as text on bg, surface, 050, 100 ≥ 4.5; hover step ≥ 1.4 | met by `#852c0d` / `#521b07` (step 1.56) |
| `src/designSystem/mutedContrast.21e1s2.test.ts` | muted ≥ 4.5 on 10 grounds; text > muted > faint | `--eb-muted` `#634f40` (≥ 6.5 : 1 everywhere tested) |
| `api/tests/ux2-shell-foundation.test.js:284-286` | faint at least as light as `#94a3b8`, and < 4.5 on surface | `--eb-faint` `#c9b8a6` |
| `src/functionGraphs/functionGraphSeries.ux-r16c.test.ts:37-48` | series 1 (`--fg-c1` = primary-strong) stays distinguishable under colour-blindness from `#C2410C`, `#B91C1C` | **a brown series 1 collides with the red / orange series**: owner decision 4 below |
| `src/designSystem/darkTokens.ux-r18a.test.ts` | light half of every `light-dark()` equals `design-tokens.css`; dark halves ≥ AA | both token files move in one commit |
| `scripts/ux-color-inventory.test.mjs` | no stylesheet gains colour literals | new colours live only in the token files |
| visual gate `ux-visual-regression-r19b.yml` | every changed capture declared in `docs/ux-r/visual-changes.json` | each W phase declares its pages (6 jobs: 3 viewports × light / dark) |

Literal pins that move with the palette (owner-approved design change, updated in the same commit as the tokens, never to hide a
defect): `tokensV2.ux-r1.test.ts:42-51` (approved map, radius), `login.ux-r16.test.ts:86-103` (ErrorBoundary fallbacks,
`public/offline.html`), `ux2-shell-foundation.test.js:283` (faint literal), `functionGraphSeries.ux-r16c.test.ts:69`,
`referencePreset.ux-r16d.test.ts` (only if the exam reference preset follows).

Source mirrors that must move in step: `src/projects/chartPalette.ts` (FALLBACK), `src/charts/chartTheme.ts:10`,
`src/presentation/presentationModel.ts:103` + regenerate `api/src/lib/shared-finalization/**`
(`scripts/build-shared-finalization.mjs`), `src/ErrorBoundary.tsx`, `public/offline.html`, `src/avatars.tsx:23`,
`src/ui/ProfileAvatar.tsx:24`, `src/coding/editor/editorOptions.ts:210-234` (dark Monaco theme),
`scripts/capture-visual-baseline-ux-r.mjs:507` (asserts the reference preset's `#2A0A4E`).

### 6.2 Recommended token split (all guards pass without relaxing any)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--eb-primary` | `#852c0d` | `#ff9a5c` | links, focus ring, login hero, text-bearing primary |
| `--eb-primary-strong` | `#521b07` | `#ffc29b` | hover / pressed |
| `--eb-primary-050 / -100 / -200` | `#fff4ec` / `#ffe8d6` / `#fde6d2` | `#2a1a10` / `#352215` / `#4a2e1c` | tints |
| **new** `--eb-cta` | `#b83a0b` (white 5.76 : 1) | `#ff9a5c` | filled buttons, active chips, segmented «on» — the vibrant look of the reference |
| **new** `--eb-accent` | `#e8571e` | `#f08a52` | non-text fills: highlighted bar, progress, gauge |
| **new** `--eb-hero` / `--eb-hero-2` | `#f8c96a` / `#fbd98f` | `#3a2a14` / `#45321a` | the yellow hero card |
| `--eb-bg` / `--eb-surface` / `--eb-surface-2` | `#fdf6ec` / `#ffffff` / `#fbf4ea` | `#16100b` / `#211912` / `#2a2018` | grounds |
| `--eb-navy` / `--eb-text` / `--eb-muted` / `--eb-placeholder` / `--eb-faint` | `#2b1d14` / `#3b2a1e` / `#634f40` / `#76604f` / `#c9b8a6` | `#fbf3ea` / `#eadfd3` / `#b9a796` / `#a5927f` / `#5e4d3f` | ink ladder |
| `--eb-line` | `#f0e4d4` | `#3a2d22` | hairlines |
| **new** `--eb-r-card` / `--eb-r-hero` | 18 px / 24 px | same | cards and hero (controls keep `--eb-r`) |

Measured: every text pair ≥ 4.5 : 1 on every ground in both themes; the login 7 : 1 rule holds (`primary-200` on primary 7.37,
`primary-050` 8.21). `primary-variants.png` compares `--eb-cta` (left, recommended) with a strict single-primary rust (right).

### 6.3 Execution order once `main` is free

| # | Phase | Main files | Visual-gate pages declared |
|---|---|---|---|
| W1 | Tokens (light + dark), mirrors, literal pins | `design-tokens*.css`, mirrors above | all (palette) |
| W2 | Shell: dark pill bottom nav (student phone), sidebar active pill, top bar | `shell/*`, `shell.css`, `teacher-nav-21e.css`, `studentMobileNav.css` | all (chrome) |
| W3 | Kit: hero + gauge, chips, avatar row, segmented, card radius, Chart.js warm theme | `src/ui/*`, `charts/chartTheme.ts`, `page-parts.css` | gallery |
| W4 | Student portal (today, tasks, progress, achievements) | `StudentPortal.tsx`, `student/*`, `studentportal-pro.css`, `student/student-portal-v2.css` | student-portal, student-messages |
| W5 | Student exam chrome (timer bar, navigator, numeric keypad on phones) | `student/exam`, `studentexam-pro.css` | exam scenes |
| W6 | Teacher dashboard | `TeacherDashboard.tsx`, `teacher/TeacherTodayHub.tsx`, `dashboard-pro.css`, `teacher/teacherToday.css` | dashboard |
| W7 | Classes / students, assignments, reports, messages | `students/*`, `assignments-pro.css`, `reports-pro.css`, `messages/*` | students, assignments, reports, messages |
| W8 | Learning, projects, games | `learning/*`, `projects-pro.css`, `games/*` | learning*, projects, games* |
| W9 | Exam bank, import, builder, reviews, audit, login, offline | `bank-pro.css`, `builder-pro.css`, `structured-*.css`, `login-pro.css`, `public/offline.html` | bank*, import, reviews, studio*, audit, login |

Each phase: baseline captures (`scripts/capture-visual-baseline-ux-r.mjs`, verified working in this container) → change → full
validation (`npm test`, lint, `tsc -b`, build) → after captures at 1440 / 1024 / 390 px, light and dark → PR with
`⛔ DO NOT MERGE` header → owner merge.

### 6.4 Owner decisions (additions to §4)

4. **Chart series 1.** The function-graph and chart palettes start with the brand colour. A brown / orange series 1 cannot be told
   apart from the existing red and orange series by colour-blind readers. Recommended: series 1 becomes a deep teal or keeps the
   purple `#4A2380` (the series palette is decoupled from the brand). Changing the existing series order is not recommended:
   stored graphs refer to series by index.
5. **Primary split.** Recommended: deep rust `--eb-primary` plus a vibrant `--eb-cta` for filled buttons (§6.2). The alternative,
   a single vibrant primary `#b83a0b`, needs the owner to lower the login and science 7 : 1 rules to 4.5 : 1. Agents never lower a
   rule themselves.
