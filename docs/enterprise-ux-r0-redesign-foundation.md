

---

# Phase UX-R17a — Clean-up: the two base sheets

**Owner direction (2026-10-22):** start R17 once R16a–R16d are merged, split in four parts (R17a base sheets, R17b builder sheets,
R17c the remaining sheets and dead CSS, R17d the final audit), each its own branch and pull request. R16b (#416) merged and R16d
(#415) was green and waiting, sharing only this record and the colour baseline, so R17a branches from `main` `467ec80d` as
`feature/ux-r17a-base-sheets`.

## R17a.1 What changes for the user

`platform.css` and `App.css` are the oldest shared sheets: almost every page loads them, and every page phase since R4 overrides
the parts it redesigned. R17a moves what is left of their colours onto the palette. **Presentation only:** no markup, data, API or
grading changes.

- **The slate neutrals move to the content tokens** (by luminance: a foreground is never lighter, a ground or line never darker).
- **A status value equal to a token names it, at the same value:** `#fff7ed` → `--eb-warn-bg`, `#fef2f2` → `--eb-danger-bg`, the
  sky info family → `--eb-info`, `--eb-info-bg`, `--eb-info-tx`.
- **The old blue chrome moves to the purple family:** the blue hairlines (`#cfe0f8`) → `--eb-line-2`; the blue-tinted grounds
  (`#f7f9fd`, `#f5f9ff`, `#f2f6fd`) → `--eb-surface-2`; the active filter chip's navy (`#0f2b46`) → `--eb-navy`; the indigo info chip
  and the violet AI panels → the primary family; the hero's blue-grey text → `--eb-primary-200` (≥ 7:1 on every hero stop).
- **Fix: five small texts reach AA** (§R17a.3).
- **Visible effect:** small, because the page phases already override most of these rules. 104 of 110 page captures are
  pixel-identical; the visible changes are the darker (readable) helper and note texts.

**Not changed, on purpose:**
- the classic exam paper and its word bank (what the student sees, R15);
- the difficulty scale, the analytics legend and the topic chip (they carry meaning);
- every status shade that has no token of the same value (success, warn, danger shades: they keep their literal);
- the export button's sky blue (now named by the info tokens at the same value where it equals them).

## R17a.2 Edit set

- **`src/platform.css`, `src/App.css`:** 337 literals converted; 171 kept (status shades, the exam paper, the scales). Five
  multi-line `rgba()` values became one-line `color-mix()` values, so `App.css` is 25 lines shorter; no rule or property was removed.
- **`scripts/ux-color-inventory.baseline.json`:** 1 502 → **1 165** (`platform.css` 267 → 74, `App.css` 241 → 97).
- **`src/designSystem/baseSheets.ux-r17a.test.ts`:** new, 7 guards: no slate, grey or white literal and none of the old blue chrome
  outside the kept rules; status values name their tokens; the hero text ≥ 7:1 on each stop; no text colour on the axis or faint
  token and the helper and note texts ≥ 4.5:1; the meaning-carrying shades and the exam paper unchanged; the baseline counts.

## R17a.3 Fail-first evidence

**Five small texts were below AA.** `.helper-text` (the builder's line under the model picker), `.saved-exam-main small`,
`.analytics-table td small`, `.analytics-improvers small` and the analytics chart's axis labels read `#94a3b8`: **2.56:1** on white.

The first conversion pass mapped them to `--eb-content-axis`, the nearest darker token: 4.33:1, still below AA. That token is for
strokes, axes and guides (≥ 3:1); text takes `--eb-content-muted` (6.62:1). The guard «no text colour reads the axis or faint token
…» pins both rules.

| Run | `main` `467ec80d` | R17a |
|---|---|---|
| ux-r17a «no text colour reads the axis or faint token (strokes only); the small helper and table notes keep AA…» | **FAIL**: «.helper-text: expected 2.5640413904962034 to be greater than or equal to 4.5» | pass |

## R17a.4 Mutation proof

Each mutant was planted alone. The run covered `src/designSystem`, `ux2-shell-foundation`, the colour ratchet, `src/students` and
`src/assignments`. Each file was restored byte-for-byte after its mutant (SHA-256).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 | the helper text back to the 2.56:1 literal | KILLED | colour ratchet; ux-r17a |
| M2 | the helper text on the axis (stroke) token, 4.33:1 | KILLED | ux-r17a «no text colour reads the axis or faint token…» |
| M3 | the chart axis labels back to the stroke token | KILLED | same |
| M4 | the active filter chip back to the old navy literal | KILLED | colour ratchet; ux-r17a «hold none of the old blue chrome…» |
| M5 | the hero text back to the old blue-grey literal | KILLED | colour ratchet; ux-r17a |
| M6 | the hero text a mid purple (below 7:1) | KILLED | ux-r17a «the hero's text keeps AAA…» |
| M7 | a warning chip back to a literal (token value) | KILLED | colour ratchet; ux-r17a «a status value equal to a token names it…» |
| M8 | the danger hover back to a literal (token value) | KILLED | same |
| M9 | a slate neutral returns in platform.css | KILLED | colour ratchet; ux-r17a |
| M10 | the old blue hairline returns in App.css | KILLED | ux-r17a «hold none of the old blue chrome…» |
| M11 | the review legend loses its hue | KILLED | ux-r17a «the shades that carry meaning…» |
| M12 | the exam paper's difficulty scale converted | KILLED | same |
| M13 | a white literal returns in platform.css | KILLED | colour ratchet; ux-r17a |

13 / 13 KILLED, no TIMEOUT. `git status` was identical before and after the campaign.

## R17a.5 Visual evidence and local validation

| Check | Result |
|---|---|
| Visual capture: every page and scene of the harness (55 pages × 1440 / 1024 / 390 px) | before (`main` `467ec80d`) **165 / 165** clean; after **165 / 165** clean (no horizontal overflow, no page error) |
| Pixel comparison, before vs after (a pixel counts when a channel moves by more than 12 levels) | **154 / 165** identical. The rest: the builder helper line (`studio-home`, the AA fix), hairline anti-aliasing on `students` (≤ 0.05 %), a relative time that moved by an hour between the two runs (`assignments`: «منذ 12 ساعة» / «منذ 13 ساعة»), and `messages-thread`, whose capture picks a different student between runs of the **same** build (two «before» runs differ in that area; a before and an after that show the same student are pixel-identical) |
| `npm test`, full root suite (`23f8e904`) | 1 195 files, **14 205 / 14 205** tests |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npx tsc -b`, `npm run build` (bundle guard) | exit 0, «bundle guard passed» |
| `git diff --check` | clean |
| colour ratchet | **1 165** (was 1 502) |
