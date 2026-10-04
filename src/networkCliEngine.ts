// Phase 18C — networkCli@1: the deterministic educational MANAGED-SWITCH CLI engine. Pure (no React, no DOM, no I/O, no timers):
// compiled into the shared server build so the student terminal, the teacher preview, the draft-answer ingest and the
// authoritative grader execute the SAME closed grammar and derive the SAME canonical state.
//
// This is a teaching simulator with a Cisco-style command FEEL — it is not a network operating system, not a shell and not
// an emulator. Student input is only ever matched against the closed command table below: an unmatched line is reported as
// unknown / unsupported and can never change state. Nothing here evaluates, spawns, opens, fetches or forwards anything;
// characters such as `;`, `|`, `&&`, backticks, `$()` and redirections are ordinary text that simply fails to match.
//
// Two layers are deliberately distinct:
//   • the SESSION (mode + selected interface / VLAN) — presentation / navigation state, rebuilt by replaying the command history;
//   • the canonical DEVICE STATE (hostname, VLAN database, interface configuration) — the versioned answer artefact that is
//     graded. It is SPARSE: only values that differ from the device defaults are stored, so equivalent command sequences
//     produce byte-identical serializations (canonicalizeState / serializeState).
// Semantics are aligned with the Learning Reader CLI (src/learning/cli, Batch 8–10) for the shared V1 subset — prompts,
// canonical interface names, IPv4 / mask / VLAN rules — but the exam engine is its own frozen module: the Reader's grammar
// evolves with the course content (routing, ACL, DHCP …), while a published exam must keep networkCli@1 semantics forever.

export const NETWORK_CLI_STATE_VERSION = 1 as const;
export type NetworkCliMode = "user" | "privileged" | "global" | "interface" | "vlan";
export const NETWORK_CLI_MODES: readonly NetworkCliMode[] = Object.freeze(["user", "privileged", "global", "interface", "vlan"]);
export const NETWORK_CLI_MODE_SUFFIX: Readonly<Record<NetworkCliMode, string>> = Object.freeze({ user: ">", privileged: "#", global: "(config)#", interface: "(config-if)#", vlan: "(config-vlan)#" });
export const NETWORK_CLI_MODE_LABEL: Readonly<Record<NetworkCliMode, string>> = Object.freeze({ user: "وضع المستخدم (User EXEC)", privileged: "الوضع المتقدّم (Privileged EXEC)", global: "وضع الإعداد العام (Global configuration)", interface: "وضع إعداد الواجهة (Interface configuration)", vlan: "وضع إعداد VLAN (VLAN configuration)" });
/** Hard bounds — enforced by the engine on every line (client AND server) and by the replay / ingest on the history. */
export const NETWORK_CLI_LIMITS = Object.freeze({ inputChars: 200, tokens: 24, commands: 300, hostnameChars: 63, vlanNameChars: 32 });

export type NetworkCliSwitchportMode = "access" | "trunk";
/** Per-interface configuration. Every field is optional: an absent field means the device default (see interfaceDefaults). */
export type NetworkCliInterfaceConfig = { mode?: NetworkCliSwitchportMode; accessVlan?: number; nativeVlan?: number; shutdown?: boolean; ipAddress?: string; subnetMask?: string };
export type NetworkCliVlanEntry = { name?: string };
/** The canonical, versioned CONFIGURATION state of the device (the graded artefact). VLAN 1 is implicit and never stored. */
export type NetworkCliDeviceState = { v: typeof NETWORK_CLI_STATE_VERSION; device: "switch"; hostname: string; vlans: Record<string, NetworkCliVlanEntry>; interfaces: Record<string, NetworkCliInterfaceConfig> };
/** The terminal session: canonical state + navigation (mode, selections). Immutable: every operation returns a new object. */
export type NetworkCliSession = { state: NetworkCliDeviceState; mode: NetworkCliMode; selectedInterface?: string; selectedVlan?: number };

// ── device model ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** The fixed port inventory of the educational switch (24 FastEthernet + 2 GigabitEthernet), canonical short names in order. */
export const SWITCH_PORTS: readonly string[] = Object.freeze([...Array.from({ length: 24 }, (_, i) => "f0/" + (i + 1)), "g0/1", "g0/2"]);
const PORT_INDEX = new Map(SWITCH_PORTS.map((p, i) => [p, i]));
export const DEFAULT_HOSTNAME = "Switch";
export const isPhysicalPort = (name: string): boolean => PORT_INDEX.has(name);
export const isSviName = (name: string): boolean => /^vlan\d{1,4}$/.test(name) && parseVlanId(name.slice(4), { allowOne: true, allowReserved: false }) !== null;
/** Device defaults per interface kind: ports and new SVIs are up; the management SVI Vlan1 is administratively down. */
export const interfaceDefaults = (name: string): Required<Pick<NetworkCliInterfaceConfig, "accessVlan" | "nativeVlan" | "shutdown">> => ({ accessVlan: 1, nativeVlan: 1, shutdown: name === "vlan1" });
/** The EFFECTIVE configuration of an interface (stored values over the device defaults). */
export function effectiveInterfaceConfig(state: NetworkCliDeviceState, name: string): NetworkCliInterfaceConfig & Required<Pick<NetworkCliInterfaceConfig, "accessVlan" | "nativeVlan" | "shutdown">> {
  const stored = state.interfaces[name] ?? {};
  const d = interfaceDefaults(name);
  const out: NetworkCliInterfaceConfig & Required<Pick<NetworkCliInterfaceConfig, "accessVlan" | "nativeVlan" | "shutdown">> = { accessVlan: stored.accessVlan ?? d.accessVlan, nativeVlan: stored.nativeVlan ?? d.nativeVlan, shutdown: stored.shutdown ?? d.shutdown };
  if (stored.mode !== undefined) out.mode = stored.mode;
  if (stored.ipAddress !== undefined) out.ipAddress = stored.ipAddress;
  if (stored.subnetMask !== undefined) out.subnetMask = stored.subnetMask;
  return out;
}

// ── value grammar (pure regular-expression checks; nothing is evaluated) ───────────────────────────────────────────────
const OCTET_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
/** Dotted quad: four decimal octets 0–255, no leading zeros, no signs, no spaces. */
export function isIpv4(raw: string): boolean {
  const m = OCTET_RE.exec(raw);
  return !!m && m.slice(1).every(o => Number(o) <= 255 && !(o.length > 1 && o.startsWith("0")));
}
const maskBits = (mask: string) => mask.split(".").map(o => Number(o).toString(2).padStart(8, "0")).join("");
/** A contiguous subnet mask (ones then zeros), neither 0.0.0.0 nor 255.255.255.255 (a host mask is not an interface mask). */
export function isSubnetMask(raw: string): boolean {
  if (!isIpv4(raw)) return false;
  const bits = maskBits(raw);
  return /^1*0*$/.test(bits) && bits !== "0".repeat(32) && bits !== "1".repeat(32);
}
export const prefixLength = (mask: string): number => maskBits(mask).split("1").length - 1;
const RESERVED_VLANS = Object.freeze([1002, 1003, 1004, 1005]);
/** A VLAN id 1–4094 as a plain decimal (no signs, no leading zeros, no exponent); reserved 1002–1005 refused unless allowed. */
export function parseVlanId(raw: string, options: { allowOne?: boolean; allowReserved?: boolean } = {}): number | null {
  if (!/^(?:[1-9]\d{0,3})$/.test(raw)) return null;
  const n = Number(raw);
  if (n < 1 || n > 4094) return null;
  if (n === 1 && options.allowOne === false) return null;
  if (!options.allowReserved && RESERVED_VLANS.includes(n)) return null;
  return n;
}
export const isReservedVlan = (id: number): boolean => RESERVED_VLANS.includes(id);
/** IOS-like hostname: starts with a letter, letters / digits / `-` / `_`, ends with a letter or digit, 1–63 characters. */
export const isValidHostname = (raw: string): boolean => raw.length <= NETWORK_CLI_LIMITS.hostnameChars && /^[A-Za-z](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/.test(raw);
/** VLAN name: one word, letters / digits / `_` / `-` / `.`, starts with a letter or digit, 1–32 characters. */
export const isValidVlanName = (raw: string): boolean => raw.length > 0 && raw.length <= NETWORK_CLI_LIMITS.vlanNameChars && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(raw);

const IF_RE = /^(fastethernet|fa|f|gigabitethernet|gigabit|gig|gi|g)(\d{1,2})\/(\d{1,3})$/i;
const PREFIX: Record<string, string> = { fastethernet: "f", fa: "f", f: "f", gigabitethernet: "g", gigabit: "g", gig: "g", gi: "g", g: "g" };
/**
 * Canonical short interface name on THIS device: "FastEthernet0/5" | "fa 0/5" | "f0/5" → "f0/5"; "GigabitEthernet 0/1" → "g0/1";
 * "vlan 10" → "vlan10". Null for anything that is not an interface of the educational switch (ranges, sub-interfaces,
 * other slots, ports outside the inventory, leading zeros). Tokens may be joined without spaces first.
 */
export function normalizeInterfaceName(raw: string): string | null {
  const s = raw.replace(/\s+/g, "");
  const svi = /^vlan(\d{1,4})$/i.exec(s);
  if (svi) { const id = parseVlanId(svi[1], { allowOne: true, allowReserved: false }); return id === null ? null : "vlan" + id; }
  const m = IF_RE.exec(s);
  if (!m) return null;
  if (/^0\d/.test(m[2]) || /^0\d/.test(m[3])) return null;
  const canon = PREFIX[m[1].toLowerCase()] + m[2] + "/" + m[3];
  return PORT_INDEX.has(canon) ? canon : null;
}
/** The long display name of a canonical interface ("f0/5" → "FastEthernet0/5", "vlan10" → "Vlan10"). */
export const displayInterfaceName = (canon: string): string => canon.replace(/^f/, "FastEthernet").replace(/^g/, "GigabitEthernet").replace(/^vlan/, "Vlan");
/** The short display name used in VLAN / trunk tables ("f0/5" → "Fa0/5", "g0/1" → "Gi0/1"). */
export const shortInterfaceName = (canon: string): string => canon.replace(/^f/, "Fa").replace(/^g/, "Gi").replace(/^vlan/, "Vl");
const interfaceOrder = (name: string): number => PORT_INDEX.has(name) ? PORT_INDEX.get(name)! : 1000 + Number(name.slice(4));
export const sortInterfaceNames = (names: readonly string[]): string[] => [...names].sort((a, b) => interfaceOrder(a) - interfaceOrder(b));

// ── canonical state ───────────────────────────────────────────────────────────────────────────────────────────────────
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const ownKeys = (o: Record<string, unknown>): string[] => Object.keys(o).filter(k => !FORBIDDEN_KEYS.has(k));

/** Builds a canonical interface record: only values that differ from the interface defaults, in a fixed key order. */
function canonicalInterface(name: string, cfg: NetworkCliInterfaceConfig): NetworkCliInterfaceConfig | undefined {
  const d = interfaceDefaults(name);
  const out: NetworkCliInterfaceConfig = {};
  if (cfg.mode === "access" || cfg.mode === "trunk") out.mode = cfg.mode;
  if (typeof cfg.accessVlan === "number" && cfg.accessVlan !== d.accessVlan) out.accessVlan = cfg.accessVlan;
  if (typeof cfg.nativeVlan === "number" && cfg.nativeVlan !== d.nativeVlan) out.nativeVlan = cfg.nativeVlan;
  if (typeof cfg.shutdown === "boolean" && cfg.shutdown !== d.shutdown) out.shutdown = cfg.shutdown;
  if (typeof cfg.ipAddress === "string" && typeof cfg.subnetMask === "string") { out.ipAddress = cfg.ipAddress; out.subnetMask = cfg.subnetMask; }
  // A physical port and Vlan1 always exist (an all-default record is dropped); any other SVI exists only once it was created,
  // so its record is kept even when empty — `interface vlan 20` IS configuration on a real device.
  return Object.keys(out).length || (isSviName(name) && name !== "vlan1") ? out : undefined;
}
/** True when the interface exists on the device: every inventory port and Vlan1 always; another SVI once it was created. */
export const interfaceExists = (state: NetworkCliDeviceState, name: string): boolean => isPhysicalPort(name) || name === "vlan1" || Object.prototype.hasOwnProperty.call(state.interfaces, name);
/** The canonical form of a state: VLAN 1 dropped, VLANs by id, interfaces in inventory order, default values removed. */
export function canonicalizeState(state: NetworkCliDeviceState): NetworkCliDeviceState {
  const vlans: Record<string, NetworkCliVlanEntry> = {};
  for (const id of ownKeys(state.vlans).map(Number).filter(n => Number.isInteger(n) && n > 1).sort((a, b) => a - b)) {
    const v = state.vlans[String(id)];
    vlans[String(id)] = v && typeof v.name === "string" && v.name !== "" ? { name: v.name } : {};
  }
  const interfaces: Record<string, NetworkCliInterfaceConfig> = {};
  for (const name of sortInterfaceNames(ownKeys(state.interfaces))) {
    const c = canonicalInterface(name, state.interfaces[name] ?? {});
    if (c) interfaces[name] = c;
  }
  return { v: NETWORK_CLI_STATE_VERSION, device: "switch", hostname: state.hostname, vlans, interfaces };
}
/** Deterministic JSON of the canonical state (stable ordering: equivalent configurations serialize identically). */
export const serializeState = (state: NetworkCliDeviceState): string => JSON.stringify(canonicalizeState(state));

/** A device state from a (partial) description; unknown or malformed parts are IGNORED here (use normalizeDeviceState to refuse). */
export function createDeviceState(partial: { hostname?: string; vlans?: Record<string, NetworkCliVlanEntry>; interfaces?: Record<string, NetworkCliInterfaceConfig> } = {}): NetworkCliDeviceState {
  return canonicalizeState({ v: NETWORK_CLI_STATE_VERSION, device: "switch", hostname: partial.hostname && isValidHostname(partial.hostname) ? partial.hostname : DEFAULT_HOSTNAME, vlans: partial.vlans ?? {}, interfaces: partial.interfaces ?? {} });
}
export const createSession = (state: NetworkCliDeviceState): NetworkCliSession => ({ state: canonicalizeState(state), mode: "user" });
export const promptFor = (session: Pick<NetworkCliSession, "state" | "mode">): string => session.state.hostname + NETWORK_CLI_MODE_SUFFIX[session.mode];

export type NormalizeStateResult = { ok: true; state: NetworkCliDeviceState } | { ok: false; code: "NETCLI_STATE_INVALID"; detail: string };
const INTERFACE_FIELDS = new Set(["mode", "accessVlan", "nativeVlan", "shutdown", "ipAddress", "subnetMask"]);
/**
 * Strict ingest of an UNTRUSTED state object (server draft / submit, imported JSON): exactly the versioned shape, every value in
 * range, physical-port / SVI field rules, no extra keys, no prototype-sensitive keys anywhere. Returns the canonical state or a
 * refusal — never a partially repaired state.
 */
export function normalizeDeviceState(raw: unknown): NormalizeStateResult {
  const fail = (detail: string): NormalizeStateResult => ({ ok: false, code: "NETCLI_STATE_INVALID", detail });
  if (!isObj(raw)) return fail("not an object");
  const keys = Object.keys(raw);
  if (keys.some(k => FORBIDDEN_KEYS.has(k))) return fail("forbidden key");
  if (keys.some(k => !["v", "device", "hostname", "vlans", "interfaces"].includes(k))) return fail("unknown key");
  if (raw.v !== NETWORK_CLI_STATE_VERSION) return fail("unsupported state version");
  if (raw.device !== "switch") return fail("unsupported device");
  if (typeof raw.hostname !== "string" || !isValidHostname(raw.hostname)) return fail("hostname");
  if (!isObj(raw.vlans) || !isObj(raw.interfaces)) return fail("shape");
  const vlans: Record<string, NetworkCliVlanEntry> = {};
  for (const k of Object.keys(raw.vlans)) {
    const id = parseVlanId(k, { allowOne: false, allowReserved: false });
    if (id === null) return fail("vlan id " + k);
    const v = raw.vlans[k];
    if (!isObj(v) || Object.keys(v).some(x => x !== "name")) return fail("vlan entry " + k);
    if (v.name !== undefined && (typeof v.name !== "string" || !isValidVlanName(v.name))) return fail("vlan name " + k);
    vlans[String(id)] = v.name === undefined ? {} : { name: v.name };
  }
  const interfaces: Record<string, NetworkCliInterfaceConfig> = {};
  for (const k of Object.keys(raw.interfaces)) {
    if (FORBIDDEN_KEYS.has(k) || !(isPhysicalPort(k) || isSviName(k))) return fail("interface " + k);
    const c = raw.interfaces[k];
    if (!isObj(c) || Object.keys(c).some(f => !INTERFACE_FIELDS.has(f))) return fail("interface fields " + k);
    const physical = isPhysicalPort(k);
    const out: NetworkCliInterfaceConfig = {};
    if (c.mode !== undefined) { if (!physical || (c.mode !== "access" && c.mode !== "trunk")) return fail("mode " + k); out.mode = c.mode; }
    for (const f of ["accessVlan", "nativeVlan"] as const) {
      if (c[f] === undefined) continue;
      if (!physical || typeof c[f] !== "number" || parseVlanId(String(c[f]), { allowOne: true, allowReserved: false }) === null) return fail(f + " " + k);
      out[f] = c[f] as number;
    }
    if (c.shutdown !== undefined) { if (typeof c.shutdown !== "boolean") return fail("shutdown " + k); out.shutdown = c.shutdown; }
    if (c.ipAddress !== undefined || c.subnetMask !== undefined) {
      if (physical || typeof c.ipAddress !== "string" || typeof c.subnetMask !== "string" || !isIpv4(c.ipAddress) || !isSubnetMask(c.subnetMask) || !isUsableHostAddress(c.ipAddress, c.subnetMask)) return fail("address " + k);
      out.ipAddress = c.ipAddress; out.subnetMask = c.subnetMask;
    }
    interfaces[k] = out;
  }
  return { ok: true, state: canonicalizeState({ v: NETWORK_CLI_STATE_VERSION, device: "switch", hostname: raw.hostname, vlans, interfaces }) };
}
/** A unicast host address inside its subnet: first octet 1–223 (not 127), not the network or the broadcast address. */
export function isUsableHostAddress(address: string, mask: string): boolean {
  if (!isIpv4(address) || !isSubnetMask(mask)) return false;
  const first = Number(address.split(".")[0]);
  if (first === 0 || first === 127 || first >= 224) return false;
  const a = address.split(".").map(Number), m = mask.split(".").map(Number);
  const plen = prefixLength(mask);
  if (plen >= 31) return true;
  const host = a.map((o, i) => o & (~m[i] & 255));
  const hostBits = host.join(".");
  const broadcast = m.map(o => ~o & 255).join(".");
  return hostBits !== "0.0.0.0" && hostBits !== broadcast;
}

// ── the closed command grammar ────────────────────────────────────────────────────────────────────────────────────────
type ParsedCommand =
  | { id: "help" } | { id: "enable" } | { id: "disable" } | { id: "configure-terminal" } | { id: "exit" } | { id: "end" }
  | { id: "hostname"; name: string } | { id: "interface"; name: string } | { id: "vlan"; vlanId: number } | { id: "name"; name: string }
  | { id: "switchport-mode"; mode: NetworkCliSwitchportMode } | { id: "switchport-access-vlan"; vlanId: number } | { id: "switchport-trunk-native-vlan"; vlanId: number }
  | { id: "ip-address"; address: string; mask: string } | { id: "shutdown" } | { id: "no-shutdown" }
  | { id: "show"; what: "running-config" | "vlan-brief" | "interfaces-trunk" | "ip-interface-brief" };
export type NetworkCliCommandId = ParsedCommand["id"];
type ArgResult = ParsedCommand | { incomplete: string } | { invalid: string };
type CommandSpec = { id: NetworkCliCommandId; keywords: readonly (readonly string[])[]; modes: readonly NetworkCliMode[]; syntax: string; args: (rest: string[]) => ArgResult };

const CONFIG_MODES: readonly NetworkCliMode[] = ["global", "interface", "vlan"];
const NOT_USER: readonly NetworkCliMode[] = ["privileged", ...CONFIG_MODES];
const ALL: readonly NetworkCliMode[] = ["user", ...NOT_USER];
const none = (id: NetworkCliCommandId) => (rest: string[]): ArgResult => (rest.length ? { invalid: "this command takes no further values" } : ({ id } as ParsedCommand));
const oneVlan = (id: "vlan" | "switchport-access-vlan" | "switchport-trunk-native-vlan") => (rest: string[]): ArgResult => {
  if (rest.length === 0) return { incomplete: "a VLAN id (1-4094) is required" };
  if (rest.length > 1) return { invalid: "unexpected values after the VLAN id" };
  const v = parseVlanId(rest[0], { allowOne: true, allowReserved: true });
  if (v === null) return { invalid: "VLAN id must be a number between 1 and 4094: " + rest[0] };
  if (isReservedVlan(v)) return { invalid: "VLAN " + v + " is a reserved VLAN" };
  return { id, vlanId: v };
};
const showOf = (what: Extract<ParsedCommand, { id: "show" }>["what"]) => (rest: string[]): ArgResult => (rest.length ? { invalid: "unexpected values: " + rest.join(" ") } : { id: "show", what });

export const COMMAND_TABLE: readonly CommandSpec[] = Object.freeze([
  { id: "help", keywords: [["?"], ["help"]], modes: ALL, syntax: "?", args: none("help") },
  { id: "enable", keywords: [["enable"], ["en"]], modes: ["user", "privileged"], syntax: "enable", args: none("enable") },
  { id: "disable", keywords: [["disable"]], modes: ["privileged"], syntax: "disable", args: none("disable") },
  { id: "configure-terminal", keywords: [["configure", "terminal"], ["configure", "t"], ["config", "terminal"], ["config", "t"], ["conf", "terminal"], ["conf", "term"], ["conf", "t"]], modes: ["privileged"], syntax: "configure terminal", args: none("configure-terminal") },
  { id: "end", keywords: [["end"]], modes: ALL, syntax: "end", args: none("end") },
  { id: "exit", keywords: [["exit"]], modes: ALL, syntax: "exit", args: none("exit") },
  {
    id: "hostname", keywords: [["hostname"]], modes: ["global"], syntax: "hostname <name>",
    args: rest => {
      if (rest.length === 0) return { incomplete: "a device name is required" };
      if (rest.length > 1) return { invalid: "the hostname must be one word" };
      if (rest[0].length > NETWORK_CLI_LIMITS.hostnameChars) return { invalid: "hostname too long (max " + NETWORK_CLI_LIMITS.hostnameChars + " characters)" };
      return isValidHostname(rest[0]) ? { id: "hostname", name: rest[0] } : { invalid: "hostname contains one or more illegal characters" };
    }
  },
  {
    id: "interface", keywords: [["interface"], ["int"]], modes: ["global", "interface", "vlan"], syntax: "interface <FastEthernet0/1-24 | GigabitEthernet0/1-2 | vlan <id>>",
    args: rest => {
      if (rest.length === 0) return { incomplete: "an interface name is required (e.g. fastEthernet 0/1, gigabitEthernet 0/1, vlan 10)" };
      const joined = rest.join("");
      const name = normalizeInterfaceName(joined);
      return name ? { id: "interface", name } : { invalid: "invalid interface: " + rest.join(" ") + " does not exist on this device" };
    }
  },
  { id: "vlan", keywords: [["vlan"]], modes: ["global", "vlan"], syntax: "vlan <id>", args: oneVlan("vlan") },
  {
    id: "name", keywords: [["name"]], modes: ["vlan"], syntax: "name <vlan-name>",
    args: rest => {
      if (rest.length === 0) return { incomplete: "a VLAN name is required" };
      if (rest.length > 1) return { invalid: "the VLAN name must be one word" };
      return isValidVlanName(rest[0]) ? { id: "name", name: rest[0] } : { invalid: "invalid VLAN name (letters, digits, _ - . ; max " + NETWORK_CLI_LIMITS.vlanNameChars + "): " + rest[0] };
    }
  },
  {
    id: "switchport-mode", keywords: [["switchport", "mode"]], modes: ["interface"], syntax: "switchport mode access | trunk",
    args: rest => {
      if (rest.length === 0) return { incomplete: "access or trunk is required" };
      const m = rest[0].toLowerCase();
      if (rest.length > 1 || (m !== "access" && m !== "trunk")) return { invalid: "the mode must be access or trunk" };
      return { id: "switchport-mode", mode: m };
    }
  },
  { id: "switchport-access-vlan", keywords: [["switchport", "access", "vlan"]], modes: ["interface"], syntax: "switchport access vlan <id>", args: oneVlan("switchport-access-vlan") },
  { id: "switchport-trunk-native-vlan", keywords: [["switchport", "trunk", "native", "vlan"]], modes: ["interface"], syntax: "switchport trunk native vlan <id>", args: oneVlan("switchport-trunk-native-vlan") },
  {
    id: "ip-address", keywords: [["ip", "address"], ["ip", "addr"]], modes: ["interface"], syntax: "ip address <ipv4-address> <subnet-mask>",
    args: rest => {
      if (rest.length < 2) return { incomplete: "an IPv4 address and a subnet mask are required" };
      if (rest.length > 2) return { invalid: "unexpected values after the mask" };
      if (!isIpv4(rest[0])) return { invalid: "invalid IPv4 address: " + rest[0] };
      if (!isSubnetMask(rest[1])) return { invalid: "bad mask: " + rest[1] };
      if (!isUsableHostAddress(rest[0], rest[1])) return { invalid: "bad mask " + rest[1] + " for address " + rest[0] + " (network, broadcast or reserved address)" };
      return { id: "ip-address", address: rest[0], mask: rest[1] };
    }
  },
  { id: "no-shutdown", keywords: [["no", "shutdown"], ["no", "shut"]], modes: ["interface"], syntax: "no shutdown", args: none("no-shutdown") },
  { id: "shutdown", keywords: [["shutdown"], ["shut"]], modes: ["interface"], syntax: "shutdown", args: none("shutdown") },
  { id: "show", keywords: [["show", "running-config"], ["show", "run"]], modes: NOT_USER, syntax: "show running-config", args: showOf("running-config") },
  { id: "show", keywords: [["show", "vlan", "brief"], ["show", "vlan"]], modes: ALL, syntax: "show vlan brief", args: showOf("vlan-brief") },
  { id: "show", keywords: [["show", "interfaces", "trunk"], ["show", "interface", "trunk"], ["show", "int", "trunk"]], modes: ALL, syntax: "show interfaces trunk", args: showOf("interfaces-trunk") },
  { id: "show", keywords: [["show", "ip", "interface", "brief"], ["show", "ip", "int", "brief"], ["show", "ip", "int", "br"]], modes: ALL, syntax: "show ip interface brief", args: showOf("ip-interface-brief") }
]);

/** Recognised but deliberately UNSUPPORTED families (V1): named so the student gets an explicit refusal instead of a generic one. */
const NOT_SUPPORTED: readonly { match: (t: string[]) => boolean; text: string; hint: string }[] = Object.freeze([
  { match: t => (t[0] === "interface" || t[0] === "int") && t[1] === "range", text: "interface range is not supported in this simulator (v1)", hint: "اختر واجهة واحدة في كل مرة: interface fastEthernet 0/1" },
  { match: t => t[0] === "switchport" && t[1] === "trunk" && t[2] === "allowed", text: "switchport trunk allowed vlan is not supported in this simulator (v1)", hint: "هذا المحاكي يدعم switchport mode trunk و switchport trunk native vlan فقط" },
  { match: t => t[0] === "no" && !(t[1] === "shutdown" || t[1] === "shut"), text: "the 'no' form of this command is not supported in this simulator (v1)", hint: "يدعم المحاكي no shutdown فقط؛ لإلغاء إعداد آخر أعد ضبطه بالقيمة المطلوبة" },
  { match: t => t[0] === "write" || t[0] === "wr" || t[0] === "copy", text: "saving to startup-config is not simulated (v1); the running configuration is what counts", hint: "لا حاجة للحفظ: الإعداد الجاري (running-config) هو ما يُقيَّم" },
  { match: t => t[0] === "ping" || t[0] === "traceroute" || t[0] === "telnet" || t[0] === "ssh", text: "network reachability is not simulated (v1)", hint: "هذا محاكي إعداد لجهاز واحد؛ لا يُحاكي إرسال الحزم" },
  { match: t => t[0] === "reload" || t[0] === "erase" || t[0] === "delete" || t[0] === "debug", text: "this command is not supported in this simulator (v1)", hint: "الأمر غير مدعوم في هذا المحاكي التعليمي" }
]);

export type NetworkCliParseResult =
  | { kind: "empty" } | { kind: "refused"; detail: string } | { kind: "unknown" } | { kind: "not-supported"; detail: string; hint: string }
  | { kind: "incomplete"; id: NetworkCliCommandId; detail: string; syntax: string } | { kind: "invalid"; id: NetworkCliCommandId; detail: string; syntax: string }
  | { kind: "ok"; command: ParsedCommand; spec: CommandSpec; viaDo: boolean };

const tokenize = (raw: unknown): string[] => (typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "").split(" ").filter(Boolean);
const startsWith = (tokens: string[], seq: readonly string[]) => seq.length <= tokens.length && seq.every((k, i) => tokens[i].toLowerCase() === k);

/** Parses ONE input line against the closed grammar (the mode is checked by executeCommand). Never throws on any input. */
export function parseCommand(raw: unknown): NetworkCliParseResult {
  if (typeof raw !== "string") return { kind: "empty" };
  if (raw.length > NETWORK_CLI_LIMITS.inputChars) return { kind: "refused", detail: "line too long (max " + NETWORK_CLI_LIMITS.inputChars + " characters)" };
  let tokens = tokenize(raw);
  if (tokens.length === 0) return { kind: "empty" };
  if (tokens.length > NETWORK_CLI_LIMITS.tokens) return { kind: "refused", detail: "too many words in one command (max " + NETWORK_CLI_LIMITS.tokens + ")" };
  let viaDo = false;
  if (tokens[0].toLowerCase() === "do" && tokens.length > 1) { viaDo = true; tokens = tokens.slice(1); }
  const lower = tokens.map(t => t.toLowerCase());
  for (const ns of NOT_SUPPORTED) if (ns.match(lower)) return { kind: "not-supported", detail: ns.text, hint: ns.hint };
  for (const spec of COMMAND_TABLE) {
    for (const seq of spec.keywords) {
      if (!startsWith(tokens, seq)) continue;
      if (viaDo && spec.id !== "show") return { kind: "unknown" };
      const r = spec.args(tokens.slice(seq.length));
      if ("incomplete" in r) return { kind: "incomplete", id: spec.id, detail: r.incomplete, syntax: spec.syntax };
      if ("invalid" in r) return { kind: "invalid", id: spec.id, detail: r.invalid, syntax: spec.syntax };
      return { kind: "ok", command: r, spec, viaDo };
    }
  }
  for (const spec of COMMAND_TABLE) for (const seq of spec.keywords) if (tokens.length < seq.length && lower.every((t, i) => t === seq[i])) return { kind: "incomplete", id: spec.id, detail: "incomplete command", syntax: spec.syntax };
  return { kind: "unknown" };
}

// ── execution ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export type NetworkCliExecStatus = "empty" | "refused" | "unknown" | "not-supported" | "incomplete" | "invalid" | "wrong-mode" | "ok";
/** One executed line: device-style output lines (ASCII, LTR) plus an optional Arabic educational hint. `changed` says whether the canonical state moved. */
export type NetworkCliExecResult = { status: NetworkCliExecStatus; output: string[]; hint?: string; changed: boolean };

const EXIT_TO: Record<NetworkCliMode, NetworkCliMode> = { user: "user", privileged: "user", global: "privileged", interface: "global", vlan: "global" };
const unselect = (s: NetworkCliSession): NetworkCliSession => ({ state: s.state, mode: s.mode });
const modeList = (modes: readonly NetworkCliMode[]) => modes.map(m => NETWORK_CLI_MODE_LABEL[m]).join(" أو ");
const MODE_HOWTO: Record<NetworkCliMode, string> = { user: "اكتب disable للعودة إلى وضع المستخدم", privileged: "اكتب enable أولًا", global: "اكتب enable ثم configure terminal", interface: "ادخل إلى واجهة أولًا: interface fastEthernet 0/1", vlan: "ادخل إلى VLAN أولًا: vlan 10" };

function helpLines(mode: NetworkCliMode): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const c of COMMAND_TABLE) if (c.modes.includes(mode) && c.id !== "help" && !seen.has(c.syntax)) { seen.add(c.syntax); out.push("  " + c.syntax); }
  return out;
}
function withInterface(s: NetworkCliSession, f: (cfg: NetworkCliInterfaceConfig) => NetworkCliInterfaceConfig): NetworkCliSession {
  const name = s.selectedInterface!;
  const next = f({ ...(s.state.interfaces[name] ?? {}) });
  return { ...s, state: canonicalizeState({ ...s.state, interfaces: { ...s.state.interfaces, [name]: next } }) };
}
const result = (status: NetworkCliExecStatus, output: string[], hint?: string, changed = false): NetworkCliExecResult => (hint === undefined ? { status, output, changed } : { status, output, hint, changed });

/**
 * Executes ONE input line: parse → mode check → apply. Returns a NEW session when (and only when) an accepted command changed
 * something; every refusal returns the SAME session object untouched. Never throws on any input.
 */
export function executeCommand(session: NetworkCliSession, raw: unknown): { session: NetworkCliSession; result: NetworkCliExecResult } {
  const p = parseCommand(raw);
  switch (p.kind) {
    case "empty": return { session, result: result("empty", []) };
    case "refused": return { session, result: result("refused", ["% " + p.detail[0].toUpperCase() + p.detail.slice(1) + "."], "تجاوز السطر الحدود المسموحة ولم يُنفَّذ.") };
    case "unknown": return { session, result: result("unknown", ["% Invalid input detected."], "أمر غير معروف في هذا المحاكي. اكتب ? لعرض أوامر الوضع الحالي.") };
    case "not-supported": return { session, result: result("not-supported", ["% " + p.detail[0].toUpperCase() + p.detail.slice(1) + "."], p.hint) };
    case "incomplete": return { session, result: result("incomplete", ["% Incomplete command."], "الصيغة: " + p.syntax + " — " + p.detail) };
    case "invalid": return { session, result: result("invalid", ["% " + p.detail[0].toUpperCase() + p.detail.slice(1) + "."], "الصيغة: " + p.syntax) };
    case "ok": break;
  }
  const { command, spec, viaDo } = p;
  if (viaDo && !CONFIG_MODES.includes(session.mode)) return { session, result: result("wrong-mode", ["% 'do' is only available in configuration modes."], "اكتب أمر العرض مباشرة في هذا الوضع.") };
  if (!spec.modes.includes(session.mode)) {
    const target = spec.modes[0];
    return { session, result: result("wrong-mode", ["% This command is not available in " + modeEnglish(session.mode) + "."], "هذا الأمر يعمل في " + modeList(spec.modes) + ". " + MODE_HOWTO[target]) };
  }
  return apply(session, command);
}
const modeEnglish = (m: NetworkCliMode) => ({ user: "user EXEC mode", privileged: "privileged EXEC mode", global: "global configuration mode", interface: "interface configuration mode", vlan: "VLAN configuration mode" })[m];

function apply(s: NetworkCliSession, cmd: ParsedCommand): { session: NetworkCliSession; result: NetworkCliExecResult } {
  const ok = (session: NetworkCliSession, output: string[] = [], hint?: string): { session: NetworkCliSession; result: NetworkCliExecResult } => ({ session, result: result("ok", output, hint, serializeState(session.state) !== serializeState(s.state)) });
  const rejected = (text: string, hint: string) => ({ session: s, result: result("invalid", ["% " + text], hint) });
  switch (cmd.id) {
    case "help": return ok(s, helpLines(s.mode));
    case "enable": return ok(s.mode === "privileged" ? s : { ...unselect(s), mode: "privileged" });
    case "disable": return ok({ ...unselect(s), mode: "user" });
    case "configure-terminal": return ok({ ...unselect(s), mode: "global" }, ["Enter configuration commands, one per line.  End with CNTL/Z."]);
    case "end": return ok(s.mode === "user" || s.mode === "privileged" ? s : { ...unselect(s), mode: "privileged" });
    case "exit": return ok(s.mode === "user" ? s : { ...unselect(s), mode: EXIT_TO[s.mode] });
    case "hostname": return ok({ ...s, state: canonicalizeState({ ...s.state, hostname: cmd.name }) });
    case "interface": {
      // entering an SVI (other than Vlan1) creates it on the device; ports and Vlan1 always exist
      const interfaces = isSviName(cmd.name) && cmd.name !== "vlan1" && !s.state.interfaces[cmd.name] ? { ...s.state.interfaces, [cmd.name]: {} } : s.state.interfaces;
      return ok({ ...unselect(s), mode: "interface", selectedInterface: cmd.name, state: canonicalizeState({ ...s.state, interfaces }) });
    }
    case "vlan": {
      if (cmd.vlanId === 1) return ok({ ...unselect(s), mode: "vlan", selectedVlan: 1 });
      const key = String(cmd.vlanId);
      const vlans = s.state.vlans[key] ? s.state.vlans : { ...s.state.vlans, [key]: {} };
      return ok({ ...unselect(s), mode: "vlan", selectedVlan: cmd.vlanId, state: canonicalizeState({ ...s.state, vlans }) });
    }
    case "name": {
      if (s.selectedVlan === undefined) return rejected("No VLAN selected.", "ادخل إلى VLAN أولًا: vlan 10");
      if (s.selectedVlan === 1) return rejected("Default VLAN 1 may not have its name changed.", "لا يمكن إعادة تسمية VLAN 1 الافتراضية؛ اختر VLAN أخرى.");
      const key = String(s.selectedVlan);
      return ok({ ...s, state: canonicalizeState({ ...s.state, vlans: { ...s.state.vlans, [key]: { name: cmd.name } } }) });
    }
    case "switchport-mode": case "switchport-access-vlan": case "switchport-trunk-native-vlan": {
      const name = s.selectedInterface!;
      if (!isPhysicalPort(name)) return rejected("Command rejected: switchport commands apply to physical ports only (" + displayInterfaceName(name) + " is an SVI).", "أوامر switchport تعمل على المنافذ الفعلية فقط (FastEthernet / GigabitEthernet)، لا على interface vlan.");
      if (cmd.id === "switchport-mode") return ok(withInterface(s, c => ({ ...c, mode: cmd.mode })));
      if (cmd.id === "switchport-trunk-native-vlan") return ok(withInterface(s, c => ({ ...c, nativeVlan: cmd.vlanId })));
      const key = String(cmd.vlanId);
      const exists = cmd.vlanId === 1 || !!s.state.vlans[key];
      const next = withInterface(s, c => ({ ...c, accessVlan: cmd.vlanId }));
      if (exists) return ok(next);
      return ok({ ...next, state: canonicalizeState({ ...next.state, vlans: { ...next.state.vlans, [key]: {} } }) }, ["% Access VLAN does not exist. Creating vlan " + cmd.vlanId], "لم تكن VLAN " + cmd.vlanId + " موجودة فأُنشئت تلقائيًا (كما يفعل الجهاز الحقيقي).");
    }
    case "ip-address": {
      const name = s.selectedInterface!;
      if (isPhysicalPort(name)) return rejected("IP addresses may not be configured on L2 links.", "عناوين IP على المبدّل تُضبط على واجهة إدارة: interface vlan <id> ثم ip address.");
      return ok(withInterface(s, c => ({ ...c, ipAddress: cmd.address, subnetMask: cmd.mask })));
    }
    case "shutdown": return ok(withInterface(s, c => ({ ...c, shutdown: true })));
    case "no-shutdown": return ok(withInterface(s, c => ({ ...c, shutdown: false })));
    case "show": return ok(s, showOutput(s.state, cmd.what));
  }
}

/** Replays a bounded command history from an initial state: the ONE way every surface (student terminal, review, server ingest, grader) rebuilds a session. */
export type NetworkCliReplayEntry = { input: string; prompt: string; result: NetworkCliExecResult };
export function replayCommands(initial: NetworkCliDeviceState, commands: readonly unknown[]): { session: NetworkCliSession; entries: NetworkCliReplayEntry[]; truncated: boolean } {
  let session = createSession(initial);
  const entries: NetworkCliReplayEntry[] = [];
  const list = Array.isArray(commands) ? commands : [];
  for (const raw of list.slice(0, NETWORK_CLI_LIMITS.commands)) {
    const input = typeof raw === "string" ? raw : "";
    const prompt = promptFor(session);
    const r = executeCommand(session, input);
    session = r.session;
    entries.push({ input, prompt, result: r.result });
  }
  return { session, entries, truncated: list.length > NETWORK_CLI_LIMITS.commands };
}

// ── show commands: rendered from canonical state only ──────────────────────────────────────────────────────────────────
const pad = (s: string, n: number) => (s.length >= n ? s + " " : s.padEnd(n));
const vlanIds = (state: NetworkCliDeviceState): number[] => [1, ...Object.keys(state.vlans).map(Number)].sort((a, b) => a - b);
const vlanName = (state: NetworkCliDeviceState, id: number): string => id === 1 ? "default" : state.vlans[String(id)]?.name ?? "VLAN" + String(id).padStart(4, "0");
const sviNames = (state: NetworkCliDeviceState): string[] => sortInterfaceNames(["vlan1", ...Object.keys(state.interfaces).filter(isSviName).filter(n => n !== "vlan1")]);

export function showRunningConfig(state: NetworkCliDeviceState): string[] {
  const c = canonicalizeState(state);
  const out = ["Building configuration...", "", "Current configuration:", "!", "hostname " + c.hostname, "!"];
  for (const id of Object.keys(c.vlans)) { out.push("vlan " + id); if (c.vlans[id].name) out.push(" name " + c.vlans[id].name); out.push("!"); }
  for (const name of SWITCH_PORTS) {
    const i = c.interfaces[name] ?? {};
    out.push("interface " + displayInterfaceName(name));
    if (i.accessVlan !== undefined) out.push(" switchport access vlan " + i.accessVlan);
    if (i.nativeVlan !== undefined) out.push(" switchport trunk native vlan " + i.nativeVlan);
    if (i.mode) out.push(" switchport mode " + i.mode);
    if (i.shutdown === true) out.push(" shutdown");
    out.push("!");
  }
  for (const name of sviNames(c)) {
    const e = effectiveInterfaceConfig(c, name);
    out.push("interface " + displayInterfaceName(name));
    out.push(e.ipAddress ? " ip address " + e.ipAddress + " " + e.subnetMask : " no ip address");
    if (e.shutdown) out.push(" shutdown");
    out.push("!");
  }
  out.push("end");
  return out;
}
export function showVlanBrief(state: NetworkCliDeviceState): string[] {
  const c = canonicalizeState(state);
  const out = [pad("VLAN", 5) + pad("Name", 33) + pad("Status", 10) + "Ports", "---- -------------------------------- --------- -------------------------------"];
  for (const id of vlanIds(c)) {
    const ports = SWITCH_PORTS.filter(p => { const e = effectiveInterfaceConfig(c, p); return e.mode !== "trunk" && e.accessVlan === id; }).map(shortInterfaceName);
    const head = pad(String(id), 5) + pad(vlanName(c, id), 33) + pad("active", 10);
    if (ports.length === 0) { out.push(head.trimEnd()); continue; }
    for (let i = 0; i < ports.length; i += 4) out.push((i === 0 ? head : " ".repeat(head.length)) + ports.slice(i, i + 4).join(", "));
  }
  return out;
}
export function showInterfacesTrunk(state: NetworkCliDeviceState): string[] {
  const c = canonicalizeState(state);
  const trunks = SWITCH_PORTS.filter(p => { const e = effectiveInterfaceConfig(c, p); return e.mode === "trunk" && !e.shutdown; });
  if (trunks.length === 0) return [];
  const active = vlanIds(c).join(",");
  const out = [pad("Port", 12) + pad("Mode", 13) + pad("Encapsulation", 15) + pad("Status", 14) + "Native vlan"];
  for (const p of trunks) out.push(pad(shortInterfaceName(p), 12) + pad("on", 13) + pad("802.1q", 15) + pad("trunking", 14) + String(effectiveInterfaceConfig(c, p).nativeVlan));
  out.push("", pad("Port", 12) + "Vlans allowed on trunk");
  for (const p of trunks) out.push(pad(shortInterfaceName(p), 12) + "1-4094");
  out.push("", pad("Port", 12) + "Vlans allowed and active in management domain");
  for (const p of trunks) out.push(pad(shortInterfaceName(p), 12) + active);
  out.push("", pad("Port", 12) + "Vlans in spanning tree forwarding state and not pruned");
  for (const p of trunks) out.push(pad(shortInterfaceName(p), 12) + active);
  return out;
}
export function showIpInterfaceBrief(state: NetworkCliDeviceState): string[] {
  const c = canonicalizeState(state);
  const out = [pad("Interface", 23) + pad("IP-Address", 16) + "OK? Method " + pad("Status", 22) + "Protocol"];
  for (const name of [...SWITCH_PORTS, ...sviNames(c)]) {
    const e = effectiveInterfaceConfig(c, name);
    out.push(pad(displayInterfaceName(name), 23) + pad(e.ipAddress ?? "unassigned", 16) + "YES " + pad(e.ipAddress ? "manual" : "unset", 7) + pad(e.shutdown ? "administratively down" : "up", 22) + (e.shutdown ? "down" : "up"));
  }
  return out;
}
export function showOutput(state: NetworkCliDeviceState, what: Extract<ParsedCommand, { id: "show" }>["what"]): string[] {
  switch (what) {
    case "running-config": return showRunningConfig(state);
    case "vlan-brief": return showVlanBrief(state);
    case "interfaces-trunk": return showInterfacesTrunk(state);
    case "ip-interface-brief": return showIpInterfaceBrief(state);
  }
}
/** The syntax list of every command valid in a mode (for help text / UI affordances). */
export const commandSyntaxFor = (mode: NetworkCliMode): string[] => helpLines(mode).map(l => l.trim());
