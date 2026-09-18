// Learning Materials — Phase 3A: SYNTHETIC demo activity RENDERERS (test-only).
//
// This file exports ONLY components (fast-refresh clean) and is imported by `activityFixtures.ts` to populate a
// demo registry. These are trivial stand-ins that exercise the engine shell — they are NOT real simulations and
// are never registered in the production registry, so real students never see them.
import type { ReactNode } from "react";
import type { LearningActivityProps } from "./engine";

/** A trivial live activity: echoes its injected context and emits an interaction event on click. */
export function DemoActivity({ block, courseId, reducedMotion, fullscreen, emit }: LearningActivityProps): ReactNode {
  return (
    <div
      data-testid="demo-activity"
      data-course={courseId}
      data-reduced-motion={String(reducedMotion)}
      data-fullscreen={String(fullscreen)}
    >
      <p>{block.title} — عرض تجريبي حي</p>
      <button type="button" onClick={() => emit({ type: "interaction", activityId: block.id, name: "tick" })}>
        تفاعل تجريبي
      </button>
    </div>
  );
}

/** A renderer that throws during render — proves the boundary degrades to the fallback instead of crashing. */
export function ThrowingActivity(): ReactNode {
  throw new Error("demo activity boom");
}
