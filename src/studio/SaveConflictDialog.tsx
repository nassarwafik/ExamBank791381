import Dialog from "../ui/Dialog";
import { useConfirm } from "../ui/useConfirm";
import type { SaveConflict } from "../structuredSavePolicy";

// Phase 21F.0 — the server refused a conditional save (409 EXAM_CONFLICT): a newer version of this exam was saved elsewhere (another
// tab, device or teacher session), or an exam with this id already exists. Nothing was overwritten. The teacher chooses, and every
// choice that discards something is confirmed first — never a silent loss on either side.

type Props = {
  conflict: SaveConflict | null;
  busy?: boolean;
  onReloadServer: () => void;
  onSaveAsCopy: () => void;
  onReplaceServer: () => void;
  onClose: () => void;
};

const formatTime = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : "";
};

export default function SaveConflictDialog({ conflict, busy = false, onReloadServer, onSaveAsCopy, onReplaceServer, onClose }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const serverExists = !!conflict?.serverEtag;
  const when = formatTime(conflict?.serverSavedAt ?? null);
  const reload = async () => {
    const ok = await confirm({
      title: "فتح نسخة الخادم",
      message: "ستُستبدل التغييرات غير المحفوظة في المحرر بالنسخة المحفوظة على الخادم، ولن يمكن استرجاعها.",
      confirmLabel: "فتح نسخة الخادم",
      cancelLabel: "رجوع",
      tone: "danger"
    });
    if (ok) onReloadServer();
  };
  const replace = async () => {
    const ok = await confirm({
      title: "استبدال نسخة الخادم",
      message: serverExists
        ? "ستحلّ نسختك محل النسخة الأحدث على الخادم، وستضيع التعديلات التي حُفظت هناك."
        : "ستُحفظ نسختك على الخادم من جديد.",
      confirmLabel: "استبدال بنسختي",
      cancelLabel: "رجوع",
      tone: "danger"
    });
    if (ok) onReplaceServer();
  };
  return (
    <>
      <Dialog
        open={conflict !== null}
        size="md"
        title="تعارض في الحفظ"
        onClose={onClose}
        className="st-conflict-dialog"
        footer={
          <>
            <button type="button" className="eb-button" onClick={onClose} disabled={busy}>إلغاء</button>
            {serverExists && <button type="button" className="eb-button" onClick={() => { void reload(); }} disabled={busy}>فتح نسخة الخادم</button>}
            <button type="button" className="eb-button is-danger" onClick={() => { void replace(); }} disabled={busy}>استبدال بنسختي</button>
            <button type="button" className="eb-button is-primary" onClick={onSaveAsCopy} disabled={busy}>حفظ نسختي كامتحان جديد</button>
          </>
        }
      >
        <div className="st-conflict-body" data-testid="save-conflict">
          <p>
            {serverExists
              ? "حُفظت نسخة أحدث من هذا الامتحان من مكان آخر (تبويب أو جهاز آخر)" + (when ? " في " + when : "") + ". لم يُحفظ شيء من تغييراتك بعد، ولم يُستبدل شيء على الخادم."
              : "لم تعد نسخة هذا الامتحان التي فتحتها موجودة على الخادم كما كانت. لم يُحفظ شيء بعد."}
          </p>
          <p className="st-conflict-hint">الخيار الآمن هو حفظ نسختك كامتحان جديد، ثم المقارنة بين النسختين.</p>
        </div>
      </Dialog>
      {confirmDialog}
    </>
  );
}
