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

## Slice 3 — the builder panels: «مستكشف الأسئلة», the bulk-selection bar, «فحص الجاهزية للاعتماد»

**Base and branch:**
- stacked on slice 2's head `12ec2bc7`;
- branch `feature/phase-21e2-premium-s3-panels`;
- merge order: **#302 → #304 → #305 → this slice**.

**Edit set:**
- `src/builder/builder-premium-panels.css`: new.
- `src/builder/builder-premium.css`: one more `@import`.
- `src/builder/builderPremiumPanels.21e2p3.test.ts`: new, 9 guards.
- `scripts/capture-visual-gate-21e2p3.mjs`: new harness.
- This section.

No component file changes. As in slice 2, this edit set shares no file with the builder-integration branch, which was still at
`f7539b08` when checked before commit.

**What the teacher sees:**

| Panel | Before | After |
|---|---|---|
| Question navigator (side panel above 900 px, dialog below) | plain search box, heavy dashed group rules, round 22 px number dots, a 16 px checkbox beside each row | a pill search field; section groups with a hairline rule and a count pill; rounded-square number tiles matching the question cards; the selected row tinted with a ring; filters and actions banded |
| Bulk-selection bar | white bar, the count a small grey pill | a tinted selection band with a filled «2 أسئلة محددة» count and one button language; «حذف» in danger text |
| Readiness dialog | a flat list; the blocker an outlined box | the decision as a status panel; section headings with rules; each blocker / warning a tinted card with a 4 px tone edge and a labelled pill on white («يمنع الاعتماد النهائي»), so the tone is never colour alone |

**Fixed while restyling** (measured in real Chromium, phone, touch):
- navigator checkboxes 16 px → 24 px (WCAG 2.5.8);
- «تحديد القسم» 22 px → 44 px;
- «تحديد الظاهر» 40 px → 44 px;
- the question rows → 44 px.

**Cascade finding:** `structured-builder.css` is imported again by the structured-import chunks, so after one of them loads, a
legacy rule wins any **tie** in specificity. «تحديد الظاهر» stayed at 40 px for exactly this reason. The new guard requires every
slice-3 rule to be more specific than any legacy rule that can match the same element and sets the same property.

**Evidence** (local, on this head):

- **Chromium harness** `scripts/capture-visual-gate-21e2p3.mjs`:
  - fixture: slice 2's exam plus a blueprint with a quality policy, so the readiness dialog has a real blocker with evidence;
  - viewports: 1280×900 (panel), 853×600 @1.5, 640×450 @2, 390×844 touch (dialog).

  | Check | BEFORE (`12ec2bc7`) | AFTER |
  |---|---|---|
  | N-1 the navigator lists 6; N-2 the type filter narrows to 1, «مسح الفلاتر» restores 6 | ✓ | ✓ |
  | B-1 the bulk bar counts 2; B-2 its position rule is unchanged (sticky above 640 px, static below) | ✓ | ✓ |
  | R-1 readiness: 3 sections, a quality-gate blocker; R-2 «عرض الأسئلة» closes the dialog and focuses the question card | ✓ | ✓ |
  | V-1 no horizontal overflow; E-1 no page / console errors | ✓ | ✓ |
  | **T-1 touch: navigator rows / buttons ≥ 44 px, checkboxes ≥ 24 px** | **✗** | ✓ |
  | Total | 29 / 30 | **30 / 30** |

- **Guards:** slice 3 (9) + slice 2 (11) + slice 1 (11) + `src/designSystem`: 61/61.
- **Planted defects** (file hash-restored), each KILLED:
  - the navigator made non-sticky;
  - the checkbox touch size removed;
  - the readiness pill moved onto the tint.
- **Static checks:** `tsc -b` clean; lint 125 warnings (baseline), 0 errors; `npm run build` with the bundle guard passed;
  `git diff --check` clean.

**Seen while testing, not changed here** (dialog / menu behaviour owned by the builder-integration branch):
- **Focus loss and an ignored click at 200 %.** At 640×450, after Escape closes the navigator dialog:
  - focus is on `<body>`;
  - the next pointer click on «المزيد» does not open the menu; a second click does.
  
  The harness records this as `menuFirstClickIgnored` and retries.
- **Raw navigator text for matching questions.** The navigator shows a matching question's stored table markdown («| البروتوكول |
  الوظيفة | | --- …») as its text.

## Slice 4 — the teacher's exam lists (access bar, «الامتحانات المحفوظة», «القوالب المحفوظة»)

**Base and branch:**
- stacked on slice 3's head `45083dd0`;
- branch `feature/phase-21e2-premium-s4-exam-lists`;
- merge order: **#302 → #304 → #305 → #306 → this slice**.

**Edit set:**
- `src/teacher/exam-lists-premium.css`: new.
- `src/builder-pro.css`: one `@import` line.
- `src/teacher/examListsPremium.21e2p4.test.ts`: new, 9 guards.
- `scripts/capture-visual-gate-21e2p4.mjs`: new harness.
- This section.

**No overlap:** checked against #302, #303 and the builder-integration branch, none of which touches `builder-pro.css` or these
files. No component file changes; `App.tsx` is untouched.

**Load order:** App.tsx loads `App.css` and then `builder-pro.css`, and nothing else loads either. A rule in this sheet therefore
wins an equal-specificity tie with App.css, and the guard requires each rule to be at least as specific as every App.css rule
for the same element, state and property.

**What the teacher sees:**

| Area | Before | After |
|---|---|---|
| Access bar | four equal buttons and a hint squeezed beside them | a toolbar of secondary actions with the hint as a caption line |
| Saved exams / templates rows | title, plain «18 سؤال · 60 علامة», two equal buttons | a page tile (folded corner, heading bar, right-aligned lines; templates in the info tone), the title, the counts in a chip, the last-save line, and actions by weight: «فتح وتعديل» / «استخدام القالب» filled, «حذف» quiet in danger text |
| Panel headings | — | a 20 px title, a muted eyebrow, a ruled header and a ghost «↻ تحديث» |
| Phone | the tile would sit on a row of its own (App.css stacks the row) | the tile stays beside the title and the actions take a full row |

**Fixed while restyling:** the touch targets (refresh, open, delete, use template) were 42 px and are now 44 px.

**Evidence** (local, on this head):

- **Chromium harness** `scripts/capture-visual-gate-21e2p4.mjs`: 5 saved exams and 3 templates; 1280×900, 853×600 @1.5,
  640×450 @2, 390×844 touch.

  | Check | BEFORE (`45083dd0`) | AFTER |
  |---|---|---|
  | L-1 5 exams with title, counts, «آخر حفظ»; L-2 3 templates | ✓ | ✓ |
  | L-3 «فتح وتعديل» opens that exam in the builder; L-4 «حذف» asks first, cancel keeps 5 | ✓ | ✓ |
  | V-1 no overflow; E-1 no page / console errors | ✓ | ✓ |
  | **T-1 touch: access-bar and row actions ≥ 44 px** | **✗** (42 px) | ✓ |
  | Total | 21 / 22 | **22 / 22** |

- **Guards:** slices 1–4 + `src/designSystem`: 70/70.
- **Planted defects** (file hash-restored), each KILLED:
  - the open button no longer filled;
  - the touch rule removed;
  - the access-bar focus ring removed;
  - the delete rule weakened below App.css.
- **Static checks:** `tsc -b` clean; lint 125 warnings (baseline), 0 errors; build with the bundle guard passed;
  `git diff --check` clean.

**Not changed (markup, out of scope):**
- the emoji in the access-bar labels («📚 …», «🧱 …»);
- the English eyebrows «Azure Storage» / «Exam Templates».

Both are text in `App.tsx`, which the builder-integration branch is still editing. They are left for a later markup slice.
