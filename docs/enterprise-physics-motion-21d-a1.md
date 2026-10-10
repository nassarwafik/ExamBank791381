# Phase 21D-A.1 — Enterprise Physics SmartSim: Physics Core & Motion (`physicsMotion@1`)

Design record for the first physics sub-phase: a shared, deterministic motion core and four interactive simulations
(SIM-01 free fall, SIM-02 projectile, SIM-03 Newton's second law, SIM-04 inclined plane) delivered as one new trusted SmartSim
plugin identity, `physicsMotion@1`, on top of the existing SmartSim contracts, the 20E dynamic runtime and the exam
JSON / sanitizer / grading authorities. Out of scope: A.2 (pendulum, Hooke's law, energy, circuits) and A.3 (advanced,
experiment-based grading).

## 1. Versioning and compatibility decisions

| Decision | Reason |
|---|---|
| `physicsFreeFall@1` is **frozen** (no code, schema or behaviour change). | Published SmartSim identities are immutable; existing exams, answers and grades must replay byte-for-byte. A test proves the new free-fall engine is numerically identical to the `physicsFreeFall@1` engine over a 300-sample sweep. |
| New exact identity **`physicsMotion@1`** (one plugin, four experiments selected by `config.experiment`). | Extending `physicsFreeFall@1` would change a published version family. One plugin with an `experiment` discriminator reuses one validator, one action vocabulary, one review / editor / workspace, and keeps the registry small. |
| No migration of `physicsFreeFall@1` questions. | Not needed: both identities coexist; teachers choose `physicsMotion@1` for new questions (the plugin picker lists it). An automatic conversion would change grading of already-published exams. |
| Not added to the AI Composer catalog. | The composer has an explicit per-plugin allowlist; adding a plugin to AI generation is a separate product decision (the capability matrix records "AI: —"). |
| No new question type, no new validation field outside the plugin config. | The question is the existing `smartSim@1` type; everything new lives in the plugin's canonical config and check vocabulary, validated by the plugin. |

## 2. Architecture

```
src/physics/motionCore.ts          pure physics: parameter spec + validation, closed-form frames, friction solver, reference quantities
src/physicsMotionModel.ts          canonical config V1 (experiment, params, controls, view, tasks) + validation codes + exploration rule
src/physicsMotionPlugin.ts         SmartSim plugin: actions, replay, state, motion.referenceValue check, rule view, descriptor
   └─ compiled into api/src/lib/shared-finalization/ by scripts/build-shared-finalization.mjs (server = same code)
src/physicsMotion/                 UI only, lazy chunks: MotionWorkspace (student + preview), MotionEditor, MotionReview,
                                   MotionScene (2D SVG), motionView (graphs / readout helpers), motionTemplates (presets), motion.css
```

Physics is separated from visualization: the core has no React, no DOM and no clock. The UI evaluates
`motionFrame(model, t, end)` at the presentation clock time; nothing is integrated frame by frame, so the same `t` always shows the same
state (deterministic, independent of frame rate, tab throttling or step size).

Reused, unchanged: SmartSim registry / descriptor / question / sanitizer contracts, the 20E dynamic runtime
(`useSimulationClock`, `DynamicPlot2D`, `visiblePrefix`, `DynamicErrorBoundary`, reduced-motion hook), `SmartSimDraftInput`,
the UI registry and starters, the exam import / save / finalization / grading authorities.

## 3. Physics models (SI units, air resistance neglected)

| Experiment | Model | Natural end |
|---|---|---|
| Free fall (SIM-01) | `y = h₀ + v₀t − ½gt²`, `v = v₀ − gt`, `a = −g` (up positive, ground y = 0) | landing time |
| Projectile (SIM-02) | `x = v₀cosα·t`, `y = h₀ + v₀sinα·t − ½gt²`; `vx` constant, `vy = v₀sinα − gt` | landing time |
| Newton's 2nd law (SIM-03) | horizontal block, applied force F, `N = mg`, Coulomb friction (static μs, kinetic μk) | none (runs to `maxTime`) |
| Inclined plane (SIM-04) | block released at the top, `F∥ = mg·sinθ` down the slope, `N = mg·cosθ`, Coulomb friction | reaching the bottom (if it does) |

* **Landing time** — positive root of `h₀ + v_y t − ½gt² = 0`, written cancellation-free: `(v_y + √D)/g` for `v_y > 0`,
  `2h₀/(√D − v_y)` otherwise (no catastrophic subtraction for downward or zero launch).
* **Friction solver** (shared by SIM-03 and SIM-04) — exact piecewise constant-acceleration motion, at most three phases:
  initial sliding (kinetic friction against the velocity) → stop → either **rest** (static friction holds while `|drive| ≤ μs·N`,
  equality included) or sliding in the drive direction with kinetic friction. Static friction is `−drive` while at rest; kinetic friction
  is `−sign(v)·μk·N` (from rest: against the acceleration). Time to reach a distance uses `2·rem / (v₀ + √(v₀² + 2a·rem))`.
* **Angles** — `sin`/`cos` are exact at 0° and ±90° (no `6e-17` residue in displayed values).
* **Assumptions** — rigid point-like bodies, flat ground, no air resistance, no rolling, no bouncing (motion ends at impact / bottom),
  μk ≤ μs enforced, the incline block starts at the top with `v₀ ≥ 0` down the slope, the Newton block moves on a horizontal surface.

**Analytical certification** (hand-computed, asserted in `src/physicsMotion.21da1.test.ts`):

| SIM | Inputs | Reference values |
|---|---|---|
| 01 | h₀ = 45 m, v₀ = 0, g = 9.8 | t = 3.03046 s, impact speed = 29.6985 m/s |
| 02 | v₀ = 20 m/s, α = 45°, h₀ = 0, g = 9.8 | T = 2.88615 s, R = 40.8163 m, H = 10.2041 m |
| 03 | m = 2 kg, F = 10 N, μs = 0.3, μk = 0.2 | N = 19.6 N, f_k = 3.92 N, a = 3.04 m/s², v(4 s) = 12.16 m/s, x(4 s) = 24.32 m |
| 04 | θ = 30°, m = 5 kg, L = 10 m, μs = 0.3, μk = 0.2 | a = 3.20259 m/s², N = 42.4352 N, t = 2.49899 s, v = 8.00324 m/s |

Further evidence: identity with the `physicsFreeFall@1` engine; projectile mechanical-energy conservation; the friction solver against an
independent fine-step semi-implicit Euler integrator; the static threshold (holds exactly at `|drive| = μs·N`, slides just above);
stop-then-rest and stop-then-reverse; 4 × 400 random parameter sets including the bounds — every frame, sample and reference quantity is
finite or explicitly `null` (never NaN / Infinity); determinism (forward, backward and fresh-model evaluation identical).

## 4. Canonical config (`physicsMotion@1`, config `v: 1`)

```json
{
  "v": 1,
  "experiment": "projectile",
  "params": { "initialSpeed": 20, "launchAngle": 45, "launchHeight": 0, "gravity": 9.8 },
  "controls": [{ "param": "initialSpeed", "min": 5, "max": 40, "step": 1 }],
  "view": { "maxTime": 10, "graphs": ["height", "velocity"], "showVectors": true },
  "tasks": { "measurements": [{ "id": "range", "label": "المدى الأفقي", "unit": "m" }], "points": [{ "id": "landingPoint", "label": "نقطة السقوط" }] }
}
```

Strict validation — refused, never clamped or repaired:

* exact key sets at every level (`MOTION_CONFIG_UNKNOWN_KEY`), `v` must be 1 (`MOTION_CONFIG_VERSION_UNSUPPORTED`), unknown experiment
  (`MOTION_EXPERIMENT_UNKNOWN`);
* parameters: exactly the experiment's keys, finite, inside the physical bounds of the parameter spec, μk ≤ μs, no motionless start
  (`MOTION_PARAMS_INVALID`, with an Arabic reason);
* controls: known parameter, no duplicates, `min < max`, `step > 0` and `≤ max − min`, inside the parameter bounds
  (`MOTION_CONTROLS_INVALID`, `MOTION_CONTROL_LIMITS_INVALID`), and the authored value must lie inside the permitted range
  (`MOTION_CONTROL_EXCLUDES_AUTHORED`);
* view: `0 < maxTime ≤ 600`, graphs from the experiment's allowed set (canonical order), boolean `showVectors` (`MOTION_VIEW_INVALID`);
  free fall / projectile `maxTime` must cover the flight (`MOTION_VIEW_TOO_SHORT`);
* tasks: ≤ 12 measurements and ≤ 12 points, at least one task, unique ids, safe labels ≤ 80 chars, measurement units from
  `s, m, m/s, m/s², N` (`MOTION_TASK_INVALID`, `MOTION_TASKS_TOO_MANY`, `MOTION_TASKS_EMPTY`, `MOTION_TASK_ID_DUPLICATE`).

Primary graph per experiment (graph points live on it): free fall y(t), projectile trajectory y(x), Newton x(t), incline s(t).
Optional graphs: free fall / Newton / incline — velocity, acceleration; projectile — height y(t), velocity components vx(t), vy(t).

## 5. Answers, grading and security

* **Actions** (the only student data): `measurement.set {measurementId, value}` / `measurement.clear`, `graphPoint.set {pointId, x, y}` /
  `graphPoint.clear`; ids must exist, values finite and |v| ≤ 10⁶; a time-axis point must have `0 ≤ x ≤ maxTime`. Anything else is
  rejected (`MOTION_ACTION_INVALID`); at most 500 actions. The server replays actions with the same compiled code; client-claimed state,
  scores or flags are discarded.
* **Checks** (private, never sent to students): `motion.referenceValue {measurementId, quantity, tolerance}` — the expected value is
  computed by code from the **authored** experiment (the quantity must exist for the experiment, its unit must match the measurement
  unit, and it must be defined, e.g. `timeToBottom` is refused when the block never reaches the bottom within `maxTime`); plus the
  generic `numericNear@1` and `pointNear@1` rules. Scoring uses the existing `proportional` / `allOrNothing` SmartSim modes.
* **Grading decision for A.1** — existing behaviour is preserved; no generalized physics grading engine was added. Student exploration
  is **presentation only**: it is never an action, never saved, and tasks are graded on the experiment the teacher authored. The
  workspace states this in a banner whenever explored values differ and offers a one-click return. Experiment-based grading (grading
  against the student's own explored experiment) is reserved for A.3.
* **Sanitizer** — the student projection keeps the public config (params, permitted controls, view, tasks) and strips checks,
  tolerances, quantities and scoring; a tampered config (unknown key, unknown experiment, authored value outside a control) blocks
  finalization and is withheld from students. The scene shows a neutral scale bar rather than the run's exact extent, so a measured
  quantity (range, displacement) is not printed before the experiment is run.

## 6. Student experience

* One presentation clock: **Play / Pause / Resume / Reset / single step (±0.1 s)**, playback rates 0.25×–2×, timeline slider and
  direct time entry; event announcements (apex, impact / landing, reaching the bottom, the block stopping) only on forward playback.
* 2D scene per experiment (3D was not needed for these one-/two-dimensional motions): body, ground / track / incline, velocity vector
  (with vx / vy components for the projectile), forces (weight, normal, applied, friction, net, gravity components on the incline),
  projectile trajectory trail; vectors scaled to the run's maximum.
* Synchronized graphs (progressive path + marker at the clock time, full reference curve, events and saved student points) and a live
  readout of the experiment's quantities with status.
* Teacher-permitted exploration (range + numeric input within the teacher's limits; invalid combinations refused with a reason).
* Arabic RTL page with LTR islands for numbers, units, scene and graphs; one column on phones with no horizontal overflow;
  `prefers-reduced-motion` → no autoplay, stepping and the slider keep every value reachable; print = static snapshot.

## 7. Teacher experience

Experiment selector (each with a classroom preset: config + tasks + weighted checks), SI parameter inputs with bounds, per-parameter
"student may adjust" with min / max / step, duration, optional graphs, vectors, tasks, private checks (the computed expected value is
shown next to each `motion.referenceValue` check), a reference-values panel for the authored experiment, scoring mode, and a live
preview running the real student workspace. Save / reopen use the existing builder (round trip covered by the lifecycle test).

## 8. Validation evidence (local, on this branch)

| Suite | Result |
|---|---|
| `src/physicsMotion.21da1.test.ts` (core, plugin, validation, certification) | 22 / 22 |
| `src/physicsMotion/physicsMotionUi.21da1.test.tsx` (real student host, editor, review, registry) | 10 / 10 |
| `api/tests/certification-21da1/*` (acceptance exam lifecycle through the API build + fixture drift) | 7 / 7 |
| 20G capability matrix (`physicsMotion@1` exercised by exam `21DA1`), coverage map regenerated | pass |
| Full root suite (`npm test`), one run | 11,377 passed, 5 failed — 4 were plugin-list pins updated in this PR (re-run 57 / 57); 1 pre-existing clock-dependent false positive, see §10 |
| `npm run lint`, `npx tsc -b`, `git diff --check` | clean (lint: pre-existing warnings only) |
| `npm run build` + bundle guard | pass — initial JS 124.8 KB gzip (baseline 124.7 KB on `38bbf8c`; +0.1 KB = lazy-chunk preload file names); budget 125 KB unchanged |
| Real Chromium (`scripts/check-physics-motion-browser-21da1.mjs`) | 45 / 45 checks — four experiments, play / pause / resume / step / reset with real rAF, readout synchronized, exploration never an action, editor preview, RTL with LTR islands, median frame 16.7 ms while playing, no overflow at 390 px, no page errors |

The acceptance exam `docs/fixtures/physics-motion-21da1/ExamBank_21DA1_Physics_Motion_Acceptance.json` (generated from
`api/tests/certification-21da1/physicsMotionExam.js`, `WRITE_21DA1_FIXTURES=1`) covers the four simulations and an incline shared
as a composite context: import → save → re-import, finalization without blockers, PERFECT 27 / 27, PARTIAL 14.4, BLANK 0, an
EXPLORER reporting correct physics for an explored experiment scores 0 for it, ATTACKER answers (forged action kinds, unknown task ids,
string values, forged state) are rejected and earn nothing. Like every later-phase fixture it is excluded from the frozen 21A.1 / 21A.2
compatibility corpora (no baseline capture exists for it).

## 9. Known limitations

* Grading uses the authored experiment only (by design for A.1; experiment-based grading is A.3).
* No air resistance, rolling, collisions or bouncing; the incline block only starts at the top moving down-slope; Newton's block is on
  a horizontal surface.
* Graph points are placed on the primary graph only; the other graphs are read-only.
* `physicsMotion@1` is not offered by the AI Composer.
* Bundle headroom on the initial graph is small (≈ 0.2 KB), unchanged in nature by this phase.

## 10. Finding outside this phase (not changed here)

`src/questionTypes/coding.17e-b.test.tsx` uses a secrecy regex containing `9\.17` (the hidden-test weight canary) and scans a page
payload that includes `dueAt = new Date(Date.now() + 864e5).toISOString()`. When the wall clock's seconds and milliseconds read
`…9.17…` (e.g. `04:33:19.170Z`) the regex matches the timestamp and the test fails although nothing leaked. Same class as the auth
fixture hotfix. Proposed fix (separate hotfix): give the fixture a fixed `dueAt` (or a fake clock), or use a weight canary with four
decimals (e.g. `9.1734`), which can never occur in an ISO timestamp's three-digit milliseconds.

## 11. Checkpoint

* Branch `feature/phase-21d-a1-physics-core-motion` from `main` `38bbf8c` (unchanged at the time of writing).
* Completed: core + plugin + shared build; acceptance exam + lifecycle; UI (workspace, editor, review, registry, starter); Chromium
  check; pins; this record.
* Remaining: exact-head CI on the pushed head, independent review, owner merge.
