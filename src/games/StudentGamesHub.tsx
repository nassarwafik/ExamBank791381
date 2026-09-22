import SectionHeader from "../ui/SectionHeader";
import GameCard from "./GameCard";
import { listGames } from "./gameCatalog";
import "./games.css";

/**
 * "الألعاب التعليمية" — the student games hub, a self-contained portal section (same shape as the other
 * eb-sp-panel sections). Phase 1 shows the two approved games as coming-soon cards; there is no gameplay and no
 * server read. Later phases give a game an `onStart` (a full-screen swap in StudentPortal, like the Reader) once
 * its engine exists.
 */
export default function StudentGamesHub() {
  const games = listGames();
  return (
    <section className="eb-sp-panel eb-games-hub" aria-labelledby="eb-games-title">
      <SectionHeader level={2} id="eb-games-title" title="الألعاب التعليمية" description="ألعاب تُدرّبك وتتحدّاك — تصل قريبًا." />
      <ul className="eb-game-cards" aria-label="الألعاب">
        {games.map(g => <li key={g.id}><GameCard game={g} /></li>)}
      </ul>
    </section>
  );
}
