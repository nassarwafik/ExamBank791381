# Phase 21D — 3D rendering quality record

What the 3D-objects renderer (`src/interactive3d/sceneMesh.ts` + `Interactive3DView.tsx`) draws after 21D, why, and how it is verified.
The renderer stays an owned SVG renderer: no WebGL, no Three.js, no external model file or texture. Root causes D1–D6 are in
`docs/phase21d-3d-audit.md`.

## 1. Contract and scope

- **No schema change.** `Interactive3DSceneSpecV1` (and its API mirror under `api/src/lib/shared-finalization/`) is untouched: the same six
  solid kinds (`box`, `sphere`, `ellipsoid`, `cylinder`, `cone`, `pyramid`), the same targets, the same answer keys. Display mode, quality
  and camera are presentation state of the viewer and never reach an answer.
- **No new kinds.** A triangular prism, tetrahedron or hemisphere is not in the contract; none was added to make the gallery larger.
- **Polyhedra are unchanged.** Box (8 vertices, 6 faces, 12 edges) and pyramid (5, 5, 8) keep their 21C element names, so every
  authored face / edge / vertex target and every 21C fixture still resolves (pinned in `engine.21d.test.tsx`).

## 2. Geometry

| Kind | Construction (21D) | Baseline |
|---|---|---|
| sphere / ellipsoid | latitude–longitude grid with a single vertex at each pole and triangle fans there | 14 × 9 grid, quads at the poles |
| cylinder | `seg` side quads + two n-gon caps (one polygon each) | 16 segments, caps as fans |
| cone | `seg` side triangles meeting at **one apex vertex** + an n-gon base | a cylinder whose top ring was scaled by 0.001 (17 near-coincident apex vertices, degenerate quads) |
| box, pyramid | as 21C | — |

Quality levels (`SCENE3D_TESSELLATION`):

| Level | sphere / ellipsoid (lon × lat) | cylinder / cone segments |
|---|---|---|
| draft | 16 × 8 | 16 |
| low | 24 × 12 | 24 |
| medium | 40 × 20 | 40 |
| high | 64 × 32 | 64 |

A scene whose mesh would exceed the contract's mesh limits at the requested level steps down a level (down to draft) instead of
rendering nothing. Every mesh is **closed** (each edge shared by exactly two faces), and every face carries an **outward unit normal**
(Newell normal, oriented away from its object's centre: all supported solids are convex).

### Mathematical precision (unit-tested, `21D-GEO`)

- Every solid at every level spans exactly its authored `size` about its `center` (to 1e-9).
- Volume by the divergence theorem converges to the analytic formula — sphere / ellipsoid `4/3·π·abc`, cylinder `π·r²·h`, cone
  `π·r²·h/3`, box `l·w·h`, pyramid `l·w·h/3` — within draft 7 %, low 3 %, medium 1.2 %, high 0.5 % (an inscribed tessellation always
  under-estimates a curved solid; polyhedra are exact at every level).
- The sphere's surface area converges to `4πr²` (high within 0.5 %).
- Invalid scenes are rejected by the 21C validator before any mesh is built; the viewer shows its "needs teacher review" notice.

## 3. Projection and framing

- **Orthographic**, framed by the scene's **bounding sphere** about the scene centre: the scale no longer depends on orientation (D1).
  At zoom 1 the sphere's diameter fills `SCENE3D_FRAME = 0.9` of the viewer's shorter side, so no orientation can clip the model.
  Zoom is bounded by the contract's `zoomMin` / `zoomMax` (0.55 – 2.2).
- **Back-face culling** for opaque objects (a cube seen obliquely draws exactly three faces), painter's order back-to-front with depth
  ties broken by mesh index (deterministic).
- **Rim facets:** curved facets turned only slightly away (−0.25 < n·view ≤ 0) are drawn behind the front facets with their real
  lighting, so the outline reaches the true limb (the sphere's outline is round within 1 %: `21D-FF5`, and in Chromium the drawn
  aspect ratio is 1.000 in all four canonical views).
- An optional **draw filter** lets the viewer project only what its display mode draws; without it the full projection is returned
  (the 21C contract), and a test pins that a filter only removes items.

## 4. Lighting and materials

- Palette colours are converted from sRGB to linear light, lit, and converted back (no muddy mid-tones).
- **Key light** upper-left-front (weight 0.62), **fill light** from the right (0.20), a small sky term (0.06) and ambient 0.30.
- **Specular highlight** (Blinn): soft and broad on curved surfaces (0.22, exponent 36), faint on flat faces (0.05, exponent 12).
- Back faces seen through a transparent object are dimmed (× 0.55).
- The eight palette entries keep the 21C hue families (slate, blues, green, rose, amber, lavender) with enough depth to carry shading.
- Selection and review tints are mixed into the lit colour (selected amber, correct green, incorrect red, missed amber-brown), so a
  selected part keeps its shading.

## 5. Edges and outlines

Every mesh edge is classified once per mesh: a **crease** when the two faces' normals differ by more than 30° (the true edges of a
box / pyramid, the rims of a cylinder, the base rim of a cone), otherwise a **facet** edge of a curved surface. Per camera, a line
between a front and a back face is a **silhouette**. Counts are pinned: cube 12 creases, pyramid 8, cylinder 2 × segments, cone one
rim, sphere none.

| Display mode | Faces | Lines |
|---|---|---|
| solid + edges (default) | front + rim faces | front creases + silhouettes |
| solid | front + rim faces | silhouettes |
| wireframe | none | every edge (creases, silhouettes, facets) |
| transparent | every face at ≤ 38 % opacity | creases and silhouettes, hidden ones dashed |

Faces are filled and stroked with the same lit colour (0.7 px) so adjacent facets meet without hairline seams.

## 6. Quality levels and level of detail

`جودة العرض` offers **Auto** (default), Low, Medium and High; no user-agent sniffing anywhere. Auto picks the highest level whose face
count fits a budget: **4500 faces at rest** and **700 while the model moves** (drag, inertia, pinch, auto-rotation). While moving in the
solid modes only true edges are drawn; silhouettes return when the motion settles. Budgets were calibrated in real Chromium with a 4×
CPU slowdown (`docs/phase21d-3d-performance.md`).

| Model | Faces at rest (level) | Faces while moving (level) |
|---|---|---|
| sphere | 2048 (high) | 288 (low) |
| heart (6 primitives) | 3284 (medium) | 548 (draft) |
| torso | 4000 (medium) | 640 (draft) |
| water molecule | 2484 (medium) | 420 (draft) |
| cube / pyramid | 6 / 5 | 6 / 5 |

A manual choice (Low / Medium / High) is honoured at rest and while moving.

## 7. The heart model

- It remains the 21C preset: **six procedural primitives** (four chambers as ellipsoids, aorta and pulmonary artery as cylinders), with
  the same object ids (`leftVentricle`, …), so every existing question and answer key resolves unchanged.
- It is presented as what it is: the title reads **«القلب — نموذج تعليمي مبسّط»** (simplified educational model) and the description
  says it is a simplified composite. No anatomical mesh was imported: none is licensed in the repository, and the brief forbids
  unverified or unlicensed assets.
- 21D improves it through rendering only: lighting and highlights give the chambers volume, smoother tessellation and silhouettes
  give clean outlines, and the rotation / framing fixes make it turn freely without pulsing.
- **Limitation:** where two primitives interpenetrate (chambers, vessel roots), the painter's algorithm resolves the intersection at
  facet resolution, which shows as a small saw-tooth along the seam (visible in `exam-fixture.png` of the certification run). A
  per-pixel depth buffer would need WebGL, which is out of scope.

## 8. Visual verification

`scripts/check-interactive-3d-browser-21d.mjs` renders every model of the demonstration page in four canonical views (front, side,
top, the authored perspective) with the production component and checks, in real Chromium:

- every model of the 7 geometry and 3 preset scenes is drawn inside its viewer in all four views (40 views);
- the cube draws 1 face from the front and the side, 2 from above, 3 in perspective (culling);
- the sphere's outline aspect ratio is 1.000 in every view;
- full-page screenshots (`views-geometry.png`, `views-presets.png`, `demo-desktop.png`, `demo-mobile.png`, `exam-fixture.png`) are kept
  in the run's output directory (CI uploads them as the `interactive-3d-21d-browser` artifact).
