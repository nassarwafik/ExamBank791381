// UX-O2 — test helper (TEST code only): the owner's access editor folds its sections (design docs/enterprise-ux-owner-console-o2.md
// §2.1 ب); a folded section stays mounted but is hidden from the accessibility tree. Tests that work inside the sections open them all
// first, the way an owner would, and then keep every assertion they had before the sections existed.
import { fireEvent, screen } from "@testing-library/react";

/** Opens every folded section of the access editor on the page. */
export function openAccessSections(): void {
  for (const head of screen.queryAllByRole("button", { expanded: false })) {
    if (head.classList.contains("eb-owner-section-head")) fireEvent.click(head);
  }
}
