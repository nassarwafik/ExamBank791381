// Educational Games platform — the game definition registry (Phase 1 foundation).
//
// The ONE catalog of registered games. Student hub and teacher page both read from here, so a game appears in both
// surfaces from a single source. Two owner-approved games: Number Conversion (Phase 2 — now "available", playable
// in free play) and Live Challenge (still "coming-soon" — its engine lands in Phases 4–6). No scoring/session/medal/
// Strength logic lives here.
import type { GameDefinition, GameId, GameMode } from "./domain/types";

/** Arabic label for each play mode (Solo / Live Multiplayer). */
export const GAME_MODE_LABELS: Record<GameMode, string> = {
  solo: "فردي",
  live: "متعدد اللاعبين المباشر",
};

// Frozen so the registry can never be mutated at runtime; the two games are the approved Phase-1 scope.
const GAMES: readonly GameDefinition[] = Object.freeze([
  Object.freeze({
    id: "number-conversion",
    name: "Number Conversion Challenge",
    nameAr: "تحدّي أنظمة العد",
    mode: "solo",
    descriptionAr: "تدرّب على التحويل بين الأنظمة العددية باستخدام صناديق تفاعلية تُرشدك خطوة بخطوة.",
    topicAr: "العشري ↔ الثنائي ↔ السادس عشر",
    highlightsAr: Object.freeze(["صناديق تحويل تفاعلية", "مستويات مساعدة متدرّجة للمبتدئين"]),
    availability: "available",   // Phase 2: the Number Conversion engine ships — playable in free play.
  }) as GameDefinition,
  Object.freeze({
    id: "live-challenge",
    name: "Live Challenge",
    nameAr: "التحدّي المباشر",
    mode: "live",
    descriptionAr: "مسابقة صفّية مباشرة يديرها المعلم ويشارك فيها الطلاب المختارون في الوقت نفسه.",
    topicAr: "تعتمد على امتحاناتك وتدريباتك وبنك الأسئلة",
    highlightsAr: Object.freeze(["يستضيفها المعلم بشكل متزامن", "لوحة نتائج ومنصّة تتويج لأفضل خمسة"]),
    // Phase 4A: the multiplayer session LOBBY ships — a student can join a teacher-hosted room. The live quiz round
    // (questions/answers/scoring/leaderboard) still arrives in later phases.
    availability: "available",
  }) as GameDefinition,
]);

/** Every registered game, in display order. */
export function listGames(): readonly GameDefinition[] {
  return GAMES;
}

/** One game by id, or null when unknown. */
export function getGame(id: GameId): GameDefinition | null {
  return GAMES.find(g => g.id === id) ?? null;
}

/** The registered ids, in display order — runtime-frozen, consistent with the frozen GAMES registry. */
export const GAME_IDS: readonly GameId[] = Object.freeze(GAMES.map(g => g.id));
