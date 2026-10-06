import type { Net2AdapterName, Net2DeviceKind } from "../net2Model";

// Phase 20C — display text shared by the networkTopology@2 workspace, editor and review (presentation only).
export const KIND_LABEL: Readonly<Record<Net2DeviceKind, string>> = Object.freeze({ router: "راوتر", switch: "سويتش", pc: "حاسوب", laptop: "لابتوب", ap: "نقطة وصول", server: "خادم" });
export const ADAPTER_LABEL: Readonly<Record<Net2AdapterName, string>> = Object.freeze({ eth0: "Ethernet (eth0)", wlan0: "Wi-Fi (wlan0)" });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** How many of `types` actions an answer already holds for one device (the per-device bounds shown in the surfaces). */
export const countOf = (base: readonly unknown[], id: string, types: readonly string[]) => base.filter(a => isObj(a) && a.deviceId === id && types.includes(String(a.type))).length;
