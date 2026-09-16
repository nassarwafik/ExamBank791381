import { AvatarCircle } from "../avatars";
import { IconMedal } from "../icons";
import { MEDAL_LABELS, type MedalTier } from "../medals";
import ProgressBar from "../ui/ProgressBar";
import ProgressRing from "../ui/ProgressRing";
import StatusBadge from "../ui/StatusBadge";
import VisuallyHidden from "../ui/VisuallyHidden";
import { RANK_MIN_FINALIZED, type RankProgress, type StudentRank } from "../studentRank";
import { countMedals } from "./portalPresentation";
import type { Classroom, StudentInfo } from "./types";

/**
 * Identity card (UX-7): avatar (with the personal rank frame), greeting, class, code, medals, the finalized-only
 * average ring and the rank badge — or, before the rank unlocks, the progression towards it. Presentation only:
 * every value arrives already derived from the server stats.
 */
type Props = {
  student: StudentInfo; classroom: Classroom | null; displayName: string;
  medals: MedalTier[]; rank: StudentRank | null; progress: RankProgress; averageFinalized: number | null;
  onChangeAvatar: () => void;
};

export default function StudentIdentityCard({ student, classroom, displayName, medals, rank, progress, averageFinalized, onChangeAvatar }: Props) {
  const name = student.displayName || displayName;
  const grouped = countMedals(medals);
  return (
    <section className="student-welcome-card eb-sp-identity" aria-labelledby="eb-sp-welcome">
      <div className="eb-sp-identity-main">
        <span className={"eb-sp-avatar-frame" + (rank ? " is-rank-" + rank.tier : "")}>
          <AvatarCircle avatarId={student.avatarId} fallbackLetter={(name || "؟").charAt(0)} size={64} onClick={onChangeAvatar} />
        </span>
        <div className="eb-sp-identity-text">
          <h2 id="eb-sp-welcome">مرحبًا {name}</h2>
          <p className="eb-muted">{classroom ? classroom.name + (classroom.grade ? " · " + classroom.grade : "") : "لم يتم ربط حسابك بصف بعد."}</p>
          <div className="eb-sp-identity-chips">
            <span className="eb-chip is-muted">الكود: <strong>{student.code}</strong></span>
            {rank && <StatusBadge tone="info" className="eb-sp-rank-badge"><IconMedal size={14} aria-hidden="true" />الرتبة: {rank.label}</StatusBadge>}
          </div>
        </div>
      </div>
      <div className="eb-sp-identity-side">
        <article className="eb-sp-average">
          <ProgressRing value={averageFinalized} label="المعدل النهائي" emptyText="لا يوجد معدل نهائي بعد" size={92} tone={averageFinalized !== null && averageFinalized >= 70 ? "success" : "primary"} />
          <p className="eb-sp-average-hint">من الواجبات النهائية فقط</p>
        </article>
        <div className="eb-sp-progression">
          {grouped.length > 0 ? (
            <ul className="eb-sp-medals" aria-label="ميدالياتك">
              {grouped.map(g => (
                <li key={g.tier}>
                  <IconMedal size={16} className={"eb-sp-medal is-" + g.tier} aria-hidden="true" />
                  <span aria-hidden="true">×{g.count}</span>
                  <VisuallyHidden>{g.count} ميدالية {MEDAL_LABELS[g.tier]}</VisuallyHidden>
                </li>
              ))}
            </ul>
          ) : (
            <p className="eb-sp-rank-hint">لا ميداليات بعد — 70% فأكثر في واجب نهائي تمنحك ميدالية.</p>
          )}
          {!rank && (
            <div className="eb-sp-rank-progress">
              <ProgressBar size="sm" label="الطريق إلى رتبتك" value={progress.percent} showValue={false} tone="series-2" />
              <p className="eb-sp-rank-hint">{progress.finalized} من {RANK_MIN_FINALIZED} واجبات نهائية لفتح الرتبة</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
