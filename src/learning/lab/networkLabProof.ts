// 791381s Phase 8B (docs/enterprise-791381s-enrichment-plan.md §11.3) — the CONTENT PROOF of a network lab, run by the tests over
// every authored lab (never in the Reader: it imports the whole simulator authority). A lab ships only when the simulator itself
// agrees with its author:
//   • the topology is a valid networkTopology@2 configuration, the checks a valid all-or-nothing answer key on it;
//   • the untouched lab (no action) passes NO check at all — no free credit, as for the exam templates;
//   • the authored `solution` passes EVERY check — the task can be done with the simulator's own commands.
// It runs the SAME evaluateSmartSim the server judge (api/src/lib/learning-lab.js, via shared-finalization) and the exam grader use.
import { evaluateSmartSim, validateSmartSimAnswerKey, validateSmartSimEnvelope } from "../../trustedSimPlugins";
import type { NetworkLabConfig } from "../content/types";

export interface NetworkLabProof { ok: boolean; problems: string[] }

const evaluate = (config: NetworkLabConfig, actions: unknown[]) => evaluateSmartSim({
  envelope: { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: config.topology },
  answerKey: { scoring: "allOrNothing", checks: config.checks },
  response: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions, state: null },
  maxMarks: 1,
});

export function proveNetworkLab(config: NetworkLabConfig): NetworkLabProof {
  const problems: string[] = [];
  const env = validateSmartSimEnvelope({ schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: config.topology });
  if (!env.ok) return { ok: false, problems: env.issues.map(i => "topology: " + i.message) };
  const key = validateSmartSimAnswerKey({ scoring: "allOrNothing", checks: config.checks }, env.plugin, env.envelope.config);
  if (!key.ok) return { ok: false, problems: key.issues.map(i => "checks: " + i.message) };
  const untouched = evaluate(config, []);
  const free = untouched.checks.filter(c => c.passed).map(c => c.id);
  if (!untouched.valid) problems.push("the untouched lab cannot be evaluated");
  else if (free.length) problems.push("free credit: the untouched lab already passes " + free.join(", "));
  const solved = evaluate(config, Array.isArray(config.solution) ? config.solution : []);
  const failing = solved.checks.filter(c => !c.passed).map(c => c.id);
  if (!solved.valid) problems.push("the solution cannot be evaluated");
  else if (!solved.correct || solved.checks.length !== (config.checks?.length ?? -1)) problems.push("the solution does not pass every check" + (failing.length ? ": " + failing.join(", ") : " (the actions do not replay)"));
  return { ok: problems.length === 0, problems };
}
