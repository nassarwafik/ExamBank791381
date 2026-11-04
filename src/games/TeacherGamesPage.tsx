import { useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import GameCard from "./GameCard";
import { listGames } from "./gameCatalog";
import LiveChallengeGenerator from "./liveChallenge/LiveChallengeGenerator";
import TeacherNumberConversionPreview from "./numberConversion/TeacherNumberConversionPreview";
import "./games.css";
import { useCan } from "../shell/teacherAccessContext";

/**
 * The teacher "الألعاب التعليمية" page shell (the `games` nav destination). The shell's PageHeader already renders the
 * page's h1, so this page opens at h2. Number Conversion offers "معاينة اللعبة": a nested full-view teacher PREVIEW of
 * the same student game (non-persistent — no student record, no best record, no rewards).
 * Phase 3B turns the Live Challenge card into an AUTHORING entry point: "إنشاء تحدٍّ" opens the Live Challenge
 * Generator as a nested full-view (no router, same swap pattern as the student games destination). This is authoring
 * only — no participant selection, lobby, join code, real-time session, medals or Strength (those are later phases).
 * Both nested views render `embedded`: the teacher shell already owns the page's <main> and <h1>, so they render a <div>
 * root and an <h2> title (one <main>, one <h1> per page).
 */
/** Tadris+ P7-B2 — `openGames`: the games open to this teacher (the server's session answer); absent → every game, as before. */
export default function TeacherGamesPage({ token, openGames }: { token: string; openGames?: string[] }) {
  const games = listGames().filter(g => !openGames || openGames.includes(g.id));
  // Tadris+ P8-B1b (owner decision §19.30) — «إنشاء تحدٍّ» opens the challenge authoring, every request of which needs
  // games.challenge.create; a teacher who may only run games (games.session.run) is not offered it. Presentation only.
  const can = useCan(), mayAuthor = can("games.challenge.create");
  const [view, setView] = useState<"list" | "live-authoring" | "nc-preview">("list");

  if (view === "live-authoring") {
    return <LiveChallengeGenerator token={token} onBack={() => setView("list")} embedded />;
  }
  if (view === "nc-preview") {
    return <TeacherNumberConversionPreview token={token} onBack={() => setView("list")} embedded />;
  }

  return (
    <section className="eb-games-page eb-games-page--teacher" aria-labelledby="eb-games-page-title">
      <SectionHeader
        level={2}
        id="eb-games-page-title"
        title="الألعاب المتاحة"
        description={mayAuthor ? "منصّة الألعاب التعليمية القابلة لإعادة الاستخدام — يمكنك الآن إنشاء تحدٍّ مباشر وتحضير أسئلته." : "منصّة الألعاب التعليمية القابلة لإعادة الاستخدام."}
      />
      <ul className="eb-game-cards" aria-label="الألعاب">
        {games.map(g => (
          <li key={g.id}>
            <GameCard
              game={g}
              teacherAction={
                g.id === "live-challenge" && mayAuthor ? { label: "إنشاء تحدٍّ", onClick: () => setView("live-authoring") }
                : g.id === "number-conversion" ? { label: "معاينة اللعبة", onClick: () => setView("nc-preview") }
                : undefined
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
