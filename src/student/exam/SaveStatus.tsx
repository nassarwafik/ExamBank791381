import { IconCheck, IconRefresh, IconWarning } from "../../icons";
import { canManualRetry, formatLastSaved, saveStateHint, saveStateLabel, type SaveStateKind } from "../../studentSaveState";

/**
 * SaveStatus (UX-7b-1) — the ONE student-facing rendering of the derived save state. It receives the kind
 * already computed by `deriveSaveState` (server-confirmed revision, in-flight save, offline, exhausted retries)
 * and never inspects the save machinery itself. Global (one snapshot is saved), never per question. The canonical six labels
 * come from studentSaveState.ts unchanged.
 * Phase 21E.3 — the label is no longer a live region (it announced every pending → saving → saved cycle of every edit). The
 * page's single polite announcer says only the changes that matter (examAnnouncements.saveAnnouncement).
 */
type Props = { kind: SaveStateKind; lastSavedAt: string; onRetry: () => void };

export default function SaveStatus({ kind, lastSavedAt, onRetry }: Props) {
  const savedTime = formatLastSaved(lastSavedAt);
  const hint = saveStateHint(kind);
  const showRetry = canManualRetry(kind);
  const Icon = kind === "saved" ? IconCheck : kind === "saving" || kind === "retrying" ? IconRefresh : kind === "offline" || kind === "error" ? IconWarning : null;
  return (
    <div className={"iex-save iex-save-" + kind}>
      <span className={"iex-save-state iex-save-" + kind}>
        {Icon && <Icon size={14} aria-hidden="true" />}
        {saveStateLabel(kind)}{savedTime && (kind === "saved" || kind === "pending") ? " · آخر حفظ: " + savedTime : ""}
      </span>
      {hint && <em className="iex-save-hint">{hint}</em>}
      {showRetry && <button type="button" className="eb-button is-small iex-retry-save" onClick={onRetry}>إعادة محاولة الحفظ</button>}
    </div>
  );
}
