# Phase 21A — Enterprise Scientific Math & Notation Renderer v2

Design record for Phase 21A. It extends the Phase 20D.1 safe math subset into a bounded **scientific notation language**:
matrices and determinants, systems and piecewise functions, aligned derivations, multiple integrals, complex-number notation,
number sets, scientific units, chemistry and electricity. The pipeline is unchanged in kind:

```
SOURCE text → strict allow-listed tokenizer + parser (richMath.ts) → CLOSED AST → React-created MathML elements (RichMath.tsx)
```

There is no generic TeX, no macro, no HTML, no MathJax, no KaTeX and no third-party parser. Nothing in this phase changes
how anything is graded.

## 1. Summary

- **Language version.** `MATH_LANGUAGE_VERSION = 2`. It is a strict superset of the 20D.1 subset (language 1).
  - Every source the 20D.1 parser accepted keeps a byte-identical AST.
  - Every source it refused stays refused, unless it carries a documented v2 construct.
- **Grids.** Seven fixed environments: `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `Vmatrix`, `cases`, `aligned`.
  - `&` and `\\` are legal only at a grid's own cell level.
  - Grids are bounded and never nest.
- **New vocabulary.**
  - Symbols: `\iint`, `\iiint`, `\rightleftharpoons`, `\leftrightarrow`, `\uparrow`, `\downarrow`, `\vdots`, `\ddots`, `\hbar`, `\ell`, `\Re`, `\Im`.
  - Functions: `\arg`, `\det`, `\sinh`, `\cosh`, `\tanh`, `\arcsin`, `\arccos`, `\arctan`.
  - Accent: `\ddot`.
  - Number sets: `\mathbb{N Z Q R C}`.
- **Renderer.** Grids render as MathML `mtable` / `mtr` / `mtd`. Fences and alignment come from a fixed table in code, keyed by environment.
- **Bidi and accessibility.** RTL-script `\text` (Arabic, Hebrew, …) keeps its RTL direction. Every formula is an LTR bidi isolate with `alttext`.
- **Authoring.** Multi-line LTR source field, live verdict from the parser, trusted per-block preview, and a lazy snippet palette that
  only inserts proven examples.
- **AI Composer.** Catalog **V2**, with a `scientificMath` capability derived from the code and a bounded prompt contract.
  AI formulas that look like markup are refused.
- **Certification.**
  - Old-grammar freeze: 60,000 candidates, pinned on 60ddadc.
  - Differential: 100,030 identical inputs, baseline parser vs head parser.
  - Generated v2 corpus: 40,000 cases.
  - Mini Acceptance Exam, run through the real platform lifecycle.
  - Mutation campaign: 50 mutants (§31).
- **Bundle.** The initial graph is unchanged; the 125 KB budget is unchanged.

## 2. Scope and non-goals

**In scope:**
- Parser language v2.
- MathML renderer for grids.
- RTL/LTR and accessibility.
- Mobile and print CSS.
- Builder authoring UX.
- One RichContent authority end to end.
- AI Composer catalog V2.
- Certification.

**Not in scope** (recorded in §35, not done):
- A computer-algebra solver, or grading by mathematical equivalence.
- A WYSIWYG formula editor.
- Generic LaTeX: `array` column specs, `\color`, `\operatorname`, macros.
- Nested environments.
- Rich rendering in the teacher review view.

## 3. Baseline, branch and process

| Item | Value |
|---|---|
| Baseline | `main` = `60ddadc2bca992d889b0f30bfb2fc7f541bd048c` (merge of PR #275, Phase 20G.3) |
| Branch | `feature/21a-scientific-math-notation-v2` |
| Pull request | Phase 21A — Enterprise Scientific Math & Notation Renderer v2 (DO NOT MERGE, auto-merge OFF) |
| Commits | Normal commits only, one per logical step. No amend, rebase or force-push. |

- Fail-first evidence was produced in a detached worktree of 60ddadc (§34).
- Every pin "captured on 60ddadc" was captured there, in capture mode, before (or independently of) any 21A production change.

## 4. Language identity and compatibility contract

- **Version constant.** `MATH_LANGUAGE_VERSION` (`richMath.ts`) is `2`.
- **Document schema.** RichContentV1 stays `schemaVersion: 1`. A math block is still `{ type: "math", source }` and an inline math run is
  still `{ math }`. No migration exists or is needed.
- **Old documents.** A document written for language 1 means exactly the same thing under language 2.
- **New documents.** A document using a v2 construct is refused by a language-1 reader. 60ddadc refuses the Mini Acceptance Exam at
  finalization with `FINALIZATION_REFUSED` (§30). This fails closed and never misreads.
- **Parser API.** `parseMath(source)` is unchanged: it returns `{ ok: true, ast } | { ok: false, message }` and never throws.
  New exports:
  - `MATH_LANGUAGE_VERSION`
  - `MATH_ENVIRONMENTS`
  - `MATH_GRID_LIMITS`
  - the `grid` AST node type

## 5. Pipeline architecture

| Stage | Module | Authority |
|---|---|---|
| Tokenize + parse | `src/richContent/richMath.ts` | The ONE math authority, shared with the API through the generated `api/src/lib/shared-finalization/richContent/richMath.js` (drift test). |
| Validate a document | `richContentModel.ts` `validateRichContent` | Calls `parseMath` for every math block and run. Used by import, save, finalization, sanitizer, AI intake. |
| Render | `RichMath.tsx` (lazy chunk) | Maps the closed AST to MathML elements with `React.createElement`. Text is always React text nodes. |
| Author | `RichContentEditor.tsx` `MathBody`, `MathSnippetPalette.tsx` (lazy) | Source field + verdict + preview + palette. |
| Feature catalog | `mathFeatures.ts` | Code-owned examples, proven by test. Consumed by the palette and the AI catalog only. |

## 6. Tokenizer changes

- **`&`.** Becomes a dedicated `cellsep` token. It is never a symbol and never text.
- **`\\`.** Becomes a dedicated `rowsep` token. `\` followed by a space is still an escaped space. So `a \\\ b` tokenizes as
  `rowsep` followed by a space; it is legal only inside a grid.
- **`\r`.** Now whitespace, so CRLF sources parse. Inside `\text`, whitespace is still kept as a single space.
- **Everything else.** Every other character class is unchanged, which the freeze proves (§26).

## 7. Grammar — the environment allow-list

`\begin{name}` reads a braced name token by token. The name must be ASCII letters only: no whitespace, no command, no group, at most
16 letters. It is then checked against a frozen table with `hasOwnProperty`, so prototype names such as `__proto__`, `constructor`
or `toString` are refused (mutant M02).

**Refused environments** (21A-S3):
- `array`, `tabular`, `align`, `align*`, `equation`, `gather`, `split`, `smallmatrix`
- Case variants: `Matrix`, `MATRIX`, `pmatrix*`
- Non-ASCII names, including a Cyrillic look-alike
- Empty or spaced names

## 8. Grammar — grids and contextual separators

```
grid := \begin{env} cell (& cell)* (\\ cell (& cell)*)* [\\] \end{env}
cell := row of atoms, stopped by &, \\ or \end
```

- **Separators are contextual.** `&` and `\\` are legal ONLY at the grid's own cell level. Everywhere else they are refused: at top
  level, inside a group, fraction, root, script or fence, inside a cell's group, and inside `\text`.
- **Trailing row break.** One trailing `\\` before `\end` adds no row (LaTeX behaviour).
- **Row spacing.** `\\[2pt]` (and any `[` after `\\`) is refused.
- **Matching names.** `\end{name}` must equal the opening name.
- **No nesting.** A grid inside a grid is refused, directly or through a group, `\left…\right` or `\frac`.

## 9. Bounds

**Global bounds (unchanged):**
- 2,000 characters
- 600 AST nodes
- nesting depth 24 (a grid cell costs one level)

**Grid bounds** (`MATH_GRID_LIMITS`):

| Bound | Value |
|---|---|
| Rows | 12 |
| Columns (matrix family) | 8 |
| Cells | 64 |
| `cases` columns | 2 |
| `aligned` columns | 2 |

Bounds are checked **while parsing**: a grid is refused as soon as a bound is crossed, before the rest is materialized.

## 10. Matrix family rules

Applies to `matrix`, `pmatrix`, `bmatrix`, `vmatrix` and `Vmatrix`:
- Every row has the same number of cells. Ragged rows are refused, never padded.
- No cell may be empty. `a && b`, `a & \\`, and empty rows are refused.
- At least one non-empty cell. An empty grid is refused.

## 11. `cases` and `aligned` rules

- **`cases`.** Rows of `value [& condition]`, with 1–2 cells. No empty cell. Rows may differ in length.
- **`aligned`.** Rows of `lhs [& rhs]`, with 1–2 cells. A 2-cell row may leave its **left** cell empty, as a continuation row
  (`&= IR`). Any other empty cell is refused.

## 12. Refusal catalogue

Every refusal carries an Arabic message and is a `RICH_CONTENT_MATH` issue in a document. The suites certify:
- **Environments:** unknown, mismatched, missing `\end`, extra `\end`, missing names, unbalanced name braces, nested.
- **Separators:** outside a grid, or nested inside a cell construct.
- **Grid shape:** every bound + 1, ragged matrix, empty cells, `\\[`.
- **Number sets:** `\mathbb` outside N/Z/Q/R/C, including multi-letter, empty, non-letter, lowercase, Unicode `ℝ`, and `\alpha`.
- **Escape hatches inside cells:** `\href`, `\url`, `\html`, `\style`, `\class`, `\def`, `\newcommand`, `\renewcommand`, `\input`,
  `\include`, `\let`, `\catcode`, `\unknown`.

## 13. New vocabulary

| Group | Commands | AST |
|---|---|---|
| Multiple integrals | `\iint` ∬, `\iiint` ∭ | `op` with `large` (renders `largeop`) |
| Arrows | `\rightleftharpoons` ⇌, `\leftrightarrow` ↔, `\uparrow` ↑, `\downarrow` ↓ | `op` |
| Matrix dots | `\vdots` ⋮, `\ddots` ⋱ | `op` |
| Physics / complex | `\hbar` ℏ, `\ell` ℓ, `\Re` ℜ, `\Im` ℑ | `id` |
| Functions | `\arg`, `\det`, `\sinh`, `\cosh`, `\tanh`, `\arcsin`, `\arccos`, `\arctan` | `id` with `fn` (upright) |
| Accent | `\ddot` ¨ | `accent` |
| Number sets | `\mathbb{N}` ℕ, `\mathbb{Z}` ℤ, `\mathbb{Q}` ℚ, `\mathbb{R}` ℝ, `\mathbb{C}` ℂ (braced or single letter) | `id` |

- **`\mathbb` is a fixed alphabet, not a font engine.** Any other letter is refused.
- **`MATH_COMMANDS`** is the complete, frozen, sorted vocabulary of 124 commands. It now includes `begin`, `end` and `mathbb`.

## 14. Closed AST

There is one new node:

```ts
{ k: "grid"; env: MathEnvironment; rows: MathNode[][] }
```

- `env` is a closed enum member, never a string taken from source text for rendering.
- Cells are ordinary `row` nodes.
- Every other node kind is unchanged.

## 15. MathML rendering

```
<mrow> [<mo fence stretchy>open</mo>] <mtable [columnalign class]> <mtr><mtd>cell</mtd>…</mtr>… </mtable> [<mo fence stretchy>close</mo>] </mrow>
```

| Environment | Open | Close | `columnalign` | class |
|---|---|---|---|---|
| matrix | — | — | — | — |
| pmatrix | ( | ) | — | — |
| bmatrix | [ | ] | — | — |
| vmatrix | \| | \| | — | — |
| Vmatrix | ‖ | ‖ | — | — |
| cases | { | — | `left left` | `xp-math-cases` |
| aligned | — | — | `right left` | `xp-math-aligned` |

- **Closed element vocabulary.** The renderer only creates elements from this set (guard 21A-G1):
  - `math`, `mrow`, `mi`, `mn`, `mo`, `mtext`
  - `mfrac`, `msqrt`, `mroot`
  - `msub`, `msup`, `msubsup`, `mover`
  - `mspace`, `mtable`, `mtr`, `mtd`
- **Closed attribute vocabulary** (test 21A-R3):
  - `class`, `dir`, `alttext`, `display`
  - `mathvariant`, `largeop`, `width`, `accent`, `fence`, `stretchy`, `columnalign`
- **No HTML elements in math.** No HTML table, div or span is ever created inside `<math>`.

## 16. RTL / LTR

- **Formulas.** Every formula is `<math dir="ltr">`. CSS makes `.xp-math` `direction:ltr; unicode-bidi:isolate`, so an inline
  formula inside an Arabic sentence never reorders its neighbours.
- **RTL text inside formulas.** `\text{…}` containing an RTL-script character renders `<mtext dir="rtl">`, keeping its natural
  direction inside the LTR formula. That means any character in U+0590–U+08FF (Hebrew, Arabic, Syriac, Thaana, N'Ko, Samaritan,
  Mandaic, Arabic Supplement / Extended) or in the presentation forms (U+FB1D–U+FDFF, U+FE70–U+FEFF). Latin text and identifiers never
  get `dir`.
- **Source field.** The math source field in the Builder is `dir="ltr" lang="en"` inside the RTL page.

## 17. Accessibility

- **Alt text.** `alttext` is the exact source, multi-line sources included.
- **Scroll groups (Review Fixes 1–2).** A formula's scroll box carries no role, no label and no tab stop. It becomes a labelled,
  keyboard-focusable `role="group"` (`aria-label="صيغة رياضية قابلة للتمرير"`, `tabIndex=0`) **only while the formula actually
  overflows it**, so keyboard users can scroll it.
  - **Display formulas** keep the 20D.1 markup, a plain `div.xp-math-block`, whenever they fit.
  - **Inline formulas that contain a grid** have a scroll-box host (§18). Chromium makes ANY scroll container a keyboard Tab stop, so a
    small inline grid was an extra stop (found in Review Fix 2). The host is therefore `tabIndex=-1` while it fits.
  - **Inline formulas without a grid** keep the 20D.1 host (`span.xp-math-host`, class only).
  - **Not a landmark.** The group is `role="group"`, so there is no landmark per formula and no duplicate landmark names.
  - **Re-checking** is one shared hook with a callback ref, so it also attaches when the host mounts after the lazy formula resolves. It
    re-checks on DOM mutation inside the box and on every resize of the box or the formula, and the observers are disconnected on
    every source change and on unmount.
  - **Focus retention.** A focused group is kept when its formula starts to fit (no focus loss when the viewport widens); leaving it
    re-checks.
  - **History.** The first version (1ab3ae5) made every display formula a named region and a tab stop (RF1-3).
  - **Evidence.** Pinned by `21A-R5` and `21A-R6`; verified in Chromium on the real component (§18.2).
- **Invalid sources.** An invalid source is never hidden. It renders as readable LTR source text
  (`<code class="xp-math-src" dir="ltr">`).
- **Live verdict.** The editor's verdict is `aria-live="polite"`. The palette toggle carries `aria-expanded`, and the palette is a
  labelled group.

## 18. Mobile and print

- **Chromium sizing.** Chromium sizes a `<math>` box to the AVAILABLE width and paints wider content as NON-scrollable overflow. Before
  this phase, a wide formula was therefore clipped even inside the 20D.1 `overflow-x:auto` block (§18.1).
- **Display math on screen.** The formula is sized to its content (`inline-size:max-content`, centred with `margin-inline:auto` when
  narrower). `.xp-math-block` (`max-width:100%; overflow-x:auto`) is LTR, so it scrolls from the formula's start.
  It carries `padding-block:0.3em; overflow-y:hidden`. The padding absorbs fence and limit ink, and `overflow-y:hidden` guarantees no
  vertical scroller: without a platform OpenType MATH font, Chromium's fallback font still paints a pixel below the box
  (`x^{2} + 1`: scrollHeight 26 / clientHeight 25). Before Review Fix 2 that drew a vertical scrollbar and made the block a
  keyboard-focusable scroller. This applies to old (20D.1) display formulas too; for
  them it changes only the overflow case, which was clipped before.
- **Inline grids on screen.** The presentation shell is `overflow-x:clip`. An inline host containing a grid
  (`.xp-math-host:has(mtable)` outside a display block) becomes an LTR `inline-block` scroll box of at most 100% width, and its formula
  is sized to its content (`overflow-y:hidden`, `padding-block:0.3em`). It is out of the Tab order unless it overflows (§17). Old
  inline formulas never contain an `mtable`, so their layout is unchanged.
- **Alignment.** MathML Core in Chromium has no `columnalign`. The `text-align` rules on `mtd` (`cases` left; `aligned` right | left)
  are what align these environments. They are pinned by `21A-R2`.
- **Print.** Math blocks and inline hosts are `overflow:visible` and `max-inline-size:none`. Display blocks also get
  `break-inside:avoid`; inline hosts are atomic inline boxes and never break anyway. A formula wider than the printed page still
  overflows the page (§35).

### 18.1 Real-browser check

- **Setup.** Chromium 1194 (Playwright 1.56.1, headless), viewport 360 × 760, `<html dir="rtl">`.
  - The real `rich-content.css` and the real renderer markup (captured from `RichMath`).
  - Placed inside a 16 px-padded shell with `overflow-x:clip`, as `.exam-presentation` does.
- **Cell format.** Each cell shows three values: the scroll box `scrollWidth/clientWidth` · whether the formula's LAST glyph is visible
  after scrolling the box to its end · `scrollHeight/clientHeight`.

| Case | Previous CSS (head before the fix) | 21A CSS |
|---|---|---|
| wide inline grid (8×2 pmatrix in Arabic prose) | 0/0 · **no** · 0/0 | 356/328 · yes · 53/53 |
| wide display grid (same matrix) | 328/328 · **no** · 47/45 | 356/328 · yes · 53/53 |
| long display formula without a grid (22-term sum) | 328/328 · **no** · 27/23 | 914/328 · yes · 31/31 |
| small display grid (2×2) | 328/328 · yes · 35/32 | 328/328 · yes · 40/40 |
| small inline grid (2×2) | 0/0 · yes · 0/0 | 58/58 · yes · 40/40 |

**Previous CSS.**
- The three wide cases are **unreachable**. The `<math>` box is 328 px, the content is 356 / 914 px, and the overflow is not
  scrollable, so the end of the formula is cut off and cannot be scrolled to.
- A 2–4 px vertical overflow also existed, which would draw a vertical scrollbar on desktop.

**21A CSS.**
- Every wide case is a scroll box whose end can be reached.
- Small formulas keep their size and centring.
- No vertical overflow remains.

**How it is pinned.**
- The CSS contract is pinned by the test `21A-R2 wide formulas never clip`, which fails on the previous CSS.
- The browser probe itself is recorded evidence, not a committed test, because Playwright is not a project dependency.

### 18.2 Real-component accessibility check (Review Fix 1)

**Setup:**
- A throwaway Vite bundle (built outside the repository; the temporary entry files were removed) of the REAL `RichContentRenderer`.
- Content: an Arabic paragraph with a wide inline 8×2 `pmatrix`, the same matrix as a display formula, `x^{2} + 1`, and a 2×2
  `pmatrix`.
- Chromium, RTL page, `overflow-x:clip` shell.

| Observation | 360 px | 1200 px |
|---|---|---|
| Wide display formula | `role="group"`, label, `tabindex="0"` (scroll 356/328) | plain block (fits) |
| `x^{2} + 1`, 2×2 display grid | plain block | plain block |
| Keyboard | Tab reaches the overflowing block; ArrowRight scrolls it; End reaches the end | — |
| Page errors | none | none |

Chromium itself also makes the overflowing inline grid host a keyboard-focusable scroller.

**Review Fix 2 re-check.** This used the same harness, extended with a small inline grid, plain inline math and a wide inline grid.

| Formula | 360 px | 1400 px |
|---|---|---|
| wide display grid | `role=group` · tabindex 0 · w 356/328 · h 55/55 | no role · tabindex — · w 1368/1368 · h 55/55 |
| display `x^{2} + 1` | no role · tabindex — · w 328/328 · h 26/25 | no role · tabindex — · w 1368/1368 · h 26/25 |
| small display grid (2×2) | no role · tabindex — · w 328/328 · h 42/42 | no role · tabindex — · w 1368/1368 · h 42/42 |
| display sum | no role · tabindex — · w 328/328 · h 42/42 | no role · tabindex — · w 1368/1368 · h 42/42 |
| small inline grid (2×2) | no role · tabindex -1 · w 58/58 · h 42/42 | no role · tabindex -1 · w 58/58 · h 42/42 |
| inline `x^{2}` (no grid) | no role · tabindex — · w 0/0 · h 0/0 | no role · tabindex — · w 0/0 · h 0/0 |
| wide inline grid | `role=group` · tabindex 0 · w 356/328 · h 55/55 | no role · tabindex -1 · w 356/356 · h 55/55 |

**Tab order at 360 px:** `block#0 → inline#6 → BODY → block#0 → inline#6 → BODY`. Only the two overflowing formulas are Tab stops. Focus retention, also
checked: the focused wide group keeps focus and its role when the viewport widens to 1200 px, and reverts on blur. Page errors: none.

## 19. Authoring UX

`MathBody` in the lazy `RichContentEditor` chunk:
- **Source field.** A multi-line LTR textarea with 2–8 rows, sized from the source. The 20D.1 field was a single-line `<input>`, which
  dropped the line breaks of a pasted matrix (fail-first).
- **Live verdict.** The parser's verdict (`✓ صيغة صالحة` or the parser's Arabic reason).
- **Preview.** A trusted per-block preview through the SAME lazy renderer the student sees, shown only for a valid formula.
- **Snippet palette.** `MathSnippetPalette`, a lazy chunk of the lazy editor. It has six groups, with one labelled button per feature,
  and inserts the feature example **at the caret**:
  - It adds one space of glue when needed and replaces a selection.
  - The caret is placed after the inserted snippet.
  - One click emits one change, which is one undo step.
  - An insert that would exceed 2,000 characters is refused.
- **Hint.** A hint line documents the v2 language.
- **Typing is never blocked.** An invalid formula is stored as typed and reported as `RICH_CONTENT_MATH`
  by the document validator.

## 20. Feature catalog (`mathFeatures.ts`)

There are 30 code-owned features. Every example is accepted by the parser, as a block and as an inline run, and every feature has an
Arabic label (test 21A-ED3).

| Group | Features |
|---|---|
| basic | fractions, roots, scripts, greek, relations, text, fences |
| calculus | derivatives, secondDerivatives, partialDerivatives, integrals, multipleIntegrals, largeOperators, limits |
| linearAlgebra | matrices, determinants, cases, aligned |
| complex | complex, complexParts, numberSets |
| science | scientificNotation, units, chemistry, chemicalEquations, equilibrium, ohmsLaw, electricity |
| geometry | vectors, geometry |

## 21. Inline math and Markdown

- **Inline `$…$`.** Accepts v2 constructs on one line, for example `$\begin{pmatrix} a & b \\ c & d \end{pmatrix}$` and
  `$x \in \mathbb{R}$`. `$a & b$` stays literal text and raises the `MARKDOWN_MATH_REFUSED` warning.
- **Display `$$…$$`.** Spanning lines, it becomes ONE math block with the exact inner source.
- **Conversion.** Math → paragraph → math is exact for a multi-line grid. The formatted conversion back asks before converting.

## 22. One RichContent authority, end to end

| Surface | Behaviour (evidence) |
|---|---|
| Builder | Editor + preview (21A-ED*) |
| Teacher preview | Same `RichContentRenderer` |
| Import | `parseStructuredExamJson` keeps sources verbatim (21A-MINI, 20G sweep) |
| Save / load / revision | Exact (21A-MINI lifecycle; canonical content unchanged) |
| Finalization | `validateRichContent` → `parseMath` |
| Student delivery | `projectRichContentForStudent`, byte-identical formulas (21A-MINI) |
| Export | Exact; re-import identical |
| AI | Through `mapAiRichBlocks` → `validateRichContent` |
| Teacher review | Plain-text fallback (§35) |

Math sources are never trimmed, normalised or rewritten by import, save, delivery or export. The AI intake normalises CRLF → LF and
trims (§24).

## 23. AI Composer — catalog V2

- **Version.** `COMPOSER_CATALOG_VERSION = "AI_COMPOSER_CATALOG_V2"`. The vocabulary the model sees changed, so the version changed.
- **Capability.** `buildComposerCatalog().scientificMath` is `COMPOSER_SCIENTIFIC_MATH`, built from the same frozen references as the
  parser: version, environments, commands, features, and limits (chars, nodes, depth, rows, cols, cells, casesCols, alignedCols).
  `buildComposerCatalog` throws if a feature example is ever refused by the parser.
- **Prompt contract.** `catalogForPrompt` adds ONE bounded line (≤ 3,500 characters; the whole catalog prompt ≤ 9,000). It lists:
  - the exact command list;
  - the environments and separator rules;
  - the bounds;
  - the proven examples;
  - what is refused.
- **Catalog provenance (corrected in Review Fix 1).** `metadata.aiComposer.catalog` records the catalog of the exam's **last** composer
  operation, because `withComposerHistory` re-stamps it.
  - An exam last composed under V1 keeps `"AI_COMPOSER_CATALOG_V1"` while it is stored, imported or exported untouched. Its next
    composer operation stamps V2.
  - History entries carry no catalog.
  - Nothing validates or migrates the field.
  - Pinned by `21A-AI4`. The 20F tests keep their V1 "old exam" fixtures.
  - The first version of this record wrongly said V1 provenance is always kept (RF1-2).
- **Updated with the bump:**
  - the bundle-guard marker;
  - the 20F endpoint test;
  - the five pinned 20F exports (regenerated; the diff is exactly the catalog line);
  - a note in the 20F record.

## 24. AI intake hardening and the HTML-looking formula finding

- **Finding.** The 20D.1 grammar reads `<`, `>` and `/` as relation operators, so `<script>alert(1)</script>` is a VALID language-1
  formula. This holds on 60ddadc too.
- **Why it is safe.** It renders as inert MathML: `<mo><</mo><mi>s</mi>…`. React text nodes are used, no element is created from it,
  and `alttext` is attribute-escaped by React.
- **Stored content is unchanged.** Changing the canonical validator would break the strict-superset contract (§26), so 21A does not
  change it. A renderer test pins the inert rendering.
- **AI intake is stricter.** A formula matching the existing raw-HTML pattern (`looksLikeRawHtml`) is refused with
  `AI_RICH_CONTENT_INVALID`, which triggers the bounded repair. This makes the prompt contract ("HTML … is refused") true; AI text is
  untrusted.
- **CRLF.** AI math sources normalise CRLF and bare CR to LF, as code and CLI blocks already did.
- **False positives (documented, fail closed).** The raw-HTML pattern also matches tag-like plain-text notation such as `<a, b>`
  (inner product) and `<p>` (expectation value). Such an AI formula is refused with the markup message, which costs one bounded repair
  round. The prompt does not special-case this notation (an earlier version of this record wrongly said it does; Review Fix 2,
  MINOR-3). Pinned by `21A-AI2b`.

## 25. Security invariants

These hold, and are each tested:
- `parseMath` never throws. This is checked on random garbage over the v2 alphabet and the generated corpora.
- No HTML sink in the math runtime: no `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
  `DOMParser` or `srcdoc`.
- No `eval` or `new Function`.
- No network, dynamic `import()`, `require` or input-built `RegExp` in the parser, catalog, renderer or palette (guard 21A-G1).
- The renderer calls `createElement` only through the closed `el` helper plus the fixed `math` root (21A-G1).
- No third-party TeX or MathML engine is a dependency or an import anywhere in `src` (21A-G1).
- No escape-hatch command exists in `MATH_COMMANDS` (21A-G1).
- Grids are not an escape hatch: refused commands stay refused inside cells (21A-S3).
- The 20D.1 source guard (`20D1-RR2`) still scans `src/richContent` and `src/presentation` automatically, including the new modules.

## 26. Old-grammar freeze

`scientificMathFreeze.21a.test.ts` has the following pins, all captured on 60ddadc:

**The repository corpus.** 45 sources collected from fixtures, tests, docs and editor defaults. Verdicts and ASTs are pinned by digest.

**60,000 deterministic old-grammar candidates.** These come from `oldGrammarCandidates`; every second one is corrupted, with near
misses and v2 look-alikes.
- The corpus runs in 10 independent slices of 6,000 (seeds 21001–21010), each with
  `[accepted, refused, marked, acceptedDigest, refusedDigest]`. In total, **20,431 accepted** expressions keep identical ASTs.
- Capture mode also proves the baseline refused every v2 look-alike.
- On the head, a look-alike may be accepted only with a documented v2 construct.

**Renderer freeze.** 1,500 accepted old expressions (no v2 construct, no Arabic `\text`), in 6 slices of 250. They render to
byte-identical MathML.

**Why the corpus is sliced.** A first version ran each corpus as ONE test (≈3.5 s and ≈4.2 s). Both exceeded the 5 s per-test default
under concurrent load (reproduced 4 of 4 times). Instead of widening a timeout, the corpora were sliced and every pin was re-captured
on 60ddadc. Commit `6d9f7ad` records this.

## 27. Differential: 60ddadc parser vs head parser

**First run.** 100,030 identical inputs: 10 × 10,000 old-grammar candidates (seeds 22001–22010) plus 30 hand-written invalid sources,
against the two shared builds.

| Class | Count |
|---|---|
| Accepted by both, identical AST | 33,984 |
| Refused by both, same message | 52,412 |
| Refused by both, new message | 9,768 (every one on an input carrying a v2 token) |
| Widened by a documented v2 construct | 3,866 |
| AST changed | **0** |
| Narrowed (accepted → refused) | **0** |
| Widened without a v2 construct | **0** |
| Threw | **0** |

**The carriage-return widening (Review Fix 1, RF1-6).** The v2 tokenizer reads `\r` as whitespace everywhere (§6), so sources such as
`"a\r\nb"` or a stored block ending in CRLF, refused by 60ddadc, are accepted by the head.
- **The gap.** The first run could not see this class: neither generator emits CR, and the freeze's look-alike mark has no `\r`.
- **Re-run.** The differential was re-run with CR variants: for every second candidate, CR in place of unescaped spaces, plus a
  trailing CRLF. That is 200,030 inputs, and every CR-only widening is classified against the 60ddadc parse of the same source with CR
  read as a space.

| Class | Count |
|---|---|
| Accepted by both, identical AST | 42,599 |
| Widened by CR only, AST identical to the 60ddadc parse with CR read as a space | 58,625 |
| Refused by both, same message | 53,895 |
| Refused by both, new message | 41,045 |
| Widened by a documented v2 construct | 3,866 |
| CR widening with a different meaning | **0** |
| AST changed / narrowed / widened without a v2 construct / threw | **0 / 0 / 0 / 0** |

**Exception.** A CR right after a backslash is refused, exactly as on 60ddadc. It is not the escaped space `\ `.

**Pinned.** `21A-S8` pins this on 3,000 seeded candidates. The independent reviewer's own differential (2 seeds × 1.19 M inputs) found
the same: 0 AST changes, 0 narrowed, and the CR-only widenings all identical to the CR-as-space parse.

## 28. Generated v2 corpus

`scientificMathCorpus.21a.test.tsx` has 40,000 cases in 10 slices of 4,000 (seeds 21101–21110).

**Valid cases (half of them):**
- every environment at every legal shape;
- ragged `cases` / `aligned`, and empty aligned left cells;
- trailing `\\`;
- LF, CRLF and tab whitespace;
- embedded grids and two consecutive grids;
- Arabic `\text` cells;
- the non-grid v2 vocabulary.

**Invalid near-misses (the other half), across 21 kinds.** Every valid case is accepted with exactly the generated grid shapes and
stored by the canonical validator; every invalid case is refused by both.

**Rendered sample.** 4 × 100 valid cases render one `mtable` per grid, with `mtr` / `mtd` counts equal to the AST and fences matching
the environment.

## 29. MathML structural tests

`scientificMathRenderer.21a.test.tsx` covers:
- grid shape;
- fences as `mo[fence][stretchy]` siblings;
- `cases` / `aligned` alignment and classes;
- `\mathbb` and `\iint`;
- `dir` and `alttext`;
- Arabic `mtext`;
- the CSS contract;
- the invalid fallback;
- the HTML-looking inert pin;
- the closed element / attribute vocabulary over every feature example and environment;
- the renderer freeze.

## 30. Scientific Math Mini Acceptance Exam

The fixture is `docs/fixtures/scientific-math-21a/ExamBank_21A_Scientific_Math_Mini_Acceptance.json`:
- the real structured-exam schema (`schemaVersion 2`);
- four sections A–D, 10 marks each, 40 total;
- 14 questions (mcq, numericResponse, shortAnswer, fillBlank);
- every question has a plain `text` fallback AND RichContentV1;
- rich cover and section instructions;
- 19 rich documents in total, with 30+ formulas.

| Section | Content |
|---|---|
| A | Matrices, determinants, systems (pmatrix, 3×3 vmatrix, cases) |
| B | Calculus (derivative, `\iint`, limit, piecewise `cases` with Arabic `\text`, partial derivatives) |
| C | Complex numbers (`\Re`, `\Im`, `\overline`, modulus, `\arg`, `\mathbb`) |
| D | Science (`\rightleftharpoons`, multi-line `aligned` Ohm's law, units, scientific notation, vectors, angles) |

**Lifecycle** (`api/tests/certification-21a/cert-21a-scientific-math.test.js`, real handlers):
- import → canonical save → export → import, exact;
- finalization clean;
- save → load → governance → publish → assignment;
- sanitized delivery with byte-identical formulas, and nothing private;
- autosave / restore, exact;
- idempotent submit;
- marks ledger;
- teacher review.

**Marks ledger** (hand-derived):

| Persona | Score | Detail |
|---|---|---|
| PERFECT | 40 / 40 | Finalized |
| PARTIAL | 24 / 40 | a1 0, a3 2/4, b2 0, c2 0, c3 2/4, d3 0 |
| BLANK | 0 | 12 marks pending teacher review: blank fillBlank (a3, c3) and shortAnswer (b3, d4). Never a manufactured zero. |

**No grading change.** The same answers grade identically with and without the rich content.

**Fail-first on 60ddadc.** Publication is refused with `FINALIZATION_REFUSED` (13 structural errors).

## 31. Mutation campaign

Runner: one mutant at a time, each an exact single-occurrence replacement. Before any mutant, every suite set must pass unmutated. Each
touched file is restored byte-for-byte (SHA-256 verified) in `finally`, and the runner refuses to start on a dirty tree. `git status` was
unchanged after every run.

**Results:**
- First pass: **48 KILLED, 2 SURVIVED, 0 TIMEOUT** (M01–M50).
- The two survivors were test gaps:
  - **M28**: a grid node not counted toward the node bound.
  - **M50**: the prompt listing 5 of 7 environments.
  - Both were fixed by stronger tests in commit `7efc337` (an exact node-boundary test; an exact environment-list check). Re-run: both
    **KILLED**.
- Two supplementary mutants (S01, S02) target the responsive CSS written after the campaign: both **KILLED**.
- **Final: 52 / 52 killed.**

| Id | File | Planted defect | Outcome | Killed by (first failing test) |
|---|---|---|---|---|
| M01 | `richContent/richMath.ts` | environment allow-list gains 'array' | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › invalid v2 source ne |
| M02 | `richContent/richMath.ts` | allow-list lookup via `in` (prototype names pass) | KILLED | scientificMathCorpus.21a.test.tsx › 21A-GEN generated v2 corpus › slice 1/10 (4,000 cases, seed |
| M03 | `richContent/richMath.ts` | nesting guard removed | KILLED | scientificMath.21a.test.ts › 21A-S3 environment grammar is a fixed allow-list — everything else |
| M04 | `richContent/richMath.ts` | inGrid never reset after a grid | KILLED | scientificMathCorpus.21a.test.tsx › 21A-GEN generated v2 corpus › slice 1/10 (4,000 cases, seed |
| M05 | `richContent/richMath.ts` | \end name not compared to \begin | KILLED | scientificMathCorpus.21a.test.tsx › 21A-GEN generated v2 corpus › slice 1/10 (4,000 cases, seed |
| M06 | `richContent/richMath.ts` | cell bound +8 | KILLED | scientificMath.21a.test.ts › 21A-S5 grid bounds are explicit, conservative and enforced before  |
| M07 | `richContent/richMath.ts` | column bound +1 | KILLED | scientificMath.21a.test.ts › 21A-S4 cell and row separators are legal ONLY at a grid's own cell |
| M08 | `richContent/richMath.ts` | row bound +1 | KILLED | scientificMath.21a.test.ts › 21A-S5 grid bounds are explicit, conservative and enforced before  |
| M09 | `richContent/richMath.ts` | published row limit 12 -> 13 | KILLED | scientificMath.21a.test.ts › 21A-S1 language identity — code-owned, discoverable, frozen › MATH |
| M10 | `richContent/richMath.ts` | cases columns = matrix columns | KILLED | scientificMath.21a.test.ts › 21A-S4 cell and row separators are legal ONLY at a grid's own cell |
| M11 | `richContent/richMath.ts` | aligned columns = matrix columns | KILLED | scientificMath.21a.test.ts › 21A-S4 cell and row separators are legal ONLY at a grid's own cell |
| M12 | `richContent/richMath.ts` | \\[ spacing argument accepted | KILLED | scientificMath.21a.test.ts › 21A-S4 cell and row separators are legal ONLY at a grid's own cell |
| M13 | `richContent/richMath.ts` | trailing \\ before \end no longer allowed | KILLED | scientificMath.21a.test.ts › 21A-S2 matrices, determinants, cases, aligned — closed grid AST ›  |
| M14 | `richContent/richMath.ts` | ragged matrix rows accepted | KILLED | scientificMath.21a.test.ts › 21A-S4 cell and row separators are legal ONLY at a grid's own cell |
| M15 | `richContent/richMath.ts` | empty matrix cells accepted | KILLED | scientificMath.21a.test.ts › 21A-S4 cell and row separators are legal ONLY at a grid's own cell |
| M16 | `richContent/richMath.ts` | empty cells allowed anywhere in aligned | KILLED | scientificMath.21a.test.ts › 21A-S4 cell and row separators are legal ONLY at a grid's own cell |
| M17 | `richContent/richMath.ts` | aligned empty LEFT cell refused (allowance moved to the right cell) | KILLED | scientificMath.21a.test.ts › 21A-S2 matrices, determinants, cases, aligned — closed grid AST ›  |
| M18 | `richContent/richMath.ts` | & / \\ outside a grid become an operator | KILLED | scientificMath.21a.test.ts › 21A-S4 cell and row separators are legal ONLY at a grid's own cell |
| M19 | `richContent/richMath.ts` | tokenizer: \\ is a space, not a row separator | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R1 grids render as MathML tables with fixed code-owne |
| M20 | `richContent/richMath.ts` | tokenizer: & is a plain symbol | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R1 grids render as MathML tables with fixed code-owne |
| M21 | `richContent/richMath.ts` | tokenizer: CR is not whitespace | KILLED | scientificMathCorpus.21a.test.tsx › 21A-GEN generated v2 corpus › slice 1/10 (4,000 cases, seed |
| M22 | `richContent/richMath.ts` | environment name need not be closed by } | KILLED | scientificMath.21a.test.ts › 21A-S3 environment grammar is a fixed allow-list — everything else |
| M23 | `richContent/richMath.ts` | \mathbb accepts any letter | KILLED | scientificMath.21a.test.ts › 21A-S6 calculus, complex, number sets, units, chemistry, electrici |
| M24 | `richContent/richMath.ts` | \mathbb{R} renders the plain letter | KILLED | scientificMath.21a.test.ts › 21A-S6 calculus, complex, number sets, units, chemistry, electrici |
| M25 | `richContent/richMath.ts` | \mathbb{X} consumes only 2 tokens | KILLED | scientificMath.21a.test.ts › 21A-S1 language identity — code-owned, discoverable, frozen › MATH |
| M26 | `richContent/richMath.ts` | \iint loses largeop | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R1 grids render as MathML tables with fixed code-owne |
| M27 | `richContent/richMath.ts` | \rightleftharpoons removed | KILLED | scientificMath.21a.test.ts › 21A-S1 language identity — code-owned, discoverable, frozen › MATH |
| M28 | `richContent/richMath.ts` | grid node not counted against the node bound | SURVIVED → **KILLED** (re-run) | scientificMath.21a.test.ts › 21A-S5 grid bounds are explicit, conservative and enforced before  |
| M29 | `richContent/richMath.ts` | grid cells parsed at the grid's depth (no depth cost) | KILLED | scientificMath.21a.test.ts › 21A-S5 grid bounds are explicit, conservative and enforced before  |
| M30 | `richContent/richMath.ts` | language version 2 -> 1 | KILLED | scientificMath.21a.test.ts › 21A-S1 language identity — code-owned, discoverable, frozen › MATH |
| M31 | `richContent/RichMath.tsx` | pmatrix fences become [ ] | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R1 grids render as MathML tables with fixed code-owne |
| M32 | `richContent/RichMath.tsx` | Vmatrix fences become single bars | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R1 grids render as MathML tables with fixed code-owne |
| M33 | `richContent/RichMath.tsx` | cases gains a right brace | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R1 grids render as MathML tables with fixed code-owne |
| M34 | `richContent/RichMath.tsx` | aligned columns left/left | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R1 grids render as MathML tables with fixed code-owne |
| M35 | `richContent/RichMath.tsx` | grid fences not stretchy | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R1 grids render as MathML tables with fixed code-owne |
| M36 | `richContent/RichMath.tsx` | Arabic \text loses dir=rtl | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › Arabic \text gets it |
| M37 | `richContent/RichMath.tsx` | renderer drops the first grid row | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R1 grids render as MathML tables with fixed code-owne |
| M38 | `richContent/RichMath.tsx` | math loses alttext | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › math is an LTR eleme |
| M39 | `richContent/RichMath.tsx` | math element dir rtl | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › math is an LTR eleme |
| M40 | `richContent/RichMath.tsx` | invalid source renders nothing | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › invalid v2 source ne |
| M41 | `richContent/rich-content.css` | inline math is not a bidi isolate | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › inline math is an LT |
| M42 | `richContent/RichContentEditor.tsx` | math source textarea dir=auto | KILLED | scientificMathEditor.21a.test.tsx › 21A-ED1 the math source field › is a multi-line LTR textare |
| M43 | `richContent/RichContentEditor.tsx` | snippet insert ignores the 2,000-char bound | KILLED | scientificMathEditor.21a.test.tsx › 21A-ED2 the snippet palette › never exceeds the 2,000-chara |
| M44 | `richContent/RichContentEditor.tsx` | snippet always appended at the end (caret ignored) | KILLED | scientificMathEditor.21a.test.tsx › 21A-ED2 the snippet palette › inserts AT THE CARET with a s |
| M45 | `richContent/RichContentEditor.tsx` | preview shown for an invalid formula | KILLED | scientificMathEditor.21a.test.tsx › 21A-ED1 the math source field › an invalid v2 source shows  |
| M46 | `richContent/MathSnippetPalette.tsx` | palette inserts the feature id instead of its example | KILLED | scientificMathEditor.21a.test.tsx › 21A-ED2 the snippet palette › matrix, cases, derivative and |
| M47 | `aiComposer/composerRich.ts` | AI math markup refusal removed | KILLED | scientificMathComposer.21a.test.ts › 21A-AI2 AI math blocks → RichContentV1 through the canonic |
| M48 | `aiComposer/composerRich.ts` | AI math CRLF not normalized | KILLED | scientificMathComposer.21a.test.ts › 21A-AI2 AI math blocks → RichContentV1 through the canonic |
| M49 | `aiComposer/composerCatalog.ts` | catalog version reverted to V1 | KILLED | scientificMathComposer.21a.test.ts › 21A-AI1 the catalog derives Scientific Math v2 from code › |
| M50 | `aiComposer/composerCatalog.ts` | prompt lists only 5 environments | SURVIVED → **KILLED** (re-run) | scientificMathComposer.21a.test.ts › 21A-AI1 the catalog derives Scientific Math v2 from code › |
| S01 | `richContent/rich-content.css` | inline grid host no longer scrolls (overflow-x visible → clipped by the shell) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › wide formulas never  |
| S02 | `richContent/rich-content.css` | display formula sized to the available width again (non-scrollable overflow) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › wide formulas never  |


### 31.1 Review Fix 1: the independent reviewer's survivors and the new display-accessibility logic

- **The reviewer's campaign** on `1ab3ae5` planted 26 mutants of its own: R01–R26, different from M01–M50. Result: 14 KILLED, 12
  SURVIVED.
- **R26** targeted the display markup that Review Fix 1 replaced. It is re-planted as **R26b**, meaning "always a focusable group", the
  1ab3ae5 behaviour.
- **X01–X03** are new mutants on the new overflow logic.
- **Result:** all 15 are re-run on the Review Fix 1 head with the same runner (unmutated pre-check, SHA-256 restore) and **all 15 are
  KILLED**.

| Id | Planted defect | Outcome | Killed by |
|---|---|---|---|
| R01 | \mathbb braced form no longer requires the closing brace (any 3rd token is swallowed) | KILLED | scientificMath.21a.test.ts › 21A-S6 calculus, complex, number sets, units, chemistry, elec |
| R08 | \ddot renders the single dot accent (˙) instead of ¨ | KILLED | scientificMath.21a.test.ts › 21A-S6 calculus, complex, number sets, units, chemistry, elec |
| R12 | RTL detection narrowed to U+0600–U+06FF (Hebrew, Arabic Supplement / Extended, presentation forms lose dir=rtl) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › Arabic \text ge |
| R14 | snippet insert bound off by one (an insert reaching exactly 2,000 chars is refused) | KILLED | scientificMathEditor.21a.test.tsx › 21A-ED2 the snippet palette › an insert that lands EXA |
| R16 | caret not restored after an insert (focus only, no setSelectionRange) | KILLED | scientificMathEditor.21a.test.tsx › 21A-ED2 the snippet palette › a MIDDLE insertion leave |
| R17 | snippet buttons ignore the disabled prop | KILLED | scientificMathEditor.21a.test.tsx › 21A-ED2 the snippet palette › every palette button hon |
| R19 | AI math: only CRLF normalised, a bare CR is kept | KILLED | scientificMathComposer.21a.test.ts › 21A-AI2 AI math blocks → RichContentV1 through the ca |
| R20 | prompt contract drops the cases / aligned 2-column bound | KILLED | scientificMathComposer.21a.test.ts › 21A-AI1 the catalog derives Scientific Math v2 from c |
| R22 | print: math blocks may break across pages (break-inside:avoid dropped) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › wide formulas n |
| R24 | aligned lhs column text-align right → left (Chromium ignores columnalign; CSS is the alignment) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › wide formulas n |
| R25 | cases cells lose text-align:left | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › wide formulas n |
| R26b | display block always a focusable labelled group (the 1ab3ae5 behaviour) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R5 display formula accessibility (review fix 1): |
| X01 | overflow never detected (scroll group never offered) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R5 display formula accessibility (review fix 1): |
| X02 | overflowing block becomes a region LANDMARK instead of a group | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R5 display formula accessibility (review fix 1): |
| X03 | re-check on resize removed (state never reverts / updates) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R5 display formula accessibility (review fix 1): |

### 31.2 Review Fix 2: the observer logic, the scroll box, focus retention, inline grids

- **N01–N04 and N14** are the round-2 reviewer's survivors, re-planted against the shared hook with the same semantics.
- **X04–X10** are new mutants on the Review Fix 2 code.
- **Result:** all 12 **KILLED** (same runner, unmutated pre-check, SHA-256 restore, `git status` unchanged).

| Id | Planted defect | Outcome | Killed by |
|---|---|---|---|
| N01 | MutationObserver removed (no re-check when the lazy formula arrives / changes) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R6 the overflow observers (review fix 2): wiring |
| N02 | the <math> element is not observed (only the box) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R6 the overflow observers (review fix 2): wiring |
| N03 | effect cleanup removed (observers leak on every source change / unmount) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R6 the overflow observers (review fix 2): wiring |
| N04 | sub-pixel tolerance dropped | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R6 the overflow observers (review fix 2): wiring |
| N14 | display block no longer a scroll box (overflow-x hidden) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › wide formulas n |
| X04 | focus retention removed (a focused group is dropped when the formula starts to fit) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R6 the overflow observers (review fix 2): wiring |
| X05 | inline grid host keeps the browser's scroller Tab stop (tabIndex -1 removed) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R6 the overflow observers (review fix 2): wiring |
| X06 | display block may show a vertical scroller (overflow-y:hidden removed) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R2 RTL / LTR and accessibility › wide formulas n |
| X07 | observers keyed on source only (never attach when the host mounts after the lazy formula) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R5 display formula accessibility (review fix 1): |
| X08 | inline grids not detected (scroll-group logic never used for inline grids) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R6 the overflow observers (review fix 2): wiring |
| X09 | blur no longer re-checks (a kept focused group never reverts) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R6 the overflow observers (review fix 2): wiring |
| X10 | display formula always a focusable group (the 1ab3ae5 behaviour) | KILLED | scientificMathRenderer.21a.test.tsx › 21A-R5 display formula accessibility (review fix 1): |

## 32. Bundle

| Measure | 60ddadc | Head |
|---|---|---|
| Initial JS graph (gzip, guard's own reconstruction) | 127,298 B (18 files) | 127,303 B (18 files) |
| Lazy `richContentModel` (parser + model) | 7,560 B | 8,538 B |
| Lazy `RichMath` (renderer) | 674 B | 948 B |
| Lazy `RichContentEditor` | 8,565 B | 9,043 B |
| Lazy `MathSnippetPalette` (new) | — | 1,149 B |
| Lazy `mathFeatures` (new; shared by the palette and the composer) | — | 918 B |
| Lazy `AiExamComposerDialog` | 21,396 B | 21,592 B |
| Budget | 125 KB | 125 KB (unchanged) |

- **Initial-graph difference.** The head's initial files are identical to the baseline's modulo lazy chunk hash names. The few bytes
  of difference are gzip entropy from renamed hashes.
- **Where the code went.**
  - The parser stays in the lazy `richContentModel` chunk.
  - The renderer is in the lazy `RichMath` chunk.
  - The editor is in the lazy `RichContentEditor` chunk.
  - The palette is a lazy chunk of the editor.
  - The catalog is in the lazy composer chunk.
- **Bundle guard.** `PRESENTATION_SIGNATURES` gains `xp-math-aligned`, `rc-math-palette` and `rightleftharpoons`. They are refused in
  initial files and must exist in some chunk. `COMPOSER_SIGNATURES` now carries `AI_COMPOSER_CATALOG_V2`.

## 33. Backward compatibility and grading

- **Old grammar.** Old-grammar ASTs are frozen (§26–§27): CR is now whitespace, which is a measured, meaning-preserving widening.
  The rendered MathML of old formulas is frozen too (the renderer freeze), with one deliberate exception: a `\text` containing RTL
  script (Arabic, Hebrew, …) now carries `dir="rtl"`, so it keeps its natural direction (the freeze excludes it).
- **Old display formulas: what changed (corrected in Review Fix 1).**
  - Their block is LTR, with `padding-block:0.25em`.
  - The formula is sized to its content and centred, so a wide one now scrolls instead of being clipped (§18).
  - The block markup is unchanged unless the formula overflows (§17).
  - Old inline formulas without a grid are unchanged.
- **Schemas.** RichContentV1 and structured-exam schemas are unchanged.
- **Old AI exams.** V1-tagged AI exams keep working.
- **Grading.** No grader, sanitizer rule, finalization rule or marks computation changed. Grading never reads rich content, as the
  invariance test proves.
- **Runner.** Nothing under `runner/**` changed.

## 34. Test inventory and fail-first evidence

| Suite | Tests | Fail-first on 60ddadc |
|---|---|---|
| `scientificMath.21a` (parser) | 31 | First commit, combined with the renderer suite: 40 tests, 24 fail / 16 pass (pins) |
| `scientificMathRenderer.21a` | 26 | (above). The Review Fix 1 display-a11y tests (`21A-R5`) fail 2/2 against the 1ab3ae5 renderer |
| `scientificMathFreeze.21a` | 12 | Pins captured on 60ddadc |
| `scientificMathEditor.21a` | 18 | 14 fail / 1 pass (pin), first 15 tests |
| `scientificMathGuards.21a` | 6 | Static guards |
| `scientificMathCorpus.21a` | 15 | New corpus |
| `scientificMathComposer.21a` | 9 | 7 fail / 1 pass (pin), first 8 tests |
| `cert-21a-scientific-math` | 10 | 4 fail / 1 pass (pin) / 5 skipped (setup refused) |

The suites hold **127 tests** in total (Review Fix 2 added the five `21A-R6` observer / inline-grid tests). The reviewer's own fail-first run of the head suites against 60ddadc production code gave
50 failed / 25 passed / 5 skipped. The first version of this table listed 31 parser tests when there were 29 (RF1-8).

**Full validation, first head `1ab3ae5`:**
- `npm test` ran twice, the second time on the exact checked-out head. Both runs: **792 files, 10,490 tests passed**.

**Full validation, Review Fix 1 content (`614d427`):**
- `npm test` ran twice:
  - Run 1: 10,498 passed, 1 failed.
  - Run 2: 10,497 passed, 2 failed.
- Both failures are **pre-existing tests in code 21A does not touch** (§35):
  - `src/questionTypes/composite.20d.test.tsx:48`, a race in the test's wait helper. It reproduces on the untouched 60ddadc baseline
    worktree 3 / 8 times in isolation, with the identical assertion.
  - `src/GovernancePanel.14b.test.tsx`, the assignment-dialog case. It is the repository's documented timing-sensitive file (AGENTS
    §12): it failed once under full-suite load and passes 5 / 5 in isolation on the head.
- Both pass in exact-head CI. Every Phase-21A suite passed in every run.

**Full validation, Review Fix 2 content (`61cbe20`):**
- `npm test`: 792 files, **10,503 passed, 1 failed**. The failure is the same pre-existing `composite.20d.test.tsx:48` race (§35).
  Every Phase-21A suite passed.
- `npm run lint`: exit 0, 104 warnings (baseline count). `npx tsc -b`: exit 0. `npm run build` with the bundle guard: passed.
- Exact-head CI on `61cbe20`: Quality Gate, Build and Deploy Job and the Runner security workflow all succeeded on attempt 1.

**Other checks:**
- `npm run lint`: exit 0, no errors. 104 warnings, the same count as the 60ddadc baseline; the extra palette warning seen on 1ab3ae5 is
  gone (RF1-9).
- `npx tsc -b`: exit 0.
- `npm run build`, including the bundle guard: passed, 124.3 KB / 125 KB. The 18 initial files are identical to 60ddadc modulo chunk
  hashes on both heads.
- `git diff --check` and `git diff origin/main --check`: clean.

**Not run locally:** the Runner suites (unit, Docker security, official). `runner/**` is untouched; they run in CI.

The exact-head CI results are in the pull request and the final report.

## 35. Known limitations and out of scope (recorded, not done)

- **Teacher review shows the plain-text fallback.** `assignment-review` sends `text`, not `richContent`. This is 20D.1 behaviour,
  pinned by 21A-MINI. Rich rendering in review is future work.
- **AI prose does not parse `$…$`.** AI-authored formulas are math BLOCKS only; AI prose is plain text.
- **HTML-looking formulas in stored content** stay valid, inert math data (§24).
- **Inline grids are scrollable boxes, not reflowed.** Long inline formulas without grids behave as in 20D.1.
- **No nested environments, no `array` column specs, no `\color` / `\operatorname` / `\boxed` / `\overset`.**
- **Pre-existing intermittent test, not fixed here (out of scope).** `src/questionTypes/composite.20d.test.tsx:48` fails about 40% of the
  time, on the untouched 60ddadc baseline (3 / 8 in isolation) as well as on this branch.
  - **Root cause:** the test's `settle()` helper stops waiting as soon as no `[role="status"]` element is present. It never waits for
    the lazily registered composite renderer (`.cmp-response`) itself.
  - **Proposed one-line patch** for a separate change: replace the `settle` wait with
    `await waitFor(() => expect(container.querySelector(".cmp-response")).toBeTruthy())`.
  - It passed in exact-head CI on every 21A head (`1ab3ae5`, `614d427`, `31b86fc`, `61cbe20`).
- **GovernancePanel timing.** `src/GovernancePanel.14b.test.tsx` (documented timing-sensitive file, AGENTS §12) failed once under
  full-suite load in the assignment-dialog case. It was not patched, per AGENTS §12.
- **Print of a very wide formula.** A formula wider than the printed page still overflows the page; there is no scroll on paper, and grids are not reflowed.
- **No solver.** No equivalence grading, no WYSIWYG editor, no MathML/LaTeX export format other than the exam JSON.
- **The 20D.1 inline Markdown converter does not accept multi-line inline `$…$`.** A math → paragraph conversion of a multi-line grid
  keeps the exact run, but re-editing that paragraph's text re-parses one-line `$…$` only.

## 36. Deployment tier, review and next steps

- **Deployment tier.** Tier 1 (local) and Tier 2 (CI on the exact head).
  - Opening or updating the PR triggers the Static Web Apps `Build and Deploy Job`. A **PR preview environment** exists only when that
    job succeeded on the reported head; the final report states the observed result.
  - No production deployment and no Runner deployment.
- **Independent review.**
  - **Round 1** (head `1ab3ae5`): **NOT READY — REVIEW FIX REQUIRED**. There was no blocker and no production-code defect in the
    parser, renderer or grading. It found:
    - 1 MAJOR test gap: the `\mathbb` closing brace;
    - 3 wrong claims in this record: catalog provenance, "rendering frozen", and the test count;
    - 1 accessibility issue: every display formula was a landmark and a tab stop;
    - 11 non-equivalent surviving reviewer mutants;
    - 1 new lint warning.
  - **Review Fix 1** addresses each finding (§17, §18, §23, §24, §27, §31, §33, §34). All of the reviewer's survivors are now killed.
  - **Round 2** (head `31b86fc`): **NOT READY**. There was no blocker and no major finding, and all Review Fix 1 items were confirmed.
    The round-2 findings were:
    - MINOR: the observer logic was not pinned (N03 leak mutant, N01, N02);
    - MINOR: the display block's `overflow-x:auto` was not pinned (N14);
    - MINOR: a false prompt-steering claim;
    - MINOR: a stale PR body;
    - MINOR: a vertical scroller under fallback fonts;
    - NIT: focus loss when the group stops overflowing;
    - NIT: "Arabic" worded too narrowly;
    - NIT: the 1 px tolerance had no boundary test.
  - **Review Fix 2** addresses each (§16, §17, §18, §18.2, §24, §31.2, §33). While verifying in Chromium it also found and fixed the
    small-inline-grid Tab stop. The round-3 re-review of the new head follows.
- **Merge.** The owner merges manually. DO NOT MERGE.
- **Next.** Rich review rendering; optional `\operatorname`-style named functions as a v3 family; inline-math authoring in AI prose
  behind the same validator.
