import { REACTIONS, type FeedPost, type ReactionId } from "../achievements";
import { IconMedal } from "../icons";
import { MEDAL_LABELS } from "../medals";
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
};

export default function AchievementFeed({ posts, error, shareOn, shareSaving, now, onToggleShare, onReact }: Props) {
  return (
    <section className="eb-sp-panel eb-sp-feed" aria-labelledby="eb-sp-feed-title">
      <SectionHeader level={2} id="eb-sp-feed-title" title="إنجازات الصف" description="أحدث الميداليات في صفك"
        actions={<label className="eb-sp-share"><input type="checkbox" checked={shareOn} disabled={shareSaving} onChange={onToggleShare} />شارك إنجازاتي مع الصف</label>} />
      {error && <div className="platform-error" role="alert">{error}</div>}
      {posts.length ? (
        <ul className="eb-sp-feed-list">
          {posts.map(post => {
            const teacher = post.teacherReaction ? REACTIONS.find(r => r.id === post.teacherReaction) : null;
            return (
              <li key={post.postId}>
                <article className={"eb-sp-feed-item" + (post.isOwnPost ? " is-own" : "")}>
                  <span className={"eb-sp-medal-icon is-" + post.tier} aria-hidden="true"><IconMedal size={26} /></span>
                  <div className="eb-sp-feed-body">
                    <p className="eb-sp-feed-text"><strong>{post.studentDisplayName}</strong> حصل على ميدالية {MEDAL_LABELS[post.tier]} في <strong>{post.assignmentTitle}</strong></p>
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
        <EmptyState compact title="لا توجد إنجازات بعد" description="عندما يحصل أحد زملائك على ميدالية سيظهر هنا." />
      )}
    </section>
  );
}
