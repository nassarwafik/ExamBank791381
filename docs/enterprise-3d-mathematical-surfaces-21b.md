# Phase 21B — Enterprise 3D Mathematical Surface Visualizations

**Current state: implementation in progress, branch feature/21b-3d-mathematical-surfaces; NOT ready for merge.**

## 1. Baseline and scope

- Baseline: owner-merged 21A.2 on main at e099cb544f45c6ea5d62c5fb2494044a78a4aae6 (PR #278).
- Phase 21A.1 explicitly deferred mathematical 3D surfaces to 21B, while data charts and 2D function graphs remain separate.
- Goal: the ExamBank-owned bounded, accessible 3D surface z = f(x,y), safe authoring and display, questions with semantic grading, server-side finalization and AI provenance, and real-browser certification.
- No merge without independent review and the owner's manual merge under AGENTS.md.
- Deployment: only CI / automated PR preview if its Build and Deploy Job succeeds; never production or the live Runner from an agent.

## 2. Slice 1 — owned math + bounded renderer prototype

**New files:**
- src/functionSurfaces/surfaceSpec.ts: distinct SurfaceSpecV1, closed/versioned, own-id, safe language-3 expression with exactly two variables x/y; parser reuses the one bounded AST evaluator from parametricExpression.ts. There is no eval, WebGL script or third-party renderer.
- src/functionSurfaces/surfaceMesh.ts: deterministic bounded grid with holes for undefined / off-window cells, midpoint and edge probes, jump guard, max 40 x 40 grid cells, 3,200 triangle upper bound, 9,800 evaluation upper bound. Orthographic camera/view transform is purely presentational.
- src/functionSurfaces/Surface3DView.tsx and surface-3d.css: isolated SVG preview, controlled camera buttons, RTL text, authored source expression, keyboard-accessible nine-row value table and print layout. Not yet wired into exam editing, RichContent, student pages or grading.
- src/functionSurfaces/surface.21b.test.tsx: strict validation, hostile input, deterministic budget/holes, projection, and accessible rendered controls.

**Contract:**
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

Expressions use calculator-style ASCII: x^2+y^2, sin(x)*cos(y), sqrt(1-x^2-y^2).
No implicit multiplication; expressions are never rewritten. z = f(x,y) is the only plot kind in V1.

The discontinuity guard is conservative and NOT a formal proof of global continuity:
a cell is omitted when any corner, midpoint or edge probe is undefined/off-window, or when
curvature/jump exceeds a display threshold. A singularity falling between all nine probes is
not mathematically ruled out. No quantitative area or volume is inferred from this mesh.

## 3. Pending slices / explicit blockers to release

- [ ] Slice 1 exact-head CI and local focused/full validations; record real counts.
- [ ] Independent read-only reviewer of Slice 1 safety, math topology, UX and tests.
- [ ] Slice 2: versioned rich block for the surface, student sanitizer, mirror regeneration and drift test; teacher builder editor and runtime lazy-load.
- [ ] Slice 3: a separately versioned question/answer contract (if owner confirms grading semantics); server-authoritative target grading, no answers/keys in student payload, and negative/adversarial tests.
- [ ] Slice 4: AI provenance (only teacher-supplied expressions); course-grade examples and acceptance exams (paraboloid/saddle/sphere cap).
- [ ] Slice 5: real Chromium keyboard, mobile, Arabic RTL, print tests, performance, mutation proof for critical authority, full root suite, lint, TypeScript and bundle guard.
- [ ] Owner accepts and manually merges after an independent clean review; genuine teacher/student live UAT is tracked separately.

## 4. Invariants

- Plot data and the expression AST do not transport grading keys.
- Missing domain values are never coerced to zero and no invented surface is drawn.
- No unbounded surface resolutions, arbitrary expressions or renderer options.
- No new package dependency, server route, API or production setting in Slice 1.
- Only the owner can merge; this initial implementation is NOT a release claim.


## 5. Slice 2A: isolated teacher preview laboratory (awaiting CI)

The exam builder now has a lazy-opened 3D laboratory. Teachers can explore four presets,
edit safe x/y expressions and bounded ranges, rotate the surface, and inspect an accessible
value table. The lab neither calls the exam change callback nor the save callback, and
is never serialized or shown to students. This pilot is **not** integrated into actual
exam questions. Full exam RichContent and server projection require additional certified work.
