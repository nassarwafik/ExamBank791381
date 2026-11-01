const { openSecret } = require("./secret-box");
const { verifyTotp } = require("./totp");
const { findUnusedRecoveryCode } = require("./recovery-codes");
const { mutateOwnerAccount } = require("./owner-store");

// Tadris+ P1-A — the owner's second factor, verified AND consumed atomically (owner decision D4).
//
// A TOTP code is accepted only for a time step newer than the account's `mfa.totp.lastUsedStep`; a recovery code only if
// it is still unused. Both checks run INSIDE the compare-and-set mutation, against the freshest account document, so two
// concurrent requests carrying the same code can never both succeed: the second one sees the updated document and fails.

const TOTP_PURPOSE = "owner-totp";

class SecondFactorRejected extends Error {
  constructor() { super("Second factor rejected."); this.name = "SecondFactorRejected"; this.code = "SECOND_FACTOR_REJECTED"; }
}

function openOwnerTotpSecret(account, env = process.env) {
  return openSecret(account?.mfa?.totp?.sealed, { purpose: TOTP_PURPOSE, aad: account?.accountId || "", env });
}

/**
 * → { ok: true, method: "totp" | "recovery", account } or { ok: false }.
 * Storage failures (other than a rejected factor) propagate, so the caller answers 503 rather than "denied" or "allowed".
 */
async function verifyAndConsumeSecondFactor(container, accountId, { code, recoveryCode } = {}, { nowMs = Date.now(), env = process.env, mutate = mutateOwnerAccount } = {}) {
  const useRecovery = !code && Boolean(recoveryCode);
  if (!code && !useRecovery) return { ok: false };
  let method = null;
  try {
    const account = await mutate(container, accountId, current => {
      if (current.status !== "active") throw new SecondFactorRejected();
      const mfa = current.mfa || {};
      if (!useRecovery) {
        const secret = openOwnerTotpSecret(current, env);
        if (!secret) throw new SecondFactorRejected();
        const last = Number.isInteger(mfa.totp?.lastUsedStep) ? mfa.totp.lastUsedStep : null;
        const result = verifyTotp(secret, code, { nowMs, lastUsedStep: last });
        if (!result.ok) throw new SecondFactorRejected();
        method = "totp";
        return { ...current, mfa: { ...mfa, totp: { ...mfa.totp, lastUsedStep: result.step } }, updatedAt: new Date(nowMs).toISOString() };
      }
      const records = Array.isArray(mfa.recoveryCodes) ? mfa.recoveryCodes : [];
      const index = findUnusedRecoveryCode(records, recoveryCode);
      if (index < 0) throw new SecondFactorRejected();
      method = "recovery";
      const nextRecords = records.map((r, i) => i === index ? { ...r, usedAt: new Date(nowMs).toISOString() } : r);
      return { ...current, mfa: { ...mfa, recoveryCodes: nextRecords }, updatedAt: new Date(nowMs).toISOString() };
    });
    return { ok: true, method, account };
  } catch (e) {
    if (e instanceof SecondFactorRejected || e?.code === "OWNER_NOT_FOUND") return { ok: false };
    throw e;
  }
}

module.exports = { TOTP_PURPOSE, SecondFactorRejected, openOwnerTotpSecret, verifyAndConsumeSecondFactor };
