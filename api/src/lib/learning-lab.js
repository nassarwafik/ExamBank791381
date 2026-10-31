// 791381s Phase 8B (docs/enterprise-791381s-enrichment-plan.md §11.3) — the SERVER judge of a learning-book NETWORK LAB
// (`simulation` / `network-lab` v1). The lab runs on the platform's curriculum network simulator networkTopology@2, through the
// SAME authority the exam grader and the teacher review use (shared-finalization/trustedSimPlugins evaluateSmartSim):
//
//   • the public topology is validated as a networkTopology@2 envelope and the private checks as an all-or-nothing answer key —
//     an invalid topology or key is NOT the learner's fault: the result is `unavailable` (the API answers a retryable error and
//     writes nothing; never a "wrong", AGENTS.md §10 grading safety);
//   • the learner's state is RE-DERIVED by replaying the learner's actions from the topology: only `actions` is read from the
//     response — any `state`, score, checks or flags the browser sends are ignored;
//   • the verdict is right only when EVERY check passes; `parts` says, per check id, passed or not — booleans only, never the
//     expected or actual value, never evidence (the key stays on the server).
//
// Practice only: nothing here grades an exam, writes storage or knows about Strength.
const { evaluateSmartSim } = require("./shared-finalization/trustedSimPlugins");

const PLUGIN_KEY = "networkTopology";
const PLUGIN_VERSION = 2;
const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * key: { kind: "network-lab", topology, checks } (the check index entry) · response: { kind: "network-lab", actions: [...] }.
 * → { status: "judged", correct, parts: { checkId: boolean } } | { status: "unavailable" }. Pure; never throws.
 * A malformed response (another kind, no actions array) is judged wrong with no parts, like every other exercise.
 */
function evaluateNetworkLab(key, response) {
  if (!isPlainObject(key) || key.kind !== "network-lab" || !isPlainObject(key.topology) || !Array.isArray(key.checks) || key.checks.length === 0) return { status: "unavailable" };
  const actions = isPlainObject(response) && response.kind === "network-lab" && Array.isArray(response.actions) ? response.actions : null;
  let e;
  try {
    e = evaluateSmartSim({
      envelope: { schemaVersion: 1, pluginKey: PLUGIN_KEY, pluginVersion: PLUGIN_VERSION, config: key.topology },
      answerKey: { scoring: "allOrNothing", checks: key.checks },
      // the learner's actions only (an absent list replays nothing); `state: null` — the server derives the state itself
      response: { kind: "smartSim", pluginKey: PLUGIN_KEY, pluginVersion: PLUGIN_VERSION, actions: actions || [], state: null },
      maxMarks: 1,
    });
  } catch {
    return { status: "unavailable" };
  }
  if (!e || e.valid !== true) return { status: "unavailable" };
  if (!actions) return { status: "judged", correct: false, parts: {} };
  const parts = {};
  for (const c of Array.isArray(e.checks) ? e.checks : []) if (typeof c.id === "string") parts[c.id] = c.passed === true;
  const ids = Object.keys(parts);
  return { status: "judged", correct: e.correct === true && ids.length === key.checks.length && ids.every(id => parts[id] === true), parts };
}

module.exports = { evaluateNetworkLab };
