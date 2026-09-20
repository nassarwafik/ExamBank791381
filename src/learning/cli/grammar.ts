// Learning Materials — CLI simulator: the CLOSED command grammar and the parser.
//
// Every supported command is one `CommandSpec`: the keyword sequence(s) that introduce it (matched case-
// insensitively, with the well-known IOS abbreviations the book itself uses, e.g. «config t»), the modes it is
// valid in, a display syntax (for the «?» help) and a small argument parser built from the value checks in
// normalize.ts. Input is ONLY ever compared against this table — there is no evaluation, no shell, no dynamic
// dispatch by string: an unmatched line is "unknown" and can never change state.
// ORDER MATTERS: a spec whose keyword sequence extends another's (e.g. «switchport port-security maximum» vs
// «switchport port-security», «enable secret» vs «enable») is listed BEFORE the shorter one.
import type { CliAclProtocol, CliCommandId, CliMode, CliParseResult, ParsedCommand } from "./types";
import { tokenize, normalizeInterfaceName, expandInterfaceRange, isSubInterface, isIpv4, isSubnetMask, parseVlanId, parseVlanList, isSimpleName, isCiscoMac, parseIntInRange, parseAclAddress, PORT_SECURITY_MAX, ACL_STANDARD_MAX, ACL_NUMBER_MAX, ROUTING_ID_MAX, OSPF_AREA_MAX, PORT_MAX } from "./normalize";

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

const CONFIG_MODES: readonly CliMode[] = ["global", "interface", "subinterface", "vlan", "dhcp", "line", "router"];
const NOT_USER: readonly CliMode[] = ["privileged", ...CONFIG_MODES];
const IF_MODES: readonly CliMode[] = ["interface", "subinterface"];

const none = (id: CliCommandId): ((rest: string[]) => ArgResult) => rest => (rest.length ? { invalid: "هذا الأمر لا يأخذ قيمًا إضافية" } : ({ id } as ParsedCommand));

const ipAddressArgs = (rest: string[]): ArgResult => {
  if (rest.length < 2) return { incomplete: "المطلوب: عنوان IP ثم قناع الشبكة" };
  if (rest.length > 2) return { invalid: "قيم زائدة بعد القناع" };
  if (!isIpv4(rest[0])) return { invalid: "عنوان IP غير صالح: " + rest[0] };
  if (!isSubnetMask(rest[1])) return { invalid: "قناع الشبكة غير صالح: " + rest[1] };
  return { id: "ip-address", address: rest[0], mask: rest[1] };
};

/**
 * `network` has the three shapes the book prints: DHCP pool «network <address> <mask>» (PDF 172), OSPF «network
 * <address> <wildcard> area <n>» (PDF 216–217) and EIGRP «network <address>» (PDF 220–221). The shape is decided
 * by the tokens; the engine then checks it against the current mode / routing process (see engine.ts).
 */
const networkArgs = (rest: string[]): ArgResult => {
  if (rest.length === 0) return { incomplete: "المطلوب: عنوان الشبكة (ثم القناع في DHCP، أو wildcard و area في OSPF)" };
  if (!isIpv4(rest[0])) return { invalid: "عنوان الشبكة غير صالح: " + rest[0] };
  if (rest.length === 1) return { id: "network", form: "eigrp", address: rest[0] };
  if (!isIpv4(rest[1])) return { invalid: "القيمة بعد العنوان غير صالحة: " + rest[1] };
  if (rest.length === 2) {
    if (!isSubnetMask(rest[1])) return { invalid: "قناع الشبكة غير صالح: " + rest[1] + " — في OSPF تُكتب بعد wildcard الكلمة area ورقمها" };
    return { id: "network", form: "dhcp", address: rest[0], mask: rest[1] };
  }
  if (rest[2].toLowerCase() !== "area") return { invalid: "بعد wildcard تُكتب الكلمة area ثم رقمها" };
  if (rest.length === 3) return { incomplete: "المطلوب: رقم area بعد الكلمة area" };
  if (rest.length > 4) return { invalid: "قيم زائدة بعد رقم area" };
  const area = parseIntInRange(rest[3], 0, OSPF_AREA_MAX);
  return area === null ? { invalid: "رقم area غير صالح: " + rest[3] } : { id: "network", form: "ospf", address: rest[0], wildcard: rest[1], area };
};

const routerArgs = (protocol: "ospf" | "eigrp") => (rest: string[]): ArgResult => {
  if (rest.length === 0) return { incomplete: protocol === "ospf" ? "المطلوب: رقم العملية (process-id)" : "المطلوب: رقم AS" };
  if (rest.length > 1) return { invalid: "قيم زائدة بعد الرقم" };
  const n = parseIntInRange(rest[0], 1, ROUTING_ID_MAX);
  return n === null ? { invalid: `الرقم غير صالح (1–${ROUTING_ID_MAX}): ` + rest[0] } : { id: "router", protocol, number: n };
};

const ACL_PROTOCOLS: readonly CliAclProtocol[] = ["tcp", "udp", "icmp", "ip"];

/** `access-list <1-99> permit|deny <source>` · `access-list <100-199> permit|deny <protocol> <source> <destination> [eq <port>]`. */
const accessListArgs = (rest: string[]): ArgResult => {
  if (rest.length === 0) return { incomplete: "المطلوب: رقم القائمة ثم permit أو deny" };
  const number = parseIntInRange(rest[0], 1, ACL_NUMBER_MAX);
  if (number === null) return { invalid: `رقم القائمة غير صالح (1–${ACL_STANDARD_MAX} قياسية، ${ACL_STANDARD_MAX + 1}–${ACL_NUMBER_MAX} موسّعة): ` + rest[0] };
  if (rest.length === 1) return { incomplete: "المطلوب: permit أو deny" };
  const action = rest[1].toLowerCase();
  if (action !== "permit" && action !== "deny") return { invalid: "بعد رقم القائمة تُكتب permit أو deny" };
  let tail = rest.slice(2);
  if (number <= ACL_STANDARD_MAX) {
    const src = parseAclAddress(tail);
    if (!("text" in src)) return src;
    if (tail.length > src.used) return { invalid: "القائمة القياسية تأخذ المصدر فقط — قيم زائدة: " + tail.slice(src.used).join(" ") };
    return { id: "access-list", number, entry: { action, source: src.text } };
  }
  if (tail.length === 0) return { incomplete: "المطلوب في القائمة الموسّعة: البروتوكول (tcp / udp / icmp / ip) ثم المصدر ثم الوجهة" };
  const protocol = tail[0].toLowerCase() as CliAclProtocol;
  if (!ACL_PROTOCOLS.includes(protocol)) return { invalid: "البروتوكول يجب أن يكون tcp أو udp أو icmp أو ip: " + tail[0] };
  tail = tail.slice(1);
  const src = parseAclAddress(tail);
  if (!("text" in src)) return src;
  tail = tail.slice(src.used);
  const dst = parseAclAddress(tail);
  if (!("text" in dst)) return "incomplete" in dst ? { incomplete: "المطلوب: الوجهة (any أو host <address> أو <address> <wildcard>)" } : dst;
  tail = tail.slice(dst.used);
  if (tail.length === 0) return { id: "access-list", number, entry: { action, protocol, source: src.text, destination: dst.text } };
  if (tail[0].toLowerCase() !== "eq") return { invalid: "بعد الوجهة يمكن كتابة eq ثم رقم المنفذ فقط" };
  if (protocol !== "tcp" && protocol !== "udp") return { invalid: "eq <port> يُستعمل مع tcp أو udp فقط" };
  if (tail.length === 1) return { incomplete: "المطلوب: رقم المنفذ بعد eq (مثل 80 أو 443)" };
  if (tail.length > 2) return { invalid: "قيم زائدة بعد رقم المنفذ" };
  const port = parseIntInRange(tail[1], 1, PORT_MAX);
  return port === null ? { invalid: "رقم المنفذ غير صالح (1–65535): " + tail[1] } : { id: "access-list", number, entry: { action, protocol, source: src.text, destination: dst.text, port } };
};

const accessGroupArgs = (rest: string[]): ArgResult => {
  if (rest.length === 0) return { incomplete: "المطلوب: رقم القائمة ثم in أو out" };
  const number = parseIntInRange(rest[0], 1, ACL_NUMBER_MAX);
  if (number === null) return { invalid: `رقم القائمة غير صالح (1–${ACL_NUMBER_MAX}): ` + rest[0] };
  if (rest.length === 1) return { incomplete: "المطلوب: الاتجاه in أو out" };
  const direction = rest[1].toLowerCase();
  if (rest.length > 2 || (direction !== "in" && direction !== "out")) return { invalid: "الاتجاه يجب أن يكون in أو out" };
  return { id: "ip-access-group", number, direction };
};

const oneName = (id: "hostname" | "name" | "ip-dhcp-pool" | "vtp-domain" | "vtp-password" | "password" | "enable-secret", what: string) => (rest: string[]): ArgResult => {
  if (rest.length === 0) return { incomplete: "المطلوب: " + what };
  if (rest.length > 1) return { invalid: what + " يجب أن يكون كلمة واحدة" };
  if (!isSimpleName(rest[0])) return { invalid: what + " غير صالح: " + rest[0] };
  switch (id) {
    case "vtp-password": case "password": return { id, password: rest[0] };
    case "enable-secret": return { id, secret: rest[0] };
    default: return { id, name: rest[0] };
  }
};

const oneVlan = (id: "vlan" | "switchport-access-vlan" | "encapsulation-dot1q") => (rest: string[]): ArgResult => {
  if (rest.length === 0) return { incomplete: "المطلوب: رقم VLAN" };
  if (rest.length > 1) return { invalid: "قيم زائدة بعد رقم VLAN" };
  const v = parseVlanId(rest[0]);
  return v === null ? { invalid: "رقم VLAN غير صالح (1–4094): " + rest[0] } : { id, vlanId: v };
};

const showOf = (what: Extract<ParsedCommand, { id: "show" }>["what"]) => (rest: string[]): ArgResult => (rest.length ? { invalid: "قيم زائدة" } : { id: "show", what });

/** The grammar table. Longer keyword sequences are listed BEFORE shorter ones that share a prefix. */
export const COMMANDS: readonly CommandSpec[] = [
  { id: "help", keywords: [["?"], ["help"]], modes: ["user", ...NOT_USER], syntax: "?", args: none("help") },
  // «enable secret» must precede «enable».
  { id: "enable-secret", keywords: [["enable", "secret"]], modes: ["global"], syntax: "enable secret <password>", args: oneName("enable-secret", "كلمة السر") },
  { id: "enable", keywords: [["enable"], ["en"]], modes: ["user", "privileged"], syntax: "enable", args: none("enable") },
  { id: "disable", keywords: [["disable"]], modes: ["privileged"], syntax: "disable", args: none("disable") },
  { id: "configure-terminal", keywords: [["configure", "terminal"], ["configure", "t"], ["config", "terminal"], ["config", "t"], ["conf", "terminal"], ["conf", "term"], ["conf", "t"]], modes: ["privileged"], syntax: "configure terminal", args: none("configure-terminal") },
  { id: "end", keywords: [["end"]], modes: ["user", ...NOT_USER], syntax: "end", args: none("end") },
  { id: "exit", keywords: [["exit"]], modes: ["user", ...NOT_USER], syntax: "exit", args: none("exit") },
  { id: "hostname", keywords: [["hostname"]], modes: ["global"], syntax: "hostname <name>", args: oneName("hostname", "اسم الجهاز") },
  {
    id: "banner-motd", keywords: [["banner", "motd"]], modes: ["global"], syntax: "banner motd #<message>#",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: الرسالة بين رمزين متطابقين مثل #...#" };
      const joined = rest.join(" ");
      const delim = joined[0];
      if (/[A-Za-z0-9\s]/.test(delim) || joined.length < 2 || joined[joined.length - 1] !== delim) return { invalid: "الرسالة يجب أن تبدأ وتنتهي بنفس الرمز، مثل #Welcome#" };
      const text = joined.slice(1, -1);
      if (text.length > 200) return { invalid: "الرسالة طويلة جدًا" };
      return { id: "banner-motd", text };
    },
  },
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
  // Port Security (Batch 9): the extended forms precede the bare «switchport port-security».
  {
    id: "port-security-maximum", keywords: [["switchport", "port-security", "maximum"]], modes: ["interface"], syntax: "switchport port-security maximum <n>",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: عدد الأجهزة المسموح بها" };
      if (rest.length > 1) return { invalid: "قيم زائدة بعد العدد" };
      const n = parseIntInRange(rest[0], 1, PORT_SECURITY_MAX);
      return n === null ? { invalid: `العدد غير صالح (1–${PORT_SECURITY_MAX}): ` + rest[0] } : { id: "port-security-maximum", maximum: n };
    },
  },
  { id: "port-security-sticky", keywords: [["switchport", "port-security", "mac-address", "sticky"]], modes: ["interface"], syntax: "switchport port-security mac-address sticky", args: none("port-security-sticky") },
  {
    id: "port-security-mac-address", keywords: [["switchport", "port-security", "mac-address"]], modes: ["interface"], syntax: "switchport port-security mac-address <HHHH.HHHH.HHHH>",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: عنوان MAC بصيغة HHHH.HHHH.HHHH أو الكلمة sticky" };
      if (rest.length > 1) return { invalid: "قيم زائدة بعد عنوان MAC" };
      return isCiscoMac(rest[0]) ? { id: "port-security-mac-address", mac: rest[0].toLowerCase() } : { invalid: "عنوان MAC غير صالح (مثل 00A0.1234.5678): " + rest[0] };
    },
  },
  {
    id: "port-security-violation", keywords: [["switchport", "port-security", "violation"]], modes: ["interface"], syntax: "switchport port-security violation shutdown",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: الإجراء عند المخالفة (shutdown)" };
      if (rest.length > 1 || rest[0].toLowerCase() !== "shutdown") return { invalid: "هذا المحاكي يدعم الإجراء shutdown فقط" };
      return { id: "port-security-violation", action: "shutdown" };
    },
  },
  { id: "switchport-port-security", keywords: [["switchport", "port-security"]], modes: ["interface"], syntax: "switchport port-security", args: none("switchport-port-security") },
  { id: "ip-address", keywords: [["ip", "address"], ["ip", "addr"]], modes: IF_MODES, syntax: "ip address <address> <mask>", args: ipAddressArgs },
  // ACL (Batch 10): applying a numbered list to the selected interface (PDF 224 / 226).
  { id: "ip-access-group", keywords: [["ip", "access-group"]], modes: IF_MODES, syntax: "ip access-group <number> in | out", args: accessGroupArgs },
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
  { id: "network", keywords: [["network"]], modes: ["dhcp", "router"], syntax: "network <address> <mask>  |  network <address> <wildcard> area <n>  |  network <address>", args: networkArgs },
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
  // Device protection (Batch 9): the two access lines the book prints, and their passwords.
  {
    id: "line", keywords: [["line", "console"]], modes: ["global"], syntax: "line console 0",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: رقم الخط (line console 0)" };
      return rest.length === 1 && rest[0] === "0" ? { id: "line", line: "console" } : { invalid: "خط الدخول المباشر في هذا المحاكي هو line console 0" };
    },
  },
  {
    id: "line", keywords: [["line", "vty"]], modes: ["global"], syntax: "line vty 0 4",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: مدى الخطوط (line vty 0 4)" };
      return rest.length === 2 && rest[0] === "0" && rest[1] === "4" ? { id: "line", line: "vty" } : { invalid: "خطوط الدخول عن بُعد في هذا المحاكي هي line vty 0 4" };
    },
  },
  { id: "password", keywords: [["password"]], modes: ["line"], syntax: "password <password>", args: oneName("password", "كلمة المرور") },
  { id: "login", keywords: [["login"]], modes: ["line"], syntax: "login", args: none("login") },
  { id: "service-password-encryption", keywords: [["service", "password-encryption"]], modes: ["global"], syntax: "service password-encryption", args: none("service-password-encryption") },
  // Routing (Batch 10): the two processes the book prints (PDF 216–221); `network` inside them is handled above.
  { id: "router", keywords: [["router", "ospf"]], modes: ["global"], syntax: "router ospf <process-id>", args: routerArgs("ospf") },
  { id: "router", keywords: [["router", "eigrp"]], modes: ["global"], syntax: "router eigrp <as>", args: routerArgs("eigrp") },
  // ACL (Batch 10): numbered standard (1–99) and extended (100–199) lists (PDF 224–227).
  { id: "access-list", keywords: [["access-list"]], modes: ["global"], syntax: "access-list <number> permit | deny …", args: accessListArgs },
  // show (simplified deterministic output); «show port-security interface» precedes «show port-security».
  { id: "show", keywords: [["show", "running-config"], ["show", "run"]], modes: NOT_USER, syntax: "show running-config", args: showOf("running-config") },
  { id: "show", keywords: [["show", "startup-config"], ["show", "start"]], modes: NOT_USER, syntax: "show startup-config", args: showOf("startup-config") },
  { id: "show", keywords: [["show", "ip", "interface", "brief"], ["show", "ip", "int", "brief"], ["show", "ip", "int", "br"]], modes: NOT_USER, syntax: "show ip interface brief", args: showOf("ip-interface-brief") },
  { id: "show", keywords: [["show", "ip", "dhcp", "pool"]], modes: NOT_USER, syntax: "show ip dhcp pool", args: showOf("ip-dhcp-pool") },
  { id: "show", keywords: [["show", "ip", "route"]], modes: NOT_USER, syntax: "show ip route", args: showOf("ip-route") },
  { id: "show", keywords: [["show", "vlan", "brief"], ["show", "vlan"]], modes: NOT_USER, syntax: "show vlan brief", args: showOf("vlan-brief") },
  { id: "show", keywords: [["show", "vtp", "status"]], modes: NOT_USER, syntax: "show vtp status", args: showOf("vtp-status") },
  {
    id: "show", keywords: [["show", "port-security", "interface"]], modes: NOT_USER, syntax: "show port-security interface <name>",
    args: rest => {
      if (rest.length === 0) return { incomplete: "المطلوب: اسم الواجهة" };
      const name = normalizeInterfaceName(rest.join(""));
      return name ? { id: "show", what: "port-security", iface: name } : { invalid: "اسم الواجهة غير صالح: " + rest.join(" ") };
    },
  },
  { id: "show", keywords: [["show", "port-security"]], modes: NOT_USER, syntax: "show port-security", args: showOf("port-security") },
];

/** The modes a command id is valid in (union over its specs). */
export function modesOf(id: CliCommandId): readonly CliMode[] {
  const out = new Set<CliMode>();
  for (const c of COMMANDS) if (c.id === id) for (const m of c.modes) out.add(m);
  return [...out];
}

/** The command ids that only MOVE between modes or inspect (always accepted by an exercise, never «غير مطلوب»). */
export const NAVIGATION_COMMANDS: readonly CliCommandId[] = ["enable", "disable", "configure-terminal", "exit", "end", "help", "interface", "vlan", "ip-dhcp-pool", "line", "router", "show"];

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
