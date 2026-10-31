// 791381s Phase 8B-1 (docs/enterprise-791381s-enrichment-plan.md §11.3) — the CONTRACT of a network lab (`simulation` /
// `network-lab` v1) between the authored content, the served body, the check index and the study rule:
//   • the validator rejects a malformed lab (structure); the proof (the real simulator) rejects free credit and an unsolvable task;
//   • the served body keeps ONLY the public topology and task (+ serverCheck) — never a check, a feedback text or the solution;
//   • the check index holds the key { topology, checks } and the feedback; a lab that opts out (`studyEligible: false`) is
//     checked but never a study activity, and the authored and served bodies name the same study activities;
//   • every lab authored in any course is valid and proven, and — until the owner decides (§11.3) — opts out of Study Strength.
import { describe, it, expect } from "vitest";
import { validateLearningCourseContent } from "../content/validation";
import { cloneCourse } from "../content/content.fixtures";
import type { ContentBlock, ContentModule, NetworkLabConfig, SimulationBlock } from "../content/types";
import { checkActivityOf, servedBlock } from "../study/checkIndex";
import { studyActivityIds, studyActivityOf } from "../study/eligibility";
import { proveNetworkLab } from "./networkLabProof";
import { COURSE_CONTENT_MODULE_IDS, registeredCourseIds } from "../content/registry";
import { loadBundledModuleContent } from "../content/bundledModules";

const host = (id: string, address: string) => ({ id, kind: "pc", label: id.toUpperCase(), x: 0.3, y: 0.8, initial: { v: 2, device: "host", adapters: { eth0: { mode: "static", address, mask: "255.255.255.0", gateway: "" } } } });
const sw = (lines: string[]) => lines.map(command => ({ type: "switch.command", deviceId: "sw1", command }));
const CONFIG: NetworkLabConfig = {
  topology: {
    v: 2,
    devices: [{ id: "sw1", kind: "switch", label: "SW1", x: 0.5, y: 0.2 }, host("pc1", "192.168.10.11"), host("pc2", "192.168.10.12")],
    links: [{ id: "a", a: { deviceId: "sw1", port: "f0/1" }, b: { deviceId: "pc1", port: "eth0" } }, { id: "b", a: { deviceId: "sw1", port: "f0/2" }, b: { deviceId: "pc2", port: "eth0" } }],
  },
  task: { intro: "أنشئ VLAN 10 وضع المنفذ Fa0/1 فيها.", goals: [{ id: "g1", label: "VLAN 10 موجودة على SW1" }, { id: "g2", label: "المنفذ Fa0/1 في VLAN 10" }] },
  checks: [
    { id: "g1", label: "VLAN 10 موجودة على SW1", weight: 1, kind: "switch.vlanExists", deviceId: "sw1", vlan: 10 },
    { id: "g2", label: "المنفذ Fa0/1 في VLAN 10", weight: 1, kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/1", value: 10 },
  ],
  feedback: { correctFeedback: "أحسنت: الإعداد صحيح.", incorrectFeedback: "بعض الأهداف لم تتحقق بعد.", hints: ["ابدأ بـ vlan 10 في وضع configure terminal."], explanation: "switchport access vlan 10 يضع المنفذ في VLAN 10." },
  solution: sw(["enable", "configure terminal", "vlan 10", "exit", "interface f0/1", "switchport mode access", "switchport access vlan 10", "end"]),
};
const labBlock = (over: Partial<SimulationBlock> = {}, config: Partial<NetworkLabConfig> = {}): SimulationBlock => ({
  id: "lab-1", type: "simulation", origin: "teacher-enrichment", simulationType: "network-lab", version: 1, title: "مختبر: VLAN 10",
  config: { ...CONFIG, ...config } as unknown as Record<string, unknown>, ...over,
});
const codes = (b: ContentBlock) => {
  const c = cloneCourse();
  c.modules[0].lessons[0].pages[0].blocks = [b];
  return validateLearningCourseContent(c).map(i => i.code);
};

describe("validation — the structure of a lab", () => {
  it("a well-formed lab validates", () => {
    expect(codes(labBlock())).toEqual([]);
  });
  it("rejects a wrong version, a reveal, an authored serverCheck, an unknown config field, missing task / checks / solution, goals ≠ checks", () => {
    const bad: [string, ContentBlock][] = [
      ["version 2", labBlock({ version: 2 })],
      ["reveal", { ...labBlock(), reveal: true } as unknown as ContentBlock],
      ["serverCheck", labBlock({ serverCheck: true })],
      ["unknown field", labBlock({}, { answer: "x" } as unknown as Partial<NetworkLabConfig>)],
      ["no intro", labBlock({}, { task: { intro: " ", goals: CONFIG.task.goals } })],
      ["no checks", labBlock({}, { checks: [] })],
      ["no solution", labBlock({}, { solution: [] })],
      ["goals out of order", labBlock({}, { task: { intro: "x", goals: [...CONFIG.task.goals].reverse() } })],
      ["a goal missing", labBlock({}, { task: { intro: "x", goals: CONFIG.task.goals.slice(0, 1) } })],
      ["duplicate check ids", labBlock({}, { checks: [CONFIG.checks![0], CONFIG.checks![0]], task: { intro: "x", goals: [CONFIG.task.goals[0], CONFIG.task.goals[0]] } })],
      ["bad feedback", labBlock({}, { feedback: { hints: "x" } as unknown as NetworkLabConfig["feedback"] })],
    ];
    for (const [what, b] of bad) expect(codes(b), what).toContain("invalid-network-lab");
  });
});

describe("the proof — the simulator agrees with the author", () => {
  it("the fixture lab: valid topology and key, no free credit, the solution passes every check", () => {
    expect(proveNetworkLab(CONFIG)).toEqual({ ok: true, problems: [] });
  });
  it("catches an unsolvable task, free credit, an invalid check and an invalid topology", () => {
    expect(proveNetworkLab({ ...CONFIG, solution: CONFIG.solution!.slice(0, 4) }).problems.join(" ")).toMatch(/does not pass every check: g2/);
    const free = { ...CONFIG, checks: [...CONFIG.checks!, { id: "g3", label: "Fa0/2 في VLAN 1", weight: 1, kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/2", value: 1 }] };
    expect(proveNetworkLab(free).problems.join(" ")).toMatch(/free credit.*g3/);
    expect(proveNetworkLab({ ...CONFIG, checks: [{ ...CONFIG.checks![0], kind: "no.such.check" }] }).ok).toBe(false);
    expect(proveNetworkLab({ ...CONFIG, topology: { v: 2, devices: [], links: [{ id: "x" }] } }).problems[0]).toMatch(/^topology:/);
  });
});

describe("served body · check index · study rule", () => {
  it("the served block keeps the topology and the task only (+ serverCheck): no check, feedback text or solution", () => {
    const served = servedBlock(labBlock()) as SimulationBlock;
    expect(served.serverCheck).toBe(true);
    expect(Object.keys(served.config!).sort()).toEqual(["task", "topology"]);
    expect(served.config!.topology).toEqual(CONFIG.topology);
    const json = JSON.stringify(served);
    for (const secret of ["switch.vlanExists", "switch.accessVlan", "switchport access vlan 10", "أحسنت", "لم تتحقق", "ابدأ بـ", "يضع المنفذ", "checks", "solution", "feedback"]) expect(json, secret).not.toContain(secret);
    // the public task is kept (the goal labels are the statement)
    expect(json).toContain("المنفذ Fa0/1 في VLAN 10");
  });
  it("the check index entry: the key { topology, checks } and the feedback; study only without the opt-out", () => {
    const a = checkActivityOf(labBlock())!;
    expect(a.key).toEqual({ kind: "network-lab", topology: CONFIG.topology, checks: CONFIG.checks });
    expect(a.feedback).toEqual({ correct: "أحسنت: الإعداد صحيح.", incorrect: "بعض الأهداف لم تتحقق بعد.", hints: ["ابدأ بـ vlan 10 في وضع configure terminal."], explanation: "switchport access vlan 10 يضع المنفذ في VLAN 10." });
    expect(a.study).toBe(true);
    expect(a.reveal).toBeUndefined();
    const out = labBlock({ studyEligible: false });
    expect(checkActivityOf(out)!.study).toBe(false);
    expect(studyActivityOf(out)).toBeNull();
    expect(checkActivityOf(labBlock({ version: 2 }))).toBeNull();                       // another version is not checkable
    expect(checkActivityOf(servedBlock(labBlock()))).toBeNull();                        // a served body carries no key
  });
  it("the authored and the served body name the same study activities (eligible and opted-out alike)", () => {
    for (const b of [labBlock(), labBlock({ studyEligible: false })]) {
      const page = { blocks: [b] }, served = { blocks: [servedBlock(b)] };
      expect(studyActivityIds(served)).toEqual(studyActivityIds(page));
    }
    expect(studyActivityIds({ blocks: [labBlock()] })).toEqual(["lab-1"]);
    expect(studyActivityIds({ blocks: [labBlock({ studyEligible: false })] })).toEqual([]);
  });
});

describe("every authored lab (all courses)", () => {
  it("is valid, proven by the simulator, and opts out of Study Strength until the owner decides (§11.3)", async () => {
    let n = 0;
    for (const courseId of registeredCourseIds()) {
      for (const moduleId of COURSE_CONTENT_MODULE_IDS[courseId]) {
        const mod: ContentModule = await loadBundledModuleContent(courseId, moduleId);
        for (const page of mod.lessons.flatMap(l => l.pages)) for (const b of page.blocks) {
          if (b.type !== "simulation" || b.simulationType !== "network-lab") continue;
          n++;
          const where = courseId + "/" + page.id + "/" + b.id;
          expect(proveNetworkLab(b.config as unknown as NetworkLabConfig), where).toEqual({ ok: true, problems: [] });
          expect((b as SimulationBlock).studyEligible, where).toBe(false);
        }
      }
    }
    expect(n).toBeGreaterThanOrEqual(0);       // 8B-1 ships the contract; the first lab arrives with 8B-2
  }, 60000);
});
