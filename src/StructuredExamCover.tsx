import type { ExamCoverPage } from "./examCover";
import {
  isSafeBannerDataUrl,
  instructionLines,
  activityStartLabel,
  activityInstructionsTitle,
  type MarksDistribution
} from "./examCover";
import "./structured-cover.css";

// ONE reusable cover/start page, shared by the real student exam page and the teacher builder preview.
// It renders ONLY safe, display data: a wide school banner (safe raster data URL, aspect-ratio kept),
// the title/subtitle, a compact info panel, an allowed-materials box, an instructions card (plain-text
// lines as bullets — never HTML), and an auto-computed marks-distribution card. Student identity and
// date/duration are RUNTIME values passed in as props (never read from the exam artifact); in preview
// mode they are shown as safe placeholders. Nothing renders the questions — the parent swaps to the
// existing question UI only after onStart().

export type CoverRuntime = {
  studentName?: string;
  className?: string;
  examDate?: string;
  duration?: string;
};

type Props = {
  cover: ExamCoverPage;
  title: string;
  distribution: MarksDistribution;
  runtime?: CoverRuntime;
  preview?: boolean;
  onStart: () => void;
};

// In preview the teacher has no real student — show a clear placeholder, never a real account.
const PLACEHOLDER_NAME = "طالب تجريبي";
const PLACEHOLDER_CLASS = "الحادي عشر 7";

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="iex-cover-info-row"><span className="iex-cover-info-label">{label}</span><span className="iex-cover-info-value">{value}</span></div>;
}

export default function StructuredExamCover({ cover, title, distribution, runtime, preview, onStart }: Props) {
  const bannerUrl = cover.banner?.dataUrl;
  const showBanner = isSafeBannerDataUrl(bannerUrl);
  const lines = instructionLines(cover.instructions);
  const startLabel = activityStartLabel(cover.activityType);
  const instructionsTitle = activityInstructionsTitle(cover.activityType);

  const studentName = preview ? PLACEHOLDER_NAME : (runtime?.studentName || "");
  const className = preview ? PLACEHOLDER_CLASS : (runtime?.className || "");
  const examDate = preview ? "—" : (runtime?.examDate || "");
  const duration = runtime?.duration || "";

  const infoRows: { label: string; value: string }[] = [];
  if (cover.showStudentName) infoRows.push({ label: "الطالب", value: studentName || (preview ? PLACEHOLDER_NAME : "__________") });
  if (cover.showClassName && (className || preview)) infoRows.push({ label: "الصف", value: className || PLACEHOLDER_CLASS });
  if (cover.showExamDate && examDate) infoRows.push({ label: "التاريخ", value: examDate });
  if (cover.showDuration && duration) infoRows.push({ label: "المدة", value: duration });
  if (cover.showTotalMarks) infoRows.push({ label: "المجموع", value: distribution.total + " علامة" });

  return (
    <div className="iex-cover" dir="rtl">
      {showBanner && (
        <div className="iex-cover-banner">
          <img src={bannerUrl} alt="ترويسة المدرسة" />
        </div>
      )}

      <div className="iex-cover-card">
        <h1 className="iex-cover-title">{title || "امتحان"}</h1>
        {cover.subtitle && <p className="iex-cover-subtitle">{cover.subtitle}</p>}

        {infoRows.length > 0 && (
          <div className="iex-cover-info">{infoRows.map((r, i) => <InfoRow key={i} label={r.label} value={r.value} />)}</div>
        )}

        {cover.allowedMaterials && cover.allowedMaterials.trim() && (
          <div className="iex-cover-materials">
            <strong>المواد المسموحة</strong>
            <span>{cover.allowedMaterials}</span>
          </div>
        )}

        {lines.length > 0 && (
          <div className="iex-cover-instructions">
            <strong className="iex-cover-section-title">{instructionsTitle}</strong>
            <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        )}

        {cover.showMarksDistribution && distribution.rows.length > 0 && (
          <div className="iex-cover-marks">
            <strong className="iex-cover-section-title">توزيع العلامات</strong>
            <ul>
              {distribution.rows.map((r, i) => (
                <li key={i}><span>{r.title}</span><span>{r.marks} علامة</span></li>
              ))}
              <li className="iex-cover-marks-total"><span>المجموع</span><span>{distribution.total} علامة</span></li>
            </ul>
          </div>
        )}

        <button type="button" className="iex-cover-start" onClick={onStart}>{startLabel}</button>
        {preview && <p className="iex-cover-preview-note">هذه معاينة للغلاف — بيانات الطالب والتاريخ تظهر تلقائيًا للطالب الحقيقي.</p>}
      </div>
    </div>
  );
}
