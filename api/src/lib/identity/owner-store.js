const crypto = require("crypto");
const { downloadJsonOrNull, uploadJsonConditional, mutateJsonWithRetry, isConcurrencyConflict } = require("../platform-storage");

// Tadris+ P1-A — storage layout of the platform owner's identity (blueprint §6.1, owner decision D1: Blob JSON).
//
//   platform/accounts/owners/<accountId>.json        the owner account (credential hash, sealed TOTP, recovery hashes)
//   platform/accounts/usernames/<sha256(username)>.json  create-only username reservation → { accountId, role }
//   platform/owner/bootstrap.json                    create-only marker: the first owner exists; bootstrap is closed
//   platform/owner/bootstrap-pending.json            the half-finished bootstrap (begin → confirm), 15-minute lifetime
//   platform/sessions/owners/<sid>.json              one server-side owner session (logout / expiry / step-up)
//
// Nothing here is reachable by a teacher or student route: none of these prefixes is listed or read anywhere else.

const OWNER_PREFIX = "platform/accounts/owners/";
const USERNAME_PREFIX = "platform/accounts/usernames/";
const BOOTSTRAP_MARKER = "platform/owner/bootstrap.json";
const BOOTSTRAP_PENDING = "platform/owner/bootstrap-pending.json";
const OWNER_SESSION_PREFIX = "platform/sessions/owners/";

const ACCOUNT_ID_RE = /^own_[a-f0-9]{16}$/;
const SESSION_ID_RE = /^[a-f0-9]{32}$/;
// Lower-case after NFKC; 3–64 characters; starts with a letter or digit. Never an identity number (product rule): the
// owner chooses a name, and a value of digits only is refused so an ID number cannot be used as the login name.
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;

function normalizeUsername(username) {
  return String(username ?? "").normalize("NFKC").trim().toLowerCase();
}

/** → normalized username, or null when it does not satisfy the rules. */
function validUsername(username) {
  const u = normalizeUsername(username);
  if (!USERNAME_RE.test(u) || /^\d+$/.test(u) || u.includes("..")) return null;
  return u;
}

function usernameKey(username) {
  return crypto.createHash("sha256").update("ExamBank791381:username:v1\n" + normalizeUsername(username)).digest("hex");
}

function newOwnerAccountId() { return "own_" + crypto.randomBytes(8).toString("hex"); }
function newSessionId() { return crypto.randomBytes(16).toString("hex"); }

function ownerAccountName(accountId) {
  if (!ACCOUNT_ID_RE.test(String(accountId))) throw new Error("Invalid owner account id.");
  return OWNER_PREFIX + accountId + ".json";
}
function usernameReservationName(username) { return USERNAME_PREFIX + usernameKey(username) + ".json"; }
function ownerSessionName(sid) {
  if (!SESSION_ID_RE.test(String(sid))) throw new Error("Invalid session id.");
  return OWNER_SESSION_PREFIX + sid + ".json";
}

async function readOwnerAccount(container, accountId) {
  if (!ACCOUNT_ID_RE.test(String(accountId))) return null;
  const doc = await downloadJsonOrNull(container, ownerAccountName(accountId));
  return doc && doc.role === "owner" && doc.accountId === accountId ? doc : null;
}

/** username → owner account, or null. A reservation for another role is never an owner. */
async function findOwnerByUsername(container, username) {
  const u = validUsername(username);
  if (!u) return null;
  const reservation = await downloadJsonOrNull(container, usernameReservationName(u));
  if (!reservation || reservation.role !== "owner") return null;
  const account = await readOwnerAccount(container, reservation.accountId);
  return account && account.username === u ? account : null;
}

/** Create-only write. → true when created, false when the blob already exists. Other errors propagate. */
async function createOnly(container, name, value) {
  try {
    await uploadJsonConditional(container, name, value, null);
    return true;
  } catch (e) {
    if (isConcurrencyConflict(e)) return false;
    throw e;
  }
}

/** Read-modify-write of an owner account under compare-and-set (5 attempts, then StorageConflictError → 503). */
function mutateOwnerAccount(container, accountId, mutate) {
  return mutateJsonWithRetry(container, ownerAccountName(accountId), current => {
    if (!current || current.role !== "owner" || current.accountId !== accountId) {
      const e = new Error("Owner account not found."); e.code = "OWNER_NOT_FOUND"; throw e;
    }
    return mutate(current);
  });
}

module.exports = {
  OWNER_PREFIX, USERNAME_PREFIX, BOOTSTRAP_MARKER, BOOTSTRAP_PENDING, OWNER_SESSION_PREFIX,
  ACCOUNT_ID_RE, SESSION_ID_RE,
  normalizeUsername, validUsername, usernameKey, newOwnerAccountId, newSessionId,
  ownerAccountName, usernameReservationName, ownerSessionName,
  readOwnerAccount, findOwnerByUsername, createOnly, mutateOwnerAccount
};
