// «ابنِ الشبكة» (docs/enterprise-network-build-exercises.md) — the SERVER judge of a learning-book BUILD-THE-NETWORK exercise
// (`simulation` / `network-build` v1). The rules live in ONE place, src/learning/lab/networkBuildJudge.ts, generated for the API by
// scripts/build-shared-finalization.mjs (drift-guarded): the learner's own networkTopology@2 network is validated, replayed once and
// judged check by check; a key that cannot be trusted is `unavailable` (retryable, nothing written), never a learner's «wrong».
// Practice only: nothing here grades an exam, writes storage or knows about Strength.
const { judgeNetworkBuild, NETWORK_BUILD_ANSWER_BYTES } = require("./shared-finalization/learning/lab/networkBuildJudge");

/** key: the check index entry · response: { kind: "network-build", config, actions } → the judge's verdict. Pure; never throws. */
function evaluateNetworkBuild(key, response) {
  try { return judgeNetworkBuild(key, response); } catch { return { status: "unavailable" }; }
}

module.exports = { evaluateNetworkBuild, NETWORK_BUILD_ANSWER_BYTES };
