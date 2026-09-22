import { IconChevronBack } from "../icons";
import GameCard from "./GameCard";
import { listGames } from "./gameCatalog";
import "./games.css";

/**
 * "الألعاب التعليمية" — the student's DEDICATED Games destination. It is not a dashboard section: the portal swaps
 * its whole view to this surface (the same full-view pattern as the Reader / exam page) when the student opens Games
 * from the shell top bar, and `onBack` returns to the normal portal. Phase 1 shows the two approved games as
 * coming-soon cards; there is no gameplay and no server read.
 */
export default function StudentGamesPage({ onBack }: { onBack: () => void }) {
  const games = listGames();
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
          <p className="eb-games-page-desc">اختر لعبة لتتدرّب وتتحدّى نفسك — ألعاب جديدة تصل قريبًا.</p>
        </header>
        <ul className="eb-game-cards" aria-label="الألعاب">
          {games.map(g => <li key={g.id}><GameCard game={g} /></li>)}
        </ul>
      </section>
    </main>
  );
}
