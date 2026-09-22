import StatusBadge from "../ui/StatusBadge";
import { GAME_MODE_LABELS } from "./gameCatalog";
import type { GameDefinition } from "./domain/types";

/**
 * One RTL game card — the shared presentation used by BOTH the student hub and the teacher games page, so the two
 * surfaces can never drift. Phase 1: every game is "coming-soon", so the action is a clearly-disabled placeholder
 * ("قريبًا — في المرحلة القادمة"). There is NO gameplay here — clicking starts nothing. When an engine ships, its
 * phase passes an `onStart` and flips the game's availability; this component then enables the action.
 */
export default function GameCard({ game, headingLevel = 3, onStart }: { game: GameDefinition; headingLevel?: 2 | 3; onStart?: () => void }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const comingSoon = game.availability === "coming-soon" || !onStart;
  const titleId = "eb-game-card-" + game.id;
  return (
    <article className={"eb-game-card is-mode-" + game.mode} aria-labelledby={titleId} data-game-id={game.id}>
      <div className="eb-game-card-head">
        <StatusBadge tone={game.mode === "live" ? "info" : "neutral"} className="eb-game-mode">{GAME_MODE_LABELS[game.mode]}</StatusBadge>
        {comingSoon && <StatusBadge tone="warn" className="eb-game-soon">قريبًا</StatusBadge>}
      </div>
      <Heading id={titleId} className="eb-game-card-title">{game.nameAr}</Heading>
      <p className="eb-game-card-subtitle" dir="ltr">{game.name}</p>
      <p className="eb-game-card-desc">{game.descriptionAr}</p>
      <p className="eb-game-card-topic">{game.topicAr}</p>
      {game.highlightsAr.length > 0 && (
        <ul className="eb-game-card-highlights">
          {game.highlightsAr.map(h => <li key={h}>{h}</li>)}
        </ul>
      )}
      <button
        type="button"
        className="eb-button is-primary is-small eb-game-card-action"
        disabled={comingSoon}
        aria-disabled={comingSoon || undefined}
        onClick={comingSoon ? undefined : onStart}
      >
        {comingSoon ? "قريبًا — في المرحلة القادمة" : "ابدأ"}
      </button>
    </article>
  );
}
