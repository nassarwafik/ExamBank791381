# Phase 21B — Enterprise 3D Mathematical Surface Visualizations

**Current state: implementation complete on `feature/21b-3d-mathematical-surfaces`; PR #279 is in closure certification. Production merge remains owner-only.**

## 1. Baseline, boundary and release decision

- Baseline: owner-merged Phase 21A.2 on `main` at `e099cb544f45c6ea5d62c5fb2494044a78a4aae6` (PR #278).
- Phase 21B owns the shared safe 3D mathematical-surface runtime for bounded surfaces `z = f(x,y)`, persisted structured JSON, teacher authoring, student rendering, accessibility, print and lifecycle integration.
- Phase 21B does **not** introduce arbitrary renderer options, raw SVG, WebGL/Three.js configuration, executable callbacks or dynamic code.
- Dedicated semantic 3D point/region selection and a new 3D grading type are intentionally deferred to **Phase 21C — Interactive 3D Geometry**. In 21B, surfaces are rich stimuli used with the platform's already-certified question types.
- AI generation of 3D surfaces is also deferred until the structured JSON/runtime contract is accepted.
- Only the repository owner merges; auto-merge remains off.

## 2. Owned surface contract and mathematical runtime

`src/functionSurfaces/surfaceSpec.ts` defines the closed, versioned `SurfaceSpecV1` authority:

```json
{
  "version": 1,
  "id": "paraboloid",
  "title": "سطح القطع المكافئ",
  "description": "سطح z = x²+y²",
  "expression": "x^2+y^2",
  "viewport": { "xMin": -2, "xMax": 2, "yMin": -2, "yMax": 2, "zMin": -1, "zMax": 9 },
  "grid": { "xSteps": 24, "ySteps": 24 },
  "camera": { "azimuth": -0.75, "elevation": 0.6 }
}
```

The expression is parsed by the existing safe bounded expression engine with language 3 and exactly the variables `x` and `y`. There is no `eval`, `Function`, script URL, HTML renderer or third-party renderer configuration.

Current hard bounds:
- expression: 500 characters;
- axes: absolute value ≤ 1000;
- grid: 4..40 steps per axis;
- vertices: ≤ 1,681;
- faces: ≤ 3,200;
- expression evaluations: ≤ 9,800.

`src/functionSurfaces/surfaceMesh.ts` creates a deterministic sampled mesh. Undefined, non-finite and off-window values become holes. Each cell is additionally probed at its centre and four edge midpoints; sharp jump/curvature cases are omitted rather than bridged with invented geometry.

This is deliberately conservative visualization, not a proof of global mathematical continuity. No area, volume, extrema or topology facts are inferred from the mesh.

## 3. SVG 3D renderer and interaction

`Surface3DView.tsx` renders the validated mesh through an owned SVG orthographic projection. No WebGL or new package dependency is required.

Student/teacher interaction now includes:
- explicit rotate-left/right and elevation buttons;
- reset-to-authored/default camera;
- pointer/touch drag rotation;
- keyboard rotation with the arrow keys;
- `Home` to reset the camera;
- focus-visible treatment and an on-screen interaction hint.

Camera state is presentation-only and never participates in grading or persisted answers.

Accessibility:
- titled `figure` and expression text;
- SVG image label and keyboard instructions;
- a 3 × 3 sampled value table as a non-visual alternative;
- RTL surrounding UI with mathematical expression isolated LTR.

Print hides interaction controls and exposes the static SVG plus the value-table content.

## 4. Teacher authoring

Two teacher surfaces exist:

1. `Surface3DLab` — an isolated exploratory laboratory opened lazily from the builder. It has four presets (paraboloid, saddle, sinusoidal wave and spherical dome) and does not itself mutate an exam.
2. `Surface3DEditor` — the persisted rich-content editor. It edits title, description, safe expression, x/y/z viewport and bounded grid and previews only when the canonical validator accepts the spec.

`surfaceEditing.ts` owns the four reusable templates and fresh surface IDs.

Invalid specs remain visibly invalid and cannot pass final RichContent validation.

## 5. Persisted rich content and JSON-first lifecycle

`functionSurface3D` is an additive `RichContentV1` block:

```json
{
  "type": "functionSurface3D",
  "surface": { "...": "SurfaceSpecV1" }
}
```

The rich-content authority:
- validates the surface through the one `SurfaceSpecV1` authority;
- allows at most three 3D surfaces in one rich document;
- rejects duplicate surface IDs;
- rejects unknown/smuggled renderer fields;
- counts only stored surface prose/expression toward document limits;
- rebuilds canonical data rather than spreading untrusted objects.

The builder can add, edit, duplicate and remove the block. Duplicate blocks receive a fresh surface ID.

The student renderer lazy-loads `Surface3DView`. The bundle guard requires the 3D viewer/editor/lab UI to remain outside both the initial graph and the no-3D Student Portal static closure.

The shared server finalization build contains the same surface/rich-content authority, and the generated mirror remains drift-guarded.

## 6. Acceptance fixture and lifecycle certification

The generated source `scripts/function-surfaces-21b-exam.mjs` produces:

`docs/fixtures/function-surfaces-21b/ExamBank_21B_3D_Surfaces_Mini_Acceptance.json`

It contains four persisted examples:
- paraboloid `x^2+y^2`;
- saddle `x^2-y^2`;
- sinusoidal wave `sin(x)*cos(y)`;
- spherical dome `sqrt(4-x^2-y^2)`.

The questions intentionally use existing `multipleChoice` grading. The 3D surface is the rich mathematical stimulus, not a new grading authority.

`cert-21b-surface-lifecycle.test.js` proves:
- teacher save/publish preserves the canonical surface specs;
- student delivery includes the safe public surface data and not teacher answer keys;
- autosave and restore continue to work with 3D stimuli present;
- official grading remains authoritative;
- a renderer payload smuggled into the 3D block is refused server-side.

`cert-21b-fixture-drift.test.js` regenerates the fixture byte-for-byte and checks forbidden renderer **keys structurally**, avoiding false positives from ordinary prose such as the word `description`.

## 7. Compatibility

Phase 21B is additive.

The older 21A.1 and 21A.2 compatibility freezes stay scoped to the exact fixture corpora on which their immutable pins were captured; the new 21B acceptance fixture is tested by 21B certification rather than being incorrectly compared with a pre-21B snapshot.

No existing question type, 2D function graph, chart contract or grading rule is redefined.

## 8. Security and invariants

- Closed plain-object contract with exact keys.
- Prototype-shaped/non-plain input fails closed.
- Surface IDs are bounded ASCII identifiers and refuse prototype names.
- Text refuses raw HTML, controls and unsafe bidi/invisible characters.
- Expressions use the safe parser and only `x`/`y`.
- Non-finite viewport values are rejected.
- Grid, geometry and evaluation work are bounded.
- Missing domain values are never coerced to zero.
- Renderer/camera state is never an answer or grading key.
- No new dependency, server route, production setting or external asset host.

## 9. Bundle and performance boundary

`scripts/check-bundle-budget.mjs` recognizes the 3D UI by stable signatures:
- `ex3d-scene`;
- `ex3d-editor`;
- `ex3d-lab`.

It requires:
- a lazy `Surface3DView-*.js` root;
- no 3D UI in the initial JavaScript graph;
- no 3D UI in the Student Portal no-3D static closure;
- the unchanged 125 KB initial gzip budget.

The mesh itself is deterministically bounded by the limits in §2.

## 10. Tests and evidence

Dedicated Phase 21B suites cover:
- hostile/invalid SurfaceSpec input;
- expression/variable refusal;
- grid and viewport bounds;
- deterministic mesh size and evaluation budget;
- discontinuities/holes;
- camera-only projection behavior;
- accessible SVG rendering;
- button, keyboard and pointer rotation;
- teacher-lab safety;
- persisted rich-content validation;
- generated fixture drift;
- real platform lifecycle and server-side rejection of smuggled renderer data.

Earlier candidate `e9754e6c` exposed two **test/corpus issues**, not production-surface failures:
1. immutable 21A.1/21A.2 freezes accidentally swept the newly-added 21B fixture;
2. a substring safety regex falsely matched `description` because it contains `script`.

Both tests were corrected to express their actual contracts: historical freezes exclude future fixture families, and the 21B safety check inspects exact forbidden object keys.

### Closure certification evidence

The final functional candidate before closure-only comments/documentation was `586d751df9a864d7c4b6d384ee75d5976e4c9306`.

On that exact code head:

- **Root Quality Gate:** SUCCESS — **853/853 test files, 11,271/11,271 tests**; TypeScript/build succeeded; lint completed with **0 errors** (108 existing warnings); bundle guard passed.
- **Bundle:** initial JavaScript graph **18 files / 124.9 KB gzip**, below the unchanged **125 KB** budget. The bundle guard reported exactly one lazy `Surface3DView` root and no 3D viewer/editor/lab UI in the Student Portal no-3D static closure.
- **Runner security & smoke:** SUCCESS, including Runner unit tests, Docker functional/security smoke, official hidden-test grading and container cleanup.
- **Phase 21B mutation certification:** SUCCESS — **23/23 killed, 0 survived, 0 invalid, 0 timeout**, with SHA-256 source restoration verified.
- **Real Chromium certification:** SUCCESS at widths **320, 360, 600, 800, 1024 and 1280 px** with no page horizontal overflow; keyboard rotation and Home reset passed; pointer drag and reset passed; A4 print PDF was non-empty (**231,350 bytes**); print kept the surface/value table and hid interaction chrome; no JavaScript runtime exception and no external asset/network host was observed.
- The inherited Phase 21A.2 mutation certification also remained green.

The browser and mutation workflows are committed Phase 21B gates, not one-off local claims.

A final closure-only commit can change the Git SHA without changing runtime behavior. Its **exact-head** CI status is therefore recorded in the PR body after CI completes; this file is not edited again merely to write the new SHA, because doing so would create another uncertified head.

## 11. Known limitations / deliberate deferrals

- V1 supports explicit surfaces `z=f(x,y)` only.
- No implicit surfaces, arbitrary parametric meshes, lighting engine or perspective camera.
- The nine-probe discontinuity guard is conservative, not a mathematical proof.
- No quantitative area/volume calculation.
- Dedicated 3D semantic selection/grading is Phase 21C.
- AI-authored 3D generation is deferred.
- Real Chromium/mobile/PDF certification is now a committed Phase 21B workflow and passed on the final functional candidate; future 3D capabilities in Phase 21C must extend, not silently replace, this evidence.

## 12. Closure checklist

- [x] Owned bounded `SurfaceSpecV1`.
- [x] Deterministic safe mesh/projection.
- [x] Accessible lazy SVG renderer.
- [x] Teacher preview lab.
- [x] Persisted rich-content editor.
- [x] Student delivery through strict shared projection.
- [x] Generated four-surface JSON acceptance fixture.
- [x] Platform save/publish/autosave/restore/grading lifecycle coverage.
- [x] Bundle lazy-loading guard.
- [x] Pointer/touch + keyboard camera interaction.
- [x] Root tests/build/lint/bundle guard green on the final functional candidate.
- [x] Runner security/smoke green on the final functional candidate.
- [x] Dedicated Phase 21B mutation campaign: 23/23 killed.
- [x] Dedicated real Chromium/mobile/keyboard/pointer/print certification.
- [x] Focused adversarial review resolved the discovered test-corpus, answer-revealing prose, interaction and React state-update issues.
- [x] Phase scope frozen: dedicated semantic 3D selection/grading moves to Phase 21C; AI-authored 3D remains deferred.
- [ ] Owner acceptance and manual merge of PR #279 (exact closure-head CI is recorded in the PR body).

**Implementation verdict:** `ENTERPRISE 3D MATHEMATICAL SURFACES 21B: PASS`

