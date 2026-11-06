// UX-O1 — test helpers for the «المعلمون» table (docs/enterprise-ux-owner-console-o1.md). The list became a <table> named «المعلمون»
// in which each teacher is one row group (<tbody>) named after them; a teacher's actions sit in its «⋯» menu, portalled to <body>
// as a group named «إجراءات <name>». Used by the owner console tests only (never imported by the app).
import { fireEvent, screen, within } from "@testing-library/react";

export const TEACHERS_TABLE = { name: "المعلمون" } as const;

/** Waits for the teachers table. */
export const findTeachersTable = () => screen.findByRole("table", TEACHERS_TABLE);

/** Every teacher's row group, in the order shown (the header row group has no name and is left out). */
export function teacherGroups(table: HTMLElement = screen.getByRole("table", TEACHERS_TABLE)): HTMLElement[] {
  return within(table).getAllByRole("rowgroup").filter(g => Boolean(g.getAttribute("aria-label")));
}

/** One teacher's row group: their row and, when open, the panel an action opened under it. */
export const teacherGroup = (displayName: string) => screen.getByRole("rowgroup", { name: displayName });

/** Opens a teacher's «⋯» menu and returns it. */
export function openTeacherMenu(displayName: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "إجراءات " + displayName }));
  return screen.getByRole("group", { name: "إجراءات " + displayName });
}

/** Opens a teacher's «⋯» menu and presses one of its actions. */
export function teacherAction(displayName: string, action: string): void {
  fireEvent.click(within(openTeacherMenu(displayName)).getByRole("button", { name: action }));
}

/** The labels of a teacher's menu actions (the menu is closed again afterwards). */
export function teacherActionLabels(displayName: string): string[] {
  const menu = openTeacherMenu(displayName);
  const labels = within(menu).getAllByRole("button").map(b => (b.textContent || "").trim());
  fireEvent.keyDown(menu, { key: "Escape" });
  return labels;
}
