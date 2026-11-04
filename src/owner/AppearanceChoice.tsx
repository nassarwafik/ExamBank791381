import type { AppearancePart } from "./ownerApi";

/**
 * Tadris+ P8-A2 — «خيارات المظهر» in the owner's access editor (blueprint §9.3): for each part of the teacher's appearance (the mode,
 * the palette, the density) every value (the default) or only the checked ones. The part's default is always allowed, so «استعادة
 * الافتراضي» always works; a value the owner no longer allows reads back as the default for that teacher (nothing is deleted).
 * Presentation only: no permission depends on it.
 */
const PART_LABEL: Record<string, string> = { theme: "الوضع", palette: "لوحة الألوان", density: "الكثافة" };
const VALUE_LABEL: Record<string, string> = {
  light: "فاتح", dark: "داكن", default: "الافتراضية", ocean: "محيط", forest: "غابة", sand: "رمل", comfortable: "مريحة", compact: "مدمجة"
};
export type AppearanceDraft = Record<string, string[] | null>;   // a part → only these values; null = every value

export default function AppearanceChoice({ teacherId, parts, draft, onDraft }: {
  teacherId: string; parts: AppearancePart[]; draft: AppearanceDraft; onDraft: (next: AppearanceDraft) => void;
}) {
  const setPart = (part: string, value: string[] | null) => onDraft({ ...draft, [part]: value });
  return (
    <fieldset className="eb-owner-access-options eb-owner-appearance-choice">
      <legend>خيارات المظهر</legend>
      {parts.map(p => {
        const some = Array.isArray(draft[p.part]);
        const chosen = new Set(draft[p.part] || []);
        return (
          <div key={p.part} role="group" aria-label={PART_LABEL[p.part] || p.part}>
            <p className="eb-owner-hint"><strong>{PART_LABEL[p.part] || p.part}</strong></p>
            <label className="eb-owner-access-option">
              <input type="radio" name={"appearance-" + p.part + "-" + teacherId} checked={!some} onChange={() => setPart(p.part, null)} />
              <span><strong>{"كل خيارات " + (PART_LABEL[p.part] || p.part)}</strong></span>
            </label>
            <label className="eb-owner-access-option">
              <input type="radio" name={"appearance-" + p.part + "-" + teacherId} checked={some} onChange={() => setPart(p.part, [p.fallback])} />
              <span><strong>{"خيارات محددة من " + (PART_LABEL[p.part] || p.part)}</strong><small>الافتراضي متاح دائمًا.</small></span>
            </label>
            {some && p.values.map(v => (
              <label key={v} className="eb-owner-check">
                <input type="checkbox" checked={v === p.fallback || chosen.has(v)} disabled={v === p.fallback}
                  onChange={e => { const n = new Set(chosen); if (e.target.checked) n.add(v); else n.delete(v); n.add(p.fallback); setPart(p.part, p.values.filter(x => n.has(x))); }} />
                <span>{VALUE_LABEL[v] || v}{v === p.fallback ? " (الافتراضي)" : ""}</span>
              </label>
            ))}
          </div>
        );
      })}
    </fieldset>
  );
}
