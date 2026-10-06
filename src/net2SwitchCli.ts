// Phase 20C — the curriculum SWITCH CLI v2 of networkTopology@2 (pure; compiled into the shared server build). networkCli@1 stays frozen;
// this is a separate, versioned engine that reuses only its pure value grammar (interface names, VLAN ids, hostnames, IPv4).
//
// Closed Cisco-style grammar (never a shell): every line is matched against the command table below; anything else is reported and never
// changes state. Two layers, as in v1: a SESSION (mode + selection — navigation, rebuilt by replay) over a sparse canonical DEVICE STATE
// (the graded academic configuration). Operational facts the CLI only DISPLAYS (link status, err-disable, the VTP-effective VLAN
// database, the MAC table, Port Security sightings) arrive through a read-only context computed by the network engine; nothing here
// derives them.
//
// v2 adds: trunk allowed-VLAN lists (list / add / remove / all / none), `no vlan`, VTP (domain / mode server|client / password / version,
// revision counting on the local VLAN database), Port Security (enable, maximum, sticky, static secure MACs, violation mode), passwords
// (enable password / secret, service password-encryption, line console 0 / line vty 0 4 with password / login), `ip default-gateway`,
// and the show family: running-config, vlan brief, interfaces trunk, ip interface brief, interfaces [<if>] switchport, mac address-table,
// port-security [interface <if>], vtp status.
import {
  SWITCH_PORTS, displayInterfaceName, isPhysicalPort, isSviName, isValidHostname, isValidVlanName, normalizeInterfaceName, parseVlanId, shortInterfaceName, sortInterfaceNames
} from "./networkCliEngine";
import {
  FORBIDDEN_KEYS, PASSWORD_MAX, canonicalPasswords, compressVlans, hasOwn, isIpv4, isObj, isPassword, isSubnetMask, isToken, isUsableHostAddress, normalizePasswords, ownKeys, pad, parseMac,
  passwordConfigLines, type Net2Passwords
} from "./net2Common";

export const NET2_SWITCH_STATE_VERSION = 2 as const;
export const NET2_SWITCH_LIMITS = Object.freeze({ inputChars: 200, tokens: 24, allowedVlans: 256, portSecurityMax: 8, vtpNameChars: 32, vlans: 64, svis: 16 });
export type SwitchMode2 = "user" | "privileged" | "global" | "interface" | "vlan" | "line";
export const SWITCH2_MODE_SUFFIX: Readonly<Record<SwitchMode2, string>> = Object.freeze({ user: ">", privileged: "#", global: "(config)#", interface: "(config-if)#", vlan: "(config-vlan)#", line: "(config-line)#" });
export const SWITCH2_MODE_LABEL: Readonly<Record<SwitchMode2, string>> = Object.freeze({ user: "وضع المستخدم (User EXEC)", privileged: "الوضع المتقدّم (Privileged EXEC)", global: "وضع الإعداد العام (Global configuration)", interface: "وضع إعداد الواجهة (Interface configuration)", vlan: "وضع إعداد VLAN (VLAN configuration)", line: "وضع إعداد الخط (Line configuration)" });
export type PortSecurityViolation = "shutdown" | "restrict" | "protect";
export type Net2PortSecurity = { enabled: boolean; maximum: number; sticky: boolean; violation: PortSecurityViolation; macs: string[] };
export type Net2SwitchIf = { mode?: "access" | "trunk"; accessVlan?: number; nativeVlan?: number; allowed?: number[]; shutdown?: boolean; ipAddress?: string; subnetMask?: string; portSecurity?: Net2PortSecurity };
export type Net2Vtp = { mode: "server" | "client"; domain: string; password: string; version: 1 | 2; revision: number };
export type Net2SwitchState = { v: 2; device: "switch"; hostname: string; vlans: Record<string, { name?: string }>; interfaces: Record<string, Net2SwitchIf>; vtp: Net2Vtp; security: Net2Passwords; defaultGateway?: string };
export type Switch2Session = { state: Net2SwitchState; mode: SwitchMode2; selectedInterface?: string; selectedVlan?: number; selectedLine?: "con" | "vty" };
/** Read-only operational view supplied by the network engine (display only — never changes state). */
export type Switch2Context = {
  linkUp?: (port: string) => boolean;
  errDisabled?: (port: string) => boolean;
  effectiveVlans?: { vlans: Record<string, { name?: string }>; revision: number; source: string | null };
  macTable?: readonly { vlan: number; mac: string; port: string }[];
  portSecurity?: (port: string) => { secure: { mac: string; type: "static" | "sticky" | "dynamic" }[]; violations: number; errDisabled: boolean; lastSource?: string } | undefined;
};
export const DEFAULT_VTP: Readonly<Net2Vtp> = Object.freeze({ mode: "server", domain: "", password: "", version: 1, revision: 0 });
const DEFAULT_PS: Readonly<Net2PortSecurity> = Object.freeze({ enabled: false, maximum: 1, sticky: false, violation: "shutdown", macs: [] });
export const isVtpName = (v: unknown): v is string => typeof v === "string" && v.length >= 1 && v.length <= NET2_SWITCH_LIMITS.vtpNameChars && /^[A-Za-z0-9_.-]+$/.test(v);

// ── effective interface configuration ──────────────────────────────────────────────────────────────────────────────────────────────
export type EffectiveSwitchIf = { mode: "access" | "trunk" | "dynamic"; accessVlan: number; nativeVlan: number; allowed: number[] | "all"; shutdown: boolean; ipAddress?: string; subnetMask?: string; portSecurity?: Net2PortSecurity };
export function effectiveSwitchIf(state: Net2SwitchState, name: string): EffectiveSwitchIf {
  const s = state.interfaces[name] ?? {};
  const out: EffectiveSwitchIf = { mode: s.mode ?? "dynamic", accessVlan: s.accessVlan ?? 1, nativeVlan: s.nativeVlan ?? 1, allowed: s.allowed ? [...s.allowed] : "all", shutdown: s.shutdown ?? name === "vlan1" };
  if (s.ipAddress !== undefined && s.subnetMask !== undefined) { out.ipAddress = s.ipAddress; out.subnetMask = s.subnetMask; }
  if (s.portSecurity) out.portSecurity = { ...s.portSecurity, macs: [...s.portSecurity.macs] };
  return out;
}
export const trunkAllows = (e: EffectiveSwitchIf, vlan: number): boolean => e.allowed === "all" || e.allowed.includes(vlan);

// ── canonical state ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const sortNum = (a: number, b: number) => a - b;
function canonicalPortSecurity(p: Net2PortSecurity): Net2PortSecurity {
  return { enabled: p.enabled === true, maximum: p.maximum, sticky: p.sticky === true, violation: p.violation, macs: [...new Set(p.macs)].sort() };
}
function canonicalIf(name: string, c: Net2SwitchIf): Net2SwitchIf | undefined {
  const out: Net2SwitchIf = {};
  const physical = isPhysicalPort(name);
  if (physical) {
    if (c.mode === "access" || c.mode === "trunk") out.mode = c.mode;
    if (typeof c.accessVlan === "number" && c.accessVlan !== 1) out.accessVlan = c.accessVlan;
    if (typeof c.nativeVlan === "number" && c.nativeVlan !== 1) out.nativeVlan = c.nativeVlan;
    if (Array.isArray(c.allowed)) out.allowed = [...new Set(c.allowed)].sort(sortNum);
    if (c.portSecurity) out.portSecurity = canonicalPortSecurity(c.portSecurity);
  }
  const defShut = name === "vlan1";
  if (typeof c.shutdown === "boolean" && c.shutdown !== defShut) out.shutdown = c.shutdown;
  if (!physical && typeof c.ipAddress === "string" && typeof c.subnetMask === "string") { out.ipAddress = c.ipAddress; out.subnetMask = c.subnetMask; }
  return Object.keys(out).length || (isSviName(name) && name !== "vlan1") ? out : undefined;
}
export function canonicalSwitchState(s: Net2SwitchState): Net2SwitchState {
  const vlans: Record<string, { name?: string }> = {};
  for (const id of ownKeys(s.vlans).map(Number).filter(n => Number.isInteger(n) && n > 1).sort(sortNum)) { const v = s.vlans[String(id)]; vlans[String(id)] = v && typeof v.name === "string" && v.name ? { name: v.name } : {}; }
  const interfaces: Record<string, Net2SwitchIf> = {};
  for (const name of sortInterfaceNames(ownKeys(s.interfaces))) { const c = canonicalIf(name, s.interfaces[name] ?? {}); if (c) interfaces[name] = c; }
  const vtp: Net2Vtp = { mode: s.vtp.mode, domain: s.vtp.domain, password: s.vtp.password, version: s.vtp.version, revision: s.vtp.revision };
  const out: Net2SwitchState = { v: 2, device: "switch", hostname: s.hostname, vlans, interfaces, vtp, security: canonicalPasswords(s.security) };
  if (typeof s.defaultGateway === "string") out.defaultGateway = s.defaultGateway;
  return out;
}
export const createSwitchState = (hostname = "Switch"): Net2SwitchState => canonicalSwitchState({ v: 2, device: "switch", hostname, vlans: {}, interfaces: {}, vtp: { ...DEFAULT_VTP }, security: {} });
export const createSwitchSession = (state: Net2SwitchState): Switch2Session => ({ state: canonicalSwitchState(state), mode: "user" });
export const switchPrompt = (s: Pick<Switch2Session, "state" | "mode">): string => s.state.hostname + SWITCH2_MODE_SUFFIX[s.mode];
const vlanOk = (n: unknown, allowOne = true): n is number => typeof n === "number" && parseVlanId(String(n), { allowOne, allowReserved: false }) !== null;

/** Strict ingest of an untrusted (teacher initial) switch state: exact keys and value rules everywhere; canonical result or undefined. */
export function normalizeSwitchState(raw: unknown): Net2SwitchState | undefined {
  if (!isObj(raw)) return undefined;
  const keys = Object.keys(raw);
  if (keys.some(k => FORBIDDEN_KEYS.has(k) || !["v", "device", "hostname", "vlans", "interfaces", "vtp", "security", "defaultGateway"].includes(k))) return undefined;
  if (raw.v !== 2 || raw.device !== "switch" || typeof raw.hostname !== "string" || !isValidHostname(raw.hostname) || !isObj(raw.vlans) || !isObj(raw.interfaces) || !isObj(raw.vtp)) return undefined;
  const vlans: Record<string, { name?: string }> = {};
  if (Object.keys(raw.vlans).length > NET2_SWITCH_LIMITS.vlans) return undefined;
  for (const k of Object.keys(raw.vlans)) {
    const id = parseVlanId(k, { allowOne: false, allowReserved: false }); const v = raw.vlans[k];
    if (id === null || !isObj(v) || Object.keys(v).some(x => x !== "name") || (v.name !== undefined && (typeof v.name !== "string" || !isValidVlanName(v.name)))) return undefined;
    vlans[String(id)] = v.name === undefined ? {} : { name: v.name as string };
  }
  const interfaces: Record<string, Net2SwitchIf> = {};
  if (Object.keys(raw.interfaces).filter(k => isSviName(k) && k !== "vlan1").length > NET2_SWITCH_LIMITS.svis) return undefined;
  for (const k of Object.keys(raw.interfaces)) {
    if (FORBIDDEN_KEYS.has(k) || !(isPhysicalPort(k) || isSviName(k))) return undefined;
    const c = raw.interfaces[k];
    if (!isObj(c) || Object.keys(c).some(f => !["mode", "accessVlan", "nativeVlan", "allowed", "shutdown", "ipAddress", "subnetMask", "portSecurity"].includes(f))) return undefined;
    const physical = isPhysicalPort(k), out: Net2SwitchIf = {};
    if (c.mode !== undefined) { if (!physical || (c.mode !== "access" && c.mode !== "trunk")) return undefined; out.mode = c.mode; }
    for (const f of ["accessVlan", "nativeVlan"] as const) { if (c[f] === undefined) continue; if (!physical || !vlanOk(c[f])) return undefined; out[f] = c[f] as number; }
    if (c.allowed !== undefined) {
      if (!physical || !Array.isArray(c.allowed) || c.allowed.length > NET2_SWITCH_LIMITS.allowedVlans || !c.allowed.every(n => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 4094)) return undefined;
      out.allowed = [...new Set(c.allowed as number[])].sort(sortNum);
    }
    if (c.shutdown !== undefined) { if (typeof c.shutdown !== "boolean") return undefined; out.shutdown = c.shutdown; }
    if (c.ipAddress !== undefined || c.subnetMask !== undefined) {
      if (physical || typeof c.ipAddress !== "string" || typeof c.subnetMask !== "string" || !isUsableHostAddress(c.ipAddress, c.subnetMask)) return undefined;
      out.ipAddress = c.ipAddress; out.subnetMask = c.subnetMask;
    }
    if (c.portSecurity !== undefined) {
      const p = c.portSecurity;
      if (!physical || !isObj(p) || Object.keys(p).sort().join(",") !== "enabled,macs,maximum,sticky,violation" || typeof p.enabled !== "boolean" || typeof p.sticky !== "boolean"
        || typeof p.maximum !== "number" || !Number.isInteger(p.maximum) || p.maximum < 1 || p.maximum > NET2_SWITCH_LIMITS.portSecurityMax || !["shutdown", "restrict", "protect"].includes(p.violation as string)
        || !Array.isArray(p.macs) || p.macs.length > p.maximum || !p.macs.every(m => parseMac(m) === m)) return undefined;
      if (out.mode !== "access") return undefined;
      out.portSecurity = { enabled: p.enabled, maximum: p.maximum, sticky: p.sticky, violation: p.violation as PortSecurityViolation, macs: [...(p.macs as string[])] };
    }
    interfaces[k] = out;
  }
  const t = raw.vtp;
  if (Object.keys(t).sort().join(",") !== "domain,mode,password,revision,version" || (t.mode !== "server" && t.mode !== "client") || (t.domain !== "" && !isVtpName(t.domain)) || (t.password !== "" && !isToken(t.password, PASSWORD_MAX))
    || (t.version !== 1 && t.version !== 2) || typeof t.revision !== "number" || !Number.isInteger(t.revision) || t.revision < 0 || t.revision > 100000) return undefined;
  const security = raw.security === undefined ? {} : normalizePasswords(raw.security);
  if (!security) return undefined;
  if (raw.defaultGateway !== undefined && (typeof raw.defaultGateway !== "string" || !isIpv4(raw.defaultGateway))) return undefined;
  return canonicalSwitchState({ v: 2, device: "switch", hostname: raw.hostname, vlans, interfaces, vtp: { mode: t.mode, domain: t.domain as string, password: t.password as string, version: t.version, revision: t.revision }, security, ...(raw.defaultGateway !== undefined ? { defaultGateway: raw.defaultGateway as string } : {}) });
}

// ── value grammar helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** "10,20,30-32" → [10,20,30,31,32]; null for anything malformed (spaces, reversed ranges, out of range, too many). */
export function parseVlanList(raw: string): number[] | null {
  if (!/^[0-9,-]+$/.test(raw)) return null;
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    const m = /^(\d{1,4})(?:-(\d{1,4}))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]), b = m[2] === undefined ? a : Number(m[2]);
    if (/^0\d/.test(m[1]) || (m[2] && /^0\d/.test(m[2])) || a < 1 || b > 4094 || b < a) return null;
    for (let v = a; v <= b; v++) { out.add(v); if (out.size > NET2_SWITCH_LIMITS.allowedVlans) return null; }
  }
  return [...out].sort(sortNum);
}

// ── the closed command grammar ─────────────────────────────────────────────────────────────────────────────────────────────────────
type Show = "running-config" | "vlan-brief" | "interfaces-trunk" | "ip-interface-brief" | "interfaces-switchport" | "mac-address-table" | "port-security" | "port-security-interface" | "vtp-status";
type Cmd =
  | { id: "help" } | { id: "enable" } | { id: "disable" } | { id: "configure-terminal" } | { id: "exit" } | { id: "end" }
  | { id: "hostname"; name: string } | { id: "interface"; name: string } | { id: "vlan"; vlanId: number } | { id: "no-vlan"; vlanId: number } | { id: "name"; name: string }
  | { id: "switchport-mode"; mode: "access" | "trunk" } | { id: "access-vlan"; vlanId: number } | { id: "native-vlan"; vlanId: number }
  | { id: "allowed"; op: "set" | "add" | "remove" | "all" | "none"; list: number[] }
  | { id: "ps-enable"; on: boolean } | { id: "ps-maximum"; n: number } | { id: "ps-sticky" } | { id: "ps-mac"; mac: string } | { id: "ps-violation"; v: PortSecurityViolation }
  | { id: "ip-address"; address: string; mask: string } | { id: "no-ip-address" } | { id: "shutdown" } | { id: "no-shutdown" } | { id: "default-gateway"; address: string }
  | { id: "vtp-domain"; name: string } | { id: "vtp-mode"; mode: "server" | "client" } | { id: "vtp-password"; value: string } | { id: "vtp-version"; version: 1 | 2 }
  | { id: "enable-password"; value: string } | { id: "enable-secret"; value: string } | { id: "no-enable-password" } | { id: "no-enable-secret" } | { id: "service-encryption"; on: boolean }
  | { id: "line"; line: "con" | "vty" } | { id: "line-password"; value: string } | { id: "login"; on: boolean }
  | { id: "show"; what: Show; iface?: string };
type Arg = Cmd | { incomplete: string } | { invalid: string };
type Spec = { id: Cmd["id"]; kw: readonly (readonly string[])[]; modes: readonly SwitchMode2[]; syntax: string; args: (rest: string[]) => Arg };
const CONFIG: readonly SwitchMode2[] = ["global", "interface", "vlan", "line"];
const NOT_USER: readonly SwitchMode2[] = ["privileged", ...CONFIG];
const ALL: readonly SwitchMode2[] = ["user", ...NOT_USER];
const none = (c: Cmd) => (rest: string[]): Arg => (rest.length ? { invalid: "this command takes no further values" } : c);
const one = (what: string, f: (v: string) => Arg) => (rest: string[]): Arg => (rest.length === 0 ? { incomplete: what + " is required" } : rest.length > 1 ? { invalid: "unexpected values after " + what } : f(rest[0]));
const vlanArg = (make: (v: number) => Cmd) => one("a VLAN id (1-4094)", t => { const v = parseVlanId(t, { allowOne: true, allowReserved: true }); return v === null ? { invalid: "VLAN id must be a number between 1 and 4094: " + t } : v >= 1002 && v <= 1005 ? { invalid: "VLAN " + v + " is a reserved VLAN" } : make(v); });
const password = (make: (v: string) => Cmd) => one("a password (one word, up to " + PASSWORD_MAX + " characters)", t => (isPassword(t) ? make(t) : { invalid: "invalid password (one word, printable characters, up to " + PASSWORD_MAX + ")" }));
const show = (what: Show) => none({ id: "show", what });
const SHOW_MODES = ALL;

export const SWITCH2_COMMANDS: readonly Spec[] = Object.freeze([
  { id: "help", kw: [["?"], ["help"]], modes: ALL, syntax: "?", args: none({ id: "help" }) },
  { id: "no-enable-secret", kw: [["no", "enable", "secret"]], modes: ["global"], syntax: "no enable secret", args: none({ id: "no-enable-secret" }) },
  { id: "no-enable-password", kw: [["no", "enable", "password"]], modes: ["global"], syntax: "no enable password", args: none({ id: "no-enable-password" }) },
  { id: "enable-secret", kw: [["enable", "secret"]], modes: ["global"], syntax: "enable secret <password>", args: password(v => ({ id: "enable-secret", value: v })) },
  { id: "enable-password", kw: [["enable", "password"]], modes: ["global"], syntax: "enable password <password>", args: password(v => ({ id: "enable-password", value: v })) },
  { id: "enable", kw: [["enable"], ["en"]], modes: ["user", "privileged"], syntax: "enable", args: none({ id: "enable" }) },
  { id: "disable", kw: [["disable"]], modes: ["privileged"], syntax: "disable", args: none({ id: "disable" }) },
  { id: "configure-terminal", kw: [["configure", "terminal"], ["configure", "t"], ["config", "terminal"], ["config", "t"], ["conf", "terminal"], ["conf", "term"], ["conf", "t"]], modes: ["privileged"], syntax: "configure terminal", args: none({ id: "configure-terminal" }) },
  { id: "end", kw: [["end"]], modes: ALL, syntax: "end", args: none({ id: "end" }) },
  { id: "exit", kw: [["exit"]], modes: ALL, syntax: "exit", args: none({ id: "exit" }) },
  { id: "hostname", kw: [["hostname"]], modes: ["global"], syntax: "hostname <name>", args: one("a device name", t => (isValidHostname(t) ? { id: "hostname", name: t } : { invalid: "hostname contains one or more illegal characters" })) },
  { id: "interface", kw: [["interface"], ["int"]], modes: ["global", "interface", "vlan", "line"], syntax: "interface <FastEthernet0/1-24 | GigabitEthernet0/1-2 | vlan <id>>", args: rest => { if (!rest.length) return { incomplete: "an interface name is required" }; const n = normalizeInterfaceName(rest.join("")); return n ? { id: "interface", name: n } : { invalid: "invalid interface: " + rest.join(" ") + " does not exist on this device" }; } },
  { id: "no-vlan", kw: [["no", "vlan"]], modes: ["global"], syntax: "no vlan <id>", args: vlanArg(v => ({ id: "no-vlan", vlanId: v })) },
  { id: "vlan", kw: [["vlan"]], modes: ["global", "vlan"], syntax: "vlan <id>", args: vlanArg(v => ({ id: "vlan", vlanId: v })) },
  { id: "name", kw: [["name"]], modes: ["vlan"], syntax: "name <vlan-name>", args: one("a VLAN name", t => (isValidVlanName(t) ? { id: "name", name: t } : { invalid: "invalid VLAN name: " + t })) },
  { id: "switchport-mode", kw: [["switchport", "mode"]], modes: ["interface"], syntax: "switchport mode access | trunk", args: one("access or trunk", t => { const m = t.toLowerCase(); return m === "access" || m === "trunk" ? { id: "switchport-mode", mode: m } : { invalid: "this simulator supports switchport mode access or trunk" }; }) },
  { id: "access-vlan", kw: [["switchport", "access", "vlan"]], modes: ["interface"], syntax: "switchport access vlan <id>", args: vlanArg(v => ({ id: "access-vlan", vlanId: v })) },
  { id: "native-vlan", kw: [["switchport", "trunk", "native", "vlan"]], modes: ["interface"], syntax: "switchport trunk native vlan <id>", args: vlanArg(v => ({ id: "native-vlan", vlanId: v })) },
  {
    id: "allowed", kw: [["switchport", "trunk", "allowed", "vlan"]], modes: ["interface"], syntax: "switchport trunk allowed vlan <list> | add <list> | remove <list> | all | none",
    args: rest => {
      if (!rest.length) return { incomplete: "a VLAN list (e.g. 10,20,30) is required" };
      const op = rest[0].toLowerCase();
      if (op === "all" || op === "none") return rest.length === 1 ? { id: "allowed", op, list: [] } : { invalid: "unexpected values after " + op };
      if (op === "add" || op === "remove") { if (rest.length !== 2) return rest.length < 2 ? { incomplete: "a VLAN list is required" } : { invalid: "the VLAN list must not contain spaces" }; const l = parseVlanList(rest[1]); return l ? { id: "allowed", op, list: l } : { invalid: "invalid VLAN list: " + rest[1] }; }
      if (rest.length !== 1) return { invalid: "the VLAN list must not contain spaces" };
      const l = parseVlanList(rest[0]); return l ? { id: "allowed", op: "set", list: l } : { invalid: "invalid VLAN list: " + rest[0] };
    }
  },
  { id: "ps-enable", kw: [["no", "switchport", "port-security"]], modes: ["interface"], syntax: "no switchport port-security", args: none({ id: "ps-enable", on: false }) },
  { id: "ps-maximum", kw: [["switchport", "port-security", "maximum"]], modes: ["interface"], syntax: "switchport port-security maximum <1-8>", args: one("a maximum (1-8)", t => (/^[1-8]$/.test(t) ? { id: "ps-maximum", n: Number(t) } : { invalid: "maximum must be between 1 and " + NET2_SWITCH_LIMITS.portSecurityMax + " in this simulator" })) },
  { id: "ps-sticky", kw: [["switchport", "port-security", "mac-address", "sticky"]], modes: ["interface"], syntax: "switchport port-security mac-address sticky", args: none({ id: "ps-sticky" }) },
  { id: "ps-mac", kw: [["switchport", "port-security", "mac-address"]], modes: ["interface"], syntax: "switchport port-security mac-address <H.H.H>", args: one("a MAC address (H.H.H)", t => { const m = parseMac(t); return m ? { id: "ps-mac", mac: m } : { invalid: "invalid MAC address (expected H.H.H, e.g. 0200.1234.5678): " + t }; }) },
  { id: "ps-violation", kw: [["switchport", "port-security", "violation"]], modes: ["interface"], syntax: "switchport port-security violation shutdown | restrict | protect", args: one("shutdown, restrict or protect", t => { const v = t.toLowerCase(); return v === "shutdown" || v === "restrict" || v === "protect" ? { id: "ps-violation", v } : { invalid: "the violation mode must be shutdown, restrict or protect" }; }) },
  { id: "ps-enable", kw: [["switchport", "port-security"]], modes: ["interface"], syntax: "switchport port-security", args: none({ id: "ps-enable", on: true }) },
  {
    id: "ip-address", kw: [["ip", "address"], ["ip", "addr"]], modes: ["interface"], syntax: "ip address <ipv4-address> <subnet-mask>",
    args: rest => {
      if (rest.length < 2) return { incomplete: "an IPv4 address and a subnet mask are required" };
      if (rest.length > 2) return { invalid: "unexpected values after the mask" };
      if (!isIpv4(rest[0])) return { invalid: "invalid IPv4 address: " + rest[0] };
      if (!isSubnetMask(rest[1])) return { invalid: "bad mask: " + rest[1] };
      return isUsableHostAddress(rest[0], rest[1]) ? { id: "ip-address", address: rest[0], mask: rest[1] } : { invalid: "bad mask " + rest[1] + " for address " + rest[0] };
    }
  },
  { id: "no-ip-address", kw: [["no", "ip", "address"]], modes: ["interface"], syntax: "no ip address", args: none({ id: "no-ip-address" }) },
  { id: "default-gateway", kw: [["ip", "default-gateway"]], modes: ["global"], syntax: "ip default-gateway <ipv4-address>", args: one("an IPv4 address", t => (isIpv4(t) ? { id: "default-gateway", address: t } : { invalid: "invalid IPv4 address: " + t })) },
  { id: "no-shutdown", kw: [["no", "shutdown"], ["no", "shut"]], modes: ["interface"], syntax: "no shutdown", args: none({ id: "no-shutdown" }) },
  { id: "shutdown", kw: [["shutdown"], ["shut"]], modes: ["interface"], syntax: "shutdown", args: none({ id: "shutdown" }) },
  { id: "vtp-domain", kw: [["vtp", "domain"]], modes: ["global"], syntax: "vtp domain <name>", args: one("a VTP domain name", t => (isVtpName(t) ? { id: "vtp-domain", name: t } : { invalid: "invalid VTP domain name (letters, digits, _ . -; up to 32)" })) },
  { id: "vtp-mode", kw: [["vtp", "mode"]], modes: ["global"], syntax: "vtp mode server | client", args: one("server or client", t => { const m = t.toLowerCase(); return m === "server" || m === "client" ? { id: "vtp-mode", mode: m } : { invalid: "this simulator supports vtp mode server or client" }; }) },
  { id: "vtp-password", kw: [["vtp", "password"]], modes: ["global"], syntax: "vtp password <password>", args: password(v => ({ id: "vtp-password", value: v })) },
  { id: "vtp-version", kw: [["vtp", "version"]], modes: ["global"], syntax: "vtp version 1 | 2", args: one("1 or 2", t => (t === "1" || t === "2" ? { id: "vtp-version", version: Number(t) as 1 | 2 } : { invalid: "the VTP version must be 1 or 2" })) },
  { id: "service-encryption", kw: [["no", "service", "password-encryption"]], modes: ["global"], syntax: "no service password-encryption", args: none({ id: "service-encryption", on: false }) },
  { id: "service-encryption", kw: [["service", "password-encryption"]], modes: ["global"], syntax: "service password-encryption", args: none({ id: "service-encryption", on: true }) },
  {
    id: "line", kw: [["line"]], modes: ["global", "line", "interface", "vlan"], syntax: "line console 0 | line vty 0 4",
    args: rest => {
      const t = rest.map(x => x.toLowerCase());
      if ((t[0] === "console" || t[0] === "con") && t[1] === "0" && t.length === 2) return { id: "line", line: "con" };
      if (t[0] === "vty" && t[1] === "0" && (t[2] === "4" || t[2] === "15") && t.length === 3) return { id: "line", line: "vty" };
      return rest.length ? { invalid: "this simulator supports line console 0 and line vty 0 4" } : { incomplete: "console 0 or vty 0 4 is required" };
    }
  },
  { id: "line-password", kw: [["password"]], modes: ["line"], syntax: "password <password>", args: password(v => ({ id: "line-password", value: v })) },
  { id: "login", kw: [["no", "login"]], modes: ["line"], syntax: "no login", args: none({ id: "login", on: false }) },
  { id: "login", kw: [["login"]], modes: ["line"], syntax: "login", args: none({ id: "login", on: true }) },
  { id: "show", kw: [["show", "running-config"], ["show", "run"], ["sh", "run"]], modes: NOT_USER, syntax: "show running-config", args: show("running-config") },
  { id: "show", kw: [["show", "vlan", "brief"], ["show", "vlan"], ["sh", "vlan", "brief"], ["sh", "vlan"]], modes: SHOW_MODES, syntax: "show vlan brief", args: show("vlan-brief") },
  { id: "show", kw: [["show", "interfaces", "trunk"], ["show", "interface", "trunk"], ["show", "int", "trunk"]], modes: SHOW_MODES, syntax: "show interfaces trunk", args: show("interfaces-trunk") },
  { id: "show", kw: [["show", "ip", "interface", "brief"], ["show", "ip", "int", "brief"], ["show", "ip", "int", "br"], ["sh", "ip", "int", "br"]], modes: SHOW_MODES, syntax: "show ip interface brief", args: show("ip-interface-brief") },
  { id: "show", kw: [["show", "interfaces", "switchport"], ["show", "interface", "switchport"]], modes: SHOW_MODES, syntax: "show interfaces [<interface>] switchport", args: show("interfaces-switchport") },
  { id: "show", kw: [["show", "mac", "address-table"], ["show", "mac-address-table"]], modes: SHOW_MODES, syntax: "show mac address-table", args: show("mac-address-table") },
  {
    id: "show", kw: [["show", "port-security", "interface"]], modes: SHOW_MODES, syntax: "show port-security interface <interface>",
    args: rest => { if (!rest.length) return { incomplete: "an interface is required" }; const n = normalizeInterfaceName(rest.join("")); return n && isPhysicalPort(n) ? { id: "show", what: "port-security-interface", iface: n } : { invalid: "invalid interface: " + rest.join(" ") }; }
  },
  { id: "show", kw: [["show", "port-security"]], modes: SHOW_MODES, syntax: "show port-security", args: show("port-security") },
  { id: "show", kw: [["show", "vtp", "status"]], modes: SHOW_MODES, syntax: "show vtp status", args: show("vtp-status") },
  {
    id: "show", kw: [["show", "interfaces"], ["show", "interface"]], modes: SHOW_MODES, syntax: "show interfaces <interface> switchport",
    args: rest => { if (rest.length < 2 || rest[rest.length - 1].toLowerCase() !== "switchport") return { invalid: "this simulator supports show interfaces [<interface>] switchport / trunk" }; const n = normalizeInterfaceName(rest.slice(0, -1).join("")); return n && isPhysicalPort(n) ? { id: "show", what: "interfaces-switchport", iface: n } : { invalid: "invalid interface: " + rest.slice(0, -1).join(" ") }; }
  }
]);
const NOT_SUPPORTED: readonly { match: (t: string[]) => boolean; text: string; hint: string }[] = Object.freeze([
  { match: t => (t[0] === "interface" || t[0] === "int") && t[1] === "range", text: "interface range is not supported in this simulator", hint: "اختر واجهة واحدة في كل مرة: interface fastEthernet 0/1" },
  { match: t => t[0] === "vtp" && t[1] === "mode" && (t[2] === "transparent" || t[2] === "off"), text: "VTP transparent / off mode is not supported in this simulator (server and client only)", hint: "يدعم المحاكي وضعي server و client فقط" },
  { match: t => t[0] === "switchport" && t[1] === "mode" && t[2] === "dynamic", text: "DTP dynamic modes are not configurable in this simulator", hint: "استخدم switchport mode access أو switchport mode trunk" },
  { match: t => ["router", "spanning-tree", "channel-group", "ip", "access-list", "vtp"].includes(t[0]) && !["address", "default-gateway"].includes(t[1] ?? "") && !(t[0] === "vtp"), text: "this feature is not part of the curriculum simulator (v2)", hint: "الأمر خارج نطاق هذا المحاكي التعليمي" },
  { match: t => t[0] === "write" || t[0] === "wr" || t[0] === "copy", text: "saving to startup-config is not simulated; the running configuration is what counts", hint: "لا حاجة للحفظ: الإعداد الجاري هو ما يُقيَّم" },
  { match: t => ["ping", "traceroute", "telnet", "ssh", "reload", "erase", "delete", "debug"].includes(t[0]), text: "this command is not supported on the switch CLI of this simulator", hint: "اختبر الاتصال من موجّه الأوامر في الحاسوب (Command Prompt)" }
]);
const tokenize = (raw: string) => raw.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
const startsWith = (tokens: string[], seq: readonly string[]) => seq.length <= tokens.length && seq.every((k, i) => tokens[i].toLowerCase() === k);
type Parse = { kind: "empty" } | { kind: "refused"; detail: string } | { kind: "unknown" } | { kind: "not-supported"; detail: string; hint: string } | { kind: "incomplete" | "invalid"; detail: string; syntax: string } | { kind: "ok"; cmd: Cmd; spec: Spec; viaDo: boolean };
export function parseSwitchCommand(raw: unknown): Parse {
  if (typeof raw !== "string") return { kind: "empty" };
  if (raw.length > NET2_SWITCH_LIMITS.inputChars) return { kind: "refused", detail: "line too long (max " + NET2_SWITCH_LIMITS.inputChars + " characters)" };
  let tokens = tokenize(raw);
  if (!tokens.length) return { kind: "empty" };
  if (tokens.length > NET2_SWITCH_LIMITS.tokens) return { kind: "refused", detail: "too many words in one command" };
  let viaDo = false;
  if (tokens[0].toLowerCase() === "do" && tokens.length > 1) { viaDo = true; tokens = tokens.slice(1); }
  const lower = tokens.map(t => t.toLowerCase());
  for (const spec of SWITCH2_COMMANDS) for (const seq of spec.kw) {
    if (!startsWith(tokens, seq)) continue;
    if (viaDo && spec.id !== "show") return { kind: "unknown" };
    const r = spec.args(tokens.slice(seq.length));
    if ("incomplete" in r) return { kind: "incomplete", detail: r.incomplete, syntax: spec.syntax };
    if ("invalid" in r) return { kind: "invalid", detail: r.invalid, syntax: spec.syntax };
    return { kind: "ok", cmd: r, spec, viaDo };
  }
  for (const ns of NOT_SUPPORTED) if (ns.match(lower)) return { kind: "not-supported", detail: ns.text, hint: ns.hint };
  for (const spec of SWITCH2_COMMANDS) for (const seq of spec.kw) if (tokens.length < seq.length && lower.every((t, i) => t === seq[i])) return { kind: "incomplete", detail: "incomplete command", syntax: spec.syntax };
  return { kind: "unknown" };
}

// ── execution ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Cli2Status = "empty" | "refused" | "unknown" | "not-supported" | "incomplete" | "invalid" | "wrong-mode" | "ok";
export type Cli2Result = { status: Cli2Status; output: string[]; hint?: string; changed: boolean };
const res = (status: Cli2Status, output: string[], hint?: string, changed = false): Cli2Result => (hint === undefined ? { status, output, changed } : { status, output, hint, changed });
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const EXIT_TO: Record<SwitchMode2, SwitchMode2> = { user: "user", privileged: "user", global: "privileged", interface: "global", vlan: "global", line: "global" };
const nav = (s: Switch2Session, mode: SwitchMode2, extra: Partial<Switch2Session> = {}): Switch2Session => ({ state: s.state, mode, ...extra });
const MODE_HOWTO: Record<SwitchMode2, string> = { user: "اكتب disable للعودة إلى وضع المستخدم", privileged: "اكتب enable أولًا", global: "اكتب enable ثم configure terminal", interface: "ادخل إلى واجهة أولًا: interface fastEthernet 0/1", vlan: "ادخل إلى VLAN أولًا: vlan 10", line: "ادخل إلى خط أولًا: line console 0" };
const MODE_EN: Record<SwitchMode2, string> = { user: "user EXEC mode", privileged: "privileged EXEC mode", global: "global configuration mode", interface: "interface configuration mode", vlan: "VLAN configuration mode", line: "line configuration mode" };
const setState = (s: Switch2Session, state: Net2SwitchState): Switch2Session => ({ ...s, state: canonicalSwitchState(state) });
const withIf = (s: Switch2Session, f: (c: Net2SwitchIf) => Net2SwitchIf): Switch2Session => { const n = s.selectedInterface!; return setState(s, { ...s.state, interfaces: { ...s.state.interfaces, [n]: f({ ...(s.state.interfaces[n] ?? {}) }) } }); };
const bump = (st: Net2SwitchState): Net2SwitchState => (st.vtp.mode === "server" ? { ...st, vtp: { ...st.vtp, revision: Math.min(100000, st.vtp.revision + 1) } } : st);
const CLIENT_VLAN = "VTP VLAN configuration not allowed when device is in CLIENT mode.";

export function executeSwitchCommand(session: Switch2Session, raw: unknown, ctx: Switch2Context = {}): { session: Switch2Session; result: Cli2Result } {
  const p = parseSwitchCommand(raw);
  switch (p.kind) {
    case "empty": return { session, result: res("empty", []) };
    case "refused": return { session, result: res("refused", ["% " + cap(p.detail) + "."], "تجاوز السطر الحدود المسموحة ولم يُنفَّذ.") };
    case "unknown": return { session, result: res("unknown", ["% Invalid input detected."], "أمر غير معروف في هذا المحاكي. اكتب ? لعرض أوامر الوضع الحالي.") };
    case "not-supported": return { session, result: res("not-supported", ["% " + cap(p.detail) + "."], p.hint) };
    case "incomplete": return { session, result: res("incomplete", ["% Incomplete command."], "الصيغة: " + p.syntax + " — " + p.detail) };
    case "invalid": return { session, result: res("invalid", ["% " + cap(p.detail) + "."], "الصيغة: " + p.syntax) };
    case "ok": break;
  }
  if (p.viaDo && !CONFIG.includes(session.mode)) return { session, result: res("wrong-mode", ["% 'do' is only available in configuration modes."], "اكتب أمر العرض مباشرة في هذا الوضع.") };
  // IOS behaviour: a global-configuration command typed in a configuration sub-mode runs in global configuration mode (and leaves the sub-mode).
  if (!p.viaDo && session.mode !== "global" && CONFIG.includes(session.mode) && !p.spec.modes.includes(session.mode) && p.spec.modes.includes("global")) session = { state: session.state, mode: "global" };
  if (!p.viaDo && !p.spec.modes.includes(session.mode)) return { session, result: res("wrong-mode", ["% This command is not available in " + MODE_EN[session.mode] + "."], "هذا الأمر يعمل في " + p.spec.modes.map(m => SWITCH2_MODE_LABEL[m]).join(" أو ") + ". " + MODE_HOWTO[p.spec.modes[0]]) };
  const s = session;
  const ok = (next: Switch2Session, output: string[] = [], hint?: string) => ({ session: next, result: res("ok", output, hint, JSON.stringify(next.state) !== JSON.stringify(s.state)) });
  const reject = (text: string, hint: string) => ({ session: s, result: res("invalid", ["% " + text], hint) });
  const c = p.cmd;
  const sel = s.selectedInterface;
  const physOnly = () => (sel && isPhysicalPort(sel) ? undefined : reject("Command rejected: switchport commands apply to physical ports only.", "أوامر switchport تعمل على المنافذ الفعلية فقط (FastEthernet / GigabitEthernet)."));
  const accessOnly = () => {
    const e = effectiveSwitchIf(s.state, sel!);
    if (e.mode === "access") return undefined;
    return reject("Command rejected: " + shortInterfaceName(sel!) + " is a " + (e.mode === "trunk" ? "trunk" : "dynamic") + " port.", "Port Security يعمل على منافذ الوصول فقط: اكتب أولًا switchport mode access");
  };
  const ps = () => ({ ...DEFAULT_PS, ...(s.state.interfaces[sel!]?.portSecurity ?? {}) });
  switch (c.id) {
    case "help": return ok(s, helpLines(s.mode));
    case "enable": return ok(s.mode === "privileged" ? s : nav(s, "privileged"));
    case "disable": return ok(nav(s, "user"));
    case "configure-terminal": return ok(nav(s, "global"), ["Enter configuration commands, one per line.  End with CNTL/Z."]);
    case "end": return ok(s.mode === "user" || s.mode === "privileged" ? s : nav(s, "privileged"));
    case "exit": return ok(s.mode === "user" ? s : nav(s, EXIT_TO[s.mode]));
    case "hostname": return ok(setState(s, { ...s.state, hostname: c.name }));
    case "interface": {
      const creating = isSviName(c.name) && c.name !== "vlan1" && !s.state.interfaces[c.name];
      if (creating && Object.keys(s.state.interfaces).filter(n => isSviName(n) && n !== "vlan1").length >= NET2_SWITCH_LIMITS.svis) return reject("SVI limit reached in this simulator (" + NET2_SWITCH_LIMITS.svis + " VLAN interfaces).", "تجاوزت الحد الأقصى لعدد واجهات VLAN (SVI) في هذا المحاكي.");
      const interfaces = creating ? { ...s.state.interfaces, [c.name]: {} } : s.state.interfaces;
      return ok({ state: canonicalSwitchState({ ...s.state, interfaces }), mode: "interface", selectedInterface: c.name });
    }
    case "vlan": {
      if (s.state.vtp.mode === "client") return reject(CLIENT_VLAN, "هذا السويتش عميل VTP: تُنشأ شبكات VLAN على خادم VTP وتصل إليه عبر الـ trunk.");
      if (c.vlanId === 1) return ok({ state: s.state, mode: "vlan", selectedVlan: 1 });
      const key = String(c.vlanId);
      if (hasOwn(s.state.vlans, key)) return ok({ state: s.state, mode: "vlan", selectedVlan: c.vlanId });
      if (Object.keys(s.state.vlans).length >= NET2_SWITCH_LIMITS.vlans) return reject("VLAN database is full in this simulator.", "تجاوزت الحد الأقصى لعدد شبكات VLAN.");
      return ok({ state: canonicalSwitchState(bump({ ...s.state, vlans: { ...s.state.vlans, [key]: {} } })), mode: "vlan", selectedVlan: c.vlanId });
    }
    case "no-vlan": {
      if (s.state.vtp.mode === "client") return reject(CLIENT_VLAN, "هذا السويتش عميل VTP: لا يمكن حذف VLAN محليًا.");
      if (c.vlanId === 1) return reject("Default VLAN 1 may not be deleted.", "لا يمكن حذف VLAN 1 الافتراضية.");
      const key = String(c.vlanId);
      if (!hasOwn(s.state.vlans, key)) return ok(s);
      const vlans = { ...s.state.vlans }; delete vlans[key];
      return ok(setState(s, bump({ ...s.state, vlans })));
    }
    case "name": {
      if (s.selectedVlan === undefined) return reject("No VLAN selected.", "ادخل إلى VLAN أولًا: vlan 10");
      if (s.selectedVlan === 1) return reject("Default VLAN 1 may not have its name changed.", "لا يمكن إعادة تسمية VLAN 1 الافتراضية.");
      const key = String(s.selectedVlan);
      if (s.state.vlans[key]?.name === c.name) return ok(s);
      return ok(setState(s, bump({ ...s.state, vlans: { ...s.state.vlans, [key]: { name: c.name } } })));
    }
    case "switchport-mode": {
      const e = physOnly(); if (e) return e;
      if (c.mode === "trunk" && s.state.interfaces[sel!]?.portSecurity?.enabled) return reject("Command rejected: port security is enabled on " + shortInterfaceName(sel!) + ".", "عطّل Port Security أولًا: no switchport port-security");
      return ok(withIf(s, x => ({ ...x, mode: c.mode })));
    }
    case "native-vlan": { const e = physOnly(); if (e) return e; return ok(withIf(s, x => ({ ...x, nativeVlan: c.vlanId }))); }
    case "access-vlan": {
      const e = physOnly(); if (e) return e;
      const next = withIf(s, x => ({ ...x, accessVlan: c.vlanId }));
      const key = String(c.vlanId);
      if (c.vlanId === 1 || hasOwn(s.state.vlans, key) || s.state.vtp.mode === "client") return ok(next);
      if (Object.keys(s.state.vlans).length >= NET2_SWITCH_LIMITS.vlans) return reject("VLAN database is full in this simulator.", "تجاوزت الحد الأقصى لعدد شبكات VLAN.");
      return ok(setState(next, bump({ ...next.state, vlans: { ...next.state.vlans, [key]: {} } })), ["% Access VLAN does not exist. Creating vlan " + c.vlanId], "لم تكن VLAN " + c.vlanId + " موجودة فأُنشئت تلقائيًا.");
    }
    case "allowed": {
      const e = physOnly(); if (e) return e;
      const cur = s.state.interfaces[sel!]?.allowed;
      if (c.op === "all") return ok(withIf(s, x => { const y = { ...x }; delete y.allowed; return y; }));
      if (c.op === "none") return ok(withIf(s, x => ({ ...x, allowed: [] })));
      if (c.op === "set") return ok(withIf(s, x => ({ ...x, allowed: c.list })));
      if (c.op === "add") { if (!cur) return ok(s); const merged = [...new Set([...cur, ...c.list])]; if (merged.length > NET2_SWITCH_LIMITS.allowedVlans) return reject("Too many VLANs in the allowed list for this simulator.", "قلّل عدد شبكات VLAN المسموحة."); return ok(withIf(s, x => ({ ...x, allowed: merged }))); }
      if (!cur) return reject("Removing VLANs from the full range (all) is not supported in this simulator.", "حدّد قائمة صريحة أولًا: switchport trunk allowed vlan 10,20,30");
      return ok(withIf(s, x => ({ ...x, allowed: cur.filter(v => !c.list.includes(v)) })));
    }
    case "ps-enable": {
      const e = physOnly(); if (e) return e;
      if (!c.on) return ok(s.state.interfaces[sel!]?.portSecurity ? withIf(s, x => ({ ...x, portSecurity: { ...ps(), enabled: false } })) : s);
      const a = accessOnly(); if (a) return a;
      return ok(withIf(s, x => ({ ...x, portSecurity: { ...ps(), enabled: true } })));
    }
    case "ps-maximum": {
      const e = physOnly() ?? accessOnly(); if (e) return e;
      if (ps().macs.length > c.n) return reject("Configured secure MAC addresses exceed the new maximum.", "احذف عناوين MAC الثابتة أولًا أو اختر حدًا أكبر.");
      return ok(withIf(s, x => ({ ...x, portSecurity: { ...ps(), maximum: c.n } })));
    }
    case "ps-sticky": { const e = physOnly() ?? accessOnly(); if (e) return e; return ok(withIf(s, x => ({ ...x, portSecurity: { ...ps(), sticky: true } }))); }
    case "ps-violation": { const e = physOnly() ?? accessOnly(); if (e) return e; return ok(withIf(s, x => ({ ...x, portSecurity: { ...ps(), violation: c.v } }))); }
    case "ps-mac": {
      const e = physOnly() ?? accessOnly(); if (e) return e;
      const cur = ps();
      if (cur.macs.includes(c.mac)) return ok(s);
      if (cur.macs.length >= cur.maximum) return reject("Total secure mac-addresses on interface " + shortInterfaceName(sel!) + " has reached maximum limit.", "ارفع الحد الأقصى أولًا: switchport port-security maximum <n>");
      return ok(withIf(s, x => ({ ...x, portSecurity: { ...cur, macs: [...cur.macs, c.mac] } })));
    }
    case "ip-address": {
      if (sel && isPhysicalPort(sel)) return reject("IP addresses may not be configured on L2 links.", "عناوين IP على المبدّل تُضبط على واجهة إدارة: interface vlan <id> ثم ip address.");
      return ok(withIf(s, x => ({ ...x, ipAddress: c.address, subnetMask: c.mask })));
    }
    case "no-ip-address": { if (sel && isPhysicalPort(sel)) return ok(s); return ok(withIf(s, x => { const y = { ...x }; delete y.ipAddress; delete y.subnetMask; return y; })); }
    case "shutdown": return ok(withIf(s, x => ({ ...x, shutdown: true })));
    case "no-shutdown": return ok(withIf(s, x => ({ ...x, shutdown: false })));
    case "default-gateway": return ok(setState(s, { ...s.state, defaultGateway: c.address }));
    case "vtp-domain": {
      if (s.state.vtp.domain === c.name) return ok(s, ["Domain name already set to " + c.name + "."]);
      return ok(setState(s, { ...s.state, vtp: { ...s.state.vtp, domain: c.name, revision: 0 } }), ["Changing VTP domain name from " + (s.state.vtp.domain || "NULL") + " to " + c.name]);
    }
    case "vtp-mode": return ok(setState(s, { ...s.state, vtp: { ...s.state.vtp, mode: c.mode } }), ["Setting device to VTP " + c.mode.toUpperCase() + " mode."]);
    case "vtp-password": return ok(setState(s, { ...s.state, vtp: { ...s.state.vtp, password: c.value } }), ["Setting device VLAN database password to " + c.value]);
    case "vtp-version": return ok(setState(s, { ...s.state, vtp: { ...s.state.vtp, version: c.version } }));
    case "enable-secret": return ok(setState(s, { ...s.state, security: { ...s.state.security, enableSecret: c.value } }));
    case "enable-password": return ok(setState(s, { ...s.state, security: { ...s.state.security, enablePassword: c.value } }));
    case "no-enable-secret": { const sec = { ...s.state.security }; delete sec.enableSecret; return ok(setState(s, { ...s.state, security: sec })); }
    case "no-enable-password": { const sec = { ...s.state.security }; delete sec.enablePassword; return ok(setState(s, { ...s.state, security: sec })); }
    case "service-encryption": return ok(setState(s, { ...s.state, security: { ...s.state.security, encryption: c.on } }));
    case "line": return ok({ state: s.state, mode: "line", selectedLine: c.line });
    case "line-password": return ok(setState(s, { ...s.state, security: { ...s.state.security, [s.selectedLine === "vty" ? "vtyPassword" : "consolePassword"]: c.value } }));
    case "login": return ok(setState(s, { ...s.state, security: { ...s.state.security, [s.selectedLine === "vty" ? "vtyLogin" : "consoleLogin"]: c.on } }));
    case "show": return ok(s, switchShow(s.state, c.what, ctx, c.iface));
  }
}
function helpLines(mode: SwitchMode2): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const c of SWITCH2_COMMANDS) if (c.modes.includes(mode) && c.id !== "help" && !seen.has(c.syntax)) { seen.add(c.syntax); out.push("  " + c.syntax); }
  return out;
}

// ── show commands (canonical state + read-only operational context) ────────────────────────────────────────────────────────────────
const effVlans = (st: Net2SwitchState, ctx: Switch2Context) => ctx.effectiveVlans?.vlans ?? st.vlans;
const vlanIdsOf = (vl: Record<string, { name?: string }>) => [1, ...Object.keys(vl).map(Number).filter(n => n > 1)].sort(sortNum);
const vlanNameOf = (vl: Record<string, { name?: string }>, id: number) => (id === 1 ? "default" : vl[String(id)]?.name ?? "VLAN" + String(id).padStart(4, "0"));
const linkUp = (ctx: Switch2Context, p: string) => (ctx.linkUp ? ctx.linkUp(p) : true);
const errDis = (ctx: Switch2Context, p: string) => (ctx.errDisabled ? ctx.errDisabled(p) : false);
const sviNames = (st: Net2SwitchState) => sortInterfaceNames(["vlan1", ...Object.keys(st.interfaces).filter(isSviName).filter(n => n !== "vlan1")]);
export function switchShow(state: Net2SwitchState, what: Show, ctx: Switch2Context = {}, iface?: string): string[] {
  const st = canonicalSwitchState(state);
  switch (what) {
    case "running-config": return runningConfig(st, ctx);
    case "vlan-brief": {
      const vl = effVlans(st, ctx);
      const out = [pad("VLAN", 5) + pad("Name", 33) + pad("Status", 10) + "Ports", "---- -------------------------------- --------- -------------------------------"];
      for (const id of vlanIdsOf(vl)) {
        const ports = SWITCH_PORTS.filter(p => { const e = effectiveSwitchIf(st, p); return e.mode !== "trunk" && e.accessVlan === id; }).map(shortInterfaceName);
        const head = pad(String(id), 5) + pad(vlanNameOf(vl, id), 33) + pad("active", 10);
        if (!ports.length) { out.push(head.trimEnd()); continue; }
        for (let i = 0; i < ports.length; i += 4) out.push((i === 0 ? head : " ".repeat(head.length)) + ports.slice(i, i + 4).join(", "));
      }
      return out;
    }
    case "interfaces-trunk": {
      const trunks = SWITCH_PORTS.filter(p => { const e = effectiveSwitchIf(st, p); return e.mode === "trunk" && !e.shutdown && linkUp(ctx, p) && !errDis(ctx, p); });
      if (!trunks.length) return [];
      const db = new Set(vlanIdsOf(effVlans(st, ctx)));
      const allowedOf = (p: string) => { const e = effectiveSwitchIf(st, p); return e.allowed === "all" ? "1-4094" : e.allowed.length ? compressVlans(e.allowed) : "none"; };
      const activeOf = (p: string) => { const e = effectiveSwitchIf(st, p); const l = [...db].filter(v => trunkAllows(e, v)).sort(sortNum); return l.length ? compressVlans(l) : "none"; };
      const out = [pad("Port", 12) + pad("Mode", 13) + pad("Encapsulation", 15) + pad("Status", 14) + "Native vlan"];
      for (const p of trunks) out.push(pad(shortInterfaceName(p), 12) + pad("on", 13) + pad("802.1q", 15) + pad("trunking", 14) + String(effectiveSwitchIf(st, p).nativeVlan));
      out.push("", pad("Port", 12) + "Vlans allowed on trunk"); for (const p of trunks) out.push(pad(shortInterfaceName(p), 12) + allowedOf(p));
      out.push("", pad("Port", 12) + "Vlans allowed and active in management domain"); for (const p of trunks) out.push(pad(shortInterfaceName(p), 12) + activeOf(p));
      out.push("", pad("Port", 12) + "Vlans in spanning tree forwarding state and not pruned"); for (const p of trunks) out.push(pad(shortInterfaceName(p), 12) + activeOf(p));
      return out;
    }
    case "ip-interface-brief": {
      const out = [pad("Interface", 23) + pad("IP-Address", 16) + "OK? Method " + pad("Status", 22) + "Protocol"];
      for (const name of [...SWITCH_PORTS, ...sviNames(st)]) {
        const e = effectiveSwitchIf(st, name);
        const physical = isPhysicalPort(name);
        const status = e.shutdown ? "administratively down" : physical && (!linkUp(ctx, name) || errDis(ctx, name)) ? "down" : "up";
        out.push(pad(displayInterfaceName(name), 23) + pad(e.ipAddress ?? "unassigned", 16) + "YES " + pad(e.ipAddress ? "manual" : "unset", 7) + pad(status, 22) + (status === "up" ? "up" : "down"));
      }
      return out;
    }
    case "interfaces-switchport": {
      const vl = effVlans(st, ctx);
      const ports = iface ? [iface] : [...SWITCH_PORTS];
      const out: string[] = [];
      for (const p of ports) {
        const e = effectiveSwitchIf(st, p);
        const up = !e.shutdown && linkUp(ctx, p) && !errDis(ctx, p);
        const admin = e.mode === "trunk" ? "trunk" : e.mode === "access" ? "static access" : "dynamic auto";
        const oper = !up ? "down" : e.mode === "trunk" ? "trunk" : "static access";
        if (out.length) out.push("");
        out.push("Name: " + shortInterfaceName(p), "Switchport: Enabled", "Administrative Mode: " + admin, "Operational Mode: " + oper, "Administrative Trunking Encapsulation: dot1q",
          "Negotiation of Trunking: " + (e.mode === "trunk" ? "On" : "Off"), "Access Mode VLAN: " + e.accessVlan + " (" + vlanNameOf(vl, e.accessVlan) + ")",
          "Trunking Native Mode VLAN: " + e.nativeVlan + " (" + vlanNameOf(vl, e.nativeVlan) + ")", "Trunking VLANs Enabled: " + (e.allowed === "all" ? "ALL" : e.allowed.length ? compressVlans(e.allowed) : "NONE"));
      }
      return out;
    }
    case "mac-address-table": {
      const rows: { vlan: number; mac: string; type: string; port: string }[] = [];
      for (const r of ctx.macTable ?? []) rows.push({ vlan: r.vlan, mac: r.mac, type: "DYNAMIC", port: r.port });
      for (const p of SWITCH_PORTS) { const info = ctx.portSecurity?.(p); if (!info) continue; const v = effectiveSwitchIf(st, p).accessVlan; for (const sm of info.secure) if (sm.type !== "dynamic" && !rows.some(r => r.mac === sm.mac && r.vlan === v)) rows.push({ vlan: v, mac: sm.mac, type: "STATIC", port: p }); }
      rows.sort((a, b) => a.vlan - b.vlan || (a.mac < b.mac ? -1 : a.mac > b.mac ? 1 : 0));
      const out = ["          Mac Address Table", "-------------------------------------------", "", "Vlan    Mac Address       Type        Ports", "----    -----------       --------    -----"];
      for (const r of rows) out.push(String(r.vlan).padStart(4) + "    " + r.mac + "    " + pad(r.type, 12) + shortInterfaceName(r.port));
      out.push("Total Mac Addresses for this criterion: " + rows.length);
      return out;
    }
    case "port-security": {
      const out = ["Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action", "                (Count)       (Count)          (Count)", "---------------------------------------------------------------------------"];
      for (const p of SWITCH_PORTS) {
        const e = effectiveSwitchIf(st, p);
        if (!e.portSecurity?.enabled) continue;
        const info = ctx.portSecurity?.(p);
        out.push(shortInterfaceName(p).padStart(11) + String(e.portSecurity.maximum).padStart(15) + String(info?.secure.length ?? e.portSecurity.macs.length).padStart(13) + String(info?.violations ?? 0).padStart(19) + pad("", 9) + cap(e.portSecurity.violation));
      }
      out.push("---------------------------------------------------------------------------");
      return out;
    }
    case "port-security-interface": {
      const p = iface!, e = effectiveSwitchIf(st, p), cfg = e.portSecurity, info = ctx.portSecurity?.(p);
      const enabled = !!cfg?.enabled;
      const status = !enabled ? "Secure-down" : info?.errDisabled ? "Secure-shutdown" : !e.shutdown && linkUp(ctx, p) ? "Secure-up" : "Secure-down";
      const line = (k: string, v: string) => pad(k, 27) + ": " + v;
      return [line("Port Security", enabled ? "Enabled" : "Disabled"), line("Port Status", status), line("Violation Mode", cap(cfg?.violation ?? "shutdown")), line("Aging Time", "0 mins"), line("Aging Type", "Absolute"),
        line("SecureStatic Address Aging", "Disabled"), line("Maximum MAC Addresses", String(cfg?.maximum ?? 1)), line("Total MAC Addresses", String(info?.secure.length ?? cfg?.macs.length ?? 0)),
        line("Configured MAC Addresses", String(cfg?.macs.length ?? 0)), line("Sticky MAC Addresses", String(info?.secure.filter(x => x.type === "sticky").length ?? 0)),
        line("Last Source Address:Vlan", info?.lastSource ? info.lastSource + ":" + e.accessVlan : "0000.0000.0000:0"), line("Security Violation Count", String(info?.violations ?? 0))];
    }
    case "vtp-status": {
      const v = st.vtp, eff = ctx.effectiveVlans;
      const line = (k: string, val: string) => pad(k, 32) + ": " + val;
      return [line("VTP Version capable", "1 to 2"), line("VTP version running", String(v.version)), line("VTP Domain Name", v.domain), line("VTP Pruning Mode", "Disabled"), line("VTP Traps Generation", "Disabled"),
        line("Configuration Revision", String(eff ? eff.revision : v.revision)), line("Maximum VLANs supported locally", "255"), line("Number of existing VLANs", String(vlanIdsOf(effVlans(st, ctx)).length + 4)),
        line("VTP Operating Mode", v.mode === "server" ? "Server" : "Client")];
    }
  }
}
function runningConfig(st: Net2SwitchState, ctx: Switch2Context): string[] {
  const out = ["Building configuration...", "", "Current configuration:", "!", "hostname " + st.hostname, "!", ...passwordConfigLines(st.security, "global")];
  if (st.vtp.domain) out.push("vtp domain " + st.vtp.domain);
  if (st.vtp.mode === "client") out.push("vtp mode client");
  if (st.vtp.version === 2) out.push("vtp version 2");
  if (st.vtp.domain || st.vtp.mode === "client" || st.vtp.version === 2) out.push("!");
  for (const id of Object.keys(st.vlans)) { out.push("vlan " + id); if (st.vlans[id].name) out.push(" name " + st.vlans[id].name); out.push("!"); }
  for (const name of SWITCH_PORTS) {
    const i = st.interfaces[name] ?? {};
    out.push("interface " + displayInterfaceName(name));
    if (i.accessVlan !== undefined) out.push(" switchport access vlan " + i.accessVlan);
    if (i.nativeVlan !== undefined) out.push(" switchport trunk native vlan " + i.nativeVlan);
    if (i.allowed !== undefined) out.push(" switchport trunk allowed vlan " + (i.allowed.length ? compressVlans(i.allowed) : "none"));
    if (i.mode) out.push(" switchport mode " + i.mode);
    const ps = i.portSecurity;
    if (ps) {
      if (ps.enabled) out.push(" switchport port-security");
      if (ps.maximum !== 1) out.push(" switchport port-security maximum " + ps.maximum);
      if (ps.violation !== "shutdown") out.push(" switchport port-security violation " + ps.violation);
      if (ps.sticky) out.push(" switchport port-security mac-address sticky");
      for (const sm of ctx.portSecurity?.(name)?.secure ?? []) if (sm.type === "sticky") out.push(" switchport port-security mac-address sticky " + sm.mac);
      for (const m of ps.macs) out.push(" switchport port-security mac-address " + m);
    }
    if (i.shutdown === true) out.push(" shutdown");
    out.push("!");
  }
  for (const name of sviNames(st)) {
    const e = effectiveSwitchIf(st, name);
    out.push("interface " + displayInterfaceName(name));
    out.push(e.ipAddress ? " ip address " + e.ipAddress + " " + e.subnetMask : " no ip address");
    if (e.shutdown) out.push(" shutdown");
    out.push("!");
  }
  if (st.defaultGateway) out.push("ip default-gateway " + st.defaultGateway, "!");
  out.push(...passwordConfigLines(st.security, "lines"), "end");
  return out;
}
export const switch2SyntaxFor = (mode: SwitchMode2): string[] => helpLines(mode).map(l => l.trim());
