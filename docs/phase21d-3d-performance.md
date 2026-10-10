# Phase 21D — 3D performance and memory record

## 1. Method

- **Browser:** Chromium 141.0.7390.37, headless, in this container (Linux). No real phone or tablet was available: the "mobile"
  profile is a 390 × 844 viewport with DevTools CPU throttling at 4×, which is an **emulation**, not a device measurement.
- **Page:** `browser-harness/interactive-3d-21d.html` (the production `Interactive3DView`, built by Vite in production mode), one model
  per page for measurements.
- **Input:** a 2 s continuous back-and-forth mouse drag at 125 events/s dispatched through the DevTools input pipeline (the page's real
  pointer-event path), including direction reversals.
- **Metrics:** frame intervals from `requestAnimationFrame` (median FPS, p95, max, frames over 33 ms); long tasks (PerformanceObserver);
  main-thread task / script / layout / style time from the DevTools Performance domain over the drag.
- **Before / after:** the same script was run on an untouched `294500e` worktree (the harness page copied in for the run and removed
  afterwards) and on the 21D head. Headless Chromium paces frames at 60 Hz, so FPS saturates at 59.9; the main-thread busy time is
  the better comparison of the renderer's own cost.

## 2. The regression found during 21D, and its root cause

The first 21D build measured well on the desktop profile but **failed the throttled profile**: the dragged sphere had a p95 frame of
150 ms and the heart 100 ms (baseline 17 ms / 33 ms). Two root causes, both confirmed with a CPU profile of an unminified build:

1. **Level-of-detail budget too generous.** The moving budget (2200 faces) let a lone sphere move at high quality (2048 faces ≈ 1300
   drawn polygons) — the profile showed `data-quality=high` throughout the drag.
2. **Work spent on items that are never drawn.** The projection formatted points, shaded, allocated and sorted every face (including
   culled back faces) and every mesh line (≈ 1100 for the draft heart) each frame, although the viewer draws a fraction; the sort
   tie-breaker used `localeCompare` on ids.

Fixes (commit "per-frame cost back to baseline on a 4x-throttled CPU"):

- budgets **4500 faces at rest / 700 while moving** (sphere moves at low, heart / torso / water at draft; each returns to its rest level
  as soon as the motion settles);
- an optional draw filter for `projectInteractive3DScene` (the viewer passes what its display mode draws; unfiltered output unchanged);
- camera trigonometry computed once per projection instead of per vertex; numeric depth tie-breaker;
- in the solid modes, silhouettes are drawn at rest only (true edges stay while moving).

Tried and **rejected**: keying drawn polygons by painter slot instead of face id (cheaper DOM updates) — it broke the preserved 21C
contract that a face's element keeps its identity across a small rotation (`interactive3d.21c.test.tsx`), so it was reverted.

## 3. Results (same machine, same script)

Polygons are those drawn at the end of the drag (the moving level of detail).

| Profile | Model | Polygons | Median FPS | p95 frame (ms) | Max frame (ms) | Frames > 33 ms | Long tasks | Main-thread busy (ms) | Script (ms) |
|---|---|---|---|---|---|---|---|---|---|
| desktop 1280 | cube | 6 → 3 | 59.9 → 59.9 | 16.7 → 16.7 | 16.8 → 16.8 | 0 → 0 | 0 → 0 | 337 → 414 | 108 → 169 |
| desktop | sphere | 126 → 188 | 59.9 → 59.9 | 16.7 → 16.8 | 16.8 → 33.4 | 0 → 0 | 0 → 0 | 710 → 1233 | 275 → 642 |
| desktop | heart | 600 → 344 | 59.9 → 59.9 | 16.7 → 16.8 | 16.8 → 16.8 | 0 → 0 | 0 → 0 | 1924 → 1900 | 966 → 1053 |
| mobile 390, 4× CPU | cube | 6 → 3 | 59.9 → 59.9 | 16.7 → 16.7 | 33.3 → 16.8 | 0 → 0 | 0 → 0 | 1454 → 1452 | 505 → 626 |
| mobile, 4× CPU | sphere | 126 → 187 | 59.9 → 59.9 | 16.7 → 16.8 | 16.8 → 50.0 | 0 → 2 | 0 → 0 | 2646 → 3974 | 1068 → 2199 |
| mobile, 4× CPU | heart | 600 → 347 | 59.9 → 59.9 | 33.3 → 33.4 | 83.4 → 66.7 | 7 → 15 | 1 → 3 | 4863 → 4810 | 2451 → 2783 |

Reading the table honestly:

- **Heart** (the heaviest preset): main-thread cost at parity with the baseline on both profiles, same p95, while the model now has
  lighting, culling, silhouettes and a 3284-face rest mesh (baseline 600 flat faces).
- **Sphere**: more expensive than the baseline (≈ 1.5× main-thread time under 4× throttling; 2 of 271 frames over 33 ms) because the
  baseline drew a coarse 126-face, unlit sphere. It stays at a 59.9 median and a 16.8 ms p95.
- **Cube**: unchanged in practice (the cube now draws its 3 visible faces instead of 6).
- Run-to-run variance on the throttled heart is visible across repeated runs (p95 33.3–33.4 ms, frames over 33 ms 9–20, busy
  4.8–5.1 s), which is why the gate below is set at "two frames" (p95 ≤ 34 ms) and not tighter.

## 4. Interaction cost controls

- **Pointer coalescing:** a leading camera update plus at most one trailing update per animation frame; the last coalesced camera of a
  gesture is applied at pointer-up (never dropped).
- **No geometry rebuild per move:** meshes are cached per (quality, scene content) in a bounded map (12 entries) shared by all viewers
  and re-renders; a parent that re-derives an identical scene never rebuilds geometry. Only projection runs per frame.
- **Inertia** integrates the exact exponential decay (frame-rate independent; tested at 60 Hz, 120 Hz and irregular frames).
- **Wheel listener** is non-passive (it must prevent page scroll when it zooms) and attached to the viewer only.

## 5. Memory and lifecycle

- 50 mount / unmount cycles of the viewer (alternating sphere and heart), measured in Chromium after forced GC: heap growth **11 KB**
  between cycle 10 and cycle 50 (gate: < 1 MB), one viewer left in the DOM, no page error.
- An animating viewer (auto-rotation) that unmounts leaves **no animation loop** behind: 24 frames requested while animating, 0 in the
  800 ms after unmount (counted by wrapping `requestAnimationFrame`).
- Unit level (`3D-LIFE-01`): every pending frame callback is cancelled and every wheel listener added is removed across 12
  mount / animate / unmount cycles.

## 6. Bundle

- The initial JavaScript graph is **127,997 bytes gzip** against the unchanged **128,000-byte (125 KB) budget**; the baseline was
  127,992. The +5 bytes are chunk-hash strings in lazy-import tables, not 3D code: every 3D module stays behind lazy edges.
- A first version shared the orbit controller between the 3D-objects viewer and the 21B surface viewer; the bundler then emitted it as
  its own chunk, the 3D question's lazy entry listed one more file, and the initial graph reached 128,013 bytes (over budget). The
  surface viewer therefore keeps its own small camera with only its two defect fixes (azimuth wrap, content-keyed reset), and the
  budget was not raised.
- **Headroom is 3 bytes.** It was 8 bytes on the baseline; the next change that adds a lazy chunk to an initial lazy-import table will
  need a deliberate bundle-relief step. Recorded here so it is not discovered by surprise.

## 7. Gates

`scripts/check-interactive-3d-browser-21d.mjs` gates the frame pacing on the certification machine: desktop median ≥ 55 FPS and ≤ 2 %
of frames over 33 ms; throttled mobile median ≥ 50 FPS and p95 ≤ 34 ms. In CI (`interactive-3d-browser-21d.yml`) the frame metrics are
recorded in the uploaded report but not gated (`PERF_GATE=0`), because a shared runner's CPU speed is not controlled; every behavioural
and visual check is gated in CI.

## 8. Limits of this evidence

- No real-device measurement (phones, tablets, low-end laptops): emulation only.
- Chromium only. Firefox and Safari (WebKit) were not available in this container; the renderer uses standard SVG, pointer events and
  `requestAnimationFrame` with no engine-specific API, but that is an argument, not a measurement.
- Headless 60 Hz pacing: 120 Hz displays were not measured (inertia is frame-rate independent by construction and by unit test).
