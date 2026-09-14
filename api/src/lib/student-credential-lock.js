const crypto = require("crypto");
const { uploadJsonConditional } = require("./platform-storage");

// Roadmap #8 (PR#67 final review) — per-STUDENT credential lock. Serializes credential-changing operations
// (password reset, update-with-password, and identity/code RENAME which moves the auth blob path) for one
// userId, so a rename can never delete a newer reset's credential or resurrect an older password across the
// auth-path move. Cross-instance safe: an Azure Blob lease enforced by the storage service (NOT an in-memory
// mutex), finite/auto-expiring (a crashed op never strands the account), released in finally. It is a
// SEPARATE lock namespace from the login lock and the assignment lock. Unrelated students never serialize.
const LOCK_PREFIX = "platform/locks/credential-";
const LEASE_SECONDS = 30;          // credential ops do a few blob writes; well under this
const ACQUIRE_ATTEMPTS = 8;
const BASE_DELAY_MS = 40;

function credentialLockName(userId) {
  return LOCK_PREFIX + String(userId) + ".lock";
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function isLeaseContention(e) {
  const status = Number(e?.statusCode ?? e?.response?.status ?? 0);
  return status === 409;
}

class CredentialLockBusyError extends Error {
  constructor(userId) { super("عملية أخرى على بيانات الطالب قيد التنفيذ. أعد المحاولة."); this.name = "CredentialLockBusyError"; this.userId = userId; this.httpStatus = 409; }
}

async function ensureLockBlob(container, name) {
  try { await uploadJsonConditional(container, name, { lock: true }, null); }
  catch (e) {
    const status = Number(e?.statusCode ?? e?.response?.status ?? 0);
    const code = String(e?.code || e?.details?.errorCode || e?.errorCode || "");
    if (status === 409 || status === 412 || code === "BlobAlreadyExists" || code === "ConditionNotMet") return;
    throw e;
  }
}

// Run fn while holding the per-student credential lease. Released in finally on success and on a thrown
// domain error. On persistent contention throws CredentialLockBusyError (409, retryable).
async function withCredentialLock(container, userId, fn, opts = {}) {
  const name = credentialLockName(userId);
  const leaseSeconds = opts.leaseSeconds || LEASE_SECONDS;
  const attempts = opts.attempts || ACQUIRE_ATTEMPTS;
  const base = opts.baseDelayMs || BASE_DELAY_MS;
  await ensureLockBlob(container, name);
  const leaseClient = container.getBlobClient(name).getBlobLeaseClient();
  let acquired = false;
  for (let i = 0; i < attempts && !acquired; i++) {
    try { await leaseClient.acquireLease(leaseSeconds); acquired = true; }
    catch (e) { if (!isLeaseContention(e)) throw e; if (i === attempts - 1) throw new CredentialLockBusyError(userId); await sleep(base * (2 ** i) + Math.floor(Math.random() * base)); }
  }
  try { return await fn(); }
  finally { try { await leaseClient.releaseLease(); } catch { /* lease may have expired */ } }
}

module.exports = { credentialLockName, withCredentialLock, CredentialLockBusyError };
