# Phase 21E — Premium SmartSim / 3D viewer (student-facing)

**Owner direction (2026-10-13):**
- one independent premium slice for the student-facing SmartSim and interactive 3D viewer presentation;
- preserve engine behaviour, answer semantics, grading, stored exam JSON, hotspots and 3D part selection, RTL / LTR, keyboard,
  touch and reduced motion;
- no edits to files owned by PRs #303–#307; no agent swarms, no broad mutation campaign, no auto-merge.

## 1. Audit (read-only, before any edit)

**Baseline:** `origin/main` `0e7adeca` (merge of #302).

**Active branches compared** (merge-base diffs):
- #303 `feature/phase-21e3-student-enterprise-ux`;
- #304 `feature/phase-21e2b-builder-integration`;
- #305–#307 premium slices 2–4.

**Shared viewers found:** four orbit-camera viewers use the same pattern (a toolbar of six icon buttons, a help paragraph, a scene):
- `src/interactive3d/Interactive3DView.tsx` (Scene3D);
- `src/meshModels/MeshModel3DView.tsx`;
- `src/functionSurfaces/SurfacePlot3DView.tsx`;
- `src/chemistryStructure/MoleculeView3D.tsx`.

`Interactive3DView` is the student-facing one for Scene3D selection, and it is also used by rich content, the review screen and
the editor preview. SmartSim questions render `src/smartsim/SimulationSandboxHost.tsx`, a sandboxed iframe styled by
`smartsim.css`.

**Overlap:**
- #303 touches `StudentQuestionCard.tsx`, `questionTypes/studentRegistry.tsx`, `trustedSim/smartSimUiRegistry.ts`,
  `physicsLab/LabScene.tsx` and `questionTypes/student/CompositeResponse.tsx`. Its registry changes only swap `lazy` for a
  recoverable lazy loader, not presentation.
- The builder branches touch only `functionSurfaces/surfaceLab.21b.test.tsx`.
- **No active branch touches the files this slice edits.**

**Decision:** an isolated implementation is possible. Scope: the Scene3D viewer plus the SmartSim host chrome. The mesh, surface
and molecule viewers follow the same pattern and can adopt this visual language in a later slice; they are not edited here (their
CI workflows and certifications stay untouched).

## 2. What changed

**`Interactive3DView.tsx` — markup only:**
- **One toolbar of labelled groups.** «التدوير» holds the four rotate buttons; «التكبير» holds +, − and «عرض النموذج كاملًا»; «العرض»
  holds «إعادة العرض» and the auto-rotate toggle. They sit inside the unchanged `.i3d-controls` group «أدوات عرض النموذج ثلاثي
  الأبعاد». Every button keeps its exact accessible name, title and handler. The Unicode glyphs (⟲ ⟳ ⤒ ⤓ + −) become inline SVG
  icons (`aria-hidden`, `focusable="false"`); text buttons gain a matching icon.
- **A titled instruction card.** The help paragraph keeps its `id`, class and text byte-for-byte, because it is the scene's
  `aria-describedby` target. It sits in a card with a decorative, `aria-hidden` title «طريقة التحكم».
- **A framed stage.** The `<svg class="i3d-scene">` and everything inside it are unchanged; it is wrapped in `.i3d-stage`. A
  decorative hint «اسحب لتدوير النموذج» (`aria-hidden`):
  - sits in the stage's top end corner, away from the centred model;
  - never takes pointer input;
  - fades while the student drags (`data-interacting`);
  - is not drawn at ≤ 480 px, where it would cover the model.
- **Unchanged:**
  - DOM order (instructions before the scene, answers after it);
  - the camera, gestures and keyboard map;
  - display modes and quality;
  - selection logic, target keys, review marks and the text alternative.

**`interactive3d.css` — the viewer chrome, rewritten on design tokens:**
- the card, toolbar groups, options, instruction card, stage and hint;
- answer chips with a radio-style indicator that **fills** when chosen (form and colour);
- 44 px touch targets, hover tints only where a pointer hovers, visible focus rings, reduced motion, forced colours and print.

The scene drawing rules are unchanged byte-for-byte: faces, lines, edge / vertex targets, selected and review tints. So are the
editor rules.

**`smartsim.css` — the host chrome only:**
- a rounded frame;
- a pill-shaped loading state, whose pulse stops under reduced motion;
- an error card with a 4 px danger edge;
- 44 px buttons and a read-only pill.

The iframe's `src`, sandbox flags, height handshake, `[hidden]` rule and messages are unchanged. The simulator's interior belongs to
its package.

## 3. Evidence (local, on this head)

**Real Chromium** (`scripts/check-viewer-premium-21e.mjs`, page `browser-harness/viewer-premium-21e.*`). The page mounts:
- the real `StudentQuestionCard` with a scene3DSelection question;
- a cube with face selection;
- the SmartSim host.

Viewports: 1280×900 (motion allowed), 853×600 @1.5, 640×450 @2, 390×844 touch.

| Check | BEFORE (`main` `0e7adeca`) | AFTER |
|---|---|---|
| C-1 every control by exact name inside `.i3d-controls`; auto-rotate only when motion is allowed | ✓ | ✓ |
| C-2 «تكبير» zooms, «إعادة العرض» restores the authored camera; C-3 ArrowLeft rotates, Home resets | ✓ | ✓ |
| C-4 a mouse / touch drag rotates, also from the hint's position (the hint never intercepts) | ✓ | ✓ |
| A-1 «البطين الأيسر» emits exactly `{"kind":"scene3DSelection","sceneId":"exam-heart","targets":["object:leftVentricle"]}`; rotate / zoom / fit / reset never change it | ✓ | ✓ |
| A-2 face selection keeps max 2 and face keys | ✓ | ✓ |
| F-1 a keyboard-focused toolbar button shows a focus ring; T-1 touch targets ≥ 44 px; V-1 / V-2 no overflow or clipping | ✓ | ✓ |
| S-1 SmartSim error card; E-1 no errors | ✓ | ✓ |
| Total | 38 / 38 | **38 / 38** |

Behaviour was already correct, so this is a presentation slice and every behavioural check stays green on both trees.

**The 21D engine certification** `scripts/check-interactive-3d-browser-21d.mjs` passes 42 / 42 on this head, covering:
- drag rotation, also after sweeps;
- wheel zoom;
- the exam answer after a drag and under a re-rendering timer;
- no page errors.

**Unit tests:**
- `src/interactive3d/viewerPremium.21e.test.tsx`: 15 tests.
  - **6 pins pass on `main` too:** answer integrity, read-only, camera, the scene without controls, the unchanged scene drawing
    rules, and the SmartSim `[hidden]` rule.
  - **9 fail on `main`:** they describe the new structure (groups, decorative icons, instruction card, stage hint, focus / touch /
    reduced-motion / token rules).
- Every test file referencing the viewer, Scene3D questions or SmartSim (34 files, 667 tests) passes with `TZ=UTC`, as CI runs.
  Two `StudentExamPage.ux7b1` assertions depend on the container's time zone and pass under UTC.

**Planted defects** (files hash-restored), each KILLED:
- «إعادة العرض» also clearing the answer;
- icons exposed to assistive technology;
- the hint taking pointer input;
- the help text changed.

**Static checks:** `tsc -b` clean; lint 125 warnings (= `main`), 0 errors; `npm run build` with the bundle guard passed;
`git diff --check` clean.

## 4. Limits

- **SmartSim states:** only the host's error state is captured in Chromium. The loading and running states need the simulation
  runtime served by the API, and the simulator's own UI belongs to its sandboxed package.
- **Other viewers:** the mesh, surface-plot and molecule viewers are not restyled here. They share the toolbar pattern, so a follow-up
  can apply the same groups, icons and stage, with their own certification workflows.
