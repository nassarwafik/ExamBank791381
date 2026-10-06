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
  from the same simulation time when the student presses play. No academic effect. An autoplay-only presentation without a play
  control (the transient network flow) opts in to `resumeOnVisible`: it resumes from the same simulation time (still no catch-up) and is
  never replayed once it reached its end.

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

### 12.1 Freeze pins (semantic contract, captured on the baseline)

`src/smartsim/dynamicFreeze.20e.test.ts` embeds digests captured TWICE on `78445fd` (identical): SmartSim action normalization (academic
actions accepted, playback / seek / rate / vector / probe / flow refused), replay of the physics / function streams, the physics formulas
of four models (impact time, impact speed, peak, y(t), v(t), the legacy `bodyAt`, samples), function sampling, every networkTopology@2
template's solution plus up to 180 ping / tracert host commands (state, transcripts, all-pairs reachability, scoring), Composite
replay-once grading and sanitization. They pass unchanged on the head: the dynamic experience and the engine trace hook changed nothing
academic. The acceptance fixtures A–F (`docs/fixtures/smartsim-20e/`, `api/tests/smartsim-acceptance-20e.test.js`) are **pins** too: they
pass on the baseline and on the head.

### 12.2 Fail-first

| Suite | On `78445fd` sources (`f50e030`) | On the head |
|---|---|---|
| `src/smartsim/dynamic/dynamicRuntime.20e.test.ts` | fails (module `./simulationClock` absent) | pass |
| `src/smartsim/dynamic/dynamicReact.20e.test.tsx` | fails (`./useSimulationClock` absent) | pass |
| `src/physicsFreeFall/freeFallDynamic.20e.test.tsx` | fails (`./freeFallDynamics` absent) | pass |
| `src/net2Flow.20e.test.ts` | fails (`./net2Flow` absent) | pass |
| `src/functionStudy/functionProbe.20e.test.tsx` | 5 × fail (no probe slider / trace button) | pass |
| `src/networkTopology2/net2FlowUi.20e.test.tsx` | 4 × fail (no `net2-flow` overlay) | pass |
| `src/smartsim/dynamicIntegration.20e.test.tsx` | 4 × fail (no dynamic workspace, no `DYNAMIC_SIGNATURES`, no `dynamic.css`) | pass |

Review fixes: the 7 RF1 tests (RF1-F1, RF1-F2 ×3, RF1-F3, RF1-F4, the prefix-bound NIT) failed on `610b157` and pass on the head (also
reproduced independently by the reviewer on a `git archive` of `610b157`); RF2-N1 failed on `0d59fd9` (`"0.000|p|1"` vs `"0.200|s|1"`).

### 12.3 Mutation campaign

58 mutants, one at a time, exact single-occurrence replacement, SHA-256-verified byte-for-byte restore after each, `git status` clean after
every campaign, no campaign concurrent with another test run. **45 KILLED on the first run, 12 SURVIVED → test strengthened → KILLED,
1 EQUIVALENT (reviewer-verified), 0 TIMEOUT, 0 non-equivalent survivors.** No production code was changed to kill a mutant except
exporting `boundedHops` (no behaviour change).

| Id | Planted defect | Outcome | Killed by |
|---|---|---|---|
| M01 | `smartsim/dynamic/simulationClock.ts` — frame delta clamp removed | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › play advances by  |
| M02 | `smartsim/dynamic/simulationClock.ts` — playback rate ignored | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › advance uses elapsed monotonic time × rate,  |
| M03 | `smartsim/dynamic/simulationClock.ts` — end reached keeps playing | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › advance uses elapsed monotonic time × rate,  |
| M04 | `smartsim/dynamic/simulationClock.ts` — play at end does not restart | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › play / pause / restart / seek / step |
| M05 | `smartsim/dynamic/simulationClock.ts` — zero-length clock may play | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › play / pause / restart / seek / step |
| M06 | `smartsim/dynamic/simulationClock.ts` — seek not clamped | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › play / pause / restart / seek / step |
| M07 | `smartsim/dynamic/simulationClock.ts` — step does not pause | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › play / pause / restart / seek / step |
| M08 | `smartsim/dynamic/simulationClock.ts` — any finite rate accepted | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › advance uses elapsed monotonic time × rate,  |
| M09 | `smartsim/dynamic/simulationClock.ts` — duration not capped | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › creation sanitizes the duration and the rate |
| M10 | `smartsim/dynamic/progressivePath.ts` — binary search boundary <= -> < | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › countAtOrBefore is a binary search over sort |
| M11 | `smartsim/dynamic/progressivePath.ts` — current point duplicated (>= -> >) | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › the visible path is the sample prefix strict |
| M12 | `smartsim/dynamic/progressivePath.ts` — exact current point dropped | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › the visible path is the sample prefix strict |
| M13 | `smartsim/dynamic/progressivePath.ts` — prefix not bounded | SURVIVED → KILLED (test strengthened) | smartsim/dynamic/dynamicRuntime.20e.test.ts › NIT: the visible prefix never exceeds plotPo |
| M14 | `smartsim/dynamic/progressivePath.ts` — non-finite point does not break the path | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › scales, ticks and path data are finite and b |
| M15 | `smartsim/dynamic/useSimulationClock.ts` — first frame contributes its timestamp | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › play advances by  |
| M16 | `smartsim/dynamic/useSimulationClock.ts` — cleanup does not cancel the frame | KILLED | smartsim/dynamic/dynamicReact.20e.test.tsx › play starts exactly  |
| M17 | `smartsim/dynamic/useSimulationClock.ts` — hidden document does not pause | KILLED | smartsim/dynamic/dynamicReact.20e.test.tsx › hidden document paus |
| M18 | `smartsim/dynamic/useSimulationClock.ts` — reduced motion autoplays | KILLED | smartsim/dynamic/dynamicReact.20e.test.tsx › autoPlay starts play |
| M19 | `smartsim/dynamic/useSimulationClock.ts` — loop effect re-keyed on every state | KILLED | smartsim/dynamic/dynamicReact.20e.test.tsx › play starts exactly  |
| M20 | `smartsim/dynamic/DynamicPlot2D.tsx` — event markers unbounded | KILLED | smartsim/dynamic/dynamicReact.20e.test.tsx › bounds: points |
| M21 | `smartsim/dynamic/DynamicPlot2D.tsx` — marker finite guard removed | KILLED | smartsim/dynamic/dynamicReact.20e.test.tsx › non-finite dom |
| M22 | `smartsim/dynamic/DynamicPlot2D.tsx` — event kind class not sanitized | SURVIVED → KILLED (test strengthened) | smartsim/dynamic/dynamicReact.20e.test.tsx › series beyond  |
| M23 | `smartsim/dynamic/DynamicPlot2D.tsx` — series count unbounded | SURVIVED → KILLED (test strengthened) | smartsim/dynamic/dynamicReact.20e.test.tsx › series beyond  |
| M24 | `physicsFreeFall/freeFallDynamics.ts` — frame time not clamped to impact | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › frame = modelAt(t) |
| M25 | `physicsFreeFall/freeFallDynamics.ts` — impact velocity shown as 0 | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › frame = modelAt(t) |
| M26 | `physicsFreeFall/freeFallDynamics.ts` — landed height not forced to 0 / no clamp | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › frame = modelAt(t) |
| M27 | `physicsFreeFall/freeFallDynamics.ts` — apex for v0 = 0 | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › events: an upward  |
| M28 | `physicsFreeFall/freeFallDynamics.ts` — samples do not end exactly at impact | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › samples are determ |
| M29 | `physicsFreeFall/freeFallDynamics.ts` — negative sample height | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › samples are determ |
| M30 | `physicsFreeFall/FreeFallWorkspace.tsx` — readout always polite (per-frame announcements) | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › play advances by  |
| M31 | `physicsFreeFall/FreeFallWorkspace.tsx` — scrubber max beyond impact | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › scrubbing synchro |
| M32 | `physicsFreeFall/FreeFallWorkspace.tsx` — impact / apex never announced | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › impact: playback  |
| M33 | `physicsFreeFall/FreeFallWorkspace.tsx` — play control under reduced motion | SURVIVED → KILLED (test strengthened) | physicsFreeFall/freeFallDynamic.20e.test.tsx › no play control and no autoplay; manual ste |
| M34 | `physicsFreeFall/FreeFallWorkspace.tsx` — velocity vector direction inverted | KILLED | physicsFreeFall/freeFallDynamic.20e.test.tsx › velocity / accele |
| M35 | `functionStudy/FunctionStudyWorkspace.tsx` — undefined f(x) shown as defined | KILLED | functionStudy/functionProbe.20e.test.tsx › at an excluded x the readout says f is  |
| M36 | `functionStudy/FunctionStudyWorkspace.tsx` — trace offered under reduced motion | KILLED | functionStudy/functionProbe.20e.test.tsx › reduced motion: no trace animatio |
| M37 | `functionStudy/FunctionStudyWorkspace.tsx` — probe not clamped to window | SURVIVED → KILLED (test strengthened) | functionStudy/functionProbe.20e.test.tsx › a typed x outside the window snaps to t |
| M38 | `net2Flow.ts` — flow success not taken from the probe | KILLED | net2Flow.20e.test.ts › unsolved roas: the failure is shown, never animated as su |
| M39 | `net2Flow.ts` — reply segments drawn as request path | KILLED | net2Flow.20e.test.ts › roas solved: PC1 → PC3 crosses SW1, the router-on-a-stick |
| M40 | `net2Flow.ts` — hops not bounded | SURVIVED → KILLED (test strengthened) | net2Flow.20e.test.ts › boundedHops: consecutive duplicates collapse; above the b |
| M41 | `net2Flow.ts` — consecutive duplicate hops kept | SURVIVED → KILLED (test strengthened) | net2Flow.20e.test.ts › boundedHops: consecutive duplicates collapse; above the b |
| M42 | `net2Flow.ts` — non-host devices traced | KILLED | net2Flow.20e.test.ts › non-flow commands, unknown devices, malformed input and u |
| M43 | `net2Network.ts` — probe never marks the reply phase | KILLED | net2Flow.20e.test.ts › roas solved: PC1 → PC3 crosses SW1, the router-on-a-stick |
| M44 | `net2Network.ts` — trace hook not opt-in (reads absent trace) | KILLED | net2Flow.20e.test.ts › roas solved: PC1 → PC3 crosses SW1, the router-on-a-stick |
| M45 | `net2Network.ts` — ARP segment recorded without the switch trail | KILLED | net2Flow.20e.test.ts › roas solved: PC1 → PC3 crosses SW1, the router-on-a-stick |
| M46 | `networkTopology2/Net2Diagram.tsx` — moving dot under reduced motion | SURVIVED → KILLED (test strengthened) | networkTopology2/net2FlowUi.20e.test.tsx › non-flow commands draw nothing; reduced motion  |
| M47 | `networkTopology2/Net2Diagram.tsx` — failure marker never drawn | KILLED | networkTopology2/net2FlowUi.20e.test.tsx › a failed ping is never shown as success (data-o |
| M48 | `networkTopology2/Net2Diagram.tsx` — failed flow drawn as success | KILLED | networkTopology2/net2FlowUi.20e.test.tsx › a failed ping is never shown as success (data-o |
| M49 | `networkTopology2/Net2Workspace.tsx` — flow survives an external restore | SURVIVED → KILLED (test strengthened) | networkTopology2/net2FlowUi.20e.test.tsx › an external replacement of the answer (restore  |
| RF-M1 | `networkTopology2/Net2Workspace.tsx` — flow fingerprint check removed | KILLED | networkTopology2/net2FlowUi.20e.test.tsx › RF1-F1: an external replacement with the SAME a |
| RF-M2 | `smartsim/dynamic/useSimulationClock.ts` — hidden-tab resume removed | KILLED | networkTopology2/net2FlowUi.20e.test.tsx › RF1-F4: a flow paused by a hidden tab resumes w |
| RF-M3 | `smartsim/dynamic/useSimulationClock.ts` — resume ignores the opt-in | KILLED | smartsim/dynamic/dynamicReact.20e.test.tsx › hidden document paus |
| RF-M4 | `functionStudy/FunctionStudyWorkspace.tsx` — probe step fallback removed | SURVIVED → KILLED (test strengthened) | functionStudy/functionProbe.20e.test.tsx › RF1-F3: an accepted but absurdly narrow |
| RF-M5 | `smartsim/dynamic/progressivePath.ts` — overflow-safe normalization removed | SURVIVED → KILLED (test strengthened) | smartsim/dynamic/dynamicRuntime.20e.test.ts › RF1-F2: linearScale with a finite domain who |
| RF-M6 | `smartsim/dynamic/progressivePath.ts` — non-finite output bound removed | SURVIVED → KILLED (test strengthened) | smartsim/dynamic/dynamicRuntime.20e.test.ts › RF1-F2: linearScale with a finite domain who |
| RF-M7 | `smartsim/dynamic/progressivePath.ts` — prefix bound off by one | KILLED | smartsim/dynamic/dynamicRuntime.20e.test.ts › NIT: the visible prefix never exceeds plotPo |
| RF-M8 | `functionStudy/FunctionStudyWorkspace.tsx` — snapped non-finite result not refused | EQUIVALENT (reviewer-verified) | finite positive step + validated finite window keep the snapped value finite |
| RF2-M1 | `smartsim/dynamic/useSimulationClock.ts` — resume replays a finished presentation | KILLED | smartsim/dynamic/dynamicReact.20e.test.tsx › RF2-N1: resumeOnVisi |

### 12.4 Independent review

A read-only reviewer (separate worktree, never touching the implementation tree) reviewed `a0d9b5f`: **CHANGES REQUIRED** — no BLOCKER or
MAJOR; four confirmed MINOR findings (F1 a flow surviving a same-count answer replacement, e.g. the 409 server-wins reconcile; F2 NaN plot
attributes for an accepted `h0 = 5e-324`; F3 NaN probe attributes for an accepted `[0, 5e-322]` window; F4 a flow frozen after a hidden
tab) plus NITs. Review Fix 1 (`c975347`, `0d59fd9`) fixed F1–F4 and the prefix-bound NIT with fail-first tests. Re-review of `0d59fd9`:
**CLEAN**, with one new cosmetic NIT (N1, a finished flow could replay when the end frame and the hidden event raced) fixed in Review Fix 2
(`3226715`) with a fail-first test. NITs left by decision (reviewer agrees): the REPLY_FAILED status wording, a possible double announcement
at the end of playback (readout turning `polite` while the impact status is announced), the freeze test's capture-mode early return.

### 12.5 Bundle

Initial JS graph: 18 files, 127 031 B gzip on `94c2bfc` vs 127 025 B on `78445fd` (independently measured by the reviewer; the initial
files are byte-identical apart from their content-hash names, so the few bytes are gzip noise from the hash strings, not growth — the
intermediate `009275a` measured 127 009 B, `0d59fd9` 127 033 B). Budget 125 KB unchanged; the guard prints 124.1 KB (rounding of 127 031 B).
The dynamic payload (`SIMULATION_CLOCK_V1`, `xp-dyn-plot`, `dyn-flow`, `fnstudy-probe`) is present only in lazy chunks; the guard refuses it
in initial files and fails if a signature disappears.

### 12.6 Limitations (v1)

- DNS / DHCP / browser flows are not drawn (the engine does not expose those traversals cleanly); a name target is resolved like the
  transcript and only the ping / tracert probe is drawn.
- A wireless hop through an AP is drawn host → first switch (the AP is a transparent bridge absent from the engine's switch trail).
- A REPLY_FAILED flow shows the failure marker at the target the request reached; the wording says the path stopped there.
- No real-browser smoke suite exists in the repository; the UI is exercised with Testing Library in happy-dom with a deterministic fake
  `requestAnimationFrame`.
