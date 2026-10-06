import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routerTwoSwitchesFourPcsTemplate, twoLanDemoChecks } from "./networkTopology/networkTopologyTemplates";
import { validateTopologyConfig, TOPOLOGY_LIMITS, TOPOLOGY_DEVICE_KINDS } from "./networkTopologyModel";
import { NETWORK_TOPOLOGY_ACTION_TYPES, NETWORK_CHECK_KINDS, NETWORK_TOPOLOGY_DESCRIPTOR_V1, replayTopology, networkTopologyPluginV1 } from "./networkTopologyPlugin";
import { canReach, pingAddress } from "./networkConnectivity";
import { replayCommands, createDeviceState, COMMAND_TABLE } from "./networkCliEngine";
import { createRouterSession, createRouterState, executeRouterCommand } from "./routerCliEngine";
import { evaluateSmartSim, resolveSmartSimPlugin, resolveSmartSimDescriptor } from "./trustedSimPlugins";

// Phase 20C — the networkTopology@1 / networkCli@1 / router CLI v1 FREEZE. networkTopology@2 is ADDITIVE: every published v1 question,
// action, state, check, replay, reachability result and grade must stay byte-identical. These are PINS: the SHA-256 digests below were
// captured on the baseline 686afbc (before any 20C code) and must never change. A digest change means v1 semantics moved — a release
// blocker, never a test to "update".
const here = path.dirname(fileURLToPath(import.meta.url));
const digest = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const M24 = "255.255.255.0";
const pc = (id: string, a: string, gw: string) => [{ type: "pc.setAddress", deviceId: id, value: a }, { type: "pc.setMask", deviceId: id, value: M24 }, { type: "pc.setGateway", deviceId: id, value: gw }];
const cmd = (kind: string, id: string, ...c: string[]) => c.map(command => ({ type: kind + ".command", deviceId: id, command }));
const FULL = [...pc("pc1", "192.168.10.10", "192.168.10.254"), ...pc("pc2", "192.168.10.20", "192.168.10.254"), ...pc("pc3", "192.168.20.10", "192.168.20.254"), ...pc("pc4", "192.168.20.20", "192.168.20.254"),
  ...cmd("switch", "sw1", "enable", "configure terminal", "hostname BR1-SW1", "vlan 10", "name STAFF", "interface f0/1", "switchport mode access", "switchport access vlan 1", "end", "show running-config", "show vlan brief"),
  ...cmd("switch", "sw2", "enable", "conf t", "hostname BR1-SW2", "interface g0/1", "switchport mode trunk", "switchport trunk native vlan 99", "switchport trunk allowed vlan 10", "end", "show interfaces trunk"),
  ...cmd("router", "r1", "enable", "configure terminal", "interface g0/0", "ip address 192.168.10.254 255.255.255.0", "no shutdown", "interface g0/1", "ip address 192.168.20.254 255.255.255.0", "no shutdown", "end", "show ip interface brief", "show ip route", "show running-config", "interface g0/0.10", "ip dhcp pool X")];
const SWITCH_LINES = ["enable", "configure terminal", "hostname S1", "vlan 20", "name LAB", "exit", "interface fastEthernet 0/5", "switchport mode access", "switchport access vlan 30", "shutdown", "no shutdown",
  "interface vlan 20", "ip address 10.0.0.2 255.255.255.0", "no shutdown", "interface g0/1", "switchport mode trunk", "switchport trunk native vlan 20", "switchport trunk allowed vlan 10,20", "switchport port-security",
  "vtp mode client", "enable secret cisco", "line console 0", "end", "show running-config", "show vlan brief", "show interfaces trunk", "show ip interface brief", "show mac address-table", "do show run", "ping 1.1.1.1", "x; rm -rf /"];
const ROUTER_LINES = ["enable", "configure terminal", "hostname R9", "interface g0/2", "ip address 172.16.0.1 255.255.0.0", "no shutdown", "interface g0/3", "ip address 172.16.5.1 255.255.255.0", "end",
  "show ip interface brief", "show ip route", "show running-config", "configure terminal", "interface g0/0.10", "encapsulation dot1Q 10", "ip dhcp pool LAN", "ip route 0.0.0.0 0.0.0.0 1.1.1.1", "router ospf 1", "enable secret x"];

describe("20C-V1 FREEZE — networkTopology@1 / networkCli@1 / router CLI v1 stay byte-identical (PINS captured on 686afbc)", () => {
  it("V1-1 templates, config validation, limits and kinds", () => {
    expect(digest({ t: routerTwoSwitchesFourPcsTemplate(), c: twoLanDemoChecks() })).toBe(PIN.templates);
    expect(digest(validateTopologyConfig(routerTwoSwitchesFourPcsTemplate()))).toBe(PIN.validation);
    expect({ limits: TOPOLOGY_LIMITS, kinds: TOPOLOGY_DEVICE_KINDS }).toEqual({ limits: { devices: 20, links: 40, labelChars: 24, commandsPerDevice: 300, actions: 1000, pcValueChars: 15 }, kinds: ["router", "switch", "pc"] });
    const bad = { v: 1, devices: [{ id: "ap1", kind: "ap", label: "AP", x: 0.5, y: 0.5 }, { id: "l1", kind: "laptop", label: "L", x: 0.1, y: 0.1 }], links: [] };
    expect(digest(validateTopologyConfig(bad))).toBe(PIN.refusedV2Kinds);                                          // v1 never learns the v2 device kinds
    expect(digest(validateTopologyConfig({ ...routerTwoSwitchesFourPcsTemplate(), v: 2 }))).toBe(PIN.refusedV2Config);
  });
  it("V1-2 action vocabulary, check vocabulary and descriptor", () => {
    expect([...NETWORK_TOPOLOGY_ACTION_TYPES]).toEqual(["pc.setAddress", "pc.setMask", "pc.setGateway", "pc.setDns", "switch.command", "router.command"]);
    expect(digest(NETWORK_CHECK_KINDS)).toBe(PIN.checkKinds);
    expect(digest(NETWORK_TOPOLOGY_DESCRIPTOR_V1)).toBe(PIN.descriptor);
    expect(resolveSmartSimPlugin("networkTopology", 1)).toBe(networkTopologyPluginV1);
    expect(resolveSmartSimDescriptor("networkTopology", 1)).toEqual(NETWORK_TOPOLOGY_DESCRIPTOR_V1);
  });
  it("V1-3 replay of a full exercise: canonical state, transcripts (incl. refused v2 commands) and every reachability pair", () => {
    const r = replayTopology(routerTwoSwitchesFourPcsTemplate(), FULL);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(digest(r.state)).toBe(PIN.replayState);
    expect(digest(r.transcripts)).toBe(PIN.replayTranscripts);
    const ids = ["pc1", "pc2", "pc3", "pc4", "r1", "sw1"];
    expect(digest(ids.flatMap(a => ids.map(b => canReach(a, b, routerTwoSwitchesFourPcsTemplate(), r.state))))).toBe(PIN.reachMatrix);
    expect(digest(["192.168.20.10", "192.168.10.254", "10.9.9.9", "bad"].map(ip => pingAddress("pc1", ip, routerTwoSwitchesFourPcsTemplate(), r.state)))).toBe(PIN.pings);
  });
  it("V1-4 networkCli@1 switch engine: command table and a mixed history incl. commands that are v2-only", () => {
    expect(digest(COMMAND_TABLE.map(c => [c.id, c.keywords, c.modes, c.syntax]))).toBe(PIN.switchTable);
    expect(digest(replayCommands(createDeviceState(), SWITCH_LINES))).toBe(PIN.switchReplay);
  });
  it("V1-5 router CLI v1: a mixed history incl. sub-interfaces / DHCP / routing (all refused in v1)", () => {
    let s = createRouterSession(createRouterState());
    const out: unknown[] = [];
    for (const line of ROUTER_LINES) { const r = executeRouterCommand(s, line, { linkUp: p => p !== "g0/3" }); s = r.session; out.push(r.result); }
    expect(digest({ out, state: s.state })).toBe(PIN.routerReplay);
  });
  it("V1-6 grading of the canonical exercise through the core is unchanged", () => {
    const env = { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: routerTwoSwitchesFourPcsTemplate() };
    const res = evaluateSmartSim({ envelope: env, answerKey: { scoring: "proportional", checks: twoLanDemoChecks() }, response: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 1, actions: FULL, state: {} }, maxMarks: 23 }, { withDetails: true });
    expect(digest(res)).toBe(PIN.grade);
  });
  it("V1-7 the frozen v1 source files are not edited by 20C (content digests)", () => {
    for (const f of Object.keys(PIN.files)) expect(crypto.createHash("sha256").update(fs.readFileSync(path.join(here, f))).digest("hex"), f).toBe(PIN.files[f as keyof typeof PIN.files]);
  });
});

const PIN = {
  templates: "a63524611c75463835852bd4a64407a6b519d836de0a562107fc86868cb1b78b",
  validation: "494b5ab761e83f83a1dcab3280f2c563fb18ca31b9c60ee1163d94533c60a934",
  refusedV2Kinds: "c6219221c7754f3a70a3cc1159eef141ba4bc9e09ae8c98be9c2c1ce2c0fa744",
  refusedV2Config: "0dcedf27e072aa219d850b02c53dd360ba029bdc526502630044932afe792064",
  checkKinds: "f3a25514ddc659ed3e795e479d5b374c60c56a2bb3dae7fa6a98cb72dcb911fb",
  descriptor: "101f8857b5eee99f56472ea5855779e8b047c62d8d36b517d4f51c16d21bb197",
  replayState: "c0e2383abd908260d4d8050e4305e54ac5cc9431c65f7a8aa74d5e7a4319b3ff",
  replayTranscripts: "8c91dcc00f3b999e47b77c77cf8a9c0c31afd3959fd5b446f27d6ec2f9bd5a58",
  reachMatrix: "305a770941deef5245c81f4e34470c68b0d730c83e83a25796075df7d2ffdf5c",
  pings: "a26ee12f88b4fc6dd298b43975e69743bcc2314efa26a651b48b1c5d9217d048",
  switchTable: "1655c71d6642436497b67669bb4f7edfdd864cb7e8bb7da9a2957d83cb94a67f",
  switchReplay: "3ecc5b562e90ac95726659ba7b62a754f8d10c8be797c67dd4c46da91b3b1d44",
  routerReplay: "a65847e3fa57180619ba1a3978c0b794c3985907d1a1646e9ef75bb98cd4c4b2",
  grade: "105ffd1e15813133e0bbcaa56af1fadffbd0a14ef3f4189761f04c717f0cc220",
  files: {
    "networkCliEngine.ts": "c6523ef06a6b5ed281927bb90f6390635eb2b6603e0f95557d92f5458db09e47",
    "routerCliEngine.ts": "a1428c0619ae3b9aca3be56ae6dd3acd1ce366981d3d9faf7d3a6113bda340e9",
    "networkTopologyModel.ts": "1a5513c8b5525bfdb6b9a9d8b01052d3098671f23b336182b977b28bc19bea3c",
    "networkConnectivity.ts": "0a101176cd81de67b7b76e9089f987727211fef9863138a6b5f843131fd85930",
    "networkTopologyPlugin.ts": "5ab2fcf03faf36f8667a0081ab3967c90250f8a8e3a530512781dc6d9ebc544b",
    "networkTopology/NetworkTopologyWorkspace.tsx": "00c01e6e08dbbba455b74718f660af2fd7a21150a7961053340cc25b5b6edb7d",
    "networkTopology/NetworkTopologyEditor.tsx": "094f83ab8c598305031f80a5e65d09c27f52e5949d49c77ac400e9e6df6dd549",
    "networkTopology/NetworkTopologyReview.tsx": "df942ada88953adb8b895689daf1fd65db57f293368b740ad7e738b6750d792f",
    "networkTopology/TopologyDiagram.tsx": "c4fc15acb4afc4a7191ee7a9ba74a6e089c66a3d69492e5c56fa4e3f1da5140c",
    "networkTopology/networkTopologyTemplates.ts": "5572110097e41d2dbafee94276a65a1cf647f3da5732d3d55f67c22527761415",
    "networkCli/CliTerminalSurface.tsx": "eb2ca196b7c10ccfdfe4c7d50a78a4d7cc97cefc51ed168a5a2a514bc2948bc0"
  }
};
