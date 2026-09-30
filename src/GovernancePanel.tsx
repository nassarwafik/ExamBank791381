import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dialog from "./ui/Dialog";
import FinalizationPanel from "./FinalizationPanel";
import RevisionViewer from "./governance/RevisionViewer";
import AssignmentDialog from "./governance/AssignmentDialog";
import DecisionNoteDialog from "./governance/DecisionNoteDialog";
import { evaluateExamFinalization } from "./examFinalization";
import type { StructuredExam } from "./examTypes";
import {
  availableGovernanceActions, revisionRoles, shortId, newRequestId, formatGovernanceTime, eventTypeLabel, workflowStage, workflowResponsible, actorName,
  LIFECYCLE_LABEL, GOVERNANCE_ACTION_LABEL, CAPABILITY_LABEL, ROLE_LABEL, DECISION_LABEL, DECISION_STAGE_LABEL, PARTICIPANT_LABEL, GOVERNANCE_CONFLICT_MESSAGE, GovernanceRequestError,
  type GovernanceService, type GovernanceStatus, type GovernanceManifestView, type RevisionMeta, type RevisionDocument, type GovernanceEvent, type GovernanceAction, type TransitionAction, type GovernanceCapability, type GovernanceActor, type WorkflowAction, type DecisionRecord, type WorkflowAssignments, type ActorContext
} from "./examGovernance";
import "./governance/reviewInbox.css";

// Phase 14A — إدارة النشر والإصدارات: the Builder's window onto the SERVER-owned publishing authority.
// Phase 14B — in Assigned mode the same panel shows the review cycle (Author / Reviewer / Approver / Publisher, stage, stamps),
// opens the actor-selection dialog before «إرسال للمراجعة», offers the explicit workflow decisions to the assigned actor only,
// and shows the author WHY an exam came back (the immutable decision note) plus the bounded decision history.
//
// Nothing here decides anything: the lifecycle state, the revision pointers, the workflow and the offered actions come from the
// server status (never from exam.status); every mutation names the authority version it saw (expectedStateVersion) and a fresh
// requestId; a 409 shows the conflict message and refreshes the authoritative state — it never retries on its own. There is
// no polling: one status read on open, refresh after each mutation, explicit refresh on demand.
type Props = {
  open: boolean;
  onClose: () => void;
  exam: StructuredExam;
  service: GovernanceService;
  /** The latest COMMITTED exam (13A authority) — the body a new revision is created from, never a stale render. */
  getLatestExam?: () => StructuredExam;
  onReveal?: (ids: string[]) => void;
  onPreview?: (exam: StructuredExam) => void;
};
const TRANSITION_OF: Partial<Record<GovernanceAction, TransitionAction>> = { "submit-review": "submit-review", "return-to-draft": "return-to-draft", approve: "approve", publish: "publish", "new-draft": "return-to-draft" };
const WORKFLOW_ACTIONS: readonly WorkflowAction[] = ["complete-review", "request-changes", "reject-approval", "reject-publication", "withdraw-review"];
const shortHash = (h: string) => (h ? h.slice(0, 8) : "");
const NO_CAPABILITIES: readonly GovernanceCapability[] = [];
const NO_ACTORS: readonly GovernanceActor[] = [];

export default function GovernancePanel({ open, onClose, exam, service, getLatestExam, onReveal, onPreview }: Props) {
  const [status, setStatus] = useState<GovernanceStatus | null>(null);
  const [revisions, setRevisions] = useState<RevisionMeta[]>([]);
  const [revCursor, setRevCursor] = useState<number | null>(null);
  const [events, setEvents] = useState<GovernanceEvent[]>([]);
  const [evCursor, setEvCursor] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [decCursor, setDecCursor] = useState<number | null>(null);
  const [lastNote, setLastNote] = useState<DecisionRecord | null>(null);
  const [directory, setDirectory] = useState<readonly GovernanceActor[]>(NO_ACTORS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewer, setViewer] = useState<RevisionDocument | null>(null);
  const [readinessFor, setReadinessFor] = useState<GovernanceManifestView | null>(null);
  const [assigningFor, setAssigningFor] = useState<GovernanceManifestView | null>(null);
  const [noteFor, setNoteFor] = useState<{ action: WorkflowAction | "approve"; manifest: GovernanceManifestView } | null>(null);
  const examId = exam.examId;
  const latest = useCallback(() => (getLatestExam ? getLatestExam() : exam), [getLatestExam, exam]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const loadHistory = useCallback(async (s: GovernanceStatus) => {
    if (!s.governed) { setRevisions([]); setEvents([]); setDecisions([]); setRevCursor(null); setEvCursor(null); setDecCursor(null); setLastNote(null); return; }
    const [r, e, d] = await Promise.all([service.listRevisions(examId, null), service.listEvents(examId, null), service.listDecisions ? service.listDecisions(examId, null) : Promise.resolve({ items: [] as DecisionRecord[], nextCursor: null })]);
    if (!alive.current) return;
    setRevisions(r.items); setRevCursor(r.nextCursor); setEvents(e.items); setEvCursor(e.nextCursor); setDecisions(d.items); setDecCursor(d.nextCursor);
    // the author must understand WHY an exam is back in draft: the latest decision's note, prominently
    const last = s.manifest?.lastDecision;
    if (last && s.manifest?.lifecycleState === "draft" && service.loadDecision) {
      const fromPage = d.items.find(x => x.decisionId === last.decisionId);
      try { const rec = fromPage ?? await service.loadDecision(examId, last.decisionId); if (alive.current) setLastNote(rec); } catch { if (alive.current) setLastNote(null); }
    } else setLastNote(null);
  }, [service, examId]);
  const refresh = useCallback(async () => {
    const s = await service.status(examId);
    if (!alive.current) return s;
    setStatus(s);
    if (s.workflowMode === "assigned" && service.directory) {
      try { const d = await service.directory(); if (alive.current) setDirectory(d.actors); } catch { /* names fall back to ids */ }
    }
    await loadHistory(s);
    return s;
  }, [service, examId, loadHistory]);
  // ONE status read when the panel opens (it is mounted only while open) — no polling; state is updated asynchronously
  // from the server response, never synchronously inside the effect.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try { await refresh(); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "تعذر تحميل حالة إدارة النشر."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, refresh]);

  const manifest = status?.manifest ?? null;
  const capabilities = status?.capabilities ?? NO_CAPABILITIES;
  const assigned = status?.workflowMode === "assigned";
  const ctx = useMemo<ActorContext | undefined>(() => (status?.actorId ? { actorId: status.actorId, capabilities, workflowMode: status.workflowMode ?? "single" } : undefined), [status, capabilities]);
  const actions = useMemo(() => (status ? availableGovernanceActions(manifest, capabilities, ctx) : []), [status, manifest, capabilities, ctx]);
  const workflow = manifest?.reviewWorkflow;
  const stage = workflowStage(manifest);
  const responsible = workflowResponsible(manifest);
  const name = (id?: string) => actorName(id, directory);

  async function apply(s: GovernanceStatus, message: string) {
    setStatus(s); setNotice(message); setError("");
    await loadHistory(s);
  }
  async function guard(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await run(); }
    catch (e) {
      if (e instanceof GovernanceRequestError && e.status === 409) {
        // The authority moved: show it, refresh, and NEVER retry against the newer state on our own.
        if (e.payload?.manifest) setStatus(prev => (prev ? { ...prev, governed: true, manifest: e.payload!.manifest! } : prev));
        setError(e.code === "WORKFLOW_ACTION_REQUIRED" || e.code === "REVIEW_NOT_COMPLETED" || e.code === "WORKFLOW_REQUIRED" ? e.message + " " + GOVERNANCE_CONFLICT_MESSAGE : GOVERNANCE_CONFLICT_MESSAGE);
        try { await refresh(); } catch { /* the conflict message stands */ }
      } else if (e instanceof GovernanceRequestError && e.status === 422) {
        const d = (e.payload?.details ?? {}) as { structuralErrors?: number; qualityBlockers?: number; policyBlockers?: number };
        setError("رفض الخادم إرسال الإصدار للمراجعة: " + e.message + (d.structuralErrors !== undefined ? " (أخطاء بنيوية: " + d.structuralErrors + "، حواجز الجودة: " + (d.qualityBlockers ?? 0) + "، مشكلات السياسة: " + (d.policyBlockers ?? 0) + ")" : ""));
      } else if (e instanceof GovernanceRequestError && e.status === 503) {
        setError("إعدادات الخادم غير صالحة حاليًا: " + e.message);
        try { await refresh(); } catch { /* the message stands */ }
      } else {
        setError(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء.");
      }
    } finally { if (alive.current) setBusy(false); }
  }
  const act = (action: GovernanceAction) => guard(async () => {
    if (action === "enable") { await apply(await service.enable(examId, latest(), newRequestId()), "✓ تم تفعيل إدارة النشر وإنشاء الإصدار الأول."); return; }
    if (!manifest) return;
    if (action === "create-revision") { await apply(await service.createRevision(examId, latest(), { expectedStateVersion: manifest.stateVersion, requestId: newRequestId() }), "✓ تم إنشاء إصدار من النسخة الحالية."); return; }
    if (action === "submit-review") { setReadinessFor(manifest); return; }
    if ((WORKFLOW_ACTIONS as readonly string[]).includes(action)) { setNoteFor({ action: action as WorkflowAction, manifest }); return; }
    if (action === "approve" && workflow && assigned) { setNoteFor({ action: "approve", manifest }); return; }
    const t = TRANSITION_OF[action];
    if (!t) return;
    await apply(await service.transition(examId, t, { expectedStateVersion: manifest.stateVersion, requestId: newRequestId() }), "✓ " + GOVERNANCE_ACTION_LABEL[action] + ": تم تنفيذ الإجراء على الخادم.");
  });
  const confirmSubmit = () => {
    const m = readinessFor; setReadinessFor(null);
    if (!m) return;
    if (assigned) { setAssigningFor(m); return; }                                     // 14B: choose the cycle's Reviewer / Approver / Publisher first
    void guard(async () => { await apply(await service.transition(examId, "submit-review", { expectedStateVersion: m.stateVersion, requestId: newRequestId(), revisionId: m.latestRevisionId }), "✓ أُرسل الإصدار " + m.latestRevisionNumber + " للمراجعة."); });
  };
  const confirmAssignments = (a: WorkflowAssignments) => {
    const m = assigningFor; setAssigningFor(null);
    if (!m) return;
    void guard(async () => { await apply(await service.transition(examId, "submit-review", { expectedStateVersion: m.stateVersion, requestId: newRequestId(), revisionId: m.latestRevisionId, assignments: a }), "✓ أُرسل الإصدار " + m.latestRevisionNumber + " للمراجعة إلى " + name(a.reviewerId) + "."); });
  };
  const confirmNote = (note: string) => {
    const n = noteFor; setNoteFor(null);
    if (!n) return;
    void guard(async () => {
      if (n.action === "approve") { await apply(await service.transition(examId, "approve", { expectedStateVersion: n.manifest.stateVersion, requestId: newRequestId(), note }), "✓ اعتماد: تم تنفيذ الإجراء على الخادم."); return; }
      if (!service.decide) throw new Error("إجراءات دورة المراجعة غير متاحة في هذا الإصدار.");
      await apply(await service.decide(examId, n.action, { expectedStateVersion: n.manifest.stateVersion, requestId: newRequestId(), note }), "✓ " + GOVERNANCE_ACTION_LABEL[n.action] + ": تم تسجيل القرار على الخادم.");
    });
  };
  const view = (rev: RevisionMeta) => guard(async () => { const doc = await service.loadRevision(examId, rev.revisionId); if (alive.current) setViewer(doc); });
  const moreRevisions = () => guard(async () => { if (revCursor == null) return; const p = await service.listRevisions(examId, revCursor); setRevisions(prev => [...prev, ...p.items]); setRevCursor(p.nextCursor); });
  const moreEvents = () => guard(async () => { if (evCursor == null) return; const p = await service.listEvents(examId, evCursor); setEvents(prev => [...prev, ...p.items]); setEvCursor(p.nextCursor); });
  const moreDecisions = () => guard(async () => { if (decCursor == null || !service.listDecisions) return; const p = await service.listDecisions(examId, decCursor); setDecisions(prev => [...prev, ...p.items]); setDecCursor(p.nextCursor); });
  const localDecision = useMemo(() => (readinessFor ? evaluateExamFinalization(latest()) : null), [readinessFor, latest]);

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="إدارة النشر والإصدارات" className="sb-gov-dialog">
      <div className="sb-gov">
        <p className="sb-hint">حالة النشر وسجل الإصدارات يملكها الخادم: كل انتقال يُتحقق منه على الخادم مع رقم حالة معروف، وكل إصدار غير قابل للتغيير. «الاعتماد النهائي» في المبنى يعني جاهزية التأليف؛ «النشر» هنا يعني نشرًا محكومًا من الخادم.</p>
        {error && <div className="sb-banner sb-banner-error" role="alert">{error}</div>}
        {notice && !error && <div className="sb-banner sb-banner-ok" role="status">{notice}</div>}
        {status?.identityConfigurationError && <div className="sb-banner sb-banner-error" role="alert" data-testid="gov-identity-error">وضع المراجعة المعيَّنة مفعَّل لكن دليل هويات المعلمين على الخادم غير صالح؛ لا يمكن تنفيذ أي إجراء حتى يصحّحه المسؤول ({status.identityConfigurationError}).</div>}
        {loading && !status && <p className="sb-hint" role="status">جارٍ تحميل حالة إدارة النشر…</p>}
        {status && !status.governed && (
          <section className="sb-gov-card" aria-labelledby="sb-gov-legacy">
            <h3 id="sb-gov-legacy" className="sb-bp-h">امتحان محفوظ تقليدي (خارج الحوكمة)</h3>
            <p className="sb-hint">هذا الامتحان غير مسجّل في إدارة النشر؛ يعمل كامتحان محفوظ تقليدي (لا سجل إصدارات ولا حالة نشر على الخادم). لا يُستنتج أي اعتماد أو نشر سابق من حالة «معتمد نهائيًا» القديمة. التفعيل يُنشئ الإصدار الأول من النسخة الحالية.</p>
            {actions.includes("enable") && <button type="button" className="sb-btn sb-btn-primary" onClick={() => void act("enable")} disabled={busy}>{GOVERNANCE_ACTION_LABEL.enable}</button>}
          </section>
        )}
        {status && manifest && (
          <>
            <section className="sb-gov-card sb-gov-status" aria-labelledby="sb-gov-status-h">
              <h3 id="sb-gov-status-h" className="sb-bp-h">الحالة الحالية</h3>
              <dl className="sb-gov-facts">
                <div><dt>حالة النشر</dt><dd><span className={"sb-gov-state is-" + manifest.lifecycleState} data-testid="gov-state">{LIFECYCLE_LABEL[manifest.lifecycleState]}</span></dd></div>
                <div><dt>الإصدار الحالي</dt><dd data-testid="gov-revision">الإصدار {manifest.latestRevisionNumber} <code>{shortId(manifest.latestRevisionId)}</code></dd></div>
                <div><dt>النسخة المنشورة</dt><dd data-testid="gov-published">{manifest.publishedRevisionId ? <>الإصدار {manifest.publishedRevisionNumber ?? "—"} <code>{shortId(manifest.publishedRevisionId)}</code>{manifest.publishedAt ? " · " + formatGovernanceTime(manifest.publishedAt) : ""}{manifest.publishedBy ? " · " + name(manifest.publishedBy) : ""}</> : "لا توجد نسخة منشورة"}</dd></div>
                <div><dt>آخر انتقال</dt><dd data-testid="gov-last-transition">{manifest.lastTransition ? eventTypeLabel(manifest.lastTransition.type) + " · " + name(manifest.lastTransition.by) + " · " + formatGovernanceTime(manifest.lastTransition.at) : "—"}</dd></div>
                <div><dt>صلاحياتك</dt><dd data-testid="gov-capabilities">{capabilities.length ? capabilities.map(c => CAPABILITY_LABEL[c]).join("، ") : "لا صلاحيات حوكمة"}{status.capabilitySource ? <span className="sb-hint"> ({status.capabilitySource}{assigned ? " · مراجعة معيَّنة" : ""})</span> : null}</dd></div>
                <div><dt>رقم الحالة</dt><dd>{manifest.stateVersion}</dd></div>
              </dl>
              <div className="sb-gov-actions" role="group" aria-label="إجراءات النشر">
                {actions.map(a => <button key={a} type="button" className={"sb-btn" + (a === "publish" || a === "submit-review" || a === "complete-review" || a === "approve" ? " sb-btn-primary" : a === "request-changes" || a === "reject-approval" || a === "reject-publication" ? " sb-btn-danger" : "")} onClick={() => void act(a)} disabled={busy}>{GOVERNANCE_ACTION_LABEL[a]}</button>)}
                <button type="button" className="sb-btn sb-btn-sm" onClick={() => void guard(async () => { await refresh(); })} disabled={busy}>↻ تحديث الحالة</button>
              </div>
              {manifest.lifecycleState !== "draft" && <p className="sb-hint" role="note">الإصدار {manifest.lifecycleState === "published" ? manifest.publishedRevisionNumber : manifest.lifecycleState === "approved" ? manifest.approvedRevisionNumber : manifest.reviewRevisionNumber} مجمّد ولا يمكن تعديله. لتغيير المحتوى: {manifest.lifecycleState === "published" ? "أنشئ نسخة تحرير جديدة؛ تبقى النسخة المنشورة كما هي للواجبات القائمة." : workflow ? "تعود دورة المراجعة بالامتحان إلى المسودة (سحب / طلب تعديلات / رفض) ثم أنشئ إصدارًا جديدًا؛ أي تعديل يستلزم دورة مراجعة جديدة." : "أعِد الامتحان إلى المسودة ثم أنشئ إصدارًا جديدًا؛ أي تعديل يستلزم دورة مراجعة جديدة."}</p>}
            </section>
            {lastNote && manifest.lifecycleState === "draft" && (
              <section className="sb-gov-card" aria-labelledby="sb-gov-last-decision-h" data-testid="gov-last-decision">
                <h3 id="sb-gov-last-decision-h" className="sb-bp-h">لماذا عاد الامتحان إلى المسودة؟</h3>
                <div className="gov-decision-note" data-decision={lastNote.decision}>
                  <strong>{DECISION_LABEL[lastNote.decision]} — {DECISION_STAGE_LABEL[lastNote.stage]} · {name(lastNote.actorId)} · {formatGovernanceTime(lastNote.occurredAt)} · الإصدار {lastNote.revisionNumber}</strong>
                  {lastNote.note ? <pre data-testid="gov-last-decision-note">{lastNote.note}</pre> : <span className="sb-hint">بدون ملاحظة.</span>}
                </div>
              </section>
            )}
            {workflow && (
              <section className="sb-gov-card" aria-labelledby="sb-gov-workflow-h" data-testid="gov-workflow">
                <h3 id="sb-gov-workflow-h" className="sb-bp-h">دورة المراجعة المعيَّنة</h3>
                <p className="sb-hint">الإصدار {workflow.revisionNumber} <code>{shortId(workflow.revisionId)}</code> · أُرسل {formatGovernanceTime(workflow.submittedAt)} · حالة المراجعة: <strong data-testid="gov-review-status">{workflow.reviewStatus === "completed" ? "مكتملة" + (workflow.reviewedAt ? " · " + formatGovernanceTime(workflow.reviewedAt) : "") : "قيد الانتظار"}</strong>{stage && responsible ? <> · المسؤول الآن: <strong data-testid="gov-responsible">{name(workflow[responsible])}</strong></> : manifest.lifecycleState === "published" ? " · اكتملت الدورة بالنشر" : null}</p>
                <ul className="gov-workflow" aria-label="المشاركون في دورة المراجعة">
                  {(["authorId", "reviewerId", "approverId", "publisherId"] as const).map(k => (
                    <li key={k} className={responsible === k ? "is-current" : ""} aria-current={responsible === k ? "step" : undefined} data-testid={"gov-participant-" + k}>
                      <span className="gov-role">{PARTICIPANT_LABEL[k]}{responsible === k ? " — المرحلة الحالية" : ""}</span>
                      <span className="gov-person">{name(workflow[k])}</span>
                      <span className="gov-when">{k === "authorId" ? formatGovernanceTime(workflow.submittedAt) : k === "reviewerId" ? (workflow.reviewedAt ? "أتمّ المراجعة " + formatGovernanceTime(workflow.reviewedAt) : "لم تُكتمل المراجعة بعد") : k === "approverId" ? (workflow.approvedAt ? "اعتمد " + formatGovernanceTime(workflow.approvedAt) : "—") : (workflow.publishedAt ? "نشر " + formatGovernanceTime(workflow.publishedAt) : "—")}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="sb-gov-card" aria-labelledby="sb-gov-revisions-h">
              <h3 id="sb-gov-revisions-h" className="sb-bp-h">سجل الإصدارات</h3>
              <table className="sb-gov-table">
                <thead><tr><th>#</th><th>المعرّف</th><th>أنشأه</th><th>التاريخ</th><th>البصمة</th><th>الدور</th><th>الأسئلة / العلامات</th><th></th></tr></thead>
                <tbody>
                  {revisions.map(r => {
                    const roles = r.roles && r.roles.length ? r.roles : revisionRoles(manifest, r.revisionId);
                    return (
                      <tr key={r.revisionId} data-revision-id={r.revisionId}>
                        <td>{r.revisionNumber}</td><td><code>{shortId(r.revisionId)}</code></td><td>{name(r.createdBy)}</td><td>{formatGovernanceTime(r.createdAt)}</td>
                        <td><code>{shortHash(r.contentHash)}</code></td><td>{roles.length ? roles.map(x => ROLE_LABEL[x]).join("، ") : "—"}</td><td>{r.questionCount} / {r.totalMarks}</td>
                        <td><button type="button" className="sb-btn sb-btn-sm" onClick={() => void view(r)} disabled={busy}>عرض</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {revisions.length === 0 && <p className="sb-hint">لا إصدارات بعد.</p>}
              {revCursor != null && <button type="button" className="sb-btn sb-btn-sm" onClick={() => void moreRevisions()} disabled={busy}>إصدارات أقدم</button>}
            </section>
            {(decisions.length > 0 || decCursor != null) && (
              <section className="sb-gov-card" aria-labelledby="sb-gov-decisions-h" data-testid="gov-decisions">
                <h3 id="sb-gov-decisions-h" className="sb-bp-h">سجل قرارات المراجعة</h3>
                <ul className="gov-decisions" aria-label="سجل قرارات المراجعة">
                  {decisions.map(d => (
                    <li key={d.decisionId} data-decision-id={d.decisionId}>
                      <div className="gov-decision-head"><strong>{DECISION_LABEL[d.decision]}</strong><span>{DECISION_STAGE_LABEL[d.stage]}</span><span>{name(d.actorId)}</span><span>{formatGovernanceTime(d.occurredAt)}</span><span>الإصدار {d.revisionNumber}</span></div>
                      {d.note ? <pre className="gov-note-text">{d.note}</pre> : <span className="sb-hint">بدون ملاحظة.</span>}
                    </li>
                  ))}
                </ul>
                {decCursor != null && <button type="button" className="sb-btn sb-btn-sm" onClick={() => void moreDecisions()} disabled={busy}>قرارات أقدم</button>}
              </section>
            )}
            <section className="sb-gov-card" aria-labelledby="sb-gov-events-h">
              <h3 id="sb-gov-events-h" className="sb-bp-h">سجل الحوكمة</h3>
              <ul className="sb-gov-events" aria-label="سجل الحوكمة">
                {events.map(ev => <li key={ev.eventId}><strong>{eventTypeLabel(ev.type)}</strong> · {name(ev.actorId)} · {formatGovernanceTime(ev.occurredAt)}{ev.revisionId ? <> · <code>{shortId(ev.revisionId)}</code></> : null}{ev.fromState && ev.toState && ev.fromState !== ev.toState ? " · " + LIFECYCLE_LABEL[ev.fromState as keyof typeof LIFECYCLE_LABEL] + " → " + LIFECYCLE_LABEL[ev.toState as keyof typeof LIFECYCLE_LABEL] : null}</li>)}
              </ul>
              {events.length === 0 && <p className="sb-hint">لا أحداث بعد.</p>}
              {evCursor != null && <button type="button" className="sb-btn sb-btn-sm" onClick={() => void moreEvents()} disabled={busy}>أحداث أقدم</button>}
            </section>
          </>
        )}
      </div>
      {viewer && <RevisionViewer doc={viewer} manifest={manifest} onClose={() => setViewer(null)} onPreview={onPreview} directory={directory} />}
      {readinessFor && localDecision && (
        <FinalizationPanel open onClose={() => setReadinessFor(null)} decision={localDecision} onReveal={ids => { setReadinessFor(null); onReveal?.(ids); }}
          confirm={{ label: "متابعة " + GOVERNANCE_ACTION_LABEL["submit-review"], onConfirm: confirmSubmit, disabled: !localDecision.canFinalize || busy, hint: "يُعاد التحقق من الجاهزية على الخادم للإصدار " + readinessFor.latestRevisionNumber + " بالضبط؛ قرار الخادم هو الحاسم." + (assigned ? " بعد ذلك تختار المراجع والمعتمد والناشر." : "") }} />
      )}
      {assigningFor && status?.actorId && <AssignmentDialog authorId={status.actorId} directory={directory} revisionNumber={assigningFor.latestRevisionNumber} busy={busy} onCancel={() => setAssigningFor(null)} onConfirm={confirmAssignments} />}
      {noteFor && <DecisionNoteDialog action={noteFor.action} busy={busy} onCancel={() => setNoteFor(null)} onConfirm={confirmNote} context={"الإصدار " + (noteFor.manifest.reviewWorkflow?.revisionNumber ?? noteFor.manifest.latestRevisionNumber) + " · رقم الحالة " + noteFor.manifest.stateVersion} />}
    </Dialog>
  );
}
