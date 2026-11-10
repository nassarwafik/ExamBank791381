import { fireEvent, screen, waitFor, within } from "@testing-library/react";

// UX-S2 (docs/enterprise-ux-student-s2.md) — the portal shows ONE view at a time; a test reaches a section the way a student does:
// through the portal's view bar («أقسام بوابة الطالب»). `label` is the view's name (اليوم / المواد / الواجبات / التقدم / المشاريع).
// Hotfix: it WAITS for that view's button — «المشاريع» joins the bar only once the project panel's own read answers, so the bar can
// already hold its other buttons while that read is in flight (portalViews.testkit.hotfix.test.tsx).
export async function openStudentView(label: "اليوم" | "المواد" | "الواجبات" | "التقدم" | "المشاريع"): Promise<void> {
  const nav = await screen.findByRole("navigation", { name: "أقسام بوابة الطالب" });
  const button = await waitFor(() => {
    const found = within(nav).queryAllByRole("button").find(b => (b.textContent || "").trim().startsWith(label));
    if (!found) throw new Error("the view bar has no «" + label + "»");
    return found;
  });
  fireEvent.click(button);
}
