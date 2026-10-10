# Phase 21D-A.2 — Enterprise Advanced Physics SmartSim (`physicsLab@1`)

Design record for the second physics sub-phase: four certified simulations, SIM-05 simple pendulum, SIM-06 Hooke's law and spring,
SIM-07 mechanical energy and SIM-08 DC circuits. They ship as one new trusted SmartSim plugin identity, `physicsLab@1`, built on the
contracts that 21D-A.1 established:

* the SmartSim registry, descriptor, sanitizer and replay contracts;
* the 20E dynamic runtime;
* the shared finalization build;
* the exam JSON, grading and review authorities.

Out of scope: experiment-based grading (grading against the student's own explored experiment), which is A.3.

## 1. Versioning and compatibility decisions

| Decision | Reason |
|---|---|
| `physicsFreeFall@1` and `physicsMotion@1` are **frozen** in behaviour and grading. | Published identities are immutable. The A.1 suites (core, UI, review and acceptance lifecycle) run unchanged and pass (§8), and the 20A.2 free-fall suites pass unchanged. |
| New exact identity **`physicsLab@1`**: one plugin, four experiments selected by `config.experiment`. | This keeps the A.1 shape (`{ v, experiment, params, controls, view, tasks }`), so teachers and students meet one model. It also gives one validator, one action vocabulary and one editor, workspace and review, and adds a single registry entry. |
| Measurement-task mechanics are **extracted, not copied**: `src/physics/measurementTasks.ts`. | The task mechanics are the semantic actions, their strict normalization, the replay, the canonical state and the reference-value comparison. Both physics plugins now call this one implementation, so trusted grading logic exists once. `physicsMotion@1` keeps its own names and error codes (`MOTION_ACTION_INVALID`, `MOTION_ACTIONS_TOO_MANY`). Its 160 A.1 tests pass unchanged. |
| The A.1 student widgets are **shared, not copied**: `src/physicsShared/labWidgets.tsx`. | The shared widgets are the measurement task, the graph-point task, the exploration panel and the clock bar. They live in lazy chunks only, and test ids are namespaced (`motion-…`, `lab-…`). |
| Workspaces replay answers **through the registered plugin** (`resolveSmartSimPlugin` + `replaySmartSimActions`). | This is the path every other surface already uses. It also keeps the new plugin modules out of the preload lists of the initial graph, which is why initial-bundle growth is zero (§9). |
| No new question type and no new JSON field outside the plugin config. | The question is the existing `smartSim@1` type. Everything new lives in the plugin's canonical config and check vocabulary. |
| Not added to the AI Composer catalog. | The composer has an explicit per-plugin allowlist, and widening it is a separate product decision. The capability matrix records "AI: —". |
| No generalized simulation runtime and no second grading engine. | The plugin uses the existing SmartSim core: bounded replay, private checks, the `proportional` / `allOrNothing` scoring, the generic `numericNear@1` / `pointNear@1` rules and the existing clock / plot runtime. |

## 2. Architecture

```
src/physics/labCore.ts             pure physics: parameter spec + validation, pendulum RK4 table, spring / energy closed forms,
                                   circuit nodal solver, frames, reference quantities (no React, no DOM, no clock)
src/physics/measurementTasks.ts    shared task actions / replay / state / reference comparison (used by physicsMotion@1 and physicsLab@1)
src/physicsLabModel.ts             canonical config V1 + validation codes + the exploration rule
src/physicsLabPlugin.ts            SmartSim plugin: lab.referenceValue check, rule view, descriptor; actions via measurementTasks
   └─ all four compiled into api/src/lib/shared-finalization/ by scripts/build-shared-finalization.mjs (server = same code; drift-tested)
src/physicsShared/labWidgets.tsx   shared student widgets (tasks, exploration panel, clock bar) — lazy only
src/physicsLab/                    UI only, lazy chunks: LabWorkspace (student + teacher preview), LabScene (2D SVG scenes, circuit
                                   schematic, energy bars), labView (graphs / readout / events), LabEditor, LabReview, labTemplates, lab.css
src/trustedSimPlugins.ts           registers physicsLab@1 after physicsMotion@1
src/trustedSim/smartSimUiRegistry.ts / smartSimStarters.ts   lazy UI entry + starter config for physicsLab@1
```

The physics is separate from the visualization. The UI evaluates `labFrame(model, t, end)` at the presentation clock time, so the same
`t` always shows the same state. This holds regardless of frame rate, tab throttling, step direction or a fresh model; the determinism
tests cover forward, backward and fresh-model evaluation.

## 3. Physics models, equations and assumptions (SI units)

### SIM-05 simple pendulum

`θ'' + γ·θ' + (g/L)·sin θ = 0`. The pendulum is released from rest at θ₀, with 1° ≤ θ₀ ≤ 170° and optional linear damping γ.

* **Integration.** The equation is integrated once per model with fixed-step classical RK4, with step `h = min(T₀/200, 0.01 s)`.
  * The step does not depend on how long the run is asked to be, so a value at time t never depends on `maxTime`.
  * A frame is the cubic Hermite interpolant of that table: θ with θ′, and θ′ with θ″.
  * Tables are memoized by value, keeping at most 16, so several checks of one question integrate once.
* **Reference values.** The finite-angle period is **exact**, not a series, and the elliptic integral K is computed with the AGM.

  | Quantity | Definition |
  |---|---|
  | Small-angle period | `T₀ = 2π√(L/g)` |
  | Finite-angle period | `T = 4K(sin(θ₀/2))·√(L/g)` |
  | Damped small-angle period | `2π/√(ω₀² − γ²/4)`; `null` when that radicand is ≤ 0 |
  | Measured period | Time of the second sign change of θ′ on the simulated motion; `null` if it falls outside `maxTime` |
  | Maximum speed | `L·|θ′|` at the first sign change of θ″ |
  | Initial energy | `E₀ = mgL(1 − cos θ₀)` |

* **Small angle versus finite angle.** Both periods are always available as separate quantities with distinct Arabic labels, and the
  editor shows both. Tests check that the measured period follows the exact elliptic period and departs from the small-angle law as θ₀
  grows. The checked ratios `T/T₀` (independent Simpson quadrature) are:

  | θ₀ | 2° | 30° | 60° | 90° | 150° | 170° |
  |---|---|---|---|---|---|---|
  | T/T₀ | 1.0000762 | 1.0174088 | 1.0731820 | 1.1803406 | 1.7622037 | 2.4393627 |

* **Forces.** The forces are weight, tension `T = m(g cos θ + Lθ′²)`, damping `−mγv`, the restoring component `mg sin θ`, and net.
  ΣF = m·a (tangential plus centripetal) holds in every frame, as tested.
* **Assumptions.** A point mass on a massless, inextensible string, planar motion, no air resistance other than the linear damping term,
  and release from rest.

### SIM-06 Hooke's law and spring

A vertical mass–spring system with linear damping c, released from rest at x₀ from equilibrium (downward positive):
`m·x'' = −k·x − c·x'` about the equilibrium extension `Δ = mg/k`.

* **Closed form for every damping regime.**
  * Underdamped: `x = x₀e^{−βt}(cos ω_d t + (β/ω_d) sin ω_d t)`, `v = −x₀(ω₀²/ω_d)e^{−βt} sin ω_d t`, where `β = c/2m` and
    `ω_d = √(ω₀² − β²)`.
  * Critically damped: `x = x₀(1 + βt)e^{−βt}`.
  * Overdamped: stable forms that never multiply an underflow by an overflow, with `r₁ = −ω₀²/(β + γ)` free of cancellation:
    * `C = (e^{r₁t} + e^{r₂t})/2`
    * `S = e^{r₂t}·expm1(2γt)/(2γ)`, or `(e^{r₁t} − e^{r₂t})/(2γ)` when `2γt > 50`
    * `x = x₀(C + βS)`, `v = −x₀ω₀²S`

  The tests check all three regimes against an independent RK4, including within 1e-9 of critical damping.
* **Hooke's law in every frame.** The spring force is `k·(Δ + x)`, pointing upward when the spring is extended. ΣF = m·a holds, and at
  equilibrium the net force vanishes.
* **Reference values.**

  | Quantity | Definition |
  |---|---|
  | Period | `2π√(m/k)` |
  | Damped period | `2π/ω_d`; `null` unless underdamped |
  | Angular frequency | `ω₀` |
  | Equilibrium extension | `mg/k` |
  | Restoring force at release | `k|x₀|` |
  | Speed at the first pass through equilibrium | evaluated at `t_eq = (π − atan2(ω_d, β))/ω_d`; `null` if that pass falls outside `maxTime` or the spring is not underdamped |
  | Initial energy about equilibrium | `½k·x₀²` |

* **Energy.** Energy is measured about equilibrium: `KE + ½k·x²`, with the gravitational and elastic terms combined. The force–extension
  graph plots spring force against extension `e = Δ + x`, which is Hooke's law.
* **Assumptions.** An ideal massless linear spring, motion along one vertical axis, and release from rest.

### SIM-07 mechanical energy

A body moving vertically under gravity with optional linear drag `F = −b·v`. With b = 0 this is exactly the `physicsMotion@1` free fall;
200 random launches are tested for identity.

* **Motion.** With `k = b/m`:
  * `y = h₀ + v₀·t·ψ₁(kt) − g·t²·ψ₂(kt)`
  * `v = v₀e^{−kt} − g·t·ψ₁(kt)`
  * `ψ₁(x) = (1 − e^{−x})/x` and `ψ₂(x) = (x − 1 + e^{−x})/x²`, evaluated with series near 0 so there is no cancellation as b → 0.
* **Landing and apex.** The landing time is the closed form when b = 0 and a bracketed bisection otherwise. The apex time is
  `ln(1 + v₀k/g)/k`.
* **Arrival semantics** (as in `physicsMotion@1`). The end frame is the instant of impact. Later times clamp to that frame, and nothing
  after the impact is modelled. The view must cover the landing (`LAB_VIEW_TOO_SHORT`).
* **Energy accounting.**
  * `KE = ½mv²` and `PE = mgy` (ground = 0); total `E = KE + PE`.
  * Dissipated energy `E₀ − E` is shown as its own series and bar.
  * The tests verify `E(t) + W_drag(t) = E₀` against `W_drag = ∫b·v² dt`, integrated **independently** with Simpson's rule, and verify
    that E strictly decreases while the body moves with drag.
* **Reference values.** Initial energy, maximum height, impact time, impact speed, impact kinetic energy, and energy dissipated before
  impact.
* **Assumptions.** A point mass, uniform g, linear (Stokes-like) drag only, and no bounce.

### SIM-08 DC circuits

A DC source V and three resistors in one of four **fixed** topologies:

1. series R1–R2–R3;
2. parallel R1 ∥ R2 ∥ R3;
3. R1 + (R2 ∥ R3);
4. (R1 + R2) ∥ R3.

* **Solver.** The circuit is solved by nodal analysis: KCL `G·v = b` on at most two unknown node potentials, solved by Gaussian
  elimination with partial pivoting. Node 1 is held at V by the source and node 0 is the reference.
* **Source current.** The source current is summed over the branches returning to node 0, which avoids cancellation.
* **Kirchhoff consistency.** Over 400 random circuits per run:
  * all four topologies agree with the closed-form series and parallel formulas;
  * KCL holds at every node, KVL around every loop, and power balances (`ΣI²R = V·I`);
  * the tolerance is 1e-12 relative for realistic resistance ratios and 1e-9 over the full 0.1 Ω – 1 MΩ range (see §10).
* **Reference values.** Equivalent resistance, total current, total power, and the current through and voltage across each of R1–R3
  (magnitudes).
* **Bounded inputs.** Voltage is limited to 0.1–1000 V and each resistance to 0.1 Ω – 1 MΩ. The topology is an integer option chosen
  from the four names. There is no free-form netlist, wire editor or user-defined component: interaction is educational, not open-ended
  circuit execution.
* **Assumptions.** An ideal source with no internal resistance, ideal meters (an ammeter in series with zero resistance and a voltmeter
  across a resistor with infinite resistance), ohmic resistors, and DC steady state with no time evolution. The clock only animates
  schematic current markers, whose speed is a visual cue proportional to the current, not the drift velocity.

### Analytical certification

The values below are hand-computed and asserted in `src/physicsLab.21da2.test.ts`. They are also the classroom presets.

| SIM | Inputs | Reference values |
|---|---|---|
| 05 | L = 1 m, θ₀ = 10°, γ = 0, m = 0.5 kg, g = 9.8 | T₀ = 2.00709 s; T = 2.01092 s; measured ≈ T; v_max = 0.545681 m/s; E₀ = 0.0744420 J |
| 06 | k = 20 N/m, m = 0.5 kg, x₀ = 0.1 m, c = 0 | T = 0.993459 s; ω₀ = 6.32456 rad/s; Δ = 0.245 m; F = 2 N; v_eq = 0.632456 m/s; ½kx₀² = 0.1 J; x(t) = x₀cos ω₀t |
| 07 | m = 2 kg, h₀ = 20 m, v₀ = +10 m/s, b = 0 | E₀ = 492 J; H = 25.1020 m; t = 3.28378 s; KE(impact) = 492 J; nothing dissipated |
| 07′ | the same with b = 0.5 kg/s (acceptance exam) | E dissipated before impact = 168.093 J; impact at 3.367 s |
| 08 | 12 V; R1 = 2, R2 = 6, R3 = 3 Ω; topology 3 | R_eq = 4 Ω; I = 3 A; V1 = 6 V; V2 = V3 = 6 V; I2 = 1 A; I3 = 2 A; P = 36 W |

Robustness is tested over 4 × 150 random parameter sets that include the bounds. Every frame, sample and reference quantity is finite or
an explicit `null`; there is never a NaN, an Infinity, or a fabricated value such as the period of an overdamped motion.

## 4. Canonical config (`physicsLab@1`, config `v: 1`)

```json
{
  "v": 1,
  "experiment": "circuit",
  "params": { "voltage": 12, "r1": 2, "r2": 6, "r3": 3, "topology": 3 },
  "controls": [{ "param": "topology", "min": 1, "max": 4, "step": 1 }, { "param": "r1", "min": 1, "max": 20, "step": 1 }],
  "view": { "maxTime": 10, "graphs": ["power"], "showVectors": true },
  "tasks": { "measurements": [{ "id": "equivalentResistance", "label": "المقاومة المكافئة", "unit": "Ω" }], "points": [{ "id": "iv6", "label": "نقطة على منحنى التيار–الجهد عند 6 V" }] }
}
```

| Experiment | Parameters (bounds) | Primary graph (graph points) | Optional graphs |
|---|---|---|---|
| pendulum | length 0.1–20 m, initialAngle 1–170°, damping 0–5 1/s, mass 0.01–100 kg, gravity 0.1–100 | θ(t) | angularVelocity ω(t), energy |
| spring | springConstant 0.1–10⁴ N/m, mass, initialDisplacement −2…2 m (≠ 0), damping 0–1000 kg/s, gravity | x(t) | force F(e), velocity, energy |
| energy | mass, initialHeight 0–1000 m, initialVelocity ±200 m/s, drag 0–100 kg/s, gravity | E(t) (KE, PE, total, dissipated) | height, velocity |
| circuit | voltage 0.1–1000 V, r1/r2/r3 0.1–10⁶ Ω, topology 1–4 (integer option) | I–V characteristic swept over 0…1.25·V | power P–V |

Validation is strict: anything invalid is refused, never clamped or repaired.

* Exact key sets at every level (`LAB_CONFIG_UNKNOWN_KEY`).
* `v` must be 1 (`LAB_CONFIG_VERSION_UNSUPPORTED`).
* An unknown experiment is refused (`LAB_EXPERIMENT_UNKNOWN`).
* Parameters (`LAB_PARAMS_INVALID`, with an Arabic reason): exactly the experiment's keys, finite, within bounds, with integer options
  for the topology. Two motionless starts are refused: a spring with x₀ = 0, and an energy body on the ground that is not thrown upward.
* Controls:
  * each must name a known parameter with no duplicates, otherwise `LAB_CONTROLS_INVALID`;
  * each needs `min < max` inside the bounds and `0 < step ≤ max − min`; an option parameter also needs integer limits and step 1;
    otherwise `LAB_CONTROL_LIMITS_INVALID`;
  * the authored value must lie inside the permitted range (`LAB_CONTROL_EXCLUDES_AUTHORED`).
* View:
  * `0 < maxTime ≤ 120`, graphs from the experiment's allowed set (stored in canonical order) and a boolean `showVectors`;
    otherwise `LAB_VIEW_INVALID`;
  * for the energy experiment, `maxTime` must cover the landing (`LAB_VIEW_TOO_SHORT`).
* Tasks:
  * at most 12 measurements and at most 12 points, otherwise `LAB_TASKS_TOO_MANY`;
  * at least one task, otherwise `LAB_TASKS_EMPTY`;
  * unique ids, otherwise `LAB_TASK_ID_DUPLICATE`;
  * safe labels of at most 80 characters and measurement units from `s m m/s m/s² N J W V A Ω rad/s`, otherwise `LAB_TASK_INVALID`.

## 5. Answers, grading and security boundaries

* **Actions** are the only student data. They come from the shared `measurementTasks` module:
  * `measurement.set {measurementId, value}` and `measurement.clear`;
  * `graphPoint.set {pointId, x, y}` and `graphPoint.clear`.

  Ids must be declared, and values must be finite with |v| ≤ 10⁷. A point on a time axis must satisfy `0 ≤ x ≤ maxTime`. Anything else is
  rejected (`LAB_ACTION_INVALID`), and there can be at most 500 actions (`LAB_ACTIONS_TOO_MANY`). The server replays the actions with the
  same compiled code and discards any client-claimed state, score or flag.
* **Checks** are private and never sent to students. `lab.referenceValue {measurementId, quantity, tolerance}` compares a measurement
  against a value computed by code from the **authored** experiment. The quantity must exist for that experiment, its unit must match
  the measurement unit, and it must be defined for the authored run. A check is refused (`LAB_CHECK_INVALID`) when, for example, the
  pendulum completes no full period within `maxTime`, or the spring is overdamped and has no damped period. The generic `numericNear@1`
  and `pointNear@1` rules are also available. Scoring uses the existing SmartSim modes.
* **Exploration** is presentation only, as in A.1. The following are never actions, never stored and never graded:
  * teacher-permitted parameter controls;
  * dragging the pendulum bob at t = 0;
  * choosing which resistor the voltmeter reads;
  * switching the circuit topology;
  * playback.

  A banner appears whenever the explored experiment differs from the authored one, with a one-click return. The lifecycle test proves
  that an explorer who reports correct physics for an *explored* experiment earns nothing for it. Experiment-based grading is A.3.
* **Student delivery (sanitizer).** The student projection keeps the public config: params, permitted controls, view and tasks. It strips
  checks, tolerances, quantities and scoring. The acceptance test asserts that no `checks`, `tolerance`, `quantity`,
  `lab.referenceValue`, `pointNear@1`, `scoring`, `measuredPeriod` or `energyDissipated` text reaches the student JSON. A tampered config
  blocks finalization and is withheld; the tested cases are an unknown key, an unknown experiment, a fractional topology, and an authored
  value outside a permitted control.
* **No answer before the run.** Before the experiment is run, the scenes and graphs print no graded value other than the live instrument
  reading at t = 0, as the UI test checks.
  * Graph event markers (energy apex and impact) are labelled by name only, never with their time.
  * The energy scene shows a neutral scale bar.

  Instruments such as the ammeter, voltmeter and live readout are part of the experiment. The A.1 owner observation applies: a task that
  asks only for an instantaneous instrument reading is answered by reading the instrument.
* **Grading safety.** No zero is manufactured. A malformed config blocks finalization; it is never graded as wrong. An undefined
  reference quantity is refused at authoring time; it is never compared against `null`. The scoring and composite paths are the
  existing ones.

## 6. Rendering and interaction contracts (student)

* **One presentation clock.** Play, Pause, Resume, Reset and single step (±0.1 s); playback rates 0.25×–2×; a timeline slider and direct
  time entry. The clock drives the scene, the synchronized graphs (progressive path plus a marker at the clock time), the energy bars and
  the live readout. Every value is the core evaluated at the clock time.
* **Scenes.** All scenes are 2D SVG built from numbers; there is no `innerHTML` and no asset.

  | Experiment | Scene |
  |---|---|
  | Pendulum | Pivot, string and bob with a swing guide fitted to the amplitude; force vectors (optional). The bob is draggable at t = 0 when the teacher permits `initialAngle`, snapping to the control step inside the permitted range. Window pointer listeners keep the drag reliable on touch and when vectors overlap. Keyboard: `role="slider"` with arrow keys, plus `aria-valuetext`. |
  | Spring | Ceiling, coil, mass, natural-length and equilibrium lines, and force vectors. |
  | Energy | Ground, body and a scale bar. |
  | Circuit | A schematic per topology with labelled resistors, an ammeter in series with the source, and a voltmeter attached to the selected resistor (selected by click or keyboard). Conventional-current markers move with the clock; with reduced motion there is no autoplay, so they move only when the student steps or seeks. |

* **Energy honesty.**
  * The bars and notes say "محفوظة" (conserved) **only** when damping or drag is 0.
  * Otherwise they say the energy decreases ("تتناقص"), show the dissipated energy as its own bar and series, and the energy graph
    titles say so.
  * The Chromium check confirms that energy with drag is never called conserved.
* **Accessibility and layout.**
  * Arabic RTL page with LTR islands for numbers, units, scenes and graphs.
  * Every control is labelled; announcements go to a live region.
  * `prefers-reduced-motion` gives no autoplay; stepping, the slider and time entry keep every value reachable.
  * Phones get one column with no horizontal overflow (checked at 390 px).
  * Errors are helpful Arabic reasons, for example an exploration value outside the teacher's range or a motionless spring.

## 7. Teacher experience and exam integration

* **Editor** (lazy). It is the structured editor of A.1 and never raw JSON. It provides:
  * an experiment selector with a classroom preset for each experiment (config, tasks and weighted checks);
  * SI parameter inputs with bounds, the topology as a select;
  * a per-parameter "student may adjust" setting with min / max / step, option parameters in whole steps;
  * duration, optional graphs, vectors and tasks;
  * private checks, each `lab.referenceValue` showing its computed expected value;
  * a reference-values panel for the authored experiment, which shows the small-angle and finite-angle periods side by side;
  * the scoring mode and a live preview that runs the real student workspace.
* **Review** (lazy, teacher only). It shows the authored experiment, with option labels, and the student's server-derived measurements and
  points.
* **Exam lifecycle.** The following use the existing paths, and the acceptance test covers them: import and export of JSON, save and
  reopen (round trip), finalization through the shared build, student delivery, autosave and restore (the answer is the action list,
  replayed), server grading, composite contexts and teacher review.

**Acceptance exam:** `docs/fixtures/physics-lab-21da2/ExamBank_21DA2_Advanced_Physics_Acceptance.json`. It is an Arabic exam with five
sections and 34 marks, generated from `api/tests/certification-21da2/physicsLabExam.js` and pinned by a drift test
(`WRITE_21DA2_FIXTURES=1` regenerates it).

| Section | Question | Marks |
|---|---|---|
| a1 | Pendulum: measured period, small-angle period, maximum speed | 6 |
| b1 | Spring: period, equilibrium extension, restoring force, and the point of the first pass through equilibrium | 6 |
| c1 | Energy without drag | 5 |
| c2 | Energy **with** drag b = 0.5 kg/s: the energy dissipated is measured, and claiming conservation earns nothing | 5 |
| d1 | Mixed circuit: four meter readings and an I–V point | 7 |
| e1 | Composite sharing a parallel-circuit context (a linked SmartSim part and an MCQ) | 5 |

Lifecycle outcomes:

| Case | Score |
|---|---|
| Perfect | 34 / 34 |
| Partial | 3 + 0 + 1.25 + 1.667 + 7 + 2 ≈ 14.92 |
| Blank | 0 |
| Explorer | 0 |
| Attacker | Every forged answer is rejected (a1, b1, c1, c2, d1); only the honest composite answer counts (5) |

The tampered configs are blocked. The exam uses only supported JSON fields and question types (`smartSim@1`, `composite@1`,
`multipleChoice@1`). In the 20G live capability matrix, `plugin:physicsLab@1` is exercised end to end by exam `21DA2` (disposition A).
Like every later-phase fixture, it is excluded from the frozen 21A.1 / 21A.2 compatibility corpora, because no baseline capture exists
for it.

## 8. Test evidence (local, on this branch)

| Suite | Result |
|---|---|
| `src/physicsLab.21da2.test.ts`: analytical references, elliptic period, RK4 cross-checks, damping regimes, energy balance with independent drag work, Kirchhoff over 400 circuits, robustness, determinism, validation, SmartSim integration | 25 / 25 |
| `src/physicsLab/physicsLabUi.21da2.test.tsx`: four experiments in the real student host, no reveal, clock, semantic actions, circuit meters, pendulum keyboard drag, honest energy wording, reduced motion, editor / preview, review / registry | 12 / 12 |
| `api/tests/certification-21da2/*`: acceptance exam lifecycle through the API build, plus fixture drift | 7 / 7 |
| A.1 and free-fall compatibility (`physicsMotion*`, `physicsFreeFall*` suites, A.1 lifecycle), unchanged | all pass (127 tests across the 9 targeted A.1 / A.2 files) |
| Certification suites 20G / 21A.1 / 21A.2 / 21D-A.1 / 21D-A.2 (matrix, freezes, coverage map regenerated) | 30 files, 427 / 427 |
| Shared-build parity and drift (`scripts/build-shared-finalization.mjs`; the drift test in the root suite) | pass |
| Real Chromium (`scripts/check-physics-lab-browser-21da2.mjs`) | 43 / 43 checks (detailed below) |

The real-Chromium check covers:

* the four experiments rendering;
* play / pause / resume / single step / reset with real `requestAnimationFrame`;
* the readout synchronized with the timeline;
* no action produced by playback;
* a **real pointer drag** of the pendulum bob to 43° (exploration banner shown, no action);
* the voltmeter on R2 reading 6 V and the ammeter reading 3 A;
* energy with drag shown as decreasing, with the dissipated bar;
* a saved measurement producing exactly one semantic action;
* an RTL page with LTR scene and graphs;
* the editor preview and its reference value;
* a median frame time of 16.7 ms while playing (p95 16.7 ms);
* no horizontal overflow at 390 px;
* no page errors.

The full Quality Gate results on the final head are reported in the pull request: root suite, lint, typecheck, build with the bundle
guard, and `git diff --check`.

## 9. Bundle measurements

The bundle guard (`scripts/check-bundle-budget.mjs`) measures gzip level 9 over the initial graph against a budget of **125 KB =
128,000 bytes**. The threshold is unchanged.

| Measurement | Initial graph (bytes gzip) |
|---|---|
| Baseline `main` `92db4cd` | 127,789 |
| First A.2 head, before optimization: plugin preload names in `index` / `StudentQuestionCard` | 127,919 (+130) |
| **A.2 head**: replay through the registry, so the plugin modules merge into the registry chunk | **127,789 (+0)** |

All physicsLab UI is lazy: workspace, scene, editor, review, CSS and the shared widgets. No dependency was added.

## 10. Known limitations

* **Grading** uses the authored experiment only. This is by design for A.2; experiment-based grading is A.3.
* **Circuit solver conditioning.**
  * Circuits are limited to three resistors in four fixed topologies, with no free netlist.
  * Nodal elimination keeps relative Kirchhoff residuals around 1e-10 for extreme resistance ratios: 0.1 Ω beside 1 MΩ is a ratio of
    10⁷.
  * Hence the tolerances: 1e-12 for realistic ratios, 1e-9 over the full range. The 0.05 A / 0.05 Ω grading tolerances are many orders
    of magnitude larger.
* **Pendulum scope.**
  * The pendulum table is bounded by `maxTime ≤ 120 s` and `h = min(T₀/200, 10 ms)`.
    * Worst case (L = 0.1 m, g = 100, θ₀ = 170°): 120,791 RK4 steps, 1.93 MB, about 21 ms once per model on the development container.
      The measured period still matches the exact elliptic period to 5·10⁻⁹ relative.
    * A typical classroom pendulum (L = 1 m) takes about 5 ms.
    * The value memo holds at most 16 tables, so its worst case is about 31 MB in one server instance.
  * The measured period is defined from the first full oscillation.
  * Damping is linear (`γ·θ′`).
* **No air resistance** except the linear terms stated above; no collisions or bounce; motion is planar or one-dimensional only.
* **Graph points** are placed on the primary graph only.
* **AI Composer.** `physicsLab@1` is not offered by the AI Composer.
* **Known flaky, unrelated items, not changed here.**
  * `src/questionTypes/coding.17e-b.test.tsx`: a wall-clock secrecy-regex false positive, documented in the A.1 record §10.
  * The Runner TAR44 test race seen in A.1.
  * `src/GovernancePanel.14b.test.tsx`, per AGENTS.md.

## 11. Checkpoint

* Branch `feature/phase-21d-a2-advanced-physics` from `main` `92db4cd` (PR #283 merged).
* Completed:
  * the shared task mechanics and the A.1 refactor;
  * the core, model, plugin and shared build;
  * the UI: workspace, scenes, editor, review, registry and starter;
  * the Chromium check;
  * the acceptance exam and lifecycle tests;
  * the capability matrix;
  * this record.
* Remaining: exact-head CI on the pushed head, independent review, and owner merge.
