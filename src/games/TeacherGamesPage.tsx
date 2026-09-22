import { useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import GameCard from "./GameCard";
import { listGames } from "./gameCatalog";
import LiveChallengeGenerator from "./liveChallenge/LiveChallengeGenerator";
import TeacherNumberConversionPreview from "./numberConversion/TeacherNumberConversionPreview";
import "./games.css";

/**
 * The teacher "الألعاب التعليمية" page shell (the `games` nav destination). The shell's PageHeader already renders the
 * page's h1, so this page opens at h2. Number Conversion offers "معاينة اللعبة": a nested full-view teacher PREVIEW of
 * the same student game (non-persistent — no student record, no best record, no rewards).
 * Phase 3B turns the Live Challenge card into an AUTHORING entry point: "إنشاء تحدٍّ" opens the Live Challenge
 * Generator as a nested full-view (no router, same swap pattern as the student games destination). This is authoring
 * only — no participant selection, lobby, join code, real-time session, medals or Strength (those are later phases).
 */
export default function TeacherGamesPage({ token }: { token: string }) {
  const games = listGames();
  const [view, setView] = useState<"list" | "live-authoring" | "nc-preview">("list");

  if (view === "live-authoring") {
    return <LiveChallengeGenerator token={token} onBack={() => setView("list")} />;
  }
  if (view === "nc-preview") {
    return <TeacherNumberConversionPreview token={token} onBack={() => setView("list")} />;
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
              teacherAction={
                g.id === "live-challenge" ? { label: "إنشاء تحدٍّ", onClick: () => setView("live-authoring") }
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
