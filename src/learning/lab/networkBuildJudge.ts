// «ابنِ الشبكة» (docs/enterprise-network-build-exercises.md) — the JUDGE of a build-the-network exercise (`simulation` / `network-build`
// v1). One source for the server (api/src/lib/learning-network-build.js, through shared-finalization) and the content proof test.
//
//   • The learner's network is the learner's OWN topology and action list ({ config, actions }): the config is validated as a
//     networkTopology@2 configuration (the same validator as the exam's smartSim envelopes), and it may hold only the device kinds the
//     task offers; the actions are replayed ONCE from that config by the simulator (any state, score or flag the browser sends is ignored).
//   • Each check is judged on its own, so a goal the learner reached is marked even when another is not:
//       – BUILD checks look at the topology: `build.device` (a device of that id is of that kind), `build.link` (a cable joins the two
//         devices directly) and `build.count` (at least `min`, at most `max`, devices of a kind);
//       – networkTopology@2 checks (reachability, addresses, VLANs, DHCP…) run on the replayed state, through the SAME prepared
//         evaluation the exam grader uses. A check that names a device the learner did not build is simply not reached (false).
//   • The key is verified before anything else: its networkTopology@2 checks must be a valid answer key on the authored solution's
//     config (`reference`). A key that is not is the author's fault — `unavailable` (the API answers a retryable error and records
//     nothing), never a learner's «wrong» (AGENTS.md §10 grading safety). An evaluation that throws is `unavailable` too.
//   • The verdict carries booleans per check id only — never an expected value, a device the learner should have added or evidence.
// Pure: no storage, no network, no time. Practice only: nothing here grades an exam.
import { evaluatePreparedSmartSimChecks, prepareSmartSimEvaluation, validateSmartSimAnswerKey, validateSmartSimEnvelope } from "../../trustedSimPlugins";

export const NETWORK_BUILD_DEVICE_KINDS: readonly string[] = Object.freeze(["router", "switch", "pc", "laptop", "ap", "server"]);
export const BUILD_CHECK_KINDS: readonly string[] = Object.freeze(["build.device", "build.link", "build.count"]);
/** A learner's network is at most this many bytes of JSON (a full 30-device network with 1000 actions stays far below it). */
export const NETWORK_BUILD_ANSWER_BYTES = 393216;

export type NetworkBuildKey = { kind: "network-build"; rules: { kinds: string[] }; reference: Record<string, unknown>; checks: Record<string, unknown>[] };
export type NetworkBuildIssue = { code: "NETWORK_INVALID" | "KIND_NOT_ALLOWED" | "ACTIONS_INVALID" };
export type NetworkBuildVerdict =
  | { status: "unavailable" }
  | { status: "judged"; correct: boolean; parts: Record<string, boolean>; issue?: NetworkBuildIssue };

type Obj = Record<string, unknown>;
type Topology = { devices: { id: string; kind: string }[]; links: { a: { deviceId: string }; b: { deviceId: string } }[] };
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const CHECK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const DEVICE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const isBuildKind = (k: unknown) => typeof k === "string" && BUILD_CHECK_KINDS.includes(k);
const envelopeOf = (config: unknown) => ({ schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config });
const count = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 30;
const sameKeys = (o: Obj, allowed: readonly string[]) => Object.keys(o).every(k => allowed.includes(k));

/** A build check is well formed (its own parameters only). Pure. */
export function validBuildCheck(c: unknown): boolean {
  if (!isObj(c) || typeof c.id !== "string" || !CHECK_ID.test(c.id) || !isBuildKind(c.kind)) return false;
  if (c.label !== undefined && (typeof c.label !== "string" || !c.label.trim())) return false;
  const base = ["id", "kind", "label"];
  switch (c.kind) {
    case "build.device": return sameKeys(c, [...base, "deviceId", "deviceKind"]) && typeof c.deviceId === "string" && DEVICE_ID.test(c.deviceId) && NETWORK_BUILD_DEVICE_KINDS.includes(c.deviceKind as string);
    case "build.link": return sameKeys(c, [...base, "a", "b"]) && typeof c.a === "string" && typeof c.b === "string" && DEVICE_ID.test(c.a) && DEVICE_ID.test(c.b) && c.a !== c.b;
    case "build.count": return sameKeys(c, [...base, "deviceKind", "min", "max"]) && NETWORK_BUILD_DEVICE_KINDS.includes(c.deviceKind as string) && count(c.min) && (c.min as number) >= 1
      && (c.max === undefined || (count(c.max) && (c.max as number) >= (c.min as number)));
    default: return false;
  }
}

function evaluateBuildCheck(c: Obj, t: Topology): boolean {
  if (c.kind === "build.device") return t.devices.some(d => d.id === c.deviceId && d.kind === c.deviceKind);
  if (c.kind === "build.link") {
    const has = (id: unknown) => t.devices.some(d => d.id === id);
    return has(c.a) && has(c.b) && t.links.some(l => (l.a.deviceId === c.a && l.b.deviceId === c.b) || (l.a.deviceId === c.b && l.b.deviceId === c.a));
  }
  if (c.kind === "build.count") {
    const n = t.devices.filter(d => d.kind === c.deviceKind).length;
    return n >= (c.min as number) && (c.max === undefined || n <= (c.max as number));
  }
  return false;
}

/** The key, verified (fail closed): null when it cannot be trusted to judge (an author's error → unavailable). Pure. */
export function readNetworkBuildKey(key: unknown): NetworkBuildKey | null {
  if (!isObj(key) || key.kind !== "network-build" || !isObj(key.rules) || !Array.isArray(key.rules.kinds) || !isObj(key.reference) || !Array.isArray(key.checks)) return null;
  const kinds = key.rules.kinds as unknown[];
  if (kinds.length === 0 || !kinds.every(k => typeof k === "string" && NETWORK_BUILD_DEVICE_KINDS.includes(k)) || new Set(kinds).size !== kinds.length) return null;
  const checks = key.checks as unknown[];
  if (checks.length === 0 || checks.length > 50 || !checks.every(c => isObj(c) && typeof c.id === "string")) return null;
  const ids = (checks as Obj[]).map(c => c.id as string);
  if (new Set(ids).size !== ids.length) return null;
  const env = validateSmartSimEnvelope(envelopeOf(key.reference));
  if (!env.ok) return null;
  const ref = env.envelope.config as Topology;
  if (!ref.devices.every(d => kinds.includes(d.kind))) return null;
  const build = (checks as Obj[]).filter(c => isBuildKind(c.kind)), sim = (checks as Obj[]).filter(c => !isBuildKind(c.kind));
  if (!build.every(validBuildCheck)) return null;
  if (sim.length) {
    const k = validateSmartSimAnswerKey({ scoring: "allOrNothing", checks: sim }, env.plugin, env.envelope.config);
    if (!k.ok) return null;
  }
  return { kind: "network-build", rules: { kinds: kinds as string[] }, reference: key.reference, checks: checks as Obj[] };
}

/**
 * key: { kind: "network-build", rules: { kinds }, reference, checks } (the check index entry) · response: { kind: "network-build", config,
 * actions }. → { status: "judged", correct, parts, issue? } | { status: "unavailable" }. Pure; never throws.
 * A malformed response (another kind, no config or actions) is judged wrong with no parts, like every other exercise.
 */
export function judgeNetworkBuild(rawKey: unknown, response: unknown): NetworkBuildVerdict {
  let key: NetworkBuildKey | null;
  try { key = readNetworkBuildKey(rawKey); } catch { key = null; }
  if (!key) return { status: "unavailable" };
  if (!isObj(response) || response.kind !== "network-build" || !isObj(response.config) || !Array.isArray(response.actions)) return { status: "judged", correct: false, parts: {} };
  const none = (code: NetworkBuildIssue["code"]): NetworkBuildVerdict => ({ status: "judged", correct: false, parts: Object.fromEntries(key!.checks.map(c => [c.id as string, false])), issue: { code } });
  try {
    const env = validateSmartSimEnvelope(envelopeOf(response.config));
    if (!env.ok) return none("NETWORK_INVALID");
    const topology = env.envelope.config as Topology;
    if (!topology.devices.every(d => key!.rules.kinds.includes(d.kind))) return none("KIND_NOT_ALLOWED");
    const sim = key.checks.some(c => !isBuildKind(c.kind));
    const prepared = sim ? prepareSmartSimEvaluation({ envelope: envelopeOf(response.config), response: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions: response.actions, state: null } }) : null;
    let actionsOk = true;
    const parts: Record<string, boolean> = {};
    for (const c of key.checks) {
      if (isBuildKind(c.kind)) { parts[c.id as string] = evaluateBuildCheck(c, topology); continue; }
      const e = evaluatePreparedSmartSimChecks(prepared, { answerKey: { scoring: "allOrNothing", checks: [c] }, maxMarks: 1 });
      // the simulator could not evaluate the learner's network at all: never a «wrong»
      if (!e.valid && (e.issues ?? []).some(i => i.code === "SMARTSIM_EVALUATION_FAILED" || i.code === "SMARTSIM_PREPARED_INVALID")) return { status: "unavailable" };
      if (e.valid && e.checks.length === 0 && e.parts.total > 0) actionsOk = false;   // the learner's actions did not replay on this network
      parts[c.id as string] = e.valid && e.correct === true;
    }
    const correct = key.checks.every(c => parts[c.id as string] === true);
    return { status: "judged", correct, parts, ...(!actionsOk && !correct ? { issue: { code: "ACTIONS_INVALID" as const } } : {}) };
  } catch {
    return { status: "unavailable" };
  }
}
