import { useState } from "react";
import { IconChevronBack } from "../icons";
import GameCard from "./GameCard";
import { listGames } from "./gameCatalog";
import NumberConversionGame from "./numberConversion/NumberConversionGame";
import StudentLiveLobby from "./liveChallenge/StudentLiveLobby";
import type { GameId } from "./domain/types";
import "./games.css";

/**
 * "الألعاب التعليمية" — the student's DEDICATED Games destination (a full-view swap over the portal; `onBack`
 * returns to the normal portal). Phase 2: the Number Conversion Challenge is playable — its card "ابدأ" opens the
 * game as a NESTED full-view here (no React Router, no second navigation authority; a `العودة إلى الألعاب` back path
 * returns to the games list). Live Challenge stays coming-soon. Only available games receive an `onStart`.
 */
export default function StudentGamesPage({ token, onBack }: { token: string; onBack: () => void }) {
  const games = listGames();
  const [openGame, setOpenGame] = useState<GameId | null>(null);

  if (openGame === "number-conversion") {
    return <NumberConversionGame token={token} onBack={() => setOpenGame(null)} />;
  }
  if (openGame === "live-challenge") {
    return <StudentLiveLobby token={token} onBack={() => setOpenGame(null)} />;
  }

  return (
    <main className="student-portal eb-student-shell eb-games-surface" dir="rtl">
      <div className="eb-games-surface-bar">
        <button type="button" className="eb-button is-quiet is-small eb-games-back" onClick={onBack}>
          <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />العودة إلى لوحتي
        </button>
      </div>
      <section className="eb-games-page" aria-labelledby="eb-games-title">
        <header className="eb-games-page-head">
          <h1 id="eb-games-title" className="eb-games-page-title">الألعاب التعليمية</h1>
          <p className="eb-games-page-desc">اختر لعبة لتتدرّب وتتحدّى نفسك.</p>
        </header>
        <ul className="eb-game-cards" aria-label="الألعاب">
          {games.map(g => (
            <li key={g.id}>
              <GameCard
                game={g}
                onStart={g.id === "number-conversion" ? () => setOpenGame("number-conversion") : g.id === "live-challenge" ? () => setOpenGame("live-challenge") : undefined}
                startLabel={g.id === "live-challenge" ? "انضم إلى غرفة" : undefined}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
