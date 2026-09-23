import { IconMedal, IconHeart, IconSparkles } from "../icons";
import { MEDAL_LABELS, type MedalTier } from "../medals";
import ProgressRing from "../ui/ProgressRing";
import SectionHeader from "../ui/SectionHeader";
import StatCard from "../ui/StatCard";
import VisuallyHidden from "../ui/VisuallyHidden";
import { stagePresentationFromStrength } from "./strengthPresentation";
import { countMedals } from "./portalPresentation";
import { REACTIONS } from "../achievements";
import type { Stats, StudentRecognition, StudentStrength } from "./types";

/**
 * "تقدّمي" (UX-7a): the server's own counts as StatCards, the finalized-only average as a ring (always with a
 * textual equivalent), medals (finalized-only) and the STUDENT STRENGTH PATH — the current stage's owner artwork
 * inside a circular progress ring that fills through the current 80-point stage, with the stage title, the journey
 * group, «المرحلة X من 25», «نقاط القوة: X / 2000», «Y / 80», the percentage and the next stage's icon / name.
 * Everything comes from the SERVER's `dashboard.strength` (25 stages × 80 points, decided by the API); presentation
 * only: nothing here recomputes a stage, a percentage or a point from a total.
 */
type Props = { stats: Stats; medals: MedalTier[]; strength: StudentStrength | null; recognition: StudentRecognition | null; averageFinalized: number | null };

/**
 * The three kinds of recognition side by side — الميداليات (finalized assessment), التفاعلات (reactions RECEIVED on
 * the student's achievement events) and الإنجازات (meaningful milestones) — each with its own count. They are
 * deliberately never summed into one number: recognition is not Strength.
 */
function RecognitionTiles({ recognition, medalCount }: { recognition: StudentRecognition | null; medalCount: number }) {
  const medals = recognition ? recognition.medals.total : medalCount;
  const reactions = recognition?.reactionsReceived.total ?? 0;
  const achievements = recognition?.achievements.total ?? 0;
  const byType = recognition?.reactionsReceived.byType;
  return (
    <ul className="eb-sp-recognition" aria-label="التقدير">
      <li className="eb-sp-recognition-tile">
        <IconMedal size={22} className="eb-sp-recognition-icon is-medal" aria-hidden="true" />
        <strong className="eb-sp-recognition-count">{medals}</strong>
        <span className="eb-sp-recognition-label">الميداليات</span>
      </li>
      <li className="eb-sp-recognition-tile">
        <IconHeart size={22} className="eb-sp-recognition-icon is-reaction" aria-hidden="true" />
        <strong className="eb-sp-recognition-count">{reactions}</strong>
        <span className="eb-sp-recognition-label">التفاعلات</span>
        {byType && reactions > 0 && (
          <span className="eb-sp-recognition-detail" aria-label="التفاعلات حسب النوع">
            {REACTIONS.filter(r => byType[r.id] > 0).map(r => <span key={r.id}><span aria-hidden="true">{r.emoji}</span><VisuallyHidden>{r.label}</VisuallyHidden> {byType[r.id]}</span>)}
          </span>
        )}
      </li>
      <li className="eb-sp-recognition-tile">
        <IconSparkles size={22} className="eb-sp-recognition-icon is-achievement" aria-hidden="true" />
        <strong className="eb-sp-recognition-count">{achievements}</strong>
        <span className="eb-sp-recognition-label">الإنجازات</span>
      </li>
    </ul>
  );
}

/** «نقاط القوة: 510 / 2000» + the four-source breakdown (the raw total is shown when it exceeds the visible path). */
function StrengthBreakdown({ strength }: { strength: StudentStrength }) {
  return (
    <div className="eb-sp-strength" aria-label="نقاط القوة">
      <p className="eb-sp-strength-total">نقاط القوة: <strong dir="ltr">{strength.stagePoints} / {strength.stageMaxPoints}</strong></p>
      {strength.rawTotalPoints > strength.stageMaxPoints && (
        <p className="eb-sp-rank-hint">إجمالي نقاطك الفعلي: <span dir="ltr">{strength.rawTotalPoints}</span> — أكملت مسار القوة كاملًا.</p>
      )}
      <ul className="eb-sp-strength-breakdown">
        <li><span>الواجبات النهائية</span><strong>{strength.examPoints}</strong></li>
        <li><span>التدريبات والامتحانات التدريبية</span><strong>{strength.practicePoints}</strong></li>
        <li><span>تمارين الدراسة</span><strong>{strength.studyPoints}</strong></li>
        <li><span>الألعاب التعليمية</span><strong>{strength.gamePoints}</strong></li>
        <li><span>المشاريع</span><strong>{strength.projectPoints}</strong></li>
      </ul>
    </div>
  );
}

// A dependency-free SVG circular progress ring with the current stage's artwork centered inside it (the circular
// badge presentation of PR #107, reused). The two circles are decorative (aria-hidden); the ACCESSIBLE progress
// semantic is a role="progressbar" wrapper carrying the SERVER's within-stage points (aria-valuemin 0,
// aria-valuemax = the stage block size, aria-valuenow = withinStagePoints). The artwork is shown untouched
// (object-fit:contain, never cropped) with a meaningful alt («المرحلة 7 — ذئب الرياح»).
function StageRing({ src, alt, value, max, percent, progressLabel }: { src: string; alt: string; value: number; max: number; percent: number; progressLabel: string }) {
  const R = 45;
  const C = 2 * Math.PI * R;
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="eb-sp-rankring eb-sp-stagering">
      <div className="eb-sp-rankring-progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={value + " من " + max + " نقطة قوة"} aria-label={progressLabel}>
        <svg className="eb-sp-rankring-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle className="eb-sp-rankring-track" cx="50" cy="50" r={R} fill="none" />
          <circle className="eb-sp-rankring-fill" cx="50" cy="50" r={R} fill="none" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - p / 100)} transform="rotate(-90 50 50)" />
        </svg>
      </div>
      <img className="eb-sp-rankring-art" src={src} alt={alt} loading="lazy" decoding="async" />
    </div>
  );
}

/** The 25-stage Strength path — the ONE primary progression presentation (server values only). */
function StrengthStage({ strength }: { strength: StudentStrength }) {
  const stage = stagePresentationFromStrength(strength);
  return (
    <div className="eb-sp-rank-progress eb-sp-stage" data-stage={strength.stageNumber}>
      <div className="eb-sp-rank-hero">
        <StageRing src={stage.current.image} alt={stage.current.alt} value={strength.withinStagePoints} max={strength.stageBlockSize} percent={strength.stagePercent} progressLabel={stage.progressLabel} />
        <div className="eb-sp-rank-hero-text">
          <p className="eb-sp-rank-title eb-sp-stage-title">{stage.current.title}</p>
          <p className="eb-sp-stage-label">{stage.stageLabel}</p>
          <p className="eb-sp-stage-group">{stage.current.group.label}</p>
          <p className="eb-sp-rank-meta">
            <span className="eb-sp-rank-level eb-sp-stage-within" dir="ltr">{strength.withinStagePoints} / {strength.stageBlockSize}</span>
            <span className="eb-sp-rank-percent" dir="ltr">{strength.stagePercent}%</span>
          </p>
        </div>
      </div>
      <StrengthBreakdown strength={strength} />
      <p className={"eb-sp-rank-hint" + (stage.next ? " eb-sp-rank-next" : " eb-sp-stage-final")}>
        {stage.next && <img className="eb-sp-rank-next-art" src={stage.next.image} alt="" aria-hidden="true" width={40} height={40} loading="lazy" decoding="async" />}
        <span>{stage.remainingText}</span>
      </p>
    </div>
  );
}

export default function StudentProgressSection({ stats, medals, strength, recognition, averageFinalized }: Props) {
  const grouped = countMedals(medals);
  const medalCount = grouped.reduce((n, g) => n + g.count, 0);
  return (
    <section className="eb-sp-panel eb-sp-progress" aria-labelledby="eb-sp-progress-title">
      <SectionHeader level={2} id="eb-sp-progress-title" title="تقدّمي وقوتي" description="أرقامك من الواجبات المنشورة لصفك؛ المعدل من النتائج النهائية فقط، ومرحلتك في مسار القوة من نقاط القوة (الواجبات النهائية والتدريبات وتمارين الدراسة والألعاب التعليمية والمشاريع)، وتقديرك من الميداليات والتفاعلات والإنجازات." />
      <div className="eb-sp-stats">
        <StatCard label="المهام" value={stats.assigned} />
        <StatCard label="قيد الحل" value={stats.inProgress ?? 0} tone="info" />
        <StatCard label="بانتظار التصحيح" value={stats.pendingReview ?? 0} tone={(stats.pendingReview ?? 0) > 0 ? "attention" : "neutral"} />
        <StatCard label="مكتملة" value={stats.finalized ?? 0} tone="success" />
      </div>
      <div className="eb-sp-progress-row">
        <article className="eb-sp-average">
          <ProgressRing value={averageFinalized} label="المعدل النهائي" emptyText="لا يوجد معدل نهائي بعد" size={92} tone={averageFinalized !== null && averageFinalized >= 70 ? "success" : "primary"} />
          <p className="eb-sp-average-hint">من الواجبات النهائية فقط</p>
        </article>
        <div className="eb-sp-progression">
          {grouped.length > 0 ? (
            <ul className="eb-sp-medals" aria-label="ميدالياتك">
              {grouped.map(g => (
                <li key={g.tier}>
                  <IconMedal size={20} className={"eb-sp-medal is-" + g.tier} aria-hidden="true" />
                  <span aria-hidden="true">×{g.count}</span>
                  <VisuallyHidden>{g.count} ميدالية {MEDAL_LABELS[g.tier]}</VisuallyHidden>
                </li>
              ))}
            </ul>
          ) : (
            <p className="eb-sp-rank-hint">لا ميداليات بعد — 70% فأكثر في واجب نهائي تمنحك ميدالية.</p>
          )}
          {strength
            ? <StrengthStage strength={strength} />
            : <p className="eb-sp-rank-hint eb-sp-stage-unavailable">تعذّر تحميل مسار القوة الآن. سيظهر عند التحديث التالي.</p>}
        </div>
      </div>
      <RecognitionTiles recognition={recognition} medalCount={medalCount} />
    </section>
  );
}
