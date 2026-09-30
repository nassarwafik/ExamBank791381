import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RevisionViewer from "./RevisionViewer";
import DecisionNoteDialog from "./DecisionNoteDialog";
import { createReviewInboxClient, type InboxTask, type InboxCounts, type ReviewInboxClient } from "./reviewInboxClient";
import {
  availableGovernanceActions, workflowResponsible, actorName, newRequestId, formatGovernanceTime, shortId,
  STAGE_LABEL, LIFECYCLE_LABEL, GOVERNANCE_ACTION_LABEL, PARTICIPANT_LABEL, GOVERNANCE_CONFLICT_MESSAGE, GovernanceRequestError,
  type WorkflowStage, type GovernanceStatus, type RevisionDocument, type GovernanceActor, type GovernanceAction, type WorkflowAction, type ActorContext
} from "../examGovernance";
import "./reviewInbox.css";

// Phase 14B Part J — «مراجعات النشر»: the GLOBAL Review Inbox of the signed-in teacher (reviewer / approver / publisher).
// Lists MY live tasks from the server index (validated against the manifests there), grouped by stage; opening a task loads
// the IMMUTABLE stored revision (never the author's working copy) into the shared read-only RevisionViewer together with the
// workflow participants and server stamps, and offers only the decisions the server would accept for this actor at this
// stage. Every decision carries expectedStateVersion + a fresh requestId; a 409 shows the conflict message, closes the task
// and refreshes — the page never retries on its own and never polls.
type Props = { token: string; client?: ReviewInboxClient };
type OpenTask = { task: InboxTask; status: GovernanceStatus; doc: RevisionDocument };
const STAGES: WorkflowStage[] = ["review", "approve", "publish"];
const NO_ACTORS: readonly GovernanceActor[] = [];
const WORKFLOW_ACTIONS: readonly string[] = ["complete-review", "request-changes", "reject-approval", "reject-publication", "withdraw-review"];

export default function ReviewInboxPage({ token, client: injected }: Props) {
  const client = useMemo(() => injected ?? createReviewInboxClient(token), [injected, token]);
  const [stage, setStage] = useState<WorkflowStage>("review");
  const [items, setItems] = useState<InboxTask[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [counts, setCounts] = useState<InboxCounts>({ review: 0, approve: 0, publish: 0 });
  const [actorId, setActorId] = useState("");
  const [directory, setDirectory] = useState<readonly GovernanceActor[]>(NO_ACTORS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState<OpenTask | null>(null);
  const [noteFor, setNoteFor] = useState<WorkflowAction | "approve" | "publish" | null>(null);
  const alive = useRef(true);
  const openSeq = useRef(0);                                                   // R13: a late task load never lands on a newer task
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async (s: WorkflowStage) => {
    const p = await client.list(s, null);
    if (!alive.current) return;
    setItems(p.items); setCursor(p.nextCursor); setCounts(p.counts); setActorId(p.actorId);
  }, [client]);
  // One list read per stage change (the click that changes the stage marks the page loading); no polling.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([load(stage), client.governance.directory ? client.governance.directory().then(d => { if (!cancelled) setDirectory(d.actors); }).catch(() => {}) : Promise.resolve()]);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "تعذر تحميل مهام المراجعة."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [client, stage, load]);
  const selectStage = (s: WorkflowStage) => { if (s === stage) return; setLoading(true); setStage(s); };

  const name = (id?: string) => actorName(id, directory);
  const more = async () => { if (cursor == null || busy) return; setBusy(true); try { const p = await client.list(stage, cursor); if (alive.current) { setItems(prev => [...prev, ...p.items]); setCursor(p.nextCursor); } } catch (e) { setError(e instanceof Error ? e.message : "تعذر التحميل."); } finally { if (alive.current) setBusy(false); } };

  // Opening a task: fresh authoritative status + the immutable revision named by the task (never the live exam).
  const openTask = async (task: InboxTask) => {
    if (busy) return;
    const seq = ++openSeq.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const [status, doc] = await Promise.all([client.governance.status(task.examId), client.governance.loadRevision(task.examId, task.revisionId)]);
      if (!alive.current || seq !== openSeq.current) return;                   // a newer task was opened meanwhile: drop this result
      if (doc.revisionId !== task.revisionId) throw new Error("الإصدار المحمّل لا يطابق مهمة المراجعة.");
      setOpen({ task, status, doc });
    } catch (e) {
      if (seq === openSeq.current) setError(e instanceof Error ? e.message : "تعذر فتح المهمة.");
    } finally { if (alive.current) setBusy(false); }
  };
  const closeTask = () => { openSeq.current++; setOpen(null); setNoteFor(null); };

  const ctx = useMemo<ActorContext | undefined>(() => (open?.status.actorId ? { actorId: open.status.actorId, capabilities: open.status.capabilities, workflowMode: open.status.workflowMode ?? "assigned" } : undefined), [open]);
  const actions = useMemo<GovernanceAction[]>(() => (open ? availableGovernanceActions(open.status.manifest, open.status.capabilities, ctx).filter(a => a === "approve" || a === "publish" || WORKFLOW_ACTIONS.includes(a)) : []), [open, ctx]);

  const decide = (action: WorkflowAction | "approve" | "publish", note: string) => {
    const current = open; setNoteFor(null);
    if (!current || !current.status.manifest) return;
    const m = current.status.manifest;
    setBusy(true); setError(""); setNotice("");
    (async () => {
      try {
        if (action === "approve" || action === "publish") await client.governance.transition(current.task.examId, action, { expectedStateVersion: m.stateVersion, requestId: newRequestId(), ...(action === "approve" && note.trim() ? { note } : {}) });
        else { if (!client.governance.decide) throw new Error("إجراءات دورة المراجعة غير متاحة."); await client.governance.decide(current.task.examId, action, { expectedStateVersion: m.stateVersion, requestId: newRequestId(), note }); }
        if (!alive.current) return;
        setNotice("✓ " + GOVERNANCE_ACTION_LABEL[action] + " — «" + current.task.title + "»: سُجّل القرار على الخادم.");
        setOpen(null);
        await load(stage);
      } catch (e) {
        if (!alive.current) return;
        if (e instanceof GovernanceRequestError && e.status === 409) { setError(GOVERNANCE_CONFLICT_MESSAGE + (e.code ? " (" + e.code + ")" : "")); setOpen(null); try { await load(stage); } catch { /* the conflict message stands */ } }
        else setError(e instanceof Error ? e.message : "تعذر تنفيذ القرار.");
      } finally { if (alive.current) setBusy(false); }
    })();
  };
  const startAction = (a: GovernanceAction) => {
    if (a === "publish") { decide("publish", ""); return; }                     // publication carries no note; the server binds the approved revision
    setNoteFor(a as WorkflowAction | "approve");
  };

  const wf = open?.status.manifest?.reviewWorkflow;
  const responsible = workflowResponsible(open?.status.manifest ?? null);
  return (
    <section className="gov-inbox" aria-labelledby="gov-inbox-h" dir="rtl">
      <h2 id="gov-inbox-h" className="sb-bp-h">مراجعات النشر</h2>
      <p className="sb-hint">مهامك في دورات المراجعة المعيَّنة: يعرض الخادم فقط المهام الحيّة المسندة إليك بهويتك المصادَق عليها، ويُتحقق من كل قرار على الخادم مقابل الإصدار غير القابل للتغيير ورقم الحالة.</p>
      <div role="tablist" aria-label="مراحل المراجعة" className="gov-inbox-tabs">
        {STAGES.map(s => <button key={s} type="button" role="tab" id={"gov-tab-" + s} aria-selected={stage === s} aria-controls="gov-inbox-panel" className="gov-inbox-tab" onClick={() => selectStage(s)} disabled={busy}>{STAGE_LABEL[s]} <span className="gov-count" aria-label={"عدد المهام: " + counts[s]}>{counts[s]}</span></button>)}
      </div>
      <div role="status" aria-live="polite" className="sb-hint">{busy ? "جارٍ التنفيذ…" : notice}</div>
      {error && <div className="sb-banner sb-banner-error" role="alert">{error}</div>}
      <div id="gov-inbox-panel" role="tabpanel" aria-labelledby={"gov-tab-" + stage}>
        {loading ? <p className="sb-hint" role="status">جارٍ تحميل المهام…</p> : items.length === 0 ? <p className="gov-empty">لا مهام في «{STAGE_LABEL[stage]}» حاليًا.</p> : (
          <ul className="gov-inbox-list" aria-label={STAGE_LABEL[stage]}>
            {items.map(t => (
              <li key={t.examId + ":" + t.cycleId + ":" + t.stage} className="gov-task" data-testid="inbox-task" data-exam-id={t.examId}>
                <div className="gov-task-main">
                  <span className="gov-task-title">{t.title || t.examId}</span>
                  <div className="gov-task-meta">
                    <span>الإصدار {t.revisionNumber ?? "—"} <code>{shortId(t.revisionId)}</code></span>
                    <span>المؤلف: {name(t.authorId)}</span>
                    <span>أُرسل {formatGovernanceTime(t.submittedAt)}</span>
                    <span className={"gov-stage is-" + t.stage}>{STAGE_LABEL[t.stage]} · {LIFECYCLE_LABEL[t.lifecycleState]}</span>
                  </div>
                </div>
                <button type="button" className="sb-btn sb-btn-primary gov-task-open" onClick={() => void openTask(t)} disabled={busy} aria-label={"فتح مهمة " + (t.title || t.examId)}>فتح المهمة</button>
              </li>
            ))}
          </ul>
        )}
        {cursor != null && <button type="button" className="sb-btn sb-btn-sm" onClick={() => void more()} disabled={busy}>مهام أقدم</button>}
      </div>
      {open && (
        <RevisionViewer doc={open.doc} manifest={open.status.manifest} onClose={closeTask} directory={directory}
          title={"مهمة: " + (open.task.title || open.task.examId) + " — الإصدار " + open.doc.revisionNumber}
          aside={wf ? (
            <section className="sb-gov-card" aria-labelledby="gov-task-wf-h" data-testid="task-workflow">
              <h3 id="gov-task-wf-h" className="sb-bp-h">دورة المراجعة</h3>
              <p className="sb-hint">حالة النشر: <strong>{open.status.manifest ? LIFECYCLE_LABEL[open.status.manifest.lifecycleState] : "—"}</strong> · حالة المراجعة: <strong>{wf.reviewStatus === "completed" ? "مكتملة" : "قيد الانتظار"}</strong> · رقم الحالة {open.status.manifest?.stateVersion}</p>
              <ul className="gov-workflow" aria-label="المشاركون">
                {(["authorId", "reviewerId", "approverId", "publisherId"] as const).map(k => (
                  <li key={k} className={responsible === k ? "is-current" : ""} aria-current={responsible === k ? "step" : undefined}>
                    <span className="gov-role">{PARTICIPANT_LABEL[k]}{k === "authorId" ? "" : wf[k] === actorId ? " (أنت)" : ""}</span>
                    <span className="gov-person">{name(wf[k])}</span>
                    <span className="gov-when">{k === "authorId" ? formatGovernanceTime(wf.submittedAt) : k === "reviewerId" ? (wf.reviewedAt ? formatGovernanceTime(wf.reviewedAt) : "—") : k === "approverId" ? (wf.approvedAt ? formatGovernanceTime(wf.approvedAt) : "—") : (wf.publishedAt ? formatGovernanceTime(wf.publishedAt) : "—")}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          footer={actions.length ? (
            <div className="gov-task-actions" role="group" aria-label="قرارات المراجعة">
              {actions.map(a => <button key={a} type="button" className={"sb-btn" + (a === "approve" || a === "publish" || a === "complete-review" ? " sb-btn-primary" : a === "request-changes" || a === "reject-approval" || a === "reject-publication" ? " sb-btn-danger" : "")} onClick={() => startAction(a)} disabled={busy}>{GOVERNANCE_ACTION_LABEL[a]}</button>)}
            </div>
          ) : <p className="sb-hint" role="note" data-testid="task-no-actions">لا قرار متاح لك في هذه المرحلة — المسؤول الآن: {name(responsible && wf ? wf[responsible] : undefined)}.</p>} />
      )}
      {noteFor && open && <DecisionNoteDialog action={noteFor as WorkflowAction | "approve"} busy={busy} onCancel={() => setNoteFor(null)} onConfirm={note => decide(noteFor, note)} context={"«" + (open.task.title || open.task.examId) + "» — الإصدار " + open.doc.revisionNumber} />}
    </section>
  );
}
