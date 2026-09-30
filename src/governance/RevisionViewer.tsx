import Dialog from "../ui/Dialog";
import type { StructuredExam } from "../examTypes";
import { revisionRoles, shortId, formatGovernanceTime, ROLE_LABEL, type GovernanceManifestView, type RevisionDocument, type GovernanceActor } from "../examGovernance";
import { actorName } from "../examGovernance";
import type { ReactNode } from "react";

// Phase 14A / 14B — the ONE read-only view of an immutable revision, shared by the Builder's governance panel and the Review
// Inbox task view. Identity, metadata, audit context and a content outline: no editing controls, no bulk actions, no bank
// insertion, no path back to the live mutable exam state. The document it renders is ALWAYS the stored revision loaded from
// the server (never the author's working copy); editing always means creating / opening a draft derived from a revision.
const shortHash = (h: string) => (h ? h.slice(0, 8) : "");

export type RevisionViewerProps = {
  doc: RevisionDocument;
  manifest: GovernanceManifestView | null;
  onClose: () => void;
  onPreview?: (exam: StructuredExam) => void;
  /** 14B — optional server directory for display names; ids are shown when absent. */
  directory?: readonly GovernanceActor[];
  /** 14B — extra read-only context (workflow participants) and decision controls rendered by the task view. */
  aside?: ReactNode;
  footer?: ReactNode;
  title?: string;
};

export default function RevisionViewer({ doc, manifest, onClose, onPreview, directory, aside, footer, title }: RevisionViewerProps) {
  const roles = manifest ? revisionRoles(manifest, doc.revisionId) : [];
  const sections = Array.isArray(doc.exam?.sections) ? doc.exam.sections : [];
  const footerNode = footer ?? (onPreview ? <button type="button" className="sb-btn" onClick={() => onPreview(doc.exam)}>معاينة كاملة</button> : undefined);
  return (
    <Dialog open onClose={onClose} size="lg" title={title ?? ("الإصدار " + doc.revisionNumber + " — " + shortId(doc.revisionId))} className="sb-gov-viewer" readOnly footer={footerNode}>
      <div className="sb-gov-viewer-body" data-testid="revision-viewer" data-revision-id={doc.revisionId}>
        <p className="sb-hint" role="note">إصدار غير قابل للتغيير — للقراءة فقط. لا تعديل للأسئلة أو المخطط أو السياسات هنا؛ التعديل يكون على مسودة مشتقة.</p>
        <dl className="sb-gov-facts">
          <div><dt>الامتحان</dt><dd data-testid="revision-title">{doc.exam?.title || "—"}</dd></div>
          <div><dt>أنشأه</dt><dd>{actorName(doc.createdBy, directory)} · {formatGovernanceTime(doc.createdAt)}</dd></div>
          <div><dt>البصمة (SHA-256)</dt><dd><code>{shortHash(doc.contentHash)}</code></dd></div>
          <div><dt>الدور</dt><dd>{roles.length ? roles.map(x => ROLE_LABEL[x]).join("، ") : "إصدار سابق"}</dd></div>
          {doc.sourceRevisionId && <div><dt>مشتق من</dt><dd><code>{shortId(doc.sourceRevisionId)}</code></dd></div>}
        </dl>
        {aside}
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
