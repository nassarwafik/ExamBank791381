import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { examA } from "./exams/A-network.js";
import { examB } from "./exams/B-physics.js";
import { examC } from "./exams/C-computer-science.js";
import { examD } from "./exams/D-mathematics.js";
import { examE } from "./exams/E-showcase.js";
import { stressExam } from "./exams/S-stress.js";
import { COMPOSITE_CHILD_IDENTITIES } from "../../../src/compositeQuestion";
import { COMPOSER_DRAFT_TYPES, COMPOSER_SIM_PLUGINS } from "../../../src/aiComposer/composerCatalog";

// Phase 20G — the LIVE CAPABILITY MATRIX, derived from the code at run time (never a hand list): every production question type of the canonical
// Question Type Catalog at every supported version, every registered SmartSim plugin identity and every composite child identity. Each row gets
// a disposition — A: exercised end to end by a 20G certification exam (verified by scanning the exams themselves), B: covered by an existing
// authoritative integration test (the file must exist and name the identity), C: not applicable, with the reason. A new type / version / plugin
// added later without a disposition FAILS this test. The rendered table is pinned in docs/fixtures/certification-20g/coverage-map.md (the design
// record includes it); regenerate with WRITE_20G_FIXTURES=1.
const require_ = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const catalog = require_("../../src/lib/shared-finalization/questionTypeCatalog.js");
const registry = require_("../../src/lib/shared-finalization/trustedSimRegistry.js");
require_("../../src/lib/shared-finalization/trustedSimPlugins.js");
const { resolveGrader } = require_("../../src/lib/question-type-graders.js");
const FIX = path.join(repo, "docs/fixtures/certification-20g");
// 21A.1 — the Interactive Charts mini acceptance exam (driven end to end by api/tests/certification-21a1/cert-21a1-charts-lifecycle.test.js)
// is scanned too: it is the certification exam of chartSelection@1 (standalone and as a composite child).
const ACCEPTANCE_21A1 = JSON.parse(fs.readFileSync(path.join(repo, "docs/fixtures/data-charts-21a1/ExamBank_21A1_Interactive_Charts_Mini_Acceptance.json"), "utf8"));
const EXAMS = { A: examA(), B: examB(), C: examC(), D: examD(), E: examE(), S: stressExam({ sections: 1, perSection: 30 }).exam, "21A1": ACCEPTANCE_21A1 };

/** identity → set of certification exams that contain it (top level, composite child or compound part). */
function exercised() {
  const out = new Map();
  const add = (id, ex) => { if (!out.has(id)) out.set(id, new Set()); out.get(id).add(ex); };
  for (const [name, e] of Object.entries(EXAMS)) for (const q of e.sections.flatMap(s => s.questions)) {
    const v = q.questionTypeVersion ?? 1;
    add(q.presentationType + "@" + v, name);
    if (q.smartSim) add("plugin:" + q.smartSim.pluginKey + "@" + q.smartSim.pluginVersion, name);
    for (const p of q.parts ?? []) add("compoundPart:" + p.type, name);
    for (const c of q.composite?.contexts ?? []) if (c.smartSim) add("plugin:" + c.smartSim.pluginKey + "@" + c.smartSim.pluginVersion, name);
    for (const g of q.composite?.groups ?? []) for (const p of g.parts) { add("child:" + p.type + "@" + (p.questionTypeVersion ?? 1), name); if (p.smartSim) add("plugin:" + p.smartSim.pluginKey + "@" + p.smartSim.pluginVersion, name); }
  }
  return out;
}
/** B / C dispositions — each with its evidence (an existing test file that names the identity) or its reason. */
const PINNED = {
  "simulation@1": { d: "B", file: "api/tests/smartsim-guards-16b-a.test.js", why: "teacher-uploaded package (sandboxed, manual grading only); its lifecycle needs a stored package — covered by the 16B-A browser / store suites" },
  "child:simulation@1": { d: "B", file: "src/composite/composite.20d.test.ts", why: "a simulation child requires an uploaded package; the composite contract accepts the identity (20D suite)" }
};

function rows() {
  const ex = exercised();
  const out = [];
  const disp = id => {
    if (ex.has(id)) return { d: "A", evidence: [...ex.get(id)].sort().join(", ") };
    const p = PINNED[id];
    if (!p) return { d: "?", evidence: "" };
    return { d: p.d, evidence: p.file ? p.file + " — " + p.why : p.why };
  };
  for (const def of catalog.listQuestionTypes()) for (let v = 1; v <= def.version; v++) {
    const id = def.key + "@" + v;
    const c = def.capabilities;
    out.push({ id, kind: "type", grading: def.gradingMode, partial: c.partialCredit, responses: def.responseKinds.join("/"), compoundPart: c.compoundPart, compositeChild: COMPOSITE_CHILD_IDENTITIES.includes(id),
      ai: COMPOSER_DRAFT_TYPES.includes(def.key) || (def.key === "smartSim" || def.key === "composite"), authoring: catalog.authoringQuestionTypeVersion(def.key) === v, grader: def.legacy ? "legacy adapter" : (typeof resolveGrader(def.key, v) === "function" ? "registered" : "composed"), ...disp(id) });
  }
  for (const d of registry.listSmartSimPluginDescriptors()) {
    const id = "plugin:" + d.key + "@" + d.version;
    out.push({ id, kind: "smartSim plugin", grading: "auto (server replay)", partial: true, responses: "smartSim actions", compoundPart: false, compositeChild: true, ai: COMPOSER_SIM_PLUGINS.some(p => p.pluginKey === d.key && p.pluginVersion === d.version), authoring: true, grader: "replay + private checks", ...disp(id) });
  }
  for (const cid of COMPOSITE_CHILD_IDENTITIES) out.push({ id: "child:" + cid, kind: "composite child", grading: "child authority", partial: true, responses: "", compoundPart: false, compositeChild: true, ai: false, authoring: true, grader: "child grader", ...disp("child:" + cid) });
  for (const key of catalog.compoundPartTypeKeys()) out.push({ id: "compoundPart:" + key, kind: "legacy compound part", grading: "part grader", partial: true, responses: "", compoundPart: true, compositeChild: false, ai: false, authoring: true, grader: "legacy part", ...(ex.has("compoundPart:" + key) ? { d: "A", evidence: [...ex.get("compoundPart:" + key)].join(", ") } : { d: "B", evidence: "src/compoundFreeze.20d.test.tsx — compound@1 is frozen; every part type is pinned by the freeze suite" }) });
  return out;
}
const yes = b => (b ? "✓" : "—");
function table(list) {
  return ["| Identity | Kind | Grading | Partial | Response | Compound part | Composite child | AI composer | Authoring version | Grader | 20G | Evidence |", "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...list.map(r => "| `" + r.id + "` | " + r.kind + " | " + r.grading + " | " + yes(r.partial) + " | " + (r.responses || "—") + " | " + yes(r.compoundPart) + " | " + yes(r.compositeChild) + " | " + yes(r.ai) + " | " + yes(r.authoring) + " | " + r.grader + " | " + r.d + " | " + r.evidence + " |")].join("\n") + "\n";
}

describe("20G live capability matrix", () => {
  const list = rows();
  it("every catalog identity (all versions), SmartSim plugin and composite child identity has a disposition; nothing is unaccounted for", () => {
    expect(list.filter(r => r.d === "?").map(r => r.id)).toEqual([]);
    expect(list.filter(r => r.kind === "type").length).toBe(catalog.listQuestionTypes().reduce((n, d) => n + d.version, 0));
  });
  it("B rows point at real authoritative tests that name the identity", () => {
    for (const r of list.filter(x => x.d === "B")) {
      const file = r.evidence.split(" — ")[0];
      expect(fs.existsSync(path.join(repo, file)), r.id + " " + file).toBe(true);
      const key = r.id.replace(/^(child:|compoundPart:)/, "").replace(/@\d+$/, "");
      expect(fs.readFileSync(path.join(repo, file), "utf8").includes(key) || file.includes("compoundFreeze"), r.id).toBe(true);
    }
  });
  it("A is the norm: every production type, every plugin and every composite child except the uploaded-package simulation is EXERCISED", () => {
    expect(list.filter(r => r.d !== "A").map(r => r.id).sort()).toEqual(["child:simulation@1", "simulation@1"]);
  });
  it("the rendered coverage map is pinned (docs/fixtures/certification-20g/coverage-map.md)", () => {
    const text = "<!-- generated by api/tests/certification-20g/cert-20g-capability-matrix.test.js (WRITE_20G_FIXTURES=1) — do not edit by hand -->\n\n" + table(list);
    const file = path.join(FIX, "coverage-map.md");
    if (process.env.WRITE_20G_FIXTURES) { fs.mkdirSync(FIX, { recursive: true }); fs.writeFileSync(file, text); }
    expect(fs.readFileSync(file, "utf8")).toBe(text);
  });
  it("the five certification exams are exported as importable JSON fixtures and pinned (teachers import exactly what is certified)", () => {
    for (const [name, e] of Object.entries({ "A-network": EXAMS.A, "B-physics": EXAMS.B, "C-computer-science": EXAMS.C, "D-mathematics": EXAMS.D, "E-showcase": EXAMS.E })) {
      const file = path.join(FIX, name + ".json");
      if (process.env.WRITE_20G_FIXTURES) fs.writeFileSync(file, JSON.stringify(e, null, 2) + "\n");
      expect(JSON.parse(fs.readFileSync(file, "utf8")), name).toEqual(e);
    }
  });
});
