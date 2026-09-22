import { IconMedal, IconHeart, IconSparkles } from "../icons";
import { MEDAL_LABELS, type MedalTier } from "../medals";
import ProgressRing from "../ui/ProgressRing";
import SectionHeader from "../ui/SectionHeader";
import StatCard from "../ui/StatCard";
import StatusBadge from "../ui/StatusBadge";
import VisuallyHidden from "../ui/VisuallyHidden";
import { remainingPointsPhrase, stageView } from "./strengthPresentation";
import { countMedals } from "./portalPresentation";
import { REACTIONS } from "../achievements";
import type { Stats, StudentRecognition, StudentStrength } from "./types";

/**
 * "تقدّمي" (UX-7a): the server's own counts as StatCards, the finalized-only average as a ring (always with a
 * textual equivalent), medals (finalized-only) and the personal STRENGTH STAGE — the current stage's uploaded
 * artwork sitting inside a circular progress ring that fills toward the next stage, with the stage number and the
 * percentage shown. The ring, the stage and every point are the SERVER's `dashboard.strength` (25-stage model:
 * library trainings + book-module completion); the breakdown is shown so a student sees exactly why the ring moves.
 * Presentation only: nothing here recomputes a stage, a threshold, a percentage or a point.
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

/** «نقاط القوة: 520» + the two authoritative sources (library trainings + book-module completion). */
function StrengthBreakdown({ strength }: { strength: StudentStrength | null }) {
  if (!strength) return null;
  return (
    <div className="eb-sp-strength" aria-label="نقاط القوة">
      <p className="eb-sp-strength-total">نقاط القوة: <strong>{strength.totalPoints}</strong> / {strength.totalMax}</p>
      <ul className="eb-sp-strength-breakdown">
        <li><span>تدريبات المكتبة</span><strong>{strength.libraryPoints}</strong></li>
        <li><span>إتمام دروس الكتاب</span><strong>{strength.modulePoints}</strong></li>
      </ul>
    </div>
  );
}

// A dependency-free SVG circular progress ring with the current stage's uploaded artwork centered inside it. The two
// circles are decorative (aria-hidden); the ACCESSIBLE progress semantic is a role="progressbar" wrapper carrying the
// authoritative percent — but only when `progressLabel` is given (there is real progress toward a next stage). At the
// top stage the ring is a full, purely-decorative 100% flourish (no "toward next" semantic). The artwork is shown
// untouched (object-fit:contain, never cropped).
function StageRing({ src, alt, percent, progressLabel, band }: { src: string; alt: string; percent: number; progressLabel?: string; band: number }) {
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
    <div className={"eb-sp-rankring is-stage-band-" + band}>
      {progressLabel
        ? <div className="eb-sp-rankring-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={progressLabel}>{svg}</div>
        : svg}
      <img className="eb-sp-rankring-art" src={src} alt={alt} loading="lazy" decoding="async" />
    </div>
  );
}

/** The Strength STAGE hero: the current stage's uploaded icon in a ring toward the next stage, name, number, points. */
function StrengthStageHero({ strength }: { strength: StudentStrength | null }) {
  const v = stageView(strength);
  const band = Math.min(5, Math.max(1, Math.ceil(v.stage / 5)));
  return (
    <div className="eb-sp-rank-progress">
      <div className="eb-sp-rank-hero">
        <StageRing src={v.def.image} alt={v.def.alt} percent={v.percent} band={band}
          progressLabel={v.isMax ? undefined : ("التقدم نحو " + (v.nextDef ? v.nextDef.name : "المرحلة التالية"))} />
        <div className="eb-sp-rank-hero-text">
          <p className="eb-sp-rank-title">{v.name}</p>
          <p className="eb-sp-rank">
            <StatusBadge tone="info" className="eb-sp-rank-badge"><IconMedal size={18} aria-hidden="true" />المرحلة {v.stage} من {v.stageCount}</StatusBadge>
            <span className="eb-sp-rank-hint">{v.totalPoints} / {v.totalMax} نقطة قوة</span>
          </p>
          <p className="eb-sp-rank-meta"><span className="eb-sp-rank-level">المرحلة {v.stage}</span><span className="eb-sp-rank-percent" aria-hidden="true">{v.percent}%</span></p>
        </div>
      </div>
      <StrengthBreakdown strength={strength} />
      {v.isMax ? (
        <p className="eb-sp-rank-hint">بلغت المرحلة الأخيرة — أعلى قوة</p>
      ) : (
        <p className="eb-sp-rank-hint eb-sp-rank-next">
          {v.nextDef && <img className="eb-sp-rank-next-art" src={v.nextDef.image} alt="" aria-hidden="true" width={40} height={40} loading="lazy" decoding="async" />}
          <span>{remainingPointsPhrase(v.nextStageRemaining)} للوصول إلى {v.nextDef ? v.nextDef.name : "المرحلة التالية"}{v.nextStage ? " (المرحلة " + v.nextStage + ")" : ""}</span>
        </p>
      )}
      <p className="eb-sp-rank-hint">التقدم في هذه المرحلة: {v.withinStagePoints} / {v.stageSpan}</p>
    </div>
  );
}

export default function StudentProgressSection({ stats, medals, strength, recognition, averageFinalized }: Props) {
  const grouped = countMedals(medals);
  const medalCount = grouped.reduce((n, g) => n + g.count, 0);
  // The ring's percentage is ONLY the authoritative Strength stage progress (never the academic average): the server
  // decides the stage (1..25) and the within-stage progress; at the top stage the ring is a full decorative 100%.
  return (
    <section className="eb-sp-panel eb-sp-progress" aria-labelledby="eb-sp-progress-title">
      <SectionHeader level={2} id="eb-sp-progress-title" title="تقدّمي وقوتي" description="أرقامك من الواجبات المنشورة لصفك؛ المعدل من النتائج النهائية فقط، ومرحلة قوتك من نقاط القوة (تدريبات المكتبة وإتمام دروس الكتاب)، وتقديرك من الميداليات والتفاعلات والإنجازات." />
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
          <StrengthStageHero strength={strength} />
        </div>
      </div>
      <RecognitionTiles recognition={recognition} medalCount={medalCount} />
    </section>
  );
}
