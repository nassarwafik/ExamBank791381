// Batch 8 — the CLI TEACHING simulator: pure engine tests (grammar, normalization, modes, state mutation, exercise
// progress, reset, adversarial input, isolation). No DOM.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { executeCommand, applyCommand } from "./engine";
import { parseCommand, COMMANDS, NAVIGATION_COMMANDS, modesOf } from "./grammar";
import { normalizeInput, tokenize, normalizeInterfaceName, expandInterfaceRange, isIpv4, isSubnetMask, parseVlanList, parseVlanId } from "./normalize";
import { createDeviceState, createInitialState, promptFor, CLI_MODE_LABEL } from "./state";
import { createSession, submitCommand, revealHint, visibleHints, goalStatus, conditionMet, CLI_FEEDBACK, type CliSession } from "./exercise";
import { readCliExerciseConfig } from "./config";
import { trunkTask, guidedModes, trunkChallenge } from "./cliFixtures";
import type { CliDeviceState } from "./types";

const run = (state: CliDeviceState, ...lines: string[]) => lines.reduce((s, l) => executeCommand(s, l).state, state);
const last = (s: CliSession) => s.history[s.history.length - 1];
const drive = (ex: Parameters<typeof createSession>[0], ...lines: string[]) => lines.reduce((s, l) => submitCommand(ex, s, l), createSession(ex));

describe("normalization", () => {
  it("trims, collapses whitespace and tokenizes; non-strings become empty", () => {
    expect(normalizeInput("   configure    terminal  ")).toBe("configure terminal");
    expect(tokenize("\tip   address 192.168.1.254\t255.255.255.0 ")).toEqual(["ip", "address", "192.168.1.254", "255.255.255.0"]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize(42 as unknown as string)).toEqual([]);
  });
  it("folds interface spellings to one canonical form only where safe", () => {
    for (const s of ["FastEthernet0/1", "fastethernet0/1", "fa0/1", "Fa 0/1", "f0/1", "F0/1"]) expect(normalizeInterfaceName(s), s).toBe("f0/1");
    for (const s of ["GigabitEthernet0/0.10", "gig0/0.10", "g0/0.10", "G0/0.10"]) expect(normalizeInterfaceName(s), s).toBe("g0/0.10");
    expect(normalizeInterfaceName("vlan 1")).toBe("vlan1");
    for (const s of ["xyz", "f", "0/1", "f0", "fa0/1/", "serial0/0/0"]) expect(normalizeInterfaceName(s), s).toBeNull();
    expect(expandInterfaceRange("f0/23-24")).toEqual(["f0/23", "f0/24"]);
    expect(expandInterfaceRange("fa0/1-3")).toEqual(["f0/1", "f0/2", "f0/3"]);
    expect(expandInterfaceRange("f0/5-2")).toBeNull();
  });
  it("checks IPv4 addresses, contiguous masks and VLAN ids/lists strictly", () => {
    expect(isIpv4("192.168.1.254")).toBe(true);
    for (const bad of ["300.1.1.1", "192.168.1", "192.168.1.1.1", "a.b.c.d", "192.168.01.1", ""]) expect(isIpv4(bad), bad).toBe(false);
    expect(isSubnetMask("255.255.255.0")).toBe(true);
    expect(isSubnetMask("255.0.255.0")).toBe(false);
    expect(isSubnetMask("0.0.0.0")).toBe(false);
    expect(parseVlanId("10")).toBe(10);
    expect(parseVlanId("0")).toBeNull();
    expect(parseVlanId("4095")).toBeNull();
    expect(parseVlanList("30,10,20,10")).toEqual([10, 20, 30]);
    expect(parseVlanList("10-12")).toEqual([10, 11, 12]);
    expect(parseVlanList("10,,20")).toBeNull();
    expect(parseVlanList("10;20")).toBeNull();
  });
});

describe("grammar / parser", () => {
  it("is a closed table: every command id has at least one mode; navigation ids exist in the table", () => {
    for (const c of COMMANDS) expect(c.modes.length, c.id).toBeGreaterThan(0);
    for (const id of NAVIGATION_COMMANDS) expect(modesOf(id).length, id).toBeGreaterThan(0);
  });
  it("keywords are case-insensitive, values are preserved as typed", () => {
    expect(parseCommand("ENABLE")).toEqual({ kind: "ok", command: { id: "enable" } });
    expect(parseCommand("Configure   Terminal")).toEqual({ kind: "ok", command: { id: "configure-terminal" } });
    expect(parseCommand("config t")).toEqual({ kind: "ok", command: { id: "configure-terminal" } });
    expect(parseCommand("HOSTNAME SW1")).toEqual({ kind: "ok", command: { id: "hostname", name: "SW1" } });
    expect(parseCommand("ip dhcp pool LAN")).toEqual({ kind: "ok", command: { id: "ip-dhcp-pool", name: "LAN" } });
    expect(parseCommand("Encapsulation Dot1Q 10")).toEqual({ kind: "ok", command: { id: "encapsulation-dot1q", vlanId: 10 } });
    expect(parseCommand("interface FastEthernet0/1")).toEqual({ kind: "ok", command: { id: "interface", interfaces: ["f0/1"], sub: false } });
    expect(parseCommand("interface g0/0.20")).toEqual({ kind: "ok", command: { id: "interface", interfaces: ["g0/0.20"], sub: true } });
    expect(parseCommand("interface range f0/23-24")).toEqual({ kind: "ok", command: { id: "interface", interfaces: ["f0/23", "f0/24"], sub: false } });
    expect(parseCommand("switchport trunk allowed vlan 10,20,30")).toEqual({ kind: "ok", command: { id: "switchport-trunk-allowed-vlan", vlans: [10, 20, 30] } });
    expect(parseCommand("ip dhcp excluded-address 192.168.1.1 192.168.1.9")).toEqual({ kind: "ok", command: { id: "ip-dhcp-excluded-address", from: "192.168.1.1", to: "192.168.1.9" } });
    expect(parseCommand("dns-server 8.8.8.8")).toEqual({ kind: "ok", command: { id: "dns-server", addresses: ["8.8.8.8"] } });
  });
  it("distinguishes incomplete, invalid and unknown input", () => {
    expect(parseCommand("interface")).toMatchObject({ kind: "incomplete", id: "interface" });
    expect(parseCommand("ip address 192.168.1.254")).toMatchObject({ kind: "incomplete", id: "ip-address" });
    expect(parseCommand("switchport mode")).toMatchObject({ kind: "incomplete", id: "switchport-mode" });
    expect(parseCommand("ip dhcp")).toMatchObject({ kind: "incomplete" });
    expect(parseCommand("ip")).toMatchObject({ kind: "incomplete" });
    expect(parseCommand("switchport access vlan 5000")).toMatchObject({ kind: "invalid", id: "switchport-access-vlan" });
    expect(parseCommand("ip address 300.1.1.1 255.255.255.0")).toMatchObject({ kind: "invalid", id: "ip-address" });
    expect(parseCommand("ip address 192.168.1.1 255.0.255.0")).toMatchObject({ kind: "invalid", id: "ip-address" });
    expect(parseCommand("interface xyz")).toMatchObject({ kind: "invalid", id: "interface" });
    expect(parseCommand("switchport mode hybrid")).toMatchObject({ kind: "invalid", id: "switchport-mode" });
    expect(parseCommand("enable please")).toMatchObject({ kind: "invalid", id: "enable" });
    expect(parseCommand("vlan create 10")).toMatchObject({ kind: "invalid", id: "vlan" });
    for (const u of ["router ospf 1", "show mac-address-table", "ping 8.8.8.8", "line vty 0 4", "ls -la", "hello"]) expect(parseCommand(u), u).toEqual({ kind: "unknown" });
    expect(parseCommand("")).toEqual({ kind: "empty" });
    expect(parseCommand("    ")).toEqual({ kind: "empty" });
  });
});

describe("modes and transitions", () => {
  it("enable moves user EXEC → privileged EXEC and the prompt changes", () => {
    const s0 = createDeviceState("switch");
    expect([s0.mode, promptFor(s0)]).toEqual(["user", "Switch>"]);
    const { state, result } = executeCommand(s0, "enable");
    expect([state.mode, promptFor(state), result.status]).toEqual(["privileged", "Switch#", "ok"]);
  });
  it("configure terminal is accepted ONLY from privileged EXEC (wrong-mode elsewhere, state untouched)", () => {
    const user = createDeviceState("router");
    const fromUser = executeCommand(user, "configure terminal");
    expect(fromUser.result).toMatchObject({ status: "wrong-mode", requiredModes: ["privileged"] });
    expect(fromUser.state).toBe(user);
    const priv = run(user, "enable");
    const g = executeCommand(priv, "configure terminal");
    expect([g.state.mode, promptFor(g.state)]).toEqual(["global", "Router(config)#"]);
    const again = executeCommand(g.state, "configure terminal");
    expect(again.result.status).toBe("wrong-mode");
    expect(again.state).toBe(g.state);
  });
  it("interface selection changes the mode (interface / sub-interface) and exit / end walk back", () => {
    const g = run(createDeviceState("router"), "enable", "configure terminal");
    const i = run(g, "interface g0/0");
    expect([i.mode, i.selectedInterfaces, promptFor(i)]).toEqual(["interface", ["g0/0"], "Router(config-if)#"]);
    const sub = run(i, "interface g0/0.10");
    expect([sub.mode, sub.selectedInterfaces, promptFor(sub)]).toEqual(["subinterface", ["g0/0.10"], "Router(config-subif)#"]);
    const back = run(sub, "exit");
    expect([back.mode, back.selectedInterfaces]).toEqual(["global", []]);
    const end = run(sub, "end");
    expect([end.mode, promptFor(end)]).toEqual(["privileged", "Router#"]);
    const pool = run(g, "ip dhcp pool LAN");
    expect([pool.mode, pool.selectedPool, promptFor(pool)]).toEqual(["dhcp", "LAN", "Router(dhcp-config)#"]);
    const vlan = run(createDeviceState("switch"), "enable", "conf t", "vlan 10");
    expect([vlan.mode, vlan.selectedVlan, promptFor(vlan)]).toEqual(["vlan", 10, "Switch(config-vlan)#"]);
  });
  it("interface-mode commands issued elsewhere are rejected as «اختر الواجهة أولًا»; other wrong-mode input names the required mode", () => {
    const g = run(createDeviceState("switch"), "enable", "configure terminal");
    const r = executeCommand(g, "switchport mode trunk");
    expect(r.result).toMatchObject({ status: "wrong-mode", requiredModes: ["interface"] });
    expect(r.state).toBe(g);
    const s = submitCommand(trunkTask, { ...createSession(trunkTask), state: g }, "switchport mode trunk");
    expect(last(s).feedback).toBe(CLI_FEEDBACK.interfaceFirst);
    const s2 = submitCommand(trunkTask, createSession(trunkTask), "configure terminal");
    expect(last(s2).feedback).toBe(CLI_FEEDBACK.wrongMode(CLI_MODE_LABEL.privileged));
    expect(s2.state).toEqual(createInitialState(trunkTask));
  });
});

describe("state mutation", () => {
  it("commands mutate the simulated state (switch trunk / access, router ip + no shutdown, DHCP pool, excluded, VTP)", () => {
    const sw = run(createDeviceState("switch"), "enable", "configure terminal", "interface f0/1", "switchport mode trunk", "switchport trunk allowed vlan 10,20,30", "exit", "interface range f0/2-3", "switchport mode access", "switchport access vlan 20", "exit", "vtp mode server", "vtp domain HFA", "vtp password 123");
    expect(sw.interfaces["f0/1"]).toEqual({ shutdown: false, switchportMode: "trunk", allowedVlans: [10, 20, 30] });
    expect(sw.interfaces["f0/2"]).toEqual({ shutdown: false, switchportMode: "access", accessVlan: 20 });
    expect(sw.interfaces["f0/3"]).toEqual({ shutdown: false, switchportMode: "access", accessVlan: 20 });
    expect(sw.vtp).toEqual({ mode: "server", domain: "HFA", password: "123" });
    const rt = run(createDeviceState("router"), "enable", "configure terminal", "interface g0/0", "ip address 192.168.1.254 255.255.255.0", "no shutdown", "exit", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "default-router 192.168.1.254", "dns-server 8.8.8.8", "exit", "ip dhcp excluded-address 192.168.1.1 192.168.1.9", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.254 255.255.255.0");
    expect(rt.interfaces["g0/0"]).toEqual({ shutdown: false, ipAddress: "192.168.1.254", subnetMask: "255.255.255.0" });
    expect(rt.interfaces["g0/0.10"]).toEqual({ shutdown: true, encapsulationVlan: 10, ipAddress: "192.168.10.254", subnetMask: "255.255.255.0" });
    expect(rt.dhcpPools.LAN).toEqual({ network: "192.168.1.0", mask: "255.255.255.0", defaultRouter: "192.168.1.254", dnsServers: ["8.8.8.8"] });
    expect(rt.dhcpExcluded).toEqual([{ from: "192.168.1.1", to: "192.168.1.9" }]);
    expect(rt.mode).toBe("subinterface");
  });
  it("router interfaces start administratively down and switch ports start up; repeated commands are idempotent", () => {
    const r = run(createDeviceState("router"), "enable", "conf t", "interface g0/0");
    expect(r.interfaces["g0/0"].shutdown).toBe(true);
    const r2 = run(r, "no shutdown", "no shutdown", "no shut");
    expect(r2.interfaces["g0/0"].shutdown).toBe(false);
    const ex = run(r2, "exit", "ip dhcp excluded-address 192.168.1.1 192.168.1.9", "ip dhcp excluded-address 192.168.1.1 192.168.1.9");
    expect(ex.dhcpExcluded).toHaveLength(1);
    expect(run(createDeviceState("switch"), "enable", "conf t", "interface f0/1").interfaces["f0/1"].shutdown).toBe(false);
  });
  it("never mutates the input state object (pure): the previous state is structurally unchanged after any command", () => {
    const g = run(createDeviceState("switch"), "enable", "configure terminal", "interface f0/1");
    const snapshot = JSON.stringify(g);
    run(g, "switchport mode trunk", "switchport trunk allowed vlan 10", "exit", "hostname SW9", "vlan 5", "name X");
    expect(JSON.stringify(g)).toBe(snapshot);
  });
  it("unknown, incomplete, invalid and wrong-mode commands return the SAME state object (no mutation)", () => {
    const g = run(createDeviceState("switch"), "enable", "configure terminal", "interface f0/1");
    for (const bad of ["frobnicate", "switchport mode", "switchport access vlan 9999", "configure terminal", "vtp mode server", "network 10.0.0.0 255.0.0.0", "ip address 1.2.3"]) {
      const r = executeCommand(g, bad);
      expect(r.result.status, bad).not.toBe("ok");
      expect(r.state, bad).toBe(g);
    }
  });
  it("show commands produce deterministic simplified output without changing state", () => {
    const rt = run(createDeviceState("router"), "enable", "configure terminal", "hostname R1", "interface g0/0", "ip address 192.168.1.254 255.255.255.0", "no shutdown", "exit", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "default-router 192.168.1.254", "dns-server 8.8.8.8", "end");
    const a = executeCommand(rt, "show running-config");
    expect(a.state).toBe(rt);
    expect(a.result).toMatchObject({ status: "ok" });
    const lines = (a.result as { output?: string[] }).output ?? [];
    expect(lines).toContain("hostname R1");
    expect(lines).toContain(" ip address 192.168.1.254 255.255.255.0");
    expect(lines).toContain(" default-router 192.168.1.254");
    expect(lines).toContain(" dns-server 8.8.8.8");
    expect(executeCommand(rt, "show running-config").result).toEqual(a.result);   // deterministic
    const pool = executeCommand(rt, "show ip dhcp pool").result as { output?: string[] };
    expect(pool.output?.[0]).toBe("Pool LAN :");
    const brief = executeCommand(rt, "show ip interface brief").result as { output?: string[] };
    expect(brief.output?.some(l => l.startsWith("GigabitEthernet0/0") && l.includes("192.168.1.254") && l.includes("up"))).toBe(true);
    expect(executeCommand(createDeviceState("router"), "show running-config").result.status).toBe("wrong-mode");   // not in user EXEC
    const help = executeCommand(run(createDeviceState("switch"), "enable", "conf t", "interface f0/1"), "?").result as { output?: string[] };
    expect(help.output).toContain("  switchport mode access | trunk");
    expect(help.output?.some(l => l.startsWith("  hostname") || l.startsWith("  vtp mode"))).toBe(false);   // help lists only the CURRENT mode's commands (show/? stay available)
  });
});

describe("exercises: guided / challenge / task", () => {
  it("a guided example advances one step per achieved expectation, with step-specific success wording, and completes", () => {
    let s = createSession(guidedModes);
    s = submitCommand(guidedModes, s, "configure terminal");
    expect([s.stepIndex, last(s).feedback]).toEqual([0, CLI_FEEDBACK.wrongMode(CLI_MODE_LABEL.privileged)]);
    s = submitCommand(guidedModes, s, "enable");
    expect([s.stepIndex, last(s).feedback, last(s).tone]).toEqual([1, "✓ أحسنت، انتقلت إلى وضع الأوامر المتقدّم", "success"]);
    s = submitCommand(guidedModes, s, "conf t");
    expect([s.stepIndex, last(s).feedback]).toEqual([2, "✓ أحسنت، انتقلت إلى وضع الإعداد العام"]);
    s = submitCommand(guidedModes, s, "hostname SW1");   // valid, executed, but not the step
    expect([s.stepIndex, last(s).feedback, s.state.hostname]).toEqual([2, CLI_FEEDBACK.retry, "SW1"]);
    s = submitCommand(guidedModes, s, "interface FastEthernet 0/1");
    expect([s.stepIndex, s.completed, last(s).feedback]).toEqual([3, true, CLI_FEEDBACK.guidedStep]);
  });
  it("a challenge checks the exact command (mode-aware, value-aware), never reveals the answer, and refuses commands the exercise does not require", () => {
    let s = createSession(trunkChallenge);
    expect(promptFor(s.state)).toBe("Switch(config-if)#");
    s = submitCommand(trunkChallenge, s, "switchport mode access");
    expect([s.completed, last(s).feedback]).toEqual([false, CLI_FEEDBACK.retry]);
    s = submitCommand(trunkChallenge, s, "switchport access vlan 10");   // valid, but not allowed by this exercise → never executed
    expect([last(s).status, last(s).feedback, s.state.interfaces["f0/1"].accessVlan]).toEqual(["not-required", CLI_FEEDBACK.notRequired, undefined]);
    s = submitCommand(trunkChallenge, s, "exit");   // navigation is always allowed
    expect(s.state.mode).toBe("global");
    s = submitCommand(trunkChallenge, s, "switchport mode trunk");
    expect(last(s).feedback).toBe(CLI_FEEDBACK.interfaceFirst);
    s = submitCommand(trunkChallenge, s, "interface f0/1");
    s = submitCommand(trunkChallenge, s, "  SWITCHPORT   MODE   TRUNK ");
    expect([s.completed, last(s).feedback, s.state.interfaces["f0/1"].switchportMode]).toEqual([true, CLI_FEEDBACK.correct, "trunk"]);
    expect(JSON.stringify(s.history)).not.toContain("switchport-mode");   // the expectation never enters the transcript
  });
  it("a multi-step TASK completes ONLY when the required final state exists (wrong values do not count; order of commands is free)", () => {
    let s = drive(trunkTask, "enable", "configure terminal", "interface fa0/1", "switchport mode trunk", "switchport trunk allowed vlan 10,20");
    expect(goalStatus(trunkTask, s.state).map(g => g.met)).toEqual([true, false]);
    expect(s.completed).toBe(false);
    s = submitCommand(trunkTask, s, "switchport trunk allowed vlan 10,20,30");
    expect([s.completed, last(s).feedback]).toEqual([true, CLI_FEEDBACK.taskCompleted]);
    const other = drive(trunkTask, "enable", "conf t", "int f0/1", "switchport trunk allowed vlan 30,20,10", "switchport mode trunk");
    expect(other.completed).toBe(true);
    const wrongPort = drive(trunkTask, "enable", "conf t", "int f0/2", "switchport mode trunk", "switchport trunk allowed vlan 10,20,30");
    expect(wrongPort.completed).toBe(false);
  });
  it("hints reveal one at a time (two-step ladder, hint 1 never contains the answer) and never exceed the ladder", () => {
    let s = createSession(trunkChallenge);
    expect(visibleHints(trunkChallenge, s)).toEqual([]);
    s = revealHint(trunkChallenge, s);
    expect(visibleHints(trunkChallenge, s)).toEqual(["فكر في الوضع الذي يجب أن تكون فيه قبل تعديل إعدادات المنفذ."]);
    expect(visibleHints(trunkChallenge, s)[0]).not.toMatch(/switchport mode trunk/);
    s = revealHint(trunkChallenge, s);
    s = revealHint(trunkChallenge, s);
    expect(visibleHints(trunkChallenge, s)).toHaveLength(2);
    expect(visibleHints(trunkTask, revealHint(trunkTask, revealHint(trunkTask, createSession(trunkTask))))).toEqual(trunkTask.hints);
  });
  it("reset (a fresh session) restores the exact initial state, even halfway through a task; sessions are immutable", () => {
    const initial = createSession(trunkTask);
    const half = drive(trunkTask, "enable", "conf t", "interface f0/1", "switchport mode trunk");
    expect(half.state.interfaces["f0/1"].switchportMode).toBe("trunk");
    expect(initial.history).toEqual([]);
    expect(createSession(trunkTask)).toEqual(initial);
    expect(createSession(trunkTask).state).toEqual(createInitialState(trunkTask));
    expect(createInitialState(trunkChallenge)).toMatchObject({ mode: "interface", selectedInterfaces: ["f0/1"] });
    const before = JSON.stringify(half);
    submitCommand(trunkTask, half, "switchport trunk allowed vlan 10,20,30");
    expect(JSON.stringify(half)).toBe(before);
  });
  it("conditionMet covers every condition kind", () => {
    const rt = run(createDeviceState("router"), "enable", "conf t", "hostname R1", "vlan 10", "exit", "interface g0/0", "ip address 10.0.0.1 255.0.0.0", "no shutdown", "exit", "ip dhcp pool P", "dns-server 1.1.1.1 8.8.8.8", "exit", "ip dhcp excluded-address 10.0.0.1", "vtp domain HFA");
    expect(conditionMet(rt, { kind: "mode", mode: "global" })).toBe(true);
    expect(conditionMet(rt, { kind: "hostname", value: "r1" })).toBe(true);
    expect(conditionMet(rt, { kind: "vlan", vlanId: 10 })).toBe(true);
    expect(conditionMet(rt, { kind: "vlan", vlanId: 20 })).toBe(false);
    expect(conditionMet(rt, { kind: "interface", name: "GigabitEthernet0/0", prop: "ipAddress", value: "10.0.0.1" })).toBe(true);
    expect(conditionMet(rt, { kind: "interface", name: "g0/0", prop: "shutdown", value: false })).toBe(true);
    expect(conditionMet(rt, { kind: "interface", name: "g0/1", prop: "shutdown", value: false })).toBe(false);
    expect(conditionMet(rt, { kind: "dhcp-pool", name: "p", prop: "dnsServers", value: ["8.8.8.8", "1.1.1.1"] })).toBe(true);
    expect(conditionMet(rt, { kind: "dhcp-excluded", from: "10.0.0.1" })).toBe(true);
    expect(conditionMet(rt, { kind: "dhcp-excluded", from: "10.0.0.1", to: "10.0.0.9" })).toBe(false);
    expect(conditionMet(rt, { kind: "vtp", prop: "domain", value: "hfa" })).toBe(true);
  });
});

describe("adversarial and isolation", () => {
  const g = run(createDeviceState("switch"), "enable", "configure terminal", "interface f0/1");
  const HOSTILE = [
    "rm -rf /", "$(whoami)", "; ls -la", "| cat /etc/passwd", "&& reboot", "`id`", "alert(1)", "<script>alert(1)</script>",
    "require('child_process').exec('ls')", "process.exit()", "eval(\"1+1\")", "new Function('return 1')()", "import('fs')",
    "fetch('https://example.com')", "constructor.constructor('return this')()", "__proto__.polluted=1", "%00", "\u0000enable", "enable; ls",
    "switchport mode trunk && exit", "ip address 192.168.1.1 255.255.255.0; reboot", "a".repeat(5000), Array.from({ length: 60 }, () => "x").join(" "),
  ];
  it("shell-like and JS-looking input can never execute anything: every line is unknown/invalid/incomplete, never throws, never mutates state", () => {
    for (const h of HOSTILE) {
      const r = executeCommand(g, h);
      expect(r.result.status, h).not.toBe("ok");
      expect(r.state, h).toBe(g);
    }
    for (const weird of [null, undefined, 0, {}, [], () => "enable", Symbol("x")]) {
      const r = executeCommand(g, weird as unknown as string);
      expect(["empty", "unknown"]).toContain(r.result.status);
      expect(r.state).toBe(g);
    }
  });
  it("hostile input inside an exercise is echoed as inert text with an error tone and does not advance progress", () => {
    let s = createSession(trunkChallenge);
    for (const h of HOSTILE.slice(0, 12)) s = submitCommand(trunkChallenge, s, h);
    expect(s.completed).toBe(false);
    expect(s.stepIndex).toBe(0);
    expect(s.history.every(h => h.tone === "error" && h.status !== "ok")).toBe(true);
    expect(s.state).toEqual(createInitialState(trunkChallenge));
  });
  it("applyCommand is total over the closed command union (no dynamic dispatch by string)", () => {
    const st = run(createDeviceState("router"), "enable", "conf t");
    expect(applyCommand(st, { id: "hostname", name: "R9" }).state.hostname).toBe("R9");
    expect(() => applyCommand(st, { id: "bogus" } as never)).not.toThrow();
  });
  it("the simulator sources use no eval / Function / dynamic import / fetch / storage / DOM globals / raw HTML", () => {
    const dir = new URL(".", import.meta.url).pathname;
    const files = readdirSync(dir).filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && f !== "cliFixtures.ts");
    expect(files.sort()).toEqual(["CliTerminalActivity.tsx", "config.ts", "engine.ts", "exercise.ts", "grammar.ts", "normalize.ts", "show.ts", "state.ts", "types.ts"]);
    for (const f of files) {
      const src = readFileSync(dir + f, "utf8");
      for (const banned of ["eval(", "new Function", "import(", "fetch(", "XMLHttpRequest", "WebSocket", "child_process", "localStorage", "sessionStorage", "indexedDB", "document.", "window.", "globalThis", "dangerouslySetInnerHTML", "innerHTML", "setTimeout", "setInterval"]) {
        expect(src, `${f} must not contain ${banned}`).not.toContain(banned);
      }
    }
  });
});

describe("learner-facing wording is pinned literally (the specification's feedback strings)", () => {
  it("unknown / wrong mode / interface first / not required / retry / correct / done are the exact Arabic strings", () => {
    expect(CLI_FEEDBACK.unknown).toBe("✗ أمر غير معروف في هذا المحاكي التعليمي");
    expect(CLI_FEEDBACK.wrongMode("وضع الإعداد العام")).toBe("✗ الأمر صحيح لكنك في الوضع غير المناسب — المطلوب: وضع الإعداد العام");
    expect(CLI_FEEDBACK.interfaceFirst).toBe("✗ اختر الواجهة أولًا");
    expect(CLI_FEEDBACK.notRequired).toBe("✗ هذا الأمر غير مطلوب في هذا التدريب");
    expect(CLI_FEEDBACK.retry).toBe("✗ حاول مرة أخرى");
    expect(CLI_FEEDBACK.correct).toBe("✓ صحيح");
    expect(CLI_FEEDBACK.guidedStep).toBe("✓ أحسنت");
    expect(CLI_FEEDBACK.done).toBe("✓ تم");
    expect(CLI_FEEDBACK.taskCompleted).toBe("✓ أحسنت، الإعداد المطلوب مكتمل");
    expect(CLI_MODE_LABEL).toEqual({ user: "وضع المستخدم", privileged: "وضع الأوامر المتقدّم", global: "وضع الإعداد العام", interface: "وضع إعداد الواجهة", subinterface: "وضع إعداد الواجهة الفرعية", vlan: "وضع إعداد VLAN", dhcp: "وضع إعداد مجموعة DHCP" });
    expect(promptFor({ hostname: "Switch", mode: "global" })).toBe("Switch(config)#");
  });
});

describe("config reader", () => {
  it("accepts the fixtures and returns cleaned copies; rejects malformed / unknown-command / unknown-mode configs", () => {
    expect(readCliExerciseConfig(trunkTask)).toEqual({ ...trunkTask, hints: trunkTask.hints });
    expect(readCliExerciseConfig(guidedModes)?.steps?.length).toBe(3);
    expect(readCliExerciseConfig(trunkChallenge)?.allowed).toEqual(["switchport-mode"]);
    expect(readCliExerciseConfig(null)).toBeNull();
    expect(readCliExerciseConfig("enable")).toBeNull();
    expect(readCliExerciseConfig({ kind: "task", device: "switch" })).toBeNull();                  // no goals
    expect(readCliExerciseConfig({ kind: "guided", device: "router" })).toBeNull();                // no steps
    expect(readCliExerciseConfig({ ...trunkChallenge, allowed: ["reboot"] })).toBeNull();          // unknown command id
    expect(readCliExerciseConfig({ ...guidedModes, steps: [{ id: "x", instruction: "y", expect: { command: "format-flash" } }] })).toBeNull();
    expect(readCliExerciseConfig({ ...guidedModes, steps: [{ id: "x", instruction: "y", expect: { mode: "rommon" } }] })).toBeNull();
    expect(readCliExerciseConfig({ ...trunkChallenge, startMode: "interface", startInterface: undefined })).toBeNull();
    expect(readCliExerciseConfig({ ...trunkTask, hostname: "bad name!" })).toBeNull();
    expect(readCliExerciseConfig({ ...trunkTask, goals: [{ id: "g", label: "l", condition: { kind: "interface", name: "f0/1", prop: "delete", value: 1 } }] })).toBeNull();
    const extra = readCliExerciseConfig({ ...trunkTask, hints: ["a", "b", "c"], component: "Evil", onLoad: "alert(1)" }) as unknown as Record<string, unknown>;
    expect(extra.hints).toEqual(["a", "b"]);
    expect("component" in extra || "onLoad" in extra).toBe(false);
  });
});
