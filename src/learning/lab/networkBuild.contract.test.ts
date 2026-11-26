// «ابنِ الشبكة» (docs/enterprise-network-build-exercises.md) — the CONTRACT of a build-the-network exercise (`simulation` / `network-build`
// v1) between the authored content, the served body, the check index and the real judge:
//   • the validator rejects a malformed exercise; the judge (the SAME source the API runs) proves every authored one: the empty network
//     earns no goal, the authored solution reaches every goal, and a broken key is «unavailable», never a «wrong»;
//   • the served body keeps ONLY the task (+ serverCheck) — never a check, a feedback text or the solution;
//   • the judge reads only the network the learner sent: kinds the task does not offer, an invalid network or actions that do not replay
//     are wrong (with the reason), a missing device fails only its own goals, and the verdict holds booleans only.
import { describe, it, expect } from "vitest";
import { validateLearningCourseContent } from "../content/validation";
import { cloneCourse } from "../content/content.fixtures";
import type { ContentBlock, ContentModule, NetworkBuildConfig, SimulationBlock } from "../content/types";
import { checkActivityOf, servedBlock } from "../study/checkIndex";
import { networkBuildKey, studyActivityOf, type StudyActivityKey } from "../study/eligibility";
import { judgeNetworkBuild } from "./networkBuildJudge";
import { COURSE_CONTENT_MODULE_IDS, registeredCourseIds } from "../content/registry";
import { loadBundledModuleContent } from "../content/bundledModules";
import { readNetworkBuildView } from "./labConfig";

async function allBuilds(): Promise<SimulationBlock[]> {
  const out: SimulationBlock[] = [];
  for (const course of registeredCourseIds()) for (const id of COURSE_CONTENT_MODULE_IDS[course] ?? []) {
    const m: ContentModule = await loadBundledModuleContent(course, id);
    for (const p of m.lessons.flatMap(l => l.pages)) for (const b of p.blocks) if (b.type === "simulation" && b.simulationType === "network-build") out.push(b);
  }
  return out;
}
const cfg = (b: SimulationBlock) => b.config as unknown as NetworkBuildConfig;
const keyOf = (b: SimulationBlock) => networkBuildKey(b) as Extract<StudyActivityKey, { kind: "network-build" }>;
const answer = (config: unknown, actions: unknown[] = []) => ({ kind: "network-build", config, actions });
const EMPTY = { v: 2, devices: [], links: [] };

describe("every authored «ابنِ الشبكة» exercise is valid and proven by the real judge", () => {
  it("book 791381 has the seven exercises of m29 and the booklet 791381s the seven of m37, all checked on the server and all study activities (owner decision 2026-11-26: the 29th study module)", async () => {
    const builds = await allBuilds();
    expect(builds.map(b => b.id)).toEqual(["m29-l01-p01-build-lan", "m29-l01-p02-build-vlan", "m29-l02-p01-build-router", "m29-l02-p02-build-roas", "m29-l03-p01-build-dhcp", "m29-l03-p02-build-wifi", "m29-l03-p03-build-web",
      // 791381 m30 (owner decision 2026-11-26): eight LAB-mode exercises (WAN, routing, ACL, NAT, IPv6)
      "m30-l01-p01-build-static", "m30-l01-p02-build-rip", "m30-l01-p03-build-ospf", "m30-l01-p04-build-eigrp", "m30-l02-p01-build-acl-standard", "m30-l02-p02-build-acl-extended", "m30-l03-p01-build-pat", "m30-l03-p02-build-ipv6",
      // 791381s m37 (owner decision 2026-11-26): seven more, a step deeper
      "m37-l01-p01-build-trunk", "m37-l01-p02-build-native", "m37-l01-p03-build-vtp", "m37-l02-p01-build-portsec", "m37-l02-p02-build-passwords", "m37-l03-p01-build-dhcp-server", "m37-l03-p02-build-dmz"]);
    for (const b of builds) { expect(studyActivityOf(b), b.id).not.toBeNull(); expect(checkActivityOf(b)?.study, b.id).toBe(true); }
  });
  it("the empty network reaches no goal; the authored solution reaches every goal", async () => {
    for (const b of await allBuilds()) {
      const key = keyOf(b);
      const none = judgeNetworkBuild(key, answer(EMPTY));
      expect(none.status, b.id).toBe("judged");
      if (none.status === "judged") { expect(none.correct, b.id).toBe(false); expect(Object.entries(none.parts).filter(([, v]) => v).map(([k]) => k), b.id).toEqual([]); }
      const sol = cfg(b).solution!;
      const solved = judgeNetworkBuild(key, answer(sol.config, sol.actions));
      expect(solved.status === "judged" && solved.correct, b.id + " " + JSON.stringify(solved)).toBe(true);
      // the solution's network with no configuration: only the build goals can be reached — never the whole exercise
      const bare = judgeNetworkBuild(key, answer(sol.config));
      expect(bare.status === "judged" && bare.correct, b.id).toBe(false);
      // the task the builder shows offers every kind the solution uses
      const view = readNetworkBuildView(servedBlock(b).type === "simulation" ? (servedBlock(b) as SimulationBlock).config : null)!;
      for (const d of (sol.config as { devices: { kind: string }[] }).devices) expect(view.kinds, b.id).toContain(d.kind);
    }
  });
  it("the served body keeps only the task; the check index keeps the key and the feedback", async () => {
    for (const b of await allBuilds()) {
      const s = servedBlock(b) as SimulationBlock;
      expect(Object.keys(s.config!)).toEqual(["task"]);
      expect(s.serverCheck).toBe(true);
      expect(JSON.stringify(s)).not.toMatch(/"checks"|"solution"|hints|explanation|correctFeedback/);
      expect(networkBuildKey(s)).toBeNull();                       // a served body cannot be judged: the key stayed on the server
      const c = checkActivityOf(b)!;
      expect(c.key.kind).toBe("network-build");
      expect(c.feedback.hints?.length).toBeGreaterThan(0);
    }
  });
});

describe("the judge", () => {
  const lan = async () => (await allBuilds()).find(b => b.id === "m29-l01-p01-build-lan")!;
  it("judges per goal, booleans only; a missing device fails only its own goals", async () => {
    const b = await lan(), sol = cfg(b).solution!;
    const two = { ...sol.config, devices: (sol.config.devices as { id: string }[]).filter(d => d.id !== "pc3"), links: (sol.config.links as { b: { deviceId: string } }[]).filter(l => l.b.deviceId !== "pc3") };
    const r = judgeNetworkBuild(keyOf(b), answer(two, sol.actions.filter(a => a.deviceId !== "pc3")));
    expect(r).toEqual({ status: "judged", correct: false, parts: { sw: true, pcs: false, l1: true, l2: true, l3: false, a1: true, r2: true, r3: false } });
  });
  it("refuses kinds the task does not offer, an invalid network and actions that do not replay — each a «wrong» with its reason", async () => {
    const b = await lan(), sol = cfg(b).solution!;
    const withRouter = { ...sol.config, devices: [...(sol.config.devices as object[]), { id: "r1", kind: "router", label: "R1", x: 0.5, y: 0.1 }] };
    expect(judgeNetworkBuild(keyOf(b), answer(withRouter, sol.actions))).toMatchObject({ status: "judged", correct: false, issue: { code: "KIND_NOT_ALLOWED" } });
    const hub = { ...sol.config, devices: [...(sol.config.devices as object[]), { id: "hub1", kind: "hub", label: "HUB1", x: 0.5, y: 0.5 }] };
    expect(judgeNetworkBuild(keyOf(b), answer(hub, sol.actions))).toMatchObject({ status: "judged", correct: false, issue: { code: "NETWORK_INVALID" } });
    const r = judgeNetworkBuild(keyOf(b), answer(sol.config, [...sol.actions, { type: "host.setStatic", deviceId: "pc9", adapter: "eth0", address: "1.1.1.1", mask: "255.0.0.0", gateway: "", dns: "" }]));
    expect(r).toMatchObject({ status: "judged", correct: false, issue: { code: "ACTIONS_INVALID" } });
    expect(judgeNetworkBuild(keyOf(b), { kind: "network-build" })).toEqual({ status: "judged", correct: false, parts: {} });
    // any client claim beside the network is ignored
    expect(judgeNetworkBuild(keyOf(b), { ...answer(EMPTY), correct: true, parts: { sw: true } })).toMatchObject({ correct: false });
  });
  it("a key that cannot be trusted is unavailable, never a wrong", async () => {
    const b = await lan(), key = keyOf(b), sol = cfg(b).solution!;
    const broken = [
      { ...key, checks: [] },
      { ...key, rules: { kinds: ["hub"] } },
      { ...key, reference: { v: 2, devices: "x", links: [] } },
      { ...key, checks: [...key.checks, { id: "x", label: "x", weight: 1, kind: "host.address", deviceId: "pc7", adapter: "eth0", value: "1.1.1.1" }] },   // not valid on the reference
      { ...key, checks: [...key.checks, { id: "y", kind: "build.count", deviceKind: "pc", min: 0 }] },
      { ...key, checks: [...key.checks, { ...key.checks[0] }] },                                                                                            // a duplicate id
    ];
    for (const k of broken) expect(judgeNetworkBuild(k, answer(sol.config, sol.actions))).toEqual({ status: "unavailable" });
  });
});

describe("the validator", () => {
  const block = (config: Record<string, unknown>, over: Partial<SimulationBlock> = {}): SimulationBlock => ({ id: "nb-1", type: "simulation", origin: "teacher-enrichment", simulationType: "network-build", version: 1, title: "ابنِ", config, ...over });
  const good = { task: { intro: "ابنِ", goals: [{ id: "g", label: "سويتش" }], kinds: ["switch"] }, checks: [{ id: "g", kind: "build.device", deviceId: "sw1", deviceKind: "switch" }], solution: { config: { v: 2, devices: [{ id: "sw1", kind: "switch", label: "SW1", x: 0.5, y: 0.5 }], links: [] }, actions: [] } };
  const codes = (b: ContentBlock) => {
    const c = cloneCourse();
    c.modules[0].lessons[0].pages[0].blocks = [b];
    return validateLearningCourseContent(c).filter(i => i.code === "invalid-network-build").map(i => i.message);
  };
  it("accepts a well-formed exercise and rejects a malformed one", () => {
    expect(codes(block(good))).toEqual([]);
    expect(codes(block(good, { version: 2 }))).not.toEqual([]);
    expect(codes(block({ ...good, task: { ...good.task, kinds: ["hub"] } }))).not.toEqual([]);
    expect(codes(block({ ...good, task: { ...good.task, goals: [{ id: "other", label: "x" }] } }))).not.toEqual([]);
    expect(codes(block({ ...good, solution: [] }))).not.toEqual([]);
    expect(codes(block({ ...good, topology: {} }))).not.toEqual([]);
    expect(codes(block(good, { serverCheck: true } as Partial<SimulationBlock>))).not.toEqual([]);
    // LAB mode: `task.lab` is true or absent; the hub is offered only in a lab exercise
    expect(codes(block({ ...good, task: { ...good.task, lab: true, kinds: ["switch", "hub"] } }))).toEqual([]);
    expect(codes(block({ ...good, task: { ...good.task, kinds: ["switch", "hub"] } }))).not.toEqual([]);
    expect(codes(block({ ...good, task: { ...good.task, lab: "yes" } }))).not.toEqual([]);
  });
});

describe("LAB mode (791381 m30): the server judges what the lab network really does", () => {
  const byId = async (id: string) => (await allBuilds()).find(b => b.id === id)!;
  const sol = (b: SimulationBlock) => cfg(b).solution!;
  const withoutLines = (b: SimulationBlock, drop: RegExp) => sol(b).actions.filter(a => !(typeof a.command === "string" && drop.test(a.command)));
  it("a route must be learned the way the task asks: the static solution fails the RIP goals (R), but its ping passes", async () => {
    const rip = await byId("m30-l01-p02-build-rip"), stat = await byId("m30-l01-p01-build-static");
    const r = judgeNetworkBuild(keyOf(rip), answer(sol(stat).config, sol(stat).actions));
    expect(r).toMatchObject({ status: "judged", correct: false, parts: { wan: true, r1: false, r2: false, ping: true } });
  });
  it("routing missing on one router: the far network is not learned and the ping (its reply) fails", async () => {
    const ospf = await byId("m30-l01-p03-build-ospf");
    const actions = sol(ospf).actions.filter(a => !(a.deviceId === "r2" && typeof a.command === "string" && /^(router ospf|network )/.test(a.command)));
    expect(judgeNetworkBuild(keyOf(ospf), answer(sol(ospf).config, actions))).toMatchObject({ correct: false, parts: { r1: false, r2: false, ping: false } });
  });
  it("an ACL is judged by the traffic: no ACL → PC2 gets through (wrong); deny everything → the web is blocked too (wrong)", async () => {
    const std = await byId("m30-l02-p01-build-acl-standard"), ext = await byId("m30-l02-p02-build-acl-extended");
    expect(judgeNetworkBuild(keyOf(std), answer(sol(std).config, withoutLines(std, /access-/)))).toMatchObject({ correct: false, parts: { pc1: true, pc2: false, gw2: true } });
    const denyAll = withoutLines(ext, /permit ip any any/);
    expect(judgeNetworkBuild(keyOf(ext), answer(sol(ext).config, denyAll))).toMatchObject({ correct: false, parts: { noping: true, web1: false, web2: false } });
  });
  it("without PAT the ISP cannot answer the private addresses: the pings fail; the default route alone is not enough", async () => {
    const pat = await byId("m30-l03-p01-build-pat");
    expect(judgeNetworkBuild(keyOf(pat), answer(sol(pat).config, withoutLines(pat, /nat/)))).toMatchObject({ correct: false, parts: { wan: true, default: true, pc1: false, pc2: false } });
  });
  it("IPv6 without ipv6 unicast-routing: the router does not forward, so PC1 does not reach PC2", async () => {
    const v6 = await byId("m30-l03-p02-build-ipv6");
    expect(judgeNetworkBuild(keyOf(v6), answer(sol(v6).config, withoutLines(v6, /unicast-routing/)))).toMatchObject({ correct: false, parts: { ping6: false } });
  });
  it("the key is verified: lab checks need lab mode, name devices of the right kind and well-formed values; the hub only in lab mode", async () => {
    const stat = await byId("m30-l01-p01-build-static"), lan = await byId("m29-l01-p01-build-lan");
    const k = keyOf(stat), good = sol(stat);
    const broken = [
      { ...k, rules: { kinds: k.rules.kinds } },                                                                                     // lab checks without lab mode
      { ...k, checks: [...k.checks, { id: "x", kind: "lab.reach", source: "r1", destination: "1.1.1.1", value: true }] },           // the source is not a host
      { ...k, checks: [...k.checks, { id: "y", kind: "lab.route", deviceId: "r1", network: "192.168.2.0/40", code: "S" }] },          // no such prefix
      { ...k, checks: [...k.checks, { id: "z", kind: "lab.reach", source: "pc1", destination: "999.1.1.1", value: true }] },        // not an address
      { ...k, rules: { kinds: ["router", "pc", "hub"], lab: "yes" } },
    ];
    for (const b of broken) expect(judgeNetworkBuild(b, answer(good.config, good.actions))).toEqual({ status: "unavailable" });
    expect(judgeNetworkBuild({ ...keyOf(lan), rules: { kinds: ["switch", "pc", "hub"] } }, answer(EMPTY))).toEqual({ status: "unavailable" });
    // a learner's lab network with a kind the task does not offer, or an invalid lab network
    const hub = { ...good.config, devices: [...(good.config.devices as object[]), { id: "hub1", kind: "hub", label: "HUB1", x: 0.5, y: 0.5 }] };
    expect(judgeNetworkBuild(k, answer(hub, good.actions))).toMatchObject({ correct: false, issue: { code: "KIND_NOT_ALLOWED" } });
    expect(judgeNetworkBuild(k, answer({ v: 3 }, []))).toMatchObject({ correct: false, issue: { code: "NETWORK_INVALID" } });
  });
});
