// N1 (docs/enterprise-network-lab-tool-design.md) — the network lab's pure engine (networkLab.ts):
//   • topology operations keep a network networkTopology@2's validator accepts (names, rows, free ports, limits, self cables, adapters);
//   • a topology edit keeps every action that still applies — a device keeps its configuration when cables change — and drops the actions
//     of a removed device or adapter;
//   • a network BUILT in the lab behaves through the simulator's own engines: two PCs on a switch ping each other; across a router once its
//     interfaces are up; unplugging the cable breaks it; plugging it back restores it with the router's configuration intact;
//   • the file / draft format round-trips and is read strictly (tag, version, keys, a valid topology, actions that ALL apply, size).
import { describe, it, expect } from "vitest";
import { NET2_LIMITS } from "../net2Model";
import { replayNet2 } from "../net2Plugin";
import { NET2_TEMPLATES } from "../networkTopology2/net2Templates";
import {
  EMPTY_LAB, NETLAB_FILE_MAX_CHARS, addDevice, addLink, appendActions, clearConfiguration, freePorts, moveDevice, parseLab, removeDevice,
  removeLink, renameDevice, serializeLab, setAdapters, type NetLab, type NetLabResult,
} from "./networkLab";

const ok = (r: NetLabResult): NetLab => { if (!r.ok) throw new Error(r.message); return r.lab; };
const build = (lab: NetLab, ...steps: ((l: NetLab) => NetLabResult)[]) => steps.reduce((l, f) => ok(f(l)), lab);
const ip = (deviceId: string, address: string, gateway = "") => ({ type: "host.setStatic", deviceId, adapter: "eth0", address, mask: "255.255.255.0", gateway, dns: "" });
const cmd = (deviceId: string, command: string) => ({ type: "host.command", deviceId, command });
const rcmd = (deviceId: string, ...lines: string[]) => lines.map(command => ({ type: "router.command", deviceId, command }));
/** The output of the LAST Command Prompt line run on `host`. */
function lastOutput(lab: NetLab, host: string): string {
  const r = replayNet2(lab.config, lab.actions);
  if (!r.ok) throw new Error(r.code);
  const t = r.transcripts[host];
  return t[t.length - 1].result.output.join("\n");
}
const replies = (out: string) => (out.match(/Reply from/g) ?? []).length;

describe("topology operations", () => {
  it("adds devices with the next free name in their row, and refuses past the simulator's limit", () => {
    const lab = build(EMPTY_LAB, l => addDevice(l, "router"), l => addDevice(l, "pc"), l => addDevice(l, "pc"), l => addDevice(l, "switch"));
    expect(lab.config.devices.map(d => [d.id, d.label])).toEqual([["r1", "R1"], ["pc1", "PC1"], ["pc2", "PC2"], ["sw1", "SW1"]]);
    const [r1, pc1, pc2] = lab.config.devices;
    expect(r1.y).toBeLessThan(pc1.y);
    expect(pc2.x).toBeGreaterThan(pc1.x);
    // after removing PC1, the next PC is PC3 (names are never reused while a higher one exists)
    expect(ok(addDevice(ok(removeDevice(lab, "pc1")), "pc")).config.devices.map(d => d.id)).toContain("pc3");
    let full = EMPTY_LAB;
    for (let i = 0; i < NET2_LIMITS.devices; i++) full = ok(addDevice(full, "pc"));
    const over = addDevice(full, "pc");
    expect(over.ok).toBe(false);
    expect(!over.ok && over.message).toMatch(/الحد الأقصى/);
  });
  it("cables connect free ports only; a used port, a self cable or a port the device lacks is refused", () => {
    let lab = build(EMPTY_LAB, l => addDevice(l, "switch"), l => addDevice(l, "pc"), l => addDevice(l, "laptop"));
    expect(freePorts(lab.config, "pc1")).toEqual(["eth0"]);
    expect(freePorts(lab.config, "lap1")).toEqual([]);                      // a laptop is wireless by default: no cable port
    lab = ok(addLink(lab, { deviceId: "sw1", port: "f0/1" }, { deviceId: "pc1", port: "eth0" }));
    expect(lab.config.links).toEqual([{ id: "l1", a: { deviceId: "sw1", port: "f0/1" }, b: { deviceId: "pc1", port: "eth0" } }]);
    expect(freePorts(lab.config, "pc1")).toEqual([]);
    expect(freePorts(lab.config, "sw1")).not.toContain("f0/1");
    expect(addLink(lab, { deviceId: "sw1", port: "f0/2" }, { deviceId: "pc1", port: "eth0" }).ok).toBe(false);   // port in use
    expect(addLink(lab, { deviceId: "sw1", port: "f0/2" }, { deviceId: "sw1", port: "f0/3" }).ok).toBe(false);   // self
    expect(addLink(lab, { deviceId: "sw1", port: "f0/99" }, { deviceId: "lap1", port: "eth0" }).ok).toBe(false); // no such ports
    expect(ok(removeLink(lab, "l1")).config.links).toEqual([]);
    expect(removeLink(lab, "nope").ok).toBe(false);
  });
  it("move clamps into the drawing, rename refuses an empty name, adapters keep only the cables they still have", () => {
    let lab = build(EMPTY_LAB, l => addDevice(l, "switch"), l => addDevice(l, "pc"));
    expect(ok(moveDevice(lab, "pc1", 1.7, -3)).config.devices[1]).toMatchObject({ x: 1, y: 0 });
    expect(moveDevice(lab, "pc1", Number.NaN, 0).ok).toBe(false);
    expect(ok(renameDevice(lab, "pc1", "  حاسوب المعلم  ")).config.devices[1].label).toBe("حاسوب المعلم");
    expect(renameDevice(lab, "pc1", "   ").ok).toBe(false);
    lab = ok(addLink(lab, { deviceId: "sw1", port: "f0/1" }, { deviceId: "pc1", port: "eth0" }));
    lab = ok(appendActions(lab, [ip("pc1", "10.0.0.1")]));
    const wifiOnly = ok(setAdapters(lab, "pc1", ["wireless"]));
    expect(wifiOnly.config.links).toEqual([]);                               // its Ethernet cable went with the port
    expect(wifiOnly.actions).toEqual([]);                                    // and the eth0 settings with the adapter
    expect(ok(setAdapters(lab, "pc1", ["ethernet", "wireless"])).config.links.length).toBe(1);
    expect(setAdapters(lab, "pc1", []).ok).toBe(false);
    expect(setAdapters(lab, "sw1", ["wireless"]).ok).toBe(false);
  });
});

describe("a network built in the lab runs on the simulator's own engines", () => {
  const lan = () => build(EMPTY_LAB, l => addDevice(l, "switch"), l => addDevice(l, "pc"), l => addDevice(l, "pc"),
    l => addLink(l, { deviceId: "sw1", port: "f0/1" }, { deviceId: "pc1", port: "eth0" }),
    l => addLink(l, { deviceId: "sw1", port: "f0/2" }, { deviceId: "pc2", port: "eth0" }),
    l => appendActions(l, [ip("pc1", "192.168.1.10"), ip("pc2", "192.168.1.20")]));
  it("two PCs on a switch ping each other; unplugging a cable breaks it; plugging it back restores it", () => {
    const lab = ok(appendActions(lan(), [cmd("pc1", "ping 192.168.1.20")]));
    expect(replies(lastOutput(lab, "pc1"))).toBe(4);
    const unplugged = ok(removeLink(lab, "l2"));
    expect(unplugged.actions).toEqual(lab.actions);                          // nothing of the PCs' configuration is lost
    expect(replies(lastOutput(unplugged, "pc1"))).toBe(0);
    const back = ok(addLink(unplugged, { deviceId: "sw1", port: "f0/5" }, { deviceId: "pc2", port: "eth0" }));
    expect(replies(lastOutput(back, "pc1"))).toBe(4);
  });
  it("across a router: the PCs reach each other only once the router's interfaces are up; removing a device drops its actions", () => {
    let lab = build(EMPTY_LAB, l => addDevice(l, "router"), l => addDevice(l, "pc"), l => addDevice(l, "pc"),
      l => addLink(l, { deviceId: "r1", port: "g0/0" }, { deviceId: "pc1", port: "eth0" }),
      l => addLink(l, { deviceId: "r1", port: "g0/1" }, { deviceId: "pc2", port: "eth0" }),
      l => appendActions(l, [ip("pc1", "10.1.1.10", "10.1.1.1"), ip("pc2", "10.2.2.20", "10.2.2.1")]));
    expect(replies(lastOutput(ok(appendActions(lab, [cmd("pc1", "ping 10.2.2.20")])), "pc1"))).toBe(0);
    lab = ok(appendActions(lab, rcmd("r1", "enable", "configure terminal", "interface g0/0", "ip address 10.1.1.1 255.255.255.0", "no shutdown",
      "interface g0/1", "ip address 10.2.2.1 255.255.255.0", "no shutdown", "end")));
    const pinged = ok(appendActions(lab, [cmd("pc1", "ping 10.2.2.20")]));
    expect(replies(lastOutput(pinged, "pc1"))).toBe(4);
    const noRouter = ok(removeDevice(pinged, "r1"));
    expect(noRouter.config.links).toEqual([]);
    expect(noRouter.actions.some(a => (a as { deviceId?: string }).deviceId === "r1")).toBe(false);
    expect(noRouter.actions.length).toBe(3);                                 // the two PCs' addresses and the ping stay
    expect(clearConfiguration(pinged)).toEqual({ config: pinged.config, actions: [] });
  });
  it("device actions are refused when they do not apply or a bound is reached", () => {
    const lab = lan();
    expect(appendActions(lab, [ip("nope", "1.1.1.1")]).ok).toBe(false);
    expect(appendActions(lab, [{ type: "device.add", kind: "pc" }]).ok).toBe(false);
    const many = Array.from({ length: NET2_LIMITS.hostCommandsPerDevice + 1 }, () => cmd("pc1", "ipconfig"));
    const r = appendActions(lab, many);
    expect(!r.ok && r.message).toMatch(/الحد الأقصى لأوامر هذا الحاسوب/);
  });
});

describe("file and draft", () => {
  it("round-trips a network, and every example of the simulator opens", () => {
    const lab = ok(appendActions(build(EMPTY_LAB, l => addDevice(l, "router"), l => addDevice(l, "pc")), [ip("pc1", "10.0.0.5")]));
    expect(ok(parseLab(serializeLab(lab)))).toEqual(lab);
    for (const t of NET2_TEMPLATES) expect(parseLab(serializeLab({ config: t.config(), actions: [] })).ok, t.id).toBe(true);
  });
  it("reads strictly: wrong tag, version, extra key, broken topology, an action that does not apply, too big, not JSON", () => {
    const good = JSON.parse(serializeLab(ok(appendActions(ok(addDevice(EMPTY_LAB, "pc")), [ip("pc1", "10.0.0.5")]))));
    const bad = (o: unknown) => parseLab(typeof o === "string" ? o : JSON.stringify(o));
    expect(bad({ ...good, format: "other" }).ok).toBe(false);
    expect(bad({ ...good, version: 2 }).ok).toBe(false);
    expect(bad({ ...good, extra: 1 }).ok).toBe(false);
    expect(bad({ ...good, config: { ...good.config, devices: [{ id: "__proto__", kind: "pc", label: "X", x: 0, y: 0 }] } }).ok).toBe(false);
    expect(bad({ ...good, actions: [...good.actions, ip("ghost", "10.0.0.9")] }).ok).toBe(false);   // never silently dropped from a file
    expect(bad({ ...good, actions: "x" }).ok).toBe(false);
    expect(bad("x".repeat(NETLAB_FILE_MAX_CHARS + 1)).ok).toBe(false);
    expect(bad("{not json").ok).toBe(false);
    expect(bad("").ok).toBe(false);
    expect(parseLab(42).ok).toBe(false);
  });
});
