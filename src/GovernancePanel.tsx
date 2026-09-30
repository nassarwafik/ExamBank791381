import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dialog from "./ui/Dialog";
import FinalizationPanel from "./FinalizationPanel";
import { evaluateExamFinalization } from "./examFinalization";
import type { StructuredExam } from "./examTypes";
import {
  availableGovernanceActions, revisionRoles, shortId, newRequestId, formatGovernanceTime, eventTypeLabel,
  LIFECYCLE_LABEL, GOVERNANCE_ACTION_LABEL, CAPABILITY_LABEL, ROLE_LABEL, GOVERNANCE_CONFLICT_MESSAGE, GovernanceRequestError,
  type GovernanceService, type GovernanceStatus, type GovernanceManifestView, type RevisionMeta, type RevisionDocument, type GovernanceEvent, type GovernanceAction, type TransitionAction, type GovernanceCapability
} from "./examGovernance";

// Phase 14A — إدارة النشر والإصدارات: the Builder's window onto the SERVER-owned publishing authority.
//
// Nothing here decides anything: the lifecycle state, the revision pointers and the offered actions come from the server
// status (never from exam.status); every mutation names the authority version it saw (expectedStateVersion) and a fresh
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
const shortHash = (h: string) => (h ? h.slice(0, 8) : "");
const NO_CAPABILITIES: readonly GovernanceCapability[] = [];

export default function GovernancePanel({ open, onClose, exam, service, getLatestExam, onReveal, onPreview }: Props) {
  const [status, setStatus] = useState<GovernanceStatus | null>(null);
  const [revisions, setRevisions] = useState<RevisionMeta[]>([]);
  const [revCursor, setRevCursor] = useState<number | null>(null);
  const [events, setEvents] = useState<GovernanceEvent[]>([]);
  const [evCursor, setEvCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewer, setViewer] = useState<RevisionDocument | null>(null);
  const [readinessFor, setReadinessFor] = useState<GovernanceManifestView | null>(null);
  const examId = exam.examId;
  const latest = useCallback(() => (getLatestExam ? getLatestExam() : exam), [getLatestExam, exam]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const loadHistory = useCallback(async (governed: boolean) => {
    if (!governed) { setRevisions([]); setEvents([]); setRevCursor(null); setEvCursor(null); return; }
    const [r, e] = await Promise.all([service.listRevisions(examId, null), service.listEvents(examId, null)]);
    if (!alive.current) return;
    setRevisions(r.items); setRevCursor(r.nextCursor); setEvents(e.items); setEvCursor(e.nextCursor);
  }, [service, examId]);
  const refresh = useCallback(async () => {
    const s = await service.status(examId);
    if (!alive.current) return s;
    setStatus(s);
    await loadHistory(s.governed);
    return s;
  }, [service, examId, loadHistory]);
  // ONE status read when the panel opens (it is mounted only while open) — no polling; state is updated asynchronously
  // from the server response, never synchronously inside the effect.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    refresh().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "تعذر تحميل حالة إدارة النشر."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, refresh]);

  const manifest = status?.manifest ?? null;
  const capabilities = status?.capabilities ?? NO_CAPABILITIES;
  const actions = useMemo(() => (status ? availableGovernanceActions(manifest, capabilities) : []), [status, manifest, capabilities]);

  async function apply(status: GovernanceStatus, message: string) {
    setStatus(status); setNotice(message); setError("");
    await loadHistory(status.governed);
  }
  async function guard(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await run(); }
    catch (e) {
      if (e instanceof GovernanceRequestError && e.status === 409) {
        // The authority moved: show it, refresh, and NEVER retry against the newer state on our own.
        if (e.payload?.manifest) setStatus(prev => (prev ? { ...prev, governed: true, manifest: e.payload!.manifest! } : prev));
        setError(GOVERNANCE_CONFLICT_MESSAGE);
        try { await refresh(); } catch { /* the conflict message stands */ }
      } else if (e instanceof GovernanceRequestError && e.status === 422) {
        const d = (e.payload?.details ?? {}) as { structuralErrors?: number; qualityBlockers?: number; policyBlockers?: number };
        setError("رفض الخادم إرسال الإصدار للمراجعة: " + e.message + (d.structuralErrors !== undefined ? " (أخطاء بنيوية: " + d.structuralErrors + "، حواجز الجودة: " + (d.qualityBlockers ?? 0) + "، مشكلات السياسة: " + (d.policyBlockers ?? 0) + ")" : ""));
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
    const t = TRANSITION_OF[action];
    if (!t) return;
    await apply(await service.transition(examId, t, { expectedStateVersion: manifest.stateVersion, requestId: newRequestId() }), "✓ " + GOVERNANCE_ACTION_LABEL[action] + ": تم تنفيذ الإجراء على الخادم.");
  });
  const confirmSubmit = () => {
    const m = readinessFor; setReadinessFor(null);
    if (!m) return;
    void guard(async () => { await apply(await service.transition(examId, "submit-review", { expectedStateVersion: m.stateVersion, requestId: newRequestId(), revisionId: m.latestRevisionId }), "✓ أُرسل الإصدار " + m.latestRevisionNumber + " للمراجعة."); });
  };
  const view = (rev: RevisionMeta) => guard(async () => { const doc = await service.loadRevision(examId, rev.revisionId); if (alive.current) setViewer(doc); });
  const moreRevisions = () => guard(async () => { if (revCursor == null) return; const p = await service.listRevisions(examId, revCursor); setRevisions(prev => [...prev, ...p.items]); setRevCursor(p.nextCursor); });
  const moreEvents = () => guard(async () => { if (evCursor == null) return; const p = await service.listEvents(examId, evCursor); setEvents(prev => [...prev, ...p.items]); setEvCursor(p.nextCursor); });
  const localDecision = useMemo(() => (readinessFor ? evaluateExamFinalization(latest()) : null), [readinessFor, latest]);

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="إدارة النشر والإصدارات" className="sb-gov-dialog">
      <div className="sb-gov">
        <p className="sb-hint">حالة النشر وسجل الإصدارات يملكها الخادم: كل انتقال يُتحقق منه على الخادم مع رقم حالة معروف، وكل إصدار غير قابل للتغيير. «الاعتماد النهائي» في المبنى يعني جاهزية التأليف؛ «النشر» هنا يعني نشرًا محكومًا من الخادم.</p>
        {error && <div className="sb-banner sb-banner-error" role="alert">{error}</div>}
        {notice && !error && <div className="sb-banner sb-banner-ok" role="status">{notice}</div>}
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
                <div><dt>النسخة المنشورة</dt><dd data-testid="gov-published">{manifest.publishedRevisionId ? <>الإصدار {manifest.publishedRevisionNumber ?? "—"} <code>{shortId(manifest.publishedRevisionId)}</code>{manifest.publishedAt ? " · " + formatGovernanceTime(manifest.publishedAt) : ""}{manifest.publishedBy ? " · " + manifest.publishedBy : ""}</> : "لا توجد نسخة منشورة"}</dd></div>
                <div><dt>آخر انتقال</dt><dd data-testid="gov-last-transition">{manifest.lastTransition ? eventTypeLabel(manifest.lastTransition.type) + " · " + manifest.lastTransition.by + " · " + formatGovernanceTime(manifest.lastTransition.at) : "—"}</dd></div>
                <div><dt>صلاحياتك</dt><dd data-testid="gov-capabilities">{capabilities.length ? capabilities.map(c => CAPABILITY_LABEL[c]).join("، ") : "لا صلاحيات حوكمة"}{status.capabilitySource ? <span className="sb-hint"> ({status.capabilitySource})</span> : null}</dd></div>
                <div><dt>رقم الحالة</dt><dd>{manifest.stateVersion}</dd></div>
              </dl>
              <div className="sb-gov-actions" role="group" aria-label="إجراءات النشر">
                {actions.map(a => <button key={a} type="button" className={"sb-btn" + (a === "publish" || a === "submit-review" ? " sb-btn-primary" : "")} onClick={() => void act(a)} disabled={busy}>{GOVERNANCE_ACTION_LABEL[a]}</button>)}
                <button type="button" className="sb-btn sb-btn-sm" onClick={() => void guard(async () => { await refresh(); })} disabled={busy}>↻ تحديث الحالة</button>
              </div>
              {manifest.lifecycleState !== "draft" && <p className="sb-hint" role="note">الإصدار {manifest.lifecycleState === "published" ? manifest.publishedRevisionNumber : manifest.lifecycleState === "approved" ? manifest.approvedRevisionNumber : manifest.reviewRevisionNumber} مجمّد ولا يمكن تعديله. لتغيير المحتوى: {manifest.lifecycleState === "published" ? "أنشئ نسخة تحرير جديدة؛ تبقى النسخة المنشورة كما هي للواجبات القائمة." : "أعِد الامتحان إلى المسودة ثم أنشئ إصدارًا جديدًا؛ أي تعديل يستلزم دورة مراجعة جديدة."}</p>}
            </section>
            <section className="sb-gov-card" aria-labelledby="sb-gov-revisions-h">
              <h3 id="sb-gov-revisions-h" className="sb-bp-h">سجل الإصدارات</h3>
              <table className="sb-gov-table">
                <thead><tr><th>#</th><th>المعرّف</th><th>أنشأه</th><th>التاريخ</th><th>البصمة</th><th>الدور</th><th>الأسئلة / العلامات</th><th></th></tr></thead>
                <tbody>
                  {revisions.map(r => {
                    const roles = r.roles && r.roles.length ? r.roles : revisionRoles(manifest, r.revisionId);
                    return (
                      <tr key={r.revisionId} data-revision-id={r.revisionId}>
                        <td>{r.revisionNumber}</td><td><code>{shortId(r.revisionId)}</code></td><td>{r.createdBy}</td><td>{formatGovernanceTime(r.createdAt)}</td>
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
            <section className="sb-gov-card" aria-labelledby="sb-gov-events-h">
              <h3 id="sb-gov-events-h" className="sb-bp-h">سجل الحوكمة</h3>
              <ul className="sb-gov-events" aria-label="سجل الحوكمة">
                {events.map(ev => <li key={ev.eventId}><strong>{eventTypeLabel(ev.type)}</strong> · {ev.actorId} · {formatGovernanceTime(ev.occurredAt)}{ev.revisionId ? <> · <code>{shortId(ev.revisionId)}</code></> : null}{ev.fromState && ev.toState ? " · " + LIFECYCLE_LABEL[ev.fromState as keyof typeof LIFECYCLE_LABEL] + " → " + LIFECYCLE_LABEL[ev.toState as keyof typeof LIFECYCLE_LABEL] : null}</li>)}
              </ul>
              {events.length === 0 && <p className="sb-hint">لا أحداث بعد.</p>}
              {evCursor != null && <button type="button" className="sb-btn sb-btn-sm" onClick={() => void moreEvents()} disabled={busy}>أحداث أقدم</button>}
            </section>
          </>
        )}
      </div>
      {viewer && <RevisionViewer doc={viewer} manifest={manifest} onClose={() => setViewer(null)} onPreview={onPreview} />}
      {readinessFor && localDecision && (
        <FinalizationPanel open onClose={() => setReadinessFor(null)} decision={localDecision} onReveal={ids => { setReadinessFor(null); onReveal?.(ids); }}
          confirm={{ label: "متابعة " + GOVERNANCE_ACTION_LABEL["submit-review"], onConfirm: confirmSubmit, disabled: !localDecision.canFinalize || busy, hint: "يُعاد التحقق من الجاهزية على الخادم للإصدار " + readinessFor.latestRevisionNumber + " بالضبط؛ قرار الخادم هو الحاسم." }} />
      )}
    </Dialog>
  );
}

// Read-only view of an immutable revision: identity, metadata, audit context and a content outline (no editing controls,
// no bulk actions, no bank insertion). Editing always means creating / opening a draft derived from a revision.
function RevisionViewer({ doc, manifest, onClose, onPreview }: { doc: RevisionDocument; manifest: GovernanceManifestView | null; onClose: () => void; onPreview?: (exam: StructuredExam) => void }) {
  const roles = manifest ? revisionRoles(manifest, doc.revisionId) : [];
  const sections = Array.isArray(doc.exam?.sections) ? doc.exam.sections : [];
  return (
    <Dialog open onClose={onClose} size="lg" title={"الإصدار " + doc.revisionNumber + " — " + shortId(doc.revisionId)} className="sb-gov-viewer" readOnly
      footer={onPreview ? <button type="button" className="sb-btn" onClick={() => onPreview(doc.exam)}>معاينة كاملة</button> : undefined}>
      <div className="sb-gov-viewer-body">
        <p className="sb-hint" role="note">إصدار غير قابل للتغيير — للقراءة فقط. لا تعديل للأسئلة أو المخطط أو السياسات هنا؛ التعديل يكون على مسودة مشتقة.</p>
        <dl className="sb-gov-facts">
          <div><dt>الامتحان</dt><dd>{doc.exam?.title || "—"}</dd></div>
          <div><dt>أنشأه</dt><dd>{doc.createdBy} · {formatGovernanceTime(doc.createdAt)}</dd></div>
          <div><dt>البصمة (SHA-256)</dt><dd><code>{shortHash(doc.contentHash)}</code></dd></div>
          <div><dt>الدور</dt><dd>{roles.length ? roles.map(x => ROLE_LABEL[x]).join("، ") : "إصدار سابق"}</dd></div>
          {doc.sourceRevisionId && <div><dt>مشتق من</dt><dd><code>{shortId(doc.sourceRevisionId)}</code></dd></div>}
        </dl>
        <ol className="sb-gov-outline" aria-label="محتوى الإصدار">
          {sections.map(s => (
            <li key={s.id}><strong>{s.title || "قسم"}</strong>
              <ol>{(s.questions || []).map(q => <li key={q.examQuestionId}>{q.text || "—"} <span className="sb-hint">({q.marks} علامة)</span></li>)}</ol>
            </li>
          ))}
        </ol>
      </div>
    </Dialog>
  );
}
