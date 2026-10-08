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

- **ChartSpecV1** (`src/charts/chartSpec.ts`): closed, versioned, bounded. Ten kinds cover the fourteen chart families of the directive (§4).
  Validation never throws; it rebuilds a canonical copy or returns classified issues. Missing values are explicit `null`, never 0.
- **Stimulus seam**: a new RichContentV1 block, `dataChart` (appended to the block vocabulary — an older reader refuses it, §14). It works
  everywhere rich content works: question stems, section / cover instructions, scenario `rich` sources and composite source contexts.
- **Answer seam**: a new question type, **`chartSelection@1`**, standalone and as a composite child. The student selects semantic targets
  (category / series / datum / point / bin) on the chart or in an equivalent keyboard list; the server grades target ids, never pixels.
- **Runtime**: `echarts@6.1.0` through modular imports only, SVG renderer, two lazy engine modules (common kinds / radar + box plot + heat
  map), never in the initial graph nor in the Student Portal's static closure (bundle-guarded, §17).
- **Authoring**: a table-like chart editor (no JSON, no engine vocabulary), conversions between kinds that never drop data silently, and
  the correct answer picked on the chart itself.
- **AI Composer**: catalog **V3**. The model fills a flat, closed chart descriptor; code maps it to ChartSpecV1 and the same validator decides.
  Teacher numbers are read strictly and checked against the request (§11 says exactly what is and is not verified); invented numbers need
  the teacher's explicit consent and are always labelled illustrative.
- **Certification**: compatibility freeze, acceptance exam through the real platform lifecycle (4 personas), adversarial matrix (77 cases),
  real-Chromium certification (student path, editor, 360 px, touch, keyboard, print, reduced motion), performance, mutation campaign.
- **Bundle**: initial budget unchanged (125 KB); initial graph 127,594 B gzip (baseline 127,309, +285 B of registration metadata
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
| `a788539` | design record |
| `2d0264c` | Review Fix 1 — the findings of the three independent review lanes (§21) |
| `d3bca6c` | Review Fix 1 mutation pin (mutant RA10, §20.1) |
| `b04cc37` | design record — Review Fix 1 mutation proof |
| `94cbfc1` | Review Fix 2 — the round-2 findings of the three lanes (§21) |
| `7447b17` | Review Fix 2 follow-ups found by the real-browser verification (value-axis slot, print centring, no redraw on width-only changes) |
| `aceeb57` | Review Fix 2 mutation follow-ups (a target-kind change never carries the key over; pins, §20.2) |
| `1780f2c` | design record — Review Fix 2 browser evidence and mutation proof |
| `5c12b52` | Review Fix 3 — the round-3 findings of the three lanes (§21) |
| `34bf0fc` | Review Fix 3 mutation follow-ups (starter-data conversions keep no key entry; pins, §20.3) |
| `e704272` | design record — Review Fix 3 browser evidence with the webfont and mutation proof |
| `804d810` | Review Fix 4 — the round-4 findings of the three lanes (§21) |
| `223698c` | Review Fix 4 mutation pins (§20.4) |
| `f4db489` | RU47's pin corrected; the engine's label-layout registration removed as redundant — a mistake, see `bb46b08` |
| `bb46b08` | the label-layout registration restored (the production build drops the core's own) and required by the bundle guard (§17, §20.4) |

Review-fix commits are described in §21.

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
| `histogram` | `bins[]` (`start`, `end`, `count`; contiguous, ascending) | x axis label + unit (the bins fix its extent), y axis, `valueLabels` | histogram |
| `radar` | `axes[]` (with `max`), `series[]` | — | radar |
| `boxplot` | `boxes[]` (five-number summaries, ordered) | axes | box plot |
| `heatmap` | `columns[]`, `rows[]`, `values[][]` (`null` = missing) | `unit`, `valueLabels`, axes | heat map |

Rules (all enforced by `validateChartSpec`, all pinned by tests):
- **Closed**: per-kind key allow-lists; any unknown key — `option`, `formatter`, `tooltip`, `graphic`, `dataset`, `renderItem`, `on*`, a
  style, an answer — is **refused** (never dropped). Own `__proto__` / `constructor` / `prototype` keys and ids are refused.
- **Text**: bounded prose; markup, script / data URLs, control characters, explicit bidi embeddings / overrides / isolates, C1 controls
  (U+0080–U+009F, e.g. U+009B / U+0085), line / paragraph separators, the interlinear annotation controls (U+FFF9–U+FFFB) and **every
  Unicode default-ignorable code point** (zero-width space, word joiner, BOM, soft hyphen, invisible operators U+2061–U+2064, the Mongolian
  vowel separator, Hangul fillers, the deprecated format characters U+206A–U+206F, variation selectors, tag characters, …) are refused —
  except ZWNJ / ZWJ (needed by Persian and Arabic), the LRM / RLM / ALM marks and the text / emoji presentation selectors U+FE0E / U+FE0F
  (Review Fix 2, round-2 finding N4: Review Fix 1 had listed a subset). Odd-but-harmless text (`{b}`, `<b>`, a plain URL) is kept as literal
  data (§19).
- **Never throws**: untrusted values are never coerced to strings (an object posing as a kind or a block type is reported by its type), and
  an outer guard turns anything unforeseen into `CHART_INVALID` — a validator that threw would take the sanitizer, finalization, grading
  and ingest down with it (review finding A1).
- **Numbers**: finite JSON numbers only (no strings, booleans, `NaN`, `±Infinity`); |v| ≤ 1e15; `-0` is stored as `0`.
- **Missing values**: explicit `null` only where the kind documents it (category series, heat-map cells); an all-missing series is refused.
- **Identity**: ASCII ids (letter first, ≤ 32, `[A-Za-z0-9_-]`) unique per namespace; labels unique (NFC, default-ignorables removed,
  whitespace-collapsed, case-insensitive) per namespace — two labels that differ only by an allowed invisible character (ZWNJ, ZWJ, LRM) are
  duplicates.
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
| rich document text (existing 20D.1 limit, 100,000 chars) | a chart counts its stored title, description and source — never the generated summary, so a wording change cannot change a stored document's validity (Review Fix 2, N6) |
| scenario source payload (existing 19G bound) | the same: a `rich` source's chart counts its stored prose, never the generated summary (Review Fix 3, round-3 finding R3-A6) |
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
| `partial` | `marks × |S ∩ K| / |S ∪ K|` — selecting every target `T` earns `marks × |K| / |T|`, full marks only when the key is every target |
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
  missing value (never 0); a typo stays on screen, is flagged `aria-invalid` with a text error next to the cell ("ليس رقمًا — لم يُحفظ",
  linked by `aria-describedby`) and a line in the editor's issue list naming the cell, and is never stored.
- Kind changes carry the data whenever the target can hold it (between category kinds; category ⇄ heat map; pie → category; …) and the
  authored context where the target has a place for it (the category-axis label, the value unit, value labels). A change that would discard
  data or context (reference lines, a value-axis label or bounds, a heat map's row-axis label, a combo's secondary axis) is reported lossy
  and asks first.
- A histogram's x axis takes a label and a unit only (its extent is fixed by the bins; bounds there were accepted but never drawn —
  review finding B-9).
- No JSON field and no engine vocabulary anywhere in the editor (pinned).

**Rich content**: "+ رسم بياني" adds a valid starter chart; duplicating a block gives the copy a fresh chart id; the block preview renders
through the same lazy DataChart.

**chartSelection editor** (`ChartSelectionEditor.tsx`, lazy registry edge): create the chart (kind → starter data → the chart editor) →
what the student selects (target kind, mode, bound, optional instruction) → the correct target(s) picked **on the chart itself** through the
same selection surface the student uses → scoring. One emission keeps the public config and the key mutually consistent (unsupported mode
adjusted, bound clamped, key entries of vanished targets dropped, a broken range cleared); the canonical validation is shown inline. A kind
change that cannot keep the data asks first (the same confirmation as the rich-content chart editor), and so does a change that keeps
every value but would clear the correct answer — its targets do not exist in the new kind, or the target kind changes (bar → radar: a
radar's only target is its series) — in ONE dialog naming both (Review Fix 2, N-3). Only the kinds a student can answer on are offered (no
heat map); the selection bound can be cleared while typing, and once a typed bound is clamped to the number of targets the field shows the
stored value (N-8).

Review Fix 3 (round-3 findings R3-A4, B3-3, lane C N8): every write goes through ONE resolution of the config and the key, and the
key-clearing warning is computed from that same resolution, so what the dialog says is what is stored — for a valid chart and for an
invalid one alike:
- key entries are pruned against the targets the chart's STRUCTURE holds, even while the chart is invalid (an emptied label, a histogram
  gap): a target deleted then is dropped from the key, so its id, reused by the next new target, never inherits the key;
- a kind change keeps a key entry only when the same target (same id, same label, same target kind) exists before and after, and keeps
  none when the conversion starts from starter data (bar → scatter, scatter → bar: the starter's ids and default labels, such as "s1" /
  "السلسلة 1", can recur with other data); the ONE dialog names both the data and the key ("ستُمسح الإجابة الصحيحة المحدَّدة …"; the wording for a
  partial removal, "ستُحذف من الإجابة الصحيحة العناصر …", is kept although no current conversion removes only part of a key — §20.3);
- a broken range is cleared only when the chart's order is known.

Review Fix 4 (round-4 finding R4-A2): a `datum` key entry is pruned only when its SERIES or its CATEGORY is gone. A value cell emptied to
retype it (an empty value is not a target of the valid chart) keeps its entry — after the chart's own order, counted toward the bound —
and while the cell is empty the canonical validation reports the key (`CHART_SELECTION_KEY_UNKNOWN_TARGET`), so the question cannot be
finalized with it; typing the value back makes the key whole again. Before, the entry was dropped silently and a student selecting both
intended answers scored 0.

## 10. Accessibility, RTL, animation, mobile and print

- **Figure**: `<figure>` named by the chart title (`aria-labelledby`) and described by its description plus a structural summary with
  Arabic counting ("رسم بالأعمدة — 12 فئة، سلسلة واحدة"); never a generic "chart" label. The engine picture is `aria-hidden`.
- **Text legend** (series colours as swatches + `<bdi>` labels), **text tooltip** (spans), **data table** behind a toggle (one header row,
  one row header per row, the category axis' label on the first column — y for horizontal bars —, every value column with its unit, the
  heat map's corner headed, unlabelled scatter points named by their coordinates as in the list, missing values marked "— (لا قيمة)"),
  opened automatically when the engine cannot load. When the engine MODULE cannot be imported, no retry is offered: Chromium keeps a failed
  module import for the life of the page, so a retry could never succeed (Review Fix 3, B3-5); the message says where the data is and what
  brings the chart back ("تعذّر تحميل الرسم البياني؛ البيانات كاملة في الجدول أدناه، ويُعرض الرسم بعد إعادة تحميل الصفحة."). A loaded engine
  that fails to draw keeps one retry. Focus moves to the figure (never to `<body>`); the page is never reloaded automatically.
- **Selection list**: one `aria-pressed` button per selectable target (same order as the chart), a polite live announcement that describes
  the difference the activation made — the items selected, the items deselected (a range that shrinks or moves, a single choice replaced),
  the limit when the activated item could not be added, or "unchanged" (Review Fix 2, N-5); nothing is emitted when nothing changed; an
  announcement identical to the previous one is re-mounted, so it is spoken again (Review Fix 3, B3-4) —, read-only review marks
  (✓ correct / ✗ incorrect / ○ missed; the "selected" tick never shows on a reviewed option), and the student's hint only on the student's
  own surface. A range keeps its anchor in both directions when trimmed to its bound.
- **RTL**: Arabic labels reach the engine wrapped in RLI…PDI isolates; a unit inside a label is wrapped in a first-strong isolate ("الحرارة
  (°C)", never "(C°)"), and a value with its unit is one left-to-right isolate in tooltips, pie labels and the heat-map scale ("-2 °C",
  never "C° 2-"; an Arabic unit follows the isolated number); categories keep data order on the x axis (charts are not mirrored); the shell,
  legend, list and table follow the page direction.
- **Heat map**: the colour scale names its lowest and highest value with the unit; a value label takes the colour with the better contrast
  against its cell, with a halo in the opposite colour where neither reaches 4.5:1 (the middle of the scale), so every label is ≥ 4.5:1.
- **Animation**: `none`, `subtle` (formal-exam default, 350 ms), `normal` (800 ms; teacher preview may upgrade `subtle`). Reduced motion and
  print always force `none`.
- **Mobile and mid widths**: width-only resize observer (one measurement per animation frame); under 480 px a compact layout (smaller text,
  no outside pie labels, legend wrapping). At ANY width, category labels wider than the slot each category has are rotated 45°, and a flat
  label never exceeds its slot. The slot is the plot width the value axes leave (each axis takes its widest value label or its name's gap;
  a combo's secondary axis takes its own) shared by the categories. Rotated labels whose neighbours would come closer than one LINE BOX
  (1.7 em, the webfont's ascent + descent; the perpendicular gap is the slot × sin 45°) are thinned by a step computed here — every n-th
  label, n = ⌈1.15 × line box / gap⌉ (a 15 % margin for the estimated slot) — not by the engine's own width estimate (Review Fix 3,
  B3-6); otherwise more than 12 categories let the engine thin the labels (the table, tooltip and list still name every one). The axis
  name sits below the rotated labels' reach (the longest label at its cap × sin 45°, plus two lines). Heat-map columns share the width
  the row labels leave beside the plot, and the heat-map height reserves room for rotated column labels (rows × 30 + 230 px, within
  300–950). A vertical category axis — horizontal bars, heat-map rows — has no horizontal slot: its labels keep their full width
  (Review Fix 2, N-2).
- **Truncation**: a label longer than its cap (rotated 104 px; flat up to 110 px, never wider than its slot; phones 64 px; pie labels
  140 px) is cut by MEASUREMENT — a canvas in the page's font, at grapheme boundaries (a letter keeps its harakat), ending in "…"; the
  engine's own truncation, which estimates every non-Latin character as a wide CJK glyph and cut Arabic labels to about half their cap,
  is used only where no canvas exists. A pie label cuts the name, never the value (Review Fix 3, B3-2). The full names are in the
  table, the tooltip and the selection list.
  Stage heights depend only on kind, data size and width class (no resize feedback loop). A width change re-applies the engine option only
  when the label layout changes; otherwise the engine only relayouts (Review Fix 2, N-6, §16).
  Review Fix 4 (round-4 finding B4-1): a cut never returns the uncut text — where not even "…" fits, the text is empty. A pie label whose
  value (with a long unit) leaves the name less than 40 px puts the value on a line of its own: name and value are each cut to the
  140 px box (the value keeps its isolate), and the label's line box is 1.75 em (the webfont's), so the two lines never overlap.
- **Radar** (Review Fix 4, B4-2): with the stage width known, the radius leaves each side room for the axis names (up to their cap,
  72 px on phones, 110 px otherwise; the radius shrinks to at most half its default) and the names are cut to the room left, so no name
  leaves the canvas; a radar lays out by width like the category charts. Without a width: the default radius and the engine's truncation.
- **Value labels** (Review Fix 4, B4-3): labels that would overlap another label are hidden (`labelLayout: { hideOverlap: true }`; the
  engine module registers the library's label layout itself — the core's own registration is an import side effect the production
  build drops — and the bundle guard requires it); the table, the tooltip and the selection list carry every value. Their boxes use
  the webfont's line box (1.7 em).
  The plot keeps room on its right for the widest one (half of it beside the last column, all of it beyond the end of a horizontal bar;
  histograms too) and, where half a slot does not cover half the first column's label, the value axis's labels step away from the plot
  by the rest. A rotated first category label rises toward the value axis's lowest label: that label steps 6 px further away. With
  value labels above vertical columns, a reference line's label moves beyond the plot's right edge — past the last column's label room,
  cut to 64 px on phones and 120 px otherwise, in a reserved margin; horizontal bars and charts with a secondary value axis keep it
  inside the plot (§22).
- **Late webfont** (Review Fix 4, B4-4): measured widths are cached per font and text; when a webfont finishes loading
  (`document.fonts` `loadingdone`) the cache is emptied and every chart lays its labels out again with the real widths (one shared
  listener for the page; the cache is bounded).
- **Print**: no animation; the figure never splits across pages. Nothing re-measures the stage and no animation frame runs before the print
  layout, so on `beforeprint` the engine takes the print-width layout (labels laid out for 640 px with the desktop rules, also when
  printing from a phone; no animation; the selection highlight kept), draws at 640 px wide and at the chart's own desktop height (the
  print layout's fluid box is never measured — Review Fix 3) and **paints immediately** (`EngineHandle.flush`: the engine otherwise
  repaints on its next animation frame, which never comes before the page is laid out — Review Fix 2, N-1 / N-4). While printing nothing
  replaces the print layout: the print media query turns the animation off, which changes the option, and that update is applied as the
  PRINT option again; the resize observer does not resize the engine (Review Fix 3, B3-1 — with the default `subtle` animation the screen
  layout came back at 640 px). On `afterprint` it takes the screen option and its container's width AND height again (a print height
  never outlives the print). The SVG carries a `viewBox` and the print stylesheet makes the engine box fluid and centres it, so the picture scales to (or
  sits centred in) the printed column. The tooltip, loading status, retry button and table toggle are not printed; the selection list
  prints in full (a printed copy shows every choice).

## 11. AI Composer (catalog V3)

- `AI_COMPOSER_CATALOG_V3`: `dataChart` joins the AI rich-block list; the prompt carries a "Charts:" contract line (kinds, bounds, data model,
  provenance rule, "never formulas, HTML, CSS, scripts, URLs, colours or rendering options"); combos share one value axis in AI drafts.
- The provider schema gives every rich block a `chart` field: `null`, or a flat closed descriptor (`kind`, `dataOrigin`, `title`,
  `description`, `categories`, `series[{label, values, mark}]`, `points`, `bins`, `boxes`, `xLabel`, `yLabel`, `unit`, `stacked`, `horizontal`,
  `donut`) — strict, `additionalProperties: false`, no engine vocabulary (pinned).
- Code maps the descriptor (`mapAiChart`): deterministic ids (`chart1`, `c1`, `s1`, …), code-owned provenance label in `source`, then the ONE
  chart validator. Refusals are classified and repairable within the existing bounded section repair: `AI_CHART_POLICY_MISSING`,
  `AI_CHART_DISABLED`, `AI_CHART_MALFORMED`, `AI_CHART_ILLUSTRATIVE_NOT_ALLOWED`, `AI_CHART_DATA_NOT_PROVIDED`, or the chart authority's code.
- **Teacher data** (`dataOrigin: "teacherProvided"`) — exactly what code verifies (review finding A2 / F2 corrected the earlier claim):
  - every number in the chart occurs in the teacher's request **with its written value and sign**: numbers are read strictly (Western,
    Arabic-Indic and Persian digits; "1,200" and "١٬٢٠٠" are 1200, never 1.2; "1,5" is 1.5; a "-" right after a digit is a range separator,
    so "10-20" gives 10 and 20, never -20; no absolute values);
  - where the request WRITES a category's value, a single-series chart or a pie (its first series) may not swap or shift teacher values:
    a category that carries ANOTHER category's written value is refused, and so is a written value left missing (`null`). A pairing is
    used only to detect that — it never requires equality (Review Fix 3, round-3 finding R3-A1; Review Fix 2 had required equality). A
    MISREAD pairing can still refuse a correct chart when the misread number is another category's value or the category's own value
    is empty (round-4 findings R4-A1 / C4-F1 showed such misreadings: the article "a" read as the label "A", a day after a month, a
    count before more words); Review Fix 4 makes each of those known misreadings pair nothing, and the refusal says the request SEEMS to
    give the value and asks the model to check it — never that the teacher wrote it. Pairings are read only where the writing is clear;
    an unclear phrasing pairs nothing:
    - a list of the chart's labels, in ANY order, followed by a value list of the same length pairs positionally ("Jan, Feb, Mar: 120,
      80, 95", "في يناير وفبراير ومارس: 120 و80 و95", "Jan / Feb / Mar = 120 / 80 / 95", "A, B, C: 50%, 30%, 20%", "Jan, Feb and Mar: 120,
      80 and 95"); "and" / «و» separate items, never a unit; nothing in parentheses comes between the two lists (R3-A3, R3-A5);
    - and a label — a whole word (one Arabic proclitic و ف ب ل ك allowed: "وفبراير", "بيناير") — pairs with the ONE number right
      after it ("يناير ١٢٠", "Jan: 1,200", "Jan 120 mm") when its clause (up to . ! ? ؟ ; ؛ , ، a line break or another label) holds no
      other number and the value ENDS the clause: after the number and its unit only the clause's end, or — before the next label —
      spaces, "and" / "then" / «ثم» or a proclitic glued to the label ("Jan 120 and Feb 80", «يناير 120 وفبراير 80»); "on Mar 3 the
      site closed" and "C 2 absent students" pair nothing (Review Fix 4, C4-F1);
    - BOTH forms are read: a label that the lists and its own number pair with two different values pairs nothing («أ، ب، ج: 30، 25، 28
      … الناجحون: أ 25، ب 20، ج 22» — Review Fix 4, R4-A1);
    - the one-letter labels that are also English words ("A", "I") pair only after ":" / "=" ("A: 6") or inside a label list; "for a 30
      student class" is not the label "A" (R4-A1);
    - a whole number 1–31 after a month name (English, Arabic, Levantine) followed by a word is a day of the month, never the month's
      value ("Mar 3 days", «مارس 3 أيام» — C4-F1);
    - never a pairing: a label glued to digits (Q1 / Q10), a label inside a word («ب» in «الطلاب»), an ordinal ("Jan 15th: 120"), a number
      followed by another number or a range ("120-130", "120 to 130", «120 إلى 130»), a second number in the clause — a year included
      ("January 2024 sales were 120", "Jan 2000 (up 5%)" pair nothing: the year heuristic of Review Fix 2 is gone, so four-digit values
      such as "Jan 2000, Feb 1950" pair like any other), an item of a value list, a label written with two different numbers;
    - labels match case-insensitively after NFKC (fullwidth and Arabic presentation forms), without invisible characters or tatweel; an
      en / figure dash before a digit is a minus; a decimal written without a leading digit keeps its point (".5", «٫5», "-.5" —
      R3-A2); a comma list without spaces whose groups are not all three digits long ("120,80,95", "1,200,30") is a list, never
      decimals or one thousands number; fullwidth digits ("１２０") read like ASCII digits, in the number check as in the pairing
      (Review Fix 4, R4-A6);
    - the refusal never states a value (the pairing is a check of what the teacher wrote, not a value for the model to copy).
  - a teacher-data chart's title and description state no number that is not in the request.
  - a pie descriptor's first series holds exactly one value per category; an extra value is refused (`AI_CHART_MALFORMED`), never dropped
    (Review Fix 4, R4-A5).
  - **Not verified**: the association of values with categories in multi-series charts; a value that is another number of the request but
    no other category's ("Jan 120, Feb 80, total 95" drawn as Jan = 95 — not a swap), including a qualifier written for every category
    and drawn as every category's value ("January 2024 sales were 120, February 2024 sales were 80" drawn as 2024 and 2024 — refused by
    Review Fix 2's year rule, which also refused correct charts, §18); pairings the request does not write in the forms
    above — year-qualified or otherwise unclear phrasings (unpaired by design), a number written before its label ("120 for January"), an
    abbreviation of the label ("Jan" for a category "January"), Arabic spelling variants (hamza forms, harakat), numeric labels ("2022:
    120"), a value list separated by spaces only ("120 80 95"), space-grouped thousands ("1 200"), a two-group comma list ("120,80" reads
    as 120.8 under the decimal-comma rule); numbers inside category, series or axis labels and units; labels the model REWRITES
    (a translation, «ال» added or removed, two proclitics «وبفبراير») — they no longer match the request, so they pair nothing; a chart
    that leaves out a category the request lists (the remaining values can be shifted); value lists whose units are longer than six
    characters ("30 students, 25 students": such a list pairs nothing); a day of the month or a count that ends its clause ("closed on
    Mar 3.") — it pairs, and a correct chart that leaves that month empty is refused (the refusal asks the model to check the request);
    a whole number 1–31 after a month name followed by ANY word, a unit included ("Aug 3 mm", «أغسطس 3 ملم»), reads as a day and pairs
    nothing, so small monthly values are not checked.
    The AI result is always a draft the teacher reviews before applying it (Review Fix 4, R4-A3).
- AI charts appended or prepended to a stem that already holds a chart receive the next free chart id (an id collision would block the
  draft — review finding A4); charts inside a `columns` block count as taken and incoming charts inside columns are renumbered too, and
  every kept or renumbered incoming id is reserved for the next incoming chart (Review Fix 2, N3 / N5).
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
`scripts/generate-data-charts-21a1-fixture.mjs` with the builder `scripts/data-charts-21a1-exam.mjs`; the committed file is pinned
byte-for-byte to the builder's output by `api/tests/certification-21a1/cert-21a1-fixture-drift.test.js`): schemaVersion 2, sections A–D, 40 marks.

| Section | Content |
|---|---|
| A — monthly rainfall | ONE 12-month chart in a scenario source read by four questions: MCQ (wettest month), numeric (January), chartSelection multiple / partial (months > 100 mm), chartSelection range (the dry run May–September) |
| B — time series | line chart with a missing value (MCQ: lowest minimum), chartSelection datum (highest maximum), stacked area (numeric total) |
| C — scatter / distribution | scatter point selection (the outlier: neutral point ids `p1`–`p4`, no label naming the answer — key `p2`), histogram bin selection (modal class) |
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
  exam fixture, rich content, import / export / canonical save, finalization, student projection and grading (blank, and a deterministic set
  of VALID synthetic answers in the real answer shapes — correct, half-correct and wrong answers by position, 121 answers over the corpus;
  19 of the 27 fixtures grade differently from blank; the other 8 are answered only by simulations, parametric values the synthetic "1"
  misses, wrong answers or open responses — each graded like blank) are
  byte-for-byte the baseline (the synthetic set was corrected and the pins recaptured on the baseline in Review Fix 1, finding F1);
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

Review Fix 1 (same harness, a page of the review cases, built against `a788539` and against the fixed tree):

| Check | `a788539` | Review Fix 1 |
|---|---|---|
| print: beforeprint → print media → 718 px column, ResizeObserver frozen (as while printing) | SVG 1222 px wide, its right edge 549 px past the figure (right part of every chart lost) | SVG drawn at 640 px with `viewBox`, inside the figure (33 px margin); 1222 px again after `afterprint`; `page.pdf()` without error |
| 12 labels "محافظة الفروانية N" at 1280 / 800 / 600 px | flat, 11 / 11 / 11 neighbouring labels colliding | rotated, 0 / 0 / 0 collisions (perpendicular gap between baselines ≥ one line), full text shown |
| scatter axis name "الحرارة" + unit °C (glyph positions) | "°" drawn right of "C" → "(C°)" | "°" left of "C" → "(°C)" |
| tooltip "الدنيا: -2 °C" (glyph positions) | minus right of the digit, "C°" | minus left of the digit, "°C" |
| heat map 0…100 with value labels | no scale text; the 55 cell's label without halo | scale "0 زيارة" / "100 زيارة"; the 55 cell's dark label with a white halo |

Review Fix 2 (the round-2 lane B harness, copied into the implementer's scratch area and run unchanged against `b04cc37` and against the
Review Fix 2 tree; ten review charts: 12 long / mixed / upper-case / very wide labels, 6 very long labels, horizontal bars × 12 and × 20, an
8-category combo with two value axes, a 10 × 12 heat map):

| Check | `b04cc37` | Review Fix 2 (`7447b17`) |
|---|---|---|
| **real `page.pdf()`** A4 / Letter / A5 / A4 landscape, rendered with pdf.js and inspected | the chart is drawn for the 1222 px screen inside the 640 px box: half of the bars and the axis name cut off ("افظة") | every chart complete: all bars, all labels, axis names; centred in the landscape column |
| simulated print (beforeprint, print media, A4 / Letter / A5 / landscape column, ResizeObserver frozen) | combo: 7 colliding labels (screen layout in print) | 0 collisions on every chart and size; SVG 640 px inside the figure |
| label geometry at 1280 / 1024 / 800 / 600 / 360 / 320 px (perpendicular gap of rotated neighbours) | 320 px: 11 + 11 + 11 + 11 + 7 collisions; horizontal-bar and heat-map row labels truncated to "مح…" at ≥ 600 px | 0 collisions at every width; vertical-axis labels in full; remaining truncation is the designed cap (rotated 104 px / phone 64 px, full names in the table and tooltip) |
| one live page resized 1280 → 1024 → 800 → 600 → 360 → 320 → 360 → 600 → 1280 | — | every step identical to a fresh load at that width (0 differences, 0 collisions) |

Review Fix 3 (the same harness extended to the round-3 cases, built against `1780f2c` and against the Review Fix 3 tree; the page's
webfont (IBM Plex Sans Arabic) loaded and awaited; charts at the formal-exam default animation `subtle`; 24 review charts on the screen
page — 12 long / mixed / upper-case / very wide labels, 5 and 6 very long labels, horizontal bars × 6 / 12 / 20, combos with two wide value
axes (8, 10 and 12 categories), heat maps with long row labels, box plots, a histogram, a scatter, a pie, negative values — and 11 of them
on the print page). Geometry is measured in the SVG's own user space: two labels "touch" when their text boxes (`getBBox`: the webfont's
ascent + descent) intersect by more than 0.5 px; a name hit is an axis name crossing a label; clipping is text outside the SVG.

| Check | `1780f2c` | Review Fix 3 (`5c12b52`) |
|---|---|---|
| **real `page.pdf()`** A4 / Letter / A5 / A4 landscape with `subtle` animation, printed from 1280 px (11 charts) | the screen layout came back at 640 px once the print media query switched the animation off: combo 7 and histogram 11 touching labels on every format | the print layout stays: 0 touching labels, 0 name hits, 0 clipped texts on every format; SVG 640 px |
| the same printed from a 360 px phone | the phone layout was printed (phone heights 320 / 280 px, 64 px label caps, a pie without labels) | the desktop print layout (desktop heights 340 / 432 / 530 / 320 px …, 104 px caps; the pie's labels and the selection highlight are pinned by `DataChartReviewFix3` RB1e); 0 touching, 0 name hits, 0 clipped |
| after printing (width × height against a fresh load at the same width) | — | identical for 11 / 11 charts at 1280 and at 360 px (a first Review Fix 3 build kept the print height — 340 instead of 320 px on the phone — caught here and fixed fail-first: `echartsEngine.21a1` RB1c) |
| label geometry with the webfont at 1280 / 1024 / 800 / 600 / 360 / 320 px | 360 px: 11 touching pairs in each of 7 twelve-label charts, 7 in the 8-label combo, a heat-map axis name on its labels; 320 px: 7 + 2 touching and the name hit; 600 / 800 px: 4 touching rows of rotated heat-map columns | 0 touching, 0 name hits, 0 clipped, no page overflow at every width; on phones every 2nd or 3rd rotated label is drawn (the table, tooltip and list name every one) |
| truncated labels (rendered width of the cut text) | Arabic labels cut to about half their cap: 45–63 px of 104 / 110 at 1280 px, 28–36 px of 64 on a phone ("محاف..."); Latin labels 95–106 px (the engine's estimate fits Latin) | Arabic and Latin labels cut by measurement to their cap: 95–100 px of 104 (rotated), 103–110 px of 110 (flat), 56–64 px of 64 (phones), ending in "…" |
| console errors | one resource 404 of the harness page at 1280 px | the same single 404, nothing else |

Review Fix 4 (round-4 lane B's harness, copied into the implementer's scratch area and extended with the round-4 cases; built against
`e704272` and against the Review Fix 4 tree; webfont loaded and awaited unless stated; `subtle` animation; viewport widths 320 / 360 /
600 / 1024 / 1280 px). The round-4 cases: four pies with long names and long units («طالب وطالبة», «ألف دينار كويتي سنويًا», Latin names),
radars with six skill names and with long names, a bar chart with value labels on 1,234,567-scale values and a 45-character reference
line label, and the 30 / 60-category and combo charts.

| Check | `e704272` | Review Fix 4 (`bb46b08`) |
|---|---|---|
| pie labels with value labels (rendered width of each line; overlap with the pie) | 207–326 px wide (box 140 px); at 600 px drawn 18–80 px into the pie and over one another (2 pairs, 18–19 px) | every line ≤ 139.4 px; 0 px into the pie and 0 overlaps at every width |
| radar axis names | outside the canvas at 320 / 360 / 600 px (x from −109 px to 567 px on a 542 px canvas; up to 8 names per chart) | 0 clipped at every width |
| value labels and a long reference-line label | 12 / 12 / 2 overlapping text pairs at 320 / 360 / 600 px (value labels over one another and over the value axis's labels; the reference label over value labels and over an axis label, up to 16 px); the last value label cut by the canvas edge at 320 px | 0 overlaps, 0 clipped: overlapping value labels hidden, the reference label beyond the plot's right edge |
| the value axis's "0" against the first rotated category label (30 / 60 / 12 categories) | 0.6–2.0 px overlap at 320 / 360 / 600 px | 0 |
| all charts, all five widths: touching labels / name hits / clipped texts / page overflow | the rows above | 0 / 0 / 0 / 0 |
| real `page.pdf()` A4 / Letter / A5 / A4 landscape, printed from 1280 and from 360 px | — | 0 touching, 0 name hits, 0 clipped on every format; after printing every chart is identical to a fresh load (state and geometry: 0 differences) |
| the webfont arriving 6 s after the page (charts drawn first with the fallback font's widths), measured after it loaded | Arabic labels stay cut for the fallback font: 73.7–97.2 px of their 104 / 110 px caps (12 Arabic labels at 78.8 px of 104 px — lane B's figure) | re-measured: the same widths as with the font awaited (96.5–110 px of 104 / 110 px) |
| console errors | the harness page's single 404 | the same single 404 |

Verifying B4-3 in this harness found overlaps beyond the reviewer's report — the first column's value label over the value axis's
labels ("1200000" / "1234567"), the reference label over an axis label, and the value axis's "0" against the first rotated category
label (all on `e704272` too); they are fixed in `804d810` with fail-first tests (`chartReviewFix4` RB23, §18). The same harness caught a mistake of the follow-up commit
`f4db489`, which dropped the engine's label-layout registration as redundant: adjacent value labels overlapped again (5.6 px at 320 / 360 /
600 px); `bb46b08` restores it, and the table's Review Fix 4 column is measured on `bb46b08`.

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

**Resize cost** (round-2 finding N-6; the reviewer's probe: 13 charts on one page, 20 viewport changes of 7–26 px around 1280 px, Chrome
DevTools `ScriptDuration`, three runs each):

| Tree | Script time (s) | Task time (s) |
|---|---|---|
| before Review Fix 1 (`a788539`) | 1.64 / 1.67 / 1.73 | 3.15 / 3.15 / 3.28 |
| `b04cc37` (the width is an option input: every step re-applies every option) | 3.36 / 3.62 / 3.83 | 5.04 / 5.34 / 5.71 |
| `94cbfc1` (layout width in 32 px steps) | 2.84 / 2.89 / 3.06 | 4.37 / 4.43 / 4.62 |
| `7447b17` (an option is re-applied only when the label layout or another input changed) | 1.67 / 1.73 / 1.84 | 3.17 / 3.25 / 3.30 |

Review Fix 3 cuts labels by canvas measurement (a few `measureText` calls per cut label per drawing). The same probe, both trees measured in
one session with the formal-exam default animation `subtle` (the rows above used another session; compare within a table only):

| Tree | Script time (s) | Task time (s) |
|---|---|---|
| `1780f2c` | 1.96 / 2.02 / 2.01 | 3.42 / 3.48 / 3.47 |
| Review Fix 3 | 1.89 / 2.03 / 1.96 | 3.30 / 3.47 / 3.40 |

Round-4 lane B measured +12 % script time on a page where most labels are cut (0.93–1.04 s against 0.76–0.93 s); it was not raised as a
finding. Review Fix 4 caches measured widths per font and text (at most 4,000 entries; emptied when a webfont finishes loading) and adds
the engine's label layout for value labels. The same resize probe, both trees in one session:

| Tree | Script time (s) | Task time (s) |
|---|---|---|
| `e704272` | 1.90 / 1.96 / 1.85 | 3.29 / 3.36 / 3.19 |
| Review Fix 4 (`804d810`) | 1.82 / 1.73 / 1.94 | 3.11 / 2.98 / 3.29 |

## 17. Bundle (directive §38)

Measured on a production build (`npm run build`, gzip level 9, `scripts/check-bundle-budget.mjs`); baseline = `ff13899`; head = the Review
Fix 4 tree (`bb46b08`; the review fixes added ~0.5 KB to the shared contract, ~1.5 KB to the lazy chart chunks below and 3.0 KB to the
engine chunk — the label layout —, included; round-4 lane B's note that the record dated these figures to `5c12b52` is answered here).

| Item | Baseline | Head |
|---|---|---|
| Initial graph (index.html entry + static imports) | 18 files, 127,309 B gzip | 18 files, 127,594 B gzip (budget 125 KB = 128,000 B, unchanged) |
| Chart code in the initial graph | — | **none** (guard: any chart / engine signature in an initial file fails the build) |
| Chart code in a no-chart student's first-load graph | — | **No** renderer, engine, editor or selection code in the initial graph or the Student Portal's static closure (guarded). The Portal closure (22 → 23 files, 86,684 → 93,145 B gzip) gains the pure ChartSpec validator (`chartSpec`, 6,151 B gzip) and the renderer's `dataChart` case (~0.2 KB) through the rich-content modules it has loaded since 20D.1 (§22). |
| Common chart runtime (ECharts core shared chunk + engine module) | — | 185.2 KB gzip (131.9 + 53.3; Review Fix 4's label layout +3.0 KB), budget 195 KB, lazy behind DataChart's `import()` |
| Advanced kinds (radar, box plot, heat map) | — | +17.7 KB gzip, budget 22 KB, lazy |
| DataChart first paint (figure, list, table, adapter) | — | 5 files beyond the initial graph, 18,446 B ≈ 18.0 KB gzip (DataChart 9,983 B) |
| Chart editor | — | ChartEditor 6,338 B gzip (14,576 B with its closure) |
| chartSelection editor | — | 3,023 B gzip (34,882 B with its closure: DataChart, ChartEditor and the confirmation dialog) |
| Student renderer / teacher review | — | 0.6 / 0.8 KB gzip (625 / 803 B; + DataChart on demand) |
| AI Composer delta | 33 files, 182,742 B gzip | 36 files, 193,930 B gzip (+11,188 B ≈ 10.9 KB: ChartSpec 6,151 B, the chartSelection model through the shared finalization, the chart helpers, the composer dialog with catalog V3 and the chart descriptor) |

Guards added to `scripts/check-bundle-budget.mjs` (each shown to fail on a planted defect in a copy of `dist`: an engine signature in an
initial file, a static engine import from DataChart, chart code in the Student Portal, an oversized advanced chunk): signatures never
initial nor in the Portal's static closure, every signature present in some chunk, the engine only behind DataChart's dynamic edges, and the
two lazy budgets. `src/charts/DataChart.21a1.test.tsx` pins the guard's rules and every lazy import literally (mutants B01–B03). Review
Fix 4 adds one more: the common engine graph must carry the label layout (`addLabelsOfSeries`; it failed on the `f4db489` build, §20.4),
pinned in `chartReviewFix4` RB25.

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

Review Fix 1 (§21) — every new test was run on `a788539` (the reviewed head) in a detached worktree before being kept:

| Findings | Suites | On `a788539` |
|---|---|---|
| A1 throw, A2 AI numbers, A3 invisible controls, A4 AI chart ids | `cert-21a1-adversarial` (9 refused rows + ADV6), `chartRules` R3, `composerChart` AI3 / AI5 / AI6 | 19 fail (`TypeError: Cannot convert object to primitive value`; U+009B / U+0085 / U+2028 / U+200B / U+FEFF / U+206E / U+FFF9 accepted; "1,200" read as 1.2; `pairedNumber` missing; duplicate id `chart1` blocks an append) |
| B-1 … B-15 rendering / UX / bundle, the validator guard (R4) | `chartReviewFix1`, `DataChartReviewFix1`, `DataChartRetry`, `ChartEditorReviewFix1`, `echartsEngine.21a1`, `chartRules` R4 | 35 fail, 9 pass (pins of unchanged behaviour, e.g. the student's own hint) |
| F3 / F4 acceptance fixture | `cert-21a1-fixture-drift` | 2 fail (no builder; the answer point labelled "قيمة شاذّة") |
| F1 freeze adequacy | `cert-21a1-compat-freeze` (valid synthetic answers, recaptured on the untouched baseline) | a pin by design (captured on `847fa9e` = `ff13899` code); its adequacy is proven by mutant RC01 (§20) |
| F5 `composite.20d` timing | `src/questionTypes/composite.20d.test.tsx` | 3 of 8 runs failed before the fix, 0 of 12 after (§22) |

Review Fix 2 — the new and changed tests were run on `b04cc37` (the round-2 head) in a detached worktree before being kept, and the
browser follow-ups on `94cbfc1`:

| Findings | Suites | Result on the earlier head |
|---|---|---|
| N1 / N2 / N5 pairing, N3 nested ids, N6 size, N4 invisible characters | `composerChart` AI3 / AI5 / AI7 / AI8, `richContentChart` RC1, `chartRules` R5 | on `b04cc37`: AI7 5 fail (`pairedNumbers` missing, list / qualifier / comma-list readings), AI8 nested 1 fail (duplicate `chart1`), AI5 2 fail (the year qualifier; the comma-list reading), RC1 size 1 fail (the exact-limit document refused), R5 2 fail (U+2061 … tag characters accepted; look-alike labels distinct) |
| N-1 / N-4 print, N-2 vertical axes, N-5 announcements, N-3 key-clearing confirmation, N-7 thinning, N-8 bound | `DataChartReviewFix2`, `echartsEngine` RB1c, `chartReviewFix2`, `ChartEditorReviewFix2`, `DataChartReviewFix1` RB8 | on `b04cc37`: 13 fail (`[resize(640)]` instead of update → resize → flush; `h.flush is not a function`; announcements "تم تحديد: مايو" for a shrink; width 24 / 46 instead of 110; interval 0 instead of "auto"; no dialog; "20" shown) |
| value-axis slot, print centring, redraw on width-only changes (found in Chromium) | `chartReviewFix2` RB5c, `chartReviewFix1` print pin, `DataChartReviewFix2` RB17 | on `94cbfc1`: 3 fail (interval 0; the CSS rule; `['resize()', 'update']`) |
| a target-kind change carried the key over (found by mutant RS41, §20.2) | `ChartEditorReviewFix2` RB3c | on `7447b17`: 1 fail (the key stayed `['jan']`) |

In all, 28 tests failed on the earlier heads (24 of the `94cbfc1` tests on `b04cc37` — the round-3 count; the implementer's first run, before
the AI5 pins were added, recorded 23); 5 new tests passed there and are pins of unchanged behaviour (allowed invisible characters,
kind changes that keep the key, room for every rotated label, the description-number and sign pins X3 / X4 / X8, several incoming charts),
and lane C's C2-1 assertions are pins too (U+2060 / U+206A–U+206F / U+FFF9–U+FFFB refused, numbers in a description, the first series of a
multi-series pie descriptor, a four-digit group): the behaviour held on `b04cc37`; they kill lane C's six surviving mutants (§20.2).
One Review Fix 1 expectation was corrected, not weakened: `DataChartReviewFix1` RB8 pinned "بلغت الحد الأقصى (3)؛ لم يُحدَّد: فبراير" for a
range that WAS extended by two months — the incomplete announcement that round-2 finding N-5 reports; it now expects
"تم تحديد: أبريل، مايو؛ بلغت الحد الأقصى (3)؛ لم يُحدَّد: فبراير".

One earlier expectation changed with A2 and is not a weakening: `composerChart` AI3 pinned `numbersInText` returning `3` for the
teacher's `-3` (an absolute value) — the defect itself; it now expects the strict reading. A second one changed with Review Fix 2 (N1):
AI5's year qualifier expectation went from "no pairing" to `120` (the qualifier rule of Review Fix 2; Review Fix 3 removed that rule again,
below).

Review Fix 3 — the new and changed tests were run on `1780f2c` (the round-3 head) in a detached worktree: of the 81 tests in the 9 files,
**40 are new or changed: 32 fail there, 8 are pins** (the other 41 are unchanged tests of those files; round-4 finding C4-F8 corrected the
earlier "32 fail, 49 pass").

| Findings | Suites | On `1780f2c` |
|---|---|---|
| R3-A1 / A2 / A3 / A5, lane C N1 / N3 (pairing, leading-dot decimals, any-order lists, "and", missing values, four-digit values) | `composerChart` AI9 | 5 fail (the correct chart refused for "School A 2000 students in 40 classes, …"; ".2 / .3 / .5" read as `[2, 3, 5]`; a list in another order and an "and"-joined list unpaired; "Jan 2000, Feb 1950, Mar 2050" unpaired) |
| the pairing redesign (changed expectations, below) | `composerChart` AI5 / AI7 / AI9 | 3 fail (the year qualifier paired `120`; the year-qualified phrasings paired; "Jan 120, Feb 80, total 95" drawn as Jan = 95 refused) |
| R3-A6 scenario payload | `richContentChart` RC1 | 1 fail (the generated summary counted toward the bound) |
| R3-A4 / B3-3 / lane C N8 key resolution | `ChartEditorReviewFix3` RB3d / RB3e | 5 fail (the deleted bin's / category's key kept and inherited by the reused id; the starter series inheriting a series key; dialog and stored key disagreeing for invalid charts — e.g. bar [-5, -3, -1, 0] → pie warned while keeping `c1`) |
| B3-1 print with `subtle`, B3-4 repeated announcement | `DataChartReviewFix3` RB1d / RB8c | 2 fail (`["update", "resize(640)", "flush", "update"]` — the screen option after the media change; the live text not re-mounted) |
| B3-5 import failure | `DataChartRetry` | 1 fail (the retry button offered; "تعذّر عرض الرسم البياني" instead of the reload message) |
| B3-2 measured truncation, B3-6 thinning / axis name / heat map | `chartReviewFix3` RB18 / RB20, `echartsEngine` RB1c | 9 fail (no measured cut; interval "auto"; fixed name gaps 58 / 90; heat-map columns at the default reserve; heights 240–870; `resize(width, height)` missing) |
| the thinning representation (see below) | `chartReviewFix2` RB5c, `chartReviewFix3` RB19 C3-28 / C3-29 | 6 fail ("auto" where a computed step is now expected) |
| pins of unchanged behaviour | `chartRules` N4 duplicates and E10 (every C1 control), AI9 R3-A7, `DataChartReviewFix3` RB1e (print from a phone uses the desktop rules and keeps the selection highlight), RB19 C3-31 (vertical axes never rotate) | pass |

The mutation follow-ups (`34bf0fc`, §20.3): `ChartEditorReviewFix3` RB3g (a conversion from starter data keeps no key entry) failed on
`5c12b52` — the dialog announced a partial removal and kept `s1`; the nine mutation pins (`composerChart` AI9, `DataChartReviewFix3`
RB1f, `DataChartMeasure`, `ChartEditorReviewFix3` RB3f) pass there: they are pins of the committed behaviour.

Changed expectations (each a design change requested by a round-3 finding, none to match a defect):
- **The pairing only detects swaps** (R3-A1, lane A's recommended fix): a misread pairing no longer refuses a correct chart, and the year
  heuristic is gone. Three expectations follow: AI5 "يناير 2024: 120، فبراير 2024: 95" now pairs nothing (was `120`); AI7's year-qualified
  phrasings pair nothing (`[undefined, undefined]`; their correct charts are still accepted); and AI7's refusal of the year written as
  every category's value (`[2024, 2024]` for "January 2024 sales were 120, February 2024 sales were 80"; also the Arabic and "(2023)"
  forms) was **removed** — under swap-only semantics that chart is not detected (no category carries another category's written value).
  This is a deliberate loss of detection, listed in §11 "Not verified"; the round-2 rule that caught it also refused correct charts
  ("School A 2000 students in 40 classes …" accepted `[40, 1500]` and refused the correct one). AI9 adds the companion case
  "Jan 120, Feb 80, total 95" drawn as Jan = 95: accepted (not a swap), Jan = 80 refused (Feb's value).
- **Thinning is a computed step, against a stricter metric**: RB5c / C3-28 / C3-29 expected the engine's `interval: "auto"` for dense
  rotated labels; they now expect an integer step ≥ 1. RB5c's widths moved with the metric (touching is now one line box, 1.7 em, instead
  of one em + 2 px, so thinning starts on wider stages): the combo and the wide-value bar are checked at 288 px instead of 256 / 224, and
  the twelve months at 352 px are now thinned (were drawn in full). Every stage that thinned before still thins (1.7 em > 1 em + 2 px at
  both font sizes).
- **The import failure has no retry** (B3-5): the Review Fix 1 test "(2) the import fails once: retry re-imports and draws" is removed —
  in Chromium a failed module import is kept for the life of the page, so that retry could never succeed; the test was passing only
  because the test runner's module mock behaves unlike a browser. A throwing mount keeps its retry (`DataChart.21a1` DC2).

Review Fix 4 — the new and changed tests (7 files, 80 tests on the Review Fix 4 tree) were run on `e704272` (the round-4 head) in a detached
worktree: **36 are new or changed: 17 fail there, 19 are pins**; the other 44 are unchanged tests of those files.

| Findings | Suites | On `e704272` |
|---|---|---|
| R4-A1 word labels and both pairing forms | `composerChart` AI10 R4-A1 (a) / (b) | 2 fail (`[30, 12, 6, 4, 2]` for "for a 30 student class. A had 6, …"; `[30, 25, 28]` for the class sizes listed and the passes written per class) |
| R4-A5 pie value count, R4-A6 fullwidth digits | `composerChart` AI10 | 2 fail (an extra pie value accepted: `ok`; "Jan １２０, Feb ８٠" read as `[0]`) |
| C4-F1 a value ends its clause, the day of the month, the refusal wording | `composerChart` AI11 | 2 fail (`[120, 80, 3]` for "… on Mar 3 the site closed …"; the refusal said «… ما كتبه المعلم …») |
| R4-A2 datum retype | `ChartEditorReviewFix3` RB3h | 1 fail (the key `['s1/c1']` after retyping March — `s1/c3` dropped) |
| B4-4 late webfont | `DataChartMeasure` RB18c | 1 fail at its first assertion: no measurement cache (the same label measured again: 8 canvas calls instead of 7), and no listener for `loadingdone` |
| B4-1 pie labels | `chartReviewFix4` RB21 | 1 fail (the label for «طالب وطالبة» on one line instead of two, its name uncut) |
| B4-2 radar names | `chartReviewFix4` RB22 | 3 fail (the radius a percentage string, not fitted; the radar not part of the width layout) |
| B4-3 value labels, the reference-line label, the axis gaps | `chartReviewFix4` RB23 | 5 fail (no `labelLayout`; `grid.right` 12 instead of ≥ 25; the reference label `insideEndTop`; no value-axis label gap; no gap beside a rotated first label) |
| pins of unchanged behaviour | `composerChart` R4-A4 / C4-F3 pins and the renamed AI3 / AI5 / AI9 tests, `ChartEditorReviewFix3` (deleting the category drops the datum entry; the invalid-conversion dialog), `DataChartMountRetry` (C4-F2: both tests), `DataChartMeasure` (the screen and print options), `DataChartReviewFix3` RB1e (C4-F10: the precondition now asserted), `richContentChart` (C4-F5: the stored prose computed independently), `chartReviewFix4` RB21 (one-line labels), RB23 (inside placements) and RB24 (C4-F4 / C4-F6: the isolate, the chart font, the heat-map reserve cap) | pass |

The pins are adequate where a mutant shows it: lane C's surviving mutants are re-planted in §20.4 (RU51–RU59).
The bundle guard's label-layout check (§17) was run fail-first too: it fails on the `f4db489` build ("the chart engine (common kinds)
carries no label layout") and passes on `bb46b08`.

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
an external image URL; an answer smuggled inside the chart; unknown kind; future version; and (Review Fix 1) a kind that is an object with
a non-callable `toString` / `valueOf`, a C1 CSI (U+009B), NEL (U+0085), a line separator (U+2028), a zero-width space look-alike, a BOM, a
deprecated format character (U+206E) and an interlinear annotation control (U+FFF9).

**Exotic chart JSON never makes an authority throw** (Review Fix 1, ADV6 — the chart and rich-block paths; older coercions elsewhere,
e.g. an object posing as a section title, predate this phase and are outside its scope): a kind `{"toString":1}` (and `{"toString":1,"valueOf":1}`) in a stem
chart AND a chartSelection config goes through the sanitizer, client and server finalization, grading (the MCQ next to it still scores 2;
the broken chart question 0 with teacher review), draft ingest and structured import without an exception; a rich block whose type is such
an object is refused with `RICH_CONTENT_BLOCK_TYPE` (that coercion predates this phase — 20D.1 — and was fixed with it).

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

**Implementation campaign: 82 distinct planted defects, 81 KILLED, 1 equivalent (C11), 0 unexplained survivors** (Review Fix 1: §20.1). Survivors were closed with pins:
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

### 20.1 Review Fix 1 campaign

The same runner, on the committed Review Fix 1 tree (`2d0264c`, clean before and after), against the new code of every lane — 15 lane A
mutants (RA: the never-throw rule, invisible controls, the strict number reader, the pairing rules, title numbers, AI chart ids), 34 lane B
mutants (RB: bidi isolates, label rotation and width, range anchor, heat-map contrast and scale, histogram x axis, conversions, tables,
summary counting, print sizing and viewBox, retry and focus, announcements, review marks, chartSelection confirmation and kinds, cell
errors, the bound field, the guard and CSS pins) and 2 lane C mutants (RC01: the reviewer's MCQ-inversion mutant, which the corrected
freeze now kills; RC02: builder drift).

| Round | Planted | KILLED | SURVIVED | TIMEOUT / BUILD_ERROR |
|---|---|---|---|---|
| RF1 | 51 | 50 | 1 (RA10) | 0 / 0 |
| RF1b | RA10 re-run with its pin (`d3bca6c`: "Q10 was high; Q1: 7" isolates the glue rule from the qualifier rule) | 1 | 0 | 0 / 0 |

**Review Fix 1: 51 planted defects, 51 KILLED, 0 survivors.** Overall: 133 distinct planted defects, 132 KILLED, 1 equivalent (C11).

| Id | Area | Planted defect | Result | Killed by |
|---|---|---|---|---|
| RA01 | contract/no-throw | the outer guard removed (validation may throw) | KILLED | chartRules.21a1.test.ts — a value whose property access throws (a getter — not producibl |
| RA02 | contract/no-throw | kind coerced with String() again | KILLED | cert-21a1-adversarial.test.js — kind is an object with |
| RA03 | rich/no-throw | rich block type coerced with String() again | KILLED | cert-21a1-adversarial.test.js — a rich block whose type is such |
| RA04 | contract/text | invisible controls accepted in chart text | KILLED | cert-21a1-adversarial.test.js — C1 control (8-bit CSI  |
| RA05 | contract/text | invisible controls accepted in the chartSelection label | KILLED | chartRules.21a1.test.ts — the chartSelection instruction label refuses explicit bidi controls like every chart text; |
| RA06 | contract/text | ZWNJ refused (Persian / Arabic text broken) | KILLED | chartRules.21a1.test.ts — ZWNJ / ZWJ (needed by Persian and Arabic text) stay allowed in chart text |
| RA07 | ai/numbers | thousands separators read as decimals again | KILLED | composerChart.21a1.test.ts — thousands separators, decimal separators, signs, ranges and expon |
| RA08 | ai/numbers | a '-' after a digit read as a sign (ranges made negative) | KILLED | composerChart.21a1.test.ts — thousands separators, decimal separators, signs, ranges and expon |
| RA09 | ai/numbers | absolute values accepted again | KILLED | composerChart.21a1.test.ts — a number that does not occur in the teacher's request is refused (Arabic-Indic digits in the request count) (the test's title at the time read "preserved exactly"; renamed in Review Fix 2) |
| RA10 | ai/pairing | a label pairs with a number glued to it (Q1 ← Q10) | KILLED (after its pin; SURVIVED first) | composerChart.21a1.test.ts — where the request pairs a category with a number, a single-series |
| RA11 | ai/pairing | ambiguous pairing (two different numbers) taken as a pairing | KILLED | composerChart.21a1.test.ts — where the request pairs a category with a number, a single-series |
| RA12 | ai/pairing | a qualifier (year) taken as the paired value | KILLED | composerChart.21a1.test.ts — where the request pairs a category with a number, a single-series |
| RA13 | ai/pairing | swapped teacher values accepted (pairing check off) | KILLED | composerChart.21a1.test.ts — where the request pairs a category with a number, a single-series |
| RA14 | ai/title | invented numbers in a teacher-data title accepted | KILLED | composerChart.21a1.test.ts — a teacher-data chart's title and description state no number the  |
| RA15 | ai/patch | appended AI chart keeps a colliding id | KILLED | composerChart.21a1.test.ts — appending / prepending a chart to a stem that already has on |
| RB01 | rtl/value | value text without its LTR isolate | KILLED | DataChart.21a1.test.tsx — hover shows an ExamBank TEXT tooltip (title + lines) positioned inside the stage; leaving  |
| RB02 | rtl/unit | unit not isolated inside an Arabic label | KILLED | chartReviewFix1.21a1.test.ts — an axis name 'label (unit)' isolates the unit inside  |
| RB03 | layout/labels | labels wider than their slot not rotated | KILLED | chartReviewFix1.21a1.test.ts — 12 long labels rotate at 600 and 800 px (each label is wider than its slo |
| RB04 | layout/labels | flat label width not capped at its slot | KILLED | chartReviewFix1.21a1.test.ts — 12 long labels rotate at 600 and 800 px (each label is wider than its slo |
| RB05 | selection/range | a backward range drops its anchor again | KILLED | chartReviewFix1.21a1.test.ts — trimmed to the bound FROM the anchor, forwards and backwards |
| RB06 | contrast/heat | no halo where neither label colour reaches 4.5:1 | KILLED | chartReviewFix1.21a1.test.ts — at EVERY point of the scale the value label reaches 4.5:1 again |
| RB07 | contrast/heat | label colour not chosen by contrast | KILLED | chartReviewFix1.21a1.test.ts — at EVERY point of the scale the value label reaches 4.5:1 again |
| RB08 | heat/scale | the colour scale names no values | KILLED | chartReviewFix1.21a1.test.ts — the colour scale names its lowest and highest value with the un |
| RB09 | contract/histogram | histogram x bounds accepted again | KILLED | chartReviewFix1.21a1.test.ts — min / max on the histogram x axis are refused; label and |
| RB10 | editing/lossy | bar → pie silently drops reference lines | KILLED | chartReviewFix1.21a1.test.ts — bar → pie keeps the unit and is lossy beca |
| RB11 | editing/units | bar → pie drops the unit | KILLED | chartReviewFix1.21a1.test.ts — bar → pie keeps the unit and is lossy beca |
| RB12 | editing/units | pie → bar drops the unit | KILLED | chartReviewFix1.21a1.test.ts — pie → bar and heat map → bar put the unit  |
| RB13 | table/header | horizontal bars headed by the value axis again | KILLED | chartReviewFix1.21a1.test.ts — horizontal bars head the first column with the CATEGORY axis (y), |
| RB14 | table/units | value columns without units | KILLED | chartReviewFix1.21a1.test.ts — value columns carry their unit (bar, combo secondary axis, scatte |
| RB15 | table/heat | heat-map corner header empty | KILLED | chartReviewFix1.21a1.test.ts — value columns carry their unit (bar, combo secondary axis, scatte |
| RB16 | wording/summary | plural after 10 again | KILLED | chartReviewFix1.21a1.test.ts — the structural summary counts in Arabic (1 واحدة, 2 dual, 3–10 plural, 11+ singular) |
| RB17 | print | no print-width resize before printing | KILLED | DataChartReviewFix1.21a1.test.tsx — beforeprint → resize(PRINT_WIDTH); afterprint → resize |
| RB18 | print | the engine leaves no viewBox (the SVG cannot scale) | KILLED | echartsEngine.21a1.test.ts — viewBox = drawing size after mount, after resize(PRINT) and after resize() back to the con |
| RB19 | print | the engine ignores the print width | KILLED | echartsEngine.21a1.test.ts — viewBox = drawing size after mount, after resize(PRINT) and after resize() back to the con |
| RB20 | retry | the retry offered again after a second failure | KILLED | DataChartRetry.21a1.test.tsx — (1) the import fails twice: the fallback  |
| RB21 | retry/focus | focus dropped on retry | KILLED | DataChartRetry.21a1.test.tsx — (1) the import fails twice: the fallback  |
| RB22 | announce | a refused activation announced as 'deselected' | KILLED | DataChartReviewFix1.21a1.test.tsx — multiple at its limit: activating another item is refused at the l |
| RB23 | announce | an unchanged selection emitted anyway | KILLED | DataChartReviewFix1.21a1.test.tsx — multiple at its limit: activating another item is refused at the l |
| RB24 | review/marks | review marks without their glyph | KILLED | DataChartReviewFix1.21a1.test.tsx — an incorrect selection shows ✗ (not ✓), a missed key ○, a correct one ✓; the student's hin |
| RB25 | review/hint | the student hint shown read-only | KILLED | DataChartReviewFix1.21a1.test.tsx — an incorrect selection shows ✗ (not ✓), a missed key ○, a correct one ✓; the student's hin |
| RB26 | authoring/confirm | chartSelection kind change without confirmation | KILLED | ChartEditorReviewFix1.21a1.test.tsx — bar → box plot opens the c |
| RB27 | authoring/kinds | heat map offered for a chartSelection chart | KILLED | ChartEditorReviewFix1.21a1.test.tsx — a heat map (no selectable  |
| RB28 | authoring/cells | no text error for an invalid cell | KILLED | ChartEditorReviewFix1.21a1.test.tsx — the error is text next to the cell (aria-describedb |
| RB29 | authoring/cells | invalid cells not listed | KILLED | ChartEditorReviewFix1.21a1.test.tsx — the error is text next to the cell (aria-describedb |
| RB30 | authoring/histogram | histogram x axis offers bounds again | KILLED | ChartEditorReviewFix1.21a1.test.tsx — the binned axis offers label and unit fields only; the value axis  |
| RB31 | authoring/bound | clearing the bound forces 1 again | KILLED | ChartEditorReviewFix1.21a1.test.tsx — the selection bound can be |
| RB32 | bundle/guard | the editor signature dropped from the guard | KILLED | chartReviewFix1.21a1.test.ts — the bundle guard recognises the chart editor; every chart editor edge is a literal lazy im |
| RB33 | css/print | the print SVG keeps its fixed width | KILLED | chartReviewFix1.21a1.test.ts — print: the picture flows and the SVG scales to the printed column (fluid engine box, SVG w |
| RB34 | table/scatter | unlabelled scatter rows named by id again | KILLED | chartReviewFix1.21a1.test.ts — an unlabelled scatter point is named by its coordinates in the ta |
| RC01 | grading/mcq | MCQ grading inverted (the reviewer's freeze mutant) | KILLED | cert-21a1-compat-freeze.test.js — ai-composer-20f/A-network.js |
| RC02 | fixture/drift | the acceptance builder drifts from the committed exam | KILLED | cert-21a1-fixture-drift.test.js — the committed acceptance exam is byte-for-byte the builder's output fro |

RB20 / RB21 were killed by `DataChartRetry` tests of the IMPORT-failure retry. Review Fix 3 removed that retry (B3-5) and rewrote the file,
and with it the only assertions on the throwing-MOUNT retry (focus kept on the figure, no second button, «مرة أخرى»): from `5c12b52` to
Review Fix 4 these two mutants survived (round-4 finding C4-F2). Review Fix 4 restores the assertions (`DataChartMountRetry`) and
re-plants both against the current code (RU51 / RU52, §20.4).

### 20.2 Review Fix 2 campaign

The same runner on the committed Review Fix 2 tree (`7447b17`, clean before and after; every file restored byte-for-byte, SHA-256
verified, including the regenerated shared build): 43 planted defects in the Review Fix 2 code — 23 lane A (RS01–RS23: the pairing rules,
the number reader, AI chart ids at any depth, the invisible-character rule including lane C's six surviving mutants MX1–MX6 re-planted
against the new code as RS09–RS11 and RS16–RS18, the look-alike labels, the document size) and 20 lane B (RS24–RS43: print layout, paint
and restore, centring, vertical axes, thinning, value-axis widths, the redraw rule, announcements, key-clearing confirmation, the bound).

| Round | Planted | KILLED | SURVIVED | TIMEOUT / BUILD_ERROR |
|---|---|---|---|---|
| RF2 (`7447b17`) | 43 | 38 | 4 (RS14, RS33, RS35, RS41) | 0 / 1 (RS02: the first form did not compile) |
| RF2b (`aceeb57`) | RS02 re-planted compilably; RS33, RS35, RS41 after their pins | 4 | 0 | 0 / 0 |

- **RS41 found a real defect**, fixed fail-first in `aceeb57`: a chartSelection kind change that replaces the target kind kept key
  entries whose ids exist in the new kind — a bar may have a category `jan` and a series `jan`, so bar → radar turned the key
  "category jan" into "series jan" while the dialog said the key would be cleared. The key is now cleared whenever the target kind is
  replaced (`ChartEditorReviewFix2` RB3c failed on `7447b17` with the key `['jan']`).
- RS33 (an unnamed value axis takes its widest value label) and RS35 (a width change that only moves the flat-label cap is applied) are
  pinned (`chartReviewFix2` RB5c, `DataChartReviewFix2` RB17).
- **RS14 is equivalent** through every public path: it removes the renumbering of incoming charts nested in a `columns` block, but the AI
  rich vocabulary has no `columns` block (`composerCore.20f.test.ts:43` pins the vocabulary, `:118` the refusal of a `columns`
  descriptor), so an incoming AI block never contains one. The code stays as defense in depth.

**Review Fix 2: 43 planted defects, 42 KILLED, 1 equivalent (RS14), 0 timeouts.** Overall: 176 distinct planted defects, 174 KILLED,
2 equivalent (C11, RS14).

| Id | Area | Planted defect | Result | Killed by |
|---|---|---|---|---|
| RS01 | ai/pairing | positional label-list ↔ value-list pairing removed | KILLED | composerChart.21a1.test.ts — the values a misled model could w |
| RS02 | ai/pairing | a year qualifier is taken as the value | KILLED (re-planted; first form a BUILD_ERROR) | composerChart.21a1.test.ts — where the request pairs a category with a number, a single-series |
| RS03 | ai/pairing | a list item is taken as the value of the label before it | KILLED | composerChart.21a1.test.ts — pairedNumbers: the list, the qual |
| RS04 | ai/numbers | a comma list without spaces read as decimals again | KILLED | composerChart.21a1.test.ts — thousands separators, decimal separators, signs, ranges and expon |
| RS05 | ai/numbers | an en dash before a digit is not a minus | KILLED | composerChart.21a1.test.ts — labels match case-insensitively,  |
| RS06 | ai/pairing | labels compared case-sensitively | KILLED | composerChart.21a1.test.ts — labels match case-insensitively,  |
| RS07 | ai/pairing | invisible characters / tatweel kept when comparing labels | KILLED | composerChart.21a1.test.ts — labels match case-insensitively,  |
| RS08 | ai/pairing | the refusal states the paired value | KILLED | composerChart.21a1.test.ts — the refusal never states a value  |
| RS09 | ai/pairing | pie pairing only for single-series descriptors (lane C MX6) | KILLED | composerChart.21a1.test.ts — where the request pairs a category with a number, a single-series |
| RS10 | ai/numbers | numbers in the description not checked (lane C MX4) | KILLED | composerChart.21a1.test.ts — a teacher-data chart's title and description state no number the  |
| RS11 | ai/numbers | a thousands group may be followed by more digits (lane C MX5) | KILLED | composerChart.21a1.test.ts — thousands separators, decimal separators, signs, ranges and expon |
| RS12 | ai/ids | chart ids inside columns not counted as taken | KILLED | composerChart.21a1.test.ts — a chart inside a columns block counts as  |
| RS13 | ai/ids | a kept incoming id is not reserved for the next incoming chart | KILLED | composerChart.21a1.test.ts — several incoming charts: every kept or re |
| RS14 | ai/ids | incoming charts inside columns are not renumbered | EQUIVALENT (SURVIVED) | no public path delivers an incoming columns block: the AI rich vocabulary has none (composerCore.20f.test.ts:43, :118) |
| RS15 | contract/text | default-ignorable code points accepted | KILLED | chartRules.21a1.test.ts — the chartSelection instruction label refuses explicit bidi controls like every chart text; plai |
| RS16 | contract/text | the word joiner U+2060 accepted (lane C MX1) | KILLED | chartRules.21a1.test.ts — invisible ope |
| RS17 | contract/text | U+206A–206D accepted (lane C MX2) | KILLED | chartRules.21a1.test.ts — invisible ope |
| RS18 | contract/text | U+FFFA / U+FFFB accepted (lane C MX3) | KILLED | chartRules.21a1.test.ts — invisible ope |
| RS19 | contract/text | the presentation selectors refused | KILLED | chartRules.21a1.test.ts — ZWNJ / ZWJ, t |
| RS20 | contract/text | ZWNJ / ZWJ refused | KILLED | chartRules.21a1.test.ts — ZWNJ / ZWJ (needed by Persian and Arabic text) stay allowed in chart text |
| RS21 | contract/labels | look-alike labels (an allowed invisible apart) are distinct | KILLED | chartRules.21a1.test.ts — labels that d |
| RS22 | contract/size | the generated summary counted again | KILLED | richContentChart.21a1.test.ts — the document size counts the chart's STORED prose (title, description, source), never the g |
| RS23 | contract/size | chart prose not counted | KILLED | richContentChart.21a1.test.ts — the document size counts the chart's STORED prose (title, description, source), never the g |
| RS24 | render/print | no paint before the print layout (flush dropped) | KILLED | DataChartReviewFix2.21a1.test.tsx — beforeprint → update(p |
| RS25 | render/print | the print layout uses the screen option | KILLED | DataChartReviewFix2.21a1.test.tsx — beforeprint → update(p |
| RS26 | render/print | after printing the screen option is not restored | KILLED | DataChartReviewFix2.21a1.test.tsx — beforeprint → update(p |
| RS27 | render/print | the print option animates | KILLED | DataChartReviewFix2.21a1.test.tsx — beforeprint → update(p |
| RS28 | render/print | flush() does not repaint | KILLED | echartsEngine.21a1.test.ts — after resize(640) the drawing still reaches past 640 until flush(); after flush() e |
| RS29 | render/print | the print drawing is not centred | KILLED | chartReviewFix1.21a1.test.ts — print: the picture flows and the SVG scales to the printed column (fluid engine box, SVG with a |
| RS30 | render/axes | a vertical category axis is capped by a horizontal slot again | KILLED | chartReviewFix2.21a1.test.ts — horizontal bars keep full-width labe |
| RS31 | render/axes | rotated labels never thinned | KILLED | chartReviewFix2.21a1.test.ts — 12 rotated labels on a very narr |
| RS32 | render/axes | the secondary value axis takes no width | KILLED | chartReviewFix2.21a1.test.ts — the slot is what the VALUE AXES  |
| RS33 | render/axes | value-label width ignored (name gap only) | KILLED (after its pin; SURVIVED first) | chartReviewFix2.21a1.test.ts — an unnamed value axis takes the  |
| RS34 | render/redraw | a changed input with the same layout is not applied | KILLED | DataChart.21a1.test.tsx — a data change updates the same instance (no re-mount); switching to an advanced kind replaces i |
| RS35 | render/redraw | the label width is not part of the layout | KILLED (after its pin; SURVIVED first) | DataChartReviewFix2.21a1.test.tsx — 1000 → 1100 px (labels rotated a |
| RS36 | render/redraw | every width change redraws | KILLED | DataChartReviewFix2.21a1.test.tsx — 1000 → 1100 px (labels rotated a |
| RS37 | ux/announce | deselections not announced | KILLED | DataChartReviewFix2.21a1.test.tsx — a range that SHRINKS announces the deselecti |
| RS38 | ux/announce | the limit not announced when the item was not added | KILLED | DataChartReviewFix1.21a1.test.tsx — multiple at its limit: activating another item is refused at the l |
| RS39 | ux/announce | an unchanged selection is emitted | KILLED | DataChartReviewFix1.21a1.test.tsx — multiple at its limit: activating another item is refused at the l |
| RS40 | authoring/kind | a key-clearing kind change is not confirmed | KILLED | ChartEditorReviewFix2.21a1.test.tsx — bar → radar keeps every valu |
| RS41 | authoring/kind | a target-kind change is not seen as clearing the key | KILLED (after its pin; SURVIVED first) | ChartEditorReviewFix2.21a1.test.tsx — a bar whose series id equals a ca |
| RS42 | authoring/kind | a key that survives the change is still warned about | KILLED | ChartEditorReviewFix2.21a1.test.tsx — a change that keeps the key  |
| RS43 | authoring/bound | the clamped bound is not shown | KILLED | ChartEditorReviewFix2.21a1.test.tsx — typing 20 for a chart with 12 se |

### 20.3 Review Fix 3 campaign

The same runner on the committed Review Fix 3 tree (`5c12b52`, clean before and after; every file restored byte-for-byte, SHA-256
verified, including the regenerated shared build): 50 planted defects in the Review Fix 3 code — 20 lane A (RT01–RT20: the swap-only and
missing-value checks, the clause / ordinal / whole-word / proclitic rules, any-order and repeated label lists, the parenthesis gap, run
lengths, leading-dot decimals, "and", lists that disagree, the stored-prose bounds, the C1 range) and 30 lane B / editor (RT21–RT50: the
print guard, the print height and its restore, the observer while printing, explicit and automatic engine heights, the announcement
remount, the import-failure message, measured truncation, the thinning step and margin, the line-box metric, the axis-name gap, the
heat-map reserve and height, the editor's key resolution and warning). The follow-up round ran on `34bf0fc`.

| Round | Planted | KILLED | SURVIVED | TIMEOUT / BUILD_ERROR |
|---|---|---|---|---|
| RF3 (`5c12b52`) | 50 | 39 | 11 (RT06, RT07, RT10, RT17, RT23, RT24, RT27, RT33, RT46, RT49, RT50) | 0 / 0 |
| RF3b (`34bf0fc`) | 17: the 11 survivors after their pins, RT45 / RT48 and RT47b (RT47 re-planted against the changed line) on the changed resolution, RT51–RT53 for the starter-data rule | 12, and RT33 in a re-run once its new suite file was listed | 5 (RT46, RT47b, RT49, RT53 equivalent; RT33 before its suite file was listed) | 0 / 0 |

- **The campaign led to one more fix**: lane A's R3-A4 asked that a conversion from starter data keep no key entry; the first Review Fix 3
  commit kept an entry whose id AND default label recurred in the starter data (a scatter series "s1" / "السلسلة 1" → bar). `34bf0fc`
  clears the key on every starter-data conversion (`convertChartKind` reports `fresh`); `ChartEditorReviewFix3` RB3g failed on `5c12b52`
  (the dialog announced a partial removal and kept `s1`) and passes now; RT51 / RT52 kill its removal.
- Nine survivors were pinned (`composerChart` AI9 mutation pins, `DataChartReviewFix3` RB1f, `DataChartMeasure`, `ChartEditorReviewFix3` RB3f).
- **Four equivalents, all defense in depth in the editor's single resolution** (kept on purpose): RT47b and RT49 — a check that a kept
  target keeps its label, and the partial-removal wording — cannot fire because no data-keeping conversion drops or relabels a target
  (checked over 312 kind × fixture × target-kind combinations: 164 starter-data conversions, 34 target-kind changes, 114 that keep every
  target with its label); RT46 and RT53 guard a structurally unreadable chart, which the chart editor never emits and import refuses.

**Review Fix 3: 53 distinct planted defects, 50 KILLED, 3 equivalent (RT46, RT49, RT53; and RT47b, a re-plant of the killed RT47), 0
timeouts.** Overall: 229 distinct planted defects, 224 KILLED, 5 equivalent (C11, RS14, RT46, RT49, RT53).

| Id | Area | Planted defect | Result | Killed by |
|---|---|---|---|---|
| RT01 | ai/pairing | a pairing demands equality again (not only a swap) | KILLED | composerChart.21a1.test.ts — a m |
| RT02 | ai/pairing | a written value may go missing (null accepted) | KILLED | composerChart.21a1.test.ts — R3- |
| RT03 | ai/pairing | another number in the clause no longer makes the pairing unclear | KILLED | composerChart.21a1.test.ts — where the request pairs a category with a number, a single-series |
| RT04 | ai/pairing | the clause does not end at another label | KILLED | composerChart.21a1.test.ts — R3- |
| RT05 | ai/pairing | the clause does not end at punctuation | KILLED | composerChart.21a1.test.ts — where the request pairs a category with a number, a single-series |
| RT06 | ai/pairing | an ordinal is read as a value | KILLED (after its pin; SURVIVED first) | composerChart.21a1.test.ts — mut |
| RT07 | ai/pairing | a label matches inside a word | KILLED (after its pin; SURVIVED first) | composerChart.21a1.test.ts — mut |
| RT08 | ai/pairing | no Arabic proclitic before a label | KILLED | composerChart.21a1.test.ts — where the request pairs a category with a number, a single-series |
| RT09 | ai/pairing | a label list recognised in chart order only | KILLED | composerChart.21a1.test.ts — R3- |
| RT10 | ai/pairing | a label may repeat inside a label list | KILLED (after its pin; SURVIVED first) | composerChart.21a1.test.ts — mut |
| RT11 | ai/pairing | a parenthesis may come between the label list and the values | KILLED | composerChart.21a1.test.ts — R3- |
| RT12 | ai/pairing | a longer value run pairs positionally | KILLED | composerChart.21a1.test.ts — R3- |
| RT13 | ai/numbers | a decimal without a leading digit is not read | KILLED | composerChart.21a1.test.ts — R3- |
| RT14 | ai/numbers | a leading-dot decimal loses its point | KILLED | composerChart.21a1.test.ts — R3- |
| RT15 | ai/pairing | a unit swallows "and" again | KILLED | composerChart.21a1.test.ts — R3- |
| RT16 | ai/pairing | "and" is not a list separator | KILLED | composerChart.21a1.test.ts — R3- |
| RT17 | ai/pairing | a label listed with two different values still pairs | KILLED (after its pin; SURVIVED first) | composerChart.21a1.test.ts — mut |
| RT18 | contract/size | the scenario payload counts the generated chart summary again | KILLED | richContentChart.21a1.test.ts — a scenario's payload bound counts a chart's STORED prose, never the generated summary (rev |
| RT19 | contract/size | the stored-only plain text ignores the option | KILLED | richContentChart.21a1.test.ts — a scenario's payload bound counts a chart's STORED prose, never the generated summary (rev |
| RT20 | contract/text | the C1 rule narrowed to NEL / CSI | KILLED | chartRules.21a1.test.ts — every C1 control U+0080–U+009F is refused in chart text, not only NEL and CSI (review fix  |
| RT21 | render/print | while printing an option change re-applies the screen option | KILLED | DataChartReviewFix3.21a1.test.tsx — subtle animation (the formal-exam default) |
| RT22 | render/print | the print height is not passed (the print box is measured) | KILLED | DataChartReviewFix3.21a1.test.tsx — subtle animation (the formal-exam default) |
| RT23 | render/print | the resize observer resizes while printing | KILLED (after its pin; SURVIVED first) | DataChartReviewFix3.21a1.test.tsx — printing  |
| RT24 | render/print | a height change while printing resizes to the screen | KILLED (after its pin; SURVIVED first) | DataChartReviewFix3.21a1.test.tsx — printing  |
| RT25 | render/print | the printing flag is never set | KILLED | DataChartReviewFix3.21a1.test.tsx — subtle animation (the formal-exam default) |
| RT26 | render/print | the printing flag is never cleared | KILLED | DataChartReviewFix3.21a1.test.tsx — subtle animation (the formal-exam default) |
| RT27 | render/print | the print height is the phone height | KILLED (after its pin; SURVIVED first) | DataChartReviewFix3.21a1.test.tsx — printing  |
| RT28 | render/engine | after printing the print height stays (no auto height) | KILLED | echartsEngine.21a1.test.ts — after resize(640) the drawing still reaches past 640 until flush(); after flush() e |
| RT29 | render/engine | an explicit height is ignored | KILLED | echartsEngine.21a1.test.ts — after resize(640) the drawing still reaches past 640 until flush(); after flush() e |
| RT30 | ux/announce | an identical announcement is not re-mounted | KILLED | DataChartReviewFix3.21a1.test.tsx — activating the same refused item twice r |
| RT31 | ux/retry | an import failure is treated like a mount failure | KILLED | DataChartRetry.21a1.test.tsx — the import fails: the fallbac |
| RT32 | ux/retry | the retry button is offered for an import failure | KILLED | DataChartRetry.21a1.test.tsx — the import fails: the fallbac |
| RT33 | render/truncation | the screen option gets no measurer | KILLED (after its pin; SURVIVED first) | DataChartMeasure.21a1.test.tsx — the screen option and the p |
| RT34 | render/truncation | a label is never cut by measurement | KILLED | chartReviewFix3.21a1.test.ts — a rotated Arabic label is cut to its 104 px cap by measurement (not t |
| RT35 | render/truncation | a cut may split a letter from its marks | KILLED | chartReviewFix3.21a1.test.ts — a grapheme is never split (a letter keeps its harakat); a vertical ca |
| RT36 | render/truncation | the engine still truncates a measured label | KILLED | chartReviewFix3.21a1.test.ts — a rotated Arabic label is cut to its 104 px cap by measurement (not t |
| RT37 | render/truncation | a pie label's cut ignores its value | KILLED | chartReviewFix3.21a1.test.ts — a pie label cuts the NAME, never the value; without a measurer the en |
| RT38 | render/axes | dense rotated labels left to the engine again | KILLED | chartReviewFix3.21a1.test.ts — a s |
| RT39 | render/axes | the thinning step has no margin | KILLED | chartReviewFix3.21a1.test.ts —  |
| RT40 | render/axes | touching measured against one em + 2 px again | KILLED | chartReviewFix3.21a1.test.ts — a s |
| RT41 | render/axes | the axis name gap is fixed again | KILLED | chartReviewFix3.21a1.test.ts —  |
| RT42 | render/axes | the rotated reach is not capped | KILLED | chartReviewFix3.21a1.test.ts —  |
| RT43 | render/heatmap | heat-map columns ignore the row labels' width | KILLED | chartReviewFix3.21a1.test.ts —  |
| RT44 | render/heatmap | the heat-map height has no room for rotated labels | KILLED | chartReviewFix3.21a1.test.ts —  |
| RT45 | authoring/key | an invalid chart's key is not pruned (only a valid one) | KILLED | ChartEditorReviewFix3.21a1.test.tsx — histogram: deleting the key |
| RT46 | authoring/key | an unreadable structure keeps the whole key | EQUIVALENT (SURVIVED) | the fallback for a structurally unreadable chart: every chart the editor emits carries its kind's arrays and import refuses invalid charts, so the structural reading never fails |
| RT47 | authoring/key | a kind change keeps an id whose label changed | KILLED (first round); re-planted as RT47b | ChartEditorReviewFix3.21a1.test.tsx — bar (target series, key s1  |
| RT48 | authoring/warn | the warning is not the stored outcome (never warns) | KILLED | ChartEditorReviewFix2.21a1.test.tsx — bar → radar keeps every valu |
| RT49 | authoring/warn | a partial removal is announced as clearing everything | EQUIVALENT (SURVIVED) | no kind change removes only part of a key: data-keeping conversions keep every target, the others clear the key (same 312-combination check) |
| RT50 | authoring/key | a range is judged against an unknown order | KILLED (after its pin; SURVIVED first) | ChartEditorReviewFix3.21a1.test.tsx — an edit that makes the chart invalid keeps a contiguous  |
| RT47b | authoring/key | a kind change keeps an id whose label changed (re-planted against the new line) | EQUIVALENT (SURVIVED) | no conversion that keeps data relabels a target (312 kind × fixture × target-kind combinations checked); starter-data conversions clear the key first |
| RT51 | authoring/key | a starter-data conversion keeps same-id-same-label entries | KILLED | ChartEditorReviewFix3.21a1.test.tsx — scatter (series «السلسلة 1» and «فرع  |
| RT52 | authoring/key | a conversion never reports starter data | KILLED | ChartEditorReviewFix3.21a1.test.tsx — scatter (series «السلسلة 1» and «فرع  |
| RT53 | authoring/key | an unreadable conversion keeps the key | EQUIVALENT (SURVIVED) | the conversion cannot throw here: the chart editor ran the same conversion before emitting the change |

### 20.4 Review Fix 4 campaign

The same runner on the committed Review Fix 4 tree (`804d810`, clean before and after; every file restored byte-for-byte, SHA-256
verified, including the regenerated shared build): 59 planted defects in the Review Fix 4 code — 18 lane A / C pairing (RU01–RU18:
fullwidth digits, the word-label guard, both pairing forms, the clause-ending rule and its connectors, the unit skip, the day-of-month
rule, the pie value count, the refusal wording), 4 editor (RU19–RU22: the datum slot, pending entries and the bound), 28 rendering
(RU23–RU50: the measured cut, the pie's two lines and line box, the radar radius and name cap, label layout and its registration, value
label line boxes and room, the histogram's room, the reference label's placement, cut and margin, the axis gaps, the width layout, the
late-webfont cache, listener and epoch, the radar's width layout) and lane C's surviving mutants re-planted against the current code
(RU51–RU59: the mount retry, the isolate and the font of measured cuts, the heat-map reserve cap, the stored prose).

| Round | Planted | KILLED | SURVIVED | TIMEOUT / BUILD_ERROR |
|---|---|---|---|---|
| RF4 (`804d810`) | 59 | 43 | 16 (RU02, RU03, RU08, RU14, RU21, RU23, RU26, RU27, RU28, RU29, RU31, RU32, RU35, RU45, RU47, RU50) | 0 / 0 |
| RF4b (`223698c`, after the pins) | 15 (the survivors but RU45, whose code was removed) | 13 | 2 (RU31, RU47) | 0 / 0 |
| RF4c (`f4db489`) | 2 (RU47 with its corrected pin; RU30 against the engine module without the registration) | 2 | 0 | 0 / 0 |
| RF4d (`bb46b08`) | 2 (RU31 with its pin; RU30 again) | 2 | 0 | 0 / 0 |

- **Pins** (`223698c`, `f4db489`, `bb46b08`): `composerChart` AI11 (the word-label guard — "The passing grade is a 50." must not make «A»
  pair 50 —, a counted noun before the next label, fractional values after month names; it also pins the documented limitation that "Jan
  12 mm" pairs nothing), `ChartEditorReviewFix3` RB3h (the bound counts the entry being retyped), `chartReviewFix4` RB25 (`fitText` — now
  exported — never returns the uncut text; the pie and value-label line boxes; the radar radius gives way so the names keep their cap,
  never below half its default; the histogram's right margin; the engine registers the label layout and the bundle guard requires it),
  `DataChartMeasure` (a webfont load REBUILDS the option: build-time room follows the new widths), `DataChartReviewFix2` RB22b (a radar
  lays out by the stage width), `echartsEngine` RB23b (the real engine draws a few of 30 dense value labels, all 30 when `hideOverlap` is
  off).
- **One equivalent, its code removed**: RU45 — the right margin never depends on the width, so `widthLayout` no longer carries it.
- **RU31 was first misjudged as equivalent, which the browser caught**: in the unit tests the rendering library's core installs the label
  layout itself, so `f4db489` removed the engine's explicit registration as redundant. The real-browser re-run on `f4db489` showed value
  labels overlapping again: the core's registration is an import side effect that the production build drops (the built engine chunks of
  `f4db489` — and of `e704272` — contain no label manager). `bb46b08` restores the registration and adds a bundle-guard check (the common
  engine graph must carry the label manager, `addLabelsOfSeries`) that fails on the `f4db489` build and passes now; the source pin in RB25
  kills RU31 in the unit campaign.
- RU47's first pin read its starting margin from the previous test's chart; corrected in `f4db489` (the mutant keeps the margin at 100 px,
  the rebuilt option has 181 px).

**Review Fix 4: 59 distinct planted defects, 58 KILLED, 1 equivalent (RU45 — its code removed), 0 timeouts.** Overall: 288 distinct planted
defects, 282 KILLED, 6 equivalent (C11, RS14, RT46, RT49, RT53, RU45).

| Id | Area | Planted defect | Result | Killed by |
|---|---|---|---|---|
| RU01 | ai/numbers | fullwidth digits are not normalised | KILLED | composerChart.21a1.test.ts — 21A1-AI10 round-4 lane A: a misreading pairs nothing (R4-A1); pins (R4-A4); a pie keeps ev |
| RU02 | ai/pairing | a one-letter word label pairs without ":" / "=" | KILLED (after its pin; SURVIVED first) | composerChart.21a1.test.ts — mutation pins (RU02 |
| RU03 | ai/pairing | a one-letter word label pairs after spaces | KILLED (after its pin; SURVIVED first) | composerChart.21a1.test.ts — mutation pins (RU02 |
| RU04 | ai/pairing | the label list wins over the label's own number (only one form read) | KILLED | composerChart.21a1.test.ts — 21A1-AI10 round-4 lane A: a misreading pairs nothing (R4-A1); pins (R4-A4); a pie keeps ev |
| RU05 | ai/pairing | a label with two different values pairs the first | KILLED | composerChart.21a1.test.ts — mut |
| RU06 | ai/pairing | a value need not end its clause | KILLED | composerChart.21a1.test.ts — C4-F1: a day after  |
| RU07 | ai/pairing | the clause never ends at a label (no connector allowed) | KILLED | composerChart.21a1.test.ts — C4-F1: a day after  |
| RU08 | ai/pairing | any words may stand between a value and the next label | KILLED (after its pin; SURVIVED first) | composerChart.21a1.test.ts — mutation pins (RU02 |
| RU09 | ai/pairing | no connector word before the next label | KILLED | composerChart.21a1.test.ts — C4-F1: a day after  |
| RU10 | ai/pairing | no proclitic glued to the next label | KILLED | composerChart.21a1.test.ts — C4-F1: the forms th |
| RU11 | ai/pairing | the unit is not skipped before the clause test | KILLED | composerChart.21a1.test.ts — where the request pairs a category with a number, a single-series |
| RU12 | ai/pairing | a day of the month pairs as the month's value | KILLED | composerChart.21a1.test.ts — C4-F1: a day after  |
| RU13 | ai/pairing | every small whole number after a month is a day (unit or not) | KILLED | composerChart.21a1.test.ts — pins (mutants X3 / X4 / X8): numb |
| RU14 | ai/pairing | a fractional day after a month is a day | KILLED (after its pin; SURVIVED first) | composerChart.21a1.test.ts — mutation pins (RU02 |
| RU15 | ai/pie | a pie descriptor's value count is not checked | KILLED | composerChart.21a1.test.ts — 21A1-AI10 round-4 lane A: a misreading pairs nothing (R4-A1); pins (R4-A4); a pie keeps ev |
| RU16 | ai/pie | extra pie values are dropped silently (only too few refused) | KILLED | composerChart.21a1.test.ts — 21A1-AI10 round-4 lane A: a misreading pairs nothing (R4-A1); pins (R4-A4); a pie keeps ev |
| RU17 | ai/message | the empty-value refusal claims the teacher wrote the value | KILLED | composerChart.21a1.test.ts — C4-F1: a refusal ne |
| RU18 | ai/message | the swap refusal claims the teacher wrote the value | KILLED | composerChart.21a1.test.ts — C4-F1: a refusal ne |
| RU19 | authoring/key | a datum entry being retyped is pruned | KILLED | ChartEditorReviewFix3.21a1.test.tsx — clearing the key's cell and typ |
| RU20 | authoring/key | pending datum entries are dropped by the chart's order | KILLED | ChartEditorReviewFix3.21a1.test.tsx — clearing the key's cell and typ |
| RU21 | authoring/key | pending entries do not count toward the bound | KILLED (after its pin; SURVIVED first) | ChartEditorReviewFix3.21a1.test.tsx — the bound counts the entry bein |
| RU22 | authoring/key | a datum slot ignores its category | KILLED | ChartEditorReviewFix3.21a1.test.tsx — deleting the category drops the |
| RU23 | render/text | a cut that cannot fit returns the uncut text | KILLED (after its pin; SURVIVED first) | chartReviewFix4.21a1.test.ts — RU23: a measured cut never returns the uncut text — empty where not even "…" fits |
| RU24 | render/pie | a long unit never moves the value to its own line | KILLED | chartReviewFix4.21a1.test.ts — a value whose unit leaves the name no room tak |
| RU25 | render/pie | the second line's value is not cut to the box | KILLED | chartReviewFix4.21a1.test.ts — a value whose unit leaves the name no room tak |
| RU26 | render/pie | the pie label has no line box | KILLED (after its pin; SURVIVED first) | chartReviewFix4.21a1.test.ts — RU26 / RU32: pie labels and value labels carry the webfont's line box (1.75 em /  |
| RU27 | render/radar | the radar radius ignores the names' room | KILLED (after its pin; SURVIVED first) | chartReviewFix4.21a1.test.ts — RU27 / RU28 / RU29: the radar radius shrinks so the names keep their cap — never  |
| RU28 | render/radar | the radar radius may shrink below half | KILLED (after its pin; SURVIVED first) | chartReviewFix4.21a1.test.ts — RU27 / RU28 / RU29: the radar radius shrinks so the names keep their cap — never  |
| RU29 | render/radar | the radar names keep their fixed cap | KILLED (after its pin; SURVIVED first) | chartReviewFix4.21a1.test.ts — RU27 / RU28 / RU29: the radar radius shrinks so the names keep their cap — never  |
| RU30 | render/labels | overlapping value labels are not hidden | KILLED (re-run on f4db489 and bb46b08: killed by the real-engine pin RB23b too) | echartsEngine.21a1.test.ts — 30 seven-digit value labels on a 300 px stage: fewer drawn than ther |
| RU31 | render/labels | the label layout feature is not registered | KILLED (after its pin, RF4d; SURVIVED twice — invisible to the unbundled unit tests) | chartReviewFix4.21a1.test.ts — RU31: the engine module registers the label layout itself, and the bundle guard requires it; and the bundle guard on a production build (failed on the f4db489 build) |
| RU32 | render/labels | value labels use the estimated text height | KILLED (after its pin; SURVIVED first) | chartReviewFix4.21a1.test.ts — RU26 / RU32: pie labels and value labels carry the webfont's line box (1.75 em /  |
| RU33 | render/labels | no right margin for value labels | KILLED | chartReviewFix4.21a1.test.ts — the plot keeps room on its  |
| RU34 | render/labels | a horizontal bar keeps only half a label beyond its end | KILLED | chartReviewFix4.21a1.test.ts — the plot keeps room on its  |
| RU35 | render/labels | a histogram keeps no room for its last label | KILLED (after its pin; SURVIVED first) | chartReviewFix4.21a1.test.ts — RU35: a histogram keeps room on its right for its widest count |
| RU36 | render/reference | the reference label stays inside with value labels on | KILLED | chartReviewFix4.21a1.test.ts — with value labels above the |
| RU37 | render/reference | the reference label moves outside beside a secondary axis | KILLED | chartReviewFix4.21a1.test.ts — without value labels, on ho |
| RU38 | render/reference | the reference label starts inside the last column's label room | KILLED | chartReviewFix4.21a1.test.ts — with value labels above the |
| RU39 | render/reference | no margin reserved for the outside reference label | KILLED | chartReviewFix4.21a1.test.ts — with value labels above the |
| RU40 | render/reference | the outside reference label is not cut | KILLED | chartReviewFix4.21a1.test.ts — with value labels above the |
| RU41 | render/axis | no left gap for the first column's value label | KILLED | chartReviewFix4.21a1.test.ts — the first column's value la |
| RU42 | render/axis | no gap beside a rotated first category label | KILLED | chartReviewFix4.21a1.test.ts — the first column's value la |
| RU43 | render/width | the width layout ignores the radar | KILLED | chartReviewFix4.21a1.test.ts — the radar layout is part of the width layout (a width |
| RU44 | render/width | the width layout ignores the value axis's gap | KILLED | chartReviewFix4.21a1.test.ts — the first column's value la |
| RU45 | render/width | the width layout ignores the grid's right margin | EQUIVALENT (SURVIVED) — code removed | the right margin never depends on the width (it follows the values, the labels and the compact class, itself an input): widthLayout no longer carries it (223698c) |
| RU46 | render/fonts | a webfont load leaves the measure cache | KILLED | DataChartMeasure.21a1.test.tsx — loadingdone re-applies the optio |
| RU47 | render/fonts | the option ignores the font epoch | KILLED (after its pin, corrected in RF4c; SURVIVED twice) | DataChartMeasure.21a1.test.tsx — the option is BUILT again with t |
| RU48 | render/fonts | the font listener is never registered | KILLED | DataChartMeasure.21a1.test.tsx — loadingdone re-applies the optio |
| RU49 | render/fonts | the applied inputs ignore the font epoch | KILLED | DataChartMeasure.21a1.test.tsx — loadingdone re-applies the optio |
| RU50 | render/width | a radar does not lay out by width | KILLED (after its pin; SURVIVED first) | DataChartReviewFix2.21a1.test.tsx — after a width change the applied radar |
| RU51 | ux/retry | the retry is offered again after a second mount failure | KILLED | DataChartMountRetry.21a1.test.tsx — fails twice: |
| RU52 | ux/retry | focus is not kept on the figure when retrying | KILLED | DataChartMountRetry.21a1.test.tsx — fails twice: |
| RU53 | ux/retry | a second mount failure repeats the first message | KILLED | DataChartMountRetry.21a1.test.tsx — fails twice: |
| RU54 | render/text | a cut axis label loses its isolate | KILLED | chartReviewFix4.21a1.test.ts — a cut Arabi |
| RU55 | render/text | a one-line pie label's name loses its isolate | KILLED | chartReviewFix4.21a1.test.ts — a pie label |
| RU56 | render/text | cuts are measured in a fixed font | KILLED | chartReviewFix4.21a1.test.ts — a cut Arabi |
| RU57 | render/heatmap | the heat-map row reserve is not capped | KILLED | chartReviewFix4.21a1.test.ts — heat-map co |
| RU58 | contract/size | the stored prose leaves out the description | KILLED | richContentChart.21a1.test.ts — a chart's stored prose is exactly its title, description and source — computed here indepe |
| RU59 | contract/size | the stored prose leaves out the source | KILLED | richContentChart.21a1.test.ts — a chart's stored prose is exactly its title, description and source — computed here indepe |

## 21. Independent review

Round 1 — three read-only lanes on `a788539` (each: no writes to the repository, probes in scratch copies only):

| Lane | Verdict | Findings |
|---|---|---|
| A — security, privacy, grading authority, ingest, AI intake | FINDINGS | A1 MAJOR a JSON object posing as a chart kind / block type made the validators throw (sanitizer, finalization, grading, ingest all down); A2 MAJOR the AI number check accepted changed readings (1,200 → 1.2, −5 → 5) and swapped values; A3 MINOR invisible / C1 / separator format characters accepted in chart text; A4 MINOR appending an AI chart to a stem with a chart failed on a duplicate id; A5 MINOR the "selecting everything never pays" wording |
| B — rendering, UX, accessibility, bundle | FINDINGS | B-1 … B-5 MAJOR: print cut charts off; the retry could not retry a failed import; chartSelection kind changes lost data silently; mixed RTL units / negative values reordered; labels overlapped at mid widths. B-6 … B-14 MINOR: table headers / units, announcements and range anchor, histogram x bounds ignored, lossy conversions unreported, review ✓ on incorrect selections, the editor invisible to the bundle guard, heat-map scale without values and mid-scale contrast, invalid cells without a text error. B-15 NITs |
| C — lifecycle, compatibility, test quality, mutation adequacy, docs, process | FINDINGS | F1 MAJOR the freeze's synthetic answers were malformed (grading pinned blank only); F2 MAJOR the record overstated the AI number check; F3 MINOR the acceptance scatter labelled its answer point "outlier"; F4 MINOR no drift test for the generated fixture; F5 MINOR `composite.20d` labelled "known flaky" without a root cause; F6 MINOR PR body placeholders; N1–N5 NITs |

**Review Fix 1** (one normal commit) addresses every finding: A1–A5 and F2 in §4 / §8 / §11; B-1 … B-15 in §9 / §10 / §17; F1 in §14;
F3 / F4 in §13; F5 in §22; N1–N5 in the cited files and §1 / §17; F6 in the PR body. Fail-first evidence is in §18, browser evidence in
§15, the mutation proof of the new code in §20.1 (51 / 51 killed).

Round 2 — the same three lanes on `b04cc37`:

| Lane | Verdict | Round-1 findings | New findings |
|---|---|---|---|
| A′ | FINDINGS | A1 and A3 resolved; A2, A4, A5 partially | N1 MAJOR the pairing check saw pairings the teacher never wrote (label lists, year qualifiers): correct charts refused, the repair message asserted a wrong value; N2 MINOR exact / case-sensitive labels, en dash, "120,80,95"; N3 MINOR charts nested in columns; N4 MINOR §4 listed a subset of the invisible characters (581 default-ignorables accepted, look-alike labels distinct); N5 MINOR unpinned invariants; N6 MINOR the size limit counted the generated summary; N7 / N8 NITs |
| B′ | FINDINGS | B-4 … B-7, B-9 … B-15 resolved; B-2, B-3, B-8 partially; B-1 not resolved | N-1 MAJOR print still cropped in a real PDF (no repaint before the print layout); N-2 MAJOR vertical category axes capped by a horizontal slot (a Review Fix 1 regression); N-3 MINOR key-clearing kind changes without confirmation; N-4 MINOR print layout computed for the screen; N-5 MINOR range announcements; N-6 MINOR a full redraw per resize step; N-7 … N-9 NITs; the record overstated the retry |
| C′ | FINDINGS | F1 … F6 and N1 … N5 resolved | C2-1 MINOR six documented rules without a test (six surviving mutants); C2-2 … C2-4 NIT wording; C2-5 the red exact-head CI (the documented 14b flake) |

**Review Fix 2** (`94cbfc1`, `7447b17`) addresses every round-2 finding: N1–N3, N5, N8 in §11; N4 and N6 in §4 / §4.1; N7 in the code
comment and test title; N-1 … N-9 and the retry wording in §9 / §10; C2-1 with pins (§18, §20.2); C2-2 in §14; C2-3 in the composer code
comments, the test header and titles; C2-4 in the test title; C2-5 in the PR body. Verifying in real Chromium found three more defects,
fixed fail-first in `7447b17` (§15, §18). Fail-first evidence is in §18, the mutation proof in §20.2.

Round 3 — the same three lanes on `1780f2c`:

| Lane | Verdict | Earlier findings | New findings |
|---|---|---|---|
| A″ | FINDINGS | N2–N5, N7, N8, A1, A3–A5 resolved; N1, N6, A2 partially | R3-A1 MAJOR the pairing still invented pairings (years, ordinals, labels inside words, a parenthesised list): correct charts refused, wrong ones accepted; R3-A2 MAJOR ".5" read as 5; R3-A3 MAJOR label lists only in chart order; R3-A4 MAJOR the chartSelection key could silently point at another target (deletions while invalid, reused ids, starter data); R3-A5 MINOR "and" swallowed as a unit, a written value could go missing; R3-A6 MINOR the scenario payload counted the generated summary; R3-A7 MINOR unpinned rules; R3-A8 NIT §11 / §18 / §21 wording and counts |
| B″ | FINDINGS | N-1, N-2, N-5 … N-9 and the B-2 residual resolved; N-3 resolved for valid charts; N-4 not resolved | B3-1 MAJOR with the default animation the print layout was replaced during real printing; B3-2 MINOR Arabic labels truncated to about half their cap; B3-3 MINOR key warning and stored key disagree for an invalid chart; B3-4 MINOR an identical announcement is silent; B3-5 NIT a retry that cannot succeed; B3-6 NIT geometry evidence without the webfont |
| C″ | FINDINGS | C2-1, C2-2, C2-4, C2-5 resolved; C2-3 partially (the RA09 row) | N1 MINOR pairing rules untested; N2 MINOR "and"; N3 MINOR four-digit values never paired; N4 MINOR label-normalisation rules untested; N5 MINOR untested layout / print / dialog rules; N6 … N9 NIT (RA09 wording, fail-first counts, the invalid-conversion dialog, §22 wording) |

**Review Fix 3** (`5c12b52`, `34bf0fc` and the record) addresses every round-3 finding: R3-A1 … R3-A3, R3-A5 and lane C N1 … N3 in §11 (the
pairing redesign); R3-A4, B3-3 and lane C N8 in §9; R3-A6 in §4.1; R3-A7 and lane C N4 / N5 with pins (§18, §20.3); B3-1 … B3-6 in §10 and
§15; R3-A8 and lane C N6 / N7 / N9 in §11, §18, §20.1, §21 and §22. Verifying in real Chromium found one more defect in the fix itself (the
print height outliving the print), fixed fail-first before the commit (§15). Fail-first evidence is in §18, the mutation proof in §20.3.

Round 4 — the same three lanes on `e704272`:

| Lane | Verdict | Earlier findings | New findings |
|---|---|---|---|
| A‴ | FINDINGS | R3-A2 … R3-A8 resolved (R3-A4: no key points at another target); R3-A1 partially | R4-A1 MAJOR the pairing still invented pairings (the article "a" read as the label "A"; a label in a list AND with its own number read from the list only): correct charts refused, swaps accepted; R4-A2 MAJOR a `datum` key entry dropped silently when its value cell was cleared to retype it (the student's intended answer scored 0); R4-A3 MINOR §11 "Not verified" incomplete; R4-A4 MINOR four pairing rules unpinned; R4-A5 MINOR extra pie values dropped silently; R4-A6 NIT fullwidth digits read in the pairing but not in the number check |
| B‴ | FINDINGS | B3-1 … B3-6 resolved (B3-2 for axis labels); N-1 … N-7 resolved | B4-1 MAJOR a pie label with a long unit was not cut at all (207–326 px drawn over the pie and its neighbours; a Review Fix 3 regression: a cut to a negative width returned the uncut text); B4-2 MINOR radar axis names outside the canvas; B4-3 MINOR value labels over one another and under the reference-line label; B4-4 NIT cuts not re-measured when the webfont arrives late; §16 +12 % script time on a heavily cut page (not raised as a finding); §17 numbers dated to `5c12b52` |
| C‴ | FINDINGS | N1 … N8 resolved; N9 partially (the PR body's 19D wording) | C4-F1 MAJOR the claim "a misread pairing cannot refuse a correct chart" was false (a day after a month, a count before more words), and the refusal said the teacher "wrote" a value the code inferred; C4-F2 MINOR the Review Fix 3 `DataChartRetry` rewrite dropped the only mount-retry assertions (RB20 / RB21 survive); C4-F3 MINOR seven pairing rules untested; C4-F4 MINOR the isolate and the font of measured cuts untested; C4-F5 MINOR the stored-prose test derived its bound from the code under test; C4-F6 NIT the heat-map row reserve cap untested; C4-F7 NIT Review Fix 2 wording left in the composer and its tests; C4-F8 NIT the Review Fix 3 fail-first counts; C4-F9 NIT the PR body's 19D wording; C4-F10 NIT a vacuous precondition in RB1e |

**Review Fix 4** (`804d810`, `223698c`, `f4db489`, `bb46b08` and the record) addresses every round-4 finding:
- R4-A1, C4-F1, R4-A5, R4-A6 in §11 (both pairing forms, word labels, a value ends its clause, the day-of-month rule, the pie value count,
  fullwidth digits; the claim corrected and the refusal reworded); R4-A3 in §11 "Not verified"; R4-A4 and C4-F3 with pins (`composerChart`
  AI10 / AI11);
- R4-A2 in §9 (`ChartEditorReviewFix3` RB3h);
- B4-1 … B4-4 in §10 (`chartReviewFix4` RB21–RB24, `DataChartMeasure` RB18c); verifying B4-3 in Chromium showed three more overlaps — the
  first column's value label over the value axis's labels, the reference-line label over an axis label, the value axis's "0" against the
  first rotated category label (all on `e704272` too) — fixed with fail-first tests (§15, §18);
- C4-F2 with `DataChartMountRetry` (§20.1, §20.4); C4-F4 / C4-F6 with `chartReviewFix4` RB24; C4-F5 with an independent stored-prose pin
  (`richContentChart`); C4-F7 in the composer comments and test titles; C4-F8 in §18; C4-F9 in the PR body; C4-F10 in `DataChartReviewFix3`
  (the mount option is captured and the precondition asserted unconditionally); lane B's §16 / §17 notes in §16 / §17.

The mutation campaign (§20.4) added ten pin tests (they kill the fifteen non-equivalent survivors) and removed a width-layout entry that
did nothing; its follow-up `f4db489` also removed the
engine's label-layout registration as redundant, which the real-browser re-run showed was a mistake (the production build drops the core's
own registration) — restored in `bb46b08` and now required by the bundle guard. Fail-first evidence is in §18, browser evidence in §15, the mutation proof in §20.4. Round 5 follows on the new
exact head.

## 22. Known limitations

- **Reference-line labels on horizontal bars and beside a secondary value axis** stay inside the plot (Review Fix 4 moves them out only
  for vertical columns without a secondary axis, where the right margin is free): with value labels on, such a label can still lie over a
  value label — the engine's overlap hiding covers value labels among themselves, not reference-line labels. The reference value is also
  on the value axis, and every value is in the table, the tooltip and the selection list.
- **The AI pairing check is a heuristic over free text** (§11): Review Fix 4 removed the misreadings the round-4 review found, but a
  phrasing outside the documented forms can still be misread, and a misread number that is another category's value refuses a correct
  chart (the refusal asks the model to check the request; the section repair is bounded) — the teacher can always author the chart directly.
- `src/questionTypes/coding.17e-b.test.tsx:435` (phase 17E, untouched by this branch) failed once in CI on `bb46b08`: its hidden-value canary
  `/…|9\.17|…/` matched the request timestamp `"expectedStartedAt":"…T23:05:19.176Z"` ("19.176" contains "9.17") — the same timestamp class
  as the 19D and 19C canaries below. No secret leaked. Proposed fix (outside this phase's scope, not applied): anchor it as `(?<!\d)9\.17`.
- The first local full run on `bb46b08` hit the documented flaky test `src/GovernancePanel.14b.test.tsx` (AGENTS.md §12: the 409 conflict
  alert); it passed when re-run alone and in the second full run (823 files, 10,936 tests).
- **Student path carries the pure chart contract**: the rich-content validator, which the Student Portal has loaded statically since 20D.1,
  now validates `dataChart` blocks, so the ChartSpec validator (6,151 B ≈ 6.0 KB gzip, no rendering code) rides with it. The initial graph carries
  no chart code at all, and the Portal's static closure carries no renderer, engine, editor or selection code (both bundle-guarded).
- AI-authored answer surfaces: the AI Composer authors chart stimuli only; `chartSelection` questions are teacher-authored.
- AI combos use one value axis (the secondary axis is a teacher-editor feature).
- Heat-map cells are not V1 answer targets; there is no zoom / brush / data zoom (never part of an answer by design).
- The real-browser certification and the performance figures come from a scratch harness outside the repository (the repository has no
  committed browser test runner); the unit / integration suites pin the behaviours it exercised with a fake engine.
- `src/questionTypes/composite.20d.test.tsx` ("fixture A: the shared passage renders ONCE…") is **not** a documented flaky test (AGENTS.md
  §12 registers only `GovernancePanel.14b`). Root cause (Review Fix 1, finding F5): the test's settle loop gives the lazy composite renderer a
  fixed 1.2 s (60 × 20 ms), and the test runner transforms that lazily imported module graph on first use — 0.9–1.2 s cold on the baseline,
  about 10 % more on this branch, whose rich-content modules validate charts. Run alone, the file failed 3 of 8 runs on this branch (the
  reviewer measured 4 of 9 here and 1 of 9 on the baseline). The fix warms the two lazy modules once in a `beforeAll`, so the settle loop
  waits for React rather than for the transformer; no assertion and no budget changed. After the fix: 0 failures in 12 runs.
- `api/tests/visual-questions-19d.test.js:204` (phase 19D; this branch changed only its catalog-size pin at line 40, declared) failed once
  in CI on `94cbfc1`. Root cause: its hotspot-secret
  pattern `/…|0\.617|…/` also matches the milliseconds of a timestamp in the submit response (`"startedAt":"…T17:49:50.617Z"` — a second
  ending in 0 and milliseconds 617; likewise 137, 181, 093, 413, 719 and 557), so the test fails whenever the clock lands there. No secret
  leaked. Proposed fix (outside this phase's scope, not applied): anchor the coordinate canaries with `(?<!\d)`, which still matches
  `"cx":0.617` and no longer matches `50.617Z`. The same class: `api/tests/parametric-numeric-19c-rf1.test.js` (phase 19C, untouched) failed
  once in round-3 lane A's run — its hidden-value canary `/29\.5/` can match a timestamp's milliseconds the same way; not patched here.
- Local full runs on the 4-core review container hit one timing failure each in two unrelated, untouched tests on the final tree:
  `src/AppEvaluationFinish.9g.test.tsx` (G3/G5, "Test timed out in 5000ms" — the same test timed out on the untouched baseline `ff13899`
  in this phase's first baseline run, with G6 and G7) and `src/phase8b.test.tsx` (the activity log's focus after «عرض المزيد»: `BODY`
  instead of `TR`; not reproduced in 5 isolated and 24 parallel stressed runs, so not root-caused; a likely mechanism, unconfirmed: the
  focus effect consumes its pending row on the first commit after the click, so an interleaved commit would drop the focus — Phase 8B
  code, not changed here). Neither is patched in this phase.
