# Phase 20A.2 — SmartSim Enterprise Pilot Certification

Status: implemented on `feature/20a2-smartsim-enterprise-pilots` (baseline `44d0f21`, the merge of #265). Owner review required
before merge.

## 1. Purpose

Phase 20A/20B built the trusted plugin framework (`smartSim@1`) and its first plugin (`networkTopology@1`); Phase 20A.1 hardened
the universal contracts (descriptors, vocabulary, semantic actions, generic rules, catalog). 20A.2 **certifies** that contract with
two production plugins from two unrelated subjects:

| Identity | Domain | What the student does |
|---|---|---|
| `physicsFreeFall@1` | physics | runs / scrubs a vertical free-fall animation, then submits measurements and graph points |
| `functionStudy2d@1` | mathematics | studies a public function on a graph and submits a structured analysis (domain, intercepts, asymptotes, extrema, monotonicity) |

The certification question is whether the SmartSim Core could host both **without domain-specific core changes**. Answer: yes —
no Phase 20A.1 core module changed (section 13).

## 2. Plugin identities and exact versioning

* Both plugins are repository code registered in `src/trustedSimPlugins.ts` (the production set is now `networkTopology@1`,
  `physicsFreeFall@1`, `functionStudy2d@1`). Exam JSON only **names** an identity.
* Resolution is exact: `physicsFreeFall@2`, `"1"`, `PhysicsFreeFall@1` resolve to nothing; finalization blocks
  (`SMARTSIM_PLUGIN_UNKNOWN`), the grader fails closed (0 + manual review), the student sees an explicit unavailable state.
* The UI registry (`src/trustedSim/smartSimUiRegistry.ts`) maps each exact identity to three **literal** lazy imports.
* Each plugin ships a code-owned descriptor (`PHYSICS_FREE_FALL_DESCRIPTOR_V1`, `FUNCTION_STUDY_DESCRIPTOR_V1`); tests pin
  `descriptor.actionKinds` ↔ the normalizer and `descriptor.checkKinds` ↔ the plugin's check kinds.
* The question-type catalog stays at **24**: neither pilot is a question type.

## 3. Architecture

```
exam JSON (data only) ── smartSim: { schemaVersion, pluginKey, pluginVersion, config }   answer: { scoring, checks }  (private)
          │
SmartSim Core (unchanged): envelope authority · exact registry · replay · presentation-prefix guard · weighted scoring · generic rules
          │                                               │
physicsFreeFall@1 (physicsFreeFallModel + Plugin)   functionStudy2d@1 (functionStudyModel + Plugin) ── parametricEngine (language 2)
          │                                               │
lazy UI: FreeFallWorkspace / Editor / Review        lazy UI: FunctionStudyWorkspace / Editor / Review
```

The pure modules (`physicsFreeFallModel.ts`, `physicsFreeFallPlugin.ts`, `functionStudyModel.ts`, `functionStudyPlugin.ts`) are
compiled into the shared server build (`scripts/build-shared-finalization.mjs` → `api/src/lib/shared-finalization/`): the server
validates, replays, grades and reviews with byte-identical logic (parity and drift tests).

## 4. Free Fall model (`physicsFreeFall@1`)

* Vertical 1D free fall, SI units; `y = 0` is the ground, `+y` is up; constant gravity `g` (a positive magnitude); no air
  resistance; mass is not modelled (it does not change the motion).
* `y(t) = h0 + v0·t − ½·g·t²`, `v(t) = v0 − g·t`.
* Impact time = the **positive** root of `y(t) = 0`: `(v0 + √(v0² + 2·g·h0)) / g`, computed as `2·h0 / (√D − v0)` when `v0 ≤ 0`
  (algebraically equal, no cancellation).
* Impact speed = `√(v0² + 2·g·h0)` — a **magnitude** (the energy form, exactly `|v(t_impact)|`).
* Config `{ v: 1, model: { initialHeight, initialVelocity, gravity }, view: { maxTime, showVelocityGraph }, tasks: { measurements:
  [{ id, label, unit }], points: [{ id, label }] } }`, strict exact keys at every level. Bounds: `0 ≤ h0 ≤ 10000 m`,
  `|v0| ≤ 1000 m/s`, `0.1 ≤ g ≤ 100 m/s²`, `0 < maxTime ≤ 600 s` **and** `maxTime ≥ t_impact` (`FREEFALL_VIEW_TOO_SHORT`),
  `h0 = 0` requires `v0 > 0`; units `s`, `m`, `m/s`; ≤ 12 measurements and ≤ 12 points; labels ≤ 80 characters. NaN, Infinity,
  strings, nested objects and unknown keys are refused; nothing is clamped.
* The engine is plain arithmetic: no clock, randomness, DOM or animation state (a source-scan test pins this).

## 5. Function Study model (`functionStudy2d@1`)

* Config `{ v: 1, expression: { language: 2, variable: "x", source }, window: { xMin, xMax, yMin, yMax, sampleCount }, tasks:
  { domainExclusions, xIntercepts, yIntercept, verticalAsymptotes, horizontalAsymptotes, extrema, monotonicIntervals } }` — tasks
  are booleans, at least one on. `xMin < xMax` within ±10⁴, `yMin < yMax` within ±10⁶, `sampleCount` an integer 50…2000.
* **Why the existing parametric parser was reused**: `src/parametricEngine.ts` (language 2) already is the repository's audited
  expression authority — tokenizer → recursive-descent parser → bounded AST (≤ 500 characters, ≤ 160 nodes) → bounded evaluator
  (finite, |v| ≤ 10¹⁵, division by zero / domain errors as codes, transcendental results normalized). A second evaluator would be a
  second attack surface. `compileFunction` adds one rule: the only free identifier is `x` (`FUNCSTUDY_VARIABLE_UNDECLARED`).
  Member access, globals, strings, arrays, objects, assignment, statements, arrow functions, `eval` / `Function` / `import` are
  impossible by construction (pinned by a 25-input test).
* **Why no symbolic CAS in v1**: a CAS is a large dependency and a large semantic surface (simplification, branch cuts, numerical
  vs exact equality). The analytical truth is the teacher's **private key** with an explicit tolerance; the graph is presentation.
* Sampling (presentation only): the fixed grid `x_i = xMin + i·(xMax − xMin)/(n − 1)` (exactly `n` evaluations); the path breaks at
  every evaluation error and at every jump larger than the window height whose midpoint is not between its ends (asymptote). It
  never decides a grade.

## 6. Semantic actions (presentation is never an action)

| Plugin | Actions | Refused examples |
|---|---|---|
| physicsFreeFall@1 | `measurement.set { measurementId, value }`, `measurement.clear { measurementId }`, `graphPoint.set { pointId, t, y }` (`0 ≤ t ≤ maxTime`), `graphPoint.clear { pointId }` | `simulation.play`, `simulation.pause`, `timeline.scrub`, `animation.frame`, `playback.restart`, extra keys, undeclared ids, `|value| > 10⁶` |
| functionStudy2d@1 | `domain.setExclusions { values }`, `intercepts.setX { points }`, `intercept.setY { y \| null }`, `asymptotes.setVertical { values }`, `asymptotes.setHorizontal { values }`, `extrema.set { points: [{kind: min\|max, x, y}] }`, `intervals.set { intervals: [{kind: increasing\|decreasing, from: number\|"-inf", to: number\|"+inf"}] }` | duplicates (incl. `0` / `-0`), > 20 items, `from ≥ to`, `"+inf"` as a start, JS `-Infinity`, a disabled task group, `camera.zoom`, `graph.zoom`, `point.drag`, `probe.move` |

Camera / view / pointer / hover / wheel / UI prefixes are refused by the core for every plugin (`SMARTSIM_ACTION_PRESENTATION_ONLY`).
Play, pause, scrubbing and frames happen only in React state; a 10-second animation stores **zero** actions. The workspaces compact
the list: a later decision on the same task replaces the earlier action (the replayed state is identical).

## 7. Canonical states

* Free fall: `{ v: 1, measurements: { id: value }, points: { id: { t, y } } }` — ids sorted; no time, frame, camera or play state.
* Function study: `{ v: 1, domainExclusions, xIntercepts, yIntercept: { x: 0, y } | null, verticalAsymptotes,
  horizontalAsymptotes, extrema, monotonicIntervals }` — sets sorted, intervals by start (−∞ first); independent of entry order.
* The server never stores a client state: ingest replays and stores the replayed state; the grader replays again.
* Measured answer sizes (ingested, serialized): free-fall certification answer **665 bytes** (state 170 B), function-study
  certification answer **1,118 bytes** (state 453 B) — pinned < 4 KB.

## 8. Grading

* Free fall checks (private): `physics.impactTime`, `physics.impactSpeed`, `physics.heightAtTime { time }`,
  `physics.velocityAtTime { time }` (expected value **derived from the public model**; measurement unit must fit the kind; `time`
  must lie inside the flight), `physics.pointOnTrajectory { pointId }` (`0 ≤ t ≤ t_impact` and `|y − y(t)| ≤ tol`), plus the opt-in
  generic `numericNear@1` / `pointNear@1` through a neutral rule view (values = measurements, points = `(x = t, y)`).
* Function study checks (private): `domain.exclusions`, `intercepts.x`, `intercept.y`, `asymptotes.vertical`,
  `asymptotes.horizontal`, `extrema.points`, `monotonic.intervals`, each `{ expected, tolerance }`. Comparison is a **set**
  comparison (same size, canonical order, every pair within tolerance; extremum and interval kinds must match; an infinite endpoint
  only matches the same infinity). An **empty** expected answer is refused in v1 (section 15).
* Scores: proportional by weight or all-or-nothing (core). Zero actions = unanswered = 0.

### Certification presets

| Preset | Facts (independent pins in tests) | Weights | Score before any action |
|---|---|---|---|
| Free fall classroom: 20 m, v0 = 0, g = 9.8, maxTime 3 s | t_impact ≈ 2.020305089104421 s, impact speed ≈ 19.79898987322333 m/s, y(1) = 15.1 m, v(1) = −9.8 m/s | 3 + 3 + 2 + 1 + 2 + 1 = 12 | **0** (pinned) |
| Rational function `(2*x-4)/((x-1)*(x+2))` | exclusions {−2, 1}; x-intercept (2, 0); y-intercept (0, 2); vertical asymptotes x = −2, x = 1; horizontal y = 0; local min (0, 2), local max (4, 2/9); decreasing (−∞, −2), (−2, 0), (4, +∞); increasing (0, 1), (1, 4) | 2 + 1 + 1 + 2 + 1 + 3 + 3 = 13 | **0** (pinned) |

The derivative `f′(x) = −2x(x − 4)/((x − 1)²(x + 2)²)` is a design note only; nothing in the code differentiates.

## 9. Accessibility and RTL

* Free fall: native buttons (تشغيل / إيقاف مؤقت / إعادة العرض), a labelled range slider and a numeric time input (keyboard path),
  an `aria-live="polite"` readout, labelled measurement / point forms with `role="alert"` validation, `prefers-reduced-motion` →
  no animation at all (manual time only).
* Function study: every graded group has a labelled form (the non-drag path); the function, the graph and numbers are LTR islands
  inside the RTL page; the graph never labels an answer (no automatic asymptote, intercept, extremum or interval) — only the
  student's own saved analysis is drawn. Tested structurally.

## 10. Authoring

The smartSim host editor gained a code-owned **plugin picker** (it lists exactly the registered identities). Switching plugin
installs that plugin's starter config and restarts the private key empty. Each plugin editor offers a one-click certification
preset, structured fields (never raw JSON), live validation through the canonical validators (an invalid config blocks
finalization), the private checks with tolerance / weight, the scoring mode and a collapsed student preview. The function editor
shows the safe parser's live status and a teacher-only probe `f(x)`.

## 11. Teacher review

`FreeFallReview` shows the model, its derived facts and the student's server-derived measurements / points; `FunctionStudyReview`
shows the function and the server-derived analysis per enabled group. Both are text, lazy and teacher-only.

## 12. Security review (adversarial)

| Probe | Result |
|---|---|
| forged client state | discarded: ingest stores the replay; the grader replays (tests F13, M15, API S2/S3) |
| future plugin / question-type version | fail closed: unknown plugin, 0 + manual review, finalization blocked (API S2) |
| huge arrays / coordinates / ranges / sample counts | refused: ≤ 500 / 300 actions, ≤ 20 items, ≤ 12 tasks, \|value\| ≤ 10⁶, window ±10⁴, n ≤ 2000 |
| NaN / Infinity / strings / prototype keys / nested objects | refused by exact-key, finite-number and semantic-id rules plus the core bounded-JSON guard |
| malicious expression syntax, member access, JS execution | impossible: the safe parser has no such grammar; only `x` (M5) |
| private answer leakage | the projection is the canonical public config only; the sanitizer blanks `answer`; structural walks in tests |
| camera / action poisoning | core prefix guard + plugin normalizers (F11, F24, M26, API S2) |
| malformed interval endpoints, duplicate ids | refused (M8/M10, F1) |
| malformed generic-rule ids / descriptor-action mismatch | core rule resolution; descriptor ↔ normalizer tests |
| answer reveal by the UI | finding fixed: after landing, the free-fall readout showed `v(t_impact)`; it now shows `v = 0` (the body rests) |

No external network: neither plugin fetches anything; grading is local arithmetic.

## 13. Core Change Ledger

**No Phase 20A.1 core semantic changes required.** No file among `trustedSimRegistry`, `trustedSimQuestion`, `trustedSimDescriptor`,
`trustedSimScene`, `trustedSimAssets`, `trustedSimRules`, `trustedSimSemanticActions`, `trustedSimCatalog`, `trustedSimVocabulary`
changed.

| File (integration, not core) | Why touched | Composition alternative? | Domain-neutral? | Compatibility evidence |
|---|---|---|---|---|
| `src/trustedSimPlugins.ts` | registers the two pilots; re-exports the existing descriptor resolvers | this is the designated registration point | yes (no domain logic) | networkTopology@1 pins pass |
| `src/trustedSim/smartSimUiRegistry.ts` | two literal lazy UI entries | designated UI registration point | yes | v2 / case variants unresolved (tests) |
| `src/questionTypes/editors/SmartSimEditor.tsx` (host UI) | code-owned plugin picker + starter config | none: without it a teacher cannot choose a plugin | yes (lists registered identities) | the default question stays networkTopology@1 |
| `scripts/build-shared-finalization.mjs` + generated copies | four new shared entries | designated server build | — | drift test passes |
| `scripts/check-bundle-budget.mjs` | pilot signatures added to the lazy-only list; budget unchanged (125 KB) | — | — | guard passes |

New UI helpers outside the core: `src/trustedSim/smartSimNumberInput.ts` (Arabic-Indic digits / `٫` / `−` normalization),
`src/trustedSim/SmartSimDraftInput.tsx` (authoring inputs that keep typed text), `src/trustedSim/smartSimStarters.ts`.

## 14. Cross-pilot certification

| Question | Answer |
|---|---|
| A. Did Physics require Math-specific core logic? | **No** |
| B. Did Math require Physics-specific core logic? | **No** |
| C. Does exam JSON contain executable behavior? | **No** (the expression is data parsed by the safe engine) |
| D. Does either plugin trust client-derived state? | **No** |
| E. Are both graded by server replay? | **Yes** |
| F. Are presentation gestures separated from academic actions? | **Yes** |
| G. Can both coexist with `networkTopology@1` without changing its semantics? | **Yes** (23 / 23 pin) |

`simulation@1` (teacher-uploaded package, manual review) and `smartSim@1` plugins (repository-owned, replayed, auto-graded)
remain distinct (pinned). AI authoring endpoints were not changed; the catalog merely lists the new descriptors as data.

## 15. Known limitations

Free Fall v1: vertical 1D free fall only; constant gravity; no air resistance or drag; no horizontal / projectile motion; SI units
only; the readouts are a measuring instrument (a student who scrubs precisely can read values — that is the simulation's purpose).

Function Study 2D v1: one independent variable `x`; the safe expression language only (no trigonometric functions); no arbitrary
JS; no symbolic CAS; the graph is numerically sampled (a pole between grid points is detected by the jump rule, a very narrow
feature may be missed — presentation only); the teacher's private checks are the analytical authority; no range-analysis task;
no 3D surfaces; an **empty** expected answer ("there is none") is refused because the empty initial state would otherwise earn
credit without work — such a group is simply not enabled.

## 16. Mutation campaign

Harness: one mutant at a time; exact single-occurrence replacement; SHA-256-verified byte-for-byte restore in a `finally`
block after every mutant; `git status` clean afterwards (only intentional uncommitted test edits between rounds). A mutant counts
as KILLED only when a behavioural test fails; source-only (P / F) mutants were judged on the `src` suites, never by the server
drift / parity test. Required-campaign items are marked `[req …]` (spec §52 numbering).

* Round 1 (42 mutants): 34 killed, **8 survived** (P11, P12, P13, P14, F3, F11, F12, C3) — each a real test gap.
* Tests strengthened (commit "test(20A.2): kill mutation survivors…"); round 2 re-ran the 8 survivors (all KILLED) plus 22 mutants
  mapped one-to-one to the required P1–P10 / F1–F12 / C1–C8 list.
* **Final: 64 mutants, 64 killed, 0 survived, 0 timeouts.**

| Id | File | Planted defect | Result | Killed by (first failing test) |
|---|---|---|---|---|
| P1 | `physicsFreeFallModel.ts` | impact time takes the NEGATIVE root for v0>0 | KILLED | physicsFreeFall.20a2.test.ts › F6 initial velocity: thrown up (v0 = +10) / do |
| P2 | `physicsFreeFallModel.ts` | impact speed drops the factor 2 (v²=v0²+g·h0) | KILLED | physicsFreeFall.20a2.test.ts › F5 impact time / speed for the 20 m classroom  |
| P3 | `physicsFreeFallModel.ts` | height loses the ½ in ½gt² | KILLED | physicsFreeFall.20a2.test.ts › F5 impact time / speed for the 20 m classroom  |
| P4 | `physicsFreeFallModel.ts` | velocity sign of gravity inverted | KILLED | physicsFreeFall.20a2.test.ts › F7 / F8 height and velocity at a time (y = h0  |
| P5 | `physicsFreeFallModel.ts` | maxTime shorter than the flight accepted | KILLED | physicsFreeFall.20a2.test.ts › F2 finite, bounded inputs: NaN / Infinity / zero o |
| P6 | `physicsFreeFallModel.ts` | negative / zero gravity accepted | KILLED | physicsFreeFall.20a2.test.ts › F2 finite, bounded inputs: NaN / Infinity / zero o |
| P7 | `physicsFreeFallModel.ts` | unknown root config keys accepted | KILLED | physicsFreeFall.20a2.test.ts › F1 the classroom preset validates and canonicalize |
| P8 | `physicsFreeFallPlugin.ts` | normalizer accepts any action type (play / scrub / frames) | KILLED | physicsFreeFall.20a2.test.ts › F24 actionKinds ↔ normalizer: every declare |
| P9 | `physicsFreeFallPlugin.ts` | graph point time outside [0, maxTime] accepted | KILLED | physicsFreeFall.20a2.test.ts › F10 strict action shapes: exact keys, declared ids, |
| P10 | `physicsFreeFallPlugin.ts` | measurement compared by magnitude (/got/) | KILLED | physicsFreeFall.20a2.test.ts › F15 physics checks derive the expected value from the pub |
| P11 | `physicsFreeFallPlugin.ts` | pointOnTrajectory accepts points after the impact | SURVIVED → KILLED | physicsFreeFall.20a2.test.ts › P11 a point AFTER the impact is never on the  |
| P12 | `physicsFreeFallPlugin.ts` | check unit coupling dropped | SURVIVED → KILLED | physicsFreeFall.20a2.test.ts › P12 / P13 a check is refused when the measure |
| P13 | `physicsFreeFallPlugin.ts` | check time may lie after the impact | SURVIVED → KILLED | physicsFreeFall.20a2.test.ts › P12 / P13 a check is refused when the measure |
| P14 | `physicsFreeFallPlugin.ts` | canonical state not sorted | SURVIVED → KILLED | physicsFreeFall.20a2.test.ts › P14 the canonical state serializes with sorte |
| P15 | `physicsFreeFallPlugin.ts` | ruleView exposes no graph points (pointNear@1 blind) | KILLED | physicsFreeFall.20a2.test.ts › F15 / F14 the classroom preset grades a correct study 12  |
| P16 | `physicsFreeFallModel.ts` | h0 = 0 with v0 <= 0 (no flight) accepted | KILLED | physicsFreeFall.20a2.test.ts › F2 finite, bounded inputs: NaN / Infinity / zero o |
| F1 | `functionStudyModel.ts` | identifiers other than x accepted | KILLED | functionStudy2d.20a2.test.ts › M2 / M3 / M4 safe pa |
| F2 | `functionStudyModel.ts` | parser language 1 (no sqrt/log/exp/^) | KILLED | functionStudy2d.20a2.test.ts › M2 / M3 / M4 safe pa |
| F3 | `functionStudyModel.ts` | sampling does not break at evaluation errors | SURVIVED → KILLED | functionStudy2d.20a2.test.ts › F3 a domain GAP without a jump (√(x² − |
| F4 | `functionStudyModel.ts` | asymptote-jump detection removed | KILLED | functionStudy2d.20a2.test.ts › M7 an evaluation error (x = 1, x = −2 hit  |
| F5 | `functionStudyModel.ts` | sampleCount upper bound removed | KILLED | functionStudy2d.20a2.test.ts › M6 window and sample-count bounds; never m |
| F6 | `functionStudyPlugin.ts` | duplicate items accepted | KILLED | functionStudy2d.20a2.test.ts › M8 / M10 strict shapes: exact keys, finite boun |
| F7 | `functionStudyPlugin.ts` | interval with from >= to accepted | KILLED | functionStudy2d.20a2.test.ts › M8 / M10 strict shapes: exact keys, finite boun |
| F8 | `functionStudyPlugin.ts` | action for a disabled task group accepted | KILLED | functionStudy2d.20a2.test.ts › M8 / M10 strict shapes: exact keys, finite boun |
| F9 | `functionStudyPlugin.ts` | set comparison ignores cardinality | KILLED | functionStudy2d.20a2.test.ts › mathematical comparison: order-independent sets, kind-s |
| F10 | `functionStudyPlugin.ts` | extremum kind ignored | KILLED | functionStudy2d.20a2.test.ts › mathematical comparison: order-independent sets, kind-s |
| F11 | `functionStudyPlugin.ts` | infinite endpoint matches anything | SURVIVED → KILLED | functionStudy2d.20a2.test.ts › F11 an infinite endpoint only matches  |
| F12 | `functionStudyPlugin.ts` | empty expected answer accepted (free initial credit) | SURVIVED → KILLED | functionStudy2d.20a2.test.ts › F12 an EMPTY expected answer is refuse |
| F13 | `functionStudyPlugin.ts` | intervals not canonically ordered | KILLED | functionStudy2d.20a2.test.ts › M9 / M11–M14 the canonical state is small, sort |
| F14 | `functionStudyPlugin.ts` | tolerance widened by 1 | KILLED | functionStudy2d.20a2.test.ts › mathematical comparison: order-independent sets, kind-s |
| F15 | `functionStudyPlugin.ts` | "+inf" accepted as an interval start | KILLED | functionStudy2d.20a2.test.ts › M8 / M10 strict shapes: exact keys, finite boun |
| F16 | `functionStudyPlugin.ts` | check for a disabled task group accepted | KILLED | functionStudy2d.20a2.test.ts › private checks are validated strictly (duplicates, ∞ pl |
| C1 | `trustedSimPlugins.ts` | functionStudy2d@1 not registered | KILLED | functionStudy2d.20a2.test.ts › M27 the certification preset finalizes; the exact certi |
| C2 | `smartSimUiRegistry.ts` | free-fall UI registered under the wrong version | KILLED | smartSimPilots.20a2.test.tsx › animation, play / pause / restart and the timeline  |
| C3 | `SmartSimEditor.tsx` | picker carries the old plugin's checks over | SURVIVED → KILLED | smartSimPilots.20a2.test.tsx › authoring — the code-owned plugin picker, the plugin editors and their certific |
| C4 | `FreeFallWorkspace.tsx` | play emits an academic action | KILLED | smartSimPilots.20a2.test.tsx › animation, play / pause / restart and the timeline  |
| C5 | `FunctionStudyWorkspace.tsx` | read-only card still offers save | KILLED | smartSimPilots.20a2.test.tsx › restore replays the stored analysis; a disabled (su |
| C6 | `build-shared-finalization.mjs` | functionStudyPlugin left out of the server build | KILLED | smartsim-pilots-20a2.test.js › production plugins = functionStudy2d@1, networ |
| C7 | `check-bundle-budget.mjs` | bundle guard forgets the function-study workspace | KILLED | smartSimPilots.20a2.test.tsx › no application module imports a pilot workspace / edit |
| C8 | `physicsFreeFallPlugin.ts` | descriptor omits simulation.scrub | KILLED | physicsFreeFall.20a2.test.ts › F4 descriptor: physics domain, 2D, its four |
| C9 | `FunctionStudyWorkspace.tsx` | workspace draws the function's poles automatically (answer reveal) | KILLED | smartSimPilots.20a2.test.tsx › shows the public function (LTR inside the RTL page) |
| C10 | `FreeFallWorkspace.tsx` | reduced motion ignored | KILLED | smartSimPilots.20a2.test.tsx › prefers-reduced-motion: no autoplay animation; the  |
| RP1 | `physicsFreeFallModel.ts` | [req P1] gravity sign inverted in y(t) | KILLED | physicsFreeFall.20a2.test.ts › F5 impact time / speed for the 20 m classroom  |
| RP3 | `physicsFreeFallModel.ts` | [req P3] impact speed returned as a signed (negative) velocity | KILLED | physicsFreeFall.20a2.test.ts › F5 impact time / speed for the 20 m classroom  |
| RP5 | `physicsFreeFallModel.ts` | [req P5] initialVelocity ignored in y(t) | KILLED | physicsFreeFall.20a2.test.ts › F7 / F8 height and velocity at a time (y = h0  |
| RP6 | `physicsFreeFallModel.ts` | [req P6] NaN config numbers accepted | KILLED | physicsFreeFall.20a2.test.ts › F2 finite, bounded inputs: NaN / Infinity / zero o |
| RP7 | `physicsFreeFallPlugin.ts` | [req P7] simulation.play becomes an academic action | KILLED | physicsFreeFall.20a2.test.ts › F24 actionKinds ↔ normalizer: every declare |
| RP8 | `physicsFreeFallPlugin.ts` | [req P8] timeline.scrub becomes an academic action | KILLED | physicsFreeFall.20a2.test.ts › F24 actionKinds ↔ normalizer: every declare |
| RP9 | `trustedSimQuestion.ts` | [req P9 / F11] grader trusts the client-claimed state | KILLED | physicsFreeFall.20a2.test.ts › F13 a forged perfect state with no actions earns 0; |
| RP10 | `physicsFreeFallPlugin.ts` | [req P10] physics tolerance ignored | KILLED | physicsFreeFall.20a2.test.ts › F15 physics checks derive the expected value from the pub |
| RF2 | `parametricEngine.ts` | [req F2] unknown function (sin) accepted by the parser | KILLED | functionStudy2d.20a2.test.ts › M2 / M3 / M4 safe pa |
| RF3 | `functionStudyModel.ts` | [req F3] member-access / host syntax accepted | KILLED | functionStudy2d.20a2.test.ts › M5 executable / host |
| RF7 | `functionStudyPlugin.ts` | [req F7] sets compared in insertion order | KILLED | functionStudy2d.20a2.test.ts › an author's expected set in any order  |
| RF7b | `functionStudyPlugin.ts` | [req F7] vertical asymptotes stored in insertion order | KILLED | functionStudy2d.20a2.test.ts › M9 / M11–M14 the canonical state is small, sort |
| RF9 | `functionStudyPlugin.ts` | [req F9] monotonic interval kind ignored | KILLED | functionStudy2d.20a2.test.ts › mathematical comparison: order-independent sets, kind-s |
| RF12 | `student-exam-sanitize.js` | [req F12] private key projected to the student | KILLED | smartsim-pilots-20a2.test.js › the student receives the  |
| RC1 | `trustedSimRegistry.ts` | [req C1] plugin v2 falls back to v1 | KILLED | physicsFreeFall.20a2.test.ts › F3 exact plugin version: physicsFreeFall@1 resolve |
| RC2 | `smartSimUiRegistry.ts` | [req C2] UI v2 falls back to v1 | KILLED | smartSimPilots.20a2.test.tsx › the UI registry resolves exactly the three plugin iden |
| RC3 | `physicsFreeFallPlugin.ts` | [req C3] descriptor actionKinds disagree with the normalizer | KILLED | physicsFreeFall.20a2.test.ts › F4 descriptor: physics domain, 2D, its four |
| RC4 | `physicsFreeFallModel.js` | [req C4] server mirror drifts from source | KILLED | shared-finalization-drift-14a.test.js › regenerating into a temp dir produces exact |
| RC5 | `networkTopologyPlugin.js` | [req C5] networkTopology@1 reachability semantics inverted (server) | KILLED | smartsim-pilots-20a2.test.js › PIN — networkTopology@ |
| RC6 | `questionTypeCatalog.js` | [req C6] catalog count changes from 24 | KILLED | smartsim-pilots-20a2.test.js › PIN — the question-type catalog stays at 24 an |
| RC7 | `check-bundle-budget.mjs` | [req C7] initial bundle budget raised | KILLED | smartSimPilots.20a2.test.tsx › no application module imports a pilot workspace / edit |
| RC8 | `studentRegistry.tsx` | [req C8] simulator workspace imported eagerly | KILLED | smartSimPilots.20a2.test.tsx › no application module imports a pilot workspace / edit |

## 17. Bundle impact

| | Initial JS graph (gzip) |
|---|---|
| Baseline `44d0f21` | 119.4 KB, 17 files |
| 20A.2 | 119.6 KB, 17 files (budget 125 KB, unchanged) |

The +0.2 KB is Vite preload-dependency lists naming the new lazy chunks (`index` +65 B, a few initial chunks +90…115 B); no pilot
code is in the initial graph (guard signatures `freefall-*` / `fnstudy-*`). Lazy chunks (gzip): FreeFallWorkspace 3.6 KB,
FreeFallEditor 3.0 KB, FreeFallReview 0.8 KB, physicsFreeFallModel 2.2 KB, physicsFreeFallPlugin 2.5 KB, FunctionStudyWorkspace
3.6 KB, FunctionStudyEditor 3.5 KB, FunctionStudyReview 0.7 KB, functionStudyModel 2.0 KB, functionStudyPlugin 3.0 KB.

## 18. Future plugin guidance

A new subject plugin (projectileMotion@1, harmonicMotion@1, functionSurface3d@1, chemistryEquation@1 …) follows the same recipe:
a strict model module, a plugin module with semantic actions / canonical state / private checks and a descriptor, a registration
line, three literal lazy UI entries, shared-build entries and guard signatures. A new behaviour of an existing plugin is a new
version (`physicsFreeFall@2`), never a change of `@1`.

## 19. Certification verdict

**SMARTSIM PILOT CERTIFICATION: PASS** — both production plugins work end to end (authoring → delivery → autosave / restore →
submit → server replay grading → teacher review); no Phase 20A.1 core module changed; client / server parity on one TypeScript
source; no private leakage; exact-version behaviour; 64 / 64 mutants killed; bundle within the unchanged 125 KB budget. The
verdict is subject to green exact-head CI on the PR and to the owner's independent review; nothing here is merged or deployed.
