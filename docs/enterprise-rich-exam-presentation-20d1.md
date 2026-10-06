# Phase 20D.1 — Enterprise Rich Exam Presentation & Interactive UX Engine

Baseline `0b2208076610c95c993fca2f4b8c6461bb8cc887` (Phase 20D merged). Branch `feature/20d1-enterprise-rich-exam-presentation`.

## 1. Purpose and the one rule

Teachers can now give an exam a professional, consistent visual identity (`exam.presentation`, **ExamPresentationV1**) and write
structured, accessible question content (`richContent`, **RichContentV1**) — tables, figures, code, CLI, formulas, callouts —
without ever writing HTML or CSS.

> **UI displays and collects. Domain interprets. Server decides.**

Presentation and rich content are **academically inert**: no grader, identity, fingerprint, parametric seed, marks, first-N,
section selection, coding target or rebuild function reads them (pinned by `api/tests/presentation-20d1.test.js` §S4 and the
acceptance suite). They are data in a closed vocabulary; the only code that turns them into pixels is code-owned React + CSS.

## 2. What JSON may never contain

Raw HTML or CSS of any kind: `<style>`, `<script>`, `iframe`, `object`, `embed`, SVG source, event handlers, `javascript:` /
`vbscript:` / `data:text/html`, external stylesheet / font / image URLs, selectors, class / component / module names, `url(...)`,
`expression(...)`, CSS variables or free-form CSS values. Stored colours are strict `#RRGGBB` (`#RGB` is refused; authoring UIs expand it before
writing). Every other value
is a word from the frozen vocabulary (`PRESENTATION_VOCABULARY`). Unknown keys, unknown versions and prototype keys
(`__proto__`, `constructor`, `prototype`) are refused, never ignored. No exam data ever reaches `dangerouslySetInnerHTML`,
`innerHTML`, `eval` or `new Function` (source guard in `richContentRenderer.20d1.test.tsx`).

## 3. ExamPresentationV1 (`exam.presentation`)

```
{ schemaVersion: 1,
  preset: default | classicPaper | modernAcademic | cards | focus | compact | scienceLab | networkLab | developerWorkspace | friendly | highContrast,
  direction?: "rtl" | "ltr", appearance?: "light",
  tokens?: { colors?: { primary accent background surface surfaceAlt text muted border success warning danger: "#RRGGBB" },
             typography?: { family: systemArabic|systemSans|academicSerif|developerMono, scale: compact|normal|comfortable|large,
                            lineHeight: tight|normal|relaxed, questionWeight: regular|medium|bold },
             spacing?: compact|normal|comfortable|spacious, radius?: none|sm|md|lg|xl, shadow?: none|subtle|medium|strong },
  layout?: { pageWidth: narrow|normal|wide|full, questionSpacing, sectionSpacing: compact|normal|large,
             scenarioPlacement: inline|responsiveSide },   // no top-bar control: lifecycle chrome is code-owned
  components?: { <slot>: { variant } },          // slots and variants below
  questionTypeVariants?: { <catalog type key>: standard|writingPaper|developerWorkspace|laboratory|networkWorkspace|storyWorkspace|visualWorkspace },
  motion?: { level: none|subtle }, print?: { mode: academic|compact } }
```

| Slot | Variants |
|---|---|
| examHeader | plain · hero · banded · minimal |
| sectionHeader | plain · band · underline · card |
| questionCard | flat · outlined · elevated · paper |
| questionNumber | plain · badge · circle · square |
| marksBadge | text · pill · outline · corner |
| questionStem | compact · normal · comfortable |
| table | plain · striped · bordered · minimal |
| callout | soft · solid · outline |
| answerArea | plain · contained · lined |
| navigation | standard · modern · minimal |
| figure | plain · framed |
| code | light · dark |

Default type variants: `coding → developerWorkspace`, `smartSim / simulation → laboratory` (`networkLab`: `networkWorkspace`),
`composite → storyWorkspace`, `openResponse → writingPaper`, `networkCli → networkWorkspace`, `hotspot / labelDiagram → visualWorkspace`.

**Overrides.** `section.presentation = { schemaVersion: 1, components?: { sectionHeader, questionCard, questionNumber, marksBadge,
answerArea }, layout?: { questionSpacing } }` (bounded: a section cannot change colours, fonts or the exam header).
`question.presentation = { schemaVersion: 1, variant?, width?: normal|wide|full, answerArea?, card? }`.
Precedence: question override → section override → exam components / type variants → preset.

**States.** Absent → the exact legacy `presentationTheme` path (DOM byte-identical, pinned by `src/presentationFreeze.20d1.test.tsx`).
Malformed → **finalization blocker** (`PRESENTATION_*` codes) and, at runtime, the safe `default` preset with `data-xp-fallback="true"`
— never a crash, never a partial spread of unvalidated values.

**Contrast (blocking).** `text/background ≥ 4.5`, `text/surface ≥ 4.5`, `text/surfaceAlt ≥ 4.5`, `muted/surface ≥ 4.5`,
`#FFFFFF/primary ≥ 4.5` (selected state, primary buttons), `primary/surface ≥ 3` (focus ring, non-text UI). All 11 presets pass;
a custom palette that fails is a finalization blocker (`PRESENTATION_CONTRAST`) and a visible Studio warning.

## 4. RichContentV1 (`richContent`, `instructionsRichContent`)

```
{ schemaVersion: 1, blocks: Block[] }
Run   = { text, marks?: (bold|italic|underline|code|sup|sub)[], dir?: ltr|rtl } | { math }      // no links
Cell  = string | { runs }
Block = heading(level 2|3|4) · paragraph(dir?, align?) · unorderedList · orderedList
      · table(caption?, columnHeaders?, rowHeaders?, rows, responsive?: scroll|stack|compact)
      · image(asset, alt) · figure(asset, alt, caption) · code(language, source, lineNumbers?, title?) · cli(source, title?)
      · quote(runs, citation?) · callout(variant: info|note|warning|success|important, title?, runs) · divider
      · keyValueGrid(items: {label, value}[]) · columns(exactly 2, no nested columns) · math(source)
```

Code languages: python, java, csharp, pseudocode, javascript, html, css, sql, text. Images use the canonical image-asset contract
(`src/imageAsset.ts`): a safe raster data URL (png / jpeg / webp) or a bank identity — never SVG, never an external URL.

**Bounds (`RICH_LIMITS`).** 200 blocks (nested counted), 200 runs per container, 20 000 chars per text block, 100 000 chars total,
100 list items, 100 table rows × 12 columns, 2 000 chars per cell, 500 chars for caption / title / citation / alt / label / value,
64 KB per code block, 2 000 chars per formula, 50 key-value items, column depth 1, 512 KB serialized (excluding image payloads).

**Refusals.** `RICH_CONTENT_INVALID / _VERSION / _UNKNOWN_KEY / _BLOCK_TYPE / _LIMIT / _RAW_HTML / _IMAGE / _MATH / _NESTING /
_EMPTY / _INVALID_TEXT`. Raw-HTML detection applies to prose (code and CLI sources are displayed as text and may legitimately
contain `<`).

**Math.** A repository-owned LaTeX subset (`src/richContent/richMath.ts`) parsed into a closed AST — fractions, roots, scripts,
accents (`\vec \overline \bar \hat \dot`), `\left…\right` fences, Greek letters, operators, functions, large operators, `\text`.
No macros, no `\def`, `\href`, `\url`, `\style`, `\class`, `\html`. The lazy renderer emits MathML elements only. No new dependency.

**Placement.** `question.richContent` (all types except `parametricNumeric`, whose stem is a generated template →
`PARAMETRIC_RICH_CONTENT_FORBIDDEN`), `section.instructionsRichContent`, `coverPage.instructionsRichContent`, composite part
`richContent`, and the additive scenario source kind `rich` (`{ id, version: 1, kind: "rich", title?, richContent }` →
`SOURCE_RICH_INVALID`; the four legacy kinds are unchanged). Not on frozen `compound@1` parts.

**Rendering precedence.** A valid `richContent` replaces the visual stem (same `iex-qtext-<id>` id, so `aria-describedby` keeps
working); `q.text` stays **required** (`EMPTY_TEXT` blocks finalization even with a rich stem — teacher grading / review, item
analysis, revisions, training review, search and AI requests read it) and renders exactly as on the baseline when rich content is
absent or invalid. A node generated per attempt (`parametricNumeric`, or any node carrying a `parametric` config) never shows a rich
stem (finalization blocker, server projection and client renderer all use the same predicate). The legacy pipe-table parser still derives tableFill answer UIs from `q.text`.

## 5. Runtime (student and preview are the same code)

| Piece | File | Graph |
|---|---|---|
| Context (no logic) | `src/presentation/presentationContext.ts` | initial |
| Question card hook + lazy stem | `src/StudentQuestionCard.tsx` | initial (hook + lazy import only) |
| Rich stem / rich slot | `src/richContent/RichPrompt.tsx` | lazy |
| Trusted renderer | `src/richContent/RichContentRenderer.tsx`, `RichMath.tsx`, `rich-content.css` | lazy |
| Scoped root, section scope, preview section | `src/presentation/PresentationRoot.tsx`, `presentationRuntime.ts`, `presentation.css` | lazy |
| Shared section header | `src/presentation/SectionShellHeader.tsx` | lazy |

`StudentExamPage` and `ExamPreview` both render `PresentationRoot` → `SectionShellHeader` → `StudentQuestionCard` (+ `RichPrompt`)
with the same CSS (`presentationParity.20d1.test.tsx` compares the article and section header markup of both views).
The root carries `class="exam-presentation"`, `dir="rtl"` (always — `direction: "ltr"` is applied by CSS to the content only, never to
the lifecycle chrome), `data-xp-*` vocabulary attributes and **only** `--xp-*` custom properties
computed by code from validated tokens. All rules live under `.exam-presentation` / `.xp-rich`; breakpoints (768 / 1024 px) are
code-owned; `prefers-reduced-motion` and `motion: none` disable the entrance animation; a `@media print` block keeps tables,
code and figures intact.

**Lifecycle chrome is not presentation-controlled.** Submit, timer, save status, strict-mode notices, exit and logout are styled
only by code-owned rules; no vocabulary value can hide, move or cover them (the root style never contains `display`, `position`,
`z-index`, `opacity`, `visibility` or `url`, pinned by the parity suite; a static guard in
`presentationReviewFix1.20d1.test.tsx` refuses any screen rule in the presentation stylesheets that targets the top bar, bottom
navigation, save status, countdown, strict notices or pause row with a placement / visibility property or a transparent background).

## 6. Server authorities

- **Finalization** (`src/examQuality.ts`, shared build): exam / section / question presentation, cover / section / question / composite
  part rich content and the rich scenario source are validated; any issue is an error (blocker).
- **Student projection** (`api/src/lib/student-exam-sanitize.js`): every field is rebuilt from the canonical validator output
  (`projectPresentationForStudent`, `projectSectionPresentationForStudent`, `projectQuestionPresentationForStudent`,
  `projectRichContentForStudent`) — never spread, never passed through the deep secret stripper (which would mangle it). A
  malformed object is dropped whole: the student sees the plain text, and a malformed exam presentation leaves the student on the legacy
  theme path (the teacher preview resolves the same value to the default preset flagged `data-xp-fallback`; finalization blocks it). The pre-start payload
  (`preStartAssignment`) now sanitizes the cover (with bank images in its rich instructions hydrated) and carries the projected
  presentation.
- **Bank hydration** (`api/src/lib/bank-asset-hydrate.js`): rich images with a bank identity are hydrated to signed delivery URLs
  and normalized back to identities for storage, like every other bank image.
- **Shared build** (`scripts/build-shared-finalization.mjs`): now compiles sub-directories (`presentation/`, `richContent/`); the
  drift test walks them recursively (a tampered nested file fails it).

## 7. Authoring

- **Presentation Studio** (`src/presentation/PresentationStudio.tsx`, lazy, builder toolbar «العرض والتصميم»): tabs القوالب ·
  الألوان · الخطوط · التخطيط · المكوّنات · أنواع الأسئلة · الأقسام · الطباعة · إمكانية الوصول; live preview through the real runtime
  with desktop / tablet / phone frames; contrast warnings; confirmed resets. It writes vocabulary values only.
- **Question override**: «عرض السؤال» in the question composer (width / variant / card / answer area).
- **Rich Content editor** (`src/richContent/RichContentEditor.tsx`, lazy): block-based, no `contentEditable`; inline marks typed with
  a small Markdown-like syntax; issues from the canonical validator are shown on the block.
- **Markdown conversion** (`src/richContent/markdownToRichContent.ts`, lazy): an explicit teacher action «تحويل النص إلى محتوى
  منسق» with a preview and a confirmation — never an automatic migration. Raw HTML is refused (`MARKDOWN_HTML_REFUSED`),
  external images become a text note, links keep their text only; every produced block is re-validated.
- **Presets** (`src/assessmentPreset.ts`): an Assessment Preset carries the canonical presentation and section overrides (validated;
  extraction fails closed on a malformed source).
- **Copy / duplicate / bank**: deep copies keep rich content; bank insertion copies a valid rich stem; question type changes keep it
  (except to `parametricNumeric`).
- **Import / export**: the JSON import path keeps `presentation` / `richContent` and judges them with the finalization validators;
  the acceptance suite proves import → export → import is byte-stable.

**Not carried**: the legacy flat-exam «template» document (`save-exam-artifact` `buildTemplateDocument`) stores plan / metadata /
theme only, as before; presentation lives on structured exams and Assessment Presets.

## 8. Importable JSON example

`docs/fixtures/presentation-20d1/E-showcase.json` is a complete importable exam using every rich block, custom tokens, section and
question overrides. Fixtures A–F (`A-classic-arabic`, `B-network-lab`, `C-physics`, `D-cs`, `E-showcase`, `F-legacy`) are the
acceptance set (`api/tests/presentation-acceptance-20d1.test.js`): each imports with zero errors, round-trips byte-identically,
projects strictly and grades identically with all presentation / rich fields removed. F is the legacy pin.

Minimal example:

```json
{
  "title": "مختبر الشبكات",
  "presentation": { "schemaVersion": 1, "preset": "networkLab", "components": { "table": { "variant": "striped" } } },
  "sections": [{
    "id": "s1", "title": "القسم العملي", "gradingPolicy": "all",
    "questions": [{
      "examQuestionId": "q1", "presentationType": "multipleChoice", "marks": 2,
      "text": "ما بوابة PC2 الافتراضية؟",
      "richContent": { "schemaVersion": 1, "blocks": [
        { "type": "table", "caption": "جدول العنونة", "columnHeaders": ["الجهاز", "IP", "البوابة"],
          "rows": [["PC1", "192.168.10.10", "192.168.10.1"], ["PC2", "192.168.20.10", "192.168.20.1"]] },
        { "type": "paragraph", "runs": [{ "text": "ما " }, { "text": "البوابة الافتراضية", "marks": ["bold"] }, { "text": " للجهاز PC2؟" }] }
      ] },
      "options": [{ "text": "192.168.10.1" }, { "text": "192.168.20.1" }], "answer": { "correctOptionIndex": 1 }
    }]
  }]
}
```

## 9. Performance

Initial JS budget 125 KB gzip — **not raised**. The initial graph gains only `presentationContext.ts` and the lazy-import lines in
`StudentQuestionCard`, `ExamPreview` and `StructuredExamCover`. The renderer, math, models, root, CSS, Studio, editor and Markdown
converter are lazy chunks, guarded by `PRESENTATION_SIGNATURES` in `scripts/check-bundle-budget.mjs` (a signature found in an
initial file fails the build; a signature found nowhere is reported as stale). The guard also reports initial CSS and lazy
presentation CSS.

## 10. Known limitations (v1)

- Light appearance only (`appearance: "light"`); a dark appearance would be a new vocabulary value.
- No hyperlinks in rich content (by design); no inline images inside runs.
- Math is a LaTeX subset (no matrices / aligned environments in v1).
- Legacy question-type aliases (e.g. `open`) do not receive a `data-xp-type`; catalog keys do.
- No visual regression run in a real browser in CI; DOM-level parity and freeze pins are the evidence.
- The Studio's tablet / phone frames narrow the preview only; runtime breakpoints follow the real window width.
- `data-xp-label` on stacked table cells carries the author's column header text (rendered through a React attribute and CSS
  `attr()`; never HTML) — the "vocabulary only" rule applies to the root and question-shell `data-xp-*` attributes.
- Very long bank blob names without an asset id fail the image contract (fail-closed: the image is refused, the stem still renders).

## 11. Independent review and Review Fix 1

The internal independent review (read-only, at `679513f`/`1eb2c21`) found 0 blockers, 3 majors, 7 minors. All were fixed with
fail-first tests (`src/presentation/presentationReviewFix1.20d1.test.tsx`, `api/tests/presentation-reviewfix1-20d1.test.js`;
24 + 4 cases failed on `1eb2c21`):

| Finding | Fix |
|---|---|
| MAJOR-1 quadratic raw-HTML regex (≈2 s of CPU per student delivery per crafted question) | linear policy regex: dangerous elements on their opening token, structural tags only as a complete `<…>` without inner `<`; server copy regenerated |
| MAJOR-2 `stickyTopBar:false` unpinned the timer / exit bar; `navigation: minimal` made the sticky bottom nav transparent | `stickyTopBar` removed from the v1 vocabulary and the Studio; minimal navigation keeps an opaque surface; static CSS guard |
| MAJOR-3 rich-only stems passed finalization with empty `text` (blank stems in grading / review / training) | `EMPTY_TEXT` stays blocking, with a hint to «استخدام نص المحتوى كنص بديل» |
| MINOR-1 legitimate `0 < a < 1` prose refused / rewritten to `＜` | resolved by the MAJOR-1 policy |
| MINOR-2 unbraced `\vec \vec … x` bypassed the math depth limit | depth checked in `atom()` |
| MINOR-3 two parametric predicates | one predicate (`parametricNumeric` or a `parametric` config) in finalization, sanitizer and `RichPrompt` |
| MINOR-4 rich section instructions invisible without an exam presentation | rendered by the legacy student section context and preview section too (lazy) |
| MINOR-5 `direction: "ltr"` mirrored the lifecycle chrome | root stays `rtl`; `data-xp-direction` + content-only CSS `direction` |
| MINOR-6 Markdown converter quadratic paths (heading regex, unmatched emphasis rescans, per-candidate slice/split) | linear heading parser, 32-miss closer budget per segment, running `*` count |
| MINOR-7 pre-start cover bank images not hydrated | cover hydrated before projection |
| Nits | strict stored `#RRGGBB`; no empty `<figcaption>`; surrogate-safe chunking; composite parametric hint wording; doc corrections |

Tests written in this PR that pinned the corrected behaviours were updated with the fix (each change is the review finding itself):
`presentationModel.20d1` (sticky key → unknown key; `#RGB` refused), `presentationStudio.20d1` (no sticky switch),
`presentation-20d1` S2 (rich-only stem → `EMPTY_TEXT`), `richContentEditor.20d1` (`x < a` stays literal).

## 12. Mutation campaign

Runner: one mutant at a time, exact single-occurrence replacement, SHA-256-verified byte-for-byte restore in `finally`, the listed
suites per mutant, `git status` checked clean after the run. Round 1 (62 mutants on `679513f`): 50 KILLED, 11 SURVIVED (test gaps —
closed in `1eb2c21`), 1 invalid replacement re-planted. Final campaign on `f9d4eb7` (62 original + 20 Review Fix 1 mutants, anchors
re-pointed where Review Fix 1 moved code): 79 KILLED, 3 SURVIVED → two pins added (P02, RF14 now KILLED), MA2 judged **equivalent**
(the row-level depth check is redundant: every nested row is entered through `atom()`, which enforces the same bound since Review
Fix 1). **Final: 81 KILLED, 1 EQUIVALENT, 0 non-equivalent survivors, 0 timeouts.**

| Id | File | Planted defect | Outcome | Killed by (suite) |
|---|---|---|---|---|
| P01 | `src/presentation/presentationModel.ts` | unknown exam-presentation keys accepted | KILLED | src/presentation/presentationModel.20d1.test.ts |
| P02 | `src/presentation/presentationModel.ts` | any string accepted as a colour | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| P03 | `src/presentation/presentationModel.ts` | contrast policy never fails | KILLED | src/presentation/presentationModel.20d1.test.ts |
| P04 | `src/presentation/presentationModel.ts` | unknown preset accepted | KILLED | src/presentation/presentationModel.20d1.test.ts |
| P05 | `src/presentation/presentationModel.ts` | vocabulary word check removed | KILLED | src/presentation/presentationModel.20d1.test.ts |
| P06 | `src/presentation/presentationModel.ts` | malformed presentation not flagged as fallback | KILLED | src/presentation/presentationModel.20d1.test.ts |
| P07 | `src/presentation/presentationModel.ts` | absent presentation no longer null (legacy path lost) | KILLED | src/presentation/presentationModel.20d1.test.ts |
| P08 | `src/presentation/presentationModel.ts` | section override may carry any slot | KILLED | src/assessmentPreset.20d1.test.ts |
| P09 | `src/presentation/presentationModel.ts` | question width not checked | KILLED | src/presentation/presentationModel.20d1.test.ts |
| P10 | `src/presentation/presentationModel.ts` | student projection returns raw input | KILLED | src/presentation/presentationModel.20d1.test.ts |
| P11 | `src/presentation/presentationModel.ts` | question override precedence lost (variant) | KILLED | src/presentation/presentationModel.20d1.test.ts |
| P12 | `src/presentation/presentationModel.ts` | section override ignored by resolver | KILLED | src/presentation/presentationModel.20d1.test.ts |
| R01 | `src/richContent/richContentModel.ts` | raw HTML in prose accepted | KILLED | src/richContent/richContentModel.20d1.test.ts |
| R02 | `src/richContent/richContentModel.ts` | control characters in prose accepted | KILLED | src/richContent/richContentModel.20d1.test.ts |
| R03 | `src/richContent/richContentModel.ts` | unknown rich keys accepted | KILLED | src/richContent/richContentModel.20d1.test.ts |
| R04 | `src/richContent/richContentModel.ts` | image asset not validated | KILLED | src/richContent/richContentModel.20d1.test.ts |
| R05 | `src/richContent/richContentModel.ts` | table column limit on rows removed | KILLED | src/richContent/richContentModel.20d1.test.ts |
| R06 | `src/richContent/richContentModel.ts` | nested columns allowed | KILLED | src/richContent/richContentModel.20d1.test.ts |
| R07 | `src/richContent/richContentModel.ts` | total text limit removed | KILLED | src/richContent/richContentModel.20d1.test.ts |
| R08 | `src/richContent/richContentModel.ts` | serialized size limit removed | KILLED | src/richContent/richContentModel.20d1.test.ts |
| R09 | `src/richContent/richContentModel.ts` | block text limit removed | KILLED | src/richContent/richContentModel.20d1.test.ts |
| R10 | `src/richContent/richContentModel.ts` | student projection returns raw input | KILLED | src/richContent/richContentModel.20d1.test.ts |
| MA1 | `src/richContent/richMath.ts` | unknown math command accepted | KILLED | src/richContent/richContentModel.20d1.test.ts |
| MA2 | `src/richContent/richMath.ts` | math depth limit removed (row) | EQUIVALENT | — (atom() applies the same bound to every nested row since Review Fix 1) |
| MA3 | `src/richContent/richMath.ts` | math node limit removed | KILLED | src/richContent/richContentModel.20d1.test.ts |
| S01 | `api/src/lib/student-exam-sanitize.js` | parametric stem keeps rich content | KILLED | api/tests/presentation-20d1.test.js |
| S02 | `api/src/lib/student-exam-sanitize.js` | question rich content passed through raw | KILLED | api/tests/presentation-20d1.test.js |
| S03 | `api/src/lib/student-exam-sanitize.js` | question presentation passed through raw | KILLED | api/tests/presentation-20d1.test.js |
| S04 | `api/src/lib/student-exam-sanitize.js` | rich/presentation fields not taken out before deep strip | KILLED | api/tests/presentation-20d1.test.js |
| S05 | `api/src/lib/student-exam-sanitize.js` | section rich instructions passed raw | KILLED | api/tests/presentation-20d1.test.js |
| S06 | `api/src/lib/student-exam-sanitize.js` | malformed exam presentation kept | KILLED | api/tests/presentation-20d1.test.js |
| S07 | `api/src/lib/student-exam-sanitize.js` | cover rich instructions passed raw | KILLED | api/tests/presentation-20d1.test.js |
| S08 | `api/src/functions/student-assignment.js` | pre-start cover not sanitized | KILLED | api/tests/presentation-20d1.test.js |
| S09 | `api/src/functions/student-assignment.js` | pre-start presentation not projected | KILLED | api/tests/presentation-20d1.test.js |
| S10 | `api/src/lib/student-exam-sanitize.js` | linked SmartSim composite child rich prompt passed raw | KILLED | api/tests/presentation-20d1.test.js |
| S11 | `api/src/lib/shared-finalization/richContent/richContentModel.js` | server copy accepts raw HTML | KILLED | api/tests/presentation-20d1.test.js |
| S12 | `api/src/lib/student-exam-sanitize.js` | section presentation passed raw | KILLED | api/tests/presentation-20d1.test.js |
| H01 | `api/src/lib/bank-asset-hydrate.js` | question rich images not hydrated | KILLED | api/tests/presentation-20d1.test.js |
| H02 | `api/src/lib/bank-asset-hydrate.js` | section rich images not hydrated | KILLED | api/tests/presentation-20d1.test.js |
| H03 | `api/src/lib/bank-asset-hydrate.js` | cover rich images not hydrated | KILLED | api/tests/presentation-20d1.test.js |
| B01 | `api/src/lib/bank-question-exam.js` | bank insertion copies an unvalidated rich stem | KILLED | api/tests/presentation-20d1.test.js |
| Q01 | `src/examQuality.ts` | exam presentation not a finalization blocker | KILLED | api/tests/presentation-20d1.test.js |
| Q02 | `src/examQuality.ts` | parametric rich content not forbidden | KILLED | api/tests/presentation-20d1.test.js |
| Q03 | `src/examQuality.ts` | question rich content not validated | KILLED | api/tests/presentation-20d1.test.js |
| Q04 | `src/examQuality.ts` | section override not validated | KILLED | api/tests/presentation-20d1.test.js |
| Q05 | `src/examQuality.ts` | cover rich instructions not validated | KILLED | api/tests/presentation-20d1.test.js |
| Q06 | `src/examQuality.ts` | question override not validated | KILLED | api/tests/presentation-20d1.test.js |
| SS1 | `src/scenarioSource.ts` | rich scenario source not validated | KILLED | api/tests/presentation-20d1.test.js |
| A01 | `src/assessmentPreset.ts` | preset extraction does not fail closed on malformed presentation | KILLED | src/assessmentPreset.20d1.test.ts |
| A02 | `src/assessmentPreset.ts` | preset copies the source presentation by reference | KILLED | src/assessmentPreset.20d1.test.ts |
| U01 | `src/richContent/RichContentRenderer.tsx` | column headers lose scope | KILLED | src/richContent/richContentRenderer.20d1.test.tsx |
| U02 | `src/richContent/RichContentRenderer.tsx` | row header rendered as td | KILLED | src/richContent/richContentRenderer.20d1.test.tsx |
| U03 | `src/richContent/RichContentRenderer.tsx` | content heading rendered as h2 | KILLED | src/richContent/richContentRenderer.20d1.test.tsx |
| U04 | `src/richContent/RichContentRenderer.tsx` | callout loses role=note | KILLED | src/richContent/richContentRenderer.20d1.test.tsx |
| U05 | `src/richContent/RichContentRenderer.tsx` | code block loses dir=ltr | KILLED | src/richContent/richContentRenderer.20d1.test.tsx |
| U06 | `src/richContent/RichPrompt.tsx` | invalid rich content rendered instead of plain fallback | KILLED | src/presentation/presentationParity.20d1.test.tsx |
| U07 | `src/StudentQuestionCard.tsx` | question article loses presentation attributes | KILLED | src/presentation/presentationParity.20d1.test.tsx |
| U08 | `src/StudentQuestionCard.tsx` | rich stem never rendered | KILLED | src/presentation/presentationParity.20d1.test.tsx |
| U09 | `src/presentation/presentationRuntime.ts` | question card variant ignored | KILLED | src/presentation/presentationParity.20d1.test.tsx |
| MD1 | `src/richContent/markdownToRichContent.ts` | Markdown HTML tags kept | KILLED | src/richContent/richContentEditor.20d1.test.tsx |
| MD2 | `src/richContent/markdownToRichContent.ts` | Markdown image URL kept | KILLED | src/richContent/richContentEditor.20d1.test.tsx |
| BG1 | `scripts/check-bundle-budget.mjs` | bundle guard loses the Studio signature | KILLED | src/presentation/presentationAuthoring.20d1.test.tsx |
| RF01 | `src/richContent/richContentModel.ts` | raw-HTML regex back to quadratic whitespace split | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF02 | `src/richContent/richContentModel.ts` | structural tags refused on the opening token alone | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF03 | `api/src/lib/shared-finalization/richContent/richContentModel.js` | server copy regex back to quadratic | KILLED | api/tests/presentation-reviewfix1-20d1.test.js |
| RF04 | `src/richContent/richMath.ts` | atom depth check removed | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF05 | `api/src/lib/student-exam-sanitize.js` | sanitizer ignores a stray parametric config | KILLED | api/tests/presentation-reviewfix1-20d1.test.js |
| RF06 | `src/examQuality.ts` | finalization ignores a stray parametric config | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF07 | `src/richContent/RichPrompt.tsx` | client renders a rich stem on a generated node | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF08 | `src/examQuality.ts` | rich stem again excuses empty text | KILLED | api/tests/presentation-20d1.test.js |
| RF09 | `src/presentation/presentation.css` | top bar unpinned by a presentation rule | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF10 | `src/presentation/presentation.css` | minimal navigation transparent again | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF11 | `src/presentation/PresentationRoot.tsx` | root dir follows the presentation direction | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF12 | `api/src/functions/student-assignment.js` | pre-start cover not hydrated | KILLED | api/tests/presentation-reviewfix1-20d1.test.js |
| RF13 | `src/richContent/markdownToRichContent.ts` | closer-miss budget removed | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF14 | `src/richContent/markdownToRichContent.ts` | running star parity inverted | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF15 | `src/richContent/markdownToRichContent.ts` | surrogate-safe cut removed | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF16 | `src/richContent/RichContentRenderer.tsx` | empty figcaption rendered | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF17 | `src/StructuredExamSection.tsx` | legacy preview ignores rich section instructions | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF18 | `src/student/exam/ExamSectionContext.tsx` | legacy student context ignores rich section instructions | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
| RF19 | `src/presentation/presentationModel.ts` | #RGB accepted again in stored JSON | KILLED | src/presentation/presentationModel.20d1.test.ts |
| RF20 | `src/presentation/presentationModel.ts` | root direction attribute removed | KILLED | src/presentation/presentationReviewFix1.20d1.test.tsx |
