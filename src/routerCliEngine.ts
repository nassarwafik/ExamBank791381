// Phase 20B — the deterministic educational ROUTER CLI engine (router CLI v1) of the networkTopology@1 SmartSim plugin. Pure (no React,
// no DOM, no I/O, no timers, no randomness): compiled into the shared server build so the student terminal, the teacher preview, the
// ingest replay and the authoritative grader execute the SAME closed grammar and derive the SAME canonical state.
//
// A teaching simulator with a Cisco-style command FEEL — not IOS, not a shell, not an emulator. Input is only ever matched against the
// closed command table below; an unmatched line can never change state. Characters such as `;`, `|`, `&&`, backticks, `$()` and
// redirections are ordinary text that simply fails to match. Conventions follow the networkCli@1 switch engine (src/networkCliEngine.ts):
// a SESSION (mode + selected interface — navigation, rebuilt by replay) over a sparse canonical DEVICE STATE (the graded artefact).
//
// v1 scope (documented): hostname, interface selection (GigabitEthernet0/0–0/3), ip address / no ip address (overlapping subnets
// refused), shutdown / no shutdown (router interfaces are administratively DOWN by default), show running-config / ip interface brief /
// ip route (connected), `do show`, ? help. Static / dynamic routing, sub-interfaces, DHCP, ACL and NAT are recognised and refused with an
// explicit "not supported in this version" message — they are later Network Simulator phases, never half-implemented here.
import { isIpv4, isSubnetMask, isUsableHostAddress, isValidHostname, prefixLength } from "./networkCliEngine";

export const ROUTER_STATE_VERSION = 1 as const;
export type RouterMode = "user" | "privileged" | "global" | "interface";
export const ROUTER_MODE_SUFFIX: Readonly<Record<RouterMode, string>> = Object.freeze({ user: ">", privileged: "#", global: "(config)#", interface: "(config-if)#" });
export const ROUTER_MODE_LABEL: Readonly<Record<RouterMode, string>> = Object.freeze({ user: "وضع المستخدم (User EXEC)", privileged: "الوضع المتقدّم (Privileged EXEC)", global: "وضع الإعداد العام (Global configuration)", interface: "وضع إعداد الواجهة (Interface configuration)" });
/** Hard bounds — enforced on every line (client AND server) and by the replay on the history (same values as networkCli@1). */
export const ROUTER_CLI_LIMITS = Object.freeze({ inputChars: 200, tokens: 24, commands: 300, hostnameChars: 63 });
/** The fixed port inventory of the educational router: four GigabitEthernet interfaces, canonical short names in order. */
export const ROUTER_PORTS: readonly string[] = Object.freeze(["g0/0", "g0/1", "g0/2", "g0/3"]);
const PORT_INDEX = new Map(ROUTER_PORTS.map((p, i) => [p, i]));
export const DEFAULT_ROUTER_HOSTNAME = "Router";

export type RouterInterfaceConfig = { ipAddress?: string; subnetMask?: string; shutdown?: boolean };
/** The canonical, versioned CONFIGURATION state (the graded artefact). Sparse: only values that differ from the defaults are stored. */
export type RouterState = { v: typeof ROUTER_STATE_VERSION; device: "router"; hostname: string; interfaces: Record<string, RouterInterfaceConfig> };
export type RouterSession = { state: RouterState; mode: RouterMode; selectedInterface?: string };
/** Optional physical context (from a topology): whether a port's link is operational. Display only — never part of the state. */
export type RouterExecContext = { linkUp?: (port: string) => boolean };

export const isRouterPort = (name: string): boolean => PORT_INDEX.has(name);
/** Router interfaces are administratively down until `no shutdown` (the real-device default the students must learn). */
export function effectiveRouterInterface(state: RouterState, port: string): { shutdown: boolean; ipAddress?: string; subnetMask?: string } {
  const s = state.interfaces[port] ?? {};
  const out: { shutdown: boolean; ipAddress?: string; subnetMask?: string } = { shutdown: s.shutdown ?? true };
  if (s.ipAddress !== undefined && s.subnetMask !== undefined) { out.ipAddress = s.ipAddress; out.subnetMask = s.subnetMask; }
  return out;
}

const IF_RE = /^(gigabitethernet|gigabit|gig|gi|g)(\d{1,2})\/(\d{1,3})$/i;
/** Canonical short interface name on THIS router: "GigabitEthernet0/1" | "gi 0/1" | "g0/1" → "g0/1". Null for anything else. */
export function normalizeRouterInterfaceName(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const m = IF_RE.exec(raw.replace(/\s+/g, ""));
  if (!m || /^0\d/.test(m[2]) || /^0\d/.test(m[3])) return null;
  const canon = "g" + m[2] + "/" + m[3];
  return PORT_INDEX.has(canon) ? canon : null;
}
export const displayRouterInterface = (canon: string): string => canon.replace(/^g/, "GigabitEthernet");

// ── IPv4 arithmetic (32-bit unsigned) ──────────────────────────────────────────────────────────────────────────────────────────────
export const ipv4ToInt = (ip: string): number => ip.split(".").reduce((n, o) => ((n << 8) | Number(o)) >>> 0, 0) >>> 0;
export const intToIpv4 = (n: number): string => [24, 16, 8, 0].map(s => (n >>> s) & 255).join(".");
export const networkAddress = (ip: string, mask: string): string => intToIpv4((ipv4ToInt(ip) & ipv4ToInt(mask)) >>> 0);
/** True when two interface networks overlap (either contains the other's network). */
export function networksOverlap(ipA: string, maskA: string, ipB: string, maskB: string): boolean {
  const m = prefixLength(maskA) <= prefixLength(maskB) ? ipv4ToInt(maskA) : ipv4ToInt(maskB);
  return ((ipv4ToInt(ipA) & m) >>> 0) === ((ipv4ToInt(ipB) & m) >>> 0);
}

// ── canonical state ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function canonicalizeRouterState(state: RouterState): RouterState {
  const interfaces: Record<string, RouterInterfaceConfig> = {};
  for (const port of ROUTER_PORTS) {
    if (!Object.prototype.hasOwnProperty.call(state.interfaces, port)) continue;
    const c = state.interfaces[port] ?? {};
    const out: RouterInterfaceConfig = {};
    if (typeof c.ipAddress === "string" && typeof c.subnetMask === "string") { out.ipAddress = c.ipAddress; out.subnetMask = c.subnetMask; }
    if (c.shutdown === false) out.shutdown = false;
    if (Object.keys(out).length) interfaces[port] = out;
  }
  return { v: ROUTER_STATE_VERSION, device: "router", hostname: state.hostname, interfaces };
}
export const serializeRouterState = (state: RouterState): string => JSON.stringify(canonicalizeRouterState(state));
export const createRouterState = (partial: { hostname?: string; interfaces?: Record<string, RouterInterfaceConfig> } = {}): RouterState =>
  canonicalizeRouterState({ v: ROUTER_STATE_VERSION, device: "router", hostname: partial.hostname && isValidHostname(partial.hostname) ? partial.hostname : DEFAULT_ROUTER_HOSTNAME, interfaces: partial.interfaces ?? {} });
export const createRouterSession = (state: RouterState): RouterSession => ({ state: canonicalizeRouterState(state), mode: "user" });
export const routerPromptFor = (session: Pick<RouterSession, "state" | "mode">): string => session.state.hostname + ROUTER_MODE_SUFFIX[session.mode];

export type NormalizeRouterStateResult = { ok: true; state: RouterState } | { ok: false; code: "ROUTER_STATE_INVALID"; detail: string };
/** Strict ingest of an UNTRUSTED router state: exact versioned shape, known ports, complete usable addresses, no overlaps, no extra keys. */
export function normalizeRouterState(raw: unknown): NormalizeRouterStateResult {
  const fail = (detail: string): NormalizeRouterStateResult => ({ ok: false, code: "ROUTER_STATE_INVALID", detail });
  if (!isObj(raw)) return fail("not an object");
  const keys = Object.keys(raw);
  if (keys.some(k => FORBIDDEN_KEYS.has(k)) || keys.some(k => !["v", "device", "hostname", "interfaces"].includes(k))) return fail("unknown key");
  if (raw.v !== ROUTER_STATE_VERSION) return fail("unsupported state version");
  if (raw.device !== "router") return fail("unsupported device");
  if (typeof raw.hostname !== "string" || !isValidHostname(raw.hostname)) return fail("hostname");
  if (!isObj(raw.interfaces)) return fail("shape");
  const interfaces: Record<string, RouterInterfaceConfig> = {};
  for (const port of Object.keys(raw.interfaces)) {
    if (FORBIDDEN_KEYS.has(port) || !isRouterPort(port)) return fail("interface " + port);
    const c = raw.interfaces[port];
    if (!isObj(c) || Object.keys(c).some(f => !["ipAddress", "subnetMask", "shutdown"].includes(f))) return fail("interface fields " + port);
    const out: RouterInterfaceConfig = {};
    if (c.shutdown !== undefined) { if (typeof c.shutdown !== "boolean") return fail("shutdown " + port); out.shutdown = c.shutdown; }
    if (c.ipAddress !== undefined || c.subnetMask !== undefined) {
      if (typeof c.ipAddress !== "string" || typeof c.subnetMask !== "string" || !isIpv4(c.ipAddress) || !isSubnetMask(c.subnetMask) || !isUsableHostAddress(c.ipAddress, c.subnetMask)) return fail("address " + port);
      for (const other of Object.keys(interfaces)) { const o = interfaces[other]; if (o.ipAddress && o.subnetMask && networksOverlap(c.ipAddress, c.subnetMask, o.ipAddress, o.subnetMask)) return fail("overlap " + port); }
      out.ipAddress = c.ipAddress; out.subnetMask = c.subnetMask;
    }
    interfaces[port] = out;
  }
  return { ok: true, state: canonicalizeRouterState({ v: ROUTER_STATE_VERSION, device: "router", hostname: raw.hostname, interfaces }) };
}

// ── the closed command grammar ─────────────────────────────────────────────────────────────────────────────────────────────────────
type ShowWhat = "running-config" | "ip-interface-brief" | "ip-route";
type ParsedCommand =
  | { id: "help" } | { id: "enable" } | { id: "disable" } | { id: "configure-terminal" } | { id: "exit" } | { id: "end" }
  | { id: "hostname"; name: string } | { id: "interface"; name: string } | { id: "ip-address"; address: string; mask: string } | { id: "no-ip-address" }
  | { id: "shutdown" } | { id: "no-shutdown" } | { id: "show"; what: ShowWhat };
export type RouterCommandId = ParsedCommand["id"];
type ArgResult = ParsedCommand | { incomplete: string } | { invalid: string };
type CommandSpec = { id: RouterCommandId; keywords: readonly (readonly string[])[]; modes: readonly RouterMode[]; syntax: string; args: (rest: string[]) => ArgResult };
const CONFIG_MODES: readonly RouterMode[] = ["global", "interface"];
const NOT_USER: readonly RouterMode[] = ["privileged", ...CONFIG_MODES];
const ALL: readonly RouterMode[] = ["user", ...NOT_USER];
const none = (id: RouterCommandId) => (rest: string[]): ArgResult => (rest.length ? { invalid: "this command takes no further values" } : ({ id } as ParsedCommand));
const showOf = (what: ShowWhat) => (rest: string[]): ArgResult => (rest.length ? { invalid: "unexpected values: " + rest.join(" ") } : { id: "show", what });

export const ROUTER_COMMAND_TABLE: readonly CommandSpec[] = Object.freeze([
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
      if (rest[0].length > ROUTER_CLI_LIMITS.hostnameChars) return { invalid: "hostname too long (max " + ROUTER_CLI_LIMITS.hostnameChars + " characters)" };
      return isValidHostname(rest[0]) ? { id: "hostname", name: rest[0] } : { invalid: "hostname contains one or more illegal characters" };
    }
  },
  {
    id: "interface", keywords: [["interface"], ["int"]], modes: ["global", "interface"], syntax: "interface GigabitEthernet0/<0-3>",
    args: rest => {
      if (rest.length === 0) return { incomplete: "an interface name is required (e.g. gigabitEthernet 0/0)" };
      const name = normalizeRouterInterfaceName(rest.join(""));
      return name ? { id: "interface", name } : { invalid: "invalid interface: " + rest.join(" ") + " does not exist on this router (GigabitEthernet0/0 - 0/3)" };
    }
  },
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
  { id: "no-ip-address", keywords: [["no", "ip", "address"], ["no", "ip", "addr"]], modes: ["interface"], syntax: "no ip address", args: none("no-ip-address") },
  { id: "no-shutdown", keywords: [["no", "shutdown"], ["no", "shut"]], modes: ["interface"], syntax: "no shutdown", args: none("no-shutdown") },
  { id: "shutdown", keywords: [["shutdown"], ["shut"]], modes: ["interface"], syntax: "shutdown", args: none("shutdown") },
  { id: "show", keywords: [["show", "running-config"], ["show", "run"]], modes: NOT_USER, syntax: "show running-config", args: showOf("running-config") },
  { id: "show", keywords: [["show", "ip", "interface", "brief"], ["show", "ip", "int", "brief"], ["show", "ip", "int", "br"]], modes: ALL, syntax: "show ip interface brief", args: showOf("ip-interface-brief") },
  { id: "show", keywords: [["show", "ip", "route"], ["show", "ip", "ro"]], modes: ALL, syntax: "show ip route", args: showOf("ip-route") }
]);

const LATER = "هذه الميزة مخطّطة لمرحلة لاحقة من محاكي الشبكات";
/** Recognised but deliberately UNSUPPORTED families (v1): an explicit refusal instead of a generic one. */
const NOT_SUPPORTED: readonly { match: (t: string[]) => boolean; text: string; hint: string }[] = Object.freeze([
  { match: t => (t[0] === "interface" || t[0] === "int") && t[1] === "range", text: "interface range is not supported in this simulator (v1)", hint: "اختر واجهة واحدة في كل مرة: interface gigabitEthernet 0/0" },
  { match: t => t[0] === "ip" && t[1] === "route", text: "static routing is not supported in this simulator version", hint: "التوجيه الثابت غير مدعوم في هذا الإصدار؛ يوجّه الراوتر بين الشبكات المتصلة به مباشرة فقط. " + LATER },
  { match: t => t[0] === "router", text: "dynamic routing protocols are not supported in this simulator version", hint: "بروتوكولات التوجيه الديناميكي (OSPF / EIGRP / RIP) غير مدعومة بعد. " + LATER },
  { match: t => (t[0] === "ip" && t[1] === "dhcp") || t[0] === "service", text: "DHCP is not supported in this simulator version", hint: "اضبط عناوين الحواسيب يدويًا. " + LATER },
  { match: t => t[0] === "access-list" || (t[0] === "ip" && (t[1] === "access-group" || t[1] === "access-list")), text: "access control lists are not supported in this simulator version", hint: "قوائم التحكم بالوصول (ACL) غير مدعومة بعد. " + LATER },
  { match: t => t[0] === "ip" && t[1] === "nat", text: "NAT / PAT is not supported in this simulator version", hint: "ترجمة العناوين (NAT) غير مدعومة بعد. " + LATER },
  { match: t => t[0] === "encapsulation", text: "sub-interfaces and 802.1Q encapsulation are not supported in this simulator version", hint: "Router-on-a-Stick والواجهات الفرعية غير مدعومة بعد. " + LATER },
  { match: t => t[0] === "vlan" || t[0] === "switchport" || (t[0] === "show" && t[1] === "vlan"), text: "this is a switch command; this device is a router", hint: "أوامر VLAN و switchport تُنفَّذ على المبدّل (Switch)، لا على الراوتر." },
  { match: t => t[0] === "no" && !(t[1] === "shutdown" || t[1] === "shut" || (t[1] === "ip" && (t[2] === "address" || t[2] === "addr"))), text: "the 'no' form of this command is not supported in this simulator (v1)", hint: "يدعم المحاكي no shutdown و no ip address فقط" },
  { match: t => t[0] === "write" || t[0] === "wr" || t[0] === "copy", text: "saving to startup-config is not simulated (v1); the running configuration is what counts", hint: "لا حاجة للحفظ: الإعداد الجاري (running-config) هو ما يُقيَّم" },
  { match: t => t[0] === "ping" || t[0] === "traceroute" || t[0] === "telnet" || t[0] === "ssh", text: "packet tests from the router are not simulated (v1)", hint: "استخدم «اختبار الاتصال» من لوحة الحاسوب (PC) لاختبار الوصول بين الأجهزة" },
  { match: t => t[0] === "reload" || t[0] === "erase" || t[0] === "delete" || t[0] === "debug", text: "this command is not supported in this simulator (v1)", hint: "الأمر غير مدعوم في هذا المحاكي التعليمي" }
]);

export type RouterParseResult =
  | { kind: "empty" } | { kind: "refused"; detail: string } | { kind: "unknown" } | { kind: "not-supported"; detail: string; hint: string }
  | { kind: "incomplete"; id: RouterCommandId; detail: string; syntax: string } | { kind: "invalid"; id: RouterCommandId; detail: string; syntax: string }
  | { kind: "ok"; command: ParsedCommand; spec: CommandSpec; viaDo: boolean };
const tokenize = (raw: string): string[] => raw.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
const startsWith = (tokens: string[], seq: readonly string[]) => seq.length <= tokens.length && seq.every((k, i) => tokens[i].toLowerCase() === k);

/** Parses ONE input line against the closed grammar (the mode is checked by executeRouterCommand). Never throws on any input. */
export function parseRouterCommand(raw: unknown): RouterParseResult {
  if (typeof raw !== "string") return { kind: "empty" };
  if (raw.length > ROUTER_CLI_LIMITS.inputChars) return { kind: "refused", detail: "line too long (max " + ROUTER_CLI_LIMITS.inputChars + " characters)" };
  let tokens = tokenize(raw);
  if (tokens.length === 0) return { kind: "empty" };
  if (tokens.length > ROUTER_CLI_LIMITS.tokens) return { kind: "refused", detail: "too many words in one command (max " + ROUTER_CLI_LIMITS.tokens + ")" };
  let viaDo = false;
  if (tokens[0].toLowerCase() === "do" && tokens.length > 1) { viaDo = true; tokens = tokens.slice(1); }
  const lower = tokens.map(t => t.toLowerCase());
  for (const ns of NOT_SUPPORTED) if (ns.match(lower)) return { kind: "not-supported", detail: ns.text, hint: ns.hint };
  for (const spec of ROUTER_COMMAND_TABLE) {
    for (const seq of spec.keywords) {
      if (!startsWith(tokens, seq)) continue;
      if (viaDo && spec.id !== "show") return { kind: "unknown" };
      const r = spec.args(tokens.slice(seq.length));
      if ("incomplete" in r) return { kind: "incomplete", id: spec.id, detail: r.incomplete, syntax: spec.syntax };
      if ("invalid" in r) return { kind: "invalid", id: spec.id, detail: r.invalid, syntax: spec.syntax };
      return { kind: "ok", command: r, spec, viaDo };
    }
  }
  for (const spec of ROUTER_COMMAND_TABLE) for (const seq of spec.keywords) if (tokens.length < seq.length && lower.every((t, i) => t === seq[i])) return { kind: "incomplete", id: spec.id, detail: "incomplete command", syntax: spec.syntax };
  return { kind: "unknown" };
}

// ── execution ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type RouterExecStatus = "empty" | "refused" | "unknown" | "not-supported" | "incomplete" | "invalid" | "wrong-mode" | "ok";
export type RouterExecResult = { status: RouterExecStatus; output: string[]; hint?: string; changed: boolean };
const EXIT_TO: Record<RouterMode, RouterMode> = { user: "user", privileged: "user", global: "privileged", interface: "global" };
const MODE_HOWTO: Record<RouterMode, string> = { user: "اكتب disable للعودة إلى وضع المستخدم", privileged: "اكتب enable أولًا", global: "اكتب enable ثم configure terminal", interface: "ادخل إلى واجهة أولًا: interface gigabitEthernet 0/0" };
const modeEnglish = (m: RouterMode) => ({ user: "user EXEC mode", privileged: "privileged EXEC mode", global: "global configuration mode", interface: "interface configuration mode" })[m];
const unselect = (s: RouterSession): RouterSession => ({ state: s.state, mode: s.mode });
const result = (status: RouterExecStatus, output: string[], hint?: string, changed = false): RouterExecResult => (hint === undefined ? { status, output, changed } : { status, output, hint, changed });
const capital = (t: string) => t[0].toUpperCase() + t.slice(1);
function helpLines(mode: RouterMode): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const c of ROUTER_COMMAND_TABLE) if (c.modes.includes(mode) && c.id !== "help" && !seen.has(c.syntax)) { seen.add(c.syntax); out.push("  " + c.syntax); }
  return out;
}
export const routerCommandSyntaxFor = (mode: RouterMode): string[] => helpLines(mode).map(l => l.trim());

/** Executes ONE input line: parse → mode check → apply. Every refusal returns the SAME session untouched. Never throws on any input. */
export function executeRouterCommand(session: RouterSession, raw: unknown, ctx: RouterExecContext = {}): { session: RouterSession; result: RouterExecResult } {
  const p = parseRouterCommand(raw);
  switch (p.kind) {
    case "empty": return { session, result: result("empty", []) };
    case "refused": return { session, result: result("refused", ["% " + capital(p.detail) + "."], "تجاوز السطر الحدود المسموحة ولم يُنفَّذ.") };
    case "unknown": return { session, result: result("unknown", ["% Invalid input detected."], "أمر غير معروف في هذا المحاكي. اكتب ? لعرض أوامر الوضع الحالي.") };
    case "not-supported": return { session, result: result("not-supported", ["% " + capital(p.detail) + "."], p.hint) };
    case "incomplete": return { session, result: result("incomplete", ["% Incomplete command."], "الصيغة: " + p.syntax + " — " + p.detail) };
    case "invalid": return { session, result: result("invalid", ["% " + capital(p.detail) + "."], "الصيغة: " + p.syntax) };
    case "ok": break;
  }
  const { command, spec, viaDo } = p;
  if (viaDo && !CONFIG_MODES.includes(session.mode)) return { session, result: result("wrong-mode", ["% 'do' is only available in configuration modes."], "اكتب أمر العرض مباشرة في هذا الوضع.") };
  if (!spec.modes.includes(session.mode)) return { session, result: result("wrong-mode", ["% This command is not available in " + modeEnglish(session.mode) + "."], "هذا الأمر يعمل في " + spec.modes.map(m => ROUTER_MODE_LABEL[m]).join(" أو ") + ". " + MODE_HOWTO[spec.modes[0]]) };
  return apply(session, command, ctx);
}

function withInterface(s: RouterSession, f: (c: RouterInterfaceConfig) => RouterInterfaceConfig): RouterSession {
  const port = s.selectedInterface!;
  return { ...s, state: canonicalizeRouterState({ ...s.state, interfaces: { ...s.state.interfaces, [port]: f({ ...(s.state.interfaces[port] ?? {}) }) } }) };
}
function apply(s: RouterSession, cmd: ParsedCommand, ctx: RouterExecContext): { session: RouterSession; result: RouterExecResult } {
  const ok = (session: RouterSession, output: string[] = [], hint?: string) => ({ session, result: result("ok", output, hint, serializeRouterState(session.state) !== serializeRouterState(s.state)) });
  switch (cmd.id) {
    case "help": return ok(s, helpLines(s.mode));
    case "enable": return ok(s.mode === "privileged" ? s : { ...unselect(s), mode: "privileged" });
    case "disable": return ok({ ...unselect(s), mode: "user" });
    case "configure-terminal": return ok({ ...unselect(s), mode: "global" }, ["Enter configuration commands, one per line.  End with CNTL/Z."]);
    case "end": return ok(s.mode === "user" || s.mode === "privileged" ? s : { ...unselect(s), mode: "privileged" });
    case "exit": return ok(s.mode === "user" ? s : { ...unselect(s), mode: EXIT_TO[s.mode] });
    case "hostname": return ok({ ...s, state: canonicalizeRouterState({ ...s.state, hostname: cmd.name }) });
    case "interface": return ok({ ...unselect(s), mode: "interface", selectedInterface: cmd.name });
    case "ip-address": {
      const port = s.selectedInterface!;
      for (const other of ROUTER_PORTS) {
        if (other === port) continue;
        const o = effectiveRouterInterface(s.state, other);
        if (o.ipAddress && o.subnetMask && networksOverlap(cmd.address, cmd.mask, o.ipAddress, o.subnetMask))
          return { session: s, result: result("invalid", ["% " + networkAddress(cmd.address, cmd.mask) + " overlaps with " + displayRouterInterface(other)], "لكل واجهة على الراوتر شبكة مستقلة؛ هذه الشبكة متداخلة مع شبكة " + displayRouterInterface(other) + ".") };
      }
      return ok(withInterface(s, c => ({ ...c, ipAddress: cmd.address, subnetMask: cmd.mask })));
    }
    case "no-ip-address": return ok(withInterface(s, c => { const n = { ...c }; delete n.ipAddress; delete n.subnetMask; return n; }));
    case "shutdown": return ok(withInterface(s, c => ({ ...c, shutdown: true })));
    case "no-shutdown": return ok(withInterface(s, c => ({ ...c, shutdown: false })));
    case "show": return ok(s, cmd.what === "running-config" ? showRouterRunningConfig(s.state) : cmd.what === "ip-interface-brief" ? showRouterIpInterfaceBrief(s.state, ctx) : showRouterIpRoute(s.state, ctx));
  }
}

/** Replays a bounded command history from an initial state: the ONE way every surface rebuilds a router session. */
export type RouterReplayEntry = { input: string; prompt: string; result: RouterExecResult };
export function replayRouterCommands(initial: RouterState, commands: readonly unknown[], ctx: RouterExecContext = {}): { session: RouterSession; entries: RouterReplayEntry[]; truncated: boolean } {
  let session = createRouterSession(initial);
  const entries: RouterReplayEntry[] = [];
  const list = Array.isArray(commands) ? commands : [];
  for (const raw of list.slice(0, ROUTER_CLI_LIMITS.commands)) {
    const input = typeof raw === "string" ? raw : "";
    const prompt = routerPromptFor(session);
    const r = executeRouterCommand(session, input, ctx);
    session = r.session;
    entries.push({ input, prompt, result: r.result });
  }
  return { session, entries, truncated: list.length > ROUTER_CLI_LIMITS.commands };
}

// ── show commands: rendered from canonical state (+ optional physical link context) ─────────────────────────────────────────────────
const pad = (s: string, n: number) => (s.length >= n ? s + " " : s.padEnd(n));
/** Line protocol of an interface: administratively down / down (no operational link) / up. */
export function routerInterfaceStatus(state: RouterState, port: string, ctx: RouterExecContext = {}): { status: "administratively down" | "down" | "up"; protocol: "down" | "up" } {
  if (effectiveRouterInterface(state, port).shutdown) return { status: "administratively down", protocol: "down" };
  const up = ctx.linkUp ? ctx.linkUp(port) : true;
  return up ? { status: "up", protocol: "up" } : { status: "down", protocol: "down" };
}
export function showRouterRunningConfig(state: RouterState): string[] {
  const c = canonicalizeRouterState(state);
  const out = ["Building configuration...", "", "Current configuration:", "!", "hostname " + c.hostname, "!"];
  for (const port of ROUTER_PORTS) {
    const e = effectiveRouterInterface(c, port);
    out.push("interface " + displayRouterInterface(port));
    out.push(e.ipAddress ? " ip address " + e.ipAddress + " " + e.subnetMask : " no ip address");
    if (e.shutdown) out.push(" shutdown");
    out.push("!");
  }
  out.push("end");
  return out;
}
export function showRouterIpInterfaceBrief(state: RouterState, ctx: RouterExecContext = {}): string[] {
  const c = canonicalizeRouterState(state);
  const out = [pad("Interface", 23) + pad("IP-Address", 16) + "OK? Method " + pad("Status", 22) + "Protocol"];
  for (const port of ROUTER_PORTS) {
    const e = effectiveRouterInterface(c, port), st = routerInterfaceStatus(c, port, ctx);
    out.push(pad(displayRouterInterface(port), 23) + pad(e.ipAddress ?? "unassigned", 16) + "YES " + pad(e.ipAddress ? "manual" : "unset", 7) + pad(st.status, 22) + st.protocol);
  }
  return out;
}
/** Directly-connected networks of the interfaces whose line protocol is up (the only routes in v1). */
export function routerConnectedNetworks(state: RouterState, ctx: RouterExecContext = {}): { port: string; ipAddress: string; subnetMask: string; network: string; prefix: number }[] {
  const out: { port: string; ipAddress: string; subnetMask: string; network: string; prefix: number }[] = [];
  for (const port of ROUTER_PORTS) {
    const e = effectiveRouterInterface(state, port);
    if (!e.ipAddress || !e.subnetMask || routerInterfaceStatus(state, port, ctx).protocol !== "up") continue;
    out.push({ port, ipAddress: e.ipAddress, subnetMask: e.subnetMask, network: networkAddress(e.ipAddress, e.subnetMask), prefix: prefixLength(e.subnetMask) });
  }
  return out;
}
export function showRouterIpRoute(state: RouterState, ctx: RouterExecContext = {}): string[] {
  const out = ["Codes: L - local, C - connected, S - static, R - RIP, O - OSPF, D - EIGRP", "", "Gateway of last resort is not set", ""];
  for (const n of routerConnectedNetworks(canonicalizeRouterState(state), ctx)) {
    out.push("C    " + n.network + "/" + n.prefix + " is directly connected, " + displayRouterInterface(n.port));
    out.push("L    " + n.ipAddress + "/32 is directly connected, " + displayRouterInterface(n.port));
  }
  return out;
}
