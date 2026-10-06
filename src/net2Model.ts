// Phase 20C — networkTopology@2 CONFIGURATION AUTHORITY (pure; compiled into the shared server build).
//
// The teacher-owned public topology of the curriculum network simulator: six device kinds (router, switch, PC, laptop, access point,
// server), host adapters (Ethernet / wireless), cabled links between real ports, canvas positions, labels and an optional teacher-authored
// INITIAL STATE per device (validated by the same engines the student uses). The configuration is strict: unknown keys, unknown kinds,
// impossible adapters, ports a device does not have, duplicate identities, a port used twice, out-of-range positions and every malformed
// initial state are refused with a precise issue — never repaired. networkTopology@1 (src/networkTopologyModel.ts) is frozen and untouched;
// a v1 configuration (`v: 1`) is refused here, never migrated.
//
// Deterministic identity: every adapter / interface MAC address is derived from the device id and the interface name (no randomness).
import { SWITCH_PORTS, isValidHostname } from "./networkCliEngine";
import { ROUTER_PORTS } from "./routerCliEngine";
import { FORBIDDEN_KEYS, hasControlChar, isIpv4, isObj, isSubnetMask, isUsableHostAddress, macFromIdentity } from "./net2Common";
import { createSwitchState, normalizeSwitchState, type Net2SwitchState } from "./net2SwitchCli";
import { createRouterState2, normalizeRouterState2, type Net2RouterState } from "./net2RouterCli";

export const NET2_CONFIG_VERSION = 2 as const;
export const NET2_LIMITS = Object.freeze({
  devices: 30, links: 60, actions: 1000, commandsPerDevice: 300, hostCommandsPerDevice: 200, wifiActionsPerHost: 50, labelChars: 40, commandChars: 512,
  dnsRecords: 16, httpTitleChars: 60, httpBodyChars: 500, dhcpServerMax: 256, urlChars: 160, securePorts: 48
});
export const NET2_DEVICE_KINDS = Object.freeze(["router", "switch", "pc", "laptop", "ap", "server"] as const);
export type Net2DeviceKind = (typeof NET2_DEVICE_KINDS)[number];
export type Net2HostKind = "pc" | "laptop" | "server";
export type Net2AdapterKind = "ethernet" | "wireless";
export type Net2AdapterName = "eth0" | "wlan0";
export const ADAPTER_NAME: Readonly<Record<Net2AdapterKind, Net2AdapterName>> = Object.freeze({ ethernet: "eth0", wireless: "wlan0" });
const DEFAULT_ADAPTERS: Readonly<Record<Net2HostKind, readonly Net2AdapterKind[]>> = Object.freeze({ pc: ["ethernet"], laptop: ["wireless"], server: ["ethernet"] });
export const isHostKind = (k: unknown): k is Net2HostKind => k === "pc" || k === "laptop" || k === "server";

// ── device states (academic configuration) ─────────────────────────────────────────────────────────────────────────────────────────
export type Net2HostAdapter = { mode: "static" | "dhcp"; address?: string; mask?: string; gateway?: string; dns?: string; released?: true };
export type Net2DhcpServerPool = { defaultRouter: string; dns: string; start: string; mask: string; max: number };
export type Net2Services = { dhcp?: { enabled: boolean; pool: Net2DhcpServerPool }; dns?: { enabled: boolean; records: { name: string; address: string }[] }; http?: { enabled: boolean; title: string; body: string } };
export type Net2HostState = { v: 2; device: "host"; adapters: Partial<Record<Net2AdapterName, Net2HostAdapter>>; wifi?: { ssid: string; passphrase: string }; services?: Net2Services };
export type Net2ApState = { v: 2; device: "ap"; enabled: boolean; ssid: string; security: "open" | "wpa2"; passphrase: string; address?: string; mask?: string; gateway?: string };
export type Net2DeviceState = Net2SwitchState | Net2RouterState | Net2HostState | Net2ApState;

export type Net2Device = { id: string; kind: Net2DeviceKind; label: string; x: number; y: number; adapters?: Net2AdapterKind[]; initial?: Net2DeviceState };
export type Net2Endpoint = { deviceId: string; port: string };
export type Net2Link = { id: string; a: Net2Endpoint; b: Net2Endpoint };
export type Net2Config = { v: 2; devices: Net2Device[]; links: Net2Link[] };
export type Net2Issue = { code: string; message: string; path?: string };
export type Net2ConfigResult = { ok: true; config: Net2Config; issues: [] } | { ok: false; issues: Net2Issue[] };

// ── value grammars shared by the config, the actions and the checks ────────────────────────────────────────────────────────────────
export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
export const isNet2Id = (v: unknown): v is string => typeof v === "string" && ID_PATTERN.test(v) && !FORBIDDEN_KEYS.has(v);
export const isSsid = (v: unknown): v is string => typeof v === "string" && /^[\x20-\x7e]{1,32}$/.test(v) && v.trim() === v;
export const isWpaPassphrase = (v: unknown): v is string => typeof v === "string" && /^[\x20-\x7e]{8,63}$/.test(v);
export const isApPassphrase = (v: unknown): v is string => v === "" || isWpaPassphrase(v);
export const isDnsName = (v: unknown): v is string => typeof v === "string" && v.length <= 63 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(v);
const ipOrEmpty = (v: unknown): v is string => v === "" || (typeof v === "string" && isIpv4(v));
/** Plain text for the simulated web page: no markup characters at all, no control characters except a newline. */
export const isPlainText = (v: unknown, max: number, newline: boolean): v is string => typeof v === "string" && v.length <= max && !/[<>]/.test(v) && !hasControlChar(v, newline);
/** The simulated browser's URL grammar: `http://<dns-name | IPv4>[/path]` only (never javascript:, data:, https: or a real network). */
export function parseNet2Url(raw: unknown): { host: string; path: string } | null {
  if (typeof raw !== "string" || raw.length > NET2_LIMITS.urlChars) return null;
  const m = /^http:\/\/([A-Za-z0-9.-]{1,63})(\/[A-Za-z0-9._~/-]{0,100})?$/.exec(raw);
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (!isIpv4(host) && !isDnsName(host)) return null;
  return { host, path: m[2] ?? "/" };
}

/** The deterministic MAC of a device interface (`02xx.xxxx.xxxx`, locally administered unicast). Router sub-interfaces share their parent's. */
export const deriveMac = (deviceId: string, iface: string): string => macFromIdentity(deviceId + "/" + iface.split(".")[0]);

export function deviceAdapters(d: Pick<Net2Device, "kind" | "adapters">): Net2AdapterKind[] {
  if (!isHostKind(d.kind)) return [];
  return d.adapters ? [...d.adapters] : [...DEFAULT_ADAPTERS[d.kind]];
}
export const adapterNames = (d: Pick<Net2Device, "kind" | "adapters">): Net2AdapterName[] => deviceAdapters(d).map(a => ADAPTER_NAME[a]);
/** The cable ports a device has: router g0/0–3, switch Fa0/1–24 + Gi0/1–2, a host's eth0 (Ethernet adapter only), the AP uplink eth0. */
export function devicePorts(d: Pick<Net2Device, "kind" | "adapters">): readonly string[] {
  switch (d.kind) {
    case "router": return ROUTER_PORTS;
    case "switch": return SWITCH_PORTS;
    case "ap": return ["eth0"];
    default: return deviceAdapters(d).includes("ethernet") ? ["eth0"] : [];
  }
}

// ── canonical device states ────────────────────────────────────────────────────────────────────────────────────────────────────────
export function canonicalHostAdapter(a: Net2HostAdapter): Net2HostAdapter {
  const out: Net2HostAdapter = { mode: a.mode };
  if (a.address && a.mask) { out.address = a.address; out.mask = a.mask; }
  if (a.gateway) out.gateway = a.gateway;
  if (a.dns) out.dns = a.dns;
  if (a.released === true && a.mode === "dhcp") out.released = true;
  return out;
}
export function canonicalHostState(s: Net2HostState, names: readonly Net2AdapterName[]): Net2HostState {
  const adapters: Partial<Record<Net2AdapterName, Net2HostAdapter>> = {};
  for (const n of names) adapters[n] = canonicalHostAdapter(s.adapters[n] ?? { mode: "static" });
  const out: Net2HostState = { v: 2, device: "host", adapters };
  if (s.wifi && names.includes("wlan0")) out.wifi = { ssid: s.wifi.ssid, passphrase: s.wifi.passphrase };
  if (s.services) {
    const sv: Net2Services = {};
    if (s.services.dhcp) sv.dhcp = { enabled: s.services.dhcp.enabled, pool: { ...s.services.dhcp.pool } };
    if (s.services.dns) sv.dns = { enabled: s.services.dns.enabled, records: s.services.dns.records.map(r => ({ name: r.name, address: r.address })) };
    if (s.services.http) sv.http = { enabled: s.services.http.enabled, title: s.services.http.title, body: s.services.http.body };
    if (Object.keys(sv).length) out.services = sv;
  }
  return out;
}
export const createHostState = (names: readonly Net2AdapterName[]): Net2HostState => canonicalHostState({ v: 2, device: "host", adapters: {} }, names);
export function canonicalApState(s: Net2ApState): Net2ApState {
  const out: Net2ApState = { v: 2, device: "ap", enabled: s.enabled, ssid: s.ssid, security: s.security, passphrase: s.passphrase };
  for (const f of ["address", "mask", "gateway"] as const) if (s[f]) out[f] = s[f];
  return out;
}
export const createApState = (): Net2ApState => ({ v: 2, device: "ap", enabled: true, ssid: "Default", security: "open", passphrase: "" });

/** Strict validation of a static adapter value set (shared by the initial state and the host.setStatic action). */
export function validStaticFields(f: { address: unknown; mask: unknown; gateway: unknown; dns: unknown }): boolean {
  if (!ipOrEmpty(f.address) || !(f.mask === "" || (typeof f.mask === "string" && isSubnetMask(f.mask))) || !ipOrEmpty(f.gateway) || !ipOrEmpty(f.dns)) return false;
  if ((f.address === "") !== (f.mask === "")) return false;
  return f.address === "" || isUsableHostAddress(f.address as string, f.mask as string);
}
export function validDhcpServerPool(p: unknown): p is Net2DhcpServerPool {
  if (!isObj(p) || Object.keys(p).sort().join(",") !== "defaultRouter,dns,mask,max,start") return false;
  if (!ipOrEmpty(p.defaultRouter) || !ipOrEmpty(p.dns) || typeof p.start !== "string" || typeof p.mask !== "string" || !isSubnetMask(p.mask) || !isUsableHostAddress(p.start, p.mask)) return false;
  return typeof p.max === "number" && Number.isInteger(p.max) && p.max >= 1 && p.max <= NET2_LIMITS.dhcpServerMax;
}
export function validDnsRecords(r: unknown): r is { name: string; address: string }[] {
  if (!Array.isArray(r) || r.length > NET2_LIMITS.dnsRecords) return false;
  const names = new Set<string>();
  for (const x of r) {
    if (!isObj(x) || Object.keys(x).sort().join(",") !== "address,name" || !isDnsName(x.name) || typeof x.address !== "string" || !isIpv4(x.address) || names.has(x.name)) return false;
    names.add(x.name);
  }
  return true;
}
export const validHttpPage = (title: unknown, body: unknown): boolean => isPlainText(title, NET2_LIMITS.httpTitleChars, false) && isPlainText(body, NET2_LIMITS.httpBodyChars, true);

function normalizeHostState(raw: unknown, kind: Net2HostKind, names: readonly Net2AdapterName[]): Net2HostState | undefined {
  if (!isObj(raw) || Object.keys(raw).some(k => !["v", "device", "adapters", "wifi", "services"].includes(k)) || raw.v !== 2 || raw.device !== "host" || !isObj(raw.adapters)) return undefined;
  const adapters: Partial<Record<Net2AdapterName, Net2HostAdapter>> = {};
  for (const n of Object.keys(raw.adapters)) {
    const a = raw.adapters[n];
    if (!(names as readonly string[]).includes(n) || !isObj(a) || Object.keys(a).some(k => !["mode", "address", "mask", "gateway", "dns"].includes(k)) || (a.mode !== "static" && a.mode !== "dhcp")) return undefined;
    const f = { address: a.address ?? "", mask: a.mask ?? "", gateway: a.gateway ?? "", dns: a.dns ?? "" };
    if (!validStaticFields(f)) return undefined;
    adapters[n as Net2AdapterName] = { mode: a.mode, address: f.address as string, mask: f.mask as string, gateway: f.gateway as string, dns: f.dns as string };
  }
  const st: Net2HostState = { v: 2, device: "host", adapters };
  if (raw.wifi !== undefined) {
    const w = raw.wifi;
    if (!names.includes("wlan0") || !isObj(w) || Object.keys(w).sort().join(",") !== "passphrase,ssid" || !isSsid(w.ssid) || !isApPassphrase(w.passphrase)) return undefined;
    st.wifi = { ssid: w.ssid, passphrase: w.passphrase };
  }
  if (raw.services !== undefined) {
    const s = raw.services;
    if (kind !== "server" || !isObj(s) || Object.keys(s).some(k => !["dhcp", "dns", "http"].includes(k))) return undefined;
    const sv: Net2Services = {};
    if (s.dhcp !== undefined) { const d = s.dhcp; if (!isObj(d) || Object.keys(d).sort().join(",") !== "enabled,pool" || typeof d.enabled !== "boolean" || !validDhcpServerPool(d.pool)) return undefined; sv.dhcp = { enabled: d.enabled, pool: d.pool }; }
    if (s.dns !== undefined) { const d = s.dns; if (!isObj(d) || Object.keys(d).sort().join(",") !== "enabled,records" || typeof d.enabled !== "boolean" || !validDnsRecords(d.records)) return undefined; sv.dns = { enabled: d.enabled, records: d.records }; }
    if (s.http !== undefined) { const d = s.http; if (!isObj(d) || Object.keys(d).sort().join(",") !== "body,enabled,title" || typeof d.enabled !== "boolean" || !validHttpPage(d.title, d.body)) return undefined; sv.http = { enabled: d.enabled, title: d.title as string, body: d.body as string }; }
    st.services = sv;
  }
  return canonicalHostState(st, names);
}
function normalizeApState(raw: unknown): Net2ApState | undefined {
  if (!isObj(raw) || Object.keys(raw).some(k => !["v", "device", "enabled", "ssid", "security", "passphrase", "address", "mask", "gateway"].includes(k))) return undefined;
  if (raw.v !== 2 || raw.device !== "ap" || typeof raw.enabled !== "boolean" || !isSsid(raw.ssid) || (raw.security !== "open" && raw.security !== "wpa2") || !isApPassphrase(raw.passphrase)) return undefined;
  for (const f of ["address", "gateway"] as const) if (raw[f] !== undefined && !ipOrEmpty(raw[f])) return undefined;
  if (raw.mask !== undefined && raw.mask !== "" && (typeof raw.mask !== "string" || !isSubnetMask(raw.mask))) return undefined;
  if (raw.address && raw.mask && !isUsableHostAddress(raw.address as string, raw.mask as string)) return undefined;
  return canonicalApState(raw as Net2ApState);
}
/** The canonical initial state of a device: the teacher's (strictly validated) initial state, or the factory default of its kind. */
export function initialDeviceState(d: Net2Device): Net2DeviceState {
  if (d.initial) return JSON.parse(JSON.stringify(d.initial)) as Net2DeviceState;
  switch (d.kind) {
    case "switch": return createSwitchState();
    case "router": return createRouterState2();
    case "ap": return createApState();
    default: return createHostState(adapterNames(d));
  }
}
export function normalizeInitialState(kind: Net2DeviceKind, names: readonly Net2AdapterName[], raw: unknown): Net2DeviceState | undefined {
  switch (kind) {
    case "switch": return normalizeSwitchState(raw);
    case "router": return normalizeRouterState2(raw);
    case "ap": return normalizeApState(raw);
    default: return normalizeHostState(raw, kind, names);
  }
}

/** Port Security-enabled ports across a set of device states (bounded per topology so the canonical state stays within the core's JSON bounds). */
export function securePortCount(states: readonly (Net2DeviceState | undefined)[]): number {
  let n = 0;
  for (const st of states) if (st && st.device === "switch") for (const c of Object.values(st.interfaces)) if (c.portSecurity?.enabled) n++;
  return n;
}

// ── the configuration validator ────────────────────────────────────────────────────────────────────────────────────────────────────
const DEVICE_KEYS = ["id", "kind", "label", "x", "y", "adapters", "initial"];
const LINK_KEYS = ["id", "a", "b"];
const inUnit = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
export function validateNet2Config(raw: unknown): Net2ConfigResult {
  const issues: Net2Issue[] = [];
  const fail = (code: string, message: string, path?: string) => { issues.push(path === undefined ? { code, message } : { code, message, path }); };
  if (!isObj(raw)) return { ok: false, issues: [{ code: "NET2_CONFIG_INVALID", message: "إعداد الشبكة يجب أن يكون كائنًا." }] };
  for (const k of Object.keys(raw)) if (!["v", "devices", "links"].includes(k)) fail("NET2_CONFIG_UNKNOWN_KEY", "حقل غير معروف في إعداد الشبكة: " + k, k);
  if (raw.v !== NET2_CONFIG_VERSION) fail("NET2_CONFIG_VERSION_UNSUPPORTED", "إصدار إعداد الشبكة غير مدعوم (المطلوب 2 بالضبط).", "v");
  if (!Array.isArray(raw.devices) || !Array.isArray(raw.links)) { fail("NET2_CONFIG_INVALID", "الأجهزة والوصلات يجب أن تكون قوائم."); return { ok: false, issues }; }
  if (raw.devices.length > NET2_LIMITS.devices) fail("NET2_TOO_MANY_DEVICES", "عدد الأجهزة يتجاوز " + NET2_LIMITS.devices + ".", "devices");
  if (raw.links.length > NET2_LIMITS.links) fail("NET2_TOO_MANY_LINKS", "عدد الوصلات يتجاوز " + NET2_LIMITS.links + ".", "links");
  if (issues.some(i => i.code === "NET2_TOO_MANY_DEVICES" || i.code === "NET2_TOO_MANY_LINKS")) return { ok: false, issues };
  const devices: Net2Device[] = [];
  const byId = new Map<string, Net2Device>();
  raw.devices.forEach((d: unknown, i: number) => {
    const at = "devices[" + i + "]";
    if (!isObj(d)) { fail("NET2_DEVICE_INVALID", "الجهاز رقم " + (i + 1) + " غير صالح.", at); return; }
    if (Object.keys(d).some(k => !DEVICE_KEYS.includes(k))) { fail("NET2_DEVICE_INVALID", "حقول غير معروفة في الجهاز رقم " + (i + 1) + ".", at); return; }
    if (!isNet2Id(d.id)) { fail("NET2_DEVICE_ID_INVALID", "معرّف الجهاز رقم " + (i + 1) + " غير صالح.", at + ".id"); return; }
    if (byId.has(d.id)) { fail("NET2_DEVICE_ID_DUPLICATE", "معرّف جهاز مكرّر: " + d.id, at + ".id"); return; }
    if (!(NET2_DEVICE_KINDS as readonly string[]).includes(d.kind as string)) { fail("NET2_DEVICE_KIND_UNSUPPORTED", "نوع جهاز غير مدعوم: " + String(d.kind), at + ".kind"); return; }
    const kind = d.kind as Net2DeviceKind;
    if (typeof d.label !== "string" || !d.label.trim() || d.label.length > NET2_LIMITS.labelChars || hasControlChar(d.label)) { fail("NET2_DEVICE_LABEL_INVALID", "اسم الجهاز " + d.id + " غير صالح.", at + ".label"); return; }
    if (!inUnit(d.x) || !inUnit(d.y)) { fail("NET2_DEVICE_POSITION_INVALID", "موضع الجهاز " + d.id + " يجب أن يكون بين 0 و1.", at); return; }
    const dev: Net2Device = { id: d.id, kind, label: d.label, x: d.x, y: d.y };
    if (d.adapters !== undefined) {
      const a = d.adapters;
      if (!isHostKind(kind) || !Array.isArray(a) || a.length < 1 || a.length > 2 || a.some(x => x !== "ethernet" && x !== "wireless") || new Set(a).size !== a.length) { fail("NET2_DEVICE_ADAPTERS_INVALID", "محوّلات الشبكة للجهاز " + d.id + " غير صالحة.", at + ".adapters"); return; }
      dev.adapters = (["ethernet", "wireless"] as const).filter(x => (a as string[]).includes(x));
    }
    if (d.initial !== undefined) {
      const init = normalizeInitialState(kind, adapterNames(dev), d.initial);
      if (!init) { fail("NET2_DEVICE_INITIAL_INVALID", "الحالة الابتدائية للجهاز " + d.id + " غير صالحة.", at + ".initial"); return; }
      dev.initial = init;
    }
    devices.push(dev); byId.set(dev.id, dev);
  });
  const links: Net2Link[] = [];
  const linkIds = new Set<string>(), used = new Set<string>();
  raw.links.forEach((l: unknown, i: number) => {
    const at = "links[" + i + "]";
    if (!isObj(l) || Object.keys(l).some(k => !LINK_KEYS.includes(k)) || !isObj(l.a) || !isObj(l.b)) { fail("NET2_LINK_INVALID", "الوصلة رقم " + (i + 1) + " غير صالحة.", at); return; }
    if (!isNet2Id(l.id)) { fail("NET2_LINK_INVALID", "معرّف الوصلة رقم " + (i + 1) + " غير صالح.", at + ".id"); return; }
    if (linkIds.has(l.id)) { fail("NET2_LINK_ID_DUPLICATE", "معرّف وصلة مكرّر: " + l.id, at + ".id"); return; }
    const ends: Net2Endpoint[] = [];
    for (const side of [l.a, l.b] as Record<string, unknown>[]) {
      if (Object.keys(side).sort().join(",") !== "deviceId,port" || typeof side.deviceId !== "string" || typeof side.port !== "string") { fail("NET2_LINK_INVALID", "طرف الوصلة " + l.id + " غير صالح.", at); return; }
      const dev = byId.get(side.deviceId);
      if (!dev) { fail("NET2_LINK_DEVICE_UNKNOWN", "الوصلة " + l.id + " تشير إلى جهاز غير موجود: " + side.deviceId, at); return; }
      if (!devicePorts(dev).includes(side.port)) { fail("NET2_LINK_PORT_INVALID", "المنفذ " + side.port + " غير موجود في الجهاز " + dev.id + ".", at); return; }
      ends.push({ deviceId: side.deviceId, port: side.port });
    }
    if (ends[0].deviceId === ends[1].deviceId) { fail("NET2_LINK_SELF", "لا يمكن وصل الجهاز " + ends[0].deviceId + " بنفسه.", at); return; }
    for (const e of ends) { const k = e.deviceId + "|" + e.port; if (used.has(k)) { fail("NET2_PORT_IN_USE", "المنفذ " + e.port + " في الجهاز " + e.deviceId + " مستخدم في وصلة أخرى.", at); return; } }
    for (const e of ends) used.add(e.deviceId + "|" + e.port);
    linkIds.add(l.id);
    links.push({ id: l.id, a: ends[0], b: ends[1] });
  });
  if (securePortCount(devices.map(d => d.initial)) > NET2_LIMITS.securePorts) fail("NET2_SECURE_PORTS_TOO_MANY", "عدد منافذ Port Security في الحالة الابتدائية يتجاوز " + NET2_LIMITS.securePorts + ".", "devices");
  if (issues.length) return { ok: false, issues };
  return { ok: true, config: { v: 2, devices, links }, issues: [] };
}
export const net2Device = (config: Net2Config, id: unknown): Net2Device | undefined => (typeof id === "string" ? config.devices.find(d => d.id === id) : undefined);
/** The peer of a cabled port, or undefined when the port has no cable. */
export function linkPeer(config: Net2Config, deviceId: string, port: string): Net2Endpoint | undefined {
  for (const l of config.links) {
    if (l.a.deviceId === deviceId && l.a.port === port) return l.b;
    if (l.b.deviceId === deviceId && l.b.port === port) return l.a;
  }
  return undefined;
}
export { isValidHostname };
