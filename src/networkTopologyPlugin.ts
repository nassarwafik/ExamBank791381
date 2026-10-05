// Phase 20B — networkTopology@1, the first production TRUSTED SmartSim plugin (pure; compiled into the shared server build and registered
// by src/trustedSimPlugins.ts). It binds the topology model, the networkCli@1 switch engine (reused unchanged: each switch owns its own
// session and history), the router CLI v1 engine, the PC configuration model and the connectivity engine into the SmartSim contract:
//   actions   — SEMANTIC and device-addressed (never pointer events): pc.setAddress / pc.setMask / pc.setGateway / pc.setDns
//               { deviceId, value }, switch.command / router.command { deviceId, command }; strictly normalized against the topology
//               (a router command on a switch, an unknown device, a malformed value or any extra key is refused, never applied)
//   runtime   — per-device sessions (CLI mode / selection) + per-device transcripts: navigation only, rebuilt by replay
//   state     — the canonical topology state (networkTopologyModel) — the graded artefact
//   checks    — private, weighted: PC fields, switch dimensions (networkCli@1 effective values), router interfaces, reachability
// Bounds: ≤ 1000 actions per answer, ≤ 300 commands per CLI device (the networkCli@1 history bound, kept per device).
import {
  NETWORK_CLI_LIMITS, createSession, displayInterfaceName, effectiveInterfaceConfig, executeCommand, isIpv4, isPhysicalPort, isSubnetMask, isSviName, isValidHostname,
  isValidVlanName, normalizeInterfaceName, parseVlanId, promptFor, type NetworkCliSession
} from "./networkCliEngine";
import { ROUTER_CLI_LIMITS, createRouterSession, displayRouterInterface, effectiveRouterInterface, executeRouterCommand, normalizeRouterInterfaceName, routerPromptFor, type RouterSession } from "./routerCliEngine";
import {
  NETWORK_TOPOLOGY_PLUGIN_KEY, NETWORK_TOPOLOGY_PLUGIN_VERSION, PC_FIELDS, TOPOLOGY_LIMITS, TOPOLOGY_STATE_VERSION, canonicalPcConfig, canonicalizeTopologyState, initialTopologyState,
  isValidPcValue, topologyDevice, validateTopologyConfig, type NetworkTopologyConfigV1, type NetworkTopologyStateV1, type PcConfig, type PcField, type TopologyDeviceKind
} from "./networkTopologyModel";
import { canReach, routerLinkContext } from "./networkConnectivity";
import type { SmartSimCheckBase, SmartSimIssue, SmartSimPlugin } from "./trustedSimRegistry";

// ── actions ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const PC_ACTION_FIELD: Readonly<Record<string, PcField>> = Object.freeze({ "pc.setAddress": "address", "pc.setMask": "mask", "pc.setGateway": "gateway", "pc.setDns": "dns" });
export const NETWORK_TOPOLOGY_ACTION_TYPES: readonly string[] = Object.freeze([...Object.keys(PC_ACTION_FIELD), "switch.command", "router.command"]);
export type NetworkTopologyAction = { type: "pc.setAddress" | "pc.setMask" | "pc.setGateway" | "pc.setDns"; deviceId: string; value: string } | { type: "switch.command" | "router.command"; deviceId: string; command: string };
export type DeviceTranscriptEntry = { input: string; prompt: string; result: { status: string; output: string[]; hint?: string; changed: boolean } };
export type NetworkTopologyRuntime = { pcs: Record<string, PcConfig>; switches: Record<string, NetworkCliSession>; routers: Record<string, RouterSession>; transcripts: Record<string, DeviceTranscriptEntry[]> };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const hasExactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const kindOf = (config: NetworkTopologyConfigV1, id: unknown): TopologyDeviceKind | undefined => (typeof id === "string" ? topologyDevice(config, id)?.kind : undefined);

export function normalizeTopologyAction(raw: unknown, config: NetworkTopologyConfigV1): { ok: true; action: NetworkTopologyAction } | { ok: false; code: string } {
  const bad = { ok: false as const, code: "NETTOPO_ACTION_INVALID" };
  if (!isObj(raw) || typeof raw.type !== "string") return bad;
  const field = Object.prototype.hasOwnProperty.call(PC_ACTION_FIELD, raw.type) ? PC_ACTION_FIELD[raw.type] : undefined;
  if (field) {
    if (!hasExactKeys(raw, ["type", "deviceId", "value"]) || kindOf(config, raw.deviceId) !== "pc" || !isValidPcValue(field, raw.value)) return bad;
    return { ok: true, action: { type: raw.type as "pc.setAddress", deviceId: raw.deviceId as string, value: raw.value } };
  }
  if (raw.type === "switch.command" || raw.type === "router.command") {
    const kind = raw.type === "switch.command" ? "switch" : "router";
    const max = kind === "switch" ? NETWORK_CLI_LIMITS.inputChars : ROUTER_CLI_LIMITS.inputChars;
    if (!hasExactKeys(raw, ["type", "deviceId", "command"]) || kindOf(config, raw.deviceId) !== kind || typeof raw.command !== "string" || raw.command.length > max) return bad;
    return { ok: true, action: { type: raw.type, deviceId: raw.deviceId as string, command: raw.command } };
  }
  return bad;
}
/** Per-device history bound: ≤ 300 CLI commands per switch / router (networkCli@1's bound, kept per device). */
export function validateTopologyActions(actions: readonly NetworkTopologyAction[]): string | undefined {
  if (actions.length > TOPOLOGY_LIMITS.actions) return "NETTOPO_ACTIONS_TOO_MANY";
  const perDevice = new Map<string, number>();
  for (const a of actions) {
    if (a.type !== "switch.command" && a.type !== "router.command") continue;
    const n = (perDevice.get(a.deviceId) ?? 0) + 1;
    if (n > TOPOLOGY_LIMITS.commandsPerDevice) return "NETTOPO_DEVICE_COMMANDS_TOO_MANY";
    perDevice.set(a.deviceId, n);
  }
  return undefined;
}

// ── runtime / replay ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function createTopologyRuntime(config: NetworkTopologyConfigV1): NetworkTopologyRuntime {
  const st = initialTopologyState(config);
  const switches: Record<string, NetworkCliSession> = {}, routers: Record<string, RouterSession> = {}, transcripts: Record<string, DeviceTranscriptEntry[]> = {};
  for (const id of Object.keys(st.switches)) { switches[id] = createSession(st.switches[id]); transcripts[id] = []; }
  for (const id of Object.keys(st.routers)) { routers[id] = createRouterSession(st.routers[id]); transcripts[id] = []; }
  return { pcs: st.pcs, switches, routers, transcripts };
}
/** The canonical state view of a runtime (also the physical context of a router's `show` output at that point of the replay). */
export function runtimeState(rt: NetworkTopologyRuntime): NetworkTopologyStateV1 {
  const switches: NetworkTopologyStateV1["switches"] = {}, routers: NetworkTopologyStateV1["routers"] = {};
  for (const id of Object.keys(rt.switches)) switches[id] = rt.switches[id].state;
  for (const id of Object.keys(rt.routers)) routers[id] = rt.routers[id].state;
  return canonicalizeTopologyState({ v: TOPOLOGY_STATE_VERSION, pcs: rt.pcs, switches, routers });
}
export function applyTopologyAction(rt: NetworkTopologyRuntime, a: NetworkTopologyAction, config: NetworkTopologyConfigV1): NetworkTopologyRuntime {
  if (a.type === "switch.command") {
    const s = rt.switches[a.deviceId];
    if (!s) return rt;
    const prompt = promptFor(s), r = executeCommand(s, a.command);
    return { ...rt, switches: { ...rt.switches, [a.deviceId]: r.session }, transcripts: { ...rt.transcripts, [a.deviceId]: [...(rt.transcripts[a.deviceId] ?? []), { input: a.command, prompt, result: r.result }] } };
  }
  if (a.type === "router.command") {
    const s = rt.routers[a.deviceId];
    if (!s) return rt;
    const prompt = routerPromptFor(s), r = executeRouterCommand(s, a.command, routerLinkContext(config, runtimeState(rt), a.deviceId));
    return { ...rt, routers: { ...rt.routers, [a.deviceId]: r.session }, transcripts: { ...rt.transcripts, [a.deviceId]: [...(rt.transcripts[a.deviceId] ?? []), { input: a.command, prompt, result: r.result }] } };
  }
  const field = PC_ACTION_FIELD[a.type];
  if (!field || !("value" in a) || !Object.prototype.hasOwnProperty.call(rt.pcs, a.deviceId)) return rt;
  return { ...rt, pcs: { ...rt.pcs, [a.deviceId]: canonicalPcConfig({ ...rt.pcs[a.deviceId], [field]: a.value }) } };
}
export type TopologyReplay = { ok: true; actions: NetworkTopologyAction[]; runtime: NetworkTopologyRuntime; state: NetworkTopologyStateV1; transcripts: Record<string, DeviceTranscriptEntry[]> } | { ok: false; code: string };
/** Replays raw actions on a (canonical) config — for the student workspace (restore / resume), the teacher preview and tests. */
export function replayTopology(config: NetworkTopologyConfigV1, rawActions: readonly unknown[]): TopologyReplay {
  if (!Array.isArray(rawActions)) return { ok: false, code: "NETTOPO_ACTION_INVALID" };
  if (rawActions.length > TOPOLOGY_LIMITS.actions) return { ok: false, code: "NETTOPO_ACTIONS_TOO_MANY" };
  const actions: NetworkTopologyAction[] = [];
  for (const raw of rawActions) { const n = normalizeTopologyAction(raw, config); if (!n.ok) return { ok: false, code: n.code }; actions.push(n.action); }
  const code = validateTopologyActions(actions);
  if (code) return { ok: false, code };
  let rt = createTopologyRuntime(config);
  for (const a of actions) rt = applyTopologyAction(rt, a, config);
  return { ok: true, actions, runtime: rt, state: runtimeState(rt), transcripts: rt.transcripts };
}

// ── private checks ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type ValueKind = "ipv4" | "mask" | "hostname" | "vlanName" | "mode" | "vlan" | "boolean";
type CheckMeta = { label: string; device: TopologyDeviceKind | "reach"; params: readonly ("value" | "vlan" | "interface")[]; value?: ValueKind; iface?: "physical" | "any" | "svi" | "router" };
/** The check catalogue (also the editor's vocabulary). Every kind is evaluated on SERVER-derived state only. */
export const NETWORK_CHECK_KINDS: Readonly<Record<string, CheckMeta>> = Object.freeze({
  "pc.address": { label: "عنوان IPv4 للحاسوب", device: "pc", params: ["value"], value: "ipv4" },
  "pc.mask": { label: "قناع الشبكة للحاسوب", device: "pc", params: ["value"], value: "mask" },
  "pc.gateway": { label: "البوابة الافتراضية للحاسوب", device: "pc", params: ["value"], value: "ipv4" },
  "pc.dns": { label: "خادم DNS للحاسوب", device: "pc", params: ["value"], value: "ipv4" },
  "switch.hostname": { label: "اسم السويتش", device: "switch", params: ["value"], value: "hostname" },
  "switch.vlanExists": { label: "وجود VLAN على السويتش", device: "switch", params: ["vlan"] },
  "switch.vlanName": { label: "اسم VLAN", device: "switch", params: ["vlan", "value"], value: "vlanName" },
  "switch.portMode": { label: "وضع المنفذ (access / trunk)", device: "switch", params: ["interface", "value"], value: "mode", iface: "physical" },
  "switch.accessVlan": { label: "VLAN الوصول للمنفذ", device: "switch", params: ["interface", "value"], value: "vlan", iface: "physical" },
  "switch.nativeVlan": { label: "Native VLAN للمنفذ", device: "switch", params: ["interface", "value"], value: "vlan", iface: "physical" },
  "switch.interfaceEnabled": { label: "تفعيل واجهة السويتش", device: "switch", params: ["interface", "value"], value: "boolean", iface: "any" },
  "switch.ipAddress": { label: "عنوان IPv4 لواجهة SVI", device: "switch", params: ["interface", "value"], value: "ipv4", iface: "svi" },
  "switch.subnetMask": { label: "قناع واجهة SVI", device: "switch", params: ["interface", "value"], value: "mask", iface: "svi" },
  "router.hostname": { label: "اسم الراوتر", device: "router", params: ["value"], value: "hostname" },
  "router.ipAddress": { label: "عنوان IPv4 لواجهة الراوتر", device: "router", params: ["interface", "value"], value: "ipv4", iface: "router" },
  "router.subnetMask": { label: "قناع واجهة الراوتر", device: "router", params: ["interface", "value"], value: "mask", iface: "router" },
  "router.interfaceEnabled": { label: "تفعيل واجهة الراوتر (no shutdown)", device: "router", params: ["interface", "value"], value: "boolean", iface: "router" },
  "reachability": { label: "الوصول بين جهازين (ping)", device: "reach", params: [] }
});
export type NetworkTopologyCheck = SmartSimCheckBase & { deviceId?: string; interface?: string; vlan?: number; value?: string | number | boolean; source?: string; destination?: string };
const BASE_KEYS = ["id", "label", "weight", "kind"];
const valueOk = (kind: ValueKind, v: unknown): boolean => {
  switch (kind) {
    case "ipv4": return typeof v === "string" && isIpv4(v);
    case "mask": return typeof v === "string" && isSubnetMask(v);
    case "hostname": return typeof v === "string" && isValidHostname(v);
    case "vlanName": return typeof v === "string" && isValidVlanName(v);
    case "mode": return v === "access" || v === "trunk";
    case "vlan": return typeof v === "number" && parseVlanId(String(v), { allowOne: true, allowReserved: false }) !== null;
    case "boolean": return typeof v === "boolean";
  }
};
export function validateTopologyCheck(raw: Record<string, unknown>, config: NetworkTopologyConfigV1): { ok: true; check: NetworkTopologyCheck } | { ok: false; issues: SmartSimIssue[] } {
  const kind = String(raw.kind);
  const meta = NETWORK_CHECK_KINDS[kind];
  const fail = (code: string, message: string) => ({ ok: false as const, issues: [{ code, message }] });
  if (!meta) return fail("NETTOPO_CHECK_INVALID", "نوع فحص غير معروف: " + kind);
  const where = "«" + String(raw.label ?? raw.id) + "»";
  const allowed = meta.device === "reach" ? [...BASE_KEYS, "source", "destination", "value"] : [...BASE_KEYS, "deviceId", ...meta.params];
  if (Object.keys(raw).some(k => !allowed.includes(k)) || allowed.some(k => raw[k] === undefined)) return fail("NETTOPO_CHECK_INVALID", "حقول الفحص " + where + " غير مكتملة أو غير معروفة.");
  const base = { id: raw.id as string, label: raw.label as string, weight: raw.weight as number, kind };
  if (meta.device === "reach") {
    const s = kindOf(config, raw.source), d = kindOf(config, raw.destination);
    if (!s || !d) return fail("NETTOPO_CHECK_DEVICE_UNKNOWN", "فحص الوصول " + where + " يشير إلى جهاز غير موجود.");
    if (s !== "pc" || (d !== "pc" && d !== "router") || raw.source === raw.destination || typeof raw.value !== "boolean") return fail("NETTOPO_CHECK_REACH_INVALID", "فحص الوصول " + where + " يجب أن يبدأ من حاسوب نحو حاسوب آخر أو راوتر، مع قيمة نعم / لا.");
    return { ok: true, check: { ...base, source: raw.source as string, destination: raw.destination as string, value: raw.value } };
  }
  const dk = kindOf(config, raw.deviceId);
  if (!dk) return fail("NETTOPO_CHECK_DEVICE_UNKNOWN", "الفحص " + where + " يشير إلى جهاز غير موجود: " + String(raw.deviceId));
  if (dk !== meta.device) return fail("NETTOPO_CHECK_DEVICE_KIND", "الفحص " + where + " لا يناسب نوع الجهاز " + String(raw.deviceId) + ".");
  const check: NetworkTopologyCheck = { ...base, deviceId: raw.deviceId as string };
  if (meta.params.includes("interface")) {
    const rawIf = typeof raw.interface === "string" ? raw.interface : "";
    const name = meta.iface === "router" ? normalizeRouterInterfaceName(rawIf) : normalizeInterfaceName(rawIf);
    const fits = !!name && (meta.iface === "router" || meta.iface === "any" || (meta.iface === "physical" ? isPhysicalPort(name) : isSviName(name)));
    if (!fits) return fail("NETTOPO_CHECK_INTERFACE_INVALID", "الواجهة في الفحص " + where + " غير صالحة لهذا النوع من الفحوص: " + rawIf);
    check.interface = name!;
  }
  if (meta.params.includes("vlan")) {
    if (typeof raw.vlan !== "number" || parseVlanId(String(raw.vlan), { allowOne: false, allowReserved: false }) === null) return fail("NETTOPO_CHECK_VALUE_INVALID", "رقم VLAN في الفحص " + where + " غير صالح (2–4094).");
    check.vlan = raw.vlan;
  }
  if (meta.params.includes("value")) {
    if (!meta.value || !valueOk(meta.value, raw.value)) return fail("NETTOPO_CHECK_VALUE_INVALID", "القيمة المطلوبة في الفحص " + where + " غير صالحة.");
    check.value = raw.value as string | number | boolean;
  }
  return { ok: true, check };
}
const shown = (v: unknown): string => (v === undefined || v === null || v === "" ? "—" : String(v));
const upDown = (enabled: boolean): string => (enabled ? "up" : "shutdown");
export function evaluateTopologyCheck(c: NetworkTopologyCheck, state: NetworkTopologyStateV1, config: NetworkTopologyConfigV1): { expected: string; actual: string; passed: boolean; evidence?: string[] } {
  const same = (expected: unknown, actual: unknown) => ({ expected: shown(expected), actual: shown(actual), passed: actual !== undefined && actual === expected });
  if (c.kind === "reachability") {
    const r = canReach(c.source!, c.destination!, config, state);
    const evidence = [r.reason, ...(r.path && r.path.length ? ["path: " + r.path.join(" → ")] : []), ...(!r.reachable && r.leg ? ["leg: " + r.leg] : [])];
    return { expected: c.value ? "reachable" : "unreachable", actual: r.reachable ? "reachable" : "unreachable", passed: r.reachable === c.value, evidence };
  }
  const id = c.deviceId!;
  if (c.kind.startsWith("pc.")) { const field = c.kind.slice(3) as PcField; return same(c.value, (state.pcs[id] ?? {})[field]); }
  if (c.kind.startsWith("router.")) {
    const r = state.routers[id];
    if (!r) return same(c.value, undefined);
    if (c.kind === "router.hostname") return same(c.value, r.hostname);
    const e = effectiveRouterInterface(r, c.interface!);
    if (c.kind === "router.interfaceEnabled") return { expected: upDown(c.value === true), actual: upDown(!e.shutdown), passed: !e.shutdown === c.value };
    return same(c.value, c.kind === "router.ipAddress" ? e.ipAddress : e.subnetMask);
  }
  const s = state.switches[id];
  if (!s) return same(c.value, undefined);
  switch (c.kind) {
    case "switch.hostname": return same(c.value, s.hostname);
    case "switch.vlanExists": { const exists = Object.prototype.hasOwnProperty.call(s.vlans, String(c.vlan)); return { expected: "exists", actual: exists ? "exists" : "missing", passed: exists }; }
    case "switch.vlanName": return same(c.value, s.vlans[String(c.vlan)]?.name);
    case "switch.interfaceEnabled": { const e = effectiveInterfaceConfig(s, c.interface!); return { expected: upDown(c.value === true), actual: upDown(!e.shutdown), passed: !e.shutdown === c.value }; }
    default: {
      const e = effectiveInterfaceConfig(s, c.interface!) as Record<string, unknown>;
      const field = ({ "switch.portMode": "mode", "switch.accessVlan": "accessVlan", "switch.nativeVlan": "nativeVlan", "switch.ipAddress": "ipAddress", "switch.subnetMask": "subnetMask" } as Record<string, string>)[c.kind];
      return same(c.value, field ? e[field] : undefined);
    }
  }
}
/** A readable default label for a check (the editor pre-fills it; the teacher may edit it). */
export function defaultCheckLabel(c: Partial<NetworkTopologyCheck>, config: NetworkTopologyConfigV1): string {
  const name = (id: unknown) => (typeof id === "string" ? topologyDevice(config, id)?.label ?? id : "?");
  const meta = NETWORK_CHECK_KINDS[String(c.kind)];
  if (!meta) return "فحص";
  if (c.kind === "reachability") return name(c.source) + " ⇄ " + name(c.destination) + (c.value === false ? " (معزول)" : "");
  const iface = c.interface ? " " + (meta.iface === "router" ? displayRouterInterface(String(c.interface)) : displayInterfaceName(String(c.interface))) : "";
  const vlan = c.vlan !== undefined ? " VLAN " + c.vlan : "";
  return (name(c.deviceId) + iface + vlan + " — " + meta.label).slice(0, 120);
}

// ── the plugin ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const MAX_REVIEW_OUTPUT_LINES = 40;
export const networkTopologyPluginV1: SmartSimPlugin<NetworkTopologyConfigV1, NetworkTopologyRuntime, NetworkTopologyStateV1, NetworkTopologyAction, NetworkTopologyCheck> = Object.freeze({
  key: NETWORK_TOPOLOGY_PLUGIN_KEY,
  version: NETWORK_TOPOLOGY_PLUGIN_VERSION,
  label: "مخطط شبكة تفاعلي (راوتر / سويتش / حاسوب)",
  maxActions: TOPOLOGY_LIMITS.actions,
  checkKinds: Object.freeze(Object.keys(NETWORK_CHECK_KINDS)),
  validateConfig: (raw: unknown) => { const r = validateTopologyConfig(raw); return r.ok ? { ok: true as const, config: r.config } : { ok: false as const, issues: r.issues }; },
  createRuntime: createTopologyRuntime,
  normalizeAction: normalizeTopologyAction,
  validateActions: (actions: readonly NetworkTopologyAction[]) => validateTopologyActions(actions),
  applyAction: applyTopologyAction,
  canonicalState: (rt: NetworkTopologyRuntime) => runtimeState(rt),
  serializeState: (s: NetworkTopologyStateV1) => JSON.stringify(canonicalizeTopologyState(s)),
  validateCheck: validateTopologyCheck,
  evaluateCheck: evaluateTopologyCheck,
  reviewDetails: (actions: readonly NetworkTopologyAction[], config: NetworkTopologyConfigV1) => {
    const r = replayTopology(config, actions);
    if (!r.ok) return {};
    const transcripts: Record<string, { input: string; prompt: string; status: string; output: string[] }[]> = {};
    for (const id of Object.keys(r.transcripts).sort()) transcripts[id] = r.transcripts[id].map(e => ({ input: e.input, prompt: e.prompt, status: e.result.status, output: e.result.output.slice(0, MAX_REVIEW_OUTPUT_LINES) }));
    return { transcripts };
  }
});
export { PC_FIELDS };
