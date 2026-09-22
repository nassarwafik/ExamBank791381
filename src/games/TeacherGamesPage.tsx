import SectionHeader from "../ui/SectionHeader";
import GameCard from "./GameCard";
import { listGames } from "./gameCatalog";
import "./games.css";

/**
 * The teacher "الألعاب التعليمية" page shell (the `games` nav destination). The shell's PageHeader already renders
 * the page's h1 title, so this page opens at h2. Phase 1 is a foundation shell: it lists the same registered games
 * as coming-soon cards. Teacher hosting (create/select challenge, participant selection, live session) is built in
 * later phases and will render from here.
 */
export default function TeacherGamesPage() {
  const games = listGames();
  return (
    <section className="eb-games-page eb-games-page--teacher" aria-labelledby="eb-games-page-title">
      <SectionHeader
        level={2}
        id="eb-games-page-title"
        title="الألعاب المتاحة"
        description="منصّة الألعاب التعليمية القابلة لإعادة الاستخدام — الألعاب الفردية والمباشرة ستُدار من هنا في المراحل القادمة."
      />
      <ul className="eb-game-cards" aria-label="الألعاب">
        {games.map(g => <li key={g.id}><GameCard game={g} /></li>)}
      </ul>
    </section>
  );
}
