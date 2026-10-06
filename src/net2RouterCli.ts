// Phase 20C — the curriculum ROUTER CLI v2 of networkTopology@2 (pure; compiled into the shared server build). Router CLI v1 stays frozen;
// this versioned engine reuses only its pure helpers (port inventory, interface names, IPv4 arithmetic).
//
// Closed grammar, SESSION over a sparse canonical DEVICE STATE (as v1). v2 adds 802.1Q SUB-INTERFACES (`interface g0/0.10`,
// `encapsulation dot1Q <vlan> [native]`, an address only after the encapsulation — the real IOS rule), DHCP (`ip dhcp excluded-address`,
// `ip dhcp pool` with network / default-router / dns-server), passwords and console / VTY lines, and the show family: running-config,
// ip interface brief (incl. sub-interfaces), ip route (connected + local), ip dhcp pool, ip dhcp binding. Link status and DHCP bindings
// are operational facts supplied read-only by the network engine. Routing protocols, static routes, NAT and ACLs are refused.
import { ROUTER_PORTS, displayRouterInterface, networksOverlap, normalizeRouterInterfaceName } from "./routerCliEngine";
import { isValidHostname } from "./networkCliEngine";
import {
  FORBIDDEN_KEYS, PASSWORD_MAX, broadcastAddress, canonicalPasswords, hasOwn, ipCompare, ipv4ToInt, isIpv4, isObj, isPassword, isSubnetMask, isUsableHostAddress, networkAddress, normalizePasswords, ownKeys,
  pad, passwordConfigLines, prefixLength, type Net2Passwords
} from "./net2Common";

export const NET2_ROUTER_LIMITS = Object.freeze({ inputChars: 200, tokens: 24, subinterfaces: 16, pools: 8, exclusions: 16, poolNameChars: 32 });
export type RouterMode2 = "user" | "privileged" | "global" | "interface" | "subif" | "dhcp" | "line";
export const ROUTER2_MODE_SUFFIX: Readonly<Record<RouterMode2, string>> = Object.freeze({ user: ">", privileged: "#", global: "(config)#", interface: "(config-if)#", subif: "(config-subif)#", dhcp: "(dhcp-config)#", line: "(config-line)#" });
export const ROUTER2_MODE_LABEL: Readonly<Record<RouterMode2, string>> = Object.freeze({ user: "وضع المستخدم (User EXEC)", privileged: "الوضع المتقدّم (Privileged EXEC)", global: "وضع الإعداد العام (Global configuration)", interface: "وضع إعداد الواجهة (Interface configuration)", subif: "وضع إعداد الواجهة الفرعية (Sub-interface configuration)", dhcp: "وضع إعداد مجمّع DHCP (DHCP pool)", line: "وضع إعداد الخط (Line configuration)" });
export type Net2RouterIf = { ipAddress?: string; subnetMask?: string; shutdown?: boolean };
export type Net2SubIf = { vlan?: number; native?: boolean; ipAddress?: string; subnetMask?: string; shutdown?: boolean };
export type Net2DhcpPool = { network?: string; mask?: string; defaultRouter?: string; dns?: string };
export type Net2RouterState = { v: 2; device: "router"; hostname: string; interfaces: Record<string, Net2RouterIf>; subinterfaces: Record<string, Net2SubIf>; dhcp: { excluded: [string, string][]; pools: Record<string, Net2DhcpPool> }; security: Net2Passwords };
export type Router2Session = { state: Net2RouterState; mode: RouterMode2; selectedInterface?: string; selectedPool?: string; selectedLine?: "con" | "vty" };
export type Router2Context = { linkUp?: (port: string) => boolean; bindings?: readonly { address: string; mac: string; pool: string }[] };

export const isPoolName = (v: unknown): v is string => typeof v === "string" && v.length >= 1 && v.length <= NET2_ROUTER_LIMITS.poolNameChars && /^[A-Za-z0-9_-]+$/.test(v);
const SUB_RE = /^(g\d{1,2}\/\d{1,3})\.(\d{1,4})$/;
/** Canonical router interface name: physical "g0/0" or sub-interface "g0/0.10" (1–4094); null otherwise. */
export function normalizeRouter2Interface(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, "");
  const dot = s.lastIndexOf(".");
  if (dot < 0) return normalizeRouterInterfaceName(s);
  const parent = normalizeRouterInterfaceName(s.slice(0, dot)), num = s.slice(dot + 1);
  if (!parent || !/^[1-9]\d{0,3}$/.test(num) || Number(num) > 4094) return null;
  return parent + "." + num;
}
export const isSubinterfaceName = (n: string): boolean => SUB_RE.test(n) && ROUTER_PORTS.includes(n.split(".")[0]);
export const parentOf = (n: string): string => n.split(".")[0];
export const displayRouter2Interface = (n: string): string => displayRouterInterface(parentOf(n)) + (n.includes(".") ? "." + n.split(".")[1] : "");
const subOrder = (a: string, b: string) => ROUTER_PORTS.indexOf(parentOf(a)) - ROUTER_PORTS.indexOf(parentOf(b)) || Number(a.split(".")[1]) - Number(b.split(".")[1]);

// ── canonical state ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function canonicalRouterState(s: Net2RouterState): Net2RouterState {
  const interfaces: Record<string, Net2RouterIf> = {};
  for (const p of ROUTER_PORTS) {
    if (!hasOwn(s.interfaces, p)) continue;
    const c = s.interfaces[p] ?? {}, out: Net2RouterIf = {};
    if (typeof c.ipAddress === "string" && typeof c.subnetMask === "string") { out.ipAddress = c.ipAddress; out.subnetMask = c.subnetMask; }
    if (c.shutdown === false) out.shutdown = false;
    if (Object.keys(out).length) interfaces[p] = out;
  }
  const subinterfaces: Record<string, Net2SubIf> = {};
  for (const n of ownKeys(s.subinterfaces).filter(isSubinterfaceName).sort(subOrder)) {
    const c = s.subinterfaces[n] ?? {}, out: Net2SubIf = {};
    if (typeof c.vlan === "number") out.vlan = c.vlan;
    if (c.native === true) out.native = true;
    if (typeof c.ipAddress === "string" && typeof c.subnetMask === "string") { out.ipAddress = c.ipAddress; out.subnetMask = c.subnetMask; }
    if (c.shutdown === true) out.shutdown = true;
    subinterfaces[n] = out;
  }
  const excluded = [...s.dhcp.excluded].map(([a, b]) => [a, b] as [string, string]).sort((x, y) => ipCompare(x[0], y[0]) || ipCompare(x[1], y[1]));
  const pools: Record<string, Net2DhcpPool> = {};
  for (const name of ownKeys(s.dhcp.pools).sort()) {
    const p = s.dhcp.pools[name] ?? {}, out: Net2DhcpPool = {};
    if (typeof p.network === "string" && typeof p.mask === "string") { out.network = p.network; out.mask = p.mask; }
    if (typeof p.defaultRouter === "string") out.defaultRouter = p.defaultRouter;
    if (typeof p.dns === "string") out.dns = p.dns;
    pools[name] = out;
  }
  return { v: 2, device: "router", hostname: s.hostname, interfaces, subinterfaces, dhcp: { excluded, pools }, security: canonicalPasswords(s.security) };
}
export const createRouterState2 = (hostname = "Router"): Net2RouterState => canonicalRouterState({ v: 2, device: "router", hostname, interfaces: {}, subinterfaces: {}, dhcp: { excluded: [], pools: {} }, security: {} });
export const createRouterSession2 = (state: Net2RouterState): Router2Session => ({ state: canonicalRouterState(state), mode: "user" });
export const routerPrompt2 = (s: Pick<Router2Session, "state" | "mode">): string => s.state.hostname + ROUTER2_MODE_SUFFIX[s.mode];
/** Every addressed L3 interface (physical or sub-interface) with its network — for overlap checks, routing and DHCP. */
export function routerAddresses(st: Net2RouterState): { name: string; ipAddress: string; subnetMask: string }[] {
  const out: { name: string; ipAddress: string; subnetMask: string }[] = [];
  for (const p of ROUTER_PORTS) { const c = st.interfaces[p]; if (c?.ipAddress && c.subnetMask) out.push({ name: p, ipAddress: c.ipAddress, subnetMask: c.subnetMask }); }
  for (const n of Object.keys(st.subinterfaces).sort(subOrder)) { const c = st.subinterfaces[n]; if (c.ipAddress && c.subnetMask) out.push({ name: n, ipAddress: c.ipAddress, subnetMask: c.subnetMask }); }
  return out;
}
const overlapsOther = (st: Net2RouterState, self: string, ip: string, mask: string) => routerAddresses(st).find(a => a.name !== self && networksOverlap(ip, mask, a.ipAddress, a.subnetMask));

/** Strict ingest of an untrusted (teacher initial) router state; canonical result or undefined. */
export function normalizeRouterState2(raw: unknown): Net2RouterState | undefined {
  if (!isObj(raw) || Object.keys(raw).some(k => FORBIDDEN_KEYS.has(k) || !["v", "device", "hostname", "interfaces", "subinterfaces", "dhcp", "security"].includes(k))) return undefined;
  if (raw.v !== 2 || raw.device !== "router" || typeof raw.hostname !== "string" || !isValidHostname(raw.hostname) || !isObj(raw.interfaces) || !isObj(raw.subinterfaces) || !isObj(raw.dhcp)) return undefined;
  const st: Net2RouterState = { v: 2, device: "router", hostname: raw.hostname, interfaces: {}, subinterfaces: {}, dhcp: { excluded: [], pools: {} }, security: {} };
  const addr = (c: Record<string, unknown>, name: string): boolean => {
    if (c.ipAddress === undefined && c.subnetMask === undefined) return true;
    if (typeof c.ipAddress !== "string" || typeof c.subnetMask !== "string" || !isUsableHostAddress(c.ipAddress, c.subnetMask) || overlapsOther(st, name, c.ipAddress, c.subnetMask)) return false;
    return true;
  };
  for (const p of Object.keys(raw.interfaces)) {
    const c = raw.interfaces[p];
    if (FORBIDDEN_KEYS.has(p) || !ROUTER_PORTS.includes(p) || !isObj(c) || Object.keys(c).some(f => !["ipAddress", "subnetMask", "shutdown"].includes(f)) || (c.shutdown !== undefined && typeof c.shutdown !== "boolean") || !addr(c, p)) return undefined;
    st.interfaces[p] = { ...(c.ipAddress ? { ipAddress: c.ipAddress as string, subnetMask: c.subnetMask as string } : {}), ...(c.shutdown !== undefined ? { shutdown: c.shutdown as boolean } : {}) };
  }
  const subs = Object.keys(raw.subinterfaces);
  if (subs.length > NET2_ROUTER_LIMITS.subinterfaces) return undefined;
  for (const n of subs) {
    const c = raw.subinterfaces[n];
    if (FORBIDDEN_KEYS.has(n) || !isSubinterfaceName(n) || !isObj(c) || Object.keys(c).some(f => !["vlan", "native", "ipAddress", "subnetMask", "shutdown"].includes(f))) return undefined;
    if (c.vlan !== undefined && (typeof c.vlan !== "number" || !Number.isInteger(c.vlan) || c.vlan < 1 || c.vlan > 4094)) return undefined;
    if ((c.native !== undefined && c.native !== true) || (c.shutdown !== undefined && typeof c.shutdown !== "boolean")) return undefined;
    if ((c.ipAddress !== undefined || c.native) && c.vlan === undefined) return undefined;
    const siblings = Object.entries(st.subinterfaces).filter(([k]) => parentOf(k) === parentOf(n));
    if (c.vlan !== undefined && siblings.some(([, v]) => v.vlan === c.vlan)) return undefined;
    if (c.native && siblings.some(([, v]) => v.native)) return undefined;
    if (!addr(c, n)) return undefined;
    st.subinterfaces[n] = { ...(c.vlan !== undefined ? { vlan: c.vlan as number } : {}), ...(c.native ? { native: true } : {}), ...(c.ipAddress ? { ipAddress: c.ipAddress as string, subnetMask: c.subnetMask as string } : {}), ...(c.shutdown !== undefined ? { shutdown: c.shutdown as boolean } : {}) };
  }
  const d = raw.dhcp;
  if (Object.keys(d).sort().join(",") !== "excluded,pools" || !Array.isArray(d.excluded) || !isObj(d.pools) || d.excluded.length > NET2_ROUTER_LIMITS.exclusions || Object.keys(d.pools).length > NET2_ROUTER_LIMITS.pools) return undefined;
  for (const e of d.excluded) { if (!Array.isArray(e) || e.length !== 2 || !isIpv4(e[0]) || !isIpv4(e[1]) || ipCompare(e[0], e[1]) > 0) return undefined; st.dhcp.excluded.push([e[0], e[1]]); }
  for (const name of Object.keys(d.pools)) {
    const p = d.pools[name];
    if (FORBIDDEN_KEYS.has(name) || !isPoolName(name) || !isObj(p) || Object.keys(p).some(f => !["network", "mask", "defaultRouter", "dns"].includes(f))) return undefined;
    if ((p.network !== undefined || p.mask !== undefined) && (typeof p.network !== "string" || typeof p.mask !== "string" || !isIpv4(p.network) || !isSubnetMask(p.mask) || networkAddress(p.network, p.mask) !== p.network)) return undefined;
    for (const f of ["defaultRouter", "dns"] as const) if (p[f] !== undefined && (typeof p[f] !== "string" || !isIpv4(p[f] as string))) return undefined;
    st.dhcp.pools[name] = p as Net2DhcpPool;
  }
  const security = raw.security === undefined ? {} : normalizePasswords(raw.security);
  if (!security) return undefined;
  st.security = security;
  return canonicalRouterState(st);
}

// ── effective / operational helpers ────────────────────────────────────────────────────────────────────────────────────────────────
/** Router physical interfaces are administratively down until `no shutdown`. */
export const physicalAdminUp = (st: Net2RouterState, port: string): boolean => st.interfaces[port]?.shutdown === false;
/** An L3 interface (physical or sub-interface) is up when its (parent) port is admin-up with an operational link and the sub-interface is usable. */
export function router2IfUp(st: Net2RouterState, name: string, linkUp: (port: string) => boolean): boolean {
  const parent = parentOf(name);
  if (!physicalAdminUp(st, parent) || !linkUp(parent)) return false;
  if (!name.includes(".")) return true;
  const sub = st.subinterfaces[name];
  return !!sub && sub.vlan !== undefined && sub.shutdown !== true;
}

// ── the closed command grammar ─────────────────────────────────────────────────────────────────────────────────────────────────────
type Show = "running-config" | "ip-interface-brief" | "ip-route" | "dhcp-pool" | "dhcp-binding";
type Cmd =
  | { id: "help" } | { id: "enable" } | { id: "disable" } | { id: "configure-terminal" } | { id: "exit" } | { id: "end" } | { id: "hostname"; name: string }
  | { id: "interface"; name: string } | { id: "ip-address"; address: string; mask: string } | { id: "no-ip-address" } | { id: "shutdown" } | { id: "no-shutdown" }
  | { id: "encapsulation"; vlan: number; native: boolean }
  | { id: "excluded"; on: boolean; from: string; to: string } | { id: "pool"; on: boolean; name: string } | { id: "network"; network: string; mask: string } | { id: "default-router"; address: string } | { id: "dns-server"; address: string }
  | { id: "enable-password"; value: string } | { id: "enable-secret"; value: string } | { id: "no-enable-password" } | { id: "no-enable-secret" } | { id: "service-encryption"; on: boolean }
  | { id: "line"; line: "con" | "vty" } | { id: "line-password"; value: string } | { id: "login"; on: boolean }
  | { id: "show"; what: Show };
type Arg = Cmd | { incomplete: string } | { invalid: string };
type Spec = { id: Cmd["id"]; kw: readonly (readonly string[])[]; modes: readonly RouterMode2[]; syntax: string; args: (rest: string[]) => Arg };
const CONFIG: readonly RouterMode2[] = ["global", "interface", "subif", "dhcp", "line"];
const NOT_USER: readonly RouterMode2[] = ["privileged", ...CONFIG];
const ALL: readonly RouterMode2[] = ["user", ...NOT_USER];
const IFMODES: readonly RouterMode2[] = ["interface", "subif"];
const none = (c: Cmd) => (rest: string[]): Arg => (rest.length ? { invalid: "this command takes no further values" } : c);
const one = (what: string, f: (v: string) => Arg) => (rest: string[]): Arg => (rest.length === 0 ? { incomplete: what + " is required" } : rest.length > 1 ? { invalid: "unexpected values after " + what } : f(rest[0]));
const ipArg = (make: (v: string) => Cmd) => one("an IPv4 address", t => (isIpv4(t) ? make(t) : { invalid: "invalid IPv4 address: " + t }));
const password = (make: (v: string) => Cmd) => one("a password", t => (isPassword(t) ? make(t) : { invalid: "invalid password (one word, printable characters, up to " + PASSWORD_MAX + ")" }));
const show = (what: Show) => none({ id: "show", what });
const excludedArgs = (on: boolean) => (rest: string[]): Arg => {
  if (!rest.length) return { incomplete: "a low (and optional high) address is required" };
  if (rest.length > 2 || !rest.every(isIpv4)) return { invalid: "expected: <low-address> [<high-address>]" };
  const to = rest[1] ?? rest[0];
  return ipCompare(rest[0], to) > 0 ? { invalid: "the high address must not be lower than the low address" } : { id: "excluded", on, from: rest[0], to };
};
export const ROUTER2_COMMANDS: readonly Spec[] = Object.freeze([
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
  { id: "interface", kw: [["interface"], ["int"]], modes: ["global", ...IFMODES, "dhcp", "line"], syntax: "interface GigabitEthernet0/0-0/3[.<1-4094>]", args: rest => { if (!rest.length) return { incomplete: "an interface name is required" }; const n = normalizeRouter2Interface(rest.join("")); return n ? { id: "interface", name: n } : { invalid: "invalid interface: " + rest.join(" ") + " does not exist on this router" }; } },
  {
    id: "encapsulation", kw: [["encapsulation"]], modes: ["subif"], syntax: "encapsulation dot1Q <vlan-id> [native]",
    args: rest => {
      if (!rest.length) return { incomplete: "dot1Q and a VLAN id are required" };
      if (rest[0].toLowerCase() !== "dot1q") return { invalid: "this simulator supports IEEE 802.1Q only (encapsulation dot1Q <vlan-id>)" };
      if (rest.length < 2) return { incomplete: "a VLAN id (1-4094) is required" };
      if (!/^[1-9]\d{0,3}$/.test(rest[1]) || Number(rest[1]) > 4094) return { invalid: "VLAN id must be between 1 and 4094: " + rest[1] };
      if (rest.length === 3 && rest[2].toLowerCase() === "native") return { id: "encapsulation", vlan: Number(rest[1]), native: true };
      return rest.length === 2 ? { id: "encapsulation", vlan: Number(rest[1]), native: false } : { invalid: "unexpected values after the VLAN id" };
    }
  },
  {
    id: "ip-address", kw: [["ip", "address"], ["ip", "addr"]], modes: IFMODES, syntax: "ip address <ipv4-address> <subnet-mask>",
    args: rest => {
      if (rest.length < 2) return { incomplete: "an IPv4 address and a subnet mask are required" };
      if (rest.length > 2) return { invalid: "unexpected values after the mask" };
      if (!isIpv4(rest[0])) return { invalid: "invalid IPv4 address: " + rest[0] };
      if (!isSubnetMask(rest[1])) return { invalid: "bad mask: " + rest[1] };
      return isUsableHostAddress(rest[0], rest[1]) ? { id: "ip-address", address: rest[0], mask: rest[1] } : { invalid: "bad mask " + rest[1] + " for address " + rest[0] };
    }
  },
  { id: "no-ip-address", kw: [["no", "ip", "address"]], modes: IFMODES, syntax: "no ip address", args: none({ id: "no-ip-address" }) },
  { id: "no-shutdown", kw: [["no", "shutdown"], ["no", "shut"]], modes: IFMODES, syntax: "no shutdown", args: none({ id: "no-shutdown" }) },
  { id: "shutdown", kw: [["shutdown"], ["shut"]], modes: IFMODES, syntax: "shutdown", args: none({ id: "shutdown" }) },
  { id: "excluded", kw: [["no", "ip", "dhcp", "excluded-address"]], modes: ["global"], syntax: "no ip dhcp excluded-address <low> [<high>]", args: excludedArgs(false) },
  { id: "excluded", kw: [["ip", "dhcp", "excluded-address"]], modes: ["global"], syntax: "ip dhcp excluded-address <low> [<high>]", args: excludedArgs(true) },
  { id: "pool", kw: [["no", "ip", "dhcp", "pool"]], modes: ["global"], syntax: "no ip dhcp pool <name>", args: one("a pool name", t => (isPoolName(t) ? { id: "pool", on: false, name: t } : { invalid: "invalid pool name (letters, digits, _ -; up to 32)" })) },
  { id: "pool", kw: [["ip", "dhcp", "pool"]], modes: ["global", "dhcp"], syntax: "ip dhcp pool <name>", args: one("a pool name", t => (isPoolName(t) ? { id: "pool", on: true, name: t } : { invalid: "invalid pool name (letters, digits, _ -; up to 32)" })) },
  {
    id: "network", kw: [["network"]], modes: ["dhcp"], syntax: "network <network-address> <subnet-mask>",
    args: rest => (rest.length < 2 ? { incomplete: "a network address and a mask are required" } : rest.length > 2 ? { invalid: "unexpected values after the mask" } : !isIpv4(rest[0]) ? { invalid: "invalid IPv4 address: " + rest[0] } : !isSubnetMask(rest[1]) ? { invalid: "bad mask: " + rest[1] } : { id: "network", network: networkAddress(rest[0], rest[1]), mask: rest[1] })
  },
  { id: "default-router", kw: [["default-router"]], modes: ["dhcp"], syntax: "default-router <ipv4-address>", args: ipArg(v => ({ id: "default-router", address: v })) },
  { id: "dns-server", kw: [["dns-server"]], modes: ["dhcp"], syntax: "dns-server <ipv4-address>", args: ipArg(v => ({ id: "dns-server", address: v })) },
  { id: "service-encryption", kw: [["no", "service", "password-encryption"]], modes: ["global"], syntax: "no service password-encryption", args: none({ id: "service-encryption", on: false }) },
  { id: "service-encryption", kw: [["service", "password-encryption"]], modes: ["global"], syntax: "service password-encryption", args: none({ id: "service-encryption", on: true }) },
  {
    id: "line", kw: [["line"]], modes: ["global", "line", ...IFMODES, "dhcp"], syntax: "line console 0 | line vty 0 4",
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
  { id: "show", kw: [["show", "ip", "interface", "brief"], ["show", "ip", "int", "brief"], ["show", "ip", "int", "br"], ["sh", "ip", "int", "br"]], modes: ALL, syntax: "show ip interface brief", args: show("ip-interface-brief") },
  { id: "show", kw: [["show", "ip", "route"], ["sh", "ip", "route"]], modes: ALL, syntax: "show ip route", args: show("ip-route") },
  { id: "show", kw: [["show", "ip", "dhcp", "pool"]], modes: ALL, syntax: "show ip dhcp pool", args: show("dhcp-pool") },
  { id: "show", kw: [["show", "ip", "dhcp", "binding"]], modes: ALL, syntax: "show ip dhcp binding", args: show("dhcp-binding") }
]);
const NOT_SUPPORTED: readonly { match: (t: string[]) => boolean; text: string; hint: string }[] = Object.freeze([
  { match: t => t[0] === "router" || (t[0] === "ip" && t[1] === "route"), text: "routing protocols and static routes are a later network phase (not supported in this simulator)", hint: "يتعلّم هذا المحاكي الشبكات المتصلة مباشرة وRouter-on-a-Stick؛ التوجيه الثابت والديناميكي لاحقًا" },
  { match: t => (t[0] === "ip" && ["nat", "access-group", "helper-address", "routing", "ospf"].includes(t[1] ?? "")) || t[0] === "access-list", text: "NAT, ACLs and DHCP relay are not supported in this simulator", hint: "الأمر خارج نطاق المحاكي في هذه المرحلة" },
  { match: t => t[0] === "write" || t[0] === "wr" || t[0] === "copy", text: "saving to startup-config is not simulated; the running configuration is what counts", hint: "لا حاجة للحفظ: الإعداد الجاري هو ما يُقيَّم" },
  { match: t => ["ping", "traceroute", "telnet", "ssh", "reload", "erase", "delete", "debug"].includes(t[0]), text: "this command is not supported on the router CLI of this simulator", hint: "اختبر الاتصال من موجّه الأوامر في الحاسوب (Command Prompt)" }
]);
const tokenize = (raw: string) => raw.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
const startsWith = (tokens: string[], seq: readonly string[]) => seq.length <= tokens.length && seq.every((k, i) => tokens[i].toLowerCase() === k);
type Parse = { kind: "empty" } | { kind: "refused"; detail: string } | { kind: "unknown" } | { kind: "not-supported"; detail: string; hint: string } | { kind: "incomplete" | "invalid"; detail: string; syntax: string } | { kind: "ok"; cmd: Cmd; spec: Spec; viaDo: boolean };
export function parseRouterCommand(raw: unknown): Parse {
  if (typeof raw !== "string") return { kind: "empty" };
  if (raw.length > NET2_ROUTER_LIMITS.inputChars) return { kind: "refused", detail: "line too long (max " + NET2_ROUTER_LIMITS.inputChars + " characters)" };
  let tokens = tokenize(raw);
  if (!tokens.length) return { kind: "empty" };
  if (tokens.length > NET2_ROUTER_LIMITS.tokens) return { kind: "refused", detail: "too many words in one command" };
  let viaDo = false;
  if (tokens[0].toLowerCase() === "do" && tokens.length > 1) { viaDo = true; tokens = tokens.slice(1); }
  const lower = tokens.map(t => t.toLowerCase());
  for (const ns of NOT_SUPPORTED) if (ns.match(lower)) return { kind: "not-supported", detail: ns.text, hint: ns.hint };
  for (const spec of ROUTER2_COMMANDS) for (const seq of spec.kw) {
    if (!startsWith(tokens, seq)) continue;
    if (viaDo && spec.id !== "show") return { kind: "unknown" };
    const r = spec.args(tokens.slice(seq.length));
    if ("incomplete" in r) return { kind: "incomplete", detail: r.incomplete, syntax: spec.syntax };
    if ("invalid" in r) return { kind: "invalid", detail: r.invalid, syntax: spec.syntax };
    return { kind: "ok", cmd: r, spec, viaDo };
  }
  for (const spec of ROUTER2_COMMANDS) for (const seq of spec.kw) if (tokens.length < seq.length && lower.every((t, i) => t === seq[i])) return { kind: "incomplete", detail: "incomplete command", syntax: spec.syntax };
  return { kind: "unknown" };
}

// ── execution ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Router2Status = "empty" | "refused" | "unknown" | "not-supported" | "incomplete" | "invalid" | "wrong-mode" | "ok";
export type Router2Result = { status: Router2Status; output: string[]; hint?: string; changed: boolean };
const res = (status: Router2Status, output: string[], hint?: string, changed = false): Router2Result => (hint === undefined ? { status, output, changed } : { status, output, hint, changed });
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const EXIT_TO: Record<RouterMode2, RouterMode2> = { user: "user", privileged: "user", global: "privileged", interface: "global", subif: "global", dhcp: "global", line: "global" };
const MODE_EN: Record<RouterMode2, string> = { user: "user EXEC mode", privileged: "privileged EXEC mode", global: "global configuration mode", interface: "interface configuration mode", subif: "sub-interface configuration mode", dhcp: "DHCP pool configuration mode", line: "line configuration mode" };
const MODE_HOWTO: Record<RouterMode2, string> = { user: "اكتب disable للعودة إلى وضع المستخدم", privileged: "اكتب enable أولًا", global: "اكتب enable ثم configure terminal", interface: "ادخل إلى واجهة أولًا: interface g0/0", subif: "ادخل إلى واجهة فرعية أولًا: interface g0/0.10", dhcp: "ادخل إلى مجمّع أولًا: ip dhcp pool LAN", line: "ادخل إلى خط أولًا: line console 0" };
const nav = (s: Router2Session, mode: RouterMode2, extra: Partial<Router2Session> = {}): Router2Session => ({ state: s.state, mode, ...extra });
const setState = (s: Router2Session, state: Net2RouterState): Router2Session => ({ ...s, state: canonicalRouterState(state) });

export function executeRouterCommand2(session: Router2Session, raw: unknown, ctx: Router2Context = {}): { session: Router2Session; result: Router2Result } {
  const p = parseRouterCommand(raw);
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
  if (!p.viaDo && !p.spec.modes.includes(session.mode)) return { session, result: res("wrong-mode", ["% This command is not available in " + MODE_EN[session.mode] + "."], "هذا الأمر يعمل في " + p.spec.modes.map(m => ROUTER2_MODE_LABEL[m]).join(" أو ") + ". " + MODE_HOWTO[p.spec.modes[0]]) };
  const s = session, c = p.cmd, sel = s.selectedInterface;
  const ok = (next: Router2Session, output: string[] = [], hint?: string) => ({ session: next, result: res("ok", output, hint, JSON.stringify(next.state) !== JSON.stringify(s.state)) });
  const reject = (text: string, hint: string) => ({ session: s, result: res("invalid", ["% " + text], hint) });
  const isSub = !!sel && sel.includes(".");
  const updIf = (f: (x: Net2RouterIf & Net2SubIf) => Net2RouterIf & Net2SubIf) => (isSub
    ? setState(s, { ...s.state, subinterfaces: { ...s.state.subinterfaces, [sel!]: f({ ...(s.state.subinterfaces[sel!] ?? {}) }) } })
    : setState(s, { ...s.state, interfaces: { ...s.state.interfaces, [sel!]: f({ ...(s.state.interfaces[sel!] ?? {}) }) } }));
  switch (c.id) {
    case "help": { const seen = new Set<string>(), out: string[] = []; for (const x of ROUTER2_COMMANDS) if (x.modes.includes(s.mode) && x.id !== "help" && !seen.has(x.syntax)) { seen.add(x.syntax); out.push("  " + x.syntax); } return ok(s, out); }
    case "enable": return ok(s.mode === "privileged" ? s : nav(s, "privileged"));
    case "disable": return ok(nav(s, "user"));
    case "configure-terminal": return ok(nav(s, "global"), ["Enter configuration commands, one per line.  End with CNTL/Z."]);
    case "end": return ok(s.mode === "user" || s.mode === "privileged" ? s : nav(s, "privileged"));
    case "exit": return ok(s.mode === "user" ? s : nav(s, EXIT_TO[s.mode]));
    case "hostname": return ok(setState(s, { ...s.state, hostname: c.name }));
    case "interface": {
      if (!c.name.includes(".")) return ok(nav(s, "interface", { selectedInterface: c.name }));
      if (!hasOwn(s.state.subinterfaces, c.name) && Object.keys(s.state.subinterfaces).length >= NET2_ROUTER_LIMITS.subinterfaces) return reject("Sub-interface limit reached in this simulator.", "تجاوزت الحد الأقصى لعدد الواجهات الفرعية.");
      const subinterfaces = hasOwn(s.state.subinterfaces, c.name) ? s.state.subinterfaces : { ...s.state.subinterfaces, [c.name]: {} };
      return ok({ state: canonicalRouterState({ ...s.state, subinterfaces }), mode: "subif", selectedInterface: c.name });
    }
    case "encapsulation": {
      const parent = parentOf(sel!);
      const clash = Object.entries(s.state.subinterfaces).find(([k, v]) => k !== sel && parentOf(k) === parent && v.vlan === c.vlan);
      if (clash) return reject("Configuration of multiple subinterfaces of the same main interface with the same VID (" + c.vlan + ") is not permitted.", "كل واجهة فرعية على المنفذ نفسه يجب أن تحمل رقم VLAN مختلفًا.");
      if (c.native && Object.entries(s.state.subinterfaces).some(([k, v]) => k !== sel && parentOf(k) === parent && v.native)) return reject("Only one native VLAN sub-interface is allowed per interface.", "واجهة فرعية واحدة فقط يمكن أن تكون native على المنفذ نفسه.");
      return ok(updIf(x => { const y = { ...x, vlan: c.vlan }; if (c.native) y.native = true; else delete y.native; return y; }));
    }
    case "ip-address": {
      if (isSub && s.state.subinterfaces[sel!]?.vlan === undefined) return reject("Configuring IP routing on a LAN subinterface is only allowed if that subinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q, or ISL vLAN.", "اضبط أولًا: encapsulation dot1Q <رقم VLAN> ثم أعد إدخال العنوان.");
      const ov = overlapsOther(s.state, sel!, c.address, c.mask);
      if (ov) return reject(networkAddress(c.address, c.mask) + " overlaps with " + displayRouter2Interface(ov.name) + ".", "لكل واجهة شبكة مختلفة على الراوتر.");
      return ok(updIf(x => ({ ...x, ipAddress: c.address, subnetMask: c.mask })));
    }
    case "no-ip-address": return ok(updIf(x => { const y = { ...x }; delete y.ipAddress; delete y.subnetMask; return y; }));
    case "shutdown": return ok(updIf(x => ({ ...x, shutdown: true })));
    case "no-shutdown": return ok(updIf(x => ({ ...x, shutdown: false })));
    case "excluded": {
      const has = s.state.dhcp.excluded.some(([a, b]) => a === c.from && b === c.to);
      if (!c.on) return ok(has ? setState(s, { ...s.state, dhcp: { ...s.state.dhcp, excluded: s.state.dhcp.excluded.filter(([a, b]) => !(a === c.from && b === c.to)) } }) : s);
      if (has) return ok(s);
      if (s.state.dhcp.excluded.length >= NET2_ROUTER_LIMITS.exclusions) return reject("Too many excluded ranges for this simulator.", "قلّل عدد النطاقات المستثناة.");
      return ok(setState(s, { ...s.state, dhcp: { ...s.state.dhcp, excluded: [...s.state.dhcp.excluded, [c.from, c.to]] } }));
    }
    case "pool": {
      if (!c.on) { if (!hasOwn(s.state.dhcp.pools, c.name)) return reject("Pool " + c.name + " does not exist.", "اسم المجمّع غير موجود."); const pools = { ...s.state.dhcp.pools }; delete pools[c.name]; return ok(setState(s, { ...s.state, dhcp: { ...s.state.dhcp, pools } })); }
      if (!hasOwn(s.state.dhcp.pools, c.name) && Object.keys(s.state.dhcp.pools).length >= NET2_ROUTER_LIMITS.pools) return reject("Too many DHCP pools for this simulator.", "تجاوزت الحد الأقصى لعدد مجمّعات DHCP.");
      const pools = hasOwn(s.state.dhcp.pools, c.name) ? s.state.dhcp.pools : { ...s.state.dhcp.pools, [c.name]: {} };
      return ok({ state: canonicalRouterState({ ...s.state, dhcp: { ...s.state.dhcp, pools } }), mode: "dhcp", selectedPool: c.name });
    }
    case "network": case "default-router": case "dns-server": {
      const name = s.selectedPool!;
      const cur = { ...(s.state.dhcp.pools[name] ?? {}) };
      if (c.id === "network") { cur.network = c.network; cur.mask = c.mask; } else if (c.id === "default-router") cur.defaultRouter = c.address; else cur.dns = c.address;
      return ok(setState(s, { ...s.state, dhcp: { ...s.state.dhcp, pools: { ...s.state.dhcp.pools, [name]: cur } } }));
    }
    case "enable-secret": return ok(setState(s, { ...s.state, security: { ...s.state.security, enableSecret: c.value } }));
    case "enable-password": return ok(setState(s, { ...s.state, security: { ...s.state.security, enablePassword: c.value } }));
    case "no-enable-secret": { const sec = { ...s.state.security }; delete sec.enableSecret; return ok(setState(s, { ...s.state, security: sec })); }
    case "no-enable-password": { const sec = { ...s.state.security }; delete sec.enablePassword; return ok(setState(s, { ...s.state, security: sec })); }
    case "service-encryption": return ok(setState(s, { ...s.state, security: { ...s.state.security, encryption: c.on } }));
    case "line": return ok(nav(s, "line", { selectedLine: c.line }));
    case "line-password": return ok(setState(s, { ...s.state, security: { ...s.state.security, [s.selectedLine === "vty" ? "vtyPassword" : "consolePassword"]: c.value } }));
    case "login": return ok(setState(s, { ...s.state, security: { ...s.state.security, [s.selectedLine === "vty" ? "vtyLogin" : "consoleLogin"]: c.on } }));
    case "show": return ok(s, routerShow(s.state, c.what, ctx));
  }
}

// ── show commands ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function routerShow(state: Net2RouterState, what: Show, ctx: Router2Context = {}): string[] {
  const st = canonicalRouterState(state);
  const linkUp = (p: string) => (ctx.linkUp ? ctx.linkUp(p) : false);
  switch (what) {
    case "running-config": {
      const out = ["Building configuration...", "", "Current configuration:", "!", "hostname " + st.hostname, "!", ...passwordConfigLines(st.security, "global")];
      for (const p of ROUTER_PORTS) {
        const c = st.interfaces[p] ?? {};
        out.push("interface " + displayRouterInterface(p), c.ipAddress ? " ip address " + c.ipAddress + " " + c.subnetMask : " no ip address");
        if (c.shutdown !== false) out.push(" shutdown");
        out.push("!");
        for (const n of Object.keys(st.subinterfaces).filter(k => parentOf(k) === p)) {
          const sub = st.subinterfaces[n];
          out.push("interface " + displayRouter2Interface(n));
          if (sub.vlan !== undefined) out.push(" encapsulation dot1Q " + sub.vlan + (sub.native ? " native" : ""));
          out.push(sub.ipAddress ? " ip address " + sub.ipAddress + " " + sub.subnetMask : " no ip address");
          if (sub.shutdown) out.push(" shutdown");
          out.push("!");
        }
      }
      for (const [a, b] of st.dhcp.excluded) out.push("ip dhcp excluded-address " + a + (a === b ? "" : " " + b));
      if (st.dhcp.excluded.length) out.push("!");
      for (const name of Object.keys(st.dhcp.pools)) {
        const pl = st.dhcp.pools[name];
        out.push("ip dhcp pool " + name);
        if (pl.network) out.push(" network " + pl.network + " " + pl.mask);
        if (pl.defaultRouter) out.push(" default-router " + pl.defaultRouter);
        if (pl.dns) out.push(" dns-server " + pl.dns);
        out.push("!");
      }
      out.push(...passwordConfigLines(st.security, "lines"), "end");
      return out;
    }
    case "ip-interface-brief": {
      const out = [pad("Interface", 27) + pad("IP-Address", 16) + "OK? Method " + pad("Status", 22) + "Protocol"];
      for (const p of ROUTER_PORTS) {
        const rows = [p, ...Object.keys(st.subinterfaces).filter(k => parentOf(k) === p)];
        for (const n of rows) {
          const c = n.includes(".") ? st.subinterfaces[n] : st.interfaces[n] ?? {};
          const admin = physicalAdminUp(st, p) && !(n.includes(".") && st.subinterfaces[n].shutdown);
          const up = admin && router2IfUp(st, n, linkUp);
          out.push(pad(displayRouter2Interface(n), 27) + pad(c?.ipAddress ?? "unassigned", 16) + "YES " + pad(c?.ipAddress ? "manual" : "unset", 7) + pad(!admin ? "administratively down" : up ? "up" : "down", 22) + (up ? "up" : "down"));
        }
      }
      return out;
    }
    case "ip-route": {
      const out = ["Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP", "       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area", "", "Gateway of last resort is not set", ""];
      const up = routerAddresses(st).filter(a => router2IfUp(st, a.name, linkUp)).sort((a, b) => ipCompare(networkAddress(a.ipAddress, a.subnetMask), networkAddress(b.ipAddress, b.subnetMask)));
      for (const a of up) {
        out.push(pad("C", 9) + networkAddress(a.ipAddress, a.subnetMask) + "/" + prefixLength(a.subnetMask) + " is directly connected, " + displayRouter2Interface(a.name));
        out.push(pad("L", 9) + a.ipAddress + "/32 is directly connected, " + displayRouter2Interface(a.name));
      }
      return out;
    }
    case "dhcp-pool": {
      const out: string[] = [];
      for (const name of Object.keys(st.dhcp.pools)) {
        const pl = st.dhcp.pools[name];
        const leased = (ctx.bindings ?? []).filter(b => b.pool === name).length;
        const total = pl.network && pl.mask ? Math.max(0, (ipv4ToInt(broadcastAddress(pl.network, pl.mask)) - ipv4ToInt(pl.network)) - 1) : 0;
        const excludedIn = pl.network && pl.mask ? excludedCount(st, pl.network, pl.mask) : 0;
        if (out.length) out.push("");
        out.push("Pool " + name + " :", " Network                        : " + (pl.network ? pl.network + " " + pl.mask : "(not set)"), " Default router                 : " + (pl.defaultRouter ?? "(not set)"),
          " DNS server                     : " + (pl.dns ?? "(not set)"), " Total addresses                : " + total, " Leased addresses               : " + leased, " Excluded addresses             : " + excludedIn);
      }
      return out.length ? out : ["% No DHCP pools are configured."];
    }
    case "dhcp-binding": {
      const out = ["IP address       Client-ID/              Lease expiration        Type", "                 Hardware address"];
      for (const b of [...(ctx.bindings ?? [])].sort((x, y) => ipCompare(x.address, y.address))) out.push(pad(b.address, 17) + pad(b.mac, 24) + pad("--", 24) + "Automatic");
      return out;
    }
  }
}
/** Number of excluded addresses that fall inside a pool network (for `show ip dhcp pool`). */
function excludedCount(st: Net2RouterState, network: string, mask: string): number {
  const lo = ipv4ToInt(network) + 1, hi = ipv4ToInt(broadcastAddress(network, mask)) - 1;
  const set = new Set<number>();
  for (const [a, b] of st.dhcp.excluded) for (let v = Math.max(lo, ipv4ToInt(a)); v <= Math.min(hi, ipv4ToInt(b)) && set.size < 70000; v++) set.add(v);
  return set.size;
}
export const router2SyntaxFor = (mode: RouterMode2): string[] => { const seen = new Set<string>(); return ROUTER2_COMMANDS.filter(c => c.modes.includes(mode) && c.id !== "help" && !seen.has(c.syntax) && (seen.add(c.syntax), true)).map(c => c.syntax); };
