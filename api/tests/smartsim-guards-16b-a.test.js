import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gradeQuestion } from "../src/lib/assignment-grading.js";
import { resolveGrader } from "../src/lib/question-type-graders.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { isResponseAnswered } from "../src/lib/exam-structure.js";
import { buildRuntimeHeaders } from "../src/lib/smartsim/runtime-headers.js";
import * as GOV from "../src/lib/exam-governance.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 16B-A — architecture / security guards + server contracts: no eval / new Function / child_process / npm / vite / tsc
// execution anywhere in the simulator pipeline, no external iframe URL, the runtime URL is never read from exam JSON, the
// simulator can never grade (S13 / SM13), the sanitizer keeps the identity and strips answer.* (S23), no subject-specific
// branch (S35), uploaded code never enters the app bundle, the CSP + isolation headers, the shared build carries the manifest /
// state modules, the governance gate refuses an unavailable package, the draft pipeline bounds simulation state.
// Fail-first on 6bb3b97 (modules absent).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
const strip = t => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const read = f => strip(fs.readFileSync(path.join(repo, f), "utf8"));
const exists = f => fs.existsSync(path.join(repo, f));
const HASH = "sha256:" + "ab".repeat(32);
const REF = { packageId: "counter-sim", packageVersion: 1, packageHash: HASH, runtimeVersion: 1, entry: "index.html" };
const SERVER_FILES = ["api/src/lib/smartsim/zip-reader.js", "api/src/lib/smartsim/package-validator.js", "api/src/lib/smartsim/mime-map.js", "api/src/lib/smartsim/package-store.js", "api/src/lib/smartsim/runtime-headers.js", "api/src/functions/simulators.js"];
const CLIENT_FILES = ["src/smartsim/SimulationSandboxHost.tsx", "src/smartsim/smartsimBridge.ts", "src/smartsim/runtimeUrl.ts", "src/smartsim/simulationService.ts", "src/questionTypes/student/SimulationResponse.tsx", "src/questionTypes/editors/SimulationEditor.tsx"];
const SHARED_FILES = ["src/smartsimManifest.ts", "src/smartsimState.ts"];

describe("16B-A guards — no code execution of uploads, no build tooling, no external runtime", () => {
  it("server pipeline never evaluates package code or spawns processes: no eval / new Function / vm / child_process / worker_threads / npm / vite / tsc / esbuild", () => {
    for (const f of SERVER_FILES) {
      const s = read(f);
      expect(exists(f), f).toBe(true);
      expect(s, f).not.toMatch(/\beval\s*\(|new Function|Function\(|require\("vm"\)|require\("node:vm"\)|child_process|worker_threads|execSync|spawn\(|\bnpm\b|\bvite\b|\btsc\b|esbuild|rollup|webpack/);
      expect(s, f).not.toMatch(/require\(\s*[^"']|import\(\s*[^"']/);                                                     // no dynamic module selection from data
    }
  });
  it("client runtime never builds an iframe URL from exam JSON or an external origin; no srcdoc / innerHTML / dangerouslySetInnerHTML / eval; only the content-addressed runtime route", () => {
    for (const f of CLIENT_FILES) {
      const s = read(f);
      expect(exists(f), f).toBe(true);
      expect(s, f).not.toMatch(/\beval\s*\(|new Function|srcdoc|dangerouslySetInnerHTML|innerHTML|document\.write|allow-same-origin|allow-top-navigation|allow-popups|allow-forms|allow-modals|allow-downloads/);
      expect(s, f).not.toMatch(/https?:\/\/(?!app\.example)[a-z0-9.-]+\.(com|net|io|dev|org)\b/i);                       // no external origins anywhere in runtime code
    }
    const host = read("src/smartsim/SimulationSandboxHost.tsx");
    expect(host).toMatch(/sandbox="allow-scripts"/);
    expect(host).not.toMatch(/src=\{[^}]*(q|question|node|exam)\.(url|src|iframe|entryUrl|packageUrl)/);
    const url = read("src/smartsim/runtimeUrl.ts");
    expect(url).toMatch(/\/api\/simulators\/runtime\//);
    expect(url).not.toMatch(/localStorage|sessionStorage|document\.cookie|Authorization|token/);
  });
  it("S35 — no subject / domain branch anywhere in the runtime, editor, store or validator (physics / chemistry / circuit / …)", () => {
    for (const f of [...SERVER_FILES, ...CLIENT_FILES, ...SHARED_FILES]) expect(read(f), f).not.toMatch(/physics|chemistry|circuit|pendulum|projectile|biology|titration|ohm|فيزياء|كيمياء|دائرة كهربائية/i);
  });
  it("the bridge never carries student identity, exam-wide answers or a token; the host module never touches storage / cookies / the auth token", () => {
    const host = read("src/smartsim/SimulationSandboxHost.tsx") + read("src/smartsim/smartsimBridge.ts");
    expect(host).not.toMatch(/localStorage|sessionStorage|document\.cookie|Authorization|studentName|studentId|examId|answers\[/);
  });
  it("uploaded package bytes are NEVER part of the app bundle: no import of examples / fixtures / dist packages from src; the example counter lives under examples/ and docs/", () => {
    const srcFiles = walk(path.join(repo, "src")).filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
    for (const f of srcFiles) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/from "\.\.?\/.*(examples\/smartsim|smartsim-zip|\.smartsim")/);
    expect(exists("examples/smartsim/counter/manifest.json")).toBe(true);
    expect(exists("examples/smartsim/counter/dist/index.html")).toBe(true);
    expect(exists("docs/smartsim/sdk-v1.js")).toBe(true);
    expect(exists("docs/smartsim/manifest.schema.json")).toBe(true);
    expect(exists("docs/smartsim/README.md")).toBe(true);
    expect(exists("docs/smartsim/AI_SIMULATOR_SPEC.md")).toBe(true);
    expect(exists("docs/universal-simulation-runtime-16b-a.md")).toBe(true);
    const sdk = fs.readFileSync(path.join(repo, "docs/smartsim/sdk-v1.js"), "utf8");
    expect(sdk).not.toMatch(/require\(|import |fetch\(|XMLHttpRequest|localStorage|eval\(/);
    expect(sdk.length).toBeLessThan(8000);
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, "examples/smartsim/counter/manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ schemaVersion: 1, packageId: "counter-sim", packageVersion: 1, entry: "dist/index.html", runtime: "web", runtimeVersion: 1, responseSchemaVersion: 1 });
  }, 30000);                                                                                                        // walks all of src/: allow for a loaded test pool
  it("the shared server build carries the manifest / state modules (finalization parity) and SHARED_ENTRIES names them", () => {
    expect(read("scripts/build-shared-finalization.mjs")).toMatch(/src\/smartsimManifest\.ts/);
    expect(read("scripts/build-shared-finalization.mjs")).toMatch(/src\/smartsimState\.ts/);
    expect(exists("api/src/lib/shared-finalization/smartsimManifest.js")).toBe(true);
    expect(exists("api/src/lib/shared-finalization/smartsimState.js")).toBe(true);
    for (const f of SHARED_FILES) expect(read(f), f).not.toMatch(/from "react|document\.|window\.|fetch\(|import\(/);
    const shared = require_(path.join(repo, "api/src/lib/shared-finalization/smartsimManifest.js"));
    expect(shared.validateSimulationReference(REF)).toEqual([]);
    expect(shared.validateSimulationReference({ ...REF, packageHash: "latest" }).map(i => i.code)).toEqual(["SIM_PACKAGE_HASH_INVALID"]);
    const validation = require_(path.join(repo, "api/src/lib/shared-finalization/questionTypeValidation.js"));
    expect(validation.validateQuestionTypeNode({ text: "x" }, "simulation", 1).map(i => i.code)).toEqual(["SIM_PACKAGE_MISSING"]);
    expect(validation.validateQuestionTypeNode({ simulation: REF }, "simulation", 1)).toEqual([]);
    const catalog = require_(path.join(repo, "api/src/lib/shared-finalization/questionTypeCatalog.js"));
    expect(catalog.QUESTION_TYPE_CATALOG.length).toBe(19);                                         // Phase 17A adds coding · 18C adds networkCli · 19A adds inlineCloze
    expect(catalog.questionTypeDefinition("simulation")).toMatchObject({ version: 1, gradingMode: "manual", legacy: false });
  });
});

describe("16B-A S13 / SM13 — the simulator has ZERO grading authority", () => {
  const q = { examQuestionId: "s1", presentationType: "simulation", questionTypeVersion: 1, text: "س", marks: 10, simulation: REF, answer: { assertions: [{ path: "count", equals: 3 }] } };
  it("simulation@1 grades to score 0 / manualReview true for every response, including states that smuggle score / passed / SMARTSIM_SCORE", () => {
    expect(resolveGrader("simulation", 1)).toBeTypeOf("function"); expect(resolveGrader("simulation", 2)).toBeUndefined();
    for (const response of [undefined, { kind: "simulation", state: { count: 3 } }, { kind: "simulation", state: { score: 10, passed: true, correct: true } }, { kind: "simulation", state: { SMARTSIM_SCORE: 10 } }, { kind: "text", value: "x" }]) {
      const r = gradeQuestion(q, response);
      expect(r, JSON.stringify(response)).toMatchObject({ score: 0, maxMarks: 10, manualReview: true, correct: false });
    }
  });
  it("isResponseAnswered mirrors answered(): a simulation state with content counts as answered; null / empty / missing does not", () => {
    expect(isResponseAnswered({ kind: "simulation", state: { count: 0 } })).toBe(true);
    expect(isResponseAnswered({ kind: "simulation", state: {} })).toBe(false);
    expect(isResponseAnswered({ kind: "simulation", state: null })).toBe(false);
    expect(isResponseAnswered({ kind: "simulation" })).toBe(false);
  });
});

describe("16B-A S23 — sanitizer contract for simulation questions", () => {
  it("keeps packageId / packageVersion / packageHash / runtimeVersion / entry / title / scenario / publicConfig byte-for-byte; strips answer.*, teacher notes and any secret smuggled into scenario / publicConfig", () => {
    const exam = { sections: [{ id: "s", title: "t", questions: [{ examQuestionId: "q1", presentationType: "simulation", questionTypeVersion: 1, text: "س", marks: 5, simulation: { ...REF, title: "Counter", scenario: { level: 2, expectedState: { count: 3 }, hint: "x" }, publicConfig: { theme: "dark", answerKey: [1] } }, answer: { assertions: [], rubric: "r" }, teacherNote: "n" }] }] };
    const [sq] = sanitizeExamForStudent(exam).sections[0].questions;
    expect(sq.simulation).toEqual({ ...REF, title: "Counter", scenario: { level: 2 }, publicConfig: { theme: "dark" } });
    expect(sq.answer ?? {}).toEqual({}); expect(sq.teacherNote ?? "").toBe("");                                          // the sanitizer blanks `answer` to {}
    expect(JSON.stringify(sq)).not.toMatch(/assertions|rubric|expectedState|answerKey|"hint":"x"/);                                     // the node-level `hint` key is blanked to ""
    expect(sq.presentationType).toBe("simulation"); expect(sq.questionTypeVersion).toBe(1);
  });
});

describe("16B-A — runtime response headers (contract)", () => {
  // Independent Review Fix: the header contract is RF1 / RF2 — an HTTP `sandbox allow-scripts` on every response, fetch
  // directives scoped to the exact package prefix (no 'self'), CORP cross-origin + ACAO * for the opaque-origin document,
  // `no-cache` for executable documents. The full matrix lives in smartsim-runtime-isolation-16b-a-rf.test.js; this pin keeps
  // the original contract's shape.
  it("buildRuntimeHeaders: strict MIME, document no-cache / asset immutable cache, nosniff, no-referrer, CORP cross-origin + ACAO *, CSP sandbox allow-scripts + default-src 'none' with package-prefix-only script/style/img/font/media, connect/frame/worker/object none, base-uri none, form-action none, frame-ancestors self", () => {
    const h = buildRuntimeHeaders({ contentType: "text/html; charset=utf-8", origin: "https://app.example", packagePrefix: "/api/simulators/runtime/counter-sim/1/" + "ab".repeat(32) + "/", singleFile: true });
    expect(h["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(h["Cache-Control"]).toBe("no-cache");
    expect(h["X-Content-Type-Options"]).toBe("nosniff"); expect(h["Referrer-Policy"]).toBe("no-referrer"); expect(h["Cross-Origin-Resource-Policy"]).toBe("cross-origin"); expect(h["Access-Control-Allow-Origin"]).toBe("*");
    expect(h["X-Frame-Options"]).toBeUndefined();                                                                        // frame-ancestors governs
    const csp = h["Content-Security-Policy"];
    const self = "https://app.example/api/simulators/runtime/counter-sim/1/" + "ab".repeat(32) + "/";
    expect(csp.startsWith("sandbox allow-scripts;")).toBe(true);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src " + self + " 'unsafe-inline'");
    expect(csp).toContain("style-src " + self + " 'unsafe-inline'");
    expect(csp).toContain("img-src " + self + " data:");
    expect(csp).toContain("font-src " + self); expect(csp).toContain("media-src " + self);
    expect(csp).toContain("connect-src 'none'"); expect(csp).toContain("frame-src 'none'"); expect(csp).toContain("worker-src 'none'"); expect(csp).toContain("object-src 'none'"); expect(csp).toContain("base-uri 'none'"); expect(csp).toContain("form-action 'none'"); expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toMatch(/unsafe-eval|\*|https:(\s|;)|'self' https|allow-same-origin/);
    const h2 = buildRuntimeHeaders({ contentType: "application/javascript; charset=utf-8", origin: "https://app.example", packagePrefix: self.replace("https://app.example", ""), singleFile: false });
    expect(h2["Cache-Control"]).toBe("public, max-age=31536000, immutable");                                            // content-addressed sub-resource
    expect(h2["Content-Security-Policy"]).toContain("script-src " + self + ";");                                          // no unsafe-inline for a prebuilt dist
    expect(h2["Content-Security-Policy"]).toContain("style-src " + self + " 'unsafe-inline'");                            // Vite CSS-in-JS injection still works
  });
});

describe("16B-A — governance gate: review submission refuses an unavailable package", () => {
  const OWNER = { id: "teacher-a", capabilities: ["author", "review", "approve", "publish"] };
  const exam = { examId: "EX-SIM", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "ق", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "q1", presentationType: "simulation", questionTypeVersion: 1, text: "س", marks: 5, simulation: REF }] }] };
  it("in-review with a pinned reference whose package is NOT in storage → 422 SIMULATION_PACKAGE_UNAVAILABLE; with the package stored → the transition proceeds", async () => {
    const c = createMemoryContainer();
    const deps = { now: () => "2026-09-01T00:00:00.000Z", newId: (() => { let n = 0; return () => "id" + (++n); })(), finalize: () => ({ canFinalize: true, blockers: [], warnings: [], structuralErrors: [], structuralWarnings: [], structuralIssues: [], coverage: null, policyIssues: [], qualityReport: null }) };
    await GOV.enableGovernance(c.container, { examId: "EX-SIM", exam, actor: OWNER, requestId: "r1" }, deps);
    const status = await GOV.getGovernanceStatus(c.container, "EX-SIM", deps);
    const revisionId = status.manifest.latestRevisionId;
    let err;
    try { await GOV.submitForReview(c.container, { examId: "EX-SIM", revisionId, actor: OWNER, requestId: "r2", expectedStateVersion: status.manifest.stateVersion }, deps); } catch (e) { err = e; }
    expect(err && err.status).toBe(422); expect(err && err.code).toBe("SIMULATION_PACKAGE_UNAVAILABLE");
    // store the exact package → accepted
    const { PACKAGES_PREFIX, OWNERS_PREFIX, ownerHashOf } = await import("../src/lib/smartsim/package-store.js");
    c.setJson(PACKAGES_PREFIX + HASH.slice(7) + "/metadata.json", { ...REF, title: "Counter", ownerHash: ownerHashOf("teacher-a"), uploadedAt: "2026-09-01T00:00:00.000Z", fileCount: 2, sizeBytes: 10, status: "ready" });
    c.setJson(OWNERS_PREFIX + ownerHashOf("teacher-a") + "/counter-sim/1.json", { packageHash: HASH });
    const r = await GOV.submitForReview(c.container, { examId: "EX-SIM", revisionId, actor: OWNER, requestId: "r3", expectedStateVersion: status.manifest.stateVersion }, deps);
    expect(r.manifest.lifecycleState).toBe("in-review");
  });
});

describe("16B-A — draft pipeline bounds the simulation state server-side", () => {
  it("normalizeDraftAnswers keeps a bounded simulation state and drops an oversized / non-JSON one (never throws, never stores functions or NaN)", () => {
    const { normalizeDraftAnswers } = require_(path.join(repo, "api/src/lib/draft-answers.js"));
    const ok = normalizeDraftAnswers({ q1: { kind: "simulation", state: { count: 3 } }, q2: { kind: "text", value: "x" } });
    expect(ok.answers).toEqual({ q1: { kind: "simulation", state: { count: 3 } }, q2: { kind: "text", value: "x" } }); expect(ok.rejected).toEqual([]);
    const big = normalizeDraftAnswers({ q1: { kind: "simulation", state: { s: "x".repeat(70000) } } });
    expect(big.answers.q1).toBeUndefined(); expect(big.rejected).toEqual([{ id: "q1", code: "STATE_TOO_LARGE" }]);
    const nan = normalizeDraftAnswers({ q1: { kind: "simulation", state: { n: NaN } } });
    expect(nan.rejected.map(r => r.code)).toEqual(["STATE_NON_FINITE"]);
    const proto = normalizeDraftAnswers({ q1: { kind: "simulation", state: JSON.parse('{"__proto__":{"x":1}}') } });
    expect(proto.rejected.map(r => r.code)).toEqual(["STATE_FORBIDDEN_KEY"]);
    expect(read("api/src/functions/student-submission.js")).toMatch(/normalizeDraftAnswers/);
  });
});

function walk(dir) { const out = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...walk(p)); else out.push(p); } return out; }
