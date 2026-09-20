// Batch 9 — the CLI simulator extension for the book's PDF 180–199: Port Security commands, the `line` mode
// (console / vty passwords), `enable secret`, `service password-encryption`, `banner motd`, the new `show`
// outputs, stricter config validation, wrong-mode / invalid / hostile input never mutating state, and exercise
// completion by final state. Pure engine tests, no DOM.
import { describe, it, expect } from "vitest";
import { executeCommand } from "./engine";
import { parseCommand, COMMANDS, NAVIGATION_COMMANDS } from "./grammar";
import { isCiscoMac, parseIntInRange, PORT_SECURITY_MAX } from "./normalize";
import { createDeviceState, createInitialState, promptFor, CLI_MODE_LABEL } from "./state";
import { createSession, submitCommand, goalStatus, conditionMet, CLI_FEEDBACK, type CliSession } from "./exercise";
import { readCliExerciseConfig } from "./config";
import { portSecurityTask, hardeningTask, trunkTask } from "./cliFixtures";
import type { CliDeviceState } from "./types";

const run = (state: CliDeviceState, ...lines: string[]) => lines.reduce((s, l) => executeCommand(s, l).state, state);
const out = (state: CliDeviceState, line: string) => (executeCommand(state, line).result as { output?: string[] }).output ?? [];
const last = (s: CliSession) => s.history[s.history.length - 1];
const drive = (ex: Parameters<typeof createSession>[0], ...lines: string[]) => lines.reduce((s, l) => submitCommand(ex, s, l), createSession(ex));
const IF = () => run(createDeviceState("switch"), "enable", "configure terminal", "interface f0/1");
const GLOBAL = () => run(createDeviceState("switch"), "enable", "configure terminal");

describe("Batch 9 grammar — only the book's commands were added; the table stays closed and ordered", () => {
  it("knows the Port Security, line, secret, encryption and banner commands and the three new show forms; nothing invented (no protect/restrict, no mac-address-table, no write memory, no ACL/OSPF)", () => {
    const ids = new Set<string>(COMMANDS.map(c => c.id));
    for (const id of ["switchport-port-security", "port-security-maximum", "port-security-mac-address", "port-security-sticky", "port-security-violation", "line", "password", "login", "enable-secret", "service-password-encryption", "banner-motd"]) expect(ids.has(id), id).toBe(true);
    expect(parseCommand("switchport port-security violation protect")).toMatchObject({ kind: "invalid", id: "port-security-violation" });
    expect(parseCommand("switchport port-security violation restrict")).toMatchObject({ kind: "invalid", id: "port-security-violation" });
    // Batch 10 later added `show ip route`, `router ospf` and `access-list` (the book's PDF 216–227); the rest stays unknown.
    for (const u of ["show mac-address-table", "show interfaces", "show arp", "show cdp neighbors", "show access-lists", "write memory", "copy running-config startup-config", "ip route 0.0.0.0 0.0.0.0 10.0.0.1", "line aux 0", "username admin secret x"]) expect(parseCommand(u), u).toEqual({ kind: "unknown" });
    expect(parseCommand("enable password cisco")).toMatchObject({ kind: "invalid", id: "enable" });   // the book prints only «enable secret»
    expect(NAVIGATION_COMMANDS).toContain("line");
  });
  it("parses the book's exact lines (PDF 182–184, 187–189, 193, 195, 197) with case-insensitive keywords and preserved values", () => {
    expect(parseCommand("switchport port-security")).toEqual({ kind: "ok", command: { id: "switchport-port-security" } });
    expect(parseCommand("switchport port-security mac-address 00A0.1234.5678")).toEqual({ kind: "ok", command: { id: "port-security-mac-address", mac: "00a0.1234.5678" } });
    expect(parseCommand("SWITCHPORT PORT-SECURITY MAC-ADDRESS STICKY")).toEqual({ kind: "ok", command: { id: "port-security-sticky" } });
    expect(parseCommand("switchport port-security maximum 3")).toEqual({ kind: "ok", command: { id: "port-security-maximum", maximum: 3 } });
    expect(parseCommand("switchport port-security violation shutdown")).toEqual({ kind: "ok", command: { id: "port-security-violation", action: "shutdown" } });
    expect(parseCommand("line vty 0 4")).toEqual({ kind: "ok", command: { id: "line", line: "vty" } });
    expect(parseCommand("line console 0")).toEqual({ kind: "ok", command: { id: "line", line: "console" } });
    expect(parseCommand("password cisco123")).toEqual({ kind: "ok", command: { id: "password", password: "cisco123" } });
    expect(parseCommand("login")).toEqual({ kind: "ok", command: { id: "login" } });
    expect(parseCommand("enable secret cisco123")).toEqual({ kind: "ok", command: { id: "enable-secret", secret: "cisco123" } });
    expect(parseCommand("service password-encryption")).toEqual({ kind: "ok", command: { id: "service-password-encryption" } });
    expect(parseCommand("banner motd #Welcome to SW1#")).toEqual({ kind: "ok", command: { id: "banner-motd", text: "Welcome to SW1" } });
    expect(parseCommand("show startup-config")).toEqual({ kind: "ok", command: { id: "show", what: "startup-config" } });
    expect(parseCommand("show port-security")).toEqual({ kind: "ok", command: { id: "show", what: "port-security" } });
    expect(parseCommand("show port-security interface F0/1")).toEqual({ kind: "ok", command: { id: "show", what: "port-security", iface: "f0/1" } });
    expect(parseCommand("enable")).toEqual({ kind: "ok", command: { id: "enable" } });   // «enable secret» never shadows «enable»
  });
  it("incomplete and invalid values: maximum 0 / 9000 / text, MAC in the wrong shape, vty ranges the book does not print, empty banner, extra tokens", () => {
    expect(parseCommand("switchport port-security maximum")).toMatchObject({ kind: "incomplete", id: "port-security-maximum" });
    for (const bad of ["0", "9000", "three", "2.5", "-1", "03"]) expect(parseCommand("switchport port-security maximum " + bad), bad).toMatchObject({ kind: "invalid", id: "port-security-maximum" });
    expect(parseCommand("switchport port-security mac-address")).toMatchObject({ kind: "incomplete" });
    for (const bad of ["00:A0:12:34:56:78", "00A0-1234-5678", "00A0.1234", "zzzz.1234.5678"]) expect(parseCommand("switchport port-security mac-address " + bad), bad).toMatchObject({ kind: "invalid", id: "port-security-mac-address" });
    expect(parseCommand("switchport port-security violation")).toMatchObject({ kind: "incomplete" });
    expect(parseCommand("line vty 0 15")).toMatchObject({ kind: "invalid", id: "line" });
    expect(parseCommand("line console 1")).toMatchObject({ kind: "invalid", id: "line" });
    expect(parseCommand("line vty")).toMatchObject({ kind: "incomplete", id: "line" });
    expect(parseCommand("password")).toMatchObject({ kind: "incomplete", id: "password" });
    expect(parseCommand("password one two")).toMatchObject({ kind: "invalid", id: "password" });
    expect(parseCommand("enable secret")).toMatchObject({ kind: "incomplete", id: "enable-secret" });
    expect(parseCommand("banner motd")).toMatchObject({ kind: "incomplete", id: "banner-motd" });
    expect(parseCommand("banner motd Welcome")).toMatchObject({ kind: "invalid", id: "banner-motd" });
    expect(parseCommand("banner motd #Welcome")).toMatchObject({ kind: "invalid", id: "banner-motd" });
    expect(parseCommand("login now")).toMatchObject({ kind: "invalid", id: "login" });
    expect(parseCommand("show port-security interface")).toMatchObject({ kind: "incomplete" });
    expect(parseCommand("show port-security interface xyz")).toMatchObject({ kind: "invalid" });
    expect(isCiscoMac("00A0.1234.5678")).toBe(true);
    expect(parseIntInRange(String(PORT_SECURITY_MAX), 1, PORT_SECURITY_MAX)).toBe(PORT_SECURITY_MAX);
    expect(parseIntInRange(String(PORT_SECURITY_MAX + 1), 1, PORT_SECURITY_MAX)).toBeNull();
  });
});

describe("Batch 9 modes and state", () => {
  it("Port Security commands are interface-mode only, mutate only the selected port, and compose into one record", () => {
    const s = run(IF(), "switchport mode access", "switchport port-security", "switchport port-security maximum 3", "switchport port-security mac-address 00A0.1234.5678", "switchport port-security mac-address sticky", "switchport port-security violation shutdown");
    expect(s.interfaces["f0/1"]).toEqual({ shutdown: false, switchportMode: "access", portSecurity: { enabled: true, maximum: 3, macAddress: "00a0.1234.5678", sticky: true, violation: "shutdown" } });
    expect(s.mode).toBe("interface");
    const g = GLOBAL();
    for (const cmd of ["switchport port-security", "switchport port-security maximum 2", "switchport port-security mac-address sticky", "switchport port-security violation shutdown"]) {
      const r = executeCommand(g, cmd);
      expect(r.result, cmd).toMatchObject({ status: "wrong-mode", requiredModes: ["interface"] });
      expect(r.state, cmd).toBe(g);
    }
    const sub = run(createDeviceState("router"), "enable", "conf t", "interface g0/0.10");
    expect(executeCommand(sub, "switchport port-security").result.status).toBe("wrong-mode");   // never on a sub-interface
    const range = run(GLOBAL(), "interface range f0/1-3", "switchport port-security maximum 2");
    expect([range.interfaces["f0/1"].portSecurity?.maximum, range.interfaces["f0/3"].portSecurity?.maximum, range.interfaces["f0/4"]]).toEqual([2, 2, undefined]);
  });
  it("line console 0 / line vty 0 4 enter the line mode with the (config-line)# prompt; password and login apply to the selected line only; exit / end leave it", () => {
    const g = GLOBAL();
    const con = run(g, "line console 0");
    expect([con.mode, con.selectedLine, promptFor(con)]).toEqual(["line", "console", "Switch(config-line)#"]);
    const s = run(con, "password cisco123", "login", "exit", "line vty 0 4", "password vtypass", "login");
    expect(s.lines).toEqual({ console: { password: "cisco123", login: true }, vty: { password: "vtypass", login: true } });
    expect([s.mode, s.selectedLine]).toEqual(["line", "vty"]);
    const back = run(s, "exit");
    expect([back.mode, back.selectedLine]).toEqual(["global", undefined]);
    const end = run(s, "end");
    expect([end.mode, end.selectedLine, promptFor(end)]).toEqual(["privileged", undefined, "Switch#"]);
    for (const cmd of ["password cisco123", "login"]) {
      const r = executeCommand(g, cmd);
      expect(r.result, cmd).toMatchObject({ status: "wrong-mode", requiredModes: ["line"] });
      expect(r.state, cmd).toBe(g);
    }
    expect(executeCommand(IF(), "line vty 0 4").result.status).toBe("wrong-mode");   // line is a global-config command
    expect(executeCommand(con, "interface f0/1").result.status).toBe("wrong-mode");  // and interface is not a line-mode command
    expect(executeCommand(con, "hostname X").result.status).toBe("wrong-mode");
  });
  it("enable secret, service password-encryption and banner motd are global-config commands that set device-level state", () => {
    const g = GLOBAL();
    const s = run(g, "enable secret cisco123", "service password-encryption", "banner motd #Authorized access only#");
    expect([s.enableSecret, s.passwordEncryption, s.banner]).toEqual(["cisco123", true, "Authorized access only"]);
    for (const cmd of ["enable secret cisco123", "service password-encryption", "banner motd #x#"]) {
      const priv = run(createDeviceState("switch"), "enable");
      const r = executeCommand(priv, cmd);
      expect(r.result.status, cmd).toBe("wrong-mode");
      expect(r.state, cmd).toBe(priv);
    }
    expect(executeCommand(createDeviceState("switch"), "enable").state.mode).toBe("privileged");   // plain enable still works from user EXEC
  });
  it("the new show outputs are deterministic, never echo secrets, and never change state", () => {
    const s = run(GLOBAL(), "enable secret cisco123", "line console 0", "password cisco123", "login", "exit", "service password-encryption", "banner motd #Hi#", "interface f0/1", "switchport mode access", "switchport port-security", "switchport port-security maximum 2", "switchport port-security violation shutdown", "end");
    const rc = out(s, "show running-config");
    expect(rc).toContain("enable secret 5 <hidden>");
    expect(rc).toContain("service password-encryption");
    expect(rc).toContain(" password 7 <hidden>");
    expect(rc).toContain(" login");
    expect(rc).toContain("banner motd ^CHi^C");
    expect(rc).toContain(" switchport port-security maximum 2");
    expect(rc.join("\n")).not.toContain("cisco123");
    const plain = run(GLOBAL(), "line vty 0 4", "password vtypass", "end");
    expect(out(plain, "show running-config")).toContain(" password vtypass");   // without service password-encryption the line password is shown as typed
    expect(out(s, "show startup-config")).toEqual(["startup-config is not present", "% (simulation) nothing has been saved to startup-config yet"]);
    expect(out(s, "show port-security")[1]).toMatch(/^FastEthernet0\/1\s+2\s+0\s+shutdown$/);
    expect(out(s, "show port-security interface f0/1")).toEqual(["Port Security              : Enabled", "Port Status                : Secure-up", "Violation Mode             : shutdown", "Maximum MAC Addresses      : 2", "Sticky MAC Addresses       : 0", "Configured MAC Address     : (none)"]);
    expect(out(s, "show port-security interface f0/9")[0]).toBe("Port Security              : Disabled");
    expect(out(GLOBAL(), "show port-security")).toEqual(["(no interface has port-security enabled yet)"]);
    for (const cmd of ["show running-config", "show startup-config", "show port-security", "show port-security interface f0/1"]) expect(executeCommand(s, cmd).state, cmd).toBe(s);
    expect(out(s, "show port-security")).toEqual(out(s, "show port-security"));
  });
  it("hostile / unsupported / repeated input stays inert on the new modes too", () => {
    const con = run(GLOBAL(), "line console 0");
    for (const h of ["password $(id)", "login; reboot", "password `whoami`", "banner motd #<script>#", "enable secret", "switchport port-security maximum 99999999", "line vty 0 4; rm -rf /", "password cisco123 && exit"]) {
      const r = executeCommand(con, h);
      expect(r.result.status, h).not.toBe("ok");
      expect(r.state, h).toBe(con);
    }
    const twice = run(IF(), "switchport port-security", "switchport port-security", "switchport port-security maximum 3", "switchport port-security maximum 3");
    expect(twice.interfaces["f0/1"].portSecurity).toEqual({ enabled: true, maximum: 3 });
  });
});

describe("Batch 9 exercises — completion by final state, allowed gate, wording", () => {
  it("the Port Security task completes only when all five goals hold, in any order; a wrong maximum or a missing sticky keeps it open", () => {
    const partial = drive(portSecurityTask, "enable", "conf t", "interface f0/1", "switchport mode access", "switchport port-security", "switchport port-security maximum 3", "switchport port-security violation shutdown");
    expect(goalStatus(portSecurityTask, partial.state).map(g => g.met)).toEqual([true, true, false, false, true]);
    expect(partial.completed).toBe(false);
    const done = ["switchport port-security mac-address sticky", "switchport port-security maximum 2"].reduce((s, l) => submitCommand(portSecurityTask, s, l), partial);
    expect([done.completed, last(done).feedback]).toEqual([true, CLI_FEEDBACK.taskCompleted]);
    const wrongPort = drive(portSecurityTask, "enable", "conf t", "interface f0/2", "switchport mode access", "switchport port-security", "switchport port-security maximum 2", "switchport port-security mac-address sticky", "switchport port-security violation shutdown");
    expect(wrongPort.completed).toBe(false);
    expect(createSession(portSecurityTask).state.interfaces).toEqual({});
    // A port with no port-security record at all: "enabled" is met only when the goal asks for false; every other prop is unmet.
    const untouched = drive(portSecurityTask, "enable", "conf t", "interface f0/1", "switchport mode access").state;
    expect(goalStatus(portSecurityTask, untouched).map(g => g.met)).toEqual([true, false, false, false, false]);
    expect(conditionMet(untouched, { kind: "port-security", name: "f0/1", prop: "enabled", value: false })).toBe(true);
    expect(conditionMet(untouched, { kind: "port-security", name: "f0/1", prop: "maximum", value: 2 })).toBe(false);
    expect(conditionMet(untouched, { kind: "port-security", name: "f0/9", prop: "enabled", value: true })).toBe(false);
  });
  it("the hardening task needs both lines + secret + encryption; the line goals are checked on the right line", () => {
    const s = drive(hardeningTask, "enable", "conf t", "line console 0", "password cisco123", "login", "exit", "line vty 0 4", "password cisco123", "login", "exit", "enable secret cisco123");
    expect(goalStatus(hardeningTask, s.state).map(g => g.met)).toEqual([true, true, true, true, true, false]);
    const done = submitCommand(hardeningTask, s, "service password-encryption");
    expect(done.completed).toBe(true);
    const swapped = drive(hardeningTask, "enable", "conf t", "line vty 0 4", "password cisco123", "login", "exit", "enable secret cisco123", "service password-encryption");
    expect(goalStatus(hardeningTask, swapped.state).map(g => g.met)).toEqual([false, false, true, true, true, true]);
    expect(conditionMet(swapped.state, { kind: "line", line: "vty", prop: "password", value: "CISCO123" })).toBe(true);   // names compare case-insensitively
  });
  it("wrong-mode feedback names the line / interface modes; the allowed gate refuses a valid but unwanted command without executing it", () => {
    const ex = { ...portSecurityTask, allowed: ["switchport-mode", "switchport-port-security", "port-security-maximum", "port-security-sticky", "port-security-violation"] as const };
    const cfg = readCliExerciseConfig(ex)!;
    let s = drive(cfg, "enable", "conf t", "password x");
    expect(last(s).feedback).toBe(CLI_FEEDBACK.wrongMode(CLI_MODE_LABEL.line));
    s = submitCommand(cfg, s, "switchport port-security");
    expect(last(s).feedback).toBe(CLI_FEEDBACK.interfaceFirst);
    s = submitCommand(cfg, s, "interface f0/1");
    s = submitCommand(cfg, s, "switchport port-security mac-address 00A0.1234.5678");   // valid, not allowed → not executed
    expect([last(s).status, last(s).feedback, s.state.interfaces["f0/1"].portSecurity]).toEqual(["not-required", CLI_FEEDBACK.notRequired, undefined]);
    s = submitCommand(cfg, s, "show port-security");   // show is navigation-class: always allowed, never counts as an attempt
    expect(last(s).status).toBe("ok");
  });
});

describe("Batch 9 config validation — as strict as the runtime validators", () => {
  const base = { kind: "task", device: "switch" } as const;
  const goal = (condition: unknown) => ({ ...base, goals: [{ id: "g", label: "l", condition }] });
  it("accepts the fixtures and every valid condition kind", () => {
    expect(readCliExerciseConfig(portSecurityTask)?.goals).toHaveLength(5);
    expect(readCliExerciseConfig(hardeningTask)?.goals).toHaveLength(6);
    expect(readCliExerciseConfig(trunkTask)?.goals).toHaveLength(2);
    expect(readCliExerciseConfig({ ...base, startMode: "line", startLine: "vty", goals: [{ id: "g", label: "l", condition: { kind: "line", line: "vty", prop: "login", value: true } }] })?.startLine).toBe("vty");
    expect(readCliExerciseConfig(goal({ kind: "device", prop: "banner", value: "hi" }))).not.toBeNull();
  });
  it("rejects values the learner could never type: bad IPv4 / mask, VLAN 0 or 5000, unknown interface names, malformed MAC, maximum out of range, violation protect, unknown props, non-boolean flags, line without startLine", () => {
    expect(readCliExerciseConfig(goal({ kind: "interface", name: "g0/0", prop: "ipAddress", value: "300.1.1.1" }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "interface", name: "g0/0", prop: "subnetMask", value: "255.0.255.0" }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "interface", name: "f0/1", prop: "accessVlan", value: 5000 }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "interface", name: "f0/1", prop: "allowedVlans", value: [10, 0] }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "interface", name: "serial0/0/0", prop: "shutdown", value: false }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "interface", name: "f0/1", prop: "shutdown", value: "no" }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "port-security", name: "f0/1", prop: "macAddress", value: "00:A0:12:34:56:78" }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "port-security", name: "f0/1", prop: "maximum", value: 0 }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "port-security", name: "f0/1", prop: "maximum", value: PORT_SECURITY_MAX + 1 }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "port-security", name: "f0/1", prop: "violation", value: "protect" }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "port-security", name: "f0/1", prop: "delete", value: true }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "vlan", vlanId: 4095 }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "dhcp-pool", name: "LAN", prop: "dnsServers", value: ["8.8.8.8", "not-an-ip"] }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "dhcp-excluded", from: "192.168.1.1", to: "192.168.1" }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "line", line: "aux", prop: "login", value: true }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "line", line: "vty", prop: "login", value: "yes" }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "device", prop: "enableSecret", value: "has space" }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "vtp", prop: "mode", value: "transparent" }))).toBeNull();
    expect(readCliExerciseConfig({ ...base, startMode: "line", goals: [{ id: "g", label: "l", condition: { kind: "mode", mode: "line" } }] })).toBeNull();
    expect(readCliExerciseConfig({ ...base, startMode: "interface", startInterface: "xyz", goals: [{ id: "g", label: "l", condition: { kind: "mode", mode: "line" } }] })).toBeNull();
  });
  it("rejects expectation args that the runtime would refuse: unknown arg keys, bad addresses, out-of-range maximum, bad MAC, unknown show", () => {
    const step = (expect_: unknown) => ({ kind: "challenge", device: "switch", steps: [{ id: "s", instruction: "i", expect: expect_ }] });
    expect(readCliExerciseConfig(step({ command: "ip-address", args: { address: "192.168.1.254", mask: "255.255.255.0" } }))).not.toBeNull();
    expect(readCliExerciseConfig(step({ command: "ip-address", args: { address: "192.168.1.999", mask: "255.255.255.0" } }))).toBeNull();
    expect(readCliExerciseConfig(step({ command: "port-security-maximum", args: { maximum: 2 } }))).not.toBeNull();
    expect(readCliExerciseConfig(step({ command: "port-security-maximum", args: { maximum: 0 } }))).toBeNull();
    expect(readCliExerciseConfig(step({ command: "port-security-mac-address", args: { mac: "00A0.1234.5678" } }))).not.toBeNull();
    expect(readCliExerciseConfig(step({ command: "port-security-mac-address", args: { mac: "nope" } }))).toBeNull();
    expect(readCliExerciseConfig(step({ command: "show", args: { what: "port-security", iface: "f0/1" } }))).not.toBeNull();
    expect(readCliExerciseConfig(step({ command: "show", args: { what: "mac-address-table" } }))).toBeNull();
    expect(readCliExerciseConfig(step({ command: "interface", args: { evil: "x" } }))).toBeNull();
    expect(readCliExerciseConfig(step({ command: "line", args: { line: "aux" } }))).toBeNull();
  });
  it("initial state from startMode line / preset port-security is deterministic and reset-safe", () => {
    const cfg = readCliExerciseConfig({ kind: "challenge", device: "switch", startMode: "line", startLine: "console", steps: [{ id: "s", instruction: "i", expect: { command: "login" } }] })!;
    const st = createInitialState(cfg);
    expect([st.mode, st.selectedLine, promptFor(st)]).toEqual(["line", "console", "Switch(config-line)#"]);
    expect(createInitialState(cfg)).toEqual(st);
    const withPreset = readCliExerciseConfig({ kind: "task", device: "switch", startMode: "interface", startInterface: "f0/1", preset: { interfaces: { "f0/1": { switchportMode: "access", portSecurity: { enabled: true } } } }, goals: [{ id: "g", label: "l", condition: { kind: "port-security", name: "f0/1", prop: "maximum", value: 2 } }] })!;
    expect(createInitialState(withPreset).interfaces["f0/1"]).toEqual({ shutdown: false, switchportMode: "access", portSecurity: { enabled: true } });
  });
});
