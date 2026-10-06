// Phase 20B — the networkTopology@1 MODEL (pure; compiled into the shared server build): the PUBLIC topology configuration the teacher
// authors (devices + links + optional initial device states), its STRICT validator, the per-kind port inventories, the PC network
// configuration and the canonical, versioned topology STATE the plugin derives by replay and the checks are evaluated against.
//
// Identity is always the stable id — a device's label is display text and a link's position in the array means nothing: relabelling or
// reordering never changes what is graded. Positions are normalized (0..1) presentation data only; nothing graded ever reads them.
// Switches are networkCli@1 devices (the SAME canonical switch state and engine); routers use the router CLI v1 engine; a PC is a small
// canonical address configuration. Bounds: ≤ 20 devices, ≤ 40 links — enough for a classroom topology, small enough that every replay,
// flood and check stays trivially bounded.
import { SWITCH_PORTS, canonicalizeState, createDeviceState, isIpv4, isSubnetMask, isUsableHostAddress, normalizeDeviceState, type NetworkCliDeviceState } from "./networkCliEngine";
import { ROUTER_PORTS, canonicalizeRouterState, createRouterState, normalizeRouterState, type RouterState } from "./routerCliEngine";

export const NETWORK_TOPOLOGY_PLUGIN_KEY = "networkTopology";
export const NETWORK_TOPOLOGY_PLUGIN_VERSION = 1;
export const TOPOLOGY_CONFIG_VERSION = 1 as const;
export const TOPOLOGY_STATE_VERSION = 1 as const;
export const TOPOLOGY_LIMITS = Object.freeze({ devices: 20, links: 40, labelChars: 24, commandsPerDevice: 300, actions: 1000, pcValueChars: 15 });
export type TopologyDeviceKind = "router" | "switch" | "pc";
export const TOPOLOGY_DEVICE_KINDS: readonly TopologyDeviceKind[] = Object.freeze(["router", "switch", "pc"]);
export const PC_PORTS: readonly string[] = Object.freeze(["eth0"]);
export const devicePorts = (kind: TopologyDeviceKind): readonly string[] => (kind === "router" ? ROUTER_PORTS : kind === "switch" ? SWITCH_PORTS : PC_PORTS);

export type PcConfig = { address?: string; mask?: string; gateway?: string; dns?: string };
export const PC_FIELDS = Object.freeze(["address", "mask", "gateway", "dns"] as const);
export type PcField = (typeof PC_FIELDS)[number];
export type TopologyDevice = { id: string; kind: TopologyDeviceKind; label: string; x: number; y: number; initial?: PcConfig | NetworkCliDeviceState | RouterState };
export type TopologyEndpoint = { deviceId: string; port: string };
export type TopologyLink = { id: string; a: TopologyEndpoint; b: TopologyEndpoint };
export type NetworkTopologyConfigV1 = { v: typeof TOPOLOGY_CONFIG_VERSION; devices: TopologyDevice[]; links: TopologyLink[] };
/** The canonical graded state: per device kind, keyed by stable device id (sorted), each device in its own canonical form. */
export type NetworkTopologyStateV1 = { v: typeof TOPOLOGY_STATE_VERSION; pcs: Record<string, PcConfig>; switches: Record<string, NetworkCliDeviceState>; routers: Record<string, RouterState> };
export type TopologyIssue = { code: string; message: string; path?: string };

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const DEVICE_ID = /^[a-z][a-z0-9_-]{0,31}$/;
const LINK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const hasControlChar = (text: string): boolean => { for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c < 32 || c === 127) return true; } return false; };
export const isValidDeviceId = (id: unknown): id is string => typeof id === "string" && DEVICE_ID.test(id) && !FORBIDDEN.has(id);
export const isValidLinkId = (id: unknown): id is string => typeof id === "string" && LINK_ID.test(id) && !FORBIDDEN.has(id);
export const isValidDeviceLabel = (label: unknown): label is string => typeof label === "string" && !!label.trim() && label.length <= TOPOLOGY_LIMITS.labelChars && !hasControlChar(label);
const isUnit = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

/** A PC field value: "" (unset) or a dotted-quad IPv4 (a contiguous subnet mask for `mask`). */
export function isValidPcValue(field: PcField, value: unknown): value is string {
  if (typeof value !== "string" || value.length > TOPOLOGY_LIMITS.pcValueChars) return false;
  if (value === "") return true;
  return field === "mask" ? isSubnetMask(value) : isIpv4(value);
}
/** Canonical PC configuration: only non-empty, valid fields, in fixed key order. */
export function canonicalPcConfig(raw: PcConfig): PcConfig {
  const out: PcConfig = {};
  for (const f of PC_FIELDS) { const v = raw[f]; if (typeof v === "string" && v !== "" && isValidPcValue(f, v)) out[f] = v; }
  return out;
}
/** Strict initial PC configuration: known fields only, valid values, an address always with its mask (a usable host address). */
function normalizeInitialPc(raw: unknown): PcConfig | undefined {
  if (!isObj(raw) || Object.keys(raw).some(k => FORBIDDEN.has(k) || !(PC_FIELDS as readonly string[]).includes(k))) return undefined;
  for (const f of PC_FIELDS) if (raw[f] !== undefined && !isValidPcValue(f, raw[f])) return undefined;
  const c = canonicalPcConfig(raw as PcConfig);
  if ((c.address === undefined) !== (c.mask === undefined)) return undefined;
  if (c.address && c.mask && !isUsableHostAddress(c.address, c.mask)) return undefined;
  return c;
}

const CONFIG_KEYS = new Set(["v", "devices", "links"]);
const DEVICE_KEYS = new Set(["id", "kind", "label", "x", "y", "initial"]);
const LINK_KEYS = new Set(["id", "a", "b"]);
const ENDPOINT_KEYS = new Set(["deviceId", "port"]);
export type TopologyConfigResult = { ok: true; config: NetworkTopologyConfigV1; issues: [] } | { ok: false; issues: TopologyIssue[] };

/** THE strict public-config authority (finalization, projection, ingest, grader, review): canonical config or issues — never a repair. */
export function validateTopologyConfig(raw: unknown): TopologyConfigResult {
  const out: TopologyIssue[] = [];
  const err = (code: string, message: string, path?: string) => out.push(path === undefined ? { code, message } : { code, message, path });
  if (!isObj(raw)) return { ok: false, issues: [{ code: "NETTOPO_CONFIG_INVALID", message: "إعداد الشبكة مفقود أو غير صالح.", path: "config" }] };
  for (const k of Object.keys(raw)) if (!CONFIG_KEYS.has(k)) err("NETTOPO_CONFIG_UNKNOWN_KEY", "حقل غير معروف في إعداد الشبكة: " + k, "config." + k);
  if (raw.v !== TOPOLOGY_CONFIG_VERSION) err("NETTOPO_CONFIG_VERSION_UNSUPPORTED", "إصدار إعداد الشبكة غير مدعوم.", "config.v");
  if (!Array.isArray(raw.devices) || !Array.isArray(raw.links)) { err("NETTOPO_CONFIG_INVALID", "قائمة الأجهزة أو الوصلات غير صالحة.", "config"); return { ok: false, issues: out }; }
  if (raw.devices.length === 0) err("NETTOPO_NO_DEVICES", "أضف جهازًا واحدًا على الأقل إلى المخطط.", "config.devices");
  if (raw.devices.length > TOPOLOGY_LIMITS.devices) { err("NETTOPO_TOO_MANY_DEVICES", "عدد الأجهزة يتجاوز الحد (" + TOPOLOGY_LIMITS.devices + ").", "config.devices"); return { ok: false, issues: out }; }
  if (raw.links.length > TOPOLOGY_LIMITS.links) { err("NETTOPO_TOO_MANY_LINKS", "عدد الوصلات يتجاوز الحد (" + TOPOLOGY_LIMITS.links + ").", "config.links"); return { ok: false, issues: out }; }
  const devices: TopologyDevice[] = [];
  const kinds = new Map<string, TopologyDeviceKind>();
  raw.devices.forEach((d, i) => {
    const where = "config.devices[" + i + "]";
    if (!isObj(d) || Object.keys(d).some(k => !DEVICE_KEYS.has(k))) { err("NETTOPO_DEVICE_INVALID", "الجهاز رقم " + (i + 1) + " يحتوي حقولًا غير معروفة أو غير صالح.", where); return; }
    let ok = true;
    if (!isValidDeviceId(d.id)) { err("NETTOPO_DEVICE_ID_INVALID", "معرّف الجهاز رقم " + (i + 1) + " غير صالح (حروف إنجليزية صغيرة وأرقام، يبدأ بحرف).", where + ".id"); ok = false; }
    else if (kinds.has(d.id)) { err("NETTOPO_DEVICE_ID_DUPLICATE", "معرّف جهاز مكرر: " + d.id, where + ".id"); ok = false; }
    if (!(TOPOLOGY_DEVICE_KINDS as readonly unknown[]).includes(d.kind)) { err("NETTOPO_DEVICE_KIND_UNSUPPORTED", "نوع جهاز غير مدعوم في هذا الإصدار: " + String(d.kind) + " (المدعوم: راوتر، سويتش، حاسوب).", where + ".kind"); ok = false; }
    if (!isValidDeviceLabel(d.label)) { err("NETTOPO_DEVICE_LABEL_INVALID", "اسم العرض للجهاز رقم " + (i + 1) + " مطلوب (حتى " + TOPOLOGY_LIMITS.labelChars + " حرفًا).", where + ".label"); ok = false; }
    if (!isUnit(d.x) || !isUnit(d.y)) { err("NETTOPO_DEVICE_POSITION_INVALID", "موضع الجهاز رقم " + (i + 1) + " غير صالح.", where); ok = false; }
    if (!ok) return;
    const kind = d.kind as TopologyDeviceKind;
    const dev: TopologyDevice = { id: d.id as string, kind, label: d.label as string, x: d.x as number, y: d.y as number };
    if (d.initial !== undefined) {
      const init = kind === "pc" ? normalizeInitialPc(d.initial) : kind === "switch" ? (() => { const r = normalizeDeviceState(d.initial); return r.ok ? r.state : undefined; })() : (() => { const r = normalizeRouterState(d.initial); return r.ok ? r.state : undefined; })();
      if (!init) { err("NETTOPO_DEVICE_INITIAL_INVALID", "الحالة الابتدائية للجهاز «" + dev.label + "» غير صالحة.", where + ".initial"); return; }
      dev.initial = init;
    }
    kinds.set(dev.id, kind);
    devices.push(dev);
  });
  const links: TopologyLink[] = [];
  const linkIds = new Set<string>(), usedPorts = new Set<string>();
  raw.links.forEach((l, i) => {
    const where = "config.links[" + i + "]";
    if (!isObj(l) || Object.keys(l).some(k => !LINK_KEYS.has(k)) || !isObj(l.a) || !isObj(l.b) || Object.keys(l.a).some(k => !ENDPOINT_KEYS.has(k)) || Object.keys(l.b).some(k => !ENDPOINT_KEYS.has(k))) { err("NETTOPO_LINK_INVALID", "الوصلة رقم " + (i + 1) + " غير صالحة.", where); return; }
    let ok = true;
    if (!isValidLinkId(l.id)) { err("NETTOPO_LINK_INVALID", "معرّف الوصلة رقم " + (i + 1) + " غير صالح.", where + ".id"); ok = false; }
    else if (linkIds.has(l.id)) { err("NETTOPO_LINK_ID_DUPLICATE", "معرّف وصلة مكرر: " + l.id, where + ".id"); ok = false; }
    const ends: TopologyEndpoint[] = [];
    for (const side of ["a", "b"] as const) {
      const e = l[side] as Record<string, unknown>;
      const kind = typeof e.deviceId === "string" ? kinds.get(e.deviceId) : undefined;
      if (!kind) { err("NETTOPO_LINK_DEVICE_UNKNOWN", "طرف الوصلة رقم " + (i + 1) + " يشير إلى جهاز غير موجود: " + String(e.deviceId), where + "." + side); ok = false; continue; }
      if (typeof e.port !== "string" || !devicePorts(kind).includes(e.port)) { err("NETTOPO_LINK_PORT_INVALID", "المنفذ " + String(e.port) + " غير موجود على الجهاز " + String(e.deviceId) + ".", where + "." + side + ".port"); ok = false; continue; }
      ends.push({ deviceId: e.deviceId as string, port: e.port });
    }
    if (ends.length === 2 && ends[0].deviceId === ends[1].deviceId) { err("NETTOPO_LINK_SELF", "لا يمكن وصل جهاز بنفسه (الوصلة رقم " + (i + 1) + ").", where); ok = false; }
    if (ends.length === 2 && ok) for (const e of ends) { const k = e.deviceId + ":" + e.port; if (usedPorts.has(k)) { err("NETTOPO_PORT_IN_USE", "المنفذ " + e.port + " على " + e.deviceId + " موصول بأكثر من وصلة.", where); ok = false; } }
    if (!ok || ends.length !== 2) return;
    linkIds.add(l.id as string);
    for (const e of ends) usedPorts.add(e.deviceId + ":" + e.port);
    links.push({ id: l.id as string, a: ends[0], b: ends[1] });
  });
  if (out.length) return { ok: false, issues: out };
  return { ok: true, config: { v: TOPOLOGY_CONFIG_VERSION, devices, links }, issues: [] };
}

// ── canonical state ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const sortedIds = (config: NetworkTopologyConfigV1, kind: TopologyDeviceKind): string[] => config.devices.filter(d => d.kind === kind).map(d => d.id).sort();
export function initialTopologyState(config: NetworkTopologyConfigV1): NetworkTopologyStateV1 {
  const byId = new Map(config.devices.map(d => [d.id, d]));
  const pcs: Record<string, PcConfig> = {}, switches: Record<string, NetworkCliDeviceState> = {}, routers: Record<string, RouterState> = {};
  for (const id of sortedIds(config, "pc")) pcs[id] = canonicalPcConfig((byId.get(id)!.initial as PcConfig | undefined) ?? {});
  for (const id of sortedIds(config, "switch")) { const init = byId.get(id)!.initial as NetworkCliDeviceState | undefined; switches[id] = init ? canonicalizeState(init) : createDeviceState(); }
  for (const id of sortedIds(config, "router")) { const init = byId.get(id)!.initial as RouterState | undefined; routers[id] = init ? canonicalizeRouterState(init) : createRouterState(); }
  return { v: TOPOLOGY_STATE_VERSION, pcs, switches, routers };
}
/** The canonical form of a topology state: ids sorted per kind, every device canonical. */
export function canonicalizeTopologyState(state: NetworkTopologyStateV1): NetworkTopologyStateV1 {
  const pcs: Record<string, PcConfig> = {}, switches: Record<string, NetworkCliDeviceState> = {}, routers: Record<string, RouterState> = {};
  for (const id of Object.keys(state.pcs).filter(k => !FORBIDDEN.has(k)).sort()) pcs[id] = canonicalPcConfig(state.pcs[id]);
  for (const id of Object.keys(state.switches).filter(k => !FORBIDDEN.has(k)).sort()) switches[id] = canonicalizeState(state.switches[id]);
  for (const id of Object.keys(state.routers).filter(k => !FORBIDDEN.has(k)).sort()) routers[id] = canonicalizeRouterState(state.routers[id]);
  return { v: TOPOLOGY_STATE_VERSION, pcs, switches, routers };
}
/** Deterministic JSON of the canonical topology state (equivalent configurations serialize identically). */
export const serializeTopologyState = (state: NetworkTopologyStateV1): string => JSON.stringify(canonicalizeTopologyState(state));
export const topologyDevice = (config: NetworkTopologyConfigV1, id: string): TopologyDevice | undefined => config.devices.find(d => d.id === id);
/** The link attached to a device port and the endpoint at its other end. */
export function linkAt(config: NetworkTopologyConfigV1, deviceId: string, port: string): { link: TopologyLink; peer: TopologyEndpoint } | undefined {
  for (const l of config.links) {
    if (l.a.deviceId === deviceId && l.a.port === port) return { link: l, peer: l.b };
    if (l.b.deviceId === deviceId && l.b.port === port) return { link: l, peer: l.a };
  }
  return undefined;
}
