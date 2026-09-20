// Learning Materials — CLI simulator: the device STATE model (creation, prompt, immutable helpers). No React.
import type { CliDeviceState, CliDeviceType, CliExerciseConfig, CliInterfaceState, CliMode } from "./types";
import { normalizeInterfaceName, isSubInterface } from "./normalize";

/** The Arabic label of each mode (used in feedback such as «المطلوب: وضع الإعداد العام»). */
export const CLI_MODE_LABEL: Record<CliMode, string> = {
  user: "وضع المستخدم",
  privileged: "وضع الأوامر المتقدّم",
  global: "وضع الإعداد العام",
  interface: "وضع إعداد الواجهة",
  subinterface: "وضع إعداد الواجهة الفرعية",
  vlan: "وضع إعداد VLAN",
  dhcp: "وضع إعداد مجموعة DHCP",
  line: "وضع إعداد خط الدخول",
};

/** The prompt suffix of each mode (IOS-style). */
export const CLI_MODE_SUFFIX: Record<CliMode, string> = {
  user: ">",
  privileged: "#",
  global: "(config)#",
  interface: "(config-if)#",
  subinterface: "(config-subif)#",
  vlan: "(config-vlan)#",
  dhcp: "(dhcp-config)#",
  line: "(config-line)#",
};

/** The prompt line for a state, e.g. "Router(config-if)#". */
export function promptFor(state: Pick<CliDeviceState, "hostname" | "mode">): string {
  return state.hostname + CLI_MODE_SUFFIX[state.mode];
}

/** A fresh interface record (router interfaces start shut down; switch ports start up). */
export function newInterface(device: CliDeviceType): CliInterfaceState {
  return { shutdown: device === "router" };
}

/** Default hostname per device type. */
export function defaultHostname(device: CliDeviceType): string {
  return device === "router" ? "Router" : "Switch";
}

/** An empty device of the given type in user EXEC mode. */
export function createDeviceState(device: CliDeviceType, hostname = defaultHostname(device)): CliDeviceState {
  return {
    device, hostname, mode: "user", selectedInterfaces: [], interfaces: {}, vlans: {}, dhcpPools: {}, dhcpExcluded: [], vtp: {},
    lines: { console: { login: false }, vty: { login: false } }, passwordEncryption: false,
  };
}

/**
 * The INITIAL state of an exercise: device + hostname + preset configuration + starting mode. Every reset returns
 * to exactly this state (pure: a new object each call). Invalid start combinations fall back to user EXEC.
 */
export function createInitialState(exercise: CliExerciseConfig): CliDeviceState {
  const base = createDeviceState(exercise.device, exercise.hostname || defaultHostname(exercise.device));
  const interfaces: Record<string, CliInterfaceState> = {};
  for (const [name, partial] of Object.entries(exercise.preset?.interfaces ?? {})) {
    const canon = normalizeInterfaceName(name);
    if (canon) interfaces[canon] = { ...newInterface(exercise.device), ...partial };
  }
  const vlans = { ...(exercise.preset?.vlans ?? {}) };
  const dhcpPools: CliDeviceState["dhcpPools"] = {};
  for (const [name, pool] of Object.entries(exercise.preset?.dhcpPools ?? {})) dhcpPools[name] = { dnsServers: [], ...pool };
  let state: CliDeviceState = { ...base, interfaces, vlans, dhcpPools };
  const start = exercise.startMode ?? "user";
  if (start === "interface" || start === "subinterface") {
    const canon = exercise.startInterface ? normalizeInterfaceName(exercise.startInterface) : null;
    if (canon) {
      const mode: CliMode = isSubInterface(canon) ? "subinterface" : "interface";
      state = { ...state, mode, selectedInterfaces: [canon], interfaces: { ...state.interfaces, [canon]: state.interfaces[canon] ?? newInterface(exercise.device) } };
    }
  } else if (start === "dhcp") {
    if (exercise.startPool) state = { ...state, mode: "dhcp", selectedPool: exercise.startPool, dhcpPools: { ...state.dhcpPools, [exercise.startPool]: state.dhcpPools[exercise.startPool] ?? { dnsServers: [] } } };
  } else if (start === "line") {
    if (exercise.startLine) state = { ...state, mode: "line", selectedLine: exercise.startLine };
  } else {
    state = { ...state, mode: start };
  }
  return state;
}
