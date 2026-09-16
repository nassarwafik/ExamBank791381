import type { ReactNode } from "react";

/** StatusBadge — a small tonal pill for lifecycle/validation states. Text only; the caller owns the wording. */
export type BadgeTone = "success" | "neutral" | "warn" | "danger" | "info";

export default function StatusBadge({ tone, children, className }: { tone: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={["eb-badge", "tone-" + tone, className || ""].filter(Boolean).join(" ")}>{children}</span>;
}
