import { ConfirmDialog } from "./ConfirmDialog";
import { useConfirmState } from "./useConfirmState";

/** Awaited adapter over ConfirmDialog — see ConfirmDialog.tsx for the contract. The promise logic lives in useConfirmState. */
export function useConfirm() {
  const { pending, settle, confirm, cancelPending } = useConfirmState();
  const confirmDialog = <ConfirmDialog open={pending !== null} options={pending ?? { message: "" }} onResolve={settle} />;
  return { confirm, cancelPending, confirmDialog, confirmPending: pending !== null };
}
