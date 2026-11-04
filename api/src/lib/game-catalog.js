// Tadris+ P7-B2 — the server's registry of educational games (blueprint §10.3, owner decision §19.25): the ids the owner can grant
// to a teacher (`resources.games` of the access revision; absent = every game, the courses rule), and the teacher capability each
// game needs. The UI's catalog (src/games/gameCatalog.ts) shows the same ids; the server decides.
//
//   a game is OPEN to a teacher   = the teacher holds its capability AND it is within their game entitlement;
//   a game is OPEN to a student   = it is open to the student's teacher (lib/access/student-services.js).

const GAMES = Object.freeze([
  Object.freeze({ id: "number-conversion", label: "تحدّي أنظمة العد", capability: "games.catalog.view" }),
  Object.freeze({ id: "live-challenge", label: "التحدّي المباشر", capability: "games.session.run" })
]);
const BY_ID = new Map(GAMES.map(g => [g.id, g]));

/** The game, or null. */
const game = id => BY_ID.get(String(id)) || null;

/** The ids of the games open to a teacher: `has(capability)` and `entitled` (null = every game; a Set / array = only those). */
function openGames(has, entitled = null) {
  const allowed = entitled === null || entitled === undefined ? null : new Set(entitled);
  return GAMES.filter(g => has(g.capability) && (!allowed || allowed.has(g.id))).map(g => g.id);
}

/** The owner console's catalog of games. */
const publicGames = () => GAMES.map(g => ({ id: g.id, label: g.label, capability: g.capability }));

const NO_STORE = { "Cache-Control": "no-store" };
/** A game the owner left out for this teacher (the capability is held). */
const gameNotAvailable = gameId => ({ status: 403, headers: NO_STORE, jsonBody: { ok: false, code: "GAME_NOT_AVAILABLE", game: gameId, error: "هذه اللعبة غير مفعّلة لحسابك. تواصل مع إدارة المنصة." } });

module.exports = { GAMES, game, openGames, publicGames, gameNotAvailable };
