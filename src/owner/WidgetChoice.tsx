import type { DashboardWidget } from "./ownerApi";

/**
 * Tadris+ P7-A2 — «بطاقات لوحة المعلم» in the owner's access editor: every widget (the default, and every widget added later) or
 * only the checked ones. The server applies the choice with the capabilities while the owner enforces access: a widget left out is
 * neither shown nor sent by «اليوم», the analytics, the AI analysis or the reports. A widget whose capabilities the chosen set does not
 * hold cannot show whatever is chosen here — it says so.
 */
const PAGES: { page: DashboardWidget["page"]; title: string }[] = [
  { page: "today", title: "«اليوم»" },
  { page: "analytics", title: "التحليلات" }
];

export default function WidgetChoice({ teacherId, widgets, chosenCapabilities, mode, onMode, chosen, onChosen }: {
  teacherId: string; widgets: DashboardWidget[]; chosenCapabilities: Set<string>; mode: "all" | "some"; onMode: (m: "all" | "some") => void;
  chosen: Set<string>; onChosen: (next: Set<string>) => void;
}) {
  const toggle = (id: string, on: boolean) => { const n = new Set(chosen); if (on) n.add(id); else n.delete(id); onChosen(n); };
  return (
    <fieldset className="eb-owner-access-options eb-owner-widgets-choice">
      <legend>بطاقات لوحة المعلم</legend>
      <label className="eb-owner-access-option">
        <input type="radio" name={"widgets-" + teacherId} checked={mode === "all"} onChange={() => onMode("all")} />
        <span><strong>كل البطاقات</strong><small>كل ما تسمح به صلاحياته، ومعها كل بطاقة تُضاف لاحقًا.</small></span>
      </label>
      <label className="eb-owner-access-option">
        <input type="radio" name={"widgets-" + teacherId} checked={mode === "some"} onChange={() => onMode("some")} />
        <span><strong>بطاقات محددة فقط</strong><small>البطاقة غير المختارة لا تظهر، ولا تصل بياناتها إليه من التقارير ولا من التحليل الذكي.</small></span>
      </label>
      {mode === "some" && PAGES.map(({ page, title }) => (
        <div key={page} role="group" aria-label={"بطاقات " + title}>
          <p className="eb-owner-hint"><strong>{title}</strong></p>
          {widgets.filter(w => w.page === page).map(w => {
            const missing = w.capabilities.filter(c => !chosenCapabilities.has(c));
            return (
              <label key={w.id} className="eb-owner-check">
                <input type="checkbox" checked={chosen.has(w.id)} onChange={e => toggle(w.id, e.target.checked)} />
                <span>{w.label}{missing.length > 0 ? " (لن تظهر: تحتاج صلاحية غير مختارة)" : ""}</span>
              </label>
            );
          })}
        </div>
      ))}
      {mode === "some" && chosen.size === 0 && <p className="eb-owner-hint">لم تختر أي بطاقة: ستظهر لوحته بلا بطاقات أثناء التطبيق.</p>}
    </fieldset>
  );
}
