import { IconMedal } from "../icons";
import { MEDAL_LABELS, type MedalTier } from "../medals";
import ProgressBar from "../ui/ProgressBar";
import ProgressRing from "../ui/ProgressRing";
import SectionHeader from "../ui/SectionHeader";
import StatCard from "../ui/StatCard";
import StatusBadge from "../ui/StatusBadge";
import VisuallyHidden from "../ui/VisuallyHidden";
import { RANK_STEP_FINALIZED, remainingExamsPhrase, type RankProgress, type StudentRank } from "../studentRank";
import { RANK_VISUALS } from "../studentRankVisuals";
import { countMedals } from "./portalPresentation";
import type { Stats } from "./types";

/**
 * "تقدّمي" (UX-7a): the server's own counts as StatCards, the finalized-only average as a ring (always with a
 * textual equivalent), medals (finalized-only) and the personal rank badge with the progress to the next tier — or,
 * before the rank unlocks, the progression towards it.
 * Presentation only: every value arrives already derived from the authoritative dashboard stats.
 */
type Props = { stats: Stats; medals: MedalTier[]; rank: StudentRank | null; progress: RankProgress; averageFinalized: number | null };

export default function StudentProgressSection({ stats, medals, rank, progress, averageFinalized }: Props) {
  const grouped = countMedals(medals);
  return (
    <section className="eb-sp-panel eb-sp-progress" aria-labelledby="eb-sp-progress-title">
      <SectionHeader level={2} id="eb-sp-progress-title" title="تقدّمي" description="أرقامك من الواجبات المنشورة لصفك؛ المعدل من النتائج النهائية فقط." />
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
            <div className="eb-sp-rank-progress">
              <div className="eb-sp-rank-hero">
                <img className="eb-sp-rank-art" src={RANK_VISUALS[rank.tier].image} alt={RANK_VISUALS[rank.tier].alt} width={112} height={112} loading="lazy" decoding="async" />
                <div className="eb-sp-rank-hero-text">
                  <p className="eb-sp-rank-title">{RANK_VISUALS[rank.tier].title}</p>
                  <p className="eb-sp-rank"><StatusBadge tone="info" className="eb-sp-rank-badge"><IconMedal size={18} aria-hidden="true" />الرتبة: {rank.label}</StatusBadge><span className="eb-sp-rank-hint">من {rank.finalized} واجبات نهائية</span></p>
                </div>
              </div>
              {rank.next ? (
                <>
                  <ProgressBar size="sm" label={"نحو رتبة " + rank.next.label} value={rank.next.percent} tone="series-2" />
                  <p className="eb-sp-rank-hint eb-sp-rank-next">
                    <img className="eb-sp-rank-next-art" src={RANK_VISUALS[rank.next.tier].image} alt="" aria-hidden="true" width={40} height={40} loading="lazy" decoding="async" />
                    <span>{remainingExamsPhrase(rank.next.remaining)} للوصول إلى رتبة {rank.next.label}</span>
                  </p>
                </>
              ) : (
                <p className="eb-sp-rank-hint">بلغت أعلى رتبة</p>
              )}
            </div>
          ) : (
            <div className="eb-sp-rank-progress">
              <div className="eb-sp-rank-hero is-preview">
                <img className="eb-sp-rank-art is-locked" src={RANK_VISUALS.beginner.image} alt="" aria-hidden="true" width={112} height={112} loading="lazy" decoding="async" />
                <div className="eb-sp-rank-hero-text">
                  <p className="eb-sp-rank-hint">الرتبة القادمة</p>
                  <p className="eb-sp-rank-title is-muted">{RANK_VISUALS.beginner.title}</p>
                </div>
              </div>
              <ProgressBar size="sm" label="الطريق إلى رتبتك" value={progress.percent} showValue={false} tone="series-2" />
              <p className="eb-sp-rank-hint">{progress.finalized} من {RANK_STEP_FINALIZED} امتحانات نهائية لفتح رتبتك</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
