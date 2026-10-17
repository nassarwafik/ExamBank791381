import Dialog from "../../ui/Dialog";
import { DEFAULT_READING_SETTINGS, LINE_SPACING, TEXT_SIZE_PX, type ReadingSettings, type ReadingSpacing, type ReadingTextSize, type ReadingTheme } from "./readingSettings";

/**
 * Phase 21E L2-C — «إعدادات القراءة»: the shared modal Dialog (labelled, focus-trapped, Escape / backdrop close, focus
 * back to the toolbar button) holding three native radio groups. Native radios give the expected keyboard model (Tab
 * into a group, arrows move the choice) and announce "n of 3" by themselves. Every choice applies at once — the page
 * behind the dialog is the preview — and is remembered on this device by the Reader.
 */
export default function ReadingSettingsDialog({ open, settings, onChange, onClose }: {
  open: boolean;
  settings: ReadingSettings;
  onChange: (next: ReadingSettings) => void;
  onClose: () => void;
}) {
  const sizes: { value: ReadingTextSize; label: string }[] = [
    { value: 1, label: "صغير" }, { value: 2, label: "متوسط" }, { value: 3, label: "كبير" },
  ];
  const spacings: { value: ReadingSpacing; label: string }[] = [
    { value: 1, label: "عادية" }, { value: 2, label: "واسعة" }, { value: 3, label: "أوسع" },
  ];
  const themes: { value: ReadingTheme; label: string; hint: string }[] = [
    { value: "light", label: "فاتح", hint: "خلفية بيضاء" },
    { value: "sepia", label: "ورقي", hint: "خلفية دافئة مريحة للعين" },
    { value: "dark", label: "داكن", hint: "للقراءة في الإضاءة الخافتة" },
  ];
  const isDefault = settings.size === DEFAULT_READING_SETTINGS.size && settings.spacing === DEFAULT_READING_SETTINGS.spacing && settings.theme === DEFAULT_READING_SETTINGS.theme;
  return (
    <Dialog
      open={open}
      title="إعدادات القراءة"
      onClose={onClose}
      size="sm"
      className="learning-reader-settings"
      footer={<>
        <button type="button" className="eb-button is-quiet" onClick={() => onChange(DEFAULT_READING_SETTINGS)} disabled={isDefault}>استعادة الإعدادات الافتراضية</button>
        <button type="button" className="eb-button is-primary" onClick={onClose}>تم</button>
      </>}
    >
      <p className="learning-reader-settings-note">تُحفظ اختياراتك على هذا الجهاز، ولا تغيّر وضع العرض.</p>
      <fieldset className="learning-reader-settings-group">
        <legend>حجم النص</legend>
        <div className="learning-reader-settings-options">
          {sizes.map(o => (
            <label key={o.value} className="learning-reader-settings-option">
              <input type="radio" name="learning-reader-text-size" value={o.value} checked={settings.size === o.value} onChange={() => onChange({ ...settings, size: o.value })} />
              <span className="learning-reader-settings-sample" data-size={o.value} aria-hidden="true">أ</span>
              <span>{o.label} <span className="learning-reader-settings-px" dir="ltr">{TEXT_SIZE_PX[o.value]}px</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="learning-reader-settings-group">
        <legend>تباعد الأسطر</legend>
        <div className="learning-reader-settings-options">
          {spacings.map(o => (
            <label key={o.value} className="learning-reader-settings-option">
              <input type="radio" name="learning-reader-line-spacing" value={o.value} checked={settings.spacing === o.value} onChange={() => onChange({ ...settings, spacing: o.value })} />
              <span>{o.label} <span className="learning-reader-settings-px" dir="ltr">{LINE_SPACING[o.value]}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="learning-reader-settings-group">
        <legend>لون صفحة القراءة</legend>
        <div className="learning-reader-settings-options">
          {themes.map(o => (
            <label key={o.value} className="learning-reader-settings-option">
              <input type="radio" name="learning-reader-theme" value={o.value} checked={settings.theme === o.value} onChange={() => onChange({ ...settings, theme: o.value })} />
              <span className="learning-reader-settings-swatch" data-theme={o.value} aria-hidden="true" />
              <span>{o.label}<span className="learning-reader-settings-hint">{o.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
    </Dialog>
  );
}
