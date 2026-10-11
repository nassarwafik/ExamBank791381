import { useCallback, useEffect, useRef, useState } from "react";
import type { ConfirmOptions } from "./ConfirmDialog";

/**
 * The promise half of the shared confirmation (see ConfirmDialog.tsx for the contract), with NO rendering and no static import
 * of the dialog layer. `useConfirm()` renders it eagerly; `useDeferredConfirm()` loads the dialog on first use so a startup
 * module (App.tsx) never puts the dialog layer in the initial bundle. Contract (unchanged from 15A): a pending confirmation
 * resolves `false` when the owner unmounts, when `cancelPending()` is called, or when a newer confirm replaces it.
 * `used` turns true on the first confirm and stays true, so a lazily loaded dialog stays mounted (open → closed transitions,
 * focus return to the opener) exactly like the eager one.
 */
export function useConfirmState() {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const [used, setUsed] = useState(false);
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
    setUsed(true);
    setPending(typeof options === "string" ? { message: options } : options);
    if (previous) previous(false);
  }), []);

  const cancelPending = useCallback(() => { if (resolveRef.current) settle(false); }, [settle]);

  useEffect(() => () => { const resolve = resolveRef.current; resolveRef.current = null; if (resolve) resolve(false); }, []);

  return { pending, used, settle, confirm, cancelPending };
}
