import { useState } from "react";
import Dialog from "../ui/Dialog";
import Field from "../ui/Field";
import type { GbGradebook } from "./types";
import { type ApprovalStatus, approvalDate, finalApprovalStatus, finalApproved, historyText, partStatus, reasonOk, REASON_MAX, REASON_MIN } from "./approvalsView";

/**
 * Class gradebook GB6b — «اعتماد العلامات» (docs/enterprise-class-gradebook-gb.md §4.8): one row per part and one for the final mark.
 *   - approved: the date, and any change since (the students keep seeing the approved values), with «إعادة الفتح»;
 *   - not approved: why it cannot be approved yet (the server's reasons, in words), or «اعتماد الجزء» when it is ready.
 * Presentation only: the server decides readiness and refuses an incomplete or unreleased part on its own. Approving needs
 * assignments.results.release (`canApprove`); while the teacher edits marks the actions wait (the approval would take the stored
 * values, not the unsaved ones). Reopening asks for a reason (recorded in the history and the audit).
 */
export type ApprovalsProps = {
  gradebook: GbGradebook;
  canApprove: boolean;
  /** Why the actions are paused (unsaved edits); empty when they are available. */
  pausedReason?: string;
  busy: boolean;
  onApprove: (categoryId: string | null, title: string) => void;
  onReopen: (categoryId: string | null, title: string, reason: string) => Promise<boolean>;
};

export default function GradebookApprovals({ gradebook: gb, canApprove, pausedReason, busy, onApprove, onReopen }: ApprovalsProps) {
  const [reopenFor, setReopenFor] = useState<{ categoryId: string | null; title: string } | null>(null);
  if (!gb.scheme || !gb.approvals || !gb.readiness) return null;
  const finalLocked = finalApproved(gb);
  const actionsOn = canApprove && !pausedReason && !busy;
  const history = [...gb.approvals.history].reverse();

  const row = (categoryId: string | null, title: string, status: ApprovalStatus, reopenBlocked: string) => (
    <li key={categoryId ?? "final"} className={"eb-gb-approval" + (status.kind === "approved" ? " is-approved" : "")}>
      <div className="eb-gb-approval-head">
        <strong>{title}</strong>
        <span className={"eb-gb-approval-state" + (status.kind === "approved" ? " is-ok" : status.kind === "ready" ? " is-ready" : " is-off")}>
          {status.kind === "approved" ? "✓ معتمد · " + approvalDate(status.approvedAt) : status.kind === "ready" ? "جاهز للاعتماد" : status.kind === "notReady" ? "غير جاهز للاعتماد" : "—"}
        </span>
        {canApprove && status.kind === "approved" && (
          <button type="button" className="eb-button is-small is-quiet" disabled={!actionsOn || Boolean(reopenBlocked)} title={reopenBlocked || undefined}
            aria-label={"إعادة فتح «" + title + "»"} onClick={() => setReopenFor({ categoryId, title })}>إعادة الفتح</button>
        )}
        {canApprove && status.kind !== "approved" && status.kind !== "unknown" && (
          <button type="button" className="eb-button is-small is-primary" disabled={!actionsOn || status.kind !== "ready"}
            aria-label={(categoryId === null ? "اعتماد العلامة النهائية" : "اعتماد «" + title + "»")} onClick={() => onApprove(categoryId, title)}>
            {categoryId === null ? "اعتماد العلامة النهائية" : "اعتماد الجزء"}
          </button>
        )}
      </div>
      {status.kind === "approved" && status.drift && <p className="eb-gb-warning" role="status">{status.drift}</p>}
      {status.kind === "approved" && reopenBlocked && canApprove && <p className="eb-muted">{reopenBlocked}</p>}
      {status.kind === "notReady" && <ul className="eb-gb-approval-reasons">{status.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
    </li>
  );

  return (
    <section className="eb-gb-approvals" aria-labelledby="eb-gb-approvals-title">
      <h3 id="eb-gb-approvals-title" className="eb-gb-approvals-title">اعتماد العلامات</h3>
      <p className="eb-muted">
        يرى الطلاب الجزء بعد اعتماده فقط: علاماتهم فيه ومجموعه، والعلامة النهائية بعد اعتمادها. الجزء المعتمد يُقفل، ولا يُعدَّل إلا بعد إعادة فتحه مع ذكر السبب.
      </p>
      {pausedReason && canApprove && <p className="eb-gb-warning" role="status">{pausedReason}</p>}
      {!canApprove && <p className="eb-muted">الاعتماد وإعادة الفتح يحتاجان صلاحية «نشر النتائج».</p>}
      <ul className="eb-gb-approval-list" aria-label="حالة اعتماد الأجزاء والعلامة النهائية">
        {gb.scheme.categories.map(c => row(c.categoryId, c.title, partStatus(gb, c.categoryId), finalLocked ? "أعد فتح العلامة النهائية أولًا." : ""))}
        {row(null, "العلامة النهائية", finalApprovalStatus(gb), "")}
      </ul>
      {history.length > 0 && (
        <details className="eb-gb-approval-history">
          <summary>سجل الاعتماد ({history.length})</summary>
          <ul>{history.map((h, i) => <li key={i}>{historyText(gb, h)}</li>)}</ul>
        </details>
      )}
      {reopenFor && (
        <ReopenDialog title={reopenFor.title} busy={busy} onClose={() => setReopenFor(null)}
          onConfirm={async reason => { if (await onReopen(reopenFor.categoryId, reopenFor.title, reason)) setReopenFor(null); }} />
      )}
    </section>
  );
}

function ReopenDialog({ title, busy, onClose, onConfirm }: { title: string; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const ok = reasonOk(reason);
  const footer = <>
    <button type="button" className="eb-button" onClick={onClose} disabled={busy}>إلغاء</button>
    <button type="button" className="eb-button is-primary" disabled={busy || !ok} onClick={() => onConfirm(reason.trim())}>{busy ? "جارٍ إعادة الفتح..." : "إعادة الفتح"}</button>
  </>;
  return (
    <Dialog open title={"إعادة فتح «" + title + "»"} onClose={onClose} size="sm" footer={footer}>
      <p className="eb-muted">بعد إعادة الفتح يختفي «{title}» من صفحة الطلاب حتى تعتمده من جديد، ويمكن تعديل علاماته. يُحفظ السبب في سجل الاعتماد.</p>
      <Field label="سبب إعادة الفتح" help={"من " + REASON_MIN + " إلى " + REASON_MAX + " حرفًا."} error={reason.trim() && !ok ? "اكتب سببًا من " + REASON_MIN + " إلى " + REASON_MAX + " حرفًا." : ""}>
        {a11y => <textarea {...a11y} className="eb-gb-reason" rows={3} maxLength={REASON_MAX + 20} value={reason} onChange={e => setReason(e.target.value)} />}
      </Field>
    </Dialog>
  );
}
