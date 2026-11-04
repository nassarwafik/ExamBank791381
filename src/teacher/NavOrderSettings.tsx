import { useContext, useState } from "react";
import { NAV_LABELS, type TeacherNavId } from "../shell/teacherNav";
import { navAllowed } from "../shell/teacherAccess";
import { TeacherAccessContext } from "../shell/teacherAccessContext";
import { ARRANGEABLE_NAV, orderedNav, saveTeacherNavLayout, useTeacherNavLayout, type NavLayout } from "../shell/navLayout";
import "./appearance.css";

/**
 * Tadris+ P8-B2a — «ترتيب القائمة» in the teacher's profile (owner decision §19.31): the order of the sidebar's main destinations and
 * which of them it shows, saved on the teacher's account (it follows them on every device; the phone's bottom bar takes its first
 * destinations from it). «لوحة المتابعة» always stays first. Offered only with appearance.layout.choose (the server's
 * `layoutChoosable`). Only the destinations the teacher may open are listed; a hidden one still opens from the quick search.
 * Presentation only: no permission depends on it.
 */
export default function NavOrderSettings({ token }: { token: string }) {
  const { layout, choosable } = useTeacherNavLayout();
  const access = useContext(TeacherAccessContext);
  const [draft, setDraft] = useState<NavLayout | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  if (!choosable) return null;

  const current: NavLayout = draft || { order: orderedNav(ARRANGEABLE_NAV, layout), hidden: layout ? [...layout.hidden] : [] };
  const shown = current.order.filter(id => navAllowed(id, access));
  const dirty = draft !== null;
  const move = (id: TeacherNavId, step: -1 | 1) => {
    const at = shown.indexOf(id), other = shown[at + step];
    if (!other) return;
    const order = [...current.order], i = order.indexOf(id), j = order.indexOf(other);
    [order[i], order[j]] = [order[j], order[i]];
    setDraft({ ...current, order }); setMessage(null);
  };
  const toggle = (id: TeacherNavId, visible: boolean) => {
    setDraft({ ...current, hidden: visible ? current.hidden.filter(x => x !== id) : [...current.hidden, id] }); setMessage(null);
  };
  async function save(next: NavLayout, done: string) {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { await saveTeacherNavLayout(token, next); setDraft(null); setMessage({ text: done }); }
    catch (e) { setMessage({ text: e instanceof Error ? e.message : "تعذر حفظ ترتيب القائمة.", error: true }); }
    finally { setBusy(false); }
  }

  return (
    <fieldset className="eb-appearance eb-nav-order" disabled={busy}>
      <legend>ترتيب القائمة</legend>
      <p className="eb-muted">رتّب أقسام القائمة الجانبية وأخفِ ما لا تستخدمه. «لوحة المتابعة» تبقى أولًا، والقسم المخفي يبقى متاحًا من البحث السريع.</p>
      <ol className="eb-nav-order-list" aria-label="أقسام القائمة بالترتيب">
        {shown.map((id, i) => (
          <li key={id} className="eb-nav-order-row">
            <label className="eb-nav-order-show"><input type="checkbox" checked={!current.hidden.includes(id)} onChange={e => toggle(id, e.target.checked)} />{NAV_LABELS[id]}</label>
            <span className="eb-nav-order-moves">
              <button type="button" className="eb-button is-quiet is-small" aria-label={"تحريك «" + NAV_LABELS[id] + "» للأعلى"} disabled={i === 0} onClick={() => move(id, -1)}>▲</button>
              <button type="button" className="eb-button is-quiet is-small" aria-label={"تحريك «" + NAV_LABELS[id] + "» للأسفل"} disabled={i === shown.length - 1} onClick={() => move(id, 1)}>▼</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="eb-nav-order-actions">
        <button type="button" className="eb-button is-primary is-small" disabled={!dirty} onClick={() => void save(current, "تم حفظ ترتيب القائمة.")}>حفظ الترتيب</button>
        <button type="button" className="eb-button is-quiet is-small" disabled={!layout && !dirty} onClick={() => void save({ order: [], hidden: [] }, "عادت القائمة إلى ترتيبها الافتراضي.")}>استعادة الترتيب الافتراضي</button>
      </div>
      {message && <p className={message.error ? "platform-error" : "eb-muted"} role={message.error ? "alert" : "status"}>{message.text}</p>}
    </fieldset>
  );
}
