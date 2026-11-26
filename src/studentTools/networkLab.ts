// N1 (docs/enterprise-network-lab-tool-design.md) — the PURE engine of the student tool «مختبر الشبكات».
//
// The learner's network is two pieces of data, exactly what networkTopology@2's engines already take:
//   • `config`  — the topology (devices, cables, positions, host adapters) in networkTopology@2's own format (Net2Config);
//   • `actions` — the learner's device actions (CLI lines, Desktop settings, Wi-Fi, services) in the plugin's own vocabulary.
// Everything the tool shows is `replayNet2(config, actions)` — the SAME engines the server grades exam questions with, unchanged.
//
// A topology edit returns a new { config, actions }: the config is re-validated by validateNet2Config (so the lab can never hold a network
// the simulator would refuse), and every action that no longer normalizes against the new config (the device was removed, a host lost the
// adapter it used) is dropped — the rest keep their order, so a device keeps its configuration when cables change, as in Packet Tracer.
//
// No eval, no network, no timers, no storage here: the file and the draft are plain strings; the tool decides where they go.
import { NET2_DEVICE_KINDS, NET2_LIMITS, isHostKind, type Net2AdapterKind, type Net2Config, type Net2Device, type Net2Link } from "../net2Model";
import { labDevicePorts, validateLabConfig } from "./netLabModel";
import { normalizeLabAction, validateLabActions, type LabAction } from "./netLabReplay";

export type NetLab = { config: Net2Config; actions: unknown[] };
/** N2 — the lab's device kinds: networkTopology@2's six, and the hub. */
export const LAB_DEVICE_KINDS = [...NET2_DEVICE_KINDS, "hub"] as const;
export type LabDeviceKind = (typeof LAB_DEVICE_KINDS)[number];
export type NetLabResult = { ok: true; lab: NetLab } | { ok: false; message: string };

export const EMPTY_LAB: NetLab = Object.freeze({ config: { v: 2, devices: [], links: [] }, actions: [] }) as NetLab;
/** The file / draft format: a tag, a version, the topology and the actions (nothing else is read). */
export const NETLAB_FILE_FORMAT = "tadris-network-lab";
export const NETLAB_FILE_VERSION = 1;
/** A saved network is at most this many characters (the engine's own bounds keep a real one far below it). */
export const NETLAB_FILE_MAX_CHARS = 600_000;

const PREFIX: Readonly<Record<LabDeviceKind, { id: string; label: string }>> = Object.freeze({
  router: { id: "r", label: "R" }, switch: { id: "sw", label: "SW" }, pc: { id: "pc", label: "PC" }, laptop: { id: "lap", label: "LAP" }, ap: { id: "ap", label: "AP" }, server: { id: "srv", label: "SRV" }, hub: { id: "hub", label: "HUB" },
});
/** Where a new device of each kind first appears (routers at the top, hosts at the bottom), before the learner drags it. */
const ROW_Y: Readonly<Record<LabDeviceKind, number>> = Object.freeze({ router: 0.1, switch: 0.42, hub: 0.5, ap: 0.62, server: 0.78, pc: 0.88, laptop: 0.94 });
const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
const nextNumber = (ids: readonly string[], prefix: string) => 1 + ids.reduce((m, id) => { const k = new RegExp("^" + prefix + "(\\d+)$").exec(id); return k ? Math.max(m, Number(k[1])) : m; }, 0);

/** Re-validates a candidate topology and keeps only the actions that still apply to it (same order). */
function settle(config: unknown, actions: readonly unknown[]): NetLabResult {
  const v = validateLabConfig(config);
  if (!v.ok) return { ok: false, message: v.message };
  const kept = actions.filter(a => normalizeLabAction(a, v.config).ok);
  return { ok: true, lab: { config: v.config, actions: kept } };
}
const clone = (c: Net2Config): { devices: Net2Device[]; links: Net2Link[] } => JSON.parse(JSON.stringify({ devices: c.devices, links: c.links }));

/** Adds a device of `kind` with the next free name (R1, SW2 …), placed in its row, to the right of the devices already there. */
export function addDevice(lab: NetLab, kind: LabDeviceKind): NetLabResult {
  if (!(LAB_DEVICE_KINDS as readonly string[]).includes(kind)) return { ok: false, message: "نوع جهاز غير معروف." };
  if (lab.config.devices.length >= NET2_LIMITS.devices) return { ok: false, message: "وصلت إلى الحد الأقصى: " + NET2_LIMITS.devices + " جهازًا." };
  const { devices, links } = clone(lab.config);
  const p = PREFIX[kind], n = nextNumber(devices.map(d => d.id), p.id);
  const sameRow = devices.filter(d => d.kind === kind).length;
  const device = { id: p.id + n, kind, label: p.label + n, x: round(0.08 + ((sameRow * 0.17) % 0.85)), y: ROW_Y[kind] } as Net2Device;
  return settle({ v: 2, devices: [...devices, device], links }, lab.actions);
}

/** Removes a device, its cables and its actions. */
export function removeDevice(lab: NetLab, id: string): NetLabResult {
  const { devices, links } = clone(lab.config);
  if (!devices.some(d => d.id === id)) return { ok: false, message: "الجهاز غير موجود." };
  return settle({ v: 2, devices: devices.filter(d => d.id !== id), links: links.filter(l => l.a.deviceId !== id && l.b.deviceId !== id) }, lab.actions);
}

/** The ports of a device that no cable uses yet, in the device's own order. */
export function freePorts(config: Net2Config, id: string): string[] {
  const d = config.devices.find(x => x.id === id);
  if (!d) return [];
  const used = new Set(config.links.flatMap(l => [l.a, l.b]).filter(e => e.deviceId === id).map(e => e.port));
  return labDevicePorts(d).filter(p => !used.has(p));
}

/** Connects two free ports with a cable (the validator refuses a used port, a self cable or a port the device lacks). */
export function addLink(lab: NetLab, a: { deviceId: string; port: string }, b: { deviceId: string; port: string }): NetLabResult {
  if (lab.config.links.length >= NET2_LIMITS.links) return { ok: false, message: "وصلت إلى الحد الأقصى: " + NET2_LIMITS.links + " كابلًا." };
  if (a.deviceId === b.deviceId) return { ok: false, message: "لا يمكن وصل الجهاز بنفسه." };
  const { devices, links } = clone(lab.config);
  const id = "l" + nextNumber(links.map(l => l.id), "l");
  return settle({ v: 2, devices, links: [...links, { id, a: { deviceId: a.deviceId, port: a.port }, b: { deviceId: b.deviceId, port: b.port } }] }, lab.actions);
}

export function removeLink(lab: NetLab, linkId: string): NetLabResult {
  const { devices, links } = clone(lab.config);
  if (!links.some(l => l.id === linkId)) return { ok: false, message: "الكابل غير موجود." };
  return settle({ v: 2, devices, links: links.filter(l => l.id !== linkId) }, lab.actions);
}

export function moveDevice(lab: NetLab, id: string, x: number, y: number): NetLabResult {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, message: "موضع غير صالح." };
  const { devices, links } = clone(lab.config);
  const d = devices.find(v => v.id === id);
  if (!d) return { ok: false, message: "الجهاز غير موجود." };
  d.x = round(x); d.y = round(y);
  return settle({ v: 2, devices, links }, lab.actions);
}

export function renameDevice(lab: NetLab, id: string, label: string): NetLabResult {
  const { devices, links } = clone(lab.config);
  const d = devices.find(v => v.id === id);
  if (!d) return { ok: false, message: "الجهاز غير موجود." };
  const t = label.trim();
  if (!t) return { ok: false, message: "اكتب اسمًا للجهاز." };
  d.label = t;
  return settle({ v: 2, devices, links }, lab.actions);
}

/** A host's network adapters (Ethernet, Wi-Fi or both). Cables on a removed Ethernet port go, and so do actions on a removed adapter. */
export function setAdapters(lab: NetLab, id: string, adapters: readonly Net2AdapterKind[]): NetLabResult {
  const { devices, links } = clone(lab.config);
  const d = devices.find(v => v.id === id);
  if (!d || !isHostKind(d.kind)) return { ok: false, message: "المحوّلات للحواسيب والخوادم فقط." };
  if (!adapters.length) return { ok: false, message: "يحتاج الجهاز محوّل شبكة واحدًا على الأقل." };
  d.adapters = (["ethernet", "wireless"] as const).filter(a => adapters.includes(a));
  delete d.initial;   // an initial state names the adapters it was written for; the learner configures the device again
  const ports = new Set(labDevicePorts(d));
  return settle({ v: 2, devices, links: links.filter(l => ![l.a, l.b].some(e => e.deviceId === id && !ports.has(e.port))) }, lab.actions);
}

/** Appends device actions (from a device surface). Refused when an action does not apply or a bound of the simulator is reached. */
export function appendActions(lab: NetLab, more: readonly unknown[]): NetLabResult {
  const next = [...lab.actions, ...more];
  if (next.length > NET2_LIMITS.actions) return { ok: false, message: "وصلت إلى الحد الأقصى لعدد العمليات في الشبكة (" + NET2_LIMITS.actions + ")." };
  const normalized: LabAction[] = [];
  for (const a of next) { const n = normalizeLabAction(a, lab.config); if (!n.ok) return { ok: false, message: "تعذّر تنفيذ العملية." }; normalized.push(n.action); }
  const code = validateLabActions(normalized);
  if (code) return { ok: false, message: code === "NET2_DEVICE_COMMANDS_TOO_MANY" ? "اكتمل الحد الأقصى لأوامر هذا الجهاز." : code === "NET2_HOST_COMMANDS_TOO_MANY" ? "اكتمل الحد الأقصى لأوامر هذا الحاسوب." : code === "NET2_WIFI_ACTIONS_TOO_MANY" ? "اكتمل الحد الأقصى لعمليات الاتصال اللاسلكي لهذا الجهاز." : code === "LAB_IPV6_ACTIONS_TOO_MANY" ? "اكتمل الحد الأقصى لإعدادات IPv6 لهذا الجهاز." : "تعذّر تنفيذ العملية." };
  return { ok: true, lab: { config: lab.config, actions: next } };
}

/** Clears every device's configuration (the topology stays). */
export const clearConfiguration = (lab: NetLab): NetLab => ({ config: lab.config, actions: [] });

// ── file and draft ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function serializeLab(lab: NetLab): string {
  return JSON.stringify({ format: NETLAB_FILE_FORMAT, version: NETLAB_FILE_VERSION, config: lab.config, actions: lab.actions }, null, 1);
}

/** Reads a saved network strictly: the tag, the version, a topology the simulator accepts and actions that ALL apply (none dropped). */
export function parseLab(text: unknown): NetLabResult {
  const bad = (message: string): NetLabResult => ({ ok: false, message });
  if (typeof text !== "string" || !text.trim()) return bad("الملف فارغ.");
  if (text.length > NETLAB_FILE_MAX_CHARS) return bad("الملف كبير جدًا.");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return bad("هذا ليس ملف شبكة من مختبر الشبكات."); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad("هذا ليس ملف شبكة من مختبر الشبكات.");
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some(k => !["format", "version", "config", "actions"].includes(k)) || o.format !== NETLAB_FILE_FORMAT) return bad("هذا ليس ملف شبكة من مختبر الشبكات.");
  if (o.version !== NETLAB_FILE_VERSION) return bad("إصدار الملف غير مدعوم.");
  if (!Array.isArray(o.actions)) return bad("الملف تالف: قائمة العمليات غير صالحة.");
  const v = validateLabConfig(o.config);
  if (!v.ok) return bad("الملف تالف: " + v.message);
  const appended = appendActions({ config: v.config, actions: [] }, o.actions);
  if (!appended.ok) return bad("الملف تالف: " + appended.message);
  return appended;
}

/** The file name offered for saving (ASCII, safe on every system). */
export const labFileName = "network-lab.json";
