import { useId, useRef } from "react";
import Dialog from "./Dialog";

/**
 * ConfirmDialog — accessible replacement for `window.confirm`. The message text is rendered verbatim
 * (line breaks preserved), destructive confirms are visibly differentiated and start with focus on
 * "إلغاء" so a stray Enter never destroys data.
 *
 * `useConfirm()` (src/ui/useConfirm.tsx) exposes the awaited adapter: `if (!(await confirm(message))) return;` keeps the exact
 * gating order of the old synchronous call. A pending confirmation resolves `false` when the owning
 * component unmounts, when `cancelPending()` is called (class change) or when a new confirm replaces it,
 * so a caller is never left awaiting forever.
 */
export type ConfirmOptions = {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

export function ConfirmDialog({ open, options, onResolve }: { open: boolean; options: ConfirmOptions; onResolve: (ok: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const reactId = useId();
  const messageId = "eb-confirm-" + reactId.replace(/[^a-zA-Z0-9_-]/g, "") + "-message";
  const danger = options.tone === "danger";
  return (
    <Dialog
      open={open}
      size="sm"
      tone={danger ? "danger" : "default"}
      title={options.title || (danger ? "تأكيد إجراء لا يمكن التراجع عنه" : "تأكيد")}
      onClose={() => onResolve(false)}
      hideClose
      initialFocusRef={danger ? cancelRef : confirmRef}
      describedBy={messageId}
      className="eb-confirm"
      footer={
        <>
          <button ref={cancelRef} type="button" className="eb-button" onClick={() => onResolve(false)}>{options.cancelLabel || "إلغاء"}</button>
          <button ref={confirmRef} type="button" className={"eb-button " + (danger ? "is-danger" : "is-primary")} onClick={() => onResolve(true)}>{options.confirmLabel || (danger ? "تأكيد الحذف" : "تأكيد")}</button>
        </>
      }
    >
      <p id={messageId} className="eb-confirm-message">{options.message}</p>
    </Dialog>
  );
}
