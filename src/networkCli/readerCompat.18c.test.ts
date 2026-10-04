import { describe, it, expect } from "vitest";
import { executeCommand as examExec, createSession, createDeviceState, promptFor as examPrompt, normalizeInterfaceName as examIf, isIpv4 as examIp, isSubnetMask as examMask, parseVlanId as examVlan, type NetworkCliSession } from "../networkCliEngine";
import { executeCommand as readerExec } from "../learning/cli/engine";
import { createDeviceState as readerDevice, promptFor as readerPrompt } from "../learning/cli/state";
import { normalizeInterfaceName as readerIf, isIpv4 as readerIp, isSubnetMask as readerMask, parseVlanId as readerVlan } from "../learning/cli/normalize";
import type { CliDeviceState } from "../learning/cli/types";

// Phase 18C — COMPATIBILITY PINS between the exam engine (networkCli@1, frozen) and the Learning Reader CLI (src/learning/cli,
// content-versioned) for the V1 subset they share. The two are separate modules on purpose (a published exam must never follow the
// Reader's content batches), so this suite pins the educational SEMANTICS students carry from the Reader into an assessment:
// prompts per mode, canonical interface names, IPv4 / mask / VLAN rules, and the configuration facts after the same command
// sequence. Documented divergences are asserted explicitly, never hidden.
const examRun = (lines: string[]): NetworkCliSession => lines.reduce((s, l) => examExec(s, l).session, createSession(createDeviceState()));
const readerRun = (lines: string[]): CliDeviceState => lines.reduce((s, l) => readerExec(s, l).state, readerDevice("switch"));

describe("18C compatibility pins — exam engine ≡ Reader CLI on the shared subset", () => {
  it("prompts per mode are identical", () => {
    const seq = [["enable"], ["enable", "configure terminal"], ["enable", "configure terminal", "interface fa0/1"], ["enable", "configure terminal", "vlan 10"], ["enable", "configure terminal", "hostname SW1", "interface vlan 1"]];
    for (const lines of seq) expect(examPrompt(examRun(lines)), lines.join(" / ")).toBe(readerPrompt(readerRun(lines)));
    expect(examPrompt(examRun([]))).toBe(readerPrompt(readerRun([])));
  });
  it("canonical interface names, IPv4, mask and VLAN-id rules agree on every shared spelling", () => {
    for (const sp of ["FastEthernet0/1", "fa0/1", "Fa 0/1", "f0/1", "GigabitEthernet0/1", "gi0/1", "g0/1", "vlan 10", "Vlan10"]) expect(examIf(sp), sp).toBe(readerIf(sp));
    for (const ip of ["192.168.1.1", "10.0.0.254", "1.1.1", "01.1.1.1", "256.1.1.1", "a.b.c.d", ""]) expect(examIp(ip), ip).toBe(readerIp(ip));
    for (const m of ["255.255.255.0", "255.255.0.0", "255.255.255.252", "255.0.255.0", "0.0.0.0", "255.255.255.128"]) expect(examMask(m), m).toBe(readerMask(m));
    for (const v of ["1", "10", "4094", "0", "4095", "abc", "99999", "+10"]) expect(examVlan(v, { allowOne: true, allowReserved: true }), v).toBe(readerVlan(v));
  });
  it("the same V1 command sequence yields the same configuration facts (hostname, VLAN names, port mode / access / native VLAN, SVI address, shutdown)", () => {
    const lines = ["enable", "configure terminal", "hostname BR1-SW1", "vlan 20", "name SALES", "exit", "interface fa0/5", "switchport mode access", "switchport access vlan 20", "shutdown", "exit", "interface gi0/1", "switchport mode trunk", "switchport trunk native vlan 99", "exit", "interface vlan 20", "ip address 192.168.20.2 255.255.255.0", "no shutdown", "end"];
    const e = examRun(lines).state, r = readerRun(lines);
    expect(e.hostname).toBe(r.hostname);
    expect(e.vlans["20"].name).toBe(r.vlans["20"].name);
    expect(e.interfaces["f0/5"].mode).toBe(r.interfaces["f0/5"].switchportMode);
    expect(e.interfaces["f0/5"].accessVlan).toBe(r.interfaces["f0/5"].accessVlan);
    expect(e.interfaces["f0/5"].shutdown).toBe(r.interfaces["f0/5"].shutdown);
    expect(e.interfaces["g0/1"].mode).toBe(r.interfaces["g0/1"].switchportMode);
    expect(e.interfaces["g0/1"].nativeVlan).toBe(r.interfaces["g0/1"].nativeVlan);
    expect(e.interfaces["vlan20"].ipAddress).toBe(r.interfaces["vlan20"].ipAddress);
    expect(e.interfaces["vlan20"].subnetMask).toBe(r.interfaces["vlan20"].subnetMask);
  });
  it("documented divergences (deliberate, V1): the exam engine is STRICTER on the device model and the Reader is broader on content", () => {
    // 1. Vlan1 is administratively down by default on the exam switch (IOS default); the Reader starts every switch interface up.
    expect(examRun(["enable", "configure terminal", "interface vlan 1"]).state.interfaces["vlan1"]).toBeUndefined();
    expect(readerRun(["enable", "configure terminal", "interface vlan 1"]).interfaces["vlan1"].shutdown).toBe(false);
    // 2. Interfaces outside the educational switch's inventory are refused by the exam engine; the Reader accepts any slot/port.
    expect(examExec(examRun(["enable", "configure terminal"]), "interface fa1/1").result.status).toBe("invalid");
    expect(readerExec(readerRun(["enable", "configure terminal"]), "interface fa1/1").result.status).toBe("ok");
    // 3. Routing / DHCP / ACL / port-security / line / VTP commands exist only in the Reader; the exam engine reports them as unknown.
    for (const line of ["router ospf 1", "ip dhcp pool P", "access-list 1 permit any", "line vty 0 4"]) expect(examExec(examRun(["enable", "configure terminal"]), line).result.status, line).toBe("unknown");
    // 4. An access VLAN that does not exist is auto-created with a notice on the exam engine (IOS behaviour); the Reader stores the id silently.
    const auto = examExec(examRun(["enable", "configure terminal", "interface fa0/2"]), "switchport access vlan 30");
    expect(auto.result.output[0]).toMatch(/Creating vlan 30/); expect(auto.session.state.vlans["30"]).toEqual({});
    expect(readerRun(["enable", "configure terminal", "interface fa0/2", "switchport access vlan 30"]).vlans["30"]).toBeUndefined();
    // 5. A host mask (/32) and the network / broadcast address are refused by the exam engine; the Reader only checks the mask shape.
    expect(examExec(examRun(["enable", "configure terminal", "interface vlan 10"]), "ip address 10.0.0.1 255.255.255.255").result.status).toBe("invalid");
    expect(readerExec(readerRun(["enable", "configure terminal", "interface vlan 10"]), "ip address 10.0.0.1 255.255.255.255").result.status).toBe("ok");
  });
});
