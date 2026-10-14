// Phase 21E.2 — test helper (imported by test files only). The structured builder's toolbar shows at most eight actions; every
// other tool is the SAME handler inside one of its two menus («إضافة أسئلة», «المزيد»). Tests reach a tool the way a teacher
// does: open the menu, find the item. An ABSENCE check must open the menus too (a closed menu renders no items, so a plain
// queryByRole would pass vacuously) — use toolbarItemOrNull for those.
import { fireEvent, screen, within } from "@testing-library/react";

const MENUS = ["المزيد من أدوات الامتحان", "إضافة أسئلة"];

type Name = string | RegExp;
const matches = (el: HTMLElement, name: Name) => {
  const text = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
  return typeof name === "string" ? text === name : name.test(text);
};

function closeMenus() {
  for (const label of MENUS) {
    const trigger = screen.queryByRole("button", { name: label });
    if (trigger && trigger.getAttribute("aria-expanded") === "true") fireEvent.click(trigger);
  }
}

/** The toolbar tool with this accessible name — a visible toolbar button, or the item of the menu that holds it (the menu is
 *  left OPEN so the caller can click the item; activating an item closes it). Null when no toolbar surface offers it. */
export function toolbarItemOrNull(name: Name): HTMLElement | null {
  const toolbar = document.querySelector<HTMLElement>(".sb-toolbar");
  if (toolbar) {
    const direct = within(toolbar).queryAllByRole("button").find(b => matches(b, name) && !MENUS.includes(b.getAttribute("aria-label") || ""));
    if (direct) return direct;
  }
  closeMenus();
  for (const label of MENUS) {
    const trigger = screen.queryByRole("button", { name: label });
    if (!trigger) continue;
    fireEvent.click(trigger);
    const panelId = trigger.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    const item = panel ? within(panel).queryAllByRole("button").find(b => matches(b, name)) ?? null : null;
    if (item) return item;
    fireEvent.click(trigger);                                            // not in this menu: close it again
  }
  return null;
}

export function toolbarItem(name: Name): HTMLElement {
  const item = toolbarItemOrNull(name);
  if (!item) throw new Error("toolbar tool not found: " + String(name));
  return item;
}

/** Opens the tool (click). */
export function clickToolbarItem(name: Name) {
  fireEvent.click(toolbarItem(name));
}
