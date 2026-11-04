const { sessionGrants } = require("./session-grants");
const { gameNotAvailable } = require("../game-catalog");

// Tadris+ P7-B2 — a teacher game route, after its capability check: the owner's game choice for THIS teacher (`resources.games`,
// applied with the capabilities — enforce only; absent = every game). → null (go on) or the response to return (403
// GAME_NOT_AVAILABLE; 503 when the access cannot be read).
async function requireTeacherGame(auth, gameId, deps = {}, obs = null) {
  const grants = await sessionGrants(auth && auth.user, deps, obs);
  if (!grants.ok) return grants.response;
  return grants.games && !grants.games.has(gameId) ? gameNotAvailable(gameId) : null;
}

module.exports = { requireTeacherGame };
