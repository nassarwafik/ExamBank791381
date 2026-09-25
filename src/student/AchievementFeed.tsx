import { REACTIONS, eventTypeOf, feedEventParts, type FeedPost, type ReactionId } from "../achievements";
import { IconMedal } from "../icons";
import { MEDAL_LABELS } from "../medals";
import { RANK_LABELS, type RankTier } from "../studentRank";
import { RANK_VISUALS } from "../studentRankVisuals";
import { stageVisual } from "../studentStageVisuals";
import EmptyState from "../ui/EmptyState";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import VisuallyHidden from "../ui/VisuallyHidden";
import { isRecent } from "./portalPresentation";

/**
 * Class achievement feed (UX-7): newest first (server order), "جديد" for posts of the last 7 days, the student's
 * own posts highlighted, the teacher's reaction and note surfaced, reactions as pressed chips. The share toggle
 * and reactions are the ONLY writes on this surface and each maps to one explicit user action.
 */
type Props = {
  posts: FeedPost[]; error: string; shareOn: boolean; shareSaving: boolean; now: number;
  onToggleShare: () => void; onReact: (postId: string, reaction: ReactionId) => void;
  highlightPostId?: string;   // Phase 6D — a teacher-recognition notification points at this post (focused + marked)
};

// Labels: the 25-stage title for stage-era global events; the LEGACY six-rank titles for historical global events
// and for project ranks (the Project Tracker keeps its own six-tier ladder).
const LABELS = { medal: (tier: string) => MEDAL_LABELS[tier as keyof typeof MEDAL_LABELS] || tier, rank: (tier: string) => (RANK_VISUALS[tier as RankTier]?.title) || RANK_LABELS[tier as RankTier] || tier, stage: (n: number) => stageVisual(n).title };

/** The event's leading visual: the medal icon, the stage artwork (stage-era global events), or the legacy six-rank
 *  artwork (historical global events, project events). */
function EventIcon({ post }: { post: FeedPost }) {
  const type = eventTypeOf(post);
  if (type === "medal") {
    const tier = post.medal?.tier || post.tier || "bronze";
    return <span className={"eb-sp-medal-icon is-" + tier} aria-hidden="true"><IconMedal size={26} /></span>;
  }
  const stageNumber = Number(post.stage?.stageNumber);
  if (type === "global_rank_up" && Number.isInteger(stageNumber) && stageNumber >= 1) {
    return <img className="eb-sp-feed-rank-art is-global_rank_up is-stage" src={stageVisual(stageNumber).image} alt="" aria-hidden="true" width={40} height={40} loading="lazy" decoding="async" />;
  }
  const tier = (type === "global_rank_up" ? post.rank?.tier : post.project?.tier) || "beginner";
  const v = RANK_VISUALS[tier as RankTier] || RANK_VISUALS.beginner;
  return <img className={"eb-sp-feed-rank-art is-" + type} src={v.image} alt="" aria-hidden="true" width={40} height={40} loading="lazy" decoding="async" />;
}

export default function AchievementFeed({ posts, error, shareOn, shareSaving, now, onToggleShare, onReact, highlightPostId }: Props) {
  return (
    <section className="eb-sp-panel eb-sp-feed" aria-labelledby="eb-sp-feed-title">
      <SectionHeader level={2} id="eb-sp-feed-title" title="إنجازات الصف" description="أحدث الإنجازات والتقدّم في صفك"
        actions={<label className="eb-sp-share"><input type="checkbox" checked={shareOn} disabled={shareSaving} onChange={onToggleShare} />شارك إنجازاتي مع الصف</label>} />
      {error && <div className="platform-error" role="alert">{error}</div>}
      {posts.length ? (
        <ul className="eb-sp-feed-list">
          {posts.map(post => {
            const teacher = post.teacherReaction ? REACTIONS.find(r => r.id === post.teacherReaction) : null;
            return (
              <li key={post.postId}>
                <article id={"eb-sp-post-" + post.postId} tabIndex={-1} data-post-id={post.postId} className={"eb-sp-feed-item is-" + eventTypeOf(post) + (post.isOwnPost ? " is-own" : "") + (highlightPostId === post.postId ? " is-highlighted" : "")} data-event-type={eventTypeOf(post)}>
                  <EventIcon post={post} />
                  <div className="eb-sp-feed-body">
                    <p className="eb-sp-feed-text">{feedEventParts(post, LABELS).map((part, i) => part.strong ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>)}</p>
                    {(isRecent(post.createdAt, now) || post.isOwnPost || teacher) && (
                      <div className="eb-sp-feed-tags">
                        {isRecent(post.createdAt, now) && <StatusBadge tone="info">جديد</StatusBadge>}
                        {post.isOwnPost && <StatusBadge tone="success">إنجازك</StatusBadge>}
                        {teacher && <StatusBadge tone="neutral" className="eb-sp-teacher-reaction"><span aria-hidden="true">{teacher.emoji}</span>{teacher.label} من المعلم</StatusBadge>}
                      </div>
                    )}
                    <div className="eb-sp-reactions" role="group" aria-label="ردود الفعل">
                      {REACTIONS.map(r => {
                        const count = post.reactionCounts[r.id] > 0 ? post.reactionCounts[r.id] : 0;
                        return (
                          <button key={r.id} type="button" className="eb-chip-button eb-sp-reaction" aria-pressed={post.myReaction === r.id} disabled={post.isOwnPost} onClick={() => onReact(post.postId, r.id)}>
                            <span aria-hidden="true">{r.emoji}</span>
                            <VisuallyHidden>{r.label}</VisuallyHidden>
                            {count > 0 && <span className="eb-sp-reaction-count">{count}</span>}
                          </button>
                        );
                      })}
                    </div>
                    {post.teacherNote && <p className="eb-sp-feed-note">كلمة من المعلم: {post.teacherNote}</p>}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact title="لا توجد إنجازات بعد" description="عندما يحقق أحد طلاب الصف إنجازًا سيظهر هنا." />
      )}
    </section>
  );
}
