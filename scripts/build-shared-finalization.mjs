#!/usr/bin/env node
// Phase 14A — ONE canonical finalization source for the Builder AND the server governance authority.
//
// The Azure Functions API is CommonJS JavaScript and cannot import the app's TypeScript at runtime, so the server does NOT
// re-implement the finalization math. Instead this script compiles the canonical frontend authority
// (src/examFinalization.ts and everything it reaches: examQuality, assessmentBlueprintCoverage, assessmentQualityPolicy,
// assessmentQualityGates, examBuilderState, examStructure …) to CommonJS under api/src/lib/shared-finalization/. The output is
// committed so deployment needs no build step, and api/tests/shared-finalization-drift-14a.test.js regenerates it into a
// temporary directory on every test run and fails on the first differing byte — frontend and server cannot drift.
//
//   node scripts/build-shared-finalization.mjs        # regenerate api/src/lib/shared-finalization
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const SHARED_ENTRY = "src/examFinalization.ts";
// Phase 15A — the Assessment Preset authority (validator / allow-list extraction / instantiation) is compiled from the SAME
// source so the API validates presets with byte-identical logic (no third implementation, drift-guarded like the rest).
// Phase 16A — the Question Type Catalog / scoring / validation / defaults are pure authorities compiled from the SAME source so
// the server grader and finalization validate and score every registered type with byte-identical logic.
export const SHARED_ENTRIES = [SHARED_ENTRY, "src/assessmentPreset.ts", "src/questionTypeCatalog.ts", "src/questionTypeAliases.ts", "src/questionTypeScoring.ts", "src/questionTypeValidation.ts", "src/questionTypeDefaults.ts", "src/smartsimManifest.ts", "src/smartsimState.ts", "src/codingQuestion.ts", "src/codingContract.ts",
  // Phase 18C — the network CLI simulator engine + question model: the server replays / grades with byte-identical logic.
  "src/networkCliEngine.ts", "src/networkCliQuestion.ts",
  // Phase 19A — the inline cloze model (strict validator / scorer / projection / ingest binding) and the AI authoring normalizer
  // (AI draft → canonical node, judged by the same validators): the server applies byte-identical logic.
  "src/inlineClozeQuestion.ts", "src/aiQuestionDraft.ts",
  // Phase 19B — the deterministic parametric engine + parametricNumeric@1 model: the server generates, projects, grades and reviews
  // official instances with byte-identical logic (and the same generator version) as the teacher preview.
  "src/parametricEngine.ts", "src/parametricNumericQuestion.ts",
  // Phase 19D — the shared visual geometry engine + hotspot@1 / labelDiagram@1 models: the server validates, projects, binds and grades
  // with byte-identical geometry (boundaries, one-to-one matching) as the teacher editor and the student renderer.
  "src/visualGeometry.ts", "src/hotspotQuestion.ts", "src/labelDiagramQuestion.ts",
  // Phase 19E — the domain-neutral rubric engine + openResponse@1 model: the server validates published rubrics, binds teacher awards,
  // computes the official rubric score, projects the public rubric and binds student text with byte-identical logic.
  "src/rubricEngine.ts", "src/openResponseQuestion.ts",
  // Phase 19F — the coding language registry (a leaf module) + the coding@3 locked-template contract: the server validates published
  // templates, binds gap values and reconstructs the OFFICIAL source with byte-identical logic; the read-only code stimulus contract is
  // shared by finalization, the student projection and the renderer.
  "src/codingLanguages.ts", "src/codingTemplate.ts", "src/codeStimulus.ts",
  // Phase 19G — the Scenario & Source Assessment contract (ScenarioV1 + SourceStimulusV1: strict validation, same-section membership,
  // the ONE student / teacher projection): the server finalization gate, the student sanitizer and the teacher review apply byte-identical
  // rules to the Builder's.
  "src/scenarioSource.ts", "src/aiScenarioDraft.ts",
  // Phase 20A+20B — the TRUSTED SmartSim core (plugin registry, smartSim@1 contract, the production plugin set) and the networkTopology@1
  // plugin (topology model, router CLI v1, connectivity engine): the server validates, projects, replays, grades and reviews with
  // byte-identical logic to the student workspace and the teacher editor.
  "src/trustedSimRegistry.ts", "src/trustedSimQuestion.ts", "src/trustedSimPlugins.ts",
  "src/routerCliEngine.ts", "src/networkTopologyModel.ts", "src/networkConnectivity.ts", "src/networkTopologyPlugin.ts",
  // Phase 20A.1 — the universal SmartSim contract (vocabulary, plugin descriptor, scene, trusted assets, semantic actions, generic
  // trusted rules, authoring catalog): the server validates descriptors at registration, ingests / grades generic-rule checks and refuses
  // presentation gestures with the same code the client runs.
  "src/trustedSimVocabulary.ts", "src/trustedSimDescriptor.ts", "src/trustedSimScene.ts", "src/trustedSimAssets.ts",
  "src/trustedSimSemanticActions.ts", "src/trustedSimRules.ts", "src/trustedSimCatalog.ts",
  // Phase 20A.2 — the two enterprise SmartSim pilots: physicsFreeFall@1 (SI free-fall model + physics checks) and functionStudy2d@1
  // (rational / elementary function study on the safe parametric engine): the server validates, replays, grades and reviews them with
  // byte-identical logic to the student workspaces and the teacher editors.
  "src/physicsFreeFallModel.ts", "src/physicsFreeFallPlugin.ts", "src/functionStudyModel.ts", "src/functionStudyPlugin.ts",
  // Phase 21D-A.1 — the shared physics core and the physicsMotion@1 plugin (free fall, projectile, Newton's second law, inclined plane).
  // Phase 21D-A.2 — src/physics/measurementTasks.ts: the measurement-task mechanics shared by physicsMotion@1 and physicsLab@1.
  "src/physics/motionCore.ts", "src/physics/measurementTasks.ts", "src/physicsMotionModel.ts", "src/physicsMotionPlugin.ts",
  // Phase 21D-A.2 — the advanced physics core and the physicsLab@1 plugin (pendulum, spring, mechanical energy, DC circuits).
  "src/physics/labCore.ts", "src/physicsLabModel.ts", "src/physicsLabPlugin.ts",
  // Phase 20C — networkTopology@2 (the curriculum network simulator): shared primitives, configuration authority, switch / router CLI v2,
  // the operational network engine, the host Command Prompt and the plugin. networkTopology@1's modules above stay frozen.
  "src/net2Common.ts", "src/net2Model.ts", "src/net2SwitchCli.ts", "src/net2RouterCli.ts", "src/net2Network.ts", "src/net2Host.ts", "src/net2Plugin.ts",
  // Phase 20D — the composite@1 authority (light identities / marks / first-N + the strict structure validator): the server finalization gate,
  // the official grader, the nested answer binding, the student projection, the canonical rebuild and the coding target resolution apply
  // byte-identical rules to the Builder's and the student renderer's.
  "src/compositeModel.ts", "src/compositeQuestion.ts",
  // Phase 20F — the AI Full Exam Composer domain core (catalog derived from the registries, intent / plan / section-draft normalizers,
  // code-built SmartSim, assembly + verdict, AI-safe projection, domain patches, revision, prompts): the endpoint and the Builder dialog
  // apply byte-identical rules (the client re-verifies every staged draft / patch with the same code).
  "src/aiComposer/composerLimits.ts", "src/aiComposer/composerSchemaKit.ts", "src/aiComposer/composerCatalog.ts", "src/aiComposer/composerIntent.ts",
  "src/aiComposer/composerPlan.ts", "src/aiComposer/composerRich.ts", "src/aiComposer/composerSim.ts", "src/aiComposer/composerDraft.ts",
  "src/aiComposer/composerExam.ts", "src/aiComposer/composerRevision.ts", "src/aiComposer/composerProjection.ts", "src/aiComposer/composerPatch.ts",
  "src/aiComposer/composerPrompts.ts", "src/aiComposer/composerChart.ts",
  // Phase 20G.3 — the legacy table authority (markdown table parse + the per-row control the student card draws): the server grader decides
  // a legacy table's grading mode from the same code the renderer draws with, so a row is never graded as a control it was not drawn as.
  "src/legacyTableSemantics.ts",
  // Phase 21A.1 — the chartSelection@1 model (the chart itself through the ONE ChartSpecV1 authority, src/charts/*, pulled in transitively):
  // the server finalization gate, the student projection, the ingest binder and the official grader apply byte-identical rules.
  "src/chartSelectionQuestion.ts",
  // Phase 21A.2 — the functionGraphSelection@1 model (the graph through the ONE FunctionGraphSpecV1 authority and the safe expression engine,
  // src/functionGraphs/*, pulled in transitively): the server finalization gate, the student projection, the ingest binder and the grader.
  "src/functionGraphSelectionQuestion.ts",
  // Phase 21C — strict interactive 3D scene contract and semantic selection/grading authority.
  "src/interactive3d/sceneSpec.ts", "src/scene3DSelectionQuestion.ts",
  // Phase 21D-A.4 — the versioned multi-surface 3D plot contract (SurfacePlotSpecV2) the rich-content authority validates on the server.
  "src/functionSurfaces/surfacePlotSpec.ts",
  // Phase 21D-B.1 — the GLB 2.0 asset authority (the server validates every uploaded mesh with the SAME code the browser runs before
  // drawing) and the versioned MeshModelSpecV1 exam contract with its code-owned asset library.
  "src/meshModels/glbAsset.ts", "src/meshModels/meshModelSpec.ts"];
export const SHARED_OUT_DIR = "api/src/lib/shared-finalization";
const BANNER = "// GENERATED by scripts/build-shared-finalization.mjs from src/*.ts — DO NOT EDIT (drift-guarded by api/tests/shared-finalization-drift-14a.test.js).\n";
const FORBIDDEN_MODULES = /require\("react|require\("react-dom|require\("\.\/Student|require\("\.\/ui\//;

/** Every generated .js file under `dir`, recursively, as posix paths relative to `dir` (sorted). */
export function listSharedFiles(dir) {
  const out = [];
  const walk = sub => {
    for (const e of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? sub + "/" + e.name : e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".js")) out.push(rel);
    }
  };
  if (fs.existsSync(dir)) walk("");
  return out.sort();
}

export function buildSharedFinalization({ outDir, repoRoot }) {
  const root = path.resolve(repoRoot);
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    ignoreDeprecations: "6.0",
    lib: ["lib.es2023.d.ts"],
    types: [],
    strict: true,
    skipLibCheck: true,
    isolatedModules: true,
    esModuleInterop: true,
    removeComments: true,
    declaration: false,
    sourceMap: false,
    newLine: ts.NewLineKind.LineFeed,
    rootDir: path.join(root, "src"),
    outDir: path.resolve(outDir)
  };
  const program = ts.createProgram(SHARED_ENTRIES.map(e => path.join(root, e)), options);
  const files = [];
  const emitted = program.emit(undefined, (fileName, text) => {
    // Phase 20D.1 — modules may live in src/ SUBDIRECTORIES (src/presentation, src/richContent): the emitted path RELATIVE to the output
    // directory (posix separators) is the identity, so the drift guard compares every emitted file, nested ones included.
    const rel = path.relative(path.resolve(outDir), fileName).split(path.sep).join("/");
    if (!rel.endsWith(".js")) return;
    if (FORBIDDEN_MODULES.test(text)) throw new Error("shared finalization build reached a UI module via " + rel);
    fs.mkdirSync(path.dirname(fileName), { recursive: true });
    fs.writeFileSync(fileName, BANNER + text);
    files.push(rel);
  });
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitted.diagnostics).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length) {
    const text = diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n");
    throw new Error("shared finalization build failed:\n" + text);
  }
  return { files: files.sort() };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = path.join(repoRoot, SHARED_OUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of listSharedFiles(outDir)) fs.unlinkSync(path.join(outDir, f));
  const { files } = buildSharedFinalization({ outDir, repoRoot });
  console.log("shared finalization: " + files.length + " files → " + SHARED_OUT_DIR);
}
