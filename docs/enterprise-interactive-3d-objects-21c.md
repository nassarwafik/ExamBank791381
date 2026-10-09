# Phase 21C — Enterprise Interactive 3D Objects & Geometry Runtime

**Status:** implementation candidate on `feature/21c-interactive-3d-objects-geometry`; PR #280. Owner-only merge after exact-head certification.

## 1. Baseline and objective

- Baseline: `2ab2e1773b777cf4eb39c3bf966f0128c8b467cb` (merged Phase 21B).
- Phase 21C turns the safe 3D visualization foundation into an ExamBank-owned **interactive object/geometry assessment runtime**.
- The runtime is intentionally domain-neutral: geometry is the precision reference domain, while anatomy and chemistry prove that the same scene contract can represent labeled multi-part educational models.
- The phase does not persist renderer-library options, executable code, arbitrary HTML/SVG, remote model URLs, callbacks or raw WebGL state.

High-fidelity imported anatomy/CAD model libraries are a future content/asset layer. Phase 21C establishes the safe scene, interaction, semantic-target and grading contracts they must plug into; it does not claim that a small primitive-composite heart is a medical anatomical model.

## 2. Owned JSON contract

`src/interactive3d/sceneSpec.ts` defines `Interactive3DSceneSpecV1`.

A scene owns:

- stable scene id/title/description;
- bounded authored camera;
- explicit interaction policy: rotate / zoom / select;
- bounded objects;
- bounded semantic targets.

Supported V1 primitive object kinds:

- `box`
- `sphere`
- `ellipsoid`
- `cylinder`
- `cone`
- `pyramid`

Each object has a stable id, label, center, size, optional rotation, code-owned palette index and optional bounded opacity.

Semantic target kinds are:

- `object`
- `face`
- `edge`
- `vertex`

Targets are stable semantic identities. Student answers never store screen pixels.

Examples:

```text
object:leftVentricle
face:top
edge:eAB
vertex:vA
```

## 3. Safety and limits

The validator is fail-closed and accepts plain data objects with exact keys only.

Current principal bounds include:

- ≤ 64 objects;
- ≤ 128 targets;
- coordinate magnitude ≤ 100;
- bounded positive dimensions;
- bounded rotations;
- zoom 0.55..2.2;
- generated mesh ≤ 12,000 vertices / 20,000 faces.

Identifiers are bounded ASCII ids and reject prototype names. Prose rejects raw HTML, controls, unsafe bidi markers and invisible/default-ignorable characters.

Only box/pyramid expose named face/edge/vertex elements in V1. Rounded primitives expose object-level targets. This prevents invented geometric element identities.

## 4. Deterministic mesh and renderer

`sceneMesh.ts` expands validated objects into a deterministic bounded mesh and renderer-neutral projected scene.

The student/teacher renderer is `Interactive3DView.tsx`.

The renderer supports:

- authored camera;
- rotate left/right;
- raise/lower viewpoint;
- zoom in/out;
- reset;
- pointer/touch drag rotation;
- keyboard arrow rotation;
- keyboard zoom;
- Home reset;
- semantic target selection;
- review-state markings;
- RTL shell with mathematical/technical ids isolated appropriately;
- print-safe static representation.

Camera gestures are presentation state only. They never become student answers.

## 5. Cross-domain presets

`scenePresets.ts` proves the general scene contract with five bounded examples:

1. geometric cube;
2. geometric pyramid;
3. simplified multi-part heart teaching model;
4. simplified torso/organs teaching model;
5. water molecule teaching model.

The anatomy presets are deliberately described as **simplified educational models**, not medically accurate anatomy.

The purpose is architectural proof: geometry, anatomy-like object composition and chemistry all use the same contract, renderer and semantic selection system.

## 6. Teacher authoring

`Scene3DEditor.tsx` is the code-owned teacher editor.

The teacher can author/edit a structured scene rather than renderer JSON. Targets are validated against object kind and element vocabulary.

Changing geometry in a way that invalidates face/edge/vertex targets prunes or blocks stale targets rather than retaining a misleading answer key.

The question editor for `scene3DSelection@1` owns:

- scene;
- selectable target kind;
- selection mode;
- target count;
- private correct semantic target keys;
- marks through the normal ExamBank question lifecycle.

## 7. Student answer and grading

New answer kind:

```json
{
  "kind": "scene3DSelection",
  "sceneId": "cube-q",
  "targets": ["face:top"]
}
```

New production question type:

`scene3DSelection@1`

The client only records validated semantic keys. Official grading is server-authoritative.

The shared question authority checks:

- scene id matches;
- keys exist in the published scene;
- target kind is allowed;
- selection mode/count constraints;
- unknown/forged keys fail closed;
- private correctness metadata is not included in the student projection.

Teacher review uses the same scene and semantic keys to mark correct / incorrect / missed selections.

## 8. RichContent and exam lifecycle

Phase 21C adds the interactive 3D scene as an additive rich-content capability while preserving the Phase 21B `functionSurface3D` surface contract.

The generated acceptance exam is:

`docs/fixtures/interactive-3d-21c/ExamBank_21C_Interactive_3D_Acceptance.json`

Certification covers:

`JSON/import → Builder/save → finalization → publish → student projection → answer ingest → official server grading → review`.

The 21A.1 / 21A.2 historical compatibility freezes remain scoped to the fixture corpora on which their immutable pins were captured. New 21C fixtures are certified by 21C tests instead of being incorrectly compared to pre-21C snapshots.

## 9. Accessibility, mobile and print

The runtime provides:

- labeled `figure`/SVG scene;
- visible instructions;
- semantic target list as a non-spatial selection alternative;
- native buttons;
- keyboard interaction;
- persistent selected state;
- review text in addition to visual styling;
- responsive layout;
- print layout that keeps the model and removes interactive chrome.

The semantic list is essential: selecting a 3D target never requires drag precision or color perception.

## 10. Bundle architecture

Interactive 3D student and teacher UI stays code-split.

The bundle guard protects the existing startup budget and verifies that 3D runtime/editor code does not silently migrate into unrelated initial paths.

Phase 21C does not add Three.js merely for visual prestige. The owned SVG mesh renderer is sufficient for the certified primitive scene contract.

A future high-fidelity asset layer may adopt a dedicated 3D engine behind an adapter only after bundle, accessibility, print and security evidence justify it. Persisted ExamBank JSON must remain renderer-neutral.

## 11. Adversarial and mutation focus

Dedicated tests/mutations target:

- non-plain/prototype-shaped values;
- unknown keys;
- duplicate ids/targets;
- invalid object kinds;
- coordinate/size/camera bounds;
- unsafe text/bidi/invisible content;
- target-to-object references;
- invalid face/edge/vertex element names;
- forged answer keys;
- wrong scene ids;
- answer count/mode rules;
- student sanitizer privacy;
- server grading authority.

## 12. Real-browser certification

The committed Phase 21C Chromium workflow exercises:

- 320 / 360 / 600 / 800 / 1024 / 1280 px;
- RTL;
- geometry/anatomy/chemistry presets;
- keyboard rotation and zoom;
- Home reset;
- pointer drag;
- semantic list selection;
- direct SVG semantic selection;
- touch selection;
- A4 PDF/print state;
- page overflow;
- runtime exceptions;
- external network leakage.

Results are recorded only after the final exact-head run completes successfully.

## 13. Deliberate boundaries

Phase 21C V1 does **not** claim:

- arbitrary uploaded 3D model execution;
- raw glTF/OBJ/FBX persistence;
- medical-grade anatomy;
- CAD boolean operations;
- implicit solids;
- physics simulation;
- volume/area theorem solving;
- arbitrary freehand 3D answer coordinates.

Those capabilities can build on the contract/runtime in later subject phases or a dedicated high-fidelity asset layer.

## 14. Closure checklist

- [x] Renderer-neutral `Interactive3DSceneSpecV1`.
- [x] Deterministic bounded primitive mesh.
- [x] Geometry + anatomy-like + chemistry presets.
- [x] Rotate / zoom / pointer / touch / keyboard controls.
- [x] Semantic object / face / edge / vertex targets.
- [x] `scene3DSelection@1`.
- [x] Server-authoritative grading.
- [x] Student-safe projection.
- [x] Teacher authoring.
- [x] Teacher review.
- [x] RichContent integration.
- [x] Generated JSON acceptance fixture.
- [x] Shared-finalization server parity.
- [x] Dedicated mutation workflow.
- [x] Dedicated real-Chromium workflow.
- [ ] Final exact-head root CI green.
- [ ] Final exact-head 21C mutation campaign green.
- [ ] Final exact-head real Chromium certification green.
- [ ] Owner manual merge of PR #280.

Final status is not declared PASS until every exact-head gate above is green.
