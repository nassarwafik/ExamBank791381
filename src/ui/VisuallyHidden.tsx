import type { ReactNode } from "react";

// Text that stays in the accessibility tree but is not drawn (never display:none, which would remove the
// accessible name). Used by the compact sidebar rail and count badges.
export default function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="eb-visually-hidden">{children}</span>;
}
