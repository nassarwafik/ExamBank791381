// 791381s Phases 8B-2 / 8B-3 (docs/enterprise-791381s-enrichment-plan.md §11.3, §14, §15) — the booklet's NETWORK LABS:
//   • exactly one lab on the «تدريبات الوحدة» page of each unit the simulator supports with the unit's own commands
//     (16 VLAN, 17 Native/Trunk, 18 VTP, 19 Router on a Stick, 22 DHCP, 23 Port Security, 24 Cisco passwords, 36 DHCP STUDENTS),
//     after the unit's questions and before its Exam Library cards;
//   • every lab is checked only (studyEligible: false) — the study index carries no lab id (Strength unchanged until the owner
//     decides);
//   • the SERVED body of each lab keeps the topology and the task only: no check kind, no expected value field, no solution.
// (Validity and the simulator proof of every lab — no free credit, the solution passes — are networkLab.contract.test.ts.)
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import manifest from "./manifest";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentModule, SimulationBlock } from "../types";

const CID = "791381s";
const LAB_UNITS = ["m16", "m17", "m18", "m19", "m22", "m23", "m24", "m36"];
const data = (rel: string) => readFileSync(fileURLToPath(new URL("../../../../api/src/data/" + rel, import.meta.url)), "utf8");
const isLab = (b: { type: string; simulationType?: string }) => b.type === "simulation" && b.simulationType === "network-lab";

describe("the booklet's network labs", () => {
  it("one lab per supported unit, on its practice page, after the questions and before the Exam Library cards; checked only", async () => {
    const found: string[] = [];
    for (const ref of manifest.modules) {
      const mod: ContentModule = await loadBundledModuleContent(CID, ref.id);
      for (const page of mod.lessons.flatMap(l => l.pages)) {
        const labs = page.blocks.filter(isLab) as SimulationBlock[];
        if (!labs.length) continue;
        const unit = ref.id.slice(CID.length + 1);
        found.push(unit);
        expect(labs, page.id).toHaveLength(1);
        expect(page.layout, page.id).toBe("practice");
        const lab = labs[0], at = page.blocks.indexOf(lab);
        expect(lab.origin).toBe("teacher-enrichment");
        expect(lab.studyEligible, lab.id).toBe(false);
        expect(lab.id.startsWith(unit + "-l02-p01-lab-"), lab.id).toBe(true);
        expect(page.blocks.slice(0, at).every(b => b.type === "practice" || b.type === "practice-table"), lab.id + " follows the questions").toBe(true);
        expect(page.blocks.slice(at + 1).every(b => b.type === "library-training"), lab.id + " precedes only the Exam Library cards").toBe(true);
        expect(lab.fallback?.text, lab.id).toBeTruthy();
      }
    }
    expect(found).toEqual(LAB_UNITS);
  }, 60000);

  it("the study index names no lab (Strength unchanged); the served bodies carry the topology and the task only", () => {
    expect(data("learning-study/" + CID + ".json")).not.toMatch(/-lab-/);
    for (const unit of LAB_UNITS) {
      const body = JSON.parse(data("learning-content/" + CID + "/" + CID + "-" + unit + ".json")) as ContentModule;
      const labs = body.lessons.flatMap(l => l.pages).flatMap(p => p.blocks).filter(isLab) as SimulationBlock[];
      expect(labs, unit).toHaveLength(1);
      expect(labs[0].serverCheck, unit).toBe(true);
      expect(Object.keys(labs[0].config!).sort(), unit).toEqual(["task", "topology"]);
      const json = JSON.stringify(labs[0]);
      expect(json, unit).not.toMatch(/"(checks|solution|feedback|correctFeedback|explanation|hints)"|"kind":"(switch|router|host|ap)\.|"kind":"reachability"/);
    }
  });
});
