// Final summary (m28) — the CLI simulator's final-reference extensions, only what the book prints on PDF 246 / 251 /
// 253: `switchport trunk native vlan <id>`, the minimal static route `ip route <network> <mask> <next-hop>` (incl.
// the default route) and the optional wildcard of the EIGRP `network <address> [<wildcard>]`. Pure engine tests:
// correct lines mutate deterministically; wrong-mode / malformed / hostile input never mutates; DHCP and OSPF do
// not regress; config validation round-trips through the runtime grammar.
import { describe, it, expect } from "vitest";
import { executeCommand, applyCommand } from "./engine";
import { parseCommand, COMMANDS, NAVIGATION_COMMANDS } from "./grammar";
import { isRouteMask, staticRouteText, eigrpNetworkText } from "./normalize";
import { createDeviceState, CLI_MODE_LABEL } from "./state";
import { createSession, submitCommand, conditionMet, CLI_FEEDBACK, type CliSession } from "./exercise";
import { readCliExerciseConfig } from "./config";
import type { CliDeviceState, CliExerciseConfig } from "./types";

const run = (state: CliDeviceState, ...lines: string[]) => lines.reduce((s, l) => executeCommand(s, l).state, state);
const out = (state: CliDeviceState, line: string) => (executeCommand(state, line).result as { output?: string[] }).output ?? [];
const last = (s: CliSession) => s.history[s.history.length - 1];
const GLOBAL = () => run(createDeviceState("router", "R1"), "enable", "configure terminal");
const SW_IF = () => run(createDeviceState("switch"), "enable", "configure terminal", "interface f0/24");

describe("final summary grammar — three additions, the table stays closed", () => {
  it("knows switchport-trunk-native-vlan and ip-route; the EIGRP network form takes an optional wildcard; nothing else was invented", () => {
    const ids = new Set<string>(COMMANDS.map(c => c.id));
    expect(ids.has("switchport-trunk-native-vlan")).toBe(true);
    expect(ids.has("ip-route")).toBe(true);
    expect(parseCommand("switchport trunk native vlan 99")).toEqual({ kind: "ok", command: { id: "switchport-trunk-native-vlan", vlanId: 99 } });
    expect(parseCommand("ip route 192.168.2.0 255.255.255.0 10.0.0.2")).toEqual({ kind: "ok", command: { id: "ip-route", network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" } });
    expect(parseCommand("IP ROUTE 0.0.0.0 0.0.0.0 10.0.0.2")).toEqual({ kind: "ok", command: { id: "ip-route", network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.2" } });
    expect(parseCommand("network 192.168.1.0 0.0.0.255")).toEqual({ kind: "ok", command: { id: "network", form: "eigrp", address: "192.168.1.0", wildcard: "0.0.0.255" } });
    expect(parseCommand("network 192.168.1.0")).toEqual({ kind: "ok", command: { id: "network", form: "eigrp", address: "192.168.1.0" } });
    expect(parseCommand("network 192.168.1.0 255.255.255.0")).toEqual({ kind: "ok", command: { id: "network", form: "dhcp", address: "192.168.1.0", mask: "255.255.255.0" } });
    expect(parseCommand("network 192.168.1.0 0.0.0.255 area 0")).toEqual({ kind: "ok", command: { id: "network", form: "ospf", address: "192.168.1.0", wildcard: "0.0.0.255", area: 0 } });
    // Not on the book's pages: exit-interface / distance / permanent / track variants, no-forms, restrict / protect, RIP, NAT, Windows commands.
    for (const u of ["ip route 192.168.2.0 255.255.255.0 g0/0", "no ip route 192.168.2.0 255.255.255.0 10.0.0.2", "ip route 192.168.2.0 255.255.255.0 10.0.0.2 5", "ip route 0.0.0.0 0.0.0.0 10.0.0.2 permanent", "ip route 0.0.0.0 0.0.0.0 10.0.0.2 track 1", "switchport port-security violation restrict", "switchport port-security violation protect", "switchport trunk native vlan tag", "router rip", "ip nat inside", "ping 8.8.8.8", "tracert 8.8.8.8", "ipconfig /all", "nslookup google.com", "arp -a"]) {
      const r = parseCommand(u);
      expect(r.kind === "unknown" || r.kind === "invalid", u).toBe(true);
    }
    expect(NAVIGATION_COMMANDS).not.toContain("ip-route");
    expect(NAVIGATION_COMMANDS).not.toContain("switchport-trunk-native-vlan");
  });
  it("static route: incomplete prefixes, bad network / mask / next-hop, extra tokens, a half default route and a network that does not match its mask are rejected", () => {
    expect(parseCommand("ip route")).toMatchObject({ kind: "incomplete", id: "ip-route" });
    expect(parseCommand("ip route 192.168.2.0")).toMatchObject({ kind: "incomplete", id: "ip-route" });
    expect(parseCommand("ip route 192.168.2.0 255.255.255.0")).toMatchObject({ kind: "incomplete", id: "ip-route" });
    expect(parseCommand("ip route 192.168.2 255.255.255.0 10.0.0.2")).toMatchObject({ kind: "invalid", id: "ip-route" });
    expect(parseCommand("ip route 192.168.2.0 255.255.0.255 10.0.0.2")).toMatchObject({ kind: "invalid", id: "ip-route" });   // non-contiguous mask
    expect(parseCommand("ip route 192.168.2.0 0.0.0.255 10.0.0.2")).toMatchObject({ kind: "invalid", id: "ip-route" });       // a wildcard is not a mask
    expect(parseCommand("ip route 192.168.2.0 255.255.255.0 10.0.0.256")).toMatchObject({ kind: "invalid", id: "ip-route" });
    expect(parseCommand("ip route 192.168.2.0 255.255.255.0 10.0.0.2 10.0.0.3")).toMatchObject({ kind: "invalid", id: "ip-route" });
    expect(parseCommand("ip route 0.0.0.0 255.255.255.0 10.0.0.2")).toMatchObject({ kind: "invalid", id: "ip-route" });
    expect(parseCommand("ip route 192.168.2.0 0.0.0.0 10.0.0.2")).toMatchObject({ kind: "invalid", id: "ip-route" });
    expect(parseCommand("ip route 192.168.2.5 255.255.255.0 10.0.0.2")).toMatchObject({ kind: "invalid", id: "ip-route" });   // 192.168.2.5 is a host, not the network
    expect(isRouteMask("0.0.0.0")).toBe(true);
    expect(isRouteMask("255.255.255.0")).toBe(true);
    expect(isRouteMask("0.0.0.255")).toBe(false);
    expect(staticRouteText({ network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" })).toBe("192.168.2.0 255.255.255.0 10.0.0.2");
    expect(eigrpNetworkText("10.0.0.0")).toBe("10.0.0.0");
    expect(eigrpNetworkText("192.168.1.0", "0.0.0.255")).toBe("192.168.1.0 0.0.0.255");
  });
  it("native VLAN: id outside 1–4094, non-numeric or extra tokens are rejected; the allowed-vlan list is untouched by the new entry", () => {
    for (const bad of ["switchport trunk native vlan 0", "switchport trunk native vlan 4095", "switchport trunk native vlan abc", "switchport trunk native vlan 99 100"]) expect(parseCommand(bad), bad).toMatchObject({ kind: "invalid", id: "switchport-trunk-native-vlan" });
    expect(parseCommand("switchport trunk native vlan")).toMatchObject({ kind: "incomplete", id: "switchport-trunk-native-vlan" });
    expect(parseCommand("switchport trunk allowed vlan 10,20,30")).toEqual({ kind: "ok", command: { id: "switchport-trunk-allowed-vlan", vlans: [10, 20, 30] } });
    expect(parseCommand("switchport trunk")).toMatchObject({ kind: "incomplete" });
  });
});

describe("static route — PDF 251", () => {
  it("the book's line mutates the state in global config; wrong mode, malformed mask / next-hop and unknown variants leave the SAME object", () => {
    const g = GLOBAL();
    const s = run(g, "ip route 192.168.2.0 255.255.255.0 10.0.0.2");
    expect(s.staticRoutes).toEqual([{ network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" }]);
    expect(g.staticRoutes).toEqual([]);   // input untouched
    for (const bad of ["ip route 192.168.2.0 255.255.0.255 10.0.0.2", "ip route 192.168.2.0 255.255.255.0 10.0.0", "ip route 192.168.2.0 255.255.255.0 g0/0", "ip route 192.168.2.0 255.255.255.0 10.0.0.2 5", "ip route 192.168.2.0"]) {
      const r = executeCommand(s, bad);
      expect(r.state, bad).toBe(s);
      expect(["invalid", "incomplete", "unknown"], bad).toContain(r.result.status);
    }
    for (const state of [createDeviceState("router"), run(createDeviceState("router"), "enable"), run(g, "interface g0/0"), run(g, "router ospf 1"), run(g, "line vty 0 4")]) {
      const r = executeCommand(state, "ip route 192.168.2.0 255.255.255.0 10.0.0.2");
      expect(r.state).toBe(state);
      expect(r.result).toMatchObject({ status: "wrong-mode", requiredModes: ["global"] });
    }
  });
  it("routes accumulate in authored order without duplicates; the default route is stored as 0.0.0.0 0.0.0.0; a second next-hop for the same network is a distinct route", () => {
    const s = run(GLOBAL(), "ip route 192.168.2.0 255.255.255.0 10.0.0.2", "ip route 192.168.2.0 255.255.255.0 10.0.0.2", "ip route 0.0.0.0 0.0.0.0 10.0.0.2", "ip route 0.0.0.0 0.0.0.0 10.0.0.2", "ip route 192.168.2.0 255.255.255.0 10.0.0.6");
    expect(s.staticRoutes.map(staticRouteText)).toEqual(["192.168.2.0 255.255.255.0 10.0.0.2", "0.0.0.0 0.0.0.0 10.0.0.2", "192.168.2.0 255.255.255.0 10.0.0.6"]);
    const again = executeCommand(s, "ip route 0.0.0.0 0.0.0.0 10.0.0.2");
    expect(again.state).toBe(s);
    expect(again.result.status).toBe("ok");
  });
  it("show running-config prints the static routes deterministically between the interfaces and the routing processes; show ip route lists them as S / S* with the gateway of last resort; neither changes state", () => {
    const s = run(GLOBAL(), "interface g0/0", "ip address 10.0.0.1 255.255.255.252", "no shutdown", "exit", "ip route 192.168.2.0 255.255.255.0 10.0.0.2", "ip route 0.0.0.0 0.0.0.0 10.0.0.2", "router eigrp 100", "network 10.0.0.0", "end");
    const cfg = out(s, "show running-config");
    const at = (line: string) => cfg.indexOf(line);
    expect(at("ip route 192.168.2.0 255.255.255.0 10.0.0.2")).toBeGreaterThan(at(" no shutdown"));
    expect(at("ip route 0.0.0.0 0.0.0.0 10.0.0.2")).toBe(at("ip route 192.168.2.0 255.255.255.0 10.0.0.2") + 1);
    expect(at("router eigrp 100")).toBeGreaterThan(at("ip route 0.0.0.0 0.0.0.0 10.0.0.2"));
    expect(out(s, "show running-config")).toEqual(cfg);
    const route = out(s, "show ip route");
    expect(route).toEqual([
      "Codes: C - connected, S - static, R - RIP, O - OSPF, D - EIGRP", "",
      "Gateway of last resort is 10.0.0.2 to network 0.0.0.0", "",
      "C    10.0.0.0/30 is directly connected, GigabitEthernet0/0",
      "S    192.168.2.0/24 [1/0] via 10.0.0.2",
      "S*   0.0.0.0/0 [1/0] via 10.0.0.2",
      "% (simulation) routes learned via EIGRP appear only after neighbours exchange updates",
    ]);
    expect(executeCommand(s, "show ip route").state).toBe(s);
    // A static route alone (no addressed interface) is enough to replace the «no connected networks» hint; without any route the Batch 10 output is unchanged.
    expect(out(run(GLOBAL(), "ip route 192.168.2.0 255.255.255.0 10.0.0.2", "end"), "show ip route")).toEqual(["Codes: C - connected, S - static, R - RIP, O - OSPF, D - EIGRP", "", "S    192.168.2.0/24 [1/0] via 10.0.0.2"]);
    expect(out(run(GLOBAL(), "end"), "show ip route")).toEqual(["Codes: C - connected, S - static, R - RIP, O - OSPF, D - EIGRP", "", "(no connected networks yet: give an interface an address and no shutdown)"]);
    expect(out(run(GLOBAL(), "end"), "show running-config")).not.toContain("ip route");
  });
  it("exercise integration: a static-route goal / entry expectation completes on the book's line, the allowed gate refuses ip-route when unlisted, and conditions read canonical texts", () => {
    const task: CliExerciseConfig = { kind: "task", device: "router", hostname: "Router", intro: "x", goals: [{ id: "g", label: "l", condition: { kind: "static-route", prop: "route", value: "192.168.2.0 255.255.255.0 10.0.0.2" } }, { id: "n", label: "n", condition: { kind: "static-route", prop: "count", value: 1 } }], hints: ["h1", "h2"] };
    expect(readCliExerciseConfig(task)).toEqual(task);
    let s = createSession(task);
    for (const l of ["enable", "configure terminal", "ip route 192.168.2.0 255.255.255.0 10.0.0.6"]) s = submitCommand(task, s, l);
    expect(s.completed).toBe(false);
    s = submitCommand(task, s, "ip route 192.168.2.0 255.255.255.0 10.0.0.2");
    expect(s.completed).toBe(false);   // count is 2 now → the count goal fails
    let t = createSession(task);
    for (const l of ["enable", "configure terminal", "ip route 192.168.2.0 255.255.255.0 10.0.0.2"]) t = submitCommand(task, t, l);
    expect([t.completed, last(t).feedback]).toEqual([true, CLI_FEEDBACK.taskCompleted]);
    expect(conditionMet(t.state, { kind: "static-route", prop: "route", value: "0.0.0.0 0.0.0.0 10.0.0.2" })).toBe(false);
    const wm = submitCommand(task, createSession(task), "ip route 192.168.2.0 255.255.255.0 10.0.0.2");
    expect(last(wm).feedback).toBe(CLI_FEEDBACK.wrongMode(CLI_MODE_LABEL.global));
    const gated: CliExerciseConfig = { kind: "challenge", device: "router", steps: [{ id: "s", instruction: "i", expect: { command: "hostname", args: { name: "R1" } } }], allowed: ["hostname"] };
    let gs = createSession(gated);
    for (const l of ["enable", "conf t", "ip route 192.168.2.0 255.255.255.0 10.0.0.2"]) gs = submitCommand(gated, gs, l);
    expect([last(gs).status, gs.state.staticRoutes]).toEqual(["not-required", []]);
    const guided: CliExerciseConfig = { kind: "guided", device: "router", startMode: "global", steps: [{ id: "s", instruction: "i", expect: { command: "ip-route", args: { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.2" } } }] };
    expect(readCliExerciseConfig(guided)).toEqual({ ...guided, steps: [{ ...guided.steps![0], hints: [] }] });
    const g1 = submitCommand(guided, createSession(guided), "ip route 0.0.0.0 0.0.0.0 10.0.0.2");
    expect([g1.completed, last(g1).feedback]).toEqual([true, CLI_FEEDBACK.guidedStep]);
  });
});

describe("EIGRP optional wildcard — PDF 253; DHCP and OSPF do not regress", () => {
  it("both EIGRP forms are accepted under router eigrp and stored as canonical texts, de-duplicated; the selected process is authoritative", () => {
    const e = run(GLOBAL(), "router eigrp 100", "network 192.168.1.0 0.0.0.255", "network 192.168.1.0 0.0.0.255", "network 10.0.0.0", "network 10.0.0.0");
    expect(e.routing.eigrp).toEqual({ id: 100, networks: ["192.168.1.0 0.0.0.255", "10.0.0.0"] });
    expect(out(run(e, "end"), "show running-config")).toContain(" network 192.168.1.0 0.0.0.255");
    const dup = executeCommand(e, "network 192.168.1.0 0.0.0.255");
    expect(dup.state).toBe(e);
    expect(dup.result.status).toBe("ok");
    // OSPF selected: the EIGRP forms (with or without wildcard) are «incomplete — area missing», state untouched.
    const o = run(GLOBAL(), "router ospf 1");
    for (const l of ["network 192.168.1.0 0.0.0.255", "network 192.168.1.0"]) {
      const r = executeCommand(o, l);
      expect(r.state, l).toBe(o);
      expect(r.result, l).toEqual({ status: "incomplete", id: "network", detail: "في OSPF المطلوب: network <address> <wildcard> area <n>" });
    }
    expect(run(o, "network 192.168.1.0 0.0.0.255 area 0").routing.ospf).toEqual({ id: 1, networks: [{ address: "192.168.1.0", wildcard: "0.0.0.255", area: 0 }] });
    // EIGRP selected: the OSPF form is refused with the corrected syntax; a subnet mask is not a wildcard (the DHCP form → wrong mode).
    const inE = run(GLOBAL(), "router eigrp 100");
    const area = executeCommand(inE, "network 192.168.1.0 0.0.0.255 area 0");
    expect([area.state === inE, area.result]).toEqual([true, { status: "invalid", id: "network", detail: "في EIGRP لا نكتب area؛ الصيغة: network <address> [<wildcard>]" }]);
    const mask = executeCommand(inE, "network 192.168.1.0 255.255.255.0");
    expect([mask.state === inE, mask.result.status]).toEqual([true, "wrong-mode"]);
    // applyCommand guards: the wildcard form never reaches a state whose selected process is not EIGRP.
    expect(applyCommand(o, { id: "network", form: "eigrp", address: "10.0.0.0", wildcard: "0.0.0.255" }).state).toBe(o);
    expect(applyCommand(run(GLOBAL(), "router eigrp 100", "exit"), { id: "network", form: "eigrp", address: "10.0.0.0", wildcard: "0.0.0.255" }).state.routing.eigrp!.networks).toEqual([]);
  });
  it("DHCP pool: the mask form still configures the pool; a wildcard after the address is still «قناع الشبكة غير صالح» and never an EIGRP statement", () => {
    const pool = run(GLOBAL(), "ip dhcp pool STUDENTS");
    expect(run(pool, "network 192.168.10.0 255.255.255.0").dhcpPools.STUDENTS).toEqual({ network: "192.168.10.0", mask: "255.255.255.0", dnsServers: [] });
    const wc = executeCommand(pool, "network 192.168.10.0 0.0.0.255");
    expect(wc.state).toBe(pool);
    expect(wc.result).toEqual({ status: "invalid", id: "network", detail: "قناع الشبكة غير صالح: 0.0.0.255" });
    expect(wc.state.routing).toEqual({});
    const bare = executeCommand(pool, "network 192.168.10.0");
    expect([bare.state === pool, bare.result.status]).toEqual([true, "wrong-mode"]);
    // Interface / global mode: any network form is wrong-mode, state untouched (Batch 8 / 10 behaviour).
    const g = GLOBAL();
    for (const l of ["network 10.0.0.0 255.0.0.0", "network 10.0.0.0 0.0.0.255", "network 10.0.0.0 0.0.0.255 area 0", "network 10.0.0.0"]) {
      const r = executeCommand(g, l);
      expect(r.state, l).toBe(g);
      expect(r.result.status, l).toBe("wrong-mode");
    }
  });
  it("conditions and config validation: an EIGRP network condition accepts «<address>» and «<address> <wildcard>» and rejects masks / OSPF texts; a wildcard expectation arg works for the EIGRP form", () => {
    const e = run(GLOBAL(), "router eigrp 100", "network 192.168.1.0 0.0.0.255", "network 10.0.0.0");
    expect(conditionMet(e, { kind: "routing", protocol: "eigrp", prop: "network", value: "192.168.1.0 0.0.0.255" })).toBe(true);
    expect(conditionMet(e, { kind: "routing", protocol: "eigrp", prop: "network", value: "192.168.1.0" })).toBe(false);   // the wildcard statement is a different text
    expect(conditionMet(e, { kind: "routing", protocol: "eigrp", prop: "network", value: "10.0.0.0" })).toBe(true);
    const base = { kind: "task", device: "router" } as const;
    const goal = (condition: unknown) => ({ ...base, goals: [{ id: "g", label: "l", condition }] });
    for (const ok of ["10.0.0.0", "192.168.1.0 0.0.0.255"]) expect(readCliExerciseConfig(goal({ kind: "routing", protocol: "eigrp", prop: "network", value: ok })), ok).not.toBeNull();
    for (const bad of ["192.168.1.0 255.255.255.0", "192.168.1.0 0.0.0.255 area 0", "192.168.1.0  0.0.0.255", "192.168.1", ""]) expect(readCliExerciseConfig(goal({ kind: "routing", protocol: "eigrp", prop: "network", value: bad })), bad).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "routing", protocol: "ospf", prop: "network", value: "192.168.1.0 0.0.0.255" }))).toBeNull();   // OSPF still needs area
    const step = (expect_: unknown) => ({ kind: "guided", device: "router", steps: [{ id: "s", instruction: "i", expect: expect_ }] });
    expect(readCliExerciseConfig(step({ command: "network", args: { form: "eigrp", address: "192.168.1.0", wildcard: "0.0.0.255" } }))).not.toBeNull();
    expect(readCliExerciseConfig(step({ command: "network", args: { form: "eigrp", address: "192.168.1.0", wildcard: "0.0.0.256" } }))).toBeNull();
  });
});

describe("native VLAN — PDF 246", () => {
  it("sets the interface's native VLAN in interface mode; invalid ids and wrong modes leave the SAME object; allowed vlan is undisturbed; running-config prints the line", () => {
    const i = SW_IF();
    const s = run(i, "switchport mode trunk", "switchport trunk allowed vlan 10,20", "switchport trunk native vlan 99");
    expect(s.interfaces["f0/24"]).toEqual({ shutdown: false, switchportMode: "trunk", allowedVlans: [10, 20], nativeVlan: 99 });
    expect(i.interfaces["f0/24"].nativeVlan).toBeUndefined();
    expect(run(s, "switchport trunk native vlan 1").interfaces["f0/24"].nativeVlan).toBe(1);   // deterministic: the last value wins
    expect(run(s, "switchport trunk allowed vlan 30").interfaces["f0/24"]).toEqual({ shutdown: false, switchportMode: "trunk", allowedVlans: [30], nativeVlan: 99 });
    for (const bad of ["switchport trunk native vlan 0", "switchport trunk native vlan 4095", "switchport trunk native vlan x", "switchport trunk native vlan"]) {
      const r = executeCommand(s, bad);
      expect(r.state, bad).toBe(s);
      expect(["invalid", "incomplete"], bad).toContain(r.result.status);
    }
    for (const state of [run(createDeviceState("switch"), "enable", "conf t"), run(createDeviceState("router"), "enable", "conf t", "interface g0/0.10"), run(createDeviceState("switch"), "enable", "conf t", "vlan 99")]) {
      const r = executeCommand(state, "switchport trunk native vlan 99");
      expect(r.state).toBe(state);
      expect(r.result).toMatchObject({ status: "wrong-mode", requiredModes: ["interface"] });
    }
    const cfg = out(run(s, "end"), "show running-config");
    expect(cfg.indexOf(" switchport trunk native vlan 99")).toBe(cfg.indexOf(" switchport trunk allowed vlan 10,20") + 1);
    expect(out(run(i, "end"), "show running-config")).not.toContain(" switchport trunk native vlan 99");
    // A range sets every selected port.
    const range = run(createDeviceState("switch"), "enable", "conf t", "interface range f0/1-3", "switchport trunk native vlan 99");
    expect(["f0/1", "f0/2", "f0/3"].map(n => range.interfaces[n].nativeVlan)).toEqual([99, 99, 99]);
  });
  it("conditions, goals and expectations: nativeVlan is a validated interface prop (1–4094), and the book's trunk box completes as a task", () => {
    const task: CliExerciseConfig = { kind: "task", device: "switch", goals: [
      { id: "t", label: "trunk", condition: { kind: "interface", name: "f0/24", prop: "switchportMode", value: "trunk" } },
      { id: "n", label: "native", condition: { kind: "interface", name: "f0/24", prop: "nativeVlan", value: 99 } },
    ], hints: [] };
    expect(readCliExerciseConfig(task)).toEqual(task);
    let s = createSession(task);
    for (const l of ["enable", "conf t", "int f0/24", "switchport mode trunk", "switchport trunk native vlan 10"]) s = submitCommand(task, s, l);
    expect(s.completed).toBe(false);
    s = submitCommand(task, s, "switchport trunk native vlan 99");
    expect([s.completed, last(s).feedback]).toEqual([true, CLI_FEEDBACK.taskCompleted]);
    const goal = (condition: unknown) => ({ kind: "task", device: "switch", goals: [{ id: "g", label: "l", condition }] });
    for (const bad of [0, 4095, "99", 1.5]) expect(readCliExerciseConfig(goal({ kind: "interface", name: "f0/24", prop: "nativeVlan", value: bad })), String(bad)).toBeNull();
    const step = (expect_: unknown) => ({ kind: "guided", device: "switch", steps: [{ id: "s", instruction: "i", expect: expect_ }] });
    expect(readCliExerciseConfig(step({ command: "switchport-trunk-native-vlan", args: { vlanId: 99 } }))).not.toBeNull();
    expect(readCliExerciseConfig(step({ command: "switchport-trunk-native-vlan", args: { vlanId: 4095 } }))).toBeNull();
  });
});

describe("config validation — static route texts and the per-command mask rule", () => {
  it("a static-route condition accepts only texts the runtime re-prints identically; a default-route mask is valid for ip-route expectations only", () => {
    const goal = (condition: unknown) => ({ kind: "task", device: "router", goals: [{ id: "g", label: "l", condition }] });
    for (const ok of ["192.168.2.0 255.255.255.0 10.0.0.2", "0.0.0.0 0.0.0.0 10.0.0.2"]) expect(readCliExerciseConfig(goal({ kind: "static-route", prop: "route", value: ok })), ok).not.toBeNull();
    for (const bad of ["192.168.2.0 255.255.255.0", "192.168.2.0 0.0.0.255 10.0.0.2", "192.168.2.5 255.255.255.0 10.0.0.2", "0.0.0.0 255.255.255.0 10.0.0.2", "192.168.2.0 255.255.255.0 g0/0", "192.168.2.0  255.255.255.0 10.0.0.2", "", 42]) expect(readCliExerciseConfig(goal({ kind: "static-route", prop: "route", value: bad })), String(bad)).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "static-route", prop: "count", value: 0 }))).not.toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "static-route", prop: "count", value: -1 }))).toBeNull();
    expect(readCliExerciseConfig(goal({ kind: "static-route", prop: "entry", value: "192.168.2.0 255.255.255.0 10.0.0.2" }))).toBeNull();
    const step = (expect_: unknown) => ({ kind: "guided", device: "router", steps: [{ id: "s", instruction: "i", expect: expect_ }] });
    expect(readCliExerciseConfig(step({ command: "ip-route", args: { network: "0.0.0.0", mask: "0.0.0.0", nextHop: "10.0.0.2" } }))).not.toBeNull();
    expect(readCliExerciseConfig(step({ command: "ip-route", args: { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" } }))).not.toBeNull();
    expect(readCliExerciseConfig(step({ command: "ip-route", args: { mask: "0.0.0.255" } }))).toBeNull();
    expect(readCliExerciseConfig(step({ command: "ip-route", args: { nextHop: "g0/0" } }))).toBeNull();
    expect(readCliExerciseConfig(step({ command: "ip-address", args: { address: "10.0.0.1", mask: "0.0.0.0" } }))).toBeNull();   // 0.0.0.0 is never an interface mask
    expect(readCliExerciseConfig(step({ command: "ip-address", args: { address: "10.0.0.1", mask: "255.255.255.0" } }))).not.toBeNull();
  });
  it("hostile / shell-like input around the new commands never throws and never mutates", () => {
    const g = GLOBAL();
    for (const weird of ["ip route $(reboot) 0.0.0.0 10.0.0.2", "ip route 0.0.0.0 0.0.0.0 10.0.0.2; rm -rf /", "switchport trunk native vlan ${99}", "network 192.168.1.0 0.0.0.255 && exit", "ip route 999.0.0.0 255.0.0.0 1.1.1.1", "ip route 10.0.0.0 255.0.0.0 1.1.1.1 extra", null, 7, {}]) {
      const r = executeCommand(g, weird as unknown as string);
      expect(r.state).toBe(g);
      expect(r.result.status).not.toBe("ok");
    }
  });
});
