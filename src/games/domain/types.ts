// Educational Games platform — shared domain types (Phase 1 foundation).
//
// This is the small, reusable vocabulary the later phases build on. It deliberately describes ONLY what Phase 1
// needs: identifying a game, its play mode, and whether its engine exists yet. Gameplay, scoring, sessions, medals
// and Strength are NOT modeled here — they arrive in their own phases so this file never grows speculative shapes.

/** The registered games. New games are added here (and to the catalog) as their phases land. */
export type GameId = "number-conversion" | "live-challenge";

/** How a game is played: a single student on their own, or a live teacher-hosted multiplayer session. */
export type GameMode = "solo" | "live";

/**
 * Whether a game can be played right now.
 *  - "available"   : its engine exists and the student/teacher can start it.
 *  - "coming-soon" : registered and shown, but the engine arrives in a later phase (Phase 1: BOTH games are coming-soon).
 */
export type GameAvailability = "available" | "coming-soon";

/** The static, presentation-level definition of one game (no gameplay/config logic — that lives in each engine's phase). */
export interface GameDefinition {
  id: GameId;
  /** Internal / English name (shown as a secondary line, LTR). */
  name: string;
  /** Arabic display name — the primary, RTL title. */
  nameAr: string;
  mode: GameMode;
  /** One-line Arabic description of the experience. */
  descriptionAr: string;
  /** Short Arabic topic / skill line (e.g. the number bases covered). */
  topicAr: string;
  /** A few Arabic highlight lines describing the core mechanic. */
  highlightsAr: readonly string[];
  availability: GameAvailability;
}
