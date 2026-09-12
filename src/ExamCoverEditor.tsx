import { useState } from "react";
import type { ExamCoverPage, ActivityType } from "./examCover";
import { defaultCoverPage, validateBannerDataUrl, MAX_BANNER_BYTES } from "./examCover";

// Builder panel "الغلاف والتعليمات" — configure the OPTIONAL cover/start page AFTER import or manual
// creation. Controlled: edits flow up via onChange({...cover}). The banner reuses the app's established
// safe-image path (file input → FileReader data URL) but is validated to a safe RASTER type + size
// limit before it is accepted. No exam question data is touched here.

type Props = {
  cover: ExamCoverPage | undefined;
  onChange: (cover: ExamCoverPage | undefined) => void;
  onPreviewCover: () => void;
  disabled?: boolean;
};

const SAFE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export default function ExamCoverEditor({ cover, onChange, onPreviewCover, disabled }: Props) {
  const [bannerError, setBannerError] = useState("");
  const enabled = !!cover?.enabled;
  const c = cover;

  const patch = (p: Partial<ExamCoverPage>) => onChange({ ...(c ?? defaultCoverPage()), ...p });

  const toggleEnabled = (on: boolean) => {
    setBannerError("");
    if (on) {
      const base = c ?? defaultCoverPage(cover?.activityType);
      onChange({ ...base, enabled: true });
    } else {
      onChange(c ? { ...c, enabled: false } : undefined);
    }
  };

  const onBannerFile = (file: File | undefined) => {
    setBannerError("");
    if (!file) return;
    if (file.size > MAX_BANNER_BYTES) { setBannerError("حجم البانر كبير جدًّا (الحد الأقصى ~4 ميغابايت)."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      const v = validateBannerDataUrl(url);
      if (!v.ok) { setBannerError(v.reason); return; }
      patch({ banner: { dataUrl: v.dataUrl } });
    };
    reader.onerror = () => setBannerError("تعذّر قراءة الصورة.");
    reader.readAsDataURL(file);
  };

  const flag = (key: keyof ExamCoverPage, label: string) => (
    <label className="sb-check">
      <input type="checkbox" checked={c?.[key] !== false} onChange={e => patch({ [key]: e.target.checked } as Partial<ExamCoverPage>)} disabled={disabled || !enabled} />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="sb-cover-panel" dir="rtl">
      <div className="sb-row-between">
        <strong>🎓 الغلاف والتعليمات</strong>
        <label className="sb-check">
          <input type="checkbox" checked={enabled} onChange={e => toggleEnabled(e.target.checked)} disabled={disabled} />
          <span>إظهار صفحة الغلاف</span>
        </label>
      </div>
      <p className="sb-hint">صفحة بداية اختيارية تظهر للطالب قبل الأسئلة. لا تُطلب في الاستيراد — تُضاف بعد فتح المحرّر.</p>

      {enabled && (
        <div className="sb-cover-fields">
          <label className="sb-field">
            <span className="sb-field-label">نوع النشاط</span>
            <select className="sb-input" value={c?.activityType || "exam"} onChange={e => patch({ activityType: e.target.value as ActivityType })} disabled={disabled}>
              <option value="exam">امتحان</option>
              <option value="training">تدريب</option>
            </select>
          </label>

          <div className="sb-field">
            <span className="sb-field-label">بانر المدرسة (ترويسة عريضة)</span>
            <div className="sb-cover-banner-row">
              {c?.banner?.dataUrl && <img className="sb-cover-banner-thumb" src={c.banner.dataUrl} alt="بانر المدرسة" />}
              <input type="file" accept={SAFE_ACCEPT} onChange={e => onBannerFile(e.target.files?.[0])} disabled={disabled} />
              {c?.banner?.dataUrl && <button type="button" className="sb-mini-btn" onClick={() => { setBannerError(""); patch({ banner: undefined }); }} disabled={disabled}>حذف البانر</button>}
            </div>
            <p className="sb-hint">الصيغ المسموحة: PNG · JPG · WebP · GIF (بدون SVG أو روابط خارجية). تُحفظ الصورة مع الامتحان.</p>
            {bannerError && <div className="sb-banner sb-banner-error">{bannerError}</div>}
          </div>

          <label className="sb-field">
            <span className="sb-field-label">نص إضافي / عنوان فرعي</span>
            <input className="sb-input" value={c?.subtitle ?? ""} placeholder="مثال: الحادي عشر 7" onChange={e => patch({ subtitle: e.target.value })} disabled={disabled} />
          </label>

          <label className="sb-field">
            <span className="sb-field-label">المواد المسموحة</span>
            <input className="sb-input" value={c?.allowedMaterials ?? ""} placeholder="مثال: مادة مفتوحة وآلة حاسبة" onChange={e => patch({ allowedMaterials: e.target.value })} disabled={disabled} />
          </label>

          <label className="sb-field">
            <span className="sb-field-label">تعليمات الامتحان / التدريب</span>
            <textarea className="sb-input sb-textarea sb-cover-instructions-input" value={c?.instructions ?? ""} placeholder={"الصق التعليمات هنا (كل سطر يظهر كبند):\nأجب عن جميع الأسئلة.\nاقرأ السؤال جيدًا قبل الإجابة.\nتأكد من إجاباتك قبل التسليم."} onChange={e => patch({ instructions: e.target.value })} disabled={disabled} rows={5} />
            <p className="sb-hint">نص عادي فقط — يُعرض بأمان دون أي وسوم HTML.</p>
          </label>

          <div className="sb-field">
            <span className="sb-field-label">خيارات العرض</span>
            <div className="sb-cover-flags">
              {flag("showStudentName", "اسم الطالب")}
              {flag("showClassName", "الصف / الشعبة")}
              {flag("showExamDate", "التاريخ")}
              {flag("showDuration", "المدة")}
              {flag("showTotalMarks", "العلامة الكلية")}
              {flag("showMarksDistribution", "توزيع العلامات")}
            </div>
            <p className="sb-hint">تُعرض بيانات الطالب والصف تلقائيًا من حساب الطالب/الواجب — لا تُخزَّن داخل الامتحان.</p>
          </div>

          <button type="button" className="sb-btn" onClick={onPreviewCover} disabled={disabled}>👁 معاينة الغلاف</button>
        </div>
      )}
    </div>
  );
}
