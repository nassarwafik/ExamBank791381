# Phase P10 — Project card header (ProjectRankHero) follows its own width

## Problem

In the student portal («مشاريعي») the project card header — the rank artwork, the project title, the level and «قوة
المشروع», the grade circle and the facts — was squeezed on wide screens:

- The title «مشروع 899373» broke one letter per line.
- The texts overlapped the grade circle.

Cause: the header switched to a single row from a **768 px viewport** (`@media (min-width: 768px)` in
`src/projects/performance.css`). The portal shows the projects card in a narrow column, about 300–430 px, even on a
1440 px screen. So the row had to fit a 96 px image, a 132 px circle and the facts into that width, and the title column
shrank to 0–41 px (`overflow-wrap:anywhere` then broke every letter). It was already present on `main` (observed during
P7) and also affected 1024 px.

## What ships

- `src/projects/ProjectRankHero.tsx`: the header is wrapped in `.eb-prh-box`.
- `src/projects/performance.css`:
  - `.eb-prh-box{ container-type:inline-size; min-width:0; }`;
  - the row layout moved from `@media (min-width: 768px)` to `@container (min-width: 560px)`, so the header is one row
    only when **its own** width allows it, and stacked (the layout already used on phones) otherwise.

Result:

- The student portal header is stacked at every screen width.
- The teacher's student profile, where the header is wide (about 1150 px at 1440), keeps its single row.

No markup change beyond the wrapper; no text, data or behaviour change.

## Evidence

`scripts/check-project-hero-browser-p10.mjs` runs in a real Chromium on the production build, with the real API in
process; one class on 899373 with an approved, scored stage per student. Checks:

- the student portal at 390 / 1024 / 1440 px, and the teacher profile at 1440 px;
- the title is at least 6 em wide and at most 2 lines;
- no overlap between the rank text, the circle and the facts; nothing outside the header;
- a header narrower than 560 px is stacked; the wide profile header keeps its row;
- no horizontal overflow; axe (WCAG 2.1 A/AA) without a serious or critical violation.

**Fail-first** on `main` `3e02bb7b` (gate run on the unchanged build) — 5 checks fail:

| Width | Title width | Lines | Other |
|---|---|---|---|
| 1024 | 41 px | 4 | a 426 px header laid out as a row |
| 1440 | 0 px | 12 | the rank text overlaps the circle; a 306 px header laid out as a row |

390 px and the teacher profile pass there. With the fix: **all checks pass**.

**Test updated deliberately:** `src/student/achievementHub.guards.test.ts` pinned the defective rule («the hero becomes a
row from 768px»). It now pins:

- the size container on `.eb-prh-box`;
- the `@container (min-width: 560px)` row rule;
- that no viewport `@media` rule makes the hero a row.

The token-only / no-fixed-width assertions are unchanged.

## Mutation proof

Each mutant was applied to `performance.css`, then checked by the guard test, a rebuild and the browser gate. The file was
restored byte-for-byte (hash-checked). **3 / 3 KILLED.**

| Id | Planted defect | Guard | Gate |
|---|---|---|---|
| C1 | `container-type` removed (the query never matches) | fails | the wide profile header loses its row |
| C2 | back to the 768 px viewport rule | fails | 5 checks fail (the original defect) |
| C3 | threshold too small (row from 240 px) | fails | 8 checks fail (390 px squeezed too) |
