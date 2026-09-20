// Learning Materials — CLI simulator: EXECUTION of one input line against a device state (parse → mode check →
// apply). Pure: returns a NEW state + a result descriptor; the input state is never mutated. No exercise logic here
// (see exercise.ts) and no presentation. Unknown / incomplete / invalid / wrong-mode input NEVER changes state.
import type { CliAclEntry, CliDeviceState, CliExecResult, CliInterfaceState, CliLineState, CliMode, ParsedCommand } from "./types";
import { COMMANDS, parseCommand } from "./grammar";
import { newInterface } from "./state";
import { showOutput } from "./show";
import { aclEntryText, ospfNetworkText, eigrpNetworkText, staticRouteText } from "./normalize";

const EXIT_TO: Record<CliMode, CliMode> = { user: "user", privileged: "user", global: "privileged", interface: "global", subinterface: "global", vlan: "global", dhcp: "global", line: "global", router: "global" };

/** Leave every sub-mode selection behind (used by `exit`, `end` and when entering another sub-mode). */
const unselect = (state: CliDeviceState): CliDeviceState => ({ ...state, selectedInterfaces: [], selectedVlan: undefined, selectedPool: undefined, selectedLine: undefined, selectedRouter: undefined });

function mapSelected(state: CliDeviceState, f: (i: CliInterfaceState) => CliInterfaceState): CliDeviceState {
  const interfaces = { ...state.interfaces };
  for (const name of state.selectedInterfaces) interfaces[name] = f(interfaces[name] ?? newInterface(state.device));
  return { ...state, interfaces };
}

function mapPortSecurity(state: CliDeviceState, f: (ps: NonNullable<CliInterfaceState["portSecurity"]>) => NonNullable<CliInterfaceState["portSecurity"]>): CliDeviceState {
  return mapSelected(state, i => ({ ...i, portSecurity: f(i.portSecurity ?? { enabled: false }) }));
}

function mapPool(state: CliDeviceState, f: (p: CliDeviceState["dhcpPools"][string]) => CliDeviceState["dhcpPools"][string]): CliDeviceState {
  const name = state.selectedPool;
  if (!name) return state;
  return { ...state, dhcpPools: { ...state.dhcpPools, [name]: f(state.dhcpPools[name] ?? { dnsServers: [] }) } };
}

function mapLine(state: CliDeviceState, f: (l: CliLineState) => CliLineState): CliDeviceState {
  const line = state.selectedLine;
  if (!line) return state;
  return { ...state, lines: { ...state.lines, [line]: f(state.lines[line]) } };
}

/** Help output: the syntax of every command valid in the CURRENT mode. */
function helpLines(state: CliDeviceState): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of COMMANDS) if (c.modes.includes(state.mode) && c.id !== "help" && !seen.has(c.syntax)) { seen.add(c.syntax); out.push("  " + c.syntax); }
  return out;
}

/** Apply an ALREADY mode-checked command. Returns the new state (+ optional output lines). */
export function applyCommand(state: CliDeviceState, cmd: ParsedCommand): { state: CliDeviceState; output?: string[] } {
  switch (cmd.id) {
    case "help": return { state, output: helpLines(state) };
    case "enable": return { state: { ...state, mode: "privileged" } };
    case "disable": return { state: { ...state, mode: "user" } };
    case "configure-terminal": return { state: { ...state, mode: "global" } };
    case "end": return { state: state.mode === "user" ? state : { ...unselect(state), mode: "privileged" } };
    case "exit": return { state: { ...unselect(state), mode: EXIT_TO[state.mode] } };
    case "hostname": return { state: { ...state, hostname: cmd.name } };
    case "banner-motd": return { state: { ...state, banner: cmd.text } };
    case "interface": {
      const interfaces = { ...state.interfaces };
      for (const name of cmd.interfaces) if (!interfaces[name]) interfaces[name] = newInterface(state.device);
      return { state: { ...unselect(state), mode: cmd.sub ? "subinterface" : "interface", selectedInterfaces: cmd.interfaces, interfaces } };
    }
    case "vlan": return { state: { ...unselect(state), mode: "vlan", selectedVlan: cmd.vlanId, vlans: { ...state.vlans, [String(cmd.vlanId)]: state.vlans[String(cmd.vlanId)] ?? {} } } };
    case "name": return { state: state.selectedVlan === undefined ? state : { ...state, vlans: { ...state.vlans, [String(state.selectedVlan)]: { ...state.vlans[String(state.selectedVlan)], name: cmd.name } } } };
    case "switchport-mode": return { state: mapSelected(state, i => ({ ...i, switchportMode: cmd.mode })) };
    case "switchport-access-vlan": return { state: mapSelected(state, i => ({ ...i, accessVlan: cmd.vlanId })) };
    case "switchport-trunk-allowed-vlan": return { state: mapSelected(state, i => ({ ...i, allowedVlans: [...cmd.vlans] })) };
    case "switchport-trunk-native-vlan": return { state: mapSelected(state, i => ({ ...i, nativeVlan: cmd.vlanId })) };
    case "switchport-port-security": return { state: mapPortSecurity(state, ps => ({ ...ps, enabled: true })) };
    case "port-security-maximum": return { state: mapPortSecurity(state, ps => ({ ...ps, maximum: cmd.maximum })) };
    case "port-security-mac-address": return { state: mapPortSecurity(state, ps => ({ ...ps, macAddress: cmd.mac })) };
    case "port-security-sticky": return { state: mapPortSecurity(state, ps => ({ ...ps, sticky: true })) };
    case "port-security-violation": return { state: mapPortSecurity(state, ps => ({ ...ps, violation: cmd.action })) };
    case "ip-address": return { state: mapSelected(state, i => ({ ...i, ipAddress: cmd.address, subnetMask: cmd.mask })) };
    case "no-shutdown": return { state: mapSelected(state, i => ({ ...i, shutdown: false })) };
    case "shutdown": return { state: mapSelected(state, i => ({ ...i, shutdown: true })) };
    case "encapsulation-dot1q": return { state: mapSelected(state, i => ({ ...i, encapsulationVlan: cmd.vlanId })) };
    case "ip-dhcp-pool": return { state: { ...unselect(state), mode: "dhcp", selectedPool: cmd.name, dhcpPools: { ...state.dhcpPools, [cmd.name]: state.dhcpPools[cmd.name] ?? { dnsServers: [] } } } };
    case "network": {
      if (cmd.form === "dhcp") return { state: mapPool(state, p => ({ ...p, network: cmd.address, mask: cmd.mask })) };
      if (cmd.form === "ospf") {
        const ospf = state.routing.ospf;
        if (!ospf || state.selectedRouter !== "ospf") return { state };
        const entry = { address: cmd.address, wildcard: cmd.wildcard, area: cmd.area };
        const dup = ospf.networks.some(n => ospfNetworkText(n) === ospfNetworkText(entry));
        return { state: dup ? state : { ...state, routing: { ...state.routing, ospf: { ...ospf, networks: [...ospf.networks, entry] } } } };
      }
      const eigrp = state.routing.eigrp;
      if (!eigrp || state.selectedRouter !== "eigrp") return { state };
      const text = eigrpNetworkText(cmd.address, cmd.wildcard);
      return { state: eigrp.networks.includes(text) ? state : { ...state, routing: { ...state.routing, eigrp: { ...eigrp, networks: [...eigrp.networks, text] } } } };
    }
    case "ip-route": {
      const route = { network: cmd.network, mask: cmd.mask, nextHop: cmd.nextHop };
      const dup = state.staticRoutes.some(r => staticRouteText(r) === staticRouteText(route));
      return { state: dup ? state : { ...state, staticRoutes: [...state.staticRoutes, route] } };
    }
    case "router": {
      // One process per protocol: re-entering the same number keeps its networks; a different number starts afresh.
      const current = state.routing[cmd.protocol];
      const process = current && current.id === cmd.number ? current : { id: cmd.number, networks: [] };
      return { state: { ...unselect(state), mode: "router", selectedRouter: cmd.protocol, routing: { ...state.routing, [cmd.protocol]: process } } };
    }
    case "access-list": {
      const key = String(cmd.number);
      const list: CliAclEntry[] = state.acls[key] ?? [];
      const dup = list.some(e => aclEntryText(e) === aclEntryText(cmd.entry));
      return { state: dup ? state : { ...state, acls: { ...state.acls, [key]: [...list, { ...cmd.entry }] } } };
    }
    case "ip-access-group": return { state: mapSelected(state, i => ({ ...i, accessGroup: { acl: cmd.number, direction: cmd.direction } })) };
    case "default-router": return { state: mapPool(state, p => ({ ...p, defaultRouter: cmd.address })) };
    case "dns-server": return { state: mapPool(state, p => ({ ...p, dnsServers: [...cmd.addresses] })) };
    case "ip-dhcp-excluded-address": {
      const dup = state.dhcpExcluded.some(e => e.from === cmd.from && e.to === cmd.to);
      return { state: dup ? state : { ...state, dhcpExcluded: [...state.dhcpExcluded, cmd.to === undefined ? { from: cmd.from } : { from: cmd.from, to: cmd.to }] } };
    }
    case "vtp-mode": return { state: { ...state, vtp: { ...state.vtp, mode: cmd.mode } } };
    case "vtp-domain": return { state: { ...state, vtp: { ...state.vtp, domain: cmd.name } } };
    case "vtp-password": return { state: { ...state, vtp: { ...state.vtp, password: cmd.password } } };
    case "line": return { state: { ...unselect(state), mode: "line", selectedLine: cmd.line } };
    case "password": return { state: mapLine(state, l => ({ ...l, password: cmd.password })) };
    case "login": return { state: mapLine(state, l => ({ ...l, login: true })) };
    case "enable-secret": return { state: { ...state, enableSecret: cmd.secret } };
    case "service-password-encryption": return { state: { ...state, passwordEncryption: true } };
    case "show": return { state, output: showOutput(state, cmd) };
  }
}

/** The modes in which a parsed command is valid (its matching grammar specs). */
export function requiredModes(cmd: ParsedCommand): readonly CliMode[] {
  // `network` is one grammar entry with three book forms: the DHCP form lives in the pool, the routing forms in `router`.
  if (cmd.id === "network") return cmd.form === "dhcp" ? ["dhcp"] : ["router"];
  const out = new Set<CliMode>();
  for (const c of COMMANDS) if (c.id === cmd.id) for (const m of c.modes) out.add(m);
  return [...out];
}

/**
 * Execute ONE input line: parse it against the closed grammar, check the current mode, apply. The returned state
 * is a new object when (and only when) an "ok" command changed something; every other outcome returns the input
 * state untouched. Never throws on any string input.
 */
export function executeCommand(state: CliDeviceState, raw: unknown): { state: CliDeviceState; result: CliExecResult } {
  const parsed = parseCommand(raw);
  if (parsed.kind === "empty") return { state, result: { status: "empty" } };
  if (parsed.kind === "unknown") return { state, result: { status: "unknown" } };
  if (parsed.kind === "incomplete") return { state, result: { status: "incomplete", id: parsed.id, detail: parsed.detail } };
  if (parsed.kind === "invalid") return { state, result: { status: "invalid", id: parsed.id, detail: parsed.detail } };
  // In a DHCP pool a second value that is not a contiguous mask is a bad mask (never an EIGRP wildcard).
  if (parsed.command.id === "network" && parsed.command.form === "eigrp" && parsed.command.wildcard !== undefined && state.mode === "dhcp") return { state, result: { status: "invalid", id: "network", detail: "قناع الشبكة غير صالح: " + parsed.command.wildcard } };
  const modes = requiredModes(parsed.command);
  if (!modes.includes(state.mode)) return { state, result: { status: "wrong-mode", command: parsed.command, requiredModes: modes } };
  // Inside a routing process the `network` form must match the process (the book's «انتبه» on PDF 220: no area in EIGRP).
  if (parsed.command.id === "network" && state.mode === "router") {
    if (parsed.command.form === "eigrp" && state.selectedRouter === "ospf") return { state, result: { status: "incomplete", id: "network", detail: "في OSPF المطلوب: network <address> <wildcard> area <n>" } };
    if (parsed.command.form === "ospf" && state.selectedRouter === "eigrp") return { state, result: { status: "invalid", id: "network", detail: "في EIGRP لا نكتب area؛ الصيغة: network <address> [<wildcard>]" } };
  }
  const applied = applyCommand(state, parsed.command);
  return { state: applied.state, result: applied.output ? { status: "ok", command: parsed.command, output: applied.output } : { status: "ok", command: parsed.command } };
}
