import { useMemo } from "react";
import type { LearningActivityProps } from "./engine";
import { readDsTrace } from "./ds";
import DsTraceView from "./DsTraceView";

/**
 * DS-A1 (docs/enterprise-data-structures-course.md) — `simulation / ds-trace / v1`: «تتبّع البرنامج على مبنى المعطيات».
 *
 * A program of the course, one step at a time (DsTraceView). Every step is DATA recorded by the authoring tool
 * (scripts/ds-course/cs-lite.mjs) and checked against the real C# compiler; nothing here interprets C#. The shell's reset returns
 * to the first step. An unreadable config shows a short note instead of guessing.
 */
export default function DsTraceActivity({ block, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readDsTrace(block.config), [block.config]);
  if (!cfg) return <p className="learning-trace-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;
  return <DsTraceView cfg={cfg} epoch={commands.reset} onStep={(step, of) => emit({ type: "interaction", activityId: block.id, name: "trace-step", detail: { step, of } })} />;
}
