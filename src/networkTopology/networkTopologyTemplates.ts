// Phase 20B — authoring TEMPLATES for networkTopology@1 (builder-only; never grading semantics). The one-click classroom topology
// «راوتر + سويتشان + 4 حواسيب» and an optional two-LAN check preset the teacher can apply and then edit. Everything here is ordinary
// question DATA run through the same strict validators as hand-authored content; the engines know nothing about these templates.
import type { NetworkTopologyConfigV1 } from "../networkTopologyModel";
import type { NetworkTopologyCheck } from "../networkTopologyPlugin";

/**
 *                 R1
 *             g0/0 g0/1
 *              /     \
 *          g0/1       g0/1
 *           SW1       SW2
 *         /    \     /    \
 *      f0/1  f0/2 f0/1  f0/2
 *       PC1    PC2  PC3    PC4
 * Stable ids (r1, sw1, sw2, pc1–pc4, l1–l6); every device starts unconfigured.
 */
export function routerTwoSwitchesFourPcsTemplate(): NetworkTopologyConfigV1 {
  return {
    v: 1,
    devices: [
      { id: "r1", kind: "router", label: "R1", x: 0.5, y: 0.14 },
      { id: "sw1", kind: "switch", label: "SW1", x: 0.27, y: 0.48 },
      { id: "sw2", kind: "switch", label: "SW2", x: 0.73, y: 0.48 },
      { id: "pc1", kind: "pc", label: "PC1", x: 0.13, y: 0.84 },
      { id: "pc2", kind: "pc", label: "PC2", x: 0.39, y: 0.84 },
      { id: "pc3", kind: "pc", label: "PC3", x: 0.61, y: 0.84 },
      { id: "pc4", kind: "pc", label: "PC4", x: 0.87, y: 0.84 }
    ],
    links: [
      { id: "l1", a: { deviceId: "r1", port: "g0/0" }, b: { deviceId: "sw1", port: "g0/1" } },
      { id: "l2", a: { deviceId: "r1", port: "g0/1" }, b: { deviceId: "sw2", port: "g0/1" } },
      { id: "l3", a: { deviceId: "sw1", port: "f0/1" }, b: { deviceId: "pc1", port: "eth0" } },
      { id: "l4", a: { deviceId: "sw1", port: "f0/2" }, b: { deviceId: "pc2", port: "eth0" } },
      { id: "l5", a: { deviceId: "sw2", port: "f0/1" }, b: { deviceId: "pc3", port: "eth0" } },
      { id: "l6", a: { deviceId: "sw2", port: "f0/2" }, b: { deviceId: "pc4", port: "eth0" } }
    ]
  };
}

/** The two-LAN exercise preset (LAN A 192.168.10.0/24 via R1 g0/0, LAN B 192.168.20.0/24 via R1 g0/1): 17 checks, total weight 23. */
export function twoLanDemoChecks(): NetworkTopologyCheck[] {
  const pc = (n: number, lan: 10 | 20, host: number, withMask: boolean): NetworkTopologyCheck[] => [
    { id: "pc" + n + "-ip", label: "PC" + n + " — عنوان IP", weight: 1, kind: "pc.address", deviceId: "pc" + n, value: "192.168." + lan + "." + host },
    ...(withMask ? [{ id: "pc" + n + "-mask", label: "PC" + n + " — قناع الشبكة", weight: 1, kind: "pc.mask", deviceId: "pc" + n, value: "255.255.255.0" }] : []),
    { id: "pc" + n + "-gw", label: "PC" + n + " — البوابة الافتراضية", weight: 1, kind: "pc.gateway", deviceId: "pc" + n, value: "192.168." + lan + ".254" }
  ];
  return [
    ...pc(1, 10, 10, true), ...pc(2, 10, 20, false), ...pc(3, 20, 10, false), ...pc(4, 20, 20, false),
    { id: "sw1-hostname", label: "SW1 — اسم الجهاز", weight: 1, kind: "switch.hostname", deviceId: "sw1", value: "BR1-SW1" },
    { id: "sw2-hostname", label: "SW2 — اسم الجهاز", weight: 1, kind: "switch.hostname", deviceId: "sw2", value: "BR1-SW2" },
    { id: "r1-g00-ip", label: "R1 G0/0 — عنوان IP", weight: 2, kind: "router.ipAddress", deviceId: "r1", interface: "g0/0", value: "192.168.10.254" },
    { id: "r1-g00-up", label: "R1 G0/0 — مفعّلة (no shutdown)", weight: 1, kind: "router.interfaceEnabled", deviceId: "r1", interface: "g0/0", value: true },
    { id: "r1-g01-ip", label: "R1 G0/1 — عنوان IP", weight: 2, kind: "router.ipAddress", deviceId: "r1", interface: "g0/1", value: "192.168.20.254" },
    { id: "r1-g01-up", label: "R1 G0/1 — مفعّلة (no shutdown)", weight: 1, kind: "router.interfaceEnabled", deviceId: "r1", interface: "g0/1", value: true },
    { id: "reach-pc1-pc3", label: "PC1 ⇄ PC3 (عبر الراوتر)", weight: 3, kind: "reachability", source: "pc1", destination: "pc3", value: true },
    { id: "reach-pc2-pc4", label: "PC2 ⇄ PC4 (عبر الراوتر)", weight: 3, kind: "reachability", source: "pc2", destination: "pc4", value: true }
  ];
}
