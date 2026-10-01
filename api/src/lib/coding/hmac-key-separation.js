// Phase 17C — Independent Security Review Fix 1: HMAC key separation, FAIL CLOSED.
//
// Two independent secrets protect the two directions of official coding grading:
//     CODING_RUNNER_HMAC_KEY              SmartAssess API → Coding Runner (request signing)
//     CODING_GRADING_CALLBACK_HMAC_KEY    Coding Runner → SmartAssess grading callback (result authentication)
// If both are configured with the SAME value, a party holding the request-signing key could forge grading callbacks, so the
// callback authentication is UNAVAILABLE (503 GRADING_UNAVAILABLE) — always.
//
// The decision depends ONLY on the two configured secrets, compared byte-for-byte exactly as configured (no trimming, case
// folding or other normalisation). It does NOT depend on the runner URL, the CODING_RUNNER_ENABLED kill switch, runner
// availability or any other outbound setting: a disabled / incomplete / malformed runner configuration must not switch the
// check off (the original 17C defect), and disabling outbound runner traffic must not block a correctly separated callback
// for an already-dispatched job (incident response: stop new work, still accept outstanding signed results).
//
// Phase 17D-A — the same rule for the THIRD key, CODING_GRADING_SWEEP_HMAC_KEY (scheduler → recovery sweep, SA-CODING-SWEEP-1):
// it must be valid and differ (raw, exact bytes) from BOTH the runner request key and the callback key, whatever the rest of the
// configuration (runner URL, kill switch, a missing callback key …). Otherwise the sweep route is unavailable (503).
const { readCallbackKey } = require("./callback-protocol");
const { readRunnerSigningKey } = require("./runner-config");

const SWEEP_KEY_MIN_LENGTH = 32;
const SWEEP_KEY_MAX_LENGTH = 512;

/** The callback verification key, or null when it is missing / weak, or identical to the runner request-signing key. */
function resolveCallbackKey(env = process.env) {
  const callbackKey = readCallbackKey(env);
  if (!callbackKey) return null;
  const runnerKey = readRunnerSigningKey(env);
  if (runnerKey && runnerKey === callbackKey) return null;
  return callbackKey;
}

/** The RAW callback key exactly as configured ("" when absent / not a string) — used only for separation checks. */
function readRawCallbackKey(env) {
  const key = env && typeof env === "object" ? env.CODING_GRADING_CALLBACK_HMAC_KEY : undefined;
  return typeof key === "string" ? key : "";
}

/** The sweep trigger key, or null when it is missing / weak / whitespace / equal (raw) to the runner or the callback key. */
function resolveSweepKey(env = process.env) {
  const key = env && typeof env === "object" ? env.CODING_GRADING_SWEEP_HMAC_KEY : undefined;
  if (typeof key !== "string" || key.length < SWEEP_KEY_MIN_LENGTH || key.length > SWEEP_KEY_MAX_LENGTH || /\s/.test(key)) return null;
  const runnerKey = readRunnerSigningKey(env), callbackKey = readRawCallbackKey(env);
  if ((runnerKey && runnerKey === key) || (callbackKey && callbackKey === key)) return null;
  return key;
}

module.exports = { resolveCallbackKey, resolveSweepKey };
