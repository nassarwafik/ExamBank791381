import { useId, useMemo, useState } from "react";
import Dialog from "../ui/Dialog";
import { assignmentProblems, CAPABILITY_LABEL, type GovernanceActor, type WorkflowAssignments, type GovernanceCapability } from "../examGovernance";

// Phase 14B Part D — the author's assignment dialog before «إرسال للمراجعة» in Assigned mode. Reviewer / Approver / Publisher
// are chosen from the SERVER directory only (no free-text identity); the client sends ids. Invalid combinations (missing
// capability, duplicate identity, the author) are disabled / flagged for convenience — the server re-validates everything.
type Props = {
  authorId: string;
  directory: readonly GovernanceActor[];
  revisionNumber: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (assignments: WorkflowAssignments) => void;
};
type Key = keyof WorkflowAssignments;
const FIELDS: { key: Key; cap: GovernanceCapability; label: string }[] = [
  { key: "reviewerId", cap: "review", label: "المراجع" },
  { key: "approverId", cap: "approve", label: "المعتمد" },
  { key: "publisherId", cap: "publish", label: "الناشر" }
];

export default function AssignmentDialog({ authorId, directory, revisionNumber, busy = false, onCancel, onConfirm }: Props) {
  const [sel, setSel] = useState<Partial<WorkflowAssignments>>({});
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const problems = useMemo(() => assignmentProblems(authorId, sel, directory), [authorId, sel, directory]);
  const complete = !!sel.reviewerId && !!sel.approverId && !!sel.publisherId;
  const eligible = (cap: GovernanceCapability) => directory.filter(a => a.capabilities.includes(cap));
  const taken = (key: Key, actorId: string) => actorId === authorId || FIELDS.some(f => f.key !== key && sel[f.key] === actorId);
  const submit = () => { if (busy || !complete || problems.length) return; onConfirm({ reviewerId: sel.reviewerId!, approverId: sel.approverId!, publisherId: sel.publisherId! }); };
  return (
    <Dialog open onClose={onCancel} size="md" title="تعيين دورة المراجعة" className="sb-gov-assign"
      footer={<>
        <button type="button" className="sb-btn" onClick={onCancel} disabled={busy}>إلغاء</button>
        <button type="button" className="sb-btn sb-btn-primary" onClick={submit} disabled={busy || !complete || problems.length > 0} data-testid="assign-confirm">{busy ? "جارٍ الإرسال…" : "إرسال الإصدار " + revisionNumber + " للمراجعة"}</button>
      </>}>
      <form className="sb-gov-assign-form" onSubmit={e => { e.preventDefault(); submit(); }}>
        <p className="sb-hint">يُرسَل الإصدار {revisionNumber} بالضبط إلى دورة مراجعة واحدة. اختر ثلاثة أشخاص مختلفين من دليل الخادم؛ لا يجوز أن يراجع المؤلف عمله أو أن يشغل شخص واحد مرحلتين. يتحقق الخادم من كل اختيار.</p>
        {FIELDS.map(f => {
          const fid = "gov-assign-" + f.key + "-" + id;
          const options = eligible(f.cap);
          return (
            <label key={f.key} className="sb-field" htmlFor={fid}>
              <span>{f.label} <span className="sb-hint">(صلاحية «{CAPABILITY_LABEL[f.cap]}»)</span></span>
              <select id={fid} className="sb-input" value={sel[f.key] ?? ""} onChange={e => setSel(s => ({ ...s, [f.key]: e.target.value || undefined }))} disabled={busy} aria-required>
                <option value="">— اختر —</option>
                {options.map(a => <option key={a.actorId} value={a.actorId} disabled={taken(f.key, a.actorId)}>{a.displayName}{a.actorId === authorId ? " (أنت — المؤلف)" : taken(f.key, a.actorId) ? " (معيَّن لمرحلة أخرى)" : ""}</option>)}
              </select>
              {options.length === 0 && <span className="sb-hint is-error" role="note">لا يوجد في دليل الخادم من يملك صلاحية «{CAPABILITY_LABEL[f.cap]}».</span>}
            </label>
          );
        })}
        {complete && problems.length > 0 && <ul className="sb-gov-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      </form>
    </Dialog>
  );
}
