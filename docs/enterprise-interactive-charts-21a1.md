# Phase 21A.1 — Enterprise Interactive Data Visualization & Chart Questions

Design record for Phase 21A.1. ExamBank gains its own declarative, versioned data-chart contract, a lazy rendering runtime, a teacher
chart editor, a chart-as-answer question type graded on semantic targets, and an AI Composer chart capability. The pipeline is:

```
ExamBank-owned ChartSpecV1 (stored in exam JSON) → ONE strict validator (chartSpec.ts, shared client / server build)
  → canonical value → ExamBank ECharts ADAPTER (echartsAdapter.ts, pure) → lazy ECharts (SVG renderer) inside DataChart
```

Exam JSON never contains an ECharts option. Nothing a teacher, a student or the AI writes reaches the engine except as validated plain data;
every function the engine receives (formatters) is code-owned. ECharts can be replaced by writing another adapter.

## 1. Summary

- **ChartSpecV1** (`src/charts/chartSpec.ts`): closed, versioned, bounded. Ten kinds cover the thirteen families of the directive (§4).
  Validation never throws; it rebuilds a canonical copy or returns classified issues. Missing values are explicit `null`, never 0.
- **Stimulus seam**: a new RichContentV1 block, `dataChart` (appended to the block vocabulary — an older reader refuses it, §20). It works
  everywhere rich content works: question stems, section / cover instructions, scenario `rich` sources and composite source contexts.
- **Answer seam**: a new question type, **`chartSelection@1`**, standalone and as a composite child. The student selects semantic targets
  (category / series / datum / point / bin) on the chart or in an equivalent keyboard list; the server grades target ids, never pixels.
- **Runtime**: `echarts@6.1.0` through modular imports only, SVG renderer, two lazy engine modules (common kinds / radar + box plot + heat
  map), never in the initial graph nor in the Student Portal's static closure (bundle-guarded, §17).
- **Authoring**: a table-like chart editor (no JSON, no engine vocabulary), conversions between kinds that never drop data silently, and
  the correct answer picked on the chart itself.
- **AI Composer**: catalog **V3**. The model fills a flat, closed chart descriptor; code maps it to ChartSpecV1 and the same validator decides.
  Teacher numbers must be preserved exactly; invented numbers need the teacher's explicit consent and are always labelled illustrative.
- **Certification**: compatibility freeze, acceptance exam through the real platform lifecycle (4 personas), adversarial matrix (65 cases),
  real-Chromium certification (student path, editor, 360 px, touch, keyboard, print, reduced motion), performance, mutation campaign.
- **Bundle**: initial budget unchanged (125 KB); initial graph 127,601 B gzip (baseline 127,309, +292 B of registration metadata
  and lazy-chunk names). No chart renderer, engine, editor or selection code reaches the initial graph or the Student Portal's static closure.

## 2. Scope, non-goals and the 21A.2 boundary

In scope: the ten chart kinds below, chart stimuli, chart answer surfaces, grading, authoring, AI chart descriptors, import / export,
sanitization, finalization, accessibility, RTL, mobile, print, animation policy, bundle isolation.

Deferred (directive §40), not done:
- **21A.2 — mathematical graphing**: function plots `y = f(x)`, parametric / polar curves, inequalities, slope fields, interactive
  geometry. ChartSpecV1 plots DATA only; it has no expression language. 21A.2 adds its own versioned contract (it must not overload a
  ChartSpecV1 kind) and may reuse the adapter's theme, the lazy-engine pattern, the accessibility shell (figure, data table, selection
  list) and the bundle guard.
- 3D surfaces (Phase 21B), dashboards, user scripting, arbitrary ECharts options, live data feeds, unbounded datasets.
- AI-authored `chartSelection` questions (the AI authors chart STIMULI; a teacher authors the answer surface — §13).
- Heat-map cells as answer targets (heat maps are stimuli only in V1).

## 3. Baseline, branch and process

- Baseline `origin/main` = `ff1389940ddafa5ce0e5b23e581ac8ff3fb45fc8` (merge of PR #276, Phase 21A).
- Branch `feature/21a1-enterprise-interactive-data-visualization`; normal commits only:

| Commit | Content |
|---|---|
| `847fa9e` | compatibility freeze captured on the untouched baseline (fail-first record) |
| `41742d0` | ChartSpecV1, `dataChart` block, lazy ECharts runtime, chart editor |
| `bb99e33` | `chartSelection@1` (answer surface, ingest, grading, review) |
| `4684cbf` | AI Composer catalog V3 |
| `a18d2fa` | acceptance exam, lifecycle certification, chart bundle guards |
| `213856f` | adversarial matrix, combo secondary axis, compact label rotation |
| `3e59ffc` | mutation-campaign pins, composite chart-child review, label bidi rule, leaner student path |
| `736cda3` | pin for unknown combo marks (mutant C17b) |
| (this record) | design record |

Review-fix commits, if any, are listed in §21.

## 4. ChartSpecV1

Common keys (every kind): `version` (1), `id`, `kind`, `title`, `description` (read by screen readers), optional `source`, `animation`
(`none` / `subtle` / `normal`), `palette` (`categorical` / `sequential` / `diverging` / `neutral`), `legend` (`auto` / `none`).

| Kind | Data | Options | Families covered |
|---|---|---|---|
| `bar` | `categories[]`, `series[]` (values aligned with categories, `null` = missing) | `orientation` vertical / horizontal, `stacked`, `valueLabels`, axes, `referenceLines` | column, horizontal bar, stacked bar |
| `line` | same | `valueLabels`, axes, reference lines | line |
| `area` | same | `stacked`, … | area, stacked area |
| `combo` | same + per-series `mark` (`bar` / `line`) and optional `axis` (`primary` / `secondary`) | `y2Axis` (secondary value axis) | bar + line combo |
| `pie` | `slices[]` | `donut`, `unit`, `valueLabels` | pie, donut |
| `scatter` | `series[].points[]` (`id`, `x`, `y`, optional `label`) | axes, reference lines | scatter |
| `histogram` | `bins[]` (`start`, `end`, `count`; contiguous, ascending) | axes, `valueLabels` | histogram |
| `radar` | `axes[]` (with `max`), `series[]` | — | radar |
| `boxplot` | `boxes[]` (five-number summaries, ordered) | axes | box plot |
| `heatmap` | `columns[]`, `rows[]`, `values[][]` (`null` = missing) | `unit`, `valueLabels`, axes | heat map |

Rules (all enforced by `validateChartSpec`, all pinned by tests):
- **Closed**: per-kind key allow-lists; any unknown key — `option`, `formatter`, `tooltip`, `graphic`, `dataset`, `renderItem`, `on*`, a
  style, an answer — is **refused** (never dropped). Own `__proto__` / `constructor` / `prototype` keys and ids are refused.
- **Text**: bounded prose; markup, script / data URLs, control characters and explicit bidi embeddings / overrides / isolates are refused
  (plain LRM / RLM marks are allowed). Odd-but-harmless text (`{b}`, `<b>`, a plain URL) is kept as literal data (§11).
- **Numbers**: finite JSON numbers only (no strings, booleans, `NaN`, `±Infinity`); |v| ≤ 1e15; `-0` is stored as `0`.
- **Missing values**: explicit `null` only where the kind documents it (category series, heat-map cells); an all-missing series is refused.
- **Identity**: ASCII ids (letter first, ≤ 32, `[A-Za-z0-9_-]`) unique per namespace; labels unique (NFC, whitespace-collapsed,
  case-insensitive) per namespace.
- **Semantics**: pie non-negative with a positive sum; histogram bins contiguous and ascending; radar values within `[0, max]`; box-plot
  `min ≤ q1 ≤ median ≤ q3 ≤ max`; axis `min < max`; a combo keeps at least one series on the primary axis and may declare `y2Axis` only
  when a series uses it.
- **Canonical value**: a fresh object in a fixed key order (never the input, never a spread of input). Idempotent.
- The `chartSelection` instruction `label` follows the same text rule (bounded prose; no markup, control characters or explicit bidi
  controls — the bidi part was added by the self-review).

### 4.1 Limits

| Limit | Value |
|---|---|
| title / description / source / label / unit chars | 160 / 1000 / 300 / 80 / 24 |
| categories, series, data points (categories × series) | 60, 8, 480 |
| slices, scatter series, scatter points (total), bins | 24, 6, 500, 40 |
| radar axes, radar series, boxes | 3–12, 6, 24 |
| heat map | 24 × 24 |
| reference lines | 4 |
| serialized chart | 64 KiB |
| charts per rich document | 8 |
| `chartSelection` label / response targets | 160 / 500 |

The data-point budget equals the product of the per-axis caps (60 × 8); it is kept as defense in depth if a cap changes (mutation C11 is
recorded as equivalent, §21).

## 5. Architecture and the adapter boundary

| Module | Role | Loaded |
|---|---|---|
| `src/charts/chartSpec.ts` | contract, validator, limits, kind names, summary, plain text | shared build; client wherever rich content is validated |
| `src/charts/chartData.ts` | selectable targets, data table, selection rules (`nextChartSelection`, `isContiguousRun`) | shared build; client with the chart surfaces |
| `src/charts/echartsAdapter.ts` | pure ChartSpecV1 → engine option, event → semantic key, tooltip text, layout helpers | with DataChart (lazy) |
| `src/charts/echartsEngine.ts` / `echartsAdvanced.ts` | the ONLY `echarts` importers (modular: Bar, Line, Pie, Scatter, Grid, MarkLine, SVGRenderer / + Radar, Boxplot, Heatmap, VisualMap) | dynamic `import()` from DataChart |
| `src/charts/DataChart.tsx` | accessible figure, text legend, text tooltip, keyboard selection list, data table, engine lifecycle | `lazy()` from the rich renderer / chart surfaces |
| `src/charts/ChartEditor.tsx` | teacher chart editor | `lazy()` from the rich-content editor and the chartSelection editor |

The adapter never configures engine tooltip / legend / title / toolbox / dataZoom / graphic / aria / dataset components (ExamBank draws
them as React text), never passes a template string (every formatter is a code-owned function returning text), isolates RTL labels with
RLI…PDI, and keeps axis text inside the canvas (`outerBoundsContain: "all"`). Swapping the engine means rewriting the adapter and the two
engine modules; nothing stored changes.

## 6. Security model

- **User data is data, never code**: the contract has no executable, markup, style, URL or engine channel; the adapter's option is plain data
  plus code-owned formatter functions (pinned: functions appear nowhere else in the option).
- **One validation authority** for every entry point: authoring, structured import, server save / finalization, student projection, AI intake
  and the render boundary (RichPrompt / RichText validate before render; chart surfaces render only projected configs).
- **Fail closed**: an invalid chart never reaches the student (the rich document falls back to its plain text; a chartSelection surface with an
  invalid config is withheld and grades to teacher review).
- **Answer-key isolation**: the key (`answer.correct`, `answer.scoring`) lives only in the teacher's question; the student receives the strict
  projection of the public config (a config smuggling any other field is withheld whole).
- Adversarial matrix: §19.

## 7. Supported interactions

- Hover / focus shows an ExamBank TEXT tooltip (spans, positioned inside the stage) — never engine HTML.
- `chartSelection` modes: `single`, `multiple` (bounded by `maxSelections`), `range` (a contiguous run in chart order; category and bin
  targets only). Target kinds per chart kind: category / series / datum (`seriesId/categoryId`, present values only) for category charts;
  category for pie and box plot; point / series for scatter; bin for histograms; series for radar; none for heat maps.
- Pointer / touch on the picture and the keyboard list emit the SAME semantic keys (pinned in unit tests and in real Chromium).
- Zoom, hover and legend state are never part of an answer.

## 8. Grading

`chartSelection@1` registered grader (`api/src/lib/question-type-graders.js` → `scoreChartSelection`, shared build):

| Situation | Result |
|---|---|
| exact set (`allOrNothing`) | full marks; anything else 0 |
| `partial` | `marks × |S ∩ K| / |S ∪ K|` (selecting everything never pays) |
| unanswered / malformed / another chart / unknown / duplicate / too many / broken range | ordinary 0 (no review) |
| broken config or key (cannot be classified) | 0 with `manualReview: true` (teacher review — never a silent academic zero, never credit) |

Ingest (`draft-answers.js`, draft / submit / pause) rebuilds a chart answer to exactly `{ kind, chartId, targets }` in chart order and refuses
— never repairs — anything else with a classified code; a chart answer on a non-chart question or composite child is refused.

## 9. Authoring

**Chart editor** (`ChartEditor.tsx`, lazy; used by the rich-content block editor and the chartSelection editor):
- Typed controls only: kind, orientation, title, description ("read by screen readers"), source, animation, palette, legend, stacking,
  value labels, axes (label / unit / min / max; the secondary value axis appears only while a combo series uses it).
- A table-like grid per kind: categories × series (combo: a mark and an axis per series), rows (pie / histogram / box plot), points per
  scatter series, radar axes × series, heat-map rows × columns, reference lines. Add / reorder / remove rows and series with fresh ids.
- Number cells accept Western and Arabic-Indic / Persian digits, the Arabic decimal separator and the minus sign; an empty cell is a
  missing value (never 0); a typo stays on screen, is flagged `aria-invalid`, and is never stored.
- Kind changes carry the data whenever the target can hold it (between category kinds; category ⇄ heat map; pie → category; …). A change
  that would discard data (or a combo's secondary axis) is reported lossy and asks first.
- No JSON field and no engine vocabulary anywhere in the editor (pinned).

**Rich content**: "+ رسم بياني" adds a valid starter chart; duplicating a block gives the copy a fresh chart id; the block preview renders
through the same lazy DataChart.

**chartSelection editor** (`ChartSelectionEditor.tsx`, lazy registry edge): create the chart (kind → starter data → the chart editor) →
what the student selects (target kind, mode, bound, optional instruction) → the correct target(s) picked **on the chart itself** through the
same selection surface the student uses → scoring. One emission keeps the public config and the key mutually consistent (unsupported mode
adjusted, bound clamped, key entries of vanished targets dropped, a broken range cleared); the canonical validation is shown inline.

## 10. Accessibility, RTL, animation, mobile and print

- **Figure**: `<figure>` named by the chart title (`aria-labelledby`) and described by its description plus a structural summary
  ("رسم بالأعمدة — 12 فئات، 1 سلسلة"); never a generic "chart" label. The engine picture is `aria-hidden`.
- **Text legend** (series colours as swatches + `<bdi>` labels), **text tooltip** (spans), **data table** behind a toggle (one header row,
  one row header per row, missing values marked "— (لا قيمة)"), opened automatically when the engine cannot load (with a retry button).
- **Selection list**: one `aria-pressed` button per selectable target (same order as the chart), a polite live announcement of each change,
  read-only review marks (✓ correct / ✗ incorrect / missed).
- **RTL**: Arabic labels reach the engine wrapped in RLI…PDI isolates; mixed Arabic / English / numbers / units render in logical order;
  categories keep data order on the x axis (charts are not mirrored); the shell, legend, list and table follow the page direction.
- **Animation**: `none`, `subtle` (formal-exam default, 350 ms), `normal` (800 ms; teacher preview may upgrade `subtle`). Reduced motion and
  print always force `none`.
- **Mobile**: width-only resize observer (one measurement per animation frame); under 480 px a compact layout (smaller text, rotated or
  truncated category labels, no outside pie labels, legend wrapping). Stage heights depend only on kind, data size and width class (no
  resize feedback loop).
- **Print**: no animation; the figure never splits across pages; the SVG scales to the page width; the tooltip, loading status, retry
  button and table toggle are not printed; the selection list prints in full (a printed copy shows every choice).

## 11. AI Composer (catalog V3)

- `AI_COMPOSER_CATALOG_V3`: `dataChart` joins the AI rich-block list; the prompt carries a "Charts:" contract line (kinds, bounds, data model,
  provenance rule, "never formulas, HTML, CSS, scripts, URLs, colours or rendering options"); combos share one value axis in AI drafts.
- The provider schema gives every rich block a `chart` field: `null`, or a flat closed descriptor (`kind`, `dataOrigin`, `title`,
  `description`, `categories`, `series[{label, values, mark}]`, `points`, `bins`, `boxes`, `xLabel`, `yLabel`, `unit`, `stacked`, `horizontal`,
  `donut`) — strict, `additionalProperties: false`, no engine vocabulary (pinned).
- Code maps the descriptor (`mapAiChart`): deterministic ids (`chart1`, `c1`, `s1`, …), code-owned provenance label in `source`, then the ONE
  chart validator. Refusals are classified and repairable within the existing bounded section repair: `AI_CHART_POLICY_MISSING`,
  `AI_CHART_DISABLED`, `AI_CHART_MALFORMED`, `AI_CHART_ILLUSTRATIVE_NOT_ALLOWED`, `AI_CHART_DATA_NOT_PROVIDED`, or the chart authority's code.
- **Teacher data preserved exactly**: with `dataOrigin: "teacherProvided"` every number must occur in the teacher's request (Western or
  Arabic-Indic digits); a changed or invented number is refused.
- **Illustrative data** only with the teacher's explicit `illustrativeData` capability (default OFF) and always labelled by code
  "بيانات توضيحية من إنشاء الذكاء الاصطناعي — ليست بيانات حقيقية" — whatever the model wrote in its title or description.
- Without a policy (fail closed) or with `charts` off, no AI chart is accepted. Nothing is returned to store when a section is refused.

## 12. Import / export, sanitizer, finalization

- Structured import / canonical save / export / re-import keep every chart and every chartSelection config byte-for-byte (acceptance exam,
  §13; the 20G round-trip sweep now includes `docs/fixtures/data-charts-21a1/`).
- Finalization runs the same chart authority (rich documents, scenario sources, composite contexts, chartSelection configs and keys).
- Student projection: rich documents through `projectRichContentForStudent` (an invalid chart drops the document to its text fallback);
  chartSelection configs rebuilt through `projectChartSelectionConfigForStudent` (anything else withheld whole); the question key is blanked.
- Teacher review receives the chartSelection config, the key and the stored semantic answer; `ChartSelectionReview` (lazy, teacher-only)
  renders the student's selection with ✓ / ✗ / missed marks and a summary — for a standalone question and for a composite child alike
  (the composite review tree routes `chartSelection` children to the same view; before the self-review fix it showed raw JSON).

## 13. Acceptance exam and lifecycle

`docs/fixtures/data-charts-21a1/ExamBank_21A1_Interactive_Charts_Mini_Acceptance.json` (generated from the shared chart fixtures by
`scripts/generate-data-charts-21a1-fixture.mjs`): schemaVersion 2, sections A–D, 40 marks.

| Section | Content |
|---|---|
| A — monthly rainfall | ONE 12-month chart in a scenario source read by four questions: MCQ (wettest month), numeric (January), chartSelection multiple / partial (months > 100 mm), chartSelection range (the dry run May–September) |
| B — time series | line chart with a missing value (MCQ: lowest minimum), chartSelection datum (highest maximum), stacked area (numeric total) |
| C — scatter / distribution | scatter point selection (the outlier), histogram bin selection (modal class) |
| D — comparative | composite with a bar + line combo (secondary axis) context and a chartSelection child + numeric child, horizontal stacked bar (MCQ), box plot (numeric median) |

`api/tests/certification-21a1/cert-21a1-charts-lifecycle.test.js` drives it through the REAL handlers: import → canonical save → export →
re-import, finalization, save → load → governance → publish → assignment, sanitized delivery (pre-start hides the body; every chart and
selection surface delivered byte-for-byte; no key, note or canary), autosave / restore, the semantic answers, idempotent submit
(200 then 409), and hand-derived ledgers:

| Persona | Score | Notes |
|---|---|---|
| PERFECT | 40 / 40 | finalized |
| PARTIAL | 17.5 / 40 | a3 partial 1.5 (|{oct}| / |{jan, oct}|), a4 range one month short = 0, d1 composite 3 of 6 |
| BLANK | 0 / 40 | finalized; an unanswered chart question is an ordinary unanswered question |
| ATTACKER | 0 / 40 | 9 forged chart answers refused at ingest with classified codes; self-graded fields dropped; nothing forged stored or graded |

Teacher review returns the config, key and stored answer; the review evaluation marks January missed and October correct.

## 14. Backward compatibility

- Additive only: a new rich block kind appended to the vocabulary, a new question type, a new catalog row (after `composite`), catalog V3.
- `api/tests/certification-21a1/cert-21a1-compat-freeze.test.js` (captured on the untouched baseline with `CAPTURE_21A1=1`): for every committed
  exam fixture, rich content, import / export / canonical save, finalization, student projection and grading are byte-for-byte the baseline;
  the pre-21A.1 block vocabulary keeps its order and meaning; the AI prompt changes only by the declared delta.
- **An older reader fails closed** (baseline `847fa9e` on the acceptance exam): import refused (`UNSUPPORTED_QUESTION_TYPE`), 12 finalization
  blockers (`dataChart` not an allowed block; `chartSelection` unknown), chart answers refused at ingest (`ANSWER_INVALID`), an unknown type
  grades 0 with manual review, and an invalid rich document is dropped to its text fallback.

## 15. Browser certification (real Chromium)

The repository's existing approach (Playwright driving the pre-installed Chromium against a Vite build of the real components; no new
framework) was used with a scratch harness outside the repository. Results:

| Check | Result |
|---|---|
| 15 charts of every kind (W3/W7 page) at 1280, 360, 360 reduced-motion and print (A4 PDF) | every chart `ready`; 0 text elements outside their SVG; no horizontal page overflow; no console error |
| RTL | Arabic labels carry RLI…PDI isolates in the SVG text; mixed Arabic / numbers / units in order |
| hostile-looking text (`{a|b}`, entities, `{c}%`) | rendered literally in the SVG and the tooltip |
| resize (1280 → 360 → 1280 on one page) | compact layout switches both ways; 0 clipped text after settling |
| disposal | unmount all → 0 `_echarts_instance_` hosts; remount / unmount → 0 |
| **student path** — the delivered (sanitized) acceptance exam through `StudentQuestionCard` / `ScenarioView` at 1280 and at 360 px with touch | 15 figures ready; 0 clipped texts; no page overflow; no console error |
| pointer / touch selection (a3 January + October, c1 the outlier, d1.p1 Q4) and keyboard selection (a4 May → September, b2 "Max °C — TUE", c2 "[20 – 30)") | answers exactly the PERFECT persona's semantic answers; the server grader gives 40 / 40 for them at both widths |
| live announcement | "تم تحديد: [20 – 30) — المحدَّد 1" |
| tooltip (desktop) | text "يناير / الهطول: 120 mm" inside the stage |
| teacher editor | create a bar chart; Arabic-Indic "٤٢٫٥" stored as 42.5; "abc" flagged and never stored; an emptied cell stored as `null`; the key picked by clicking the tallest bar → `correct: ["c1"]`; no engine vocabulary in the UI |

Two defects were found this way and fixed with fail-first tests (§18): the combo chart's second series drawn on the first series' scale,
and four long category labels touching at 360 px.

## 16. Performance

Worst cases within the limits, real Chromium, production build of the probe (SVG renderer, `subtle` animation):

| Case | Create (ms) | Resize (ms) | Select (ms) | Unmount (ms) | Instances left |
|---|---|---|---|---|---|
| bar 60 × 8 (480 points) | 336 | 82 | 118 | 10 | 0 |
| line 60 × 8 with gaps | 324 | 75 | 128 | 14 | 0 |
| scatter 500 points | 386 | 100 | 135 | 17 | 0 |
| heat map 24 × 24 (advanced chunk) | 255 | 69 | — | 9 | 0 |
| bar 60 × 8 at 360 px | 264 | 158 | 120 | 11 | 0 |
| 30 charts on one page | 824 | 276 | — | 15 | 0 |
| 60 charts on one page | 1,139 | 574 | — | 36 | 0 |

"Create" is page start to every figure `ready` (includes downloading and evaluating the engine chunk). "Select" includes the click, the
React update and the engine re-option. 40 mount / unmount cycles of 11 charts keep DOM nodes (39) and JS event listeners (154) flat; the
heap returns to within ~0.5 MB of its first unmounted value (GC noise, no growth trend). One `ResizeObserver` per chart (disconnected on
unmount, pinned); one engine instance per chart, updated in place on data change (pinned); a load that resolves after unmount never mounts
(pinned).

## 17. Bundle (directive §38)

Measured on a production build (`npm run build`, gzip level 9, `scripts/check-bundle-budget.mjs`); baseline = `ff13899`.

| Item | Baseline | Head |
|---|---|---|
| Initial graph (index.html entry + static imports) | 18 files, 127,309 B gzip | 18 files, 127,601 B gzip (budget 125 KB = 128,000 B, unchanged) |
| Chart code in the initial graph | — | **none** (guard: any chart / engine signature in an initial file fails the build) |
| Chart code in a no-chart student's first-load graph | — | **No** renderer, engine, editor or selection code in the initial graph or the Student Portal's static closure (guarded). The Portal closure (22 → 23 files, 86,684 → 92,789 B gzip) gains the pure ChartSpec validator (`chartSpec`, 5,861 B gzip) and the renderer's `dataChart` case (~0.2 KB) through the rich-content modules it has loaded since 20D.1 (§22). |
| Common chart runtime (ECharts core shared chunk + engine module) | — | 182.1 KB gzip (131.7 + 50.4), budget 195 KB, lazy behind DataChart's `import()` |
| Advanced kinds (radar, box plot, heat map) | — | +17.8 KB gzip, budget 22 KB, lazy |
| DataChart first paint (figure, list, table, adapter) | — | 5 files beyond the initial graph, 14.9 KB gzip (DataChart 7.1 KB) |
| Chart editor | — | ChartEditor 5.8 KB gzip (13.4 KB with its closure) |
| chartSelection editor | — | 2.2 KB gzip (27.6 KB with its closure, DataChart and ChartEditor included) |
| Student renderer / teacher review | — | 0.7 / 0.8 KB gzip (+ DataChart on demand) |
| AI Composer delta | 33 files, 182,742 B gzip | 36 files, 193,158 B gzip (+10,416 B ≈ 10.2 KB: ChartSpec 5,861 B, chartSelection model 2,904 B through the shared finalization, chart helpers 1,326 B, the composer dialog with catalog V3 and the chart descriptor +262 B) |

Guards added to `scripts/check-bundle-budget.mjs` (each shown to fail on a planted defect in a copy of `dist`: an engine signature in an
initial file, a static engine import from DataChart, chart code in the Student Portal, an oversized advanced chunk): signatures never
initial nor in the Portal's static closure, every signature present in some chunk, the engine only behind DataChart's dynamic edges, and the
two lazy budgets. `src/charts/DataChart.21a1.test.tsx` pins the guard's rules and every lazy import literally (mutants B01–B03).

## 18. Fail-first evidence

Every new capability's suite was executed against the defective / missing code before the implementation, in a detached worktree; the
failing runs are recorded in the implementer's evidence files and summarised here.

| Capability (directive §33) | Suite | Baseline run | Outcome |
|---|---|---|---|
| ChartSpec acceptance, hostile refusal | `src/charts/chartSpec.21a1.test.ts` | `847fa9e` | module missing — all fail |
| rich-content chart block | `src/richContent/richContentChart.21a1.test.ts` | `847fa9e` | `RICH_CONTENT_BLOCK_TYPE` for `dataChart` |
| renderer, lazy loading, accessibility, RTL, print / animation policy | `src/charts/DataChart.21a1.test.tsx`, `src/charts/echartsAdapter.21a1.test.ts` | `847fa9e` | modules missing |
| authoring | `src/charts/ChartEditor.21a1.test.tsx`, `src/charts/chartEditing.21a1.test.ts` | `847fa9e` | modules missing |
| chart selection answer, grading, ingest, sanitization | `src/chartSelectionQuestion.21a1.test.ts`, `api/tests/chart-selection-21a1.test.js`, `src/questionTypes/chartSelection.21a1.test.tsx` | `847fa9e` | type unknown; answers refused `ANSWER_INVALID`; grades 0 + review |
| AI intake | `src/aiComposer/composerChart.21a1.test.ts`, `api/tests/ai-composer-charts-21a1.test.js` | `847fa9e` | catalog V2, no chart field |
| import / export, lifecycle | `api/tests/certification-21a1/cert-21a1-charts-lifecycle.test.js` | `847fa9e` | cannot load (no chart modules); the fixture alone: import refused, 12 finalization blockers |
| combo secondary axis (defect found in Chromium) | `src/charts/chartSecondaryAxis.21a1.test.tsx` | `a18d2fa` | 7 / 7 fail |
| compact label rotation (defect found in Chromium) | `src/charts/echartsAdapter.21a1.test.ts` (rotation pin) | `a18d2fa` | 1 fail: `[undefined, …]` vs `[45, …]` |

Pins (current behaviour that must not change) are labelled as pins: the compatibility freeze (§14), the bundle guard pins (§17).

## 19. Adversarial matrix (directive §34)

`api/tests/certification-21a1/cert-21a1-adversarial.test.js` plants every attack in a REAL exam (a question stem's `dataChart`, a
scenario source chart and a `chartSelection@1` surface) and drives it through every authority that can meet it.

**Refused everywhere** (chart contract code, `RICH_CONTENT_CHART`, structured import error, finalization blocked, student projection
withholds every copy — stem → text fallback, answer surface withheld, no marker string in the projection — and the chart question grades
0 + teacher review; each case refused in < 2 s): script-looking title; `<img onerror>` label; SVG-looking label; HTML anchor; `javascript:`
source; `data:text/html` unit; 81-character label; 10,000-character title; RLO override; unterminated RLI isolate; control character;
numeric string; boolean; 1e300; a value nested 4,000 deep; 2,000 categories; 500 series; duplicate category ids; duplicate labels; empty
series; series without values; own `__proto__` key (JSON body); own `constructor` key; `__proto__` as an id; a Cyrillic look-alike id; a
raw ECharts option instead of a spec; an option smuggled in a spec; a formatter function source; engine tooltip / graphic components with
an external image URL; an answer smuggled inside the chart; unknown kind; future version.

**Accepted only as literal data** (no formatter string, no `rich` / `html` / `image` / `url` key anywhere in the engine option, text nodes
only in the DOM): template braces `{b}: {c}`, `{a|rich} ${x} {{y}}`, `<b>bold</b>`, a plain URL source, Arabic with numbers, units and LRM
marks. `-0` is stored as `0`; an unsorted scatter keeps its authored order and is selected by identity.

**Malformed interaction targets** (14 cases: non-array, number, `null`, object, nested array, `__proto__`, impossible datum id, look-alike
id, coordinates instead of targets, 10,000 targets, another chart's id, missing chart id, a self-score on a correct answer, an own
`__proto__` key): refused at ingest with a classified code (or rebuilt to exactly `{ kind, chartId, targets }`), worthless at grading (a
self-score is dropped; the grader recomputes).

**Hidden answer injection**: a key smuggled into the public config withholds the whole surface and blocks publishing; a key next to a
`dataChart` block is an unknown block key; a valid exam's projection carries no key, scoring or teacher note.

**AI intake**: the same attacks in a chart descriptor (script / img / svg text, bidi override, long label, raw option, formatter key,
string number, unknown kind, hidden answer, 2,000 points) are refused and nothing is returned to store.

**Render side** (`DataChart.21a1.test.tsx`, 21A1-DC6): odd-but-valid text is rendered as text in the figure, legend, selection list and
data table and never becomes an element; a document whose chart is hostile never reaches the renderer (plain-text fallback, no figure,
no engine).

## 20. Mutation campaign (directive §35)

Runner: one mutant at a time, exact single-occurrence replacements; a mutant of a module compiled into the API's shared build is planted
in the `src/` TypeScript and the shared build is regenerated, then the edited sources AND every generated file are restored byte-for-byte
(SHA-256 verified) in `finally`; the runner refuses a dirty tree, pre-checks every suite set unmutated, reports a timeout as TIMEOUT (none
occurred) and a TypeScript build rejection as BUILD_ERROR (never a kill); the shared-build drift test is excluded from mutant suites (it
would kill every shared mutant falsely). `git status` was clean after every round.

| Round | Planted | KILLED | SURVIVED | BUILD_ERROR |
|---|---|---|---|---|
| 1 | 79 (contract 23, adapter 13, selection data 5, grading / ingest 13, sanitizer / review / server 9, accessibility 5, AI 8, bundle 3) | 69 | 3 (C11, C23, D04) | 7 |
| 2 | 12 (7 compilable re-plants, C23 / D04 re-runs with new pins, N01–N03 for the self-review fixes) | 11 | 1 (C17b) | 0 |
| 2b | C17b re-run with its pin | 1 | 0 | 0 |

**Final: 82 distinct planted defects, 81 KILLED, 1 equivalent (C11), 0 unexplained survivors.** Survivors were closed with pins:
C23 → `chartRules.21a1.test.ts` 21A1-R1 (the 64 KiB bound is reachable with 500 labelled scatter points); D04 → 21A1-R2 (selection rules
of every mode); C17b → `chartSpec.21a1.test.ts` (present unknown combo marks). C11 is equivalent: the 480-point budget equals the product
of the per-axis caps, so removing it cannot change any outcome.

| Id | Area | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| C01 | contract/type | unknown keys accepted (allow-list check removed) | KILLED | chartSpec.21a1.test.ts — not an object / wrong version / unknown kind / raw ECh |
| C02 | contract/type | markup text accepted (RAW_HTML check removed) | KILLED | chartSpec.21a1.test.ts — text: markup, script URLs, control and bidi-override c |
| C03 | contract/type | bidi / control characters accepted | KILLED | chartSpec.21a1.test.ts — text: markup, script URLs, control and bidi-override c |
| C04 | contract/limits | text bound off by one (> → >= ... accepted at max+1) | KILLED | chartSpec.21a1.test.ts — text bounds: title 160 / 161, description 1000 / 1001, labels 80 / 81, |
| C05 | contract/finite | non-finite numbers accepted (isFinite removed) | KILLED | chartSpec.21a1.test.ts — numbers: NaN, ±Infinity, numeric strings, booleans, ob |
| C06 | contract/limits | absolute magnitude bound removed | KILLED | chartSpec.21a1.test.ts — numbers: NaN, ±Infinity, numeric strings, booleans, ob |
| C07 | contract/finite | -0 kept as -0 (normalisation removed) | KILLED | chartSpec.21a1.test.ts — negative zero is stored as 0; decimals, negatives and zero are kept e |
| C08 | contract/duplicates | duplicate ids accepted | KILLED | chartSpec.21a1.test.ts — structure: mismatched value counts, empty series, all- |
| C09 | contract/duplicates | duplicate labels accepted | BUILD_ERROR → re-planted as C09b | — |
| C10 | contract/limits | collection maximum removed | KILLED | chartSpec.21a1.test.ts — categories 60 / 61; series 8 / 9; data points 480 / 481 |
| C11 | contract/limits | data-point budget (categories × series) removed | SURVIVED — equivalent | the 480-point budget equals 60 categories × 8 series; the check cannot fire (kept as defense in depth) |
| C12 | contract/type | value count ≠ category count accepted | BUILD_ERROR → re-planted as C12b | — |
| C13 | contract/type | all-missing series accepted | KILLED | chartSpec.21a1.test.ts — structure: mismatched value counts, empty series, all- |
| C14 | contract/finite | missing values refused where allowed (nullable ignored) | KILLED | chartSpec.21a1.test.ts — every fixture kind is accepted and rebuilds to an equal canonical val |
| C15 | contract/allow-list | kind allow-list removed | KILLED | richContentChart.21a1.test.ts — an invalid chart is refused with RICH_CONTENT_CHART carrying the chart |
| C16 | contract/allow-list | version check removed | KILLED | chartSpec.21a1.test.ts — not an object / wrong version / unknown kind / raw ECh |
| C17 | contract/allow-list | combo mark enum not enforced | BUILD_ERROR → re-planted as C17b | — |
| C18 | contract/semantics | every series on the secondary axis accepted | KILLED | chartSecondaryAxis.21a1.test.tsx — refusals: an unknown axis value, every series on the secondary axis, a |
| C19 | contract/semantics | unused secondary axis accepted | KILLED | chartSecondaryAxis.21a1.test.tsx — refusals: an unknown axis value, every series on the secondary axis, a |
| C20 | contract/semantics | negative pie slice accepted | KILLED | chartSpec.21a1.test.ts — kind-specific semantics: pie non-negative with a posit |
| C21 | contract/semantics | histogram gaps accepted | KILLED | chartSpec.21a1.test.ts — kind-specific semantics: pie non-negative with a posit |
| C22 | contract/semantics | box plot order not enforced | KILLED | chartSpec.21a1.test.ts — kind-specific semantics: pie non-negative with a posit |
| C23 | contract/limits | serialized size bound removed (re-run with the new pin) | KILLED (round 2, after its pin; SURVIVED in round 1) | chartRules.21a1.test.ts — a maximal labelled scatter (500 points × 73-character Arabic labels ≈  |
| A01 | adapter/kind | combo marks ignored (every series a bar) | KILLED | echartsAdapter.21a1.test.ts — stacked area, combo marks, donut radius, scatter, histogram, radar, bo |
| A02 | adapter/series | a missing value drawn as 0 | KILLED | echartsAdapter.21a1.test.ts — vertical bars: categories on x in data order (never reversed), values  |
| A03 | adapter/axis | horizontal bars keep categories on x | KILLED | echartsAdapter.21a1.test.ts — horizontal stacked bars: the numeric axis is x (from spec.xAxis), cate |
| A04 | adapter/axis | secondary axis indexes swapped | KILLED | chartSecondaryAxis.21a1.test.tsx — a dual-axis combo gets two value axes (the secondary on the other side |
| A05 | adapter/axis | reference lines always on series 0 | KILLED | chartSecondaryAxis.21a1.test.tsx — a single-axis combo is unchanged (one value axis, no axis index); refe |
| A06 | adapter/selection-id | datum key built category/series | KILLED | echartsAdapter.21a1.test.ts — engine coordinates map to semantic keys for every target kind; a missi |
| A07 | adapter/selection-id | a missing value is selectable by pointer | KILLED | echartsAdapter.21a1.test.ts — engine coordinates map to semantic keys for every target kind; a missi |
| A08 | adapter/rtl | RTL labels not isolated | KILLED | echartsAdapter.21a1.test.ts — hostile-looking author text (template syntax, rich-text syntax, entity |
| A09 | adapter/tooltip | secondary-axis tooltip uses the primary unit | KILLED | chartSecondaryAxis.21a1.test.tsx — the tooltip uses each series' own axis unit |
| A10 | adapter/selection | selection emphasis never applied | KILLED | echartsAdapter.21a1.test.ts — selected targets are emphasised with the selection colour; the others  |
| A11 | adapter/kind | advanced kinds never load the advanced chunk | KILLED | echartsAdapter.21a1.test.ts — only radar, box plot and heat map need the advanced engine chunk |
| A12 | adapter/safety | a template-string formatter instead of a code function | KILLED | echartsAdapter.21a1.test.ts — every formatter is a code-owned FUNCTION (never a template string), an |
| A13 | adapter/layout | compact long labels no longer rotate | KILLED | echartsAdapter.21a1.test.ts — axis labels and names are contained in the canvas (outer bounds = grid |
| D01 | selection/targets | missing values become datum targets | BUILD_ERROR → re-planted as D01b | — |
| D02 | selection/multi | multiple mode ignores the bound | KILLED | chartSelection.21a1.test.tsx — keyboard list and pointer emit the SAME semantic answer on the questio |
| D03 | selection/range | range end excluded | KILLED | DataChart.21a1.test.tsx — range mode selects a contiguous run in chart order; read-only surfaces |
| D04 | selection/single | single mode never toggles off (re-run with the new pin) | KILLED (round 2, after its pin; SURVIVED in round 1) | chartRules.21a1.test.ts — single: a click selects, a second click on the SAME target clears, ano |
| D05 | a11y/data-table | missing values shown as 0 in the data table | KILLED | chartSpec.21a1.test.ts — the accessible data table carries every value (missing sta |
| G01 | grading/identity | another chart's answer accepted | KILLED | chartSelectionQuestion.21a1.test.ts — refuses another chart, unknown / duplicate / non-string targets, too m |
| G02 | grading/multi | more targets than allowed accepted | KILLED | chartSelectionQuestion.21a1.test.ts — refuses another chart, unknown / duplicate / non-string targets, too m |
| G03 | grading/invalid-target | unknown targets accepted | KILLED | chart-selection-21a1.test.js — refuses impossible ids, duplicates, a foreign chart, too many targets, |
| G04 | grading/invalid-target | duplicates accepted | KILLED | chartSelectionQuestion.21a1.test.ts — point and datum targets grade by identity; another chart, duplicates a |
| G05 | grading/range | non-contiguous range accepted | KILLED | chartSelectionQuestion.21a1.test.ts — refuses another chart, unknown / duplicate / non-string targets, too m |
| G06 | grading/multi | a superset counts as exact | KILLED | chartSelectionQuestion.21a1.test.ts — exact multiple (allOrNothing) ignores order and pays only the exact se |
| G07 | grading/multi | partial credit over the key instead of the union (select-all pays) | KILLED | chartSelectionQuestion.21a1.test.ts — exact multiple (allOrNothing) ignores order and pays only the exact se |
| G08 | grading/fail-closed | broken authority scores 0 without review | KILLED | chartSelectionQuestion.21a1.test.ts — a broken config or key fails CLOSED to teacher review (never a silent  |
| G09 | grading/single | malformed response routed to review | KILLED | chart-selection-21a1.test.js — chartSelection@1 is registered at exactly version 1 and grades semanti |
| G10 | grading/single | single key may hold several targets | KILLED | chartSelectionQuestion.21a1.test.ts — valid keys are canonical (chart order); single needs exactly one; the  |
| G11 | ingest/identity | bound answer keeps the client's chart id | KILLED | chartSelectionQuestion.21a1.test.ts — rebuilds exactly { kind, chartId, targets } in chart order; client sco |
| G12 | ingest/shape | target id shape not checked | KILLED | chartSelectionQuestion.21a1.test.ts — refuses another chart, unknown / duplicate / non-string targets, too m |
| G13 | grading/single | an empty selection counts as answered | KILLED | chartSelectionQuestion.21a1.test.ts — a defective published config keeps a shape-valid answer (the student's |
| S01 | sanitizer/key-stripping | public config projected raw (a smuggled key survives) | KILLED | chart-selection-21a1.test.js — the sanitizer keeps the declarative chart (labels, values, units) and  |
| S02 | sanitizer/key-stripping | sanitizer keeps the stored chartSelection config | KILLED | chart-selection-21a1.test.js — the sanitizer keeps the declarative chart (labels, values, units) and  |
| S03 | sanitizer/teacher-metadata | question answer key not blanked | KILLED | chart-selection-21a1.test.js — the sanitizer keeps the declarative chart (labels, values, units) and  |
| S04 | sanitizer/teacher-metadata | teacher note not blanked | KILLED | cert-21a1-adversarial.test.js — a valid exam's projection never carries th |
| S05 | rich-content | a dataChart block skips the chart authority | KILLED | cert-21a1-adversarial.test.js — script-looking title |
| S06 | ingest/identity | a chart answer on a non-chart question accepted | KILLED | cert-21a1-charts-lifecycle.test.js — ATTACKER: every forged chart answer is refused at ingest with its cl |
| S07 | server/answered | server answered-predicate ignores targets | KILLED | chart-selection-21a1.test.js — answered ⇔ at least one target |
| S08 | review | teacher review loses the chart config | KILLED | cert-21a1-charts-lifecycle.test.js — teacher review: the chart question carries its config, the key and t |
| S09 | grading/registration | grader scores against 0 marks | KILLED | chart-selection-21a1.test.js — chartSelection@1 is registered at exactly version 1 and grades semanti |
| X01 | a11y/selected-state | aria-pressed never reflects the selection | KILLED | DataChart.21a1.test.tsx — the keyboard list offers exactly the chart's targets; activation toggl |
| X02 | a11y/announcement | no selection announcement | KILLED | DataChart.21a1.test.tsx — the keyboard list offers exactly the chart's targets; activation toggl |
| X03 | a11y/fallback | engine failure does not open the data table | KILLED | DataChart.21a1.test.tsx — an engine failure shows the classified fallback with the data table op |
| X04 | a11y/figure | the figure is no longer named by its title | KILLED | DataChart.21a1.test.tsx — a figure named by the chart title and described by its description and |
| X05 | a11y/figure | the engine picture exposed to assistive technology | KILLED | DataChart.21a1.test.tsx — a figure named by the chart title and described by its description and |
| I01 | ai/policy | no policy = accepted | BUILD_ERROR → re-planted as I01b | — |
| I02 | ai/capability | charts accepted while the capability is off | KILLED | ai-composer-charts-21a1.test.js — with charts turned off, an AI chart is refused |
| I03 | ai/forbidden-raw | descriptor keys not closed (raw option tolerated) | BUILD_ERROR → re-planted as I03b | — |
| I04 | ai/provenance | illustrative data accepted without consent | KILLED | ai-composer-charts-21a1.test.js — invented (illustrative) data is refused without the teacher's |
| I05 | ai/provenance | illustrative data labelled as the teacher's | KILLED | ai-composer-charts-21a1.test.js — invented (illustrative) data is refused without the teacher's |
| I06 | ai/repair | teacher numbers not enforced | KILLED | ai-composer-charts-21a1.test.js — a changed teacher number is refused (classified, repairable)  |
| I07 | ai/capability | illustrative data on by default | KILLED | ai-composer-charts-21a1.test.js — invented (illustrative) data is refused without the teacher's |
| I08 | ai/capability | dataChart missing from the capability list | BUILD_ERROR → re-planted as I08b | — |
| B01 | bundle/eager | rich renderer imports DataChart eagerly | KILLED | DataChart.21a1.test.tsx — every chart surface is a literal lazy import; the bundle guard knows t |
| B02 | bundle/eager | DataChart imports the engine statically | KILLED | DataChart.21a1.test.tsx — the engine library is imported ONLY by the two lazy engine modules; th |
| B03 | bundle/eager | student renderer registered eagerly | KILLED | DataChart.21a1.test.tsx — every chart surface is a literal lazy import; the bundle guard knows t |
| C09b | contract/duplicates | duplicate labels accepted (compilable re-plant of C09) | KILLED | chartSpec.21a1.test.ts — structure: mismatched value counts, empty series, all- |
| C12b | contract/type | value count ≠ category count accepted (compilable re-plant of C12) | KILLED | chartSpec.21a1.test.ts — structure: mismatched value counts, empty series, all- |
| C17b | contract/allow-list | combo mark enum not enforced (compilable re-plant of C17) | KILLED (after its pin; SURVIVED first) | chartSpec.21a1.test.ts — enums are closed: animation / palette / legend / orien |
| D01b | selection/targets | missing values become datum targets (compilable re-plant of D01) | KILLED | chartSpec.21a1.test.ts — datum keys are seriesId/categoryId for present values only |
| I01b | ai/policy | no policy = accepted (compilable re-plant of I01) | KILLED | composerChart.21a1.test.ts — without a policy no AI chart is accepted (fail closed); malformed desc |
| I03b | ai/forbidden-raw | an extra `option` key tolerated in the descriptor (compilable re-plant of I03) | KILLED | ai-composer-charts-21a1.test.js — an engine option / markup smuggled in a descriptor fails clos |
| I08b | ai/capability | dataChart missing from the catalog's block list (compilable re-plant of I08) | KILLED | composerChart.21a1.test.ts — the catalog is V3, dataChart is an AI rich block of the 20D.1 vocabula |
| N01 | review | composite chart child falls back to raw JSON | KILLED | chartSelection.21a1.test.tsx — a composite chartSelection CHILD is reviewed on its chart too (the sam |
| N02 | contract/type | instruction label accepts bidi controls | KILLED | chartRules.21a1.test.ts — the chartSelection instruction label refuses explicit bidi controls li |
| N03 | contract/identity | chart id rule accepts prototype names | KILLED | chartSpec.21a1.test.ts — ids: stable ASCII ids only (no spaces, unicode look-al |

## 21. Independent review

⟨filled after the review rounds⟩

## 22. Known limitations

- **Student path carries the pure chart contract**: the rich-content validator, which the Student Portal has loaded statically since 20D.1,
  now validates `dataChart` blocks, so the ChartSpec validator (5.7 KB gzip, no rendering code) rides with it. The initial graph carries
  no chart code at all, and the Portal's static closure carries no renderer, engine, editor or selection code (both bundle-guarded).
- AI-authored answer surfaces: the AI Composer authors chart stimuli only; `chartSelection` questions are teacher-authored.
- AI combos use one value axis (the secondary axis is a teacher-editor feature).
- Heat-map cells are not V1 answer targets; there is no zoom / brush / data zoom (never part of an answer by design).
- The real-browser certification and the performance figures come from a scratch harness outside the repository (the repository has no
  committed browser test runner); the unit / integration suites pin the behaviours it exercised with a fake engine.
- The known flaky UI test `src/questionTypes/composite.20d.test.tsx` ("fixture A: the shared passage renders ONCE…") fails on the baseline as
  well; it is not touched by this phase.
