# Phase 21D — 3D subsystem audit (baseline `294500e`)

Audit of the interactive 3D subsystem as it exists on `main` at `294500e` (after Phases 21B and 21C), written **before** any 21D change.
Every statement below was checked against the code or measured in real Chromium; phase descriptions were treated as claims, not evidence.

## 1. What exists

| Area | Files | Nature |
|---|---|---|
| Interactive 3D scene contract | `src/interactive3d/sceneSpec.ts` (mirrored to `api/src/lib/shared-finalization/interactive3d/sceneSpec.js`) | `Interactive3DSceneSpecV1`: objects of kind `box`, `sphere`, `ellipsoid`, `cylinder`, `cone`, `pyramid` (centre, full-extent `size`, rotation, palette, opacity) + semantic targets (object / face / edge / vertex). Data only. |
| Mesh + projection | `src/interactive3d/sceneMesh.ts` | Procedural meshes from the spec, **orthographic** projection, painter's sort by mean depth. |
| Viewer | `src/interactive3d/Interactive3DView.tsx` + `interactive3d.css` | **Owned SVG renderer** (one `<polygon>` per mesh face), React state camera `{yaw, pitch, zoom}`. |
| Presets | `src/interactive3d/scenePresets.ts` | `cube`, `pyramid`, `heart`, `torso`, `water` (teacher templates). |
| Exam integration | `src/scene3DSelectionQuestion.ts`, `questionTypes/student/S3DResponse.tsx`, `editors/Scene3DSelectionEditor.tsx`, `interactive3d/Scene3DSelectionReview.tsx`, RichContent `interactive3D` block | Semantic-target selection question `scene3DSelection@1`; grading on target ids, never pixels. |
| 3D surfaces (21B) | `src/functionSurfaces/*` | `z = f(x, y)` surfaces, same owned-SVG approach, camera `{azimuth, elevation}`. |
| Dependencies | — | **No Three.js, React Three Fiber, WebGL, GLTF/GLB or external asset.** Every "3D model" is procedural geometry projected to SVG. |

There is no static image or SVG drawing pretending to be 3D: every listed model is a genuine 3D mesh that is re-projected for each
camera. The defects below are in the camera, the projection framing, the tessellation and the shading — not in "fake" models.

## 2. Capability inventory (baseline)

| Capability | Implemented | Operational | Observed problems | Required improvement |
|---|---|---|---|---|
| 3D geometry (6 solid kinds) | yes | yes | sphere/ellipsoid 14×9 lat-long (126 faces), cylinder/cone 16 segments; cone = cylinder with a 0.001-scaled top ring (degenerate quads, no apex vertex); facets stroked dark | tessellation by quality, true cone apex, single-polygon caps, outward normals |
| 3D anatomy (heart, torso) | yes (composite primitives) | yes | flat fills, no shading → reads as a flat sticker; coarse ellipsoids | lighting + smooth curved surfaces + silhouettes; keep the "مبسّط" (simplified) labelling |
| Rotation | yes (drag, arrow keys, buttons) | **partly** | yaw clamped to [−π, π]: after ~1–1.5 turns the model **stops rotating** (hard wall); camera reset whenever the scene object identity changes | unbounded yaw, content-keyed reset |
| Zoom | buttons, +/− keys | partly | **no wheel, no pinch**; scale **pulses** with orientation | wheel (deliberate), pinch, rotation-invariant framing |
| Pan | no | — | — | not required for the educational use (documented decision) |
| Mobile touch | one-finger drag | yes | no pinch zoom | pinch |
| Geometry accuracy | sizes honoured | yes | no tests of extents / volumes | extents + volume / area convergence tests |
| Student exam viewer | yes | yes | camera snaps back when a parent re-derives the scene object | content-keyed reset |
| Teacher preview | yes | yes | same snap-back on preview re-renders | same |
| Accessibility | keyboard, buttons, target list, text summary | yes | — | keep; add labelled controls for new features |

## 3. Root causes (measured)

**D1 — the model "breathes" while rotating (primary smoothness defect).** `projectInteractive3DScene` recomputed the scale on every frame
from `max(|x|, |y|, |z|)` of the *rotated* vertices. That maximum depends on orientation, so the drawn size changes as the model turns.
Measured over a full horizontal turn (pitch 0): **cube ×1.414**, pyramid ×1.414, water molecule ×1.298 (`scaleMax / scaleMin`); in
Chromium the sphere's drawn width varied by 2.7 %. Rotation therefore looked like rotation + zoom pumping. The projection also
rotated around the world origin, not the scene's centre.

**D2 — "the model looks 3D but cannot be rotated".** Yaw was clamped to [−π, π] in the drag, key and button handlers, so after
1–1.5 turns in one direction dragging further did nothing (Chromium probe: after four full-width sweeps a fifth sweep **did not change
the drawing**). Second cause: `useEffect(() => setCamera(start(spec)), [spec])` reset the camera whenever the parent passed a new scene
**object** with the same content. In the 21D exam fixture (a parent that re-renders every second like the exam timer and re-derives
the question) a drag was **undone within one second** (`examDragSurvivesTimer: false`). The production student page memoizes its
pages, but the 21C harness, teacher previews and any non-memoizing parent rebuild the scene inline.

**D3 — insufficient detail.** 14×9 lat-long spheres and 16-segment cylinders show visible facets and polygonal silhouettes; every
facet was stroked with a dark line, which made curved solids read as wire meshes.

**D4 — low visual fidelity.** Faces were filled with one flat palette colour per object (no lighting), so shape was conveyed only by
facet outlines; there were no silhouettes and no distinction between the true edges of polyhedra and the facets of curved surfaces.

**D5 — missing interaction features.** No wheel zoom, no pinch zoom, no inertia, no auto-rotate, no display modes, no quality control.

**D6 — 21B surfaces share D2.** `Surface3DView` clamps azimuth to [−π, π] and resets on spec identity.

## 4. Baseline measurements (Chromium 141.0.7390.37 headless, this container)

Measured on an untouched `294500e` worktree with the **final** 21D script (`scripts/check-interactive-3d-browser-21d.mjs`,
`MEASURE_ONLY=1`, the harness page copied in for the run and removed afterwards), so the before / after comparison in
`docs/phase21d-3d-performance.md` uses one method. A 2 s continuous back-and-forth mouse drag at 125 events/s through the DevTools input
pipeline; frames from `requestAnimationFrame`; main-thread time from the DevTools Performance domain.

| Profile | Model | Polygons | Median FPS | p95 frame | Max frame | Frames > 33 ms | Long tasks | Main-thread busy | Script |
|---|---|---|---|---|---|---|---|---|---|
| desktop 1280 px | cube | 6 | 59.9 | 16.7 ms | 16.8 ms | 0 | 0 | 337 ms | 108 ms |
| desktop | sphere | 126 | 59.9 | 16.7 ms | 16.8 ms | 0 | 0 | 710 ms | 275 ms |
| desktop | heart | 600 | 59.9 | 16.7 ms | 16.8 ms | 0 | 0 | 1924 ms | 966 ms |
| mobile 390 px, 4× CPU throttle | cube | 6 | 59.9 | 16.7 ms | 33.3 ms | 0 | 0 | 1454 ms | 505 ms |
| mobile, 4× CPU | sphere | 126 | 59.9 | 16.7 ms | 16.8 ms | 0 | 0 | 2646 ms | 1068 ms |
| mobile, 4× CPU | heart | 600 | 59.9 | 33.3 ms | 83.4 ms | 7 | 1 | 4863 ms | 2451 ms |

Behavioural probes (baseline, signature-based): heart mouse drag rotates ✓; keeps rotating after sweeps ✗ (a fifth full-width sweep
leaves the drawing unchanged); sphere drawn-width ratio over a turn 1.027 (height 1.002); Ctrl+wheel zoom ✗ (ratio 1.000); exam drag
survives the timer ✗; one-finger touch drag ✓; pinch zoom ✗ (ratio 1.024, a rotation side-effect only); canonical views: the cube draws
all 6 faces in every view (no culling), the sphere outline aspect ratio ranges 0.96–1.01 across views. The checks of the final script
that read the 21D camera attributes (`data-yaw`, …) or 21D controls cannot apply to the baseline and are not reported as baseline
evidence. Headless Chromium paces `requestAnimationFrame` at 60 Hz, so frame numbers bound the renderer's own cost; they are not a
real-device measurement.

## 5. Prioritised plan

1. **P0 (D1, D2):** rotation-invariant framing around the scene's bounding sphere; unbounded yaw; reset keyed on scene content.
2. **P0 (D3, D4):** quality-based tessellation, true cone apex and polygon caps, outward normals, back-face culling, lighting with a
   key + fill light and a soft highlight, silhouettes for curved surfaces and true edges for polyhedra.
3. **P1 (D5):** wheel (deliberate: viewer focused or Ctrl/⌘), pinch, frame-rate-independent inertia, auto-rotate that yields to the
   student and respects reduced motion, display modes, quality levels with an interaction level of detail.
4. **P1 (D6):** the same camera controller for the 21B surface viewer.
5. Keep the renderer: an owned SVG renderer is retained (no WebGL dependency, crisp print, DOM hit targets that the exam's semantic
   selection and tests rely on). Measurements decide whether that stays viable at the higher detail (see `docs/phase21d-3d-performance.md`: it does, with a
   level of detail while the model moves).

Out of scope by the brief's own rules: new solid kinds (triangular prism, tetrahedron, hemisphere are **not** in the contract and are
not added); third-party anatomy assets (none is licensed in the repository; the heart stays a clearly labelled simplified model).
