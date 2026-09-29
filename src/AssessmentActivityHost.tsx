import { useMemo } from "react";
import LearningActivityHost from "./learning/activities/LearningActivityHost";
import type { LearningActivityRegistry } from "./learning/activities/engine";
import { emptyActivityRegistry, toActivityBlock } from "./assessmentActivity";
import type { AssessmentActivityDescriptor } from "./assessmentTypes";

// Phase 13C-A — the assessment host is the EXISTING trusted activity host with two differences: the registry is the
// assessment-safe one (or an injected test registry) and learning built-in presenters are never consulted. Same lazy
// loading, boundary, fallback, fullscreen (single live instance), reset/replay capabilities and reduced motion. The
// event sink stays the no-op default: activity interaction never reaches answers, marks or grading. Loaded lazily by
// AssessmentActivityContext so exams without activities never fetch this chunk.
export default function AssessmentActivityHost({ descriptor, registry }: { descriptor: AssessmentActivityDescriptor; registry: LearningActivityRegistry }) {
  const block = useMemo(() => toActivityBlock(descriptor), [descriptor]);
  return <LearningActivityHost block={block} courseId="assessment" registry={registry} builtins={emptyActivityRegistry} />;
}
