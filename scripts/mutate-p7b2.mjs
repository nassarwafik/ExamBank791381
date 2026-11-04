#!/usr/bin/env node
// Tadris+ P7-B2 — mutation proof for the educational games: the game entitlement (`resources.games`: validation, resolver, grants, owner
// routes, history), a game open = its capability AND the owner's choice, the teacher and student guards, the Number Conversion class
// check, the session / bell answers, and the three consoles. Same engine and rules as scripts/mutate-p1a.mjs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");
const TESTS = ["api/tests/games-p7b2.test.js", "src/games/gamesAccess.p7b2.test.tsx", "src/owner/OwnerGames.p7b2.test.tsx"];

export const MUTANTS = [
  { id: "P7B2-M1", what: "an unknown game id is accepted", edits: [{ file: "api/src/lib/access/revisions.js", find: "      if (unknown.length) return { ok: false, code: \"GAME_UNKNOWN\"", replace: "      if (false) return { ok: false, code: \"GAME_UNKNOWN\"" }] },
  { id: "P7B2-M2", what: "a duplicated game id is accepted", edits: [{ file: "api/src/lib/access/revisions.js", find: "      if (new Set(r.games).size !== r.games.length) return { ok: false, code: \"GAME_DUPLICATE\" };\n", replace: "" }] },
  { id: "P7B2-M3", what: "the resolver drops the game entitlement", edits: [{ file: "api/src/lib/access/resolver.js", find: "games: entry.games ? [...entry.games] : null, appearance", replace: "games: null, appearance" }] },
  { id: "P7B2-M4", what: "sessionGrants ignores the game entitlement", edits: [{ file: "api/src/lib/access/session-grants.js", find: "    games: Array.isArray(access.games) ? new Set(access.games) : null,   // Tadris+ P7-B2", replace: "    games: null," }] },
  { id: "P7B2-M5", what: "a game is open without its capability", edits: [{ file: "api/src/lib/game-catalog.js", find: "GAMES.filter(g => has(g.capability) && (!allowed || allowed.has(g.id)))", replace: "GAMES.filter(g => (!allowed || allowed.has(g.id)))" }] },
  { id: "P7B2-M6", what: "a game is open outside the owner's choice", edits: [{ file: "api/src/lib/game-catalog.js", find: "GAMES.filter(g => has(g.capability) && (!allowed || allowed.has(g.id)))", replace: "GAMES.filter(g => has(g.capability))" }] },
  { id: "P7B2-M7", what: "the teacher game guard ignores the choice", edits: [{ file: "api/src/lib/access/game-access.js", find: "  return grants.games && !grants.games.has(gameId) ? gameNotAvailable(gameId) : null;", replace: "  return null;" }] },
  { id: "P7B2-M8", what: "the student's teacher's games are ignored", edits: [{ file: "api/src/lib/access/student-services.js", find: "games: openGames(c => held.has(c), access.games) };", replace: "games: GAMES.map(g => g.id) };" }] },
  { id: "P7B2-M9", what: "the conversion game plays from an archived class", edits: [{ file: "api/src/functions/game-number-conversion.js", find: "if (!classroom || normalizeClassStatus(classroom) === \"archived\") return NO_CLASS;", replace: "if (false) return NO_CLASS;" }] },
  { id: "P7B2-M10", what: "the conversion game ignores the teacher's games", edits: [{ file: "api/src/functions/game-number-conversion.js", find: "    if (serviceDenial) return serviceDenial;\n", replace: "" }] },
  { id: "P7B2-M11", what: "the live room ignores the teacher's games", edits: [{ file: "api/src/functions/game-live-session-student.js", find: "    if (serviceDenial) return serviceDenial;\n", replace: "" }] },
  { id: "P7B2-M12", what: "the teacher preview ignores the choice", edits: [{ file: "api/src/functions/game-number-conversion-preview.js", find: "    if (gameDenial) return gameDenial;\n", replace: "" }] },
  { id: "P7B2-M13", what: "the teacher's challenges ignore the choice", edits: [{ file: "api/src/functions/game-live-challenge.js", find: "    if (gameDenial) return gameDenial;\n", replace: "" }] },
  { id: "P7B2-M14", what: "assign drops the games", edits: [{ file: "api/src/functions/owner-access.js", find: "resources: resourcesOf(body.courses, body.widgets, body.games, body.appearance), reason: body.reason", replace: "resources: resourcesOf(body.courses, body.widgets, undefined, body.appearance), reason: body.reason" }] },
  { id: "P7B2-M15", what: "rollback drops the games", edits: [{ file: "api/src/functions/owner-access.js", find: "resources: resourcesOf(coursesOf(target), entitledWidgetsOf(target), entitledGamesOf(target), appearanceOfRev(target)),", replace: "resources: resourcesOf(coursesOf(target), entitledWidgetsOf(target), null, appearanceOfRev(target))," }] },
  { id: "P7B2-M16", what: "the history drops the games", edits: [{ file: "api/src/lib/access/history.js", find: "      games: doc.resources && Array.isArray(doc.resources.games) ? doc.resources.games.map(String) : null,   // P7-B2", replace: "      games: null," }] },
  { id: "P7B2-M17", what: "the teacher's session reports every game while enforced", edits: [{ file: "api/src/lib/access/session-access.js", find: "const games = enforced ? openGames(c => a.capabilities.includes(c), a.games) : GAMES.map(g => g.id);", replace: "const games = GAMES.map(g => g.id);" }] },
  { id: "P7B2-M18", what: "the bell does not report the games", edits: [{ file: "api/src/functions/student-notifications.js", find: "      const services = { messages, games: [...games] };", replace: "      const services = { messages, games: [\"number-conversion\", \"live-challenge\"] };" }] },
  { id: "P7B2-M19", what: "the student games page lists every game", edits: [{ file: "src/games/StudentGamesPage.tsx", find: "listGames().filter(g => !openGames || openGames.includes(g.id));", replace: "listGames();" }] },
  { id: "P7B2-M20", what: "the teacher games page lists every game", edits: [{ file: "src/games/TeacherGamesPage.tsx", find: "listGames().filter(g => !openGames || openGames.includes(g.id));", replace: "listGames();" }] },
  { id: "P7B2-M21", what: "the portal shows «الألعاب» with no open game", edits: [{ file: "src/StudentPortal.tsx", find: "onOpenGames={openGames && openGames.length === 0 ? undefined : () =>", replace: "onOpenGames={() =>" }] },
  { id: "P7B2-M22", what: "the owner console never sends the chosen games", edits: [{ file: "src/owner/OwnerTeacherDetails.tsx", find: "...(gameMode === \"some\" ? { games: [...chosenGames].sort() } : {})", replace: "...({})" }] },
  { id: "P7B2-M23", what: "the owner console does not start from the current games", edits: [{ file: "src/owner/OwnerTeacherDetails.tsx", find: "  const initialGames = head && head.valid && Array.isArray(head.games) ? head.games : null;", replace: "  const initialGames = null;" }] }
];

const originals = new Map();
const restoreAll = () => {
  for (const [file, { buf, hash }] of originals) {
    writeFileSync(path.join(root, file), buf);
    if (sha(readFileSync(path.join(root, file))) !== hash) { console.error("RESTORE FAILED for " + file); process.exitCode = 3; }
  }
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { restoreAll(); process.exit(130); });
process.on("exit", restoreAll);

const only = process.argv[2] ? new Set(process.argv[2].split(",")) : null;
const results = [];
for (const m of MUTANTS.filter(x => !only || only.has(x.id))) {
  for (const e of m.edits) if (!originals.has(e.file)) { const buf = readFileSync(path.join(root, e.file)); originals.set(e.file, { buf, hash: sha(buf) }); }
  // Apply every edit to the ORIGINAL text of its file (several edits on one file are applied in sequence).
  const next = new Map();
  let invalid = "";
  for (const e of m.edits) {
    const source = next.get(e.file) ?? originals.get(e.file).buf.toString("utf8");
    const count = source.split(e.find).length - 1;
    if (count !== 1) { invalid = "INVALID (find matched " + count + "× in " + e.file + ")"; break; }
    next.set(e.file, source.replace(e.find, e.replace));
  }
  if (invalid) { results.push({ ...m, verdict: invalid }); console.log(m.id + " " + invalid); continue; }
  let verdict, killer = "";
  try {
    for (const [file, text] of next) writeFileSync(path.join(root, file), text);
    const run = spawnSync("npx", ["vitest", "run", ...TESTS], { cwd: root, encoding: "utf8", timeout: 600000 });
    if (run.error && run.error.code === "ETIMEDOUT") verdict = "TIMEOUT";
    else if (run.status === 0) verdict = "SURVIVED";
    else {
      const out = (run.stdout || "") + (run.stderr || "");
      const failed = out.match(/FAIL\s+(\S+)\s+>\s+([^\n]+)/);
      verdict = /Tests\s+\d+ failed/.test(out) ? "KILLED" : "ERROR (suite did not run)";
      killer = failed ? failed[1] + " > " + failed[2].trim() : "";
    }
  } finally {
    for (const file of next.keys()) {
      const { buf, hash } = originals.get(file);
      writeFileSync(path.join(root, file), buf);
      if (sha(readFileSync(path.join(root, file))) !== hash) { console.error("RESTORE FAILED for " + file); process.exit(3); }
    }
  }
  results.push({ ...m, verdict, killer });
  console.log(m.id + " " + verdict + " — " + m.what + (killer ? "\n    killed by: " + killer : ""));
}
const git = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
const status = git.stdout.trim();
console.log("\nP7-B2: " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
