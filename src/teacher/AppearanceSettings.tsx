import { useEffect, useState } from "react";
import { setThemeChoice, getThemeChoice } from "../ui/themePreference";
import {
  PALETTES, DENSITIES, DEFAULT_APPEARANCE, applyTeacherAppearance, cacheAppearance, fetchTeacherAppearance, saveTeacherAppearance,
  type TeacherAppearance, type AppearanceChoosable
} from "./teacherAppearance";
import "./appearance.css";

/**
 * Tadris+ P8-A1 — «المظهر» in the teacher's profile (blueprint §9.3, owner decisions §19.27): the light / dark mode, one of the
 * approved palettes and the density. A choice applies at once and is saved on the teacher's account (it follows them on every
 * device); a refusal puts the previous look back. «استعادة الافتراضي» returns every part the teacher may change to the default. A part
 * the teacher's access does not include is shown, disabled. Only the teacher's own area changes — never what students see.
 */
export default function AppearanceSettings({ token }: { token: string }) {
  const [current, setCurrent] = useState<TeacherAppearance | null>(null);
  const [choosable, setChoosable] = useState<AppearanceChoosable>({ theme: false, palette: false, density: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    void fetchTeacherAppearance(token).then(r => { if (live && r) { setCurrent({ ...r.appearance, theme: getThemeChoice() }); setChoosable(r.choosable); } });
    return () => { live = false; };
  }, [token]);
  if (!current) return null;

  const show = (a: TeacherAppearance) => { applyTeacherAppearance(a); if (a.theme !== getThemeChoice()) setThemeChoice(a.theme); };
  async function change(changes: Partial<TeacherAppearance>, done: string) {
    if (!current || busy) return;
    const before = current, next = { ...current, ...changes };
    setBusy(true); setMessage(null); setCurrent(next); show(next);
    try { const saved = await saveTeacherAppearance(token, changes); setCurrent(saved); cacheAppearance(saved); show(saved); setMessage({ text: done }); }
    catch (e) { setCurrent(before); show(before); setMessage({ text: e instanceof Error ? e.message : "تعذر حفظ المظهر.", error: true }); }
    finally { setBusy(false); }
  }
  const reset = () => {
    const changes: Partial<TeacherAppearance> = {};
    if (choosable.theme) changes.theme = DEFAULT_APPEARANCE.theme;
    if (choosable.palette) changes.palette = DEFAULT_APPEARANCE.palette;
    if (choosable.density) changes.density = DEFAULT_APPEARANCE.density;
    if (Object.keys(changes).length) void change(changes, "عاد المظهر إلى الافتراضي.");
  };
  const isDefault = current.theme === DEFAULT_APPEARANCE.theme && current.palette === DEFAULT_APPEARANCE.palette && current.density === DEFAULT_APPEARANCE.density;
  const noneAllowed = !choosable.theme && !choosable.palette && !choosable.density;

  return (
    <section className="eb-teacher-appearance" aria-labelledby="eb-teacher-appearance-title">
      <h3 id="eb-teacher-appearance-title" className="eb-teacher-profile-title">المظهر</h3>
      <p className="eb-muted">يتغيّر مظهر مساحتك أنت فقط، ويتبعك على كل أجهزتك. صفحات الطلاب والامتحانات تبقى كما هي.</p>
      {noneAllowed && <p className="eb-muted" role="note">تغيير المظهر غير مفعّل لحسابك.</p>}
      <fieldset className="eb-teacher-appearance-group" disabled={busy || !choosable.theme}>
        <legend>الوضع</legend>
        {(["light", "dark"] as const).map(t => (
          <label key={t} className="eb-field-inline"><input type="radio" name="eb-appearance-theme" disabled={busy || !choosable.theme} checked={current.theme === t} onChange={() => void change({ theme: t }, "حُفظ الوضع.")} />{t === "light" ? "فاتح" : "داكن"}</label>
        ))}
      </fieldset>
      <fieldset className="eb-teacher-appearance-group" disabled={busy || !choosable.palette}>
        <legend>لوحة الألوان</legend>
        <div className="eb-teacher-appearance-swatches" role="radiogroup" aria-label="لوحة الألوان">
          {PALETTES.map(p => (
            <label key={p.id} className="eb-teacher-appearance-swatch">
              <input type="radio" name="eb-appearance-palette" disabled={busy || !choosable.palette} checked={current.palette === p.id} onChange={() => void change({ palette: p.id }, "حُفظت لوحة الألوان.")} />
              <span className="eb-teacher-appearance-dot" data-swatch={p.id} aria-hidden="true" />{p.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="eb-teacher-appearance-group" disabled={busy || !choosable.density}>
        <legend>الكثافة</legend>
        {DENSITIES.map(d => (
          <label key={d.id} className="eb-field-inline"><input type="radio" name="eb-appearance-density" disabled={busy || !choosable.density} checked={current.density === d.id} onChange={() => void change({ density: d.id }, "حُفظت الكثافة.")} />{d.label}</label>
        ))}
      </fieldset>
      <div className="eb-inline-actions">
        <button type="button" className="eb-button is-small" disabled={busy || isDefault || noneAllowed} onClick={reset}>استعادة الافتراضي</button>
      </div>
      {message && <p className={message.error ? "platform-error" : "eb-teacher-profile-notice"} role={message.error ? "alert" : "status"}>{message.text}</p>}
    </section>
  );
}
