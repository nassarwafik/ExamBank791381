// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_NET_SCENARIOS, composerNetScenario, mentionsNetworking, networkCatalogForPrompt, networkScenariosLine } from "./composerCatalog";
import { buildModifyPrompt, buildPlanPrompt, buildSectionPrompt } from "./composerPrompts";
import { normalizeComposerIntent } from "./composerIntent";
import { normalizePlanShape, validatePlan } from "./composerPlan";
import { composerSimulatorsBySubject } from "./composerSimSummary";
import { resolveSmartSimPlugin } from "../trustedSimRegistry";
import AiExamComposerDialog from "./AiExamComposerDialog";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";

// Phase 21M — composer headroom and the teacher-facing simulator summary. The network scenario CHECK list (the largest line of the general
// catalog) moved, verbatim, to an on-demand block sent only with the prompts that use the network simulator; the plan stage still sees every
// scenario id, title and topic. The dialog shows, per subject, the simulators the composer can generate (derived from the catalog + registry).
afterEach(() => cleanup());
const intent = (() => { const r = normalizeComposerIntent({ v: 1, subject: "الشبكات", totalMarks: 20 }); if (!r.ok) throw new Error("intent"); return r.intent; })();
const planOf = (raw: Record<string, unknown>) => { const s = normalizePlanShape(raw); if (!s.ok) throw new Error(JSON.stringify(s.issues)); return validatePlan(s.plan, intent).plan; };
const allCheckIds = () => COMPOSER_NET_SCENARIOS.flatMap(id => composerNetScenario(id)!.checks.map(c => c.id));
const someCheck = () => { const s = composerNetScenario(COMPOSER_NET_SCENARIOS[0])!; return s.checks[0].id + " " + s.checks[0].label; };

describe("21M-HEADROOM the network check list travels on demand", () => {
  it("the general catalog shrinks by > 1000 characters and keeps every scenario id, title and topic", () => {
    const general = catalogForPrompt();
    expect(general.length).toBeLessThanOrEqual(7600);
    const line = general.split("\n").find(l => l.startsWith("networkTopology@2 scenarios:"))!;
    expect(line).toBe(networkScenariosLine());
    for (const id of COMPOSER_NET_SCENARIOS) { const s = composerNetScenario(id)!; expect(line).toContain(id + " = " + s.title + " [" + s.topics.join(", ") + "]"); }
    expect(line).not.toContain(someCheck());
  });
  it("the on-demand block keeps EVERY check id and label of every scenario (nothing lost)", () => {
    const full = networkCatalogForPrompt();
    for (const id of COMPOSER_NET_SCENARIOS) for (const c of composerNetScenario(id)!.checks) expect(full).toContain(c.id + " " + c.label);
    expect(allCheckIds().length).toBeGreaterThan(10);
  });
  it("plan prompt: titles only; a section that plans the network simulator gets the checks, another section does not", () => {
    const plan = planOf(F.plan("شبكات", "default", [
      F.planSection("أ", [F.planItem("composite", 10, { simulator: "networkTopology", scenario: "dhcp" })]),
      F.planSection("ب", [F.planItem("multipleChoice", 10)])
    ]));
    expect(buildPlanPrompt(intent)).not.toContain(someCheck());
    expect(buildSectionPrompt(intent, plan, 0)).toContain(networkCatalogForPrompt());
    expect(buildSectionPrompt(intent, plan, 1)).not.toContain(networkCatalogForPrompt());
  });
  it("modify prompt: carries the checks when the request or the exam involves networking", () => {
    const empty = { v: 1, examId: "E", title: "t", sections: [] } as never;
    expect(buildModifyPrompt(empty, "generateSection", { kind: "exam" }, "أضف سؤالًا مركّبًا عن VLAN وTrunk")).toContain(networkCatalogForPrompt());
    expect(buildModifyPrompt(empty, "generateSection", { kind: "exam" }, "add a Python loops section")).not.toContain(networkCatalogForPrompt());
    expect(mentionsNetworking(JSON.stringify({ simulator: "networkTopology@2" }))).toBe(true);
    expect(mentionsNetworking("امتحان فيزياء عن البندول")).toBe(false);
  });
});

describe("21M-SUMMARY what the composer can simulate, per subject", () => {
  it("every catalogued simulator appears exactly once, under its subject, with the registry's own label", () => {
    const catalog = buildComposerCatalog();
    const groups = composerSimulatorsBySubject(catalog);
    expect(groups.map(g => g.subject)).toEqual(["networking", "physics", "chemistry", "mathematics"].filter(s => catalog.smartSim.some(p => p.subject === s)));
    const listed = groups.flatMap(g => g.simulators.map(x => x.key + "@" + x.version));
    expect(listed.sort()).toEqual(catalog.smartSim.map(p => p.pluginKey + "@" + p.pluginVersion).sort());
    for (const g of groups) for (const x of g.simulators) expect(x.label).toBe(resolveSmartSimPlugin(x.key, x.version)!.label);
  });
  it("the composer dialog shows the summary in the «امتحان جديد» tab", () => {
    const exam = { examId: "E21M", title: "t", status: "draft", schemaVersion: 2, sections: [] } as unknown as StructuredExam;
    render(<AiExamComposerDialog open onClose={() => {}} transport={async () => ({})} exam={exam} getLatestExam={() => exam} onApply={() => "ok"} onPreview={() => {}} />);
    const summary = screen.getByText(/المحاكاة التي يستطيع المؤلف توليدها/);
    const box = summary.closest("details")!;
    for (const g of composerSimulatorsBySubject(buildComposerCatalog())) {
      expect(box.textContent).toContain(g.label);
      for (const x of g.simulators) expect(within(box).getByText(new RegExp(x.label.replace(/[()]/g, "\\$&").slice(0, 20)))).toBeTruthy();
    }
  });
});
