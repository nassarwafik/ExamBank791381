// Learning Materials — CLI simulator: the CLOSED command grammar (v1) and the parser.
//
// Every supported command is one `CommandSpec`: the keyword sequence(s) that introduce it (matched case-
// insensitively, with the well-known IOS abbreviations the book itself uses, e.g. «config t»), the modes it is
// valid in, a display syntax (for the «?» help) and a small argument parser built from the value checks in
// normalize.ts. Input is ONLY ever compared against this table — there is no evaluation, no shell, no dynamic
// dispatch by string: an unmatched line is "unknown" and can never change state.
import type { CliCommandId, CliMode, CliParseResult, ParsedCommand } from "./types";
import { tokenize, normalizeInterfaceName, expandInterfaceRange, isSubInterface, isIpv4, isSubnetMask, parseVlanId, parseVlanList, isSimpleName } from "./normalize";

type ArgResult = ParsedCommand | { incomplete: string } | { invalid: string };

export interface CommandSpec {
  id: CliCommandId;
  /** Alternative keyword sequences (lower-case) that introduce the command. */
  keywords: readonly (readonly string[])[];
  /** Modes in which the command is valid. */
  modes: readonly CliMode[];
  /** Canonical display syntax (help output). */
  syntax: string;
  /** Parse the remaining tokens (after the keywords). */
  args: (rest: string[]) => ArgResult;
}

const CONFIG_MODES: readonly CliMode[] = ["global", "interface", "subinterface", "vlan", "dhcp"];
const NOT_USER: readonly CliMode[] = ["privileged", ...CONFIG_MODES];
const IF_MODES: readonly CliMode[] = ["interface", "subinterface"];

const none = (id: CliCommandId): ((rest: string[]) => ArgResult) => rest => (rest.length ? { invalid: "هذا الأمر لا يأخذ قيمًا إضافية" } : ({ id } as ParsedCommand));

const ipAndMask = (id: "ip-address" | "network") => (rest: string[]): ArgResult => {
  if (rest.length < 2) return { incomplete: "المطلوب: عنوان IP ثم قناع الشبكة" };
  if (rest.length > 2) return { invalid: "قيم زائدة بعد القناع" };
  if (!isIpv4(rest[0])) return { invalid: "عنوان IP غير صالح: " + rest[0] };
  if (!isSubnetMask(rest[1])) return { invalid: "قناع الشبكة غير صالح: " + rest[1] };
  return { id, address: rest[0], mask: rest[1] };
};

const oneName = (id: "hostname" | "name" | "ip-dhcp-pool" | "vtp-domain" | "vtp-password", what: string) => (rest: string[]): ArgResult => {
  if (rest.length === 0) return { incomplete: "المطلوب: " + what };
  if (rest.length > 1) return { invalid: "الاسم يجب أن يكون كلمة واحدة" };
  if (!isSimpleName(rest[0])) return { invalid: what + " غير صالح: " + rest[0] };
  return id === "vtp-password" ? { id, password: rest[0] } : { id, name: rest[0] };
};

const oneVlan = (id: "vlan" | "switchport-access-vlan" | "encapsulation-dot1q") => (rest: string[]): ArgResult => {
  if (rest.length === 0) return { incomplete: "المطلوب: رقم VLAN" };
  if (rest.length > 1) return { invalid: "قيم زائدة بعد رقم VLAN" };
  const v = parseVlanId(rest[0]);
  return v === null ? { invalid: "رقم VLAN غير صالح (1–4094): " + rest[0] } : { id, vlanId: v };
};

/** The grammar table. Longer keyword sequences are listed BEFORE shorter ones that share a prefix. */
export const COMMANDS: readonly CommandSpec[] = [
  { id: "help", keywords: [["?"], ["help"]], modes: ["user", ...NOT_USER], syntax: "?", args: none("help") },
  { id: "enable", keywords: [["enable"], ["en"]], modes: ["user", "privileged"], syntax: "enable", args: none("enable") },
  { id: "disable", keywords: [["disable"]], modes: ["privileged"], syntax: "disable", args: none("disable") },
  { id: "configure-terminal", keywords: [["configure", "terminal"], ["configure", "t"], ["config", "terminal"], ["config", "t"], ["conf", "terminal"], ["conf", "term"], ["conf", "t"]], modes: ["privileged"], syntax: "configure terminal", args: none("configure-terminal") },
  { id: "end", keywords: [["end"]], modes: ["user", ...NOT_USER], syntax: "end", args: none("end") },
  { id: "exit", keywords: [["exit"]], modes: ["user", ...NOT_USER], syntax: "exit", args: none("exit") },
  { id: "hostname", keywords: [["hostname"]], modes: ["global"], syntax: "hostname <name>", args: oneName("hostname", "اسم الجهاز") },
  {
    id: "interface", keywords: [["interface", "range"], ["int", "range"], ["interface"], ["int"]], modes: ["global", ...IF_MODES], syntax: "interface <name>  |  interface range <from-to>",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: اسم الواجهة (مثل f0/1 أو g0/0)" };
      const joined = rest.join("");
      const list = expandInterfaceRange(joined);
      if (!list) return { invalid: "اسم الواجهة غير صالح: " + rest.join(" ") };
      const sub = list.length === 1 && isSubInterface(list[0]);
      return { id: "interface", interfaces: list, sub };
    },
  },
  { id: "vlan", keywords: [["vlan"]], modes: ["global", "vlan"], syntax: "vlan <id>", args: oneVlan("vlan") },
  { id: "name", keywords: [["name"]], modes: ["vlan"], syntax: "name <name>", args: oneName("name", "اسم VLAN") },
  {
    id: "switchport-mode", keywords: [["switchport", "mode"]], modes: ["interface"], syntax: "switchport mode access | trunk",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: access أو trunk" };
      const m = rest[0].toLowerCase();
      if (rest.length > 1 || (m !== "access" && m !== "trunk")) return { invalid: "الوضع يجب أن يكون access أو trunk" };
      return { id: "switchport-mode", mode: m };
    },
  },
  { id: "switchport-access-vlan", keywords: [["switchport", "access", "vlan"]], modes: ["interface"], syntax: "switchport access vlan <id>", args: oneVlan("switchport-access-vlan") },
  {
    id: "switchport-trunk-allowed-vlan", keywords: [["switchport", "trunk", "allowed", "vlan"]], modes: ["interface"], syntax: "switchport trunk allowed vlan <list>",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: قائمة VLAN مثل 10,20,30" };
      const list = parseVlanList(rest.join(""));
      return list ? { id: "switchport-trunk-allowed-vlan", vlans: list } : { invalid: "قائمة VLAN غير صالحة: " + rest.join(" ") };
    },
  },
  { id: "ip-address", keywords: [["ip", "address"], ["ip", "addr"]], modes: IF_MODES, syntax: "ip address <address> <mask>", args: ipAndMask("ip-address") },
  { id: "no-shutdown", keywords: [["no", "shutdown"], ["no", "shut"]], modes: IF_MODES, syntax: "no shutdown", args: none("no-shutdown") },
  { id: "shutdown", keywords: [["shutdown"], ["shut"]], modes: IF_MODES, syntax: "shutdown", args: none("shutdown") },
  { id: "encapsulation-dot1q", keywords: [["encapsulation", "dot1q"], ["encap", "dot1q"]], modes: ["subinterface"], syntax: "encapsulation dot1Q <vlan>", args: oneVlan("encapsulation-dot1q") },
  { id: "ip-dhcp-pool", keywords: [["ip", "dhcp", "pool"]], modes: ["global"], syntax: "ip dhcp pool <name>", args: oneName("ip-dhcp-pool", "اسم مجموعة التوزيع") },
  {
    id: "ip-dhcp-excluded-address", keywords: [["ip", "dhcp", "excluded-address"]], modes: ["global"], syntax: "ip dhcp excluded-address <from> [<to>]",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: عنوان البداية (وعنوان النهاية اختياري)" };
      if (rest.length > 2) return { invalid: "قيم زائدة" };
      if (!isIpv4(rest[0])) return { invalid: "عنوان غير صالح: " + rest[0] };
      if (rest[1] !== undefined && !isIpv4(rest[1])) return { invalid: "عنوان غير صالح: " + rest[1] };
      return rest[1] === undefined ? { id: "ip-dhcp-excluded-address", from: rest[0] } : { id: "ip-dhcp-excluded-address", from: rest[0], to: rest[1] };
    },
  },
  { id: "network", keywords: [["network"]], modes: ["dhcp"], syntax: "network <address> <mask>", args: ipAndMask("network") },
  {
    id: "default-router", keywords: [["default-router"]], modes: ["dhcp"], syntax: "default-router <address>",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: عنوان البوابة" };
      if (rest.length > 1) return { invalid: "عنوان واحد فقط" };
      return isIpv4(rest[0]) ? { id: "default-router", address: rest[0] } : { invalid: "عنوان غير صالح: " + rest[0] };
    },
  },
  {
    id: "dns-server", keywords: [["dns-server"]], modes: ["dhcp"], syntax: "dns-server <address> [<address> …]",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: عنوان خادم DNS" };
      if (rest.length > 4) return { invalid: "أربعة عناوين على الأكثر" };
      const bad = rest.find(a => !isIpv4(a));
      return bad ? { invalid: "عنوان غير صالح: " + bad } : { id: "dns-server", addresses: [...new Set(rest)] };
    },
  },
  {
    id: "vtp-mode", keywords: [["vtp", "mode"]], modes: ["global"], syntax: "vtp mode server | client",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: server أو client" };
      const m = rest[0].toLowerCase();
      if (rest.length > 1 || (m !== "server" && m !== "client")) return { invalid: "الوضع يجب أن يكون server أو client" };
      return { id: "vtp-mode", mode: m };
    },
  },
  { id: "vtp-domain", keywords: [["vtp", "domain"]], modes: ["global"], syntax: "vtp domain <name>", args: oneName("vtp-domain", "اسم المجال") },
  { id: "vtp-password", keywords: [["vtp", "password"]], modes: ["global"], syntax: "vtp password <password>", args: oneName("vtp-password", "كلمة المرور") },
  { id: "show", keywords: [["show", "running-config"], ["show", "run"]], modes: NOT_USER, syntax: "show running-config", args: rest => (rest.length ? { invalid: "قيم زائدة" } : { id: "show", what: "running-config" }) },
  { id: "show", keywords: [["show", "ip", "interface", "brief"], ["show", "ip", "int", "brief"], ["show", "ip", "int", "br"]], modes: NOT_USER, syntax: "show ip interface brief", args: rest => (rest.length ? { invalid: "قيم زائدة" } : { id: "show", what: "ip-interface-brief" }) },
  { id: "show", keywords: [["show", "ip", "dhcp", "pool"]], modes: NOT_USER, syntax: "show ip dhcp pool", args: rest => (rest.length ? { invalid: "قيم زائدة" } : { id: "show", what: "ip-dhcp-pool" }) },
  { id: "show", keywords: [["show", "vlan", "brief"], ["show", "vlan"]], modes: NOT_USER, syntax: "show vlan brief", args: rest => (rest.length ? { invalid: "قيم زائدة" } : { id: "show", what: "vlan-brief" }) },
  { id: "show", keywords: [["show", "vtp", "status"]], modes: NOT_USER, syntax: "show vtp status", args: rest => (rest.length ? { invalid: "قيم زائدة" } : { id: "show", what: "vtp-status" }) },
];

/** The modes a command id is valid in (union over its specs). */
export function modesOf(id: CliCommandId): readonly CliMode[] {
  const out = new Set<CliMode>();
  for (const c of COMMANDS) if (c.id === id) for (const m of c.modes) out.add(m);
  return [...out];
}

/** The command ids that only MOVE between modes (always accepted by an exercise, never «غير مطلوب»). */
export const NAVIGATION_COMMANDS: readonly CliCommandId[] = ["enable", "disable", "configure-terminal", "exit", "end", "help", "interface", "vlan", "ip-dhcp-pool", "show"];

const startsWith = (tokens: string[], seq: readonly string[]) => seq.length <= tokens.length && seq.every((k, i) => tokens[i].toLowerCase() === k);

/**
 * Parse one input line against the closed grammar. Mode is NOT checked here (see engine.ts). A line whose tokens
 * are a strict PREFIX of a known command («ip dhcp», «switchport mode») is "incomplete"; anything else that matches
 * no keyword sequence is "unknown".
 */
export function parseCommand(raw: unknown): CliParseResult {
  const tokens = tokenize(raw);
  if (tokens.length === 0) return { kind: "empty" };
  if (tokens.some(t => t.length > 64) || tokens.length > 24) return { kind: "unknown" };
  for (const spec of COMMANDS) {
    for (const seq of spec.keywords) {
      if (!startsWith(tokens, seq)) continue;
      const r = spec.args(tokens.slice(seq.length));
      if ("incomplete" in r) return { kind: "incomplete", id: spec.id, detail: r.incomplete };
      if ("invalid" in r) return { kind: "invalid", id: spec.id, detail: r.invalid };
      return { kind: "ok", command: r };
    }
  }
  for (const spec of COMMANDS) {
    for (const seq of spec.keywords) {
      if (tokens.length < seq.length && tokens.every((t, i) => t.toLowerCase() === seq[i])) return { kind: "incomplete", id: spec.id, detail: "الأمر غير مكتمل: " + spec.syntax };
    }
  }
  return { kind: "unknown" };
}

/** Canonical interface name helper re-exported for expectation matching. */
export { normalizeInterfaceName };
