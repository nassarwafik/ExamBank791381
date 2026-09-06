import { STATUS_META } from "./helpers";
import type { StageStatus } from "./types";

export default function StageStatusBadge({ status, showLabel = true }: { status: StageStatus; showLabel?: boolean }) {
  const meta = STATUS_META[status] || STATUS_META.not_started;
  return (
    <span className={"p794-status-badge " + meta.className} title={meta.label}>
      <span aria-hidden="true">{meta.icon}</span>{showLabel ? <span>{meta.label}</span> : null}
    </span>
  );
}
