import "../games.css";

// Live Challenge — LEADERBOARD + PODIUM (Phase 4C, presentation only). Renders the SERVER-DERIVED competition standings
// the teacher/student views already computed. It NEVER computes ranking or points itself and NEVER reads raw grades: it
// only displays `{ displayName, points, correctCount, answeredCount, rank, you? }` rows the server produced. The medal
// symbols on the finished podium are DECORATIVE recognition only — no persisted medals/Strength/gamePoints (Phase 4D).
// The current student's own row is marked with the TEXT «أنت» (never colour-only), so the highlight survives a
// monochrome / high-contrast view.

export interface LeaderboardEntry {
  displayName: string;
  points: number;
  correctCount: number;
  answeredCount: number;
  rank: number;
  you?: boolean;
}

// Top-3 podium symbols, indexed by (rank − 1). Ranks are always the sequential 1,2,3,… the server assigns.
const MEDALS = ["🥇", "🥈", "🥉"];
const PLACE_LABELS = ["المركز الأول", "المركز الثاني", "المركز الثالث"];

/** The active-round / full-list standings table (rank · name · competition points, with a small correct-count note).
 *  Renders nothing when there are no rows, so a caller can mount it unconditionally. */
export function LiveStandingsTable({ standings, title }: { standings: LeaderboardEntry[]; title: string }) {
  if (!standings || standings.length === 0) return null;
  return (
    <div className="eb-lc-standings" role="region" aria-label={title}>
      <h3 className="eb-lc-standings-title">{title}</h3>
      <ol className="eb-lc-standings-list">
        {standings.map(s => (
          <li key={s.rank} className={"eb-lc-standings-row" + (s.you ? " is-you" : "")}>
            <span className="eb-lc-standings-rank" dir="ltr" aria-hidden="true">{s.rank}</span>
            <span className="eb-lc-standings-name">
              {s.displayName || "—"}
              {s.you && <span className="eb-lc-you-badge">أنت</span>}
            </span>
            <span className="eb-lc-standings-correct" dir="ltr" aria-hidden="true">{s.correctCount}/{s.answeredCount}</span>
            <span className="eb-lc-standings-points"><span dir="ltr">{s.points}</span> نقطة</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The finished Top-3 podium (🥇🥈🥉). Shows AT MOST three places and never fabricates an empty place: with one or two
 *  participants it renders one or two. Renders nothing when there are no participants at all. */
export function LivePodium({ standings }: { standings: LeaderboardEntry[] }) {
  const top = (standings || []).slice(0, 3);
  if (top.length === 0) return null;
  return (
    <div className="eb-lc-podium" role="region" aria-label="المراكز الأولى">
      {top.map(s => (
        <div key={s.rank} className={"eb-lc-podium-place eb-lc-podium-rank-" + s.rank + (s.you ? " is-you" : "")}
          aria-label={(PLACE_LABELS[s.rank - 1] || ("المركز " + s.rank)) + ": " + (s.displayName || "—")}>
          <span className="eb-lc-podium-medal" aria-hidden="true">{MEDALS[s.rank - 1] || "🏅"}</span>
          <span className="eb-lc-podium-name">
            {s.displayName || "—"}
            {s.you && <span className="eb-lc-you-badge">أنت</span>}
          </span>
          <span className="eb-lc-podium-points"><span dir="ltr">{s.points}</span> نقطة</span>
        </div>
      ))}
    </div>
  );
}
