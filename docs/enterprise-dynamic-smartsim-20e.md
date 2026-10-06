# Phase 20E — Enterprise Animated & Dynamic SmartSim Experience

Baseline `78445fd9b4f42768582153d0fdafcdc0626afa35` (Phase 20D.1 merged, post-merge CI green). Branch
`feature/20e-enterprise-dynamic-smartsim`.

## 1. Purpose and the one rule

Trusted SmartSim workspaces become synchronized, animated, explorable simulations — a falling body with live, progressively drawn
height and velocity graphs, a function probe that traces a rational curve, a packet that follows the path the network engine
actually computed — through ONE reusable, repository-owned dynamic runtime.

> **Server replay remains authoritative.** Animation frames, wall-clock time, `requestAnimationFrame` timestamps, playback speed,
> scrubber position, hover / probe position, vector visibility and transient network flows are presentation. None of them is an
> action, none reaches the answer, autosave, grading or review.

No plugin version changed: `physicsFreeFall@1`, `functionStudy2d@1` and `networkTopology@2` keep their configuration, semantic actions,
private checks and scoring byte-for-byte (freeze pins captured on the baseline, §12).

## 2. Architecture

```
                      lazy plugin workspace (one per SmartSim context)
                                        │
              useSimulationClock(duration)  ── ONE requestAnimationFrame loop while playing
                                        │  state.time  (simulation seconds)
                                        ▼
                 plugin presentation adapter: modelAt(time)   (analytic; never integrated per frame)
                                        │
        ┌───────────────────────┬───────┴──────────────┬──────────────────────┐
        ▼                       ▼                      ▼                      ▼
  scene (body / probe /   DynamicPlot2D (prefix +   DynamicPlot2D (…)     readout + event
  flow dot)               exact current point)                            live region
```

| Module | Role | Graph |
|---|---|---|
| `src/smartsim/dynamic/simulationClock.ts` | pure deterministic presentation clock (`SIMULATION_CLOCK_V1`, frozen `DYNAMIC_LIMITS`) | lazy |
| `src/smartsim/dynamic/progressivePath.ts` | binary-search prefix + exact current point, scales, ticks, finite path data | lazy |
| `src/smartsim/dynamic/useSimulationClock.ts` | React binding: one RAF loop, visibility pause, reduced motion | lazy |
| `src/smartsim/dynamic/usePrefersReducedMotion.ts` | live `prefers-reduced-motion` | lazy |
| `src/smartsim/dynamic/DynamicPlot2D.tsx` | trusted SVG plot (`xp-dyn-plot`) | lazy |
| `src/smartsim/dynamic/DynamicErrorBoundary.tsx` | local fallback to a static view | lazy |
| `src/smartsim/dynamic/dynamic.css` | styles on the 20D.1 presentation variables | lazy |
| `src/physicsFreeFall/freeFallDynamics.ts` | `freeFallFrame` / `freeFallEvents` / `freeFallSamples` (presentation adapter) | lazy |
| `src/net2Flow.ts` | `traceHostCommandFlow` — the network engine's own traversal for ping / tracert | lazy |

The runtime knows nothing about physics, functions or networks; each plugin supplies its own analytic model / engine output.
It is imported only by the lazy plugin workspaces (`smartSimUiRegistry` dynamic imports), so the initial graph does not grow.

## 3. Clock model — simulation time vs wall time

- State `{ time, duration, playing, rate }`; operations `play / pause / restart / seek / step / setRate / advance` are pure and never
  mutate their input.
- `advance(elapsedMs)`: simulated step = `clamp(elapsedMs / 1000, 0, 0.1 s) × rate`. Frames need not arrive at 60 FPS; a frozen tab
  contributes at most 0.1 s, never an unbounded jump. Reaching the end stops exactly at `duration`.
- `seek` / `step` / `restart` set the time directly from the canonical value — never from accumulated frame error.
- Rates: 0.25×, 0.5×, 1×, 2× (any other value is ignored). At 0.25×, one real second is 0.25 simulated seconds.
- Plugins compute `state = modelAt(time)` analytically; nothing integrates frame by frame.

## 4. requestAnimationFrame lifecycle

- Exactly ONE loop per running clock: the effect is keyed on `playing` (and the duration), so re-renders, rate changes and seeks
  during playback reuse the loop and its last timestamp.
- The first frame after (re)starting contributes 0 s.
- The loop is cancelled on pause, on reaching the end, on unmount and on duration (context) change.
- **Page visibility**: when the document becomes hidden the presentation pauses; on return nothing catches up — playback resumes
  from the same simulation time when the student presses play. No academic effect.

## 5. Progressive paths

Samples are precomputed once per model (bounded, deterministic). At time `t` the visible path is every sample strictly before `t`
(binary search, `O(log n)`) plus the EXACT current analytic point, so the path endpoint and the moving marker coincide and no point
is duplicated. Growth is monotonic with time.

## 6. physicsFreeFall@1

Academic model unchanged: `y(t) = h0 + v0·t − ½·g·t²`, `v(t) = v0 − g·t`, no air resistance; semantic actions unchanged
(`measurement.set / clear`, `graphPoint.set / clear`); checks unchanged (`physics.impactTime`, `physics.impactSpeed`,
`physics.heightAtTime`, `physics.velocityAtTime`, `physics.pointOnTrajectory`, `numericNear@1`, `pointNear@1`).

- One clock drives the body, the height graph, the velocity graph, both markers, the readout (t, y, v, a), the vectors and events.
- **Impact policy (v1):** playback stops automatically at impact; the scrubber maximum is the impact time. The trajectory endpoint and
  the readout keep the physical impact velocity `v(t_impact⁻) = −√(v0² + 2·g·h0)` (never a misleading 0) together with a "landed"
  statement; the height graph ends at `y = 0` (no negative height). The legacy `bodyAt()` helper is unchanged (frozen) but no longer
  used for the dynamic readout.
- **Apex:** for `v0 > 0`, `t_apex = v0 / g` is marked «أعلى نقطة» on the velocity graph (the marker visibly crosses `v = 0`).
- **Vectors:** velocity and acceleration arrows are presentation toggles; direction is exact, length is scaled and clamped.
- **Controls:** play / pause, restart, ±0.1 s steps, rates, slider and a numeric time input; keyboard-native controls.
- **Live region:** announces pause, restart, apex and impact only; the numeric readout is `aria-live="off"` while playing and
  `polite` when paused, so nothing is announced per frame.

## 7. functionStudy2d@1

Academic tasks and actions unchanged. A presentation probe (slider + numeric input) shows `x` and `f(x)` evaluated ONLY by the shared
safe expression engine (`evaluateFunctionAt`); where `f` is undefined the readout says so and no point is drawn. A trace mode sweeps the
probe across the window with the presentation clock (not under reduced motion). The graph keeps the existing safe segmentation (no
segment ever crosses a pole). The workspace still draws none of the graded features (asymptotes, intercepts, extrema): they are the
answer. No slope is shown (it would need new mathematical semantics).

## 8. networkTopology@2 — transient flows

The network engine decides; the overlay visualizes. `traceHostCommandFlow` mirrors `runHostCommand` exactly
(`withTraffic → resolveTarget → pickSource → probe`) on the SAME pre-command state the replay applies the command to, with an inert,
opt-in trace hook in the engine (`Net.trace`): when present, `l2Deliver` records the switch trail of the delivered frame, `arpResolve`
records each request / reply segment and `probe` marks the reply phase; when absent nothing changes (freeze pins: every template's
ping / tracert transcripts, reachability and scoring are byte-identical). Success of the flow is exactly the transcript's success.

- Successful ping / tracert: a dot travels along `source → switches → router(s) → switches → target`.
- Failure: the path is drawn up to the last device the engine reached, with a failure marker; never animated as success.
- Ephemeral: the flow is local UI state — never in the answer, never autosaved, never restored, cleared on reset and unmount.
- v1 scope: ping and tracert. DNS / DHCP / browser flows are not drawn (the engine does not expose their traversal cleanly).
- Wireless hops: the AP is not part of the engine's switch trail; the overlay connects the host to the next hop directly.

## 9. Composite shared contexts

A shared SmartSim context is rendered once by `CompositeResponse` (`SimContext`); the clock lives inside that workspace, so there is
one dynamic renderer, one clock, one canonical action stream and one replay per context. Answering other parts does not remount or
reset the simulation (pinned by test).

## 10. Accessibility, reduced motion, print, presentation

- Animation is never the only source of information: numeric readouts, textual command results and probe coordinates.
- `prefers-reduced-motion`: no autoplay and no play / trace control; manual steps, slider and numeric inputs keep everything usable;
  network flows are shown as a static path.
- Print: controls, flow dots and status lines are hidden; the static state (current graphs / topology) remains.
- Styling uses the Phase 20D.1 presentation variables (`--xp-*`) with code-owned fallbacks — no second theming system; the workspace
  variants (`laboratory`, `networkWorkspace`, `visualWorkspace`) are inherited from the question shell.
- A dynamic renderer error falls back to a static view; the academic forms stay outside the boundary.

## 11. Performance, bounds and bundle

- Bounds (`DYNAMIC_LIMITS`): ≤ 2001 plot points, ≤ 16 event markers, ≤ 4 series, ≤ 32 flow hops, duration ≤ 600 s.
- Per frame: one clock state update in the workspace subtree; samples are memoized; the exam page, the timer and autosave do not
  re-render.
- Initial JS budget 125 KB gzip — not raised. All 20E code is lazy; `DYNAMIC_SIGNATURES` (`SIMULATION_CLOCK_V1`, `xp-dyn-plot`,
  `dyn-flow`, `fnstudy-probe`) are refused in initial files and must exist in some chunk.
- No chart / animation library (no D3, Plotly, Chart.js, Three.js); SVG built by repository code.

## 12. Evidence

Freeze pins (`src/smartsim/dynamicFreeze.20e.test.ts`), fail-first suites, mutation campaign, validation, independent review and
exact-head CI are recorded in the sections below and in the pull request.
