# Phase 21D-A.4 — Advanced 3D Mathematical Plotting (`functionSurface3D`, `surface.version: 2`)

Design record for multi-surface 3D plots of explicit functions z = f(x, y), with higher-fidelity rendering and smooth rotate / zoom /
reset inside the exam platform. It builds on:

* Phase 21B (3D surfaces, `SurfaceSpecV1`);
* Phase 21D (the 3D engine: orbit camera, framing, lighting, level of detail);
* the rich-content / finalization / sanitizer authorities.

Out of scope: anatomical or imported meshes, CAD, a new grading engine, and unrelated SmartSim work.

## 1. Decisions

| Decision | Reason |
|---|---|
| **New versioned contract `SurfacePlotSpecV2`** in the existing `functionSurface3D` rich-content block (`surface.version: 2`); no new block type or question type. | No unsupported exam field is introduced. The block keeps its place in `RICH_BLOCK_TYPES`, which is pinned by earlier phases, and the document limits (at most 3 surface blocks, unique ids) apply unchanged. A plot is a rich **stimulus** of existing certified question types (multipleChoice, trueFalse, …), so grading never reads it. |
| **`SurfaceSpecV1` is frozen.** Its validator, mesh, viewer, templates, tests and Phase 21B mutation anchors are unchanged (23/23 anchors verified), and V1 blocks still render with `Surface3DView`. | Published exams keep their exact behaviour, and the 21B certification workflows (browser and mutation) stay valid. Stored V1 surfaces are **never converted silently**. The editor offers a one-click upgrade to a single-surface V2 plot that keeps the same id, texts, formula and window; the teacher decides. |
| New blocks are V2 plots. | Teachers get multi-surface support and the new renderer by default. |
| **Reuse the Phase 21D runtime; no parallel 3D engine.** | The camera is the shared `useOrbitCamera` controller. Shading is the shared `shadeScene3DFace` lighting model. The framing rule is the same (bounding sphere, so rotation never changes the size), and so is the level-of-detail rule (a light mesh while moving). The renderer stays owned SVG: no WebGL, no Three.js, no new dependency. |
| The V2 module never imports the V1 module. The surface prose guards (bidi and invisible characters) moved verbatim to `proseGuard.ts`. | Measured: an import edge `surfacePlotSpec → surfaceSpec` made the bundler split `surfaceSpec` out of the `richContentModel` chunk, which listed a new file in the initial graph. |
| Not offered by the AI Composer. | AI-authored 3D remains deferred (Phase 21B decision); its allowlist is unchanged. |

## 2. Architecture

```
src/functionSurfaces/surfacePlotSpec.ts     SurfacePlotSpecV2 contract + strict validator (pure; shared server build)
src/functionSurfaces/surfacePlotMesh.ts     adaptive mesh, discontinuity tests, clipping, normals, projection, axes (pure, deterministic)
src/functionSurfaces/surfacePlotPresets.ts  classroom presets, explicit V1 → V2 upgrade (UI)
src/functionSurfaces/SurfacePlot3DView.tsx  viewer (lazy): 21D orbit camera + 21D lighting, legend, toggles, styles, axes, value table
src/functionSurfaces/SurfacePlot3DEditor.tsx teacher editor (lazy) with live preview
src/functionSurfaces/surface-plot.css       styles (lazy)
src/richContent/richContentModel.ts         functionSurface3D: version 2 → V2 authority, otherwise the frozen V1 authority
src/richContent/RichContentRenderer.tsx / RichContentEditor.tsx   lazy routing by version; upgrade button for V1 blocks
```

## 3. Contract (`SurfacePlotSpecV2`)

```json
{
  "version": 2, "id": "plot-paraboloids", "title": "قطعان مكافئان متقابلان", "description": "…",
  "surfaces": [
    { "id": "upward", "label": "القطع المكافئ z = x² + y²", "expression": "x^2+y^2", "color": "blue" },
    { "id": "downward", "label": "القطع المكافئ المقلوب z = 4 − x² − y²", "expression": "4-x^2-y^2", "color": "amber" }
  ],
  "viewport": { "xMin": -2, "xMax": 2, "yMin": -2, "yMax": 2, "zMin": -1, "zMax": 5 },
  "axes": { "x": { "label": "x", "unit": "m" }, "y": { "label": "y" }, "z": { "label": "z" } },
  "quality": "standard",
  "display": { "style": "mesh", "grid": true },
  "controls": { "rotate": true, "zoom": true, "toggleSurfaces": true },
  "camera": { "azimuth": -0.6, "elevation": 0.45, "zoom": 1 }
}
```

| Field | Rule |
|---|---|
| `surfaces` | 1–5 surfaces in one coordinate system. Ids are ASCII and unique, colours unique, from blue / amber / green / rose / lavender (the hue families of the 21D palette). Labels have at most 60 characters. |
| `viewport` | The x and y domain and the displayed z window, shared by all surfaces. Finite, \|v\| ≤ 1000, each minimum strictly below its maximum. |
| `axes` | A label (≤ 24 characters) per axis, with an optional unit (≤ 16). |
| `quality` | `standard` or `high`. |
| `display.style` | `solid`, `mesh` (surface with mesh lines) or `transparent`. `display.grid` is a boolean. |
| `controls` | The student-facing permissions. |
| `camera` | Optional starting view: azimuth within ±π, elevation within ±1.45 rad, zoom 0.6–2.5. |

Validation is strict; a problem is refused with a reason, never clamped or repaired:

* exact keys at every level, so smuggled renderer data is refused;
* text with no raw HTML, control, bidi-override or invisible characters;
* formulas parsed by the safe expression engine (language 3, variables x and y only, `log` refused as ambiguous), never evaluated as code;
* a surface that would draw nothing — undefined everywhere, or never inside the z window on a 25 × 25 probe — is refused
  (`SURFACE_PLOT_SURFACE_NOT_VISIBLE`).

Validation never throws, including for hostile proxies. Codes: `SURFACE_PLOT_*` (object, unknown key, missing key, version, id,
text, number, view, surfaces count, id and colour duplicates, colour, expression, variable, quality, style, flag, not visible).

**Supported function forms:** explicit z = f(x, y) using + − × ÷ ^, abs, round, floor, ceil, min, max, sqrt, pow, exp, ln, log10, sin,
cos, tan, asin, acos, atan, pi and e. Not supported: implicit or parametric surfaces, piecewise syntax other than these functions,
user-defined functions.

## 4. Mesh strategy (`surfacePlotMesh.ts`)

* **Budgets per plot**, shared by its surfaces. Each surface gets 1/S of the budget; its base grid is about √(polygons / 2.2), between 8
  and 40 cells per axis.

  | Level | Polygons | Evaluations | Max depth | Tolerance |
  |---|---|---|---|---|
  | standard | 4,000 | 40,000 | 2 | 0.006 |
  | high | 6,500 | 64,000 | 2 | 0.003 |
  | motion | 900 | 12,000 | 0 | — |

* **Balanced quadtree, best-first.** A single priority queue across levels always refines the most important leaf first. Neighbouring
  leaves differ by at most one level (a coarser neighbour is refined first). Ties are broken by level and position, so the mesh is
  deterministic. A cell is refined when its 3 × 3 lattice shows:

  | Condition | Priority |
  |---|---|
  | Domain edge: defined and undefined points mixed | 100 |
  | Suspected jump | +50 |
  | **Another surface of the same plot crossing this one inside the window** | +20 |
  | Curvature: centre or edge midpoints deviate from linear interpolation by more than the tolerance | the deviation |
  | Crossing of the z window | + tolerance |

  Refinement may use 80 % of the evaluation budget; the rest is kept for the discontinuity tests.
* **Crack-free.** A coarse leaf next to a finer neighbour includes the neighbour's edge midpoint in its polygon.
* **Discontinuities.** A polygon edge whose normalised change exceeds 0.12 of the window height is bisected 8 times. A continuous
  function's change shrinks with the interval; a jump or a pole does not, and the polygon is dropped. Results are cached per edge. If the
  budget is exhausted, only a change above 0.5 of the window breaks the edge. Undefined and non-finite points are holes, never zeros.
* **Clipping.** Polygons are clipped exactly against zMin ≤ z ≤ zMax (Sutherland–Hodgman). Asymptotic blow-ups end at the window with a
  clean rim. A boundary cell whose undefined vertices form one contiguous run keeps its defined part.
* **Normals.** Each polygon has a geometric Newell normal (always "up": a graph z = f(x, y)). Shading uses area-weighted vertex normals,
  except across creases above 35°, so the cone apex and ridges stay sharp.

**Measured accuracy against the V1 mesh at its finest 40 × 40 grid.** Deviation is the worst normalised gap between the true surface and
the polygon mean at polygon centroids.

| Surface | V1 | V2 |
|---|---|---|
| Gaussian bump `exp(−4(x²+y²))` | 0.0247 | 0.0024 (high) |
| Steep `atan(20x)` | 0.1095 | 0.0095 |
| Pole `1/(x²+y²)`, window [0, 10] | 0.054 | 0.005, covered area exact (16 − π/10) |
| Dome `√(4 − x² − y²)`, covered area | −9 % | −1.5 % |
| Paraboloid clipped at z = 4, covered area | −7 % | exact |
| `floor(x)` | bridges the steps with fake ramps | never draws across a step |

## 5. Rendering

* **Projection.** Orthographic, framed by the box's bounding sphere, so the size never depends on the orientation. Painter's order
  runs back to front across all surfaces, so intersecting surfaces interleave at facet resolution.
* **Lighting.** The shared 21D model: linear-light key and fill lights, a sky term, ambient light and a soft highlight.
  * Two-sided: the underside of a surface is lit with its flipped normal and dimmed, so students see which side they look at.
  * Next to the silhouette, a smoothed normal that has turned away falls back to the facet normal.
* **Styles.**
  * mesh: surface plus iso-lines (x and y constant on the base grid), broken at jumps and clipped to the window;
  * solid;
  * transparent: 60 % opacity, so overlapping surfaces show through.

  Fill and stroke share the same colour, so facets meet without seams.
* **Coordinate frame.**
  * The three back panes of the viewport box carry the grid at nice ticks (1, 2 or 5 × 10ⁿ) and never hide a surface.
  * Box edges are drawn.
  * Tick labels and axis titles with units sit outside the box on the nearest edges. A tick that would collide with another at a
    corner is dropped.
* **Crispness and responsiveness.** The drawing follows the rendered width (a ResizeObserver sets the viewBox in CSS pixels), so text
  and lines stay crisp. Phones get a taller aspect ratio.
* **Accessibility and print.**
  * Arabic RTL page; the drawing and the formulas are LTR.
  * An `aria-label` lists every surface; a 3 × 3 value table per surface is available for screen readers.
  * Print hides the controls.

## 6. Interaction

All interaction comes from the shared 21D orbit controller:

* drag and one-finger touch rotation with inertia;
* pinch, deliberate wheel zoom (viewer focused, or Ctrl / ⌘), and ± buttons;
* arrow keys, +/−, Home; reset to the authored view;
* reduced motion is honoured;
* the camera resets only when the plot **content** changes, not on a re-derived equal object;
* every listener and animation frame is released on unmount.

Level of detail:

* A light "motion" mesh is drawn on the first paint and while the camera moves (≤ 900 polygons for the whole plot).
* The authored-quality mesh is built after the first paint (setTimeout 0), so it never blocks the page, and is drawn at rest.
* Meshes are cached in a bounded map keyed by content.

The authored `controls` decide what the student may do. Without rotate, rotation buttons and keys are off; without zoom, the zoom
buttons, wheel and keys are off; without toggleSurfaces, the legend has no checkboxes. Camera, style, grid and surface visibility are
presentation state: never stored and never part of an answer.

## 7. Authoring and exam integration

* **Editor (lazy).**
  * Presets: paraboloid + inverted paraboloid, saddle + plane, cone + slanted plane, single paraboloid.
  * Title and description; 1–5 surfaces, each with a label, formula and colour (add / remove; added surfaces take a free colour).
  * Domain and window; axis labels and units; quality; default style and grid.
  * The allowed student controls; the starting view (degrees and zoom).
  * The canonical validator's issues are listed, and a live preview of the real viewer is shown only when the plot is valid.
* **Exam lifecycle.** Covered by `api/tests/certification-21da4`:
  * JSON import and export, save and reopen;
  * finalization through the shared server build;
  * student delivery: the sanitizer keeps the canonical public plot; answer keys and teacher-private data never reach the student;
  * autosave and restore; official grading by the existing question types;
  * tampered plots refused by the compiled server authority and blocked at finalization.
* **Acceptance exam.** `docs/fixtures/function-surfaces-21da4/ExamBank_21DA4_Advanced_3D_Plots_Acceptance.json` (generated from
  `api/tests/certification-21da4/surfacePlotsExam.js`, drift-tested, 20 marks) contains:
  * paraboloid + inverted paraboloid;
  * saddle + plane;
  * cone + slanted plane (an ellipse of intersection);
  * a three-surface plot, rotate-only, high quality, transparent, with an authored camera;
  * an unchanged V1 dome.

## 8. Backward compatibility

* V1 surfaces are unchanged in data, validation, rendering and interaction.
* The 21B suites and the 21B lifecycle pass unchanged, and all 23 mutation anchors are present.
* The 21A.1 / 21A.2 frozen corpora exclude the new fixture directory, as they do for every later phase.
* No database, API route or question-type change; the AI Composer is unchanged.

## 9. Test evidence (local)

| Suite | Result |
|---|---|
| `src/functionSurfaces/surfacePlot.21da4.test.ts`: contract, rich content, accuracy against V1, clipping, boundary cells, intersections, discontinuities, poles and sub-lattice holes, budgets, framing, two-sided shading, axes, creases | 21 / 21 |
| `src/functionSurfaces/surfacePlotUi.21da4.test.tsx`: legend, toggles, buttons, keys, drag, authored controls, styles, grid, content-keyed reset, invalid plot, editor, renderer V1/V2 routing, explicit upgrade | 11 / 11 |
| `api/tests/certification-21da4/*`: acceptance exam lifecycle on the real platform, plus fixture drift | 5 / 5 |
| functionSurfaces + richContent + interactive3d + certification 21B + 21D-A.4 | 382 / 382 |
| Certification 20G / 21A.1 / 21A.2 / 21B / 21D-A.4 | 424 / 424 |
| Real Chromium (`scripts/check-surface-plots-browser-21da4.mjs`) | 28 / 28 checks (listed below) |

The real-Chromium checks are:

* all plots render through the real renderer, and V1 still uses the 21B viewer;
* the 2-surface plot (about 1,885 polygons per surface at rest) rotates by mouse drag, using the motion level while moving and the
  rest level afterwards;
* median frame 16.7 ms while dragging;
* Ctrl+wheel and button zoom; reset to the authored view;
* a surface toggled off and on; a rotate-only plot that refuses zoom;
* ticks and titles inside the drawing at 1280 and 390 px; RTL figure with an LTR drawing;
* one-finger touch rotation on a phone; no overflow at 390 px;
* the editor's preview; no page errors and no external hosts.

**Targeted mutation proof.** The phase asked for no large campaign, so 21 mutants were planted, one at a time, in the validator, the
rich-content dispatch, the mesh and the viewer's student permissions. The two 21D-A.4 suites were run against each mutant, and every file
was restored byte for byte (SHA-256 verified; `git status` clean afterwards).

The first run killed 17 and four survived: V07, V09, G02 and G04. Each survivor was a missing assertion, not a code defect. The tests
were strengthened:

* empty x, y and z windows;
* the reserved ids `constructor` and `prototype` (`__proto__` already fails the id pattern);
* a hole narrower than the sampling lattice;
* a two-plane ridge whose shading normals must equal its facet normals.

The four survivors were then re-run and killed: **21 / 21 KILLED**, no timeouts.

| Id | Planted defect | Result |
|---|---|---|
| V01 | unknown-key guard removed (smuggled renderer data) | KILLED |
| V02 / V03 | raw-HTML / bidi-override text guard removed | KILLED |
| V04 | duplicate-colour check removed | KILLED |
| V05 | free variable `t` accepted | KILLED |
| V06 | six surfaces accepted | KILLED |
| V07 | empty z window (zMin = zMax) accepted | KILLED after strengthening |
| V08 | invisible-surface refusal removed | KILLED |
| V09 | reserved ids accepted | KILLED after strengthening |
| R01 | rich content routes V2 plots to the V1 authority | KILLED |
| G01 | bisection never reports a jump | KILLED |
| G02 | a hole found inside an edge is bridged | KILLED after strengthening |
| G03 | upper clip plane loosened | KILLED |
| G04 | crease rule removed | KILLED after strengthening |
| G05 | intersection-aware refinement priority removed | KILLED |
| G07 | polygon budget guard doubled | KILLED |
| G08 | painter order reversed | KILLED |
| G09 | silhouette fallback to the facet normal removed | KILLED |
| U01 / U02 / U03 | authored zoom / rotate / toggle permission ignored | KILLED |

## 10. Bundle and performance

The bundle guard budget is unchanged: 125 KB = 128,000 bytes gzip.

| Measurement | Bytes gzip |
|---|---|
| Initial JS graph, `main` `a8ed687` | 127,791 |
| Initial JS graph, this branch | **127,805 (+14)**, headroom 195 |
| `SurfacePlot3DView` lazy chunk | 8,204 + 1,534 CSS |
| `SurfacePlot3DEditor` lazy chunk | 2,306 |

* The +14 bytes are one new file name: the 21D runtime (orbit camera and lighting, 5,986 bytes) is now a chunk shared by the
  3D-objects viewer and the plot viewer, and its name appears in one initial preload table. No plot code is in the initial graph.
* Phase 21D had kept the surface viewer's camera separate for budget reasons; with today's headroom, the shared controller costs
  14 bytes.
* The bundle guard now also requires the plot viewer and editor (`sp3d-scene`, `sp3d-editor`) to stay lazy and out of the Student
  Portal static closure, and requires a lazy `SurfacePlot3DView` root.
* Mesh build in Vitest: about 20–60 ms per surface at rest quality, and 2–9 ms at motion quality.
* In Chromium, the first paint uses the motion mesh, and both plots on the harness page reached rest quality within 1.3 s of page load.

## 11. Known limitations

* **Painter's algorithm.** Intersecting surfaces are resolved at facet resolution. Intersection-aware refinement makes the saw-tooth
  along the curve four times finer, but the polygons are not split along the exact curve; a per-pixel depth buffer would need WebGL.
* **Discontinuity detection** is numerical (8 bisections). A continuous transition narrower than 1/256 of an edge looks like a jump, and
  that polygon is dropped.
* **Boundary cells** keep their defined part only when the undefined vertices are contiguous; other mixed cells are left out at the
  finest level.
* **Shading** is flat per facet (SVG has no per-pixel lighting); smoothed facet normals soften it.
* **Scope.**
  * Explicit z = f(x, y) only.
  * Box aspect is 1 : 1 : 1.
  * Orthographic projection only.
  * Pan is not offered (consistent with the 21D decision).
  * Not in the AI Composer.
* **Evidence.**
  * Chromium only.
  * No real-device measurement: the phone is an emulated 390 px viewport.
  * The frame timing is from headless Chromium paced at 60 Hz.

## 12. Future opportunities

* Split polygons along the intersection curve (exact seams), or a WebGL path behind the same contract for depth-buffered rendering.
* Contour lines (level sets) and a colour-by-height option.
* Implicit and parametric surfaces as V3.
* A "use this view" button that takes the editor preview's camera as the starting view.
* AI Composer support once the owner approves it.
