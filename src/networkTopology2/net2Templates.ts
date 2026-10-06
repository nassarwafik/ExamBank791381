// Phase 20C — the curriculum TEMPLATES of networkTopology@2 (data only): Router-on-a-Stick, router DHCP, VTP server / client, Port Security,
// wireless (WPA2 + DHCP through an AP) and the certification capstone. Each template is a public topology (teacher-owned, never editable by
// the student) plus a PRIVATE weighted answer key. No template gives free credit: every check fails on the untouched initial state (pinned
// by tests). The engines know nothing about templates; a template is just a configuration the teacher can start from and edit.
import type { Net2Config } from "../net2Model";

type Json = Record<string, unknown>;
export type Net2TemplateCheck = { id: string; label: string; weight: number; kind: string } & Json;
export type Net2Template = { id: string; title: string; description: string; config: () => Net2Config; checks: () => Net2TemplateCheck[] };

const dev = (id: string, kind: string, label: string, x: number, y: number, extra: Json = {}) => ({ id, kind, label, x, y, ...extra });
const link = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } });
const staticHost = (address: string, gateway: string, mask = "255.255.255.0") => ({ v: 2, device: "host", adapters: { eth0: { mode: "static", address, mask, gateway } } });
const dhcpHost = (adapter = "eth0") => ({ v: 2, device: "host", adapters: { [adapter]: { mode: "dhcp" } } });
let n = 0;
const check = (label: string, kind: string, params: Json, weight = 1): Net2TemplateCheck => ({ id: "k" + ++n, label, weight, kind, ...params });
const reset = () => { n = 0; };

function roasConfig(): Net2Config {
  return {
    v: 2,
    devices: [
      dev("r1", "router", "R1", 0.5, 0.1), dev("sw1", "switch", "SW1", 0.5, 0.45),
      dev("pc1", "pc", "PC1", 0.12, 0.85, { initial: staticHost("192.168.10.11", "192.168.10.1") }), dev("pc2", "pc", "PC2", 0.37, 0.85, { initial: staticHost("192.168.10.12", "192.168.10.1") }),
      dev("pc3", "pc", "PC3", 0.63, 0.85, { initial: staticHost("192.168.20.11", "192.168.20.1") }), dev("pc4", "pc", "PC4", 0.88, 0.85, { initial: staticHost("192.168.20.12", "192.168.20.1") })
    ],
    links: [link("u", "r1", "g0/0", "sw1", "g0/1"), link("a", "sw1", "f0/1", "pc1", "eth0"), link("b", "sw1", "f0/2", "pc2", "eth0"), link("c", "sw1", "f0/11", "pc3", "eth0"), link("d", "sw1", "f0/12", "pc4", "eth0")]
  } as Net2Config;
}
function roasChecks(): Net2TemplateCheck[] {
  reset();
  return [
    check("SW1: VLAN 10 موجودة", "switch.vlanExists", { deviceId: "sw1", vlan: 10 }), check("SW1: VLAN 20 موجودة", "switch.vlanExists", { deviceId: "sw1", vlan: 20 }),
    check("SW1 Fa0/1 في وضع access", "switch.portMode", { deviceId: "sw1", interface: "f0/1", value: "access" }),
    check("SW1 Fa0/1 في VLAN 10", "switch.accessVlan", { deviceId: "sw1", interface: "f0/1", value: 10 }), check("SW1 Fa0/11 في VLAN 20", "switch.accessVlan", { deviceId: "sw1", interface: "f0/11", value: 20 }),
    check("SW1 Gi0/1 في وضع trunk", "switch.portMode", { deviceId: "sw1", interface: "g0/1", value: "trunk" }),
    check("R1 G0/0 مفعّلة", "router.interfaceEnabled", { deviceId: "r1", interface: "g0/0", value: true }),
    check("R1 G0/0.10 بـ dot1Q 10", "router.subinterfaceVlan", { deviceId: "r1", interface: "g0/0.10", value: 10 }), check("R1 G0/0.10 = 192.168.10.1", "router.ipAddress", { deviceId: "r1", interface: "g0/0.10", value: "192.168.10.1" }),
    check("R1 G0/0.20 بـ dot1Q 20", "router.subinterfaceVlan", { deviceId: "r1", interface: "g0/0.20", value: 20 }), check("R1 G0/0.20 = 192.168.20.1", "router.ipAddress", { deviceId: "r1", interface: "g0/0.20", value: "192.168.20.1" }),
    check("PC1 ⇄ PC3 (توجيه بين الشبكات)", "reachability", { source: "pc1", destination: "pc3", value: true }, 2)
  ];
}
function dhcpConfig(): Net2Config {
  return {
    v: 2,
    devices: [
      dev("r1", "router", "R1", 0.5, 0.1, { initial: { v: 2, device: "router", hostname: "Router", interfaces: { "g0/0": { ipAddress: "192.168.1.1", subnetMask: "255.255.255.0", shutdown: false } }, subinterfaces: {}, dhcp: { excluded: [], pools: {} }, security: {} } }),
      dev("sw1", "switch", "SW1", 0.5, 0.45), dev("pc1", "pc", "PC1", 0.3, 0.85, { initial: dhcpHost() }), dev("pc2", "pc", "PC2", 0.7, 0.85, { initial: dhcpHost() })
    ],
    links: [link("u", "r1", "g0/0", "sw1", "g0/1"), link("a", "sw1", "f0/1", "pc1", "eth0"), link("b", "sw1", "f0/2", "pc2", "eth0")]
  } as Net2Config;
}
function dhcpChecks(): Net2TemplateCheck[] {
  reset();
  return [
    check("مجمّع DHCP باسم LAN", "router.dhcpPool", { deviceId: "r1", pool: "LAN", value: true }), check("شبكة المجمّع 192.168.1.0/24", "router.dhcpNetwork", { deviceId: "r1", pool: "LAN", value: "192.168.1.0 255.255.255.0" }),
    check("default-router 192.168.1.1", "router.dhcpDefaultRouter", { deviceId: "r1", pool: "LAN", value: "192.168.1.1" }), check("dns-server 192.168.1.1", "router.dhcpDns", { deviceId: "r1", pool: "LAN", value: "192.168.1.1" }),
    check("استثناء 192.168.1.1–192.168.1.10", "router.dhcpExcluded", { deviceId: "r1", value: "192.168.1.1 192.168.1.10" }),
    check("PC1 حصل على عنوان من DHCP", "host.dhcpLease", { deviceId: "pc1", adapter: "eth0", value: true }), check("PC1 = 192.168.1.11", "host.address", { deviceId: "pc1", adapter: "eth0", value: "192.168.1.11" }),
    check("PC2 حصل على عنوان من DHCP", "host.dhcpLease", { deviceId: "pc2", adapter: "eth0", value: true }),
    check("PC1 ⇄ R1", "reachability", { source: "pc1", destination: "r1", value: true }, 2)
  ];
}
const vtpSwitch = () => ({ v: 2, device: "switch", hostname: "Switch", vlans: {}, interfaces: { "f0/1": { mode: "access", accessVlan: 30 } }, vtp: { mode: "server", domain: "", password: "", version: 1, revision: 0 }, security: {} });
function vtpConfig(): Net2Config {
  return {
    v: 2,
    devices: [
      dev("sw1", "switch", "SW1", 0.3, 0.3, { initial: vtpSwitch() }), dev("sw2", "switch", "SW2", 0.7, 0.3, { initial: vtpSwitch() }),
      dev("pc1", "pc", "PC1", 0.3, 0.8, { initial: staticHost("10.30.0.1", "") }), dev("pc2", "pc", "PC2", 0.7, 0.8, { initial: staticHost("10.30.0.2", "") })
    ],
    links: [link("t1", "sw1", "g0/1", "sw2", "g0/1"), link("a", "sw1", "f0/1", "pc1", "eth0"), link("b", "sw2", "f0/1", "pc2", "eth0")]
  } as Net2Config;
}
function vtpChecks(): Net2TemplateCheck[] {
  reset();
  return [
    check("SW1 في نطاق VTP SCHOOL", "switch.vtpDomain", { deviceId: "sw1", value: "SCHOOL" }), check("SW2 في نطاق VTP SCHOOL", "switch.vtpDomain", { deviceId: "sw2", value: "SCHOOL" }),
    check("SW2 في وضع VTP client", "switch.vtpMode", { deviceId: "sw2", value: "client" }), check("VLAN 30 وصلت إلى SW2", "switch.vlanExists", { deviceId: "sw2", vlan: 30 }),
    check("SW1 Gi0/1 في وضع trunk", "switch.portMode", { deviceId: "sw1", interface: "g0/1", value: "trunk" }),
    check("PC1 ⇄ PC2 عبر VLAN 30", "reachability", { source: "pc1", destination: "pc2", value: true }, 2)
  ];
}
function portsecConfig(): Net2Config {
  return {
    v: 2,
    devices: [
      dev("sw1", "switch", "SW1", 0.5, 0.25), dev("pc1", "pc", "PC1", 0.2, 0.8, { initial: staticHost("192.168.50.1", "") }),
      dev("pc2", "pc", "PC2", 0.5, 0.8, { initial: staticHost("192.168.50.2", "") }), dev("pc3", "pc", "PC3", 0.8, 0.8, { initial: staticHost("192.168.50.3", "") })
    ],
    links: [link("a", "sw1", "f0/1", "pc1", "eth0"), link("b", "sw1", "f0/2", "pc2", "eth0"), link("c", "sw1", "f0/3", "pc3", "eth0")]
  } as Net2Config;
}
function portsecChecks(): Net2TemplateCheck[] {
  reset();
  return [
    check("Fa0/1 في وضع access", "switch.portMode", { deviceId: "sw1", interface: "f0/1", value: "access" }),
    check("Port Security مفعّل على Fa0/1", "switch.portSecurity", { deviceId: "sw1", interface: "f0/1", value: true }),
    check("الحد الأقصى عنوان واحد", "switch.portSecurityMaximum", { deviceId: "sw1", interface: "f0/1", value: 1 }),
    check("Sticky MAC مفعّل", "switch.portSecuritySticky", { deviceId: "sw1", interface: "f0/1", value: true }),
    check("وضع المخالفة shutdown", "switch.portSecurityViolation", { deviceId: "sw1", interface: "f0/1", value: "shutdown" })
  ];
}
function wirelessConfig(): Net2Config {
  return {
    v: 2,
    devices: [
      dev("r1", "router", "R1", 0.5, 0.08, {
        initial: {
          v: 2, device: "router", hostname: "Router", interfaces: { "g0/0": { ipAddress: "192.168.1.1", subnetMask: "255.255.255.0", shutdown: false } }, subinterfaces: {},
          dhcp: { excluded: [["192.168.1.1", "192.168.1.10"]], pools: { LAN: { network: "192.168.1.0", mask: "255.255.255.0", defaultRouter: "192.168.1.1", dns: "192.168.1.1" } } }, security: {}
        }
      }),
      dev("sw1", "switch", "SW1", 0.5, 0.4), dev("ap1", "ap", "AP1", 0.75, 0.62, { initial: { v: 2, device: "ap", enabled: true, ssid: "SCHOOL-WIFI", security: "open", passphrase: "" } }),
      dev("pc1", "pc", "PC1", 0.25, 0.85, { initial: dhcpHost() }), dev("lap1", "laptop", "LAP1", 0.8, 0.9, { initial: dhcpHost("wlan0") })
    ],
    links: [link("u", "r1", "g0/0", "sw1", "g0/1"), link("a", "sw1", "f0/1", "pc1", "eth0"), link("b", "sw1", "f0/2", "ap1", "eth0")]
  } as Net2Config;
}
function wirelessChecks(): Net2TemplateCheck[] {
  reset();
  return [
    check("AP1 يستخدم WPA2", "ap.security", { deviceId: "ap1", value: "wpa2" }), check("عبارة مرور WPA2 الصحيحة", "ap.passphrase", { deviceId: "ap1", value: "Exam2026!" }),
    check("LAP1 متصل لاسلكيًا", "host.wifiAssociated", { deviceId: "lap1", value: true }), check("LAP1 حصل على عنوان DHCP", "host.dhcpLease", { deviceId: "lap1", adapter: "wlan0", value: true }),
    check("LAP1 ⇄ PC1", "reachability", { source: "lap1", destination: "pc1", value: true }, 2)
  ];
}
function capstoneConfig(): Net2Config {
  return {
    v: 2,
    devices: [
      dev("r1", "router", "R1", 0.5, 0.06), dev("sw1", "switch", "SW1", 0.3, 0.36), dev("sw2", "switch", "SW2", 0.72, 0.36),
      dev("pcstaff", "pc", "PC-STAFF", 0.1, 0.8, { initial: dhcpHost() }), dev("pcstudent", "pc", "PC-STUDENT", 0.32, 0.86, { initial: dhcpHost() }),
      dev("ap1", "ap", "AP1", 0.6, 0.66, { initial: { v: 2, device: "ap", enabled: true, ssid: "SCHOOL-WIFI", security: "open", passphrase: "" } }),
      dev("lap1", "laptop", "LAP1", 0.62, 0.92, { initial: dhcpHost("wlan0") }),
      dev("srv1", "server", "SRV1", 0.9, 0.8, {
        initial: {
          v: 2, device: "host", adapters: { eth0: { mode: "static", address: "192.168.50.10", mask: "255.255.255.0", gateway: "192.168.50.1" } },
          services: { dns: { enabled: true, records: [{ name: "server.school.local", address: "192.168.50.10" }] }, http: { enabled: true, title: "School Portal", body: "Welcome to the school network." } }
        }
      })
    ],
    links: [link("u", "r1", "g0/0", "sw1", "g0/1"), link("t", "sw1", "g0/2", "sw2", "g0/1"), link("a", "sw1", "f0/1", "pcstaff", "eth0"), link("b", "sw1", "f0/2", "pcstudent", "eth0"),
      link("c", "sw2", "f0/1", "ap1", "eth0"), link("d", "sw2", "f0/5", "srv1", "eth0")]
  } as Net2Config;
}
function capstoneChecks(): Net2TemplateCheck[] {
  reset();
  return [
    check("SW1 hostname", "switch.hostname", { deviceId: "sw1", value: "SW1" }), check("VLAN 10 = STAFF", "switch.vlanName", { deviceId: "sw1", vlan: 10, value: "STAFF" }),
    check("VLAN 20 = STUDENTS", "switch.vlanName", { deviceId: "sw1", vlan: 20, value: "STUDENTS" }), check("Native VLAN 99 على Gi0/1", "switch.nativeVlan", { deviceId: "sw1", interface: "g0/1", value: 99 }),
    check("VLAN المسموحة على Gi0/1", "switch.allowedVlans", { deviceId: "sw1", interface: "g0/1", value: "10,20,50,99" }), check("SW2 في وضع VTP client", "switch.vtpMode", { deviceId: "sw2", value: "client" }),
    check("VLAN 50 وصلت إلى SW2 عبر VTP", "switch.vlanExists", { deviceId: "sw2", vlan: 50 }), check("Port Security على Fa0/1", "switch.portSecurity", { deviceId: "sw1", interface: "f0/1", value: true }),
    check("enable secret على SW1", "switch.enableSecret", { deviceId: "sw1", value: "Class2026" }), check("R1 G0/0.99 Native", "router.subinterfaceNative", { deviceId: "r1", interface: "g0/0.99", value: true }),
    check("مجمّع STAFF", "router.dhcpPool", { deviceId: "r1", pool: "STAFF", value: true }), check("مجمّع STUDENTS", "router.dhcpPool", { deviceId: "r1", pool: "STUDENTS", value: true }),
    check("AP1 يستخدم WPA2", "ap.security", { deviceId: "ap1", value: "wpa2" }), check("LAP1 حصل على عنوان DHCP", "host.dhcpLease", { deviceId: "lap1", adapter: "wlan0", value: true }),
    check("PC-STAFF حصل على عنوان DHCP", "host.dhcpLease", { deviceId: "pcstaff", adapter: "eth0", value: true }),
    check("LAP1 ⇄ PC-STAFF", "reachability", { source: "lap1", destination: "pcstaff", value: true }, 2),
    check("PC-STUDENT ⇄ SRV1", "reachability", { source: "pcstudent", destination: "srv1", value: true }),
    check("LAP1 يفتح http://server.school.local", "browse", { source: "lap1", url: "http://server.school.local", value: true }, 2)
  ];
}

export const NET2_TEMPLATES: readonly Net2Template[] = Object.freeze([
  { id: "roas", title: "Router-on-a-Stick (VLAN 10 / 20)", description: "VLANs + Trunk + واجهات فرعية dot1Q للتوجيه بين الشبكات.", config: roasConfig, checks: roasChecks },
  { id: "dhcp", title: "DHCP على الراوتر", description: "مجمّع DHCP مع استثناءات و default-router و dns-server.", config: dhcpConfig, checks: dhcpChecks },
  { id: "vtp", title: "VTP Server / Client", description: "نشر VLAN من Server إلى Client عبر Trunk.", config: vtpConfig, checks: vtpChecks },
  { id: "portsec", title: "Port Security", description: "Port Security مع Sticky MAC ووضع shutdown.", config: portsecConfig, checks: portsecChecks },
  { id: "wireless", title: "Wireless (WPA2 + DHCP)", description: "نقطة وصول بأمان WPA2 ولابتوب يحصل على عنوان عبر DHCP.", config: wirelessConfig, checks: wirelessChecks },
  { id: "capstone", title: "Capstone — شبكة المدرسة", description: "VLANs و Trunk و RoaS و DHCP و VTP و Port Security وكلمات المرور و WPA2 و DNS و HTTP.", config: capstoneConfig, checks: capstoneChecks }
]);
export const net2TemplateById = (id: string): Net2Template | undefined => NET2_TEMPLATES.find(t => t.id === id);
