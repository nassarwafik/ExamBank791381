# Phase 21A.2 — Enterprise Mathematical Function Graph Engine (design record — DRAFT / HANDOFF)

> STATUS: **IN PROGRESS — DRAFT PR #278, DO NOT MERGE.** This file is the handoff record written when work paused at code head `534fa65`; it is committed
> on top of it (the handoff commit is the branch head). It becomes the phase's design record; every section below must be completed before the PR is opened for review.
> Draft PR #278 is open for CI certification; this does NOT authorize production deployment or merge. The original handoff checkpoint below refers to the earlier pre-PR state.

## 1. Checkpoint

| Item | Value |
|---|---|
| Baseline | `6e4a5efcef8c2b6391344266405f31539d8c3e72` (merge of PR #277, Phase 21A.1) |
| Branch | `feature/21a2-mathematical-function-graph-engine` |
| Code head at handoff | `534fa650ec6fd9f2e4c88e0911e875776d721d94` (pushed; remote = local); this document is committed on top of it |
| `origin/main` | `6e4a5ef` — unchanged since branch creation ⇒ no reconciliation merge needed yet (re-check `git fetch origin --prune` before review) |
| Working tree | clean after the handoff commit |
| Uncommitted / unpushed implementation | none |

Worktrees (all scratch, under the session scratchpad — ephemeral, NOT part of the deliverable):

| Path | Commit | Purpose |
|---|---|---|
| `…/scratchpad/21a2/base` | `6e4a5ef` | baseline health gates (has a baseline `dist/` used for bundle comparisons) |
| `…/scratchpad/21a2/cap` | `6e4a5ef` | freeze-pin capture and the fail-first runs; holds UNTRACKED copies of the 21A.2 test files (scratch only) |
| `…/scratchpad/21a1/wt-rf7` | `fc73c77` | Phase 21A.1 Review-Fix-7 work the owner ordered STOPPED — never port or commit it |
| other `…/scratchpad/20*/…`, `…/21a/…`, `…/21a1/…` | older SHAs | historical worktrees of earlier phases; irrelevant |

## 2. Commits of Phase 21A.2

| SHA | Message | Purpose |
|---|---|---|
| `d18cfcb` | compatibility freeze and behavioural fail-first record on the untouched baseline 6e4a5ef | freeze pins (captured on 6e4a5ef) + 14 fail-first tests (expected to fail until implemented) |
| `3623683` | FunctionGraphSpecV1, expression language 3, owned SVG runtime and functionGraphSelection@1 | the main implementation step (contract, engine, runtime, rich block, answer type, server seams, editors, pins) |
| `534fa65` | (WIP, not wired, not tested): fail-closed AI function-graph descriptor mapper | preserves `src/aiComposer/composerGraph.ts` for handoff |
| (next) | this document | handoff / design-record draft |

## 3. Architecture decisions (made and implemented)

1. **Renderer: an OWNED, bounded SVG renderer**, split into a pure adapter (`graphScene.ts`: spec + view + pixel box → scene) and a
   React drawing component (`FunctionGraphView.tsx`, its own lazy chunk). **JSXGraph rejected**: 1.14.0 measured **993,978 B raw /
   257,331 B gzip** (monolithic distribution, MIT OR LGPL-3.0) — larger than the whole 21A.1 ECharts common engine (185 KB gzip), with its
   own plotting heuristics that would compete with the deterministic sampler, and weaker control of print / a11y. D3 not needed (no
   layout problem the scene cannot solve). **ECharts is NOT used** for function graphs (it stays the 21A.1 data-chart engine); there is
   no ECharts adapter in 21A.2 — the user-facing "ECharts adapter" item is not applicable.
2. **Contract separate from any renderer**: exam JSON carries only `FunctionGraphSpecV1` (closed keys, data only). No library options,
   callbacks, HTML, eval/Function. The renderer reads the validated value only; swapping it changes no JSON.
3. **ONE expression language**: the 19B/19C parametric engine gains **language 3** (= language 2 + sin cos tan asin acos atan ln + constants
   `pi`, `e`); `log` is **refused** in language 3 (`EXPR_AMBIGUOUS_LOG`: school log = base 10 vs language-2 log = natural). Same tokenizer,
   parser, AST, evaluator, limits. **Languages 1 and 2 are frozen** (pinned by `functionGraphSpec.21a2` EXPR1 and all 19B/19C suites).
   `parseConstraint` stays language 1/2 only (it maps any other value to 1; no caller passes 3).
4. **`parametricExpression.ts` extraction** (see §8): the expression core moved verbatim out of `parametricEngine.ts` so the student path
   ships the parser / evaluator (2.8 KB gzip) without the generator (the whole engine is 6.7 KB gzip).
5. **Expressions are stored exactly as authored** (strings); canonicalization never rewrites mathematics; numbers stay JSON numbers.
6. **Teacher mathematics is checked, never rewritten**: points `on` curves (filled ⇒ defined with that value; `open` ⇒ one-sided limit),
   authored derivative curves (`derivativeOf`) and tangent slopes vs a numeric derivative (smoothness = two step sizes agree AND one-sided
   slopes converge — a symmetric kink is not "smooth"), shaded regions over a continuous stretch, non-overlapping piecewise domains.
   Tolerance: 0.1 % of the viewport height (`GRAPH_LIMITS.onCurveTolerance`).
7. **Scope of curve kinds in 21A.2**: explicit `y = f(x)` (optional domain), **piecewise** (≤ 8 pieces, open/closed ends) and **parametric**
   `(x(t), y(t))` are IN. Implicit curves are DEFERRED (not robust without a contour algorithm; document as future version). Parameter
   sliders DEFERRED (parameters are named constants).
8. **Grading authority vs presentation**: grading reads semantic target keys only (`"point:p1"`, `"curve:f"`, …) — never pixels, coordinates,
   zoom or samples. Sampling is presentation only. Config + key re-validated by the shared authority before every comparison; invalid ⇒
   0 + manual review; malformed response ⇒ ordinary 0.
9. **Teacher-only semantics are stripped from every student projection** (`projectGraphForStudent`): point `role`, point `on`, line `role`,
   curve `derivativeOf`, tangent `slope`. None changes the drawing (roles are never rendered; an unauthored slope is computed). Applies to
   rich `functionGraph` blocks (projectRichContentForStudent) and to `functionGraphSelection` configs. Line role no longer drives the dash.
10. **Numerical analysis is editor-only and approximate** (`graphAnalysis.ts`): roots, y-intercept, extrema (slope-sign bisection ≈1e-8),
    intersections, vertical asymptotes (unbounded monotone growth over 14 decades or |f| > 10 viewports). Shown with ≈; added only by an
    explicit teacher action; never graded, stored implicitly or shown to students.
11. **Non-visual alternative contains authored values only** + a table of values at the x-axis ticks (what a sighted reader reads off the
    grid); never detected roots/extrema.
12. **AI is fail-closed** (WIP): expressions only when the teacher wrote them; numbers must occur in the request; no points/keys/roles.

## 4. Implemented contracts (IMPLEMENTED, not proposals)

FunctionGraphSpecV1 (validator: `src/functionGraphs/functionGraphSpec.ts`):

```json
{
  "version": 1, "id": "g-quad", "title": "منحنى الدالة التربيعية", "description": "…", "source": "optional",
  "viewport": { "xMin": -2, "xMax": 6, "yMin": -3, "yMax": 8 },
  "axes": { "x": { "label": "x", "grid": true, "step": 1, "ticks": "decimal" }, "y": { "label": "y", "grid": true } },
  "parameters": [{ "id": "a", "value": 1 }],
  "curves": [
    { "id": "f", "kind": "explicit", "label": "f(x)", "expression": "x^2 - 4*x + 3", "domain": { "min": -1, "max": 5, "minClosed": true, "maxClosed": false }, "style": { "line": "solid", "color": 1 } },
    { "id": "df", "kind": "explicit", "expression": "2*x - 4", "derivativeOf": "f" },
    { "id": "h", "kind": "piecewise", "pieces": [{ "expression": "x + 2", "domain": { "max": 0, "maxClosed": false } }, { "expression": "x^2", "domain": { "min": 0, "max": 2 } }] },
    { "id": "circ", "kind": "parametric", "x": "2*cos(t)", "y": "2*sin(t)", "t": { "min": 0, "max": 6.283185307179586 } }
  ],
  "points": [{ "id": "p1", "x": 1, "y": 0, "label": "A", "role": "root", "on": ["f"], "open": false }],
  "lines": [{ "id": "l1", "orientation": "vertical", "value": 2, "label": "L1", "role": "asymptote", "style": { "line": "dashed" } }],
  "tangents": [{ "id": "t1", "curve": "f", "x": 3, "kind": "tangent", "slope": 2, "label": "T1" }],
  "regions": [{ "id": "r1", "curve": "f", "lower": "df", "from": 0, "to": 1, "label": "R1" }],
  "intervals": [{ "id": "i1", "from": 0, "to": 2, "fromClosed": true, "toClosed": false, "label": "[0, 2)" }],
  "interaction": { "zoom": true, "pan": true, "trace": true, "crosshair": false }
}
```

- "Expression object": there is none — an expression is a string field of a curve / piece (`expression`, `x`, `y`), parsed by language 3;
  variable `x` (explicit / piecewise) or `t` (parametric) plus declared parameters only.
- Graph window = `viewport`; display options = `axes` + per-object `style` (`line` solid|dashed|dotted, `color` slot 1–6);
  interaction policy = `interaction` (all default true except `crosshair`).
- Rich block: `{ "type": "functionGraph", "graph": FunctionGraphSpecV1 }` (≤ 4 per document; unique graph ids per document).
- Question `functionGraphSelection@1`:
  `{ "presentationType": "functionGraphSelection", "questionTypeVersion": 1, "functionGraphSelection": { "v": 1, "graph": {…}, "target": "point", "mode": "multiple", "maxSelections": 2, "label": "اختر جذري الدالة" }, "answer": { "scoring": "partial", "correct": ["point:p1", "point:p2"] } }`
  — target ∈ curve | point | line | tangent | region | interval; mode single | multiple; scoring allOrNothing | partial (|S∩K| / |S∪K|).
- Student answer: `{ "kind": "functionGraphSelection", "graphId": "g-quad", "targets": ["point:p1"] }`.
- Ingest refusal codes: `GRAPH_SELECTION_ANSWER_INVALID`, `…_GRAPH_MISMATCH`, `…_TARGET_UNKNOWN`, `…_DUPLICATE`, `…_TOO_MANY`,
  `…_QUESTION_MISMATCH` (wrong question / compound part).
- AI descriptor (WIP, unwired): `{ title, description, xMin|null, xMax|null, yMin|null, yMax|null, curves: [{ label, expression, domainMin|null, domainMax|null }] (1–4) }`.

## 5. Bounds (implemented)

| Bound | Value | Where |
|---|---|---|
| expression chars / tokens / AST nodes / depth / function args | 500 / 200 / 160 / 32 / 10 | parametricExpression `PARAMETRIC_LIMITS` |
| value magnitude / integer exponent | 1e15 / ±64 (fractional power of a negative base = domain error) | evaluator |
| coordinates, viewport, parameters, domains | finite, ±1e6; viewport span ≥ 1e-6 | `GRAPH_LIMITS.coordAbs`, `minSpan` |
| curves / pieces / total expressions / parameters | 8 / 8 / 16 / 8 | `GRAPH_LIMITS` |
| points / lines / tangents / regions / intervals / `on` list | 40 / 12 / 8 / 6 / 8 / 8 | `GRAPH_LIMITS` |
| serialized graph | 65,536 B (refused before parsing) | `GRAPH_LIMITS.serializedBytes` |
| axis ticks | ≤ 200 per axis for an authored step | validator |
| sampling | base 16–2000 intervals (renderer: plot width, 64–1200), depth ≤ 14, refinement ≤ 16,000 (hard cap 64,000), boundary bisection 24 | `SAMPLING_LIMITS` |
| scene work | 3,000,000 AST-node evaluations shared by all curves | `SCENE_LIMITS.workBudget` |
| zoom | factor clamped 0.05–20 per step; view span 1e-4 … 4e6; pan clamped to ±1e6 | `zoomView` / `panView` |
| rich graphs per document | 4 | `RICH_LIMITS.functionGraphs` |
| selection response | ≤ 64 targets, ≤ maxSelections | `FUNCTION_GRAPH_SELECTION_LIMITS` |
| analysis | 600 grid points, ≤ 40 features | `ANALYSIS_LIMITS` |

No arbitrary JS: expressions are parsed by a closed grammar; forbidden identifiers (prototype names) refused at tokenization; text fields
refuse markup, control, bidi-override and default-ignorable characters; unknown keys refused (never dropped); validation never throws.

## 6. Bundle / performance (measured on the working tree committed as `3623683`; not re-measured at `534fa65`, which only adds an unimported module)

| Measure | Baseline 6e4a5ef | 21A.2 |
|---|---|---|
| initial JS graph (budget 125 KB) | 124.6 KB gzip (127,588 B) | **124.9 KB (127,864 B) — 136 B headroom** |
| new lazy chunks | — | FunctionGraphView 8.1 KB (runtime + scene), GraphEditor 6.6 KB, graph authority chunk ("graphTargets", contract + validator + sampler + targets) 10.1 KB, parametricExpression 2.8 KB, functionGraphSelectionQuestion 2.7 KB (gzip) |
| Student Portal static closure beyond initial | 91.0 KB gzip | **104.2 KB (+13.2 KB)**: the graph authority + expression core now reach students through richContentModel (validateRichContent). The SVG runtime stays lazy. |
| bundle guard | passed | passed (after removing `preserveAspectRatio`, which the Learning-Reader visual signature matched) |

Initial-graph growth (+276 B gzip) = catalog row, defaults, answered predicate, lazy-registry preload maps (StudentQuestionCard).

## 7. Tests and gates actually run

| Command | Tree | Result |
|---|---|---|
| `baseline.sh` (tsc -b, lint, build+bundle guard, npm test, git diff --check) | 6e4a5ef worktree | all exit 0; **831 files / 11,052 tests passed**; lint 104 warnings, 0 errors; initial JS 124.6 KB |
| `CAPTURE_21A2=1 npx vitest run api/tests/certification-21a2/cert-21a2-compat-freeze.test.js` | 6e4a5ef (cap worktree) | 33/33 pass; pins written |
| same, without CAPTURE | branch at d18cfcb | 33/33 pass |
| fail-first (`cert-21a2-fail-first.test.js` + `functionGraphFailFirst.21a2.test.tsx`) | 6e4a5ef (cap), twice | **14/14 FAIL** (behavioural assertions; logs in scratch `ff-baseline.log`, `ff-baseline-2.log`) |
| `npx vitest run src/functionGraphs/functionGraphSpec.21a2.test.ts` | pre-commit tree of 3623683 | 26/26 pass |
| parametric / functionStudy / aiParametric suites + `src/functionGraphs` + drift + parametric-19b | tree == 3623683 (after the core split) | 12 files, 161 tests: 160 pass, 1 fail (19B purity guard, then extended → `src/parametricEngine.test.ts` 18/18 pass) |
| catalog-pin suites (src/questionTypes, src/composite, catalog, 8 api suites) | before the core split / FF6 correction | 40 files: 703 pass, 1 fail (FF6, then corrected → 3/3 pass) |
| `npm run build` (tsc -b + vite + bundle guard) | tree == 3623683 | exit 0, bundle guard passed |
| `npm run lint` | 534fa65 | exit 0, 104 warnings (= baseline), 0 new |
| `npx tsc -p tsconfig.app.json --noEmit` | 534fa65 | exit 0 |
| `git diff --check origin/main...HEAD` | 534fa65 | exit 0 |
| `npm test` (full root suite) | 534fa65 | see §7a |

Not yet run: browser / Chromium certification, print PDF, mutation campaign, CI (no PR).

### 7a. Full root suite at 534fa65 (`npm test`, local, run after the push)

**835 files: 827 passed, 8 failed · 11,125 tests: 11,114 passed, 11 failed** (exit 1). Log: scratch `21a2/head-test-534fa65.log`.

| Class | Failing tests | Cause / required action |
|---|---|---|
| A. expected (fail-first / pending work) | `cert-21a2-fail-first` FF4 ×2 | AI wiring not done (§12 steps 1–4) |
| A. expected (pending work) | `cert-20g-capability-matrix` ×3 | needs the 21A.2 acceptance exam + coverage-map regeneration (§12 step 8) |
| B. real — pins / inventories not yet updated by this phase (not product regressions; each must be updated with an annotated 21A.2 comment, never weakened) | `src/StudentExamPage.ux7b1.test.tsx:423` ("no new answer shape": pins the exact `Answer` union text of `answerState.ts`) | add `\|{kind:"functionGraphSelection";graphId:string;targets:string[]}` after the chartSelection member in the pinned string (as 21A.1 did) |
| B. | `src/deploymentRecovery.inventory.11d.test.ts` (lazyWithRetry recovery keys: 24 found vs 23 listed) | add `["./AssignmentReview.tsx", "FunctionGraphSelectionReview", "./functionGraphs/FunctionGraphSelectionReview", "teacher-graph-review"]` to the table next to line 36 |
| B. | `src/presentationFreeze.20d1.test.tsx` L-9 (catalog identities pinned at 26) | append `functionGraphSelection@1` after `chartSelection@1` with the annotation "21A.2 adds functionGraphSelection: 27 types" |
| B. | `src/richContent/richContentChart.21a1.test.ts` RC1 ("older reader's vocabulary … dataChart is appended") | expect `[...baseline15, "dataChart", "functionGraph"]` (functionGraph appended after dataChart, never inserted) |
| B. | `src/richContent/richContentModel.20d1.test.ts:40` and `src/richContent/richContentRenderer.20d1.test.tsx` (documented block vocabulary) | append `"functionGraph"` with a 21A.2 annotation |
| C. known flaky | none observed in this run (GovernancePanel.14b passed) | — |

No other failure. The 19B / 19C / functionStudy / composite / 21A / 21A.1 suites, the 21A.2 freeze (33) and the shared-finalization drift
test all passed in this run.

## 8. Parametric expression extraction (DONE)

- Moved VERBATIM from `src/parametricEngine.ts` to `src/parametricExpression.ts`: `PARAMETRIC_LIMITS`, function lists v1/v2/v3,
  arity tables, `PARAMETRIC_FORBIDDEN_IDENTIFIERS`, `PARAMETRIC_ID_RE`, `PARAMETRIC_CONSTANTS_V3`, types (`ExprNode`, `ParametricLanguage`,
  `ParseOptions`, `ParametricIssue`, `ComparisonOp`, `ParsedConstraint`, `EvalResult`), tokenizer, `Parser`, `parseExpression`,
  `parseConstraint`, the evaluator (`bounded`, `powInt`, `normalize12`, `powV2`, `roundTo`, `evalNode`), `evaluateExpression`,
  `evaluateConstraint`, `isReservedParametricId` / `V2` / `V3`.
- Remains in `parametricEngine.ts`: `PARAMETRIC_GENERATOR_VERSIONS`, integer variables, templates, formats, V2 variable grids, derived
  variables, `explainConstraint`, generation identity, the seeded generator. It does `export * from "./parametricExpression"`.
- Public API: every pre-existing export name is still exported by `parametricEngine.ts` (re-export). New exports: language-3 names
  (`PARAMETRIC_FUNCTIONS_V3`, `ParametricFunctionV3`, `PARAMETRIC_CONSTANTS_V3`, `isReservedParametricIdV3`) and the helpers `powInt`,
  `roundTo` (exported only so the generator can keep using them).
- Behaviour: languages 1 and 2 unchanged (verbatim move; `options.language === 2 ? 2 : 1` became `=== 3 ? 3 : === 2 ? 2 : 1`; the AST-node
  budget / `^`→pow rules apply to "language !== 1", i.e. 2 and 3). `src/functionStudyModel.ts` is UNCHANGED (still language 2 through the
  re-export).
- Guard: `src/parametricEngine.test.ts` "the engine is pure…" now scans BOTH modules; the core has no imports; the engine's only import is
  its core.
- Compatibility evidence run: all `src/*parametric*` / `functionStudy*` / `aiParametric*` suites, `api/tests/parametric-numeric-19b.test.js`,
  `api/tests/shared-finalization-drift-14a.test.js` → pass after the guard extension. **Invariant: 19B/19C parametric behaviour and the
  20A.2 functionStudy behaviour must stay unchanged** — the full root suite at the final head must prove it again.

## 9. Fail-first and freeze evidence

- Freeze (`cert-21a2-compat-freeze.test.js`, 33 tests, pins `freeze-21a2-pins.json` captured on 6e4a5ef): for all 28 committed fixtures
  (incl. the 21A.1 chart exam) — import, export, canonical save, finalization, student projection, grading (blank + deterministic
  synthetic answers incl. chartSelection), rich-block vocabulary of the baseline still accepted; the AI catalog prompt may change only by
  the declared delta: the catalog version token, the `Rich blocks:` line may only EXTEND (new line must start with the old line minus its
  final "."), and new lines must start with `Function graphs`. Fixture dir `docs/fixtures/function-graphs-21a2` is excluded from the corpus.
- Fail-first (14): FF1 rich block accepted / hostile expression refused by the graph authority; FF2 known type, import opens, no
  finalization blocker, export → re-import → canonical keep the math; FF3 ingest (accept + forged refusals with codes), grading 8 / 2,
  student projection (no key, no roles, no on, no asymptote role); FF4 AI catalog line + explicit request accepted / described function
  refused at `stem[0].graph.curves[0].expression`; FF5 renderer draws figure/curve/points/description; FF6 registries + same answer from
  list and pointer.
- Current state (last runs): FF1, FF2, FF3, FF5, FF6 pass; **FF4 (2 tests) FAIL by design until the AI wiring lands.**
- Declared spec refinements made BEFORE they passed (both still fail on 6e4a5ef): FF1/FF3 now expect the teacher-only semantics to be
  stripped from student projections; FF6 asserts registry resolution (studentUnsupported is a fallback predicate, true for every
  non-legacy key).
- Intentional deltas outside the new files: catalog identity pins 26 → 27 (annotated, 21A.1 convention); composite child vocabulary +1;
  catalog order + `functionGraphSelection` after `chartSelection`; 19B purity guard extended to the split module.

## 10. Phase status (estimate ≈ 50 %)

DONE: baseline gate · compatibility freeze · fail-first suites · architecture audit · renderer decision · expression extraction ·
FunctionGraphSpecV1 · validator · deterministic sampler · discontinuity / pole / domain-boundary handling · multiple / piecewise /
parametric curves · question type + registries · answer ingest · grading · sanitizer / student projection · shared build parity.

PARTIAL (code written, verification missing): axes/grid/ticks/scaling (no scene unit tests) · zoom / pan / reset / trace / crosshair (no
tests) · rich-content block editing UI (untested) · interactive answer surface (one interaction test) · teacher authoring (GraphEditor,
FunctionGraphSelectionEditor — untested) · live preview · scenario / composite (identity, review and projection wired; no lifecycle test) ·
import / export (FF2 only; no acceptance exam) · publishing / finalization (FF2 only) · teacher review views (untested) · print (CSS + print
copy when zoomed; no PDF) · RTL / bidi (bdi/dir handling; not browser-verified) · accessibility (structure only) · mobile / responsive (not
verified at 320–1280) · bundle / lazy loading (guard passes; no graph-specific guard signatures yet) · security / adversarial (validator
tests; no adversarial certification suite) · AI Composer (mapper written, unwired, untested).

NOT STARTED: acceptance exam A–I + generator + drift test · lifecycle certification with personas · capability-matrix disposition (BLOCKED
on the acceptance exam; 3 tests fail now) · browser certification · performance measurements of validation / scene · mutation campaign ·
complete design record · PR · exact-head CI · independent review · merge (owner only).

## 11. Open problems

0. HIGH — six pin / inventory tests not yet updated for the new type and block (§7a class B): ux7b1 Answer-union text, 11D recovery-key
   inventory, 20D.1 L-9 catalog pin, 21A.1 RC1 block order, 20D.1 block-vocabulary pins (model + renderer).
1. HIGH — `api/tests/certification-20g/cert-20g-capability-matrix.test.js`: 3 tests fail (`functionGraphSelection@1` and
   `child:functionGraphSelection@1` have no disposition; coverage map differs). Needs the 21A.2 acceptance exam in `EXAMS` + regenerated
   `docs/fixtures/certification-20g/coverage-map.md` (`WRITE_20G_FIXTURES=1`; verify the five exam fixtures are byte-identical after).
2. HIGH — FF4 failing: AI not wired (`composerRich`, `composerCatalog` V4 + prompt line, `composerPatch` graph-id renumbering,
   `composerFakeAi` RB_BASE `graph: null`). Expect pins naming `AI_COMPOSER_CATALOG_V3` (e.g. `composerChart.21a1.test.ts`) to need the
   annotated V4 update.
3. HIGH — initial bundle headroom only 136 B: any further initial-path addition breaks the 125 KB budget (must not be raised).
4. MEDIUM — Student Portal static closure +13.2 KB gzip (graph authority + expression core via richContentModel). Accept with
   documentation or find a reduction; the SVG runtime is already lazy.
5. MEDIUM — no unit/UI tests for `graphScene.ts`, `FunctionGraphView` (keyboard trace, zoom, pan, reset, wheel+ctrl, pinch, readout,
   alternative table, print copy), `GraphEditor`, `FunctionGraphSelectionEditor` (key pruning, kind-change confirm, single mode, bound),
   review components, rich-editor graph block (add, duplicate → fresh id, type-change handling).
6. MEDIUM — validation cost on the grading path (`authorityOf` re-validates the config, incl. on-curve / region / derivative checks) is not
   measured; add a worst-legal-graph timing test.
7. MEDIUM — `composerGraph.ts` heuristics (`statedFormulas`, `requestNumbers`) untested; edge cases: English requests, "ln x", "e^x" vs
   "exp(x)", numbers inside the formula accidentally matching a viewport bound (accepted by design, as in 21A.1).
8. LOW — `functionGraphSpec.21a2.test.ts` SAMPLE1 tan test contains a vacuous assertion (`breaks.length + 0 >= 0`); strengthen.
9. LOW — curve label placement has no collision avoidance; long Arabic labels may overlap on phones.
10. LOW — residual leak: teacher-chosen ids / labels are visible to students (the editor generates neutral ids; document guidance).
11. LOW — the shared fixture `rationalGraph` styles asymptote lines dashed and the reference line dotted — a "select the asymptotes"
    question built on it would be given away by style; the acceptance exam must use uniform styles for selection questions.
12. LOW — `parseConstraint` silently treats language 3 as 1 (no caller passes 3); document or guard.
13. LOW — the selection list shows point coordinates and the alternative shows a table of values (equivalent to the visual grid; accepted
    design decision — record it).
14. INFO — GovernancePanel.14b known flaky test policy applies (do not patch it in this PR).

## 12. Exact next actions

0. Update the six class-B pins of §7a (exact edits listed there), then `npx vitest run src/StudentExamPage.ux7b1.test.tsx
   src/deploymentRecovery.inventory.11d.test.ts src/presentationFreeze.20d1.test.tsx src/richContent` — must be green.
1. Wire the AI: in `src/aiComposer/composerRich.ts` import `buildAiGraphSchema, mapAiGraph`; add `graph: sNull(buildAiGraphSchema())` to
   `buildRichBlockSchema`, `"graph"` to `BLOCK_KEYS`, a `graph` plain-record check, and `case "functionGraph"` (graph null ⇒ fail;
   `mapAiGraph(b.graph, i, chartPolicy, p + ".graph")`; push `{ type: "functionGraph", graph }`).
2. `src/aiComposer/composerCatalog.ts`: add `"functionGraph"` to `COMPOSER_RICH_BLOCKS`; `COMPOSER_CATALOG_VERSION = "AI_COMPOSER_CATALOG_V4"`
   (+ comment); `functionGraphs` catalog field; `Rich blocks:` line = old line (filter out `dataChart` AND `functionGraph` from the list)
   + `"; dataChart (…)"` + `"; functionGraph (a declarative mathematical function graph — see Function graphs)."`; add a line starting
   `Function graphs: ` (explicit-function-only rule, language 3 summary, 1–4 curves, null viewport ⇒ default, never invent points / answers).
3. `src/aiComposer/testing/composerFakeAi.ts`: `RB_BASE` gains `graph: null`. `src/aiComposer/composerPatch.ts`: `renumberCharts` also
   renumbers `functionGraph` ids (`"graph" + n`).
4. `node scripts/build-shared-finalization.mjs`; run `npx vitest run src/aiComposer api/tests api/tests/certification-21a2`; update
   catalog-version pins with an annotated 21A.2 comment; the freeze test must stay green.
5. Unit tests `src/aiComposer/composerGraph.21a2.test.ts` (stated formulas, numbers incl. π, refusals, injection-like output, ids, policy).
6. Acceptance exam: `scripts/function-graphs-21a2-exam.mjs` (builder from `src/functionGraphs/testing/graphFixtures.ts`: A quadratic,
   B rational, C sine, D piecewise, E intersection, F tangent/derivative, G area, H Arabic, I composite with a graph source + selection
   child), `scripts/generate-function-graphs-21a2-fixture.mjs`, fixture `docs/fixtures/function-graphs-21a2/ExamBank_21A2_Function_Graphs_Mini_Acceptance.json`,
   drift test `api/tests/certification-21a2/cert-21a2-fixture-drift.test.js` (mirror the 21A.1 files).
7. Lifecycle certification `api/tests/certification-21a2/cert-21a2-graphs-lifecycle.test.js` (mirror `cert-21a1-charts-lifecycle`:
   import/export exactness, finalization, publish/assign, delivery without key/roles, autosave/restore, PERFECT / PARTIAL / BLANK /
   ATTACKER ledgers, idempotent submit, review).
8. Add `ACCEPTANCE_21A2` to `EXAMS` in `cert-20g-capability-matrix.test.js`; regenerate `coverage-map.md` with `WRITE_20G_FIXTURES=1`;
   `git diff docs/fixtures/certification-20g` must show only the coverage map.
9. `scripts/check-bundle-budget.mjs`: function-graph signatures (e.g. `fg-stage`, `graph-editor`, `qt-editor-functionGraphSelection`)
   absent from the initial graph; runtime / editor absent from the Student Portal static closure; report the chunk sizes.
10. UI tests for item 5 of §11; scene tests (ticks incl. π, clamping, endpoints, tangent/normal geometry, regions, intervals).
11. Adversarial certification `cert-21a2-adversarial.test.js` (injection, unknown functions, prototype keys, deep / long / complex ASTs,
    huge exponents, division by zero, NaN / Infinity, malformed piecewise, duplicate ids, forged answers, bidi labels, oversized arrays,
    CPU bounds with timing, executable-looking AI output).
12. Performance numbers: worst legal graph validation time; scene build time at 320 / 1280 px; sampler evaluations.
13. Browser certification (Chromium at `/opt/pw-browsers`): 320 / 360 / 600 / 800 / 1024 / 1280 px, touch, keyboard, RTL, print PDF
    (reuse the 21A.1 browser-harness approach).
14. Targeted mutation campaign (~30–40: parser language 3, validator checks, sampler break / boundary logic, target keys, key pruning,
    binder, scorer, projection) with hash-verified restore; never concurrent with other test runs.
15. Complete this design record; full validation (`npm test`, `npm run lint`, `npx tsc -b`, `npm run build`, `git diff --check`).
16. Open the PR "Phase 21A.2 — Enterprise Mathematical Function Graph Engine", first line `⛔ DO NOT MERGE — OWNER CERTIFICATION
    REQUIRED`, auto-merge OFF; exact-head CI; ONE independent read-only review; fix BLOCKER / real MAJOR findings; ask the owner before
    any second broad review round.

## 13. PR / CI / merge blockers

No PR, no CI run on any 21A.2 SHA (branch pushes trigger no workflow). Merge blockers: everything NOT STARTED / PARTIAL in §10, the
failing capability matrix and FF4, full green root suite at the final head, exact-head CI (Quality Gate, Runner security & smoke, Build and
Deploy), independent review, owner merge.


## 14. Post-handoff work — 9 October 2026 (owner-authorized continuation)

- PR **#278** opened as a **DRAFT** with `⛔ DO NOT MERGE — OWNER CERTIFICATION REQUIRED`; `main` was not changed.
- 21A.2 compatibility pins updated for the additive answer type, recoverable lazy view, 27-type catalog, and functionGraph rich block. The 21A.1 frozen corpus excludes the *new 21A.2* acceptance fixture, while allowing only the declared `Function graphs:` catalog line; original baseline pins remain unchanged.
- AI fail-closed graph descriptor integrated with `composerRich`, composer catalog V4 and domain-patch id collision handling. Backward-compatible reading of pre-V4 block descriptors (with an absent `graph` key only on pre-existing block kinds) is intentional; new provider schema requires a closed `graph` field and new functionGraph requires a valid graph object.
- Added `src/aiComposer/composerGraph.21a2.test.ts` with provenance, strict schema and adversarial refusal cases.
- Added nine-section 38-mark acceptance exam (`scripts/function-graphs-21a2-exam.mjs`, generator, JSON fixture), a byte-drift guard, and a focused import / grading / projection test. Sections A–I cover quadratic, rational, sine, piecewise, intersection, tangent, area, Arabic, and composite graphs.
- Added `21A2` as a live acceptance entry in the 20G capability matrix; `functionGraphSelection@1` and its composite child disposition are documented.
- **Shared-finalization synchronization**: a temporary read-only GitHub Actions mirror audit regenerated all CommonJS files with locked dependencies and printed generated outputs; the CJS mirror was updated using GitHub connector. On branch head `8fac2f26`, a fresh run of the mirror audit reported an **empty generated diff**, proving TypeScript/CJS parity at that specific head.
- An earlier CI gate on a pre-fix head was RED (legacy AI descriptors, V3 pins, old 21A.1 fixture inventory, missing matrix disposition, and shared mirror drift); these have been addressed in subsequent commits. Do NOT use that old failure list as a claim about the current head. A new exact-head full gate is still required.
- Security & Smoke Runner previously passed on a pre-latest PR head; rerun on the exact final commit before merge.

### Remaining **hard blockers**

1. Full **exact-head** green test, TypeScript, lint and bundle budget (the initial graph was near its ceiling at handoff).
2. Extended 21A.2 lifecycle certification on the actual platform (governance, publish/assign, autosave and teacher review), broader malicious payload suite, UI/RTL/browser/print tests, performance bounds and 30–40 mutations.
3. Independent read-only review and remediation of real blockers, and a final **owner certification** before merge.
4. The temporary read-only mirror-audit workflow must be deleted before final certification (it is an implementation aid, not a product workflow).

No assertion of merged, deployed, or feature-complete status is made here.


## 15. Exact-head CI evidence and remaining owner gates — 9 October 2026

This section supersedes the *CI status* in §13 and §14, which describe earlier heads and must not be interpreted as live failures.

- Verified PR #278 remains **DRAFT**, unmerged, targeting `main` at `6e4a5efcef8c2b6391344266405f31539d8c3e72`.
- Verified exact branch head: `067a69f75b0e362247c84da617c06bfd47130571` (strict lazy-composer bundle marker V4).
- Exact-head CI **SUCCESS**: Azure Static Web Apps CI/CD workflow run `37899342002` (Quality Gate / Tests & Build and Build & Deploy); Coding Runner Security & Smoke Tests run `37899341927`; Phase 21A2 Real Chromium Certification run `37899342006`.
- The previous `a7542a13` failure of eight tests is **historical**, not a current-head claim. The exact-head lint gate reports **105 warnings, zero errors**; existing baseline warnings must not be silently counted as feature failures.
- Additional files subsequently committed: `cert-21a2-platform-lifecycle.test.js`, `cert-21a2-adversarial.test.js`, `functionGraphUx.21a2.test.tsx`, `graphScene.21a2.test.ts`, `functionGraphPerformance.21a2.test.ts`, plus the real-Chromium certification workflow and browser harness. Their inclusion is evidenced by the branch tree and exact-head passing workflows; the exact ledger should be preserved before owner sign-off.

### Still open — do not merge

1. **Targeted mutation campaign (30–40)** with reproducible mutant IDs, test-kill ledger, equivalence analysis, and hash-verified clean restoration. The hostile-payload certification is not a substitute for mutation testing.
2. **One independent read-only review** at an explicitly pinned, final head, with BLOCKER/MAJOR remediation and requalification as necessary. The PR currently has no submitted review.
3. **Final consolidated certification report**: exact test counts, lint baseline comparison, performance timings, bundle and CJS mirror check, Chromium device/RTL/touch/keyboard/print findings, and CI links from the final head.
4. **Explicit owner approval** prior to merging PR #278. Keep auto-merge disabled and PR in DRAFT until the review gates are satisfied.

No assertion of full enterprise certification, independent approval, or merge is made by this update.
