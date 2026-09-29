import { createContext, lazy, Suspense, useContext, type ReactNode } from "react";
import type { LearningActivityRegistry } from "./learning/activities/engine";
import { assessmentActivityRegistry, normalizeActivityDescriptor } from "./assessmentActivity";

// Phase 13C-A — the student / preview surface for an interactive CONTEXT attached to a question or a shared stimulus.
// Content supplies a data descriptor only; the trusted host chunk is reached through this literal lazy import (never a
// path from content), and an unknown / unsupported / malformed / unapproved descriptor degrades to a static fallback —
// the surrounding question stays fully answerable.
const RegistryContext = createContext<LearningActivityRegistry>(assessmentActivityRegistry);
const AssessmentActivityHost = lazy(() => import("./AssessmentActivityHost"));

/** Test / integration seam: inject a registry (production uses the code-owned assessment-safe registry). */
export function AssessmentActivityRegistryProvider({ registry, children }: { registry: LearningActivityRegistry; children: ReactNode }) {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function AssessmentActivityContext({ descriptor, scope }: { descriptor: unknown; scope: "question" | "stimulus" }) {
  const registry = useContext(RegistryContext);
  const d = normalizeActivityDescriptor(descriptor);
  const label = d?.title || "نشاط تفاعلي";
  return (
    <div className={"iex-activity iex-activity-" + scope} data-activity-scope={scope} role="group" aria-label={label}>
      {d ? (
        <Suspense fallback={<p className="iex-activity-status" role="status">جارٍ تحضير النشاط التفاعلي…</p>}>
          <AssessmentActivityHost descriptor={d} registry={registry} />
        </Suspense>
      ) : (
        <p className="iex-activity-fallback">نشاط تفاعلي غير متاح — عرض بديل ثابت. يمكنك الإجابة عن السؤال كالمعتاد.</p>
      )}
    </div>
  );
}
