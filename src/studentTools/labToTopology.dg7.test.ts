// DG7 — «افتح من مختبر الشبكات» (docs/enterprise-diagram-editor-design.md §19): the network built in «مختبر الشبكات» drawn as a topology.
//   • the devices (their kinds, names), the cables with their ports (G0/0, Fa0/1, S0/0/0), a serial WAN link as the serial cable, like
//     devices with the crossover cable — what «افحص المخطط» expects;
//   • the addresses the devices REALLY have after the lab's replay: router interfaces (Ethernet and serial), static hosts, DHCP leases;
//     a DHCP client with no lease says «DHCP», not its 169.254 stop-gap; the access point's SSID; its associated wireless clients;
//   • every example network of the lab: a valid diagram@1, on the page, no two devices overlapping, no «افحص المخطط» error;
//   • a broken file is refused with the lab's own message; a network whose settings cannot be replayed is still drawn, without addresses.
import { describe, it, expect } from "vitest";
import { EMPTY_LAB, addDevice, addLink, appendActions, serializeLab, type LabDeviceKind, type NetLab, type NetLabResult } from "./networkLab";
import { NET2_TEMPLATES } from "../networkTopology2/net2Templates";
import { labTextToTopology, labToTopology, portLabel, prefixOf } from "./labToTopology";
import { checkDiagram } from "./diagramChecks";
import { DIAGRAM_LIMITS, parseDiagram, serializeDiagram, type DiagramDoc } from "./diagramDoc";
import { layoutNode } from "./diagramLayout";

const ok = (r: NetLabResult): NetLab => { if (!r.ok) throw new Error(r.message); return r.lab; };
const devices = (...kinds: LabDeviceKind[]) => kinds.reduce((l, k) => ok(addDevice(l, k)), EMPTY_LAB);
const cable = (lab: NetLab, a: string, ap: string, b: string, bp: string) => ok(addLink(lab, { deviceId: a, port: ap }, { deviceId: b, port: bp }));
const ip = (deviceId: string, address: string, gateway = "", mask = "255.255.255.0") => ({ type: "host.setStatic", deviceId, adapter: "eth0", address, mask, gateway, dns: "" });
const cli = (deviceId: string, ...lines: string[]) => ["enable", "configure terminal", ...lines, "end"].map(command => ({ type: "router.command", deviceId, command }));
const run = (lab: NetLab, ...more: unknown[][]) => ok(appendActions(lab, more.flat()));
/** PC1 — R1 ═serial═ R2 — PC2 */
function wan(): NetLab {
  let lab = devices("router", "router", "pc", "pc");
  lab = cable(lab, "r1", "g0/0", "pc1", "eth0"); lab = cable(lab, "r1", "s0/0/0", "r2", "s0/0/0"); lab = cable(lab, "r2", "g0/0", "pc2", "eth0");
  return run(lab, [ip("pc1", "192.168.1.10", "192.168.1.1"), ip("pc2", "192.168.2.10", "192.168.2.1")],
    cli("r1", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface s0/0/0", "ip address 10.0.0.1 255.255.255.252", "clock rate 64000", "no shutdown"),
    cli("r2", "interface g0/0", "ip address 192.168.2.1 255.255.255.0", "no shutdown", "interface serial0/0/0", "ip address 10.0.0.2 255.255.255.252", "no shutdown"));
}
const byName = (d: DiagramDoc, name: string) => d.nodes.find(n => n.text.name === name)!;
const overlaps = (d: DiagramDoc) => {
  const boxes = d.nodes.map(n => layoutNode(d, n)!);
  return boxes.some((a, i) => boxes.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
};

describe("the little readers", () => {
  it("ports as on the device's label; a mask as its prefix", () => {
    expect(["g0/0", "f0/12", "s0/0/1", "eth0", "wlan0", "g0/0.10"].map(portLabel)).toEqual(["G0/0", "Fa0/12", "S0/0/1", "eth0", "wlan0", "G0/0.10"]);
    expect(["255.255.255.0", "255.255.255.252", "255.255.0.0", "0.0.0.0", "255.255.255.255", "255.0.255.0", "300.1.1.1", ""].map(prefixOf)).toEqual([24, 30, 16, 0, 32, null, null, null]);
  });
});

describe("a network drawn as it is in the lab", () => {
  it("a WAN: the devices, the cables with their ports, the serial link, and the addresses the devices really have", () => {
    const r = labToTopology(wan());
    expect(r.problems).toEqual([]);
    expect(r.summary).toBe("رُسمت الشبكة: 4 أجهزة و3 كوابل.");
    const d = r.doc;
    expect(d.nodes.map(n => n.type + ":" + n.text.name)).toEqual(["router:R1", "router:R2", "pc:PC1", "pc:PC2"]);
    expect(byName(d, "R1").text.details).toBe("G0/0: 192.168.1.1/24\nS0/0/0: 10.0.0.1/30");
    expect(byName(d, "R2").text.details).toBe("G0/0: 192.168.2.1/24\nS0/0/0: 10.0.0.2/30");
    expect(byName(d, "PC1").text.details).toBe("192.168.1.10/24");
    expect(d.edges.map(e => e.type + " " + e.fromLabel + "-" + e.toLabel)).toEqual(["cross G0/0-eth0", "serial S0/0/0-S0/0/0", "cross G0/0-eth0"]);
    expect(parseDiagram(serializeDiagram(d)).ok).toBe(true);
    expect(checkDiagram(d)).toEqual([]);
  });
  it("every example network of the lab: valid, on the page, nothing overlapping, no «افحص المخطط» error", () => {
    for (const t of NET2_TEMPLATES) {
      const r = labToTopology({ config: t.config(), actions: [] });
      const d = r.doc;
      expect(r.problems, t.id).toEqual([]);
      expect(d.nodes, t.id).toHaveLength(t.config().devices.length);
      expect(d.edges.filter(e => e.type !== "wireless"), t.id).toHaveLength(t.config().links.length);
      expect(parseDiagram(serializeDiagram(d)).ok, t.id).toBe(true);
      for (const n of d.nodes) { expect(n.x + n.w, t.id).toBeLessThanOrEqual(DIAGRAM_LIMITS.canvasW); expect(n.y + n.h, t.id).toBeLessThanOrEqual(DIAGRAM_LIMITS.canvasH); }
      expect(overlaps(d), t.id).toBe(false);
      expect(checkDiagram(d).filter(f => f.level === "error"), t.id).toEqual([]);
      // where they stood: left of / above stays left of / above
      const lab = t.config().devices;
      for (let i = 0; i + 1 < lab.length; i++) if (lab[i].x < lab[i + 1].x - 0.05) expect(d.nodes[i].x + d.nodes[i].w / 2, t.id).toBeLessThan(d.nodes[i + 1].x + d.nodes[i + 1].w / 2);
    }
  });
  it("a DHCP client with no lease says «DHCP» (not its 169.254 stop-gap); with a lease, «DHCP» and the address", () => {
    const dhcp = NET2_TEMPLATES.find(t => t.id === "dhcp")!;
    const before = labToTopology({ config: dhcp.config(), actions: [] }).doc;
    for (const n of before.nodes.filter(n => n.type === "pc")) expect(n.text.details).toBe("DHCP");
    const wireless = NET2_TEMPLATES.find(t => t.id === "wireless")!;
    const pc = labToTopology({ config: wireless.config(), actions: [] }).doc.nodes.find(n => n.type === "pc")!;
    expect(pc.text.details).toMatch(/^DHCP 192\.168\.1\.\d+\/24$/);
  });
  it("the access point's SSID; a laptop once connected over Wi-Fi: the wireless link and its address", () => {
    const t = NET2_TEMPLATES.find(x => x.id === "wireless")!;
    const before = labToTopology({ config: t.config(), actions: [] }).doc;
    expect(byName(before, "AP1").text.details).toBe("SSID: SCHOOL-WIFI");
    expect(before.edges.some(e => e.type === "wireless")).toBe(false);
    const solved = labToTopology({ config: t.config(), actions: [
      { type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Exam2026!" },
      { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "Exam2026!" }] });
    const d = solved.doc;
    const radio = d.edges.filter(e => e.type === "wireless");
    expect(radio.map(e => d.nodes.find(n => n.id === e.from)!.text.name + "-" + d.nodes.find(n => n.id === e.to)!.text.name)).toEqual(["AP1-LAP1"]);
    expect(byName(d, "LAP1").text.details).toMatch(/^DHCP 192\.168\.1\.\d+\/24$/);
    expect(solved.summary).toBe("رُسمت الشبكة: 5 أجهزة و3 كوابل و1 اتصالات لاسلكية.");
    expect(checkDiagram(d)).toEqual([]);
  });
  it("devices close together in the lab are spread just enough not to overlap with their addresses (and keep their order)", () => {
    let lab = devices("switch", "pc", "pc", "pc");
    lab = ok({ ok: true, lab: { ...lab, config: { ...lab.config, devices: lab.config.devices.map((d, i) => ({ ...d, x: i ? 0.4 + i * 0.04 : 0.5, y: i ? 0.6 : 0.3 })) } } });
    lab = cable(lab, "sw1", "f0/1", "pc1", "eth0"); lab = cable(lab, "sw1", "f0/2", "pc2", "eth0"); lab = cable(lab, "sw1", "f0/3", "pc3", "eth0");
    lab = run(lab, [ip("pc1", "192.168.10.11"), ip("pc2", "192.168.10.12"), ip("pc3", "192.168.10.13")]);
    const d = labToTopology(lab).doc;
    expect(overlaps(d)).toBe(false);
    const pcs = d.nodes.filter(n => n.type === "pc");
    expect(pcs.map(n => n.text.name)).toEqual(["PC1", "PC2", "PC3"]);
    expect(pcs[0].x).toBeLessThan(pcs[1].x);
    expect(pcs[1].x).toBeLessThan(pcs[2].x);
  });
  it("a hub and a switch take the crossover cable; a hub's ports read Fa0/n", () => {
    let lab = devices("hub", "switch", "pc");
    lab = cable(lab, "hub1", "f0/1", "sw1", "f0/1"); lab = cable(lab, "hub1", "f0/2", "pc1", "eth0");
    const d = labToTopology(lab).doc;
    expect(d.nodes.map(n => n.type)).toEqual(["hub", "switch", "pc"]);
    expect(d.edges.map(e => e.type + " " + e.fromLabel + "-" + e.toLabel)).toEqual(["cross Fa0/1-Fa0/1", "copper Fa0/2-eth0"]);
    expect(checkDiagram(d).filter(f => f.rule === "top.cable")).toEqual([]);
  });
});

describe("files and failures", () => {
  it("the lab's own file reads back the same; a broken one is refused with the lab's message", () => {
    const r = labTextToTopology(serializeLab(wan()));
    expect("doc" in r && r.doc.nodes).toHaveLength(4);
    const bad = labTextToTopology("{\"not\": \"a lab\"}");
    expect("error" in bad && bad.error).toBeTruthy();
    expect(labTextToTopology("not json")).toHaveProperty("error");
  });
  it("settings the lab cannot replay: the devices and cables are still drawn, without addresses, and the learner is told", () => {
    const lab = wan();
    const r = labToTopology({ config: lab.config, actions: [{ type: "no.such.action" }] });
    expect(r.doc.nodes).toHaveLength(4);
    expect(r.doc.edges).toHaveLength(3);
    expect(r.doc.nodes.every(n => !n.text.details)).toBe(true);
    expect(r.problems).toEqual(["تعذّر تشغيل إعدادات الأجهزة كما في المختبر، فرُسمت الأجهزة والكوابل بلا عناوين."]);
  });
  it("an empty network draws nothing", () => {
    const r = labToTopology(EMPTY_LAB);
    expect(r.doc.nodes).toEqual([]);
    expect(r.summary).toBe("رُسمت الشبكة: 0 أجهزة و0 كوابل.");
  });
});
