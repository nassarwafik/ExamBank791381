import { useId, useRef, useState } from "react";
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
  /** Which button holds focus when the dialog opens. Defaults to «إلغاء» for a danger confirmation and to the confirm button
   *  otherwise; 21E.1 slice 2 — a confirmation that REPLACES teacher-written content opts into "cancel" (the safe choice). */
  initialFocus?: "confirm" | "cancel";
  /** Phase S.3 — a typed confirmation for an irreversible action on many records: the confirm button stays disabled until the
   *  field holds `expected` (Arabic-Indic and Western digits are equivalent, surrounding spaces ignored). */
  typeToConfirm?: { label: string; expected: string };
};

const typedForm = (value: string) => value.trim().replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));

export function ConfirmDialog({ open, options, onResolve }: { open: boolean; options: ConfirmOptions; onResolve: (ok: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const reactId = useId();
  const messageId = "eb-confirm-" + reactId.replace(/[^a-zA-Z0-9_-]/g, "") + "-message";
  const danger = options.tone === "danger";
  // The typed text belongs to ONE confirmation: a newer `options` object starts empty again (no effect, no stale match).
  const [typed, setTyped] = useState<{ owner: ConfirmOptions | null; value: string }>({ owner: null, value: "" });
  const gate = options.typeToConfirm;
  const typedValue = typed.owner === options ? typed.value : "";
  const unlocked = !gate || typedForm(typedValue) === typedForm(gate.expected);
  return (
    <Dialog
      open={open}
      size="sm"
      tone={danger ? "danger" : "default"}
      title={options.title || (danger ? "تأكيد إجراء لا يمكن التراجع عنه" : "تأكيد")}
      onClose={() => onResolve(false)}
      hideClose
      initialFocusRef={(options.initialFocus ?? (danger ? "cancel" : "confirm")) === "cancel" ? cancelRef : confirmRef}
      describedBy={messageId}
      className="eb-confirm"
      footer={
        <>
          <button ref={cancelRef} type="button" className="eb-button" onClick={() => onResolve(false)}>{options.cancelLabel || "إلغاء"}</button>
          <button ref={confirmRef} type="button" className={"eb-button " + (danger ? "is-danger" : "is-primary")} disabled={!unlocked} onClick={() => { if (unlocked) onResolve(true); }}>{options.confirmLabel || (danger ? "تأكيد الحذف" : "تأكيد")}</button>
        </>
      }
    >
      <p id={messageId} className="eb-confirm-message">{options.message}</p>
      {gate && (
        <label className="eb-confirm-type">
          {gate.label}
          <input value={typedValue} onChange={e => setTyped({ owner: options, value: e.target.value })} inputMode="numeric" autoComplete="off" dir="ltr" />
        </label>
      )}
    </Dialog>
  );
}

// 21E.1 — default export for the lazily loaded copy in useDeferredConfirm (React.lazy needs a default export); named export unchanged.
export default ConfirmDialog;
