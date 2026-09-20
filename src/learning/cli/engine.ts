// Learning Materials — CLI simulator: EXECUTION of one input line against a device state (parse → mode check →
// apply). Pure: returns a NEW state + a result descriptor; the input state is never mutated. No exercise logic here
// (see exercise.ts) and no presentation. Unknown / incomplete / invalid / wrong-mode input NEVER changes state.
import type { CliDeviceState, CliExecResult, CliInterfaceState, CliMode, ParsedCommand } from "./types";
import { COMMANDS, parseCommand } from "./grammar";
import { newInterface } from "./state";
import { showOutput } from "./show";

const EXIT_TO: Record<CliMode, CliMode> = { user: "user", privileged: "user", global: "privileged", interface: "global", subinterface: "global", vlan: "global", dhcp: "global" };

function mapSelected(state: CliDeviceState, f: (i: CliInterfaceState) => CliInterfaceState): CliDeviceState {
  const interfaces = { ...state.interfaces };
  for (const name of state.selectedInterfaces) interfaces[name] = f(interfaces[name] ?? newInterface(state.device));
  return { ...state, interfaces };
}

function mapPool(state: CliDeviceState, f: (p: CliDeviceState["dhcpPools"][string]) => CliDeviceState["dhcpPools"][string]): CliDeviceState {
  const name = state.selectedPool;
  if (!name) return state;
  return { ...state, dhcpPools: { ...state.dhcpPools, [name]: f(state.dhcpPools[name] ?? { dnsServers: [] }) } };
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
    case "end": return { state: state.mode === "user" ? state : { ...state, mode: "privileged", selectedInterfaces: [], selectedVlan: undefined, selectedPool: undefined } };
    case "exit": {
      const mode = EXIT_TO[state.mode];
      return { state: { ...state, mode, selectedInterfaces: [], selectedVlan: undefined, selectedPool: undefined } };
    }
    case "hostname": return { state: { ...state, hostname: cmd.name } };
    case "interface": {
      const interfaces = { ...state.interfaces };
      for (const name of cmd.interfaces) if (!interfaces[name]) interfaces[name] = newInterface(state.device);
      return { state: { ...state, mode: cmd.sub ? "subinterface" : "interface", selectedInterfaces: cmd.interfaces, selectedVlan: undefined, selectedPool: undefined, interfaces } };
    }
    case "vlan": return { state: { ...state, mode: "vlan", selectedVlan: cmd.vlanId, selectedInterfaces: [], vlans: { ...state.vlans, [String(cmd.vlanId)]: state.vlans[String(cmd.vlanId)] ?? {} } } };
    case "name": return { state: state.selectedVlan === undefined ? state : { ...state, vlans: { ...state.vlans, [String(state.selectedVlan)]: { ...state.vlans[String(state.selectedVlan)], name: cmd.name } } } };
    case "switchport-mode": return { state: mapSelected(state, i => ({ ...i, switchportMode: cmd.mode })) };
    case "switchport-access-vlan": return { state: mapSelected(state, i => ({ ...i, accessVlan: cmd.vlanId })) };
    case "switchport-trunk-allowed-vlan": return { state: mapSelected(state, i => ({ ...i, allowedVlans: [...cmd.vlans] })) };
    case "ip-address": return { state: mapSelected(state, i => ({ ...i, ipAddress: cmd.address, subnetMask: cmd.mask })) };
    case "no-shutdown": return { state: mapSelected(state, i => ({ ...i, shutdown: false })) };
    case "shutdown": return { state: mapSelected(state, i => ({ ...i, shutdown: true })) };
    case "encapsulation-dot1q": return { state: mapSelected(state, i => ({ ...i, encapsulationVlan: cmd.vlanId })) };
    case "ip-dhcp-pool": return { state: { ...state, mode: "dhcp", selectedPool: cmd.name, selectedInterfaces: [], dhcpPools: { ...state.dhcpPools, [cmd.name]: state.dhcpPools[cmd.name] ?? { dnsServers: [] } } } };
    case "network": return { state: mapPool(state, p => ({ ...p, network: cmd.address, mask: cmd.mask })) };
    case "default-router": return { state: mapPool(state, p => ({ ...p, defaultRouter: cmd.address })) };
    case "dns-server": return { state: mapPool(state, p => ({ ...p, dnsServers: [...cmd.addresses] })) };
    case "ip-dhcp-excluded-address": {
      const dup = state.dhcpExcluded.some(e => e.from === cmd.from && e.to === cmd.to);
      return { state: dup ? state : { ...state, dhcpExcluded: [...state.dhcpExcluded, cmd.to === undefined ? { from: cmd.from } : { from: cmd.from, to: cmd.to }] } };
    }
    case "vtp-mode": return { state: { ...state, vtp: { ...state.vtp, mode: cmd.mode } } };
    case "vtp-domain": return { state: { ...state, vtp: { ...state.vtp, domain: cmd.name } } };
    case "vtp-password": return { state: { ...state, vtp: { ...state.vtp, password: cmd.password } } };
    case "show": return { state, output: showOutput(state, cmd) };
  }
}

/** The modes in which a parsed command is valid (its matching grammar specs). */
export function requiredModes(cmd: ParsedCommand): readonly CliMode[] {
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
  const modes = requiredModes(parsed.command);
  if (!modes.includes(state.mode)) return { state, result: { status: "wrong-mode", command: parsed.command, requiredModes: modes } };
  const applied = applyCommand(state, parsed.command);
  return { state: applied.state, result: applied.output ? { status: "ok", command: parsed.command, output: applied.output } : { status: "ok", command: parsed.command } };
}
