// Learning Materials — CLI simulator: DEFENSIVE reading of a block's opaque `config` into a `CliExerciseConfig`.
// The activity block's config is plain data authored in a content module (validated by the content validator only
// as "opaque"); the renderer validates the exercise shape here and refuses anything malformed (→ the block's
// static fallback is shown). Command ids and modes are checked against the closed grammar, and every VALUE an
// expectation or goal pins is checked with the SAME validators the runtime parser uses (IPv4, contiguous masks,
// VLAN 1–4094, interface names, MAC format, Port Security maximum, booleans), so a config can never name a
// command the simulator does not implement, nor a value the learner could never type.
import type { CliCommandId, CliExerciseConfig, CliExpectation, CliExpectedArgs, CliGoal, CliStateCondition, CliStep } from "./types";
import { CLI_DEVICE_TYPES, CLI_EXERCISE_KINDS, CLI_MODES } from "./types";
import { COMMANDS, parseCommand } from "./grammar";
import { isSimpleName, isIpv4, isSubnetMask, normalizeInterfaceName, isCiscoMac, aclEntryText, ospfNetworkText, PORT_SECURITY_MAX, ACL_NUMBER_MAX, ROUTING_ID_MAX, OSPF_AREA_MAX, PORT_MAX } from "./normalize";

const KNOWN_IDS = new Set<string>(COMMANDS.map(c => c.id));
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isMode = (v: unknown): v is CliExerciseConfig["startMode"] => typeof v === "string" && (CLI_MODES as readonly string[]).includes(v);
const isCommandId = (v: unknown): v is CliCommandId => typeof v === "string" && KNOWN_IDS.has(v);
const isVlanId = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4094;
const isVlanList = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.every(isVlanId);
const isIfName = (v: unknown): v is string => isStr(v) && normalizeInterfaceName(v) !== null;
const isIfList = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(isIfName);
const isMax = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= PORT_SECURITY_MAX;
const strList = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter(isStr).slice(0, max) : []);
const intIn = (min: number, max: number) => (v: unknown): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isAclNumber = intIn(1, ACL_NUMBER_MAX);
/** Parse a canonical text with the RUNTIME grammar and accept it only when it round-trips unchanged. */
const roundTrips = (line: string, canonical: (cmd: Extract<ReturnType<typeof parseCommand>, { kind: "ok" }>["command"]) => string | null) => {
  const r = parseCommand(line);
  return r.kind === "ok" && canonical(r.command) === line;
};
/** «<address> <wildcard> area <n>» exactly as the runtime would re-print it. */
const isOspfNetworkText = (v: unknown): boolean => isStr(v) && roundTrips("network " + v, c => (c.id === "network" && c.form === "ospf" ? "network " + ospfNetworkText(c) : null));
/** One ACL entry text («permit host 192.168.1.10», «permit tcp any any eq 80») that the runtime parses back identically. */
const isAclEntryText = (number: number) => (v: unknown): boolean => isStr(v) && roundTrips(`access-list ${number} ` + v, c => (c.id === "access-list" && c.number === number ? `access-list ${number} ` + aclEntryText(c.entry) : null));
/** «<number> in|out» as `ip access-group` prints it. */
const isAccessGroupText = (v: unknown): boolean => isStr(v) && roundTrips("ip access-group " + v, c => (c.id === "ip-access-group" ? "ip access-group " + c.number + " " + c.direction : null));
const isAclAddressText = (v: unknown): boolean => isStr(v) && roundTrips("access-list 1 permit " + v, c => (c.id === "access-list" ? "access-list 1 permit " + c.entry.source : null));
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Value validators per condition kind + prop (the runtime grammar's own rules). */
const IF_PROP: Record<string, (v: unknown) => boolean> = {
  switchportMode: v => v === "access" || v === "trunk",
  accessVlan: isVlanId, encapsulationVlan: isVlanId, allowedVlans: isVlanList,
  ipAddress: v => isStr(v) && isIpv4(v), subnetMask: v => isStr(v) && isSubnetMask(v), shutdown: isBool, accessGroup: isAccessGroupText,
};
const PS_PROP: Record<string, (v: unknown) => boolean> = {
  enabled: isBool, maximum: isMax, macAddress: v => isStr(v) && isCiscoMac(v), sticky: isBool, violation: v => v === "shutdown",
};
const POOL_PROP: Record<string, (v: unknown) => boolean> = {
  network: v => isStr(v) && isIpv4(v), mask: v => isStr(v) && isSubnetMask(v), defaultRouter: v => isStr(v) && isIpv4(v),
  dnsServers: v => Array.isArray(v) && v.length > 0 && v.every(x => isStr(x) && isIpv4(x)),
};
const VTP_PROP: Record<string, (v: unknown) => boolean> = { mode: v => v === "server" || v === "client", domain: v => isStr(v) && isSimpleName(v), password: v => isStr(v) && isSimpleName(v) };
const LINE_PROP: Record<string, (v: unknown) => boolean> = { password: v => isStr(v) && isSimpleName(v), login: isBool };
const DEVICE_PROP: Record<string, (v: unknown) => boolean> = { enableSecret: v => isStr(v) && isSimpleName(v), passwordEncryption: isBool, banner: isStr };

function readCondition(v: unknown): CliStateCondition | null {
  const c = rec(v);
  if (!c) return null;
  const propOf = (table: Record<string, (v: unknown) => boolean>) => (typeof c.prop === "string" && table[c.prop] && table[c.prop](c.value) ? c.prop : null);
  switch (c.kind) {
    case "mode": return isMode(c.mode) ? { kind: "mode", mode: c.mode! } : null;
    case "hostname": return isStr(c.value) && isSimpleName(c.value) ? { kind: "hostname", value: c.value } : null;
    case "interface": { const p = propOf(IF_PROP); return isIfName(c.name) && p ? { kind: "interface", name: c.name, prop: p as Extract<CliStateCondition, { kind: "interface" }>["prop"], value: c.value as never } : null; }
    case "port-security": { const p = propOf(PS_PROP); return isIfName(c.name) && p ? { kind: "port-security", name: c.name, prop: p as Extract<CliStateCondition, { kind: "port-security" }>["prop"], value: c.value as never } : null; }
    case "vlan": return isVlanId(c.vlanId) ? { kind: "vlan", vlanId: c.vlanId } : null;
    case "dhcp-pool": { const p = propOf(POOL_PROP); return isStr(c.name) && isSimpleName(c.name) && p ? { kind: "dhcp-pool", name: c.name, prop: p as Extract<CliStateCondition, { kind: "dhcp-pool" }>["prop"], value: c.value as never } : null; }
    case "dhcp-excluded": return isStr(c.from) && isIpv4(c.from) && (c.to === undefined || (isStr(c.to) && isIpv4(c.to))) ? (c.to === undefined ? { kind: "dhcp-excluded", from: c.from } : { kind: "dhcp-excluded", from: c.from, to: c.to as string }) : null;
    case "vtp": { const p = propOf(VTP_PROP); return p ? { kind: "vtp", prop: p as "mode" | "domain" | "password", value: c.value as string } : null; }
    case "line": { const p = propOf(LINE_PROP); return (c.line === "console" || c.line === "vty") && p ? { kind: "line", line: c.line, prop: p as "password" | "login", value: c.value as never } : null; }
    case "device": { const p = propOf(DEVICE_PROP); return p ? { kind: "device", prop: p as "enableSecret" | "passwordEncryption" | "banner", value: c.value as never } : null; }
    case "routing": {
      if (c.protocol !== "ospf" && c.protocol !== "eigrp") return null;
      if (c.prop === "id") return intIn(1, ROUTING_ID_MAX)(c.value) ? { kind: "routing", protocol: c.protocol, prop: "id", value: c.value } : null;
      if (c.prop !== "network") return null;
      const ok = c.protocol === "ospf" ? isOspfNetworkText(c.value) : isStr(c.value) && isIpv4(c.value);
      return ok ? { kind: "routing", protocol: c.protocol, prop: "network", value: c.value as string } : null;
    }
    case "acl": {
      if (!isAclNumber(c.number)) return null;
      if (c.prop === "count") return intIn(0, 40)(c.value) ? { kind: "acl", number: c.number, prop: "count", value: c.value } : null;
      return c.prop === "entry" && isAclEntryText(c.number)(c.value) ? { kind: "acl", number: c.number, prop: "entry", value: c.value as string } : null;
    }
    default: return null;
  }
}

/** Argument validators for `{command, args}` expectations, keyed by the parsed-command field name. */
const ARG_CHECK: Record<string, (v: unknown) => boolean> = {
  name: v => isStr(v) && isSimpleName(v), interfaces: isIfList, sub: isBool, vlanId: isVlanId, vlans: isVlanList,
  mode: v => v === "access" || v === "trunk" || v === "server" || v === "client",
  address: v => isStr(v) && isIpv4(v), mask: v => isStr(v) && isSubnetMask(v), addresses: v => Array.isArray(v) && v.length > 0 && v.every(x => isStr(x) && isIpv4(x)),
  from: v => isStr(v) && isIpv4(v), to: v => isStr(v) && isIpv4(v), password: v => isStr(v) && isSimpleName(v), secret: v => isStr(v) && isSimpleName(v),
  maximum: isMax, mac: v => isStr(v) && isCiscoMac(v), action: v => v === "shutdown" || v === "permit" || v === "deny", line: v => v === "console" || v === "vty", text: isStr,
  what: v => ["running-config", "startup-config", "ip-interface-brief", "vlan-brief", "ip-dhcp-pool", "vtp-status", "port-security", "ip-route"].includes(v as string), iface: isIfName,
  // Batch 10 — routing and ACL arguments.
  form: v => v === "dhcp" || v === "ospf" || v === "eigrp", wildcard: v => isStr(v) && isIpv4(v), area: intIn(0, OSPF_AREA_MAX),
  protocol: v => ["ospf", "eigrp", "tcp", "udp", "icmp", "ip"].includes(v as string), number: intIn(1, Math.max(ROUTING_ID_MAX, ACL_NUMBER_MAX)),
  source: isAclAddressText, destination: isAclAddressText, port: intIn(1, PORT_MAX), direction: v => v === "in" || v === "out",
};

function readExpectation(v: unknown): CliExpectation | null {
  const e = rec(v);
  if (!e) return null;
  if ("command" in e) {
    if (!isCommandId(e.command)) return null;
    const args = rec(e.args);
    if (e.args !== undefined && !args) return null;
    if (args && !Object.entries(args).every(([k, val]) => ARG_CHECK[k] !== undefined && ARG_CHECK[k](val))) return null;
    return args ? { command: e.command, args: args as CliExpectedArgs } : { command: e.command };
  }
  if ("mode" in e) return isMode(e.mode) ? { mode: e.mode! } : null;
  if ("condition" in e) { const c = readCondition(e.condition); return c ? { condition: c } : null; }
  return null;
}

function readSteps(v: unknown): CliStep[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 40) return null;
  const out: CliStep[] = [];
  const ids = new Set<string>();
  for (const raw of v) {
    const s = rec(raw);
    if (!s || !isStr(s.id) || ids.has(s.id) || !isStr(s.instruction)) return null;
    const expect = readExpectation(s.expect);
    if (!expect) return null;
    ids.add(s.id);
    const step: CliStep = { id: s.id, instruction: s.instruction, expect, hints: strList(s.hints, 2) };
    if (isStr(s.success)) step.success = s.success;
    out.push(step);
  }
  return out;
}

function readGoals(v: unknown): CliGoal[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 40) return null;
  const out: CliGoal[] = [];
  const ids = new Set<string>();
  for (const raw of v) {
    const g = rec(raw);
    if (!g || !isStr(g.id) || ids.has(g.id) || !isStr(g.label)) return null;
    const condition = readCondition(g.condition);
    if (!condition) return null;
    ids.add(g.id);
    out.push({ id: g.id, label: g.label, condition });
  }
  return out;
}

/**
 * Read an opaque block config into a validated exercise, or null when it is not a well-formed v1 exercise. The
 * result is a NEW, cleaned object (unknown keys dropped; hint ladders capped at two; only known command ids kept;
 * every pinned value checked with the runtime validators).
 */
export function readCliExerciseConfig(config: unknown): CliExerciseConfig | null {
  const c = rec(config);
  if (!c) return null;
  if (typeof c.kind !== "string" || !(CLI_EXERCISE_KINDS as readonly string[]).includes(c.kind)) return null;
  if (typeof c.device !== "string" || !(CLI_DEVICE_TYPES as readonly string[]).includes(c.device)) return null;
  const kind = c.kind as CliExerciseConfig["kind"], device = c.device as CliExerciseConfig["device"];
  const out: CliExerciseConfig = { kind, device };
  if (c.hostname !== undefined) { if (!isStr(c.hostname) || !isSimpleName(c.hostname)) return null; out.hostname = c.hostname; }
  if (c.startMode !== undefined) { if (!isMode(c.startMode)) return null; out.startMode = c.startMode; }
  if (c.startInterface !== undefined) { if (!isIfName(c.startInterface)) return null; out.startInterface = c.startInterface; }
  if (c.startPool !== undefined) { if (!isStr(c.startPool) || !isSimpleName(c.startPool)) return null; out.startPool = c.startPool; }
  if (c.startLine !== undefined) { if (c.startLine !== "console" && c.startLine !== "vty") return null; out.startLine = c.startLine; }
  if ((out.startMode === "interface" || out.startMode === "subinterface") && !out.startInterface) return null;
  if (out.startMode === "dhcp" && !out.startPool) return null;
  if (out.startMode === "line" && !out.startLine) return null;
  if (isStr(c.intro)) out.intro = c.intro;
  if (isStr(c.completion)) out.completion = c.completion;
  if (c.allowed !== undefined) { if (!Array.isArray(c.allowed) || !c.allowed.every(isCommandId)) return null; out.allowed = [...c.allowed]; }
  const preset = rec(c.preset);
  if (preset) {
    const p: NonNullable<CliExerciseConfig["preset"]> = {};
    const ifs = rec(preset.interfaces), vl = rec(preset.vlans), pools = rec(preset.dhcpPools);
    if (ifs) {
      if (!Object.keys(ifs).every(isIfName)) return null;
      p.interfaces = Object.fromEntries(Object.entries(ifs).map(([k, v]) => [k, rec(v) ?? {}])) as NonNullable<CliExerciseConfig["preset"]>["interfaces"];
    }
    if (vl) { if (!Object.keys(vl).every(k => isVlanId(Number(k)))) return null; p.vlans = Object.fromEntries(Object.entries(vl).map(([k, v]) => [k, rec(v) ?? {}])) as NonNullable<CliExerciseConfig["preset"]>["vlans"]; }
    if (pools) { if (!Object.keys(pools).every(isSimpleName)) return null; p.dhcpPools = Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, rec(v) ?? {}])) as NonNullable<CliExerciseConfig["preset"]>["dhcpPools"]; }
    out.preset = p;
  }
  if (kind === "task") {
    const goals = readGoals(c.goals);
    if (!goals) return null;
    out.goals = goals;
    out.hints = strList(c.hints, 2);
  } else {
    const steps = readSteps(c.steps);
    if (!steps) return null;
    out.steps = steps;
  }
  return out;
}
