# Phase 21E.2 — Premium Visual Redesign track (slices 2+)

**Owner direction (2026-10-12/13):**
- visible, production-quality redesign before 2026-10-14;
- presentation first, all existing functionality preserved;
- small reviewable slices, real Chromium before / after evidence, no agent swarms, no broad mutation campaigns.

Slice 1 (the builder shell, sections and question cards) is recorded in `docs/enterprise-ux-premium-21e2.md` §10 and ships in
PR #304. This document records the following slices. It is kept separate because a parallel session may still be editing the 21E.2
record in Review Fix 2.

## Branching and conflict rules for this track

- **Stacking:** each slice is its own branch, stacked on the previous verified head. Slice 2 starts from PR #304's verified head
  `f7539b08399518e38d41899b147684d5dee5465c`: slice 1 plus part 2 Review Fix 1, green CI.
- **Base:** PRs target `main`, because the Quality Gate only runs for PRs into `main`. Until the PRs below a slice merge, its diff
  also shows theirs. Merge order: **#302 → #304 → this slice**.
- **Overlap check:** before each commit, the slice's edit set is compared with the builder-integration branch, where Review Fix 2
  may still be in progress. Slice 2 shares **no file** with it:
  - it edits no component;
  - its editor styles reach the page through an `@import` in slice 1's own sheet.

## Slice 2 — the question editors

**Edit set:**
- `src/builder/builder-premium-editors.css`: new.
- `src/builder/builder-premium.css`: one `@import` line.
- `src/builder/builderPremiumEditors.21e2p2.test.ts`: new, 11 guards.
- `src/builder/builderPremium.21e2p1.test.ts`: its rule parser strips `@import` statements; no assertion changed.
- `scripts/capture-visual-gate-21e2p2.mjs`: new Chromium harness.
- This document.

**Unchanged:**
- markup and components;
- exam JSON, question types and version families;
- grading, persistence and API;
- student pages, SmartSim / 3D, RTL / LTR behaviour and keyboard order.

**Scope:** every rule is scoped to `.sb-builder .sb-q-body`, so only question bodies and the compound parts inside them change.
At specificity (0,3,x) the editor look wins over slice 1's general `.sb-builder .x` rules inside a question.

**What the teacher sees:**

| Editor | Before | After |
|---|---|---|
| Multiple choice | bare inputs with a small «الصحيح» radio; the correct option is visible only as a 13 px radio dot | each option is a row card with a number badge. «الصحيح» is a pill that fills green when chosen, and the correct option's row gets a green ring and a filled badge (form **and** colour). On phones: number, pill and ↑ ↓ × on one line, the option text full width below |
| True / false | two 13 px radios | two 48 px choice tiles; the chosen one is filled |
| Matching | two inputs and a bare «←» per pair | a row card per pair with the arrow as a chip. On phones: item [↓] / answer [×], with the arrow turned to point at the answer |
| Multi true / false, word-bank dropdowns | bare rows with a plain index | row cards with the shared index badge; inputs take the free width |
| Table fill | full grid lines, answer cells a faint blue | a rounded table with a header band and hairline rules; answer cells tinted green **with a 3 px top edge** (non-colour cue) |
| Media | the image floated in a plain box; mismatched buttons | the image on a framed stage, centred; one button language (the toolbar's), the AI action tonal, remove in danger colours |
| Attached code / classification / activity | outlined full-width button; plain boxes | the empty «إضافة كود مرفق» reads as a dashed add zone; code source on a dark code surface; classification and activity as titled panels |

**Fixed while restyling** (measured in real Chromium):
- **Answer radios were 19 px tall on touch screens.** The MCQ «الصحيح» and true / false choices are now ≥ 44 px under
  `pointer: coarse`.
- The phone option row keeps its controls on one line. The generated number badge is `border-box`; as `content-box`, its padding
  made the badge 40 px and pushed «×» onto a line of its own.

**Evidence** (local, on this head):

- **Chromium harness** `scripts/capture-visual-gate-21e2p2.mjs`:
  - fixture: a saved exam with multiple choice + SVG image, true / false, multi true / false, matching, word bank and table fill,
    stored in the exact shapes the editors write;
  - viewports: 1280×900, 853×600 @1.5, 640×450 @2, 390×844 touch;
  - capture-only conditions, identical for both builds: element shots in a tall viewport at the same width, toolbar unstuck.

  | Check | BEFORE (`f7539b08`) | AFTER |
  |---|---|---|
  | Q-1 every card renders | ✓ | ✓ |
  | Q-2 stored answers are the checked / selected controls | ✓ | ✓ |
  | Q-3 choosing another MCQ answer: one radio checked, exam marked unsaved | ✓ | ✓ |
  | Q-4 «+ إضافة خيار» adds exactly one row | ✓ | ✓ |
  | V-1 no horizontal overflow; V-2 no control off-screen | ✓ | ✓ |
  | E-1 no page / console errors | ✓ | ✓ |
  | **T-1 answer targets ≥ 44 px on touch** | **✗** (radios 19 px) | ✓ |
  | **L-1 MCQ option controls on one line** | **✗** (phone: «×» wraps) | ✓ |
  | Total | 28 / 30 | **30 / 30** |

- **Guards:** `builderPremiumEditors.21e2p2` (11) + `builderPremium.21e2p1` (11) + `src/designSystem` guards: 52/52.
- **Planted defects** (not a campaign; file hash-restored), each KILLED:
  - the badge back to `content-box`;
  - the touch rule for answer pills removed;
  - the chosen pill losing its background.
- **Static checks:** `tsc -b` clean; lint 125 warnings (baseline), 0 errors; `npm run build` with the bundle guard passed;
  `git diff --check` clean.
- **Full root suite:** CI on the exact head; the local run of slice 1 showed only environment-bound failures.

**Harness notes:**
- An element screenshot can leave Chromium's emulated metrics changed, so touch sizes are measured **before** any screenshot. An
  earlier ordering misreported slice 1's 44 px controls as 32–36 px.
- Element shots inside the fixed, scrolling overlay can time out on "stable", so the harness falls back to a viewport clip.

**Seen while testing, not changed here** (part 2's inline issues, owned by the builder-integration branch): with an invalid
fixture, the inline issue messages print an empty name, e.g. «قيم الإجابة في «» لا تطابق عدد الفراغات», for a question
without a display label. Handed over as an observation.

**Next slices:**
1. builder navigation and finalization panels;
2. teacher dashboard and exam lists;
3. the student exam experience, after PR #303's 21E.3 work, to avoid conflicts;
4. shared SmartSim / 3D framing.
