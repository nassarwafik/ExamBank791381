// Learning Materials — Interactive CLI simulator (v1, extended in Batch 9): the TYPE contract.
//
// A deterministic TEACHING simulator of a Cisco-style command line — NOT an IOS emulator. Everything here is plain
// data: the device state model, the closed set of parsed commands, the parse/execute outcomes and the declarative
// exercise definitions that content modules author. No React, no DOM, no network, no persistence, no code
// execution of any kind: student input is only ever matched against the closed grammar in grammar.ts.
//
// Batch 9 added (only what the book prints on PDF 180–199): Port Security on an interface, the `line` mode for
// console / vty passwords, `enable secret`, `service password-encryption`, `banner motd`, and the `show` commands
// `startup-config`, `port-security`, `port-security interface`.
// Batch 10 added (only what the book prints on PDF 201–229): the `router` mode entered by `router ospf <id>` /
// `router eigrp <as>` with its `network` forms, numbered standard / extended access lists (`access-list …`),
// `ip access-group <n> in|out` on an interface, and `show ip route`.

/** The CLI modes the simulator models. NAT, named ACLs, static routes … are deliberately absent. */
export type CliMode = "user" | "privileged" | "global" | "interface" | "subinterface" | "vlan" | "dhcp" | "line" | "router";
export const CLI_MODES: readonly CliMode[] = ["user", "privileged", "global", "interface", "subinterface", "vlan", "dhcp", "line", "router"];

export type CliDeviceType = "switch" | "router";
export const CLI_DEVICE_TYPES: readonly CliDeviceType[] = ["switch", "router"];

/** Port Security on one switch port (the book's PDF 182–184 / 197 commands only). */
export interface CliPortSecurity {
  /** `switchport port-security` was issued. */
  enabled: boolean;
  /** `switchport port-security maximum <n>`. */
  maximum?: number;
  /** `switchport port-security mac-address HHHH.HHHH.HHHH` (canonical lower-case). */
  macAddress?: string;
  /** `switchport port-security mac-address sticky`. */
  sticky?: boolean;
  /** `switchport port-security violation shutdown` (the only action the book prints). */
  violation?: "shutdown";
}

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
  portSecurity?: CliPortSecurity;
  /** `ip access-group <n> in|out` (Batch 10): the access list applied to this interface and its direction. */
  accessGroup?: { acl: number; direction: CliAclDirection };
}

export type CliAclDirection = "in" | "out";
export type CliAclAction = "permit" | "deny";
export type CliAclProtocol = "tcp" | "udp" | "icmp" | "ip";
/**
 * One line of a numbered access list (Batch 10). `source` / `destination` are canonical texts exactly as the book
 * writes them: "any", "host 192.168.1.10" or "192.168.1.0 0.0.0.255" (address + wildcard). Standard lists
 * (1–99) carry only the source; extended lists (100–199) carry protocol, source, destination and an optional
 * `eq <port>`.
 */
export interface CliAclEntry {
  action: CliAclAction;
  source: string;
  protocol?: CliAclProtocol;
  destination?: string;
  port?: number;
}

export type CliRoutingProtocol = "ospf" | "eigrp";
/** `network <address> <wildcard> area <n>` under `router ospf`. */
export interface CliOspfNetwork { address: string; wildcard: string; area: number }
export interface CliRoutingState {
  /** `router ospf <process-id>` + its `network … area …` statements (authored order, de-duplicated). */
  ospf?: { id: number; networks: CliOspfNetwork[] };
  /** `router eigrp <as>` + its classful `network <address>` statements (authored order, de-duplicated). */
  eigrp?: { id: number; networks: string[] };
}

export interface CliDhcpPool {
  network?: string;
  mask?: string;
  defaultRouter?: string;
  /** In authored order, de-duplicated. */
  dnsServers: string[];
}

/** One access line (`line console 0` / `line vty 0 4`). */
export interface CliLineState {
  password?: string;
  /** `login` was issued (the line asks for its password). */
  login: boolean;
}
export type CliLineName = "console" | "vty";

/** The whole simulated device. Immutable by convention: the engine returns NEW objects, never mutates. */
export interface CliDeviceState {
  device: CliDeviceType;
  hostname: string;
  mode: CliMode;
  /** Canonical interface names selected by `interface …` / `interface range …`; non-empty only in (sub)interface modes. */
  selectedInterfaces: string[];
  selectedVlan?: number;
  selectedPool?: string;
  /** The line selected by `line console 0` / `line vty 0 4`; set only in line mode. */
  selectedLine?: CliLineName;
  /** The routing process selected by `router ospf` / `router eigrp`; set only in router mode. */
  selectedRouter?: CliRoutingProtocol;
  /** Keyed by canonical interface name (e.g. "f0/1", "g0/0.10", "vlan1"). */
  interfaces: Record<string, CliInterfaceState>;
  /** Keyed by the VLAN id as a string. */
  vlans: Record<string, { name?: string }>;
  dhcpPools: Record<string, CliDhcpPool>;
  dhcpExcluded: { from: string; to?: string }[];
  vtp: { mode?: "server" | "client"; domain?: string; password?: string };
  lines: { console: CliLineState; vty: CliLineState };
  /** `enable secret <secret>`. */
  enableSecret?: string;
  /** `service password-encryption`. */
  passwordEncryption: boolean;
  /** `banner motd #text#` (the text between the delimiters). */
  banner?: string;
  /** Routing processes (Batch 10). */
  routing: CliRoutingState;
  /** Numbered access lists keyed by the list number as a string (Batch 10); entries in authored order. */
  acls: Record<string, CliAclEntry[]>;
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
  | { id: "switchport-port-security" }
  | { id: "port-security-maximum"; maximum: number }
  | { id: "port-security-mac-address"; mac: string }
  | { id: "port-security-sticky" }
  | { id: "port-security-violation"; action: "shutdown" }
  | { id: "ip-address"; address: string; mask: string }
  | { id: "no-shutdown" }
  | { id: "shutdown" }
  | { id: "encapsulation-dot1q"; vlanId: number }
  | { id: "ip-dhcp-pool"; name: string }
  /** `network` has three book forms: DHCP pool (address + mask), OSPF (address + wildcard + area), EIGRP (address). */
  | { id: "network"; form: "dhcp"; address: string; mask: string }
  | { id: "network"; form: "ospf"; address: string; wildcard: string; area: number }
  | { id: "network"; form: "eigrp"; address: string }
  | { id: "router"; protocol: CliRoutingProtocol; number: number }
  | { id: "access-list"; number: number; entry: CliAclEntry }
  | { id: "ip-access-group"; number: number; direction: CliAclDirection }
  | { id: "default-router"; address: string }
  | { id: "dns-server"; addresses: string[] }
  | { id: "ip-dhcp-excluded-address"; from: string; to?: string }
  | { id: "vtp-mode"; mode: "server" | "client" }
  | { id: "vtp-domain"; name: string }
  | { id: "vtp-password"; password: string }
  | { id: "line"; line: CliLineName }
  | { id: "password"; password: string }
  | { id: "login" }
  | { id: "enable-secret"; secret: string }
  | { id: "service-password-encryption" }
  | { id: "banner-motd"; text: string }
  | { id: "show"; what: "running-config" | "startup-config" | "ip-interface-brief" | "vlan-brief" | "ip-dhcp-pool" | "vtp-status" | "port-security" | "ip-route"; iface?: string };
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
  | { kind: "interface"; name: string; prop: "switchportMode" | "accessVlan" | "allowedVlans" | "ipAddress" | "subnetMask" | "encapsulationVlan" | "shutdown" | "accessGroup"; value: string | number | boolean | number[] }
  | { kind: "port-security"; name: string; prop: "enabled" | "maximum" | "macAddress" | "sticky" | "violation"; value: string | number | boolean }
  | { kind: "vlan"; vlanId: number }
  | { kind: "dhcp-pool"; name: string; prop: "network" | "mask" | "defaultRouter" | "dnsServers"; value: string | string[] }
  | { kind: "dhcp-excluded"; from: string; to?: string }
  | { kind: "vtp"; prop: "mode" | "domain" | "password"; value: string }
  | { kind: "line"; line: CliLineName; prop: "password" | "login"; value: string | boolean }
  | { kind: "device"; prop: "enableSecret" | "passwordEncryption" | "banner"; value: string | boolean }
  /** `id`: the process / AS number; `network`: one canonical statement («192.168.1.0 0.0.0.255 area 0» / «10.0.0.0»). */
  | { kind: "routing"; protocol: CliRoutingProtocol; prop: "id" | "network"; value: number | string }
  /** `entry`: one canonical line («permit 192.168.1.0 0.0.0.255», «deny any», «permit tcp any any eq 80»); `count`: number of lines. */
  | { kind: "acl"; number: number; prop: "entry" | "count"; value: string | number };

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
  /** Required when `startMode` is "line". */
  startLine?: CliLineName;
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
