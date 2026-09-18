// Learning Materials — Phase 3A: SYNTHETIC demo activity RENDERERS (test-only).
//
// This file exports ONLY components (fast-refresh clean) and is imported by `activityFixtures.ts` to populate a
// demo registry. These are trivial stand-ins that exercise the engine shell — they are NOT real simulations and
// are never registered in the production registry, so real students never see them.
import { useState, type ReactNode } from "react";
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

/**
 * A STATEFUL demo activity: a counter in React state, a replay counter, and reactions to the shell's reset/replay
 * command signals. Used to prove (a) a single live instance whose state survives inline <-> fullscreen, and
 * (b) generic commands reach the renderer only through declared capabilities.
 */
export function StatefulDemoActivity({ block, fullscreen, commands, emit }: LearningActivityProps): ReactNode {
  // Counter stamped with the reset epoch: a reset bumps `commands.reset`, so older progress derives to 0 (pure
  // derivation, no effect). Replays are the replay signal itself — nothing to store.
  const [c, setC] = useState({ count: 0, epoch: 0 });
  const count = c.epoch === commands.reset ? c.count : 0;
  return (
    <div data-testid="demo-activity" data-stateful="true" data-fullscreen={String(fullscreen)} data-count={count} data-replays={commands.replay}>
      <p>{block.title} — العدّاد: <span data-testid="counter">{count}</span></p>
      <button type="button" onClick={() => { setC({ count: count + 1, epoch: commands.reset }); emit({ type: "interaction", activityId: block.id, name: "increment" }); }}>
        زِد
      </button>
    </div>
  );
}

/** A renderer that throws during render — proves the boundary degrades to the fallback instead of crashing. */
export function ThrowingActivity(): ReactNode {
  throw new Error("demo activity boom");
}
