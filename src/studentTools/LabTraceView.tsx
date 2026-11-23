import "../learning/activities/activities.css";
import DsTraceView from "../learning/activities/DsTraceView";
import type { DsTrace } from "../learning/activities/ds";

// Visual lab V3 (docs/enterprise-csharp-visual-lab-plan.md §11) — the teacher's «تشغيل مرئي» in the book's C# editor shows the recorded
// run with the COURSE'S OWN trace view (the «تتبّع البرنامج على مبنى المعطيات» activity): the line that ran, the structures drawn as
// they are now, the variables of every method on the call stack, the output so far. Its own lazy chunk (with the activities' CSS), so
// the editor and the reader carry none of it until a visual run is asked for. `epoch`: a new number = a new trace, from its first step.
export default function LabTraceView({ trace, epoch }: { trace: DsTrace; epoch: number }) {
  return (
    <div className="stt-cs-trace" data-testid="csharp-trace">
      <DsTraceView cfg={trace} epoch={epoch} />
    </div>
  );
}
