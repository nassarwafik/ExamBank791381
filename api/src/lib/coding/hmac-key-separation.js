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
const { readCallbackKey } = require("./callback-protocol");
const { readRunnerSigningKey } = require("./runner-config");

/** The callback verification key, or null when it is missing / weak, or identical to the runner request-signing key. */
function resolveCallbackKey(env = process.env) {
  const callbackKey = readCallbackKey(env);
  if (!callbackKey) return null;
  const runnerKey = readRunnerSigningKey(env);
  if (runnerKey && runnerKey === callbackKey) return null;
  return callbackKey;
}

module.exports = { resolveCallbackKey };
