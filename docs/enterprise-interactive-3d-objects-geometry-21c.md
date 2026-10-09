# Phase 21C — Enterprise Interactive 3D Objects & Geometry Runtime

**Status:** implementation/certification in progress on `feature/21c-interactive-3d-objects-geometry` (PR #280). Owner merge only after exact-head certification.

## 1. Baseline and goal

Phase 21C starts from the owner-merged Phase 21B baseline:

`2ab2e1773b777cf4eb39c3bf966f0128c8b467cb`

The phase turns the 21B 3D visualization foundation into an ExamBank-owned, renderer-neutral **interactive 3D assessment runtime**. The primary goals are:

- declarative structured JSON, not renderer configuration;
- safe bounded scene construction;
- rotate / zoom / inspect;
- semantic object / face / edge / vertex targets;
- student selection by stable target IDs, never pixels;
- server-authoritative grading;
- teacher authoring, student delivery, review and print;
- one runtime capable of geometry plus simplified anatomy/science examples.

## 2. Owned JSON contract

`src/interactive3d/sceneSpec.ts` defines `Interactive3DSceneSpecV1`.

A scene contains only ExamBank-owned data:

- scene identity, title and description;
- bounded camera;
- allowed interactions;
- bounded objects;
- bounded semantic targets.

V1 primitive object kinds:

- `box`
- `sphere`
- `ellipsoid`
- `cylinder`
- `cone`
- `pyramid`

Semantic target kinds:

- `object`
- `face`
- `edge`
- `vertex`

No raw SVG, WebGL/Three.js options, callbacks, scripts, HTML, external model URL or executable expression is persisted.

The validator requires plain objects, exact keys, finite bounded numbers, safe identifiers/text, unique object/target IDs, known target-to-object references and valid element names.

## 3. Geometry and projection

`sceneMesh.ts` expands validated primitive objects into deterministic bounded mesh geometry.

- box and pyramid preserve stable face/edge/vertex element names;
- sphere/ellipsoid/cylinder/cone use bounded deterministic tessellation;
- object transforms are applied before camera projection;
- mesh limits fail closed instead of allocating unbounded geometry;
- camera state changes only presentation, never grading identity.

The V1 renderer uses the project’s owned SVG projection rather than introducing a heavy 3D dependency. This keeps print, accessibility, determinism and bundle control strong while still supporting real rotation/zoom and semantic selection.

## 4. Interaction and accessibility

`Interactive3DView.tsx` supports:

- pointer/touch drag rotation;
- left/right/up/down keyboard camera movement;
- +/- zoom;
- Home reset;
- explicit rotate/zoom/reset buttons;
- semantic selection of objects/faces/edges/vertices;
- review states (correct / incorrect / missed);
- an equivalent target-list control so drag/click is never the only accessible path;
- a textual object summary;
- RTL surrounding UI.

Selection answers contain stable semantic keys such as:

- `object:leftVentricle`
- `face:top`
- `edge:eAB`
- `vertex:vA`

Screen coordinates and camera angles are never answers.

## 5. 3D question type and grading

Phase 21C adds:

`scene3DSelection@1`

The question owns:

- a validated interactive scene;
- target kind;
- single/multiple selection mode;
- maximum selections;
- optional student instruction;
- a private answer key;
- all-or-nothing or proportional set scoring where valid.

The server:

1. validates the published config;
2. validates the private key;
3. validates and binds the student answer to the published scene;
4. rejects wrong scene IDs, unknown targets, duplicates and over-limit submissions;
5. grades stable semantic target IDs authoritatively.

The client renders interaction and review but is not the grading authority.

## 6. Teacher authoring

`Scene3DEditor` and `Scene3DSelectionEditor` provide structured authoring.

The teacher can:

- start from a preset;
- change title/description;
- set camera;
- add/remove bounded primitive objects;
- edit object type, position, size and palette;
- preview the validated scene;
- configure target family and answer key in the question editor.

Malformed scenes stay blocked by the canonical validator.

## 7. Cross-subject presets

V1 proves that the runtime is not geometry-only through five code-owned presets:

1. **Cube** — faces, edges and vertices.
2. **Square pyramid** — faces, edges and vertices.
3. **Simplified educational heart** — four chambers plus major vessels as selectable semantic parts.
4. **Human torso / major organs** — lungs, heart, liver and stomach as selectable semantic parts.
5. **Water molecule** — oxygen/hydrogen atoms and bonds.

The anatomy presets are explicitly simplified educational diagrams, **not clinical anatomical models**.

Future high-detail anatomy/engineering models should use a separate code-owned 3D asset registry (for example approved local GLB assets referenced by stable `assetId`), not arbitrary URLs embedded in exams. Adding that asset pipeline does not require changing the semantic answer model designed here.

## 8. Rich content and lifecycle

Phase 21C adds the additive RichContent block:

`interactive3D`

The 3D scene can therefore appear as a structured visual stimulus independent of whether the question itself is `scene3DSelection@1`.

The feature is wired through:

- question catalog/defaults/validation;
- authoring and student registries;
- answer state;
- student sanitization;
- generated server finalization mirror;
- server grader;
- assignment review;
- RichContent editor/renderer;
- import/export/finalization lifecycle.

## 9. Acceptance fixture

The generated acceptance exam is:

`docs/fixtures/interactive-3d-21c/ExamBank_21C_Interactive_3D_Acceptance.json`

It contains semantic 3D selection tasks across geometry, anatomy and science plus a control question, proving that the same owned contract/runtime supports multiple subjects.

The fixture is generated from source and drift-tested.

## 10. Security invariants

Phase 21C fails closed on:

- non-plain/prototype-shaped inputs;
- unknown keys;
- unknown versions;
- unsafe bidi/invisible/control text;
- malformed or duplicate IDs;
- unknown target object references;
- invalid face/edge/vertex element names;
- oversized object/target arrays;
- non-finite or out-of-range coordinates/sizes/camera values;
- forged scene IDs;
- unknown/duplicate/over-limit answer targets.

There is no eval/dynamic code, arbitrary HTML, remote script or renderer configuration.

## 11. Compatibility and bundle policy

Phase 21C is additive.

- older catalog identities retain their order/meaning;
- older RichContent block types retain their order/meaning;
- 21A.1 / 21A.2 compatibility freezes remain scoped to their captured fixture corpora;
- the 21C fixture is certified by 21C lifecycle tests instead of being compared to pre-21C snapshots;
- interactive 3D UI must remain behind lazy edges;
- the initial JavaScript gzip budget remains **125 KB** and must not be raised merely to fit 21C.

## 12. Certification plan

Closure requires an exact-head green run of:

- root tests / TypeScript / production build / lint / bundle guard;
- Runner security and smoke tests;
- inherited 21A.2 and 21B certification gates triggered by touched shared seams;
- Phase 21C focused mutation campaign;
- Phase 21C real Chromium certification.

Real-browser certification covers narrow-to-desktop widths, rotation, zoom, pointer/keyboard selection, RTL, print and runtime errors.

## 13. Deliberate boundaries

This phase establishes the **interactive semantic 3D assessment runtime**.

V1 does not claim:

- arbitrary uploaded 3D models;
- photorealistic/clinical anatomy;
- arbitrary GLTF/GLB URLs;
- physics simulation;
- collision/rigid-body dynamics;
- volume/area symbolic geometry solver;
- unrestricted mesh editing.

Those can be layered onto this runtime through code-owned registries/plugins without weakening the structured JSON and semantic grading contract.

## 14. Exit criteria

Phase 21C is ready to close when:

- [x] owned `Interactive3DSceneSpecV1`;
- [x] bounded deterministic geometry/projection;
- [x] geometry + anatomy + chemistry presets;
- [x] rotate/zoom/reset and accessible alternative controls;
- [x] semantic object/face/edge/vertex targets;
- [x] `scene3DSelection@1`;
- [x] server-authoritative grading;
- [x] teacher editor;
- [x] student renderer and review;
- [x] `interactive3D` RichContent block;
- [x] generated acceptance fixture + lifecycle tests;
- [ ] exact-head root CI green;
- [ ] exact-head bundle guard under unchanged 125 KB;
- [ ] exact-head 21C mutation certification green;
- [ ] exact-head real Chromium certification green;
- [ ] owner manual merge.

Final implementation verdict will be one of:

`ENTERPRISE INTERACTIVE 3D OBJECTS & GEOMETRY 21C: PASS`

or

`ENTERPRISE INTERACTIVE 3D OBJECTS & GEOMETRY 21C: NOT READY`.
