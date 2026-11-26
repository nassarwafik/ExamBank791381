// N2 (docs/enterprise-network-lab-tool-design.md §7) — the network LAB's replay, client-only.
//
// The lab's answer to «what is the network now?»: the learner's topology and action list replayed with networkTopology@2's own runtime
// (createNet2Runtime / applyNet2Action, unchanged) on the lab's engine configuration (labEngineConfig: the topology + the lab state + the
// hooks), with three lab additions around it:
//   • a router line first goes through the lab CLI (netLabCli); whatever it does not recognise runs in the exam's router CLI unchanged;
//   • `host.setIpv6` (a lab action) sets a host's IPv6 address; `ping` / `tracert` to an IPv6 address run on the lab's IPv6 path, and
//     `ipconfig` shows the IPv6 address under the adapter;
//   • hubs are not devices networkTopology@2's runtime knows: the runtime is created without them, and the operational state is then
//     reconciled on the whole lab network (the hubs repeat frames inside the engine's own flood).
// The result has networkTopology@2's replay shape, so its device surfaces (CLI, Desktop, AP, services) show it as they are.
import { adapterNames, isHostKind, net2Device, type Net2Config } from "../net2Model";
import {
  applyNet2Action, createNet2Runtime, net2Modes, net2Prompts, net2State, normalizeNet2Action, runtimeDevices, validateNet2Actions,
  type Net2Action, type Net2Runtime, type Net2TranscriptEntry,
} from "../net2Plugin";
import { makeNet, reconcile, type Net, type Net2State } from "../net2Network";
import { HOST_PROMPT } from "../net2Host";
import { routerPrompt2 } from "../net2RouterCli";
import { LAB_LIMITS, emptyLabRouter, formatIpv6, isHub, isSerialPort, parseIpv6, parseIpv6Prefix, v6Display, type LabData, type LabRouter } from "./netLabModel";
import { labEngineConfig, labProbe6, type LabEngineConfig } from "./netLabEngine";
import { labPrompt, labRouterCommand, type LabSub } from "./netLabCli";

export type LabAction = Net2Action | { type: "host.setIpv6"; deviceId: string; adapter: "eth0" | "wlan0"; address: string; gateway: string };
export type LabState = Net2State & { lab: LabData };
export type LabReplay =
  | { ok: true; actions: LabAction[]; state: LabState; transcripts: Record<string, Net2TranscriptEntry[]>; prompts: Record<string, string>; modes: Record<string, string>; engine: LabEngineConfig }
  | { ok: false; code: string };

const hasOwnKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
/** One raw action of the lab, read strictly: networkTopology@2's own vocabulary, plus `host.setIpv6`. */
export function normalizeLabAction(raw: unknown, config: Net2Config): { ok: true; action: LabAction } | { ok: false; code: string } {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && (raw as { type?: unknown }).type === "host.setIpv6") {
    const o = raw as Record<string, unknown>, d = typeof o.deviceId === "string" ? net2Device(config, o.deviceId) : undefined;
    if (!hasOwnKeys(o, ["type", "deviceId", "adapter", "address", "gateway"]) || !d || !isHostKind(d.kind) || !adapterNames(d).includes(o.adapter as "eth0")) return { ok: false, code: "NET2_ACTION_INVALID" };
    if (typeof o.address !== "string" || typeof o.gateway !== "string") return { ok: false, code: "NET2_ACTION_INVALID" };
    if (o.address !== "" && !parseIpv6Prefix(o.address)) return { ok: false, code: "NET2_ACTION_INVALID" };
    if (o.gateway !== "" && (o.address === "" || parseIpv6(o.gateway) === null)) return { ok: false, code: "NET2_ACTION_INVALID" };
    const p = o.address ? parseIpv6Prefix(o.address)! : null;
    return { ok: true, action: { type: "host.setIpv6", deviceId: d.id, adapter: o.adapter as "eth0" | "wlan0", address: p ? p.addr + "/" + p.len : "", gateway: o.gateway ? formatIpv6(parseIpv6(o.gateway)!) : "" } };
  }
  return normalizeNet2Action(raw, config);
}
/** The simulator's bounds for the lab's action list (its own, plus at most 50 IPv6 settings per host). */
export function validateLabActions(actions: readonly LabAction[]): string | undefined {
  const v6 = new Map<string, number>();
  for (const a of actions) if (a.type === "host.setIpv6") { const n = (v6.get(a.deviceId) ?? 0) + 1; v6.set(a.deviceId, n); if (n > LAB_LIMITS.ipv6ActionsPerHost) return "LAB_IPV6_ACTIONS_TOO_MANY"; }
  return validateNet2Actions(actions.filter((a): a is Net2Action => a.type !== "host.setIpv6"));
}

type LabRuntime = { base: Net2Runtime; data: LabData; subs: Record<string, LabSub> };
const strip = (config: Net2Config): Net2Config => {
  const hubs = new Set(config.devices.filter(isHub).map(d => d.id));
  return { v: 2, devices: config.devices.filter(d => !hubs.has(d.id)), links: config.links.filter(l => ![l.a, l.b].some(e => hubs.has(e.deviceId) || isSerialPort(e.port))) };
};
const settle = (rt: LabRuntime, config: Net2Config): LabRuntime => ({ ...rt, base: { ...rt.base, ops: reconcile(labEngineConfig(config, rt.data), runtimeDevices(rt.base), rt.base.ops) } });
function createLabRuntime(config: Net2Config): LabRuntime {
  return settle({ base: createNet2Runtime(strip(config)), data: { routers: {}, hosts6: {} }, subs: {} }, config);
}
const push = (base: Net2Runtime, id: string, e: Net2TranscriptEntry): Net2Runtime => ({ ...base, transcripts: { ...base.transcripts, [id]: [...(base.transcripts[id] ?? []), e] } });
const viewOf = (rt: LabRuntime, config: Net2Config): Net => makeNet(labEngineConfig(config, rt.data), runtimeDevices(rt.base), rt.base.ops);

function ping6Lines(rt: LabRuntime, config: Net2Config, host: string, kind: "ping" | "tracert", target: string): string[] {
  const dst = parseIpv6(target)!, shown = formatIpv6(dst);
  const p = labProbe6(viewOf(rt, config), host, dst);
  if (kind === "ping") {
    const ok = p.ok, out = ["", "Pinging " + shown + " with 32 bytes of data:", ""];
    out.push(...Array(4).fill(ok ? "Reply from " + shown + ": time<1ms" : p.reason === "SOURCE_NO_ADDRESS" ? "PING: transmit failed. General failure." : "Request timed out."));
    out.push("", "Ping statistics for " + shown + ":", "    Packets: Sent = 4, Received = " + (ok ? 4 : 0) + ", Lost = " + (ok ? 0 : 4) + " (" + (ok ? 0 : 100) + "% loss),");
    return out;
  }
  const out = ["", "Tracing route to " + shown + " over a maximum of 30 hops:", ""];
  const line = (n: number, what: string) => ("  " + n).padStart(3) + "     0 ms     0 ms     0 ms     " + what;
  p.hops.forEach((h, i) => out.push(line(i + 1, h)));
  out.push(p.ok ? line(p.hops.length + 1, shown) : ("  " + (p.hops.length + 1)).padStart(3) + "      *        *        *     Request timed out.", "", "Trace complete.");
  return out;
}

function applyLabAction(rt: LabRuntime, a: LabAction, config: Net2Config): LabRuntime {
  const engine = () => labEngineConfig(config, rt.data);
  if (a.type === "host.setIpv6") {
    const hosts6 = { ...rt.data.hosts6 };
    if (!a.address) delete hosts6[a.deviceId];
    else { const p = parseIpv6Prefix(a.address)!; hosts6[a.deviceId] = { iface: a.adapter, addr: p.addr, len: p.len, gw: a.gateway }; }
    return { ...rt, data: { ...rt.data, hosts6 } };
  }
  if (a.type === "host.command") {
    const m = /^\s*(ping|tracert)\s+([0-9A-Fa-f:]+)\s*$/.exec(a.command);
    if (m && m[2].includes(":")) {
      if (parseIpv6(m[2]) === null) return { ...rt, base: push(rt.base, a.deviceId, { input: a.command, prompt: HOST_PROMPT, result: { status: "invalid", output: ["Ping request could not find host " + m[2] + ". Please check the name and try again."] } }) };
      return { ...rt, base: push(rt.base, a.deviceId, { input: a.command, prompt: HOST_PROMPT, result: { status: "ok", output: ping6Lines(rt, config, a.deviceId, m[1].toLowerCase() as "ping" | "tracert", m[2]) } }) };
    }
    let base = applyNet2Action(rt.base, a, engine());
    const h = rt.data.hosts6[a.deviceId];
    if (h && /^\s*ipconfig(\s+\/all)?\s*$/i.test(a.command)) {
      // the IPv6 address belongs under its adapter, right after the adapter's DNS suffix line
      const list = base.transcripts[a.deviceId], last = list[list.length - 1], out = [...last.result.output];
      const title = h.iface === "eth0" ? "Ethernet adapter Ethernet0:" : "Wireless LAN adapter Wi-Fi:";
      const at = out.findIndex((x, i) => i > out.indexOf(title) && x.includes("Connection-specific DNS Suffix"));
      if (out.indexOf(title) >= 0 && at >= 0) {
        const dotted = (label: string, value: string) => "   " + (label + " ").padEnd(36, ". ") + ": " + value;
        out.splice(at + 1, 0, dotted("IPv6 Address", h.addr + "/" + h.len), ...(h.gw ? [dotted("Default Gateway (IPv6)", h.gw)] : []));
        base = { ...base, transcripts: { ...base.transcripts, [a.deviceId]: [...list.slice(0, -1), { ...last, result: { ...last.result, output: out } }] } };
      }
    }
    return { ...rt, base };
  }
  if (a.type === "router.command") {
    const session = rt.base.routers[a.deviceId];
    if (!session) return rt;
    const sub = rt.subs[a.deviceId] ?? null;
    const r = labRouterCommand({ session, lab: rt.data.routers[a.deviceId], sub, line: a.command, view: () => viewOf(rt, config), id: a.deviceId });
    if (r.kind === "handled") {
      const prompt = labPrompt(session, sub);
      const routers = { ...rt.data.routers, [a.deviceId]: r.lab as LabRouter };
      const changed = JSON.stringify(r.lab) !== JSON.stringify(rt.data.routers[a.deviceId] ?? emptyLabRouter());
      let base: Net2Runtime = { ...rt.base, routers: { ...rt.base.routers, [a.deviceId]: r.session } };
      base = push(base, a.deviceId, { input: a.command, prompt, result: { status: r.result.status, output: r.result.output, ...(r.result.hint ? { hint: r.result.hint } : {}) } });
      const next: LabRuntime = { base, data: { ...rt.data, routers }, subs: { ...rt.subs, [a.deviceId]: r.sub } };
      return changed ? settle(next, config) : next;
    }
    // networkTopology@2's CLI runs it; in a router sub-mode the line was a global command (IOS: it leaves the sub-mode)
    let base = applyNet2Action(rt.base, a, engine());
    if (sub) {
      const list = base.transcripts[a.deviceId], last = list[list.length - 1];
      base = { ...base, transcripts: { ...base.transcripts, [a.deviceId]: [...list.slice(0, -1), { ...last, prompt: labPrompt(session, sub) }] } };
    }
    return { ...rt, base, subs: { ...rt.subs, [a.deviceId]: r.sub } };
  }
  return { ...rt, base: applyNet2Action(rt.base, a, engine()) };
}

function result(rt: LabRuntime, config: Net2Config, actions: LabAction[]): LabReplay {
  const prompts = net2Prompts(rt.base);
  for (const [id, sub] of Object.entries(rt.subs)) if (sub && rt.base.routers[id]) prompts[id] = labPrompt(rt.base.routers[id], sub);
  for (const [id, s] of Object.entries(rt.base.routers)) if (!rt.subs[id]) prompts[id] = routerPrompt2(s);
  return { ok: true, actions, state: { ...net2State(rt.base), lab: JSON.parse(JSON.stringify(rt.data)) as LabData }, transcripts: rt.base.transcripts, prompts, modes: net2Modes(rt.base), engine: labEngineConfig(config, rt.data) };
}
/** A view-side cache: the runtime after an action prefix (the common case: one more action replays only that action). */
export type LabReplayCache = { config: Net2Config; keys: string[]; rt: LabRuntime };
export function replayLab(config: Net2Config, rawActions: readonly unknown[], cache?: LabReplayCache): { replay: LabReplay; cache?: LabReplayCache } {
  if (!Array.isArray(rawActions)) return { replay: { ok: false, code: "NET2_ACTION_INVALID" } };
  const actions: LabAction[] = [];
  for (const raw of rawActions) { const n = normalizeLabAction(raw, config); if (!n.ok) return { replay: { ok: false, code: n.code } }; actions.push(n.action); }
  const code = validateLabActions(actions);
  if (code) return { replay: { ok: false, code } };
  const keys = actions.map(a => JSON.stringify(a));
  try {
    const resume = !!cache && cache.config === config && cache.keys.length <= keys.length && cache.keys.every((k, i) => k === keys[i]);
    let rt = resume ? cache!.rt : createLabRuntime(config);
    for (let i = resume ? cache!.keys.length : 0; i < actions.length; i++) rt = applyLabAction(rt, actions[i], config);
    return { replay: result(rt, config, actions), cache: { config, keys, rt } };
  } catch {
    return { replay: { ok: false, code: "NET2_REPLAY_FAILED" } };
  }
}
export const v6Text = v6Display;
