// Batch 10 — the CLI simulator extension for the book's PDF 201–229: the `router` mode (OSPF / EIGRP) with its
// `network` forms, numbered standard / extended access lists, `ip access-group`, `show ip route`, config
// validation by grammar round-trip, wrong-mode / wrong-process / invalid / hostile input never mutating state,
// and exercise completion by final state. Pure engine tests, no DOM.
import { describe, it, expect } from "vitest";
import { executeCommand, applyCommand } from "./engine";
import { parseCommand, COMMANDS, NAVIGATION_COMMANDS } from "./grammar";
import { parseAclAddress, aclEntryText, ospfNetworkText, networkOf, prefixLength } from "./normalize";
import { createDeviceState, createInitialState, promptFor, CLI_MODE_LABEL, CLI_MODE_SUFFIX } from "./state";
import { createSession, submitCommand, goalStatus, conditionMet, CLI_FEEDBACK, type CliSession } from "./exercise";
import { readCliExerciseConfig } from "./config";
import { ospfTask, aclTask, aclChallenge } from "./cliFixtures";
import type { CliDeviceState } from "./types";

const run = (state: CliDeviceState, ...lines: string[]) => lines.reduce((s, l) => executeCommand(s, l).state, state);
const out = (state: CliDeviceState, line: string) => (executeCommand(state, line).result as { output?: string[] }).output ?? [];
const last = (s: CliSession) => s.history[s.history.length - 1];
const drive = (ex: Parameters<typeof createSession>[0], ...lines: string[]) => lines.reduce((s, l) => submitCommand(ex, s, l), createSession(ex));
const GLOBAL = () => run(createDeviceState("router", "R1"), "enable", "configure terminal");
const OSPF = () => run(GLOBAL(), "router ospf 1");
const EIGRP = () => run(GLOBAL(), "router eigrp 100");

describe("Batch 10 grammar — only the book's routing / ACL lines were added; the table stays closed", () => {
  it("knows router, the three network forms, access-list, ip access-group and show ip route; nothing invented (no rip, static routes, named ACLs, no-forms, show access-lists)", () => {
    const ids = new Set<string>(COMMANDS.map(c => c.id));
    for (const id of ["router", "network", "access-list", "ip-access-group"]) expect(ids.has(id), id).toBe(true);
    expect(parseCommand("show ip route")).toEqual({ kind: "ok", command: { id: "show", what: "ip-route" } });
    for (const u of ["router rip", "router bgp 65000", "ip route 0.0.0.0 0.0.0.0 10.0.0.1", "ip access-list standard LAN", "no access-list 10", "show access-lists", "show ip ospf neighbor", "show ip protocols", "passive-interface g0/0", "router-id 1.1.1.1"]) expect(parseCommand(u), u).toEqual({ kind: "unknown" });
    expect(NAVIGATION_COMMANDS).toContain("router");
    expect(NAVIGATION_COMMANDS).not.toContain("access-list");
    expect(CLI_MODE_LABEL.router).toBe("وضع إعداد التوجيه");
    expect(CLI_MODE_SUFFIX.router).toBe("(config-router)#");
  });
  it("parses the book's exact lines (PDF 216–217, 220–221, 224–227) with case-insensitive keywords and preserved values", () => {
    expect(parseCommand("router ospf 1")).toEqual({ kind: "ok", command: { id: "router", protocol: "ospf", number: 1 } });
    expect(parseCommand("Router EIGRP 100")).toEqual({ kind: "ok", command: { id: "router", protocol: "eigrp", number: 100 } });
    expect(parseCommand("network 192.168.1.0 0.0.0.255 area 0")).toEqual({ kind: "ok", command: { id: "network", form: "ospf", address: "192.168.1.0", wildcard: "0.0.0.255", area: 0 } });
    expect(parseCommand("network 10.0.0.0 0.0.0.3 AREA 0")).toEqual({ kind: "ok", command: { id: "network", form: "ospf", address: "10.0.0.0", wildcard: "0.0.0.3", area: 0 } });
    expect(parseCommand("network 192.168.1.0")).toEqual({ kind: "ok", command: { id: "network", form: "eigrp", address: "192.168.1.0" } });
    expect(parseCommand("network 192.168.1.0 255.255.255.0")).toEqual({ kind: "ok", command: { id: "network", form: "dhcp", address: "192.168.1.0", mask: "255.255.255.0" } });   // Batch 8's DHCP form still parses
    expect(parseCommand("access-list 10 permit 192.168.1.0 0.0.0.255")).toEqual({ kind: "ok", command: { id: "access-list", number: 10, entry: { action: "permit", source: "192.168.1.0 0.0.0.255" } } });
    expect(parseCommand("access-list 20 deny 192.168.2.0 0.0.0.255")).toMatchObject({ kind: "ok", command: { number: 20, entry: { action: "deny" } } });
    expect(parseCommand("access-list 20 permit any")).toEqual({ kind: "ok", command: { id: "access-list", number: 20, entry: { action: "permit", source: "any" } } });
    expect(parseCommand("access-list 30 permit host 192.168.1.10")).toEqual({ kind: "ok", command: { id: "access-list", number: 30, entry: { action: "permit", source: "host 192.168.1.10" } } });
    expect(parseCommand("access-list 100 permit tcp any any eq 80")).toEqual({ kind: "ok", command: { id: "access-list", number: 100, entry: { action: "permit", protocol: "tcp", source: "any", destination: "any", port: 80 } } });
    expect(parseCommand("access-list 101 deny icmp host 192.168.1.10 192.168.2.0 0.0.0.255")).toEqual({ kind: "ok", command: { id: "access-list", number: 101, entry: { action: "deny", protocol: "icmp", source: "host 192.168.1.10", destination: "192.168.2.0 0.0.0.255" } } });
    expect(parseCommand("ip access-group 10 out")).toEqual({ kind: "ok", command: { id: "ip-access-group", number: 10, direction: "out" } });
    expect(parseCommand("ip access-group 40 IN")).toEqual({ kind: "ok", command: { id: "ip-access-group", number: 40, direction: "in" } });
    expect(aclEntryText({ action: "permit", protocol: "tcp", source: "any", destination: "any", port: 80 })).toBe("permit tcp any any eq 80");
    expect(ospfNetworkText({ address: "10.0.0.0", wildcard: "0.0.0.3", area: 0 })).toBe("10.0.0.0 0.0.0.3 area 0");
  });
  it("incomplete and invalid values: missing numbers / areas / directions, list numbers out of range, bad addresses, extended syntax on a standard list, eq on icmp, extra tokens", () => {
    expect(parseCommand("router ospf")).toMatchObject({ kind: "incomplete", id: "router" });
    expect(parseCommand("router eigrp 0")).toMatchObject({ kind: "invalid", id: "router" });
    expect(parseCommand("router ospf 1 2")).toMatchObject({ kind: "invalid", id: "router" });
    expect(parseCommand("network")).toMatchObject({ kind: "incomplete", id: "network" });
    expect(parseCommand("network 192.168.1.0 0.0.0.255 area")).toMatchObject({ kind: "incomplete", id: "network" });
    expect(parseCommand("network 192.168.1.0 0.0.0.255")).toMatchObject({ kind: "invalid", id: "network" });   // a wildcard is not a mask: area is missing
    expect(parseCommand("network 192.168.1.0 0.0.0.255 zone 0")).toMatchObject({ kind: "invalid", id: "network" });
    expect(parseCommand("network 192.168.1.0 0.0.0.255 area 0 extra")).toMatchObject({ kind: "invalid", id: "network" });
    expect(parseCommand("network 192.168.1.256")).toMatchObject({ kind: "invalid", id: "network" });
    expect(parseCommand("access-list")).toMatchObject({ kind: "incomplete", id: "access-list" });
    expect(parseCommand("access-list 10")).toMatchObject({ kind: "incomplete", id: "access-list" });
    expect(parseCommand("access-list 10 permit")).toMatchObject({ kind: "incomplete", id: "access-list" });
    expect(parseCommand("access-list 10 permit 192.168.1.0")).toMatchObject({ kind: "incomplete", id: "access-list" });   // wildcard missing
    expect(parseCommand("access-list 10 permit host")).toMatchObject({ kind: "incomplete", id: "access-list" });
    expect(parseCommand("access-list 0 permit any")).toMatchObject({ kind: "invalid", id: "access-list" });
    expect(parseCommand("access-list 200 permit any")).toMatchObject({ kind: "invalid", id: "access-list" });
    expect(parseCommand("access-list 200 permit tcp any any")).toMatchObject({ kind: "invalid", id: "access-list" });   // 200 is outside the book's 100–199 even with extended syntax
    expect(parseCommand("access-list 199 permit tcp any any")).toMatchObject({ kind: "ok" });
    expect(parseCommand("access-list 10 allow any")).toMatchObject({ kind: "invalid", id: "access-list" });
    expect(parseCommand("access-list 10 permit tcp any any eq 80")).toMatchObject({ kind: "invalid", id: "access-list" });   // extended syntax on a standard number
    expect(parseCommand("access-list 100 permit any any")).toMatchObject({ kind: "invalid", id: "access-list" });   // protocol missing
    expect(parseCommand("access-list 100 permit tcp any")).toMatchObject({ kind: "incomplete", id: "access-list" });   // destination missing
    expect(parseCommand("access-list 100 permit tcp any any eq")).toMatchObject({ kind: "incomplete", id: "access-list" });
    expect(parseCommand("access-list 100 permit tcp any any eq 70000")).toMatchObject({ kind: "invalid", id: "access-list" });
    expect(parseCommand("access-list 100 permit icmp any any eq 80")).toMatchObject({ kind: "invalid", id: "access-list" });
    expect(parseCommand("access-list 100 permit tcp any any eq 80 log")).toMatchObject({ kind: "invalid", id: "access-list" });
    expect(parseCommand("ip access-group")).toMatchObject({ kind: "incomplete", id: "ip-access-group" });
    expect(parseCommand("ip access-group 10")).toMatchObject({ kind: "incomplete", id: "ip-access-group" });
    expect(parseCommand("ip access-group 10 both")).toMatchObject({ kind: "invalid", id: "ip-access-group" });
    expect(parseCommand("ip access-group 300 in")).toMatchObject({ kind: "invalid", id: "ip-access-group" });
    expect(parseAclAddress(["host", "1.2.3.400"])).toEqual({ invalid: "عنوان الجهاز غير صالح: 1.2.3.400" });
    expect(parseAclAddress(["192.168.1.0", "0.0.0.255", "extra"])).toEqual({ text: "192.168.1.0 0.0.0.255", used: 2 });
    expect([networkOf("192.168.1.1", "255.255.255.0"), prefixLength("255.255.255.252"), prefixLength("255.0.0.0")]).toEqual(["192.168.1.0", 30, 8]);
  });
});

describe("Batch 10 modes and state", () => {
  it("router ospf / eigrp enter the (config-router)# mode from global config only; exit / end leave it and clear the selection", () => {
    const s = OSPF();
    expect([s.mode, s.selectedRouter, promptFor(s), s.routing]).toEqual(["router", "ospf", "R1(config-router)#", { ospf: { id: 1, networks: [] } }]);
    expect(run(s, "exit").mode).toBe("global");
    expect(run(s, "exit").selectedRouter).toBeUndefined();
    expect(run(s, "end").mode).toBe("privileged");
    for (const st of [createDeviceState("router"), run(createDeviceState("router"), "enable"), run(GLOBAL(), "interface g0/0")]) {
      const r = executeCommand(st, "router ospf 1");
      expect(r.result.status).toBe("wrong-mode");
      expect(r.state).toBe(st);
    }
    // Re-entering the same process keeps its networks; a different process id starts afresh; the other protocol is untouched.
    const filled = run(s, "network 192.168.1.0 0.0.0.255 area 0", "exit", "router eigrp 100", "network 10.0.0.0", "exit");
    expect(run(filled, "router ospf 1").routing.ospf!.networks).toHaveLength(1);
    expect(run(filled, "router ospf 2").routing).toEqual({ ospf: { id: 2, networks: [] }, eigrp: { id: 100, networks: ["10.0.0.0"] } });
  });
  it("the network form must match the process: EIGRP's classful form inside OSPF is incomplete, OSPF's area form inside EIGRP is invalid, DHCP's mask form is wrong-mode — none mutates state", () => {
    const o = OSPF(), e = EIGRP();
    expect(executeCommand(o, "network 192.168.1.0")).toMatchObject({ state: o, result: { status: "incomplete", id: "network" } });
    expect(executeCommand(e, "network 192.168.1.0 0.0.0.255 area 0")).toMatchObject({ state: e, result: { status: "invalid", id: "network" } });
    expect(executeCommand(o, "network 192.168.1.0 255.255.255.0")).toMatchObject({ state: o, result: { status: "wrong-mode", requiredModes: ["dhcp"] } });
    const pool = run(GLOBAL(), "ip dhcp pool LAN");
    expect(executeCommand(pool, "network 192.168.1.0 0.0.0.255 area 0")).toMatchObject({ state: pool, result: { status: "wrong-mode", requiredModes: ["router"] } });
    expect(executeCommand(pool, "network 192.168.1.0 255.255.255.0").state.dhcpPools.LAN).toEqual({ dnsServers: [], network: "192.168.1.0", mask: "255.255.255.0" });
    expect(executeCommand(GLOBAL(), "network 10.0.0.0")).toMatchObject({ result: { status: "wrong-mode", requiredModes: ["router"] } });
  });
  it("network statements accumulate in authored order without duplicates (OSPF: address + wildcard + area; EIGRP: address)", () => {
    const o = run(OSPF(), "network 192.168.1.0 0.0.0.255 area 0", "network 10.0.0.0 0.0.0.3 area 0", "network 192.168.1.0 0.0.0.255 area 0");
    expect(o.routing.ospf!.networks.map(ospfNetworkText)).toEqual(["192.168.1.0 0.0.0.255 area 0", "10.0.0.0 0.0.0.3 area 0"]);
    const e = run(EIGRP(), "network 192.168.1.0", "network 10.0.0.0", "network 10.0.0.0");
    expect(e.routing.eigrp).toEqual({ id: 100, networks: ["192.168.1.0", "10.0.0.0"] });
  });
  it("access-list appends de-duplicated entries per list number in global config only; ip access-group applies to the selected interface(s) only", () => {
    const g = run(GLOBAL(), "access-list 10 permit 192.168.1.0 0.0.0.255", "access-list 20 deny 192.168.2.0 0.0.0.255", "access-list 20 permit any", "access-list 20 permit any", "access-list 100 permit tcp any any eq 80");
    expect(Object.fromEntries(Object.entries(g.acls).map(([n, l]) => [n, l.map(aclEntryText)]))).toEqual({ 10: ["permit 192.168.1.0 0.0.0.255"], 20: ["deny 192.168.2.0 0.0.0.255", "permit any"], 100: ["permit tcp any any eq 80"] });
    for (const st of [run(g, "interface g0/0"), OSPF(), run(GLOBAL(), "line console 0")]) {
      const r = executeCommand(st, "access-list 30 permit host 192.168.1.10");
      expect(r.result.status).toBe("wrong-mode");
      expect(r.state).toBe(st);
    }
    const applied = run(g, "interface g0/0", "ip access-group 40 in");
    expect(applied.interfaces["g0/0"].accessGroup).toEqual({ acl: 40, direction: "in" });
    expect(run(applied, "ip access-group 10 out").interfaces["g0/0"].accessGroup).toEqual({ acl: 10, direction: "out" });   // one list per interface in this simulation
    expect(executeCommand(g, "ip access-group 40 in")).toMatchObject({ state: g, result: { status: "wrong-mode" } });
    const both = run(g, "interface range g0/0-1", "ip access-group 20 out");
    expect([both.interfaces["g0/0"].accessGroup, both.interfaces["g0/1"].accessGroup]).toEqual([{ acl: 20, direction: "out" }, { acl: 20, direction: "out" }]);
  });
  it("show ip route and show running-config are deterministic, reflect the state, never change it, and never invent learned routes", () => {
    const empty = run(createDeviceState("router", "R1"), "enable");
    expect(out(empty, "show ip route")).toEqual(["Codes: C - connected, S - static, R - RIP, O - OSPF, D - EIGRP", "", "(no connected networks yet: give an interface an address and no shutdown)"]);
    const s = run(GLOBAL(), "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "exit", "interface g0/1", "ip address 10.0.0.1 255.255.255.252", "exit", "router ospf 1", "network 192.168.1.0 0.0.0.255 area 0", "exit", "access-list 10 permit any", "interface g0/0", "ip access-group 10 out", "end");
    const route = out(s, "show ip route");
    expect(route).toEqual(["Codes: C - connected, S - static, R - RIP, O - OSPF, D - EIGRP", "", "C    192.168.1.0/24 is directly connected, GigabitEthernet0/0", "% (simulation) routes learned via OSPF appear only after neighbours exchange updates"]);   // g0/1 is still shut down
    expect(out(s, "show ip route")).toEqual(route);
    expect(executeCommand(s, "show ip route").state).toBe(s);
    const cfg = out(s, "show running-config");
    expect(cfg).toContain("router ospf 1");
    expect(cfg).toContain(" network 192.168.1.0 0.0.0.255 area 0");
    expect(cfg).toContain("access-list 10 permit any");
    expect(cfg).toContain(" ip access-group 10 out");
    expect(cfg.indexOf("router ospf 1")).toBeGreaterThan(cfg.indexOf("interface GigabitEthernet0/1"));
    expect(cfg.indexOf("access-list 10 permit any")).toBeGreaterThan(cfg.indexOf("router ospf 1"));
    expect(out(run(s, "configure terminal", "router eigrp 100", "end"), "show ip route").at(-1)).toBe("% (simulation) routes learned via OSPF / EIGRP appear only after neighbours exchange updates");
    expect(executeCommand(createDeviceState("router"), "show ip route").result.status).toBe("wrong-mode");
  });
  it("hostile / unsupported / repeated input stays inert in router mode and on the ACL commands", () => {
    const o = OSPF();
    for (const h of ["network $(id) 0.0.0.255 area 0", "network 192.168.1.0 0.0.0.255 area 0; reboot", "router ospf `whoami`", "access-list 10 permit any && exit", "network 192.168.1.0 0.0.0.255 area 99999999", "access-list 10 permit 0.0.0.0 0.0.0.0 0.0.0.0", "network <script>alert(1)</script>", "ip access-group 10 in"]) {
      const r = executeCommand(o, h);
      expect(r.result.status, h).not.toBe("ok");
      expect(r.state, h).toBe(o);
    }
    const twice = run(OSPF(), "network 10.0.0.0 0.0.0.3 area 0", "network 10.0.0.0 0.0.0.3 area 0");
    expect(twice.routing.ospf!.networks).toHaveLength(1);
    // applyCommand is exported: a routing form applied to the OTHER process (or with no process selected) is a no-op there too.
    expect(applyCommand(o, { id: "network", form: "eigrp", address: "10.0.0.0" }).state).toBe(o);
    const both = run(GLOBAL(), "router ospf 1", "exit", "router eigrp 100");   // OSPF exists, EIGRP is selected
    expect(applyCommand(both, { id: "network", form: "ospf", address: "10.0.0.0", wildcard: "0.0.0.3", area: 0 }).state).toBe(both);
    expect(applyCommand(EIGRP(), { id: "network", form: "ospf", address: "10.0.0.0", wildcard: "0.0.0.3", area: 0 }).state.routing.ospf).toBeUndefined();
    expect(applyCommand(run(GLOBAL(), "router eigrp 100", "exit"), { id: "network", form: "eigrp", address: "10.0.0.0" }).state.routing.eigrp!.networks).toEqual([]);
  });
});

describe("Batch 10 exercises — completion by final state, allowed gate, wording", () => {
  it("the OSPF task completes only when the process and both networks hold, in any order; a wrong wildcard or area keeps it open", () => {
    const partial = drive(ospfTask, "enable", "conf t", "router ospf 1", "network 192.168.1.0 0.0.0.255 area 0");
    expect(goalStatus(ospfTask, partial.state).map(g => g.met)).toEqual([true, true, false]);
    expect(partial.completed).toBe(false);
    const wrongArea = submitCommand(ospfTask, partial, "network 10.0.0.0 0.0.0.3 area 1");
    expect([wrongArea.completed, last(wrongArea).feedback]).toEqual([false, CLI_FEEDBACK.done]);
    const wrongWildcard = submitCommand(ospfTask, partial, "network 10.0.0.0 0.0.0.255 area 0");
    expect(wrongWildcard.completed).toBe(false);
    const done = submitCommand(ospfTask, partial, "network 10.0.0.0 0.0.0.3 area 0");
    expect([done.completed, last(done).feedback]).toEqual([true, CLI_FEEDBACK.taskCompleted]);
    const reversed = drive(ospfTask, "enable", "conf t", "router ospf 1", "network 10.0.0.0 0.0.0.3 area 0", "network 192.168.1.0 0.0.0.255 area 0");
    expect(reversed.completed).toBe(true);
    const wrongProcess = drive(ospfTask, "enable", "conf t", "router ospf 2", "network 10.0.0.0 0.0.0.3 area 0", "network 192.168.1.0 0.0.0.255 area 0");
    expect(wrongProcess.completed).toBe(false);
    expect(conditionMet(createSession(ospfTask).state, { kind: "routing", protocol: "ospf", prop: "id", value: 1 })).toBe(false);
  });
  it("the ACL task needs the exact entry, exactly one line, and the inbound application on g0/0; a wrong direction or an extra line keeps it open", () => {
    const s = drive(aclTask, "enable", "conf t", "access-list 40 permit 192.168.1.0 0.0.0.255", "interface g0/0", "ip access-group 40 out");
    expect(goalStatus(aclTask, s.state).map(g => g.met)).toEqual([true, true, false]);
    const done = submitCommand(aclTask, s, "ip access-group 40 in");
    expect([done.completed, last(done).feedback]).toEqual([true, CLI_FEEDBACK.taskCompleted]);
    const extra = drive(aclTask, "enable", "conf t", "access-list 40 permit 192.168.1.0 0.0.0.255", "access-list 40 permit any", "interface g0/0", "ip access-group 40 in");
    expect([extra.completed, goalStatus(aclTask, extra.state).map(g => g.met)]).toEqual([false, [true, false, true]]);
    const wrongIf = drive(aclTask, "enable", "conf t", "access-list 40 permit 192.168.1.0 0.0.0.255", "interface g0/1", "ip access-group 40 in");
    expect(wrongIf.completed).toBe(false);
    expect(conditionMet(done.state, { kind: "acl", number: 40, prop: "entry", value: "PERMIT 192.168.1.0 0.0.0.255" })).toBe(true);   // texts compare case-insensitively
    expect(conditionMet(done.state, { kind: "acl", number: 41, prop: "count", value: 0 })).toBe(true);
  });
  it("the extended-ACL challenge accepts only access-list; wrong-mode / not-required / retry / correct feedback are the exact strings", () => {
    let s = submitCommand(aclChallenge, createSession(aclChallenge), "hostname R9");
    expect([last(s).status, last(s).feedback, s.state.hostname]).toEqual(["not-required", CLI_FEEDBACK.notRequired, "Router"]);
    s = submitCommand(aclChallenge, s, "ip access-group 100 in");
    expect([last(s).status, last(s).feedback]).toEqual(["wrong-mode", CLI_FEEDBACK.interfaceFirst]);
    s = submitCommand(aclChallenge, s, "access-list 100 permit tcp any any eq 443");   // valid, allowed, but not the asked rule → retry (state does change: it is a real line)
    expect([s.stepIndex, last(s).feedback, s.state.acls["100"].length]).toEqual([0, CLI_FEEDBACK.retry, 1]);
    s = submitCommand(aclChallenge, s, "access-list 100 permit tcp any any eq 80");
    expect([s.stepIndex, last(s).feedback]).toEqual([1, CLI_FEEDBACK.correct]);
    s = submitCommand(aclChallenge, s, "access-list 100 permit tcp any any eq 443");
    expect([s.completed, last(s).feedback]).toEqual([true, CLI_FEEDBACK.correct]);   // the completion banner is rendered by the component, not written to the transcript
    const wm = submitCommand(ospfTask, createSession(ospfTask), "network 10.0.0.0 0.0.0.3 area 0");
    expect(last(wm).feedback).toBe(CLI_FEEDBACK.wrongMode(CLI_MODE_LABEL.router));
    const inOspf = drive(ospfTask, "enable", "conf t", "router ospf 1", "network 10.0.0.0");
    expect(last(inOspf).feedback).toBe(CLI_FEEDBACK.incomplete("في OSPF المطلوب: network <address> <wildcard> area <n>"));
  });
});

describe("Batch 10 config validation — every pinned value must round-trip through the runtime grammar", () => {
  const base = { kind: "task", device: "router" } as const;
  const goal = (condition: unknown) => ({ ...base, goals: [{ id: "g", label: "l", condition }] });
  const step = (expect: unknown) => ({ kind: "challenge", device: "router", steps: [{ id: "s", instruction: "i", expect }] });
  it("accepts the fixtures and every valid routing / acl / accessGroup value", () => {
    expect(readCliExerciseConfig(ospfTask)?.goals).toHaveLength(3);
    expect(readCliExerciseConfig(aclTask)?.goals).toHaveLength(3);
    expect(readCliExerciseConfig(aclChallenge)?.steps).toHaveLength(2);
    for (const c of [
      { kind: "routing", protocol: "ospf", prop: "id", value: 1 }, { kind: "routing", protocol: "eigrp", prop: "id", value: 100 },
      { kind: "routing", protocol: "ospf", prop: "network", value: "10.0.0.0 0.0.0.3 area 0" }, { kind: "routing", protocol: "eigrp", prop: "network", value: "10.0.0.0" },
      { kind: "acl", number: 10, prop: "entry", value: "permit 192.168.1.0 0.0.0.255" }, { kind: "acl", number: 20, prop: "entry", value: "deny any" },
      { kind: "acl", number: 30, prop: "entry", value: "permit host 192.168.1.10" }, { kind: "acl", number: 100, prop: "entry", value: "permit tcp any any eq 80" },
      { kind: "acl", number: 100, prop: "count", value: 2 }, { kind: "interface", name: "g0/0", prop: "accessGroup", value: "40 in" },
    ]) expect(readCliExerciseConfig(goal(c)), JSON.stringify(c)).not.toBeNull();
    for (const e of [
      { command: "router", args: { protocol: "ospf", number: 1 } }, { command: "network", args: { form: "ospf", address: "192.168.1.0", wildcard: "0.0.0.255", area: 0 } },
      { command: "network", args: { form: "eigrp", address: "10.0.0.0" } }, { command: "access-list", args: { number: 100, action: "permit", protocol: "tcp", source: "any", destination: "any", port: 80 } },
      { command: "access-list", args: { number: 30, action: "permit", source: "host 192.168.1.10" } }, { command: "ip-access-group", args: { number: 40, direction: "in" } }, { command: "show", args: { what: "ip-route" } },
    ]) expect(readCliExerciseConfig(step(e)), JSON.stringify(e)).not.toBeNull();
  });
  it("rejects values the learner could never type: non-canonical or partial texts, numbers out of range, unknown protocols / directions / keys", () => {
    for (const c of [
      { kind: "routing", protocol: "rip", prop: "id", value: 1 }, { kind: "routing", protocol: "ospf", prop: "id", value: 0 }, { kind: "routing", protocol: "ospf", prop: "id", value: "1" },
      { kind: "routing", protocol: "ospf", prop: "network", value: "10.0.0.0 0.0.0.3" }, { kind: "routing", protocol: "ospf", prop: "network", value: "10.0.0.0  0.0.0.3 area 0" },
      { kind: "routing", protocol: "ospf", prop: "network", value: "10.0.0.0 0.0.0.3 AREA 0" }, { kind: "routing", protocol: "eigrp", prop: "network", value: "10.0.0.0 0.0.0.3 area 0" }, { kind: "routing", protocol: "eigrp", prop: "network", value: "10.0.0" },
      { kind: "routing", protocol: "ospf", prop: "networks", value: "x" },
      { kind: "acl", number: 10, prop: "entry", value: "permit 192.168.1.0" }, { kind: "acl", number: 10, prop: "entry", value: "permit tcp any any eq 80" }, { kind: "acl", number: 100, prop: "entry", value: "permit any" },
      { kind: "acl", number: 100, prop: "entry", value: "permit tcp any any eq http" }, { kind: "acl", number: 100, prop: "entry", value: "Permit tcp any any eq 80" }, { kind: "acl", number: 200, prop: "entry", value: "permit any" },
      { kind: "acl", number: 10, prop: "count", value: -1 }, { kind: "acl", number: 10, prop: "lines", value: 1 },
      { kind: "interface", name: "g0/0", prop: "accessGroup", value: "40 both" }, { kind: "interface", name: "g0/0", prop: "accessGroup", value: "40" }, { kind: "interface", name: "g0/0", prop: "accessGroup", value: "400 in" },
    ]) expect(readCliExerciseConfig(goal(c)), JSON.stringify(c)).toBeNull();
    for (const e of [
      { command: "router", args: { protocol: "rip", number: 1 } }, { command: "router", args: { protocol: "ospf", number: 70000 } }, { command: "network", args: { form: "static", address: "10.0.0.0" } },
      { command: "network", args: { form: "ospf", address: "10.0.0.0", wildcard: "0.0.0.3", area: -1 } }, { command: "access-list", args: { number: 10, action: "allow", source: "any" } },
      { command: "access-list", args: { number: 10, source: "192.168.1.0" } }, { command: "access-list", args: { number: 100, protocol: "gre", source: "any", destination: "any" } },
      { command: "access-list", args: { number: 100, port: 0 } }, { command: "ip-access-group", args: { number: 40, direction: "both" } }, { command: "ip-access-group", args: { number: 40, evil: "x" } }, { command: "show", args: { what: "ip-protocols" } },
    ]) expect(readCliExerciseConfig(step(e)), JSON.stringify(e)).toBeNull();
  });
  it("startMode router is not an initial state: an exercise that asks for it starts in global config (deterministic, reset-safe)", () => {
    const cfg = readCliExerciseConfig({ ...base, startMode: "router", goals: ospfTask.goals })!;
    const st = createInitialState(cfg);
    expect([st.mode, st.selectedRouter, st.routing]).toEqual(["global", undefined, {}]);
    expect(createInitialState(cfg)).toEqual(st);
  });
});
