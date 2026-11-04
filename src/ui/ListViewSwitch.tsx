import type { ListView } from "./devicePrefs";
import "./list-views.css";

/**
 * Tadris+ P8-B2b (owner decision §19.31, «لكل صفحة») — the «بطاقات» / «قائمة مضغوطة» choice of one list page. The page keeps the choice
 * on this device (useDevicePref); «بطاقات» is the page's look before P8-B2b.
 */
export default function ListViewSwitch({ value, onChange, label }: { value: ListView; onChange: (v: ListView) => void; label: string }) {
  return (
    <div className="eb-segmented eb-list-view-switch" role="group" aria-label={label}>
      <button type="button" aria-pressed={value === "cards"} onClick={() => onChange("cards")}>بطاقات</button>
      <button type="button" aria-pressed={value === "compact"} onClick={() => onChange("compact")}>قائمة مضغوطة</button>
    </div>
  );
}
