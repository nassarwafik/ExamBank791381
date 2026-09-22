import { useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import GameCard from "./GameCard";
import { listGames } from "./gameCatalog";
import LiveChallengeGenerator from "./liveChallenge/LiveChallengeGenerator";
import "./games.css";

/**
 * The teacher "الألعاب التعليمية" page shell (the `games` nav destination). The shell's PageHeader already renders the
 * page's h1, so this page opens at h2. Number Conversion is student-only here (foundation card, no teacher hosting).
 * Phase 3B turns the Live Challenge card into an AUTHORING entry point: "إنشاء تحدٍّ" opens the Live Challenge
 * Generator as a nested full-view (no router, same swap pattern as the student games destination). This is authoring
 * only — no participant selection, lobby, join code, real-time session, medals or Strength (those are later phases).
 */
export default function TeacherGamesPage({ token }: { token: string }) {
  const games = listGames();
  const [authoring, setAuthoring] = useState(false);

  if (authoring) {
    return <LiveChallengeGenerator token={token} onBack={() => setAuthoring(false)} />;
  }

  return (
    <section className="eb-games-page eb-games-page--teacher" aria-labelledby="eb-games-page-title">
      <SectionHeader
        level={2}
        id="eb-games-page-title"
        title="الألعاب المتاحة"
        description="منصّة الألعاب التعليمية القابلة لإعادة الاستخدام — يمكنك الآن إنشاء تحدٍّ مباشر وتحضير أسئلته."
      />
      <ul className="eb-game-cards" aria-label="الألعاب">
        {games.map(g => (
          <li key={g.id}>
            <GameCard
              game={g}
              teacherAction={g.id === "live-challenge" ? { label: "إنشاء تحدٍّ", onClick: () => setAuthoring(true) } : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
