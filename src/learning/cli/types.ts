// Learning Materials — Interactive CLI simulator (v1): the TYPE contract.
//
// A deterministic TEACHING simulator of a Cisco-style command line — NOT an IOS emulator. Everything here is plain
// data: the device state model, the closed set of parsed commands, the parse/execute outcomes and the declarative
// exercise definitions that content modules author. No React, no DOM, no network, no persistence, no code
// execution of any kind: student input is only ever matched against the closed grammar in grammar.ts.

/** The CLI modes the simulator models. `line` config, routing protocols, ACLs … are deliberately absent (v1). */
export type CliMode = "user" | "privileged" | "global" | "interface" | "subinterface" | "vlan" | "dhcp";
export const CLI_MODES: readonly CliMode[] = ["user", "privileged", "global", "interface", "subinterface", "vlan", "dhcp"];

export type CliDeviceType = "switch" | "router";
export const CLI_DEVICE_TYPES: readonly CliDeviceType[] = ["switch", "router"];

/** Per-interface configuration the simulator tracks (only what the book's exercises need). */
export interface CliInterfaceState {
  switchportMode?: "access" | "trunk";
  accessVlan?: number;
  /** Sorted, de-duplicated VLAN ids allowed on a trunk. */
  allowedVlans?: number[];
  ipAddress?: string;
  subnetMask?: string;
  /** `encapsulation dot1Q N` on a sub-interface. */
  encapsulationVlan?: number;
  /** Router interfaces start administratively down; switch ports start up. */
  shutdown: boolean;
}

export interface CliDhcpPool {
  network?: string;
  mask?: string;
  defaultRouter?: string;
  /** In authored order, de-duplicated. */
  dnsServers: string[];
}

/** The whole simulated device. Immutable by convention: the engine returns NEW objects, never mutates. */
export interface CliDeviceState {
  device: CliDeviceType;
  hostname: string;
  mode: CliMode;
  /** Canonical interface names selected by `interface …` / `interface range …`; non-empty only in (sub)interface modes. */
  selectedInterfaces: string[];
  selectedVlan?: number;
  selectedPool?: string;
  /** Keyed by canonical interface name (e.g. "f0/1", "g0/0.10", "vlan1"). */
  interfaces: Record<string, CliInterfaceState>;
  /** Keyed by the VLAN id as a string. */
  vlans: Record<string, { name?: string }>;
  dhcpPools: Record<string, CliDhcpPool>;
  dhcpExcluded: { from: string; to?: string }[];
  vtp: { mode?: "server" | "client"; domain?: string; password?: string };
}

/** The CLOSED set of commands the simulator understands. Anything else is "unknown" and never changes state. */
export type ParsedCommand =
  | { id: "enable" }
  | { id: "disable" }
  | { id: "configure-terminal" }
  | { id: "exit" }
  | { id: "end" }
  | { id: "help" }
  | { id: "hostname"; name: string }
  | { id: "interface"; interfaces: string[]; sub: boolean }
  | { id: "vlan"; vlanId: number }
  | { id: "name"; name: string }
  | { id: "switchport-mode"; mode: "access" | "trunk" }
  | { id: "switchport-access-vlan"; vlanId: number }
  | { id: "switchport-trunk-allowed-vlan"; vlans: number[] }
  | { id: "ip-address"; address: string; mask: string }
  | { id: "no-shutdown" }
  | { id: "shutdown" }
  | { id: "encapsulation-dot1q"; vlanId: number }
  | { id: "ip-dhcp-pool"; name: string }
  | { id: "network"; address: string; mask: string }
  | { id: "default-router"; address: string }
  | { id: "dns-server"; addresses: string[] }
  | { id: "ip-dhcp-excluded-address"; from: string; to?: string }
  | { id: "vtp-mode"; mode: "server" | "client" }
  | { id: "vtp-domain"; name: string }
  | { id: "vtp-password"; password: string }
  | { id: "show"; what: "running-config" | "ip-interface-brief" | "vlan-brief" | "ip-dhcp-pool" | "vtp-status" };
export type CliCommandId = ParsedCommand["id"];

/** Outcome of PARSING one input line against the closed grammar (mode is not considered yet). */
export type CliParseResult =
  | { kind: "empty" }
  | { kind: "unknown" }
  | { kind: "incomplete"; id: CliCommandId; detail: string }
  | { kind: "invalid"; id: CliCommandId; detail: string }
  | { kind: "ok"; command: ParsedCommand };

/** Outcome of EXECUTING one input line against a device state (parse + mode check + apply). */
export type CliExecResult =
  | { status: "empty" }
  | { status: "unknown" }
  | { status: "incomplete"; id: CliCommandId; detail: string }
  | { status: "invalid"; id: CliCommandId; detail: string }
  | { status: "wrong-mode"; command: ParsedCommand; requiredModes: readonly CliMode[] }
  | { status: "ok"; command: ParsedCommand; output?: string[] };
export type CliExecStatus = CliExecResult["status"];

// ── Declarative exercises (authored in content modules as plain data; validated by config.ts) ─────────────────

/** A condition on the FINAL device state (multi-step tasks) or on the state after one step. */
export type CliStateCondition =
  | { kind: "mode"; mode: CliMode }
  | { kind: "hostname"; value: string }
  | { kind: "interface"; name: string; prop: "switchportMode" | "accessVlan" | "allowedVlans" | "ipAddress" | "subnetMask" | "encapsulationVlan" | "shutdown"; value: string | number | boolean | number[] }
  | { kind: "vlan"; vlanId: number }
  | { kind: "dhcp-pool"; name: string; prop: "network" | "mask" | "defaultRouter" | "dnsServers"; value: string | string[] }
  | { kind: "dhcp-excluded"; from: string; to?: string }
  | { kind: "vtp"; prop: "mode" | "domain" | "password"; value: string };

/** Argument values an expectation may pin on a command (compared canonically — see exercise.ts). */
export type CliExpectedArgs = Record<string, string | number | boolean | (string | number)[]>;

/** What one guided step / one challenge expects: a specific command (optionally with pinned arguments), a mode,
 *  or a state condition. The expectation is answer-key material: the terminal never prints it. */
export type CliExpectation =
  | { command: CliCommandId; args?: CliExpectedArgs }
  | { mode: CliMode }
  | { condition: CliStateCondition };

export interface CliStep {
  id: string;
  /** The Arabic instruction (guided) or question (challenge) shown to the learner. */
  instruction: string;
  expect: CliExpectation;
  /** Shown when the step is achieved (defaults per exercise kind). */
  success?: string;
  /** Two-step hint ladder: hint 1 never reveals the answer. */
  hints?: string[];
}

export interface CliGoal {
  id: string;
  /** Learner-facing label of the required final state (e.g. «الواجهة G0/0 تحمل العنوان 192.168.1.254»). */
  label: string;
  condition: CliStateCondition;
}

export type CliExerciseKind = "guided" | "challenge" | "task";
export const CLI_EXERCISE_KINDS: readonly CliExerciseKind[] = ["guided", "challenge", "task"];

/**
 * One declarative CLI exercise (the `config` of a `simulation / cli-terminal / v1` block). Pure data: initial
 * state, the ordered steps (guided / challenge) or the required final state (task), hints, optional restriction of
 * the commands the exercise accepts. Nothing here is executable.
 */
export interface CliExerciseConfig {
  kind: CliExerciseKind;
  device: CliDeviceType;
  /** Prompt name (defaults to «Switch» / «Router»). */
  hostname?: string;
  /** Starting mode (default "user"). */
  startMode?: CliMode;
  /** Required when `startMode` is "interface" / "subinterface". */
  startInterface?: string;
  /** Required when `startMode` is "dhcp". */
  startPool?: string;
  /** Optional pre-configured state (applied before the exercise starts). */
  preset?: {
    interfaces?: Record<string, Partial<CliInterfaceState>>;
    vlans?: Record<string, { name?: string }>;
    dhcpPools?: Record<string, Partial<CliDhcpPool>>;
  };
  /** Short Arabic intro shown above the terminal. */
  intro?: string;
  /** Ordered steps — guided / challenge only. */
  steps?: CliStep[];
  /** Required final state — task only. */
  goals?: CliGoal[];
  /** Task-level two-step hint ladder. */
  hints?: string[];
  /** When present, any OTHER (non-navigation) command is refused as «غير مطلوب» and never changes state. */
  allowed?: CliCommandId[];
  /** Message shown when the whole exercise is complete. */
  completion?: string;
}
