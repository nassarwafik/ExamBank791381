// N2 (docs/enterprise-network-lab-tool-design.md §7) — the network LAB's model extensions, client-only (never in the shared server build).
//
// What the lab adds to networkTopology@2's configuration and device states, for the networks the learner builds in «مختبر الشبكات»:
//   • the HUB (a seventh, lab-only device kind with ports f0/1–f0/8: it repeats every frame, one collision domain, no configuration);
//   • the router's SERIAL WAN ports s0/0/0 and s0/0/1 (a serial cable joins two routers' serial ports only);
//   • the lab router state that networkTopology@2's router state does not hold: serial interfaces, static routes, RIP / OSPF / EIGRP,
//     ACLs, NAT and IPv6 — kept NEXT TO the exam's router state, never inside it;
//   • a host's IPv6 address.
// validateLabConfig accepts a lab network: its hub and serial parts are checked here, everything else by validateNet2Config itself.
import { ROUTER_PORTS } from "../routerCliEngine";
import { NET2_LIMITS, devicePorts, isNet2Id, validateNet2Config, type Net2Config, type Net2Device } from "../net2Model";
import { hasControlChar, isObj } from "../net2Common";

export const SERIAL_PORTS: readonly string[] = Object.freeze(["s0/0/0", "s0/0/1"]);
export const HUB_PORTS: readonly string[] = Object.freeze(Array.from({ length: 8 }, (_, i) => "f0/" + (i + 1)));
export const isSerialPort = (p: string): boolean => SERIAL_PORTS.includes(p);
export const isHub = (d: { kind: string } | undefined): boolean => d?.kind === "hub";
/** The ports of a device in the lab: a router's four GigabitEthernet and two serial ports, a hub's eight ports, otherwise the simulator's own. */
export function labDevicePorts(d: Net2Device): readonly string[] {
  if (isHub(d)) return HUB_PORTS;
  if (d.kind === "router") return [...ROUTER_PORTS, ...SERIAL_PORTS];
  return devicePorts(d);
}

/** A lab network: hubs and serial cables checked here, the rest by networkTopology@2's own validator (so it can hold nothing else). */
export function validateLabConfig(raw: unknown): { ok: true; config: Net2Config } | { ok: false; message: string } {
  const fail = (message: string) => ({ ok: false as const, message });
  if (!isObj(raw) || Object.keys(raw).some(k => !["v", "devices", "links"].includes(k)) || raw.v !== 2) return fail("إعداد الشبكة غير صالح.");
  if (!Array.isArray(raw.devices) || !Array.isArray(raw.links)) return fail("الأجهزة والوصلات يجب أن تكون قوائم.");
  if (raw.devices.length > NET2_LIMITS.devices) return fail("عدد الأجهزة يتجاوز " + NET2_LIMITS.devices + ".");
  if (raw.links.length > NET2_LIMITS.links) return fail("عدد الكوابل يتجاوز " + NET2_LIMITS.links + ".");
  const hubs: Net2Device[] = [];
  for (const d of raw.devices) {
    if (!isObj(d) || d.kind !== "hub") continue;
    if (Object.keys(d).some(k => !["id", "kind", "label", "x", "y"].includes(k)) || !isNet2Id(d.id)) return fail("جهاز Hub غير صالح.");
    if (typeof d.label !== "string" || !d.label.trim() || d.label.length > NET2_LIMITS.labelChars || hasControlChar(d.label)) return fail("اسم الجهاز " + String(d.id) + " غير صالح.");
    if (typeof d.x !== "number" || typeof d.y !== "number" || !(d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1)) return fail("موضع الجهاز " + d.id + " يجب أن يكون بين 0 و1.");
    hubs.push({ id: d.id, kind: "hub" as Net2Device["kind"], label: d.label, x: d.x, y: d.y });
  }
  const hubIds = new Set(hubs.map(h => h.id));
  const isLabLink = (l: unknown) => isObj(l) && [l.a, l.b].some(e => isObj(e) && (hubIds.has(e.deviceId as string) || isSerialPort(String(e.port))));
  const others = raw.devices.filter(d => !(isObj(d) && d.kind === "hub"));
  const base = validateNet2Config({ v: 2, devices: others, links: raw.links.filter(l => !isLabLink(l)) });
  if (!base.ok) return fail(base.issues[0]?.message ?? "الشبكة غير صالحة.");
  const byId = new Map<string, Net2Device>(base.config.devices.map(d => [d.id, d]));
  for (const h of hubs) { if (byId.has(h.id)) return fail("معرّف جهاز مكرّر: " + h.id); byId.set(h.id, h); }
  const used = new Set(base.config.links.flatMap(l => [l.a, l.b]).map(e => e.deviceId + "|" + e.port));
  const linkIds = new Set(base.config.links.map(l => l.id));
  const labLinks = new Map<string, Net2Config["links"][number]>();
  for (const l of raw.links) {
    if (!isLabLink(l)) continue;
    const o = l as Record<string, unknown>;
    if (Object.keys(o).some(k => !["id", "a", "b"].includes(k)) || !isNet2Id(o.id) || linkIds.has(o.id)) return fail("كابل غير صالح.");
    const ends: { deviceId: string; port: string }[] = [];
    for (const e of [o.a, o.b] as Record<string, unknown>[]) {
      if (Object.keys(e).sort().join(",") !== "deviceId,port" || typeof e.deviceId !== "string" || typeof e.port !== "string") return fail("طرف الكابل " + o.id + " غير صالح.");
      const d = byId.get(e.deviceId);
      if (!d) return fail("الكابل " + o.id + " يشير إلى جهاز غير موجود.");
      if (!labDevicePorts(d).includes(e.port)) return fail("المنفذ " + e.port + " غير موجود في الجهاز " + d.label + ".");
      if (used.has(e.deviceId + "|" + e.port)) return fail("المنفذ " + e.port + " في الجهاز " + d.label + " مستخدم في كابل آخر.");
      ends.push({ deviceId: e.deviceId, port: e.port });
    }
    if (ends[0].deviceId === ends[1].deviceId) return fail("لا يمكن وصل الجهاز بنفسه.");
    const serial = ends.map(e => isSerialPort(e.port));
    if (serial[0] !== serial[1]) return fail("الكابل التسلسلي (Serial) يصل منفذ Serial في راوتر بمنفذ Serial في راوتر آخر فقط.");
    for (const e of ends) used.add(e.deviceId + "|" + e.port);
    linkIds.add(o.id);
    labLinks.set(o.id, { id: o.id, a: ends[0], b: ends[1] });
  }
  // the original order of the devices and the cables
  const devices = (raw.devices as Record<string, unknown>[]).map(d => byId.get(String(d.id))!);
  const baseLinks = new Map(base.config.links.map(l => [l.id, l]));
  const links = (raw.links as Record<string, unknown>[]).map(l => labLinks.get(String(l.id)) ?? baseLinks.get(String(l.id))!);
  return { ok: true, config: { v: 2, devices, links } };
}

// ── IPv6 arithmetic (128-bit as bigint) ───────────────────────────────────────────────────────────────────────────────────────────────
const FULL = (1n << 128n) - 1n;
/** A textual IPv6 address (full or with one "::") → 128-bit value; null when malformed. No zone ids, no embedded IPv4. */
export function parseIpv6(raw: string): bigint | null {
  if (typeof raw !== "string" || raw.length > 45) return null;
  const s = raw.toLowerCase();
  if (!/^[0-9a-f:]+$/.test(s) || (s.match(/::/g) ?? []).length > 1 || /:::/.test(s)) return null;
  const [head, tail] = s.includes("::") ? s.split("::") : [s, undefined];
  const hs = head ? head.split(":") : [], ts = tail === undefined ? [] : tail ? tail.split(":") : [];
  if ([...hs, ...ts].some(g => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const fill = 8 - hs.length - ts.length;
  if (tail === undefined ? hs.length !== 8 : fill < 1) return null;
  const groups = [...hs, ...Array(tail === undefined ? 0 : fill).fill("0"), ...ts];
  return groups.reduce((n, g) => (n << 16n) | BigInt(parseInt(g, 16)), 0n);
}
/** 128-bit value → the canonical compressed lowercase text (RFC 5952: the longest run of ≥ 2 zero groups becomes "::"). */
export function formatIpv6(n: bigint): string {
  const g = Array.from({ length: 8 }, (_, i) => Number((n >> BigInt((7 - i) * 16)) & 0xffffn));
  let best = -1, bestLen = 0;
  for (let i = 0; i < 8;) { if (g[i] !== 0) { i++; continue; } let j = i; while (j < 8 && g[j] === 0) j++; if (j - i > bestLen && j - i >= 2) { best = i; bestLen = j - i; } i = j; }
  const hex = (a: number[]) => a.map(x => x.toString(16)).join(":");
  return best < 0 ? hex(g) : hex(g.slice(0, best)) + "::" + hex(g.slice(best + bestLen));
}
export const v6Mask = (len: number): bigint => (len === 0 ? 0n : (FULL << BigInt(128 - len)) & FULL);
export const v6SamePrefix = (a: bigint, b: bigint, len: number): boolean => (a & v6Mask(len)) === (b & v6Mask(len));
/** "2001:db8::1/64" → canonical address and length (1–128); a global-scope address only (not ::, not link-local fe80::/10, not multicast ff00::/8). */
export function parseIpv6Prefix(raw: string, { network = false } = {}): { addr: string; len: number } | null {
  const m = /^([0-9A-Fa-f:]+)\/(\d{1,3})$/.exec(typeof raw === "string" ? raw.trim() : "");
  if (!m) return null;
  const n = parseIpv6(m[1]), len = Number(m[2]);
  if (n === null || len > 128 || (!network && len < 1)) return null;
  if (!network && (n === 0n || (n >> 118n) === 0x3fan || (n >> 120n) === 0xffn)) return null;
  return { addr: formatIpv6(network ? n & v6Mask(len) : n), len };
}
export const v6Display = (s: string): string => s.toUpperCase();

// ── lab state ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type LabMatch = { any: true } | { ip: string; wild: string };
export type LabAclEntry = { action: "permit" | "deny"; proto: "ip" | "icmp" | "tcp" | "udp"; src: LabMatch; dst?: LabMatch; port?: number };
export type LabSerial = { ip?: string; mask?: string; up?: true; encap?: "ppp"; clock?: number };
export type LabRouter = {
  serial: Record<string, LabSerial>;
  /** `via`: a next-hop IPv4 address or an exit interface name (g0/1, s0/0/0). */
  routes: { net: string; mask: string; via: string }[];
  rip?: { networks: string[]; originate?: true };
  ospf?: { pid: number; networks: { net: string; wild: string; area: number }[]; originate?: true };
  eigrp?: { as: number; networks: { net: string; wild?: string }[] };
  acls: Record<string, LabAclEntry[]>;
  ifAcl: Record<string, { in?: string; out?: string }>;
  nat: { inside: string[]; outside: string[]; statics: { local: string; global: string }[]; overload?: { acl: string; iface: string } };
  v6: { routing: boolean; ifs: Record<string, { addr: string; len: number }>; routes: { prefix: string; len: number; via: string }[] };
};
export const emptyLabRouter = (): LabRouter => ({ serial: {}, routes: [], acls: {}, ifAcl: {}, nat: { inside: [], outside: [], statics: [] }, v6: { routing: false, ifs: {}, routes: [] } });
export type LabHost6 = { iface: "eth0" | "wlan0"; addr: string; len: number; gw: string };
export type LabData = { routers: Record<string, LabRouter>; hosts6: Record<string, LabHost6> };
export const LAB_LIMITS = Object.freeze({ routes: 32, networks: 16, acls: 16, aclEntries: 32, statics: 16, v6Routes: 16, ipv6ActionsPerHost: 50 });
