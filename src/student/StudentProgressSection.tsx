import { IconMedal, IconHeart, IconSparkles } from "../icons";
import { MEDAL_LABELS, type MedalTier } from "../medals";
import ProgressRing from "../ui/ProgressRing";
import SectionHeader from "../ui/SectionHeader";
import StatCard from "../ui/StatCard";
import StatusBadge from "../ui/StatusBadge";
import VisuallyHidden from "../ui/VisuallyHidden";
import { remainingPointsPhrase, type StrengthProgress, type StudentRank } from "../studentRank";
import { RANK_VISUALS } from "../studentRankVisuals";
import { countMedals } from "./portalPresentation";
import { REACTIONS } from "../achievements";
import type { Stats, StudentRecognition, StudentStrength } from "./types";

/**
 * "تقدّمي" (UX-7a): the server's own counts as StatCards, the finalized-only average as a ring (always with a
 * textual equivalent), medals (finalized-only) and the personal rank — the custom rank artwork sitting inside a
 * circular progress ring that fills toward the next tier, with the numeric level and the percentage shown.
 * The ring and the tier follow the UNIFIED STRENGTH POINTS (نقاط القوة: finalized exams + T-series practice +
 * projects) the server derived; the breakdown is shown so a project-only student sees exactly why the ring moves.
 * Presentation only: nothing here recomputes a rank, a tier, a percentage or a point.
 */
type Props = { stats: Stats; medals: MedalTier[]; rank: StudentRank | null; progress: StrengthProgress; strength: StudentStrength | null; recognition: StudentRecognition | null; averageFinalized: number | null };

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

/** «نقاط القوة: 520» + the three-source breakdown. */
function StrengthBreakdown({ strength }: { strength: StudentStrength | null }) {
  if (!strength) return null;
  return (
    <div className="eb-sp-strength" aria-label="نقاط القوة">
      <p className="eb-sp-strength-total">نقاط القوة: <strong>{strength.totalPoints}</strong></p>
      <ul className="eb-sp-strength-breakdown">
        <li><span>الواجبات النهائية</span><strong>{strength.examPoints}</strong></li>
        <li><span>التدريبات</span><strong>{strength.practicePoints}</strong></li>
        <li><span>المشاريع</span><strong>{strength.projectPoints}</strong></li>
      </ul>
    </div>
  );
}

// A dependency-free SVG circular progress ring with the custom rank artwork centered inside it. The two circles
// are decorative (aria-hidden); the ACCESSIBLE progress semantic is a role="progressbar" wrapper carrying the
// authoritative percent — but only when `progressLabel` is given (there is real progress toward a next tier).
// At the top rank the ring is a full, purely-decorative 100% flourish (no "toward next" semantic). The artwork is
// shown untouched (object-fit:contain, never cropped); when `muted` it is a locked/preview image (alt="").
function RankRing({ src, alt, percent, progressLabel, muted }: { src: string; alt: string; percent: number; progressLabel?: string; muted?: boolean }) {
  const R = 45;
  const C = 2 * Math.PI * R;
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const svg = (
    <svg className="eb-sp-rankring-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle className="eb-sp-rankring-track" cx="50" cy="50" r={R} fill="none" />
      <circle className="eb-sp-rankring-fill" cx="50" cy="50" r={R} fill="none" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - p / 100)} transform="rotate(-90 50 50)" />
    </svg>
  );
  return (
    <div className={"eb-sp-rankring" + (muted ? " is-locked" : "")}>
      {progressLabel
        ? <div className="eb-sp-rankring-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={progressLabel}>{svg}</div>
        : svg}
      <img className="eb-sp-rankring-art" src={src} alt={muted ? "" : alt} aria-hidden={muted || undefined} loading="lazy" decoding="async" />
    </div>
  );
}

export default function StudentProgressSection({ stats, medals, rank, progress, strength, recognition, averageFinalized }: Props) {
  const grouped = countMedals(medals);
  const medalCount = grouped.reduce((n, g) => n + g.count, 0);
  // The ring's percentage comes ONLY from the authoritative Strength progress (never the average):
  //   • before the first rank → progress.percent (points toward unlocking level 1, within the 400-point block)
  //   • an earned rank with a next tier → rank.next.percent (through the current 400-point block)
  //   • legendary (no next) → a full 100% decorative ring.
  return (
    <section className="eb-sp-panel eb-sp-progress" aria-labelledby="eb-sp-progress-title">
      <SectionHeader level={2} id="eb-sp-progress-title" title="تقدّمي وقوتي" description="أرقامك من الواجبات المنشورة لصفك؛ المعدل من النتائج النهائية فقط، ورتبتك من نقاط القوة (الواجبات النهائية والتدريبات والمشاريع)، وتقديرك من الميداليات والتفاعلات والإنجازات." />
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
          {rank ? (
            rank.next ? (
              // Earned rank with a next tier: full-colour artwork in a ring filling toward the next rank.
              <div className="eb-sp-rank-progress">
                <div className="eb-sp-rank-hero">
                  <RankRing src={RANK_VISUALS[rank.tier].image} alt={RANK_VISUALS[rank.tier].alt} percent={rank.next.percent} progressLabel={"التقدم نحو رتبة " + rank.next.label} />
                  <div className="eb-sp-rank-hero-text">
                    <p className="eb-sp-rank-title">{RANK_VISUALS[rank.tier].title}</p>
                    <p className="eb-sp-rank"><StatusBadge tone="info" className="eb-sp-rank-badge"><IconMedal size={18} aria-hidden="true" />الرتبة: {rank.label}</StatusBadge><span className="eb-sp-rank-hint">بـ {rank.points} نقطة قوة</span></p>
                    <p className="eb-sp-rank-meta"><span className="eb-sp-rank-level">المستوى {RANK_VISUALS[rank.tier].level}</span><span className="eb-sp-rank-percent" aria-hidden="true">{Math.round(rank.next.percent)}%</span></p>
                  </div>
                </div>
                <StrengthBreakdown strength={strength} />
                <p className="eb-sp-rank-hint eb-sp-rank-next">
                  <img className="eb-sp-rank-next-art" src={RANK_VISUALS[rank.next.tier].image} alt="" aria-hidden="true" width={40} height={40} loading="lazy" decoding="async" />
                  <span>{remainingPointsPhrase(rank.next.remaining)} للوصول إلى رتبة {rank.next.label}</span>
                </p>
                <p className="eb-sp-rank-hint">التقدم نحو المستوى التالي: {progress.withinBlock} / {progress.needed}</p>
              </div>
            ) : (
              // Legendary (top rank): the artwork with a full, decorative 100% ring — no next-tier target/thumbnail.
              <div className="eb-sp-rank-progress">
                <div className="eb-sp-rank-hero">
                  <RankRing src={RANK_VISUALS[rank.tier].image} alt={RANK_VISUALS[rank.tier].alt} percent={100} />
                  <div className="eb-sp-rank-hero-text">
                    <p className="eb-sp-rank-title">{RANK_VISUALS[rank.tier].title}</p>
                    <p className="eb-sp-rank"><StatusBadge tone="info" className="eb-sp-rank-badge"><IconMedal size={18} aria-hidden="true" />الرتبة: {rank.label}</StatusBadge><span className="eb-sp-rank-hint">بـ {rank.points} نقطة قوة</span></p>
                    <p className="eb-sp-rank-meta"><span className="eb-sp-rank-level">المستوى {RANK_VISUALS[rank.tier].level}</span><span className="eb-sp-rank-percent">100%</span></p>
                  </div>
                </div>
                <StrengthBreakdown strength={strength} />
                <p className="eb-sp-rank-hint">بلغت أعلى رتبة</p>
              </div>
            )
          ) : (
            // Before the first rank: a MUTED/LOCKED preview of level 1 in a ring filling toward unlocking it.
            <div className="eb-sp-rank-progress">
              <div className="eb-sp-rank-hero">
                <RankRing src={RANK_VISUALS.beginner.image} alt="" muted percent={progress.percent} progressLabel="الطريق إلى رتبتك" />
                <div className="eb-sp-rank-hero-text">
                  <p className="eb-sp-rank-hint">الرتبة القادمة</p>
                  <p className="eb-sp-rank-title is-muted">{RANK_VISUALS.beginner.title}</p>
                  <p className="eb-sp-rank-meta"><span className="eb-sp-rank-level">المستوى {RANK_VISUALS.beginner.level}</span><span className="eb-sp-rank-percent" aria-hidden="true">{Math.round(progress.percent)}%</span></p>
                </div>
              </div>
              <StrengthBreakdown strength={strength} />
              <p className="eb-sp-rank-hint">{progress.withinBlock} من {progress.needed} نقطة قوة لفتح رتبتك</p>
            </div>
          )}
        </div>
      </div>
      <RecognitionTiles recognition={recognition} medalCount={medalCount} />
    </section>
  );
}
