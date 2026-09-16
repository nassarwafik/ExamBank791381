import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog, type ConfirmOptions } from "./ConfirmDialog";

/** Awaited adapter over ConfirmDialog — see ConfirmDialog.tsx for the contract. */
export function useConfirm() {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPending(null);
    if (resolve) resolve(ok);
  }, []);

  const confirm = useCallback((options: ConfirmOptions | string) => new Promise<boolean>(resolve => {
    const previous = resolveRef.current;
    resolveRef.current = resolve;
    setPending(typeof options === "string" ? { message: options } : options);
    if (previous) previous(false);
  }), []);

  const cancelPending = useCallback(() => { if (resolveRef.current) settle(false); }, [settle]);

  useEffect(() => () => { const resolve = resolveRef.current; resolveRef.current = null; if (resolve) resolve(false); }, []);

  const confirmDialog = <ConfirmDialog open={pending !== null} options={pending ?? { message: "" }} onResolve={settle} />;
  return { confirm, cancelPending, confirmDialog, confirmPending: pending !== null };
}
