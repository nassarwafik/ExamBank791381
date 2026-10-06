// Phase 20C — networkTopology@2, the CURRICULUM NETWORK SIMULATOR plugin (pure; compiled into the shared server build and registered by
// src/trustedSimPlugins.ts as one more exact identity; networkTopology@1 stays registered and frozen).
//
//   config    — the teacher's topology (src/net2Model.ts): six device kinds, adapters, links, positions, initial device states
//   actions   — SEMANTIC and device-addressed, strictly normalized against the topology; the student can configure devices but can NEVER
//               change the topology (no device / link / position / type / adapter / config-replacement action exists at all)
//   runtime   — CLI sessions (mode / selection), per-device transcripts, academic device states and the operational state
//   state     — { v: 2, devices: academic configuration per device, ops: server-derived operational state (src/net2Network.ts) }
//   checks    — private, weighted, evaluated on the replayed state only (never on anything the client claims)
// Bounds: ≤ 1000 actions, ≤ 300 CLI commands per switch / router, ≤ 200 commands (CMD + Browser) per host, ≤ 50 wireless actions per host.
import { isPhysicalPort, isSviName, isValidHostname, isValidVlanName, normalizeInterfaceName, parseVlanId } from "./networkCliEngine";
import { isIpv4, isObj, isPassword, isSubnetMask, ownKeys, hasOwn, FORBIDDEN_KEYS, compressVlans } from "./net2Common";
import {
  NET2_LIMITS, adapterNames, canonicalApState, canonicalHostState, deviceAdapters, initialDeviceState, isApPassphrase, isHostKind, isPlainText, isSsid, isWpaPassphrase, net2Device,
  parseNet2Url, securePortCount, validDhcpServerPool, validDnsRecords, validHttpPage, validStaticFields, validateNet2Config, type Net2ApState, type Net2Config, type Net2DeviceKind, type Net2DeviceState,
  type Net2HostState, type Net2DhcpServerPool
} from "./net2Model";
import { createSwitchSession, effectiveSwitchIf, executeSwitchCommand, isVtpName, parseVlanList, switchPrompt, NET2_SWITCH_LIMITS, type Net2SwitchState, type Switch2Session } from "./net2SwitchCli";
import { createRouterSession2, executeRouterCommand2, isPoolName, isSubinterfaceName, normalizeRouter2Interface, routerPrompt2, type Net2RouterState, type Router2Session } from "./net2RouterCli";
import { canonicalOps, emptyOps, httpGet, makeNet, reachDevices, reconcile, routerContext, switchContext, withTraffic, type Net2Ops, type Net2State } from "./net2Network";
import { HOST_PROMPT, parseHostCommand, renderIpconfig, runHostCommand, type HostResult } from "./net2Host";
import type { SmartSimCheckBase, SmartSimIssue, SmartSimPlugin } from "./trustedSimRegistry";
import type { SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";

export const NETWORK_TOPOLOGY_V2_KEY = "networkTopology";
export const NETWORK_TOPOLOGY_V2_VERSION = 2;

// ── actions ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const NET2_ACTION_KINDS = Object.freeze([
  "host.setMode", "host.setStatic", "host.command", "host.wifiConnect", "host.wifiDisconnect", "host.browse",
  "switch.command", "router.command", "ap.set", "server.setDhcp", "server.setDns", "server.setHttp"
] as const);
export type Net2ApField = "enabled" | "ssid" | "security" | "passphrase" | "address" | "mask" | "gateway";
export const NET2_AP_FIELDS: readonly Net2ApField[] = Object.freeze(["enabled", "ssid", "security", "passphrase", "address", "mask", "gateway"]);
export type Net2Action =
  | { type: "host.setMode"; deviceId: string; adapter: "eth0" | "wlan0"; mode: "static" | "dhcp" }
  | { type: "host.setStatic"; deviceId: string; adapter: "eth0" | "wlan0"; address: string; mask: string; gateway: string; dns: string }
  | { type: "host.command"; deviceId: string; command: string }
  | { type: "host.wifiConnect"; deviceId: string; ssid: string; passphrase: string }
  | { type: "host.wifiDisconnect"; deviceId: string }
  | { type: "host.browse"; deviceId: string; url: string }
  | { type: "switch.command" | "router.command"; deviceId: string; command: string }
  | { type: "ap.set"; deviceId: string; field: Net2ApField; value: string | boolean }
  | { type: "server.setDhcp"; deviceId: string; enabled: boolean; pool: Net2DhcpServerPool }
  | { type: "server.setDns"; deviceId: string; enabled: boolean; records: { name: string; address: string }[] }
  | { type: "server.setHttp"; deviceId: string; enabled: boolean; title: string; body: string };
const exact = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => hasOwn(o, k));
const apValueOk = (field: unknown, v: unknown): boolean => {
  switch (field) {
    case "enabled": return typeof v === "boolean";
    case "ssid": return isSsid(v);
    case "security": return v === "open" || v === "wpa2";
    case "passphrase": return isApPassphrase(v);
    case "address": case "gateway": return v === "" || (typeof v === "string" && isIpv4(v));
    case "mask": return v === "" || (typeof v === "string" && isSubnetMask(v));
    default: return false;
  }
};
/** The ONE action normalizer (client, server ingest, grader, review). Exact keys, references into the topology, strict values. */
export function normalizeNet2Action(raw: unknown, config: Net2Config): { ok: true; action: Net2Action } | { ok: false; code: string } {
  const bad = { ok: false as const, code: "NET2_ACTION_INVALID" };
  if (!isObj(raw) || typeof raw.type !== "string" || typeof raw.deviceId !== "string" || FORBIDDEN_KEYS.has(raw.deviceId)) return bad;
  const d = net2Device(config, raw.deviceId);
  if (!d) return bad;
  const adapters = adapterNames(d) as string[];
  const id = d.id;
  switch (raw.type) {
    case "host.setMode":
      if (!exact(raw, ["type", "deviceId", "adapter", "mode"]) || !isHostKind(d.kind) || !adapters.includes(raw.adapter as string) || (raw.mode !== "static" && raw.mode !== "dhcp")) return bad;
      return { ok: true, action: { type: raw.type, deviceId: id, adapter: raw.adapter as "eth0", mode: raw.mode } };
    case "host.setStatic":
      if (!exact(raw, ["type", "deviceId", "adapter", "address", "mask", "gateway", "dns"]) || !isHostKind(d.kind) || !adapters.includes(raw.adapter as string) || !validStaticFields(raw as never)) return bad;
      return { ok: true, action: { type: raw.type, deviceId: id, adapter: raw.adapter as "eth0", address: raw.address as string, mask: raw.mask as string, gateway: raw.gateway as string, dns: raw.dns as string } };
    case "host.command": case "switch.command": case "router.command": {
      const want = raw.type === "host.command" ? isHostKind(d.kind) : raw.type === "switch.command" ? d.kind === "switch" : d.kind === "router";
      if (!exact(raw, ["type", "deviceId", "command"]) || !want || typeof raw.command !== "string" || raw.command.length > NET2_LIMITS.commandChars) return bad;
      return { ok: true, action: { type: raw.type, deviceId: id, command: raw.command } };
    }
    case "host.wifiConnect":
      if (!exact(raw, ["type", "deviceId", "ssid", "passphrase"]) || !adapters.includes("wlan0") || !isSsid(raw.ssid) || !(raw.passphrase === "" || isWpaPassphrase(raw.passphrase))) return bad;
      return { ok: true, action: { type: raw.type, deviceId: id, ssid: raw.ssid, passphrase: raw.passphrase as string } };
    case "host.wifiDisconnect":
      if (!exact(raw, ["type", "deviceId"]) || !adapters.includes("wlan0")) return bad;
      return { ok: true, action: { type: raw.type, deviceId: id } };
    case "host.browse":
      if (!exact(raw, ["type", "deviceId", "url"]) || !isHostKind(d.kind) || !parseNet2Url(raw.url)) return bad;
      return { ok: true, action: { type: raw.type, deviceId: id, url: raw.url as string } };
    case "ap.set":
      if (!exact(raw, ["type", "deviceId", "field", "value"]) || d.kind !== "ap" || !(NET2_AP_FIELDS as readonly unknown[]).includes(raw.field) || !apValueOk(raw.field, raw.value)) return bad;
      return { ok: true, action: { type: raw.type, deviceId: id, field: raw.field as Net2ApField, value: raw.value as string | boolean } };
    case "server.setDhcp":
      if (!exact(raw, ["type", "deviceId", "enabled", "pool"]) || d.kind !== "server" || typeof raw.enabled !== "boolean" || !validDhcpServerPool(raw.pool)) return bad;
      return { ok: true, action: { type: raw.type, deviceId: id, enabled: raw.enabled, pool: { defaultRouter: raw.pool.defaultRouter, dns: raw.pool.dns, start: raw.pool.start, mask: raw.pool.mask, max: raw.pool.max } } };
    case "server.setDns":
      if (!exact(raw, ["type", "deviceId", "enabled", "records"]) || d.kind !== "server" || typeof raw.enabled !== "boolean" || !validDnsRecords(raw.records)) return bad;
      return { ok: true, action: { type: raw.type, deviceId: id, enabled: raw.enabled, records: raw.records.map(r => ({ name: r.name, address: r.address })) } };
    case "server.setHttp":
      if (!exact(raw, ["type", "deviceId", "enabled", "title", "body"]) || d.kind !== "server" || typeof raw.enabled !== "boolean" || !validHttpPage(raw.title, raw.body)) return bad;
      return { ok: true, action: { type: raw.type, deviceId: id, enabled: raw.enabled, title: raw.title as string, body: raw.body as string } };
    default: return bad;
  }
}
/** Whole-answer bounds: per-device CLI history, per-host CMD / Browser history, per-host wireless actions. */
export function validateNet2Actions(actions: readonly Net2Action[]): string | undefined {
  if (actions.length > NET2_LIMITS.actions) return "SMARTSIM_ACTIONS_TOO_MANY";
  const cli = new Map<string, number>(), hostCmd = new Map<string, number>(), wifi = new Map<string, number>();
  const bump = (m: Map<string, number>, id: string) => { const n = (m.get(id) ?? 0) + 1; m.set(id, n); return n; };
  for (const a of actions) {
    if ((a.type === "switch.command" || a.type === "router.command") && bump(cli, a.deviceId) > NET2_LIMITS.commandsPerDevice) return "NET2_DEVICE_COMMANDS_TOO_MANY";
    if ((a.type === "host.command" || a.type === "host.browse") && bump(hostCmd, a.deviceId) > NET2_LIMITS.hostCommandsPerDevice) return "NET2_HOST_COMMANDS_TOO_MANY";
    if ((a.type === "host.wifiConnect" || a.type === "host.wifiDisconnect") && bump(wifi, a.deviceId) > NET2_LIMITS.wifiActionsPerHost) return "NET2_WIFI_ACTIONS_TOO_MANY";
  }
  return undefined;
}

// ── runtime / replay ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Net2TranscriptEntry = { input: string; prompt: string; result: { status: string; output: string[]; hint?: string } };
export type Net2Runtime = { devices: Record<string, Net2DeviceState>; switches: Record<string, Switch2Session>; routers: Record<string, Router2Session>; ops: Net2Ops; transcripts: Record<string, Net2TranscriptEntry[]> };
export const BROWSER_PROMPT = "Web Browser";
/** The academic device states of a runtime (switch / router states live in their CLI sessions), keyed in id order. */
export function runtimeDevices(rt: Net2Runtime): Record<string, Net2DeviceState> {
  const out: Record<string, Net2DeviceState> = {};
  for (const id of [...Object.keys(rt.devices), ...Object.keys(rt.switches), ...Object.keys(rt.routers)].sort()) out[id] = rt.switches[id]?.state ?? rt.routers[id]?.state ?? rt.devices[id];
  return out;
}
export function createNet2Runtime(config: Net2Config): Net2Runtime {
  const devices: Record<string, Net2DeviceState> = {}, switches: Record<string, Switch2Session> = {}, routers: Record<string, Router2Session> = {}, transcripts: Record<string, Net2TranscriptEntry[]> = {};
  for (const d of config.devices) {
    const st = initialDeviceState(d);
    if (d.kind === "switch") { switches[d.id] = createSwitchSession(st as Net2SwitchState); transcripts[d.id] = []; }
    else if (d.kind === "router") { routers[d.id] = createRouterSession2(st as Net2RouterState); transcripts[d.id] = []; }
    else { devices[d.id] = st; if (isHostKind(d.kind)) transcripts[d.id] = []; }
  }
  const rt: Net2Runtime = { devices, switches, routers, ops: emptyOps(), transcripts };
  return { ...rt, ops: reconcile(config, runtimeDevices(rt), rt.ops) };
}
const entry = (input: string, prompt: string, r: HostResult | { status: string; output: string[]; hint?: string }): Net2TranscriptEntry => ({ input, prompt, result: r.hint === undefined ? { status: r.status, output: r.output } : { status: r.status, output: r.output, hint: r.hint } });
const pushT = (rt: Net2Runtime, id: string, e: Net2TranscriptEntry) => ({ ...rt.transcripts, [id]: [...(rt.transcripts[id] ?? []), e] });
const settle = (rt: Net2Runtime, config: Net2Config): Net2Runtime => ({ ...rt, ops: reconcile(config, runtimeDevices(rt), rt.ops) });
/** After student traffic: only a Port Security consequence (a sighting / violation) can change link or lease facts — then reconcile. */
const afterTraffic = (rt: Net2Runtime, ops: Net2Ops, config: Net2Config): Net2Runtime =>
  (JSON.stringify(ops.portSecurity) === JSON.stringify(rt.ops.portSecurity) ? { ...rt, ops: canonicalOps(ops) } : settle({ ...rt, ops }, config));
const withHost = (rt: Net2Runtime, id: string, f: (h: Net2HostState) => Net2HostState, config: Net2Config): Net2Runtime => {
  const d = net2Device(config, id)!;
  return settle({ ...rt, devices: { ...rt.devices, [id]: canonicalHostState(f(JSON.parse(JSON.stringify(rt.devices[id])) as Net2HostState), adapterNames(d)) } }, config);
};
export function applyNet2Action(rt: Net2Runtime, a: Net2Action, config: Net2Config): Net2Runtime {
  const net = () => makeNet(config, runtimeDevices(rt), rt.ops);
  switch (a.type) {
    case "switch.command": {
      const s = rt.switches[a.deviceId];
      if (!s) return rt;
      const prompt = switchPrompt(s), r = executeSwitchCommand(s, a.command, switchContext(net(), a.deviceId));
      const switches = { ...rt.switches, [a.deviceId]: r.session };
      if (r.result.changed && securePortCount(Object.values(switches).map(x => x.state)) > NET2_LIMITS.securePorts)
        return { ...rt, transcripts: pushT(rt, a.deviceId, entry(a.command, prompt, { status: "invalid", output: ["% Port Security limit reached in this simulator (" + NET2_LIMITS.securePorts + " secure ports per topology)."], hint: "تجاوزت الحد الأقصى لعدد منافذ Port Security في هذا المخطط." })) };
      const next = { ...rt, switches, transcripts: pushT(rt, a.deviceId, entry(a.command, prompt, r.result)) };
      return r.result.changed ? settle(next, config) : next;
    }
    case "router.command": {
      const s = rt.routers[a.deviceId];
      if (!s) return rt;
      const prompt = routerPrompt2(s), r = executeRouterCommand2(s, a.command, routerContext(net(), a.deviceId));
      const next = { ...rt, routers: { ...rt.routers, [a.deviceId]: r.session }, transcripts: pushT(rt, a.deviceId, entry(a.command, prompt, r.result)) };
      return r.result.changed ? settle(next, config) : next;
    }
    case "host.setMode": return withHost(rt, a.deviceId, h => ({ ...h, adapters: { ...h.adapters, [a.adapter]: { ...(h.adapters[a.adapter] ?? {}), mode: a.mode, released: undefined } } }), config);
    case "host.setStatic": return withHost(rt, a.deviceId, h => ({ ...h, adapters: { ...h.adapters, [a.adapter]: { mode: "static", address: a.address, mask: a.mask, gateway: a.gateway, dns: a.dns } } }), config);
    case "host.wifiConnect": return withHost(rt, a.deviceId, h => ({ ...h, wifi: { ssid: a.ssid, passphrase: a.passphrase } }), config);
    case "host.wifiDisconnect": return withHost(rt, a.deviceId, h => { const { wifi: _drop, ...rest } = h; void _drop; return rest; }, config);
    case "server.setDhcp": return withHost(rt, a.deviceId, h => ({ ...h, services: { ...(h.services ?? {}), dhcp: { enabled: a.enabled, pool: { ...a.pool } } } }), config);
    case "server.setDns": return withHost(rt, a.deviceId, h => ({ ...h, services: { ...(h.services ?? {}), dns: { enabled: a.enabled, records: a.records.map(r => ({ ...r })) } } }), config);
    case "server.setHttp": return withHost(rt, a.deviceId, h => ({ ...h, services: { ...(h.services ?? {}), http: { enabled: a.enabled, title: a.title, body: a.body } } }), config);
    case "ap.set": {
      const cur = rt.devices[a.deviceId] as Net2ApState;
      const next: Net2ApState = { ...cur, [a.field]: a.value } as Net2ApState;
      if (next.address && next.mask && !isUsableAp(next)) return rt;
      return settle({ ...rt, devices: { ...rt.devices, [a.deviceId]: canonicalApState(next) } }, config);
    }
    case "host.browse": {
      const traffic = withTraffic(config, runtimeDevices(rt), rt.ops, n => {
        const u = parseNet2Url(a.url)!;
        const r = httpGet(n, a.deviceId, u.host);
        if (r.ok) return { status: "ok", output: ["HTTP/1.1 200 OK", "Title: " + r.title, "", ...r.body.split("\n")] };
        return { status: "ok", output: [r.reason === "UNRESOLVED" ? "Host Name Unresolved" : "Request Timeout"] };
      });
      return afterTraffic({ ...rt, transcripts: pushT(rt, a.deviceId, entry(a.url, BROWSER_PROMPT, traffic.result)) }, traffic.ops, config);
    }
    case "host.command": {
      const d = net2Device(config, a.deviceId)!;
      const p = parseHostCommand(a.command);
      if (p.kind === "fail") return { ...rt, transcripts: pushT(rt, a.deviceId, entry(a.command, HOST_PROMPT, p.result)) };
      const cmd = p.cmd;
      if (cmd.id === "ipconfig" && (cmd.variant === "release" || cmd.variant === "renew")) {
        const h = rt.devices[a.deviceId] as Net2HostState;
        const dhcp = Object.keys(h.adapters).filter(k => h.adapters[k as "eth0"]?.mode === "dhcp");
        if (!dhcp.length) return { ...rt, transcripts: pushT(rt, a.deviceId, entry(a.command, HOST_PROMPT, { status: "invalid", output: ["The operation failed as no adapter is in the state permissible for this operation."] })) };
        const next = withHost(rt, a.deviceId, x => { const ad = { ...x.adapters }; for (const k of dhcp) ad[k as "eth0"] = { ...ad[k as "eth0"]!, released: cmd.variant === "release" ? true : undefined }; return { ...x, adapters: ad }; }, config);
        const out = renderIpconfig(makeNet(config, runtimeDevices(next), next.ops), d, false);
        return { ...next, transcripts: pushT(next, a.deviceId, entry(a.command, HOST_PROMPT, { status: "ok", output: out })) };
      }
      const traffic = withTraffic(config, runtimeDevices(rt), rt.ops, n => runHostCommand(n, d, cmd));
      return afterTraffic({ ...rt, transcripts: pushT(rt, a.deviceId, entry(a.command, HOST_PROMPT, traffic.result)) }, traffic.ops, config);
    }
  }
}
function isUsableAp(s: Net2ApState): boolean {
  const r = validStaticFields({ address: s.address ?? "", mask: s.mask ?? "", gateway: s.gateway ?? "", dns: "" });
  return r;
}
export function net2State(rt: Net2Runtime): Net2State {
  return JSON.parse(JSON.stringify({ v: 2, devices: runtimeDevices(rt), ops: rt.ops })) as Net2State;
}
/** The current prompt of every CLI device and host (what the terminal shows before the next command). */
export function net2Prompts(rt: Net2Runtime): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of Object.keys(rt.transcripts).sort()) out[id] = rt.switches[id] ? switchPrompt(rt.switches[id]) : rt.routers[id] ? routerPrompt2(rt.routers[id]) : HOST_PROMPT;
  return out;
}
/** The current CLI mode of every switch / router (navigation only; the terminal shows it as its mode label). */
export function net2Modes(rt: Net2Runtime): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of Object.keys(rt.switches).sort()) out[id] = rt.switches[id].mode;
  for (const id of Object.keys(rt.routers).sort()) out[id] = rt.routers[id].mode;
  return out;
}
export type Net2Replay = { ok: true; actions: Net2Action[]; state: Net2State; transcripts: Record<string, Net2TranscriptEntry[]>; prompts: Record<string, string>; modes: Record<string, string> } | { ok: false; code: string };
/** Replays raw actions on a canonical config — the student workspace (restore / resume), the teacher preview / sandbox and tests. */
export function replayNet2(config: Net2Config, rawActions: readonly unknown[]): Net2Replay {
  if (!Array.isArray(rawActions)) return { ok: false, code: "NET2_ACTION_INVALID" };
  if (rawActions.length > NET2_LIMITS.actions) return { ok: false, code: "SMARTSIM_ACTIONS_TOO_MANY" };
  const actions: Net2Action[] = [];
  for (const raw of rawActions) { const n = normalizeNet2Action(raw, config); if (!n.ok) return { ok: false, code: n.code }; actions.push(n.action); }
  const code = validateNet2Actions(actions);
  if (code) return { ok: false, code };
  try {
    let rt = createNet2Runtime(config);
    for (const a of actions) rt = applyNet2Action(rt, a, config);
    return { ok: true, actions, state: net2State(rt), transcripts: rt.transcripts, prompts: net2Prompts(rt), modes: net2Modes(rt) };
  } catch {
    return { ok: false, code: "NET2_REPLAY_FAILED" };
  }
}
/** A UI replay cache: the runtime reached after a normalized action prefix (view-side optimisation only; the server always replays in full). */
export type Net2ReplayCache = { config: Net2Config; keys: string[]; runtime: Net2Runtime };
/**
 * Same result as replayNet2, but resumes from `cache` when the new action list extends the cached prefix (the common case: one more
 * command). Any other edit (reset, a removed action, another config) replays from scratch. Pure: the cache is never mutated.
 */
export function replayNet2Cached(config: Net2Config, rawActions: readonly unknown[], cache?: Net2ReplayCache): { replay: Net2Replay; cache?: Net2ReplayCache } {
  if (!Array.isArray(rawActions)) return { replay: { ok: false, code: "NET2_ACTION_INVALID" } };
  if (rawActions.length > NET2_LIMITS.actions) return { replay: { ok: false, code: "SMARTSIM_ACTIONS_TOO_MANY" } };
  const actions: Net2Action[] = [];
  for (const raw of rawActions) { const n = normalizeNet2Action(raw, config); if (!n.ok) return { replay: { ok: false, code: n.code } }; actions.push(n.action); }
  const code = validateNet2Actions(actions);
  if (code) return { replay: { ok: false, code } };
  const keys = actions.map(a => JSON.stringify(a));
  try {
    const resume = !!cache && cache.config === config && cache.keys.length <= keys.length && cache.keys.every((k, i) => k === keys[i]);
    let rt = resume ? cache!.runtime : createNet2Runtime(config);
    for (let i = resume ? cache!.keys.length : 0; i < actions.length; i++) rt = applyNet2Action(rt, actions[i], config);
    return { replay: { ok: true, actions, state: net2State(rt), transcripts: rt.transcripts, prompts: net2Prompts(rt), modes: net2Modes(rt) }, cache: { config, keys, runtime: rt } };
  } catch {
    return { replay: { ok: false, code: "NET2_REPLAY_FAILED" } };
  }
}
/** Reachability between two devices on a server-derived state (pure: nothing is learned or recorded). */
export function canReachNet2(config: Net2Config, state: Net2State, source: string, destination: string): { reachable: boolean; reason: string; path?: string[] } {
  try { return reachDevices(makeNet(config, state.devices, state.ops), source, destination); } catch { return { reachable: false, reason: "STATE_INVALID" }; }
}
/** What the simulated browser of `source` gets for `url` on a server-derived state (pure). */
export function browseNet2(config: Net2Config, state: Net2State, source: string, url: string): { ok: boolean; reason?: string } {
  const u = parseNet2Url(url);
  if (!u) return { ok: false, reason: "URL_INVALID" };
  try { const r = httpGet(makeNet(config, state.devices, state.ops), source, u.host); return r.ok ? { ok: true } : { ok: false, reason: r.reason }; } catch { return { ok: false, reason: "STATE_INVALID" }; }
}

// ── private checks ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type ValueKind = "ipv4" | "mask" | "hostname" | "vlanName" | "portMode" | "vlan" | "vlanList" | "boolean" | "hostMode" | "vtpMode" | "vtpName" | "vtpVersion" | "password" | "psMax" | "psViolation"
  | "ssid" | "security" | "passphrase" | "network" | "range";
type Param = "adapter" | "interface" | "vlan" | "pool" | "value";
export type Net2CheckMeta = { label: string; device: "host" | "switch" | "router" | "ap" | "reach" | "browse"; params: readonly Param[]; value?: ValueKind; iface?: "physical" | "svi" | "any" | "router" | "subif"; secret?: boolean; wireless?: boolean };
const mkSw = (label: string, params: readonly Param[], value: ValueKind, iface?: Net2CheckMeta["iface"], secret?: boolean): Net2CheckMeta => ({ label, device: "switch", params, value, ...(iface ? { iface } : {}), ...(secret ? { secret } : {}) });
const mkRt = (label: string, params: readonly Param[], value: ValueKind, iface?: Net2CheckMeta["iface"], secret?: boolean): Net2CheckMeta => ({ label, device: "router", params, value, ...(iface ? { iface } : {}), ...(secret ? { secret } : {}) });
const mkHost = (label: string, params: readonly Param[], value: ValueKind, wireless?: boolean): Net2CheckMeta => ({ label, device: "host", params, value, ...(wireless ? { wireless } : {}) });
const mkAp = (label: string, value: ValueKind, secret?: boolean): Net2CheckMeta => ({ label, device: "ap", params: ["value"], value, ...(secret ? { secret } : {}) });
const passwordChecks = (mk: typeof mkSw, who: string): Record<string, Net2CheckMeta> => ({
  enableSecret: mk("enable secret (" + who + ")", ["value"], "password", undefined, true), enablePassword: mk("enable password (" + who + ")", ["value"], "password", undefined, true),
  consolePassword: mk("كلمة مرور خط Console (" + who + ")", ["value"], "password", undefined, true), consoleLogin: mk("login على خط Console (" + who + ")", ["value"], "boolean"),
  vtyPassword: mk("كلمة مرور خطوط VTY (" + who + ")", ["value"], "password", undefined, true), vtyLogin: mk("login على خطوط VTY (" + who + ")", ["value"], "boolean"),
  passwordEncryption: mk("service password-encryption (" + who + ")", ["value"], "boolean")
});
const prefixed = (p: string, r: Record<string, Net2CheckMeta>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [p + k, v]));
/** The private check catalogue of networkTopology@2 (also the editor's vocabulary). Every kind is evaluated on the replayed state only. */
export const NET2_CHECKS: Readonly<Record<string, Net2CheckMeta>> = Object.freeze({
  "host.mode": mkHost("وضع عنونة المحوّل (Static / DHCP)", ["adapter", "value"], "hostMode"),
  "host.address": mkHost("عنوان IPv4 الفعلي للمحوّل", ["adapter", "value"], "ipv4"),
  "host.mask": mkHost("قناع الشبكة الفعلي للمحوّل", ["adapter", "value"], "mask"),
  "host.gateway": mkHost("البوابة الافتراضية الفعلية", ["adapter", "value"], "ipv4"),
  "host.dns": mkHost("خادم DNS الفعلي", ["adapter", "value"], "ipv4"),
  "host.dhcpLease": mkHost("حصل المحوّل على عنوان من DHCP", ["adapter", "value"], "boolean"),
  "host.dhcpServer": mkHost("خادم DHCP الذي منح العنوان", ["adapter", "value"], "ipv4"),
  "host.wifiAssociated": mkHost("الجهاز متصل لاسلكيًا", ["value"], "boolean", true),
  "host.ssid": mkHost("الشبكة اللاسلكية المتصل بها (SSID)", ["value"], "ssid", true),
  "switch.hostname": mkSw("اسم السويتش", ["value"], "hostname"),
  "switch.vlanExists": { label: "وجود VLAN في قاعدة السويتش الفعلية (مع VTP)", device: "switch", params: ["vlan"] },
  "switch.vlanName": mkSw("اسم VLAN", ["vlan", "value"], "vlanName"),
  "switch.portMode": mkSw("وضع المنفذ (access / trunk)", ["interface", "value"], "portMode", "physical"),
  "switch.accessVlan": mkSw("VLAN الوصول للمنفذ", ["interface", "value"], "vlan", "physical"),
  "switch.nativeVlan": mkSw("Native VLAN للمنفذ", ["interface", "value"], "vlan", "physical"),
  "switch.allowedVlans": mkSw("قائمة VLAN المسموحة على الـ Trunk", ["interface", "value"], "vlanList", "physical"),
  "switch.interfaceEnabled": mkSw("تفعيل واجهة السويتش", ["interface", "value"], "boolean", "any"),
  "switch.sviAddress": mkSw("عنوان واجهة SVI", ["interface", "value"], "ipv4", "svi"),
  "switch.sviMask": mkSw("قناع واجهة SVI", ["interface", "value"], "mask", "svi"),
  "switch.vtpMode": mkSw("وضع VTP", ["value"], "vtpMode"),
  "switch.vtpDomain": mkSw("نطاق VTP", ["value"], "vtpName"),
  "switch.vtpVersion": mkSw("إصدار VTP", ["value"], "vtpVersion"),
  "switch.vtpPassword": mkSw("كلمة مرور VTP", ["value"], "password", undefined, true),
  "switch.portSecurity": mkSw("تفعيل Port Security", ["interface", "value"], "boolean", "physical"),
  "switch.portSecurityMaximum": mkSw("الحد الأقصى لعناوين Port Security", ["interface", "value"], "psMax", "physical"),
  "switch.portSecuritySticky": mkSw("Sticky MAC في Port Security", ["interface", "value"], "boolean", "physical"),
  "switch.portSecurityViolation": mkSw("وضع المخالفة في Port Security", ["interface", "value"], "psViolation", "physical"),
  "switch.portErrDisabled": mkSw("المنفذ في حالة err-disabled", ["interface", "value"], "boolean", "physical"),
  ...prefixed("switch.", passwordChecks(mkSw, "السويتش")),
  "router.hostname": mkRt("اسم الراوتر", ["value"], "hostname"),
  "router.ipAddress": mkRt("عنوان IPv4 لواجهة الراوتر", ["interface", "value"], "ipv4", "router"),
  "router.subnetMask": mkRt("قناع واجهة الراوتر", ["interface", "value"], "mask", "router"),
  "router.interfaceEnabled": mkRt("تفعيل واجهة الراوتر", ["interface", "value"], "boolean", "router"),
  "router.subinterfaceVlan": mkRt("VLAN الواجهة الفرعية (dot1Q)", ["interface", "value"], "vlan", "subif"),
  "router.subinterfaceNative": mkRt("الواجهة الفرعية Native", ["interface", "value"], "boolean", "subif"),
  "router.dhcpPool": mkRt("وجود مجمّع DHCP", ["pool", "value"], "boolean"),
  "router.dhcpNetwork": mkRt("شبكة مجمّع DHCP", ["pool", "value"], "network"),
  "router.dhcpDefaultRouter": mkRt("default-router في مجمّع DHCP", ["pool", "value"], "ipv4"),
  "router.dhcpDns": mkRt("dns-server في مجمّع DHCP", ["pool", "value"], "ipv4"),
  "router.dhcpExcluded": mkRt("نطاق عناوين مستثنى من DHCP", ["value"], "range"),
  ...prefixed("router.", passwordChecks(mkRt, "الراوتر")),
  "ap.enabled": mkAp("تشغيل نقطة الوصول", "boolean"),
  "ap.ssid": mkAp("SSID نقطة الوصول", "ssid"),
  "ap.security": mkAp("أمان الشبكة اللاسلكية", "security"),
  "ap.passphrase": mkAp("عبارة مرور WPA2", "passphrase", true),
  "ap.address": mkAp("عنوان إدارة نقطة الوصول", "ipv4"),
  "ap.mask": mkAp("قناع إدارة نقطة الوصول", "mask"),
  "ap.gateway": mkAp("بوابة إدارة نقطة الوصول", "ipv4"),
  "reachability": { label: "الوصول بين جهازين (ping)", device: "reach", params: [] },
  "browse": { label: "تصفّح خادم الويب من جهاز", device: "browse", params: [] }
});
export const NET2_CHECK_KINDS: readonly string[] = Object.freeze(Object.keys(NET2_CHECKS));
export type Net2Check = SmartSimCheckBase & { deviceId?: string; adapter?: string; interface?: string; vlan?: number; pool?: string; value?: string | number | boolean; source?: string; destination?: string; url?: string };
const BASE_KEYS = ["id", "label", "weight", "kind"];
function valueOk(kind: ValueKind, v: unknown): boolean {
  switch (kind) {
    case "ipv4": return typeof v === "string" && isIpv4(v);
    case "mask": return typeof v === "string" && isSubnetMask(v);
    case "hostname": return typeof v === "string" && isValidHostname(v);
    case "vlanName": return typeof v === "string" && isValidVlanName(v);
    case "portMode": return v === "access" || v === "trunk";
    case "vlan": return typeof v === "number" && parseVlanId(String(v), { allowOne: true, allowReserved: false }) !== null;
    case "vlanList": return v === "all" || (typeof v === "string" && parseVlanList(v) !== null);
    case "boolean": return typeof v === "boolean";
    case "hostMode": return v === "static" || v === "dhcp";
    case "vtpMode": return v === "server" || v === "client";
    case "vtpName": return isVtpName(v);
    case "vtpVersion": return v === 1 || v === 2;
    case "password": return isPassword(v);
    case "psMax": return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= NET2_SWITCH_LIMITS.portSecurityMax;
    case "psViolation": return v === "shutdown" || v === "restrict" || v === "protect";
    case "ssid": return isSsid(v);
    case "security": return v === "open" || v === "wpa2";
    case "passphrase": return isWpaPassphrase(v);
    case "network": { if (typeof v !== "string") return false; const [n, m, x] = v.split(" "); return x === undefined && isIpv4(n) && isSubnetMask(m); }
    case "range": { if (typeof v !== "string") return false; const p = v.split(" "); return p.length <= 2 && p.every(isIpv4); }
  }
}
const kindOf = (config: Net2Config, id: unknown): Net2DeviceKind | undefined => net2Device(config, id)?.kind;
export function validateNet2Check(raw: Record<string, unknown>, config: Net2Config): { ok: true; check: Net2Check } | { ok: false; issues: SmartSimIssue[] } {
  const kind = String(raw.kind);
  const meta = hasOwn(NET2_CHECKS, kind) ? NET2_CHECKS[kind] : undefined;
  const fail = (code: string, message: string) => ({ ok: false as const, issues: [{ code, message }] });
  if (!meta) return fail("NET2_CHECK_INVALID", "نوع فحص غير معروف: " + kind);
  const where = "«" + String(raw.label ?? raw.id) + "»";
  const allowed = meta.device === "reach" ? [...BASE_KEYS, "source", "destination", "value"] : meta.device === "browse" ? [...BASE_KEYS, "source", "url", "value"] : [...BASE_KEYS, "deviceId", ...meta.params];
  if (Object.keys(raw).some(k => !allowed.includes(k)) || allowed.some(k => raw[k] === undefined)) return fail("NET2_CHECK_INVALID", "حقول الفحص " + where + " غير مكتملة أو غير معروفة.");
  const base = { id: raw.id as string, label: raw.label as string, weight: raw.weight as number, kind };
  if (meta.device === "reach" || meta.device === "browse") {
    const s = kindOf(config, raw.source);
    if (!s || (meta.device === "reach" && !kindOf(config, raw.destination))) return fail("NET2_CHECK_DEVICE_UNKNOWN", "الفحص " + where + " يشير إلى جهاز غير موجود.");
    if (typeof raw.value !== "boolean") return fail("NET2_CHECK_VALUE_INVALID", "قيمة الفحص " + where + " يجب أن تكون نعم / لا.");
    if (meta.device === "browse") {
      if (!isHostKind(s)) return fail("NET2_CHECK_REACH_INVALID", "فحص التصفّح " + where + " يبدأ من حاسوب أو لابتوب أو خادم.");
      if (!parseNet2Url(raw.url)) return fail("NET2_CHECK_VALUE_INVALID", "عنوان الصفحة في الفحص " + where + " يجب أن يكون http://اسم-أو-عنوان.");
      return { ok: true, check: { ...base, source: raw.source as string, url: raw.url as string, value: raw.value } };
    }
    if (!isHostKind(s) || raw.source === raw.destination) return fail("NET2_CHECK_REACH_INVALID", "فحص الوصول " + where + " يبدأ من حاسوب أو لابتوب أو خادم نحو جهاز آخر.");
    return { ok: true, check: { ...base, source: raw.source as string, destination: raw.destination as string, value: raw.value } };
  }
  const d = net2Device(config, raw.deviceId);
  if (!d) return fail("NET2_CHECK_DEVICE_UNKNOWN", "الفحص " + where + " يشير إلى جهاز غير موجود: " + String(raw.deviceId));
  if (meta.device === "host" ? !isHostKind(d.kind) : d.kind !== meta.device) return fail("NET2_CHECK_DEVICE_KIND", "الفحص " + where + " لا يناسب نوع الجهاز " + d.id + ".");
  if (meta.wireless && !deviceAdapters(d).includes("wireless")) return fail("NET2_CHECK_DEVICE_KIND", "الفحص " + where + " يحتاج جهازًا لاسلكيًا.");
  const check: Net2Check = { ...base, deviceId: d.id };
  if (meta.params.includes("adapter")) {
    if (typeof raw.adapter !== "string" || !(adapterNames(d) as string[]).includes(raw.adapter)) return fail("NET2_CHECK_INTERFACE_INVALID", "المحوّل في الفحص " + where + " غير موجود في الجهاز: " + String(raw.adapter));
    check.adapter = raw.adapter;
  }
  if (meta.params.includes("interface")) {
    const rawIf = typeof raw.interface === "string" ? raw.interface : "";
    let name: string | null = null;
    if (meta.iface === "router" || meta.iface === "subif") { name = normalizeRouter2Interface(rawIf); if (name && meta.iface === "subif" && !isSubinterfaceName(name)) name = null; }
    else { name = normalizeInterfaceName(rawIf); if (name && !(meta.iface === "any" || (meta.iface === "physical" ? isPhysicalPort(name) : isSviName(name)))) name = null; }
    if (!name) return fail("NET2_CHECK_INTERFACE_INVALID", "الواجهة في الفحص " + where + " غير صالحة لهذا النوع من الفحوص: " + rawIf);
    check.interface = name;
  }
  if (meta.params.includes("vlan")) {
    if (typeof raw.vlan !== "number" || parseVlanId(String(raw.vlan), { allowOne: true, allowReserved: false }) === null) return fail("NET2_CHECK_VALUE_INVALID", "رقم VLAN في الفحص " + where + " غير صالح.");
    check.vlan = raw.vlan;
  }
  if (meta.params.includes("pool")) {
    if (!isPoolName(raw.pool)) return fail("NET2_CHECK_VALUE_INVALID", "اسم مجمّع DHCP في الفحص " + where + " غير صالح.");
    check.pool = raw.pool;
  }
  if (meta.params.includes("value")) {
    if (!meta.value || !valueOk(meta.value, raw.value)) return fail("NET2_CHECK_VALUE_INVALID", "القيمة المطلوبة في الفحص " + where + " غير صالحة.");
    check.value = meta.value === "vlanList" && raw.value !== "all" ? compressVlans(parseVlanList(raw.value as string)!) : raw.value as string | number | boolean;
  }
  return { ok: true, check };
}
const shown = (v: unknown): string => (v === undefined || v === null || v === "" ? "—" : String(v));
const onOff = (b: boolean) => (b ? "yes" : "no");
type Outcome = { expected: string; actual: string; passed: boolean; evidence?: string[] };
export function evaluateNet2Check(c: Net2Check, state: Net2State, config: Net2Config): Outcome {
  const meta = NET2_CHECKS[c.kind];
  const same = (actual: unknown): Outcome => {
    const passed = actual !== undefined && actual === c.value;
    if (meta?.secret) return { expected: "(القيمة المطلوبة)", actual: actual === undefined ? "—" : passed ? "(مطابقة)" : "(مختلفة)", passed };
    return { expected: shown(c.value), actual: shown(actual), passed };
  };
  const flag = (actual: boolean | undefined): Outcome => ({ expected: onOff(c.value === true), actual: actual === undefined ? "—" : onOff(actual), passed: actual !== undefined && actual === c.value });
  if (c.kind === "reachability") {
    const r = canReachNet2(config, state, c.source!, c.destination!);
    const evidence = [r.reason, ...(r.path && r.path.length ? ["path: " + r.path.join(" → ")] : [])];
    return { expected: c.value ? "reachable" : "unreachable", actual: r.reachable ? "reachable" : "unreachable", passed: r.reachable === c.value, evidence };
  }
  if (c.kind === "browse") {
    const r = browseNet2(config, state, c.source!, c.url!);
    return { expected: c.value ? "page loads" : "no page", actual: r.ok ? "page loads" : "no page", passed: r.ok === c.value, evidence: [r.ok ? "HTTP 200" : String(r.reason)] };
  }
  const id = c.deviceId!, st = state.devices[id];
  if (!st) return same(undefined);
  if (meta.device === "host") {
    if (c.kind === "host.wifiAssociated") return flag(state.ops.wifi[id]?.status === "associated");
    if (c.kind === "host.ssid") return same(state.ops.wifi[id]?.status === "associated" ? state.ops.wifi[id].ssid : undefined);
    const o = state.ops.adapters[id + "/" + c.adapter];
    const h = st as Net2HostState;
    switch (c.kind) {
      case "host.mode": return same(h.adapters[c.adapter as "eth0"]?.mode);
      case "host.dhcpLease": return flag(o?.status === "dhcp");
      case "host.dhcpServer": return same(o?.status === "dhcp" ? o.dhcpServer : undefined);
      default: return same(o ? o[c.kind.slice(5) as "address" | "mask" | "gateway" | "dns"] : undefined);
    }
  }
  if (meta.device === "ap") { const a = st as Net2ApState; const v = a[c.kind.slice(3) as keyof Net2ApState]; return typeof c.value === "boolean" ? flag(v as boolean) : same(v === "" ? undefined : v); }
  if (c.kind.endsWith("Password") || c.kind.endsWith("Secret") || c.kind.endsWith("Login") || c.kind.endsWith("passwordEncryption")) {
    const sec = (st as Net2SwitchState | Net2RouterState).security as Record<string, unknown>;
    const field = c.kind.split(".")[1] === "passwordEncryption" ? "encryption" : c.kind.split(".")[1];
    if (c.kind === "switch.vtpPassword") { const p = (st as Net2SwitchState).vtp.password; return same(p === "" ? undefined : p); }
    return typeof c.value === "boolean" ? flag(sec[field] === true) : same(sec[field]);
  }
  if (meta.device === "router") {
    const r = st as Net2RouterState;
    switch (c.kind) {
      case "router.hostname": return same(r.hostname);
      case "router.ipAddress": case "router.subnetMask": { const x = c.interface!.includes(".") ? r.subinterfaces[c.interface!] : r.interfaces[c.interface!]; return same(c.kind === "router.ipAddress" ? x?.ipAddress : x?.subnetMask); }
      case "router.interfaceEnabled": { const up = c.interface!.includes(".") ? (r.subinterfaces[c.interface!] ? r.subinterfaces[c.interface!].shutdown !== true : undefined) : r.interfaces[c.interface!]?.shutdown === false; return flag(up); }
      case "router.subinterfaceVlan": return same(r.subinterfaces[c.interface!]?.vlan);
      case "router.subinterfaceNative": return flag(r.subinterfaces[c.interface!] ? r.subinterfaces[c.interface!].native === true : undefined);
      case "router.dhcpPool": return flag(hasOwn(r.dhcp.pools, c.pool!));
      case "router.dhcpNetwork": { const p = hasOwn(r.dhcp.pools, c.pool!) ? r.dhcp.pools[c.pool!] : undefined; return same(p?.network && p.mask ? p.network + " " + p.mask : undefined); }
      case "router.dhcpDefaultRouter": return same(hasOwn(r.dhcp.pools, c.pool!) ? r.dhcp.pools[c.pool!].defaultRouter : undefined);
      case "router.dhcpDns": return same(hasOwn(r.dhcp.pools, c.pool!) ? r.dhcp.pools[c.pool!].dns : undefined);
      case "router.dhcpExcluded": {
        const [a, b] = String(c.value).split(" "), hit = r.dhcp.excluded.some(([x, y]) => x === a && y === (b ?? a));
        return { expected: String(c.value), actual: r.dhcp.excluded.map(([x, y]) => (x === y ? x : x + " " + y)).join(", ") || "—", passed: hit };
      }
    }
    return same(undefined);
  }
  const s = st as Net2SwitchState;
  const vtp = state.ops.vtp[id];
  const vlanDb = vtp ? vtp.vlans : [1, ...Object.keys(s.vlans).map(Number)];
  const names = vtp?.source && state.devices[vtp.source] ? (state.devices[vtp.source] as Net2SwitchState).vlans : s.vlans;
  switch (c.kind) {
    case "switch.hostname": return same(s.hostname);
    case "switch.vlanExists": { const ok = vlanDb.includes(c.vlan!); return { expected: "exists", actual: ok ? "exists" : "missing", passed: ok }; }
    case "switch.vlanName": return same(vlanDb.includes(c.vlan!) ? (c.vlan === 1 ? "default" : names[String(c.vlan)]?.name ?? "VLAN" + String(c.vlan).padStart(4, "0")) : undefined);
    case "switch.vtpMode": return same(s.vtp.mode);
    case "switch.vtpDomain": return same(s.vtp.domain || undefined);
    case "switch.vtpVersion": return same(s.vtp.version);
  }
  const e = effectiveSwitchIf(s, c.interface!);
  const ps = e.portSecurity;
  switch (c.kind) {
    case "switch.portMode": return same(e.mode === "dynamic" ? undefined : e.mode);
    case "switch.accessVlan": return same(e.accessVlan);
    case "switch.nativeVlan": return same(e.nativeVlan);
    case "switch.allowedVlans": return same(e.allowed === "all" ? "all" : compressVlans(e.allowed));
    case "switch.interfaceEnabled": return flag(!e.shutdown);
    case "switch.sviAddress": return same(e.ipAddress);
    case "switch.sviMask": return same(e.subnetMask);
    case "switch.portSecurity": return flag(ps ? ps.enabled : undefined);
    case "switch.portSecurityMaximum": return same(ps?.enabled ? ps.maximum : undefined);
    case "switch.portSecuritySticky": return flag(ps?.enabled ? ps.sticky : undefined);
    case "switch.portSecurityViolation": return same(ps?.enabled ? ps.violation : undefined);
    case "switch.portErrDisabled": return flag(state.ops.portSecurity[id + "|" + c.interface]?.errDisabled === true);
  }
  return same(undefined);
}
/** A readable default label for a check (the editor pre-fills it; the teacher may edit it). */
export function defaultNet2CheckLabel(c: Partial<Net2Check>, config: Net2Config): string {
  const name = (id: unknown) => (typeof id === "string" ? net2Device(config, id)?.label ?? id : "?");
  const meta = hasOwn(NET2_CHECKS, String(c.kind)) ? NET2_CHECKS[String(c.kind)] : undefined;
  if (!meta) return "فحص";
  if (c.kind === "reachability") return name(c.source) + " ⇄ " + name(c.destination) + (c.value === false ? " (معزول)" : "");
  if (c.kind === "browse") return name(c.source) + " → " + String(c.url ?? "");
  const extra = [c.adapter, c.interface, c.vlan !== undefined ? "VLAN " + c.vlan : undefined, c.pool].filter(Boolean).join(" ");
  return (name(c.deviceId) + (extra ? " " + extra : "") + " — " + meta.label).slice(0, 120);
}

// ── the plugin ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const MAX_REVIEW_OUTPUT_LINES = 40;
export const NETWORK_TOPOLOGY_V2_LABEL = "محاكي شبكات المنهاج (راوتر / سويتش / حاسوب / لابتوب / نقطة وصول / خادم)";
/** The code-owned DESCRIPTOR of networkTopology@2 (metadata only). actionKinds is EXACTLY the normalizer's vocabulary (contract-tested). */
export const NETWORK_TOPOLOGY_DESCRIPTOR_V2: SmartSimPluginDescriptorV1 = {
  descriptorVersion: 1, key: NETWORK_TOPOLOGY_V2_KEY, version: NETWORK_TOPOLOGY_V2_VERSION, label: NETWORK_TOPOLOGY_V2_LABEL, domain: "networking",
  sceneKinds: ["2d"], rendererFamilies: ["svg2d", "terminal", "form"],
  capabilities: ["scene.2d", "object.select", "object.label", "network.links", "network.cli", "network.hostConfig", "network.ping"],
  actionKinds: [...NET2_ACTION_KINDS], checkKinds: [...NET2_CHECK_KINDS], genericRules: [], assetKinds: [],
  tools: ["select", "terminal", "form", "probe"], accessibility: ["keyboardAlternative", "objectList", "semanticLabels", "toolLabels", "textTranscript"],
  supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: false }
};
export const networkTopologyPluginV2: SmartSimPlugin<Net2Config, Net2Runtime, Net2State, Net2Action, Net2Check> = Object.freeze({
  key: NETWORK_TOPOLOGY_V2_KEY,
  version: NETWORK_TOPOLOGY_V2_VERSION,
  label: NETWORK_TOPOLOGY_V2_LABEL,
  maxActions: NET2_LIMITS.actions,
  descriptor: NETWORK_TOPOLOGY_DESCRIPTOR_V2,
  checkKinds: NET2_CHECK_KINDS,
  validateConfig: (raw: unknown) => { const r = validateNet2Config(raw); return r.ok ? { ok: true as const, config: r.config } : { ok: false as const, issues: r.issues }; },
  createRuntime: createNet2Runtime,
  normalizeAction: normalizeNet2Action,
  validateActions: (actions: readonly Net2Action[]) => validateNet2Actions(actions),
  applyAction: applyNet2Action,
  canonicalState: (r: Net2Runtime) => net2State(r),
  serializeState: (s: Net2State) => JSON.stringify(s),
  validateCheck: validateNet2Check,
  evaluateCheck: evaluateNet2Check,
  reviewDetails: (actions: readonly Net2Action[], config: Net2Config) => {
    const r = replayNet2(config, actions);
    if (!r.ok) return {};
    const transcripts: Record<string, { input: string; prompt: string; status: string; output: string[] }[]> = {};
    for (const id of Object.keys(r.transcripts).sort()) if (r.transcripts[id].length) transcripts[id] = r.transcripts[id].map(e => ({ input: e.input, prompt: e.prompt, status: e.result.status, output: e.result.output.slice(0, MAX_REVIEW_OUTPUT_LINES) }));
    return { transcripts };
  }
});
export { ownKeys, isPlainText };
