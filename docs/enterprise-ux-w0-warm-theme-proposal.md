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
