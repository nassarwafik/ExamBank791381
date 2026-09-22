import StatusBadge from "../ui/StatusBadge";
import { GAME_MODE_LABELS } from "./gameCatalog";
import type { GameDefinition } from "./domain/types";

/**
 * One RTL game card — the shared presentation used by BOTH the student hub and the teacher games page, so the two
 * surfaces can never drift. The "قريبًا" badge reflects the GAME's availability (its engine ships in a later phase).
 * The action is enabled only when the game is available AND the surface passes an `onStart`: a student opens an
 * available game ("ابدأ"); the teacher page passes no `onStart`, so an available game reads "متاح للطلاب" (disabled)
 * — the teacher area stays foundation-only, never a fake Start. A coming-soon game is always the disabled
 * "قريبًا — في المرحلة القادمة".
 *
 * `teacherAction` is an optional teacher-only authoring entry (e.g. the Live Challenge Generator): when provided it
 * renders an ENABLED action with that label regardless of `availability`, because authoring a challenge does not
 * require the live-play engine to exist yet. The student surface never passes it, so student rendering is unchanged.
 */
export default function GameCard({ game, headingLevel = 3, onStart, teacherAction }: { game: GameDefinition; headingLevel?: 2 | 3; onStart?: () => void; teacherAction?: { label: string; onClick: () => void } }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const comingSoon = game.availability === "coming-soon";
  const canStart = !comingSoon && !!onStart;
  const label = comingSoon ? "قريبًا — في المرحلة القادمة" : canStart ? "ابدأ" : "متاح للطلاب";
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
      {teacherAction ? (
        <button
          type="button"
          className="eb-button is-primary is-small eb-game-card-action eb-game-card-manage"
          onClick={teacherAction.onClick}
        >
          {teacherAction.label}
        </button>
      ) : (
        <button
          type="button"
          className="eb-button is-primary is-small eb-game-card-action"
          disabled={!canStart}
          aria-disabled={!canStart || undefined}
          onClick={canStart ? onStart : undefined}
        >
          {label}
        </button>
      )}
    </article>
  );
}
