import { describe, it, expect } from "vitest";
import {
  NETWORK_CLI_STATE_VERSION, NETWORK_CLI_LIMITS, NETWORK_CLI_MODES, SWITCH_PORTS,
  createDeviceState, createSession, promptFor, executeCommand, replayCommands, canonicalizeState, serializeState, normalizeDeviceState,
  normalizeInterfaceName, displayInterfaceName, isIpv4, isSubnetMask, parseVlanId, isValidHostname, isValidVlanName,
  showRunningConfig, showVlanBrief, showInterfacesTrunk, showIpInterfaceBrief, parseCommand, effectiveInterfaceConfig,
  type NetworkCliSession
} from "./networkCliEngine";

// Phase 18C — networkCli@1: the pure, deterministic educational managed-switch CLI engine (parse → mode check → apply → show).
// New-function tests written alongside the implementation (fail-first on 86f334b8: the module does not exist).
const run = (s: NetworkCliSession, ...lines: string[]) => lines.reduce((acc, l) => executeCommand(acc, l).session, s);
const fresh = () => createSession(createDeviceState());
const exec = (s: NetworkCliSession, line: string) => executeCommand(s, line);
const CONFIG_IF = ["enable", "configure terminal", "interface fastEthernet 0/5"];

describe("identity, bounds and the closed mode machine", () => {
  it("state version 1, five modes, bounded input / tokens / history", () => {
    expect(NETWORK_CLI_STATE_VERSION).toBe(1);
    expect(NETWORK_CLI_MODES).toEqual(["user", "privileged", "global", "interface", "vlan"]);
    expect(NETWORK_CLI_LIMITS.inputChars).toBe(200); expect(NETWORK_CLI_LIMITS.tokens).toBe(24); expect(NETWORK_CLI_LIMITS.commands).toBe(300);
    expect(SWITCH_PORTS.length).toBe(26); expect(SWITCH_PORTS[0]).toBe("f0/1"); expect(SWITCH_PORTS[23]).toBe("f0/24"); expect(SWITCH_PORTS[25]).toBe("g0/2");
  });
  it("initial prompt is Switch> ; enable / disable / configure terminal / exit / end move between modes explicitly", () => {
    let s = fresh();
    expect(promptFor(s)).toBe("Switch>");
    s = run(s, "enable"); expect(s.mode).toBe("privileged"); expect(promptFor(s)).toBe("Switch#");
    s = run(s, "configure terminal"); expect(s.mode).toBe("global"); expect(promptFor(s)).toBe("Switch(config)#");
    s = run(s, "interface fastEthernet 0/1"); expect(s.mode).toBe("interface"); expect(promptFor(s)).toBe("Switch(config-if)#"); expect(s.selectedInterface).toBe("f0/1");
    s = run(s, "exit"); expect(s.mode).toBe("global"); expect(s.selectedInterface).toBeUndefined();
    s = run(s, "vlan 10"); expect(s.mode).toBe("vlan"); expect(promptFor(s)).toBe("Switch(config-vlan)#"); expect(s.selectedVlan).toBe(10);
    s = run(s, "end"); expect(s.mode).toBe("privileged"); expect(s.selectedVlan).toBeUndefined();
    s = run(s, "disable"); expect(s.mode).toBe("user");
    s = run(s, "exit"); expect(s.mode).toBe("user");                                                 // user EXEC stays (no logout is simulated)
  });
  it("abbreviations are deliberate: en, conf t, config t, int, shut, no shut, show run, show ip int br, show int trunk", () => {
    let s = run(fresh(), "en", "conf t", "int fa0/3", "shut");
    expect(s.mode).toBe("interface"); expect(s.state.interfaces["f0/3"]).toEqual({ shutdown: true });
    s = run(s, "no shut"); expect(s.state.interfaces["f0/3"]).toBeUndefined();                          // back to the physical-port default: not stored
    expect(exec(s, "show run").result.status).toBe("ok");
    expect(exec(s, "show ip int br").result.status).toBe("ok");
    expect(exec(s, "show int trunk").result.status).toBe("ok");
    expect(exec(run(fresh(), "enable"), "config t").session.mode).toBe("global");
    expect(exec(fresh(), "ena").result.status).toBe("unknown");                                      // not an accepted abbreviation
  });
  it("wrong-mode commands are refused deterministically and never change state", () => {
    const user = fresh();
    const r1 = exec(user, "configure terminal");
    expect(r1.result.status).toBe("wrong-mode"); expect(r1.session).toBe(user); expect(r1.result.output[0]).toMatch(/^% /); expect(r1.result.hint).toMatch(/enable/);
    const glob = run(fresh(), "enable", "configure terminal");
    for (const line of ["switchport mode access", "ip address 10.0.0.1 255.0.0.0", "name X", "shutdown", "disable", "enable"]) {
      const r = exec(glob, line); expect(r.result.status, line).toBe("wrong-mode"); expect(r.session, line).toBe(glob);
    }
    expect(exec(run(fresh(), "enable"), "hostname X").result.status).toBe("wrong-mode");
    expect(exec(user, "show running-config").result.status).toBe("wrong-mode");                     // privileged EXEC only
    expect(exec(user, "show vlan brief").result.status).toBe("ok");                                  // allowed in user EXEC
  });
});

describe("commands change ONLY canonical configuration state", () => {
  it("hostname changes the prompt immediately; format and length are validated, never normalized", () => {
    const s = run(fresh(), "enable", "configure terminal", "hostname BR1-SW1");
    expect(s.state.hostname).toBe("BR1-SW1"); expect(promptFor(s)).toBe("BR1-SW1(config)#");
    const inIf = run(s, "interface gigabitEthernet 0/1"); expect(promptFor(inIf)).toBe("BR1-SW1(config-if)#");
    const g = run(fresh(), "enable", "configure terminal");
    for (const bad of ["hostname 1SW", "hostname SW-", "hostname sw 1", "hostname sw;rm", "hostname " + "a".repeat(64), "hostname __proto__", "hostname sw$(id)"]) {
      const r = exec(g, bad); expect(r.result.status, bad).toBe("invalid"); expect(r.session.state.hostname, bad).toBe("Switch");
    }
    expect(exec(g, "hostname").result.status).toBe("incomplete");
    expect(run(g, "hostname " + "a".repeat(63)).state.hostname.length).toBe(63);
    expect(isValidHostname("BR1-SW1")).toBe(true); expect(isValidHostname("sw_1")).toBe(true); expect(isValidHostname("-x")).toBe(false);
  });
  it("vlan <id> creates the VLAN (1 is implicit, 1002-1005 reserved, 0 / 4095 / text refused); name sets it; VLAN 1 cannot be renamed", () => {
    let s = run(fresh(), "enable", "configure terminal", "vlan 20", "name SALES");
    expect(s.state.vlans).toEqual({ "20": { name: "SALES" } });
    s = run(s, "exit", "vlan 30"); expect(s.state.vlans["30"]).toEqual({});
    const g = run(fresh(), "enable", "configure terminal");
    for (const bad of ["vlan 0", "vlan 4095", "vlan 1003", "vlan abc", "vlan 10 20", "vlan 99999999999999999999", "vlan 1e3", "vlan 0x10"]) {
      const r = exec(g, bad); expect(r.result.status, bad).toBe("invalid"); expect(r.session.state.vlans, bad).toEqual({});
    }
    expect(exec(g, "vlan").result.status).toBe("incomplete");
    const v1 = run(g, "vlan 1"); expect(v1.mode).toBe("vlan"); expect(v1.state.vlans).toEqual({});
    const r = exec(v1, "name MGMT"); expect(r.result.status).toBe("invalid"); expect(r.session.state.vlans).toEqual({});
    const v20 = run(g, "vlan 20");
    for (const bad of ["name", "name a b", "name " + "x".repeat(33), "name -x", "name __proto__"]) expect(exec(v20, bad).result.status, bad).toMatch(/invalid|incomplete/);
    expect(isValidVlanName("Sales_10")).toBe(true); expect(isValidVlanName("")).toBe(false);
  });
  it("interface grammar: FastEthernet 0/1 … 0/24 and GigabitEthernet 0/1 … 0/2 in every accepted spelling; everything else is refused", () => {
    for (const sp of ["fastEthernet 0/5", "FastEthernet0/5", "fa0/5", "Fa 0/5", "f0/5", "fastethernet0/5"]) expect(normalizeInterfaceName(sp), sp).toBe("f0/5");
    for (const sp of ["gigabitEthernet 0/1", "GigabitEthernet0/1", "gi0/1", "g0/1", "gig 0/1"]) expect(normalizeInterfaceName(sp), sp).toBe("g0/1");
    for (const sp of ["vlan 10", "Vlan10", "VLAN 10"]) expect(normalizeInterfaceName(sp), sp).toBe("vlan10");
    for (const sp of ["fa0/25", "fa1/1", "gi0/3", "f0/0", "ethernet0/1", "serial0/0/0", "fa0/1.10", "fa0/1-3", "vlan 0", "vlan 4095", "x0/1", "fa0/01"]) expect(normalizeInterfaceName(sp), sp).toBeNull();
    expect(displayInterfaceName("f0/5")).toBe("FastEthernet0/5"); expect(displayInterfaceName("g0/2")).toBe("GigabitEthernet0/2"); expect(displayInterfaceName("vlan10")).toBe("Vlan10");
    const g = run(fresh(), "enable", "configure terminal");
    expect(exec(g, "interface fa0/25").result.status).toBe("invalid"); expect(exec(g, "interface").result.status).toBe("incomplete");
    expect(exec(g, "interface range fa0/1-3").result.status).toBe("not-supported");
    const s = run(g, "interface fa0/7", "interface fa0/8");                                            // selecting another interface from interface mode is allowed
    expect(s.selectedInterface).toBe("f0/8"); expect(s.mode).toBe("interface");
  });
  it("access ports: switchport mode access + switchport access vlan (auto-creates a missing VLAN with a notice, like IOS)", () => {
    const s = run(fresh(), ...CONFIG_IF, "switchport mode access", "switchport access vlan 20");
    expect(s.state.interfaces["f0/5"]).toEqual({ mode: "access", accessVlan: 20 });
    expect(s.state.vlans["20"]).toEqual({});
    const r = exec(run(fresh(), ...CONFIG_IF), "switchport access vlan 20");
    expect(r.result.status).toBe("ok"); expect(r.result.output.join("\n")).toMatch(/Access VLAN does not exist. Creating vlan 20/);
    const existing = run(fresh(), "enable", "configure terminal", "vlan 20", "exit", "interface fa0/5");
    expect(exec(existing, "switchport access vlan 20").result.output).toEqual([]);
    for (const bad of ["switchport access vlan 0", "switchport access vlan 1002", "switchport access vlan 4095", "switchport access vlan x", "switchport mode dynamic", "switchport mode"]) expect(exec(run(fresh(), ...CONFIG_IF), bad).result.status, bad).toMatch(/invalid|incomplete/);
    expect(run(fresh(), ...CONFIG_IF, "switchport access vlan 1").state.interfaces["f0/5"]).toBeUndefined();   // VLAN 1 is the default: nothing stored
  });
  it("trunks: switchport mode trunk + native vlan (stored even in access mode, effective on trunks; no auto-create)", () => {
    const s = run(fresh(), ...CONFIG_IF, "switchport mode trunk", "switchport trunk native vlan 99");
    expect(s.state.interfaces["f0/5"]).toEqual({ mode: "trunk", nativeVlan: 99 });
    expect(s.state.vlans["99"]).toBeUndefined();
    expect(exec(run(fresh(), ...CONFIG_IF), "switchport trunk native vlan 1005").result.status).toBe("invalid");
    expect(exec(run(fresh(), ...CONFIG_IF), "switchport trunk native vlan").result.status).toBe("incomplete");
    expect(exec(run(fresh(), ...CONFIG_IF), "switchport trunk allowed vlan 10,20").result.status).toBe("not-supported");
  });
  it("SVI: interface vlan <id> + ip address <ipv4> <mask> (+ shutdown / no shutdown); switchport commands are rejected on an SVI and ip address on a physical port", () => {
    const s = run(fresh(), "enable", "configure terminal", "interface vlan 10", "ip address 192.168.10.2 255.255.255.0", "no shutdown");
    expect(s.state.interfaces["vlan10"]).toEqual({ ipAddress: "192.168.10.2", subnetMask: "255.255.255.0" });   // a new SVI is up by default
    const v1 = run(fresh(), "enable", "configure terminal", "interface vlan 1", "ip address 10.0.0.5 255.0.0.0", "no shutdown");
    expect(v1.state.interfaces["vlan1"]).toEqual({ ipAddress: "10.0.0.5", subnetMask: "255.0.0.0", shutdown: false });   // Vlan1 is shut by default
    expect(exec(run(fresh(), "enable", "configure terminal", "interface vlan 10"), "switchport mode access").result.status).toBe("invalid");
    expect(exec(run(fresh(), ...CONFIG_IF), "ip address 10.0.0.1 255.0.0.0").result.status).toBe("invalid");
    const svi = run(fresh(), "enable", "configure terminal", "interface vlan 10");
    for (const bad of ["ip address 256.1.1.1 255.255.255.0", "ip address 10.0.0.1 255.255.0.255", "ip address 10.0.0.1", "ip address 10.0.0.1 255.255.255.0 secondary", "ip address 10.0.0.01 255.255.255.0", "ip address 192.168.1.0 255.255.255.0", "ip address 192.168.1.255 255.255.255.0", "ip address 10.0.0.1 0.0.0.0", "ip address 10.0.0.1 255.255.255.255", "ip address 0.0.0.1 255.0.0.0", "ip address 224.0.0.1 255.0.0.0", "ip address 10.0.0.1 255.255.255.0; id", "ip address a.b.c.d 255.0.0.0"]) {
      const r = exec(svi, bad); expect(r.result.status, bad).toMatch(/invalid|incomplete/); expect(r.session.state.interfaces["vlan10"], bad).toEqual({});   // exists (entered), still unaddressed
    }
    expect(isIpv4("192.168.1.1")).toBe(true); expect(isIpv4("192.168.1")).toBe(false); expect(isIpv4("01.1.1.1")).toBe(false); expect(isIpv4("1.1.1.1 ")).toBe(false);
    expect(isSubnetMask("255.255.255.0")).toBe(true); expect(isSubnetMask("255.255.255.252")).toBe(true); expect(isSubnetMask("255.0.255.0")).toBe(false); expect(isSubnetMask("0.0.0.0")).toBe(false);
    expect(parseVlanId("10")).toBe(10); expect(parseVlanId("4094")).toBe(4094); expect(parseVlanId("1002")).toBeNull(); expect(parseVlanId("+10")).toBeNull();
    expect(run(fresh(), ...CONFIG_IF, "shutdown").state.interfaces["f0/5"]).toEqual({ shutdown: true });
    expect(effectiveInterfaceConfig(createDeviceState(), "vlan1").shutdown).toBe(true);
    expect(effectiveInterfaceConfig(createDeviceState(), "f0/1")).toEqual({ accessVlan: 1, nativeVlan: 1, shutdown: false });
  });
});

describe("unsupported input: deterministic feedback, never silent success, never host behaviour", () => {
  it("unknown commands, saving, ping, no-forms and routing are all explicit refusals that leave the state untouched", () => {
    const g = run(fresh(), "enable", "configure terminal");
    const before = serializeState(g.state);
    const cases: [string, string][] = [["router ospf 1", "unknown"], ["ip route 0.0.0.0 0.0.0.0 1.1.1.1", "unknown"], ["access-list 1 permit any", "unknown"], ["no vlan 20", "not-supported"], ["no switchport mode access", "not-supported"], ["write memory", "not-supported"], ["wr", "not-supported"], ["copy running-config startup-config", "not-supported"], ["ping 1.1.1.1", "not-supported"], ["reload", "not-supported"], ["foo bar", "unknown"], ["sh", "unknown"]];
    for (const [line, status] of cases) {
      const r = exec(g, line);
      expect(r.result.status, line).toBe(status); expect(r.session, line).toBe(g); expect(r.result.output.length, line).toBeGreaterThan(0); expect(r.result.output[0], line).toMatch(/^% /);
    }
    expect(serializeState(g.state)).toBe(before);
    expect(exec(g, "").result.status).toBe("empty"); expect(exec(g, "   \t ").result.status).toBe("empty");
  });
  it("shell metacharacters are simulator TEXT only: nothing is executed, state is untouched, no exception", () => {
    const g = run(fresh(), "enable", "configure terminal");
    const hostile = ["hostname SW1; rm -rf /", "show run | include hostname", "enable && cat /etc/passwd", "hostname `id`", "hostname $(whoami)", "show run > /tmp/x", "vlan 10 < /dev/null", "interface fa0/1 || true", "hostname ${PATH}", "name \u0000", "hostname ‮SW", "show running-config\n enable"];
    for (const line of hostile) {
      const r = exec(g, line);
      expect(["unknown", "invalid", "not-supported", "incomplete", "wrong-mode"], line).toContain(r.result.status);
      expect(r.session, line).toBe(g);
    }
    expect(g.state.hostname).toBe("Switch");
  });
  it("huge lines and too many tokens are bounded (refused, not stored, not applied); the history budget is enforced by replay", () => {
    const g = run(fresh(), "enable", "configure terminal");
    const long = exec(g, "hostname " + "A".repeat(500));
    expect(long.result.status).toBe("refused"); expect(long.result.output[0]).toMatch(/too long/i); expect(long.session).toBe(g);
    const many = exec(g, Array.from({ length: 40 }, (_, i) => "t" + i).join(" "));
    expect(many.result.status).toBe("refused"); expect(many.session).toBe(g);
    const commands = ["enable", "configure terminal", ...Array.from({ length: 400 }, (_, i) => "vlan " + (10 + (i % 50)))];
    const r = replayCommands(createDeviceState(), commands);
    expect(r.entries.length).toBe(NETWORK_CLI_LIMITS.commands); expect(r.truncated).toBe(true);
    expect(replayCommands(createDeviceState(), ["enable"]).truncated).toBe(false);
  });
  it("? / help lists the syntax of the current mode only; parse never throws on any input", () => {
    const h = exec(fresh(), "?");
    expect(h.result.status).toBe("ok"); expect(h.result.output.join("\n")).toMatch(/enable/); expect(h.result.output.join("\n")).not.toMatch(/hostname/);
    const hi = exec(run(fresh(), ...CONFIG_IF), "?"); expect(hi.result.output.join("\n")).toMatch(/switchport mode/);
    for (const raw of [null, undefined, 42, {}, [], "\u0000", "￿".repeat(10), "%s%s%s", "{{7*7}}"]) expect(() => parseCommand(raw as never)).not.toThrow();
    expect(parseCommand(42 as never).kind).toBe("empty");
  });
});

describe("show commands derive from canonical state (no display state of their own)", () => {
  const configured = () => run(fresh(), "enable", "configure terminal", "hostname SW1", "vlan 10", "name SALES", "exit", "vlan 20", "exit",
    "interface fa0/5", "switchport mode access", "switchport access vlan 10", "exit",
    "interface gi0/1", "switchport mode trunk", "switchport trunk native vlan 99", "exit",
    "interface vlan 10", "ip address 192.168.10.2 255.255.255.0", "exit", "interface fa0/24", "shutdown", "end");
  it("show vlan brief: VLAN 1 default with the unassigned access ports, named / unnamed VLANs with their ports, trunks never listed", () => {
    const lines = showVlanBrief(configured().state);
    expect(lines[0]).toMatch(/^VLAN\s+Name\s+Status\s+Ports/);
    const text = lines.join("\n");
    expect(text).toMatch(/^1\s+default\s+active\s+Fa0\/1, Fa0\/2, Fa0\/3, Fa0\/4$/m);
    expect(text).toMatch(/^10\s+SALES\s+active\s+Fa0\/5$/m);
    expect(text).toMatch(/^20\s+VLAN0020\s+active\s*$/m);
    expect(text).not.toMatch(/Gi0\/1/);                                                              // the trunk is in no VLAN row
    expect(text).toMatch(/Fa0\/24/);                                                                 // a shut access port is still a member of VLAN 1
    expect(exec(configured(), "show vlan brief").result.output).toEqual(lines);
    expect(exec(configured(), "show vlan").result.output).toEqual(lines);
  });
  it("show interfaces trunk: only trunk-mode ports that are up, with the native VLAN and the active VLAN list; nothing when there is no trunk", () => {
    const lines = showInterfacesTrunk(configured().state);
    expect(lines[0]).toMatch(/^Port\s+Mode\s+Encapsulation\s+Status\s+Native vlan/);
    expect(lines[1]).toMatch(/^Gi0\/1\s+on\s+802\.1q\s+trunking\s+99$/);
    expect(lines.join("\n")).toMatch(/Vlans allowed on trunk\nGi0\/1\s+1-4094/);
    expect(lines.join("\n")).toMatch(/active in management domain\nGi0\/1\s+1,10,20/);
    expect(showInterfacesTrunk(createDeviceState())).toEqual([]);
    expect(showInterfacesTrunk(run(configured(), "configure terminal", "interface gi0/1", "shutdown").state)).toEqual([]);
    expect(showInterfacesTrunk(run(fresh(), ...CONFIG_IF, "switchport mode trunk").state)[1]).toMatch(/^Fa0\/5\s+on\s+802\.1q\s+trunking\s+1$/);
  });
  it("show ip interface brief: every inventory port, then the SVIs; status / protocol / method derive from the state", () => {
    const lines = showIpInterfaceBrief(configured().state);
    expect(lines[0]).toMatch(/^Interface\s+IP-Address\s+OK\? Method Status\s+Protocol$/);
    expect(lines.length).toBe(1 + 26 + 2);                                                           // header + 26 ports + Vlan1 + Vlan10
    expect(lines[1]).toMatch(/^FastEthernet0\/1\s+unassigned\s+YES unset\s+up\s+up$/);
    expect(lines[24]).toMatch(/^FastEthernet0\/24\s+unassigned\s+YES unset\s+administratively down down$/);
    expect(lines[27]).toMatch(/^Vlan1\s+unassigned\s+YES unset\s+administratively down down$/);
    expect(lines[28]).toMatch(/^Vlan10\s+192\.168\.10\.2\s+YES manual up\s+up$/);
  });
  it("show running-config is deterministic, ordered by inventory then SVI id, and identical for equivalent states", () => {
    const a = showRunningConfig(configured().state);
    expect(a.slice(0, 4)).toEqual(["Building configuration...", "", "Current configuration:", "!"]);
    const text = a.join("\n");
    expect(text).toMatch(/\nhostname SW1\n/);
    expect(text).toMatch(/\nvlan 10\n name SALES\n!\nvlan 20\n!\n/);
    expect(text).toMatch(/interface FastEthernet0\/5\n switchport access vlan 10\n switchport mode access\n!/);
    expect(text).toMatch(/interface GigabitEthernet0\/1\n switchport trunk native vlan 99\n switchport mode trunk\n!/);
    expect(text).toMatch(/interface FastEthernet0\/24\n shutdown\n!/);
    expect(text).toMatch(/interface Vlan1\n no ip address\n shutdown\n!/);
    expect(text).toMatch(/interface Vlan10\n ip address 192\.168\.10\.2 255\.255\.255\.0\n!/);
    expect(a[a.length - 1]).toBe("end");
    expect(text.indexOf("interface FastEthernet0/2\n")).toBeLessThan(text.indexOf("interface FastEthernet0/10\n"));
    const reordered = run(fresh(), "enable", "configure terminal", "interface vlan 10", "ip address 192.168.10.2 255.255.255.0", "exit", "interface fa0/24", "shutdown", "exit", "interface gi0/1", "switchport trunk native vlan 99", "switchport mode trunk", "exit", "vlan 20", "exit", "interface fa0/5", "switchport access vlan 10", "switchport mode access", "exit", "vlan 10", "name SALES", "exit", "hostname SW1");
    expect(showRunningConfig(reordered.state)).toEqual(a);
    expect(exec(configured(), "show running-config").result.output).toEqual(a);
    expect(exec(run(configured(), "configure terminal"), "do show running-config").result.output).toEqual(a);
  });
});

describe("canonical state: equivalent sequences, deterministic serialization, fail-closed normalization", () => {
  it("different valid command orders produce the same canonical state and the same serialization", () => {
    const a = run(fresh(), "enable", "conf t", "hostname SW1", "vlan 20", "name SALES", "exit", "interface fa0/5", "switchport mode access", "switchport access vlan 20", "end");
    const b = run(fresh(), "en", "configure terminal", "interface fastEthernet 0/5", "switchport access vlan 20", "switchport mode access", "exit", "vlan 20", "name SALES", "exit", "hostname SW1", "exit", "disable");
    const c = run(fresh(), "enable", "configure terminal", "interface fa0/5", "switchport access vlan 30", "switchport access vlan 20", "switchport mode trunk", "switchport mode access", "exit", "vlan 30", "name TEMP", "exit", "hostname OLD", "hostname SW1", "vlan 20", "name SALES");
    expect(canonicalizeState(a.state)).toEqual(canonicalizeState(b.state));
    expect(serializeState(a.state)).toBe(serializeState(b.state));
    expect(serializeState(c.state)).not.toBe(serializeState(a.state));                               // VLAN 30 is extra configuration: a different state
    expect(JSON.parse(serializeState(a.state))).toEqual({ v: 1, device: "switch", hostname: "SW1", vlans: { "20": { name: "SALES" } }, interfaces: { "f0/5": { mode: "access", accessVlan: 20 } } });
    expect(Object.keys(JSON.parse(serializeState(c.state)).vlans)).toEqual(["20", "30"]);
    const d = run(fresh(), "enable", "configure terminal", "interface gi0/2", "exit", "interface vlan 1", "exit", "interface fa0/1", "exit");
    expect(serializeState(d.state)).toBe(serializeState(createDeviceState()));                         // visiting ports / Vlan1 configures nothing
    const svi = run(fresh(), "enable", "configure terminal", "interface vlan 10", "exit");
    expect(svi.state.interfaces).toEqual({ vlan10: {} });                                               // creating another SVI IS configuration (it now exists, up, unaddressed)
    expect(showIpInterfaceBrief(svi.state).at(-1)).toMatch(/^Vlan10\s+unassigned\s+YES unset\s+up\s+up$/);
  });
  it("replay from an initial state is deterministic and reproduces prompts, outputs and the final state", () => {
    const initial = createDeviceState({ hostname: "LAB-SW", vlans: { "10": { name: "SALES" } }, interfaces: { "f0/1": { mode: "access", accessVlan: 10 } } });
    const commands = ["enable", "configure terminal", "interface fa0/2", "switchport mode access", "switchport access vlan 10", "end", "show vlan brief"];
    const r1 = replayCommands(initial, commands), r2 = replayCommands(initial, commands);
    expect(r1.entries.map(e => e.prompt)).toEqual(["LAB-SW>", "LAB-SW#", "LAB-SW(config)#", "LAB-SW(config-if)#", "LAB-SW(config-if)#", "LAB-SW(config-if)#", "LAB-SW#"]);
    expect(serializeState(r1.session.state)).toBe(serializeState(r2.session.state));
    expect(r1.entries[6].result.output).toEqual(r2.entries[6].result.output);
    expect(r1.session.state.interfaces["f0/2"]).toEqual({ mode: "access", accessVlan: 10 });
    expect(serializeState(initial)).toBe(serializeState(createDeviceState({ hostname: "LAB-SW", vlans: { "10": { name: "SALES" } }, interfaces: { "f0/1": { mode: "access", accessVlan: 10 } } })));
  });
  it("normalizeDeviceState accepts only the versioned canonical shape; prototype-sensitive keys, bad ranges, extra keys and v2 fail closed", () => {
    const ok = normalizeDeviceState({ v: 1, device: "switch", hostname: "SW1", vlans: { "20": { name: "SALES" } }, interfaces: { "f0/5": { mode: "access", accessVlan: 20 }, "vlan10": { ipAddress: "10.0.0.1", subnetMask: "255.0.0.0" } } });
    expect(ok.ok).toBe(true); if (ok.ok) expect(serializeState(ok.state)).toBe(serializeState(run(fresh(), "enable", "configure terminal", "hostname SW1", "vlan 20", "name SALES", "exit", "interface fa0/5", "switchport mode access", "switchport access vlan 20", "exit", "interface vlan 10", "ip address 10.0.0.1 255.0.0.0").state));
    const bad: unknown[] = [null, "x", [], {}, { v: 2, device: "switch", hostname: "SW1", vlans: {}, interfaces: {} }, { v: 1, device: "router", hostname: "R1", vlans: {}, interfaces: {} },
      { v: 1, device: "switch", hostname: "1x", vlans: {}, interfaces: {} }, { v: 1, device: "switch", hostname: "SW1", vlans: { "1": {} }, interfaces: {} }, { v: 1, device: "switch", hostname: "SW1", vlans: { "5000": {} }, interfaces: {} },
      { v: 1, device: "switch", hostname: "SW1", vlans: { "20": { name: "a b" } }, interfaces: {} }, { v: 1, device: "switch", hostname: "SW1", vlans: {}, interfaces: { "f0/99": {} } },
      { v: 1, device: "switch", hostname: "SW1", vlans: {}, interfaces: { "f0/1": { ipAddress: "10.0.0.1", subnetMask: "255.0.0.0" } } }, { v: 1, device: "switch", hostname: "SW1", vlans: {}, interfaces: { "vlan10": { mode: "access" } } },
      { v: 1, device: "switch", hostname: "SW1", vlans: {}, interfaces: { "f0/1": { accessVlan: 1003 } } }, { v: 1, device: "switch", hostname: "SW1", vlans: {}, interfaces: { "f0/1": { shutdown: "yes" } } },
      { v: 1, device: "switch", hostname: "SW1", vlans: {}, interfaces: { "f0/1": { mode: "access", extra: 1 } } }, { v: 1, device: "switch", hostname: "SW1", vlans: {}, interfaces: {}, extra: true },
      { v: 1, device: "switch", hostname: "SW1", vlans: {}, interfaces: { "vlan10": { ipAddress: "10.0.0.1" } } }, { v: 1, device: "switch", hostname: "SW1", vlans: {}, interfaces: { "vlan10": { ipAddress: "10.0.0.0", subnetMask: "255.255.255.0" } } },
      JSON.parse('{"v":1,"device":"switch","hostname":"SW1","vlans":{"__proto__":{"name":"X"}},"interfaces":{}}'), JSON.parse('{"v":1,"device":"switch","hostname":"SW1","vlans":{},"interfaces":{"__proto__":{"mode":"access"}}}'),
      JSON.parse('{"v":1,"device":"switch","hostname":"SW1","vlans":{},"interfaces":{"f0/1":{"__proto__":{"polluted":true}}}}'), JSON.parse('{"v":1,"device":"switch","hostname":"SW1","vlans":{},"interfaces":{},"constructor":{"prototype":{"polluted":true}}}')];
    for (const b of bad) { const r = normalizeDeviceState(b); expect(r.ok, JSON.stringify(b)).toBe(false); }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined(); expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    const sparse = normalizeDeviceState({ v: 1, device: "switch", hostname: "SW1", vlans: {}, interfaces: { "f0/1": { shutdown: false, accessVlan: 1, nativeVlan: 1 }, "vlan1": { shutdown: true } } });
    expect(sparse.ok).toBe(true); if (sparse.ok) expect(sparse.state.interfaces).toEqual({});           // defaults are dropped by canonicalization
  });
  it("the engine never mutates its input session or state", () => {
    const s = run(fresh(), "enable", "configure terminal", "vlan 20");
    const snapshot = JSON.stringify(s);
    run(s, "name SALES", "exit", "interface fa0/1", "switchport mode trunk", "shutdown", "hostname X");
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(Object.isFrozen(SWITCH_PORTS)).toBe(true);
  });
});
