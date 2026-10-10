# Phase 21D — 3D engine acceptance record

Acceptance of the Phase 21D brief against evidence. Every row names the test or Chromium check that proves it; anything not proven is
listed under "not verified". Companion records: `docs/phase21d-3d-audit.md` (baseline defects), `docs/phase21d-3d-rendering-quality.md`,
`docs/phase21d-3d-performance.md`.

## 1. Evidence sources

| Source | What it is | Result on the head |
|---|---|---|
| `src/interactive3d/engine.failfirst.21d.test.tsx` | 11 behavioural fail-first cases, baseline APIs only | all 11 **fail on `294500e`** (assertion failures, untouched worktree), all pass on the head |
| `src/interactive3d/engine.21d.test.tsx` | geometry precision, projection, camera maths, viewer behaviour, exam integration | 31 / 31 pass |
| `src/interactive3d/interactive3d.21c.test.tsx`, `scene3dAuthoring.21c.test.tsx`, `src/functionSurfaces/*.test.tsx` | preserved 21C / 21B contracts | pass, unchanged |
| `scripts/check-interactive-3d-browser-21d.mjs` | real-Chromium certification of the production component (demonstration page + exam fixture) | **40 / 40 checks** |
| `scripts/check-interactive-3d-browser-21c.mjs`, `scripts/check-function-surface-browser-21b.mjs` | earlier phases' Chromium harnesses | 18 / 18 and 14 / 14 |

Chromium 141.0.7390.37 headless in this container; "mobile" is a 390 px viewport with touch emulation (and 4× CPU throttling for the
performance profile), not a device.

## 2. Requirement → evidence

### Interactive rotation, zoom, touch, reset

| Requirement | Evidence |
|---|---|
| Free rotation in every direction, no hard stop (3D-ROT-01/02/03) | Chromium `3D-ROT-01` (horizontal drag turns the heart, yaw −0.65 → 1.51), `3D-ROT-02` (vertical drag tilts; an extreme drag stops at the 1.45 rad pitch limit with the model drawn), `3D-ROT-03` (six sweeps in one direction each keep turning); unit `21D-FF1` (fails on baseline) |
| Pitch never flips over the pole | unit "yaw wraps instead of stopping; pitch is clamped short of the poles" |
| Rotation proportional to the viewer, same on phone and desktop | unit "a full-width drag turns the model by the same angle on a phone and on a desktop" |
| Smooth motion, frame-rate-aware damping | unit inertia tests (60 Hz / 120 Hz / irregular frames travel the same angle; release speed capped; zero after a pause); performance record |
| Wheel zoom without hijacking the page (3D-ZOOM-01) | Chromium: unfocused wheel scrolls the page and leaves the model; focused wheel zooms (×1.43) without scrolling; zoom stays in [0.55, 2.2]; Ctrl+wheel (trackpad pinch) zooms; "fit view" restores zoom 1 with the model inside; unit `21D-FF4` (fails on baseline) and wheel-maths tests |
| Touch drag and pinch (3D-TOUCH-01) | Chromium (touch emulation): one-finger drag rotates on both axes without scrolling the page; two-finger spread zooms to the 2.2 limit; unit `21D-FF4` pinch (fails on baseline) and "the last step of a pinch is applied when the fingers lift" |
| Reset (3D-RESET-01) | Chromium: "إعادة العرض" returns the rotated, tilted, zoomed heart to its authored camera **and identical drawing**; keyboard Home does the same; unit 3D-RESET-01 |
| Keyboard access | Chromium `3D-KEY` (arrows rotate, + zooms, Home resets, page does not scroll); unit "keyboard input elsewhere on the page never moves the model" |
| No text selection while dragging | Chromium `3D-ROT-03` second check (selection empty after drags); CSS `user-select: none` on the scene |
| Auto-rotate that yields and respects reduced motion | Chromium `3D-AUTO` (turns, stops on the first touch), `3D-MOTION` (not offered under `prefers-reduced-motion`); unit auto-rotate test and "a click that stops auto-rotation … returns the viewer to its rest quality" |
| Stable framing (no size pulse, rotation about the centre) | Chromium `3D-SIZE` (sphere width ratio 1.001 over a turn; baseline 1.027); unit `21D-FF3` (cube scale ratio < 1.001; baseline ×1.414) |

### Rendering

| Requirement | Evidence |
|---|---|
| High-fidelity solids (sphere, cube, cuboid, pyramid, cone, cylinder; ellipsoid) | `21D-GEO` extents / closed meshes / outward normals at every quality; Chromium `3D-VIS` (all 7 geometry models inside their viewer in 4 canonical views; screenshots) |
| Prism | **Not added**: a prism is not a kind of the versioned contract; adding one would be a schema change the brief forbids doing silently. Cube / cuboid are the right prisms the contract supports. |
| Lighting and materials | unit "lighting: faces turned towards the key light are brighter …"; `21D-FF5` curved surfaces shaded (> 20 tones; baseline 1) |
| Display modes (solid, wireframe, solid + edges, transparent) | Chromium `3D-MODES`; unit "display modes …" |
| Quality Low / Medium / High / Auto, no UA sniffing | Chromium `3D-QUALITY` (177 < 500 < 1269 polygons); `3D-ROT-04` (lighter level while dragging, rest level after); unit LOD tests; no `navigator.userAgent` read anywhere in the 3D code |
| True edges and silhouettes | unit crease counts (cube 12, pyramid 8, cylinder 2·seg, cone 1 rim, sphere 0) and "silhouette lines of a sphere lie on its outline circle"; Chromium `3D-VIS` cube culling (1 / 1 / 2 / 3 faces) and sphere roundness (1.000 in every view) |
| Heart improved, clearly a simplified model, no unlicensed asset | rendering record §7; title «القلب — نموذج تعليمي مبسّط»; no asset added (`git diff` adds no binary or model file) |

### Mathematical precision

| Requirement | Evidence |
|---|---|
| V and A formulas | unit volume convergence for all six kinds (tolerance per quality, high ≤ 0.5 %) and sphere area `4πr²` |
| Dimension accuracy | unit "every solid at every quality has its authored full extents" (1e-9) |
| Invalid inputs | the 21C validator rejects them before any mesh is built (unchanged 21C tests); the viewer renders the teacher-review notice |

### Exam integration (3D-EXAM-01)

| Requirement | Evidence |
|---|---|
| Student rotates, the answer never changes | Chromium: a click on the drawn left ventricle selects it; a drag, keyboard camera keys and zoom leave the answer identical; unit 3D-EXAM-01 (rotation, zoom and timer re-renders never change the answer) |
| The view survives the exam timer and a parent that re-derives the question | Chromium: after the motion settles, the camera is unchanged through further 1 s timer ticks (each re-derives the question object); unit `21D-FF2` (fails on baseline) |
| Navigate away and back keeps the answer | Chromium: next → type a note → previous; the answer and the pressed target-list button are intact |
| Timer keeps running | Chromium: tick counter ≥ 3 during the interaction (30 at the end of the run) |
| Submission / grading unchanged | no change to answer shape, sanitizer, server grading or the shared-finalization mirror (no file under `api/` changed) |
| Teacher preview / save / reload / import | the editor, preview and import paths are untouched and use the same viewer; their 21C tests pass unchanged |
| Schema | **no schema change** |

### Lifecycle, accessibility, RTL, print

| Requirement | Evidence |
|---|---|
| Cleanup (3D-LIFE-01) | Chromium: 50 mount / unmount cycles, heap growth 11 KB after GC, no animation loop after an animating viewer unmounts; unit 3D-LIFE-01 (every frame callback cancelled, every wheel listener removed) |
| RTL, no overflow | Chromium `3D-RTL` (document and viewers right-to-left, no horizontal overflow); 21C B320–B1280 checks |
| Print | Chromium `3D-PRINT` (drawing kept; controls, options, help hidden); 21C R1 / R2 |
| No page errors | Chromium `3D-ERRORS` |

## 3. Live demonstration page

`browser-harness/interactive-3d-21d.html` mounts the **production** `Interactive3DView` (not a mock) for every supported solid, the
anatomy and chemistry presets, an exam fixture with the real student question card inside a parent that re-renders every second and
re-derives the question, a remount control, and (`?views=1`) the canonical-views gallery. Build and open it with
`npx vite build` + the certification script, or `npx vite` and `/browser-harness/interactive-3d-21d.html`. It is never shipped (only
`index.html` is a production entry).

## 4. Adversarial self-review (findings and outcome)

| # | Probe | Finding | Outcome |
|---|---|---|---|
| A1 | Throttled-CPU measurement | dragged sphere / heart missed frames (p95 150 / 100 ms) | fixed (LOD budgets, draw filter); performance record §2 |
| A2 | Click on a model that is auto-rotating | the viewer stayed in its moving state (lighter mesh) forever after a click | fixed; regression test; 4 planted defects killed |
| A3 | Pinch with coalesced moves | the last zoom step could be dropped at finger lift | fixed; regression test |
| A4 | Slot-keyed rendering (performance idea) | would let a click land on a different face than the one pressed after a redraw, and broke a 21C contract | rejected and reverted |
| A5 | Shared orbit chunk | initial bundle over budget by 13 bytes | surface viewer keeps its own camera; budget unchanged |
| A6 | Probe quality | two Chromium probes were wrong (measured during inertia; serialized an `SVGRect`) | probes fixed, never the expectations |

## 5. Not verified / limitations

- Real devices (phones, tablets, low-end laptops) and non-Chromium engines (Firefox, Safari) were not available.
- Interpenetrating primitives (the heart's chambers) show a facet-resolution saw-tooth along the intersection (painter's algorithm).
- Frame-timing gates run on the certification machine; CI records but does not gate them.
- Pan is not offered (not required for the educational use; reset / fit cover re-centring).
